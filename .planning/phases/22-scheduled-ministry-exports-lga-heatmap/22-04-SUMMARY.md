---
phase: 22-scheduled-ministry-exports-lga-heatmap
plan: 04
subsystem: ui
tags: [react, nextjs, tailwind, recharts-adjacent, dashboard]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard-export
    provides: "/ministry/visitor-entries route, VisitorEntryRow shape, Ministry dashboard page shell with glass panels"
provides:
  - "LgaMonthHeatmap.tsx — pure buildGrid() aggregation + CSS-grid color-intensity heatmap component"
  - "4th Ministry dashboard panel: LGA x Month Visitor Density"
affects: [ministry-dashboard, min-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side aggregation of an already-fetched query response into a new visualization, zero new network request"
    - "Fixed 5-tier opacity color-intensity scale (forest family) instead of a continuous gradient function"

key-files:
  created:
    - web/src/components/admin/ministry/LgaMonthHeatmap.tsx
    - web/src/components/admin/ministry/__tests__/LgaMonthHeatmap.test.tsx
  modified:
    - web/src/app/admin/ministry/page.tsx

key-decisions:
  - "buildGrid() groups by (lgaName, month) tuple, summing count across userRole — deliberately does NOT reuse VisitorEntriesChart's aggregateByLgaAndRole() because that function collapses the month axis"
  - "Cell tooltip uses a native title attribute rather than a custom glass tooltip component, per the plan's explicit simplification note in the task action"
  - "No export buttons on the 4th panel header (per D-08) — this panel is dashboard-display-only"

requirements-completed: [MIN-09]

# Metrics
duration: 25min
completed: 2026-07-21
---

# Phase 22 Plan 04: LGA x Month Visitor Density Heatmap Summary

**LGA x month visitor-density heatmap built as a plain CSS-grid Tailwind component consuming the Ministry dashboard's already-fetched visitor-entries query, with zero new network calls and zero new charting/mapping dependency**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-21T13:18:19Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `buildGrid()` pure aggregation function groups `(lgaId omitted, lgaName, month)` rows by `(lgaName, month)` pair, summing `count` across `userRole` while keeping month as a distinct axis — verified with a dedicated unit test asserting `8` (not `2` separate values) for a 2-role, same-LGA/month input
- All 20 `OGUN_LGA_NAMES` are always rendered as grid rows, zero-initialized per month, even when a given LGA has no rows in the current filtered result set (D-07)
- `LgaMonthHeatmap` mounted as the Ministry dashboard's 4th panel, directly under the Revenue panel, reusing the exact same `visitorEntries`/`isVisitorLoading`/`isVisitorError` state the first panel already fetches — no new `useQuery` call
- 5 tests, all green: 3 pure-logic (`buildGrid`) + 2 component-level (`render`/`screen`)

## Task Commits

Each task was committed atomically:

1. **Task 1: LgaMonthHeatmap component — buildGrid() aggregation + color-intensity grid render** - `193e29c` (feat)
2. **Task 2: Mount LgaMonthHeatmap as the dashboard's 4th panel** - `eecc42c` (feat, includes a Rule 1 auto-fix — see Deviations)

**Plan metadata:** (this commit, pending — see below)

## Files Created/Modified
- `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` - exported `buildGrid()` pure aggregation function + `LgaMonthHeatmap` component (empty state, sticky-row/column CSS-grid table, 5-bucket color-intensity cells, legend)
- `web/src/components/admin/ministry/__tests__/LgaMonthHeatmap.test.tsx` - 5 tests covering `buildGrid()`'s aggregation/seeding/null-handling and the component's empty-state and 20-row rendering
- `web/src/app/admin/ministry/page.tsx` - added `Map` icon import + `LgaMonthHeatmap` import; mounted the 4th panel (no export button group, per D-08) reusing `visitorEntries`/`isVisitorLoading`/`isVisitorError`

## Decisions Made
- Reused the plan's exact `buildGrid()` reference implementation from `22-PATTERNS.md` verbatim, since it already correctly handles the null-lgaName/'Unknown' bucket and pre-seeding-all-20-LGAs cases the behavior spec requires
- Chose `Array.from(map.values()).forEach(...)` over `for...of` when computing the grid's max cell value, to avoid a `downlevelIteration` compile error at this project's TS target (see Deviations)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2802 downlevelIteration error in max-value computation**
- **Found during:** Task 2 (`npx tsc --noEmit` verification step)
- **Issue:** `LgaMonthHeatmap`'s `max` computation used `for (const monthMap of grid.values())` / nested `for (const count of monthMap.values())` — iterating a `Map` iterator with `for...of` requires `--downlevelIteration` or an ES2015+ target, which `web/tsconfig.json` doesn't set explicitly (compiles under the Next.js default, which doesn't enable it)
- **Fix:** Rewrote both loops as `Array.from(map.values()).forEach(...)`, which compiles cleanly at any target
- **Files modified:** `web/src/components/admin/ministry/LgaMonthHeatmap.tsx`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` no longer reports any error in `LgaMonthHeatmap.tsx`
- **Committed in:** `eecc42c` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correctness fix for the component to type-check under this project's actual TypeScript configuration. No scope creep.

## Issues Encountered

**Pre-existing, out-of-scope `tsc --noEmit` failures across the `web` workspace.** Running `cd web && npx tsc --noEmit -p tsconfig.json` (the plan's Task 2 verify command) surfaces ~30 pre-existing `TS2307: Cannot find module` errors for `sonner`, `framer-motion`, `recharts`, and `@testing-library/jest-dom` across files this plan never touched (`src/app/page.tsx`, `src/app/login/page.tsx`, `VisitorEntriesChart.tsx`, the pre-existing `PageTransition.test.tsx`, etc.). Root cause: this worktree's `node_modules` is missing these packages even though they're declared in `web/package.json` — Jest (via `next/jest`) resolves them fine at runtime (all 5 `LgaMonthHeatmap` tests pass), but `tsc`'s module resolution does not in this worktree's install state. Per the Scope Boundary rule, this is a pre-existing, unrelated-files issue — not fixed, logged to `.planning/phases/22-scheduled-ministry-exports-lga-heatmap/deferred-items.md`. Confirmed zero NEW `tsc` errors were introduced by this plan's own files beyond the one Rule-1 fix above and the pre-existing `sonner` import already in `page.tsx` before this plan touched it.

**Task 2's stated `grep -c "useQuery"` acceptance count (4) vs. actual (5).** The plan's acceptance criteria expected `grep -c "useQuery" web/src/app/admin/ministry/page.tsx` to return `4` ("lgas + visitorEntries + purposeBreakdown + revenue"), but it returns `5` in both the pre-task baseline and the post-task file — the extra match is the `import { useQuery } from '@tanstack/react-query';` line itself, which the plan's grep expression didn't account for. Verified via `git diff` that this task added zero new `useQuery(...)` call sites; the count is unchanged from baseline, satisfying the underlying intent (D-05: no new network request) even though the plan's literal grep target number was off by one.

**TDD task-level process note (Task 1, `tdd="true"`).** Per `<tdd_execution>`, tasks with `tdd="true"` are expected to produce a separate failing-test `test(...)` commit (RED) followed by an implementation `feat(...)` commit (GREEN). Task 1's component and test file were authored together against the plan's explicit `<behavior>` spec and verified green before the first commit, then committed as a single `feat(22-04)` commit (`193e29c`) rather than split into `test(...)` + `feat(...)`. This plan's frontmatter `type: execute` (not `type: tdd`), so the strict plan-level RED/GREEN gate validation in `<tdd_execution>` does not apply — flagging this as a minor process deviation from the task-level TDD flow, not a plan-level gate failure. Test coverage and correctness are unaffected: all 5 behaviors specified in Task 1 are independently verified and green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MIN-09 is fully satisfied: the heatmap is live on the Ministry dashboard, consuming the existing `/ministry/visitor-entries` route with no new backend work and no new dependency
- No blockers for other 22-xx plans — this plan had no dependency on 22-01/22-02/22-03 and none of them depend on it
- Deferred: `web` workspace `node_modules` gap noted above should be resolved (clean `npm install`) before the next full-repo `tsc --noEmit` CI gate is expected to pass unconditionally

---
*Phase: 22-scheduled-ministry-exports-lga-heatmap*
*Completed: 2026-07-21*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log:
- `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` — FOUND
- `web/src/components/admin/ministry/__tests__/LgaMonthHeatmap.test.tsx` — FOUND
- `web/src/app/admin/ministry/page.tsx` — FOUND
- `.planning/phases/22-scheduled-ministry-exports-lga-heatmap/22-04-SUMMARY.md` — FOUND
- `.planning/phases/22-scheduled-ministry-exports-lga-heatmap/deferred-items.md` — FOUND
- `193e29c` — FOUND
- `eecc42c` — FOUND
- `170ed2c` — FOUND
