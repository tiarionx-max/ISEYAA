---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 05
subsystem: api
tags: [grpc, nestjs, reviews, prisma, resilience, microservices]

# Dependency graph
requires:
  - phase: 21-04
    provides: "backend/apps/reviews-service (CreateReview + ListReviews gRPC server, 1000-row safety cap on ListReviews) and reviews-admin.module.ts isolating ReviewsAdminController from the wholesale ReviewsModule import"
provides:
  - "backend/src/modules/reviews-client/ — ReviewsClientService facade preserving the exact pre-extraction REST response shapes for POST /api/v1/reviews and GET /api/v1/reviews, including the photos write-back (CreateReviewRequest proto has no photos field) and the embedded user object + pagination envelope on findByTarget"
  - "ReviewsController now sourced from ReviewsClientModule; ReviewsAdminController remains fully in-process via ReviewsAdminModule (D-07 admin-bypass preserved)"
  - "Recorded D-08 sizing verdict (PASS) gating the in-memory pagination approach before grpc.reviews_service.canary_enabled is ever flipped in any environment"
affects: [21-06, delivery, ministry]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-facade module pattern (mirrors notifications-client/waitlist-client): ClientsModule.registerAsync + ResilienceService.execute wrapper + canary flag pre-check that short-circuits before any gRPC or Prisma call"
    - "Write-side proto-gap compensation: when a proto request message omits a field the REST DTO supports (photos), the facade performs a synchronous Prisma update immediately after gRPC success, before returning the enriched row, so the field is never silently dropped"
    - "Read-side proto-gap compensation: when a proto response message is thinner than the REST response shape (no user embed, no pagination envelope), the facade re-queries Prisma by the returned ids and paginates the enriched result in memory, with the volume tradeoff called out in an inline code comment and gated by a blocking checkpoint task before go-live"

key-files:
  created:
    - backend/src/modules/reviews-client/reviews-client.constants.ts
    - backend/src/modules/reviews-client/reviews-client.service.ts
    - backend/src/modules/reviews-client/reviews-client.module.ts
    - backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts
  modified:
    - backend/src/modules/reviews/reviews.controller.ts
    - backend/src/modules/reviews/reviews.module.ts
    - backend/src/app.module.ts

key-decisions:
  - "createReview's photos write-back (prisma.review.update) runs only when dto.photos has entries, immediately after gRPC success and before the final prisma.review.findUnique refetch, so the returned row's photos field always matches the request exactly"
  - "findByTarget re-queries Prisma with orderBy: { createdAt: 'desc' } directly rather than manually re-sorting the gRPC response array — simpler and matches the pre-extraction sort exactly"
  - "D-08 sizing gate (Task 4) recorded PASS: an operator reviewed real staging/production per-target Review row counts via the plan's specified SQL query and confirmed no realistic P95 latency or truncation risk against the up-to-1000-row-then-in-memory-paginate approach. This verdict clears the code to go live but does NOT itself flip grpc.reviews_service.canary_enabled in any environment — that remains a separate, later operational action outside this plan's scope."

requirements-completed: [GRPC-08]

# Metrics
duration: ~12min (Tasks 1-3, prior agent) + checkpoint resolution (this agent)
completed: 2026-07-20
---

# Phase 21 Plan 05: Reviews gRPC Extraction (Monolith-Side Client Facade + D-08 Sizing Gate) Summary

**Landed `ReviewsClientService`, a monolith-side facade that routes `POST/GET /api/v1/reviews` through the `reviews-service` gRPC hop while preserving byte-for-byte identical REST response shapes — including a write-side photos compensation step and a read-side user-embed + in-memory-pagination compensation step — gated by a recorded D-08 sizing verdict (PASS) before canary go-live.**

## Performance

- **Duration:** Tasks 1-3 executed by a prior agent (~12 min); this continuation agent resolved the Task 4 blocking checkpoint and finalized the plan.
- **Started:** 2026-07-20T22:57:00Z (Task 1 commit)
- **Completed:** 2026-07-20 (Task 4 verdict recorded, self-check appended)
- **Tasks:** 4 (3 code tasks + 1 blocking human-verify checkpoint)
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `ReviewsClientService.createReview()` preserves the exact pre-extraction full-`Review`-row REST shape, including `photos`, despite `CreateReviewRequest`'s proto having no `photos` field — via a conditional `prisma.review.update` write-back before the final `prisma.review.findUnique` refetch
- `ReviewsClientService.findByTarget()` preserves the exact `{data, pagination}` shape with embedded `user {id, firstName, lastName, avatarUrl}` per review, reconstructed from the thinner `ListReviewsResponse` via a follow-up Prisma `findMany` + in-memory pagination, with the D-08 volume tradeoff documented inline in code
- Canary-off (`grpc.reviews_service.canary_enabled === false`) short-circuits both methods to `ServiceUnavailableException` with zero gRPC or Prisma calls
- `ReviewsClientService` has no `resolveFlag`/`getFlagQueue`/`getFlagById` methods — confirmed both structurally (module wiring) and at the test level (explicit `toBeUndefined()` assertions) that those 3 admin operations stay fully in-process via `ReviewsAdminController`/`ReviewsAdminModule` (D-07)
- Full test coverage (9 test cases) for photo write-back ordering, full-row shape, user-embed enrichment, in-memory pagination slicing, canary-off short-circuit (both methods), and the D-07 admin-bypass confirmation
- **D-08 sizing gate (Task 4) resolved: PASS.** An operator reviewed real staging/production per-target `Review` row counts using the plan's specified SQL query (`GROUP BY "targetType", "targetId" ORDER BY count(*) DESC`) and confirmed the highest per-target count poses no realistic risk of P95 latency degradation or silent truncation against the up-to-1000-row-then-in-memory-paginate approach. The verdict clears the code path for go-live; it does not itself flip the canary flag in any environment (a separate, later operational step).

