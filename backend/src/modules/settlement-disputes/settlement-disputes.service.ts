import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SettlementService,
  SettlementAdjustmentLine,
  InsufficientAdjustmentBalanceError,
} from '../../common/services/settlement.service';
import { RaiseDisputeDto } from './dto/raise-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

/**
 * 19-03 — SettlementDisputesService.
 *
 * State-machine + financial-diffing core of the settlement dispute/adjustment
 * workflow (SETTLE-10). Mirrors `ReviewsService`'s `findFlagQueue()`/
 * `findFlagById()`/`resolveFlag()` structural precedent, extended to a
 * 5-value status set (`OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED`,
 * D-04) and a system-computed (not reviewer-editable) resolution path (D-01).
 *
 * Authorization (SUPER_ADMIN-only, D-02) lives entirely at the controller
 * layer (19-04-PLAN.md) — this service takes `actorUserId` as a trusted
 * plain parameter, matching `ReviewsService`/`AdminService` precedent.
 */
@Injectable()
export class SettlementDisputesService {
  private readonly logger = new Logger(SettlementDisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: SettlementService,
  ) {}

  // ── AuditLog helper (SETTLE-10e) ───────────────────────────────────────────

  /**
   * Silent-fallback AuditLog write — mirrors `kyc.service.ts`'s exact shape.
   * Never rethrows: an audit-log failure must not block the primary dispute
   * state transition that already committed.
   */
  private async writeAudit(
    actorUserId: string,
    action: string,
    disputeId: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action,
          entity: 'SettlementDispute',
          entityId: disputeId,
          newValue: extra as any,
        },
      });
    } catch (err) {
      this.logger.error(`Dispute audit log failed for disputeId=${disputeId}`, err);
    }
  }

  // ── raise() ─────────────────────────────────────────────────────────────

  /**
   * SUPER_ADMIN raises a dispute against a completed settlement (SETTLE-10a).
   * Guards run before any write:
   *   1. The settlement must actually exist (a Transaction row prefixed with
   *      `${settlementReference}-`).
   *   2. `dto.module` must match the settlement's actually-recorded
   *      `metadata.module` (CR-03) — a wrong-module dispute would silently
   *      drive `resolveSplit()` to an unrelated tier. A settlement row with
   *      no recorded module at all is not rejected (backward compatibility).
   *   3. No other active (non-terminal) dispute may already be open against
   *      it — `adjust()`'s idempotency key is per-`originalReference`, not
   *      per-dispute, so two concurrent disputes racing to resolve the same
   *      settlement could otherwise post two DIFFERENT adjustments, with the
   *      second silently REPLAYing onto the first's numbers (T-19-07). This
   *      in-app pre-check is backstopped by a DB-level partial unique index
   *      (`settlement_disputes_active_per_reference`, CR-02) — a P2002 race
   *      loss here is translated into the same ConflictException below, so
   *      the pre-check and the DB backstop are indistinguishable to callers.
   */
  async raise(actorUserId: string, dto: RaiseDisputeDto) {
    const original = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${dto.settlementReference}-` } },
      select: { id: true, metadata: true },
    });
    if (!original) {
      throw new NotFoundException('No settlement found for this reference');
    }

    const recordedModule = (original.metadata as any)?.module;
    if (recordedModule && recordedModule !== dto.module) {
      throw new BadRequestException(
        `module mismatch: settlement is recorded under "${recordedModule}", not "${dto.module}"`,
      );
    }

    const activeExisting = await this.prisma.settlementDispute.findFirst({
      where: {
        settlementReference: dto.settlementReference,
        status: { in: ['OPEN', 'IN_REVIEW', 'BLOCKED'] },
      },
      select: { id: true },
    });
    if (activeExisting) {
      throw new ConflictException('An active dispute already exists for this settlement');
    }

    let created;
    try {
      created = await this.prisma.settlementDispute.create({
        data: {
          settlementReference: dto.settlementReference,
          module: dto.module,
          raisedByUserId: actorUserId,
          reason: dto.reason,
          requestedAdjustmentNgn: dto.requestedAdjustmentNgn ?? null,
          status: 'OPEN',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // This table's only unique constraint reachable from create() is the
        // partial index above (the `id` primary key is a UUID, effectively
        // collision-free) — no err.meta?.target inspection needed here (unlike
        // settle()/adjust(), which share a table with multiple possible
        // unique-constraint hits).
        throw new ConflictException('An active dispute already exists for this settlement');
      }
      throw err;
    }

    await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_RAISED', created.id, {
      module: dto.module,
      settlementReference: dto.settlementReference,
      reason: dto.reason,
      requestedAdjustmentNgn: dto.requestedAdjustmentNgn ?? null,
    });

    return created;
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  /**
   * Admin queue — defaults to OPEN, paginated. Mirrors
   * `reviews.service.ts`'s `findFlagQueue()` near-verbatim.
   */
  async findQueue(opts: { status?: string; page?: number; limit?: number } = {}) {
    const status = opts.status ?? 'OPEN';
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.settlementDispute.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: {
          raisedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.settlementDispute.count({ where: { status } }),
    ]);

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin detail — mirrors `reviews.service.ts`'s `findFlagById()`.
   */
  async findById(disputeId: string) {
    const dispute = await this.prisma.settlementDispute.findUnique({
      where: { id: disputeId },
      include: {
        raisedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  // ── moveToReview() ──────────────────────────────────────────────────────

  /**
   * Transition OPEN -> IN_REVIEW. Only OPEN can enter IN_REVIEW — a BLOCKED
   * dispute re-resolves directly via `resolve()` per D-05, it does not
   * re-enter IN_REVIEW first.
   */
  async moveToReview(disputeId: string, actorUserId: string) {
    const dispute = await this.prisma.settlementDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'OPEN') {
      throw new ConflictException(`Dispute is already ${dispute.status}`);
    }

    const updated = await this.prisma.settlementDispute.update({
      where: { id: disputeId },
      data: { status: 'IN_REVIEW', assignedTo: actorUserId },
    });

    await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_MOVED_TO_REVIEW', disputeId, {});

    return updated;
  }

  // INTERNAL — exposed for the spec and for resolve()

  /**
   * Reverse-engineers "what the split should have been" against "what was
   * actually paid" from the original settlement's already-persisted
   * Transaction rows (D-01: the system computes this, never the reviewer).
   *
   * Row shape reversed here matches exactly what `settle()` writes
   * (`settlement.service.ts` lines 184-234): recipient rows carry
   * `metadata.recipientType = tag` ('DRIVER'/'VENDOR'/'MINISTRY'/etc.), the
   * platform row's reference ends in `-PLAT` and carries no `recipientType`.
   *
   * CR-01 fix: the diff this function returns now ALSO includes the platform
   * wallet's own correction — computed via the same self-balancing formula
   * `settle()` uses for its own drift-absorption row (`chargeAmountNgn` minus
   * the corrected earner and ministry totals), never `platformPct` directly
   * (which can legitimately be `null`). Every non-empty `lines` result sums
   * to 0 by construction: the original settlement's rows already summed to
   * `chargeAmountNgn`, and the corrected totals are constructed to also sum
   * to `chargeAmountNgn`, so `sum(deltas) = sum(corrected) - sum(actual) = 0`.
   */
  async computeAdjustmentLines(
    module: string,
    settlementReference: string,
  ): Promise<{ lines: SettlementAdjustmentLine[]; chargeAmountNgn: number }> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        reference: { startsWith: `${settlementReference}-` },
        NOT: { reference: { contains: '-ADJ-' } },
        status: 'SUCCESS',
      },
      select: { id: true, reference: true, amount: true, walletId: true, metadata: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException('No settled Transaction rows found for this settlement reference');
    }

    const platformRow = rows.find((r) => r.reference.endsWith('-PLAT'));
    const ministryRow = rows.find((r) => (r.metadata as any)?.recipientType === 'MINISTRY');
    const earnerRows = rows.filter((r) => r.id !== platformRow?.id && r.id !== ministryRow?.id);

    const chargeAmountNgn = rows.reduce((s, r) => s + Number(r.amount), 0);
    const actualEarnerTotal = earnerRows.reduce((s, r) => s + Number(r.amount), 0);
    const actualMinistryTotal = ministryRow ? Number(ministryRow.amount) : 0;

    const { earnerPct, ministryPct } = await this.settlementService.resolveSplit(
      module,
      chargeAmountNgn,
    );

    const correctEarnerTotal = Math.round(chargeAmountNgn * earnerPct * 100) / 100;
    const correctMinistryTotal = Math.round(chargeAmountNgn * ministryPct * 100) / 100;
    const earnerDeltaTotal = Math.round((correctEarnerTotal - actualEarnerTotal) * 100) / 100;
    const ministryDelta = Math.round((correctMinistryTotal - actualMinistryTotal) * 100) / 100;

    const lines: SettlementAdjustmentLine[] = [];

    if (ministryRow?.walletId && Math.abs(ministryDelta) >= 0.01) {
      lines.push({ walletId: ministryRow.walletId, deltaNgn: ministryDelta });
    }

    const earnerRowsWithWallet = earnerRows.filter((r) => r.walletId);
    if (
      earnerRowsWithWallet.length > 0 &&
      actualEarnerTotal > 0 &&
      Math.abs(earnerDeltaTotal) >= 0.01
    ) {
      let remaining = earnerDeltaTotal;
      for (let i = 0; i < earnerRowsWithWallet.length - 1; i++) {
        const row = earnerRowsWithWallet[i];
        const share = Number(row.amount) / actualEarnerTotal;
        const deltaNgn = Math.round(earnerDeltaTotal * share * 100) / 100;
        remaining = Math.round((remaining - deltaNgn) * 100) / 100;
        if (Math.abs(deltaNgn) >= 0.01) {
          lines.push({ walletId: row.walletId!, deltaNgn });
        }
      }
      const lastRow = earnerRowsWithWallet[earnerRowsWithWallet.length - 1];
      if (Math.abs(remaining) >= 0.01) {
        lines.push({ walletId: lastRow.walletId!, deltaNgn: remaining });
      }
    }

    // Platform-wallet balancing line (CR-01) — self-derives from the charge
    // total minus both corrected totals above, mirroring settle()'s own
    // drift-absorption formula. Works even when platformPct is null.
    const correctPlatformTotal =
      Math.round((chargeAmountNgn - correctEarnerTotal - correctMinistryTotal) * 100) / 100;
    const actualPlatformTotal = platformRow ? Number(platformRow.amount) : 0;
    const platformDelta = Math.round((correctPlatformTotal - actualPlatformTotal) * 100) / 100;
    if (platformRow?.walletId && Math.abs(platformDelta) >= 0.01) {
      lines.push({ walletId: platformRow.walletId, deltaNgn: platformDelta });
    }

    return { lines, chargeAmountNgn };
  }

  // ── resolve() ───────────────────────────────────────────────────────────

  /**
   * System-computed resolution (D-01): diffs `resolveSplit()`'s output
   * against the original settlement's actual payout via
   * `computeAdjustmentLines()`, then posts the derived lines through
   * `SettlementService.adjust()`. Callable from OPEN, IN_REVIEW, and BLOCKED
   * (D-05: BLOCKED is retryable) — only RESOLVED/DISMISSED are terminal.
   */
  async resolve(disputeId: string, actorUserId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.settlementDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === 'RESOLVED' || dispute.status === 'DISMISSED') {
      throw new ConflictException(`Dispute is already ${dispute.status}`);
    }

    const { lines } = await this.computeAdjustmentLines(
      dispute.module,
      dispute.settlementReference,
    );

    if (lines.length === 0) {
      const updated = await this.prisma.settlementDispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          assignedTo: actorUserId,
          resolvedAt: new Date(),
          resolution:
            dto.resolution ??
            'No adjustment required — current resolveSplit() output matches the original settlement',
          adjustmentReference: null,
        },
      });
      await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_RESOLVED_NOOP', disputeId, {
        module: dispute.module,
        settlementReference: dispute.settlementReference,
      });
      return updated;
    }

    try {
      const adjResult = await this.settlementService.adjust({
        originalReference: dispute.settlementReference,
        module: dispute.module,
        lines,
        reason: dto.resolution ?? dispute.reason,
        metadata: { disputeId: dispute.id, adjustmentReason: dto.resolution ?? dispute.reason },
      });

      // Prefix only — individual lines carry the `-ADJ-${n}` suffix internally.
      const adjustmentReference = `${dispute.settlementReference}-ADJ`;

      const updated = await this.prisma.settlementDispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          assignedTo: actorUserId,
          resolvedAt: new Date(),
          resolution: dto.resolution ?? null,
          adjustmentReference,
        },
      });

      await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_RESOLVED', disputeId, {
        module: dispute.module,
        settlementReference: dispute.settlementReference,
        adjustmentReference,
        lines,
        adjustResultStatus: adjResult.status,
      });

      return updated;
    } catch (err) {
      if (err instanceof InsufficientAdjustmentBalanceError) {
        const updated = await this.prisma.settlementDispute.update({
          where: { id: disputeId },
          data: {
            status: 'BLOCKED',
            assignedTo: actorUserId,
            resolution: `Blocked — insufficient balance on wallet ${err.walletId} (shortfall ₦${err.shortfallNgn})`,
          },
        });
        await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_BLOCKED', disputeId, {
          module: dispute.module,
          settlementReference: dispute.settlementReference,
          walletId: err.walletId,
          shortfallNgn: err.shortfallNgn,
        });
        return updated;
      }
      throw err;
    }
  }

  // ── dismiss() ───────────────────────────────────────────────────────────

  /**
   * Transition to DISMISSED (no adjustment warranted). Never touches
   * `computeAdjustmentLines()` or the settlement adjust primitive — a
   * dismissed dispute means "no adjustment", full stop.
   */
  async dismiss(disputeId: string, actorUserId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.settlementDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status === 'RESOLVED' || dispute.status === 'DISMISSED') {
      throw new ConflictException(`Dispute is already ${dispute.status}`);
    }

    const updated = await this.prisma.settlementDispute.update({
      where: { id: disputeId },
      data: {
        status: 'DISMISSED',
        assignedTo: actorUserId,
        resolvedAt: new Date(),
        resolution: dto.resolution ?? null,
      },
    });

    await this.writeAudit(actorUserId, 'SETTLEMENT_DISPUTE_DISMISSED', disputeId, {
      module: dispute.module,
      settlementReference: dispute.settlementReference,
    });

    return updated;
  }
}
