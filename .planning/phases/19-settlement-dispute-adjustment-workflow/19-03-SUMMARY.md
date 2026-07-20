---
phase: 19-settlement-dispute-adjustment-workflow
plan: 03
subsystem: payments
tags: [nestjs, prisma, wallet, settlement, disputes, state-machine, tdd]

# Dependency graph
requires:
  - phase: 19-settlement-dispute-adjustment-workflow
    plan: 01
    provides: SettlementDispute Prisma model (5-value status state machine)
  - phase: 19-settlement-dispute-adjustment-workflow
    plan: 02
    provides: SettlementService.adjust() compensating-transaction primitive + SettlementAdjustmentLine/InsufficientAdjustmentBalanceError
provides:
  - "SettlementDisputesService — raise()/findQueue()/findById()/moveToReview()/resolve()/dismiss()/computeAdjustmentLines()"
  - "RaiseDisputeDto / ResolveDisputeDto"
affects: [19-04-settlement-disputes-controller-and-module]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "System-computed resolution (D-01): resolve() never accepts a caller-supplied adjustment amount — computeAdjustmentLines() reverse-engineers actual-vs-correct split from already-persisted Transaction rows, diffed against a fresh SettlementService.resolveSplit() call"
    - "5-status state machine (D-04) with a non-terminal BLOCKED status (D-05) — resolve() is callable from OPEN/IN_REVIEW/BLOCKED, only RESOLVED/DISMISSED are terminal (409 otherwise)"
    - "Active-dispute guard on raise() (T-19-07) — rejects a second raise() while a non-terminal dispute already exists for the same settlementReference, protecting adjust()'s per-reference idempotency key from a race"
    - "Silent-fallback AuditLog write (writeAudit() helper, SETTLE-10e) — mirrors kyc.service.ts exactly, never blocks the primary state transition"

key-files:
  created:
    - backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts
    - backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts
    - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
    - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
  modified: []

key-decisions:
  - "computeAdjustmentLines() distributes a multi-earner (Tour-style) delta proportionally by original share, with the LAST wallet absorbing the full rounding remainder — guarantees the earner-side lines always sum exactly to earnerDeltaTotal, never off by a sub-kobo amount split across N rows"
  - "resolve()'s BLOCKED path swallows InsufficientAdjustmentBalanceError and returns the updated BLOCKED dispute row rather than rethrowing — the caller (controller, 19-04) never sees a 500 for this expected business case"
  - "adjustmentReference recorded on RESOLVED is the ${settlementReference}-ADJ prefix only (not per-line suffixes) — matches the plan's exact wording; the underlying adjust() call still writes ${originalReference}-ADJ-${n} rows per line"

patterns-established:
  - "computeAdjustmentLines()'s row-shape reversal (metadata.recipientType tag matching, -PLAT suffix exclusion) is the canonical way to recover 'what settle() originally paid' from Transaction rows alone — reusable by any future settlement-auditing feature"

requirements-completed: [SETTLE-10a, SETTLE-10b, SETTLE-10c, SETTLE-10d, SETTLE-10e]

# Metrics
duration: ~55min
completed: 2026-07-20
---

# Phase 19 Plan 03: SettlementDisputesService Summary

**Built `SettlementDisputesService` — the state-machine + financial-diffing core of the dispute workflow: `raise()`/`findQueue()`/`findById()`/`moveToReview()` plus the system-computed `computeAdjustmentLines()`/`resolve()`/`dismiss()`, wired directly to `SettlementService.resolveSplit()`/`adjust()`.**

## Performance

- **Duration:** ~55 min (including environment setup — node_modules junctions + Prisma Client regeneration)
- **Tasks:** 2 completed (both TDD: RED -> GREEN)
- **Files created:** 4

## Accomplishments

- `RaiseDisputeDto` (7-literal module enum, informational-only `requestedAdjustmentNgn`) and `ResolveDisputeDto` (single optional `resolution` field, no decision/amount override per D-01) created, mirroring `create-review.dto.ts`/`resolve-flag.dto.ts` exactly
- `raise()` guards: 404 if no settled `Transaction` matches the reference prefix; 409 if an active (`OPEN`/`IN_REVIEW`/`BLOCKED`) dispute already exists for the same `settlementReference` (T-19-07 — prevents two disputes racing to post different adjustments against the same idempotency key)
- `findQueue()`/`findById()` — near-verbatim `ReviewsService.findFlagQueue()`/`findFlagById()` structural copy, substituting `adminReviewFlag` → `settlementDispute`
- `moveToReview()` — `OPEN` → `IN_REVIEW` only; 409 otherwise (a `BLOCKED` dispute re-resolves directly via `resolve()`, D-05, it never re-enters `IN_REVIEW`)
- `computeAdjustmentLines()` — reverses `settle()`'s exact Transaction row shape (`metadata.recipientType`, `-PLAT` suffix) to recover actual earner/ministry totals, diffs against a fresh `resolveSplit()` call, and proportionally distributes a multi-earner delta with the last wallet absorbing the full rounding remainder
- `resolve()` — callable from `OPEN`/`IN_REVIEW`/`BLOCKED` (D-05), 409 on `RESOLVED`/`DISMISSED`; no-op path (`RESOLVED`, `adjustmentReference: null`) when computed lines are empty; happy path posts lines through `settlementService.adjust()` and records `adjustmentReference`; `BLOCKED` path on `InsufficientAdjustmentBalanceError` (SETTLE-10d) — swallowed, dispute returned as `BLOCKED`, never surfaced as a 500
- `dismiss()` — terminal-state guard only (409 on `RESOLVED`/`DISMISSED`); transitions to `DISMISSED`; verified via test assertion + `awk`-scoped grep that it never calls `computeAdjustmentLines()`/`settlementService.adjust()`
- Every state transition writes an `AuditLog` row via the shared `writeAudit()` silent-fallback helper (SETTLE-10e) — an audit-write failure never blocks the primary state change (verified for `raise()`/`moveToReview()`; the same helper is reused unchanged by `resolve()`/`dismiss()`)
- 25 passing test scenarios (9 from Task 1 + 16 from Task 2 — the plan estimated "17+"; the actual count is 25 across both tasks combined)
- Full backend suite: 677/677 passing (up from the pre-plan baseline of 652 — 25 new tests, zero regressions)

