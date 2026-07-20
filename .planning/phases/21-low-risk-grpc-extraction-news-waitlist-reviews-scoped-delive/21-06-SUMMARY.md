---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 06
subsystem: api
tags: [grpc, nestjs, delivery, wallet, settlement, rpc-exception, testing]

# Dependency graph
requires:
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    provides: "Hybrid HTTP+gRPC bootstrap pattern (grpc.health.v1.Health + GET /healthz), cron-lock distributed-lock pattern"
  - phase: 21-05
    provides: "Established apps/*-service scaffolding precedent within this phase (news/waitlist/reviews)"
provides:
  - "backend/apps/delivery-otp-service: independently-buildable NestJS app implementing ONLY VerifyDeliveryOtp over gRPC"
  - "Direct bare-class provider pattern for extracting a service whose module wholesale-import would drag in unwanted guard-protected controllers or a live WebSocketGateway"
  - "Business-vs-transport exception mapping precedent (explicit RpcException wrap for BadRequestException/NotFoundException, preserving original messages across the gRPC boundary)"
  - "jest.config.js fix enabling any future spec that transitively imports @iseyaa/proto to resolve under ts-jest"
affects: [21-07, delivery, wallet, settlement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct bare-class provider injection to avoid wholesale module imports that would mount unwanted guard-protected controllers (WalletModule/CommonModule excluded; WalletService/S3Service/SettlementService/PaystackService/RefundService/ReferenceService provided directly)"
    - "Provider-token override (`{ provide: X, useValue: stub }`) to satisfy a forwardRef-injected dependency without constructing a stateful side-effecting class (DeliveryGateway stub)"
    - "Explicit RpcException wrap in @GrpcMethod catch blocks to preserve business-rule exception messages across the gRPC boundary (NestJS's default BaseRpcExceptionFilter replaces non-RpcException messages with a generic string)"

key-files:
  created:
    - backend/apps/delivery-otp-service/src/main.ts
    - backend/apps/delivery-otp-service/src/app.module.ts
    - backend/apps/delivery-otp-service/src/health.controller.ts
    - backend/apps/delivery-otp-service/src/delivery-otp-grpc.controller.ts
    - backend/apps/delivery-otp-service/railway.toml
    - backend/apps/delivery-otp-service/Dockerfile
    - backend/apps/delivery-otp-service/tsconfig.app.json
    - backend/apps/delivery-otp-service/src/__tests__/health.controller.spec.ts
    - backend/apps/delivery-otp-service/src/__tests__/grpc-health.spec.ts
    - backend/apps/delivery-otp-service/src/__tests__/delivery-otp-grpc.controller.spec.ts
  modified:
    - backend/jest.config.js

key-decisions:
  - "DeliveryService's WalletService/S3Service/SettlementService/PaystackService/RefundService/ReferenceService dependencies are provided as bare classes directly in app.module.ts's own providers array instead of importing WalletModule/CommonModule wholesale, because those modules' controllers arrays (WalletController; SettlementController, UploadController) are @UseGuards(JwtAuthGuard)-protected and this process never registers AuthModule/JwtStrategy — a wholesale import would mount a permanently-broken, unauthenticatable route surface including /wallet/topup and /wallet/transfer"
  - "DeliveryGateway's injection token is overridden with a no-op stub rather than importing DeliveryModule wholesale, because DeliveryGateway is a real @WebSocketGateway()-decorated Socket.IO server not exported from DeliveryModule — instantiating it would bind a second live WebSocket server inside this process, violating Roadmap Phase 21 Success Criteria #2"
  - "ScheduleModule.forRoot() is included (unlike news-service, which omits it) because DeliveryService.cleanStaleRiderHeartbeats is @Cron-decorated and DeliveryService is a direct provider here; double-firing across the monolith + this process is safe because that cron is already guarded by the Phase 20 redis.setNx distributed lock"
  - "Business-rule OTP failures (BadRequestException, NotFoundException) are explicitly wrapped in RpcException with INVALID_ARGUMENT/NOT_FOUND codes; any other error type is rethrown unmodified so genuine defects still get NestJS's default generic gRPC error response"

patterns-established:
  - "Pattern: when a module's controllers array is guard-protected and the extracted process never registers the guard's auth strategy, provide the module's services directly as bare classes instead of importing the module wholesale"
  - "Pattern: RpcException({code, message}) wrap in a @GrpcMethod catch block for every business-rule exception type that must preserve its original message across the gRPC transport boundary"

requirements-completed: [GRPC-07]

# Metrics
duration: ~35min
completed: 2026-07-20
---

# Phase 21 Plan 06: Delivery OTP gRPC Extraction Summary

**delivery-otp-service extracts only `VerifyDeliveryOtp` over gRPC, reusing `DeliveryService` unmodified while directly bare-class-providing its Wallet/S3/Settlement dependency chain (skipping WalletModule/CommonModule wholesale imports) and stubbing `DeliveryGateway` so no second live WebSocket server binds in the new process.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-20T22:45:00Z (approx)
- **Completed:** 2026-07-20T23:18:34Z
- **Tasks:** 2 (executed together in one pass per plan's explicit staging order)
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments
- `backend/apps/delivery-otp-service` scaffolded as an independently-buildable hybrid HTTP+gRPC NestJS app (gRPC `:5012`, HTTP `healthz` `:8080`), matching the notifications/news/waitlist/reviews-service precedent
- `DeliveryService` provided unmodified; its full transitive dependency chain (`WalletService`, `S3Service`, `SettlementService`, `PaystackService`, `RefundService`, `ReferenceService`) is directly bare-class-provided rather than pulled in via `WalletModule`/`CommonModule`, so `WalletController`/`SettlementController`/`UploadController` (all `@UseGuards(JwtAuthGuard)`-protected, unsatisfiable since no `AuthModule`/`JwtStrategy` exists in this process) never mount onto this process's HTTP listener
- `DeliveryGateway`'s injection token is overridden with a no-op stub, so its real `@WebSocketGateway()` Socket.IO server is never instantiated in this process — no second live WebSocket endpoint is created, preserving Roadmap Phase 21 Success Criteria #2
- `ScheduleModule.forRoot()` included so `DeliveryService.cleanStaleRiderHeartbeats`'s `@Cron` fires correctly here, safely, behind the existing Phase 20 `redis.setNx` cron-lock
- `DeliveryOtpGrpcController` implements ONLY `VerifyDeliveryOtp`; its catch block explicitly wraps `BadRequestException`/`NotFoundException` in `RpcException({code, message})` so business-rule OTP failure messages ("N attempts remaining", "OTP expired", lockout) survive the gRPC boundary rather than being replaced by NestJS's default generic "Internal server error" string — proven by a unit test suite covering all four `<behavior>` cases (success, INVALID_ARGUMENT, NOT_FOUND, unwrapped rethrow)
- `backend/apps/delivery-otp-service` builds cleanly (`nest build delivery-otp-service` exits 0) and all three of its spec files pass (`jest apps/delivery-otp-service --silent` exits 0)

## Task Commits

Both tasks were committed together, per the plan's explicit staging note (Task 1's `app.module.ts` references Task 2's `DeliveryOtpGrpcController`, which does not exist until Task 2 completes — the plan calls this "an accepted staging order, not an error" and instructs executing both tasks in a single pass):

1. **Task 1 + Task 2: Scaffold delivery-otp-service + VerifyDeliveryOtp gRPC controller with RpcException mapping** - `90f7a52` (feat)

**Plan metadata:** commit follows this summary.

## Files Created/Modified
- `backend/apps/delivery-otp-service/src/main.ts` - Hybrid gRPC (`:5012`) + HTTP healthz (`:8080`) bootstrap, mirrors notifications-service
- `backend/apps/delivery-otp-service/src/app.module.ts` - Direct bare-class providers for DeliveryService's full dependency chain, DeliveryGateway stub override, ScheduleModule.forRoot() with cron-lock safety comment, no WalletModule/CommonModule/AuthModule/DeliveryModule imports
- `backend/apps/delivery-otp-service/src/health.controller.ts` - Terminus `/healthz` endpoint, copied verbatim from precedent
- `backend/apps/delivery-otp-service/src/delivery-otp-grpc.controller.ts` - `VerifyDeliveryOtp` @GrpcMethod handler with explicit RpcException business-exception mapping
- `backend/apps/delivery-otp-service/railway.toml` - Railway build/deploy config, watchPaths cover delivery/wallet/common source dirs
- `backend/apps/delivery-otp-service/Dockerfile` - `nest build delivery-otp-service`, exposes 5012 + 8080
- `backend/apps/delivery-otp-service/tsconfig.app.json` - App-scoped TS config, extends backend/tsconfig.json
- `backend/apps/delivery-otp-service/src/__tests__/health.controller.spec.ts` - Wave-0-harness health check test
- `backend/apps/delivery-otp-service/src/__tests__/grpc-health.spec.ts` - Wave-0-harness grpc.health.v1.Health wiring test
- `backend/apps/delivery-otp-service/src/__tests__/delivery-otp-grpc.controller.spec.ts` - 4 behavior tests: success, BadRequestException->INVALID_ARGUMENT, NotFoundException->NOT_FOUND, generic error rethrown unwrapped
- `backend/jest.config.js` - Added `moduleNameMapper` entry mapping `@iseyaa/proto` to its `.ts` source (see Deviations)

## Decisions Made
- Direct bare-class provisioning of `WalletService`/`S3Service`/`SettlementService`/`PaystackService`/`RefundService`/`ReferenceService` instead of importing `WalletModule`/`CommonModule` — avoids mounting `@UseGuards(JwtAuthGuard)`-protected controllers that would be permanently unauthenticatable in a process with no `AuthModule`
- `DeliveryGateway` token override with a no-op stub instead of importing `DeliveryModule` — avoids instantiating a second live `@WebSocketGateway()` Socket.IO server in this process
- `ScheduleModule.forRoot()` included (deliberately different from news-service's omission) because `DeliveryService.cleanStaleRiderHeartbeats` is `@Cron`-decorated and already safe under the Phase 20 cron-lock

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created a Windows NTFS junction linking the worktree's `backend/node_modules` to the main repo's `backend/node_modules`**
- **Found during:** Task 1 (initial verification run)
- **Issue:** This git worktree had no `node_modules` installed anywhere under `backend/` (or at its own root), so `@nestjs/testing` and other backend-workspace-scoped packages could not resolve, failing every spec file with `TS2307: Cannot find module '@nestjs/testing'`
- **Fix:** Created an NTFS directory junction (`backend/node_modules` -> main repo's `backend/node_modules`) via a small Node.js script (`fs.symlinkSync(..., 'junction')`), since `node_modules` is gitignored and this only affects the local worktree filesystem, not tracked source
- **Files modified:** None tracked (gitignored `node_modules` junction only)
- **Verification:** `npx jest apps/delivery-otp-service/src/__tests__/health.controller.spec.ts apps/delivery-otp-service/src/__tests__/grpc-health.spec.ts --silent` passed after the junction was created
- **Committed in:** N/A (not a tracked file)

**2. [Rule 3 - Blocking] Added a `jest.config.js` `moduleNameMapper` entry for `@iseyaa/proto`**
- **Found during:** Task 2 (writing `delivery-otp-grpc.controller.spec.ts`, the plan's required unit test suite)
- **Issue:** `@iseyaa/proto`'s `package.json` declares `"main": "generated/index.js"`, but the package ships only committed `.ts` sources — `generated/index.js` has never been built anywhere in this repo (confirmed: no `.js` output exists under `packages/proto/generated` in either the worktree or the main repo). `tsc`/`nest build` silently resolves the `.ts` file via TypeScript's Node-resolution `.ts`-extension fallback, so `nest build delivery-otp-service` (and every existing `*-grpc.controller.ts` in other extracted services) compiles fine. Jest's runtime module resolver does not apply that same TS-specific fallback, so any spec that transitively `require()`s `@iseyaa/proto` fails with `Cannot find module '@iseyaa/proto'`. This plan's `delivery-otp-grpc.controller.spec.ts` is the first jest spec in the repo to import a `*-grpc.controller.ts` file that itself imports `@iseyaa/proto` — prior extracted services (news/waitlist/reviews/notifications) never had a spec covering their gRPC controller, so this gap was previously unencountered.
- **Fix:** Added `'^@iseyaa/proto$': '<rootDir>/../../packages/proto/generated/index.ts'` to `backend/jest.config.js`'s `moduleNameMapper`, so ts-jest transforms the `.ts` source directly instead of relying on Node's runtime `main`-field resolution — this is a backend-workspace-wide fix (not just for this plan), but is minimal, additive, and required by this plan's own explicit acceptance criteria (`cd backend && npx jest apps/delivery-otp-service --silent exits 0`)
- **Files modified:** `backend/jest.config.js`
- **Verification:** `npx jest apps/delivery-otp-service --silent` — all 3 suites / 6 tests pass; re-ran `npx jest src/modules/delivery --silent` (19 pre-existing tests) to confirm no regression from the `moduleNameMapper` change
- **Committed in:** `90f7a52` (Task 1+2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues preventing plan-mandated test verification)
**Impact on plan:** Both fixes were environment/build-tooling gaps, not scope creep on `delivery-otp-service` itself. The `jest.config.js` change is a small, additive, backend-workspace-wide fix that also benefits any future spec importing `@iseyaa/proto`; it does not touch any orchestrator-owned shared state file (STATE.md/ROADMAP.md).

## Issues Encountered
- `npx nest build delivery-otp-service` initially failed with `npm error could not determine executable to run` — resolved by invoking the local binary directly (`./node_modules/.bin/nest.cmd build delivery-otp-service`), which succeeded with exit 0. This appears to be an `npx` resolution quirk specific to the worktree's junction-linked `node_modules`, not a code defect; the plan's stated verification command (`npx nest build delivery-otp-service`) is otherwise equivalent and should work in a normally-provisioned environment.

## Next Phase Readiness
- `delivery-otp-service` builds, passes its health tests, implements ONLY `VerifyDeliveryOtp`, and demonstrably preserves driver-facing OTP failure messages across the gRPC boundary via a tested `RpcException` mapping
- `DeliveryGateway` is provably never instantiated as a live provider in this process (stub override), satisfying Roadmap Phase 21 Success Criteria #2
- Docker/Compose/nest-cli.json/package.json wiring for `delivery-otp-service` was already in place from an earlier plan in this phase (21-01) — no additional infra wiring was needed this plan
- Plan 21-07 (client-side facade wiring `ClientGrpc` calls to this new service, per the roadmap's "Delivery OTP is the fourth and final service to begin landing, completed by Plan 21-07") can proceed

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*
