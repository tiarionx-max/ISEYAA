---
phase: 22-scheduled-ministry-exports-lga-heatmap
plan: 02
subsystem: api
tags: [nestjs, prisma, class-validator, rbac, ministry-export]

# Dependency graph
requires:
  - phase: 22-scheduled-ministry-exports-lga-heatmap
    provides: MinistryExportSubscription Prisma model + ExportCadence/ExportDeliveryStatus enums (plan 22-01)
provides:
  - SUPER_ADMIN-gated CRUD REST routes under /admin/ministry-export-subscriptions (GET/POST/PATCH/DELETE)
  - MinistryExportSubscriptionService with in-place update semantics
  - CreateExportSubscriptionDto/UpdateExportSubscriptionDto with DTO-boundary email validation
affects: [22-03-scheduler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SUPER_ADMIN-only CRUD as its own dedicated controller class, never merged into a read-only dashboard controller (mirrors AdminController's settlement-splits precedent, D-10)"
    - "findOne() reused as the single existence-check chokepoint for both update() and remove() (DRY 404 handling)"

key-files:
  created:
    - backend/src/modules/ministry/dto/create-export-subscription.dto.ts
    - backend/src/modules/ministry/dto/update-export-subscription.dto.ts
    - backend/src/modules/ministry/ministry-export-subscription.service.ts
    - backend/src/modules/ministry/ministry-export-subscription.controller.ts
    - backend/src/modules/ministry/__tests__/ministry-export-subscription.service.spec.ts
    - backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts
  modified:
    - backend/src/modules/ministry/ministry.module.ts

key-decisions:
  - "update()/remove() are plain in-place prisma.ministryExportSubscription.update()/delete() calls, NOT the $transaction insert-new-row/deactivate-old audit-trail pattern used by SettlementSplitTier — per CONTEXT.md, lastSentAt/lastStatus/lastError are operational fields, not audit-trail-versioned"
  - "MinistryExportSubscriptionController is its own controller class under a SUPER_ADMIN-only @Roles(), never added to the existing read-only MinistryController — preserves the MIN-01 invariant that MinistryController never gains a mutation handler"

patterns-established:
  - "Pattern: update()/remove() call findOne(id) first to get both the 404 check and reuse the same NotFoundException message, rather than duplicating a findUnique+throw pair per method"

requirements-completed: [MIN-08b]

# Metrics
duration: ~35min
completed: 2026-07-21
---

# Phase 22 Plan 02: Ministry Export Subscription CRUD Summary

**SUPER_ADMIN-only backend CRUD (`GET`/`POST`/`PATCH`/`DELETE`) for `MinistryExportSubscription` under `/admin/ministry-export-subscriptions`, with DTO-boundary email validation and no web UI — satisfying MIN-08b's "recipient list + cadence configurable via the database, no redeploy required."**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-21T13:11:00Z (approx, worktree base commit `43ebc27`)
- **Completed:** 2026-07-21T13:46:00Z
- **Tasks:** 3 completed (Tasks 2 and 3 were TDD: RED + GREEN each)
- **Files modified:** 7 (4 created source files, 2 created spec files, 1 modified module file)

## Accomplishments
- `CreateExportSubscriptionDto`/`UpdateExportSubscriptionDto` reject malformed emails at the API boundary before any value reaches Prisma (`@IsEmail({}, {each:true})`), mirroring `UpdateSplitTierDto`'s all-optional PATCH shape for the update variant
- `MinistryExportSubscriptionService` implements full CRUD against `prisma.ministryExportSubscription` with a single `findOne()` chokepoint reused by `update()`/`remove()` for existence checking — 9 passing tests
- `MinistryExportSubscriptionController` exposes `GET/POST/PATCH/DELETE /admin/ministry-export-subscriptions`, `SUPER_ADMIN`-only, Swagger-visible via `@ApiOperation` on every route — 20 passing tests (RBAC gating against all 12 roles, DTO validation, route delegation)
- `ministry.module.ts` registers the new controller/service; `MinistryController`/`MinistryService` confirmed byte-for-byte untouched (`git diff --stat` returns empty)
- Full backend suite: 74 suites / 791 tests passing after this plan's changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CreateExportSubscriptionDto + UpdateExportSubscriptionDto** - `97d7803` (feat)
2. **Task 2: MinistryExportSubscriptionService — CRUD against prisma.ministryExportSubscription** - `ccd5a5c` (test, RED) + `c67f530` (feat, GREEN)
3. **Task 3: MinistryExportSubscriptionController + ministry.module.ts wiring** - `a3d1937` (test, RED) + `d35eb6a` (feat, GREEN)

**Plan metadata:** committed separately (see final commit in this worktree)

_Note: Tasks 2 and 3 were TDD — each has a RED (failing test) then GREEN (implementation) commit pair, per the plan's `tdd="true"` marker._

## Files Created/Modified
- `backend/src/modules/ministry/dto/create-export-subscription.dto.ts` - `recipients`/`cadence`/`isActive` validation, `@IsEmail({}, {each:true})` + `@IsEnum(ExportCadence)`
- `backend/src/modules/ministry/dto/update-export-subscription.dto.ts` - Same 3 fields, all `@IsOptional()`, mirroring `UpdateSplitTierDto`'s PATCH shape
- `backend/src/modules/ministry/ministry-export-subscription.service.ts` - `list()`/`create()`/`findOne()`/`update()`/`remove()` against `prisma.ministryExportSubscription`
- `backend/src/modules/ministry/ministry-export-subscription.controller.ts` - `SUPER_ADMIN`-gated CRUD routes under `/admin/ministry-export-subscriptions`
- `backend/src/modules/ministry/ministry.module.ts` - Registers `MinistryExportSubscriptionController`/`MinistryExportSubscriptionService` alongside the pre-existing `MinistryController`/`MinistryService`
- `backend/src/modules/ministry/__tests__/ministry-export-subscription.service.spec.ts` - 9 tests covering all 5 service methods including 404 paths
- `backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts` - 20 tests: RBAC gating (SUPER_ADMIN allowed, all 11 other roles + unauthenticated denied), DTO validation, route delegation

## Decisions Made
- Followed the plan's `<interfaces>` block verbatim for the Prisma-consuming service signature and controller route shape — no interface deviations
- Kept the controller's D-10 explanatory comment free of the literal string `MINISTRY_VIEWER` (reworded to "broader read role set") to satisfy the plan's own acceptance-criteria grep check that no weaker role string ever appears in this file, even in a comment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing worktree dependencies (node_modules) and regenerated Prisma Client**
- **Found during:** Task 1 (running `npx tsc --noEmit`)
- **Issue:** Fresh git worktree had no `node_modules` in `backend/` or repo root (same pre-existing condition documented in 22-01's SUMMARY, since worktrees don't inherit `node_modules`), and the previously-generated Prisma Client (from 22-01's own separate worktree) was not present in this worktree either, so `ministryExportSubscription` was absent from the generated types
- **Fix:** Ran `npm ci --workspace=backend --include-workspace-root` to materialize `node_modules` per the committed `package-lock.json`, then `npx prisma generate` to regenerate the Prisma Client against the already-migrated schema (schema/migration themselves come from 22-01, not modified by this plan)
- **Files modified:** None (node_modules and generated client are gitignored, not committed)
- **Verification:** `npx tsc --noEmit -p tsconfig.json` exits 0; `ministryExportSubscription` delegate resolves correctly in service/controller code and tests
- **Committed in:** N/A (no source changes; environment setup only)

**2. [Rule 3 - Blocking] Created local `backend/.env` for Prisma CLI**
- **Found during:** Task 1 (running `npx prisma generate`)
- **Issue:** Same as 22-01 — the Prisma CLI needs `backend/.env` (not just the NestJS-resolved root `.env`) to load `DATABASE_URL`/`DIRECT_URL`
- **Fix:** Copied the main checkout's root `.env` to `backend/.env` in this worktree
- **Files modified:** `backend/.env` (gitignored, not committed — confirmed via `git check-ignore -v`)
- **Verification:** `npx prisma generate` succeeds against the local Docker Postgres instance
- **Committed in:** N/A (gitignored local environment file, not committed)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking environment setup issues specific to this fresh worktree checkout; no source-code or DTO/service/controller-level deviations from the plan)
**Impact on plan:** Zero impact on scope or deliverables — both fixes were prerequisite tooling/environment setup identical in nature to 22-01's own documented deviations. No scope creep.

## Issues Encountered
- The plan's own acceptance-criteria grep counts had two off-by-one authoring quirks discovered during verification (not code defects — both traced back to the plan's precedent files exhibiting the identical count):
  1. `grep -c "IsOptional" update-export-subscription.dto.ts` returns 4 (1 import line + 3 decorator usages), not the plan's stated 3 — the precedent file `update-split-tier.dto.ts` the plan explicitly asked to mirror also grep-counts 4 for the same reason.
  2. `grep -c "NotFoundException" ministry-export-subscription.service.ts` returns 2 (1 import + 1 throw in `findOne()`), not the plan's stated "3 or more" — `update()`/`remove()` correctly reuse `findOne()`'s single throw site rather than duplicating a second explicit throw, exactly as the plan's own `<action>` text specifies ("call `findOne(id)` first to get the existing-row 404 check").
  Both are treated as plan-authoring imprecision rather than implementation gaps, since the code matches every literal instruction in each task's `<action>` and `<behavior>` blocks and mirrors the cited precedent files exactly.

## User Setup Required

None - no external service configuration required. Routes are Swagger-visible and callable via Postman/curl only per D-09 (no web UI this phase).

## Next Phase Readiness
- `MinistryExportSubscriptionController`/`MinistryExportSubscriptionService` are live and registered in `ministry.module.ts`, ready for Plan 22-03's `@Cron` scheduler to read active subscriptions
- No blockers identified for 22-03

---
*Phase: 22-scheduled-ministry-exports-lga-heatmap*
*Completed: 2026-07-21*
