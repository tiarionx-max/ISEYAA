---
phase: 09-tour-packages-tour-guides
plan: 04
subsystem: tour-packages
tags: [backend, nestjs, prisma, ai-bridge, sc5]
dependency_graph:
  requires:
    - 09-01 (schema: TourPackage model with nullable tourGuideId + lgaId, TourPackageCategory + TourPackageStatus enums, DB CHECK on settlementSplit sum)
    - 09-02 (no direct imports; ReferenceService not needed for TourPackage slug)
  provides:
    - TourPackageService.findByIdInternal — consumed by 09-05 TourBookingService
    - POST /tour-packages/from-ai-suggestion — consumed by 09-09 Task 4 (Save-as-bookable CTA)
    - GET /tour-packages — consumed by 09-09 web/mobile search surfaces
    - GET /admin/tour-packages/queue + POST /:id/decide — consumed by 09-10 admin UI
  affects:
    - backend/src/common/enums/user-role.enum.ts (added TOUR_GUIDE to TS enum mirror of Prisma)
    - backend/src/app.module.ts (registered TourPackagesModule)
tech-stack:
  added: []
  patterns:
    - Split-controller (public + admin) — mirrors marketplace.controller.ts
    - Two create paths (standard guarded + AI bridge unguarded) — bypassed guards explicitly documented
    - Public list unconditionally filters status=APPROVED to gate visibility
key-files:
  created:
    - backend/src/modules/tour-packages/dto/create-tour-package.dto.ts
    - backend/src/modules/tour-packages/dto/update-tour-package.dto.ts
    - backend/src/modules/tour-packages/dto/admin-decide-package.dto.ts
    - backend/src/modules/tour-packages/dto/create-from-ai-suggestion.dto.ts
    - backend/src/modules/tour-packages/tour-packages.service.ts
    - backend/src/modules/tour-packages/tour-packages.controller.ts
    - backend/src/modules/tour-packages/tour-packages.module.ts
    - backend/src/modules/tour-packages/__tests__/tour-packages.service.spec.ts
  modified:
    - backend/src/common/enums/user-role.enum.ts
    - backend/src/app.module.ts
decisions:
  - "TourPackageService queries prisma.tourGuide directly instead of injecting TourGuideService — avoids cross-wave coupling to 09-03 (parallel). Identical semantics; orchestrator merge can refactor."
  - "submitForReview's claim-first guard runs BEFORE ownership check so AI-source owners get a useful error rather than generic 'Not your package'."
  - "ATTRACTION vendorType validates only that the attraction row exists — does NOT require a Wallet row. Per CONTEXT §Specifics, attraction commissions route to PlatformConfig 'tour.government_wallet_user_id' at booking time (09-06)."
  - "Edit lifecycle v1: APPROVED edits return 409 ('clone deferred'); PENDING/REJECTED edits revert to DRAFT."
metrics:
  duration_minutes: 35
  completed: "2026-06-24"
requirements_closed:
  - TOUR-02 (TourPackage CRUD)
  - TOUR-03 (search/filter half)
  - TOUR-08 (admin queue, partial — web admin UI lives in 09-10)
plan_check_addressed:
  - M1 (Save as bookable backend bridge)
---

# Phase 9 Plan 04: Tour Packages Summary

Backend TourPackage CRUD + listing + admin approval + AI-suggestion DRAFT bridge — closing TOUR-02 + TOUR-03 (search/filter half) + TOUR-08 (admin queue) and the backend half of PLAN-CHECK M1 (SC5 "Save as bookable").

## Endpoints

### Public + guide routes (`TourPackagesController`)

