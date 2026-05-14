import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-token')
  @ApiOperation({ summary: 'Register FCM device token for push notifications' })
  registerToken(@Req() req: any, @Body('token') token: string) {
    return this.notificationsService.registerToken(req.user.userId, token);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send push notification (admin)' })
  send(@Body() body: { userId: string; title: string; message: string; data?: any }) {
    return this.notificationsService.sendPush(body.userId, body.title, body.message, body.data);
  }
}
