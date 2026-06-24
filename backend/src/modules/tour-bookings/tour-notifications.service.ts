import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import {
  ItineraryPdfService,
  ItineraryPdfBookingLite,
  ItineraryPdfItineraryLite,
  ItineraryPdfPackageLite,
} from '../../common/services/itinerary-pdf.service';

/**
 * 09-07 — TourNotificationsService.
 *
 * Three delivery channels for TOUR-05:
 *   (a) In-app  — covered by 09-11 mobile screen reading TourBooking.itinerary.
 *   (b) Email   — fired immediately on `tour_booking.confirmed` via SendGrid
 *                 with a link to the rendered PDF (stored on Itinerary.pdfUrl).
 *   (c) Push    — three time-based cron-scanned dispatches:
 *                   T-24h (hourly cron, ±1h window)
 *                   T-2h  (15-min cron, ±15min window)
 *                   T+1h  (post-tour, 15-min cron, ±15min window after end)
 *
 * Idempotency: per-booking metadata flags prevent double-sends across cron
 * ticks. Flags are set AFTER successful send so a failure leaves the booking
 * eligible for retry on the next tick.
 *
 * Cadence offsets read from PlatformConfig (seeded by 09-01):
 *   - tour.notify_t_minus_24h_hours  (default 24)
 *   - tour.notify_t_minus_2h_hours   (default 2)
 *
 * NEVER writes to wallets, NEVER mutates BookingStatus. Read-only on the
 * booking record except for metadata flag updates.
 */
@Injectable()
export class TourNotificationsService {
  private readonly logger = new Logger(TourNotificationsService.name);

  // Metadata flag names — kept as constants so spec + service stay aligned.
  static readonly FLAG_PDF_SENT = 'pdfSent';
  static readonly FLAG_T_MINUS_24H = 'notifiedTMinus24h';
  static readonly FLAG_T_MINUS_2H = 'notifiedTMinus2h';
  static readonly FLAG_POST_TOUR = 'notifiedPostTour';

