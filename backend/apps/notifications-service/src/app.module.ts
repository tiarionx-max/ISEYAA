import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    CommonModule,
    NotificationsModule,
  ],
  controllers: [NotificationsGrpcController],
})
export class AppModule {}
