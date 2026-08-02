import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { AuthModule } from '../../../src/modules/auth/auth.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { AuthGrpcController } from './auth-grpc.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    AuthModule,
    ResilienceModule,
    TerminusModule,
  ],
  controllers: [AuthGrpcController, HealthController],
})
export class AppModule {}
