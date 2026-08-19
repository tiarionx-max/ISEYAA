import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { reviews } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { REVIEWS_PACKAGE } from './reviews-client.constants';
import { CreateReviewDto, ReviewTargetTypeLiteral } from '../reviews/dto/create-review.dto';

// 21-05: canary kill-switch PlatformConfig key, matching notifications-client.service.ts's /
// news-client.service.ts's / waitlist-client.service.ts's opt-OUT polarity — absence or any
// value other than `false` means enabled.
const CANARY_FLAG_KEY = 'grpc.reviews_service.canary_enabled';

// D-06: matches FlutterwaveService's / NotificationsClientService's / WaitlistClientService's
// exact wording convention.
const UNAVAILABLE_MESSAGE = 'Reviews service is temporarily unavailable, please try again shortly';

/**
 * 21-05: Thin gRPC facade over reviews-service. This is the plan with the most genuine new
 * engineering in the whole extraction backlog — two real shape gaps to reconcile, not one:
 *
 *   - CreateReviewRequest has NO `photos` field at all. Without an explicit write-back step,
 *     uploaded review photo URLs would be silently discarded — a real functional data-loss
 *     regression, not a display-shape cosmetic gap. createReview() issues a follow-up
 *     `prisma.review.update({data:{photos}})` immediately after gRPC success, then re-fetches
 *     the full row so the returned shape (including photos) matches the pre-extraction REST
 *     response exactly.
 *   - ListReviewsResponse is a thin `ReviewSummary[]` — no pagination envelope, no embedded
 *     `user`. findByTarget() re-enriches via a follow-up `prisma.review.findMany` (the
 *     established "no data-ownership boundary" shape-reconciliation pattern) and paginates
 *     the enriched array IN MEMORY.
 *
 * D-08: the in-memory pagination approach fetches up to 1000 rows per target (21-04's
 * server-side cap on `ListReviews`) then paginates client-side, rather than doing true DB-level
 * skip/take. This is acceptable at current review-per-target volumes, but if any production
 * target commonly approaches the 1000-row cap, every paginated request re-fetching and
 * re-sorting the FULL target's row set becomes a real latency risk against the P95 < 500ms
 * constraint (CLAUDE.md), and a count actually at/near 1000 means silent truncation, not just
 * latency. This plan's Task 4 is the explicit, blocking sizing gate required before this code
 * is allowed to go live — see 21-05-PLAN.md.
 *
 * ReviewsClientService has no resolveFlag/getFlagQueue/getFlagById methods — per D-07, all
 * three admin-flag operations stay fully in-process via ReviewsAdminController/
 * ReviewsAdminModule (21-04), never routed through this facade.
 */
@Injectable()
export class ReviewsClientService implements OnModuleInit {
  private readonly logger = new Logger(ReviewsClientService.name);
  private grpcService!: reviews.ReviewsServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REVIEWS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<reviews.ReviewsServiceClient>('ReviewsService');
  }

  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  }

  async createReview(actorUserId: string, dto: CreateReviewDto) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('createReview: reviews-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const result = await this.resilience.execute<reviews.CreateReviewResponse>('reviewsGrpc', () =>
        // See notifications-client.service.ts's `as any` rationale — dual-rxjs-copy artifact.
        firstValueFrom(
          this.grpcService.createReview({
            targetType: dto.targetType,
            targetId: dto.targetId,
            userId: actorUserId,
            tourBookingId: dto.tourBookingId,
            rating: dto.rating,
            comment: dto.comment ?? '',
          }) as any,
        ),
      );

      // CreateReviewRequest has NO `photos` field — required write-side enrichment step.
      // Without this, uploaded photo URLs are silently discarded (real functional
      // regression, not a display-shape cosmetic issue).
      if (dto.photos?.length) {
        await this.prisma.review.update({
          where: { id: result.id },
          data: { photos: dto.photos },
        });
      }

      // No `include` — matches createReview's current no-embedded-user REST shape exactly.
      return this.prisma.review.findUnique({ where: { id: result.id } });
    } catch (err: any) {
      // T-21-08-03: strict `===` against numeric GrpcStatus enum values — a malformed/
      // codeless error always falls through to the safe ServiceUnavailableException
      // default below, never a mis-mapped 400/403/404/409.
      if (err?.code === GrpcStatus.NOT_FOUND) {
        throw new NotFoundException(err.message);
      }
      if (err?.code === GrpcStatus.PERMISSION_DENIED) {
        throw new ForbiddenException(err.message);
      }
      if (err?.code === GrpcStatus.ALREADY_EXISTS) {
        throw new ConflictException(err.message);
      }
      if (err?.code === GrpcStatus.INVALID_ARGUMENT) {
        throw new BadRequestException(err.message);
      }
      // T-21-05-03: log only err?.message — never the full gRPC error object or review content.
      this.logger.error(`Reviews gRPC createReview failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  async findByTarget(
    targetType: ReviewTargetTypeLiteral,
    targetId: string,
    opts: { page?: number; limit?: number } = {},
  ) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('findByTarget: reviews-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const res = await this.resilience.execute<reviews.ListReviewsResponse>('reviewsGrpc', () =>
        firstValueFrom(this.grpcService.listReviews({ targetType, targetId }) as any),
      );

      // res.reviews is up to 1000 rows (21-04's server-side cap) for this target — order not
      // guaranteed to survive the round-trip. Re-query with `orderBy` directly (rather than
      // manually re-sorting the gRPC response) — simpler and matches findByTarget's existing
      // sort exactly. T-21-05-02: where-clause fields match the existing REST endpoint's scope
      // exactly — no broader data exposure.
      const ids = res.reviews.map((r) => r.id);
      const enriched = await this.prisma.review.findMany({
        where: { id: { in: ids } },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // D-08: in-memory pagination — see class-level doc comment for the full tradeoff.
      const page = Math.max(1, opts.page ?? 1);
      const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
      const total = enriched.length;
      const start = (page - 1) * limit;
      const rows = enriched.slice(start, start + limit);

      return {
        data: rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    } catch (err: any) {
      this.logger.error(`Reviews gRPC listReviews failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
