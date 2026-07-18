---
phase: 14-ministry-dashboard
plan: 09
subsystem: api
tags: [prisma, sql, ministry-dashboard, date-range, regression-test]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard
    provides: MinistryService with buildFilters()/getRevenueToGovernment() date-range filtering (built in earlier 14-0x plans)
provides:
  - Corrected `to`-date boundary computation for all 3 Ministry aggregate report methods (visitor entries, purpose breakdown, revenue-to-government)
  - Regression test coverage proving the full `to` date is included in query results
affects: [14-ministry-dashboard follow-on plans, any future consumer of MinistryService date-range filtering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusive next-day boundary pattern for inclusive date-only range filters: parse date-only string as UTC midnight, add 24h in ms, compare with `<` instead of `<=` against the raw UTC-midnight value"

key-files:
  created: []
  modified:
    - backend/src/modules/ministry/ministry.service.ts
    - backend/src/modules/ministry/__tests__/ministry.service.spec.ts

key-decisions:
  - "Introduced a single shared private helper toExclusiveEndOfDayBoundary(to) on MinistryService rather than duplicating the +24h arithmetic inline at both call sites (buildFilters() and getRevenueToGovernment()'s independent fromFilter/toFilter block)"

patterns-established:
  - "Exclusive next-day boundary for inclusive date-only range end: new Date(new Date(to).getTime() + 24*60*60*1000), compared with `<` — not `<=` against UTC midnight of `to` itself"

requirements-completed: [MIN-02, MIN-03, MIN-04]

# Metrics
duration: 6min
completed: 2026-07-18
---

# Phase 14 Plan 09: Ministry `to`-date boundary fix (CR-01 gap closure) Summary

**Fixed the Ministry dashboard's `to` date filter so it includes the full `to` day (was silently dropping ~24h via a UTC-midnight `<=` comparison) across all 3 core aggregate reports, with regression tests proving inclusion at 23:59.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-18T12:43:00Z
- **Completed:** 2026-07-18T12:49:53Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `buildFilters()` (shared by `getVisitorEntriesByLgaAndMonth()` and `getPurposeBreakdown()`) now computes an exclusive next-day boundary for `to` and compares with `<`, instead of `<=` against UTC midnight of `to` itself
- `getRevenueToGovernment()`'s independent `fromFilter`/`toFilter` block received the identical fix
- Added a new private `toExclusiveEndOfDayBoundary(to: string): Date` helper shared by both fix sites
- Added 3 new CR-01 regression tests (one per affected query method) proving the interpolated `to` boundary equals `2026-07-19T00:00:00.000Z` for `to = '2026-07-18'`, and that `2026-07-18T23:59:00.000Z` falls strictly before it
- Updated 2 pre-existing test assertions that expected the old buggy `<=` operator
- `from` boundary behavior is byte-for-byte unchanged in both fix locations

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix `to` boundary to be genuinely inclusive of the full day in both filter locations** - `57f3cf8` (fix)
2. **Task 2: Regression tests proving the `to` boundary is inclusive of the full day, for all 3 affected query methods** - `d85e484` (test)

**Plan metadata:** (pending — orchestrator finalizes after wave merge)

## Files Created/Modified
- `backend/src/modules/ministry/ministry.service.ts` - Added `toExclusiveEndOfDayBoundary()`; fixed `buildFilters()`'s and `getRevenueToGovernment()`'s independent `toFilter` to use `<` against the exclusive next-day boundary instead of `<=` against UTC midnight of `to`
- `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` - Updated 2 pre-existing assertions from `<=` to `<`; added 3 new CR-01 regression tests (one per affected query method)

## Decisions Made
- Single shared helper method (`toExclusiveEndOfDayBoundary`) used at both fix sites rather than duplicating the arithmetic inline, keeping the two independent code paths (buildFilters() vs. getRevenueToGovernment()'s own block) each calling one canonical implementation — reduces risk of the two diverging on a future edit.

## Deviations from Plan

None - plan executed exactly as written. Both fix sites and all 3 regression tests match the plan's `<action>` specification precisely (method signature, arithmetic, operator change, test names containing "CR-01", boundary assertion values).

## Issues Encountered

The isolated git worktree had no `node_modules` installed (fresh worktree, dependencies never installed there), which caused `tsc --noEmit` and `npm test` to fail with unrelated `Cannot find module` errors across the whole backend codebase — not caused by this plan's changes. Resolved by creating NTFS directory junctions (`mklink /J`) from the worktree's `node_modules` and `backend/node_modules` to the main checkout's already-installed `node_modules` directories, solely for local verification. These junctions are `.gitignore`d (confirmed via `git check-ignore -v`), were never staged or committed, and were removed after verification completed — the main checkout's `node_modules` was left untouched (entry counts unchanged: 1210 root, 51 backend).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 (BLOCKER, `14-REVIEW.md` and `14-VERIFICATION.md` gap 1) is now closed: all 3 Ministry aggregate reports (visitor entries, purpose breakdown, revenue-to-government) correctly include the entire `to` date for both the dashboard's default 30-day-to-today range and any custom range.
- Full ministry module test suite (54 tests across 4 spec files) passes with no regressions.
- `cd backend && npx tsc --noEmit -p tsconfig.build.json` exits 0.
- No blockers for subsequent phase-14 gap-closure plans (e.g. the CR-02 plan referenced alongside this one in recent commit history).

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*

## Self-Check: PASSED
