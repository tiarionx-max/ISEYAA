import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import { notifications } from '@iseyaa/proto';

@Controller()
export class NotificationsGrpcController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @GrpcMethod('NotificationsService', 'SendPush')
  async sendPush(data: notifications.SendPushRequest): Promise<notifications.SendPushResponse> {
    const result = await this.notificationsService.sendPush(data.userId, data.title, data.body, data.data);
    return { success: result.sent };
  }

  @GrpcMethod('NotificationsService', 'RegisterToken')
  async registerToken(data: notifications.RegisterTokenRequest): Promise<notifications.RegisterTokenResponse> {
    await this.notificationsService.registerToken(data.userId, data.fcmToken);
    return { success: true };
  }
}
