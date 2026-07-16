---
phase: 11-resilience-wrapping
plan: 06
subsystem: infra
tags: [cockatiel, circuit-breaker, retry, timeout, resilience, testing]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping (Plans 01-05)
    provides: ResilienceService single choke-point every vendor wrap (Paystack, Termii, Anthropic, S3, FCM) routes through
provides:
  - Corrected wrap(breaker, retry(...), timeout(...)) composition order so each retry attempt gets its own timeout budget instead of one shared timeout for the whole retry+backoff sequence
  - Hardened readConfig() numeric parsing (positiveInt/nonNegativeInt helpers) so malformed PlatformConfig rows fall back to RESILIENCE_DEFAULTS per-key
  - Narrowed isTransientError classification so bare application bugs no longer trip the circuit breaker, while cockatiel TaskCancelledError and recognized network errors still retry
affects: [12-settlement-engine-foundation, 13-settlement-cutover, all future vendor-wrap plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cockatiel wrap() argument order: first arg outermost, last arg innermost — timeout must be innermost (closest to fn) so it bounds each individual attempt, not the whole retry sequence"
    - "Fake-timer regression tests (jest.useFakeTimers + advanceTimersByTimeAsync) required to actually exercise composition-order bugs; synchronous-rejection tests with real timers cannot detect them"

key-files:
  created:
    - backend/src/resilience/__tests__/retry-timeout-composition.spec.ts
  modified:
    - backend/src/resilience/resilience.service.ts
    - backend/src/resilience/__tests__/resilience.service.spec.ts

key-decisions:
  - "isTaskCancelledError check placed ahead of the final catch-all in isTransientError so CR-01's per-attempt timeout cancellation still counts as transient and triggers a retry — verified with a dedicated regression test"
  - "nonNegativeInt (not positiveInt) used for retryCount specifically to preserve paystackRefund's legitimate default of 0"

patterns-established:
  - "Pattern: wrap(breaker, retry(...), timeout(...)) — timeout innermost, bounds each attempt"
  - "Pattern: positiveInt/nonNegativeInt guards on all DB-sourced numeric resilience config"

requirements-completed: [RESIL-01, RESIL-02]

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase 11 Plan 06: Resilience Gap Closure (CR-01/WR-01/WR-04) Summary

**Fixed cockatiel wrap() composition order so timeout bounds each retry attempt (not the whole sequence), hardened DB-sourced numeric config parsing, and narrowed isTransientError to exclude bare application bugs from breaker/retry accounting.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-16T17:00:00Z (approx)
- **Completed:** 2026-07-16T17:18:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- Reordered `wrap(breaker, retry(...), timeout(...))` in `ResilienceService.onModuleInit()` — `timeout` is now the innermost policy, applied fresh to each individual retry attempt instead of once around the entire retry+backoff sequence (CR-01)
- Added a fake-timer regression test (`retry-timeout-composition.spec.ts`) that would have failed under the old (buggy) composition and passes under the fix — the first test in this phase to actually simulate realistic per-attempt vendor latency
- Hardened `readConfig()` with `positiveInt`/`nonNegativeInt` helpers so a malformed (non-numeric, negative, NaN-producing) `PlatformConfig` row falls back to `RESILIENCE_DEFAULTS` per-key instead of silently disabling a vendor's timeout/breaker/retry protection until next restart (WR-01)
- Narrowed `isTransientError` so a bare application bug (e.g. `TypeError`) no longer counts toward a vendor's circuit-breaker consecutive-failure threshold, while preserving retry-after-per-attempt-timeout behavior via an explicit `isTaskCancelledError` check and continuing to treat recognized network error codes as transient (WR-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix CR-01 — reorder retry/timeout composition + fake-timer regression test** - `26654ac` (fix)
2. **Task 2: Harden readConfig() numeric parsing (WR-01)** - `ece8bed` (fix)
3. **Task 3: Narrow isTransientError classification (WR-04)** - `ab49211` (fix)

_Note: All three tasks were tagged `tdd="true"` in the plan; each commit includes both the implementation and its dedicated regression test(s) since the plan's task granularity bundled RED+GREEN into one atomic change per task rather than separate test/feat commits._

## Files Created/Modified
- `backend/src/resilience/resilience.service.ts` - Reordered wrap() composition (retry before timeout); added `positiveInt`/`nonNegativeInt` helpers used in `readConfig()`; narrowed `isTransientError` to exclude bare application errors while still treating `TaskCancelledError`, recognized network codes, and `AbortError` as transient
- `backend/src/resilience/__tests__/retry-timeout-composition.spec.ts` - New fake-timer regression test proving each retry attempt gets its own `cfg.timeoutMs` window (CR-01 / 11-VERIFICATION.md gap 1 / 11-REVIEW.md IN-01)
- `backend/src/resilience/__tests__/resilience.service.spec.ts` - Added 2 tests for WR-01 (malformed `timeout_ms`/`retry_count` fall back to defaults) and 3 tests for WR-04 (bare application errors don't open the breaker; genuine network errors and `TaskCancelledError`-shaped rejections still retry)

## Decisions Made
- Placed the `isTaskCancelledError === true` check immediately after the HTTP-status check and before the network-code check in `isTransientError`, since cockatiel's `TaskCancelledError` has neither `.response` nor `.code` — this ordering is load-bearing for CR-01's fix to actually work end-to-end after WR-04's narrowing, and is covered by a dedicated regression test
- Used `nonNegativeInt` (allows exactly `0`) specifically for `retryCount` rather than `positiveInt`, since `paystackRefund`'s legitimate default `retryCount` is `0` (never auto-retry a refund — RESEARCH.md Pitfall 6)

## Deviations from Plan

None - plan executed exactly as written. All three tasks' behaviors, actions, and acceptance criteria were implemented as specified.

## Issues Encountered
- The worktree had no `node_modules` installed (fresh worktree checkout). Symlinked `node_modules` and `backend/node_modules` from the main repo checkout (`C:\Developer\work\ISEYAA`) to run the test suite — no source files affected, `node_modules` remains gitignored and untracked.

## User Setup Required

None - no external service configuration required. Note: `RESIL-02`'s remaining gap (live Grafana/Sentry dashboard confirmation of breaker state-change spans) is explicitly human-verification-only per `11-VERIFICATION.md` and is NOT addressed by this plan — it remains an outstanding manual step for the user, unchanged from before this plan.

## Next Phase Readiness
- CR-01 (composition-order defect), WR-01 (unvalidated DB config), and WR-04 (over-broad transient-error classification) are all closed at the single `ResilienceService` choke-point that every vendor wrap (Plans 01-05) depends on — the fix and hardening propagate identically to all 7 vendors without touching call sites
- Full backend regression suite passes: `cd backend && npx jest src/resilience --silent` (3 suites, 17 tests) and `cd backend && npx jest --silent` (40 suites, 449 tests) both exit 0 with zero failures
- No blockers for Phase 12 (Settlement Engine Foundation)

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created/modified files verified present; all 3 task commits (`26654ac`, `ece8bed`, `ab49211`) verified present in git log.
