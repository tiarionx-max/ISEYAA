---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
plan: 07
subsystem: api
tags: [nestjs, grpc, notifications, resilience, jest, tdd]

# Dependency graph
requires:
  - phase: 17-grpc-proof-of-pattern-extraction-notifications-service
    provides: "notifications-service gRPC extraction (17-03, 17-04, 17-06) — the sendPush/registerToken cutover this plan's bugfix corrects"
provides:
  - "Accurate end-to-end sendPush outcome propagation: NotificationsService's real { sent, reason } result now reaches the REST caller instead of a hardcoded false-positive"
  - "Regression test proving the no-token/business-failure sendPush path resolves { sent: false } through the full facade chain"
  - "Human-confirmed live REST verification closing 17-VERIFICATION.md's Truth #3 gap"
affects: [17-VERIFICATION, GRPC-03, phase-17-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gRPC response-mapping: capture service call results into a local variable before returning, never discard-and-hardcode a success literal"

key-files:
  created: []
  modified:
    - backend/apps/notifications-service/src/notifications-grpc.controller.ts
    - backend/src/modules/notifications-client/notifications-client.service.ts
    - backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Fixed both sides of the boundary (server gRPC controller + client facade) in a single task since neither fix alone closes the gap — the server was discarding NotificationsService's real result, and the client was independently discarding the gRPC response body"
  - "Did not add a `reason` field to SendPushResponse — out of scope per plan's explicit framing; only success/sent accuracy was in scope"
  - "registerToken left byte-unchanged in both files — its underlying business logic has no failure branches, confirmed out of scope by gap_closure_scope"

patterns-established:
  - "When a resilience.execute()-wrapped gRPC call's resolved value must be inspected (not just awaited-and-discarded), pass an explicit generic type argument to resilience.execute<T>() to avoid TS2339 'Property does not exist on type unknown' errors"

requirements-completed: [GRPC-03]

# Metrics
duration: 25min
completed: 2026-07-19
---

# Phase 17 Plan 07: gRPC SendPush Response-Mapping Gap Closure Summary

**Fixed a silent false-success regression where `POST /notifications/send` always reported delivery success regardless of the real FCM/no-token outcome, by propagating `NotificationsService.sendPush()`'s real `{ sent, reason }` result through the gRPC boundary instead of two independently hardcoded `true` literals.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-19T07:45:00Z (approx.)
- **Completed:** 2026-07-19
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 4 (3 code/test files + REQUIREMENTS.md)

## Accomplishments
- `notifications-grpc.controller.ts`'s `sendPush` gRPC handler now captures `NotificationsService.sendPush()`'s real return value and maps `{ success: result.sent }` instead of hardcoding `{ success: true }`
- `NotificationsClientService.sendPush()` now reads the gRPC response body's `success` field into `{ sent: res.success }` instead of hardcoding `{ sent: true }`
- New regression test (`4c`) proves the business-failure path (`success: false` from the gRPC layer — e.g. no registered FCM token) now resolves `{ sent: false }` end-to-end, without throwing
- Full backend regression suite confirmed green: 53 suites / 619 tests (baseline 53/618 + this plan's 1 new test), `npm run build` exits 0
- Human live-verification confirmed `POST /api/v1/notifications/send` returns `{ "sent": false }` for a user with no registered FCM token — closing 17-VERIFICATION.md's Truth #3 / GRPC-03's "zero behavior change to REST responses" clause

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix sendPush response-mapping bug (server handler + client facade) with regression test** - `e9da0ab` (fix, TDD: RED confirmed via failing test 4c against pre-fix code, then GREEN after the two-file fix)
2. **Task 2: Full regression pass — confirm zero side effects on the tour-bookings cron path and overall suite** - no commit (verification-only; zero files modified; `npx jest tour-notifications.service.spec.ts notifications-client.service.spec.ts`, `npm test`, and `npm run build` all run and confirmed green)
3. **Task 3: Human-verify checkpoint** - no commit (verification-only; human confirmed live REST behavior — `POST /api/v1/notifications/send` returns `{ "sent": false }` for a no-FCM-token user; `npm test` re-confirmed green)

**Plan metadata:** (this commit — SUMMARY.md + REQUIREMENTS.md)

_Note: Task 1 followed the TDD RED→GREEN cycle inline within a single commit per the plan's `tdd="true"` task annotation — the plan's `<action>` explicitly directed running the suite first to confirm the new test fails against the current hardcoded implementation (RED), then applying the fix and re-running to confirm GREEN, without prescribing separate `test(...)`/`feat(...)` commits for this single-task plan._

## Files Created/Modified
- `backend/apps/notifications-service/src/notifications-grpc.controller.ts` - `sendPush` handler now maps the real `NotificationsService.sendPush()` result instead of hardcoding success
- `backend/src/modules/notifications-client/notifications-client.service.ts` - `sendPush()` facade now reads the real gRPC response body instead of hardcoding `{ sent: true }`; added explicit `resilience.execute<notifications.SendPushResponse>(...)` generic type argument to satisfy TypeScript's strict typing on the resolved value
- `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` - added test `4c` proving the no-token/business-failure path resolves `{ sent: false }`
- `.planning/REQUIREMENTS.md` - marked `GRPC-03` complete (checkbox + traceability table)

## Decisions Made
- Fixed both sides of the gRPC boundary in one task (server controller + client facade) since either fix alone leaves a false-positive somewhere in the chain
- No `reason` field added to `SendPushResponse` — confirmed out of scope by the plan's interface note; only `success`/`sent` boolean accuracy was required
- `registerToken` left untouched in both files — its underlying service has no failure branches per gap_closure_scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no installed dependencies or generated Prisma client**
- **Found during:** Task 1 (attempting to run `npx jest notifications-client.service.spec.ts` for the RED step)
- **Issue:** This worktree checkout had zero `node_modules` (root workspace install never ran) and no generated `@prisma/client` types, causing `Cannot find module '@nestjs/testing'` and, after installing, cascading `TS2694`/`TS2339`/`TS2305` Prisma type errors across ~19 unrelated test suites when running the full suite in Task 2
- **Fix:** Ran `npm install` at the workspace root, then `npx prisma generate` inside `backend/` — both are standard environment-bootstrap steps, not code changes
- **Files modified:** None (only `node_modules/` and generated Prisma client artifacts, neither tracked in git)
- **Verification:** After both steps, `npx jest notifications-client.service.spec.ts` ran cleanly for the RED/GREEN cycle, and the full `npm test` run in Task 2 passed 53/53 suites
- **Committed in:** N/A (no trackable files changed — environment-only)

---

**Total deviations:** 1 auto-fixed (1 blocking, environment bootstrap only — no code or test logic changes)
**Impact on plan:** Zero impact on scope or correctness; purely a fresh-worktree setup step required before any test could run.

## Issues Encountered
- Initial fix attempt for `notifications-client.service.ts` hit a TypeScript compile error (`Property 'success' does not exist on type 'unknown'`) because `resilience.execute<T>()`'s generic type parameter wasn't inferable from the `as any`-cast gRPC call chain. Resolved by passing an explicit `resilience.execute<notifications.SendPushResponse>(...)` type argument — no behavior change, purely a type annotation fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 17's sole remaining verification gap (17-VERIFICATION.md Truth #3 / GRPC-03) is now closed and human-confirmed live
- Full backend regression suite (53 suites / 619 tests) and build are green with zero regressions
- Ready for orchestrator to merge this worktree back to `microservices-redesign`, run the post-merge test gate, update STATE.md/ROADMAP.md, and proceed to Phase 17 re-verification/close

---
*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Completed: 2026-07-19*
