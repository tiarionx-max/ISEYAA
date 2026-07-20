import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { ReviewsModule } from '../../../src/modules/reviews/reviews.module';
import { ReviewsGrpcController } from './reviews-grpc.controller';
import { HealthController } from './health.controller';

// 21-04: unlike news-service/waitlist-service, ReviewsService has an
// @OnEvent('review.created') listener (debounced aggregate-rating recompute) that moves
// with the wholesale-imported ReviewsModule below — EventEmitterModule.forRoot() is
// REQUIRED here (not optional) so that emit has a listener inside THIS process. This is a
// one-off addition specific to Reviews; the notifications-service template omits it because
// NotificationsService has no @OnEvent handlers.
//
// ScheduleModule.forRoot() is deliberately omitted — ReviewsModule has zero @Cron providers
// (mirrors 21-02/21-03's rationale).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    ReviewsModule,
    TerminusModule,
  ],
  controllers: [ReviewsGrpcController, HealthController],
})
export class AppModule {}
