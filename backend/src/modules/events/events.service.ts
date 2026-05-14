import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';
import { S3Service } from '../../common/services/s3.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { QrService } from '../../common/services/qr.service';
import { ImageService } from '../../common/services/image.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private s3: S3Service,
    private sendgrid: SendgridService,
    private qr: QrService,
    private imageService: ImageService,
    private kafka: KafkaService,
  ) {}

  async onModuleInit() {
    await this.kafka.consume(
      'payment.ticket_purchase',
      'events-service-prod',
      (msg) => this.handleTicketPayment(msg as { reference: string }),
    );
  }

  async create(organizerId: string, dto: CreateEventDto) {
    const slug = `${slugify(dto.title)}-${uuidv4().slice(0, 8)}`;
    return this.prisma.event.create({
      data: {
        organizerId,
        lgaId: dto.lgaId,
        title: dto.title,
        slug,
        description: dto.description,
        venue: dto.venue,
        address: dto.address,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: 'DRAFT',
      },
      include: { lga: { select: { name: true, slug: true } } },
    });
  }

  async findAll(filters: {
    lgaId?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { lgaId, featured, page = 1, limit = 20 } = filters;
    return this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        ...(lgaId && { lgaId }),
        ...(featured && { isFeatured: true }),
      },
      include: {
        lga: { select: { name: true, slug: true } },
        ticketTypes: {
          where: { deletedAt: null },
          select: { id: true, name: true, price: true, quantity: true, sold: true },
        },
      },
      orderBy: { startDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findById(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        lga: true,
        ticketTypes: { where: { deletedAt: null } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(id: string, organizerId: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.venue && { venue: dto.venue }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        ...(dto.lgaId && { lgaId: dto.lgaId }),
      },
    });
  }

  async remove(id: string, organizerId: string) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    await this.prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  async uploadImage(id: string, organizerId: string, file: Express.Multer.File) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    this.imageService.validateEventImage(file);
    const resized = await this.imageService.resizeEventCover(file.buffer);
    const key = `events/${id}/${uuidv4()}.jpg`;
    const url = await this.s3.upload(key, resized, 'image/jpeg');

    await this.prisma.event.update({
      where: { id },
      data: { imageUrls: { push: url } },
    });

    return { url };
  }

  async purchaseTicket(userId: string, eventId: string, dto: PurchaseTicketDto) {
    const ticketType = await this.prisma.ticketType.findFirst({
      where: { id: dto.ticketTypeId, eventId, deletedAt: null },
      include: { event: { select: { status: true, title: true } } },
    });

    if (!ticketType) throw new NotFoundException('Ticket type not found');
    if (ticketType.event.status !== 'PUBLISHED') {
      throw new BadRequestException('Event is not open for ticket sales');
    }
    if (ticketType.sold >= ticketType.quantity) {
      throw new BadRequestException('Tickets sold out');
    }

    const qrCode = `ISY-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const paystackRef = `ISY-TKT-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketTypeId: dto.ticketTypeId,
        userId,
        qrCode,
        paystackRef,
        status: 'PENDING',
        metadata: { eventId, ticketTypeName: ticketType.name },
      },
    });

    const payment = await this.paystack.initiatePayment({
      email: dto.email,
      amountKobo: Number(ticketType.price) * 100,
      reference: paystackRef,
      metadata: {
        type: 'ticket_purchase',
        ticketId: ticket.id,
        ticketTypeId: dto.ticketTypeId,
        eventId,
        userId,
      },
    });

    return { ticket, payment };
  }

  async handleTicketPayment(payload: { reference: string }) {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { paystackRef: payload.reference },
        include: {
          ticketType: {
            include: {
              event: { select: { title: true, startDate: true, venue: true } },
            },
          },
          user: { select: { email: true, firstName: true } },
        },
      });

      if (!ticket || ticket.status !== 'PENDING') return;

      const qrBuffer = await this.qr.generatePng(ticket.qrCode);
      const s3Key = `qr-codes/${ticket.id}.png`;
      const qrImageUrl = await this.s3.upload(s3Key, qrBuffer, 'image/png');

      await this.prisma.$transaction([
        this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: 'ISSUED', qrImageUrl },
        }),
        this.prisma.ticketType.update({
          where: { id: ticket.ticketTypeId },
          data: { sold: { increment: 1 } },
        }),
      ]);

      if (ticket.user.email) {
        await this.sendgrid.sendTicketConfirmation({
          to: ticket.user.email,
          firstName: ticket.user.firstName,
          eventTitle: ticket.ticketType.event.title,
          ticketType: ticket.ticketType.name,
          qrImageUrl,
          qrCode: ticket.qrCode,
          date: ticket.ticketType.event.startDate,
          venue: ticket.ticketType.event.venue,
        });
      }
    } catch (err) {
      this.logger.error(`handleTicketPayment failed for ref ${payload.reference}`, err.message);
    }
  }

  async checkin(qrHash: string, organizerId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrCode: qrHash },
      include: {
        ticketType: {
          include: {
            event: { select: { organizerId: true } },
          },
        },
      },
    });

    if (!ticket) return { result: 'NOT_FOUND' };

    if (ticket.ticketType.event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }

    if (ticket.status === 'USED') {
      return { result: 'ALREADY_USED', usedAt: ticket.usedAt };
    }

    if (ticket.status !== 'ISSUED') {
      return { result: 'NOT_FOUND' };
    }

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'USED', usedAt: new Date() },
    });

    return { result: 'VALID' };
  }

  async getAnalytics(eventId: string, organizerId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        ticketTypes: {
          where: { deletedAt: null },
          include: {
            tickets: {
              where: { status: { in: ['ISSUED', 'USED'] as any } },
            },
          },
        },
      },
    });

    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    const allTickets = event.ticketTypes.flatMap((tt) =>
      tt.tickets.map((t) => ({ ...t, price: Number(tt.price) })),
    );

    const tickets_sold = allTickets.length;
    const revenue = allTickets.reduce((sum, t) => sum + t.price, 0);
    const used = allTickets.filter((t) => t.status === 'USED').length;
    const check_in_rate = tickets_sold > 0 ? used / tickets_sold : 0;

    const hourlyMap: Record<string, number> = {};
    for (const t of allTickets) {
      const hour = new Date(t.createdAt).toISOString().slice(0, 13) + ':00:00Z';
      hourlyMap[hour] = (hourlyMap[hour] ?? 0) + 1;
    }
    const hourly_sales_chart = Object.entries(hourlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));

    return { tickets_sold, revenue, check_in_rate, hourly_sales_chart };
  }
}
