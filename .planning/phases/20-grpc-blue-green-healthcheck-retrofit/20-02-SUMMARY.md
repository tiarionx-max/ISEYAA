---
phase: 20-grpc-blue-green-healthcheck-retrofit
plan: 02
subsystem: infra
tags: [redis, distributed-lock, cron, blue-green-deploy, nestjs-schedule]

# Dependency graph
requires:
  - phase: 16-connection-pooling-infrastructure
    provides: "RedisService.setNx() atomic SET NX EX lock primitive (fail-open on Redis unavailability)"
provides:
  - "Distributed cron-lock guard (cron-lock:<methodName> via RedisService.setNx()) applied to all 6 GRPC-06b-named @Cron jobs across 4 service files"
  - "Skip-and-return guard pattern proven safe for money-moving crons (releaseEscrow) and idempotent-work crons (heartbeat cleanup, tour push notifications)"
affects: [20-03, 20-04, 20-05, 22-scheduled-ministry-exports]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skip-and-return distributed lock guard: acquire cron-lock:<name> via setNx() as the very first statement in a @Cron method body; on false, logger.debug + return immediately — no try/finally release, TTL alone is the safety net since a crashed replica never reaches a finally block"

key-files:
  created: []
  modified:
    - backend/src/modules/transport/transport.service.ts
    - backend/src/modules/transport/__tests__/transport.service.spec.ts
    - backend/src/modules/delivery/delivery.service.ts
    - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
    - backend/src/modules/stays/stays.service.ts
    - backend/src/modules/stays/__tests__/stays.service.spec.ts
    - backend/src/modules/stays/__tests__/stays-isolation.spec.ts
    - backend/src/modules/tour-bookings/tour-notifications.service.ts
    - backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts

key-decisions:
  - "Guard placed as the first statement inside the method's existing outer try/catch (transport/delivery) rather than its own nested try/catch, per the plan's exact interface spec"
  - "db-metrics.service.ts's pollOpenConnections intentionally left unguarded (D-07) — local in-memory gauge only, no shared side effect to double up on"
  - "setNx() itself left completely unmodified (D-08) — fail-open behavior preserved exactly as-is"

patterns-established:
  - "cron-lock:<methodName> key naming convention for all future distributed cron guards (e.g. Phase 22's new scheduled export job can reuse this pattern directly per STATE.md's noted dependency)"

requirements-completed: [GRPC-06b]

# Metrics
duration: 15min
completed: 2026-07-20
---

# Phase 20 Plan 02: Distributed Cron-Lock Guards Summary

**Guarded all 6 GRPC-06b-named `@Cron` jobs across 4 services with `RedisService.setNx()` skip-and-return locks, closing the double-payout/duplicate-push risk during blue-green cutover's dual-liveness window.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T19:16:00Z (approx, from first task commit e659905)
- **Completed:** 2026-07-20T19:22:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 9 (4 service files, 5 spec files — including one out-of-scope spec fixed under Rule 3)

## Accomplishments

