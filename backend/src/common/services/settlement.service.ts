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

// ── Compensating adjustment types (SETTLE-10c/10d, 19-02) ──────────────────────

/**
 * Thrown by `adjust()` when a debit line would take its wallet negative. Typed
 * (not a plain `Error`) so callers — e.g. `SettlementDisputesService.resolve()`
 * (19-03) — can `instanceof`-check it to distinguish "insufficient balance,
 * caller should set BLOCKED" from any other failure mode.
 */
export class InsufficientAdjustmentBalanceError extends Error {
  constructor(
    public readonly walletId: string,
    public readonly shortfallNgn: number,
  ) {
    super(
      `Insufficient balance on wallet ${walletId} for adjustment debit — shortfall ₦${shortfallNgn}`,
    );
    this.name = 'InsufficientAdjustmentBalanceError';
  }
}

export interface SettlementAdjustmentLine {
  walletId: string;
  /** Positive = credit, negative = debit (unlike settle(), both signs allowed). */
  deltaNgn: number;
}

export interface SettlementAdjustmentInput {
  /** Must already exist as a settled Transaction (matched via reference prefix). */
  originalReference: string;
  module: string;
  lines: SettlementAdjustmentLine[];
  reason: string;
  metadata?: Record<string, unknown>;
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

    // 2. Defensive floor check — a negative recipient amount (e.g. from a misconfigured
    //    PlatformConfig percentage summing to >100%) must never silently debit a wallet
    //    under CREDIT transaction semantics (WR-02).
    for (const r of input.recipients) {
      if (!Number.isFinite(r.amountNgn)) {
        const err = new Error(
          `Non-finite recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error (NaN/Infinity reached settle())`,
        );
        await this.handleSettlementFailure(input, err);
        throw err;
      }
      if (r.amountNgn < 0) {
        const err = new Error(
          `Negative recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error`,
        );
        await this.handleSettlementFailure(input, err);
        throw err;
      }
    }

    // 3. Compute platform commission (absorbs rounding drift + unresolved shares).
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
    // A platform commission that is *slightly* negative (within the same ±0.02
    // tolerance as the drift assert above) is expected: per-recipient kobo rounding
    // can legitimately over-allocate by a sub-kobo amount, which the platform wallet
    // absorbs (D-03). Only a commission that goes meaningfully negative — i.e.
    // recipients claim materially more than the charge, a real misconfiguration —
    // should be rejected here.
    if (platformAmountNgn < -0.02) {
      const err = new Error(
        `Negative platform commission (module=${input.module}, ref=${input.reference}) — programming error`,
      );
      await this.handleSettlementFailure(input, err);
      throw err;
    }

    // 4. Atomic $transaction — recipient fan-out + platform commission.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const recipientCredits: SettlementResult['recipientCredits'] = [];

        // Lock recipient wallets in a canonical (sorted by walletId) order — NOT the
        // caller-supplied array order — so every concurrent settle() call acquires
        // locks in one global, deterministic sequence. Without this, two settlements
        // sharing the same two wallets but built in opposite array order (e.g. two
        // TourPackages with reversed settlementSplit orderings) can deadlock in
        // Postgres; the resulting raw error is NOT a P2002 and falls through to a
        // spurious buyer refund on what should have been a clean settlement (CR-01).
        const recipientsWithWallet = input.recipients.filter((x) => x.walletId);
        const lockOrder = [...recipientsWithWallet].sort((a, b) =>
          a.walletId! < b.walletId! ? -1 : a.walletId! > b.walletId! ? 1 : 0,
        );
        for (const r of lockOrder) {
          // SELECT FOR UPDATE — prevents concurrent writes to the same recipient wallet.
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
        }

