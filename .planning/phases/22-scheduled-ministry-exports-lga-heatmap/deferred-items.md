# Deferred Items — Phase 22

Items discovered during execution that are out of scope for the current plan(s)
per the Scope Boundary rule (pre-existing, not caused by this task's changes).

## 22-04: `web` workspace has unresolved dependencies for `npx tsc --noEmit`

**Found during:** 22-04 Task 2 verification (`cd web && npx tsc --noEmit -p tsconfig.json`)

**Issue:** In this worktree, `web/node_modules` (and the hoisted root `node_modules`)
is missing several packages that ARE declared in `web/package.json` — `sonner`,
`framer-motion`, `recharts`, `@testing-library/jest-dom` all resolve to
`TS2307: Cannot find module`. This affects ~30 pre-existing files repo-wide
(e.g. `src/app/page.tsx`, `src/app/login/page.tsx`, `VisitorEntriesChart.tsx`,
`RevenueChart.tsx`, and the pre-existing `PageTransition.test.tsx`), not just
files touched by this plan.

Notably, `npm run test` (Jest, via `next/jest`) resolves these same packages
fine at runtime — the gap is specific to `tsc`'s module resolution in this
worktree's `node_modules` state, most likely an incomplete `npm install` /
workspace-hoisting artifact of the worktree checkout, not a code defect.

**Verification performed instead:** Filtered `tsc --noEmit` output to only
files touched by 22-04 (`LgaMonthHeatmap.tsx`, `page.tsx`) — zero NEW errors
introduced by this plan's changes beyond the pre-existing `sonner` import
error already present in `page.tsx` before this plan. One genuine type error
that 22-04's own new code introduced (`TS2802` — `for...of` over
`Map.values()` requires `downlevelIteration`) was found and fixed in-scope
(Rule 1) as part of the Task 2 commit.

**Status:** Deferred — not fixed. Fixing requires a full `npm install` /
node_modules audit across the whole `web` workspace, out of scope for a
single-panel dashboard plan.

**Action needed:** Run a clean `npm install` at the repo root (and/or
`web/`) in a non-worktree checkout before the next full `tsc --noEmit`
CI/verification gate is expected to pass repo-wide.
