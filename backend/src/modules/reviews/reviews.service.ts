import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto, ReviewTargetTypeLiteral } from './dto/create-review.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';

/**
 * Event emitted (in-process) immediately after a Review row is created.
 * Triggers a debounced aggregate rating recompute on the target.
 */
export interface ReviewCreatedPayload {
  targetType: ReviewTargetTypeLiteral;
  targetId: string;
}

/**
 * Debounce window for aggregate rating recompute (milliseconds).
 * Five reviews submitted in rapid succession on the same target collapse to
 * ONE prisma aggregate query plus ONE write.
 *
 * Exported so the spec can override (via jest fake timers + a small constant)
 * without waiting actual wall-clock seconds.
 */
export const RECOMPUTE_DEBOUNCE_MS = 5_000;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  /**
   * In-memory per-target debounce table.
   *
   * NOT cluster-safe — when the backend scales to >1 Node process (Railway
   * scale-out, multi-pod K8s) each pod holds its own Map so a burst of N
   * reviews split across N pods triggers N recomputes instead of 1. Final
   * stored value is still correct (the recompute reads ALL reviews) but
   * we waste DB round-trips. Cluster-safe debounce is documented in the
   * 09-08 SUMMARY as a follow-up (Redis SETEX + leader-elect or BullMQ).
   */
  private readonly pendingRecomputes = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── createReview ─────────────────────────────────────────────────────────

  /**
   * Tourist posts a 1-5 star review. Seven eligibility guards run BEFORE any
   * write; rating ≤ 2 sets `Review.flagged=true` AND creates an
   * `AdminReviewFlag` row in the SAME `$transaction` (atomic).
   *
   * After the transaction commits, fires `review.created` so the debounced
   * recompute scheduler updates `TourGuide.rating` / `TourPackage.rating` /
   * `Property.rating` for the target.
   */
  async createReview(actorUserId: string, dto: CreateReviewDto) {
    // 1. Load booking with snapshot — lean projection.
    const booking = await this.prisma.tourBooking.findUnique({
      where: { id: dto.tourBookingId },
      select: {
        id: true,
        status: true,
        buyerUserId: true,
        groupLeaderUserId: true,
        tourDate: true,
        tourPackageId: true,
        snapshot: true,
        deletedAt: true,
      },
    });
    if (!booking || booking.deletedAt) {
      throw new NotFoundException('Booking not found');
    }

    // 2. Ownership: buyer OR (split-bill) group leader can review.
    if (
      actorUserId !== booking.buyerUserId &&
      actorUserId !== booking.groupLeaderUserId
    ) {
      throw new ForbiddenException('You did not own this tour booking');
    }

    // 3. Eligibility window: CHECKED_OUT OR (CONFIRMED AND tourEnd in the past).
    const snapshot: any = booking.snapshot ?? {};
    const durationHours = Number(snapshot.durationHours ?? 0);
    const tourEnd = new Date(
      booking.tourDate.getTime() + durationHours * 3_600_000,
    );
    const tourEnded = tourEnd <= new Date();
    const allowed =
      booking.status === 'CHECKED_OUT' ||
      (booking.status === 'CONFIRMED' && tourEnded);
    if (!allowed) {
      throw new BadRequestException(
        'Tour has not ended yet — reviews open after CHECKED_OUT or once the tour window closes',
      );
    }

    // 4. targetType-specific id check (the heart of the eligibility guard).
    this.assertTargetMatchesBooking(dto.targetType, dto.targetId, booking, snapshot);

    // 5. One review per (booking, targetType, targetId).
    const existing = await this.prisma.review.findFirst({
      where: {
        tourBookingId: dto.tourBookingId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'You already reviewed this target for this booking',
      );
    }

    // 6. Auto-flag threshold: rating ≤ 2.
    const flagged = dto.rating <= 2;

    // 7. Persist atomically — review row + (optional) flag row in ONE transaction.
    const review = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.review.create({
        data: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          userId: actorUserId,
          tourBookingId: dto.tourBookingId,
          rating: dto.rating,
          comment: dto.comment ?? null,
          // photos already validated as @IsUrl[] by the DTO — persist verbatim.
          photos: dto.photos ?? [],
          flagged,
          metadata: { source: 'tour' } as any,
        },
      });
      if (flagged) {
        await tx.adminReviewFlag.create({
          data: {
            reviewId: created.id,
            status: 'OPEN',
          },
        });
      }
      return created;
    });

    // 8. Schedule aggregate recompute (post-commit; emit AFTER tx).
    this.eventEmitter.emit('review.created', {
      targetType: dto.targetType,
      targetId: dto.targetId,
    } satisfies ReviewCreatedPayload);

    return review;
  }

  /**
   * Per-targetType id check. Pulled out so the create path stays readable
   * and the spec can drive each branch independently.
   */
  private assertTargetMatchesBooking(
    targetType: ReviewTargetTypeLiteral,
    targetId: string,
    booking: { tourPackageId: string },
    snapshot: any,
  ): void {
    if (targetType === 'GUIDE') {
      const snapshotGuideId = snapshot?.tourGuideId;
      if (!snapshotGuideId || snapshotGuideId !== targetId) {
        throw new BadRequestException(
          'targetId does not match the guide that ran this tour',
        );
      }
      return;
    }
    if (targetType === 'PACKAGE') {
      if (booking.tourPackageId !== targetId) {
        throw new BadRequestException(
          'targetId does not match the package booked',
        );
      }
      return;
    }
    if (targetType === 'VENUE') {
      const venueIds = new Set<string>([
        ...((snapshot?.attractionIds as string[]) ?? []),
        ...(snapshot?.propertyId ? [snapshot.propertyId] : []),
      ]);
      if (!venueIds.has(targetId)) {
        throw new BadRequestException(
          'targetId is not a venue covered by this booking',
        );
      }
      return;
    }
    // class-validator should have caught this, but defence-in-depth.
    throw new BadRequestException(`Unknown targetType: ${targetType}`);
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * Public list — non-flagged reviews only. Used by:
   *   GET /reviews?targetType=&targetId=
   *   GET /tour-guides/:id/reviews  (controller resolves to targetType=GUIDE)
   *   GET /tour-packages/:id/reviews (controller resolves to targetType=PACKAGE)
   */
  async findByTarget(
    targetType: ReviewTargetTypeLiteral,
    targetId: string,
    opts: { page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          targetType,
          targetId,
          deletedAt: null,
          flagged: false,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.review.count({
        where: { targetType, targetId, deletedAt: null, flagged: false },
      }),
    ]);

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin queue — OPEN AdminReviewFlag rows with embedded review + reviewer.
   * Used by GET /admin/reviews/queue (LGA_ADMIN+).
   */
  async findFlagQueue(opts: { status?: string; page?: number; limit?: number } = {}) {
    const status = opts.status ?? 'OPEN';
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.adminReviewFlag.findMany({
        where: { status },
        orderBy: { createdAt: 'asc' }, // oldest first — review backlog
        skip,
        take: limit,
        include: {
          review: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, avatarUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.adminReviewFlag.count({ where: { status } }),
    ]);

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin flag detail — single row with embedded review + reviewer.
   */
  async findFlagById(flagId: string) {
    const flag = await this.prisma.adminReviewFlag.findUnique({
      where: { id: flagId },
      include: {
        review: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!flag) throw new NotFoundException('Flag not found');
    return flag;
  }

  // ── Admin: resolve flag ──────────────────────────────────────────────────

  /**
   * Transition an OPEN flag → RESOLVED or DISMISSED.
   * 409 if the flag is already in a terminal state.
   */
  async resolveFlag(flagId: string, actorUserId: string, dto: ResolveFlagDto) {
    const flag = await this.prisma.adminReviewFlag.findUnique({
      where: { id: flagId },
      select: { id: true, status: true },
    });
    if (!flag) throw new NotFoundException('Flag not found');
    if (flag.status !== 'OPEN' && flag.status !== 'IN_REVIEW') {
      throw new ConflictException(`Flag is already ${flag.status}`);
    }

    return this.prisma.adminReviewFlag.update({
      where: { id: flagId },
      data: {
        status: dto.decision,
        assignedTo: actorUserId,
        resolvedAt: new Date(),
        resolution: dto.resolution ?? null,
      },
    });
  }

  // ── Aggregate rating recompute (debounced, event-driven) ─────────────────

  /**
   * Listens for `review.created` and coalesces bursts on the same target into
   * a single DB round-trip after RECOMPUTE_DEBOUNCE_MS.
   *
   * CAVEAT (documented in SUMMARY): in-memory map → not cluster-safe.
   */
  @OnEvent('review.created')
  onReviewCreated(payload: ReviewCreatedPayload) {
    this.scheduleRecompute(payload.targetType, payload.targetId);
  }

  /**
   * Public so the spec can call it directly with a tight timeout and avoid
   * coupling to wall-clock semantics.
   */
  scheduleRecompute(targetType: ReviewTargetTypeLiteral, targetId: string) {
    const key = `${targetType}:${targetId}`;
    const existing = this.pendingRecomputes.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const handle = setTimeout(() => {
      this.pendingRecomputes.delete(key);
      this.recomputeTargetRating(targetType, targetId).catch((err) =>
        this.logger.error(
          `Aggregate recompute failed for ${key}`,
          (err as Error).stack,
        ),
      );
    }, RECOMPUTE_DEBOUNCE_MS);
    // Don't keep the event loop alive in test environments.
    if (typeof handle.unref === 'function') handle.unref();
    this.pendingRecomputes.set(key, handle);
  }

  /**
   * INTERNAL — recompute `rating` + `reviewCount` for one target and persist
   * to the target's home table. Exposed for the spec and for the scheduler.
   *
   * Schema reality (see schema.prisma):
   *   - TourGuide.rating + TourGuide.reviewCount   ← GUIDE
   *   - TourPackage.rating + TourPackage.reviewCount ← PACKAGE
   *   - Property.rating + Property.reviewCount     ← VENUE (Property only)
   *   - Attraction has NO rating column ← logged warn, no-op
   */
  async recomputeTargetRating(
    targetType: ReviewTargetTypeLiteral,
    targetId: string,
  ): Promise<{ rating: number | null; reviewCount: number }> {
    const agg = await this.prisma.review.aggregate({
      where: { targetType, targetId, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const avg = agg._avg?.rating ?? null;
    // Round to 2 decimals for stable display ("4.33", "4.50").
    const rating =
      avg === null ? null : Math.round(Number(avg) * 100) / 100;
    const reviewCount = agg._count?._all ?? 0;

    if (targetType === 'GUIDE') {
      await this.prisma.tourGuide.update({
        where: { id: targetId },
        data: { rating: rating as any, reviewCount },
      });
    } else if (targetType === 'PACKAGE') {
      await this.prisma.tourPackage.update({
        where: { id: targetId },
        data: { rating: rating as any, reviewCount },
      });
    } else if (targetType === 'VENUE') {
      // Try Property first; fall back to Attraction with a logged warn since
      // Attraction has no rating column in v1.
      const property = await this.prisma.property
        .findUnique({ where: { id: targetId }, select: { id: true } })
        .catch(() => null);
      if (property) {
        await this.prisma.property.update({
          where: { id: targetId },
          data: { rating: rating as any, reviewCount },
        });
      } else {
        this.logger.warn(
          `VENUE rating recompute for ${targetId}: Attraction.rating column not in v1 schema — value recorded on Review rows but not aggregated to Attraction (follow-up: add Attraction.rating in a future phase).`,
        );
      }
    }

    return { rating, reviewCount };
  }
}
