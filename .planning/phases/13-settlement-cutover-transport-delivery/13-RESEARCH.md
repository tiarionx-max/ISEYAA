# Phase 13: Settlement Cutover — Transport & Delivery - Research

**Researched:** 2026-07-17
**Domain:** Internal backend refactor — atomic wallet settlement fan-out (NestJS + Prisma), plus from-scratch shadow-mode verification harness design
**Confidence:** HIGH (all findings verified by direct file reads of this codebase; no external library research required — this phase reuses internal Phase 12 infrastructure exclusively)

## Summary

This phase has no new third-party dependency to research — it is a pure internal-reuse cutover. `SettlementService.settle()` (`backend/src/common/services/settlement.service.ts`, built in Phase 12) is production-ready and already has **four working call sites** to model against: `TourSettlementService` (N-way, hardest case), and three simpler 2-recipient examples added in Phase 12 — `marketplace.service.ts:282`, `studio.service.ts:179`, `stays.service.ts:339` — all of which call `settlementService.resolveMinistryWallet()` **as-is, with zero parameters**, reusing the single standing Ministry wallet. This directly resolves the CONTEXT.md's open scouting question: **no generalization of `resolveMinistryWallet()` is needed** — Transport and Delivery should call it exactly the same way.

`studio.service.ts:157-211`'s `handleStudioPayment()` is the closest existing template to what Transport/Delivery need — a 2-recipient-plus-platform-absorbs-remainder pattern computed from `PlatformConfig` percentages, with `onSettled`/`onFailure` hooks doing the status transition inside the same `$transaction`. The one structural difference: Studio has only one explicit recipient (MINISTRY; the earner leg doesn't exist because Studio has no vendor). Transport/Delivery need **two** explicit recipients (DRIVER or RIDER, plus MINISTRY) with PLATFORM implicitly absorbing whatever remains — `SettlementService` already computes this automatically as `chargeAmountNgn - claimedAmountNgn`, so no new engine logic is needed, only correct recipient-array construction.

The single highest-risk implementation detail is **rounding fidelity**: today's `completeTrip()`/`completeDelivery()` compute `driverEarnings`/`riderEarnings` as `fare - platformFee` (subtraction after rounding), not as an independent `fare × 0.85` multiplication. D-01 requires driver/rider payouts to be **bit-for-bit unchanged**. The planner must preserve the exact existing subtraction-based formula for the driver/rider leg's `amountNgn`, not recompute it independently via a new percentage multiply — a naive reimplementation risks a sub-kobo rounding mismatch that would fail D-06's exact-match bar on real transaction amounts even though the underlying business logic is "the same."

Zero shadow/dry-run infrastructure exists anywhere in this codebase (confirmed: no `NestFactory.createApplicationContext` usage anywhere in `backend/`, no `dryRun`/`shadow` grep hits outside this phase's own CONTEXT.md). Existing one-off backend scripts (`prisma/seed.ts`, `seed-demo.js`, `smoke-test.js`, `scripts/smoke-infra.sh`) all use **raw `PrismaClient` directly**, never NestJS DI — this is the established convention this phase's Stage 1 batch script should follow, since Stage 1 is pure historical-data arithmetic and does not need `SettlementService`'s live DI graph (RefundService, system-wallet bootstrap, etc.) to compute a comparison.

**Primary recommendation:** Converge `completeTrip()`/`completeDelivery()` onto `SettlementService.settle()` following Studio's 2-recipient template (DRIVER/RIDER + MINISTRY explicit, PLATFORM implicit), reusing `resolveMinistryWallet()` unmodified. Build Stage 1 (historical batch re-verification) as a standalone `ts-node` script using raw `PrismaClient`, mirroring `seed.ts`'s existing convention. Build Stage 2 (live dual-run bake period) as an inline shadow-computation branch inside `completeTrip()`/`completeDelivery()`, persisted to a new small `ShadowSettlementComparison` table (not just `Logger` output) so the 3-day/100-transaction/zero-discrepancy gate in D-08 can be queried programmatically rather than scraped from logs.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Driver keeps exactly 85% of fare, rider keeps exactly 80% of fee — bit-for-bit unchanged from today. Ministry's cut is carved out of what is today pure platform commission (the remaining 15%/20%), not out of the driver/rider's share. This diverges from Phase 12's Marketplace/Events/Stays precedent (levy reduces the earner's payout) because SETTLE-09's shadow-mode requirement demands exact driver/rider payout equivalence.
- **D-03:** Platform's commission and the Ministry's cut will, for the first time, be actually credited to real wallets on every trip/delivery completion (today: computed on `Trip.platformFee`/`DeliveryOrder.platformFee` but never credited anywhere). Confirmed intentional — treated as a bug fix, consistent with every other settled module.
- **D-05:** Two-stage verification, built from scratch. Stage 1 — batch script re-computes the new three-way split against a sample of already-completed historical `Trip`/`DeliveryOrder` rows, diffing against recorded `platformFee`/`driverEarnings`/`riderEarnings`. Stage 2 — live dual-run bake period: `completeTrip`/`completeDelivery` continue crediting wallets via today's unchanged code path while also computing (log-only, never crediting) what `SettlementService` would have produced, comparing on every real completion. Both stages must pass before a module's cutover flag can flip.
- **D-07:** Independent per-module `PlatformConfig` boolean flags — `transport.settlement_engine_enabled`, `delivery.settlement_engine_enabled` — read at `completeTrip()`/`completeDelivery()` time. Either module can cut over independently. Same flag doubles as an instant rollback lever.

### Claude's Discretion

