import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';
import { S3Service } from '../../common/services/s3.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { ImageService } from '../../common/services/image.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateReviewDto } from './dto/create-review.dto';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@Injectable()
export class StaysService implements OnModuleInit {
  private readonly logger = new Logger(StaysService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private s3: S3Service,
    private sendgrid: SendgridService,
    private imageService: ImageService,
    private kafka: KafkaService,
  ) {}

  async onModuleInit() {
    await this.kafka.consume(
      'payment.stay_booking',
      'stays-service-prod',
      (msg) => this.handleStayPayment(msg as { reference: string }),
    );
  }

  async createProperty(hostId: string, dto: CreatePropertyDto) {
    const slug = `${slugify(dto.name)}-${uuidv4().slice(0, 8)}`;
    return this.prisma.property.create({
      data: {
        hostId,
        lgaId: dto.lgaId,
        name: dto.name,
        slug,
        description: dto.description,
        type: dto.type as any,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        pricePerNight: dto.pricePerNight,
        maxGuests: dto.maxGuests,
        amenities: dto.amenities ?? [],
      },
      include: { lga: { select: { name: true, slug: true } } },
    });
  }

  async findAllProperties(filters: {
    lgaId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const { lgaId, type, page = 1, limit = 20 } = filters;
    return this.prisma.property.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(lgaId && { lgaId }),
        ...(type && { type: type as any }),
      },
      include: { lga: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findPropertyById(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: { lga: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async updateProperty(id: string, hostId: string, dto: UpdatePropertyDto) {
    const property = await this.prisma.property.findFirst({ where: { id, deletedAt: null } });
    if (!property) throw new NotFoundException('Property not found');
    if (property.hostId !== hostId) throw new ForbiddenException('Not your property');

    return this.prisma.property.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type && { type: dto.type as any }),
        ...(dto.address && { address: dto.address }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.pricePerNight !== undefined && { pricePerNight: dto.pricePerNight }),
        ...(dto.maxGuests !== undefined && { maxGuests: dto.maxGuests }),
        ...(dto.amenities && { amenities: dto.amenities }),
      },
    });
  }

  async uploadPropertyImage(id: string, hostId: string, file: Express.Multer.File) {
    const property = await this.prisma.property.findFirst({ where: { id, deletedAt: null } });
    if (!property) throw new NotFoundException('Property not found');
    if (property.hostId !== hostId) throw new ForbiddenException('Not your property');

    this.imageService.validateEventImage(file);
    const { buffer: resized, contentType } = await this.imageService.resizeEventCover(file.buffer);
    const key = `properties/${id}/${uuidv4()}.webp`;
    const url = await this.s3.upload(key, resized, contentType);

    await this.prisma.property.update({
      where: { id },
      data: { imageUrls: { push: url } },
    });

    return { url };
  }

