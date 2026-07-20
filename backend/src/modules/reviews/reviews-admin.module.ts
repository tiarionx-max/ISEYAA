import { Module } from '@nestjs/common';
import { ReviewsModule } from './reviews.module';
import { ReviewsAdminController } from './reviews.controller';

/**
 * 21-04 — Admin review-flag queue, isolated into its own module.
 *
 * Per D-07, getFlagQueue/getFlag/resolveFlag all stay in-process, calling
 * ReviewsService/Prisma directly — never through the reviews-service gRPC
 * extraction (ResolveReviewFlag's proto request has no decision/resolution
 * fields, and getFlagQueue/getFlag have zero proto coverage at all).
 *
 * Isolating ReviewsAdminController into its own module (rather than leaving it
 * inside ReviewsModule, which is wholesale-imported by the new reviews-service
 * gRPC process) prevents the admin controller's LGA_ADMIN+-gated HTTP routes
 * from being unintentionally duplicated inside that extracted process.
 *
 * Imports ReviewsModule for ReviewsService DI — ReviewsAdminController's 3
 * handlers call `this.reviewsService.findFlagQueue()` / `.findFlagById()` /
 * `.resolveFlag()` directly and unchanged.
 */
@Module({
  imports: [ReviewsModule],
  controllers: [ReviewsAdminController],
})
export class ReviewsAdminModule {}
