import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FlutterwaveService } from '../../common/services/flutterwave.service';
import { NotificationsClientService } from '../notifications-client/notifications-client.service';
import { TransferDto } from './dto/transfer.dto';
import { TopupDto } from './dto/topup.dto';

// Defensive fallback for phone-only tier — used only when PlatformConfig rows are absent.
// Will be replaced by a seeded PlatformConfig row in Phase 6 per RESEARCH Open Question.
// NEVER hardcode business limits; this constant is a last-resort guard.
const KYC_TIER_PHONE_LIMIT_FALLBACK = 50_000;

// Legacy tier 2 limit for users with nin/bvn ciphertext set but no new KYC timestamps.
// Maintained for Sprint 1 data backward-compatibility until full migration in Phase 6.
const KYC_TIER_LEGACY_NIN_BVN_LIMIT = 500_000;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private flutterwave: FlutterwaveService,
    private redis: RedisService,
    private notifications: NotificationsClientService,
  ) {}

  // ── Private: async KYC tier resolution from PlatformConfig ────────────────

  /**
   * Resolves KYC tier and daily limit by reading user KYC timestamps and
   * fetching limits from PlatformConfig (never hardcoded).
   *
   * Priority (highest tier wins):
   *   3 — kycLivenessVerifiedAt set → kyc_smile_daily_limit from DB
   *   2 — kycNinVerifiedAt set      → kyc_nin_daily_limit from DB
   *   1 — kycBvnVerifiedAt set      → kyc_bvn_daily_limit from DB
   *   1 — nin || bvn set (legacy)   → KYC_TIER_LEGACY_NIN_BVN_LIMIT (Sprint 1 compat)
   *   1 — phone set                 → KYC_TIER_PHONE_LIMIT_FALLBACK
   *   0 — none of the above         → 0
   */
  private async getKycTierFromConfig(user: {
    phone?: string | null;
    nin?: string | null;
    bvn?: string | null;
    kycBvnVerifiedAt?: Date | null;
    kycNinVerifiedAt?: Date | null;
    kycLivenessVerifiedAt?: Date | null;
  }): Promise<{ tier: number; dailyLimit: number }> {
    // Fetch PlatformConfig limits only if a new-style KYC timestamp is present
    if (user.kycLivenessVerifiedAt || user.kycNinVerifiedAt || user.kycBvnVerifiedAt) {
      const rows = await this.prisma.platformConfig.findMany({
        where: {
          key: { in: ['kyc_bvn_daily_limit', 'kyc_nin_daily_limit', 'kyc_smile_daily_limit'] },
        },
      });

      if (rows.length === 0) {
        this.logger.warn('PlatformConfig KYC limits missing — using legacy fallback values');
      }

      const limit = (k: string): number =>
        Number((rows.find((r) => r.key === k)?.value as any) ?? 0);

      if (user.kycLivenessVerifiedAt) {
        return { tier: 3, dailyLimit: limit('kyc_smile_daily_limit') };
      }
      if (user.kycNinVerifiedAt) {
        return { tier: 2, dailyLimit: limit('kyc_nin_daily_limit') };
      }
      if (user.kycBvnVerifiedAt) {
        return { tier: 1, dailyLimit: limit('kyc_bvn_daily_limit') };
      }
    }

    // Legacy path: Sprint 1 users with nin/bvn ciphertext but no new timestamps
    if (user.nin || user.bvn) {
      return { tier: 2, dailyLimit: KYC_TIER_LEGACY_NIN_BVN_LIMIT };
    }
    if (user.phone) {
      return { tier: 1, dailyLimit: KYC_TIER_PHONE_LIMIT_FALLBACK };
    }
    return { tier: 0, dailyLimit: 0 };
  }

  // ── getBalance ─────────────────────────────────────────────────────────────

  async getBalance(userId: string) {
    const [wallet, user] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          phone: true,
          nin: true,
          bvn: true,
          kycBvnVerifiedAt: true,
          kycNinVerifiedAt: true,
          kycLivenessVerifiedAt: true,
        },
      }),
    ]);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!user) throw new NotFoundException('User not found');

    const { tier, dailyLimit } = await this.getKycTierFromConfig(user);

    // Escrow: sum of confirmed stays bookings not yet released (host view)
    const escrowResult = await this.prisma.booking.aggregate({
      where: {
        property: { hostId: userId },
        status: 'CONFIRMED',
        escrowReleasedAt: null,
        deletedAt: null,
      },
      _sum: { totalPrice: true },
    });

    return {
      balance_ngn: Number(wallet.balance),
      escrow_balance_ngn: Number(escrowResult._sum.totalPrice ?? 0),
      kyc_tier: tier,
      daily_limit_ngn: dailyLimit,
    };
  }

  // ── getTransactions ────────────────────────────────────────────────────────

  async getTransactions(
    userId: string,
    opts: {
      cursor?: string;
      limit?: number;
      type?: string;
      module?: string;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const limit = Math.min(opts.limit ?? 20, 100);

    const where: Prisma.TransactionWhereInput = {
      walletId: wallet.id,
      deletedAt: null,
      ...(opts.type && { type: opts.type as any }),
      ...(opts.module && { metadata: { path: ['module'], equals: opts.module } }),
      ...((opts.date_from || opts.date_to) && {
        createdAt: {
          ...(opts.date_from && { gte: new Date(opts.date_from) }),
          ...(opts.date_to && { lte: new Date(opts.date_to) }),
        },
      }),
    };

    const items = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const data = hasNext ? items.slice(0, limit) : items;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return { data, meta: { cursor: nextCursor, hasNext, limit } };
  }

  // ── initiateTopup ──────────────────────────────────────────────────────────

  async initiateTopup(userId: string, dto: TopupDto) {
    const [wallet, user] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          phone: true,
          nin: true,
          bvn: true,
          kycBvnVerifiedAt: true,
          kycNinVerifiedAt: true,
          kycLivenessVerifiedAt: true,
        },
      }),
    ]);
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (!user) throw new NotFoundException('User not found');

    const { tier, dailyLimit } = await this.getKycTierFromConfig(user);
    if (tier === 0) {
      throw new BadRequestException('KYC required: verify your phone number to enable wallet funding');
    }

    // Enforce CBN daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // F-01: count PENDING reservations as well as SUCCESS credits. Previously the cap
    // summed only already-SUCCESS credits, but the actual credit happens later in the
    // webhook — so a user could fire N sequential top-ups (each passing because none had
    // completed yet) and blow past the CBN daily limit. Counting PENDING reservations
    // (created below, before Flutterwave is even called) closes that bypass.
    const todayCredits = await this.prisma.transaction.aggregate({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        status: { in: ['SUCCESS', 'PENDING'] },
        createdAt: { gte: todayStart },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const usedToday = Number(todayCredits._sum.amount ?? 0);
    if (usedToday + dto.amount > dailyLimit) {
      throw new BadRequestException(
        `Daily limit exceeded. Tier ${tier} daily limit: ₦${dailyLimit.toLocaleString()}. Used today: ₦${usedToday.toLocaleString()}`,
      );
    }

    // C-02: idempotency lock — prevents two concurrent topup requests from both passing
    // the daily-limit check at the same millisecond (TOCTOU race). Sequential requests
    // are now bounded by the PENDING reservation above; this still serialises truly
    // concurrent ones so only one reservation is created per lock window.
    const idempKey = `topup:lock:${userId}`;
    const acquired = await this.redis.setNx(idempKey, '1', 30); // 30s lock
    if (!acquired) {
      throw new BadRequestException('A top-up is already in progress — please wait');
    }

    const reference = `ISY-FUND-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    // Reserve the amount against the daily cap by writing a PENDING credit row. The
    // webhook's creditWallet() finalizes this same row (by reference) to SUCCESS.
    await this.prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT',
        status: 'PENDING',
        amount: new Prisma.Decimal(dto.amount),
        currency: 'NGN',
        reference,
        gateway: 'FLUTTERWAVE',
        description: 'Wallet top-up (pending)',
        balanceBefore: new Prisma.Decimal(wallet.balance),
        balanceAfter: new Prisma.Decimal(wallet.balance),
        metadata: { module: 'wallet' },
      },
    });

    try {
      const payment = await this.flutterwave.initiatePayment({
        email: dto.email,
        amountKobo: dto.amount * 100,
        reference,
        metadata: { type: 'wallet_topup', walletId: wallet.id, userId, module: 'wallet' },
      });

      return { reference, authorizationUrl: payment.authorizationUrl };
    } catch (err) {
      // Flutterwave initiation failed → release the reservation so it doesn't permanently
      // consume the user's daily cap for a top-up that never started.
      await this.prisma.transaction
        .delete({ where: { reference } })
        .catch(() => undefined);
      throw err;
    } finally {
      // Release the lock regardless of success or failure
      await this.redis.del(idempKey);
    }
  }

  // ── resolveRecipient ───────────────────────────────────────────────────────

  /**
   * Resolves a Nigerian phone number to a display name before a transfer is sent,
   * so the sender can confirm who they're paying. Returns only firstName + phone —
   * never exposes full profile data (NDPA minimal-disclosure).
   */
  async resolveRecipient(requesterId: string, phone: string) {
    const recipientUser = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, firstName: true },
    });
    if (!recipientUser) throw new NotFoundException('No ISEYAA user found with that phone number');
    if (recipientUser.id === requesterId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }
    return { userId: recipientUser.id, firstName: recipientUser.firstName, phone };
  }

  // ── debitWallet ────────────────────────────────────────────────────────────

  /**
   * Debits a wallet with SELECT FOR UPDATE row-locking inside an interactive
   * transaction, mirroring creditWallet's locking pattern (CLAUDE.md: SELECT
   * FOR UPDATE required on every debit). The balance/insufficient-funds check
   * happens AFTER the lock is acquired to avoid a TOCTOU race between two
   * concurrent debits reading the same stale balance.
   */
  async debitWallet(
    walletId: string,
    amount: number,
    reference: string,
    description: string,
    module = 'wallet',
    gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL' = 'FLUTTERWAVE',
  ): Promise<{ balanceAfter: number }> {
    return this.prisma.$transaction(async (tx) => {
      // Lock the wallet row to prevent concurrent updates
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
      const locked = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!locked) throw new NotFoundException('Wallet not found');

      // F-02: do money arithmetic in Prisma.Decimal, never IEEE-754 doubles. The
      // Decimal constructor accepts a number OR an existing Decimal, so this is safe
      // whether locked.balance is a real Prisma.Decimal or a plain-number test mock.
      const balanceBefore = new Prisma.Decimal(locked.balance);
      const debit = new Prisma.Decimal(amount);
      if (balanceBefore.lessThan(debit)) {
        throw new BadRequestException('Insufficient wallet balance');
      }
      const balanceAfter = balanceBefore.minus(debit);

      await tx.wallet.update({ where: { id: walletId }, data: { balance: balanceAfter } });
      await tx.transaction.create({
        data: {
          walletId,
          type: 'DEBIT',
          status: 'SUCCESS',
          amount: debit,
          currency: 'NGN',
          reference,
          gateway,
          description,
          balanceBefore,
          balanceAfter,
          metadata: { module },
        },
      });

      return { balanceAfter: balanceAfter.toNumber() };
    });
  }

  // ── transfer ───────────────────────────────────────────────────────────────

  async transfer(senderUserId: string, dto: TransferDto) {
    const senderWallet = await this.prisma.wallet.findUnique({ where: { userId: senderUserId } });
    if (!senderWallet) throw new NotFoundException('Sender wallet not found');

    const recipientUser = await this.prisma.user.findFirst({
      where: { phone: dto.recipientPhone, deletedAt: null },
      select: { id: true, firstName: true },
    });
    if (!recipientUser) throw new NotFoundException('Recipient not found');
    if (recipientUser.id === senderUserId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    const recipientWallet = await this.prisma.wallet.findUnique({
      where: { userId: recipientUser.id },
    });
    if (!recipientWallet) throw new NotFoundException('Recipient wallet not found');

    // Idempotency: deterministic reference derived from the client-supplied key
    // (CLAUDE.md: idempotency key required on all wallet mutations) instead of a
    // random uuid — a random reference would let a retried/duplicated request
    // (network timeout, double-tap) double-debit the sender every time, since the
    // unique constraint on Transaction.reference would never be hit twice.
    const reference = `ISY-TRF-${dto.idempotencyKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32).toUpperCase()}`;
    // F-02: keep the authoritative amount as a Decimal for balance math; `amount`
    // (number) is used only for display strings (toLocaleString) and the return value.
    const amountDec = new Prisma.Decimal(dto.amount);
    const amount = amountDec.toNumber();

    // Precheck: an existing OUT leg for this reference means this exact transfer
    // already ran — return its recorded result instead of re-debiting (mirrors
    // SettlementService.settle()'s reference-prefix precheck).
    const existingOut = await this.prisma.transaction.findFirst({
      where: { reference: `${reference}-OUT` },
    });
    if (existingOut) {
      return {
        reference,
        amount: Number(existingOut.amount),
        recipientPhone: dto.recipientPhone,
        newBalance: Number(existingOut.balanceAfter),
      };
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Lock both wallets in a canonical (sorted by id) order — NOT sender-then-
        // recipient caller order — so every concurrent transfer() call acquires locks
        // in one global, deterministic sequence. Without this, two reciprocal
        // transfers (A->B and B->A) racing at the same instant can each hold one
        // wallet's lock while waiting on the other, and Postgres detects a deadlock;
        // the resulting raw error is NOT a P2002 and is not caught by the catch block
        // below, so it would propagate as an unhandled 500 (mirrors settlement.service.ts CR-01).
        const walletIdsInLockOrder = [senderWallet.id, recipientWallet.id].sort();
        for (const walletId of walletIdsInLockOrder) {
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
        }

        const lockedSender = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
        if (!lockedSender) throw new NotFoundException('Sender wallet not found');

        const senderBalanceBefore = new Prisma.Decimal(lockedSender.balance);
        if (senderBalanceBefore.lessThan(amountDec)) {
          throw new BadRequestException('Insufficient wallet balance');
        }
        const senderBalanceAfter = senderBalanceBefore.minus(amountDec);

        const lockedRecipient = await tx.wallet.findUnique({ where: { id: recipientWallet.id } });
        if (!lockedRecipient) throw new NotFoundException('Recipient wallet not found');

        const recipientBalanceBefore = new Prisma.Decimal(lockedRecipient.balance);
        const recipientBalanceAfter = recipientBalanceBefore.plus(amountDec);

        await tx.wallet.update({
          where: { id: senderWallet.id },
          data: { balance: senderBalanceAfter },
        });
        await tx.wallet.update({
          where: { id: recipientWallet.id },
          data: { balance: recipientBalanceAfter },
        });

        await tx.transaction.create({
          data: {
            walletId: senderWallet.id,
            type: 'TRANSFER',
            status: 'SUCCESS',
            amount: amountDec,
            currency: 'NGN',
            reference: `${reference}-OUT`,
            gateway: 'INTERNAL',
            description: dto.narration ?? `Transfer to ${dto.recipientPhone}`,
            balanceBefore: senderBalanceBefore,
            balanceAfter: senderBalanceAfter,
            metadata: {
              module: 'wallet',
              direction: 'out',
              transferRef: reference,
              recipientUserId: recipientUser.id,
              recipientPhone: dto.recipientPhone,
            },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: recipientWallet.id,
            type: 'TRANSFER',
            status: 'SUCCESS',
            amount: amountDec,
            currency: 'NGN',
            reference: `${reference}-IN`,
            gateway: 'INTERNAL',
            description: dto.narration ?? `Transfer from wallet`,
            balanceBefore: recipientBalanceBefore,
            balanceAfter: recipientBalanceAfter,
            metadata: {
              module: 'wallet',
              direction: 'in',
              transferRef: reference,
              senderUserId: senderUserId,
            },
          },
        });

        return { newBalance: senderBalanceAfter.toNumber() };
      });
    } catch (err) {
      // Race fallback: two near-simultaneous duplicate requests (same idempotencyKey)
      // can both pass the precheck above before either commits. The unique constraint
      // on Transaction.reference lets only one land; treat the loser's P2002 as a
      // benign replay rather than an error (mirrors SettlementService.settle()).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target as string[] | string | undefined;
        const isReferenceConflict = Array.isArray(target)
          ? target.includes('reference')
          : typeof target === 'string' && target.includes('reference');
        if (isReferenceConflict) {
          const winner = await this.prisma.transaction.findFirst({
            where: { reference: `${reference}-OUT` },
          });
          if (winner) {
            return {
              reference,
              amount: Number(winner.amount),
              recipientPhone: dto.recipientPhone,
              newBalance: Number(winner.balanceAfter),
            };
          }
        }
      }
      throw err;
    }

    // Push notification (best-effort) — recipient side only; the sender already sees
    // the debit reflected in their own balance/history. A failed push must never
    // undo or block the transfer that already committed above.
    try {
      await this.notifications.sendPush(
        recipientUser.id,
        'Money received',
        `You received ₦${amount.toLocaleString('en-NG')} from a fellow ISEYAA user`,
        { type: 'wallet_credit', reference, amount: String(amount) },
      );
    } catch (err: any) {
      this.logger.error(`transfer push notification failed for recipient ${recipientUser.id}: ${err.message}`);
    }

    return {
      reference,
      amount,
      recipientPhone: dto.recipientPhone,
      newBalance: result.newBalance,
    };
  }

  // ── creditWallet ───────────────────────────────────────────────────────────

  async creditWallet(
    walletId: string,
    amount: number,
    reference: string,
    description: string,
    module = 'wallet',
    gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL' = 'FLUTTERWAVE',
  ) {
    // C-01: use interactive transaction with SELECT FOR UPDATE row-lock to prevent
    // concurrent race condition where two requests read the same balance and both write
    // an inflated value (double-credit). CLAUDE.md requires SELECT FOR UPDATE on all
    // wallet mutations.
    let creditedUserId: string | null = null;
    let alreadyProcessed = false;
    await this.prisma.$transaction(async (tx) => {
      // Lock the wallet row to prevent concurrent updates
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
      const locked = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!locked) throw new NotFoundException('Wallet not found');
      creditedUserId = locked.userId;

      // F-03: idempotency by reference. Paystack/Flutterwave legitimately re-deliver the
      // same webhook; previously the reference unique-constraint turned a replay into a
      // P2002 that rolled back and 500'd, so the gateway retried forever. Handle the
      // three states explicitly instead:
      const existing = await tx.transaction.findUnique({ where: { reference } });

      // F-02: Decimal arithmetic (constructor accepts number or Decimal).
      const creditAmt = new Prisma.Decimal(amount);
      const balanceBefore = new Prisma.Decimal(locked.balance);
      const balanceAfter = balanceBefore.plus(creditAmt);

      if (existing) {
        if (existing.status === 'SUCCESS') {
          // Duplicate delivery of an already-applied credit → no-op replay (no double credit).
          alreadyProcessed = true;
          return;
        }
        // A PENDING reservation created at top-up initiation (F-01) — finalize it:
        // move the balance and flip the same row to SUCCESS (no second row, so the
        // reference stays unique and the daily-limit reservation is consumed exactly once).
        await tx.wallet.update({ where: { id: walletId }, data: { balance: balanceAfter } });
        await tx.transaction.update({
          where: { id: existing.id },
          data: { status: 'SUCCESS', gateway, description, balanceBefore, balanceAfter },
        });
        return;
      }

      // No prior record (e.g. internal earnings/settlement credit) → create a fresh SUCCESS row.
      await tx.wallet.update({ where: { id: walletId }, data: { balance: balanceAfter } });
      await tx.transaction.create({
        data: {
          walletId,
          type: 'CREDIT',
          status: 'SUCCESS',
          amount: creditAmt,
          currency: 'NGN',
          reference,
          gateway,
          description,
          balanceBefore,
          balanceAfter,
          metadata: { module },
        },
      });
    });

    // A pure replay of an already-applied credit must not re-fire the push notification.
    if (alreadyProcessed) return;

    // Push notification (best-effort) — scoped to direct wallet top-ups (the default
    // `module === 'wallet'` callers, e.g. Flutterwave top-up webhook). Earnings credits
    // (transport/delivery/marketplace/etc. pass their own `module` name) get their own
    // domain-specific push at the trigger point instead, so this stays a single,
    // unambiguous "your wallet was funded" notification rather than firing for every
    // internal settlement credit too.
    if (module === 'wallet' && creditedUserId) {
      try {
        await this.notifications.sendPush(
          creditedUserId,
          'Wallet funded',
          `₦${amount.toLocaleString('en-NG')} was added to your wallet`,
          { type: 'wallet_credit', reference, amount: String(amount) },
        );
      } catch (err: any) {
        this.logger.error(`creditWallet push notification failed for wallet ${walletId}: ${err.message}`);
      }
    }
  }
}
