---
phase: 20-grpc-blue-green-healthcheck-retrofit
plan: 03
subsystem: api
tags: [nestjs, grpc, notifications, platformconfig, madge, circular-dependency, canary, kill-switch]

# Dependency graph
requires:
  - phase: 17-grpc-proof-of-pattern-extraction
    provides: NotificationsClientService as the monolith's sole ClientGrpc facade over notifications-service
provides:
  - Zero-circular-dependency backend/src module graph (madge-verified)
  - grpc.notifications_service.canary_enabled PlatformConfig kill-switch gating registerToken/sendPush
  - notifications-client.constants.ts leaf-file pattern for breaking module/service token cycles
affects: [20-04-PLAN.md, 21-grpc-extraction-news-waitlist-reviews]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Zero-import constants leaf file to break NestJS module<->service require cycles", "Opt-OUT kill-switch flag polarity (cfg?.value !== false) as the inverse of SETTLE-09's opt-IN cutover flag polarity (=== true)"]

key-files:
  created:
    - backend/src/modules/notifications-client/notifications-client.constants.ts
  modified:
    - backend/src/modules/notifications-client/notifications-client.module.ts
    - backend/src/modules/notifications-client/notifications-client.service.ts
    - backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts

key-decisions:
  - "Extracted NOTIFICATIONS_PACKAGE to a dedicated zero-import constants file rather than adding forwardRef() -- this was a plain CommonJS require-cycle between a module file and its own service file, not a bidirectional module-to-module relationship, so forwardRef() would have been the wrong fix"
  - "Kill-switch polarity is opt-OUT (cfg?.value !== false): absence or any value other than false means enabled -- deliberately inverted from SETTLE-09's opt-IN (=== true) pattern because this flag disables an already-live feature rather than gating a new one"
  - "PrismaService injected as the first constructor parameter, matching the stays.service.ts/transport.service.ts convention"
  - "listForUser() left unguarded by design (D-03): it is already a local no-op stub with zero network calls, so gating it would add a pointless PlatformConfig read to a method that does nothing"

requirements-completed: [GRPC-06c]

# Metrics
duration: 65min
completed: 2026-07-20
---

# Phase 20 Plan 03: NotificationsClientService Canary Kill-Switch + Circular Dependency Fix Summary

**Added a `grpc.notifications_service.canary_enabled` PlatformConfig kill-switch to `NotificationsClientService.registerToken()`/`sendPush()` and eliminated the sole circular dependency in the `backend/src` module graph by extracting the `NOTIFICATIONS_PACKAGE` token to a zero-import leaf file.**

## Performance

- **Duration:** 65 min
- **Started:** 2026-07-20T14:15:00-05:00
- **Completed:** 2026-07-20T14:24:00-05:00
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `npx madge --circular --extensions ts --ts-config tsconfig.json src/app.module.ts` now reports "No circular dependency found!" (baseline: exactly 1 cycle, between `notifications-client.module.ts` and `notifications-client.service.ts`)
- `NotificationsClientService.registerToken()` and `sendPush()` both throw `ServiceUnavailableException` immediately, without ever calling `resilience.execute` or the gRPC client, when the `grpc.notifications_service.canary_enabled` PlatformConfig row has `value === false`
- Existing gRPC-calling behavior is completely unchanged when the row is absent or has any value other than `false` (regression-proof, verified by both the 8 pre-existing tests and a new dedicated regression case)
- The `e2e-tour-booking.e2e-spec.ts` reproduction of "A circular dependency has been detected inside NotificationsClientModule" no longer occurs when bootstrapping `AppModule`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract NOTIFICATIONS_PACKAGE token to break the module/service require cycle** - `da12ff4` (fix)
2. **Task 2 RED: add failing tests for canary kill-switch flag** - `b4c2efb` (test)
3. **Task 2 GREEN: implement D-01 canary kill-switch on notifications gRPC** - `dbc8b37` (feat)

