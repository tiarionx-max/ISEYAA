import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument = require('pdfkit');
import { S3Service } from './s3.service';

/**
 * 09-07 — ItineraryPdfService.
 *
 * Lightweight PDF rendering for tour itineraries using pdfkit (no headless
 * Chrome). Output is uploaded to S3 via the existing `S3Service.upload`
 * primitive; the returned URL is whatever the CDN/S3 backend resolves to
 * (CloudFront or regional S3 host — S3Service decides).
 *
 * ── Why pdfkit and not pdf-lib / puppeteer ──────────────────────────────────
 *   • pdfkit: single dep, ~3MB unpacked, streams to Buffer in-process. No
 *     binary outside the Node tarball. Container size impact negligible.
 *   • puppeteer: bundles a headless Chrome (~150MB), would blow Docker image
 *     size past our free-tier budget. Explicitly forbidden by 09-07-PLAN.
 *   • pdf-lib: heavier API for what is a simple list-style document.
 *
 * Failures during rendering or upload throw `ServiceUnavailableException`;
 * the caller (TourNotificationsService) decides whether to retry on the next
 * cron tick. PDF generation is NOT inside the booking confirmation
 * transaction — a failure here must NEVER block payment settlement.
 */
@Injectable()
export class ItineraryPdfService {
  private readonly logger = new Logger(ItineraryPdfService.name);

  constructor(
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generates a PDF and uploads it. Returns the public URL.
   *
   * Key shape: `itineraries/${booking.id}.pdf`. Single-document-per-booking,
   * regenerated overwrites in place — idempotent on bookingId.
   */
  async generateAndUpload(
    booking: ItineraryPdfBookingLite,
    itinerary: ItineraryPdfItineraryLite,
    packageInfo: ItineraryPdfPackageLite,
  ): Promise<string> {
    try {
      const buffer = await this.renderPdf(booking, itinerary, packageInfo);
      const key = `itineraries/${booking.id}.pdf`;
      const url = await this.s3.upload(key, buffer, 'application/pdf');
      return url;
    } catch (err: any) {
      this.logger.error(
        `ItineraryPdfService.generateAndUpload failed for booking ${booking.id}: ${err.message}`,
      );
      throw new ServiceUnavailableException(
        'Failed to generate itinerary PDF',
      );
    }
  }

  /**
   * Pure PDF generation — exposed for spec testability.
   *
   * Sorts itinerary.items by `hour` ascending. Skips items that lack a hour
   * or title (defensive — itinerary materialisation in 09-05 guarantees the
   * shape, but a bad JSON migration would crash pdfkit otherwise).
   */
  async renderPdf(
    booking: ItineraryPdfBookingLite,
    itinerary: ItineraryPdfItineraryLite,
    packageInfo: ItineraryPdfPackageLite,
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `${packageInfo.name} — Itinerary`,
        Author: 'Iseyaa',
        Subject: `Tour booking ${booking.reference}`,
      },
    });

    const chunks: Buffer[] = [];
    const bufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
    });

    // ── Title block ──────────────────────────────────────────────────────────
    doc.fontSize(24).fillColor('#1A6B3C').text(packageInfo.name, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#1C2B2B').text(`Reference: ${booking.reference}`);

    const dateStr = this.formatDate(booking.tourDate);
    doc.text(`Date: ${dateStr}`);

    const guideName = packageInfo.tourGuide?.user
      ? `${packageInfo.tourGuide.user.firstName ?? ''} ${packageInfo.tourGuide.user.lastName ?? ''}`.trim()
      : 'Unassigned';
    doc.text(`Guide: ${guideName || 'Unassigned'}`);
    doc.text(`Passengers: ${booking.passengerCount}`);
    doc.text(`Duration: ${packageInfo.durationHours}h`);
    doc.text(`Total paid: ₦${Number(booking.totalAmount).toLocaleString('en-NG')}`);

    doc.moveDown(1);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#C8962A')
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.8);

    // ── Itinerary section ────────────────────────────────────────────────────
    doc.fontSize(16).fillColor('#1A6B3C').text('Itinerary', { underline: false });
    doc.moveDown(0.5);

    const items = Array.isArray(itinerary.items) ? itinerary.items : [];
    const sorted = [...items]
      .filter((i) => i && typeof i.title === 'string')
      .sort((a, b) => (Number(a.hour) || 0) - (Number(b.hour) || 0));

    if (sorted.length === 0) {
      doc.fontSize(11).fillColor('#666').text('No itinerary items.');
    } else {
      for (const item of sorted) {
        const hour = Number.isFinite(Number(item.hour)) ? Number(item.hour) : 0;
        doc
          .fontSize(12)
          .fillColor('#1C2B2B')
          .text(`${hour}h — ${item.title}`, { continued: false });
        if (item.description) {
          doc.fontSize(10).fillColor('#444').text(item.description, { indent: 14 });
        }
        if (item.location) {
          doc
            .fontSize(9)
            .fillColor('#1A6B3C')
            .text(`Location: ${item.location}`, { indent: 14 });
        }
        doc.moveDown(0.5);
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor('#888')
      .text('Powered by Iseyaa — Ogun State Digital Platform', { align: 'center' });

    doc.end();
    return bufferPromise;
  }

  private formatDate(d: Date | string): string {
    try {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(d);
    }
  }
}

// ── Lite projections ────────────────────────────────────────────────────────
// Narrow shapes consumed by ItineraryPdfService. Defined here so callers can
// pass any Prisma result that satisfies these fields without leaking the
// generated Prisma types into common/.

export interface ItineraryPdfBookingLite {
  id: string;
  reference: string;
  tourDate: Date | string;
  passengerCount: number;
  totalAmount: number | string;
}

export interface ItineraryPdfItineraryLite {
  items: Array<{
    hour: number;
    title: string;
    description?: string;
    location?: string;
    datetime?: string;
  }>;
}

export interface ItineraryPdfPackageLite {
  name: string;
  coverImageUrl?: string | null;
  durationHours: number;
  tourGuide?: {
    user?: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;
}
