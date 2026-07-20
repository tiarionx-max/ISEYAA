import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { NewsModule } from '../../../src/modules/news/news.module';
import { NewsGrpcController } from './news-grpc.controller';
import { HealthController } from './health.controller';

// 21-02: unlike notifications-service, NewsModule/NewsService has zero @Cron providers —
// ScheduleModule.forRoot() is deliberately omitted here to avoid registering a no-op
// scheduler in this process (see 21-06 for the Delivery variant, which does need it).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    NewsModule,
    TerminusModule,
  ],
  controllers: [NewsGrpcController, HealthController],
})
export class AppModule {}
