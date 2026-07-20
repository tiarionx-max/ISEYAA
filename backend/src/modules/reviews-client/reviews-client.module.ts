import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { ReviewsClientService } from './reviews-client.service';
import { ReviewsController } from '../reviews/reviews.controller';
// 21-05: extracted to a zero-import leaf file to break a require cycle with
// reviews-client.service.ts — do not move this declaration back here.
import { REVIEWS_PACKAGE } from './reviews-client.constants';

/**
 * 21-05: Registers a gRPC client for the `reviews` package, targeting reviews-service. Target
 * URL is env-var-driven via REVIEWS_SERVICE_URL (pre-existing .env.example placeholder, added
 * alongside NEWS_SERVICE_URL/WAITLIST_SERVICE_URL in Phase 21 scaffolding).
 *
 * ReviewsController is registered here directly — the monolith's POST /api/v1/reviews and
 * GET /api/v1/reviews endpoints are now served by this gRPC facade. The controller's file
 * stays physically located at backend/src/modules/reviews/reviews.controller.ts (minimal-diff);
 * only its module registration and injected dependency changed.
 *
 * Deliberately does NOT register ReviewsAdminController — that stays in reviews-admin.module.ts
 * from 21-04, calling ReviewsService/Prisma directly in-process (D-07).
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REVIEWS_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'reviews',
            // 4 '../' segments from this file's __dirname (backend/src/modules/reviews-client)
            // reach the repo root — matches news-client.module.ts's / waitlist-client.module.ts's
            // confirmed depth.
            protoPath: join(__dirname, '../../../../packages/proto/reviews.proto'),
            url: config.get<string>('REVIEWS_SERVICE_URL', 'localhost:5011'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsClientService],
  exports: [ReviewsClientService],
})
export class ReviewsClientModule {}
