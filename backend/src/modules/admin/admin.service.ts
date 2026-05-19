import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      dau,
      activeEvents,
      pendingVendors,
      pendingEvents,
      revenueResult,
      walletGtv,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, updatedAt: { gte: todayStart } } }),
      this.prisma.event.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      this.prisma.vendor.count({ where: { deletedAt: null, status: 'PENDING' } }),
      this.prisma.event.count({ where: { deletedAt: null, status: 'PENDING_APPROVAL' } }),
      this.prisma.order.aggregate({
        where: { deletedAt: null },
        _sum: { totalAmount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { deletedAt: null, type: 'CREDIT', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    return {
      total_users: totalUsers,
      dau,
      total_revenue: Number(revenueResult._sum.totalAmount ?? 0),
      active_events: activeEvents,
      pending_approvals: pendingVendors + pendingEvents,
      wallet_gtv: Number(walletGtv._sum.amount ?? 0),
    };
  }

  // ── Revenue ────────────────────────────────────────────────────────────────

  async getRevenue() {
    const [govtLevyResult, byLga, byVendorStatus, byMonth] = await Promise.all([
      // Total govt levy collected
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { not: 'CANCELLED' } },
        _sum: { govtLevy: true },
      }),

      // Breakdown by LGA
      this.prisma.$queryRaw<{ lgaId: string; lgaName: string; total: number }[]>`
        SELECT l.id AS "lgaId", l.name AS "lgaName", COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        JOIN vendors v ON o."vendorId" = v.id
        JOIN lgas l ON v."lgaId" = l.id
        WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
        GROUP BY l.id, l.name
        ORDER BY total DESC
      `,

      // Breakdown by vendor status (PENDING | ACTIVE | SUSPENDED)
      this.prisma.$queryRaw<{ status: string; total: number }[]>`
        SELECT v.status, COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        JOIN vendors v ON o."vendorId" = v.id
        WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
        GROUP BY v.status
        ORDER BY total DESC
      `,

      // Monthly breakdown (last 12 months)
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT TO_CHAR(o."createdAt", 'YYYY-MM') AS month,
               COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        WHERE o."deletedAt" IS NULL
          AND o.status != 'CANCELLED'
          AND o."createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month ASC
      `,
    ]);

    return {
      govt_levy_total: Number(govtLevyResult._sum.govtLevy ?? 0),
      by_lga: byLga.map(r => ({ ...r, total: Number(r.total) })),
      by_vendor_status: byVendorStatus.map(r => ({ ...r, total: Number(r.total) })),
      by_month: byMonth.map(r => ({ ...r, total: Number(r.total) })),
    };
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  listUsers(page: number, limit: number, role?: string) {
    return this.prisma.user.findMany({
      where: { deletedAt: null, ...(role && { role: role as any }) },
      select: {
        id: true, email: true, phone: true,
        firstName: true, lastName: true,
        role: true, status: true, kycStatus: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  updateUserStatus(id: string, status: string) {
    return this.prisma.user.update({ where: { id }, data: { status: status as any } });
  }

  // ── Vendors ────────────────────────────────────────────────────────────────

  listVendors(page: number, limit: number, status?: string) {
    return this.prisma.vendor.findMany({
      where: { deletedAt: null, ...(status && { status: status as any }) },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  updateVendorStatus(id: string, status: string) {
    return this.prisma.vendor.update({ where: { id }, data: { status: status as any } });
  }

  // ── Properties ─────────────────────────────────────────────────────────────

  listProperties(page: number, limit: number) {
    return this.prisma.property.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // ── Studio Slots ───────────────────────────────────────────────────────────

  listStudioSlots() {
    return this.prisma.studioSlot.findMany({
      where: { deletedAt: null },
      orderBy: { pricePerHour: 'asc' },
    });
  }

  updateStudioSlot(id: string, data: { isActive?: boolean; isGovernmentPriority?: boolean; pricePerHour?: number }) {
    return this.prisma.studioSlot.update({ where: { id }, data });
  }

  // ── Platform Config ────────────────────────────────────────────────────────

  getConfig() {
    return this.prisma.platformConfig.findMany({ where: { deletedAt: null } });
  }

  setConfig(key: string, value: any) {
    return this.prisma.platformConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