- **D-02 (exercised):** Two new `PlatformConfig` keys per module summing to today's total: `transport.govt_levy_pct` + `transport.platform_fee_pct` = 15; `delivery.govt_levy_pct` + `delivery.platform_fee_pct` = 20. Default `govt_levy_pct` = 5% for both (mirrors Events/Studio/Stays precedent), `platform_fee_pct` absorbs the remainder (10% Transport, 15% Delivery). All DB-configurable.
- **D-04 (exercised):** `SettlementService.settle()` inputs: `amountKobo = fare × 100` (or `fee × 100`), `buyerWalletId = null` (no real buyer/rider wallet debit exists to refund from), `gateway = 'INTERNAL'`. On settlement failure, `onFailure` reverts trip/delivery status to a retryable state rather than attempting a refund.
- **D-06 (exercised):** Exact-match required for driver/rider payout amounts — stricter than `SettlementService`'s own ±₦0.02 drift tolerance. Results logged via `Logger` plus a queryable report (script output file or simple summary); no new alerting infrastructure needed (one-time pre-cutover gate, not an ongoing pipeline).
- **D-08 (exercised):** Minimum bake-period gate: whichever is later of 3 elapsed days OR 100 completed trips/deliveries, zero discrepancies across the full bake sample. After ~2 weeks stable, legacy code + shadow-logging can be cleaned up in a follow-up pass, but the `PlatformConfig` flag stays as a permanent kill switch.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Two adjacent process items (filing INT-01/INT-02, re-running Phase 11's stale VERIFICATION.md) are being handled directly as follow-up actions, not folded into this phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETTLE-03 | Transport's settlement generalized to a three-way, `PlatformConfig`-driven split (driver, Ministry, platform), replacing hardcoded 85/15 | See Architecture Patterns (Pattern 1) and Code Examples — exact recipient-array construction for `completeTrip()`, reusing `resolveMinistryWallet()` and the studio.service.ts 2-recipient template |
| SETTLE-04 | Delivery's settlement generalized to a three-way, `PlatformConfig`-driven split, replacing hardcoded 80/20 | Same pattern applied to `completeDelivery()` — see Code Examples |
| SETTLE-09 | Transport/Delivery cutover verified in shadow mode against existing hardcoded-percentage output before going live, zero silent payout changes | See Shadow-Mode Verification Harness Design (Architecture Patterns Pattern 2 + Pattern 3) — from-scratch Stage 1 batch script design and Stage 2 live dual-run + `ShadowSettlementComparison` persistence design |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Three-way settlement split computation | API / Backend (`SettlementService`) | — | Pure server-side financial computation; no client input into split percentages |
| Recipient resolution (driver/rider wallet lookup) | API / Backend (`TransportService`/`DeliveryService`) | — | Domain service owns knowing which wallet belongs to which trip/order, same pattern as `TourSettlementService` |
| Ministry wallet resolution | API / Backend (`SettlementService.resolveMinistryWallet()`) | — | Shared, cross-module infrastructure already built in Phase 12; not re-implemented per module |
| Cutover flag read | API / Backend (`PlatformConfig` table via Prisma) | Database / Storage | Config-driven per CLAUDE.md ("platform fee source always from DB, never hardcoded"); flag itself is a DB row, read at request time, never cached |
| Stage 1 batch shadow verification | API / Backend (standalone `ts-node` script) | Database / Storage | Offline, one-shot re-computation against historical rows; no HTTP surface needed |
| Stage 2 live dual-run comparison | API / Backend (inline in `completeTrip`/`completeDelivery`) | Database / Storage (`ShadowSettlementComparison`) | Must run synchronously in the same request that credits the driver/rider wallet, to guarantee comparison-per-completion; persisted for cross-request, multi-day gate tracking |
| Bake-period gate check (3 days OR 100 tx, zero discrepancy) | API / Backend (query against `ShadowSettlementComparison`) | — | A DB aggregate query, not a new alerting/observability system — consistent with D-06's "no new alerting infrastructure" |
| Wallet credit (driver/rider/Ministry/platform) | Database / Storage (`Wallet`, `Transaction` tables via `SettlementService`'s `$transaction`) | API / Backend | Existing invariant: `SELECT FOR UPDATE` per wallet, single atomic transaction — unchanged from Phase 12 |

## Standard Stack

This phase introduces **no new npm dependencies**. It is a pure internal architectural convergence using infrastructure already present in `package.json` (verified via `npm view @nestjs/core version` → `11.1.28` confirms registry reachability; no new packages needed for this phase).

### Core (existing, reused as-is)
| Component | Location | Purpose | Why Standard (for this phase) |
|-----------|----------|---------|-------------------------------|
| `SettlementService` | `backend/src/common/services/settlement.service.ts` | Atomic N-way wallet fan-out, idempotency, drift assertion | Built in Phase 12 specifically so Transport/Delivery (and 4 other modules) never hand-roll settlement again |
| `@prisma/client` 5.11.x (installed: 5.22.x per lockfile — verify against `prisma/schema.prisma` `binaryTargets` before adding new models) | ORM | New `ShadowSettlementComparison` model (if adopted) needs a `prisma migrate dev` | Existing project ORM, no alternative under consideration |
| `ts-node` (devDependency, already used by `prisma.seed` script) | Standalone script runner | Stage 1 batch script execution | Matches existing `seed.ts` convention exactly — `"prisma": {"seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"}` in `backend/package.json:72-74` |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `PrismaClient` (raw, not injected `PrismaService`) | Stage 1 batch script's DB access | Standalone scripts outside the Nest DI container — see `prisma/seed.ts:1-4`, `seed-demo.js:1-2` |
| `Logger` (`@nestjs/common`) | Stage 2 inline shadow-comparison structured logging | Every settlement-adjacent service already uses `this.logger.warn/error/log` — matches CLAUDE.md's documented logging conventions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `ShadowSettlementComparison` Prisma table for Stage 2 persistence | Structured `Logger` output only, queried via Grafana Cloud/OTel (already live per INFRA-06) | Grafara/OTel log querying avoids a schema migration, but makes the D-08 gate check ("100 completed, zero discrepancies, 3 elapsed days") depend on log-retention windows and a manual/ad-hoc Grafana query rather than a simple SQL aggregate a script or admin endpoint can assert against programmatically before flipping the flag. Recommend the DB table — cheap, queryable, removable in the Phase 13 cleanup pass alongside the legacy code path (D-08 already anticipates a cleanup pass). |
| Standalone `ts-node` script (raw `PrismaClient`) for Stage 1 | `NestFactory.createApplicationContext(AppModule)` injecting the real `SettlementService` | The Nest-context approach would let Stage 1 call the *exact* `SettlementService` split-computation code path (zero drift risk from a parallel reimplementation) — but this pattern **does not exist anywhere in this codebase today** (verified: zero `createApplicationContext` hits), it's slower to bootstrap (loads the entire module graph including WebSocket gateways, Kafka consumers, etc. — see `AppModule`), and Stage 1 is explicitly a read-only diff, not real settlement execution, so no real wallet-crediting `settle()` call should run against historical data anyway (would double-credit already-paid drivers). The raw-script approach is both simpler and safer for Stage 1's actual job; the recipient-computation formula must be reproduced carefully (see Common Pitfalls) rather than imported, since the split math itself lives inline in `completeTrip`/`completeDelivery`, not in a separately importable pure function today. |

**Installation:** None required — no new packages.

**Version verification:**
```bash
npm view @nestjs/core version   # → 11.1.28 (installed: ^11.1.20 range in package.json, note CLAUDE.md's "NestJS 10.3.x" is stale)
npm view @prisma/client version # → verify against installed 5.22.x
```
Note: CLAUDE.md documents `@nestjs/core` as "10.3.x" but the installed/registry-current major is 11.x — this is a pre-existing documentation drift unrelated to this phase's scope, flagged for awareness only (do not "fix" NestJS version as part of this phase).

## Architecture Patterns

### System Architecture Diagram

```
DRIVER app (mobile)                 completeTrip() request path
       │  PATCH trips/:id/complete
       ▼
TransportController.completeTrip()
       │  @Roles(DRIVER) guard
       ▼
TransportService.completeTrip(tripId, driverUserId, dto)
       │
       ├─► 1. Load trip, verify driver assignment, verify IN_PROGRESS
       │
       ├─► 2. Read PlatformConfig: transport.settlement_engine_enabled
       │        │
       │        ├── FALSE (pre-cutover / rolled back) ──────────────────┐
       │        │     a. Run TODAY'S unchanged inline $transaction        │
       │        │        (85/15 split, driver-only wallet credit)        │
       │        │     b. Stage-2 shadow computation (non-blocking):      │
       │        │        compute what SettlementService WOULD produce,   │
       │        │        diff vs. (a), persist to                        │
       │        │        ShadowSettlementComparison (new table)          │
       │        │                                                        │
       │        └── TRUE (post-cutover) ─────────────────────────────┐  │
       │              a. Resolve driverWallet + ministryWallet          │
       │                 (SettlementService.resolveMinistryWallet())    │
       │              b. Build SettlementRecipient[] = [DRIVER, MINISTRY]│
       │              c. Call SettlementService.settle() — ONE           │
       │                 $transaction: SELECT FOR UPDATE per wallet,     │
       │                 idempotency precheck, drift assert, 3 CREDIT    │
       │                 Transaction rows (driver, ministry, platform)   │
       │              d. onSettled: trip.status = COMPLETED               │
       │              e. onFailure: trip.status reverts (retryable)       │
       │                                                                  │
       ▼                                                                  ▼
   trip.status = COMPLETED, driver wallet credited (either path)
       │
       ▼
   TransportGateway emits 'trip:completed' via WebSocket (unchanged)


Stage 1 (offline, pre-cutover gate) ───────────────────────────────
   backend/scripts/shadow-settlement-verify.ts (raw PrismaClient, ts-node)
       │
       ├─► SELECT sample of completed Trip/DeliveryOrder rows
       ├─► For each: recompute new 3-way split from stored fare/fee
       │      using the SAME subtraction-based rounding formula as
       │      today's code (see Common Pitfalls)
       ├─► Diff recomputed driverEarnings/riderEarnings vs. stored value
       │      → must be EXACT match (D-06), no ±0.02 tolerance
       └─► Write report (console + output file) — pass/fail gate for
             "Stage 1 complete" before Stage 2 dual-run begins
```

### Recommended Project Structure
```
backend/
├── prisma/
│   └── schema.prisma          # + ShadowSettlementComparison model (if adopted)
├── scripts/
│   ├── smoke-infra.sh                        # existing
│   └── shadow-settlement-verify.ts           # NEW — Stage 1 batch script
├── src/
│   ├── modules/
│   │   ├── transport/
│   │   │   └── transport.service.ts          # completeTrip() modified
│   │   └── delivery/
│   │       └── delivery.service.ts           # completeDelivery() modified
│   └── common/
│       └── services/
│           └── settlement.service.ts         # unchanged — reused as-is
```

### Pattern 1: Two-explicit-recipient settlement call (Studio's template, adapted)

**What:** Resolve the earner (driver/rider) wallet and Ministry wallet, build a 2-entry `SettlementRecipient[]`, delegate to `SettlementService.settle()`. Platform's share is never explicitly computed by the caller — `SettlementService` derives it automatically as `chargeAmountNgn - claimedAmountNgn`.

**When to use:** Any module where the earner's payout is a "keep-the-fixed-percentage-unchanged" requirement (D-01) rather than a levy-reduces-payout model (Marketplace/Events/Stays).

**Example (adapted for Transport, following `studio.service.ts:157-211`'s structure):**
```typescript
// Source: backend/src/modules/studio/studio.service.ts:179-211 (existing pattern)
// and backend/src/common/services/settlement.service.ts:34-61 (SettlementRecipient/SettlementInput)

const feeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport.platform_fee_pct' },
});
const levyCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport.govt_levy_pct' },
});
const platformFeePct = feeCfg ? Number(feeCfg.value) : 10; // remainder of 15
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;

const fare = Number(trip.fare);
// D-01: preserve EXACT existing formula — platformFee computed first via the
// combined (govtLevyPct + platformFeePct) total, driverEarnings = fare - platformFee.
// Do NOT compute driverEarnings independently via fare * 0.85 (see Pitfall 1).
const totalCommissionPct = govtLevyPct + platformFeePct; // = 15, matches today's feePct
const totalCommission = Math.round(fare * (totalCommissionPct / 100) * 100) / 100;
const driverEarnings = Math.round((fare - totalCommission) * 100) / 100;
const govtLevyNgn = Math.round(fare * (govtLevyPct / 100) * 100) / 100;

const driverWallet = await this.prisma.wallet.findFirst({ where: { userId: driverUserId } });
const ministryWallet = await this.settlementService.resolveMinistryWallet();

const recipients: SettlementRecipient[] = [
  {
    tag: 'DRIVER',
    refSuffix: 'DRV',
    walletId: driverWallet?.id ?? null,
    amountNgn: driverEarnings,
    metadata: { tripId: trip.id },
  },
  {
    tag: 'MINISTRY',
    refSuffix: 'MINISTRY',
    walletId: ministryWallet?.id ?? null,
    amountNgn: govtLevyNgn,
    metadata: { tripId: trip.id },
  },
];

await this.settlementService.settle({
  module: 'transport',
  reference: `ISY-TRP-${tripId}`, // STABLE, deterministic — see Pitfall 2
  gateway: 'INTERNAL',
  amountKobo: fare * 100,
  recipients,
  buyerWalletId: null, // D-04 — no real rider wallet debit exists
  description: 'Trip completion settlement',
  platformMetadata: { tripId: trip.id, driverUserId },
  onSettled: async (tx) => {
    await tx.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED', completedAt: now, platformFee: totalCommission, driverEarnings },
    });
  },
  onFailure: async (err) => {
    // D-04: revert to a retryable state, NOT a refund attempt (no buyer wallet)
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'IN_PROGRESS' }, // or a dedicated 'SETTLEMENT_FAILED' status — planner decision
    });
  },
});
```

### Pattern 2: Stage 1 — historical batch re-verification script

**What:** A standalone script, run once (or a few times as confidence builds), that recomputes the new split for a sample of already-`COMPLETED`/`DELIVERED` rows and diffs against the values already stored in `Trip.driverEarnings`/`Trip.platformFee` (or the Delivery equivalents), without touching any wallet.

**When to use:** Before any live dual-run begins — this is the first, cheapest verification pass (no wallet risk at all, pure read-only computation).

**Example:**
```typescript
// Source: pattern mirrors backend/prisma/seed.ts:1-4 (raw PrismaClient, ts-node)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function verifyTransportShadow(sampleSize = 200) {
  const govtLevyCfg = await prisma.platformConfig.findUnique({ where: { key: 'transport.govt_levy_pct' } });
  const platformFeeCfg = await prisma.platformConfig.findUnique({ where: { key: 'transport.platform_fee_pct' } });
  const govtLevyPct = govtLevyCfg ? Number(govtLevyCfg.value) : 5;
  const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 10;

  const trips = await prisma.trip.findMany({
    where: { status: 'COMPLETED', fare: { not: null } },
    orderBy: { completedAt: 'desc' },
    take: sampleSize,
  });

  let mismatches = 0;
  const report: any[] = [];
  for (const trip of trips) {
    const fare = Number(trip.fare);
    const totalCommission = Math.round(fare * ((govtLevyPct + platformFeePct) / 100) * 100) / 100;
    const recomputedDriverEarnings = Math.round((fare - totalCommission) * 100) / 100;
    const storedDriverEarnings = Number(trip.driverEarnings);
    const match = recomputedDriverEarnings === storedDriverEarnings; // EXACT match, D-06
    if (!match) {
      mismatches++;
      report.push({ tripId: trip.id, storedDriverEarnings, recomputedDriverEarnings });
    }
  }

  console.log(`Transport Stage 1: ${trips.length} sampled, ${mismatches} mismatches`);
  if (report.length) console.table(report);
  // Write report file per D-06 "queryable report" requirement
  require('fs').writeFileSync(
    `shadow-report-transport-${Date.now()}.json`,
    JSON.stringify({ sampled: trips.length, mismatches, report }, null, 2),
  );
  return mismatches === 0;
}
```

### Pattern 3: Stage 2 — live dual-run bake-period persistence

**What:** Inside `completeTrip()`/`completeDelivery()`, when the cutover flag is still `false`, compute the shadow split alongside the real (old) crediting logic and persist a comparison row.

**When to use:** During the D-08 bake period — every real completion while the flag is off.

**Example (illustrative Prisma model + comparison call):**
```prisma
// Source: new model, following backend/prisma/schema.prisma:626-647 (Transaction) field conventions
model ShadowSettlementComparison {
  id              String   @id @default(uuid())
  module          String   // 'transport' | 'delivery'
  sourceId        String   // tripId or orderId
  oldEarnerAmount Decimal
  newEarnerAmount Decimal
  matched         Boolean
  comparedAt      DateTime @default(now())

  @@index([module, comparedAt])
  @@index([module, matched])
  @@map("shadow_settlement_comparisons")
}
```
```typescript
// Inline in completeTrip(), inside the existing $transaction, AFTER driverEarnings is
// computed the old way (unchanged) — non-blocking write, does not gate the response.
const shadowGovtLevyNgn = Math.round(fare * (govtLevyPct / 100) * 100) / 100;
const shadowTotalCommission = Math.round(fare * ((govtLevyPct + platformFeePct) / 100) * 100) / 100;
const shadowDriverEarnings = Math.round((fare - shadowTotalCommission) * 100) / 100;
await tx.shadowSettlementComparison.create({
  data: {
    module: 'transport',
    sourceId: tripId,
    oldEarnerAmount: driverEarnings,       // from the live (old) code path, unchanged
    newEarnerAmount: shadowDriverEarnings, // from the new engine's would-be computation
    matched: driverEarnings === shadowDriverEarnings,
  },
});
```

**Bake-period gate check (queryable, used to decide when a flag flip is safe):**
```typescript
const stats = await prisma.shadowSettlementComparison.aggregate({
  where: { module: 'transport' },
  _count: true,
  _min: { comparedAt: true },
});
const mismatchCount = await prisma.shadowSettlementComparison.count({
  where: { module: 'transport', matched: false },
});
const daysElapsed = (Date.now() - stats._min.comparedAt!.getTime()) / 86_400_000;
const gateOk = mismatchCount === 0 && daysElapsed >= 3 && stats._count >= 100;
```

### Anti-Patterns to Avoid
- **Recomputing driver/rider earnings via an independent percentage multiply instead of the existing subtraction formula:** breaks D-01's bit-for-bit requirement in edge cases where rounding intermediate steps differ (see Common Pitfalls, Pitfall 1).
- **Generating a fresh random UUID reference on every `completeTrip()` call (today's behavior):** breaks `SettlementService`'s idempotency precheck, which relies on a **stable, deterministic** reference per trip/delivery (`Transaction.reference: { startsWith: '${reference}-' }`). Must switch to a deterministic reference derived from `tripId`/`orderId` (see Common Pitfalls, Pitfall 2).
- **Calling `SettlementService.settle()` against historical `COMPLETED` rows in Stage 1:** would create real, duplicate wallet credits for trips already paid out. Stage 1 must be pure computation/diff, never a real `settle()` call.
- **Using `Logger`-only output as the sole record for Stage 2's multi-day bake period:** makes the D-08 gate ("3 days OR 100 tx, zero discrepancies") unqueryable programmatically; recommend a durable table (Pattern 3) instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-wallet credit with row locking | A new custom `$transaction` block per module (what `completeTrip`/`completeDelivery` do today) | `SettlementService.settle()` | This is the entire point of Phase 12 — `SettlementService` already has `SELECT FOR UPDATE` canonical-order locking (deadlock prevention across concurrent settlements sharing wallets), idempotency, drift-tolerance, and audit-trail creation. Re-implementing any part of this for Transport/Delivery reintroduces exactly the bug class (CR-01 deadlock, WR-01 silent-rollback-reported-as-success) Phase 12 fixed. |
| Ministry wallet lookup | A per-module `government_wallet_user_id` PlatformConfig key | `SettlementService.resolveMinistryWallet()` | Already reused unmodified by 4 other modules (Marketplace, Events, Studio, Stays) — confirmed via grep, zero exceptions. Building a Transport/Delivery-specific variant would be inconsistent with established precedent and unnecessary generalization the CONTEXT.md scouting flagged as unresolved but which the codebase already answers. |
| Idempotency / replay detection | Custom `updateMany({ where: { status: 'IN_PROGRESS' }})` count-based guard (today's mechanism, kept for the trip-state transition only) | `SettlementService`'s `Transaction.reference` prefix precheck + `P2002` race fallback | The trip-status guard still has a legitimate, separate job (preventing `completeTrip` from re-running its non-wallet side effects like `TripEvent` creation) but must NOT be the only defense against double-crediting once `SettlementService` is in the picture — the reference-prefix idempotency is what protects the wallet layer specifically. |

**Key insight:** This phase's entire "don't hand-roll" surface is Phase 12's own `SettlementService` — the risk here is not "should we build vs. buy" (already decided) but "will the migration correctly delegate 100% of the wallet-touching logic, or will some legacy inline `$transaction` code survive alongside the new call and create a double-credit path." The planner should treat any surviving direct `tx.wallet.update()` call inside `completeTrip`/`completeDelivery` post-cutover as a defect.

## Common Pitfalls

### Pitfall 1: Rounding formula mismatch breaks D-01's exact-match requirement
**What goes wrong:** Today's code computes `platformFee = round(fare × feePct/100)` THEN `driverEarnings = round(fare − platformFee)`. If the new code instead computes `driverEarnings = round(fare × 0.85)` independently, the two values can differ by ₦0.01 on certain fare amounts due to when rounding is applied (subtract-then-round vs. multiply-then-round can diverge for values ending in exact half-kobo).
**Why it happens:** It looks equivalent algebraically (`fare − fare×0.15 == fare×0.85`), but floating-point/kobo-rounding at each step is order-dependent.
**How to avoid:** Compute the driver/rider leg exactly as shown in Pattern 1/2 above: first compute the combined commission (`govtLevyPct + platformFeePct` = today's single `feePct`), round it, THEN subtract from fare to get the earner's amount. Verify this against Stage 1's batch script before touching any live code — if Stage 1 shows zero mismatches against ALL historical completed trips, the formula is provably correct.
**Warning signs:** Stage 1 batch script reports non-zero mismatches even though "the split logic looks the same" — this is the first thing to suspect.

### Pitfall 2: Idempotency reference scheme mismatch
**What goes wrong:** Today's `completeTrip`/`completeDelivery` generate `ref = ISY-DRV-${uuidv4()...}` / `ISY-RDR-${uuidv4()...}` — a **fresh random UUID on every call**. `SettlementService.settle()` expects a **stable, deterministic** `input.reference` so its `Transaction.reference: { startsWith: '${reference}-' }` precheck can detect "this trip/delivery was already settled" on a retry.
**Why it happens:** The old code's idempotency lived entirely in the trip-status guard (`updateMany({ where: { status: 'IN_PROGRESS' }})`), not in the reference string — the random UUID was fine because nothing keyed off it for replay detection.
**How to avoid:** Use a deterministic reference derived from the trip/order id, e.g. `ISY-TRP-${tripId}` / `ISY-DLV-${orderId}` (not a fresh UUID). This is called out explicitly in CONTEXT.md's Scouting Findings and confirmed here by reading `settlement.service.ts:94-103`'s precheck logic directly.
**Warning signs:** A retried `completeTrip()` call (e.g., after a network timeout on the client) creates a second, non-idempotent credit instead of being recognized as a replay.

### Pitfall 3: `Trip.platformFee`/`DeliveryOrder.platformFee` semantic drift
**What goes wrong:** These two Decimal columns exist today as the SINGLE platform commission value. Post-cutover, the "platform's actual commission" is now smaller (only `platformFeePct`'s share) while a NEW Ministry share also exists. If `platformFee` is written as just the smaller `platformFeePct` portion post-cutover, any historical query or admin report reading `Trip.platformFee` (verified: no such reads exist today outside `transport.service.ts`/`delivery.service.ts` themselves and their spec files — confirmed via grep of `backend/src`) would see a value that's no longer comparable to pre-cutover rows.
**Why it happens:** Schema wasn't designed with a govt-levy field on `Trip`/`DeliveryOrder` (unlike `Booking.govtLevyPct` added in Phase 12 D-11 for Stays).
**How to avoid:** Recommend keeping `Trip.platformFee`/`DeliveryOrder.platformFee` as the TOTAL commission (`govtLevyPct + platformFeePct` combined, i.e., unchanged in meaning from today) for backward compatibility, since no downstream consumer needs the split visible on the `Trip`/`DeliveryOrder` row itself — the actual govt/platform breakdown is fully visible via `SettlementService`'s `Transaction` audit rows (`recipientType: 'MINISTRY'` vs. the platform's system-wallet row), which is exactly what SETTLE-07's itemized statement retrieval already exposes. This avoids a schema migration and preserves any existing dashboard math. Flag this as a planner decision to confirm — it is not explicitly locked in CONTEXT.md.
**Warning signs:** A future Ministry Dashboard (Phase 14) query against `Trip.platformFee` expecting "government's share" instead gets "platform's + government's share combined," or vice versa if the meaning silently changes mid-migration.

### Pitfall 4: `onFailure` reverting trip status to a state that re-triggers side effects
**What goes wrong:** D-04 specifies `onFailure` should revert the trip/delivery to "a retryable state" rather than attempt a refund. If it's reverted to `IN_PROGRESS`, a client retry of `completeTrip()` will re-run `TripEvent.create({ event: 'TRIP_COMPLETED' })` and any WebSocket emits, potentially duplicating side effects that aren't themselves idempotent (unlike the wallet credit, which `SettlementService` protects).
**Why it happens:** The trip/delivery model doesn't currently have a dedicated "settlement failed, needs retry" status distinct from `IN_PROGRESS`.
**How to avoid:** Planner should decide explicitly whether to (a) revert to `IN_PROGRESS` and accept that a retry re-runs the full `completeTrip()` flow (acceptable since `SettlementService`'s idempotency makes the wallet-crediting half of a retry a safe no-op replay), or (b) add a new `TripStatus`/`DeliveryOrderStatus` enum value (e.g. `SETTLEMENT_FAILED`) requiring an explicit retry action. Given this is a LOW-frequency failure path (settlement only fails on drift >₦0.02 or a genuine DB error) and CONTEXT.md doesn't mandate a new enum value, option (a) is simpler and lower-risk for this phase; flag as `[ASSUMED]`.

### Pitfall 5: Stage 2 shadow-write failure blocking the real (old) crediting path
**What goes wrong:** If the `ShadowSettlementComparison.create()` write inside the existing `$transaction` throws (e.g., a schema/migration issue), it would roll back the ENTIRE transaction — including the real driver/rider wallet credit — even though the flag is still `false` and live payouts should be completely unaffected by shadow-mode instrumentation.
**Why it happens:** Placing the shadow-write inside the same `tx` as the real credit couples their failure modes.
**How to avoid:** Either (a) place the shadow comparison write in a separate, best-effort `try/catch` OUTSIDE the main `$transaction` (fire-and-forget after the real credit commits, matching the existing pattern where audit-log failures are swallowed per CLAUDE.md's Error Handling conventions: "Audit log failures are swallowed silently... to prevent auth flows from failing on non-critical logging"), or (b) wrap only the shadow-write in its own try/catch inside the transaction so a throw there doesn't propagate. Recommend (a) — matches existing project convention exactly and fully decouples shadow-mode risk from the live payout path, which is the entire point of D-05's "zero risk to live payouts" design.
**Warning signs:** A migration or Prisma client generation issue for the new `ShadowSettlementComparison` model silently breaks live trip completion during the bake period — the opposite of what shadow mode is supposed to guarantee.

## Code Examples

### Existing template: Studio's 2-recipient settlement call (closest precedent)
```typescript
// Source: backend/src/modules/studio/studio.service.ts:179-211 (Phase 12, already in production pattern)
const ministryWallet = await this.settlementService.resolveMinistryWallet();
const buyerWallet = await this.prisma.wallet.findUnique({ where: { userId: booking.userId } });

const settlementResult = await this.settlementService.settle({
  module: 'studio',
  reference: payload.reference,
  gateway: 'PAYSTACK',
  amountKobo: total * 100,
  recipients: [
    { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { bookingId: booking.id } },
  ],
  buyerWalletId: buyerWallet?.id,
  description: 'Studio booking commission',
  onSettled: async (tx) => { await tx.studioBooking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } }); },
  onFailure: async (err) => { /* status → CANCELLED */ },
});
```

### Existing idempotency precheck (why the reference scheme must change)
```typescript
// Source: backend/src/common/services/settlement.service.ts:94-103
const existing = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${input.reference}-` } },
  select: { id: true },
});
if (existing) {
  // ... replay no-op
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Transport: inline `$transaction` crediting only the driver wallet at 85% | `SettlementService.settle()` 2-explicit-recipient call (DRIVER + MINISTRY, platform implicit) | This phase (SETTLE-03) | Ministry and platform wallets receive real credits for the first time; driver payout unchanged |
| Delivery: inline `$transaction` crediting only the rider wallet at 80% | Same pattern, RIDER + MINISTRY | This phase (SETTLE-04) | Same as above for Delivery |
| Random-UUID reference per completion (`ISY-DRV-*`/`ISY-RDR-*`) | Deterministic reference (`ISY-TRP-${tripId}`/`ISY-DLV-${orderId}`) | This phase | Enables `SettlementService`'s idempotency precheck to actually detect replays for these two modules |
| No shadow/dry-run infrastructure anywhere in the codebase | Two-stage shadow verification (batch script + live dual-run) | This phase, built from scratch | First precedent for safe, verified cutovers in this codebase — reusable pattern for any FUTURE hardcoded-split module found |

**Deprecated/outdated:**
- The `transport_platform_fee_pct` / `delivery_platform_fee_pct` flat keys (seeded at `seed.ts:1269`, `1299`) are superseded by the two-key split (`transport.govt_levy_pct` + `transport.platform_fee_pct`, and delivery equivalents) — note the **naming convention also changes**: existing keys use `transport_platform_fee_pct` (underscore-joined, no module-dot prefix), while every Phase 12 module uses the `module.key_name` dot-convention (`events.platform_fee_pct`, `studio.govt_levy_pct`, `stays.govt_levy_pct`, `marketplace.platform_fee_pct`). The planner should follow the Phase 12 dot-convention for the two NEW keys (`transport.govt_levy_pct`, `transport.platform_fee_pct`) for consistency, while deciding whether to keep the old `transport_platform_fee_pct`/`delivery_platform_fee_pct` keys around (harmless if orphaned) or remove them in the Phase 13 cleanup pass alongside the legacy code path (D-08).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Trip.platformFee`/`DeliveryOrder.platformFee` should continue storing the COMBINED (govt+platform) commission total post-cutover, not just the platform's smaller share, for backward compatibility | Pitfall 3 | If wrong, any future consumer (e.g. Phase 14 Ministry Dashboard) reading these fields directly gets a misleading number; low risk since verified no current consumer reads these fields outside Transport/Delivery's own service+spec files |
| A2 | `onFailure` should revert trip/delivery status to `IN_PROGRESS` (existing enum value) rather than introduce a new `SETTLEMENT_FAILED` status | Pitfall 4 | If wrong, a client retry after a settlement failure could re-trigger non-idempotent side effects (duplicate `TripEvent`/WebSocket emits); mitigated because wallet-crediting itself stays idempotent via `SettlementService` |
| A3 | A new `ShadowSettlementComparison` Prisma table (not log-scraping) is the right persistence mechanism for Stage 2's multi-day bake-period gate | Pattern 3, Alternatives Considered | If wrong (e.g., team prefers zero-schema-change and is fine querying Grafana/OTel logs), the planner should size a schema migration for this table as part of Phase 13's task list, which is additional scope not explicitly named in CONTEXT.md's Decisions — CONTEXT.md's D-06 language ("script output file or simple summary") leans toward file/log output specifically for Stage 1, and is ambiguous for Stage 2's cross-request persistence needs |
| A4 | The two new `PlatformConfig` keys should use the Phase 12 dot-convention (`transport.govt_levy_pct`) rather than matching the OLD underscore convention already seeded (`transport_platform_fee_pct`) | State of the Art | If wrong, inconsistent naming persists; low risk either way since `PlatformConfig` keys are just DB rows, not compile-time constants |

## Open Questions

1. **Should `Trip.platformFee`/`DeliveryOrder.platformFee` be split into two DB columns (mirroring `govtLevy` on `Order`) instead of staying a combined total?**
   - What we know: No current code reads these fields outside Transport/Delivery's own modules and their specs.
   - What's unclear: Whether Phase 14 (Ministry Dashboard) will want to query `Trip`/`DeliveryOrder` directly for govt-share reporting rather than going through `SettlementService`'s `Transaction` audit trail exclusively.
   - Recommendation: Keep as a combined total this phase (Assumption A1) since Phase 14 is explicitly scoped to consume the Ministry wallet's `Transaction` ledger (per `MIN-04`: "sourced from the standing Ministry wallet's transaction ledger"), not `Trip`/`DeliveryOrder` fields directly — this is corroborated by REQUIREMENTS.md's MIN-04 wording. Low risk to defer any schema split.

2. **Should the `ShadowSettlementComparison` table (or equivalent) be a net-new addition, and should the planner size a migration for it in Wave 0?**
   - What we know: Zero shadow/dry-run infra exists; D-06 mentions "script output file or simple summary" for reporting, not explicitly a DB table.
   - What's unclear: Whether "simple summary" was intended to cover the entire Stage 2 multi-day bake period tracking, or only Stage 1's one-shot report.
   - Recommendation: Treat this as a planner decision informed by Assumption A3 above — a lightweight table is the most reliable mechanism for a programmatic go/no-go gate spanning multiple days and hundreds of live requests; a Logger-only approach works but requires manual/Grafana-assisted counting, which is more failure-prone for a government-payments go-live gate.

## Environment Availability

Skipped — this phase has no new external service/tool dependencies. All required infrastructure (PostgreSQL via Prisma, `ts-node`, existing `SettlementService`) is already installed and verified present in `backend/package.json` and confirmed live via `npm view @nestjs/core version`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x (`backend/jest.config.js`) |
| Config file | `backend/jest.config.js` (rootDir: `src`, testRegex `.*\.spec\.ts$`) |
| Quick run command | `cd backend && npx jest transport.service.spec --silent` (or `delivery.service.spec`, `settlement.service.spec`) |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETTLE-03 | `completeTrip()` credits driver (unchanged 85%), Ministry (new), platform (implicit) via `SettlementService.settle()` | unit | `npx jest transport.service.spec -t completeTrip` | ✅ existing spec at `backend/src/modules/transport/__tests__/transport.service.spec.ts:626-681` — needs rewrite for new call shape (mocks currently assert direct `$transaction`/`wallet.update`, must be updated to assert `SettlementService.settle()` was called with correct recipients, mirroring `tour-settlement.service.spec.ts`'s or `settlement.service.spec.ts`'s `wireTransaction()` mock-capture technique) |
| SETTLE-04 | `completeDelivery()` same pattern for RIDER | unit | `npx jest delivery.service.spec -t completeDelivery` | ✅ existing spec at `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` — same rewrite needed |
| SETTLE-09 | Shadow-mode Stage 1 batch verification produces zero discrepancies against historical sample | integration/manual | `ts-node scripts/shadow-settlement-verify.ts` (new script, run against a DB snapshot or staging replica) | ❌ Wave 0 — net-new script, no existing test harness for "run against real historical data" style verification |
| SETTLE-09 | Shadow-mode Stage 2 live dual-run persists comparison rows with `matched: true` for every real completion during bake period | unit + manual bake period | `npx jest transport.service.spec -t shadow` (new test asserting `ShadowSettlementComparison.create` called with `matched: true` for representative fare values) + live 3-day/100-tx observation | ❌ Wave 0 — both the new Prisma model and its test coverage are net-new |
| SETTLE-09 | Cutover flag (`transport.settlement_engine_enabled`) gates old-vs-new code path correctly, including instant rollback | unit | `npx jest transport.service.spec -t "settlement_engine_enabled"` | ❌ Wave 0 — new test needed for both `true` and `false` flag states |

### Sampling Rate
- **Per task commit:** `npx jest transport.service.spec delivery.service.spec settlement.service.spec --silent`
- **Per wave merge:** `npm test` (full backend suite, including `tour-settlement.service.spec.ts` to confirm no regression to the shared `SettlementService` contract)
- **Phase gate:** Full suite green + Stage 1 batch script run against production-like historical data (zero mismatches) + Stage 2 bake-period gate satisfied (D-08: 3 days OR 100 tx, zero discrepancies) BEFORE `/gsd-verify-work` and BEFORE either cutover flag flips to `true`.

### Wave 0 Gaps
- [ ] `backend/scripts/shadow-settlement-verify.ts` — Stage 1 batch script (net-new, no existing pattern to extend beyond `seed.ts`'s raw-`PrismaClient` convention)
- [ ] `ShadowSettlementComparison` Prisma model + migration (if Assumption A3 is accepted) — net-new, needs `prisma migrate dev`
- [ ] Rewrite of `backend/src/modules/transport/__tests__/transport.service.spec.ts`'s `completeTrip` describe block — current mocks assert the OLD direct-`$transaction` shape; must be updated to mock `SettlementService.settle()` (inject a mock `SettlementService` the way `marketplace.service.spec.ts`/`studio.service.spec.ts`/`stays.service.spec.ts` already mock `resolveMinistryWallet` — see `backend\src\modules\studio\__tests__\studio.service.spec.ts:17`)
- [ ] Same rewrite for `backend/src/modules/delivery/__tests__/delivery.service.spec.ts`'s `completeDelivery` describe block
- [ ] New test coverage for the cutover flag branch (both `true`/`false` states) in both service spec files

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No change this phase | Existing `JwtAuthGuard` on `PATCH trips/:id/complete`/`PATCH orders/:id/complete` unchanged |
| V3 Session Management | No change this phase | Unchanged |
| V4 Access Control | Yes | `@Roles(UserRole.DRIVER)` guard already restricts `completeTrip`/`completeDelivery` to the assigned driver/rider — unchanged by this phase; the NEW cutover-flag read and shadow-comparison table have no independent HTTP surface in this design (Stage 1 is a script, Stage 2 is inline), so no new access-control surface is introduced unless the planner adds an admin endpoint to inspect bake-period stats (recommend gating any such endpoint `@Roles(SUPER_ADMIN)`, matching `SettlementController`'s existing pattern) |
| V5 Input Validation | No change this phase | `CompleteTripDto`/`CompleteDeliveryDto` unchanged; no new user-facing input surface introduced by the settlement-engine convergence itself |
| V6 Cryptography | No change this phase | No new secrets/crypto surface |
| V9 Communications | N/A | Internal server-side changes only |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Double-crediting via non-idempotent replay (e.g., client retries `completeTrip()` after a timeout) | Tampering / Repudiation | Already mitigated by `SettlementService`'s `Transaction.reference` prefix precheck + `P2002` race fallback — CRITICAL that the reference scheme change (Pitfall 2) is implemented correctly, since this is the exact mechanism protecting against double-payout on this financial write path |
| Race condition / deadlock between two concurrent settlements sharing wallets (e.g., Ministry wallet locked by both a Transport and a Delivery completion at once) | Denial of Service | Already mitigated by `SettlementService`'s canonical (sorted-by-walletId) lock ordering across ALL recipients — this is exactly why Transport/Delivery MUST delegate to the shared service rather than hand-roll their own lock order, since the Ministry wallet is now a lock contended by potentially 6 modules simultaneously (Tour, Marketplace, Events, Studio, Stays, and now Transport/Delivery) |
| Silent financial drift from rounding inconsistency between old and new code paths going undetected | Tampering (undetected value manipulation, even if unintentional) | This is the ENTIRE purpose of SETTLE-09's shadow-mode requirement — the two-stage verification harness this research designs IS the mitigation; no additional control needed beyond correctly implementing D-05/D-06/D-08 |
| Cutover flag manipulation by an unauthorized actor flipping the kill switch | Elevation of Privilege / Tampering | `PlatformConfig` writes are not exposed via any public API in this codebase today (confirmed: no `PlatformConfig` mutation endpoint found in this research pass) — if the planner adds an admin UI/endpoint for flipping the cutover flag, it MUST be `@Roles(SUPER_ADMIN)`-gated; if the flag is only ever changed via direct DB/seed access (current apparent convention for all other `PlatformConfig` values), no new endpoint is needed and this risk doesn't materialize |

## Sources

### Primary (HIGH confidence — direct codebase reads, this session)
- `backend/src/common/services/settlement.service.ts` (351 lines, read in full) — `SettlementService.settle()`, `resolveMinistryWallet()`, idempotency/drift/lock-order mechanics
- `backend/src/modules/tour-bookings/tour-settlement.service.ts` (382 lines, read in full) — N-way reference template
- `backend/src/modules/studio/studio.service.ts:140-229` — closest 2-recipient template
- `backend/src/modules/transport/transport.service.ts:460-620` — `completeTrip()` current implementation, read in full
- `backend/src/modules/delivery/delivery.service.ts:480-631` — `completeDelivery()` current implementation, read in full
- `backend/prisma/schema.prisma:743-855` — `Trip`/`DeliveryOrder`/`TripEvent`/`DeliveryEvent` models, read in full
- `backend/src/modules/marketplace/marketplace.service.ts:150-220` — `createOrder()` split-computation precedent (govtLevy pattern)
- `backend/prisma/seed.ts:1269, 1299, 1445-1514` — PlatformConfig seeding conventions, grepped and read
- `backend/src/common/controllers/settlement.controller.ts` (95 lines, read in full) — SETTLE-07 statement endpoint, informs Security Domain
- `backend/src/common/services/__tests__/settlement.service.spec.ts:1-90` — testing convention (`wireTransaction()` mock-capture technique)
- `backend/src/modules/transport/__tests__/transport.service.spec.ts:1-60, 626-681` — existing `completeTrip` test, needs rewrite
- `backend/package.json`, `backend/jest.config.js` — build/test tooling, read in full
- Grep across `backend/src` for `resolveMinistryWallet`/`government_wallet_user_id` — confirmed 4 existing call sites all reuse the shared wallet unmodified
- Grep for `platformFee|driverEarnings|riderEarnings` across `backend/src` — confirmed no cross-module dashboard/report dependency on `Trip.platformFee`/`DeliveryOrder.platformFee` beyond Transport/Delivery themselves
- Grep for `NestFactory.createApplicationContext` across `backend/` — zero hits, confirms no existing standalone-Nest-context script pattern
- `npm view @nestjs/core version` — confirmed registry reachable, current version `11.1.28`

### Secondary (MEDIUM confidence)
- None — all findings in this phase were directly verifiable against the local codebase; no external library/API research was required.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all reused infrastructure directly read and confirmed
- Architecture: HIGH — patterns directly derived from 4 existing, working Phase 12 call sites in this exact codebase
- Shadow-mode harness design: MEDIUM — this is genuinely novel design work (confirmed zero prior art in the codebase), so while the design choices are well-justified against existing conventions (raw-`PrismaClient` scripts, `Logger` patterns, CLAUDE.md's audit-log-failure-swallowing convention), they are recommendations rather than verified-against-precedent facts; flagged via the Assumptions Log (A3 especially)
- Pitfalls: HIGH — all five pitfalls are derived from direct reads of the exact current implementation, not speculation

**Research date:** 2026-07-17
**Valid until:** 30 days (stable internal codebase, low external-dependency churn risk for this phase)
