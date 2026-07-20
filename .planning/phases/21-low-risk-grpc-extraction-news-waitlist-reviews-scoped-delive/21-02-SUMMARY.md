---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 02
subsystem: infra
tags: [grpc, nestjs, microservices, news, canary, resilience, tdd]

# Dependency graph
requires:
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    provides: "Working /healthz Terminus endpoint + grpc.health.v1.Health SERVING pattern, notifications-service precedent to mirror"
  - phase: 21-01
    provides: "nest-cli.json project entries and Vendor resilience-type registration for all four Phase 21 gRPC extractions (news, waitlist, reviews, deliveryOtp)"
provides:
  - "backend/apps/news-service: independently-buildable hybrid HTTP+gRPC NestJS app exposing GrpcMethod('NewsService','ListNews') and /healthz"
  - "backend/src/modules/news-client: NewsClientService canary+resilience-wrapped gRPC facade, NewsClientModule registering NewsController"
  - "GET /api/v1/news now served via NewsClientService -> news-service gRPC, with a working canary kill-switch (grpc.news_service.canary_enabled)"
affects: ["21-03 (Waitlist)", "21-04 (Reviews)", "21-05/21-06 (Delivery OTP)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Second application of the D-01/D-02/D-09 hybrid-gRPC-extraction pattern (first: notifications-service in Phase 17/20) — apps/<name>-service scaffold + <name>-client facade module + canary PlatformConfig kill-switch + resilience.execute(vendor, ...) wrap"

key-files:
  created:
    - backend/apps/news-service/src/main.ts
    - backend/apps/news-service/src/app.module.ts
    - backend/apps/news-service/src/health.controller.ts
    - backend/apps/news-service/src/news-grpc.controller.ts
    - backend/apps/news-service/railway.toml
    - backend/apps/news-service/Dockerfile
    - backend/apps/news-service/tsconfig.app.json
    - backend/apps/news-service/src/__tests__/health.controller.spec.ts
    - backend/apps/news-service/src/__tests__/grpc-health.spec.ts
    - backend/src/modules/news-client/news-client.constants.ts
    - backend/src/modules/news-client/news-client.service.ts
    - backend/src/modules/news-client/news-client.module.ts
    - backend/src/modules/news-client/__tests__/news-client.service.spec.ts
  modified:
    - backend/src/modules/news/news.module.ts
    - backend/src/modules/news/news.controller.ts
    - backend/src/app.module.ts

key-decisions:
  - "apps/news-service/src/app.module.ts deliberately omits ScheduleModule.forRoot() — NewsModule/NewsService has zero @Cron providers, unlike Delivery (21-06)"
  - "NewsController stays physically at backend/src/modules/news/news.controller.ts; only its module registration (now NewsClientModule) and injected dependency (NewsClientService in place of NewsService) changed — minimal diff, matching the notifications-service precedent exactly"
  - "news.module.ts keeps providing/exporting NewsService (controllers: []) because apps/news-service's own app.module.ts imports NewsModule wholesale for its in-process NewsGrpcController -> NewsService wiring"

patterns-established: []

requirements-completed: [GRPC-08]

# Metrics
duration: 55min
completed: 2026-07-20
---

# Phase 21 Plan 02: News gRPC Extraction Summary

**News extracted into an independently-deployable hybrid HTTP+gRPC NestJS app (`apps/news-service`), with a canary-gated `NewsClientService` facade routing `GET /api/v1/news` through gRPC — first of the D-05 risk-ascending 4-service rollout (News → Waitlist → Reviews → Delivery OTP).**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-20T22:12:00Z
- **Completed:** 2026-07-20T22:19:35Z
- **Tasks:** 2 completed (Task 2 followed TDD RED/GREEN)
- **Files modified:** 16 (13 created, 3 modified)

## Accomplishments
- `apps/news-service` builds cleanly (`nest build news-service`) and its 2 Wave-0 health tests pass (Terminus `/healthz` + `grpc.health.v1.Health` SERVING)
- `NewsGrpcController.listNews` delegates unmodified to `NewsService.findLatest`, mapping Prisma rows (including `Date.toISOString()` conversion) to the proto `ListNewsResponse` shape
- `NewsClientService` implements the canary-check → `resilience.execute('newsGrpc', ...)` → `ClientGrpc` facade pattern, fully covered by 6 unit tests (gRPC success, category-default, gRPC/resilience failure, canary-off kill-switch, canary-absent/true regression, vendor-key assertion)
- Monolith now routes `GET /api/v1/news` through `NewsClientModule` instead of the old in-process `NewsModule`; `backend/src/app.module.ts` no longer imports `NewsModule` directly
- `cd backend && npx tsc --noEmit -p tsconfig.json` passes cleanly after the wiring change

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold apps/news-service (hybrid HTTP+gRPC app)** - `3deab40` (feat)
2. **Task 2 (RED): failing test for NewsClientService** - `fdfe8cb` (test)
2. **Task 2 (GREEN): NewsClientService + monolith wiring** - `a48bb80` (feat)

_Note: Task 2 was `tdd="true"` — RED and GREEN landed as separate commits per the TDD execution protocol. No REFACTOR commit was needed (implementation matched the target shape on first pass)._

## Files Created/Modified
- `backend/apps/news-service/src/main.ts` - Hybrid bootstrap: gRPC on `0.0.0.0:5009` (`news` + `grpc.health.v1` packages), HTTP healthz on `process.env.PORT ?? 8080`
- `backend/apps/news-service/src/app.module.ts` - Imports `NewsModule` (via relative `../../../src/...` path) + Prisma/Redis/Resilience/DbMetrics/Terminus; deliberately no `ScheduleModule`
- `backend/apps/news-service/src/health.controller.ts` - Verbatim copy of notifications-service's Terminus `/healthz` controller
- `backend/apps/news-service/src/news-grpc.controller.ts` - `@GrpcMethod('NewsService', 'ListNews')` mapping `NewsService.findLatest` rows to proto shape
- `backend/apps/news-service/railway.toml` / `Dockerfile` / `tsconfig.app.json` - Deploy scaffold mirroring notifications-service, service-name-substituted
- `backend/apps/news-service/src/__tests__/health.controller.spec.ts` / `grpc-health.spec.ts` - Wave-0 health harness tests (verbatim, service-name-agnostic)
- `backend/src/modules/news-client/news-client.constants.ts` - Zero-import leaf file: `NEWS_PACKAGE` token
- `backend/src/modules/news-client/news-client.service.ts` - `NewsClientService`: canary check (`grpc.news_service.canary_enabled`) → `resilience.execute('newsGrpc', ...)` → `ClientGrpc.listNews` → returns `res.items`; catches log only `err?.message`
- `backend/src/modules/news-client/news-client.module.ts` - `ClientsModule.registerAsync` for the `news` gRPC package (`NEWS_SERVICE_URL` env, default `localhost:5009`); registers `NewsController`
- `backend/src/modules/news-client/__tests__/news-client.service.spec.ts` - 6 unit tests covering all `<behavior>` bullets from the plan
- `backend/src/modules/news/news.controller.ts` - Constructor now injects `NewsClientService` instead of `NewsService` (field name `news` and call site unchanged)
- `backend/src/modules/news/news.module.ts` - `controllers: []`; still provides/exports `NewsService` for `apps/news-service`'s own wiring
- `backend/src/app.module.ts` - Imports `NewsClientModule` in place of `NewsModule`

## Decisions Made
- Followed the plan's explicit instruction to omit `ScheduleModule.forRoot()` from `apps/news-service/src/app.module.ts` since `NewsModule` has zero `@Cron` providers — this is a deliberate difference from the eventual Delivery OTP extraction (21-06), not an oversight.
- No architectural deviations — plan's task actions were followed as specified, matching the notifications-service precedent byte-for-byte where instructed.

## Deviations from Plan

None - plan executed exactly as written.

One environment-only adjustment (not a code deviation, not tracked under Rules 1-4): this worktree had no `node_modules` installed (git worktrees don't carry `node_modules` since it's gitignored). Symlinked `node_modules`, `backend/node_modules`, `web/node_modules`, `mobile/node_modules`, `shared/node_modules`, and `packages/proto/node_modules` from the main repo checkout to run `nest build`/`jest`/`tsc` verification commands. These symlinks are gitignored and were not committed.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. `NEWS_SERVICE_URL` already exists as a placeholder in `.env.example` (added in an earlier phase); actual Railway deployment of `news-service` and setting the env var on the monolith are deployment-time follow-ups outside this plan's scope.

## Next Phase Readiness
- News is the first of 4 D-05 risk-ascending services landed; the pattern (apps/<name>-service + <name>-client facade + canary flag) is now proven end-to-end for a pure-read, zero-cross-domain-write service.
- 21-03 (Waitlist) and 21-04 (Reviews) can follow this exact shape. 21-05/21-06 (Delivery OTP) will additionally need `ScheduleModule` wiring since Delivery has `@Cron` providers (explicitly called out as a difference in this plan's Task 1 action).
- `grpc.news_service.canary_enabled` PlatformConfig row does not yet exist in the DB — absence defaults to enabled (existing gRPC-calling behavior), consistent with the opt-OUT kill-switch polarity used for `notificationsGrpc`.

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*
