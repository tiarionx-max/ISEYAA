import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryGateway } from './delivery.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { DeliveryOtpClientModule } from '../delivery-otp-client/delivery-otp-client.module';

@Module({
  imports: [
    WalletModule,
    AuthModule, // AuthModule re-exports JwtModule (provides JwtService for DeliveryGateway)
    DeliveryOtpClientModule, // 21-07: provides DeliveryOtpClientService for DeliveryController's verifyOtp handler only
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryGateway],
  exports: [DeliveryService],
})
export class DeliveryModule {}
