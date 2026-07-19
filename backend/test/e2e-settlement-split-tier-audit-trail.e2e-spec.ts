/**
 * 18-CR-01 — E2E regression: SettlementSplitTier audit-trail update path.
 *
 * Code review (CR-01) found that AdminService.updateSplitTier()'s
 * insert-new-row/deactivate-old pattern (D-05 audit trail) violated a plain
 * `@@unique([module, tierName])` constraint the moment a second historical
 * row existed — invisible to admin.service.spec.ts because Prisma is fully
 * mocked there and never touches a real unique index. This test exercises
 * the exact update sequence against a REAL Postgres unique/partial-unique
 * index to catch any regression that a mocked unit test cannot.
 *
 * Skip condition: DATABASE_URL is not set, or points to a CI placeholder —
 * same convention as e2e-tour-booking.e2e-spec.ts.
 */

import { PrismaClient } from '@prisma/client';

// ── Skip gate (mirrors e2e-tour-booking.e2e-spec.ts) ────────────────────────

const dbUrl = process.env.DATABASE_URL ?? '';
const skipE2E =
  !dbUrl ||
  dbUrl.includes('localhost:54321') ||
  dbUrl.includes('placeholder') ||
  dbUrl === '';

const describeE2E = skipE2E ? describe.skip : describe;

const TEST_MODULE = 'e2e-settlement-split-tier-audit-trail';

describeE2E('SettlementSplitTier audit-trail update path (CR-01 regression)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.settlementSplitTier.deleteMany({ where: { module: TEST_MODULE } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.settlementSplitTier.deleteMany({ where: { module: TEST_MODULE } });
  });

  // Mirrors AdminService.updateSplitTier()'s exact transaction shape.
  async function updateSplitTier(priorId: string) {
    return prisma.$transaction(async (tx) => {
      const prior = await tx.settlementSplitTier.findUnique({ where: { id: priorId } });
      if (!prior) throw new Error('prior not found');
      await tx.settlementSplitTier.update({ where: { id: prior.id }, data: { isActive: false } });
      return tx.settlementSplitTier.create({
        data: {
          module: prior.module,
          tierName: prior.tierName,
          earnerPct: prior.earnerPct,
          ministryPct: prior.ministryPct,
          platformPct: prior.platformPct,
          isActive: true,
          effectiveFrom: new Date(),
        },
      });
    });
  }

  it('allows repeated updates without violating a unique constraint, keeping exactly one active row', async () => {
    const seed = await prisma.settlementSplitTier.create({
      data: {
        module: TEST_MODULE,
        tierName: 'default',
        earnerPct: 0.8,
        ministryPct: 0.05,
        platformPct: 0.15,
        isActive: true,
      },
    });

    // Two sequential update cycles — this is exactly the call CR-01 found broken.
    const first = await updateSplitTier(seed.id);
    const second = await updateSplitTier(first.id);

    const allRows = await prisma.settlementSplitTier.findMany({
      where: { module: TEST_MODULE },
      orderBy: { createdAt: 'asc' },
    });

    expect(allRows).toHaveLength(3); // 1 seed + 2 updates, all preserved for audit (D-05)
    expect(allRows.filter((r) => r.isActive)).toHaveLength(1);
    expect(allRows.find((r) => r.isActive)?.id).toBe(second.id);
  });

  it('still rejects two simultaneously ACTIVE rows for the same (module, tierName)', async () => {
    await prisma.settlementSplitTier.create({
      data: {
        module: TEST_MODULE,
        tierName: 'default',
        earnerPct: 0.8,
        ministryPct: 0.05,
        platformPct: 0.15,
        isActive: true,
      },
    });

    await expect(
      prisma.settlementSplitTier.create({
        data: {
          module: TEST_MODULE,
          tierName: 'default',
          earnerPct: 0.1,
          ministryPct: 0.1,
          platformPct: 0.1,
          isActive: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
