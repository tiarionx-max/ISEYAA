---
phase: 13-settlement-cutover-transport-delivery
fixed_at: 2026-07-18T00:21:54Z
review_path: .planning/phases/13-settlement-cutover-transport-delivery/13-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 9
skipped: 1
status: partial
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-07-18T00:21:54Z
**Source review:** .planning/phases/13-settlement-cutover-transport-delivery/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (3 Critical, 7 Warning — Info findings excluded by `fix_scope: critical_warning`)
- Fixed: 9
- Skipped: 1

All 9 fixed findings were verified with Tier 1 (re-read), Tier 2 (`tsc --noEmit`, clean project-wide compile after every commit), and the full `transport.service.spec.ts` + `delivery.service.spec.ts` suites (47/47 passing after the final commit, up from 42 pre-existing). Each fix was committed atomically.

## Fixed Issues

### CR-01: Delivery `onFailure` writes a `DeliveryOrderStatus` value that doesn't exist in the schema

**Files modified:** `backend/src/modules/delivery/delivery.service.ts`
**Commit:** c5f4929
**Applied fix:** Removed `'PICKED_UP'` from the completable-status allow-list (line ~528) and changed `onFailure`'s revert target from the non-existent `'PICKED_UP'` to the existing pre-terminal status `'IN_TRANSIT'`, exactly as the review's simpler no-migration option suggested.
**Verification status:** fixed (straightforward data correction — swaps an invalid enum literal for a valid, already-defined one; no new conditional/branching logic introduced).

### CR-02: Delivery `onSettled` has no atomic status guard — race window for double rider payout

**Files modified:** `backend/src/modules/delivery/delivery.service.ts`
**Commit:** fd6524a
**Applied fix:** Replaced the unconditional `tx.deliveryOrder.update()` in `onSettled` with a status-guarded `tx.deliveryOrder.updateMany({ where: { id: orderId, status: { in: ['COLLECTING', 'IN_TRANSIT'] } }, ... })`, throwing `BadRequestException` when `result.count === 0`, mirroring Transport's existing pattern.
**Verification status:** fixed: requires human verification — this changes atomic-transaction guard logic (race-condition closure) on a live payment path; automated tests (including new WR-04 coverage added in this run) confirm the guard fires correctly under the tested scenario, but a human should confirm the guard's `status: { in: [...] }` set is complete for all legitimate pre-DELIVERED states before this reaches production traffic.

### CR-03: Transport `completeTrip` has no status precondition; `onFailure` unconditionally resurrects the trip to `IN_PROGRESS`

**Files modified:** `backend/src/modules/transport/transport.service.ts`
**Commit:** dd2edcd
**Applied fix:** Added an explicit `if (trip.status !== 'IN_PROGRESS') throw new BadRequestException(...)` precondition before the cutover/legacy branch split (mirroring `arrivedAtPickup`/`startTrip`). Changed `onFailure` from an unconditional `trip.update({ status: 'IN_PROGRESS' })` to a guarded `trip.updateMany({ where: { id: tripId, status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } }, data: { status: 'IN_PROGRESS' } })`, so a trip already in a terminal state (from a legitimate transition or a concurrent duplicate call that won the atomic guard) is never resurrected into a retryable state.
**Verification status:** fixed: requires human verification — this is the most consequential logic change in this pass (closes a double-payout vector on a live wallet-crediting path). Verified against the full existing `transport.service.spec.ts` suite (all 31 pre-existing tests still pass unchanged, including the legacy-branch "already completed" retry test) plus 3 new regression tests added in this run (precondition check, terminal-state non-revert, non-terminal safe-revert). A human should confirm the `notIn` terminal-status set (`COMPLETED`, `CANCELLED`, `EXPIRED`) is exhaustive for `TripStatus` and that no legitimate mid-flow status could be misclassified as "terminal" by this guard.

### WR-01: `Boolean(cutoverCfg.value)` is fragile for a safety-critical feature flag

**Files modified:** `backend/src/modules/transport/transport.service.ts`, `backend/src/modules/delivery/delivery.service.ts`
**Commit:** 7bc6de6
**Applied fix:** Changed `Boolean(cutoverCfg.value)` to `cutoverCfg?.value === true` in both modules, so only a real JSON boolean `true` enables the cutover — a raw string like `"false"` can no longer be coerced to truthy.

### WR-02: Missing wallet silently drops driver/rider earnings

