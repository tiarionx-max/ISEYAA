---
phase: 12-settlement-engine-foundation
plan: 01
subsystem: payments
tags: [nestjs, prisma, wallet, settlement, paystack, jest, tdd]

# Dependency graph
requires:
  - phase: 09-tour-packages-tour-guides
    provides: "TourSettlementService's proven atomic multi-vendor wallet fan-out pattern (SELECT FOR UPDATE, idempotency, drift-tolerance) — the extraction source for this plan"
provides:
  - "SettlementService.settle() — generalized, caller-agnostic atomic N-way wallet fan-out engine in CommonModule (Global), injectable with zero additional imports"
  - "SettlementService.resolveMinistryWallet() — live (never-cached) PlatformConfig-backed Ministry wallet resolver"
  - "P2002 race-condition fix (Pitfall 1): concurrent duplicate settlement attempts are caught inside the $transaction and treated as benign replays instead of triggering a spurious refund"
affects: [12-03-tour-settlement-migration, 12-04-marketplace-settlement, 12-05-events-settlement, 12-06-studio-settlement, 12-07-stays-settlement, 12-08-settlement-statement-endpoint, 13-settlement-cutover-transport-delivery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settlement engine as a Global CommonModule provider — single prisma.$transaction with raw SELECT ... FOR UPDATE per recipient wallet, idempotency via reference-prefix precheck, append-only Transaction CREDIT audit trail"
    - "onSettled/onFailure caller hooks — onSettled runs inside the same $transaction after all wallet writes (for caller-specific status flips); onFailure runs on the failure path after refund attempt, log-only on hook error so the original failure is never masked"

key-files:
  created:
    - backend/src/common/services/settlement.service.ts
    - backend/src/common/services/__tests__/settlement.service.spec.ts
  modified:
    - backend/src/common/common.module.ts

key-decisions:
  - "Per D-02, kept TourSettlementService's exact transactional primitives verbatim (single $transaction, raw SELECT FOR UPDATE, idempotency via reference-suffix, append-only CREDIT rows) rather than redesigning the locking strategy"
  - "Per D-07, moved the ad-hoc SYSTEM_USER_ID bootstrap into SettlementService verbatim instead of formalizing a new SystemWallet model this phase"
  - "refSuffix is caller-supplied (not auto-generated from tag/index) so migrating callers like Tour (Plan 12-03) can preserve their legacy V-<idx> reference format exactly"
  - "Drift-tolerance test (Scenario D) engineered via a one-shot Math.round mock rather than crafted floating-point inputs — the drift formula is provably bounded to +/-0.005 under normal arithmetic, so the defensive >0.02 branch is only reachable by forcing a bogus platformAmountNgn"

patterns-established:
  - "Settlement callers pass pre-resolved recipients (walletId already looked up server-side) — SettlementService never resolves wallet ownership itself, keeping the trust boundary at the caller per the plan's threat model"

requirements-completed: [SETTLE-01, SETTLE-02, SETTLE-08]

# Metrics
duration: ~20min
completed: 2026-07-17
---

# Phase 12 Plan 01: Settlement Engine Foundation Summary

**Generalized atomic N-way wallet fan-out engine (`SettlementService`) extracted from Tour's proven settlement primitives, registered as a Global `CommonModule` provider, with a closed P2002 race-condition gap that Tour's original code doesn't have.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-17T16:48Z (approx.)
- **Completed:** 2026-07-17T17:04Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `SettlementService.settle()` performs one atomic `$transaction` per call: `SELECT ... FOR UPDATE` on every recipient wallet + the system/platform wallet, append-only `Transaction` CREDIT rows, drift-tolerance assertion (`<=₦0.02`), and idempotency via a `Transaction.reference` prefix precheck
- Closed a real latent bug not present in Tour's current code (RESEARCH.md Pitfall 1): a `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'` thrown mid-transaction (two near-simultaneous webhook deliveries racing past the idempotency precheck) is now caught and treated as a benign replay instead of triggering a spurious refund
- `resolveMinistryWallet()` reads `PlatformConfig` fresh on every call — proven never to cache across calls (RESEARCH.md Pitfall 2)
- SETTLE-08's zero-drift invariant proven across 5 non-round NGN amounts (`9999.99, 10000.01, 33333.33, 7.77, 1000000.13`) split 33/33/34 across 3 recipients — sum of every written CREDIT row equals the buyer-paid amount to the kobo
- `CommonModule` now exports `SettlementService` — injectable by any feature module (Marketplace, Events, Studio, Stays in Plans 12-04..07) with zero additional imports

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Write failing settlement.service.spec.ts (RED)** - `d33057c` (test)
2. **Task 2: Implement SettlementService (GREEN) + register in CommonModule** - `c04e38e` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `backend/src/common/services/settlement.service.ts` - `SettlementService`: `settle()`, `resolveMinistryWallet()`, `handleSettlementFailure()`, `ensureSystemWallet()` (system wallet bootstrap moved verbatim from `TourSettlementService`)
- `backend/src/common/services/__tests__/settlement.service.spec.ts` - 10 scenarios (A-J; C parametrized across 5 amounts = 14 total `it` blocks) proving SETTLE-01/02/08
- `backend/src/common/common.module.ts` - registered `SettlementService` in both `providers` and `exports` (alphabetical order preserved)

## Decisions Made
- Kept the exact Tour transactional primitives (single `$transaction`, raw `SELECT ... FOR UPDATE`, reference-suffix idempotency, append-only CREDIT rows) per D-02 — no redesign of the locking strategy
- `refSuffix` is caller-supplied, not derived from `tag`/index, so Tour's migration (Plan 12-03) can preserve its legacy `V-<idx>` reference format exactly
- System wallet bootstrap (`SYSTEM_USER_ID` upsert) moved verbatim into `SettlementService.onModuleInit()` per D-07 — no new `SystemWallet` model this phase
- Drift-exceeded test scenario uses a one-shot `Math.round` spy rather than crafted floating-point inputs, since the drift formula (`chargeAmountNgn - claimedAmountNgn - platformAmountNgn`) is mathematically bounded to `+/-0.005` under any real-number arithmetic — the `>0.02` branch is a defensive assert only reachable by forcing an incorrect `platformAmountNgn`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no `node_modules` — created Windows directory junctions to the main repo's `node_modules`**
- **Found during:** Task 1 (running `npx jest` to confirm RED)
- **Issue:** This worktree was checked out without `npm install` ever having run inside it (`node_modules` absent at both repo root and `backend/`), blocking every `npx jest` / `npx tsc` verification command required by the plan
- **Fix:** Created Windows junctions (`mklink /J`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's already-installed `node_modules` directories — junctions are gitignored (`node_modules/` pattern) and were never staged or committed
- **Files modified:** None (filesystem-only, outside git tracking)
- **Verification:** `node -e "require.resolve('@nestjs/testing')"` and `require.resolve('@prisma/client')` both resolved correctly afterward; `npx jest` and `npx tsc --noEmit` ran cleanly against real dependencies
- **Committed in:** N/A — not a tracked change

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only, not committed)
**Impact on plan:** No code or scope impact — a one-time local environment fix so the plan's own verification commands (`npx jest`, `npx tsc --noEmit`) could run at all. Sibling worktree agents may need the same fix independently if their worktrees also lack `node_modules`.

## Issues Encountered
- Initial `ln -s` attempts under Git Bash on Windows silently performed a full recursive copy instead of a symlink (no Developer Mode / admin privilege for true symlinks), which would have consumed significant disk space and time. Switched to `cmd //c mklink /J` (directory junction) instead, which is instant and requires no elevated privilege. Also hit a path-quoting bug on the first `mklink` attempt (`C:\C:\...` duplicated drive prefix from nested quoting) — corrected by passing the target path unquoted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `SettlementService` is ready for Plan 12-03 (TourSettlementService migration onto the shared engine) and Plans 12-04 through 12-07 (Marketplace/Events/Studio/Stays direct integration) — all can inject it via `CommonModule` with zero additional module imports
- `resolveMinistryWallet()` is available for any caller needing the three-way vendor/Ministry/platform split without duplicating the `PlatformConfig` lookup
- No blockers. Sibling plan 12-02 (running in parallel in a separate worktree) touches different files with no overlap.

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*
