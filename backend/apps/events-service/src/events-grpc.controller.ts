import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { EventsService } from '../../../src/modules/events/events.service';
import { events } from '@iseyaa/proto';

@Controller()
export class EventsGrpcController {
  private readonly logger = new Logger(EventsGrpcController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

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
    // purchaseTicket only supports one ticket per call — enforce and document
    // that limitation here rather than silently mispurchasing. quantity of 0
    // (unset) or 1 both proceed normally.
    if (data.quantity > 1) {
      this.logger.warn(
        `ReserveTicket called with quantity=${data.quantity} for event ${data.eventId} — purchaseTicket only supports one ticket per call`,
      );
      return { success: false, ticketId: '', authorizationUrl: '', accessCode: '', paymentReference: '' };
    }

    try {
      const { ticket, payment } = await this.eventsService.purchaseTicket(data.userId, data.eventId, {
        ticketTypeId: data.ticketTypeId,
        email: data.email,
      });
      return {
        success: true,
        ticketId: ticket.id,
        authorizationUrl: payment.authorizationUrl,
        accessCode: payment.accessCode,
        paymentReference: payment.reference,
      };
    } catch (err: any) {
      this.logger.error(
        `ReserveTicket failed for event ${data.eventId}, user ${data.userId}: ${err.message}`,
      );
      return { success: false, ticketId: '', authorizationUrl: '', accessCode: '', paymentReference: '' };
    }
  }
}
