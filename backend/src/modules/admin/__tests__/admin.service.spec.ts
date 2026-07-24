import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementService } from '../../../common/services/settlement.service';

const mockPrisma = {
  user: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  event: { count: jest.fn() },
  vendor: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  order: { aggregate: jest.fn() },
  transaction: { aggregate: jest.fn() },
  property: { findMany: jest.fn() },
  studioSlot: { findMany: jest.fn(), update: jest.fn() },
  platformConfig: { findMany: jest.fn(), upsert: jest.fn() },
  settlementSplitTier: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

const mockSettlementService = {
  resolveMinistryWallet: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettlementService, useValue: mockSettlementService },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  // ── getDashboard ───────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns all dashboard metrics, sourcing revenue from the Ministry wallet ledger', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(500)   // total_users
        .mockResolvedValueOnce(42);   // dau
      mockPrisma.event.count
        .mockResolvedValueOnce(20)    // active_events
        .mockResolvedValueOnce(3);    // pending events
      mockPrisma.vendor.count.mockResolvedValue(2); // pending vendors
      mockSettlementService.resolveMinistryWallet.mockResolvedValue({ id: 'ministry-wallet-1' });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 2500000 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ total: 1800000 }]);

      const result = await service.getDashboard();

      expect(result.total_users).toBe(500);
      expect(result.dau).toBe(42);
      expect(result.active_events).toBe(20);
      expect(result.pending_approvals).toBe(5); // 2 vendors + 3 events
      expect(result.total_revenue).toBe(2500000);
      expect(result.wallet_gtv).toBe(1800000);
      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ walletId: 'ministry-wallet-1', type: 'CREDIT', status: 'SUCCESS' }),
        }),
      );
    });

    it('degrades to zero revenue when no Ministry wallet is configured, without throwing', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.event.count.mockResolvedValue(0);
      mockPrisma.vendor.count.mockResolvedValue(0);
      mockSettlementService.resolveMinistryWallet.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([{ total: null }]);

      const result = await service.getDashboard();
      expect(result.total_revenue).toBe(0);
      expect(mockPrisma.transaction.aggregate).not.toHaveBeenCalled();
      expect(result.wallet_gtv).toBe(0);
    });
  });

  // ── getRevenue ─────────────────────────────────────────────────────────────

  describe('getRevenue', () => {
    it('returns revenue breakdown with numeric totals', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { govtLevy: 150000 } });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lgaId: 'lga-1', lgaName: 'Abeokuta', total: '80000' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE', total: '40000' }])
        .mockResolvedValueOnce([{ month: '2026-04', total: '150000' }]);

      const result = await service.getRevenue();

      expect(result.govt_levy_total).toBe(150000);
      expect(result.by_lga[0].lgaName).toBe('Abeokuta');
      expect(result.by_lga[0].total).toBe(80000);
      expect(result.by_vendor_status[0].status).toBe('ACTIVE');
      expect(result.by_month[0].month).toBe('2026-04');
      // Unpaid (PENDING) and reversed (CANCELLED/REFUNDED) orders must never
      // count toward collected govt levy — only paid statuses are aggregated.
      expect(mockPrisma.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['PROCESSING', 'SHIPPED', 'DELIVERED'] } }),
        }),
      );
    });
  });

  // ── listUsers ──────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('calls findMany with correct pagination', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.listUsers(2, 25, 'CREATIVE');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'CREATIVE' }),
          skip: 25,
          take: 25,
        }),
      );
    });
  });

  // ── updateUserStatus ───────────────────────────────────────────────────────

  describe('updateUserStatus', () => {
    it('calls user.update with provided status', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      await service.updateUserStatus('user-001', 'SUSPENDED');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SUSPENDED' } }),
      );
    });
  });

  // ── vendor management ──────────────────────────────────────────────────────

  describe('listVendors', () => {
    it('filters by status when provided', async () => {
      mockPrisma.vendor.findMany.mockResolvedValue([]);
      await service.listVendors(1, 20, 'PENDING');
      expect(mockPrisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });
  });

  describe('updateVendorStatus', () => {
    it('updates vendor status', async () => {
      mockPrisma.vendor.update.mockResolvedValue({ userId: 'user-001' });
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN'] });
      await service.updateVendorStatus('vendor-001', 'ACTIVE');
      expect(mockPrisma.vendor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
    });

    it('promotes the vendor user to the VENDOR role on approval', async () => {
      mockPrisma.vendor.update.mockResolvedValue({ userId: 'user-001' });
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN'] });
      await service.updateVendorStatus('vendor-001', 'ACTIVE');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-001' },
        data: { registeredRoles: { set: ['CITIZEN', 'VENDOR'] }, role: 'VENDOR' },
      });
    });

    it('does not touch the user role when rejecting/suspending', async () => {
      mockPrisma.vendor.update.mockResolvedValue({ userId: 'user-001' });
      await service.updateVendorStatus('vendor-001', 'SUSPENDED');
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── studio slots ───────────────────────────────────────────────────────────

  describe('updateStudioSlot', () => {
    it('updates slot fields', async () => {
      mockPrisma.studioSlot.update.mockResolvedValue({});
      await service.updateStudioSlot('slot-001', { isActive: false, isGovernmentPriority: true });
      expect(mockPrisma.studioSlot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false, isGovernmentPriority: true },
        }),
      );
    });
  });

  // ── platform config ────────────────────────────────────────────────────────

  describe('setConfig', () => {
    it('upserts config key', async () => {
      mockPrisma.platformConfig.upsert.mockResolvedValue({});
      await service.setConfig('PLATFORM_FEE_PCT', 0.12);
      expect(mockPrisma.platformConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'PLATFORM_FEE_PCT' },
          create: { key: 'PLATFORM_FEE_PCT', value: 0.12 },
        }),
      );
    });
  });

  // ── settlement split tiers ─────────────────────────────────────────────────

  describe('listSplitTiers', () => {
    it('lists all tiers when no module filter given', async () => {
      mockPrisma.settlementSplitTier.findMany.mockResolvedValue([]);
      await service.listSplitTiers();
      expect(mockPrisma.settlementSplitTier.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
      });
    });

    it('filters by module when provided', async () => {
      mockPrisma.settlementSplitTier.findMany.mockResolvedValue([]);
      await service.listSplitTiers('transport');
      expect(mockPrisma.settlementSplitTier.findMany).toHaveBeenCalledWith({
        where: { module: 'transport' },
        orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
      });
    });
  });

  describe('updateSplitTier', () => {
    const TIER_ID = 'tier-001';

    it('throws NotFoundException when the tier does not exist', async () => {
      mockPrisma.settlementSplitTier.findUnique.mockResolvedValue(null);
      await expect(service.updateSplitTier(TIER_ID, { ministryPct: 0.08 })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.settlementSplitTier.findUnique).toHaveBeenCalledWith({ where: { id: TIER_ID } });
    });

    it('throws BadRequestException when the resulting split exceeds 1.0', async () => {
      mockPrisma.settlementSplitTier.findUnique.mockResolvedValue({
        id: TIER_ID,
        module: 'transport',
        tierName: 'default',
        earnerPct: 0.15,
        ministryPct: 0.05,
        platformPct: 0,
      });
      await expect(service.updateSplitTier(TIER_ID, { ministryPct: 0.9 })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('inserts a new active row and deactivates the prior row inside a transaction', async () => {
      const prior = {
        id: TIER_ID,
        module: 'transport',
        tierName: 'default',
        earnerPct: 0.82,
        ministryPct: 0.05,
        platformPct: 0.1,
      };
      mockPrisma.settlementSplitTier.findUnique.mockResolvedValue(prior);

      const mockTx = {
        settlementSplitTier: {
          update: jest.fn().mockResolvedValue({ ...prior, isActive: false }),
          create: jest.fn().mockResolvedValue({ ...prior, ministryPct: 0.08, isActive: true }),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));

      await service.updateSplitTier(TIER_ID, { ministryPct: 0.08 });

      expect(mockTx.settlementSplitTier.update).toHaveBeenCalledWith({
        where: { id: prior.id },
        data: { isActive: false },
      });
      expect(mockTx.settlementSplitTier.create).toHaveBeenCalledWith({
        data: {
          module: prior.module,
          tierName: prior.tierName,
          earnerPct: prior.earnerPct,
          ministryPct: 0.08,
          platformPct: prior.platformPct,
          isActive: true,
          effectiveFrom: expect.any(Date),
        },
      });

      // Deactivation must run before the new row is created (unique constraint ordering).
      const updateOrder = mockTx.settlementSplitTier.update.mock.invocationCallOrder[0];
      const createOrder = mockTx.settlementSplitTier.create.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(createOrder);
    });
  });
});
