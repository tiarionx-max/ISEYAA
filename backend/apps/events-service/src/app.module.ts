import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { EventsModule } from '../../../src/modules/events/events.module';
import { KafkaModule } from '../../../src/kafka/kafka.module';
import { EventsGrpcController } from './events-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    ResilienceModule,
    EventsModule,
    KafkaModule,
  ],
  controllers: [EventsGrpcController],
})
export class AppModule {}
