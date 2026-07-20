import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    NotificationsModule,
    TerminusModule,
  ],
  controllers: [NotificationsGrpcController, HealthController],
})
export class AppModule {}
