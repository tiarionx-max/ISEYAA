---
phase: 19-settlement-dispute-adjustment-workflow
plan: 06
subsystem: payments
tags: [settlement, dispute-resolution, money-conservation, jest, tdd, gap-closure]

# Dependency graph
requires:
  - phase: 19-settlement-dispute-adjustment-workflow (plan 05)
    provides: "First CR-01 fix (platform line never emitted when platformRow missing); computeAdjustmentLines() JSDoc and guard structure this plan extends"
provides:
  - "Money-conserving computeAdjustmentLines() for every settlement input shape, including ones missing a wallet-bearing ministry or earner row"
  - "3 regression tests locking in the previously-untested trigger paths with exact expected line values"
  - "Corrected REQUIREMENTS.md checkbox state for SETTLE-10a through SETTLE-10e"
affects: [19-settlement-dispute-adjustment-workflow, settlement-service, wallet]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deliverability-gated balancing formula: correctPlatformTotal subtracts a category's CORRECTED total only when earnerDelivered/ministryDelivered is true (mirrors the exact guard already used to decide whether to push that category's own line); otherwise the category's ACTUAL total is subtracted, retaining the undelivered correction on the platform wallet"

key-files:
  created: []
  modified:
    - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
    - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Hoisted earnerRowsWithWallet declaration above the lines array and extracted ministryDelivered/earnerDelivered as named booleans so the same deliverability conditions used to gate line-pushes are reused verbatim in the correctPlatformTotal formula — zero behavior change for any case where a category already has a deliverable wallet row"
  - "REQUIREMENTS.md traceability table rows for SETTLE-10a/b/e also corrected from Pending to Complete (out of the plan's literal checkbox-line scope but the same staleness the plan exists to fix; leaving the table inconsistent with the checkboxes would be a self-contradicting document)"

requirements-completed: [SETTLE-10c, SETTLE-10e]

# Metrics
duration: 12min
completed: 2026-07-20
---

# Phase 19 Plan 06: Residual CR-01 Money-Conservation Fix Summary

**Gated `correctPlatformTotal`'s subtraction in `computeAdjustmentLines()` on per-category wallet deliverability, closing the residual money-conservation defect the 2026-07-20 re-verification found surviving plan 19-05's first CR-01 fix.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T11:16:08-05:00 (base commit) / ~2026-07-20T16:12Z (agent start)
- **Completed:** 2026-07-20T16:24:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `computeAdjustmentLines()` now produces a zero-sum `lines` array for every settlement shape, including ones where the corrected split assigns a nonzero share to a category (ministry or earner) that has no deliverable wallet row in the original settlement
- Added `ministryDelivered`/`earnerDelivered` named booleans that mirror the exact existing line-push guards, then reused them in the `correctPlatformTotal` formula so a category's ACTUAL total (not its CORRECTED total) is subtracted when that category can't receive its own adjustment line — retaining the difference on the platform wallet instead of silently discarding or manufacturing money
- Added 3 regression tests (missing MINISTRY row, missing earner wallet rows entirely, earner rows present but `actualEarnerTotal === 0`), each asserting exact line values AND `sum(lines.map(l => l.deltaNgn)) === 0`
- Confirmed via RED/GREEN TDD cycle: all 3 new tests failed against the unfixed formula (nonzero platform deltas), then passed after the fix, with zero regressions across all 28 pre-existing tests
- Corrected `REQUIREMENTS.md`'s stale SETTLE-10a/b/c/d/e checkbox and traceability-table state to accurately reflect the post-fix, fully-satisfied status

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix residual CR-01 — gate correctPlatformTotal's subtraction on deliverability, add 3 regression tests** - `3b0a9fc` (fix, TDD: RED verified in-session before fix applied, not a separate commit)
2. **Task 2: Correct REQUIREMENTS.md checkbox state for SETTLE-10a through SETTLE-10e** - `37d1b22` (docs)

**Plan metadata:** committed together with this SUMMARY (see final commit)