        // Credit rows are still created/ordered by the original caller-supplied array
        // (only the locking order above needed to be canonicalized).
        for (const r of recipientsWithWallet) {
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
        // Only treat this as a benign duplicate-delivery replay if the violated unique
        // constraint is actually Transaction.reference (the idempotency key this
        // fallback is designed for). A P2002 on any other constraint is a real
        // programming error (e.g. two recipients sharing a refSuffix) and must NOT be
        // silently swallowed as "already settled" — that would roll back the whole
        // transaction while reporting success (WR-01).
        const target = err.meta?.target as string[] | string | undefined;
        const isReferenceConflict = Array.isArray(target)
          ? target.includes('reference')
          : typeof target === 'string' && target.includes('reference');
        if (isReferenceConflict) {
          this.logger.warn(
            `Settlement race detected for ${input.reference} (module: ${input.module}) — ` +
              `concurrent duplicate delivery lost to a unique-constraint winner; treating as benign replay`,
          );
          return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
        }
      }
      await this.handleSettlementFailure(input, err as Error);
      throw err;
    }
  }

  // ── Compensating adjustment entry point (SETTLE-10c/10d) ────────────────────

  async adjust(input: SettlementAdjustmentInput): Promise<SettlementResult> {
    // 1. Idempotency precheck — an existing row prefixed with this adjustment's
    //    reference scheme means this exact adjustment already ran. Mirrors
    //    settle()'s lines 92-103, prefix substituted `${reference}-` -> `${originalReference}-ADJ-`.
    const existingAdjustment = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${input.originalReference}-ADJ-` } },
      select: { id: true },
    });
    if (existingAdjustment) {
      this.logger.log(
        `Adjustment already applied for ${input.originalReference} (module: ${input.module}) — replay no-op`,
      );
      return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
    }

    // 2. Verify the original settlement actually exists — adjust() can only ever
    //    compensate a settlement that already happened.
    const original = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${input.originalReference}-` } },
      select: { id: true },
    });
    if (!original) {
      throw new Error(
        `No settled Transaction found for originalReference="${input.originalReference}" (module=${input.module}) — cannot adjust a non-existent settlement`,
      );
    }

    // 3. Validate every line's deltaNgn BEFORE entering $transaction — same
    //    defensive-floor pattern settle() applies to recipient amounts (SETTLE-11d).
    for (const line of input.lines) {
      if (!Number.isFinite(line.deltaNgn)) {
        throw new Error(
          `Non-finite deltaNgn for wallet ${line.walletId} (module=${input.module}, originalReference=${input.originalReference}) — programming error (NaN/Infinity reached adjust())`,
        );
      }
    }

    // 4. Atomic $transaction — canonical-order locking + caller-directed fan-out.
    //    Unlike settle(), adjust() never touches the platform/system wallet — every
    //    line here is caller-supplied and caller-directed; there is no drift-absorption row.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const recipientCredits: SettlementResult['recipientCredits'] = [];

        // Lock wallets in a canonical (sorted by walletId) order — NOT the
        // caller-supplied array order — mirrors settle()'s deadlock-avoidance
        // pattern (CR-01): two concurrent adjust() calls touching the same wallets
        // in opposite array order must acquire locks in one global sequence.
        const lockOrder = [...input.lines].sort((a, b) =>
          a.walletId < b.walletId ? -1 : a.walletId > b.walletId ? 1 : 0,
        );
        for (const line of lockOrder) {
          // SELECT FOR UPDATE — prevents concurrent writes to the same wallet.
          await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${line.walletId} FOR UPDATE`;
        }

        // Writes happen in the caller's ORIGINAL array order — only the locking
        // order above needed to be canonicalized (mirrors settle()'s
        // recipientsWithWallet vs lockOrder distinction). 1-based running index.
        let n = 0;
        for (const line of input.lines) {
          n += 1;
          const w = await tx.wallet.findUnique({ where: { id: line.walletId } });
          if (!w) {
            throw new Error(`Adjustment wallet vanished mid-transaction: ${line.walletId}`);
          }
          const before = Number(w.balance);
          const after = before + line.deltaNgn;
          if (line.deltaNgn < 0 && after < 0) {
            // Propagates out of the $transaction callback — Prisma's interactive
            // transaction only commits on successful callback return, so no partial
            // wallet.update/transaction.create from ANY line in this batch (including
            // earlier-processed lines) ever commits (SETTLE-10d).
            throw new InsufficientAdjustmentBalanceError(line.walletId, Math.abs(after));
          }
          await tx.wallet.update({ where: { id: line.walletId }, data: { balance: after } });
          await tx.transaction.create({
            data: {
              walletId: line.walletId,
              type: line.deltaNgn >= 0 ? 'CREDIT' : 'DEBIT',
              status: 'SUCCESS',
              amount: Math.abs(line.deltaNgn),
              currency: 'NGN',
              reference: `${input.originalReference}-ADJ-${n}`,
              gateway: 'INTERNAL',
              gatewayRef: input.originalReference,
              description: input.reason,
              balanceBefore: before,
              balanceAfter: after,
              metadata: {
                module: input.module,
                ...input.metadata,
              },
            },
          });
          recipientCredits.push({
            tag: 'ADJUSTMENT',
            amountNgn: line.deltaNgn,
            walletId: line.walletId,
          });
        }

        return { platformAmountNgn: 0, recipientCredits };
      });

      return { status: 'SETTLED', ...result };
    } catch (err) {
      // Typed insufficient-balance error is the caller's signal to set BLOCKED —
      // must never be swallowed or reclassified as a benign replay (SETTLE-10d).
      // This check MUST run first, before the P2002 check below.
      if (err instanceof InsufficientAdjustmentBalanceError) {
        throw err;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same target/isReferenceConflict inspection settle() uses — only a real
        // Transaction.reference unique-constraint hit is a benign duplicate-delivery
        // replay; any other P2002 is a real programming error and must not be
        // silently swallowed.
        const target = err.meta?.target as string[] | string | undefined;
        const isReferenceConflict = Array.isArray(target)
          ? target.includes('reference')
          : typeof target === 'string' && target.includes('reference');
        if (isReferenceConflict) {
          this.logger.warn(
            `Adjustment race detected for ${input.originalReference} (module: ${input.module}) — ` +
              `concurrent duplicate delivery lost to a unique-constraint winner; treating as benign replay`,
          );
          return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
        }
      }
      this.logger.error(
        `Adjustment failed for ${input.originalReference} (module: ${input.module}): ${(err as Error).message}`,
      );
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
          // Thread the original gateway through so RefundService can branch away from
          // the Paystack API for a WALLET-gated settlement (WR-03).
          gateway: input.gateway,
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

  // ── Split-tier resolution — always fresh, never cached (mirrors resolveMinistryWallet) ──

  async resolveSplit(
    module: string,
    amountNgn: number,
  ): Promise<{ earnerPct: number; ministryPct: number; platformPct: number | null }> {
    const tier = await this.prisma.settlementSplitTier.findFirst({
      where: { module, isActive: true, tierName: 'default' },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!tier) {
      throw new Error(
        `No active SettlementSplitTier found for module="${module}" — refusing to settle with an undefined split`,
      );
    }
    const earnerPct = Number(tier.earnerPct);
    const ministryPct = Number(tier.ministryPct);
    const platformPct = tier.platformPct === null ? null : Number(tier.platformPct);
    if (
      !Number.isFinite(earnerPct) ||
      !Number.isFinite(ministryPct) ||
      (platformPct !== null && !Number.isFinite(platformPct))
    ) {
      throw new Error(
        `Malformed SettlementSplitTier for module="${module}" (id=${tier.id}) — non-finite percentage value, refusing to settle`,
      );
    }
    return { earnerPct, ministryPct, platformPct };
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
