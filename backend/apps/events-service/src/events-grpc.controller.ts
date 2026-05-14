import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import {
  GetEventRequest,
  GetEventResponse,
  TicketAvailabilityRequest,
  TicketAvailabilityResponse,
  ReserveTicketRequest,
  ReserveTicketResponse,
} from '@iseyaa/proto';

@Controller()
export class EventsGrpcController {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('EventsService', 'GetEvent')
  async getEvent(data: GetEventRequest): Promise<GetEventResponse> {
    const event = await this.prisma.event.findUnique({
      where: { id: data.eventId },
      select: { id: true, title: true, status: true, ticketTypes: { select: { quantity: true, sold: true } } },
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
  async checkTicketAvailability(data: TicketAvailabilityRequest): Promise<TicketAvailabilityResponse> {
    const ticketType = await this.prisma.ticketType.findUnique({
      where: { id: data.ticketTypeId },
      select: { quantity: true, sold: true },
    });
    if (!ticketType) return { available: false, remaining: 0 };
    const remaining = (ticketType.quantity ?? 0) - (ticketType.sold ?? 0);
    return { available: remaining >= data.quantity, remaining };
  }

  @GrpcMethod('EventsService', 'ReserveTicket')
  async reserveTicket(data: ReserveTicketRequest): Promise<ReserveTicketResponse> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { userId: data.userId, ticketTypeId: data.ticketTypeId, status: 'PENDING' },
    });
    if (ticket) return { success: true, ticketId: ticket.id };
    return { success: false, ticketId: '' };
  }
}
