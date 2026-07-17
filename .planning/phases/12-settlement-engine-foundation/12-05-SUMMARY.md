---
phase: 12-settlement-engine-foundation
plan: 05
subsystem: payments
tags: [nestjs, prisma, settlement, events, wallet, platformconfig]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation
    provides: "SettlementService (12-01) N-way atomic wallet fan-out; events.platform_fee_pct / events.govt_levy_pct PlatformConfig seed + Ministry wallet (12-02)"
provides:
  - "Events ticket purchases now settle organizer + Ministry + platform atomically via SettlementService"
  - "events.platform_fee_pct / events.govt_levy_pct PlatformConfig-driven fee split for Events (previously non-existent)"
affects: [13-settlement-cutover-transport-delivery, 14-ministry-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-wire @OnEvent + existing Kafka consumer on the same handler method (per D-04) rather than a separate wrapper method"
    - "onSettled/onFailure callbacks passed to SettlementService.settle() keep ticket status transitions atomic with wallet writes"

key-files:
  created: []
  modified:
    - backend/src/modules/events/events.service.ts
    - backend/src/modules/events/__tests__/events.service.spec.ts

key-decisions:
  - "Reused ticket.ticketType.eventId (available on the default Prisma include shape) for recipient metadata instead of the plan's placeholder eventId expression"
  - "Followed plan's literal instruction to decorate handleTicketPayment directly with @OnEvent rather than tour-settlement's separate wrapper-method dual-wire pattern -- both achieve the same dual-wire outcome and the existing outer try/catch already prevents unhandled rejections"

patterns-established: []

requirements-completed: [SETTLE-06]

# Metrics
duration: 8min
completed: 2026-07-17
---

# Phase 12 Plan 05: Events Ticket Settlement Wiring Summary

**Event ticket purchases now settle a 3-way organizer/Ministry/platform split via SettlementService, sourced entirely from PlatformConfig (events.platform_fee_pct / events.govt_levy_pct, fallback 0.10/0.05) — closing the previously entirely-unsettled Events revenue stream.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-17T17:17:45Z
- **Completed:** 2026-07-17T17:25:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `handleTicketPayment` reads `events.platform_fee_pct` / `events.govt_levy_pct` from `PlatformConfig` (never hardcoded, CLAUDE.md-compliant) and computes organiser/Ministry/platform amounts
- Organiser wallet resolved via the server-side FK chain (`ticket.ticketType.event.organizerId`); Ministry wallet via `SettlementService.resolveMinistryWallet()` — both immune to webhook `metadata` tampering (T-12-12)
- Ticket `ISSUED` transition + `TicketType.sold` increment moved inside `SettlementService`'s `onSettled` callback, atomic with the wallet writes (replacing the previous unprotected `$transaction([...])` array call)
- Dual-wired `@OnEvent('payment.ticket_purchase')` directly above `handleTicketPayment`, leaving the existing `onModuleInit()` Kafka consumer untouched, per D-04
- 5 new/rewritten unit tests cover: configured-percentage split math, unset-config fallback math, non-PENDING early exit, atomic `onSettled` callback behavior, and no-email path

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire handleTicketPayment to SettlementService with new fee/levy config + @OnEvent** - `9c34055` (feat)
2. **Task 2: Add settlement test coverage to events.service.spec.ts** - `4f82444` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `backend/src/modules/events/events.service.ts` - `handleTicketPayment` wired to `SettlementService.settle()` with PlatformConfig-sourced fee/levy split, `@OnEvent` dual-wire, `organizerId` added to the nested `event` select
- `backend/src/modules/events/__tests__/events.service.spec.ts` - `SettlementService` mock provider, `platformConfig`/`wallet` mockPrisma shapes, new settlement test cases

## Decisions Made
- Used `ticket.ticketType.eventId` (present on the default Prisma `include` shape, since `ticketType` uses `include` not `select`) for recipient metadata, resolving the plan's noted placeholder ambiguity
- Kept the plan's literal single-method `@OnEvent` decoration (vs. tour-settlement's separate wrapper method) — the existing outer try/catch in `handleTicketPayment` already swallows and logs errors, so no unhandled-rejection risk from the `@OnEvent` dispatch path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree had no `node_modules` (fresh checkout, no `npm install` run in it yet). Created Windows directory junctions (`mklink /J`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's already-installed copies so `npx jest`/`npx tsc` could run — junctions are gitignored/untracked, not committed. First attempt at creating the junctions produced a malformed doubled-drive-letter target path (an MSYS/Git-Bash path-translation artifact of piping a Windows absolute path through `cmd //c`); fixed by setting `MSYS_NO_PATHCONV=1` before the `mklink` invocation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Events settlement now follows the same `SettlementService` pattern as Tour Packages (09-06) and is ready for Phase 13's cutover work to reference as a second worked example
- No blockers for sibling plans in this wave (12-06, 12-07, 12-08) — file scope (`backend/src/modules/events/*`) does not overlap

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*
