import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementService } from '../../common/services/settlement.service';

export interface VisitorEntryRow {
  lgaId: string | null;
  lgaName: string | null;
  month: string;
  userRole: string;
  count: number;
}

export interface PurposeBreakdownRow {
  purpose: string;
  month: string;
  count: number;
}

export interface ModuleRevenueRow {
  module: string;
  total: number;
}

export interface MonthRevenueRow {
  month: string;
  total: number;
}

export interface ModuleLgaRevenueRow {
  module: string;
  lgaId: string | null;
  lgaName: string | null;
  total: number;
}

export interface RevenueToGovernment {
  byModule: ModuleRevenueRow[];
  byMonth: MonthRevenueRow[];
  byModuleLga: ModuleLgaRevenueRow[];
}

@Injectable()
export class MinistryService {
  constructor(
    private prisma: PrismaService,
    private settlementService: SettlementService,
  ) {}

  // ── Shared D-02 status-aware filter fragments ────────────────────────────────
  //
  // VisitorLog itself carries no status column (D-07) — status-aware filtering
  // happens via LEFT JOIN back to the two status-bearing source tables. EVENT
  // rows are never excluded by a status join: the VisitorLog write only happens
  // at a real physical QR scan moment (checkin()), so every EVENT row is
  // already "valid" the instant it exists.

  private buildFilters(from?: string, to?: string, lgaId?: string) {
    const fromFilter = from ? Prisma.sql`AND v."visitedAt" >= ${new Date(from)}` : Prisma.empty;
    const toFilter = to
      ? Prisma.sql`AND v."visitedAt" < ${this.toExclusiveEndOfDayBoundary(to)}`
      : Prisma.empty;
    const lgaFilter = lgaId ? Prisma.sql`AND v."lgaId" = ${lgaId}` : Prisma.empty;
    return { fromFilter, toFilter, lgaFilter };
  }

