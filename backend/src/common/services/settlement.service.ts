import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';

/**
 * 12-01 — Settlement Engine Foundation.
 *
 * Generalized, caller-agnostic atomic N-way wallet fan-out engine. Extraction
 * target for `TourSettlementService`'s (09-06) proven transactional primitives —
 * see `backend/src/modules/tour-bookings/tour-settlement.service.ts` for the
 * canonical reference this service generalizes.
 *
 * ── Architectural commitments (LOCKED — carried over from Tour, do not deviate) ──
 * 1. ONE `prisma.$transaction` per `settle()` call.
 * 2. `SELECT ... FOR UPDATE` on EVERY wallet row touched (recipient wallets + platform).
 * 3. Idempotency: `Transaction.reference` prefix precheck (`${reference}-*`) before
 *    entering the transaction, PLUS a `P2002` unique-constraint race fallback caught
 *    INSIDE the transaction — closes the window where two near-simultaneous webhook
 *    deliveries could otherwise trigger a spurious refund on an already-settled payment.
 * 4. Drift-tolerance: platform wallet always absorbs rounding drift + unresolved
 *    recipient shares; throws (+ triggers refund) if drift exceeds ₦0.02.
 * 5. Reference scheme: `${reference}-${recipient.refSuffix}` per recipient,
 *    `${reference}-PLAT` for the platform/commission row.
 * 6. `resolveMinistryWallet()` reads `PlatformConfig` fresh on every call — never
 *    cached — so a Ministry wallet rotation takes effect immediately.
 * 7. System wallet upserted on `onModuleInit` against the well-known SYSTEM user id
 *    (moved verbatim from Tour's `ensureSystemWallet()` — no new SystemWallet model
 *    this phase, per D-07).
 */

export type SettlementGateway = 'PAYSTACK' | 'FLUTTERWAVE' | 'WALLET' | 'INTERNAL';

export interface SettlementRecipient {
  /** Human-readable recipient category (e.g. 'VENDOR', 'HOST', 'GUIDE'). */
  tag: string;
  /**
   * Caller-supplied reference suffix, used verbatim as `${input.reference}-${refSuffix}`.
   * The service does NOT auto-generate this from `tag`/index — callers control the
   * exact string so migrating callers (e.g. Tour) can preserve their legacy format.
   */
  refSuffix: string;
  walletId: string | null;
  amountNgn: number;
  metadata?: Record<string, unknown>;
}

export interface SettlementInput {
  module: string;
  reference: string;
  gateway: SettlementGateway;
  amountKobo: number;
  recipients: SettlementRecipient[];
  buyerWalletId?: string | null;
  platformMetadata?: Record<string, unknown>;
  description: string;
  /** Runs INSIDE the same `$transaction`, after all wallet writes. */
  onSettled?: (tx: Prisma.TransactionClient) => Promise<void>;
  /** Runs on the failure path (drift exceeded or transaction throw), after refund. */
  onFailure?: (err: Error) => Promise<void>;
}

export interface SettlementResult {
  status: 'SETTLED' | 'REPLAYED';
  platformAmountNgn: number;
  recipientCredits: { tag: string; amountNgn: number; walletId: string | null }[];
}

