import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementService } from '../../common/services/settlement.service';
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
   * Two guards run before any write:
   *   1. The settlement must actually exist (a Transaction row prefixed with
   *      `${settlementReference}-`).
   *   2. No other active (non-terminal) dispute may already be open against
   *      it — `adjust()`'s idempotency key is per-`originalReference`, not
   *      per-dispute, so two concurrent disputes racing to resolve the same
   *      settlement could otherwise post two DIFFERENT adjustments, with the
   *      second silently REPLAYing onto the first's numbers (T-19-07).
   */
  async raise(actorUserId: string, dto: RaiseDisputeDto) {
    const original = await this.prisma.transaction.findFirst({
      where: { reference: { startsWith: `${dto.settlementReference}-` } },
      select: { id: true },
    });
    if (!original) {
      throw new NotFoundException('No settlement found for this reference');
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

    const created = await this.prisma.settlementDispute.create({
      data: {
        settlementReference: dto.settlementReference,
        module: dto.module,
        raisedByUserId: actorUserId,
        reason: dto.reason,
        requestedAdjustmentNgn: dto.requestedAdjustmentNgn ?? null,
        status: 'OPEN',
      },
    });

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
}
