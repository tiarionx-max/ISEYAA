import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { WalletModule } from '../../../src/modules/wallet/wallet.module';
import { WalletGrpcController } from './wallet-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    WalletModule,
  ],
  controllers: [WalletGrpcController],
})
export class AppModule {}
