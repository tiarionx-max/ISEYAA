import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { WaitlistModule } from '../../../src/modules/waitlist/waitlist.module';
import { WaitlistGrpcController } from './waitlist-grpc.controller';
import { HealthController } from './health.controller';

// 21-03: unlike notifications-service, WaitlistModule/WaitlistService has zero @Cron
// providers — ScheduleModule.forRoot() is deliberately omitted here to avoid registering a
// no-op scheduler in this process (mirrors 21-02's news-service rationale).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    WaitlistModule,
    TerminusModule,
  ],
  controllers: [WaitlistGrpcController, HealthController],
})
export class AppModule {}
