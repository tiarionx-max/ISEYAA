---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 08
subsystem: api
tags: [grpc, nestjs, exception-handling, reviews, waitlist, rpcexception]

# Dependency graph
requires:
  - phase: 21 (plans 06-07)
    provides: "delivery-otp-grpc.controller.ts / delivery-otp-client.service.ts's verified RpcException business-vs-transport exception mapping pattern, used as the exact template mirrored here"
provides:
  - "reviews-grpc.controller.ts createReview() explicit business-exception-to-RpcException mapping (NOT_FOUND/PERMISSION_DENIED/INVALID_ARGUMENT/ALREADY_EXISTS)"
  - "reviews-client.service.ts createReview() explicit err.code-to-HTTP-exception mapping"
  - "waitlist-grpc.controller.ts joinWaitlist() explicit BadRequestException-to-RpcException(INVALID_ARGUMENT) mapping"
  - "waitlist-client.service.ts join() explicit err.code-to-BadRequestException mapping"
affects: [21-VERIFICATION, phase-21-goal-backward-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gRPC business-exception boundary mapping: server-side @GrpcMethod handlers wrap known Nest HTTP exceptions in RpcException({code: GrpcStatus.X, message: err.message}) via instanceof checks in a try/catch, rethrowing anything else unwrapped; client-side catch blocks check err?.code with strict === against numeric GrpcStatus enum values and map back to the matching Nest HTTP exception before falling back to ServiceUnavailableException for unrecognized/transport failures"

key-files:
  created:
    - backend/apps/reviews-service/src/__tests__/reviews-grpc.controller.spec.ts
    - backend/apps/waitlist-service/src/__tests__/waitlist-grpc.controller.spec.ts
  modified:
    - backend/apps/reviews-service/src/reviews-grpc.controller.ts
    - backend/src/modules/reviews-client/reviews-client.service.ts
    - backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts
    - backend/apps/waitlist-service/src/waitlist-grpc.controller.ts
    - backend/src/modules/waitlist-client/waitlist-client.service.ts
    - backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts

key-decisions:
  - "Mirrored delivery-otp-grpc.controller.ts / delivery-otp-client.service.ts pattern exactly — no new architecture, only extending the proven try/catch + instanceof + strict-equality err.code mapping to Reviews and Waitlist"
  - "listReviews() and getWaitlistStats() left untouched — both are pure Prisma reads with no business exceptions to map, per 21-VERIFICATION.md's confirmed scope"

patterns-established:
  - "Business-exception-vs-transport-exception mapping across gRPC boundary is now applied consistently to all 3 extracted low-risk services (Delivery OTP, Reviews, Waitlist) in Phase 21"

requirements-completed: [GRPC-08]

# Metrics
duration: ~35min
completed: 2026-07-21
---

# Phase 21 Plan 08: Reviews & Waitlist gRPC Business-Exception Mapping (Gap Closure) Summary

**Closed CR-01 and CR-02 by wrapping Reviews' and Waitlist's gRPC business exceptions (NotFoundException/ForbiddenException/BadRequestException/ConflictException) in RpcException server-side and mapping err.code back to the matching Nest HTTP exception client-side, mirroring the already-verified delivery-otp-grpc.controller.ts pattern exactly.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-21T00:56:38Z
- **Tasks:** 2 completed
- **Files modified:** 6 modified, 2 created

## Accomplishments
- `reviews-grpc.controller.ts` `createReview()` now wraps `NotFoundException` → `NOT_FOUND`, `ForbiddenException` → `PERMISSION_DENIED`, `ConflictException` → `ALREADY_EXISTS`, `BadRequestException` → `INVALID_ARGUMENT` in `RpcException`, with any other error type rethrown unwrapped
- `reviews-client.service.ts` `createReview()` catch block maps all 4 `GrpcStatus` codes back to the original Nest HTTP exception with the preserved message, falling back to `ServiceUnavailableException` only for unrecognized/transport errors
- `waitlist-grpc.controller.ts` `joinWaitlist()` now wraps `BadRequestException` → `INVALID_ARGUMENT` in `RpcException`, with any other error type rethrown unwrapped
- `waitlist-client.service.ts` `join()` catch block maps `INVALID_ARGUMENT` back to `BadRequestException` with the preserved message, falling back to `ServiceUnavailableException` otherwise
- New `reviews-grpc.controller.spec.ts` (6 tests) and `waitlist-grpc.controller.spec.ts` (3 tests), plus 5 new tests in `reviews-client.service.spec.ts` and 2 new tests in `waitlist-client.service.spec.ts`, all proving the round-trip mapping and preserving the original business-rule messages

## Task Commits

Each task was committed atomically:

1. **Task 1: Reviews — RpcException server-side mapping + client-side err.code mapping (CR-01)** - `3754039` (feat)
2. **Task 2: Waitlist — RpcException server-side mapping + client-side err.code mapping (CR-02)** - `29eb414` (feat)

**Plan metadata:** committed alongside this SUMMARY.md (worktree mode — orchestrator finalizes shared-file writes after merge)

## Files Created/Modified
- `backend/apps/reviews-service/src/reviews-grpc.controller.ts` - `createReview()` wraps 4 business exception types in `RpcException` with correct `GrpcStatus` codes
- `backend/apps/reviews-service/src/__tests__/reviews-grpc.controller.spec.ts` - new spec, 6 tests covering success passthrough + 4 mapped exceptions + unwrapped rethrow
- `backend/src/modules/reviews-client/reviews-client.service.ts` - `createReview()` catch block maps `err.code` back to the matching Nest HTTP exception before falling back to `ServiceUnavailableException`
- `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` - extended with 5 new tests (4 mapped-exception round-trips + 1 regression guard)
- `backend/apps/waitlist-service/src/waitlist-grpc.controller.ts` - `joinWaitlist()` wraps `BadRequestException` in `RpcException` with `INVALID_ARGUMENT`
- `backend/apps/waitlist-service/src/__tests__/waitlist-grpc.controller.spec.ts` - new spec, 3 tests covering success + mapped exception + unwrapped rethrow
- `backend/src/modules/waitlist-client/waitlist-client.service.ts` - `join()` catch block maps `INVALID_ARGUMENT` back to `BadRequestException`
- `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` - extended with 2 new tests (mapped-exception round-trip + regression guard)

## Decisions Made
- Followed the plan's explicit instruction to mirror `delivery-otp-grpc.controller.ts` / `delivery-otp-client.service.ts` exactly — no deviation in structure, ordering of instanceof/code checks, or logging behavior (mapped-exception branches never call `logger.error`, only the fallback branch does)
- Left `listReviews()` and `getWaitlistStats()` untouched per the plan's explicit scope confirmation (pure Prisma reads, no business exceptions)

## Deviations from Plan

None - plan executed exactly as written. One environment-level adjustment was required to run tests: the worktree had no `node_modules` installed (fresh git worktree checkout); junction-linked `node_modules` from the main repo checkout into the worktree root, `backend/`, `shared/`, and `packages/proto/` to enable `npx jest`/`npx tsc` to resolve dependencies. This is a local dev-environment fix only, not a source change, and is not tracked by git (node_modules is gitignored).

## Issues Encountered
None beyond the node_modules linking noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both CR-01 and CR-02 identified in `21-VERIFICATION.md` are closed; all 10 of Phase 21's must-haves should now pass on re-verification
- `cd backend && npx jest apps/reviews-service apps/waitlist-service src/modules/reviews-client src/modules/waitlist-client --silent` — 8 test suites, 37 tests, all passing
- `cd backend && npx tsc --noEmit -p tsconfig.json` — clean, no errors
- No blockers for Phase 21 closure

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-21*
