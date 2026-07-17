# Phase 13: Settlement Cutover — Transport & Delivery - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 9
**Analogs found:** 7 / 9 (2 net-new with no direct analog — shadow-verify script, ShadowSettlementComparison model)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/modules/transport/transport.service.ts` (`completeTrip`) | service | CRUD (settlement fan-out) | `backend/src/modules/studio/studio.service.ts` (`handleStudioPayment`, lines 157-230) | role-match (2-recipient template; Studio is event-driven via `@OnEvent`, Transport is direct HTTP — data-flow differs slightly, structure identical) |
| `backend/src/modules/delivery/delivery.service.ts` (`completeDelivery`) | service | CRUD (settlement fan-out) | Same as above | role-match |
| `backend/src/common/services/settlement.service.ts` | service | CRUD (reused, not modified) | N/A — this IS the shared engine | exact (no changes needed, only consumed) |
| `backend/prisma/schema.prisma` (new `PlatformConfig` keys — data only, no schema change) | config | CRUD | N/A — `PlatformConfig` rows only, no migration for the fee keys | exact |
| `backend/prisma/schema.prisma` (`ShadowSettlementComparison` model, if adopted) | model | CRUD | `Transaction` model (`schema.prisma:627-648`) — closest existing model for a small audit/comparison row shape | role-match (net-new concept, no direct analog for "shadow comparison" semantics) |
| `backend/prisma/seed.ts` (new `transport.govt_levy_pct` / `transport.platform_fee_pct` / `delivery.govt_levy_pct` / `delivery.platform_fee_pct` keys) | config/seed | batch | `backend/prisma/seed.ts:1468-1514` (Events/Studio/Stays dot-convention seeding block) | exact |
| `backend/scripts/shadow-settlement-verify.ts` (NEW) | utility | batch/transform | `backend/prisma/seed.ts:1-10` + `backend/seed-demo.js` (raw-`PrismaClient` standalone-script convention) | role-match (no prior "diff/verify" script exists; convention-match only) |
| `backend/src/modules/transport/__tests__/transport.service.spec.ts` (`completeTrip` describe block — rewrite) | test | request-response | `backend/src/modules/studio/__tests__/studio.service.spec.ts:1-55` (mock `SettlementService` shape) | exact |
| `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (`completeDelivery` describe block — rewrite) | test | request-response | Same as above | exact |

## Pattern Assignments

### `backend/src/modules/transport/transport.service.ts` — `completeTrip()` (service, CRUD/settlement fan-out)

**Analog:** `backend/src/modules/studio/studio.service.ts:157-230` (`handleStudioPayment`) — closest 2-explicit-recipient template. Also cross-reference `backend/src/modules/tour-bookings/tour-settlement.service.ts:217-271` for the "resolve recipients then delegate" shape at N-way scale.

**Current imports** (`transport.service.ts:1-23`):
```typescript
import {
  Injectable, Logger, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException, Inject, forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { TransportGateway } from './transport.gateway';
import { TripStatus, VehicleType } from '@prisma/client';
import { CreateDriverDto } from './dto/create-driver.dto';
// ...other DTOs
import { CompleteTripDto } from './dto/complete-trip.dto';
```
**Add:** `import { SettlementService, SettlementRecipient } from '../../common/services/settlement.service';` — `SettlementService` is `@Global()` via `CommonModule` (already imported once in `AppModule`), so no `TransportModule` import list change is needed, only constructor injection.