| Method | Path | Guards | Purpose |
| ------ | ---- | ------ | ------- |
| GET    | `/tour-packages`                       | (public)                              | List APPROVED packages — filter by category, lgaId, tourGuideId, q, page, limit |
| GET    | `/tour-packages/me`                    | JwtAuthGuard                          | Own packages (guide-authored + AI-seeded DRAFTs by `metadata.aiSourceUserId`) |
| GET    | `/tour-packages/:slug`                 | (public)                              | APPROVED detail by slug, hydrates attractions/property/events |
| POST   | `/tour-packages`                       | JwtAuthGuard + Roles(TOUR_GUIDE)      | Standard create — 8 guards |
| POST   | `/tour-packages/from-ai-suggestion`    | JwtAuthGuard only                     | AI bridge (any auth user, incl. TOURIST) |
| PATCH  | `/tour-packages/:id`                   | JwtAuthGuard + Roles(TOUR_GUIDE)      | Update; APPROVED → 409; PENDING/REJECTED reverts to DRAFT |
| POST   | `/tour-packages/:id/submit`            | JwtAuthGuard + Roles(TOUR_GUIDE)      | DRAFT/REJECTED → PENDING (gated: tourGuideId + lgaId must be populated) |
| DELETE | `/tour-packages/:id`                   | JwtAuthGuard + Roles(TOUR_GUIDE)      | Soft-delete own non-APPROVED |

### Admin routes (`TourPackagesAdminController`)

| Method | Path | Guards | Purpose |
| ------ | ---- | ------ | ------- |
| GET    | `/admin/tour-packages/queue`           | LGA_ADMIN / STATE_ADMIN / SUPER_ADMIN | PENDING queue paginated |
| POST   | `/admin/tour-packages/:id/decide`      | LGA_ADMIN / STATE_ADMIN / SUPER_ADMIN | Approve or reject; writes `metadata.adminDecision` |

## 8 service-side validation guards (standard `create` path only)

1. **Guide must exist + be APPROVED + owned by actor** — direct `prisma.tourGuide.findFirst` lookup; throws `NotFound` / `Forbidden`.
2. **At least 1 attraction; all attractionIds resolve to non-deleted rows** — `BadRequest` with the missing IDs.
3. **Optional propertyId resolves** to a non-deleted Property row.
4. **Optional eventIds resolve** to non-deleted Event rows.
5. **settlementSplit sum ≤ 100** — service-layer first line of defence; DB CHECK from 09-01 is the second line.
6. **Each settlementSplit `vendorId` resolves per vendorType**:
   - `GUIDE` → TourGuide row exists.
   - `HOST` → Property row exists AND has `hostId` AND that user has a `Wallet`.
   - `ORGANISER` → Event row exists AND `organizerId` has a `Wallet`.
   - `ATTRACTION` → Attraction row exists. **Wallet NOT required** — commission routes to `tour.government_wallet_user_id` PlatformConfig at booking time (09-06). Documented in CONTEXT §Specifics.
7. **category enum** — DTO-enforced via `@IsEnum(TourPackageCategory)`.
8. **itineraryTemplate ascending by hour** — cross-field check after DTO shape validation.

## Edit lifecycle (v1 — clone deferred)

| Current status | Edit allowed? | Effect |
| -------------- | ------------- | ------ |
| `DRAFT`        | yes | Updates in place; stays DRAFT |
| `PENDING`      | yes | Reverts to DRAFT (guide must explicitly re-submit) |
| `REJECTED`     | yes | Reverts to DRAFT |
| `APPROVED`     | **no** | 409 ConflictException — "clone it to create a new version (versioning is a deferred feature)" |

## AI bridge contract (`POST /tour-packages/from-ai-suggestion`)

- **Auth:** `JwtAuthGuard` only — any authenticated user (incl. `TOURIST` without guide profile).
- **Bypasses ALL 8 standard-create guards** — by definition there is no guide / attraction / split to validate yet.
- **Created row shape:**
  - `status = 'DRAFT'`
  - `tourGuideId = null` (nullable per 09-01 schema)
  - `lgaId = null` (nullable per 09-01 schema)
  - `settlementSplit = []` (sum = 0, satisfies DB CHECK)
  - `attractionIds = []`, `eventIds = []`, `propertyId = null`
  - `price = 0`, `durationHours = 1`, `maxGroupSize = 1` (placeholder mins)
  - `category = 'CULTURAL'` (default; guide changes on claim)
  - `itineraryTemplate = [{ hour: 0, title: 'AI suggestion', description: dto.suggestedItinerary }]`
  - `slug = ${slugify(title)}-ai-${uuidv4().slice(0,8)}` — the `-ai-` segment distinguishes AI seeds at a glance
  - `metadata = { source: 'ai-suggestion', aiSourceConversationId, aiSourceUserId, createdAt }`
