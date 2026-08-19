import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FlutterwaveService } from '../../common/services/flutterwave.service';
import { ReferenceService } from '../../common/services/reference.service';
import { TourPackageService } from '../tour-packages/tour-packages.service';
import { CreateTourBookingDto } from './dto/create-tour-booking.dto';
import { JoinSplitBillDto } from './dto/join-split-bill.dto';

// ── Helpers (exported for spec) ─────────────────────────────────────────────

/**
 * True if `tourDateIso` falls on a blocked date OR a weekly off day.
 * `availability` shape (from TourGuide.availability JSON):
 *   { blockedDates: string[]  // ISO YYYY-MM-DD
 *     weeklyOffDays: number[] // 0=Sun..6=Sat, evaluated in UTC
 *   }
 */
export function isBlockedDate(availability: any, tourDateIso: string): boolean {
  const blocked = (availability?.blockedDates as string[]) ?? [];
  if (blocked.includes(tourDateIso)) return true;
  const weeklyOff = (availability?.weeklyOffDays as number[]) ?? [];
  const dow = new Date(tourDateIso + 'T00:00:00Z').getUTCDay();
  return weeklyOff.includes(dow);
}

/**
 * Bulk-discount tier math.
 *   1-9   passengers: full price
 *   10-24 passengers: price * (1 - t1)
 *   25-50 passengers: price * (1 - t2)
 * Returns the rounded-to-2-decimal unit price.
 */
export function applyBulkDiscount(
  price: number,
  passengerCount: number,
  t1: number,
  t2: number,
): number {
  if (passengerCount <= 9) return price;
  if (passengerCount <= 24) return Math.round(price * (1 - t1) * 100) / 100;
  return Math.round(price * (1 - t2) * 100) / 100;
}

/**
 * Materialize itinerary template entries with concrete datetimes.
 * Tour day starts at 08:00 UTC; each entry's `hour` is an offset from that base.
 */
export function materializeItinerary(template: any[], tourDateIso: string) {
  const base = new Date(tourDateIso + 'T08:00:00Z');
  return (template ?? []).map((item) => ({
    hour: item.hour,
    title: item.title,
    description: item.description,
    location: item.location,
    datetime: new Date(base.getTime() + item.hour * 3_600_000).toISOString(),
  }));
}

@Injectable()
export class TourBookingService {
  private readonly logger = new Logger(TourBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwave: FlutterwaveService,
    private readonly referenceService: ReferenceService,
    private readonly tourPackages: TourPackageService,
  ) {}

  // ── resolveBulkDiscountTiers ─────────────────────────────────────────────

  private async resolveBulkDiscountTiers(): Promise<{ t1: number; t2: number }> {
    const [t1Row, t2Row] = await Promise.all([
      this.prisma.platformConfig.findUnique({ where: { key: 'tour.bulk_discount_t1' } }),
      this.prisma.platformConfig.findUnique({ where: { key: 'tour.bulk_discount_t2' } }),
    ]);
    let t1 = 0.1;
    let t2 = 0.2;
    if (!t1Row) {
      this.logger.warn('PlatformConfig "tour.bulk_discount_t1" missing — using default 0.10');
    } else {
      t1 = Number(t1Row.value);
    }
    if (!t2Row) {
      this.logger.warn('PlatformConfig "tour.bulk_discount_t2" missing — using default 0.20');
    } else {
      t2 = Number(t2Row.value);
    }
    return { t1, t2 };
  }

  // ── getQuote ─────────────────────────────────────────────────────────────

  /**
   * Real-time price preview for the booking form — mirrors createTourBooking's
   * pricing step exactly (same applyBulkDiscount + PlatformConfig-sourced tiers)
   * so the UI never has to duplicate/hardcode the discount percentages.
   */
  async getQuote(tourPackageId: string, passengerCount: number) {
    const pkg = await this.tourPackages.findByIdInternal(tourPackageId);
    if (!pkg || pkg.status !== 'APPROVED') {
      throw new NotFoundException('Package not available');
    }
    const { t1, t2 } = await this.resolveBulkDiscountTiers();
    const unitPrice = applyBulkDiscount(Number(pkg.price), passengerCount, t1, t2);
    const totalAmount = Math.round(unitPrice * passengerCount * 100) / 100;
    return {
      unitPrice,
      totalAmount,
      passengerCount,
      discountApplied: unitPrice < Number(pkg.price),
    };
  }

  // ── createTourBooking ────────────────────────────────────────────────────

