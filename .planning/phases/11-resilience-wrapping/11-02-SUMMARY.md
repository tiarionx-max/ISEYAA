---
phase: 11-resilience-wrapping
plan: 02
subsystem: backend
tags: [resilience, cockatiel, paystack, s3, r2, circuit-breaker]

# Dependency graph
requires:
  - "@Global() ResilienceModule exporting ResilienceService (Phase 11 Plan 01)"
provides:
  - "PaystackService.initiatePayment/resolveBvn/refundCharge routed through ResilienceService.execute()"
  - "S3Service.upload() routed through ResilienceService.execute()"
  - "D-01/D-05 fail-fast ServiceUnavailableException contract for Paystack and S3/R2 vendor-outage failures"
affects: [11-03-fcm-anthropic-wrapping, 11-04-termii-wrapping, 11-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resilience.execute(vendor, fn) wraps only the outbound HTTP/SDK call, not the surrounding business-response validation — keeps business-error paths (invalid BVN) outside the breaker's failure accounting"
    - "Distinct zero-retry vendor key (paystackRefund) for financially-irreversible operations, kept separate from the shared multi-retry key (paystack) used by idempotent reads/writes"

key-files:
  created:
    - backend/src/common/services/__tests__/paystack.service.spec.ts
  modified:
    - backend/src/common/services/paystack.service.ts
    - backend/src/common/services/s3.service.ts
    - backend/src/common/services/__tests__/s3.service.spec.ts

key-decisions:
  - "refundCharge's inline axios timeout: 10_000 removed — timeout now owned exclusively by the cockatiel timeout() policy layer built in Plan 01, avoiding two competing timeout sources"
  - "resolveBvn's business-response branch (status !== true) stays inside the wrapped call's try, resolving normally through resilience.execute — it never trips the shared paystack breaker on a burst of invalid BVNs (T-11-04)"

requirements-completed: [RESIL-01]

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase 11 Plan 02: Paystack + S3 Resilience Wrapping Summary

**PaystackService (initiatePayment/resolveBvn/refundCharge) and S3Service.upload() now route their outbound vendor calls through ResilienceService.execute(), converting circuit-open/timeout/retry-exhausted failures into a generic ServiceUnavailableException while refundCharge uses its own zero-retry paystackRefund policy**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Wrapped `PaystackService.initiatePayment()` and `resolveBvn()` outbound axios calls in `resilience.execute('paystack', ...)`, converting any vendor-outage failure to `ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly')`
- Kept `resolveBvn`'s business-response validation (`status !== true`) inside the wrapped call's try block so a burst of invalid BVNs never trips the shared `paystack` circuit breaker used by `initiatePayment`
- Wrapped `PaystackService.refundCharge()` in the distinct zero-retry `resilience.execute('paystackRefund', ...)` policy (not `'paystack'`), preserving its pre-existing `ServiceUnavailableException('Refund gateway unavailable. Retry queued.')` message; removed the now-redundant inline `timeout: 10_000` axios option (cockatiel's `timeout()` policy owns this)
- Wrapped `S3Service.upload()`'s `PutObjectCommand` send in `resilience.execute('s3', ...)`, converting any send failure to `ServiceUnavailableException('Storage is temporarily unavailable, please try again shortly')` while leaving the pre-existing `unconfigured`-mode plain `Error` guard untouched
- Added `backend/src/common/services/__tests__/paystack.service.spec.ts` (new file, 8 tests) covering both failure-mode distinctions (business BVN rejection vs. vendor-outage) and vendor-key routing assertions (`'paystack'` vs `'paystackRefund'`)
- Extended `backend/src/common/services/__tests__/s3.service.spec.ts` with a `ResilienceService` mock added to both `TestingModule` instantiations (the `beforeEach` module and the inline second module in "Test 6") plus a new 7th test asserting `ServiceUnavailableException` on resilience failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap PaystackService in resilience policy + new spec file** - `be083f1` (feat)
2. **Task 2: Wrap S3Service.upload() + extend existing s3.service.spec.ts** - `c529c41` (feat)

## Files Created/Modified

- `backend/src/common/services/paystack.service.ts` - Constructor injects `ResilienceService`; `initiatePayment`/`resolveBvn` route through `resilience.execute('paystack', ...)`; `refundCharge` routes through `resilience.execute('paystackRefund', ...)`; all three vendor-outage catch paths now throw `ServiceUnavailableException` instead of the raw error or a misleading `BadRequestException`; inline `timeout: 10_000` removed from `refundCharge`'s axios call
- `backend/src/common/services/__tests__/paystack.service.spec.ts` (new) - 8 unit tests: success path, vendor-outage `ServiceUnavailableException`, business-response `BadRequestException` for `resolveBvn`, and vendor-key routing assertions for all three methods
- `backend/src/common/services/s3.service.ts` - Constructor injects `ResilienceService` as second param; `upload()`'s `PutObjectCommand` send wrapped in `resilience.execute('s3', ...)`; catch block now throws `ServiceUnavailableException` instead of the raw `err`
- `backend/src/common/services/__tests__/s3.service.spec.ts` - Added `ResilienceService` mock (`mockResilience.execute` pass-through) to both `TestingModule` instantiations; added a 7th test asserting `ServiceUnavailableException` on resilience rejection

## Decisions Made

- `refundCharge` continues to use its pre-existing message (`'Refund gateway unavailable. Retry queued.'`) unchanged, per plan instruction — only the routing (now via `resilience.execute`) and vendor key (`paystackRefund`, zero-retry) changed, not the caller-facing contract.
- The `unconfigured`-mode guard at the top of `S3Service.upload()` (`throw new Error('S3 not configured...')`) was deliberately left outside the resilience wrap — it's a startup misconfiguration, not a vendor-outage signal, and shouldn't count toward the `s3` circuit breaker's failure threshold.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met on first implementation pass; no auto-fixes were required.

## Issues Encountered

- The worktree's `node_modules` was not populated at spawn time (only 1 stray entry present in `backend/node_modules` and none at the repo root) — ran `npm install --workspace=backend` from the worktree root per the pre-flight note before any test could execute (`@nestjs/testing` and `cockatiel` were both missing). This is an environment-provisioning step, not a plan deviation — no source files were affected.
- Pre-existing, unrelated TypeScript compile errors exist elsewhere in the codebase (other modules referencing Prisma client members not present in the currently generated client) — confirmed via `npx tsc --noEmit` that none of the errors reference `resilience`, `paystack.service`, or `s3.service`; out of this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PaystackService` and `S3Service` are fully resilience-wrapped and ready for Plan 05's phase-level verification.
- Plan 03 (FCM/Anthropic) and Plan 04 (Termii) can proceed independently — no shared state or file overlap with this plan's changes.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*
