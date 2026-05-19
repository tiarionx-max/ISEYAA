/**
 * db-audit/explain-analyze.ts
 *
 * Purpose: Verify that FK indexes added in Phase 06-02 replace sequential scans
 * on the 8 hot queries identified in RESEARCH.md.
 *
 * Usage (against Neon or local Postgres):
 *   DATABASE_URL=<connection-string> \
 *     npx ts-node --project load-tests/db-audit/tsconfig.json \
 *     load-tests/db-audit/explain-analyze.ts
 *
 * Look for "Index Scan" or "Index Only Scan" — NOT "Seq Scan" — in the output.
 */

import { PrismaClient } from '../../backend/node_modules/@prisma/client';

const prisma = new PrismaClient({ log: ['query'] });

function logPlan(label: string, rows: unknown) {
  console.log(`\n--- ${label} ---`);
  if (Array.isArray(rows)) {
    for (const row of rows as any[]) {
      const line: string = typeof row === 'string' ? row : (Object.values(row)[0] as string);
      console.log(' ', line);
    }
  } else {
    console.log(rows);
  }
}

async function main() {
  console.log('ISEYAA — FK index audit\n');

  // ── 1. transactions by walletId ──────────────────────────────────────────
  try {
    const r1 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "transactions" WHERE "walletId" = 'test-id' ORDER BY "createdAt" DESC LIMIT 20`,
    );
    logPlan('transactions.walletId', r1);
  } catch (e: any) { console.error('transactions.walletId:', e.message); }

  // ── 2. tickets by userId ─────────────────────────────────────────────────
  try {
    const r2 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "tickets" WHERE "userId" = 'test-id'`,
    );
    logPlan('tickets.userId', r2);
  } catch (e: any) { console.error('tickets.userId:', e.message); }

  // ── 3. bookings by userId ────────────────────────────────────────────────
  try {
    const r3 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "bookings" WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC`,
    );
    logPlan('bookings.userId', r3);
  } catch (e: any) { console.error('bookings.userId:', e.message); }

  // ── 4. orders by userId ──────────────────────────────────────────────────
  try {
    const r4 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "orders" WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC`,
    );
    logPlan('orders.userId', r4);
  } catch (e: any) { console.error('orders.userId:', e.message); }

  // ── 5. trips by riderId ──────────────────────────────────────────────────
  try {
    const r5 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "trips" WHERE "riderId" = 'test-id' ORDER BY "requestedAt" DESC`,
    );
    logPlan('trips.riderId', r5);
  } catch (e: any) { console.error('trips.riderId:', e.message); }

  // ── 6. delivery_orders by senderId ───────────────────────────────────────
  try {
    const r6 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "delivery_orders" WHERE "senderId" = 'test-id' ORDER BY "createdAt" DESC`,
    );
    logPlan('delivery_orders.senderId', r6);
  } catch (e: any) { console.error('delivery_orders.senderId:', e.message); }

  // ── 7. audit_logs by userId ──────────────────────────────────────────────
  try {
    const r7 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "audit_logs" WHERE "userId" = 'test-id' ORDER BY "createdAt" DESC LIMIT 50`,
    );
    logPlan('audit_logs.userId', r7);
  } catch (e: any) { console.error('audit_logs.userId:', e.message); }

  // ── 8. ticket_types by eventId (non-deleted) ─────────────────────────────
  try {
    const r8 = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE SELECT * FROM "ticket_types" WHERE "eventId" = 'test-id' AND "deletedAt" IS NULL`,
    );
    logPlan('ticket_types.eventId', r8);
  } catch (e: any) { console.error('ticket_types.eventId:', e.message); }

  console.log('\nAudit complete. Confirm "Index Scan" on all 8 queries above.');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
