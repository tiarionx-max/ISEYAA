---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 04
subsystem: api
tags: [grpc, nestjs, reviews, prisma, event-emitter, microservices]

# Dependency graph
requires:
  - phase: 21-03
    provides: "waitlist-service hybrid HTTP+gRPC scaffold shape (main.ts/app.module.ts/health.controller.ts/railway.toml/Dockerfile/tsconfig.app.json pattern) that this plan mirrors"
provides:
  - "backend/apps/reviews-service — independently-buildable NestJS hybrid HTTP+gRPC app exposing CreateReview + ListReviews over gRPC :5011 and GET /healthz"
  - "reviews-grpc.controller.ts's ListReviews handler, which bypasses ReviewsService.findByTarget's 50-row REST pagination cap via a direct 1000-row-capped Prisma query"
  - "backend/src/modules/reviews/reviews-admin.module.ts — dedicated module isolating ReviewsAdminController from ReviewsModule's wholesale import into reviews-service"
affects: [21-05, delivery, ministry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid HTTP+gRPC app scaffold (main.ts/app.module.ts/health.controller.ts) mirrored from notifications-service/news-service/waitlist-service, extended with EventEmitterModule.forRoot() when the wholesale-imported feature module carries an @OnEvent listener"
    - "gRPC controller queries Prisma directly (bypassing a REST-facing paginated service method) when the proto contract has no pagination fields — documented with an inline comment distinguishing the gRPC-facing safety cap from the REST-facing page-size cap"
    - "Admin-only controller split into its own module ahead of a feature module's wholesale import into an extracted gRPC service, to prevent unintended HTTP route duplication inside the new process"

key-files:
  created:
    - backend/apps/reviews-service/src/main.ts
    - backend/apps/reviews-service/src/app.module.ts
    - backend/apps/reviews-service/src/health.controller.ts
    - backend/apps/reviews-service/src/reviews-grpc.controller.ts
    - backend/apps/reviews-service/railway.toml
    - backend/apps/reviews-service/Dockerfile
    - backend/apps/reviews-service/tsconfig.app.json
    - backend/apps/reviews-service/src/__tests__/health.controller.spec.ts
    - backend/apps/reviews-service/src/__tests__/grpc-health.spec.ts
    - backend/src/modules/reviews/reviews-admin.module.ts
  modified:
    - backend/src/modules/reviews/reviews.module.ts
    - backend/src/app.module.ts

key-decisions:
  - "EventEmitterModule.forRoot() added to reviews-service's own app.module.ts (a one-off deviation from the notifications-service template) because ReviewsService.onReviewCreated is an @OnEvent('review.created') listener that moves with the wholesale-imported ReviewsModule"
  - "reviews-grpc.controller.ts's ListReviews queries Prisma directly with a 1000-row safety cap instead of calling ReviewsService.findByTarget, which internally caps at 50 rows for REST pagination"
  - "ResolveReviewFlag is NOT implemented in reviews-grpc.controller.ts per D-07 — resolveFlag/getFlagQueue/getFlag stay fully in-process via ReviewsAdminController/ReviewsAdminModule"
  - "ReviewsController remains in ReviewsModule (not yet moved) — Plan 21-05 completes the split by introducing ReviewsClientModule; this plan's scope is limited to landing reviews-service + isolating the admin controller"

requirements-completed: [GRPC-08]

duration: ~35min
completed: 2026-07-20
---

# Phase 21 Plan 04: Reviews gRPC Extraction (Server-Side Scaffold + Admin Module Split) Summary

**Landed `reviews-service` as an independently-buildable NestJS hybrid HTTP+gRPC app (CreateReview + ListReviews only, ResolveReviewFlag deliberately omitted per D-07) and split `ReviewsAdminController` into its own `ReviewsAdminModule` so it is never wholesale-imported into the new gRPC process.**

## Performance

- **Duration:** ~35 min (includes worktree `npm install` recovery — no pre-existing `node_modules` in this worktree)
- **Started:** 2026-07-20T22:39:00Z
- **Completed:** 2026-07-20T22:48:50Z
- **Tasks:** 2
- **Files modified:** 12 (9 created for reviews-service, 1 new admin module, 2 modified)

## Accomplishments

- `backend/apps/reviews-service` builds cleanly (`npx nest build reviews-service` exits 0) and passes its 2 Wave-0 health tests (`grpc.health.v1.Health` SERVING + `GET /healthz`)
- `reviews-grpc.controller.ts` implements exactly `CreateReview` and `ListReviews` — verified absent: `@GrpcMethod('ReviewsService', 'ResolveReviewFlag')`
- `ListReviews` is provably unbounded by the REST-facing 50-row cap — it calls `this.prisma.review.findMany` directly (1000-row safety cap) instead of `ReviewsService.findByTarget`
- `ReviewsAdminController` isolated into a new `ReviewsAdminModule`, importing `ReviewsModule` for `ReviewsService` DI — `GET /admin/reviews/queue`, `GET /admin/reviews/flags/:id`, `POST /admin/reviews/flags/:id/resolve` continue to work unchanged
- Full backend `tsc --noEmit` and `src/modules/reviews` Jest suite (14 tests) pass unaffected — `ReviewsService` itself untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold apps/reviews-service (hybrid HTTP+gRPC app, EventEmitterModule addition, direct-Prisma ListReviews query)** - `8e5dd00` (feat)
2. **Task 2: Split ReviewsAdminController into a new reviews-admin.module.ts** - `09148a6` (refactor)

## Files Created/Modified

- `backend/apps/reviews-service/src/main.ts` - gRPC :5011 + HTTP healthz :8080 bootstrap, `package: ['reviews', 'grpc.health.v1']`
- `backend/apps/reviews-service/src/app.module.ts` - imports `EventEmitterModule.forRoot()` (required for the debounced rating-recompute `@OnEvent` listener carried by `ReviewsModule`), `ReviewsModule` wholesale, `TerminusModule`; omits `ScheduleModule.forRoot()` (zero `@Cron` providers)
- `backend/apps/reviews-service/src/reviews-grpc.controller.ts` - `CreateReview` delegates unmodified to `ReviewsService.createReview`; `ListReviews` queries Prisma directly (`take: 1000`), bypassing `findByTarget`'s 50-row cap
- `backend/apps/reviews-service/src/health.controller.ts` - copied verbatim from waitlist-service
- `backend/apps/reviews-service/railway.toml` / `Dockerfile` / `tsconfig.app.json` - mirrors waitlist-service, substituted for reviews-service (port 5011, `nest build reviews-service`)
- `backend/apps/reviews-service/src/__tests__/health.controller.spec.ts` / `grpc-health.spec.ts` - Wave-0 harness tests, copied verbatim
- `backend/src/modules/reviews/reviews-admin.module.ts` - new module, imports `ReviewsModule`, registers `ReviewsAdminController`
- `backend/src/modules/reviews/reviews.module.ts` - `controllers` now `[ReviewsController]` only (dropped `ReviewsAdminController`)
- `backend/src/app.module.ts` - added `ReviewsAdminModule` import alongside the still-present `ReviewsModule` import

## Decisions Made

- Added `EventEmitterModule.forRoot()` to `reviews-service`'s own `app.module.ts` — a one-off deviation from the `notifications-service` template (which has no `@OnEvent` handlers) required because `ReviewsService.onReviewCreated` is an in-class `@OnEvent('review.created')` listener that moves with the wholesale-imported `ReviewsModule`.
- `reviews-grpc.controller.ts`'s `ListReviews` bypasses `ReviewsService.findByTarget` entirely and queries `this.prisma.review.findMany` directly with an identical where-clause (no broader data exposure) and a 1000-row safety cap, per plan spec and threat register T-21-04-03.
- `ReviewsController` intentionally remains registered in `ReviewsModule` (not yet moved to a client module) — this is the plan's documented staged approach; Plan 21-05 completes the split. `reviews-service`'s wholesale `ReviewsModule` import therefore also carries `ReviewsController`'s JWT-guarded route, which is inert only because no deploy/canary flip occurs before 21-05 empties that controllers array (same hazard class as `21-06`'s `DeliveryGateway` note).

