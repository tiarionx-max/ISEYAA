import { Test, TestingModule } from '@nestjs/testing';
import { MinistryService } from '../ministry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementService } from '../../../common/services/settlement.service';

/**
 * 14-03/14-06 — MinistryService spec.
 *
 * Covers: (a) bigint/Decimal-shaped `count`/`total` aggregates are coerced
 * to JS `number` before returning, (b) the generated SQL template includes
 * the D-02 status-join clauses (visitor entries/purpose breakdown) and the
 * D-09 LGA sub-breakdown join clauses (revenue), (c) the conditional
 * Prisma.sql/Prisma.empty from/to/lgaId fragments work whether the params
 * are supplied or omitted, (d) getRevenueToGovernment() degrades to the
 * empty shape (not a throw) when the Ministry wallet is unconfigured.
 */

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockSettlementService = {
  resolveMinistryWallet: jest.fn(),
};

describe('MinistryService', () => {
  let service: MinistryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinistryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettlementService, useValue: mockSettlementService },
      ],
    }).compile();
    service = module.get<MinistryService>(MinistryService);
  });

  // ── getVisitorEntriesByLgaAndMonth ───────────────────────────────────────────

  describe('getVisitorEntriesByLgaAndMonth', () => {
    it('coerces count to a JS number, not a bigint/Decimal-shaped value', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { lgaId: 'lga-1', lgaName: 'Abeokuta', month: '2026-06', userRole: 'TOURIST', count: 12n as unknown as number },
      ]);

      const result = await service.getVisitorEntriesByLgaAndMonth();

      expect(typeof result[0].count).toBe('number');
      expect(result[0].count).toBe(12);
    });

    it('includes the visitedAt <= NOW() clause and the two D-02 status-join LEFT JOINs when called with no params', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.getVisitorEntriesByLgaAndMonth();

      const executed = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText: string = executed.sql;

      expect(sqlText).toContain('v."visitedAt" <= NOW()');
      expect(sqlText).toContain('LEFT JOIN bookings b ON v."sourceType" = \'STAY\' AND v."sourceId" = b.id');
      expect(sqlText).toContain('LEFT JOIN tour_bookings tb ON v."sourceType" = \'TOUR\' AND v."sourceId" = tb.id');
      expect(sqlText).toContain('b.status NOT IN (\'CANCELLED\', \'REFUNDED\')');
      expect(sqlText).toContain('tb.status NOT IN (\'CANCELLED\', \'REFUNDED\')');
      // No from/to/lgaId filters were supplied — the conditional Prisma.empty
      // branches must not inject the corresponding AND clauses (the lgaId join
      // predicate in the LEFT JOIN clause itself is expected and excluded here).
      expect(sqlText).not.toContain('v."visitedAt" >=');
      expect(sqlText).not.toContain('AND v."lgaId" =');
    });

    it('applies from/to/lgaId as parameterized filters when supplied', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.getVisitorEntriesByLgaAndMonth('2026-01-01', '2026-12-31', 'lga-1');

      const executed = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText: string = executed.sql;

      expect(sqlText).toContain('v."visitedAt" >=');
      expect(sqlText).toContain('v."visitedAt" <=');
      expect(sqlText).toContain('v."lgaId" =');
      // Parameterized — never string-concatenated (ASVS V5 / T-14-06 mitigation).
      expect(executed.values).toEqual(
        expect.arrayContaining([expect.any(Date), expect.any(Date), 'lga-1']),
      );
    });

    it('resolves without throwing for both the all-params and no-params cases', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(
        service.getVisitorEntriesByLgaAndMonth('2026-01-01', '2026-12-31', 'lga-1'),
      ).resolves.toEqual([]);
      await expect(service.getVisitorEntriesByLgaAndMonth()).resolves.toEqual([]);
    });
  });

  // ── getPurposeBreakdown ───────────────────────────────────────────────────────

  describe('getPurposeBreakdown', () => {
    it('coerces count to a JS number', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { purpose: 'Tourism/Leisure', month: '2026-06', count: 7n as unknown as number },
      ]);

      const result = await service.getPurposeBreakdown();

      expect(typeof result[0].count).toBe('number');
      expect(result[0].count).toBe(7);
    });

    it('includes the D-02 status-join clauses in the generated SQL', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.getPurposeBreakdown();

      const executed = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText: string = executed.sql;

      expect(sqlText).toContain('v."visitedAt" <= NOW()');
      expect(sqlText).toContain('LEFT JOIN bookings b ON v."sourceType" = \'STAY\' AND v."sourceId" = b.id');
      expect(sqlText).toContain('LEFT JOIN tour_bookings tb ON v."sourceType" = \'TOUR\' AND v."sourceId" = tb.id');
      expect(sqlText).toContain('GROUP BY v.purpose, month');
    });

    it('omits from/to/lgaId filters from the SQL when not supplied', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service.getPurposeBreakdown();

      const executed = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText: string = executed.sql;

      expect(sqlText).not.toContain('v."visitedAt" >=');
      expect(sqlText).not.toContain('v."lgaId" =');
    });

    it('resolves without throwing for both the all-params and no-params cases', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(
        service.getPurposeBreakdown('2026-01-01', '2026-12-31', 'lga-1'),
      ).resolves.toEqual([]);
      await expect(service.getPurposeBreakdown()).resolves.toEqual([]);
    });
  });

  // ── getRevenueToGovernment (MIN-04) ──────────────────────────────────────────

  describe('getRevenueToGovernment', () => {
    it('returns the empty-shape object without calling $queryRaw when the Ministry wallet is unconfigured', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce(null);

      const result = await service.getRevenueToGovernment();

      expect(result).toEqual({ byModule: [], byMonth: [], byModuleLga: [] });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('coerces Decimal/bigint-shaped totals to plain JS numbers across all 3 result arrays', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ module: 'stays', total: '12500.50' as unknown as number }])
        .mockResolvedValueOnce([{ month: '2026-06', total: 12500.5 as unknown as number }])
        .mockResolvedValueOnce([
          { module: 'stays', lgaId: 'lga-1', lgaName: 'Abeokuta', total: 12500.5 as unknown as number },
        ]);

      const result = await service.getRevenueToGovernment();

      expect(typeof result.byModule[0].total).toBe('number');
      expect(result.byModule[0].total).toBe(12500.5);
      expect(typeof result.byMonth[0].total).toBe('number');
      expect(result.byMonth[0].total).toBe(12500.5);
      expect(typeof result.byModuleLga[0].total).toBe('number');
      expect(result.byModuleLga[0].total).toBe(12500.5);
    });

    it('queries all 7 confirmed module strings for byModule/byMonth with no hardcoded module allowlist', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getRevenueToGovernment();

      const byModuleCall = mockPrisma.$queryRaw.mock.calls[0][0];
      const byModuleSql: string = byModuleCall.sql;
      const byMonthCall = mockPrisma.$queryRaw.mock.calls[1][0];
      const byMonthSql: string = byMonthCall.sql;

      // The byModule/byMonth queries group on every module credited to the
      // Ministry wallet — they must NOT restrict to the 3-module LGA
      // allowlist (that restriction is unique to the byModuleLga query).
      expect(byModuleSql).not.toContain("IN ('stays', 'marketplace', 'tour_booking')");
      expect(byMonthSql).not.toContain("IN ('stays', 'marketplace', 'tour_booking')");
      expect(byModuleSql).toContain("t.metadata->>'module'");
      expect(byModuleSql).toContain('t."walletId" = ');
    });

    it("restricts the byModuleLga query to 'stays'/'marketplace'/'tour_booking' and includes the Tour join alongside the Stays/Marketplace joins", async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getRevenueToGovernment();

      const byModuleLgaCall = mockPrisma.$queryRaw.mock.calls[2][0];
      const sql: string = byModuleLgaCall.sql;

      expect(sql).toContain("IN ('stays', 'marketplace', 'tour_booking')");
      // Stays join path
      expect(sql).toContain('FROM bookings b');
      expect(sql).toContain('JOIN properties p ON b."propertyId" = p.id');
      // Marketplace join path
      expect(sql).toContain('FROM orders o');
      expect(sql).toContain('JOIN vendors v ON o."vendorId" = v.id');
      // Tour join path — via gatewayRef -> paymentReference -> tourPackageId -> lgaId,
      // NOT via metadata.bookingId/metadata.orderId.
      expect(sql).toContain('FROM tour_bookings tb');
      expect(sql).toContain('JOIN tour_packages tp ON tb."tourPackageId" = tp.id');
      expect(sql).toContain('tb."paymentReference" = t."gatewayRef"');
    });

    it('applies from/to as parameterized Transaction.createdAt filters when supplied', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getRevenueToGovernment('2026-01-01', '2026-12-31');

      const byModuleCall = mockPrisma.$queryRaw.mock.calls[0][0];
      expect(byModuleCall.sql).toContain('t."createdAt" >=');
      expect(byModuleCall.sql).toContain('t."createdAt" <=');
      expect(byModuleCall.values).toEqual(
        expect.arrayContaining([expect.any(String), expect.any(Date), expect.any(Date)]),
      );
    });

    it('omits from/to filters from the SQL when not supplied (D-10 — covers all historical data)', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValueOnce({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getRevenueToGovernment();

      const byModuleCall = mockPrisma.$queryRaw.mock.calls[0][0];
      expect(byModuleCall.sql).not.toContain('t."createdAt" >=');
      expect(byModuleCall.sql).not.toContain('t."createdAt" <=');
    });

    it('resolves without throwing for both the all-params and no-params cases', async () => {
      mockSettlementService.resolveMinistryWallet.mockResolvedValue({ id: 'ministry-wallet-1' });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getRevenueToGovernment('2026-01-01', '2026-12-31')).resolves.toEqual({
        byModule: [],
        byMonth: [],
        byModuleLga: [],
      });
      await expect(service.getRevenueToGovernment()).resolves.toEqual({
        byModule: [],
        byMonth: [],
        byModuleLga: [],
      });
    });
  });
});
