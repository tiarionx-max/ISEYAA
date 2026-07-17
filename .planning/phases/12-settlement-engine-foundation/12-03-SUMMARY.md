---
phase: 12-settlement-engine-foundation
plan: 03
subsystem: payments
tags: [settlement, wallet, prisma, nestjs, tour-bookings, refactor]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation
    provides: "SettlementService (12-01) — generalized N-way wallet fan-out engine"
provides:
  - "TourSettlementService delegating its atomic wallet fan-out to SettlementService, proving the abstraction generalizes on the hardest existing case (true N-way GUIDE/HOST/ORGANISER/ATTRACTION vendor resolution)"
  - "Working example for Plans 12-04..12-07 (Transport, Delivery, Marketplace, Events/Stays cutovers) of how to wire a domain-specific resolver onto SettlementService.settle()"
affects: [12-04, 12-05, 12-06, 12-07, 13-settlement-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Caller resolves domain-specific recipients (wallet ids, amounts, refSuffix, metadata) and calls SettlementService.settle() once; SettlementService owns $transaction, SELECT FOR UPDATE, idempotency, drift assertion, and refund-on-failure"
    - "onSettled/onFailure hooks let the caller run its own status-flip logic inside (onSettled) or after (onFailure) the shared transaction without SettlementService needing caller-specific knowledge"
    - "Pre-flight validation failures that occur before settle() is ever called must handle their own refund (SettlementService never got the chance) — see TourSettlementService.refundInvalidSplit"

key-files:
  created: []
  modified:
    - backend/src/modules/tour-bookings/tour-settlement.service.ts
    - backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts

key-decisions:
  - "module: 'tour_booking' (not 'tour') passed to SettlementService.settle() so the failure-path refund reason string still contains 'tour_booking_settlement_failed', matching the pre-existing test assertion and any downstream reconciliation tooling that greps for that substring"
  - "refSuffix built as `V-${r.idx}` using the original split-array position index (including entries later filtered for null walletId) to preserve the exact <ref>-V-<idx> reference format byte-for-byte"
  - "Renamed the removed handleSettlementFailure's remaining pre-flight caller to refundInvalidSplit — a smaller helper only needed for the split-percentage-sum-over-100 guard, since that guard fires before SettlementService.settle() is ever called and therefore before SettlementService gets a chance to refund"

patterns-established:
  - "SettlementService caller pattern: resolve recipients -> call settle() with onSettled/onFailure hooks -> run any outside-transaction bookkeeping after settle() resolves"

requirements-completed: [SETTLE-01]

# Metrics
duration: 8min
completed: 2026-07-17
---

# Phase 12 Plan 03: Tour Settlement Delegation Summary

**TourSettlementService now delegates its atomic wallet fan-out (transaction, SELECT FOR UPDATE, idempotency, drift assertion, refund-on-failure) to the shared SettlementService, keeping only its GUIDE/HOST/ORGANISER/ATTRACTION vendor-resolution logic — proving SettlementService generalizes on the hardest existing multi-vendor case before the four simpler callers (Transport, Delivery, Marketplace, Events/Stays) are cut over in Plans 12-04 through 12-07.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-17T12:17:45-05:00 (base commit)
- **Completed:** 2026-07-17T12:25:17-05:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `TourSettlementService` no longer contains its own `$transaction` fan-out, `SELECT FOR UPDATE` loop, drift assertion, or system-wallet bootstrap — all delegated to `SettlementService.settle()`
- Reference format preserved byte-for-byte: `<ref>-V-<idx>` per vendor, `<ref>-PLAT` for platform
- All 12 pre-existing `tour-settlement.service.spec.ts` scenarios pass unmodified (only test wiring changed to inject a real `SettlementService` instance)
- Regression-checked `settlement.service.spec.ts` (14/14) and the wider `tour-bookings`/`webhooks` test suites (61/61) all still pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor tour-settlement.service.ts to delegate fan-out to SettlementService** - `589d868` (refactor)
2. **Task 2: Rewire tour-settlement.service.spec.ts to inject a real SettlementService** - `695e31b` (test)

**Plan metadata:** committed with this SUMMARY (see final commit)

## Files Created/Modified
- `backend/src/modules/tour-bookings/tour-settlement.service.ts` - Vendor-resolution logic unchanged; fan-out now delegates to `this.settlementService.settle()`; `handleSettlementFailure` narrowed to `refundInvalidSplit` (pre-flight guard only); `ensureSystemWallet`/`systemWalletId`/`SYSTEM_USER_ID` removed (owned by `SettlementService` now)
- `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` - `makeService()` now registers a real `SettlementService` provider (not mocked) alongside the existing mocked `PrismaService`/`RefundService`, and calls its `onModuleInit()` to resolve the system wallet

## Decisions Made
- `module: 'tour_booking'` passed to `settle()` (not `'tour'`) — required verbatim so the failure-path refund `reason` field still contains the substring `tour_booking_settlement_failed` that a pre-existing test asserts
- `refSuffix: \`V-${r.idx}\`` uses the original split-array index (not a tag-based suffix) to preserve the exact legacy reference format
- Kept `RefundService` injected in `TourSettlementService`'s constructor for the one remaining pre-flight case (`refundInvalidSplit`) that never reaches `SettlementService.settle()`

## Deviations from Plan

### Auto-fixed Issues

None — Task 1 and Task 2 were implemented exactly as specified in the plan text (including the precise `refSuffix`, `module` string, and hook wiring called out as "critical" in the plan).

### Out-of-Scope Discoveries (logged, not fixed)

**1. `wallet-invariant.e2e-spec.ts` is dead test code, unaffected by this refactor's test run**
- **Found during:** Task 2 verification (checking for any other file constructing `TourSettlementService` via DI that this refactor might break)
- **Issue:** `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` duplicates the wallet-invariant scenarios but is never picked up by Jest — `backend/jest.config.js`'s `testRegex: '.*\\.spec\\.ts$'` requires a literal `.` immediately before `spec.ts`, and this filename has `-spec.ts` (hyphen, not dot). Confirmed via `npx jest src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` → "No tests found". This predates 12-03 and is not caused by it.
- **Compounding factor:** if the filename were ever corrected to match the test regex, this file's `makeService()` helper would also need the `SettlementService` real-provider fix applied in Task 2, since it constructs `TourSettlementService` via the same DI pattern without providing `SettlementService`.
- **Action:** logged to `.planning/phases/12-settlement-engine-foundation/deferred-items.md`; not fixed (out of this plan's `files_modified` scope and never executes in CI today, so nothing observably broke).

---

**Total deviations:** 0 auto-fixed; 1 out-of-scope discovery logged (deferred, not fixed)
**Impact on plan:** None — plan executed exactly as written; the deferred item is a pre-existing dead-code discovery, not caused by this plan's changes.

## Issues Encountered
- Worktree had no `node_modules` (never had `npm install` run in it) — created Windows directory junctions from `node_modules` and `backend/node_modules` to the main repo's installed copies (untracked, gitignored) so `npx tsc`/`npx jest` could run, per the environment note in the executor prompt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `SettlementService` is now proven against the hardest existing caller (true N-way vendor resolution). Plans 12-04 through 12-07 can follow the same pattern (resolve recipients → call `settle()` with `onSettled`/`onFailure` hooks → run outside-transaction bookkeeping after) for Transport, Delivery, Marketplace, and Events/Stays.
- No blockers identified for downstream plans.

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*
