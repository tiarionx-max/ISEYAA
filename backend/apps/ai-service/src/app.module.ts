import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { AiModule } from '../../../src/modules/ai/ai.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { AiGrpcController } from './ai-grpc.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RedisModule, CommonModule, AiModule, ResilienceModule, TerminusModule],
  controllers: [AiGrpcController, HealthController],
})
export class AppModule {}