  /**
   * Initiates a TourBooking in PENDING.
   * For solo / group (non-split) bookings, Flutterwave is initialised here and the
   * authorizationUrl is returned. For split-bill bookings, NO Flutterwave init —
   * a deep-link `iseyaa://tour-booking/{id}/join` is returned and each passenger
   * pays their share via POST /tour-bookings/:id/join.
   *
   * THIS METHOD WRITES NO WALLET LEDGER ROWS. Settlement (wallet credits /
   * platform fee split) lives entirely in 09-06's atomic webhook handler.
   */
  async createTourBooking(actorUserId: string, dto: CreateTourBookingDto) {
    // 1. Package resolution + status gate
    const pkg = await this.tourPackages.findByIdInternal(dto.tourPackageId);
    if (!pkg || pkg.status !== 'APPROVED') {
      throw new NotFoundException('Package not available');
    }

    // 2. Guide resolution + APPROVED gate (defence-in-depth)
    if (!pkg.tourGuideId) {
      // AI-seeded DRAFT that was somehow APPROVED without a guide — refuse
      throw new ForbiddenException('Package has no assigned tour guide');
    }
    const guide = await this.prisma.tourGuide.findUnique({
      where: { id: pkg.tourGuideId },
    });
    if (!guide || guide.status !== 'APPROVED') {
      throw new ForbiddenException('Tour guide is not active');
    }

    // 3. Group size guard — corporate sales cut-off
    if (dto.passengerCount > 50) {
      throw new BadRequestException('Contact corporate sales for groups over 50');
    }

    // 4. Package's own maxGroupSize
    if (dto.passengerCount > pkg.maxGroupSize) {
      throw new BadRequestException(
        `Exceeds package max group size of ${pkg.maxGroupSize}`,
      );
    }

    // 5. Date is in the future
    const tourDateOnly = dto.tourDate; // YYYY-MM-DD
    const today = new Date();
    const todayIso =
      today.getUTCFullYear() +
      '-' +
      String(today.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getUTCDate()).padStart(2, '0');
    if (tourDateOnly < todayIso) {
      throw new BadRequestException('Tour date is in the past');
    }

    // 6. Guide availability (blockedDates + weeklyOffDays)
    if (isBlockedDate(guide.availability, tourDateOnly)) {
      throw new BadRequestException('Guide unavailable on selected date');
    }

    // 7. Event-window cross check — every linked event must cover tourDate
    if (pkg.eventIds && pkg.eventIds.length > 0) {
      const events = await this.prisma.event.findMany({
        where: { id: { in: pkg.eventIds }, deletedAt: null },
        select: { id: true, title: true, startDate: true, endDate: true, status: true },
      });
      const tourDateUtc = new Date(tourDateOnly + 'T00:00:00Z');
      for (const ev of events) {
        const start = new Date(ev.startDate);
        const end = new Date(ev.endDate);
        const startUtc = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
        );
        const endUtc = new Date(
          Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
        );
        const inWindow = tourDateUtc >= startUtc && tourDateUtc <= endUtc;
        const okStatus = ev.status === 'APPROVED' || ev.status === 'PUBLISHED';
        if (!inWindow || !okStatus) {
          throw new BadRequestException(
            `Event "${ev.title}" does not run on ${tourDateOnly}`,
          );
        }
      }
    }

    // 8. Resolve bulk discount tiers from PlatformConfig (fallback to defaults)
    const { t1, t2 } = await this.resolveBulkDiscountTiers();

    // 9. Compute pricing
    const unitPrice = applyBulkDiscount(Number(pkg.price), dto.passengerCount, t1, t2);
    const totalAmount = Math.round(unitPrice * dto.passengerCount * 100) / 100;

    // 10. Mint reference
    const reference = this.referenceService.generate('TOUR');

    // 11. Persist Itinerary + TourBooking atomically
    const items = materializeItinerary(pkg.itineraryTemplate as any[], tourDateOnly);
    const [, booking] = await this.prisma.$transaction(async (tx: any) => {
      const itinerary = await tx.itinerary.create({
        data: {
          items: items as any,
        },
      });
      const newBooking = await tx.tourBooking.create({
        data: {
          reference,
          tourPackageId: pkg.id,
          buyerUserId: actorUserId,
          groupLeaderUserId: dto.splitBillEnabled ? actorUserId : null,
          tourDate: new Date(tourDateOnly + 'T00:00:00Z'),
          passengerCount: dto.passengerCount,
          passengers: (dto.passengers ?? null) as any,
          unitPrice,
          totalAmount,
          status: 'PENDING',
          itineraryId: itinerary.id,
          splitBillEnabled: dto.splitBillEnabled ?? false,
          splitBillPaidUserIds: [],
          snapshot: pkg as any,
          metadata: { module: 'tour', ...(dto.purpose && { purpose: dto.purpose }) } as any,
        },
      });
      return [itinerary, newBooking];
    });

