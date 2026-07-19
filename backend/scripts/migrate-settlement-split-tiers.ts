// ── One-off migration script — backfill SettlementSplitTier rows (SETTLE-11a/11b) ──
// Read-once, write-once, idempotent standalone script. Reads each module's
// CURRENTLY-LIVE PlatformConfig values (never seed.ts defaults, except as a
// fallback when a config row is entirely unset) and upserts one default-tier
// SettlementSplitTier row per module.
//
// D-01: Studio has no earner recipient at all — settle()'s recipients array
// for a Studio booking contains only a 'MINISTRY' tag (studio.service.ts
// handleStudioPayment(), recipients: [{ tag: 'MINISTRY', ... }]). Studio's
// platformPct is forced null and earnerPct forced 0 explicitly here, never
// derived from the general 1 - ministryPct - platformPct formula.
//
// D-02: Marketplace has no module-level government levy key at all — the
// vendor-scoped override is read directly by marketplace.service.ts, not
// absorbed into this module-level default tier. ministryPct is therefore 0.
//
// D-03: Transport and Delivery store their PlatformConfig percentages as
// WHOLE NUMBERS (5, 10, 15 — matching the legacy transport_platform_fee_pct
// style), unlike Marketplace/Events/Stays/Studio's 0-1 fraction scale. Those
// two modules' values are divided by 100 exactly once during backfill.
//
// Source: pattern mirrors backend/scripts/shadow-settlement-verify.ts's exact
// top-of-file convention (raw PrismaClient, no NestJS DI, ts-node runner guard).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ModuleSplitConfig {
  levyKey: string | null;
  feeKey: string | null;
  defaultLevy: number;
  defaultFee: number | null;
  /** Transport/Delivery only — PlatformConfig stores these as whole numbers (5, 10, 15). */
  wholeNumberPct: boolean;
}

export const MODULE_CONFIG: Record<string, ModuleSplitConfig> = {
  transport: {
    levyKey: 'transport.govt_levy_pct',
    feeKey: 'transport.platform_fee_pct',
    defaultLevy: 5,
    defaultFee: 10,
    wholeNumberPct: true,
  },
  delivery: {
    levyKey: 'delivery.govt_levy_pct',
    feeKey: 'delivery.platform_fee_pct',
    defaultLevy: 5,
    defaultFee: 15,
    wholeNumberPct: true,
  },
  marketplace: {
    levyKey: null,
    feeKey: 'marketplace.platform_fee_pct',
    defaultLevy: 0,
    defaultFee: 0.1,
    wholeNumberPct: false,
  },
  events: {
    levyKey: 'events.govt_levy_pct',
    feeKey: 'events.platform_fee_pct',
    defaultLevy: 0.05,
    defaultFee: 0.1,
    wholeNumberPct: false,
  },
  stays: {
    levyKey: 'stays.govt_levy_pct',
    feeKey: null,
    defaultLevy: 0.05,
    defaultFee: null,
    wholeNumberPct: false,
  },
  studio: {
    levyKey: 'studio.govt_levy_pct',
    feeKey: 'studio.platform_fee_pct',
    defaultLevy: 0.05,
    defaultFee: 0.1,
    wholeNumberPct: false,
  },
};

export interface ComputedSplit {
  earnerPct: number;
  ministryPct: number;
  platformPct: number | null;
}

export async function computeModuleSplit(module: string): Promise<ComputedSplit> {
  const cfg = MODULE_CONFIG[module];

  const levyRow = cfg.levyKey
    ? await prisma.platformConfig.findUnique({ where: { key: cfg.levyKey } })
    : null;
  const feeRow = cfg.feeKey
    ? await prisma.platformConfig.findUnique({ where: { key: cfg.feeKey } })
    : null;

  let ministryPct = levyRow ? Number(levyRow.value) : cfg.defaultLevy;
  let platformPct = feeRow ? Number(feeRow.value) : cfg.defaultFee;

  if (cfg.wholeNumberPct) {
    // D-03: divide by 100 exactly once — never twice.
    ministryPct = ministryPct / 100;
    platformPct = platformPct !== null ? platformPct / 100 : null;
  }

  let finalPlatformPct: number | null;
  let earnerPct: number;

  if (module === 'studio') {
    // D-01: ignore the fetched fee value for split math (still fetched above for
    // operator visibility / future auditing) — Studio's settle() recipients array
    // has no earner recipient, only 'MINISTRY'. Forced unconditionally, not
    // derived from the general formula below: platformPct: null, earnerPct: 0.
    finalPlatformPct = null; // platformPct: null
    earnerPct = 0; // earnerPct: 0
  } else {
    finalPlatformPct = platformPct;
    // Round to 10dp — sequential float subtraction (e.g. 1 - 0.05 - 0.15) can land
    // on an adjacent representable double (0.7999999999999999 instead of 0.8),
    // which would otherwise persist verbatim into the Decimal column. 10dp is far
    // finer than any currency precision this engine ever rounds to (±0.02 kobo
    // drift tolerance in settle()), so this only removes IEEE-754 noise.
    const rawEarnerPct =
      finalPlatformPct !== null ? 1 - ministryPct - finalPlatformPct : 1 - ministryPct;
    earnerPct = Math.round(rawEarnerPct * 1e10) / 1e10;
  }

  if (!Number.isFinite(ministryPct) || (finalPlatformPct !== null && !Number.isFinite(finalPlatformPct))) {
    throw new Error(
      `Non-finite computed split for module="${module}" (ministryPct=${ministryPct}, platformPct=${finalPlatformPct}) — aborting before any write`,
    );
  }

  return { earnerPct, ministryPct, platformPct: finalPlatformPct };
}

export async function migrateModule(module: string): Promise<void> {
  const { earnerPct, ministryPct, platformPct } = await computeModuleSplit(module);
  await prisma.settlementSplitTier.upsert({
    where: { module_tierName: { module, tierName: 'default' } },
    update: {},
    create: {
      module,
      tierName: 'default',
      earnerPct,
      ministryPct,
      platformPct,
      isActive: true,
    },
  });
  console.log(`Migrated ${module}`);
}

export async function main(): Promise<void> {
  const modules = Object.keys(MODULE_CONFIG);

  // Compute every module's split BEFORE writing any of them — a non-finite
  // result on any module aborts the entire run with zero partial writes.
  const splits: Record<string, ComputedSplit> = {};
  for (const module of modules) {
    splits[module] = await computeModuleSplit(module);
  }

  for (const module of modules) {
    const { earnerPct, ministryPct, platformPct } = splits[module];
    await prisma.settlementSplitTier.upsert({
      where: { module_tierName: { module, tierName: 'default' } },
      update: {},
      create: {
        module,
        tierName: 'default',
        earnerPct,
        ministryPct,
        platformPct,
        isActive: true,
      },
    });
    console.log(`Migrated ${module}`);
  }
}

if (require.main === module) {
  main().finally(() => prisma.$disconnect());
}
