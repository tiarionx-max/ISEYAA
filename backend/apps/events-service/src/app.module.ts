import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { EventsGrpcController } from './events-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    ResilienceModule,
  ],
  controllers: [EventsGrpcController],
})
export class AppModule {}