**Files modified:** `backend/src/modules/transport/transport.service.ts`, `backend/src/modules/delivery/delivery.service.ts`
**Commit:** 5dfd1f3
**Applied fix:** Added an explicit `if (!driverWallet) { logger.error(...); throw new BadRequestException(...); }` (and the rider equivalent) immediately after the shared wallet fetch, before either the legacy or cutover branch runs — so a trip/order can no longer transition to a terminal status while silently failing to credit the responsible party.

### WR-03: `amountKobo` computed without rounding

**Files modified:** `backend/src/modules/transport/transport.service.ts`, `backend/src/modules/delivery/delivery.service.ts`
**Commit:** 4d9c405
**Applied fix:** Wrapped the `amountKobo` value passed into `SettlementService.settle()` in `Math.round(...)` in both files, matching the rounding discipline already used everywhere else in each file.

### WR-04: No test coverage for the `onFailure` / failure paths in either cutover branch

**Files modified:** `backend/src/modules/transport/__tests__/transport.service.spec.ts`, `backend/src/modules/delivery/__tests__/delivery.service.spec.ts`
**Commit:** de04a1d
**Applied fix:** Added 5 new tests: for Transport — the new CR-03 precondition-throws-before-computation case, the onFailure-does-not-resurrect-a-terminal-trip case, and the onFailure-safely-reverts-a-non-terminal-trip case; for Delivery — the CR-02 onSettled atomic-guard-throws case (double-complete race) and the CR-01 onFailure-reverts-to-a-valid-enum-value case. All 5 new tests pass alongside the 42 pre-existing tests (47/47 total).

### WR-05: `collectParcel` has no atomic status guard

**Files modified:** `backend/src/modules/delivery/delivery.service.ts`, `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (mock scaffolding only — added `updateMany: jest.fn()` to the `deliveryOrder` mock; no test previously exercised `collectParcel`)
**Commit:** 2587a9f
**Applied fix:** Replaced the plain `deliveryOrder.update()` with a status-guarded `deliveryOrder.updateMany({ where: { id: orderId, status: 'MATCHED' }, ... })` + count check, throwing `BadRequestException` on `count === 0`, mirroring `acceptOrder`'s existing `H-01` pattern.

### WR-07: Exact `===` comparison on floating-point Naira amounts in the verification script

**Files modified:** `backend/scripts/shadow-settlement-verify.ts`
**Commit:** 5cd0367
**Applied fix:** Changed both the Transport and Delivery `match` comparisons from exact float `===` to `Math.round(recomputed * 100) === Math.round(stored * 100)` (kobo-precision integer comparison), eliminating IEEE-754 representation-noise false positives/negatives.

## Skipped Issues

### WR-06: Migration bundles unrelated schema changes under a "shadow settlement" name

**File:** `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql:1-19`
**Reason:** Investigated rather than blindly applying the suggested fix. Cross-checked each "unrelated" diff against the current `schema.prisma`:
- `products_category_isActive_idx` / `products_isFeatured_idx`: the current `Product` model (`schema.prisma:480-504`) declares no `@@index` at all for `category`/`isActive`/`isFeatured` — the migration's `DROP INDEX` statements correctly sync the DB to the schema as it stands today. This is genuine drift cleanup, not an accidental drop introduced by this phase; restoring these indexes would itself reintroduce drift.
- `properties.membershipBenefits` / `highlights` `DROP DEFAULT`: the current schema declares these as plain `String[]` with no `@default([])` — again consistent with the migration correctly matching schema state.
- `tour_packages`/`admin_review_flags` FK drop+recreate: identical constraint definitions before and after — a harmless Prisma-diff-engine artifact, not a semantic change.

Since the migration's content is verified correct relative to the current schema (nothing to revert), and rewriting an already-generated migration file to split it retroactively risks breaking migration-checksum history for any environment that has already applied it, no code change was made. The review's own fix guidance frames this as a process note for future migrations ("split them into their own appropriately-named migration next time") rather than a defect requiring a code change to this migration — logged here for visibility.
**Original issue:** Migration `20260717231213_add_shadow_settlement_comparison` also drops/recreates FKs on `tour_packages`/`admin_review_flags`, drops two `products` indexes, and drops column defaults on `properties` — none related to settlement cutover, making the migration's actual blast radius larger than its name implies.

---

_Fixed: 2026-07-18T00:21:54Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
