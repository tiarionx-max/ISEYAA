---
phase: 11-resilience-wrapping
plan: 07
subsystem: infra
tags: [cockatiel, axios, aws-sdk-v3, abortsignal, resilience, paystack, s3, fcm]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping (plans 01-03)
    provides: cockatiel resilience.execute() choke-point wrapping paystack.service.ts, s3.service.ts, notifications.service.ts
provides:
  - AbortSignal forwarding from cockatiel's per-attempt context into axios (signal) and AWS SDK v3 (abortSignal) at 5 vendor call sites
  - Reference-identity regression test proving the exact AbortSignal instance cockatiel provides reaches axios.post's config
affects: [11-08 (AI/Termii AbortSignal gap closure), 11-resilience-wrapping code review closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resilience.execute(vendor, ({ signal }) => ...) — every call site must destructure signal from cockatiel's context and forward it into the underlying client's cancellation option (axios: signal, AWS SDK v3 send(): abortSignal)"

key-files:
  created: []
  modified:
    - backend/src/common/services/paystack.service.ts
    - backend/src/common/services/__tests__/paystack.service.spec.ts
    - backend/src/common/services/s3.service.ts
    - backend/src/common/services/__tests__/s3.service.spec.ts
    - backend/src/modules/notifications/notifications.service.ts
    - backend/src/modules/notifications/__tests__/notifications.service.spec.ts

key-decisions:
  - "AWS SDK v3's cancellation option key is abortSignal, passed as send()'s second argument — distinct from axios's signal key and NOT nested inside PutObjectCommand's constructor input"
  - "All 3 affected spec files' default mockResilience.execute mocks updated to invoke fn({ signal: undefined }) instead of bare fn(), so the new destructuring signature doesn't crash any pre-existing test"

requirements-completed: [RESIL-01]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Phase 11 Plan 07: AbortSignal Propagation for Paystack/S3/FCM Summary

**Threaded cockatiel's per-attempt AbortSignal into axios (signal) and AWS SDK v3 send() (abortSignal) at all 5 remaining CR-02 call sites, with a reference-identity regression test proving the exact signal instance reaches axios.post.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T17:07:20Z
- **Completed:** 2026-07-16T17:12:00Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments
- `paystack.service.ts`'s `initiatePayment`, `resolveBvn`, and `refundCharge` now forward cockatiel's real `AbortSignal` into axios's config, closing the double-refund race threat (T-11-05) for `refundCharge` that `retryCount: 0` alone couldn't fully close
- `s3.service.ts`'s `upload()` forwards the signal into the AWS SDK v3 `send()` call's `abortSignal` option (not axios's `signal` key — a distinct SDK-specific option name, correctly placed as `send()`'s second argument rather than inside `PutObjectCommand`'s constructor input)
- `notifications.service.ts`'s `sendPush()` forwards the signal into axios's FCM v1 `POST` config
- Added a reference-identity regression test (`paystack.service.spec.ts` Test 7) proving cockatiel's exact `AbortSignal` instance — not a copy, not a different controller's signal — is the one reaching `axios.post`'s config

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread AbortSignal into paystack.service.ts (3 call sites) + regression test** - `e5f107c` (test)
2. **Task 2: Thread AbortSignal into s3.service.ts and notifications.service.ts** - `1f5f623` (feat)

_Note: Task 1 used a single `test(...)` commit since the regression test and the production forwarding change were tightly coupled and verified together; both were driven by the plan's `tdd="true"` behavior spec._

## Files Created/Modified
- `backend/src/common/services/paystack.service.ts` - `initiatePayment`, `resolveBvn`, `refundCharge` destructure `{ signal }` from cockatiel's execute context and forward it into axios's config
- `backend/src/common/services/__tests__/paystack.service.spec.ts` - mock `execute` updated to invoke `fn({ signal: undefined })`; new Test 7 proves reference-identity forwarding via `toBe`
- `backend/src/common/services/s3.service.ts` - `upload()` forwards signal as `send()`'s second-argument `abortSignal` option
- `backend/src/common/services/__tests__/s3.service.spec.ts` - mock `execute` updated to invoke `fn({ signal: undefined })`
- `backend/src/modules/notifications/notifications.service.ts` - `sendPush()` forwards signal into axios's FCM POST config
- `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` - mock `execute` updated to invoke `fn({ signal: undefined })`

## Decisions Made
- AWS SDK v3's `abortSignal` option is distinct from axios's `signal` — confirmed via `@smithy/types` `HttpHandlerOptions.abortSignal` and passed as `send(command, options)`'s second argument, not nested in the command's constructor input, per the plan's explicit read_first guidance.
- Kept the mock update pattern identical across all 3 spec files (`fn({ signal: undefined })`) for consistency, since none of the pre-existing tests in `s3.service.spec.ts` or `notifications.service.spec.ts` needed signal-specific assertions (only `paystack.service.spec.ts` required the new reference-identity test per the plan's scope).

## Deviations from Plan

None - plan executed exactly as written. All 5 call sites, all 3 spec file mock updates, and the one required regression test match the plan's `<action>`/`<behavior>` specs verbatim.

## Issues Encountered
- The worktree's `node_modules` was not populated at spawn time (`@nestjs/testing` and other deps missing) — ran `npm install --workspace=backend` from the worktree root before any test could execute. This is an environment-provisioning step, not a plan deviation — no source files were affected. Consistent with the same issue documented in 11-02-SUMMARY.md/11-03-SUMMARY.md/11-04-SUMMARY.md/11-05-SUMMARY.md for prior plans in this phase.
- After `npm install`, the generated Prisma client was stale/incomplete (missing `TripStatus`, `TransactionWhereInput`, `TourPackage`, etc. — likely from `prisma generate` never having run against this fresh `node_modules`), causing 10 unrelated test suites to fail to compile. Ran `npx prisma generate` to regenerate the client against `prisma/schema.prisma`; this resolved all 10 suites with zero source changes. Confirmed via full `npm test` run afterward: 39/39 suites, 444/444 tests passing, including none of the failures referencing `paystack`, `s3`, or `notifications`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CR-02 (missing AbortSignal propagation) is now closed for all 3 files this plan owns (`paystack.service.ts`, `s3.service.ts`, `notifications.service.ts`) — 5 of the 6 defect sites `11-VERIFICATION.md` named.
- The remaining CR-02 defect sites (`resilience.service.ts` itself is not a call site; the AI/Termii call sites) are explicitly out of this plan's scope and owned by sibling gap-closure plan 11-08, keeping file ownership disjoint for parallel execution as designed.
- Full backend regression suite passes with zero failures (39 suites, 444 tests) after this plan's changes.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*
