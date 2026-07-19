import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// 17-04 (D-01): NotificationsController moved to NotificationsClientModule's controllers
// array so the monolith's REST endpoints are served by the gRPC facade. This module still
// provides/exports NotificationsService because it is imported independently by
// backend/apps/notifications-service/src/app.module.ts — the extracted process's own
// bootstrap tree, which is untouched by this cutover.
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
