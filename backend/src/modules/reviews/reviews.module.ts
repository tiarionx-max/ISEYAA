import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import {
  ReviewsController,
  ReviewsAdminController,
} from './reviews.controller';

/**
 * 09-08 — Reviews module.
 *
 * Two controllers:
 *   ReviewsController       — public + authenticated tourist endpoints
 *   ReviewsAdminController  — LGA_ADMIN+ flag queue + resolve
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
  controllers: [ReviewsController, ReviewsAdminController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
