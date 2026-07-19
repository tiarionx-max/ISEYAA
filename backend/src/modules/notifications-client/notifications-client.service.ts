import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { notifications } from '@iseyaa/proto';
import { ResilienceService } from '../../resilience/resilience.service';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.module';

// D-06: matches PaystackService's exact wording convention verbatim.
const UNAVAILABLE_MESSAGE = 'Notifications service is temporarily unavailable, please try again shortly';

/**
 * 17-03 (D-01): Thin gRPC facade over notifications-service, exposing the exact 3-method
 * contract NotificationsService has always had (listForUser/registerToken/sendPush) so
 * both call sites (NotificationsController, TourNotificationsService) can swap their
 * import with a minimal diff in Plan 17-04's cutover wave.
 */
@Injectable()
export class NotificationsClientService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsClientService.name);
  private grpcService!: notifications.NotificationsServiceClient;

  constructor(
    @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<notifications.NotificationsServiceClient>('NotificationsService');
  }

  // D-03: local no-op stub — no proto RPC exists for this, no network call. There is no
  // persistence behind it today in the in-process NotificationsService either
  // (// TODO: persistence not yet wired), so there's nothing to fetch from the extracted
  // service.
  async listForUser(_userId: string): Promise<any[]> {
    return [];
  }

  async registerToken(userId: string, token: string) {
    try {
      await this.resilience.execute('notificationsGrpc', () =>
        // `as any`: @iseyaa/proto and backend resolve structurally-identical but nominally
        // distinct nested copies of `rxjs` (lockfile artifact — root pins 7.8.2, backend's
        // nested node_modules pins 7.8.1, both satisfying every package.json's declared
        // `^7.8.1`). `firstValueFrom`'s `Subscriber` type check treats the two copies'
        // protected members as incompatible even though they're runtime-identical
        // Observables. `npm dedupe` cannot resolve this without touching an unrelated
        // pre-existing typescript/@nestjs/schematics peer conflict — out of this task's
        // scope. Erasing the type at this one boundary is safe: no behavior depends on it.
        firstValueFrom(this.grpcService.registerToken({ userId, fcmToken: token }) as any),
      );
      return { registered: true };
    } catch (err: any) {
      // T-17-03-01: log only err?.message — never the full gRPC error object, request
      // payload, or user PII, matching resilience.service.ts's summarizeVendorError() discipline.
      this.logger.error(`Notifications gRPC registerToken failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }

  async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const res = await this.resilience.execute<notifications.SendPushResponse>('notificationsGrpc', () =>
        // See `as any` rationale on registerToken above — same dual-rxjs-copy artifact.
        firstValueFrom(this.grpcService.sendPush({ userId, title, body, data: data ?? {} }) as any),
      );
      return { sent: res.success };
    } catch (err: any) {
      this.logger.error(`Notifications gRPC sendPush failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
