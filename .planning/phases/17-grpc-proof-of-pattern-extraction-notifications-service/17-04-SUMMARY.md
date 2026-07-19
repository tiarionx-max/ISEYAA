---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
plan: 04
subsystem: api
tags: [grpc, nestjs-microservices, cutover, notifications]

# Dependency graph
requires:
  - phase: 17-03
    provides: "NotificationsClientModule/NotificationsClientService gRPC facade, call-compatible with NotificationsService's 3-method contract"
provides:
  - "Live gRPC cutover: NotificationsController and TourNotificationsService both run on NotificationsClientService, not the in-process NotificationsService"
  - "Committed GRPC-04 caller-graph audit (17-CALLER-GRAPH-AUDIT.md) preceding the cutover commits"
  - "Zero remaining in-process direct injections of NotificationsService anywhere in the monolith's own bootstrap tree (only the extracted notifications-service process's own gRPC handler still references it)"
affects: [17-05, 17-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Straight one-shot facade cutover (D-09): swap the injected type/import at each call site with zero feature flag and zero dual-path code, relying on git revert as the rollback mechanism (D-10)"

key-files:
  created:
    - .planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-CALLER-GRAPH-AUDIT.md
  modified:
    - backend/src/modules/notifications/notifications.controller.ts
    - backend/src/modules/notifications/notifications.module.ts
    - backend/src/modules/notifications-client/notifications-client.module.ts
    - backend/src/app.module.ts
    - backend/src/modules/tour-bookings/tour-notifications.service.ts
    - backend/src/modules/tour-bookings/tour-bookings.module.ts
    - backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts

key-decisions:
  - "notifications.controller.ts's file stays physically at backend/src/modules/notifications/notifications.controller.ts (D-01 minimal-diff) — only its @Module registration moved to NotificationsClientModule and its injected type changed"
  - "notifications.module.ts keeps providers/exports of the legacy NotificationsService unchanged (only drops the controller) because backend/apps/notifications-service/src/app.module.ts — the extracted process's own untouched bootstrap tree — still imports it directly for its own NotificationsGrpcController"

patterns-established: []

requirements-completed: [GRPC-03, GRPC-04, GRPC-05]

# Metrics
duration: ~25min
completed: 2026-07-19
---

# Phase 17 Plan 04: gRPC Cutover — NotificationsController + TourNotificationsService Summary

**Straight one-shot cutover of both confirmed `NotificationsService` call sites onto the Plan 17-03 gRPC facade — `notifications-service` now genuinely serves live monolith traffic via `ClientGrpc`, with the caller-graph audit committed before any cutover code change landed.**

## Performance

- **Duration:** ~25 min (includes worktree `npm install` + `prisma generate`, neither of which existed in this fresh worktree)
- **Tasks:** 3
- **Files modified:** 1 created, 7 modified

## Accomplishments

- Committed `.planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-CALLER-GRAPH-AUDIT.md` (Task 1) as its own standalone commit, preceding both cutover commits in git history — confirms the 3 constructor-injection sites of `NotificationsService`, the GRPC-05 grep gate (zero `ClientGrpc`/`ClientsModule` usage across the 10 modules that must stay in-process this milestone), and the accepted `SendPushResponse.reason` gap
- `NotificationsController` now injects `NotificationsClientService`; its 3 REST endpoints (`GET /notifications`, `POST /notifications/register-token`, `POST /notifications/send`) are served by the gRPC facade with byte-identical `@UseGuards(JwtAuthGuard)`/`@ApiBearerAuth()`/`@Controller('notifications')` decorators
- `NotificationsClientModule` now registers `NotificationsController` in its `controllers` array; `notifications.module.ts` drops the controller but keeps `providers`/`exports` of the legacy `NotificationsService` unchanged (still required by the extracted process's own separate bootstrap tree)
- `app.module.ts` imports `NotificationsClientModule` instead of `NotificationsModule` — the monolith's own bootstrap tree no longer references the in-process notifications module at all
- `TourNotificationsService`'s constructor now injects `NotificationsClientService` (parameter name `notifications` unchanged) — all 3 existing `this.notifications.sendPush(...)` call sites (`pushTMinus24h`, `pushTMinus2h`, `pushPostTourRating`) required zero edits; the existing catch-and-log-no-rethrow contract on all 3 crons and the `onBookingConfirmed` event handler is byte-identical
- `tour-bookings.module.ts` imports `NotificationsClientModule` instead of `NotificationsModule`
- `tour-notifications.service.spec.ts`'s mock provider token updated to `NotificationsClientService`; all 10 existing scenarios pass unchanged
- Post-cutover grep confirms the only remaining constructor-injection of the legacy `NotificationsService` anywhere in `backend/src`/`backend/apps` is `notifications-grpc.controller.ts` — the extracted process's own gRPC server handler, which is not a caller to migrate
- Full backend suite: 53/53 suites, 618/618 tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit the caller-graph audit artifact BEFORE any cutover code change (D-11, GRPC-04, GRPC-05)** - `dab61bc` (docs)
2. **Task 2: Cut over NotificationsController and app.module.ts (D-01, D-02, D-06)** - `8e70aab` (feat)
3. **Task 3: Cut over TourNotificationsService and update its spec (D-01, D-07, Pitfall 4)** - `47043c3` (feat)

**Plan metadata:** committed alongside this SUMMARY.md (see final commit)

_Git log confirms the audit commit (`dab61bc`) precedes both cutover commits (`8e70aab`, `47043c3`) — satisfying D-11's ordering requirement._

## Files Created/Modified

- `.planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-CALLER-GRAPH-AUDIT.md` - GRPC-04 caller-graph audit; enumerates all 3 `NotificationsService` constructor-injection sites, the GRPC-05 grep gate result, and the accepted `SendPushResponse.reason` gap
- `backend/src/modules/notifications/notifications.controller.ts` - Injects `NotificationsClientService` instead of `NotificationsService`; routes/guards unchanged
- `backend/src/modules/notifications/notifications.module.ts` - Controller registration removed; providers/exports of the legacy service unchanged (still consumed by the extracted process's own `app.module.ts`)
- `backend/src/modules/notifications-client/notifications-client.module.ts` - Now registers `NotificationsController` in its `controllers` array
- `backend/src/app.module.ts` - Imports `NotificationsClientModule` instead of `NotificationsModule`
- `backend/src/modules/tour-bookings/tour-notifications.service.ts` - Constructor injects `NotificationsClientService`; call sites unchanged
- `backend/src/modules/tour-bookings/tour-bookings.module.ts` - Imports `NotificationsClientModule` instead of `NotificationsModule`
- `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` - Mock provider token updated to `NotificationsClientService`

## Decisions Made

- **Controller stays physically in `modules/notifications/`:** per D-01's minimal-diff instruction, only the `@Module` registration and injected dependency type moved — the controller file itself was not relocated to `notifications-client/`.
- **`notifications.module.ts`'s `providers`/`exports` left untouched:** the extracted `notifications-service` process's own `backend/apps/notifications-service/src/app.module.ts` imports `NotificationsModule` directly (confirmed by reading that file before editing) for its own `NotificationsGrpcController` — removing `providers: [NotificationsService]` would have broken that separate, untouched bootstrap tree.
- **No controller-level try/catch for D-06's 503 propagation:** `ServiceUnavailableException` thrown by `NotificationsClientService` bubbles through NestJS's exception layer automatically, matching every other controller's convention in this codebase — no code change was needed beyond the injection swap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no `node_modules` or generated Prisma client**
- **Found during:** pre-task setup, before Task 1's grep commands
- **Issue:** This worktree was never `npm install`-ed (same as Plan 17-03's worktree — each parallel worktree needs its own independent install).
- **Fix:** Ran `npm install` from the worktree root and `npm run prisma:generate`.
- **Files modified:** None (only `node_modules/`, not tracked in git)
- **Verification:** `cd backend && npm run build` compiled cleanly after the install.

**2. [Rule 1 - Bug] Plan's task text under-counted the raw GRPC-04 grep result**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 `<action>` states the `grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" | grep -v ".spec.ts"` command returns "exactly 3 results". Running it for real returns 35 lines (imports, comments, class self-references, `@GrpcMethod('NotificationsService', ...)` decorator string literals, etc.) — the plan's named line numbers (11, 54, 8) correctly identify the 3 actual constructor-injection sites, but the raw line count claim is inaccurate for this codebase's actual content.
- **Fix:** The audit documents this discrepancy transparently (see `17-CALLER-GRAPH-AUDIT.md` §1) — confirms all 3 named line numbers are correct while noting the raw grep returns 35 lines total, explaining what the other 32 lines are.
- **Files modified:** `.planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-CALLER-GRAPH-AUDIT.md` only (documentation, no code change)
- **Verification:** All 3 named line numbers (`notifications.controller.ts:11`, `tour-notifications.service.ts:54`, `notifications-grpc.controller.ts:8`) confirmed present exactly as stated.

**3. [Rule 1 - Bug] Task 3's acceptance-criteria grep (`grep -c "NotificationsService'" ...spec.ts`) returns 1, not 0**
- **Found during:** Task 3 post-edit verification
- **Issue:** The plan's acceptance criteria expects this grep to return 0 "so `NotificationsClientService` substring matches are excluded." In practice the 1 remaining match is neither an import nor a `NotificationsClientService` substring — it's the `describe('TourNotificationsService', () => {` string, which the plan's grep pattern didn't anticipate excluding (its own class name substring-matches the pattern).
- **Fix:** Confirmed via targeted greps that no legacy `NotificationsService` import path or `{ provide: NotificationsService, ... }` provider token remains anywhere in the spec file — the sole match is the unrelated `TourNotificationsService` describe-block string. No code change needed; documented here for transparency.
- **Files modified:** None
- **Verification:** `grep -n "from '../../notifications/notifications.service'\|NotificationsService," backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` returns zero matches; full spec run (10/10 passing) confirms the mock wiring is correct.

---

**Total deviations:** 3 (1 Rule 3 — environment setup, pre-existing across all fresh worktrees this phase; 2 Rule 1 — minor plan-text/actual-grep-output discrepancies, both resolved by documenting the real result rather than by changing code)
**Impact on plan:** None on scope or behavior — all three deviations were either environment setup or grep-count discrepancies fully explained by the codebase's actual content (comments, class self-references, decorator string literals). No files outside the plan's declared `files_modified` were touched except the audit doc itself.

## Issues Encountered

None beyond the three deviations documented above.

## User Setup Required

None — no external service configuration required. `NOTIFICATIONS_SERVICE_URL` was already present in `.env.example` since Phase 10 (reused by Plan 17-03).

## Next Phase Readiness

- `notifications-service` is now a genuinely live-consumed gRPC service — both confirmed monolith call sites route through `NotificationsClientService` → `ClientGrpc` → the extracted process.
- Zero remaining in-process direct injections of `NotificationsService` anywhere in the monolith's own bootstrap tree; only the extracted process's own `notifications-grpc.controller.ts` still references it (by design — that IS its server-side implementation).
- Manual REST response-shape diff for `/notifications/*` pre/post cutover is explicitly deferred to Plan 17-06's checkpoint per this plan's `<verification>` section — not performed here.
- Plan 17-05/17-06 should be aware that `notifications-service` must actually be running (listening on `NOTIFICATIONS_SERVICE_URL`, default `localhost:5008`) for the monolith's `/notifications/*` REST endpoints and `TourNotificationsService`'s crons to succeed at runtime — this plan only wires the client side; the extracted process's own deployment/runtime verification is out of this plan's scope.

---
*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Completed: 2026-07-19*
