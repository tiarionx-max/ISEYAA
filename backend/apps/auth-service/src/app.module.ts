import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { AuthModule } from '../../../src/modules/auth/auth.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { AuthGrpcController } from './auth-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    AuthModule,
    ResilienceModule,
  ],
  controllers: [AuthGrpcController],
})
export class AppModule {}
