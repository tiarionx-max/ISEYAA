// ── Stage 1 shadow-mode batch verification script (SETTLE-09) ──────────────
// Read-only, standalone script. Recomputes the new settlement-engine split
// formula for a sample of already-COMPLETED/DELIVERED historical rows and
// diffs the recomputed driver/rider earnings against the values already
// stored in Trip.driverEarnings / DeliveryOrder.riderEarnings.
//
// CRITICAL: this script must never invoke the settlement engine's settle
// method or perform any direct wallet mutation — those rows have already
// been paid. Doing so against them would create real, duplicate wallet
// credits (13-RESEARCH.md Anti-Patterns section).
//
// Source: pattern mirrors backend/prisma/seed.ts:1-4 (raw PrismaClient, ts-node)
// and 13-RESEARCH.md lines 247-288 (Pattern 2, fully worked Transport example).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MismatchReport {
  tripId?: string;
  orderId?: string;
  storedDriverEarnings?: number;
  storedRiderEarnings?: number;
  recomputedDriverEarnings?: number;
  recomputedRiderEarnings?: number;
}

// ── Transport: subtract-first formula (D-01/Pitfall-1) ─────────────────────
export async function verifyTransportShadow(sampleSize = 200): Promise<boolean> {
  const govtLevyCfg = await prisma.platformConfig.findUnique({
    where: { key: 'transport.govt_levy_pct' },
  });
  const platformFeeCfg = await prisma.platformConfig.findUnique({
    where: { key: 'transport.platform_fee_pct' },
  });
  const govtLevyPct = govtLevyCfg ? Number(govtLevyCfg.value) : 5;
  const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 10;
  const totalCommissionPct = govtLevyPct + platformFeePct;

  const trips = await prisma.trip.findMany({
    where: { status: 'COMPLETED' as any, fare: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: sampleSize,
  });

  let mismatches = 0;
  const report: MismatchReport[] = [];

  for (const trip of trips) {
    const fare = Number(trip.fare);
    // SUBTRACT-FIRST — must match transport.service.ts's cutover-enabled path exactly.
    const totalCommission = Math.round(fare * (totalCommissionPct / 100) * 100) / 100;
    const recomputedDriverEarnings = Math.round((fare - totalCommission) * 100) / 100;
    const storedDriverEarnings = Number(trip.driverEarnings);
    // WR-07: compare at kobo (integer) precision — exact float `===` can produce a
    // false-positive mismatch (or, less likely, mask a real one) purely from
    // IEEE-754 representation noise, defeating this script's entire purpose.
    const match = Math.round(recomputedDriverEarnings * 100) === Math.round(storedDriverEarnings * 100); // D-06

    if (!match) {
      mismatches++;
      report.push({
        tripId: trip.id,
        storedDriverEarnings,
        recomputedDriverEarnings,
      });
    }
  }

  const sampled = trips.length;
  console.log(`Transport Stage 1: ${sampled} sampled, ${mismatches} mismatches`);
  if (report.length) console.table(report);

  require('fs').writeFileSync(
    `shadow-report-transport-${Date.now()}.json`,
    JSON.stringify({ sampled, mismatches, report }, null, 2),
  );

  return mismatches === 0;
}

// ── Delivery: multiply-first formula (D-01/Pitfall-1 — never normalize to
//    Transport's subtract-first order) ──────────────────────────────────────
export async function verifyDeliveryShadow(sampleSize = 200): Promise<boolean> {
  const govtLevyCfg = await prisma.platformConfig.findUnique({
    where: { key: 'delivery.govt_levy_pct' },
  });
  const platformFeeCfg = await prisma.platformConfig.findUnique({
    where: { key: 'delivery.platform_fee_pct' },
  });
  const govtLevyPct = govtLevyCfg ? Number(govtLevyCfg.value) : 5;
  const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 15;
  const totalCommissionPct = govtLevyPct + platformFeePct;

  const orders = await prisma.deliveryOrder.findMany({
    where: { status: 'DELIVERED' as any, fee: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: sampleSize,
  });

  let mismatches = 0;
  const report: MismatchReport[] = [];

  for (const order of orders) {
    const fee = Number(order.fee);
    // MULTIPLY-FIRST — must match delivery.service.ts's cutover-enabled path exactly.
    const recomputedRiderEarnings = Math.round(fee * (1 - totalCommissionPct / 100) * 100) / 100;
    const storedRiderEarnings = Number(order.riderEarnings);
    // WR-07: compare at kobo (integer) precision — exact float `===` can produce a
    // false-positive mismatch (or, less likely, mask a real one) purely from
    // IEEE-754 representation noise, defeating this script's entire purpose.
    const match = Math.round(recomputedRiderEarnings * 100) === Math.round(storedRiderEarnings * 100); // D-06

    if (!match) {
      mismatches++;
      report.push({
        orderId: order.id,
        storedRiderEarnings,
        recomputedRiderEarnings,
      });
    }
  }

  const sampled = orders.length;
  console.log(`Delivery Stage 1: ${sampled} sampled, ${mismatches} mismatches`);
  if (report.length) console.table(report);

  require('fs').writeFileSync(
    `shadow-report-delivery-${Date.now()}.json`,
    JSON.stringify({ sampled, mismatches, report }, null, 2),
  );

  return mismatches === 0;
}

if (require.main === module) {
  Promise.all([verifyTransportShadow(), verifyDeliveryShadow()])
    .then(([transportOk, deliveryOk]) => {
      process.exitCode = transportOk && deliveryOk ? 0 : 1;
    })
    .finally(() => prisma.$disconnect());
}
