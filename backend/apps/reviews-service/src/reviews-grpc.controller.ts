import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ReviewsService } from '../../../src/modules/reviews/reviews.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ReviewTargetTypeLiteral } from '../../../src/modules/reviews/dto/create-review.dto';
import { reviews } from '@iseyaa/proto';

/**
 * Only CreateReview and ListReviews are implemented here — ResolveReviewFlag is
 * intentionally absent per D-07: the proto's ResolveReviewFlagRequest has no
 * decision/resolution fields, and getFlagQueue/getFlag have zero proto coverage at
 * all, so all three admin-flag operations stay fully in-process, calling
 * ReviewsService/Prisma directly via ReviewsAdminController/ReviewsAdminModule.
 */
@Controller()
export class ReviewsGrpcController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly prisma: PrismaService,
  ) {}

  @GrpcMethod('ReviewsService', 'CreateReview')
  async createReview(data: reviews.CreateReviewRequest): Promise<reviews.CreateReviewResponse> {
    // The DTO's `photos` field cannot be populated here — the proto request has no
    // `photos` field at all; this is resolved client-side in 21-05, not here.
    const review = await this.reviewsService.createReview(data.userId, {
      tourBookingId: data.tourBookingId,
      targetType: data.targetType as ReviewTargetTypeLiteral,
      targetId: data.targetId,
      rating: data.rating,
      comment: data.comment || undefined,
    });
    return { id: review.id, flagged: review.flagged };
  }

  @GrpcMethod('ReviewsService', 'ListReviews')
  async listReviews(data: reviews.ListReviewsRequest): Promise<reviews.ListReviewsResponse> {
    // Deliberately NOT routed through ReviewsService.findByTarget() — that method
    // internally caps `limit` at 50 (Math.min(50, ...)), which would silently
    // truncate results and defeat the "return everything, paginate downstream"
    // approach the monolith facade (21-05) needs. Query Prisma directly instead,
    // scoped identically to findByTarget's where-clause (targetType, targetId,
    // deletedAt: null, flagged: false — no broader data exposure than the existing
    // REST endpoint already has), with a 1000-row safety cap — well above realistic
    // per-target review volume, distinct from the REST-facing 50-row cap.
    const rows = await this.prisma.review.findMany({
      where: {
        targetType: data.targetType as ReviewTargetTypeLiteral,
        targetId: data.targetId,
        deletedAt: null,
        flagged: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return {
      reviews: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        rating: r.rating,
        comment: r.comment ?? '',
        flagged: r.flagged,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