- `cleanStaleDriverHeartbeats` (transport) and `cleanStaleRiderHeartbeats` (delivery) each guarded with a 25s-TTL lock, one tick shorter than their 30s cron interval
- `releaseEscrow` (stays) — the money-moving cron GRPC-06b explicitly calls out — guarded with a 3300s-TTL lock (55 min, under the hourly cron interval), preventing double wallet credits during a cutover window
- All three tour-notification crons (`pushTMinus24h`, `pushTMinus2h`, `pushPostTourRating`) independently guarded with their own `cron-lock:*` keys, so a lock miss on one never blocks the other two
- `RedisService` newly injected into `StaysService` and `TourNotificationsService` (both previously had no Redis dependency); `RedisModule` being `@Global()` meant no module `imports` array changes were needed
- 12 new test cases added across 4 spec files, each proving both the lock-acquired pass-through path and the lock-held skip-and-return path with the exact key/TTL asserted
- Zero regressions: full backend suite 695/695 tests passing (up from 683 pre-plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard cleanStaleDriverHeartbeats + cleanStaleRiderHeartbeats** - `e659905` (feat)
2. **Task 2: Guard releaseEscrow + all 3 tour-notification crons** - `6164244` (feat)

**Plan metadata:** (this commit — SUMMARY.md only, worktree mode; STATE.md/ROADMAP.md owned by orchestrator)

## Files Created/Modified

- `backend/src/modules/transport/transport.service.ts` - `cleanStaleDriverHeartbeats` guarded with `cron-lock:cleanStaleDriverHeartbeats` (TTL 25s)
- `backend/src/modules/transport/__tests__/transport.service.spec.ts` - 2 new tests (lock acquired / lock held) + `setNx` mock added
- `backend/src/modules/delivery/delivery.service.ts` - `cleanStaleRiderHeartbeats` guarded with `cron-lock:cleanStaleRiderHeartbeats` (TTL 25s)
- `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` - 2 new tests + `setNx` mock added
- `backend/src/modules/stays/stays.service.ts` - `RedisService` injected; `releaseEscrow` guarded with `cron-lock:releaseEscrow` (TTL 3300s)
- `backend/src/modules/stays/__tests__/stays.service.spec.ts` - `RedisService` mock provider + 2 new tests
- `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` - Rule 3 fix: added the same `RedisService` mock provider (broke due to the new constructor param, unrelated test file)
- `backend/src/modules/tour-bookings/tour-notifications.service.ts` - `RedisService` injected; `pushTMinus24h`/`pushTMinus2h`/`pushPostTourRating` each guarded with their own `cron-lock:*` key (TTLs 3300s/840s/840s)
- `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` - `RedisService` mock provider + 6 new tests (2 per guarded cron)

## Decisions Made

- Guard inserted as the very first statement inside the method's *existing* outer `try { ... } catch` block for `transport.service.ts`/`delivery.service.ts` (not a separate nested try/catch), matching the plan's exact interface spec so a lock-acquisition error still flows through the method's existing error-logging path.
- No module-level `imports` array changes needed in `StaysModule`/`TourBookingsModule` since `RedisModule` is `@Global()` — constructor injection alone resolved both new dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `stays-isolation.spec.ts` broke on StaysService's new constructor param**
- **Found during:** Task 2 (full-suite verification after adding `RedisService` to `StaysService`'s constructor)
- **Issue:** A separate isolation-test spec file (`stays-isolation.spec.ts`, not listed in this plan's `files_modified`) independently instantiates `StaysService` via its own `Test.createTestingModule` call and failed to resolve the newly-added `RedisService` dependency (`Nest can't resolve dependencies of the StaysService ... argument RedisService at index [8]`), breaking 2 previously-passing tests.
- **Fix:** Added the identical `mockRedis = { setNx: jest.fn().mockResolvedValue(true) }` provider entry to this file's `providers` array, matching the pattern used in `stays.service.spec.ts`.
- **Files modified:** `backend/src/modules/stays/__tests__/stays-isolation.spec.ts`
- **Verification:** Full backend suite re-run after the fix: 695/695 tests passing (0 failures).
- **Committed in:** `6164244` (part of Task 2's commit)

## Verification Results

- `cd backend && npm test -- --testPathPattern="transport.service.spec|delivery.service.spec"` → 2 suites, 56 tests passing (0 regressions)
- `cd backend && npm test -- --testPathPattern="stays.service.spec|tour-notifications.service.spec"` → 2 suites, 49 tests passing (0 regressions)
- `cd backend && npm test -- --forceExit --passWithNoTests` (full suite) → 55 suites, 695 tests passing (0 failures)
- Manual `docker compose --scale` multi-replica concurrency check explicitly deferred to `20-05-PLAN.md`'s runbook per this plan's own `<verification>` note — not required to pass in this plan.

## Success Criteria Status

- [x] All 6 named crons (D-07) guarded with `setNx()`, using the exact key/TTL table from the plan
- [x] `db-metrics.service.ts`'s `pollOpenConnections` left untouched (absent from `files_modified`, confirmed by diff)
- [x] `setNx()` itself unmodified — fail-open behavior preserved exactly (D-08); zero changes to `redis.service.ts`
- [x] Zero regressions in the 4 modified services' existing test suites (and zero regressions project-wide: 695/695)

## Environment Note (worktree-local, not committed)

This worktree had no `node_modules` (npm workspaces node_modules live at the repo root and are `.gitignore`d, so a fresh worktree checkout starts without them). Windows directory junctions were created locally (`node_modules` → main repo's `node_modules`; `backend/node_modules` → main repo's `backend/node_modules`) purely to run the test suite inside this worktree. Both paths are already covered by `.gitignore` and were not staged or committed — no action needed by the orchestrator on merge.

## Known Stubs

None — no new UI-facing or data-flow stubs introduced by this plan (backend-only cron guard change).

## Threat Flags

None — this plan's `<threat_model>` (T-20-04, T-20-05, T-20-06) fully covers the new surface introduced (cron-lock keys); no additional network endpoints, auth paths, or schema changes were introduced.

## Self-Check: PASSED

- FOUND: `backend/src/modules/transport/transport.service.ts` (cron-lock guard present)
- FOUND: `backend/src/modules/delivery/delivery.service.ts` (cron-lock guard present)
- FOUND: `backend/src/modules/stays/stays.service.ts` (cron-lock guard present)
- FOUND: `backend/src/modules/tour-bookings/tour-notifications.service.ts` (cron-lock guards present)
- FOUND commit `e659905` in `git log --oneline --all`
- FOUND commit `6164244` in `git log --oneline --all`
