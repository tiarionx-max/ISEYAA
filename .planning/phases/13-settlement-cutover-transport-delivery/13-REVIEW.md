---
phase: 13-settlement-cutover-transport-delivery
reviewed: 2026-07-17T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql
  - backend/prisma/schema.prisma
  - backend/prisma/seed.ts
  - backend/scripts/shadow-settlement-verify.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/transport/__tests__/transport.service.spec.ts
  - backend/src/modules/transport/transport.service.ts
findings:
  critical: 3
  warning: 7
  info: 2
  total: 12
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase wires `TransportService.completeTrip()` and `DeliveryService.completeDelivery()` to `SettlementService.settle()` behind two `PlatformConfig` cutover flags (`transport.settlement_engine_enabled`, `delivery.settlement_engine_enabled`), while preserving the legacy inline-transaction path byte-for-byte and writing a Stage-2 shadow comparison row for every legacy-path completion. The legacy paths are unchanged and remain safe (atomic `updateMany` + credit inside a single `$transaction`).

The new cutover-enabled paths, however, introduce three provable correctness bugs around failure/retry handling that were not part of the legacy code and are not covered by any test:

1. Delivery's `onFailure` handler writes a `DeliveryOrderStatus` value (`'PICKED_UP'`) that does not exist in the Prisma schema — this will throw at the database layer the first time it's actually exercised.
2. Delivery's `onSettled` handler updates the order unconditionally (no atomic status-guarded `updateMany`), unlike Transport's equivalent — there is no database-level protection against two concurrent `completeDelivery` calls both crediting the rider.
3. Transport's `completeTrip` has no status precondition before entering the cutover branch, and its `onFailure` handler unconditionally forces the trip back to `IN_PROGRESS` regardless of what its actual prior status was — a completed, cancelled, or otherwise terminal trip can be resurrected into a retryable state by a stray/duplicate `completeTrip` call, opening the door to a second payout.

None of these three paths are exercised by the current test suites — both spec files only ever drive `settle()`'s success (`onSettled`) branch, so CI would not have caught the above. Several lower-severity precision, type-coercion, and migration-scope issues round out the findings below.

## Critical Issues

### CR-01: Delivery `onFailure` writes a `DeliveryOrderStatus` value that doesn't exist in the schema

**File:** `backend/src/modules/delivery/delivery.service.ts:626-633`
**Issue:** When `settlementService.settle()` fails (for any reason — DB error, ministry wallet resolution failure, or the atomic guard inside `onSettled` finding the order already transitioned), `onFailure` runs:

```ts
onFailure: async () => {
  await this.prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: 'PICKED_UP' as any },
  });
},
```

`DeliveryOrderStatus` in `schema.prisma` only defines `SEARCHING | MATCHED | COLLECTING | IN_TRANSIT | DELIVERED | CANCELLED | EXPIRED` — there is no `PICKED_UP` value. The `as any` cast hides this from the TypeScript compiler, but Prisma will reject the write with an invalid-enum-value error at the database layer the first time this code path actually runs. The same non-existent value is also referenced in the upfront completable-status allow-list at line 528 (`['COLLECTING', 'IN_TRANSIT', 'PICKED_UP']`), confirming this is a real, intended-but-never-added enum member rather than a typo that happens to be harmless.

Net effect: the very recovery path this code was written for (revert to a retryable status on settlement failure) is guaranteed to itself throw, masking the original failure and leaving the order in an inconsistent state instead of the intended safe, retryable one.
**Fix:** Add the missing status to the `DeliveryOrderStatus` enum (with a migration) and use it consistently, or — simpler and requiring no schema change — revert to an existing valid pre-terminal status such as `'IN_TRANSIT'`:

```ts
onFailure: async () => {
  await this.prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { status: 'IN_TRANSIT' as any },
  });
},
```
and drop `'PICKED_UP'` from the line-528 allow-list.

---

### CR-02: Delivery `onSettled` has no atomic status guard — race window for double rider payout

**File:** `backend/src/modules/delivery/delivery.service.ts:610-625`
**Issue:** Transport's equivalent `onSettled` callback (transport.service.ts:582-591) uses `tx.trip.updateMany({ where: { id: tripId, status: 'IN_PROGRESS' }, ... })` and checks `result.count === 0` to guarantee only one caller can ever win the transition. Delivery's `onSettled` instead does a plain, unconditional update:

```ts
onSettled: async (tx) => {
  await tx.deliveryOrder.update({
    where: { id: orderId },
    data: { status: 'DELIVERED' as any, ... },
  });
  await tx.deliveryEvent.create({ data: { orderId, event: 'DELIVERY_COMPLETED' } });
},
```

There is no `WHERE status = 'IN_TRANSIT'` (or similar) precondition and no count check. The only protection against a double-complete is the upfront, non-atomic read at line 524-530 (`findUnique` + array-includes check), which is a classic TOCTOU race: two near-simultaneous `completeDelivery` calls for the same order can both read `status: 'IN_TRANSIT'`, both pass the guard, and both proceed into `settle()` — and since `onSettled` never re-validates status, both can succeed, crediting the rider (and the Ministry wallet) twice for one delivery.
**Fix:** Mirror Transport's pattern — use `updateMany` with a status precondition and check the count inside `onSettled`, throwing if it's 0 so `settle()`'s failure path (and idempotency precheck) can take over:

