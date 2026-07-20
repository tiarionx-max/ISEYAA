import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { DeliveryService } from '../../../src/modules/delivery/delivery.service';
import { DeliveryGateway } from '../../../src/modules/delivery/delivery.gateway';
import { WalletService } from '../../../src/modules/wallet/wallet.service';
import { S3Service } from '../../../src/common/services/s3.service';
import { SettlementService } from '../../../src/common/services/settlement.service';
import { PaystackService } from '../../../src/common/services/paystack.service';
import { RefundService } from '../../../src/common/services/refund.service';
import { ReferenceService } from '../../../src/common/services/reference.service';
import { DeliveryOtpGrpcController } from './delivery-otp-grpc.controller';
import { HealthController } from './health.controller';

// 21-06: unlike news-service (zero @Cron providers, ScheduleModule.forRoot() omitted),
// DeliveryService IS a direct provider here and DeliveryService.cleanStaleRiderHeartbeats
// (delivery.service.ts:829) is @Cron(CronExpression.EVERY_30_SECONDS)-decorated.
// ScheduleModule.forRoot() is REQUIRED in THIS app's own module tree or the @Cron
// decorator is inert metadata and never fires here. Double-firing across the monolith
// + this process is already safe: cleanStaleRiderHeartbeats is guarded by
// redis.setNx('cron-lock:cleanStaleRiderHeartbeats', '1', 25) (GRPC-06b, Phase 20) —
// verified via direct read of delivery.service.ts:829-832.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    TerminusModule,
  ],
  // Deliberately NOT importing DeliveryModule, AuthModule, WalletModule, or CommonModule:
  //
  // - DeliveryModule's own `providers: [DeliveryService, DeliveryGateway]` cannot be
  //   wholesale-imported: DeliveryGateway is a real @WebSocketGateway() Socket.IO server
  //   that Nest's gateway discovery binds to whatever HTTP server exists in THIS process
  //   the moment it is instantiated as a provider. DeliveryGateway is not exported from
  //   DeliveryModule, so there is no way to import the module while excluding the
  //   gateway — instantiating it here would open a second, live, JWT-accepting WebSocket
  //   endpoint, directly violating Roadmap Phase 21 Success Criteria #2 ("DeliveryGateway
  //   stays in-process/monolith-only"). Below, the DeliveryGateway injection token is
  //   overridden with a no-op stub instead.
  // - AuthModule is not imported: it was only needed by the real DeliveryGateway for
  //   JwtService, and the real gateway is never constructed in this process.
  // - WalletModule declares `controllers: [WalletController]` and CommonModule declares
  //   `controllers: [SettlementController, UploadController]` — all @UseGuards(JwtAuthGuard)
  //   protected. Since AuthModule/JwtStrategy is never registered here, importing either
  //   module would mount a permanently-broken, unauthenticatable route surface onto this
  //   process's HTTP listener, including wallet-mutating endpoints (/wallet/topup,
  //   /wallet/transfer) — contradicting D-03's "OTP verification only" scope.
  //
  // Instead, DeliveryService's entire transitive dependency chain is provided directly
  // as bare classes below (NOT via any module import):
  //   DeliveryService -> WalletService, S3Service, SettlementService
  //   WalletService -> PaystackService (also required transitively by RefundService,
  //     declared once here and shared by both)
  //   SettlementService -> RefundService -> ReferenceService (terminal leaf, no deps)
  // This resolves the full provider graph with zero controllers riding along.
  providers: [
    DeliveryService,
    WalletService,
    S3Service,
    SettlementService,
    PaystackService,
    RefundService,
    ReferenceService,
    // DeliveryGateway token override — satisfies DeliveryService's
    // @Inject(forwardRef(() => DeliveryGateway)) constructor parameter without ever
    // constructing the real @WebSocketGateway()-decorated class (see comment above).
    // The only RPC this process exposes, VerifyDeliveryOtp, never calls this.gateway.*;
    // the no-op server.to().emit() shape is a defensive fallback only.
    {
      provide: DeliveryGateway,
      useValue: { server: { to: () => ({ emit: () => {} }) } } as unknown as DeliveryGateway,
    },
  ],
  // The ONLY two controllers ever registered in this module, by construction — no
  // WalletModule/CommonModule/AuthModule/DeliveryModule import contributes any others.
  controllers: [DeliveryOtpGrpcController, HealthController],
})
export class AppModule {}
