import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { DeliveryOtpClientService } from './delivery-otp-client.service';
import { DELIVERY_OTP_PACKAGE } from './delivery-otp-client.constants';

/**
 * 21-07: Registers a gRPC client for the `delivery` package, targeting
 * delivery-otp-service. The gRPC target URL is env-var-driven via
 * DELIVERY_OTP_SERVICE_URL (already declared in .env.example, Phase 20 scaffold).
 *
 * Unlike every other `*-client.module.ts` in this phase, this module does NOT register
 * DeliveryController — the partial/hybrid swap (D-07 in the plan's context) keeps
 * DeliveryController exactly where it is in delivery.module.ts, injecting
 * DeliveryOtpClientService as a SECOND service alongside the unchanged DeliveryService.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: DELIVERY_OTP_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'delivery',
            // 4 '../' segments from this file's __dirname (backend/src/modules/delivery-otp-client)
            // reach the repo root — matches notifications-client.module.ts's confirmed-correct depth.
            protoPath: join(__dirname, '../../../../packages/proto/delivery.proto'),
            url: config.get<string>('DELIVERY_OTP_SERVICE_URL', 'localhost:5012'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [],
  providers: [DeliveryOtpClientService],
  exports: [DeliveryOtpClientService],
})
export class DeliveryOtpClientModule {}