```ts
onSettled: async (tx) => {
  const result = await tx.deliveryOrder.updateMany({
    where: { id: orderId, status: { in: ['COLLECTING', 'IN_TRANSIT'] } },
    data: { status: 'DELIVERED' as any, completedAt: now, proofPhotoUrl, platformFee: totalCommission, riderEarnings, ...(dto.senderRating && { senderRating: dto.senderRating }) },
  });
  if (result.count === 0) {
    throw new BadRequestException('Order already delivered or not in a completable status');
  }
  await tx.deliveryEvent.create({ data: { orderId, event: 'DELIVERY_COMPLETED' } });
},
```

---

### CR-03: Transport `completeTrip` has no status precondition before the cutover branch; `onFailure` unconditionally resurrects the trip to `IN_PROGRESS`

**File:** `backend/src/modules/transport/transport.service.ts:505-604`
**Issue:** Unlike `arrivedAtPickup` and `startTrip` (which both explicitly check `trip.status` before proceeding and throw `BadRequestException` otherwise), `completeTrip` performs no status check at all before entering either the cutover or legacy branch — it only checks `trip.driverId !== driver.id`. In the legacy branch this is safe because the atomic `updateMany` + throw happens *inside* the `$transaction`, so a stale-status call rolls back cleanly with no side effects.

In the cutover-enabled branch, however, `completeTrip` unconditionally computes `driverEarnings`, resolves the Ministry wallet, and calls `settle()` regardless of the trip's actual current status (e.g. `CANCELLED`, `MATCHED`, or already `COMPLETED`). If `settle()`'s internal `onSettled` guard (count===0) or any other error causes failure, `onFailure` runs:

```ts
onFailure: async () => {
  await this.prisma.trip.update({
    where: { id: tripId },
    data: { status: 'IN_PROGRESS' as any },
  });
},
```

This unconditionally forces the trip's status to `IN_PROGRESS` with no check of what the trip's actual prior status was. A trip that was legitimately `CANCELLED` (or already `COMPLETED`) can be resurrected into `IN_PROGRESS` by a single stray/duplicate `completeTrip` call. Because the record is now `IN_PROGRESS`, a subsequent `completeTrip` call (retry, or a second concurrent request) will pass the atomic `updateMany` guard inside `onSettled` and successfully re-run settlement — crediting the driver (and Ministry) a second time for a trip that should never have been completed, or completing a trip the rider had cancelled.
**Fix:** Add an explicit status precondition at the top of `completeTrip` (mirroring `arrivedAtPickup`/`startTrip`):

```ts
if (trip.status !== 'IN_PROGRESS') {
  throw new BadRequestException(`Trip must be IN_PROGRESS to complete; current: ${trip.status}`);
}
```

and change `onFailure` to only revert the status if it can confirm the trip was genuinely mid-settlement (e.g. by checking the pre-`settle()` status was `IN_PROGRESS` before reverting), rather than unconditionally forcing `IN_PROGRESS`.

## Warnings

### WR-01: `Boolean(cutoverCfg.value)` is fragile for a safety-critical feature flag

**File:** `backend/src/modules/transport/transport.service.ts:525`, `backend/src/modules/delivery/delivery.service.ts:561`
**Issue:** Both cutover checks read `PlatformConfig.value` (a `Json` column) and coerce it with `Boolean(cutoverCfg.value)`. `Boolean()` on any non-empty string is `true` — including the string `"false"`. If this config row is ever set through a generic admin/config-update path that stores raw string input instead of a real JSON boolean (a very plausible operational mistake, since the column is untyped `Json`), the flag would read as enabled even when an operator intended to keep it disabled, silently switching live money movement onto the new settlement path.
**Fix:** Use a strict equality check instead of loose coercion:

```ts
const cutoverEnabled = cutoverCfg?.value === true;
```

### WR-02: Missing wallet silently drops driver/rider earnings

**File:** `backend/src/modules/transport/transport.service.ts:528, 556, 641`, `backend/src/modules/delivery/delivery.service.ts:552, 588, 668`
**Issue:** In the legacy branch, `if (driverWallet) { ... credit ... }` / `if (riderWallet) { ... credit ... }` silently does nothing when the driver/rider has no wallet row — the trip/order still transitions to `COMPLETED`/`DELIVERED`, the log line still claims "₦X credited to driver/rider", but no `Transaction` row and no balance update ever happen. In the cutover branch, `walletId: driverWallet?.id ?? null` / `walletId: riderWallet?.id ?? null` passes `null` into `SettlementService.settle()`'s recipients with no visible handling in this file for that case. Either way, there's no error, alert, or reconciliation trail when this happens — real money is computed as owed but never lands anywhere.
**Fix:** Throw (or at minimum `logger.error` with an actionable alert) when the responsible party's wallet is missing, instead of silently proceeding to a terminal status as if payment succeeded.

### WR-03: `amountKobo` computed without rounding, inconsistent with the rest of the file's money handling

