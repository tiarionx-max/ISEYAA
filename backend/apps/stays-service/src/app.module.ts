import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { StaysModule } from '../../../src/modules/stays/stays.module';
import { KafkaModule } from '../../../src/kafka/kafka.module';
import { StaysGrpcController } from './stays-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    ResilienceModule,
    StaysModule,
    KafkaModule,
  ],
  controllers: [StaysGrpcController],
})
export class AppModule {}
