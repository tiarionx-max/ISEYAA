import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ReviewsService } from '../../../src/modules/reviews/reviews.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { ReviewTargetTypeLiteral, REVIEW_TARGET_TYPES } from '../../../src/modules/reviews/dto/create-review.dto';
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

  // NestJS's default @GrpcMethod exception handling does NOT preserve a thrown
  // NotFoundException/ForbiddenException/BadRequestException/ConflictException's
  // message across the gRPC boundary — BaseRpcExceptionFilter replaces any
  // non-RpcException with the generic "Internal server error" string.
  // Business-rule review failures (booking not found, not-your-booking, tour-not-ended,
  // duplicate review) are explicitly re-wrapped in RpcException below so the original
  // message reaches the citizen. Any other error type is rethrown unmodified,
  // deliberately falling through to the default filter's generic response — that path
  // is for genuine defects, not business-rule failures.
  @GrpcMethod('ReviewsService', 'CreateReview')
  async createReview(data: reviews.CreateReviewRequest): Promise<reviews.CreateReviewResponse> {
    try {
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
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: err.message });
      }
      if (err instanceof ForbiddenException) {
        throw new RpcException({ code: GrpcStatus.PERMISSION_DENIED, message: err.message });
      }
      if (err instanceof ConflictException) {
        throw new RpcException({ code: GrpcStatus.ALREADY_EXISTS, message: err.message });
      }
      if (err instanceof BadRequestException) {
        throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: err.message });
      }
      throw err;
    }
  }

  @GrpcMethod('ReviewsService', 'ListReviews')
  async listReviews(data: reviews.ListReviewsRequest): Promise<reviews.ListReviewsResponse> {
    // An unhandled error here (e.g. an invalid targetType reaching Prisma's `where`
    // as a bad enum value) previously escaped this method uncaught. NestJS's default
    // gRPC exception filter converts any non-RpcException into a generic INTERNAL
    // error, which was observed to degrade ReviewsClientService's resilience/circuit
    // breaker on the caller side — every subsequent call, including valid ones,
    // returned 503 without even reaching this container. Validate up front and wrap
    // any unexpected error in RpcException, mirroring CreateReview's pattern above.
    if (!REVIEW_TARGET_TYPES.includes(data.targetType as ReviewTargetTypeLiteral)) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: `targetType must be one of ${REVIEW_TARGET_TYPES.join(' | ')}`,
      });
    }

    try {
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
    } catch (err) {
      if (err instanceof RpcException) throw err;
      throw new RpcException({
        code: GrpcStatus.INTERNAL,
        message: (err as Error).message ?? 'ListReviews failed',
      });
    }
  }
}
