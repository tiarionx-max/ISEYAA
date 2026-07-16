---
phase: 11-resilience-wrapping
plan: 04
subsystem: infra
tags: [cockatiel, circuit-breaker, resilience, termii, sms, otp, nestjs]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping (plan 01)
    provides: "@Global() ResilienceService.execute(vendor, fn) with 7 cached per-vendor cockatiel policies including termiiAuth/termiiDelivery"
provides:
  - "auth.service.ts's sendTermii() Termii leg wrapped in resilience.execute('termiiAuth', ...)"
  - "delivery.service.ts's sendTermiiDeliveryOtp() wrapped in resilience.execute('termiiDelivery', ...)"
  - "Confirmed the two Termii call sites use independent circuit-breaker policies (D-08), never unified"
affects: [11-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resilience.execute(vendor, () => fetch(...)) wraps only the outbound fetch call, leaving the surrounding try/catch fallback chain untouched"
    - "Global fetch mock in beforeEach for spec files whose ConfigService mock supplies a truthy TERMII_API_KEY — prevents live network calls in unit tests"

key-files:
  created: []
  modified:
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - backend/src/modules/delivery/delivery.service.ts
    - backend/src/modules/delivery/__tests__/delivery.service.spec.ts

key-decisions:
  - "Used a global jest.spyOn(global, 'fetch') mock in auth.service.spec.ts's beforeEach rather than mocking fetch per-test, since adding TERMII_API_KEY to the shared mockConfig now causes every sendOtp-exercising test to reach the fetch call — an unmocked fetch would otherwise issue a real network request to Termii's live API on every test run"
  - "delivery.service.spec.ts's new tests invoke the private sendTermiiDeliveryOtp() directly via (service as any).sendTermiiDeliveryOtp(...), matching the existing private-method-test-access convention already used elsewhere in this codebase (e.g. ai.service.spec.ts)"

patterns-established: []

requirements-completed: [RESIL-01]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 11 Plan 04: Termii Auth + Delivery OTP Resilience Wrapping Summary

**Both independent Termii SMS call sites (auth.service.ts's sendTermii and delivery.service.ts's sendTermiiDeliveryOtp) now route their fetch() calls through ResilienceService.execute() under separate 'termiiAuth'/'termiiDelivery' vendor keys, with all pre-existing fallback behavior (Twilio chain for auth, log-and-swallow for delivery) unchanged**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-16T15:32:41Z (approx, from worktree branch-point)
- **Completed:** 2026-07-16T15:41:52Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `AuthService.sendTermii()`'s Termii `fetch()` call now routes through `resilience.execute('termiiAuth', ...)`, with the existing Termii → Twilio → console-stub fallback chain (D-03) completely unchanged
- `DeliveryService.sendTermiiDeliveryOtp()`'s Termii `fetch()` call now routes through `resilience.execute('termiiDelivery', ...)`, with the existing log-and-swallow fallback (D-03) completely unchanged
- Confirmed the two Termii call sites remain on independent vendor keys/circuit policies per D-07/D-08 — a Termii outage on the delivery OTP path cannot open the auth OTP circuit breaker and vice versa
- Extended both existing spec files with `ResilienceService` mock providers and 4 new test cases (2 per file) covering vendor-key routing and circuit-open fallback preservation

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap auth.service.ts's sendTermii() Termii leg + extend auth.service.spec.ts** - `8849a85` (feat)
2. **Task 2: Wrap delivery.service.ts's sendTermiiDeliveryOtp() + extend EXISTING delivery.service.spec.ts** - `63d76fc` (feat)

_Both tasks are marked `tdd="true"` in the plan; since the target behavior was an in-place wrap of existing working code with unchanged observable behavior (fallback chains untouched), each task's single commit contains both the extended test cases and the minimal production wrap together — no separate RED-only commit was meaningful here since the pre-existing 18/8 tests were never failing, only the 4 new resilience-integration assertions needed net-new RED→GREEN coverage, which is captured within each task's one commit._

## Files Created/Modified
- `backend/src/modules/auth/auth.service.ts` - Injected `ResilienceService`; wrapped `sendTermii()`'s `fetch()` call in `resilience.execute('termiiAuth', ...)`
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` - Added `mockResilience` provider, `TERMII_API_KEY` to `mockConfig`, a global `fetch` mock in `beforeEach` (network-isolation fix), and 2 new `sendOtp` test cases
- `backend/src/modules/delivery/delivery.service.ts` - Injected `ResilienceService` as 8th constructor param; wrapped `sendTermiiDeliveryOtp()`'s `fetch()` call in `resilience.execute('termiiDelivery', ...)`
- `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` - Added `mockResilience` provider and a new `sendTermiiDeliveryOtp` describe block with 2 test cases (invoking the private method directly, matching this codebase's established convention)

## Decisions Made
- Added a global `jest.spyOn(global, 'fetch')` mock in `auth.service.spec.ts`'s `beforeEach` rather than mocking per-test, because adding `TERMII_API_KEY` to the shared `mockConfig` (required by the plan's new test cases) meant every `sendOtp`-exercising test — including the pre-existing "stores OTP in Redis and returns success" test — would otherwise reach the real `fetch()` call and issue a live network request to Termii's production API. This was caught by observing an actual `401 Invalid API Key` response logged during the first test run (Rule 1 auto-fix: test-isolation bug).
- `delivery.service.spec.ts`'s new tests call the private `sendTermiiDeliveryOtp()` method directly via `(service as any).sendTermiiDeliveryOtp(...)`, consistent with this codebase's existing private-method-test-access pattern (e.g. `ai.service.spec.ts`), since `requestDelivery`'s existing tests don't exercise the TERMII_API_KEY-present branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test-isolation bug causing a live network call to Termii's API in auth.service.spec.ts**
- **Found during:** Task 1 (extending auth.service.spec.ts)
- **Issue:** The plan's `mockConfig.get` `vals` map addition of `TERMII_API_KEY: 'test-termii-key'` is required for the new resilience-routing test, but since `mockConfig` is shared across the whole spec file, it also caused the pre-existing "stores OTP in Redis and returns success" test to take the previously-skipped Termii branch and issue a real, unmocked `fetch()` call to `https://v3.api.termii.com` — confirmed via an actual `401 Invalid API Key` response logged during a test run.
- **Fix:** Added a `jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any)` in the outer `beforeEach` (before module compilation), so all tests in the file get a safe default fetch mock; individual tests still override it as needed via `mockResolvedValueOnce`/`mockRejectedValueOnce` on the resilience/fetch mocks.
- **Files modified:** `backend/src/modules/auth/__tests__/auth.service.spec.ts`
- **Verification:** Re-ran the full spec file — all 20 tests pass, no further network-call log lines observed for that test.
- **Committed in:** `8849a85` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test isolation)
**Impact on plan:** Necessary fix to keep the plan's required `mockConfig` change from breaking unit-test hermeticity. No scope creep — no production code affected.

## Issues Encountered
- The worktree's `node_modules` was entirely absent at plan start (`Cannot find module '@nestjs/testing'`); resolved by running `npm install --workspace=backend` from the worktree root per the sibling-plan note in the executor instructions.
- After installing dependencies, `delivery.service.spec.ts` initially failed with a pre-existing, unrelated Prisma type error (`Prisma.TransactionWhereInput` not exported) surfaced in `wallet.service.ts` — resolved by running `npx prisma generate`, which regenerated the Prisma client matching `schema.prisma`. This is environment setup, not a plan-scope code change; no source files were altered to fix it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both independent Termii call sites (`termiiAuth`, `termiiDelivery`) are now resilience-wrapped, completing the Termii leg of Phase 11's vendor-wrapping work alongside Plans 02 (Paystack/S3) and 03 (FCM/Anthropic).
- No blockers for Plan 05 (verification) — all four modified files pass their full test suites (20 + 10 = 30 tests), and `npx prisma generate` has already been run in this worktree so downstream verification won't hit the same Prisma type error.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*

## Self-Check: PASSED

All modified files verified present on disk; both commits (`8849a85`, `63d76fc`) verified present in git log.