    // 12. Branch on splitBillEnabled
    if (dto.splitBillEnabled) {
      // Split-bill — return deep link instead of Flutterwave URL
      const splitBillJoinLink = `iseyaa://tour-booking/${booking.id}/join`;
      return { booking, splitBillJoinLink };
    }

    // Standard path — Flutterwave init for the full totalAmount
    let payment;
    try {
      payment = await this.flutterwave.initiatePayment({
        email: dto.email,
        amountKobo: Math.round(totalAmount * 100),
        reference,
        metadata: {
          type: 'tour_booking',
          bookingId: booking.id,
          module: 'tour',
        },
      });
    } catch (err) {
      // Mirror marketplace.service.ts rollback (line ~236).
      await this.prisma
        .$transaction([
          this.prisma.tourBooking.delete({ where: { id: booking.id } }),
          this.prisma.itinerary.delete({ where: { id: booking.itineraryId! } }),
        ])
        .catch(() => {});
      this.logger.error(
        `Flutterwave init failed for tour booking ${booking.id}, rolled back`,
        (err as Error).message,
      );
      throw new ServiceUnavailableException(
        'Payment gateway is currently unavailable. Please try again shortly.',
      );
    }

    // Record paymentReference (mirrors `reference` for non-split — split-bill children
    // carry their own paymentReferences via metadata.shares).
    await this.prisma.tourBooking.update({
      where: { id: booking.id },
      data: { paymentReference: payment.reference },
    });