_Note: Task 2 followed the TDD RED/GREEN cycle (test commit then feat commit); no REFACTOR commit was needed — the implementation was minimal and required no cleanup pass._

## Files Created/Modified
- `backend/src/modules/notifications-client/notifications-client.constants.ts` - New zero-import leaf file exporting the `NOTIFICATIONS_PACKAGE` DI token string, breaking the module<->service require cycle
- `backend/src/modules/notifications-client/notifications-client.module.ts` - Now imports `NOTIFICATIONS_PACKAGE` from the new constants file instead of declaring it inline
- `backend/src/modules/notifications-client/notifications-client.service.ts` - Imports the token from the constants file; injects `PrismaService`; adds `isCanaryEnabled()` and gates `registerToken()`/`sendPush()` on it
- `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` - Updated import path; added a mocked `PrismaService` with configurable `platformConfig.findUnique` resolution; added 3 new test cases (flag-false on registerToken, flag-false on sendPush, flag-absent/true regression)

## Decisions Made
- Root-cause of the circular dependency was a plain CommonJS require-cycle between a module file and its own service file (not a bidirectional module-to-module relationship), so the fix was extracting the shared constant to a leaf file rather than adding `forwardRef()` anywhere — matches the plan's explicit interface note and the codebase-wide `grep forwardRef` (zero matches) confirming no `forwardRef()` pattern exists anywhere else to be consistent with.
- Kill-switch checked with `cfg?.value !== false` (opt-OUT), the deliberate inverse of the SETTLE-09 `=== true` opt-IN pattern used by the settlement-engine flags, per 20-CONTEXT.md's D-10 addendum locking in the "safety brake on an already-live feature" reading of D-01.
- `PrismaService` added as the first constructor parameter (not appended last), matching the "PrismaService first" convention already used by `stays.service.ts`/`transport.service.ts`.

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` blocks precisely; no architectural changes, no scope expansion beyond the plan's explicit `<files>` list.

## Issues Encountered

- **Missing `node_modules` in the git worktree:** the worktree checkout had no installed dependencies for either the repo root or `backend/` (git worktrees don't carry `node_modules`, which is gitignored). Resolved by symlinking the main working tree's `node_modules` (root and `backend/`) into the worktree — read-only reuse of already-installed packages, no `package.json`/lockfile changes, and the symlinks are themselves gitignored so they never entered version control.
- **`test:e2e:tours` full run requires a real Postgres connection** the worktree has no `.env`/`DATABASE_URL` configured. Ran it anyway with `--testPathPattern="e2e-tour-booking"`: the `wallet-invariant.e2e-spec.ts` suite failed with its known, pre-existing, unrelated `SettlementService` DI-resolution gap (explicitly called out in the plan's `<interfaces>` section as 20-04-PLAN.md's concern, not this plan's). Confirmed via `grep -i "circular"` on the full captured output that the string "circular dependency" does **not** appear anywhere — the specific failure mode this plan's Task 1 targets is gone. Full green on `test:e2e:tours` was never this plan's gate (per the plan's own `<verification>` section: "the suite may still have other, unrelated failures at this point in the phase — full green is 20-04-PLAN.md's gate").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The module graph is now cycle-free, unblocking 20-04-PLAN.md's work on `test:e2e:tours` (which needs `AppModule` to bootstrap cleanly via `Test.createTestingModule({ imports: [AppModule] })`).
- The `grpc.notifications_service.canary_enabled` kill-switch is live in code; flipping it in `PlatformConfig` (via the existing `PATCH /api/v1/admin/config/:key` endpoint) is the only remaining action needed to exercise the canary path in a real environment — that sequencing is a runbook-level (20-05-PLAN.md) concern, not a code gap.
- No blockers for subsequent phase-20 plans.

---
*Phase: 20-grpc-blue-green-healthcheck-retrofit*
*Completed: 2026-07-20*
