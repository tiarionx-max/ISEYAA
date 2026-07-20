---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 07
subsystem: api
tags: [grpc, nestjs, delivery, resilience, exception-mapping, cockatiel]

# Dependency graph
requires:
  - phase: 21 (plan 21-06)
    provides: delivery-otp-service scaffold with DeliveryOtpGrpcController implementing VerifyDeliveryOtp via RpcException({code, message}) business-vs-transport mapping
provides:
  - DeliveryOtpClientService — thin gRPC facade over delivery-otp-service's VerifyDeliveryOtp RPC, with canary kill-switch + ResilienceService wrap + client-side exception mapping
  - DeliveryController's verifyOtp handler routed through the new facade while every other Delivery handler and DeliveryGateway remain fully in-process
  - Completion of GRPC-07 (all 4 phase-21 services — News, Waitlist, Reviews, Delivery OTP — now extracted in the D-05 risk-ascending order)
affects: [phase-22 (scheduled ministry exports, no technical dependency on this plan), any future full Delivery/DeliveryGateway extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial/hybrid controller swap: a controller stays in its original module and gains a second injected client-facade service for one route only, rather than the controller itself moving into a *-client module (contrast with News/Waitlist/Reviews's full controller relocation pattern in this same phase)"
    - "Client-side business-vs-transport exception mapping: inspect err.code against @grpc/grpc-js's numeric GrpcStatus enum (strict ===) to distinguish RpcException-wrapped business-rule failures (INVALID_ARGUMENT/NOT_FOUND, message preserved verbatim) from genuine transport failures (any other code or no code at all, generic ServiceUnavailableException)"

key-files:
  created:
    - backend/src/modules/delivery-otp-client/delivery-otp-client.constants.ts
    - backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts
    - backend/src/modules/delivery-otp-client/delivery-otp-client.module.ts
    - backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts
  modified:
    - backend/src/modules/delivery/delivery.controller.ts
    - backend/src/modules/delivery/delivery.module.ts

key-decisions:
  - "DeliveryOtpClientModule registers controllers: [] — the only *-client module in this phase that does not take over an existing controller, since DeliveryController's other 13 handlers stay bound to the unchanged DeliveryService"
  - "verifyOtp's return type widened from the plan's literal { verified: true } to { verified: boolean } — the gRPC response's success field is a plain boolean at the type level (proto-generated), and only the runtime contract (never returns false on the success path, since server-side errors always throw) is { verified: true }-shaped"

patterns-established:
  - "Pattern: client-side error-code inspection via strict === against numeric GrpcStatus enum values guarantees a malformed/codeless error always falls through to the safe transport-failure default rather than being coincidentally mis-mapped to a business-rule exception"

requirements-completed: [GRPC-07]

duration: 5min
completed: 2026-07-20
---

# Phase 21 Plan 07: Delivery OTP Client Facade + Controller Partial Swap Summary

**Client-side gRPC facade (DeliveryOtpClientService) completing the Delivery OTP extraction, preserving exact wrong/expired/locked-OTP messages and status codes across the transport boundary while every other DeliveryController handler and DeliveryGateway stay fully in-process.**

## Performance

- **Duration:** ~5 min (task work); wall-clock session longer due to worktree node_modules symlink repair
- **Started:** 2026-07-20T18:30:00-05:00 (approx, first commit 18:30:26)
- **Completed:** 2026-07-20T18:32:58-05:00
- **Tasks:** 3/3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- `DeliveryOtpClientService.verifyOtp(orderId, otp)` — canary-gated, resilience-wrapped gRPC call to `delivery-otp-service`'s `VerifyDeliveryOtp` RPC, with client-side business-vs-transport exception mapping that round-trips Plan 21-06's server-side `RpcException({code, message})` contract exactly
- `DeliveryController` gained a second injected service (`DeliveryOtpClientService`) alongside the untouched `DeliveryService`; only the `verifyOtp` handler's single-line body changed — `requestDelivery`, `acceptOrder`, `declineOrder`, `collectParcel`, `completeDelivery`, `rateDelivery`, `cancelOrder`, and every other handler are byte-for-byte unchanged
- `DeliveryModule` imports `DeliveryOtpClientModule` alongside the pre-existing `WalletModule`/`AuthModule`; `DeliveryController` stays registered in `delivery.module.ts` (the one module in this phase that does NOT relocate its controller into a `*-client.module.ts`)
- 8 unit tests proving the full round-trip mapping: success, `INVALID_ARGUMENT`→`BadRequestException` (exact message), `NOT_FOUND`→`NotFoundException` (exact message), codeless transport error→`ServiceUnavailableException` (generic message, no raw text leak), transport code 14 (`UNAVAILABLE`)→`ServiceUnavailableException` (proving non-business codes aren't mis-mapped), canary kill-switch (zero calls when disabled), `resilience.execute` vendor-key assertion, and absent/true-flag regression

## Task Commits

Each task was committed atomically:

1. **Task 1: delivery-otp-client facade — canary + resilience + client-side exception mapping** - `be0219a` (feat)
2. **Task 2: Wire DeliveryController's partial swap + delivery.module.ts import** - `f30c369` (feat)
3. **Task 3: delivery-otp-client.service.spec.ts — full test coverage** - `d59b4f3` (test)

**Plan metadata:** (this commit) `docs(21-07): complete plan`

_Note: Task 1's own jest verification could not pass in isolation (no test file exists until Task 3, matching the plan's own task-file split) — full suite verification ran after Task 3 landed, consistent with Plan 21-06's Task 1/Task 2 staged-verification precedent for this phase._

## Files Created/Modified
- `backend/src/modules/delivery-otp-client/delivery-otp-client.constants.ts` - `DELIVERY_OTP_PACKAGE` token, zero-import leaf file (breaks module/service require cycle)
- `backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts` - `DeliveryOtpClientService`: canary check, `resilience.execute('deliveryOtpGrpc', ...)`, `err.code` → `BadRequestException`/`NotFoundException`/`ServiceUnavailableException` mapping
- `backend/src/modules/delivery-otp-client/delivery-otp-client.module.ts` - `ClientsModule.registerAsync` for the `delivery` package targeting `DELIVERY_OTP_SERVICE_URL` (default `localhost:5012`); `controllers: []`
- `backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` - 8-case unit spec covering the full business/transport exception mapping
- `backend/src/modules/delivery/delivery.controller.ts` - second constructor param `deliveryOtpClient: DeliveryOtpClientService`; `verifyOtp` body now calls `this.deliveryOtpClient.verifyOtp(id, dto.otp)`
- `backend/src/modules/delivery/delivery.module.ts` - added `DeliveryOtpClientModule` to `imports`

## Decisions Made
- Widened `verifyOtp`'s TypeScript return type from the plan's literal `{ verified: true }` to `{ verified: boolean }` to match the proto-generated `VerifyDeliveryOtpResponse.success: boolean` field type — runtime behavior is unaffected (the server only ever returns `success: true` on a non-throwing response; all failure paths throw before reaching the return statement)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type mismatch on verifyOtp's return type**
- **Found during:** Task 1 (initial `tsc --noEmit` verification)
- **Issue:** Plan's action text specified `return { verified: res.success };` under a `Promise<{ verified: true }>` signature; `res.success` is a plain `boolean` (proto-generated field), not the literal type `true`, causing `TS2322: Type 'boolean' is not assignable to type 'true'`
- **Fix:** Changed the method signature to `Promise<{ verified: boolean }>`
- **Files modified:** backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts
- **Verification:** `npx tsc --noEmit -p tsconfig.json` exits 0
- **Committed in:** be0219a (Task 1 commit)

**2. [Rule 3 - Blocking] Repaired missing node_modules symlinks in the worktree**
- **Found during:** Pre-Task-1 verification (`npx tsc --noEmit` reported dozens of unrelated `Cannot find module '@nestjs/...'` errors across the whole backend tree)
- **Issue:** This worktree was created without the `node_modules` symlinks that other worktrees in this repo carry (`node_modules -> ../../../node_modules`, `backend/node_modules -> ../../../../backend/node_modules`, `shared/node_modules -> ...`), making the entire backend uncompilable — not caused by this plan's changes, a worktree-provisioning gap
- **Fix:** Created the same symlinks the sibling worktrees use, pointing at the main repo's installed `node_modules` directories (root, `backend/`, `shared/`, `web/`)
- **Files modified:** none (symlinks only, not tracked by git)
- **Verification:** `npx tsc --noEmit -p tsconfig.json` (root and backend) both exit 0 with zero errors after the fix
- **Committed in:** N/A (untracked symlinks, not a git-visible change)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary to make the plan's own verification commands runnable; no scope creep — the type-widening deviation was type-level only, and the symlink repair was worktree infrastructure, not application code.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. `DELIVERY_OTP_SERVICE_URL` was already declared in `.env.example` by Plan 21-06's scaffold.

## Next Phase Readiness
- GRPC-07 and GRPC-08 requirements are both now fully satisfied: all 4 services in Phase 21 (News, Waitlist, Reviews, Delivery OTP) are extracted in the D-05 risk-ascending order, each independently health-check-gated (Phase 20) and canary-flag-gated (D-06) for staggered production rollout via `docs/blue-green-cutover-runbook.md`
- Full backend suite verified green: 743 tests / 70 suites passing, `tsc --noEmit` clean
- No blockers for Phase 22 (Scheduled Ministry Exports & LGA Heatmap) — confirmed no technical dependency on this plan per STATE.md's Phase 22 note

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all 4 commit hashes (be0219a, f30c369, d59b4f3, 79d1d11) confirmed present in git log.
