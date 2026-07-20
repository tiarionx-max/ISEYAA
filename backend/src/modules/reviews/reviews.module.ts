import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';

/**
 * 09-08 — Reviews module.
 *
 * One controller: ReviewsController — public + authenticated tourist endpoints.
 *
 * 21-04: ReviewsAdminController (LGA_ADMIN+ flag queue + resolve) has moved out
 * into its own ReviewsAdminModule so it is never wholesale-imported into the new
 * reviews-service gRPC process alongside this module. ReviewsController stays
 * here temporarily — Plan 21-05 removes it once ReviewsClientModule takes over,
 * keeping this plan's changes independently buildable and behavior-preserving.
 *
 * No extra `imports`: PrismaService (PrismaModule @Global), EventEmitter2
 * (EventEmitterModule.forRoot() in AppModule) and the auth/roles guards
 * are all globally available.
 *
 * PHOTO UPLOAD: this module CONSUMES the presigned-URL flow shipped in
 * 09-02 (UploadService) — the client uploads each photo with
 * `keyPrefix='review-photos'` and submits the returned publicUrl(s) to
 * POST /reviews. This module does NOT re-implement upload handling.
 */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