**File:** `backend/src/modules/transport/transport.service.ts:576`, `backend/src/modules/delivery/delivery.service.ts:605`
**Issue:** Every other money computation in both files is wrapped in `Math.round(x * 100) / 100`, but the value handed to `SettlementService.settle()` is computed as a bare `fare * 100` / `fee * 100`. Standard IEEE-754 float multiplication of an arbitrary two-decimal Naira amount by 100 is not guaranteed to produce an integer kobo value (e.g. `100.1 * 100 === 10010.000000000002` in JS). This is the one money value in these files that skips the rounding discipline applied everywhere else, and it's the value that crosses the module boundary into the settlement engine.
**Fix:** `amountKobo: Math.round(fare * 100)` / `Math.round(fee * 100)`.

### WR-04: No test coverage for the `onFailure` / failure paths in either cutover branch

**File:** `backend/src/modules/transport/__tests__/transport.service.spec.ts`, `backend/src/modules/delivery/__tests__/delivery.service.spec.ts`
**Issue:** Both spec files mock `SettlementService.settle()` to always call `onSettled` and resolve successfully; neither ever simulates `settle()` throwing/invoking `onFailure`. The existing "already completed" retry test (`transport.service.spec.ts:718-740`) only exercises the legacy branch. As a direct consequence, CR-01/CR-02/CR-03 above were not (and could not have been) caught by this test suite.
**Fix:** Add tests that make the mocked `settle()` throw (or explicitly invoke `input.onFailure?.()`) for both modules' cutover branches, and assert the resulting record status is valid and does not enable a subsequent successful retry when the underlying record was not actually mid-settlement.

### WR-05: `collectParcel` has no atomic status guard

**File:** `backend/src/modules/delivery/delivery.service.ts:450-478`
**Issue:** Unlike `acceptOrder` (which uses `updateMany` with `WHERE status='SEARCHING'` plus a count check specifically to close a TOCTOU race, per the `H-01` comment), `collectParcel` does a plain `deliveryOrder.update()` with no status precondition at all. Two concurrent/duplicate `collectParcel` calls for the same order will both succeed and both emit a `PARCEL_COLLECTED` event.
**Fix:** Add a status-guarded `updateMany` (e.g. `WHERE status = 'MATCHED'`) with a count check, matching the pattern already established for `acceptOrder`/`acceptTrip`.

### WR-06: Migration bundles unrelated schema changes under a "shadow settlement" name

**File:** `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql:1-19`
**Issue:** Alongside the phase's actual `shadow_settlement_comparisons` table and the new `Trip`/`User`/`Booking` indexes, this migration also drops and re-creates identical foreign keys on `tour_packages`/`admin_review_flags`, drops two indexes on `products` (`products_category_isActive_idx`, `products_isFeatured_idx`) with nothing replacing them, and drops column defaults on `properties.membershipBenefits`/`highlights` — none of which relate to settlement or Transport/Delivery. This makes the migration's actual blast radius larger than its filename/phase implies and harder to review or roll back independently.
**Fix:** Confirm the unrelated diffs are intentional (e.g. genuine drift cleanup from a prior phase) and, if so, split them into their own appropriately-named migration next time; if unintentional, restore the dropped `products` indexes.

### WR-07: Exact `===` comparison on floating-point Naira amounts in the verification script

**File:** `backend/scripts/shadow-settlement-verify.ts:55, 106`
**Issue:** `recomputedDriverEarnings === storedDriverEarnings` (and the delivery equivalent) compares two JS numbers, one derived from `Number(trip.fare)` → float arithmetic → `Math.round(...)/100`, the other from `Number(trip.driverEarnings)` (a `Decimal` → `Number` conversion). This whole script's purpose is to catch subtle precision mismatches between the legacy and new settlement formulas, so relying on exact floating-point equality is exactly the kind of comparison that can produce a false-positive "mismatch" report (or, less likely, mask a real one) purely from float representation noise rather than an actual formula discrepancy.
**Fix:** Compare at kobo (integer) precision, e.g. `Math.round(recomputedDriverEarnings * 100) === Math.round(storedDriverEarnings * 100)`.

## Info

### IN-01: Inline `require('fs')` instead of a top-level import

**File:** `backend/scripts/shadow-settlement-verify.ts:71, 122`
**Issue:** The file uses ES `import` syntax for `@prisma/client` at the top but reaches for `require('fs')` inline inside each verify function. Minor stylistic inconsistency within the same file.
**Fix:** `import { writeFileSync } from 'fs';` at the top and call `writeFileSync(...)` directly.

### IN-02: Unhandled `writeFileSync` errors in the report-writing step

**File:** `backend/scripts/shadow-settlement-verify.ts:71-74, 122-125`
**Issue:** If the process's current working directory isn't writable (read-only container, restricted CI runner, etc.), `writeFileSync` throws after the (potentially large) DB read/compute work has already completed, with no try/catch to log a clearer diagnostic.
**Fix:** Wrap the `writeFileSync` calls in a try/catch that logs a warning and continues, since the console output already reports the sampled/mismatch counts.

---

_Reviewed: 2026-07-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