- **Invisible to public search:** `findAll` unconditionally filters `status=APPROVED`, so AI-seeded DRAFTs do NOT appear in `GET /tour-packages` until an APPROVED guide claims and admin approves them. Verified by spec #11.
- **Visible to owner:** `findOwn(userId)` includes packages where `metadata.aiSourceUserId === userId` so the user sees their AI seeds in "My drafts".
- **Status-transition gate:** `submitForReview` rejects with `BadRequestException('claim the AI draft first')` if `tourGuideId` or `lgaId` is null — guide must populate both via a future claim/edit flow before DRAFT → PENDING.

## Schema dependency on 09-01

Confirmed at execute time:
- `TourPackage.tourGuideId` is `String?` (nullable) — schema lines 935-938
- `TourPackage.lgaId` is `String?` (nullable) — schema lines 932-936
- DB CHECK constraint on `settlementSplit` sum from 09-01 migration is still active.

If 09-01 had marked these as non-null, this plan would have required a schema patch first. M1 revision already locked nullability before execute — verified before any code was written.

## Internal contract for 09-05

`TourPackageService.findByIdInternal(id)` returns the minimal projection (id, slug, status, tourGuideId, price, durationHours, maxGroupSize, attractionIds, propertyId, eventIds, itineraryTemplate, settlementSplit, name) that `TourBookingService` (09-05) needs for booking validation and snapshotting. The service is exported from `TourPackagesModule` so 09-05 can import it.

## app.module.ts patch

```diff
 import { TourismModule } from './modules/tourism/tourism.module';
+import { TourPackagesModule } from './modules/tour-packages/tour-packages.module';
...
     TourismModule,
+    TourPackagesModule,
     EventsModule,
```

One import + one array entry. Per orchestrator note, no anticipation of 09-03's `TourGuidesModule` lines — that's 09-03's add.

## Spec coverage (16 scenarios)

| # | Path | Scenario |
| - | ---- | -------- |
| 1 | create | happy path — APPROVED guide creates DRAFT with correct slug + nullable-friendly defaults |
| 2 | create | ForbiddenException when guide.status !== APPROVED |
| 3 | create | ForbiddenException when guide.userId !== actorUserId |
| 3a | create | NotFoundException when tourGuideId does not resolve |
| 4 | create | BadRequestException when an attractionId is unknown |
| 5 | create | BadRequestException when settlementSplit sum > 100 |
| 6 | create | BadRequestException when HOST vendorId's property has no host wallet |
| 7 | create | BadRequestException when itineraryTemplate is not ascending by hour |
| 8 | update | ConflictException when package.status === APPROVED (edit blocked) |
| 9 | update | status reverts to DRAFT when editing a PENDING package |
| 9b | update | status reverts to DRAFT when editing a REJECTED package |
| 10a | adminDecide | sets status + writes adminDecision metadata when PENDING |
| 10b | adminDecide | ConflictException when status !== PENDING |
| 11 | findAll | unconditionally filters status=APPROVED — AI DRAFTs MUST NOT appear (regression guard) |
| 12 | createFromAiSuggestion | happy path — null guide/lga, empty split, slug has `-ai-`, metadata.source='ai-suggestion', APPROVED-guide guard NOT called |
| 12b | submitForReview | rejects AI DRAFT with tourGuideId/lgaId still null — "claim the AI draft first" |

Total: **16/16 pass**. Full backend suite: **307/307 pass** (1 pre-existing 09-02 spec suite fails compile due to `@aws-sdk/s3-request-presigner` not yet npm-installed — out of scope).

## Deviations from Plan

### [Rule 3 - Blocking] Replaced TourGuideService injection with direct prisma query

- **Found during:** Task 2 (service implementation)
- **Issue:** Plan instructs `inject TourGuideService` from 09-03 (`tour-guides.module.ts`) for the APPROVED-guide guard. 09-03 is a parallel Wave-2 plan that has NOT yet landed in the worktree — importing its service would cause `Cannot find module './tour-guides/tour-guides.service'` and prevent compilation.
- **Fix:** Service queries `prisma.tourGuide.findFirst({ where: { id, deletedAt: null }, select: { id, userId, status } })` directly. Identical semantics — the guard still throws `Forbidden` for non-APPROVED guides and ownership mismatches. `TourPackagesModule` does NOT import `TourGuidesModule`.
- **Files modified:** `backend/src/modules/tour-packages/tour-packages.service.ts`, `tour-packages.module.ts`
- **Trade-off:** If a future operator wants `TourGuideService.findByIdInternal` as the single source of truth (e.g., to add an in-process cache later), an orchestrator merge after 09-03 lands can swap the prisma call to inject `TourGuideService`. Low-risk refactor — same return shape.

