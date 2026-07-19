---
phase: 18-settlement-split-centralization
plan: 02
subsystem: payments
tags: [nestjs, prisma, settlement, transport, delivery, events, resolveSplit]

# Dependency graph
requires:
  - phase: 18-01
    provides: "SettlementService.resolveSplit(module, amountNgn) centralized split-tier resolver (SettlementSplitTier model + resolver logic)"
provides:
  - "Transport, Delivery, Events settlement call sites migrated off duplicated inline platformConfig.findUnique() reads onto resolveSplit()"
  - "Byte-for-byte regression tests proving computed settlement amounts are unchanged pre/post migration for all 3 modules"
affects: [18-03, 18-04, 19-settlement-dispute-adjustment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveSplit() call sites convert 0-1 fraction return shape to whole-number percent only when the caller's existing arithmetic expects whole numbers (Transport/Delivery); fraction-shaped callers (Events) use the return value directly with no conversion"

key-files:
  created: []
  modified:
    - backend/src/modules/transport/transport.service.ts
    - backend/src/modules/transport/__tests__/transport.service.spec.ts
    - backend/src/modules/delivery/delivery.service.ts
    - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
    - backend/src/modules/events/events.service.ts
    - backend/src/modules/events/__tests__/events.service.spec.ts

key-decisions:
  - "Transport/Delivery convert resolveSplit's 0-1 fractions to whole-number percent (multiply by 100) to preserve their existing whole-number-percent arithmetic byte-for-byte; Events needed no conversion since its arithmetic was already fraction-shaped"
  - "Delivery's MULTIPLY-FIRST rounding order and Transport's SUBTRACT-FIRST rounding order were both left completely untouched — only the config-read mechanism changed"
  - "Events' 'falls back to documented defaults when PlatformConfig keys are unset' test was retired and replaced with a resolveSplit-based fraction-shaped regression test, since resolveSplit() now throws (rather than silently defaulting) when no active SettlementSplitTier exists — the old in-code fallback default no longer exists"

patterns-established: []

requirements-completed: [SETTLE-11b, SETTLE-11c]

# Metrics
duration: 38min
completed: 2026-07-19
---

# Phase 18 Plan 02: Migrate Transport/Delivery/Events to resolveSplit() Summary

**Transport, Delivery, and Events settlement call sites now delegate their driver/rider/organiser split percentages to `SettlementService.resolveSplit()` instead of duplicating `platformConfig.findUnique()` reads, with rounding order (subtract-first vs. multiply-first) preserved byte-for-byte and proven via regression tests.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-07-19T15:14:00Z (approx, per STATE.md last activity)
- **Completed:** 2026-07-19T15:52:31Z
- **Tasks:** 3/3 completed
- **Files modified:** 6

## Accomplishments
- Transport's `completeTrip()` cutover branch now calls `resolveSplit('transport', fare)` once instead of 2 inline `platformConfig.findUnique()` reads, converting the 0-1 fraction result to whole-number percent for the existing subtract-first formula
- Delivery's `completeDelivery()` cutover branch now calls `resolveSplit('delivery', fee)` once, preserving its distinct multiply-first rounding order (never normalized to Transport's order)
- Events' `handleTicketPayment()` handler now calls `resolveSplit('events', ticketPrice)` once with no unit conversion (already fraction-shaped), removing the last inline `platformConfig` reads from that settlement path
- All 3 call sites proven byte-identical to their pre-migration formulas via dedicated regression tests (fixed fare/fee/ticketPrice inputs with mocked `resolveSplit` return values, asserting exact computed `amountNgn` on the recipients array)
- Full backend test suite green: 54 suites / 639 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Transport call site (subtract-first rounding preserved)** - `8925f05` (feat)
2. **Task 2: Migrate Delivery call site (multiply-first rounding preserved)** - `4391bd0` (feat)
3. **Task 3: Migrate Events call site (already fraction-shaped, no unit conversion)** - `b2be4d2` (feat)

**Plan metadata:** (worktree mode — SUMMARY.md commit follows, STATE.md/ROADMAP.md updated centrally by orchestrator after merge)

## Files Created/Modified
- `backend/src/modules/transport/transport.service.ts` - `completeTrip()` cutover branch calls `resolveSplit('transport', fare)`; subtract-first arithmetic (lines below the resolver call) untouched
- `backend/src/modules/transport/__tests__/transport.service.spec.ts` - Added `resolveSplit` to `mockSettlement`, 2 new regression tests (byte-identical amounts, no more `platformConfig.findUnique` for the 2 removed keys)
- `backend/src/modules/delivery/delivery.service.ts` - `completeDelivery()` cutover branch calls `resolveSplit('delivery', fee)`; multiply-first arithmetic untouched
- `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` - Added `resolveSplit` to `mockSettlement` + beforeEach reset, 2 new regression tests
- `backend/src/modules/events/events.service.ts` - `handleTicketPayment()` `@OnEvent` handler calls `resolveSplit('events', ticketPrice)` directly, no unit conversion
- `backend/src/modules/events/__tests__/events.service.spec.ts` - Added `resolveSplit` to `mockSettlement` + beforeEach reset, rewrote 2 tests that previously exercised the removed inline `platformConfig` fallback, added 1 new "no longer reads PlatformConfig" regression test

## Decisions Made
- Kept the pre-existing `mockSettlement.settle`/`resolveMinistryWallet` beforeEach-reset pattern from `transport.service.spec.ts` and applied it consistently to `delivery.service.spec.ts` and `events.service.spec.ts` for `resolveSplit` (and, incidentally, hardened those two files against latent test-order leakage from `mockImplementation` calls set by earlier tests — a pre-existing gap in those two spec files, not previously exercised because no test needed a stable cross-test default before this plan)
- Retired Events' "falls back to documented defaults (0.10/0.05) when PlatformConfig keys are unset" test rather than trying to preserve its literal premise — `resolveSplit()` throws when no active `SettlementSplitTier` row exists (18-01's design), so there is no in-code fallback default left in `events.service.ts` to test. Replaced with a fraction-shaped no-conversion regression test per Task 3's behavior spec.

## Deviations from Plan

None — plan executed as written. The two existing tests retired/rewritten in `events.service.spec.ts` were an anticipated consequence of removing the inline `platformConfig.findUnique()` fallback pattern described in the plan's Task 3 action, not a deviation from it.

## Issues Encountered
- The worktree had no `node_modules` (worktrees don't inherit them from the main checkout). Symlinked `node_modules` and `backend/node_modules` from the main repo checkout (`C:\Developer\work\ISEYAA`) rather than running a full `npm install`, since the main checkout's install already matched this worktree's lockfile-pinned dependency tree (no prisma schema changes in this plan). This is a local dev-environment workaround, not a source change — no commit was needed for it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 3 of the 6 duplicated `PlatformConfig` read pairs targeted by this phase (SETTLE-11a/b) are now eliminated (Transport, Delivery, Events)
- Marketplace, Stays, Studio (18-03) and the admin CRUD endpoints (18-04) are unaffected by this plan — disjoint files, no blockers
- No known stubs or threat-surface changes introduced by this plan (see below)

## Known Stubs

None.

## Threat Flags

None — this plan introduces no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Both threats in the plan's `<threat_model>` (T-18-05, T-18-06) are addressed inline: inputs to `resolveSplit()` remain server-computed amounts (never derived from untrusted webhook payload metadata), and dedicated regression tests assert byte-identical computed amounts pre/post migration for both rounding orders.

---
*Phase: 18-settlement-split-centralization*
*Completed: 2026-07-19*
