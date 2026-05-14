import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { TicketsController } from './tickets.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, TicketsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