**Constructor injection pattern** (`transport.service.ts:44-54`, add `settlementService` alongside existing DI):
```typescript
constructor(
  private prisma: PrismaService,
  private redis: RedisService,
  private walletService: WalletService,
  private schedulerRegistry: SchedulerRegistry,
  @Inject(forwardRef(() => TransportGateway)) private gateway: TransportGateway,
  private settlementService: SettlementService, // NEW
) {}
```
(Mirrors `studio.service.ts:42-49`'s plain constructor-param DI — no `forwardRef` needed for `SettlementService`.)

**Current `completeTrip()` implementation to replace** (`transport.service.ts:503-586`) — the exact inline `$transaction` being converged onto `SettlementService.settle()`:
```typescript
// Read platform fee from PlatformConfig — NEVER hardcode
const feeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport_platform_fee_pct' },
});
const feePct = feeCfg ? Number(feeCfg.value) : 15;

const fare = Number(trip.fare);
const platformFee = Math.round(fare * (feePct / 100) * 100) / 100;
const driverEarnings = Math.round((fare - platformFee) * 100) / 100;

const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
// ... inline $transaction: updateMany(status='IN_PROGRESS' guard) + tripEvent.create +
//     driver-only wallet SELECT FOR UPDATE + credit + Transaction.create
```
D-01/Pitfall-1 constraint: **preserve this exact subtraction-based rounding formula** for `driverEarnings` — `platformFee = round(fare * feePct/100)`, then `driverEarnings = round(fare - platformFee)`. Do not reimplement via independent `fare * 0.85` multiply.

**Target shape — Studio's 2-recipient delegation pattern** (`studio.service.ts:170-211`, adapt module/tag names for Transport):
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'transport.platform_fee_pct' } });
const platformFeePct = feeCfg ? Number(feeCfg.value) : 10; // remainder of 15
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'transport.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;

const fare = Number(trip.fare);
// D-01: combined total must equal today's single feePct=15, formula order preserved
const totalCommissionPct = govtLevyPct + platformFeePct;
const totalCommission = Math.round(fare * (totalCommissionPct / 100) * 100) / 100;
const driverEarnings = Math.round((fare - totalCommission) * 100) / 100;
const govtLevyNgn = Math.round(fare * (govtLevyPct / 100) * 100) / 100;

const driverWallet = await this.prisma.wallet.findFirst({ where: { userId: driverUserId } });
const ministryWallet = await this.settlementService.resolveMinistryWallet();

const recipients: SettlementRecipient[] = [
  { tag: 'DRIVER', refSuffix: 'DRV', walletId: driverWallet?.id ?? null, amountNgn: driverEarnings, metadata: { tripId } },
  { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { tripId } },
];

