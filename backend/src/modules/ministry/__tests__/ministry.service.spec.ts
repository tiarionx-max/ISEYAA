import { Test, TestingModule } from '@nestjs/testing';
import { MinistryService } from '../ministry.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 14-03 — MinistryService spec.
 *
 * Covers: (a) bigint/Decimal-shaped `count` aggregates are coerced to JS
 * `number` before returning, (b) the generated SQL template includes the
 * D-02 status-join clauses, (c) the conditional Prisma.sql/Prisma.empty
 * from/to/lgaId fragments work whether the params are supplied or omitted.
 */

const mockPrisma = {
  $queryRaw: jest.fn(),
};

describe('MinistryService', () => {
  let service: MinistryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinistryService,
        { provide: PrismaService, useValue: mockPrisma },
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
});