## Deviations from Plan

None - plan executed exactly as written. (One environmental adjustment, not a plan deviation: this worktree had no pre-installed `node_modules`; `npm install --ignore-scripts` + `npx prisma generate` were run to enable building/testing, following the project's standard dependency-install path — no code or plan changes resulted.)

## Issues Encountered

- Initial `npx nest build reviews-service` failed with `npm error could not determine executable to run` — this worktree had zero `node_modules` (not all worktrees pre-install dependencies). Resolved by running `npm install` at the workspace root; the first attempt (`--prefer-offline`) failed mid-install on `grpc-tools`' native postinstall binary download (network/child-process issue), so a second pass with `--ignore-scripts` completed cleanly, followed by `npx prisma generate` (already a required explicit step per the project's Dockerfile pattern, not a deviation from convention).
- One TypeScript error on first build: `reviews-grpc.controller.ts`'s Prisma `where.targetType: data.targetType` (type `string` from the proto) didn't structurally match Prisma's generated `ReviewTargetType` enum filter type. Fixed by casting to `ReviewTargetTypeLiteral` (the same cast pattern already used for the `CreateReview` handler's `targetType` field) — consistent with the codebase's documented `@typescript-eslint/no-explicit-any: off` convention for Prisma filter/DTO casts.

## Next Phase Readiness

- `reviews-service` builds and passes its Wave-0 health tests; ready for Plan 21-05 to add the monolith-side `ReviewsClientModule`/`ReviewsClientService` (photos write-back, user-embed enrichment, in-memory pagination) and complete the controller split by removing `ReviewsController` from `ReviewsModule`.
- `ReviewsAdminController` is cleanly isolated in `ReviewsAdminModule`, confirming it will never be transitively exposed inside the `reviews-service` gRPC process once that service is deployed/canaried.
- No blockers. Reviews is the third of the D-05 risk-ascending 4 services (News → Waitlist → Reviews → Delivery-OTP), landing continues per sequence.

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*
