import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../admin.service';
import { PrismaService } from '../../../prisma/prisma.service';

const mockPrisma = {
  user: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  event: { count: jest.fn() },
  vendor: { count: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  order: { aggregate: jest.fn() },
  transaction: { aggregate: jest.fn() },
  property: { findMany: jest.fn() },
  studioSlot: { findMany: jest.fn(), update: jest.fn() },
  platformConfig: { findMany: jest.fn(), upsert: jest.fn() },
  $queryRaw: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  // ── getDashboard ───────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns all dashboard metrics', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(500)   // total_users
        .mockResolvedValueOnce(42);   // dau
      mockPrisma.event.count
        .mockResolvedValueOnce(20)    // active_events
        .mockResolvedValueOnce(3);    // pending events
      mockPrisma.vendor.count.mockResolvedValue(2); // pending vendors
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: 2500000 } });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 1800000 } });

      const result = await service.getDashboard();

      expect(result.total_users).toBe(500);
      expect(result.dau).toBe(42);
      expect(result.active_events).toBe(20);
      expect(result.pending_approvals).toBe(5); // 2 vendors + 3 events
      expect(result.total_revenue).toBe(2500000);
      expect(result.wallet_gtv).toBe(1800000);
    });

    it('handles null sums gracefully', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.event.count.mockResolvedValue(0);
      mockPrisma.vendor.count.mockResolvedValue(0);
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { totalAmount: null } });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await service.getDashboard();
      expect(result.total_revenue).toBe(0);
      expect(result.wallet_gtv).toBe(0);
    });
  });

  // ── getRevenue ─────────────────────────────────────────────────────────────

  describe('getRevenue', () => {
    it('returns revenue breakdown with numeric totals', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { govtLevy: 150000 } });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ lgaId: 'lga-1', lgaName: 'Abeokuta', total: '80000' }])
        .mockResolvedValueOnce([{ category: 'FOOD', total: '40000' }])
        .mockResolvedValueOnce([{ month: '2026-04', total: '150000' }]);

      const result = await service.getRevenue();

      expect(result.govt_levy_total).toBe(150000);
      expect(result.by_lga[0].lgaName).toBe('Abeokuta');
      expect(result.by_lga[0].total).toBe(80000);
      expect(result.by_category[0].category).toBe('FOOD');
      expect(result.by_month[0].month).toBe('2026-04');
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
      mockPrisma.vendor.update.mockResolvedValue({});
      await service.updateVendorStatus('vendor-001', 'ACTIVE');
      expect(mockPrisma.vendor.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE' } }),
      );
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
});
