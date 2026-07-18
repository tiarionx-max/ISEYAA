import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class MinistryService {
  constructor(private prisma: PrismaService) {}

  // ── Shared D-02 status-aware filter fragments ────────────────────────────────
  //
  // VisitorLog itself carries no status column (D-07) — status-aware filtering
  // happens via LEFT JOIN back to the two status-bearing source tables. EVENT
  // rows are never excluded by a status join: the VisitorLog write only happens
  // at a real physical QR scan moment (checkin()), so every EVENT row is
  // already "valid" the instant it exists.

  private buildFilters(from?: string, to?: string, lgaId?: string) {
    const fromFilter = from ? Prisma.sql`AND v."visitedAt" >= ${new Date(from)}` : Prisma.empty;
    const toFilter = to ? Prisma.sql`AND v."visitedAt" <= ${new Date(to)}` : Prisma.empty;
    const lgaFilter = lgaId ? Prisma.sql`AND v."lgaId" = ${lgaId}` : Prisma.empty;
    return { fromFilter, toFilter, lgaFilter };
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
}
