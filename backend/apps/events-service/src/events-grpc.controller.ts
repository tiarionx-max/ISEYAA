import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { events } from '@iseyaa/proto';

@Controller()
export class EventsGrpcController {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('EventsService', 'GetEvent')
  async getEvent(data: events.GetEventRequest): Promise<events.GetEventResponse> {
    const event = await this.prisma.event.findUnique({
      where: { id: data.eventId },
      select: {
        id: true,
        title: true,
        status: true,
        ticketTypes: { where: { deletedAt: null }, select: { quantity: true, sold: true } },
      },
    });
    if (!event) return { id: '', title: '', status: '', availableCapacity: 0 };
    const totalCapacity = event.ticketTypes.reduce((sum, tt) => sum + (tt.quantity ?? 0), 0);
    const totalSold = event.ticketTypes.reduce((sum, tt) => sum + (tt.sold ?? 0), 0);
    return {
      id: event.id,
      title: event.title,
      status: event.status,
      availableCapacity: totalCapacity - totalSold,
    };
  }

  @GrpcMethod('EventsService', 'CheckTicketAvailability')
  async checkTicketAvailability(data: events.TicketAvailabilityRequest): Promise<events.TicketAvailabilityResponse> {
    const ticketType = await this.prisma.ticketType.findFirst({
      where: { id: data.ticketTypeId, deletedAt: null },
      select: { quantity: true, sold: true },
    });
    if (!ticketType) return { available: false, remaining: 0 };
    const remaining = (ticketType.quantity ?? 0) - (ticketType.sold ?? 0);
    return { available: remaining >= data.quantity, remaining };
  }

  @GrpcMethod('EventsService', 'ReserveTicket')
  async reserveTicket(data: events.ReserveTicketRequest): Promise<events.ReserveTicketResponse> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { userId: data.userId, ticketTypeId: data.ticketTypeId, status: 'PENDING' },
    });
    if (ticket) return { success: true, ticketId: ticket.id };
    return { success: false, ticketId: '' };
  }
}