## Task Commits

Each task followed the TDD RED -> GREEN cycle, committed atomically:

1. **Task 1 (RED):** add failing tests for dispute raise/queue/review + DTOs - `302ef70` (test)
2. **Task 1 (GREEN):** implement dispute raise/queue/review + AuditLog helper - `8dffd9b` (feat)
3. **Task 2 (RED):** add failing tests for computeAdjustmentLines/resolve/dismiss - `393caf3` (test)
4. **Task 2 (GREEN):** implement computeAdjustmentLines/resolve/dismiss (D-01/D-04/D-05) - `29b8f3c` (feat)

## Files Created/Modified

- `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts` - `RaiseDisputeDto` + `SETTLEMENT_DISPUTE_MODULES` (7 literals)
- `backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts` - `ResolveDisputeDto` (single optional `resolution` field)
- `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` - `SettlementDisputesService`: `writeAudit()`, `raise()`, `findQueue()`, `findById()`, `moveToReview()`, `computeAdjustmentLines()`, `resolve()`, `dismiss()`
- `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts` - 25 scenarios across both tasks

## TDD Gate Compliance

Both tasks followed the full RED → GREEN cycle:
- Task 1: `302ef70` (test, confirmed failing — module didn't exist) → `8dffd9b` (feat, confirmed 9/9 passing)
- Task 2: `393caf3` (test, confirmed failing — methods didn't exist) → `29b8f3c` (feat, confirmed 25/25 passing)

No REFACTOR commits needed — both implementations matched the plan's byte-level algorithm description cleanly on first pass.

## Decisions Made

- No deviations from the plan's specified algorithm for `computeAdjustmentLines()` — the proportional-distribution-with-last-row-remainder scheme was implemented exactly as described in the `<action>` block.
- Fixed one micro-discrepancy vs. the acceptance-criteria grep: the `dismiss()` docstring originally read `` `computeAdjustmentLines()`/`settlementService.adjust()` `` which the literal grep `settlementService.adjust\|computeAdjustmentLines` picked up as a false "call" (it's a doc comment, not a call). Reworded the comment to `the settlement adjust primitive` so the acceptance criterion's grep count (exactly 1 real call site, in `resolve()`) is unambiguous. No behavior change.

## Deviations from Plan

None of substance — plan executed exactly as written. One acceptance-criteria-driven wording fix (see Decisions Made above) is documented for transparency but is a comment-only change, not a Rule 1/2/3 code fix.

## Issues Encountered

- **No `node_modules` in this worktree** (fresh git worktree). Created NTFS directory junctions (`node_modules`, `backend/node_modules`, `shared/node_modules`) pointing at the main repo's already-installed `node_modules` — gitignored, not committed. Initial `mklink` attempts via Git Bash mangled the Windows path arguments (path-conversion quirks with `cmd //c` + backslash paths); resolved by writing a small `.bat` script to the session scratchpad and invoking it via `cmd //c "<script>.bat"`.
- **Prisma Client out of date in the main repo's `node_modules`** — `19-01-PLAN.md`'s schema change (the `SettlementDispute` model) was committed to `schema.prisma` but the regenerated Prisma Client artifact (`node_modules/.prisma/client`) is not tracked by git, so the junctioned `node_modules` still had the pre-`SettlementDispute` client. Ran `npx prisma generate` in `backend/` (schema-only operation, no `DATABASE_URL` needed) to regenerate the client in place — this updates the main repo's shared `node_modules/.prisma/client` via the junction, which is expected/safe since it only reflects what's already checked into `schema.prisma` on this branch.

## User Setup Required

None - no external service configuration required. This plan touches only application code (DTOs + service) and its tests; no schema or migration changes (that was 19-01), no new external dependencies.

## Next Phase Readiness

- `19-04-PLAN.md` (controller + module registration) can proceed — `SettlementDisputesService` exposes exactly the six methods (`raise`/`findQueue`/`findById`/`moveToReview`/`resolve`/`dismiss`) the controller needs to wire, per the pattern map in `19-PATTERNS.md`.
- `SettlementService.resolveSplit()`/`adjust()` (19-01/19-02) are consumed exactly per their documented signatures — no changes needed on that side.
- No blockers identified.

---
*Phase: 19-settlement-dispute-adjustment-workflow*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts
- FOUND: backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts
- FOUND: backend/src/modules/settlement-disputes/settlement-disputes.service.ts
- FOUND: backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
- FOUND: .planning/phases/19-settlement-dispute-adjustment-workflow/19-03-SUMMARY.md
- FOUND: commit 302ef70
- FOUND: commit 8dffd9b
- FOUND: commit 393caf3
- FOUND: commit 29b8f3c
- FOUND: commit 1c0141d