## Task Commits

Each task was committed atomically:

1. **Task 1: reviews-client facade — photos write-back, full-row refetch, user-embed enrichment, in-memory pagination** - `1238451` (feat)
2. **Task 2: Wire the monolith — ReviewsController swaps to ReviewsClientService, finish module split, swap app.module.ts** - `839f584` (feat)
3. **Task 3: reviews-client.service.spec.ts — full test coverage (9 test cases)** - `def2151` (test)
4. **Task 4: D-08 sizing gate — checkpoint:human-verify, gate="blocking"** - no code commit (verification-only task); verdict recorded in this SUMMARY

**Plan metadata:** (this commit) - `docs(21-05): create plan summary`

_Note: This plan paused after Task 3 for the Task 4 blocking checkpoint; a continuation agent resumed after the operator resolved it._

## Files Created/Modified

- `backend/src/modules/reviews-client/reviews-client.constants.ts` - `REVIEWS_PACKAGE` DI token, zero-import leaf file
- `backend/src/modules/reviews-client/reviews-client.service.ts` - `createReview()` (photos write-back + full-row refetch) and `findByTarget()` (user-embed enrichment + in-memory pagination), both canary-gated and routed through `ResilienceService.execute('reviewsGrpc', ...)`
- `backend/src/modules/reviews-client/reviews-client.module.ts` - `ClientsModule.registerAsync` for the `reviews` gRPC package; registers `ReviewsController` only (not `ReviewsAdminController`)
- `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` - 9 test cases covering the full `<behavior>` contract from Task 1, including photo write-back call-order assertion and D-07 admin-bypass confirmation
- `backend/src/modules/reviews/reviews.controller.ts` - `ReviewsController` now injects `ReviewsClientService`; `ReviewsAdminController` unchanged (still injects `ReviewsService` directly)
- `backend/src/modules/reviews/reviews.module.ts` - `controllers` now `[]` (empty); `providers`/`exports` of `ReviewsService` retained for `ReviewsAdminModule` and `apps/reviews-service`'s wholesale import
- `backend/src/app.module.ts` - `ReviewsModule` import replaced with `ReviewsClientModule`; `ReviewsAdminModule` import from 21-04 retained

## Decisions Made

- Photos write-back write (`prisma.review.update`) happens only when `dto.photos` has entries, strictly before the final refetch — verified via `mock.invocationCallOrder` assertion in the test suite, not just by code inspection.
- `findByTarget`'s Prisma re-enrichment re-applies `orderBy: { createdAt: 'desc' }` directly instead of manually re-sorting the gRPC round-trip response, matching the pre-extraction `ReviewsService.findByTarget` sort behavior exactly.
- **D-08 verdict: PASS.** Recorded per the plan's Task 4 `<resume-signal>` contract. Operator confirmed via the specified SQL query against staging/production `Review` row counts (grouped by `targetType`/`targetId`) that no target approaches the 1000-row gRPC server-side cap or poses a realistic P95 latency risk under the in-memory pagination approach. This clears the sizing gate; the actual flip of `grpc.reviews_service.canary_enabled` remains a distinct, later operational action outside this plan's scope, per the checkpoint's explicit instruction.

## Deviations from Plan

None - plan executed exactly as written. Task 4 is a `checkpoint:human-verify gate="blocking"` task by design (not a code task); its resolution (PASS verdict) is documented here per the plan's `<resume-signal>` contract rather than expressed as a git diff.

## Issues Encountered

None. Tasks 1-3 completed cleanly by the prior agent (verified: `tsc --noEmit` exit 0, `jest src/modules/reviews src/modules/reviews-client --silent` — 2 suites / 23 tests passed at that point). This continuation agent re-ran the same self-check after recording the D-08 verdict and confirmed no regression (see Self-Check below).

## User Setup Required

None - no external service configuration required. The D-08 checkpoint required a one-time manual SQL review of production/staging data (completed by the operator, verdict PASS), not ongoing configuration.

## Next Phase Readiness

- Reviews is now fully landed — the third of the D-05 risk-ascending 4 services (News -> Waitlist -> Reviews -> Delivery-OTP). `ReviewsClientModule` (public) and `ReviewsAdminModule` (admin, D-07-isolated) are both wired into `app.module.ts`; no bare `ReviewsModule` import remains.
- D-08's blocking sizing gate is cleared (PASS) — `grpc.reviews_service.canary_enabled` is safe to flip per the runbook whenever the operational rollout is scheduled, but this plan does not perform that flip.
- No blockers for 21-06 (Delivery-OTP, the final service in the D-05 sequence).

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*