// Well-known SYSTEM user that owns the platform commission wallet (v1 audit anchor,
// moved verbatim from tour-settlement.service.ts — see architectural commitment 7 above).
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class SettlementService implements OnModuleInit {
  private readonly logger = new Logger(SettlementService.name);
  // Resolved on bootstrap so the hot path never blocks on an upsert. The non-null
  // assertion is safe because onModuleInit runs before any settle() call can occur.
  private systemWalletId!: string;

  constructor(
    private prisma: PrismaService,
    private refundService: RefundService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemWallet();
  }

  // ── Main settlement entry point ────────────────────────────────────────────

  async settle(input: SettlementInput): Promise<SettlementResult> {
    // 1. Idempotency precheck — any existing row prefixed with this reference means
    //    settlement already ran. Return a no-op replay result.
    const existing = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${input.reference}-` } },
      select: { id: true },
    });
    if (existing) {
      this.logger.log(
        `Settlement already applied for ${input.reference} (module: ${input.module}) — replay no-op`,
      );
      return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
    }

    // 2. Compute platform commission (absorbs rounding drift + unresolved shares).
    const chargeAmountNgn = input.amountKobo / 100;
    const claimedAmountNgn = input.recipients
      .filter((r) => r.walletId)
      .reduce((s, r) => s + r.amountNgn, 0);
    const platformAmountNgn = Math.round((chargeAmountNgn - claimedAmountNgn) * 100) / 100;
    const drift = chargeAmountNgn - claimedAmountNgn - platformAmountNgn;
    if (Math.abs(drift) > 0.02) {
      const err = new Error(
        `Settlement drift exceeded ₦0.02 (drift=${drift}, module=${input.module}, ref=${input.reference}) — programming error`,
      );
      await this.handleSettlementFailure(input, err);
      throw err;
    }

    // 3. Atomic $transaction — recipient fan-out + platform commission.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const recipientCredits: SettlementResult['recipientCredits'] = [];

        for (const r of input.recipients.filter((x) => x.walletId)) {
          // SELECT FOR UPDATE — prevents concurrent writes to the same recipient wallet.
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
          const w = await tx.wallet.findUnique({ where: { id: r.walletId! } });
          if (!w) {
            throw new Error(`Recipient wallet vanished mid-transaction: ${r.walletId}`);
          }
          const before = Number(w.balance);
          const after = before + r.amountNgn;
          await tx.wallet.update({ where: { id: r.walletId! }, data: { balance: after } });
          await tx.transaction.create({
            data: {
              walletId: r.walletId!,
              type: 'CREDIT',
              status: 'SUCCESS',
              amount: r.amountNgn,
              currency: 'NGN',
              reference: `${input.reference}-${r.refSuffix}`,
              gateway: input.gateway,
              gatewayRef: input.reference,
              description: `${input.description} (${r.tag})`,
              balanceBefore: before,
              balanceAfter: after,
              metadata: {
                module: input.module,
                recipientType: r.tag,
                ...r.metadata,
              },
            },
          });
          recipientCredits.push({ tag: r.tag, amountNgn: r.amountNgn, walletId: r.walletId });
        }

        // Platform commission row — system wallet locked + credited.
        await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${this.systemWalletId} FOR UPDATE`;
        const sysW = await tx.wallet.findUnique({ where: { id: this.systemWalletId } });
        if (!sysW) throw new Error('System wallet missing');
        const sysBefore = Number(sysW.balance);
        const sysAfter = sysBefore + platformAmountNgn;
        await tx.wallet.update({ where: { id: this.systemWalletId }, data: { balance: sysAfter } });
        await tx.transaction.create({
          data: {
            walletId: this.systemWalletId,
            type: 'CREDIT',
            status: 'SUCCESS',
            amount: platformAmountNgn,
            currency: 'NGN',
            reference: `${input.reference}-PLAT`,
            gateway: input.gateway,
            gatewayRef: input.reference,
            description: `${input.description} (platform commission)`,
            balanceBefore: sysBefore,
            balanceAfter: sysAfter,
            metadata: {
              module: input.module,
              chargeAmountNgn,
              claimedAmountNgn,
              ...input.platformMetadata,
            },
          },
        });

        await input.onSettled?.(tx);

        return { platformAmountNgn, recipientCredits };
      });

      return { status: 'SETTLED', ...result };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(
          `Settlement race detected for ${input.reference} (module: ${input.module}) — ` +
            `concurrent duplicate delivery lost to a unique-constraint winner; treating as benign replay`,
        );
        return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
      }
      await this.handleSettlementFailure(input, err as Error);
      throw err;
    }
  }

  // ── Failure path: Paystack refund + caller-supplied onFailure hook ─────────

  private async handleSettlementFailure(input: SettlementInput, err: Error): Promise<void> {
    if (input.buyerWalletId) {
      try {
        await this.refundService.refund({
          paystackReference: input.reference,
          amountKobo: input.amountKobo,
          walletId: input.buyerWalletId,
          reason: `${input.module}_settlement_failed: ${err.message}`,
          metadata: { module: input.module, failedAt: 'settlement_transaction' },
        });
      } catch (refundErr) {
        // Don't mask the original error — refund failures are logged, not rethrown.
        this.logger.error(
          `Refund call failed for ${input.reference}: ${(refundErr as Error).message}`,
        );
      }
    }

    if (input.onFailure) {
      try {
        await input.onFailure(err);
      } catch (onFailureErr) {
        this.logger.error(
          `onFailure callback threw for ${input.reference}: ${(onFailureErr as Error).message}`,
        );
      }
    }

    this.logger.error(
      `Settlement failed for ${input.reference} (module: ${input.module}): ${err.message}`,
    );
  }

  // ── Statement query — SETTLE-07 itemized recipient statement (audit-trail read) ─

  async getStatement(walletId: string, opts: { dateFrom?: string; dateTo?: string } = {}) {
    return this.prisma.transaction.findMany({
      where: {
        walletId,
        type: 'CREDIT',
        ...(opts.dateFrom || opts.dateTo
          ? {
              createdAt: {
                ...(opts.dateFrom && { gte: new Date(opts.dateFrom) }),
                ...(opts.dateTo && { lte: new Date(opts.dateTo) }),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Ministry wallet resolution — always fresh, never cached (Pitfall 2) ────

  async resolveMinistryWallet(): Promise<{ id: string } | null> {
    const cfg = await this.prisma.platformConfig.findUnique({
      where: { key: 'tour.government_wallet_user_id' },
    });
    const userId = (cfg?.value as string | null | undefined) ?? null;
    if (!userId) return null;
    return this.prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  }

  // ── System wallet bootstrap (v1 ops audit anchor — moved verbatim from Tour) ─

  private async ensureSystemWallet(): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: SYSTEM_USER_ID },
      create: {
        id: SYSTEM_USER_ID,
        firstName: 'Platform',
        lastName: 'System',
        role: 'SUPER_ADMIN',
        ndpaConsent: true,
      },
      update: {},
    });
    const w = await this.prisma.wallet.upsert({
      where: { userId: SYSTEM_USER_ID },
      create: { userId: SYSTEM_USER_ID },
      update: {},
    });
    this.systemWalletId = w.id;
  }
}
