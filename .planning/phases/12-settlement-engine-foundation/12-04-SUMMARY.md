---
phase: 12-settlement-engine-foundation
plan: 04
subsystem: payments
tags: [prisma, nestjs, event-emitter, settlement, wallet, marketplace]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation (plan 01)
    provides: "SettlementService generalized N-way atomic wallet fan-out engine (backend/src/common/services/settlement.service.ts)"
provides:
  - "Marketplace order payments now credit the vendor and Ministry wallets atomically on settlement"
  - "@OnEvent('payment.order_payment') dual-wire alongside the existing Kafka onModuleInit consumer"
affects: [13-settlement-cutover-transport-delivery, marketplace]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolve a FK-only (no Prisma relation, no DB constraint) parent record via a direct findUnique lookup rather than include:{} when adding the relation would require a schema migration on a shared dev DB"

key-files:
  created: []
  modified:
    - backend/src/modules/marketplace/marketplace.service.ts
    - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts

key-decisions:
  - "Order.vendorId has no Prisma relation or DB FK constraint (only an index) — resolved vendor via prisma.vendor.findUnique(order.vendorId) instead of include:{vendor:true}, avoiding a schema migration against the shared local Postgres while sibling wave agents run concurrently"

patterns-established:
  - "Dual-wire @OnEvent alongside legacy Kafka onModuleInit consumer for settlement handlers (mirrors TourSettlementService, per D-04)"

requirements-completed: [SETTLE-06]

duration: 10min
completed: 2026-07-17
---

# Phase 12 Plan 04: Marketplace Settlement Wiring Summary

**Marketplace order payments now credit vendor + Ministry wallets atomically via `SettlementService.settle()`, using the already-computed `Order.vendorPayout`/`govtLevy` verbatim — previously `handleOrderPayment` only flipped order status and decremented stock with no wallet crediting at all.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-17T12:17:45-05:00
- **Completed:** 2026-07-17T12:24:14-05:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `handleOrderPayment` now calls `SettlementService.settle()` once per order, crediting `VENDOR` (amount = `Order.vendorPayout`) and `MINISTRY` (amount = `Order.govtLevy`) recipients, with the platform wallet absorbing the remainder inside one atomic transaction
- Added `@OnEvent('payment.order_payment')` directly above `handleOrderPayment`, dual-wired alongside the pre-existing (Kafka-dependent) `onModuleInit` consumer registration, which is left untouched
- Order status flip to `PROCESSING` and per-`OrderItem` stock decrement moved inside `SettlementService`'s `onSettled` callback, making them atomic with the wallet writes (previously two separate, unprotected `prisma.update` calls)
- Added `onFailure` handling that marks the order `CANCELLED` with the settlement error recorded in `metadata` if settlement throws
- Full unit test coverage: settle-call assertions on recipient amounts, non-PENDING early-return (idempotency) guard, and direct invocation of the captured `onSettled` callback proving the status flip + stock decrement are wired in (not dead code)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire handleOrderPayment to SettlementService + add @OnEvent dual-wire** - `6d28cef` (feat)
2. **Task 2: Add settlement test coverage to marketplace.service.spec.ts** - `f9c178d` (test)

_Note: Task 1 carries `tdd="true"` in the plan frontmatter, but per the plan's own task split, test coverage was authored in a dedicated Task 2 rather than RED-first — both commits land in this plan and are verified together below._

## Files Created/Modified
- `backend/src/modules/marketplace/marketplace.service.ts` - `handleOrderPayment` rewritten to settle vendor + Ministry wallets via `SettlementService.settle()`; `@OnEvent('payment.order_payment')` dual-wire added; vendor resolved via direct `vendor.findUnique(vendorId)` lookup
- `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` - `SettlementService` mock provider added; `wallet.findUnique` added to `mockPrisma`; three new/rewritten `handleOrderPayment` test cases

