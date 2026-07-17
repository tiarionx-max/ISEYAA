import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { KafkaService } from '../../kafka/kafka.service';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../../common/services/paystack.service';
import { S3Service } from '../../common/services/s3.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { SettlementService } from '../../common/services/settlement.service';
import { CreateStudioBookingDto } from './dto/create-studio-booking.dto';
import { UploadContentDto } from './dto/upload-content.dto';

const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  'audio/mpeg': 'AUDIO',
  'audio/mp3': 'AUDIO',
  'audio/wav': 'AUDIO',
  'audio/aac': 'AUDIO',
  'audio/flac': 'AUDIO',
  'audio/x-flac': 'AUDIO',
  'video/mp4': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'video/x-msvideo': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/x-matroska': 'VIDEO',
};

const MEDIA_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

@Injectable()
export class StudioService implements OnModuleInit {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private s3: S3Service,
    private sendgrid: SendgridService,
    private kafka: KafkaService,
    private settlementService: SettlementService,
  ) {}

  async onModuleInit() {
    await this.kafka.consume(
      'payment.studio_booking',
      'studio-service-prod',
      (msg) => this.handleStudioPayment(msg as { reference: string }),
    );
  }

  // ── Slots ──────────────────────────────────────────────────────────────────

  async findSlots(userRole?: string) {
    const isAdmin = userRole === 'LGA_ADMIN' || userRole === 'SUPER_ADMIN';

    return this.prisma.studioSlot.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(!isAdmin && { isGovernmentPriority: false }),
      },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        pricePerHour: true,
        durationMinutes: true,
        capacity: true,
        isGovernmentPriority: true,
        imageUrls: true,
      },
      orderBy: { pricePerHour: 'asc' },
    });
  }

  // ── Bookings ───────────────────────────────────────────────────────────────

  async createBooking(userId: string, dto: CreateStudioBookingDto) {
    const slot = await this.prisma.studioSlot.findFirst({
      where: { id: dto.slotId, deletedAt: null, isActive: true },
    });
    if (!slot) throw new NotFoundException('Studio slot not found');

    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + dto.durationHours * 60 * 60 * 1000);

    if (startTime < new Date()) throw new BadRequestException('Start time must be in the future');

    const totalPrice = Number(slot.pricePerHour) * dto.durationHours;
    const paystackRef = `ISY-SBO-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const booking = await this.prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE — prevents concurrent double-bookings on the same slot
      const conflicts = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id FROM studio_bookings
          WHERE "studioSlotId" = ${dto.slotId}
            AND "deletedAt" IS NULL
            AND status::text IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
            AND "startTime" < ${endTime}
            AND "endTime" > ${startTime}
          FOR UPDATE
        `,
      );

      if (conflicts.length > 0) {
        throw new ConflictException('Slot is not available for the requested time');
      }

      return tx.studioBooking.create({
        data: {
          studioSlotId: dto.slotId,
          userId,
          startTime,
          endTime,
          totalPrice,
          paystackRef,
          status: 'PENDING',
          metadata: { slotName: slot.name, slotType: slot.type, durationHours: dto.durationHours },
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
          type: 'studio_booking',
          bookingId: booking.id,
          slotId: dto.slotId,
          userId,
        },
      });
    } catch (err) {
      // Paystack failed (missing key, network, etc.) — roll back the booking
      // so the slot isn't held hostage by an orphaned PENDING row.
      await this.prisma.studioBooking.delete({ where: { id: booking.id } }).catch(() => {});
      this.logger.error(`Paystack init failed for studio booking ${booking.id}, rolled back`, err);
      throw new ServiceUnavailableException('Payment gateway is currently unavailable. Please try again shortly.');
    }

    return { booking, payment };
  }

  @OnEvent('payment.studio_booking')
  async handleStudioPayment(payload: { reference: string }) {
    try {
      const booking = await this.prisma.studioBooking.findUnique({
        where: { paystackRef: payload.reference },
        include: {
          studioSlot: { select: { name: true, type: true } },
          user: { select: { email: true, firstName: true } },
        },
      });

      if (!booking || booking.status !== 'PENDING') return;

      // studio.platform_fee_pct / studio.govt_levy_pct — always from PlatformConfig, never
      // hardcoded (fallbacks below only apply if the config key is entirely unset).
      const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'studio.platform_fee_pct' } });
      const platformFeePct = feeCfg ? Number(feeCfg.value) : 0.10;
      const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'studio.govt_levy_pct' } });
      const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05;
      const total = Number(booking.totalPrice);
      const govtLevyNgn = +(total * govtLevyPct).toFixed(2);

      const ministryWallet = await this.settlementService.resolveMinistryWallet();
      const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: booking.userId } });

      const settlementResult = await this.settlementService.settle({
        module: 'studio',
        reference: payload.reference,
        gateway: 'PAYSTACK',
        amountKobo: total * 100,
        recipients: [
          {
            tag: 'MINISTRY',
            refSuffix: 'MINISTRY',
            walletId: ministryWallet?.id ?? null,
            amountNgn: govtLevyNgn,
            metadata: { bookingId: booking.id },
          },
        ],
        buyerWalletId: buyerWallet?.id,
        description: 'Studio booking commission',
        platformMetadata: { bookingId: booking.id, configuredPlatformFeePct: platformFeePct },
        onSettled: async (tx) => {
          await tx.studioBooking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
        },
        onFailure: async (err) => {
          await this.prisma.studioBooking.update({
            where: { id: booking.id },
            data: {
              status: 'CANCELLED',
              metadata: { ...((booking.metadata as any) ?? {}), settlementError: err.message },
            },
          });
        },
      });

      // Only send the confirmation on a genuine first-time settlement — a REPLAYED
      // result means a duplicate webhook delivery already settled this booking, and
      // re-sending here would email the buyer twice (WR-04).
      if (settlementResult.status === 'SETTLED' && booking.user.email) {
        await this.sendgrid.sendStudioBookingConfirmation({
          to: booking.user.email,
          firstName: booking.user.firstName,
          slotName: booking.studioSlot.name,
          slotType: booking.studioSlot.type,
          startTime: booking.startTime,
          endTime: booking.endTime,
          totalPrice: Number(booking.totalPrice),
        });
      }
    } catch (err) {
      this.logger.error(`handleStudioPayment failed for ref ${payload.reference}`, err.message);
    }
  }

  // ── Content ────────────────────────────────────────────────────────────────

  async uploadContent(userId: string, file: Express.Multer.File, dto: UploadContentDto) {
    if (!file) throw new BadRequestException('No file provided');

    const mediaTypeLabel = ALLOWED_MEDIA_TYPES[file.mimetype];
    if (!mediaTypeLabel) {
      throw new BadRequestException(
        'Invalid file type. Allowed: mp3, wav, aac, flac (audio) or mp4, mov, avi, webm (video)',
      );
    }

    if (file.size > MEDIA_MAX_SIZE) {
      throw new BadRequestException('File exceeds 500 MB limit');
    }

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const s3Key = `studio/content/${userId}/${uuidv4()}.${ext}`;
    const url = await this.s3.upload(s3Key, file.buffer, file.mimetype);

    return this.prisma.mediaContent.create({
      data: {
        uploadedById: userId,
        filename: `${uuidv4()}.${ext}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        s3Key,
        type: mediaTypeLabel as any,
        title: dto.title,
        description: dto.description,
        isPublished: false,
      },
    });
  }

  async publishContent(id: string, userId: string) {
    const content = await this.prisma.mediaContent.findFirst({
      where: { id, deletedAt: null },
    });
    if (!content) throw new NotFoundException('Content not found');
    if (content.uploadedById !== userId) {
      throw new BadRequestException('Not your content');
    }

    return this.prisma.mediaContent.update({
      where: { id },
      data: { isPublished: true },
    });
  }

  async getFeed(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.mediaContent.findMany({
        where: { deletedAt: null, isPublished: true },
        include: {
          uploadedBy: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.mediaContent.count({ where: { deletedAt: null, isPublished: true } }),
    ]);

    return {
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }
}