  // CR-01: `to` is a date-only string (e.g. "2026-07-18") that `new Date()`
  // parses to UTC midnight. Comparing with `<=` against that midnight value
  // silently drops nearly the entire `to` date. Instead, compute the
  // exclusive UTC-midnight boundary of the NEXT day and compare with `<`, so
  // every timestamp on the `to` date itself (including 23:59) is included.
  private toExclusiveEndOfDayBoundary(to: string): Date {
    return new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000);
  }

  // ── MIN-02: Visitor entries by LGA + month, secondary split by role ─────────

  async getVisitorEntriesByLgaAndMonth(
    from?: string,
    to?: string,
    lgaId?: string,
  ): Promise<VisitorEntryRow[]> {
    const { fromFilter, toFilter, lgaFilter } = this.buildFilters(from, to, lgaId);

    const rows = await this.prisma.$queryRaw<VisitorEntryRow[]>(
      Prisma.sql`
        SELECT v."lgaId", l.name AS "lgaName", TO_CHAR(v."visitedAt", 'YYYY-MM') AS month,
               v."userRole", COUNT(*)::int AS count
        FROM visitor_logs v
        LEFT JOIN lgas l ON v."lgaId" = l.id
        LEFT JOIN bookings b ON v."sourceType" = 'STAY' AND v."sourceId" = b.id
        LEFT JOIN tour_bookings tb ON v."sourceType" = 'TOUR' AND v."sourceId" = tb.id
        WHERE v."visitedAt" <= NOW()
          AND (v."sourceType" != 'STAY' OR b.status NOT IN ('CANCELLED', 'REFUNDED'))
          AND (v."sourceType" != 'TOUR' OR tb.status NOT IN ('CANCELLED', 'REFUNDED'))
          ${fromFilter}
          ${toFilter}
          ${lgaFilter}
        GROUP BY v."lgaId", l.name, month, v."userRole"
        ORDER BY month ASC, count DESC
      `,
    );

    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  // ── MIN-03: Purpose-of-visit breakdown ───────────────────────────────────────

  async getPurposeBreakdown(
    from?: string,
    to?: string,
    lgaId?: string,
  ): Promise<PurposeBreakdownRow[]> {
    const { fromFilter, toFilter, lgaFilter } = this.buildFilters(from, to, lgaId);

    const rows = await this.prisma.$queryRaw<PurposeBreakdownRow[]>(
      Prisma.sql`
        SELECT v.purpose, TO_CHAR(v."visitedAt", 'YYYY-MM') AS month, COUNT(*)::int AS count
        FROM visitor_logs v
        LEFT JOIN bookings b ON v."sourceType" = 'STAY' AND v."sourceId" = b.id
        LEFT JOIN tour_bookings tb ON v."sourceType" = 'TOUR' AND v."sourceId" = tb.id
        WHERE v."visitedAt" <= NOW()
          AND (v."sourceType" != 'STAY' OR b.status NOT IN ('CANCELLED', 'REFUNDED'))
          AND (v."sourceType" != 'TOUR' OR tb.status NOT IN ('CANCELLED', 'REFUNDED'))
          ${fromFilter}
          ${toFilter}
          ${lgaFilter}
        GROUP BY v.purpose, month
        ORDER BY month ASC, count DESC
      `,
    );

    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  // ── MIN-04: Revenue to government (standing Ministry wallet ledger) ─────────
  //
  // D-10: no phase-14-ship-date floor — from/to, when supplied, bound
  // Transaction.createdAt inclusively; omitted, the query covers all
  // historical Ministry-wallet-credited settlement data.

  async getRevenueToGovernment(from?: string, to?: string): Promise<RevenueToGovernment> {
    const ministryWallet = await this.settlementService.resolveMinistryWallet();
    if (!ministryWallet) {
      // tour.government_wallet_user_id unconfigured — degrade to the empty
      // shape rather than throwing (Pitfall 2 in settlement.service.ts).
      return { byModule: [], byMonth: [], byModuleLga: [] };
    }

    const fromFilter = from ? Prisma.sql`AND t."createdAt" >= ${new Date(from)}` : Prisma.empty;
    const toFilter = to
      ? Prisma.sql`AND t."createdAt" < ${this.toExclusiveEndOfDayBoundary(to)}`
      : Prisma.empty;

    const [byModuleRaw, byMonthRaw, byModuleLgaRaw] = await Promise.all([
      // All 7 confirmed module strings that have ever credited the Ministry
      // wallet — no hardcoded module allowlist here (that restriction only
      // applies to the byModuleLga query below, per D-09).
      this.prisma.$queryRaw<{ module: string; total: number | Prisma.Decimal }[]>(
        Prisma.sql`
          SELECT t.metadata->>'module' AS module, COALESCE(SUM(t.amount), 0) AS total
          FROM transactions t
          WHERE t."walletId" = ${ministryWallet.id}
            AND t.type = 'CREDIT'
            AND t.status = 'SUCCESS'
            ${fromFilter}
            ${toFilter}
          GROUP BY t.metadata->>'module'
          ORDER BY total DESC
        `,
      ),
      this.prisma.$queryRaw<{ month: string; total: number | Prisma.Decimal }[]>(
        Prisma.sql`
          SELECT TO_CHAR(t."createdAt", 'YYYY-MM') AS month, COALESCE(SUM(t.amount), 0) AS total
          FROM transactions t
          WHERE t."walletId" = ${ministryWallet.id}
            AND t.type = 'CREDIT'
            AND t.status = 'SUCCESS'
            ${fromFilter}
            ${toFilter}
          GROUP BY month
          ORDER BY month ASC
        `,
      ),
      // D-09 LGA sub-breakdown — restricted to Stays/Marketplace/Tour, the
      // only 3 modules whose Ministry-credited row carries a direct,
      // reliable LGA join path (Transport/Delivery/Studio/Events excluded,
      // still fully counted above in byModule/byMonth).
      this.prisma.$queryRaw<{ module: string; lgaId: string | null; lgaName: string | null; total: number | Prisma.Decimal }[]>(
        Prisma.sql`
          SELECT t.metadata->>'module' AS module, l.id AS "lgaId", l.name AS "lgaName",
                 COALESCE(SUM(t.amount), 0) AS total
          FROM transactions t
          LEFT JOIN lgas l ON l.id = (
            CASE t.metadata->>'module'
              WHEN 'stays' THEN (
                SELECT p."lgaId" FROM bookings b
                JOIN properties p ON b."propertyId" = p.id
                WHERE b.id = (t.metadata->>'bookingId')::text
              )
              WHEN 'marketplace' THEN (
                SELECT v."lgaId" FROM orders o
                JOIN vendors v ON o."vendorId" = v.id
                WHERE o.id = (t.metadata->>'orderId')::text
              )
              -- Tour's join is structurally different from Stays/Marketplace above:
              -- it goes Transaction.gatewayRef -> TourBooking.paymentReference ->
              -- TourBooking.tourPackageId -> TourPackage.lgaId (NOT metadata.bookingId/
              -- metadata.orderId). SPLIT-BILL CAVEAT: for a split-bill tour booking,
              -- each passenger's share is its own settle() call with its own distinct
              -- gatewayRef, so each share's Ministry-credited row has a DIFFERENT
              -- gatewayRef. Only once ALL shares are paid does paymentReference get
              -- set (to the LAST share's reference) — so this gatewayRef =
              -- paymentReference equi-join recovers only ONE share's row per
              -- split-bill booking, undercounting this LGA sub-breakdown for
              -- split-bill tour bookings relative to the byModule/byMonth totals
              -- (which sum ALL shares correctly, since they don't rely on this
              -- join). Known, accepted limitation — see 14-06-PLAN.md <interfaces>.
              WHEN 'tour_booking' THEN (
                SELECT tp."lgaId" FROM tour_bookings tb
                JOIN tour_packages tp ON tb."tourPackageId" = tp.id
                WHERE tb."paymentReference" = t."gatewayRef"
              )
              ELSE NULL
            END
          )
          WHERE t."walletId" = ${ministryWallet.id}
            AND t.type = 'CREDIT'
            AND t.status = 'SUCCESS'
            AND t.metadata->>'module' IN ('stays', 'marketplace', 'tour_booking')
            ${fromFilter}
            ${toFilter}
          GROUP BY t.metadata->>'module', l.id, l.name
          ORDER BY total DESC
        `,
      ),
    ]);

    return {
      byModule: byModuleRaw.map((row) => ({ module: row.module, total: Number(row.total) })),
      byMonth: byMonthRaw.map((row) => ({ month: row.month, total: Number(row.total) })),
      byModuleLga: byModuleLgaRaw.map((row) => ({
        module: row.module,
        lgaId: row.lgaId,
        lgaName: row.lgaName,
        total: Number(row.total),
      })),
    };
  }
}