## Decisions Made
- **Vendor resolution without a schema change:** `Order.vendorId` (`String?`) has no `@relation` declared on the `Order` Prisma model and no DB-level foreign key constraint exists (`grep` of all migrations confirms only an index, `orders_vendorId_idx`, was ever added — no `orders_vendorId_fkey`). The plan's literal instruction to add `include: { vendor: true }` is therefore not directly achievable without a schema migration. Since this plan runs as one of several parallel wave agents against a single shared local Postgres instance, running an ad-hoc migration here was judged too risky (Rule 3 auto-fix, scoped to the minimum change needed). Instead, the vendor is resolved with a direct `prisma.vendor.findUnique({ where: { id: order.vendorId } })` call, which produces functionally identical behavior (same wallet resolution, same metadata) without touching the schema. This is logged for future phases: if `Order.vendor` needs to become a real Prisma relation, add `vendor Vendor? @relation(fields: [vendorId], references: [id])` to `Order` + `orders Order[]` to `Vendor` + an `ALTER TABLE orders ADD CONSTRAINT orders_vendorId_fkey ...` migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Order.vendorId has no Prisma relation/DB FK — could not `include: { vendor: true }` as literally specified**
- **Found during:** Task 1 (wiring `handleOrderPayment`)
- **Issue:** The plan's `<action>` block instructs adding `vendor: true` to the `order.findUnique` include set, asserting "the order's `vendorId` FK already exists on `Order`, add the relation include." In reality `Order.vendorId` is a plain `String?` column with only a DB index (`orders_vendorId_idx`) — no Prisma `@relation` field and no DB foreign key constraint (`orders_vendorId_fkey`) exist. `tsc` confirmed this (`TS2353: Object literal may only specify known properties, and 'vendor' does not exist in type 'OrderInclude'`).
- **Fix:** Resolved the vendor via a direct `this.prisma.vendor.findUnique({ where: { id: order.vendorId } })` call instead of the Prisma relation include. Functionally identical (same `vendor.userId` used to resolve `vendorWallet`), avoids any schema/migration change against the shared local dev Postgres instance while five sibling wave agents (12-03, 12-05, 12-06, 12-07, 12-08) run concurrently.
- **Files modified:** `backend/src/modules/marketplace/marketplace.service.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.build.json` compiles clean; `npx jest src/modules/marketplace/__tests__/marketplace.service.spec.ts` — 23/23 passing
- **Committed in:** `6d28cef` (Task 1 commit)

**2. [Rule 3 - Blocking] Local worktree had no `node_modules` — created directory junctions to main repo's installed copies**
- **Found during:** pre-task environment setup (before Task 1)
- **Issue:** This worktree was never `npm install`'d; `npx jest`/`npx tsc` failed with `Cannot find module '@nestjs/testing'`
- **Fix:** Created Windows directory junctions `node_modules` and `backend/node_modules` pointing at the main repo's already-installed copies (`mklink /J`). Junctions are gitignored/untracked, not committed.
- **Files modified:** none (junctions only, not tracked by git)
- **Verification:** `npx jest`/`npx tsc` run successfully after junction creation
- **Committed in:** N/A (untracked, not part of any commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/schema-avoidance, 1 blocking/environment)
**Impact on plan:** Both auto-fixes were necessary to complete the plan without introducing risk (concurrent schema migration) or being blocked entirely (missing node_modules). No scope creep — the vendor-resolution behavior matches the plan's intent exactly, just via a direct query instead of a Prisma relation include.

## Issues Encountered
- First attempt at the `node_modules` junctions used an incorrect relative path depth (`..\..\..\..\`) which resolved one level too high (`C:\Developer\work\node_modules` instead of `C:\Developer\work\ISEYAA\node_modules`), causing `@nestjs/testing` to resolve to nothing. Fixed by recreating the junctions with the correct 3-level-up path (`..\..\..\`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SETTLE-06's Marketplace gap is closed: vendor + Ministry wallet credits now fire on every completed order payment, split amounts taken verbatim from `Order.vendorPayout`/`govtLevy`
- Duplicate delivery protection verified structurally: the existing `order.status !== 'PENDING'` early-return guard plus `SettlementService`'s own reference-prefix idempotency precheck provide two independent layers, per the plan's threat model (T-12-11)
- Flagged for a future phase: `Order.vendorId` should eventually become a proper Prisma relation with a DB FK constraint (see Decisions Made above) — not blocking, but the direct-lookup pattern used here should not be treated as the permanent shape if Order/Vendor queries grow more complex
- No blockers for sibling plans in this wave (12-03, 12-05, 12-06, 12-07, 12-08) — only `marketplace.service.ts` and its spec file were touched, no shared files modified

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: backend/src/modules/marketplace/marketplace.service.ts
- FOUND: backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
- FOUND: .planning/phases/12-settlement-engine-foundation/12-04-SUMMARY.md
- FOUND commit: 6d28cef (Task 1)
- FOUND commit: f9c178d (Task 2)
- FOUND commit: 14c4e6b (docs: SUMMARY)
