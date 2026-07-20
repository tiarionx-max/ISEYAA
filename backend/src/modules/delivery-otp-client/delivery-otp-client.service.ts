import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { delivery } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { DELIVERY_OTP_PACKAGE } from './delivery-otp-client.constants';

// D-01/D-10-style canary kill-switch PlatformConfig key (same opt-OUT polarity as
// notifications-client.service.ts's CANARY_FLAG_KEY): absence or any value other than
// `false` means enabled — only an explicit stored `false` disables.
const CANARY_FLAG_KEY = 'grpc.delivery_otp_service.canary_enabled';

// Matches PaystackService's / NotificationsClientService's exact wording convention.
const UNAVAILABLE_MESSAGE = 'Delivery OTP service is temporarily unavailable, please try again shortly';

/**
 * 21-07: Thin gRPC facade over delivery-otp-service's single VerifyDeliveryOtp RPC.
 * Builds the client-side half of Plan 21-06's business-vs-transport exception mapping —
 * a wrong/expired/locked OTP (server RpcException code INVALID_ARGUMENT/NOT_FOUND) must
 * surface here as the original BadRequestException/NotFoundException message text, never
 * downgraded to the generic ServiceUnavailableException used for genuine transport
 * failures (T-21-07-02).
 */
@Injectable()
export class DeliveryOtpClientService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryOtpClientService.name);
  private grpcService!: delivery.DeliveryServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DELIVERY_OTP_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<delivery.DeliveryServiceClient>('DeliveryService');
  }

  // Same opt-OUT polarity as NotificationsClientService.isCanaryEnabled(): absence, `true`,
  // or any value other than `false` all resolve to enabled.
  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  }

  async verifyOtp(orderId: string, otp: string): Promise<{ verified: boolean }> {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('verifyOtp: delivery-otp-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      const res = await this.resilience.execute<delivery.VerifyDeliveryOtpResponse>('deliveryOtpGrpc', () =>
        // `as any`: same dual-rxjs-copy type-erasure rationale documented verbatim in
        // notifications-client.service.ts — @iseyaa/proto and backend resolve
        // structurally-identical but nominally distinct nested `rxjs` copies.
        firstValueFrom(this.grpcService.verifyDeliveryOtp({ orderId, otp }) as any),
      );
      return { verified: res.success };
    } catch (err: any) {
      // T-21-07-03: strict `===` against numeric GrpcStatus enum values — a malformed/
      // codeless error (`undefined === 3` / `undefined === 5`) always falls through to the
      // safe ServiceUnavailableException default below, never a mis-mapped 400/404.
      if (err?.code === GrpcStatus.INVALID_ARGUMENT) {
        throw new BadRequestException(err.message);
      }
      if (err?.code === GrpcStatus.NOT_FOUND) {
        throw new NotFoundException(err.message);
      }
      // T-21-07-02: log only err?.message — never the full gRPC error object — for the
      // transport-failure branch. The business-rule branches above intentionally forward
      // err.message to the caller since it's driver-facing, non-sensitive product content.
      this.logger.error(`Delivery OTP gRPC verifyOtp failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