await this.settlementService.settle({
  module: 'transport',
  reference: `ISY-TRP-${tripId}`, // DETERMINISTIC — not uuidv4() (Pitfall 2)
  gateway: 'INTERNAL',
  amountKobo: fare * 100,
  recipients,
  buyerWalletId: null, // D-04 — no real rider wallet debit exists
  description: 'Trip completion settlement',
  platformMetadata: { tripId, driverUserId },
  onSettled: async (tx) => {
    await tx.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED', completedAt: now, platformFee: totalCommission, driverEarnings, ...(dto?.driverRating && { driverRating: dto.driverRating }) },
    });
    await tx.tripEvent.create({ data: { tripId, event: 'TRIP_COMPLETED' } });
  },
  onFailure: async (err) => {
    // D-04/Pitfall-4: revert to retryable state, no refund attempt
    await this.prisma.trip.update({ where: { id: tripId }, data: { status: 'IN_PROGRESS' } });
  },
});
```

**Idempotency note (Pitfall 2, mandatory change):** the existing `updateMany({ where: { status: 'IN_PROGRESS' } })` count-guard (`transport.service.ts:536-549`) stays for the status-transition side effect, but must move inside `onSettled` (it can no longer be the sole idempotency mechanism — see Anti-Pattern in RESEARCH.md). The wallet layer's idempotency is now `SettlementService`'s reference-prefix precheck, which requires the reference to change from `ISY-DRV-${uuidv4()...}` to a deterministic `ISY-TRP-${tripId}`.

**Cutover flag gate (D-07, wraps the whole block above):**
```typescript
const cutoverCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'transport.settlement_engine_enabled' } });
const cutoverEnabled = cutoverCfg ? Boolean(cutoverCfg.value) : false;
if (cutoverEnabled) {
  // new SettlementService.settle() path (above)
} else {
  // existing inline $transaction path (transport.service.ts:535-578), UNCHANGED
  // + Stage 2 shadow-comparison write, fire-and-forget OUTSIDE the $transaction (Pitfall 5)
}
```

---

### `backend/src/modules/delivery/delivery.service.ts` — `completeDelivery()` (service, CRUD/settlement fan-out)

**Analog:** Same as Transport — `studio.service.ts:157-230`. Mirror Transport's exact structure with RIDER instead of DRIVER.

**Current imports** (`delivery.service.ts:1-27`) — already imports `S3Service` and `ResilienceService` directly (not `@Global()`-only), confirming per-module explicit-import-of-common-service is an established pattern:
```typescript
import { S3Service } from '../../common/services/s3.service';
import { ResilienceService } from '../../resilience/resilience.service';
```
**Add:** `import { SettlementService, SettlementRecipient } from '../../common/services/settlement.service';`

**Constructor** (`delivery.service.ts:59+`) — add `private settlementService: SettlementService,` alongside existing params (same DI pattern as Transport above).

**Current `completeDelivery()` implementation to replace** (`delivery.service.ts:516-616`):
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery_platform_fee_pct' },
});
const feePct = feeCfg ? Number(feeCfg.value) : 20;

const fee = Number(order.fee);
const riderEarnings = Math.round(fee * (1 - feePct / 100) * 100) / 100;
const platformFee = Math.round((fee - riderEarnings) * 100) / 100;

const ref = `ISY-RDR-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
// ... inline $transaction: deliveryOrder.update(status=DELIVERED) + deliveryEvent.create +
//     rider-only wallet SELECT FOR UPDATE + credit + Transaction.create
```
Note the formula is `riderEarnings = round(fee * (1 - feePct/100))` (multiply-first) rather than Transport's subtract-first — **preserve this exact existing order of operations** per D-01/Pitfall-1 (do NOT normalize the two modules' formulas to match each other; each must stay bit-for-bit identical to its own current output).

**Target shape** (mirrors Transport's Pattern 1 above, RIDER + fee):
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'delivery.platform_fee_pct' } });
const platformFeePct = feeCfg ? Number(feeCfg.value) : 15; // remainder of 20
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'delivery.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;

const fee = Number(order.fee);
const totalCommissionPct = govtLevyPct + platformFeePct; // = 20, matches today's feePct
const riderEarnings = Math.round(fee * (1 - totalCommissionPct / 100) * 100) / 100; // PRESERVE multiply-first order
const totalCommission = Math.round((fee - riderEarnings) * 100) / 100;
const govtLevyNgn = Math.round(fee * (govtLevyPct / 100) * 100) / 100;

const riderWallet = await this.prisma.wallet.findFirst({ where: { userId: riderUserId } });
const ministryWallet = await this.settlementService.resolveMinistryWallet();

const recipients: SettlementRecipient[] = [
  { tag: 'RIDER', refSuffix: 'RDR', walletId: riderWallet?.id ?? null, amountNgn: riderEarnings, metadata: { orderId } },
  { tag: 'MINISTRY', refSuffix: 'MINISTRY', walletId: ministryWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { orderId } },
];

await this.settlementService.settle({
  module: 'delivery',
  reference: `ISY-DLV-${orderId}`, // DETERMINISTIC (Pitfall 2)
  gateway: 'INTERNAL',
  amountKobo: fee * 100,
  recipients,
  buyerWalletId: null, // D-04
  description: 'Delivery completion settlement',
  platformMetadata: { orderId, riderUserId },
  onSettled: async (tx) => {
    await tx.deliveryOrder.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', completedAt: now, proofPhotoUrl, platformFee: totalCommission, riderEarnings, ...(dto.senderRating && { senderRating: dto.senderRating }) },
    });
    await tx.deliveryEvent.create({ data: { orderId, event: 'DELIVERY_COMPLETED' } });
  },
  onFailure: async (err) => {
    await this.prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: 'PICKED_UP' } }); // retryable — must remain in a `completable status` per line 526's guard
  },
});
```
The `otpVerifiedAt` / proof-photo dual-gate checks (`delivery.service.ts:530-546`) run BEFORE this block, unchanged.

**Cutover flag gate:** identical shape to Transport, keyed on `delivery.settlement_engine_enabled`.

---

### `backend/src/common/services/settlement.service.ts` (reused, NOT modified)

