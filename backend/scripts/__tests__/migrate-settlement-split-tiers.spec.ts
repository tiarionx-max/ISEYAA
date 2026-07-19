/**
 * 18-01 Task 3 — migrate-settlement-split-tiers.ts spec.
 *
 * Mocks `@prisma/client`'s `PrismaClient` so the script's raw
 * `new PrismaClient()` (no NestJS DI, mirrors shadow-settlement-verify.ts)
 * resolves against jest.fn() mocks instead of a real DB connection.
 */

const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    platformConfig: { findUnique: mockFindUnique },
    settlementSplitTier: { findFirst: mockFindFirst, create: mockCreate },
    $disconnect: mockDisconnect,
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { computeModuleSplit, migrateModule, main } from '../migrate-settlement-split-tiers';

function mockConfigRow(key: string, value: number) {
  return { key, value, isPublic: false, metadata: null };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('migrate-settlement-split-tiers', () => {
  it('transport: govt_levy_pct=5, platform_fee_pct=10 -> ministryPct=0.05, platformPct=0.10, earnerPct=0.85 (D-03 whole-number divide-by-100 exactly once)', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.key === 'transport.govt_levy_pct') return mockConfigRow(where.key, 5);
      if (where.key === 'transport.platform_fee_pct') return mockConfigRow(where.key, 10);
      return null;
    });

    const result = await computeModuleSplit('transport');

    expect(result.ministryPct).toBeCloseTo(0.05, 10);
    expect(result.platformPct).toBeCloseTo(0.1, 10);
    expect(result.earnerPct).toBeCloseTo(0.85, 10);
  });

  it('delivery: govt_levy_pct=5, platform_fee_pct=15 -> ministryPct=0.05, platformPct=0.15, earnerPct=0.80', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.key === 'delivery.govt_levy_pct') return mockConfigRow(where.key, 5);
      if (where.key === 'delivery.platform_fee_pct') return mockConfigRow(where.key, 15);
      return null;
    });

    const result = await computeModuleSplit('delivery');

    expect(result.ministryPct).toBeCloseTo(0.05, 10);
    expect(result.platformPct).toBeCloseTo(0.15, 10);
    expect(result.earnerPct).toBeCloseTo(0.8, 10);
  });

  it('marketplace: no module-level levy key, feeKey=0.10 -> ministryPct=0, platformPct=0.10, earnerPct=0.90 (D-02)', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.key === 'marketplace.platform_fee_pct') return mockConfigRow(where.key, 0.1);
      return null;
    });

    const result = await computeModuleSplit('marketplace');

    expect(result.ministryPct).toBe(0);
    expect(result.platformPct).toBeCloseTo(0.1, 10);
    expect(result.earnerPct).toBeCloseTo(0.9, 10);
    // No levy key was ever queried for marketplace.
    expect(mockFindUnique).not.toHaveBeenCalledWith({ where: { key: 'marketplace.govt_levy_pct' } });
  });

  it('studio: platformPct forced null (D-01) even though studio.platform_fee_pct=0.10 exists, earnerPct forced 0 (not derived)', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.key === 'studio.govt_levy_pct') return mockConfigRow(where.key, 0.05);
      if (where.key === 'studio.platform_fee_pct') return mockConfigRow(where.key, 0.1);
      return null;
    });

    const result = await computeModuleSplit('studio');

    expect(result.platformPct).toBeNull();
    expect(result.earnerPct).toBe(0);
    expect(result.ministryPct).toBeCloseTo(0.05, 10);
  });

  it('is idempotent — invoking migrateModule() twice against the same mocked config finds the existing row on the second call and never creates a duplicate', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      if (where.key === 'transport.govt_levy_pct') return mockConfigRow(where.key, 5);
      if (where.key === 'transport.platform_fee_pct') return mockConfigRow(where.key, 10);
      return null;
    });
    // No compound unique key exists post-fix (CR-01) — uniqueness among active
    // rows is enforced by a partial index, not `@@unique`, so the script does
    // find-then-create instead of upsert. First call: no existing row -> create.
    // Second call: existing row found -> skip create (idempotent no-op).
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'TIER-1' });
    mockCreate.mockResolvedValue({ id: 'TIER-1' });

    await migrateModule('transport');
    await migrateModule('transport');

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    for (const call of mockFindFirst.mock.calls) {
      expect(call[0].where).toEqual({ module: 'transport', tierName: 'default' });
    }
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws and aborts the entire run before any settlementSplitTier.create call if a computed percentage is non-finite', async () => {
    mockFindUnique.mockImplementation(async ({ where }: any) => {
      // Malformed config value (non-numeric) forces Number(...) to NaN.
      if (where.key === 'transport.govt_levy_pct') return mockConfigRow(where.key, NaN);
      if (where.key === 'transport.platform_fee_pct') return mockConfigRow(where.key, 10);
      return mockConfigRow(where.key, 0.1);
    });

    await expect(main()).rejects.toThrow(/transport/i);

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
