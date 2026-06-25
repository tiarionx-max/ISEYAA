import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// ── Types ────────────────────────────────────────────────────────────────────

interface RevenueBreakdownParams {
  packageId: string;
  from: Date;
  to: Date;
}

interface VendorBreakdownEntry {
  vendorType: string;
  vendorId: string;
  vendorName?: string;
  totalCreditedNgn: number;
  transactionCount: number;
}

interface RevenueBreakdownResult {
  totalAmountNgn: number;
  packageName: string;
  vendorBreakdown: VendorBreakdownEntry[];
  platformCommissionNgn: number;
  bookingCount: number;
}

interface UtilizationMatrixParams {
  from: Date;
  to: Date;
}

interface UtilizationBucket {
  date: string;
  groupSizeBucket: string;
  bookingCount: number;
  totalPassengers: number;
}

interface UtilizationMatrixResult {
  buckets: UtilizationBucket[];
}

// ── Raw query row type ───────────────────────────────────────────────────────

interface RawUtilizationRow {
  date: Date;
  bucket: string;
  booking_count: bigint;
  total_passengers: bigint;
}

/**
 * 09-10 — TourAdminService.
 *
 * Provides two read-only analytics methods for the admin UI:
 *
 *   1. getRevenueBreakdown  — per-vendor credit totals + platform commission
 *      for a given tour package within a date window.
 *
 *   2. getUtilizationMatrix — heatmap data: confirmed bookings bucketed by
 *      group size per calendar day, within a date window.
 *
 * Neither method mutates any data.
 */
@Injectable()
export class TourAdminService {
  private readonly logger = new Logger(TourAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Revenue breakdown ───────────────────────────────────────────────────────

  /**
   * Returns a vendor-level revenue breakdown for a specific tour package
   * over the supplied date range.
   *
   * Algorithm:
   *   1. Load CONFIRMED bookings for the package within [from, to].
   *   2. Load CREDIT transactions whose metadata.module === 'tour' AND
   *      metadata.bookingId IN those booking IDs.
   *   3. Group by (metadata.vendorType, metadata.vendorId) in JS.
   *   4. Platform commission = sum of amounts whose reference ends with '-PLAT'.
   */
  async getRevenueBreakdown(
    params: RevenueBreakdownParams,
  ): Promise<RevenueBreakdownResult> {
    const { packageId, from, to } = params;

    // 1. Find the package name
    const tourPackage = await this.prisma.tourPackage.findFirst({
      where: { id: packageId, deletedAt: null },
      select: { name: true },
    });

    const packageName = tourPackage?.name ?? packageId;

    // 2. Find confirmed bookings in window
    const bookings = await this.prisma.tourBooking.findMany({
      where: {
        tourPackageId: packageId,
        status: 'CONFIRMED',
        createdAt: { gte: from, lte: to },
        deletedAt: null,
      },
      select: { id: true },
    });

    const bookingCount = bookings.length;

    if (bookingCount === 0) {
      return {
        totalAmountNgn: 0,
        packageName,
        vendorBreakdown: [],
        platformCommissionNgn: 0,
        bookingCount: 0,
      };
    }

    const bookingIds = bookings.map((b) => b.id);

    // 3. Find CREDIT transactions for those bookings where module==='tour'
    const transactions = await this.prisma.transaction.findMany({
      where: {
        type: 'CREDIT',
        deletedAt: null,
        // Prisma JSON path filter: metadata.module = 'tour'
        metadata: {
          path: ['module'],
          equals: 'tour',
        },
      },
      select: {
        id: true,
        amount: true,
        reference: true,
        metadata: true,
      },
    });

    // Filter to those whose metadata.bookingId is in our set
    const bookingIdSet = new Set(bookingIds);
    const relevant = transactions.filter((tx) => {
      const meta = tx.metadata as Record<string, unknown> | null;
      return meta && bookingIdSet.has(meta['bookingId'] as string);
    });

    // 4. Group by vendorType + vendorId
    const vendorMap = new Map<string, VendorBreakdownEntry>();
    let platformCommissionNgn = 0;
    let totalAmountNgn = 0;

    for (const tx of relevant) {
      const amount = Number(tx.amount);
      totalAmountNgn += amount;

      if (tx.reference.endsWith('-PLAT')) {
        platformCommissionNgn += amount;
        continue;
      }

      const meta = tx.metadata as Record<string, unknown> | null;
      const vendorType = (meta?.['vendorType'] as string) ?? 'UNKNOWN';
      const vendorId = (meta?.['vendorId'] as string) ?? 'UNKNOWN';
      const vendorName = meta?.['vendorName'] as string | undefined;
      const key = `${vendorType}:${vendorId}`;

      const existing = vendorMap.get(key);
      if (existing) {
        existing.totalCreditedNgn += amount;
        existing.transactionCount += 1;
      } else {
        vendorMap.set(key, {
          vendorType,
          vendorId,
          vendorName,
          totalCreditedNgn: amount,
          transactionCount: 1,
        });
      }
    }

    return {
      totalAmountNgn,
      packageName,
      vendorBreakdown: Array.from(vendorMap.values()),
      platformCommissionNgn,
      bookingCount,
    };
  }

  // ── Utilization matrix ──────────────────────────────────────────────────────

  /**
   * Returns a heatmap-ready utilization matrix: how many confirmed bookings
   * (and total passengers) fell into each group-size bucket, per day.
   *
   * Uses parameterized $queryRaw to avoid N+1 and for efficient DB-side
   * date_trunc + GROUP BY.
   *
   * Bucket legend:
   *   1-2, 3-5, 6-9, 10-24, 25-50
   */
  async getUtilizationMatrix(
    params: UtilizationMatrixParams,
  ): Promise<UtilizationMatrixResult> {
    const { from, to } = params;

    const rows = await this.prisma.$queryRaw<RawUtilizationRow[]>(
      Prisma.sql`
        SELECT
          date_trunc('day', tour_date) as date,
          CASE
            WHEN passenger_count <= 2 THEN '1-2'
            WHEN passenger_count <= 5 THEN '3-5'
            WHEN passenger_count <= 9 THEN '6-9'
            WHEN passenger_count <= 24 THEN '10-24'
            ELSE '25-50'
          END as bucket,
          COUNT(*) as booking_count,
          SUM(passenger_count) as total_passengers
        FROM tour_bookings
        WHERE status = 'CONFIRMED'
          AND deleted_at IS NULL
          AND tour_date BETWEEN ${from} AND ${to}
        GROUP BY 1, 2
        ORDER BY 1, 2
      `,
    );

    const buckets: UtilizationBucket[] = rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      groupSizeBucket: row.bucket,
      bookingCount: Number(row.booking_count),
      totalPassengers: Number(row.total_passengers),
    }));

    return { buckets };
  }
}
