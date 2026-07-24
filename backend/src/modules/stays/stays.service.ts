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
import { OnEvent } from '@nestjs/event-emitter';
import { KafkaService } from '../../kafka/kafka.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';
import { S3Service } from '../../common/services/s3.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { ImageService } from '../../common/services/image.service';
import { SettlementService } from '../../common/services/settlement.service';
import { VisitorLogService } from '../../common/services/visitor-log.service';
import { DEFAULT_VISITOR_PURPOSE } from '../../common/constants/visitor-purpose.constants';
import { RedisService } from '../../redis/redis.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';

const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30-day renewal period

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
    private settlementService: SettlementService,
    private visitorLogService: VisitorLogService,
    private redis: RedisService,
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
    types?: string[]; // multiple types for category filtering, e.g. ['LOUNGE','CLUB']
    bookingMode?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { lgaId, type, types, bookingMode, featured, page = 1, limit = 24 } = filters;
    return this.prisma.property.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(lgaId && { lgaId }),
        ...(type && { type: type as any }),
        ...(types && types.length > 0 && { type: { in: types as any } }),
        ...(bookingMode && { bookingMode: bookingMode as any }),
        ...(featured && { isFeatured: true }),
      },
      include: { lga: { select: { name: true, slug: true } } },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
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

    // D-05: resolveSplit() is called strictly at booking-creation time and its result
    // is snapshotted onto Booking.govtLevyPct — NEVER re-resolved inside releaseEscrow(),
    // which would let a mid-escrow-hold split-percentage change retroactively apply to
    // a booking already priced during its (potentially multi-week) escrow hold.
    const { ministryPct } = await this.settlementService.resolveSplit('stays', totalPrice);
    const govtLevyPct = ministryPct;

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
          govtLevyPct,
          paystackRef,
          status: 'PENDING',
          metadata: { propertyName: property.name, nights, ...(dto.purpose && { purpose: dto.purpose }) },
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

  @OnEvent('payment.stay_booking')
  async handleStayPayment(payload: { reference: string }) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { paystackRef: payload.reference },
        include: {
          property: { select: { name: true, hostId: true, lgaId: true } },
          user: { select: { email: true, firstName: true, role: true } },
        },
      });

      if (!booking || booking.status !== 'PENDING') return;

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED' },
      });

      this.visitorLogService
        .record({
          lgaId: booking.property.lgaId,
          purpose: (booking.metadata as any)?.purpose ?? DEFAULT_VISITOR_PURPOSE.STAY,
          sourceType: 'STAY',
          sourceId: booking.id,
          visitedAt: booking.checkIn,
          userRole: booking.user.role as any,
        })
        .catch((err) => this.logger.error(`VisitorLog write failed for booking ${booking.id}`, err.message));

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

  // ── Memberships (recurring monthly billing for MEMBERSHIP-mode properties) ──

  async createMembership(userId: string, propertyId: string, dto: CreateMembershipDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null, isActive: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (property.bookingMode !== 'MEMBERSHIP') {
      throw new BadRequestException('This property does not offer memberships');
    }
    if (!property.membershipMonthlyPrice) {
      throw new BadRequestException('Membership price is not configured for this property');
    }

    const existing = await this.prisma.membership.findFirst({
      where: { propertyId, userId, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] }, deletedAt: null },
    });
    if (existing) throw new ConflictException('You already have a membership for this property');

    const monthlyPriceNgn = Number(property.membershipMonthlyPrice);
    const { ministryPct } = await this.settlementService.resolveSplit('stays', monthlyPriceNgn);
    const paystackRef = `ISY-MEM-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const membership = await this.prisma.membership.create({
      data: {
        propertyId,
        userId,
        monthlyPriceNgn,
        govtLevyPct: ministryPct,
        paystackRef,
        paystackEmail: dto.email,
        status: 'PENDING',
        metadata: { propertyName: property.name },
      },
    });

    let payment;
    try {
      payment = await this.paystack.initiatePayment({
        email: dto.email,
        amountKobo: monthlyPriceNgn * 100,
        reference: paystackRef,
        metadata: { type: 'membership_signup', membershipId: membership.id, propertyId, userId },
      });
    } catch (err) {
      await this.prisma.membership.delete({ where: { id: membership.id } }).catch(() => {});
      this.logger.error(`Paystack init failed for membership ${membership.id}, rolled back`, err);
      throw new ServiceUnavailableException('Payment gateway is currently unavailable. Please try again shortly.');
    }

    return { membership, payment };
  }

  @OnEvent('payment.membership_signup')
  async handleMembershipSignup(payload: { reference: string; authorization?: { authorization_code?: string } }) {
    try {
      const membership = await this.prisma.membership.findUnique({
        where: { paystackRef: payload.reference },
        include: { property: { select: { name: true, hostId: true } }, user: { select: { email: true, firstName: true } } },
      });
      if (!membership || membership.status !== 'PENDING') return;

      await this.prisma.membership.update({
        where: { id: membership.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + MEMBERSHIP_PERIOD_MS),
          paystackAuthCode: payload.authorization?.authorization_code ?? null,
        },
      });

      const total = Number(membership.monthlyPriceNgn);
      const govtLevyPct = Number(membership.govtLevyPct);
      const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
      const hostAmountNgn = +(total - govtLevyNgn).toFixed(2);

      if (membership.property.hostId) {
        const hostWallet = await this.prisma.wallet.findUnique({ where: { userId: membership.property.hostId } });
        const ministryWallet = await this.settlementService.resolveMinistryWallet();
        if (hostWallet) {
          await this.settlementService.settle({
            module: 'stays',
            reference: `ISY-MEM-${membership.id.replace(/-/g, '').slice(0, 16).toUpperCase()}-P0`,
            gateway: 'PAYSTACK',
            amountKobo: total * 100,
            recipients: [
              { tag: 'HOST', refSuffix: 'HOST', walletId: hostWallet.id, amountNgn: hostAmountNgn, metadata: { membershipId: membership.id } },
              { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { membershipId: membership.id } },
            ],
            description: 'Membership sign-up — first period',
          });
        }
      }

      this.logger.log(`Membership ${membership.id} activated for property ${membership.property.name}`);
    } catch (err) {
      this.logger.error(`handleMembershipSignup failed for ref ${payload.reference}`, (err as Error).message);
    }
  }

  async findMyMemberships(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, deletedAt: null },
      include: { property: { include: { lga: { select: { name: true, slug: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelMembership(id: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id, deletedAt: null } });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.userId !== userId) throw new ForbiddenException('Not your membership');
    if (membership.status === 'CANCELLED' || membership.status === 'EXPIRED') {
      throw new ConflictException('Membership is already inactive');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async renewMemberships(): Promise<void> {
    const acquired = await this.redis.setNx('cron-lock:renewMemberships', '1', 3300);
    if (!acquired) {
      this.logger.debug('renewMemberships: lock held by another replica — skipping this tick');
      return;
    }

    const dueMemberships = await this.prisma.membership.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        currentPeriodEnd: { lte: new Date() },
        deletedAt: null,
      },
      include: { property: { select: { hostId: true } } },
      take: 100,
    });

    for (const membership of dueMemberships) {
      try {
        if (!membership.paystackAuthCode) {
          // No saved card on file — cannot renew silently; expire it.
          await this.prisma.membership.update({ where: { id: membership.id }, data: { status: 'EXPIRED' } });
          continue;
        }

        const total = Number(membership.monthlyPriceNgn);
        const periodKey = membership.currentPeriodEnd!.toISOString().slice(0, 10).replace(/-/g, '');
        const renewalRef = `ISY-MEM-${membership.id.replace(/-/g, '').slice(0, 12).toUpperCase()}-R${periodKey}`;

        let charge;
        try {
          charge = await this.paystack.chargeAuthorization({
            authorizationCode: membership.paystackAuthCode,
            email: membership.paystackEmail,
            amountKobo: total * 100,
            reference: renewalRef,
            metadata: { type: 'membership_renewal', membershipId: membership.id },
          });
        } catch (err) {
          this.logger.error(`Membership renewal charge failed for ${membership.id}`, (err as Error).message);
          charge = { status: 'failed', reference: renewalRef };
        }

        if (charge.status !== 'success') {
          const nextStatus = membership.status === 'PAST_DUE' ? 'EXPIRED' : 'PAST_DUE';
          await this.prisma.membership.update({ where: { id: membership.id }, data: { status: nextStatus } });
          this.logger.warn(`Membership ${membership.id} renewal failed — now ${nextStatus}`);
          continue;
        }

        const nextPeriodEnd = new Date(membership.currentPeriodEnd!.getTime() + MEMBERSHIP_PERIOD_MS);
        await this.prisma.membership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE', currentPeriodEnd: nextPeriodEnd },
        });

        const govtLevyPct = Number(membership.govtLevyPct);
        const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
        const hostAmountNgn = +(total - govtLevyNgn).toFixed(2);
        const hostUserId = membership.property.hostId;

        if (hostUserId) {
          const hostWallet = await this.prisma.wallet.findUnique({ where: { userId: hostUserId } });
          const ministryWallet = await this.settlementService.resolveMinistryWallet();
          if (hostWallet) {
            await this.settlementService.settle({
              module: 'stays',
              reference: renewalRef,
              gateway: 'PAYSTACK',
              amountKobo: total * 100,
              recipients: [
                { tag: 'HOST', refSuffix: 'HOST', walletId: hostWallet.id, amountNgn: hostAmountNgn, metadata: { membershipId: membership.id } },
                { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { membershipId: membership.id } },
              ],
              description: 'Membership renewal',
            });
          }
        }

        this.logger.log(`Membership ${membership.id} renewed through ${nextPeriodEnd.toISOString()}`);
      } catch (err) {
        this.logger.error(`renewMemberships failed for membership ${membership.id}`, (err as Error).message);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async releaseEscrow(): Promise<void> {
    const acquired = await this.redis.setNx('cron-lock:releaseEscrow', '1', 3300);
    if (!acquired) {
      this.logger.debug('releaseEscrow: lock held by another replica — skipping this tick');
      return;
    }

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

        const total = Number(booking.totalPrice);
        const govtLevyPct = Number(booking.govtLevyPct);
        const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
        const hostAmountNgn = +(total - govtLevyNgn).toFixed(2);
        const ministryWallet = await this.settlementService.resolveMinistryWallet();
        // This reference is the settlement idempotency key (SettlementService.settle()
        // precheck is a startsWith match on it), not just a display label — an 8-char
        // hex slice (32 bits) is collision-prone at platform scale, silently stalling a
        // colliding booking's escrow release forever. Use 16 hex chars (64 bits) instead
        // (WR-05).
        const reference = `ISY-ESC-${booking.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;

        await this.settlementService.settle({
          module: 'stays',
          reference,
          gateway: 'INTERNAL',
          amountKobo: total * 100,
          recipients: [
            { tag: 'HOST', refSuffix: 'HOST', walletId: hostWallet.id, amountNgn: hostAmountNgn, metadata: { bookingId: booking.id } },
            { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { bookingId: booking.id } },
          ],
          description: 'Escrow release',
          onSettled: async (tx) => {
            await tx.booking.update({ where: { id: booking.id }, data: { escrowReleasedAt: new Date() } });
          },
        });

        this.logger.log(`Escrow settlement dispatched for booking ${booking.id} (host: ₦${hostAmountNgn}, govt: ₦${govtLevyNgn})`);
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
