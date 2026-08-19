import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementService } from '../../common/services/settlement.service';
import { ImageService } from '../../common/services/image.service';
import { S3Service } from '../../common/services/s3.service';
import { UpdateSplitTierDto } from './dto/update-split-tier.dto';
import { CreateSplitTierDto } from './dto/create-split-tier.dto';

// Orders sit in PENDING from creation until the Flutterwave webhook fires
// (marketplace.service.ts handleOrderPayment) and settle() fans the charge
// out to vendor/ministry/platform wallets. Only PROCESSING/SHIPPED/DELIVERED
// represent money that was actually collected — PENDING is an abandoned or
// in-flight checkout (never charged) and CANCELLED/REFUNDED never resulted
// in retained revenue. Counting PENDING rows here would report un-collected
// cart totals as "revenue".
const PAID_ORDER_STATUSES = ['PROCESSING', 'SHIPPED', 'DELIVERED'] as const;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private settlementService: SettlementService,
    private imageService: ImageService,
    private s3: S3Service,
  ) {}

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
      ministryWallet,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, updatedAt: { gte: todayStart } } }),
      this.prisma.event.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      this.prisma.vendor.count({ where: { deletedAt: null, status: 'PENDING' } }),
      this.prisma.event.count({ where: { deletedAt: null, status: 'PENDING_APPROVAL' } }),
      this.settlementService.resolveMinistryWallet(),
    ]);

    const [govtRevenueResult, walletGtvRows] = await Promise.all([
      // "Government Revenue" = actual govt levy collected, i.e. SUCCESS credits
      // to the standing Ministry wallet across EVERY settled module (marketplace,
      // stays, tour, studio, events, transport, delivery) — mirrors
      // MinistryService.getRevenueToGovernment()'s ledger-based computation.
      // Previously this summed Order.totalAmount (gross marketplace order value,
      // not levy, and ignoring 6 of 7 revenue-generating modules, and including
      // unpaid PENDING orders) — a mislabeled and badly incomplete number.
      ministryWallet
        ? this.prisma.transaction.aggregate({
            where: { walletId: ministryWallet.id, type: 'CREDIT', status: 'SUCCESS', deletedAt: null },
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: null as number | null } }),
      // Wallet GTV: sum of settlement-driven CREDIT transactions (vendor + ministry
      // + platform shares) across all modules, EXCLUDING wallet top-ups
      // (metadata.module = 'wallet'). A top-up funds a wallet; it isn't itself a
      // transacted value. Including both the top-up credit AND the later
      // settlement credit generated when that same balance is spent double-counts
      // the same money — this was silently inflating "Total transaction volume".
      this.prisma.$queryRaw<{ total: number | null }[]>`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE type = 'CREDIT' AND status = 'SUCCESS' AND "deletedAt" IS NULL
          AND (metadata->>'module' IS DISTINCT FROM 'wallet')
      `,
    ]);

    return {
      total_users: totalUsers,
      dau,
      total_revenue: Number(govtRevenueResult._sum.amount ?? 0),
      active_events: activeEvents,
      pending_approvals: pendingVendors + pendingEvents,
      wallet_gtv: Number(walletGtvRows[0]?.total ?? 0),
    };
  }

  // ── Revenue ────────────────────────────────────────────────────────────────

  async getRevenue() {
    // Only PROCESSING/SHIPPED/DELIVERED orders were actually charged (webhook-
    // confirmed via handleOrderPayment). PENDING orders carry a pre-computed
    // govtLevy projection set at checkout time but were never paid; CANCELLED/
    // REFUNDED orders never resulted in retained levy. The previous `status !=
    // 'CANCELLED'` filter let unpaid PENDING carts inflate every figure below.
    const [govtLevyResult, byLga, byVendorStatus, byMonth] = await Promise.all([
      // Total govt levy collected
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { in: [...PAID_ORDER_STATUSES] } },
        _sum: { govtLevy: true },
      }),

      // Breakdown by LGA
      this.prisma.$queryRaw<{ lgaId: string; lgaName: string; total: number }[]>`
        SELECT l.id AS "lgaId", l.name AS "lgaName", COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        JOIN vendors v ON o."vendorId" = v.id
        JOIN lgas l ON v."lgaId" = l.id
        WHERE o."deletedAt" IS NULL AND o.status IN ('PROCESSING', 'SHIPPED', 'DELIVERED')
        GROUP BY l.id, l.name
        ORDER BY total DESC
      `,

      // Breakdown by vendor status (PENDING | ACTIVE | SUSPENDED)
      this.prisma.$queryRaw<{ status: string; total: number }[]>`
        SELECT v.status, COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        JOIN vendors v ON o."vendorId" = v.id
        WHERE o."deletedAt" IS NULL AND o.status IN ('PROCESSING', 'SHIPPED', 'DELIVERED')
        GROUP BY v.status
        ORDER BY total DESC
      `,

      // Monthly breakdown (last 12 months)
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT TO_CHAR(o."createdAt", 'YYYY-MM') AS month,
               COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        WHERE o."deletedAt" IS NULL
          AND o.status IN ('PROCESSING', 'SHIPPED', 'DELIVERED')
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

  async updateVendorStatus(id: string, status: string) {
    const updated = await this.prisma.vendor.update({ where: { id }, data: { status: status as any } });

    // Approval is the actual gate on vendor capabilities (e.g. POST /products
    // requires the VENDOR role) — grant it here, mirroring UsersService.becomeHost.
    // Without this, an approved vendor's own role never changes and they remain
    // unable to create products despite this admin action accepting them.
    if (status === 'ACTIVE') {
      const user = await this.prisma.user.findUnique({
        where: { id: updated.userId },
        select: { registeredRoles: true },
      });
      if (user) {
        await this.prisma.user.update({
          where: { id: updated.userId },
          data: {
            registeredRoles: user.registeredRoles.includes('VENDOR' as any)
              ? user.registeredRoles
              : { set: [...user.registeredRoles, 'VENDOR' as any] },
            role: 'VENDOR' as any,
          },
        });
      }
    }

    return updated;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  async updateEventStatus(id: string, status: 'APPROVED' | 'PUBLISHED' | 'CANCELLED') {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.event.update({ where: { id }, data: { status } });
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

  // ── Attractions ────────────────────────────────────────────────────────────

  async uploadAttractionImage(id: string, file: Express.Multer.File) {
    const attraction = await this.prisma.attraction.findFirst({ where: { id, deletedAt: null } });
    if (!attraction) throw new NotFoundException('Attraction not found');

    this.imageService.validateImage(file);
    const { buffer: resized, contentType } = await this.imageService.resizeEventCover(file.buffer);
    const key = `attractions/${id}/${uuidv4()}.webp`;
    const url = await this.s3.upload(key, resized, contentType);

    await this.prisma.attraction.update({
      where: { id },
      data: { imageUrls: { push: url } },
    });

    return { url };
  }

  // ── Settlement Split Tiers ──────────────────────────────────────────────────

  listSplitTiers(module?: string) {
    return this.prisma.settlementSplitTier.findMany({
      where: module ? { module } : undefined,
      orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async createSplitTier(dto: CreateSplitTierDto) {
    const tierName = dto.tierName ?? 'default';
    const existing = await this.prisma.settlementSplitTier.findFirst({
      where: { module: dto.module, tierName, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(
        `An active split tier already exists for module="${dto.module}" tierName="${tierName}" — use PATCH settlement-splits/:id to update it instead`,
      );
    }

    if (dto.earnerPct + dto.ministryPct + (dto.platformPct ?? 0) > 1) {
      throw new BadRequestException('Settlement split percentages must not exceed 1.0 in total');
    }

    return this.prisma.settlementSplitTier.create({
      data: {
        module: dto.module,
        tierName,
        earnerPct: dto.earnerPct,
        ministryPct: dto.ministryPct,
        platformPct: dto.platformPct ?? null,
        isActive: true,
        effectiveFrom: new Date(),
      },
    });
  }

  async updateSplitTier(id: string, dto: UpdateSplitTierDto) {
    const prior = await this.prisma.settlementSplitTier.findUnique({ where: { id } });
    if (!prior) {
      throw new NotFoundException('Settlement split tier not found');
    }

    const finalEarnerPct = dto.earnerPct ?? Number(prior.earnerPct);
    const finalMinistryPct = dto.ministryPct ?? Number(prior.ministryPct);
    const finalPlatformPct =
      dto.platformPct !== undefined
        ? dto.platformPct
        : prior.platformPct !== null
          ? Number(prior.platformPct)
          : null;

    if (finalEarnerPct + finalMinistryPct + (finalPlatformPct ?? 0) > 1) {
      throw new BadRequestException('Settlement split percentages must not exceed 1.0 in total');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.settlementSplitTier.update({ where: { id: prior.id }, data: { isActive: false } });
      return tx.settlementSplitTier.create({
        data: {
          module: prior.module,
          tierName: prior.tierName,
          earnerPct: finalEarnerPct,
          ministryPct: finalMinistryPct,
          platformPct: finalPlatformPct,
          isActive: true,
          effectiveFrom: new Date(),
        },
      });
    });
  }
}
