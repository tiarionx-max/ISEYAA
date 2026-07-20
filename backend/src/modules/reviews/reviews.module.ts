import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

/**
 * 09-08 — Reviews module.
 *
 * 21-05: ReviewsController has moved out into ReviewsClientModule (public REST endpoints now
 * served via the reviews-service gRPC facade) — this module registers no controllers of its
 * own. It still provides + exports ReviewsService because both ReviewsAdminModule (21-04, in
 * -process admin flag queue) and `apps/reviews-service`'s wholesale import (the extracted
 * gRPC process itself) require it.
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
  controllers: [],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
