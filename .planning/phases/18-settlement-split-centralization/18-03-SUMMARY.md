---
phase: 18-settlement-split-centralization
plan: 03
subsystem: payments
tags: [settlement, prisma, nestjs, marketplace, stays, studio, resolveSplit]

# Dependency graph
requires:
  - phase: 18-settlement-split-centralization (plan 01)
    provides: SettlementService.resolveSplit(module, amountNgn) reading SettlementSplitTier
provides:
  - Marketplace, Stays, Studio all call SettlementService.resolveSplit() instead of duplicated inline platformConfig.findUnique() reads
  - Regression tests proving identical computed settlement amounts before/after migration for all 3 modules
  - Dedicated Stays test proving a mid-escrow-hold SettlementSplitTier change does not retroactively affect an already-created booking's payout
affects: [18-04-admin-crud-endpoints, 19-settlement-dispute-adjustment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveSplit() call is positioned AFTER the amount it needs (total/totalPrice) is computed, mirroring the pre-migration read timing"
    - "Money-flow-sensitive snapshot pattern (Stays): resolver called once at creation time, result persisted to the row, downstream cron job reads the stored value and never re-resolves"

key-files:
  created: []
  modified:
    - backend/src/modules/marketplace/marketplace.service.ts
    - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
    - backend/src/modules/stays/stays.service.ts
    - backend/src/modules/stays/__tests__/stays.service.spec.ts
    - backend/src/modules/studio/studio.service.ts
    - backend/src/modules/studio/__tests__/studio.service.spec.ts

key-decisions:
  - "Marketplace (D-02): vendor.govtLevyPct per-vendor override stays a direct Vendor-row read, NOT absorbed into resolveSplit() — only the module-level platform_fee_pct routes through the resolver"
  - "Stays (D-05): resolveSplit() is called strictly inside createBooking(), before booking.create() persists govtLevyPct; releaseEscrow() is byte-for-byte unchanged and still reads the stored Booking.govtLevyPct, never re-resolving the split"
  - "Studio (D-01): platformPct resolves to null and is assigned to platformFeePct without ?? coalescing, preserving the exact 'fetched but unused' metadata semantics; recipients array unchanged (single MINISTRY tag)"

patterns-established:
  - "For settlement call sites with a downstream deferred payout (escrow/cron), resolve the split ONLY at the money-committing event, snapshot to the DB row, and never re-resolve in the deferred handler"

requirements-completed: [SETTLE-11b, SETTLE-11c]

# Metrics
duration: 22min
completed: 2026-07-19
---

# Phase 18 Plan 03: Marketplace/Stays/Studio Settlement Split Migration Summary

**Migrated Marketplace, Stays, and Studio off duplicated inline `platformConfig.findUnique()` reads onto the centralized `SettlementService.resolveSplit()`, each preserving a locked, deliberate money-flow quirk (D-02 vendor override, D-05 booking-time snapshot, D-01 unused platform fee) exactly as documented in CONTEXT.md.**

## Performance

- **Duration:** 22 min (10:36–10:44 UTC-5, plus ~9 min upfront `npm install` + `prisma generate` for the fresh worktree)
- **Started:** 2026-07-19T15:14:00Z (approx, worktree setup)
- **Completed:** 2026-07-19T15:44:58Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Marketplace's module-level platform fee now resolves via `resolveSplit('marketplace', total)`, called after `total` is computed; `vendor.govtLevyPct` continues to be read directly from the Vendor row, unrouted through the resolver (D-02 preserved)
- Stays' `createBooking()` calls `resolveSplit('stays', totalPrice)` exactly once at booking-creation time and snapshots the result onto `Booking.govtLevyPct`; `releaseEscrow()` remains completely untouched — a dedicated regression test proves a `SettlementSplitTier` change after booking creation does not alter that booking's escrow payout (D-05 preserved)
- Studio's `handleStudioPayment()` calls `resolveSplit('studio', total)` once, replacing two separate `platformConfig.findUnique()` reads; `platformPct` resolves to `null` and flows unchanged into `platformMetadata.configuredPlatformFeePct` without `?? 0` coalescing, and the `recipients` array still contains exactly one `MINISTRY` tag (D-01 preserved)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Marketplace call site (D-02: per-vendor levy override preserved)** - `6d51e57` (feat)
2. **Task 2: Migrate Stays call site (booking-creation-time snapshot ONLY)** - `13292da` (feat)
3. **Task 3: Migrate Studio call site (D-01: platformPct fetched-but-unused preserved exactly)** - `618dfc1` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator will finalize STATE.md/ROADMAP.md after merge)

## Files Created/Modified
- `backend/src/modules/marketplace/marketplace.service.ts` - `createOrder()` now calls `resolveSplit('marketplace', total)` after `total` is computed; `vendor.govtLevyPct` read unchanged
- `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` - Added `resolveSplit` mock; rewrote the two `platformConfig`-based createOrder tests to assert `resolveSplit()` is called with the computed total and `platformConfig.findUnique` is not called
- `backend/src/modules/stays/stays.service.ts` - `createBooking()` now calls `resolveSplit('stays', totalPrice)` after `totalPrice` is computed and before `booking.create()`; `releaseEscrow()` untouched
- `backend/src/modules/stays/__tests__/stays.service.spec.ts` - Added `resolveSplit` mock; rewrote the snapshot test; added a new "config changed mid-escrow-hold" regression test spanning `createBooking()` → simulated tier change → `releaseEscrow()`
- `backend/src/modules/studio/studio.service.ts` - `handleStudioPayment()` now calls `resolveSplit('studio', total)` once, replacing two `platformConfig.findUnique()` calls; `platformFeePct` assigned from resolved `platformPct` without coalescing
- `backend/src/modules/studio/__tests__/studio.service.spec.ts` - Added `resolveSplit` mock; rewrote the Ministry-only settlement test; added a dedicated test asserting `platformMetadata.configuredPlatformFeePct` is exactly `null`

## Decisions Made
- Preserved all three locked CONTEXT.md constraints (D-01, D-02, D-05) verbatim rather than "fixing" any of the underlying money-flow inconsistencies — this plan's explicit scope was migration-only, not correction
- Removed the now-unused `mockPlatformConfig` fixture constant from the Marketplace spec file (no longer referenced after the migration) to avoid a dead-code lint warning

## Deviations from Plan

None - plan executed exactly as written. The 3 task `<action>` blocks were followed literally; each `resolveSplit()` call was inserted at the exact control-flow position specified (after the amount computation, before persistence/settle()).

## Issues Encountered
- The worktree had no `node_modules` (fresh worktree checkout) — ran `npm install` at the repo root and `npx prisma generate` inside `backend/` before any test could execute. This is expected first-run worktree setup, not a plan deviation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SETTLE-11b and SETTLE-11c are now complete for all 3 in-scope modules; 18-04 (admin CRUD endpoints for `SettlementSplitTier`) and Phase 19 (dispute/adjustment workflow, which depends on `resolveSplit()` as the source of truth for "what split should have applied") can proceed
- Full backend suite green: 54 test suites, 634 tests passing, including all 3 migrated modules' regression suites (marketplace: 24 tests, stays: 31 tests, studio: 19 tests)
- No blockers

---
*Phase: 18-settlement-split-centralization*
*Completed: 2026-07-19*
