import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { WalletModule } from '../../../src/modules/wallet/wallet.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { WalletGrpcController } from './wallet-grpc.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    WalletModule,
    ResilienceModule,
    TerminusModule,
  ],
  controllers: [WalletGrpcController, HealthController],
})
export class AppModule {}