No changes required. Confirm the following contract points before wiring Transport/Delivery against it:
- `resolveMinistryWallet()` (`settlement.service.ts:321-328`) reads only `tour.government_wallet_user_id` — reuse as-is, zero parameters, per RESEARCH.md's confirmation that 4 other modules already do this unmodified.
- Idempotency precheck (`settlement.service.ts:94-103`): `Transaction.findFirst({ reference: { startsWith: '${input.reference}-' } })` — this is WHY the reference scheme must change to `ISY-TRP-${tripId}` / `ISY-DLV-${orderId}` (Pitfall 2).
- Drift-tolerance assert (`settlement.service.ts:118-144`): platform commission = `chargeAmountNgn - claimedAmountNgn`, throws + calls `handleSettlementFailure` if drift exceeds ₦0.02.
- `handleSettlementFailure` (`settlement.service.ts:262-296`): since `buyerWalletId: null` for both modules, the `RefundService.refund()` branch (lines 263-281) is a no-op — only `input.onFailure` runs (D-04 confirmed safe).

---

### `backend/prisma/seed.ts` — new `PlatformConfig` keys

**Analog:** `backend/prisma/seed.ts:1468-1514` (Events/Studio/Stays dot-convention block) — this is the pattern to follow for the 4 NEW keys, **not** the older underscore-convention block at `seed.ts:1265-1317` (`transport_platform_fee_pct` / `delivery_platform_fee_pct`, which stay as orphaned/legacy per D-02's naming note — do not delete them this phase).

**Pattern to copy** (`seed.ts:1480-1502`, Studio's two-key block — exact template for Transport/Delivery's 4 new keys):
```typescript
await prisma.platformConfig.upsert({
  where: { key: 'studio.platform_fee_pct' },
  update: {},
  create: {
    key: 'studio.platform_fee_pct',
    value: 0.10,
    isPublic: false,
    metadata: { module: 'studio' },
  },
});
process.stdout.write('  ✓ studio.platform_fee_pct = 0.10\n');

await prisma.platformConfig.upsert({
  where: { key: 'studio.govt_levy_pct' },
  update: {},
  create: {
    key: 'studio.govt_levy_pct',
    value: 0.05,
    isPublic: false,
    metadata: { module: 'studio' },
  },
});
process.stdout.write('  ✓ studio.govt_levy_pct = 0.05\n');
```
**Adapt for Transport/Delivery** — NOTE: Studio's `value: 0.10` is a fraction (0-1 scale), but Transport/Delivery's EXISTING keys (`seed.ts:1269,1299`) use whole-percent scale (`value: 15`, `value: 20`) and the current `completeTrip`/`completeDelivery` code reads them as `feePct / 100`. **Match the existing Transport/Delivery whole-percent convention** (`platform_fee_pct: 10`, `govt_levy_pct: 5` — NOT `0.10`/`0.05`) to stay consistent with the values already being read in-place by `transport.service.ts:520` / `delivery.service.ts:552`, avoiding a silent 100x scale mismatch. Also add the two new cutover-flag keys following the same upsert shape:
```typescript
{ key: 'transport.settlement_engine_enabled', value: false, isPublic: false, metadata: { module: 'transport' } }
{ key: 'delivery.settlement_engine_enabled', value: false, isPublic: false, metadata: { module: 'delivery' } }
```

---

### `backend/scripts/shadow-settlement-verify.ts` (NEW — no direct analog)

**Convention analog:** `backend/prisma/seed.ts:1-10` (raw `PrismaClient`, not injected `PrismaService`) and `backend/package.json:72-74`'s `ts-node` seed-script wiring — the established pattern for standalone scripts outside Nest's DI container.

**Imports/bootstrap pattern to copy:**
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```
**Structure:** see RESEARCH.md Pattern 2 (`13-RESEARCH.md` lines 247-288) for the full worked example — query `COMPLETED`/`DELIVERED` rows, recompute using the SAME formula preserved above (subtract-first for Transport, multiply-first for Delivery), diff against stored `driverEarnings`/`riderEarnings`, write a JSON report file. No wallet-mutating calls of any kind (`SettlementService.settle()` must NEVER be called against historical rows — would double-credit).

---

### `backend/src/modules/transport/__tests__/transport.service.spec.ts` — `completeTrip` describe block rewrite (test, request-response)

**Analog:** `backend/src/modules/studio/__tests__/studio.service.spec.ts:1-18` — the `mockSettlement` shape to inject.

**Mock pattern to copy** (`studio.service.spec.ts:15-18`):
```typescript
const mockSettlement = {
  settle: jest.fn().mockResolvedValue({ status: 'SETTLED', platformAmountNgn: 0, recipientCredits: [] }),
  resolveMinistryWallet: jest.fn().mockResolvedValue({ id: 'WAL-MINISTRY' }),
};
```
Provide this via the `TestingModule` providers array (`{ provide: SettlementService, useValue: mockSettlement }`), same slot pattern already used for `PrismaService`/`RedisService`/`WalletService` mocks in `transport.service.spec.ts:88-138`.

**Existing test to rewrite** (`transport.service.spec.ts:628-681`) — current assertions check the OLD direct-`$transaction`/`wallet.update` shape (`mockWalletUpdate` called with `balance: 1275`); must be replaced with assertions against `mockSettlement.settle` being called with a `recipients` array containing `{ tag: 'DRIVER', amountNgn: 1275 }` and `{ tag: 'MINISTRY', amountNgn: <govtLevyNgn> }`, plus a NEW test for the `transport.settlement_engine_enabled` flag's `true`/`false` branching (mock `mockPrisma.platformConfig.findUnique` to return the flag row).

**Existing fixture to reuse as-is:** `mockPlatformConfig(key, value)` helper (`transport.service.spec.ts:79-84`) — already generic, extend calls to also stub `'transport.govt_levy_pct'`, `'transport.platform_fee_pct'`, `'transport.settlement_engine_enabled'`.

---

### `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` — `completeDelivery` describe block rewrite (test, request-response)

**Analog:** Same as Transport — `studio.service.spec.ts:15-18`'s `mockSettlement` shape, injected via `DeliveryModule`'s `TestingModule` providers the same way `S3Service`/`ResilienceService` are already mocked there (confirmed via `delivery.service.ts:18-19` imports).

Structure mirrors Transport's rewrite 1:1 — RIDER tag instead of DRIVER, `'delivery.govt_levy_pct'`/`'delivery.platform_fee_pct'`/`'delivery.settlement_engine_enabled'` keys.

## Shared Patterns

### Settlement delegation (the core cross-cutting pattern for this entire phase)
**Source:** `backend/src/common/services/settlement.service.ts` (whole file, especially `settle()` at lines 91-258)
**Apply to:** `transport.service.ts::completeTrip()`, `delivery.service.ts::completeDelivery()`
```typescript
// SettlementRecipient / SettlementInput contracts — settlement.service.ts:34-61
export interface SettlementRecipient {
  tag: string;
  refSuffix: string;
  walletId: string | null;
  amountNgn: number;
  metadata?: Record<string, unknown>;
}
export interface SettlementInput {
  module: string;
  reference: string;
  gateway: SettlementGateway;
  amountKobo: number;
  recipients: SettlementRecipient[];
  buyerWalletId?: string | null;
  platformMetadata?: Record<string, unknown>;
  description: string;
  onSettled?: (tx: Prisma.TransactionClient) => Promise<void>;
  onFailure?: (err: Error) => Promise<void>;
}
```

### PlatformConfig fee-percentage read (never hardcode)
**Source:** `transport.service.ts:517-520`, `delivery.service.ts:548-552`, `studio.service.ts:172-175`
**Apply to:** Both new `govt_levy_pct`/`platform_fee_pct` reads in Transport/Delivery
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<module>.platform_fee_pct' } });
const platformFeePct = feeCfg ? Number(feeCfg.value) : <fallback>;
```

### Ministry wallet resolution (zero-parameter reuse)
**Source:** `settlement.service.ts:321-328`, called unmodified at `studio.service.ts:179`, `marketplace.service.ts` (per RESEARCH.md), `stays.service.ts:339`
**Apply to:** Both Transport and Delivery — do NOT generalize or parameterize; call exactly as-is.
```typescript
const ministryWallet = await this.settlementService.resolveMinistryWallet();
```

### Cutover / kill-switch flag read
**Source:** No exact precedent exists (net-new pattern for this phase) — closest analog is the same `PlatformConfig.findUnique` read used for fee percentages, just returning a boolean instead of a number.
**Apply to:** Both modules, wrapping the entire settlement-call block.
```typescript
const cutoverCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<module>.settlement_engine_enabled' } });
const cutoverEnabled = cutoverCfg ? Boolean(cutoverCfg.value) : false;
```

### Standalone raw-`PrismaClient` script convention
**Source:** `backend/prisma/seed.ts:1-10`, `backend/seed-demo.js:1-2`
**Apply to:** `backend/scripts/shadow-settlement-verify.ts`
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// ...pure read + diff, never a wallet-mutating call
```

### Audit-log-failure-swallowing (for Stage 2 shadow-write isolation, Pitfall 5)
**Source:** CLAUDE.md Error Handling conventions — "Audit log failures are swallowed silently (`catch (err) { this.logger.error(...) }`) to prevent auth flows from failing on non-critical logging." Concrete precedent: `backend/src/modules/auth/auth.service.ts` audit-log try/catch (per CLAUDE.md, not independently re-read this session — apply the documented convention verbatim).
**Apply to:** The Stage 2 `ShadowSettlementComparison.create()` write inside the pre-cutover branch of `completeTrip()`/`completeDelivery()` — MUST be a best-effort try/catch OUTSIDE (or independently isolated from) the real wallet-crediting `$transaction`, so a shadow-write failure never blocks or rolls back the live driver/rider payout.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/prisma/schema.prisma` — `ShadowSettlementComparison` model | model | batch/transform | Zero shadow/dry-run infrastructure exists anywhere in this codebase (confirmed by RESEARCH.md); closest structural analog is `Transaction` (small audit-row shape with `module`/`metadata`/timestamps) but semantics are novel — planner should treat Pattern 3 in `13-RESEARCH.md` (lines 296-312) as the primary spec for this model, this file only flags "no codebase precedent exists." |
| `backend/scripts/shadow-settlement-verify.ts` | utility | batch/transform | No prior "recompute-and-diff historical rows" script exists; only the raw-`PrismaClient` scripting *convention* is reusable, not a verification-script *pattern* — see RESEARCH.md Pattern 2 (lines 241-288) for the from-scratch design. |

## Metadata

**Analog search scope:** `backend/src/modules/{transport,delivery,studio,tour-bookings,marketplace}/`, `backend/src/common/services/`, `backend/prisma/`, `backend/src/modules/{transport,delivery,studio}/__tests__/`
**Files scanned:** `settlement.service.ts` (full), `studio.service.ts` (targeted, lines 1-230), `tour-settlement.service.ts` (targeted, lines 200-290), `transport.service.ts` (targeted, lines 1-23, 44-58, 460-620), `delivery.service.ts` (targeted, lines 1-27, 480-631), `seed.ts` (targeted, lines 1255-1335, 1440-1530), `schema.prisma` (targeted, `Transaction`/`PlatformConfig`/`Trip` models), `transport.service.spec.ts` (targeted, lines 1-140, 600-690), `studio.service.spec.ts` (targeted, lines 1-60), `transport.module.ts` / `delivery.module.ts` (full)
**Pattern extraction date:** 2026-07-17
**Note:** RESEARCH.md (`13-RESEARCH.md`) already contains exhaustive, line-cited code excerpts and a fully worked example for every pattern in this phase (Patterns 1-3, Pitfalls 1-5, Code Examples) — this PATTERNS.md cross-references and confirms those excerpts directly against the live source files rather than duplicating RESEARCH.md's already-thorough analysis. Where this file's excerpts diverge from RESEARCH.md's illustrative examples (e.g. the `PlatformConfig` seed-value scale note above), this file's version reflects the verified current source, not RESEARCH.md's illustrative numbers.
