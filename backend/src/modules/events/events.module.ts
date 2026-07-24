import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { TicketsController } from './tickets.controller';
import { EventsService } from './events.service';
import { NotificationsClientModule } from '../notifications-client/notifications-client.module';

@Module({
  imports: [NotificationsClientModule],
  controllers: [EventsController, TicketsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
