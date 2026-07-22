import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleAuth, JWT } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private fcmProjectId: string | null = null;
  private fcmAuthClient: JWT | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private resilience: ResilienceService,
  ) {
    this.initFcm();
  }

  private initFcm() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON', '');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
      return;
    }
    try {
      const json: ServiceAccountJson = JSON.parse(raw);
      this.fcmProjectId = json.project_id;
      this.fcmAuthClient = new GoogleAuth({
        credentials: { client_email: json.client_email, private_key: json.private_key },
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      }).fromJSON({
        type: 'service_account',
        client_email: json.client_email,
        private_key: json.private_key,
      } as any) as JWT;
      this.logger.log(`FCM v1 initialised for project ${json.project_id}`);
    } catch (err: any) {
      this.logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', err.message);
    }
  }

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async registerToken(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const metadata = { ...(user?.metadata as Record<string, any> | undefined), fcmToken: token };
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata },
    });
    return { registered: true };
  }

  async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
    // Persist regardless of push-delivery outcome — the in-app notification list is a
    // record of what happened, not a proxy for whether the FCM push itself was delivered.
    await this.prisma.notification.create({ data: { userId, title, body, data } }).catch((err) => {
      this.logger.error(`Failed to persist notification for user ${userId}: ${err?.message ?? err}`);
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const meta = user?.metadata as any;
    const token = meta?.fcmToken;

    if (!token) {
      this.logger.warn(`No FCM token for user ${userId}`);
      return { sent: false, reason: 'no_token' as const };
    }

    if (!this.fcmAuthClient || !this.fcmProjectId) {
      this.logger.warn('FCM not configured — skipping push');
      return { sent: false, reason: 'not_configured' as const };
    }

    try {
      const accessTokenResponse = await this.fcmAuthClient.getAccessToken();
      const accessToken = accessTokenResponse?.token;
      if (!accessToken) {
        this.logger.error('Failed to obtain FCM access token');
        return { sent: false, reason: 'auth_failed' as const };
      }

      // FCM HTTP v1 payload — data values MUST be strings
      const stringData: Record<string, string> | undefined = data
        ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
        : undefined;

      await this.resilience.execute('fcm', ({ signal }) =>
        axios.post(
          `https://fcm.googleapis.com/v1/projects/${this.fcmProjectId}/messages:send`,
          {
            message: {
              token,
              notification: { title, body },
              ...(stringData && { data: stringData }),
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            signal,
          },
        ),
      );
      return { sent: true };
    } catch (err: any) {
      const detail = err?.response?.data ?? err.message;
      this.logger.error('FCM v1 send failed', JSON.stringify(detail));
      return { sent: false, reason: 'send_failed' as const };
    }
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
}
