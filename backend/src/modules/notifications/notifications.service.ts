import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async registerToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { fcmToken: token } as any },
    });
    return { registered: true };
  }

  async sendPush(userId: string, title: string, body: string, data?: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const meta = user?.metadata as any;
    const token = meta?.fcmToken;

    if (!token) {
      this.logger.warn(`No FCM token for user ${userId}`);
      return { sent: false, reason: 'no_token' };
    }

    try {
      await axios.post(
        'https://fcm.googleapis.com/fcm/send',
        { to: token, notification: { title, body }, data },
        { headers: { Authorization: `key=${this.config.get('FIREBASE_SERVER_KEY')}` } },
      );
      return { sent: true };
    } catch (err) {
      this.logger.error('FCM send failed', err);
      return { sent: false };
    }
  }
}