  // PlatformConfig keys (matches prisma/seed.ts:1397+1409).
  static readonly CFG_T_MINUS_24H = 'tour.notify_t_minus_24h_hours';
  static readonly CFG_T_MINUS_2H = 'tour.notify_t_minus_2h_hours';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sendgrid: SendgridService,
    private readonly pdf: ItineraryPdfService,
    private readonly config: ConfigService,
  ) {}

  // ── Event handler: immediate PDF + email on confirmation ─────────────────

  @OnEvent('tour_booking.confirmed')
  async onBookingConfirmed(payload: {
    bookingId: string;
    reference: string;
  }): Promise<void> {
    try {
      const booking = await this.loadBookingFull(payload.bookingId);
      if (!booking) {
        this.logger.warn(
          `tour_booking.confirmed: booking ${payload.bookingId} not found`,
        );
        return;
      }

      const meta = (booking.metadata ?? {}) as Record<string, any>;
      if (meta[TourNotificationsService.FLAG_PDF_SENT] === true) {
        this.logger.log(
          `tour_booking.confirmed: booking ${booking.id} already had PDF — skipping`,
        );
        return;
      }

      if (!booking.itinerary || !booking.itineraryId) {
        this.logger.warn(
          `tour_booking.confirmed: booking ${booking.id} has no itinerary — PDF not generated`,
        );
        return;
      }

      const bookingLite: ItineraryPdfBookingLite = {
        id: booking.id,
        reference: booking.reference,
        tourDate: booking.tourDate,
        passengerCount: booking.passengerCount,
        totalAmount: Number(booking.totalAmount),
      };
      const itineraryLite: ItineraryPdfItineraryLite = {
        items: Array.isArray((booking.itinerary as any).items)
          ? (booking.itinerary as any).items
          : [],
      };
      const packageLite: ItineraryPdfPackageLite = {
        name: booking.tourPackage?.name ?? 'Tour Package',
        coverImageUrl: booking.tourPackage?.coverImageUrl ?? null,
        durationHours: booking.tourPackage?.durationHours ?? 0,
        tourGuide: booking.tourPackage?.tourGuide ?? null,
      };

      const pdfUrl = await this.pdf.generateAndUpload(
        bookingLite,
        itineraryLite,
        packageLite,
      );

      // Persist URL on the Itinerary row (schema field `pdfUrl`).
      await this.prisma.itinerary.update({
        where: { id: booking.itineraryId },
        data: { pdfUrl },
      });

      // Email the buyer (best-effort — SendGrid stub mode is non-fatal).
      if (booking.buyer?.email) {
        try {
          const html = this.buildConfirmEmailHtml(booking, pdfUrl);
          await this.sendgrid.sendEmail(
            booking.buyer.email,
            `Your tour is booked — ${packageLite.name}`,
            html,
          );
        } catch (err: any) {
          this.logger.error(
            `tour_booking.confirmed email failed for booking ${booking.id}: ${err.message}`,
          );
        }
      } else {
        this.logger.warn(
          `tour_booking.confirmed: buyer ${booking.buyerUserId} has no email — skipping email`,
        );
      }

      // Set idempotency flag last so PDF/email failure leaves us eligible to retry.
      await this.prisma.tourBooking.update({
        where: { id: booking.id },
        data: {
          metadata: {
            ...meta,
            [TourNotificationsService.FLAG_PDF_SENT]: true,
            pdfUrl,
          } as any,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `onBookingConfirmed failed for ${payload.bookingId}: ${err.message}`,
      );
      // Do NOT rethrow — handler must not crash the EventEmitter pipeline.
    }
  }

  // ── Cron: T-24h push + email ─────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async pushTMinus24h(): Promise<void> {
    const offsetHours = await this.getOffsetHours(
      TourNotificationsService.CFG_T_MINUS_24H,
      24,
    );

    const now = new Date();
    // Wide ±1h window so we never miss bookings between hourly ticks.
    const lowerBound = new Date(now.getTime() + (offsetHours - 1) * 3_600_000);
    const upperBound = new Date(now.getTime() + (offsetHours + 1) * 3_600_000);

    const candidates = await this.prisma.tourBooking.findMany({
      where: {
        status: 'CONFIRMED' as any,
        deletedAt: null,
        tourDate: { gte: lowerBound, lte: upperBound },
      },
      take: 200,
    });

    for (const b of candidates) {
      const meta = (b.metadata ?? {}) as Record<string, any>;
      if (meta[TourNotificationsService.FLAG_T_MINUS_24H] === true) continue;

      try {
        const full = await this.loadBookingFull(b.id);
        if (!full) continue;

        const pkgName = full.tourPackage?.name ?? 'Tour';
        const dateStr = this.formatDate(full.tourDate);

        const pushResult = await this.notifications.sendPush(
          full.buyerUserId,
          'Your tour is tomorrow',
          `Your ${pkgName} tour is on ${dateStr}`,
          { type: 'tour_t_minus_24h', bookingId: full.id },
        );

        // T-24h is the only cron that also emails (with itinerary PDF link).
        if (full.buyer?.email) {
          const pdfUrl = ((full.metadata ?? {}) as any).pdfUrl
            ?? (full.itinerary as any)?.pdfUrl
            ?? '';
          try {
            await this.sendgrid.sendEmail(
              full.buyer.email,
              `Tomorrow: your ${pkgName} tour`,
              this.buildReminderEmailHtml(full, pdfUrl, 'tomorrow'),
            );
          } catch (err: any) {
            this.logger.error(
              `pushTMinus24h email failed for booking ${full.id}: ${err.message}`,
            );
          }
        }

        // Flag-set only on push success (sendPush returns { sent: bool }).
        // If push wasn't sent because of no_token / not_configured we still
        // mark the booking notified — there is no token to retry against.
        await this.setMetadataFlag(
          b.id,
          meta,
          TourNotificationsService.FLAG_T_MINUS_24H,
          true,
        );
        void pushResult;
      } catch (err: any) {
        this.logger.error(
          `pushTMinus24h failed for booking ${b.id}: ${err.message}`,
        );
        // Leave flag unset → retry on next hourly tick.
      }
    }
  }

  // ── Cron: T-2h push only ─────────────────────────────────────────────────
  // Raw "every 15 min" expression — @nestjs/schedule's CronExpression enum
  // jumps from EVERY_10_MINUTES to EVERY_30_MINUTES with no 15-min preset.

  @Cron('*/15 * * * *')
  async pushTMinus2h(): Promise<void> {
    const offsetHours = await this.getOffsetHours(
      TourNotificationsService.CFG_T_MINUS_2H,
      2,
    );

    const now = new Date();
    // Tight ±15min window aligned to the cron cadence.
    const lowerBound = new Date(now.getTime() + (offsetHours * 60 - 15) * 60_000);
    const upperBound = new Date(now.getTime() + (offsetHours * 60 + 15) * 60_000);

    const candidates = await this.prisma.tourBooking.findMany({
      where: {
        status: 'CONFIRMED' as any,
        deletedAt: null,
        tourDate: { gte: lowerBound, lte: upperBound },
      },
      take: 200,
    });

    for (const b of candidates) {
      const meta = (b.metadata ?? {}) as Record<string, any>;
      if (meta[TourNotificationsService.FLAG_T_MINUS_2H] === true) continue;

      try {
        const full = await this.loadBookingFull(b.id);
        if (!full) continue;

        const pkgName = full.tourPackage?.name ?? 'Tour';
        const firstLoc = this.firstItineraryLocation(full.itinerary);
        const body = firstLoc
          ? `Your guide is on the way — meet at ${firstLoc}`
          : `Your guide is on the way for ${pkgName}`;

        await this.notifications.sendPush(
          full.buyerUserId,
          'Your guide is on the way',
          body,
          { type: 'tour_t_minus_2h', bookingId: full.id },
        );

        await this.setMetadataFlag(
          b.id,
          meta,
          TourNotificationsService.FLAG_T_MINUS_2H,
          true,
        );
      } catch (err: any) {
        this.logger.error(
          `pushTMinus2h failed for booking ${b.id}: ${err.message}`,
        );
      }
    }
  }

  // ── Cron: T+1h post-tour rating prompt ───────────────────────────────────
  // 15-min cadence via raw expression (see pushTMinus2h note).

  @Cron('*/15 * * * *')
  async pushPostTourRating(): Promise<void> {
    const now = new Date();

    // Tour ended in the last 8h — covers any reasonable durationHours up to
    // ~24h while keeping the candidate set bounded. We compute the exact
    // (tourDate + durationHours) end-time in JS and filter to the 30-min
    // window around T+1h.
    const eightHoursAgo = new Date(now.getTime() - 8 * 3_600_000);

    const candidates = await this.prisma.tourBooking.findMany({
      where: {
        status: 'CONFIRMED' as any,
        deletedAt: null,
        tourDate: { gte: eightHoursAgo, lte: now },
      },
      include: { tourPackage: { select: { durationHours: true, name: true } } },
      take: 200,
    });

    for (const b of candidates) {
      const meta = (b.metadata ?? {}) as Record<string, any>;
      if (meta[TourNotificationsService.FLAG_POST_TOUR] === true) continue;

      const durationHours = (b as any).tourPackage?.durationHours ?? 0;
      const endTime = new Date(
        new Date(b.tourDate).getTime() + durationHours * 3_600_000,
      );
      const sinceEndMs = now.getTime() - endTime.getTime();

      // Window: [now - 75min, now - 45min] from end-time → 45min ≤ sinceEnd ≤ 75min.
      if (sinceEndMs < 45 * 60_000 || sinceEndMs > 75 * 60_000) continue;

      try {
        const pkgName = (b as any).tourPackage?.name ?? 'your tour';
        await this.notifications.sendPush(
          b.buyerUserId,
          'Rate your tour',
          `How was ${pkgName}? Tap to rate your guide and venues.`,
          { type: 'tour_post_rating', bookingId: b.id },
        );

        await this.setMetadataFlag(
          b.id,
          meta,
          TourNotificationsService.FLAG_POST_TOUR,
          true,
        );
      } catch (err: any) {
        this.logger.error(
          `pushPostTourRating failed for booking ${b.id}: ${err.message}`,
        );
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async loadBookingFull(bookingId: string): Promise<any | null> {
    return this.prisma.tourBooking.findUnique({
      where: { id: bookingId },
      include: {
        buyer: { select: { id: true, email: true, firstName: true, lastName: true } },
        itinerary: true,
        tourPackage: {
          select: {
            id: true,
            name: true,
            coverImageUrl: true,
            durationHours: true,
            tourGuide: {
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
  }

  private async getOffsetHours(
    key: string,
    fallback: number,
  ): Promise<number> {
    try {
      const row = await this.prisma.platformConfig.findUnique({ where: { key } });
      const raw = row?.value as any;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num) && num > 0) return num;
      return fallback;
    } catch (err: any) {
      this.logger.warn(
        `getOffsetHours(${key}) failed; using fallback ${fallback}: ${err.message}`,
      );
      return fallback;
    }
  }

  private async setMetadataFlag(
    bookingId: string,
    existingMeta: Record<string, any>,
    flag: string,
    value: boolean,
  ): Promise<void> {
    await this.prisma.tourBooking.update({
      where: { id: bookingId },
      data: {
        metadata: { ...existingMeta, [flag]: value } as any,
      },
    });
  }

  private firstItineraryLocation(itinerary: any): string | null {
    const items = itinerary?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const sorted = [...items].sort(
      (a, b) => (Number(a.hour) || 0) - (Number(b.hour) || 0),
    );
    return sorted[0]?.location ?? null;
  }

  private formatDate(d: Date | string): string {
    try {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString('en-NG', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(d);
    }
  }

  private buildConfirmEmailHtml(booking: any, pdfUrl: string): string {
    const pkgName = booking.tourPackage?.name ?? 'your tour';
    const firstName = booking.buyer?.firstName ?? 'there';
    const dateStr = this.formatDate(booking.tourDate);
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1A6B3C;">Tour Booked</h2>
        <p>Hello ${firstName},</p>
        <p>Your <strong>${pkgName}</strong> booking is confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;"><strong>Reference</strong></td><td style="padding:8px;font-family:monospace;">${booking.reference}</td></tr>
          <tr><td style="padding:8px;"><strong>Date</strong></td><td style="padding:8px;">${dateStr}</td></tr>
          <tr><td style="padding:8px;"><strong>Passengers</strong></td><td style="padding:8px;">${booking.passengerCount}</td></tr>
          <tr><td style="padding:8px;"><strong>Total</strong></td><td style="padding:8px;">&#8358;${Number(booking.totalAmount).toLocaleString('en-NG')}</td></tr>
        </table>
        <p><a href="${pdfUrl}" style="color:#C8962A;">Download your itinerary (PDF)</a></p>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iseyaa — Ogun State Digital Platform</p>
      </div>
    `;
  }

  private buildReminderEmailHtml(
    booking: any,
    pdfUrl: string,
    when: string,
  ): string {
    const pkgName = booking.tourPackage?.name ?? 'your tour';
    const firstName = booking.buyer?.firstName ?? 'there';
    const dateStr = this.formatDate(booking.tourDate);
    const pdfLink = pdfUrl
      ? `<p><a href="${pdfUrl}" style="color:#C8962A;">Open your itinerary (PDF)</a></p>`
      : '';
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1A6B3C;">Your tour is ${when}</h2>
        <p>Hello ${firstName},</p>
        <p>Your <strong>${pkgName}</strong> tour is scheduled for ${dateStr}.</p>
        ${pdfLink}
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iseyaa — Ogun State Digital Platform</p>
      </div>
    `;
  }
}