  async getAvailability(propertyId: string) {
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    return this.prisma.booking.findMany({
      where: {
        propertyId,
        deletedAt: null,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] as any },
        checkIn: { lt: in90Days },
        checkOut: { gt: now },
      },
      select: { checkIn: true, checkOut: true },
      orderBy: { checkIn: 'asc' },
    });
  }

  async findMyBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId, deletedAt: null },
      include: { property: { include: { lga: { select: { name: true, slug: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBooking(userId: string, propertyId: string, dto: CreateBookingDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null, isActive: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkIn >= checkOut) throw new BadRequestException('checkOut must be after checkIn');
    if (checkIn < new Date()) throw new BadRequestException('checkIn must be in the future');
    if (dto.guests > property.maxGuests) {
      throw new BadRequestException(`Maximum ${property.maxGuests} guests allowed`);
    }

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (86400 * 1000));
    const totalPrice = Number(property.pricePerNight) * nights;
    const paystackRef = `ISY-STY-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const booking = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE prevents concurrent double-bookings
      const conflicts = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id FROM bookings
          WHERE "propertyId" = ${propertyId}
            AND "deletedAt" IS NULL
            AND status::text IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
            AND "checkIn" < ${checkOut}
            AND "checkOut" > ${checkIn}
          FOR UPDATE
        `,
      );

      if (conflicts.length > 0) {
        throw new ConflictException('Property is not available for these dates');
      }

      return tx.booking.create({
        data: {
          propertyId,
          userId,
          checkIn,
          checkOut,
          guests: dto.guests,
          totalPrice,
          paystackRef,
          status: 'PENDING',
          metadata: { propertyName: property.name, nights },
        },
      });
    });

    let payment;
    try {
      payment = await this.paystack.initiatePayment({
        email: dto.email,
        amountKobo: totalPrice * 100,
        reference: paystackRef,
        metadata: {
          type: 'stay_booking',
          bookingId: booking.id,
          propertyId,
          userId,
          nights,
        },
      });
    } catch (err) {
      // Paystack failed (missing key, network, etc.) — roll back the booking
      // so the property isn't held hostage by an orphaned PENDING row.
      await this.prisma.booking.delete({ where: { id: booking.id } }).catch(() => {});
      this.logger.error(`Paystack init failed for stay booking ${booking.id}, rolled back`, err);
      throw new ServiceUnavailableException('Payment gateway is currently unavailable. Please try again shortly.');
    }

    return { booking, payment };
  }

  async handleStayPayment(payload: { reference: string }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { paystackRef: payload.reference },
        include: {
          property: { select: { name: true, hostId: true } },
          user: { select: { email: true, firstName: true } },
        },
      });

      if (!booking || booking.status !== 'PENDING') return;

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED' },
      });

      const total = Number(booking.totalPrice);

      if (booking.user.email) {
        await this.sendgrid.sendBookingConfirmation({
          to: booking.user.email,
          firstName: booking.user.firstName,
          propertyName: booking.property.name,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          guests: booking.guests,
          totalPrice: total,
          role: 'guest',
        });
      }

      if (booking.property.hostId) {
        const host = await this.prisma.user.findUnique({
          where: { id: booking.property.hostId },
          select: { email: true, firstName: true },
        });
        if (host?.email) {
          await this.sendgrid.sendBookingConfirmation({
            to: host.email,
            firstName: host.firstName,
            propertyName: booking.property.name,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            guests: booking.guests,
            totalPrice: total,
            role: 'host',
          });
        }
      }
    } catch (err) {
      this.logger.error(`handleStayPayment failed for ref ${payload.reference}`, err.message);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async releaseEscrow(): Promise<void> {
    // Escrow releases 24 h after checkOut — not checkIn — to give host time to report issues
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dueBookings = await this.prisma.booking.findMany({
      where: {
        checkOut: { lt: cutoff },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as any },
        escrowReleasedAt: null,
        deletedAt: null,
      },
      include: { property: { select: { hostId: true } } },
      take: 100,
    });

    for (const booking of dueBookings) {
      try {
        const hostUserId = booking.property.hostId;
        if (!hostUserId) continue;

        const hostWallet = await this.prisma.wallet.findUnique({ where: { userId: hostUserId } });
        if (!hostWallet) continue;

        const amount = Number(booking.totalPrice);
        const balanceBefore = Number(hostWallet.balance);
        const balanceAfter = balanceBefore + amount;
        const reference = `ISY-ESC-${booking.id.slice(0, 8).toUpperCase()}`;

        await this.prisma.$transaction([
          this.prisma.wallet.update({
            where: { id: hostWallet.id },
            data: { balance: balanceAfter },
          }),
          this.prisma.transaction.create({
            data: {
              walletId: hostWallet.id,
              type: 'CREDIT',
              status: 'SUCCESS',
              amount,
              currency: 'NGN',
              reference,
              gateway: 'INTERNAL',
              description: `Escrow release — booking ${booking.id}`,
              balanceBefore,
              balanceAfter,
            },
          }),
          this.prisma.booking.update({
            where: { id: booking.id },
            data: { escrowReleasedAt: new Date() },
          }),
        ]);

        this.logger.log(`Escrow ₦${amount} released for booking ${booking.id}`);
      } catch (err) {
        this.logger.error(`Escrow release failed — booking ${booking.id}`, err.message);
      }
    }
  }

  async createReview(bookingId: string, userId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new ForbiddenException('Not your booking');
    if (booking.reviewedAt) throw new ConflictException('Already reviewed');
    if (booking.status === 'PENDING' || booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      throw new BadRequestException('Booking must be confirmed or completed before reviewing');
    }

    const cutoff = new Date(booking.checkOut).getTime() + 24 * 60 * 60 * 1000;
    if (Date.now() < cutoff) {
      throw new BadRequestException('Reviews can only be submitted 24 h after checkout');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        reviewRating: dto.rating,
        reviewComment: dto.comment,
        reviewedAt: new Date(),
      },
    });
  }
}