### [Rule 2 - Missing critical functionality] Added UserRole.TOUR_GUIDE to TypeScript enum

- **Found during:** Task 3 (controller authoring)
- **Issue:** `backend/src/common/enums/user-role.enum.ts` does NOT contain `TOUR_GUIDE` — only the Prisma enum had it (09-01 schema line 24). The `@Roles(UserRole.TOUR_GUIDE)` decorator in the new controller would not compile.
- **Fix:** Added `TOUR_GUIDE = 'TOUR_GUIDE'` between `CREATIVE` and `LGA_ADMIN` in the TS enum. This is required for any `@Roles(UserRole.TOUR_GUIDE)` usage and mirrors the additive Prisma enum extension already in production schema.
- **Files modified:** `backend/src/common/enums/user-role.enum.ts`
- **Commit:** `4fa135b`

### [Rule 1 - Bug] Reordered submitForReview guards (caught by spec #12b)

- **Found during:** Task 3 (spec run)
- **Issue:** Originally checked ownership BEFORE the claim-first guard. An AI-source owner submitting an unclaimed AI DRAFT got a generic "Not your package" error because `pkg.tourGuideId` was null → `prisma.tourGuide.findUnique` returned null → ownership check failed first.
- **Fix:** Moved the null-tourGuideId/lgaId guard ahead of the ownership lookup so AI-source owners get the actionable "claim the AI draft first" message.
- **Files modified:** `backend/src/modules/tour-packages/tour-packages.service.ts`
- **Commit:** `31791fe`

## Authentication gates

None encountered.

## Known Stubs

None. All stubbed values in AI DRAFT (price=0, durationHours=1, maxGroupSize=1, category='CULTURAL', empty arrays) are explicitly documented placeholders — a guide must overwrite them via PATCH before status can transition past DRAFT (gated by `submitForReview`).

## Self-Check: PASSED

### Created files

```
FOUND: backend/src/modules/tour-packages/dto/create-tour-package.dto.ts
FOUND: backend/src/modules/tour-packages/dto/update-tour-package.dto.ts
FOUND: backend/src/modules/tour-packages/dto/admin-decide-package.dto.ts
FOUND: backend/src/modules/tour-packages/dto/create-from-ai-suggestion.dto.ts
FOUND: backend/src/modules/tour-packages/tour-packages.service.ts
FOUND: backend/src/modules/tour-packages/tour-packages.controller.ts
FOUND: backend/src/modules/tour-packages/tour-packages.module.ts
FOUND: backend/src/modules/tour-packages/__tests__/tour-packages.service.spec.ts
```

### Commits

```
FOUND: a094617 — feat(09-04): add TourPackage DTOs
FOUND: 4fa135b — feat(09-04): add TourPackageService + module
FOUND: 31791fe — feat(09-04): add controllers + spec + AppModule
```

### Truths verified

- `grep "TourPackagesModule" backend/src/app.module.ts` → 2 matches (import + array) ✓
- `grep "status: 'APPROVED'" backend/src/modules/tour-packages/tour-packages.service.ts` → 2 (findAll + findBySlug) ✓
- `grep "from-ai-suggestion" backend/src/modules/tour-packages/tour-packages.controller.ts` → 3 (import, route comment, @Post) ✓
- `grep "createFromAiSuggestion" backend/src/modules/tour-packages/tour-packages.service.ts` → 3 ✓
- `findByIdInternal` exported via `TourPackagesModule.exports` ✓
- `npx tsc --noEmit` errors = 2 (both pre-existing 09-02 `@aws-sdk/s3-request-presigner`; introduced 0 new tsc errors) ✓
- `npx jest src/modules/tour-packages` → 16/16 pass ✓
- Full backend suite → 307/307 tests pass (1 pre-existing suite compile failure unrelated to 09-04) ✓
