---
phase: 14-ministry-dashboard
plan: 06
subsystem: api
tags: [nestjs, prisma, raw-sql, ministry-dashboard, pii-protection, revenue-analytics]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard
    provides: "MinistryService/MinistryController scaffold, MinistryQueryDto, visitor-entries and purpose-breakdown queries (Plan 14-03)"
  - phase: 12-13 (settlement infrastructure)
    provides: "SettlementService.settle()/resolveMinistryWallet(), Transaction ledger with metadata.module, gatewayRef"
provides:
  - "GET /ministry/revenue — module+month revenue totals sourced from the standing Ministry wallet's Transaction ledger, spanning all historical settlement data"
  - "LGA sub-breakdown (byModuleLga) for Stays, Marketplace, and Tour, each via its actual direct/reliable join path"
  - "ministry-pii-allowlist.spec.ts — reusable dual key-denylist + value-canary PII scanner pattern, proven against all 3 live Ministry endpoints"
affects: ["14-07 (CSV/export layer)", "14-08 (web UI ministry dashboard)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual PII scanner pattern (assertNoPiiKeys + assertNoPiiValues with seeded canary values) for any future government-facing read endpoint"
    - "CASE WHEN + correlated-subquery LGA resolution inside a single $queryRaw, keyed off Transaction.metadata->>'module'"

key-files:
  created:
    - backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts
  modified:
    - backend/src/modules/ministry/ministry.service.ts
    - backend/src/modules/ministry/ministry.controller.ts
    - backend/src/modules/ministry/__tests__/ministry.service.spec.ts

key-decisions:
  - "Used a single CASE WHEN + correlated-subquery LEFT JOIN to lgas for byModuleLga (one query, 3 module branches) rather than 3 separate LEFT JOIN LATERAL clauses — plan explicitly allowed either approach"
  - "Tour's LGA join uses gatewayRef -> TourBooking.paymentReference (not metadata.bookingId/orderId like Stays/Marketplace) per the plan's documented split-bill undercount caveat, preserved verbatim as an inline SQL comment"
  - "getRevenueToGovernment() returns the empty-shape object (never throws) when resolveMinistryWallet() resolves null, matching resolveMinistryWallet()'s own null-safe contract"

patterns-established:
  - "Government-facing endpoints must be proven PII-free via BOTH a key-name denylist scan AND a value-canary scan against seeded fixture PII — the value scan is required to catch aliased-field-rename leaks the key scan alone misses"

requirements-completed: [MIN-04, MIN-07]

# Metrics
duration: ~25min
completed: 2026-07-18
---

# Phase 14 Plan 06: Ministry Revenue Query + PII Allowlist Scanner Summary

**GET /ministry/revenue (module+month totals + Stays/Marketplace/Tour LGA sub-breakdown) plus a dual key-denylist/value-canary automated PII scanner proving zero PII ever leaves any /ministry/* endpoint.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-18T06:29:23Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 modified, 1 created

## Accomplishments
- `MinistryService.getRevenueToGovernment(from?, to?)` — three parallel `$queryRaw` aggregations (byModule, byMonth, byModuleLga) against the standing Ministry wallet's `Transaction` ledger, all Decimal/bigint totals coerced to plain JS numbers.
- `GET /ministry/revenue` wired on `MinistryController` under the existing class-level `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)` guard — no per-route override, MIN-01 constraint preserved (GET-only controller).
- MIN-07 satisfied with a genuine dual scanner: `assertNoPiiKeys()` (key-name scan) AND `assertNoPiiValues()` (string-value scan against seeded canary values `PII_CANARY_FIRSTNAME`/`PII_CANARY_PHONE`/`PII_CANARY_EMAIL`), both run independently against the real output of all 3 live Ministry query methods.
- Two negative-control tests prove neither scanner is a no-op: a deliberate PII-key fixture throws under `assertNoPiiKeys()`; a canary value stored under an innocuous key (`guestName`) throws under `assertNoPiiValues()` but NOT under `assertNoPiiKeys()` — proving the value scanner catches the aliased-field-rename regression class the key scanner alone would miss.

## Task Commits

Each task was committed atomically:

1. **Task 1: getRevenueToGovernment() query + GET /ministry/revenue route** - `03ccbb4` (feat)
2. **Task 2: Revenue query tests + MIN-07 PII allowlist spec (key-denylist AND value-canary)** - `2197456` (test)

**Plan metadata:** (this commit, docs — see below)

## Files Created/Modified
- `backend/src/modules/ministry/ministry.service.ts` - Added `getRevenueToGovernment()` (3 parallel `$queryRaw` aggregations + null-wallet guard), `SettlementService` injected into constructor, 4 new exported row/result interfaces
- `backend/src/modules/ministry/ministry.controller.ts` - Added `GET /ministry/revenue` route
- `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` - Extended with a `getRevenueToGovernment` describe block (7 tests): null-wallet early return, Decimal/bigint coercion, no-hardcoded-module-allowlist assertion, Tour/Stays/Marketplace join clause assertions, parameterized/omitted from-to filters
- `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` - New file: `PII_FIELD_DENYLIST`, `assertNoPiiKeys()`, `assertNoPiiValues()`, negative controls, and a live scan against all 3 Ministry query methods

## Decisions Made
- Correlated-subquery `CASE WHEN` approach chosen for `byModuleLga` over 3 separate `LEFT JOIN LATERAL` clauses — functionally equivalent, plan explicitly permitted either; single query keeps the module/LGA grouping atomic.
- Tour's LGA join path documented inline (SQL comment, verbatim split-bill caveat from the plan's `<interfaces>` block) directly above the `WHEN 'tour_booking'` branch, so a future maintainer understands why Tour's LGA sub-breakdown total can undercount its byModule total for split-bill bookings.
- `getRevenueToGovernment()` mirrors `resolveMinistryWallet()`'s null-safe contract (returns empty shape, never throws) rather than throwing `NotFoundException` — keeps the dashboard degrading gracefully if `tour.government_wallet_user_id` is ever unset.

## Deviations from Plan

None — plan executed as written. One minor process note below (not a deviation from plan content, but from strict TDD task ordering).

## TDD Gate Compliance

Both tasks are marked `tdd="true"`, but execution proceeded implementation-first then test-second within this single agent turn (commit `03ccbb4` `feat` precedes commit `2197456` `test`), rather than the strict RED (failing test) → GREEN (implementation) commit order. All tests were written to validate the actual behavior of the implementation (including SQL-shape assertions on the real `Prisma.sql` templates) and all pass; no shortcuts were taken on test coverage. This is a process deviation from the canonical TDD gate sequence, not a correctness gap — flagged here per the executor's gate-sequence-validation requirement.

## Issues Encountered
- `backend/node_modules` and the generated Prisma client were absent in this worktree at execution start (`@nestjs/swagger`, `@prisma/client` unresolved, ~150 pre-existing `tsc` errors unrelated to this plan's files). Resolved by running `npm install --workspace=backend --prefer-offline` (27s, network reachable) and `npx prisma generate`. Not a plan deviation — a worktree environment gap, now fixed for this worktree; `tsc --noEmit` exits 0 and the full backend suite (47 suites / 558 tests) passes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `GET /ministry/revenue` is live and ready for Plan 14-07 (CSV/export layer) and Plan 14-08 (web UI) to consume.
- MIN-07's dual PII scanner pattern (`assertNoPiiKeys` + `assertNoPiiValues`) is now a proven, reusable pattern in `ministry-pii-allowlist.spec.ts` — Plan 14-07/14-08 should extend this same spec file (adding the export/UI-facing shapes) rather than writing a parallel scanner.
- No blockers.

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*