    return { booking, payment };
  }

  // ── joinSplitBill ────────────────────────────────────────────────────────

  /**
   * Split-bill participant pays their share.
   * Mints a child reference, initiates Flutterwave for `unitPrice`, and records
   * the share in parent booking's metadata.shares. The actual transition of
   * `splitBillPaidUserIds` happens in 09-06's webhook handler.
   */
  async joinSplitBill(
    bookingId: string,
    actorUserId: string,
    dto: JoinSplitBillDto,
  ) {
    const booking = await this.prisma.tourBooking.findFirst({
      where: { id: bookingId, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!booking.splitBillEnabled) {
      throw new BadRequestException('Booking is not in split-bill mode');
    }
    if (booking.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot join split-bill — booking is ${booking.status}`,
      );
    }
    if (booking.splitBillPaidUserIds.includes(actorUserId)) {
      throw new BadRequestException('You already paid your share');
    }
    if (booking.splitBillPaidUserIds.length >= booking.passengerCount) {
      throw new BadRequestException('Booking already fully paid');
    }

    const childRef = this.referenceService.generate('TOUR');
    const shareAmount = Number(booking.unitPrice);

    let payment;
    try {
      payment = await this.flutterwave.initiatePayment({
        email: dto.email,
        amountKobo: Math.round(shareAmount * 100),
        reference: childRef,
        metadata: {
          type: 'tour_booking',
          bookingId: booking.id,
          shareKey: actorUserId,
          parentReference: booking.reference,
          module: 'tour',
        },
      });
    } catch (err) {
      this.logger.error(
        `Flutterwave init failed for split-bill share ${childRef} (booking ${booking.id})`,
        (err as Error).message,
      );
      throw new ServiceUnavailableException(
        'Payment gateway is currently unavailable. Please try again shortly.',
      );
    }

    // Merge child reference into parent booking's metadata.shares
    const existingMeta: any = booking.metadata ?? {};
    const existingShares: any = existingMeta.shares ?? {};
    await this.prisma.tourBooking.update({
      where: { id: booking.id },
      data: {
        metadata: {
          ...existingMeta,
          shares: {
            ...existingShares,
            [actorUserId]: {
              reference: childRef,
              status: 'PENDING',
              initiatedAt: new Date().toISOString(),
            },
          },
        } as any,
      },
    });

    return { shareReference: childRef, authorizationUrl: payment.authorizationUrl };
  }

  // ── closeSplitBill ───────────────────────────────────────────────────────

  /**
   * Group leader absorbs the unpaid remainder (single Flutterwave init for
   * `remaining * unitPrice`). The actual CONFIRMED transition stays in 09-06.
   *
   * Per plan: this is a SOLID implementation (not a 501 stub) — the deviation
   * from the prompt's "stub" line is justified because the full mechanics
   * fit in <30 lines and reuse joinSplitBill's Flutterwave pattern exactly.
   * No wallet writes happen here.
   */
  async closeSplitBill(bookingId: string, actorUserId: string) {
    const booking = await this.prisma.tourBooking.findFirst({
      where: { id: bookingId, deletedAt: null },
      include: { buyer: { select: { email: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.groupLeaderUserId !== actorUserId) {
      throw new ForbiddenException('Only the group leader can close the booking');
    }
    if (!booking.splitBillEnabled) {
      throw new BadRequestException('Booking is not in split-bill mode');
    }
    if (booking.status === 'CONFIRMED') {
      throw new BadRequestException('Booking is already confirmed');
    }
    if (booking.splitBillPaidUserIds.length >= booking.passengerCount) {
      throw new BadRequestException('Booking already fully paid');
    }

    const remaining = booking.passengerCount - booking.splitBillPaidUserIds.length;
    const absorbAmount = Math.round(remaining * Number(booking.unitPrice) * 100) / 100;
    const childRef = this.referenceService.generate('TOUR');

    let payment;
    try {
      payment = await this.flutterwave.initiatePayment({
        email: (booking as any).buyer?.email ?? 'leader@example.com',
        amountKobo: Math.round(absorbAmount * 100),
        reference: childRef,
        metadata: {
          type: 'tour_booking',
          bookingId: booking.id,
          shareKey: actorUserId,
          parentReference: booking.reference,
          remaining,
          module: 'tour',
        },
      });
    } catch (err) {
      this.logger.error(
        `Flutterwave init failed for close-split-bill ${childRef} (booking ${booking.id})`,
        (err as Error).message,
      );
      throw new ServiceUnavailableException(
        'Payment gateway is currently unavailable. Please try again shortly.',
      );
    }

    return { booking, payment };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * GET /tour-bookings/me — user's bookings (past + upcoming), newest first by tourDate.
   */
  findMine(userId: string) {
    return this.prisma.tourBooking.findMany({
      where: { buyerUserId: userId, deletedAt: null },
      include: {
        itinerary: true,
        tourPackage: {
          select: {
            name: true,
            slug: true,
            coverImageUrl: true,
            durationHours: true,
            lga: { select: { name: true } },
            tourGuide: {
              select: {
                id: true,
                user: { select: { firstName: true, lastName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
      orderBy: { tourDate: 'desc' },
    });
  }

  /**
   * GET /tour-bookings/:id — single booking with itinerary; 403 if not owner.
   */
  async findById(id: string, actorUserId: string) {
    const booking = await this.prisma.tourBooking.findFirst({
      where: { id, deletedAt: null },
      include: {
        itinerary: true,
        tourPackage: {
          select: {
            id: true,
            name: true,
            slug: true,
            coverImageUrl: true,
            attractionIds: true,
            propertyId: true,
            tourGuide: {
              select: {
                id: true,
                user: { select: { firstName: true, lastName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.buyerUserId !== actorUserId) {
      throw new ForbiddenException('Not your booking');
    }

    // Hydrate attraction / property display names for the mobile rating
    // screen's venue-target picker (mirrors TourPackageService.findBySlug()).
    const attractionIds = booking.tourPackage?.attractionIds ?? [];
    const propertyId = booking.tourPackage?.propertyId ?? null;
    const [attractions, property] = await Promise.all([
      attractionIds.length
        ? this.prisma.attraction.findMany({
            where: { id: { in: attractionIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        : [],
      propertyId
        ? this.prisma.property.findUnique({
            where: { id: propertyId },
            select: { id: true, name: true },
          })
        : null,
    ]);

    return {
      ...booking,
      tourPackage: booking.tourPackage
        ? {
            ...booking.tourPackage,
            attractionNames: attractions.map((a) => a.name),
            propertyName: property?.name ?? null,
          }
        : booking.tourPackage,
    };
  }

  // ── Cancel ──────────────────────────────────────────────────────────────

  /**
   * POST /tour-bookings/:id/cancel — owner-only.
   * Transitions status → CANCELLED. Refund logic (if already paid) is 09-06's
   * RefundService — NOT touched here.
   */
  async cancel(id: string, actorUserId: string) {
    const booking = await this.prisma.tourBooking.findFirst({
      where: { id, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.buyerUserId !== actorUserId) {
      throw new ForbiddenException('Not your booking');
    }
    if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      throw new BadRequestException(`Booking is already ${booking.status}`);
    }
    return this.prisma.tourBooking.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
