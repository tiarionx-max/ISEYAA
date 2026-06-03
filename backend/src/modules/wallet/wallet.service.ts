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
import { PaystackService } from '../../common/services/paystack.service';
import { TransferDto } from './dto/transfer.dto';

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
    private paystack: PaystackService,
    private redis: RedisService,
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

  async initiateTopup(userId: string, dto: { amount: number; email: string }) {
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

    const todayCredits = await this.prisma.transaction.aggregate({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        status: 'SUCCESS',
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
    // the daily-limit check at the same millisecond (TOCTOU race).
    const idempKey = `topup:lock:${userId}`;
    const acquired = await this.redis.setNx(idempKey, '1', 30); // 30s lock
    if (!acquired) {
      throw new BadRequestException('A top-up is already in progress — please wait');
    }

    const reference = `ISY-FUND-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    try {
      const payment = await this.paystack.initiatePayment({
        email: dto.email,
        amountKobo: dto.amount * 100,
        reference,
        metadata: { type: 'wallet_topup', walletId: wallet.id, userId, module: 'wallet' },
      });

      return { reference, authorizationUrl: payment.authorizationUrl };
    } finally {
      // Release the lock regardless of success or failure
      await this.redis.del(idempKey);
    }
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

    const reference = `ISY-TRF-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const amount = Number(dto.amount);

    const result = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE on sender wallet to prevent concurrent debits
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${senderWallet.id} FOR UPDATE`;
      const lockedSender = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
      if (!lockedSender) throw new NotFoundException('Sender wallet not found');

      const senderBalanceBefore = Number(lockedSender.balance);
      if (senderBalanceBefore < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }
      const senderBalanceAfter = senderBalanceBefore - amount;

      // SELECT FOR UPDATE on recipient wallet to prevent concurrent credits
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${recipientWallet.id} FOR UPDATE`;
      const lockedRecipient = await tx.wallet.findUnique({ where: { id: recipientWallet.id } });
      if (!lockedRecipient) throw new NotFoundException('Recipient wallet not found');

      const recipientBalanceBefore = Number(lockedRecipient.balance);
      const recipientBalanceAfter = recipientBalanceBefore + amount;

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
          amount,
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
          amount,
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

      return { newBalance: senderBalanceAfter };
    });

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
    gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL' = 'PAYSTACK',
  ) {
    // C-01: use interactive transaction with SELECT FOR UPDATE row-lock to prevent
    // concurrent race condition where two requests read the same balance and both write
    // an inflated value (double-credit). CLAUDE.md requires SELECT FOR UPDATE on all
    // wallet mutations.
    await this.prisma.$transaction(async (tx) => {
      // Lock the wallet row to prevent concurrent updates
      await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${walletId} FOR UPDATE`;
      const locked = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!locked) throw new NotFoundException('Wallet not found');

      const balanceBefore = Number(locked.balance);
      const balanceAfter = balanceBefore + amount;

      await tx.wallet.update({ where: { id: walletId }, data: { balance: balanceAfter } });
      await tx.transaction.create({
        data: {
          walletId,
          type: 'CREDIT',
          status: 'SUCCESS',
          amount,
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
  }
}