_Note: RED-phase test failures were verified interactively via `npm run test` before the GREEN fix was applied in the same commit, per the plan's TDD instructions (add tests, confirm 3 failures, then apply fix, confirm 0 failures) — the plan did not request a separate test-only commit for the RED phase._

## Files Created/Modified
- `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` - `computeAdjustmentLines()`: hoisted `earnerRowsWithWallet`, added `ministryDelivered`/`earnerDelivered` flags, replaced raw guard expressions in the ministry/earner line-push `if` conditions with the named flags, replaced `correctPlatformTotal`'s unconditional `chargeAmountNgn - correctEarnerTotal - correctMinistryTotal` with a deliverability-gated formula, updated the JSDoc comment above the platform-balancing block
- `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts` - Added 3 regression tests to the `computeAdjustmentLines()` describe block (missing ministry wallet, missing earner wallet, zero-amount earner wallet), each with exact expected `lines` arrays and a sum-to-zero assertion
- `.planning/REQUIREMENTS.md` - SETTLE-10a/b/c/d/e checkboxes corrected to `[x]`; traceability table rows for SETTLE-10a/b/e corrected from `Pending` to `Complete`

## Decisions Made
- Used non-null assertions (`ministryRow!.walletId!`) inside the `ministryDelivered && ...` branch since TypeScript's control-flow narrowing doesn't propagate through a separately-declared boolean variable the way it does through inline optional chaining — the boolean is provably equivalent to the narrowing condition (`ministryDelivered` is defined as `!!ministryRow?.walletId`), so the assertion is safe and matches the plan's instruction to preserve identical guard semantics
- Extended the REQUIREMENTS.md fix beyond the plan's literal checkbox-line scope to also correct the traceability table's Pending/Complete status for SETTLE-10a/b/e, since leaving the table stale while the checkboxes are corrected would create a self-contradicting document about the same finding this plan exists to fix (Rule 1 — data-consistency bug, not a new feature)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `node_modules` in the worktree**
- **Found during:** Task 1, first `npm run test` invocation
- **Issue:** This worktree was created without a `node_modules` directory at root or in `backend/`, so Jest/tsc could not resolve `@nestjs/testing`, `@prisma/client`, or any other dependency — blocking all verification.
- **Fix:** Created Windows NTFS junction points (`New-Item -ItemType Junction`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's installed `node_modules` directories at `C:\Developer\work\ISEYAA\node_modules` and `C:\Developer\work\ISEYAA\backend\node_modules`. This is a filesystem-level dependency-resolution fix, not a source change — no files were committed for this fix (junctions are directory-level filesystem objects outside git's purview, matching how `node_modules` is already gitignored).
- **Files modified:** None (filesystem junctions only, outside the git working tree's tracked content)
- **Verification:** `npm run test -- settlement-disputes.service` and `npx tsc --noEmit -p tsconfig.json` both ran successfully afterward
- **Committed in:** N/A (no git-tracked change)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock all verification for this plan; no scope creep — purely an environment-setup fix required by the worktree isolation.

## Issues Encountered
None beyond the `node_modules` junction fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `computeAdjustmentLines()` is now money-conserving for every settlement input shape confirmed by test coverage (common case, missing platform row [19-05], missing ministry row, missing earner wallet rows, zero-amount earner total)
- `SETTLE-10c` is genuinely satisfied; `SETTLE-10a/b/d/e` were already satisfied and are now accurately reflected in `REQUIREMENTS.md`
- No known residual gaps in this bug class; a future re-verification pass would be the appropriate way to confirm no further CR-01 variants exist, but none are known at this time
- No blockers for downstream phases

---
*Phase: 19-settlement-dispute-adjustment-workflow*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: backend/src/modules/settlement-disputes/settlement-disputes.service.ts
- FOUND: backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/19-settlement-dispute-adjustment-workflow/19-06-SUMMARY.md
- FOUND: commit 3b0a9fc (Task 1)
- FOUND: commit 37d1b22 (Task 2)
