import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportGateway } from './transport.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsClientModule } from '../notifications-client/notifications-client.module';

@Module({
  imports: [
    WalletModule,
    AuthModule, // AuthModule re-exports JwtModule (provides JwtService for TransportGateway)
    NotificationsClientModule,
  ],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService],
})
export class TransportModule {}
