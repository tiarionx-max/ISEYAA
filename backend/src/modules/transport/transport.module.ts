import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportGateway } from './transport.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    WalletModule,
    AuthModule, // AuthModule re-exports JwtModule (provides JwtService for TransportGateway)
  ],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService],
})
export class TransportModule {}
