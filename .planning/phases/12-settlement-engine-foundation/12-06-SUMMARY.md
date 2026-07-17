---
phase: 12-settlement-engine-foundation
plan: 06
subsystem: payments
tags: [settlement, wallet, studio, prisma, nestjs, event-emitter, platform-config]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation (plan 01)
    provides: "SettlementService generalized N-way atomic wallet fan-out engine (backend/src/common/services/settlement.service.ts)"
  - phase: 12-settlement-engine-foundation (plan 02)
    provides: "Booking.govtLevyPct migration + seeded Ministry wallet + studio.platform_fee_pct (0.1) / studio.govt_levy_pct (0.05) PlatformConfig rows"
provides:
  - "Studio booking payments settle a real Ministry wallet credit via SettlementService.settle() — previously no wallet credit existed for any party"
  - "2-way-only settlement shape (Ministry + platform absorption, no vendor/owner leg) proven by test coverage, per D-10 (StudioSlot has no owner field; facilities are Ministry-owned)"
  - "@OnEvent('payment.studio_booking') dual-wire alongside the pre-existing Kafka consumer in onModuleInit"
affects: [13-settlement-cutover-transport-delivery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PlatformConfig-sourced fee/levy percentages with in-code fallback only when the config key is entirely unset (never hardcoded as the primary source)"
    - "onSettled/onFailure callbacks passed to SettlementService.settle() to keep booking-status transitions atomic with the wallet write (CONFIRMED on success, CANCELLED with settlementError metadata on failure)"

key-files:
  created: []
  modified:
    - backend/src/modules/studio/studio.service.ts
    - backend/src/modules/studio/__tests__/studio.service.spec.ts

key-decisions:
  - "Used 'CANCELLED' (not 'REFUNDED') in the onFailure handler — StudioBookingStatus enum has no REFUNDED value, unlike Order/Ticket/Booking status enums"
  - "SettlementService did not need to be added to StudioModule's providers array — it's exported globally by the @Global() CommonModule, consistent with how other settlement-wired modules (e.g. tour-bookings) consume it"

requirements-completed: [SETTLE-06]

# Metrics
duration: 25min
completed: 2026-07-17
---

# Phase 12 Plan 06: Studio Settlement Wiring Summary

**Studio booking payments now settle a Ministry wallet credit via SettlementService's atomic 2-way (Ministry + platform) split, sourced entirely from PlatformConfig — closing a gap where studio revenue was never split or credited to anyone.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-17T17:24:18Z
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments
- `handleStudioPayment` now reads `studio.platform_fee_pct` (fallback 0.10) and `studio.govt_levy_pct` (fallback 0.05) from `PlatformConfig` and calls `SettlementService.settle()` with a single `MINISTRY` recipient — the platform wallet automatically absorbs the remainder per `SettlementService`'s drift-absorption design
- Dual-wired `@OnEvent('payment.studio_booking')` directly above `handleStudioPayment`, alongside the existing Kafka consumer registered in `onModuleInit` — no change to the Kafka wiring
- Booking status transitions moved into the settlement transaction: `CONFIRMED` inside `onSettled` (atomic with the wallet write), `CANCELLED` (with `settlementError` in metadata) inside `onFailure`
- Added 3 new/updated test cases proving: the 2-way-only recipient shape (Ministry only, explicitly asserting no `VENDOR`/`HOST`/`OWNER` tag is present, per D-10), the PlatformConfig-fallback path when the config key is unset, and that the captured `onSettled` callback correctly transitions the booking to `CONFIRMED`

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire handleStudioPayment to SettlementService with new fee/levy config + @OnEvent** - `b9ead8d` (feat)
2. **Task 2: Add settlement test coverage to studio.service.spec.ts** - `afd0daf` (test)

**Plan metadata:** (this SUMMARY.md commit, applied by the orchestrator after worktree merge)

## Files Created/Modified
- `backend/src/modules/studio/studio.service.ts` - `handleStudioPayment` wired to `SettlementService.settle()`, reads `studio.platform_fee_pct`/`studio.govt_levy_pct` from `PlatformConfig`, dual-wired via `@OnEvent('payment.studio_booking')`
- `backend/src/modules/studio/__tests__/studio.service.spec.ts` - Added `SettlementService` mock (`settle`, `resolveMinistryWallet`), `platformConfig`/`wallet` mocks on `mockPrisma`, and settlement-specific test cases

## Decisions Made
- Followed the plan's exact recipient/config-read shape verbatim — no architectural deviation from the plan.
- `SettlementService` required no module-level provider wiring since `CommonModule` is `@Global()` and already exports it (confirmed by grepping other settlement-wired modules, e.g. `tour-bookings`, which also don't re-declare it locally).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The worktree had no `node_modules` present (never had `npm install` run in it). Created Windows directory junctions (`mklink /J`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's already-installed copies so `npx jest`/`npx tsc` could run. These junctions are gitignored/untracked (`git status --short` confirmed clean after creation) and were not committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Studio's settlement gap (SETTLE-06) is closed; Studio is now consistent with the other modules wired onto `SettlementService` in this phase.
- No blockers for Phase 13 (Settlement Cutover — Transport & Delivery), which depends on Phase 12 as a whole rather than this plan specifically.

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*
