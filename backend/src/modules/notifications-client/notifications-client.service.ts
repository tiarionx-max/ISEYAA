import { Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { notifications } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.constants';

// 20-03 (D-01/D-10): canary kill-switch PlatformConfig key. Unlike SETTLE-09's opt-IN
// cutover flags (checked via `=== true`), this is an opt-OUT safety brake on an
// already-live feature — absence or any value other than `false` means enabled.
const CANARY_FLAG_KEY = 'grpc.notifications_service.canary_enabled';

// D-06: matches FlutterwaveService's exact wording convention verbatim.
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
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<notifications.NotificationsServiceClient>('NotificationsService');
  }

  // D-01/D-10: absence, `true`, or any value other than `false` all resolve to enabled —
  // only an explicit stored `false` disables. Opposite polarity from SETTLE-09's `=== true`
  // opt-in pattern, deliberately: this is a kill switch on an already-live feature.
  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  }

  // D-03: reads directly against the shared Postgres — no proto RPC exists for this (a
  // plain read doesn't need cross-process routing), matching the same reasoning for
  // markRead/markAllRead below.
  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async registerToken(userId: string, token: string) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('registerToken: notifications-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
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
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('sendPush: notifications-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
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
