---
phase: 09-tour-packages-tour-guides
plan: 08
status: DONE
completed_at: 2026-06-24
requirements_closed: [TOUR-07, TOUR-08]
tests_added: 14
tests_total: 390
---

# 09-08 SUMMARY — Reviews Module (TOUR-07 + TOUR-08)

## What was built

Implemented the post-tour reviews system end-to-end:

**Files created:**
- `backend/src/modules/reviews/reviews.controller.ts` — Two controllers (`ReviewsController` + `ReviewsAdminController`)
- `backend/src/modules/reviews/__tests__/reviews.service.spec.ts` — 14 scenarios

**Files modified:**
- `backend/src/app.module.ts` — Added `ReviewsModule` import (after `TourBookingsModule`)

**Pre-existing files (created in 09-01/worktree bootstrap):**
- `backend/src/modules/reviews/dto/create-review.dto.ts`
- `backend/src/modules/reviews/dto/resolve-flag.dto.ts`
- `backend/src/modules/reviews/reviews.service.ts`
- `backend/src/modules/reviews/reviews.module.ts`

## Route surface

| Method | Path | Guard |
|--------|------|-------|
| POST | `/api/v1/reviews` | JwtAuthGuard |
| GET | `/api/v1/reviews?targetType=&targetId=&page=&limit=` | Public |
| GET | `/api/v1/admin/reviews/queue` | JwtAuthGuard + Roles(LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN) |
| GET | `/api/v1/admin/reviews/flags/:id` | JwtAuthGuard + Roles(LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN) |
| POST | `/api/v1/admin/reviews/flags/:id/resolve` | JwtAuthGuard + Roles(LGA_ADMIN, STATE_ADMIN, SUPER_ADMIN) |

## Key design decisions

### Auto-flag atomicity
Rating ≤ 2 → `Review.flagged = true` AND `AdminReviewFlag { status: 'OPEN' }` created in a **single `prisma.$transaction`** callback. If the flag row creation fails, the review row is also rolled back. This prevents orphaned flagged reviews with no corresponding flag queue entry.

### Photo upload flow
Photos arrive as `string[]` of publicUrls from `POST /uploads/presigned` (09-02). The `CreateReviewDto` validates each entry as a URL (`@IsUrl({}, { each: true })`). The endpoint does NOT accept multipart uploads.

### Aggregate rating recompute (debounced)
- `EventEmitter2` emits `review.created` immediately after the transaction commits
- `@OnEvent('review.created')` listener calls `scheduleRecompute()` — an in-memory Map keyed by `${targetType}:${targetId}` coalesces rapid bursts into a single DB round-trip after `RECOMPUTE_DEBOUNCE_MS` (5 000 ms default)
- `recomputeTargetRating()` writes to `TourGuide.rating + reviewCount`, `TourPackage.rating + reviewCount`, or `Property.rating + reviewCount` (VENUE)
- **VENUE / Attraction fallback:** Attraction has no `rating` column in v1 schema. If the VENUE targetId is not a Property, the service logs a `logger.warn()` and no-ops. Follow-up: add `Attraction.rating` in a future phase.

### Cluster-safety caveat
The in-memory debounce Map is **not cluster-safe**. In a multi-pod deployment (Railway scale-out, K8s) each pod holds its own map, so a burst of N reviews spread across N pods triggers N recomputes instead of 1. The stored value remains correct (each recompute reads ALL reviews), but extra DB round-trips are incurred. Cluster-safe alternative: Redis SETEX leader-elect or BullMQ delayed job (deferred to Phase 10+).

### resolveFlag: terminal state guard
`resolveFlag` rejects with 409 ConflictException if the flag is not `OPEN` **or** `IN_REVIEW`. This allows admin review workflows where a flag is first assigned (`IN_REVIEW`) before resolution.

## Test coverage (14 scenarios)

| # | Scenario | Outcome |
|---|----------|---------|
| 1 | Happy path: CHECKED_OUT tour, rating=5 | review created, flagged=false, no AdminReviewFlag, EventEmitter emitted |
| 2 | 3 photo URLs | photos persisted verbatim |
| 3 | rating=2 | flagged=true, AdminReviewFlag(OPEN) created in same tx |
| 4 | rating=1 | same as #3 |
| 5 | rating=3 | flagged=false, no AdminReviewFlag |
| 6 | Actor is not booking owner | ForbiddenException |
| 7 | CONFIRMED booking, tourEnd in future | BadRequestException |
| 8 | GUIDE targetId mismatch | BadRequestException |
| 9 | VENUE targetId not in attractionIds ∪ propertyId | BadRequestException |
| 10 | Duplicate (booking × targetType × targetId) | ConflictException |
| 11 | recomputeTargetRating GUIDE: avg([5,4,3])=4 | tourGuide.update called with rating=4, reviewCount=3 |
| 12 | recomputeTargetRating PACKAGE: avg([4,5])=4.5 | tourPackage.update called with rating=4.5, reviewCount=2 |
| 13 | resolveFlag OPEN → RESOLVED | flag updated, assignedTo set |
| 14 | resolveFlag already RESOLVED | ConflictException |

## Test results

```
PASS src/modules/reviews/__tests__/reviews.service.spec.ts
Tests: 14 passed, 14 total
Full suite: 390 passed (2 pre-existing failures in upload.service + tour-notifications unrelated to this plan)
```

## Follow-ups (M2)

- Add `Attraction.rating` + `Attraction.reviewCount` columns so VENUE recompute covers attraction targets
- Replace in-memory debounce Map with Redis SETEX or BullMQ for cluster-safe coalescing
- Mobile: rating photo upload UI (currently URL-input stub; see 09-PLAN-CHECK SC7 note)
