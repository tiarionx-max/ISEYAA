import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import {
  SendPushRequest,
  SendPushResponse,
  RegisterTokenRequest,
  RegisterTokenResponse,
} from '@iseyaa/proto';

@Controller()
export class NotificationsGrpcController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @GrpcMethod('NotificationsService', 'SendPush')
  async sendPush(data: SendPushRequest): Promise<SendPushResponse> {
    await this.notificationsService.sendPush(data.userId, data.title, data.body);
    return { success: true };
  }

  @GrpcMethod('NotificationsService', 'RegisterToken')
  async registerToken(data: RegisterTokenRequest): Promise<RegisterTokenResponse> {
    await this.notificationsService.registerToken(data.userId, data.fcmToken);
    return { success: true };
  }
}
