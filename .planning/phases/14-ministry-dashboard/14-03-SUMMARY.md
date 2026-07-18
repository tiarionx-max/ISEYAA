---
phase: 14-ministry-dashboard
plan: 03
subsystem: api
tags: [nestjs, prisma, rbac, queryRaw, ministry-dashboard]

# Dependency graph
requires:
  - phase: 14-01
    provides: "VisitorLog model, VisitorSourceType enum, MINISTRY_VIEWER UserRole value (Prisma schema + common enum)"
provides:
  - "MinistryModule registered in AppModule with GET-only MinistryController"
  - "GET /ministry/visitor-entries — visitor entries by LGA + month, secondary split by User.role"
  - "GET /ministry/purpose-breakdown — purpose-of-visit breakdown by month"
  - "MinistryService.getVisitorEntriesByLgaAndMonth() / getPurposeBreakdown() implementing D-02/D-03/D-04"
  - "MinistryQueryDto (from/to/lgaId optional query params)"
affects: [14-06, 14-07, ministry-dashboard-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MinistryController isolated in its own controller class, never sharing a route with a @Patch/@Post/@Delete handler (MIN-01 structural constraint)"
    - "Prisma.sql/Prisma.empty tagged-template conditional fragments for optional from/to/lgaId filters — no string-concatenated SQL"

key-files:
  created:
    - backend/src/modules/ministry/ministry.module.ts
    - backend/src/modules/ministry/ministry.controller.ts
    - backend/src/modules/ministry/ministry.service.ts
    - backend/src/modules/ministry/dto/ministry-query.dto.ts
    - backend/src/modules/ministry/__tests__/ministry.service.spec.ts
    - backend/src/modules/ministry/__tests__/ministry.controller.spec.ts
  modified:
    - backend/src/app.module.ts

key-decisions:
  - "Both query methods implement D-02's status-aware filter via LEFT JOIN to bookings/tour_bookings only (EVENT sourceType rows are never excluded by a status join, per D-02's exception — the VisitorLog write only happens at a real physical QR-scan moment)"
  - "MinistryController carries zero @Patch/@Post/@Delete handlers and never will (MIN-01) — proven by an automated test asserting METHOD_METADATA === RequestMethod.GET on every prototype method, not just manual review"

patterns-established:
  - "Ministry read-surface query pattern: private buildFilters() helper returns Prisma.Sql fragments (or Prisma.empty) for from/to/lgaId, reused across both aggregate queries"

requirements-completed: [MIN-01, MIN-02, MIN-03]

# Metrics
duration: 14min
completed: 2026-07-18
---

# Phase 14 Plan 03: Ministry Dashboard Read Surface Summary

**MinistryModule with GET-only `MinistryController` (own class, RBAC-gated to MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN) and `MinistryService` implementing D-02/D-03/D-04 visitor-entry and purpose-of-visit aggregate queries via parameterized `Prisma.sql` tagged templates.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-18T01:04:34-05:00 (base commit)
- **Completed:** 2026-07-18T01:14:02-05:00
- **Tasks:** 2/2 completed
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `MinistryModule` registered in `AppModule`, reachable at `/api/v1/ministry/*`
- `GET /ministry/visitor-entries` — visitor entries grouped by `lgaId`/`lgaName`/month (`YYYY-MM`)/`userRole`, filtered by D-02's status-aware rule (STAY/TOUR sourceType rows excluded when the joined `Booking`/`TourBooking` status is `CANCELLED`/`REFUNDED`; EVENT rows never excluded)
- `GET /ministry/purpose-breakdown` — same filter rule, grouped by `purpose`/month
- `MinistryController` isolated in its own class with class-level `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)`, zero mutation routes — structurally satisfies MIN-01
- 23 automated tests: query-correctness (count coercion, SQL-shape assertions, parameterized filter behavior) + RBAC (3 allowed roles, 9 denied roles, unauthenticated caller, zero non-GET handlers)

## Task Commits

Each task was committed atomically:

1. **Task 1: MinistryModule scaffold — DTO, controller, service, AppModule registration** - `3355670` (feat)
2. **Task 2: ministry.service.spec.ts + ministry.controller.spec.ts** - `4f2da40` (test)

**Plan metadata:** (this commit, added by the wave orchestrator after merge)

_Note: Task 1 (tdd="true") landed as a single `feat` commit — the plan's own task breakdown places all query/controller/DTO implementation in Task 1 and all test coverage in Task 2, so RED/GREEN happened across the two task commits rather than within Task 1 alone._

## Files Created/Modified
- `backend/src/modules/ministry/ministry.module.ts` - `@Module` wiring controller + service
- `backend/src/modules/ministry/ministry.controller.ts` - GET-only controller, class-level RBAC guard
- `backend/src/modules/ministry/ministry.service.ts` - `getVisitorEntriesByLgaAndMonth()` + `getPurposeBreakdown()`, `Prisma.sql`/`Prisma.empty` conditional filters
- `backend/src/modules/ministry/dto/ministry-query.dto.ts` - optional `from`/`to`/`lgaId` query DTO
- `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` - query correctness tests (count coercion, SQL-shape, filter behavior)
- `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` - RBAC tests (real `RolesGuard` + `Reflector`), zero-mutation-route assertion
- `backend/src/app.module.ts` - registered `MinistryModule` near `AdminModule`

## Decisions Made
- Followed the plan's literal `<interfaces>` SQL shape exactly (LEFT JOIN to `bookings`/`tour_bookings` for D-02's status check, LEFT JOIN to `lgas` for the LGA name); no deviation from the given query structure.
- Test assertions for "filter omitted from SQL" checks were scoped to the filter's `AND v."x" = ` clause specifically, not a bare substring of the column name, to avoid false positives against the unrelated `LEFT JOIN ... ON v."lgaId" = l.id` join predicate that's always present.
- Controller RBAC spec additionally asserts `Reflect.getMetadata(METHOD_METADATA, ...)` equals `RequestMethod.GET` (0) for every prototype method — an automated, structural proof of MIN-01's "own controller class, GET-only, forever" requirement rather than relying on code review alone.

## Deviations from Plan

None - plan executed exactly as written. `VisitorLog` model, `VisitorSourceType` enum, and `MINISTRY_VIEWER` role value were already present in the schema/enum from Plan 14-01 (this plan's `depends_on`), so no schema changes were needed here.

## Issues Encountered
- This worktree had no `node_modules` installed (fresh git worktree checkout; `node_modules` is gitignored and not shared across worktrees by git). Created temporary Windows directory junctions (`node_modules` → main repo's `node_modules`, `backend/node_modules` → main repo's `backend/node_modules`) to run `tsc --noEmit` and `jest` for verification, then removed both junctions before finishing (confirmed via `rmdir`, which only removes the junction pointer — the main repo's real `node_modules` contents were left untouched and verified intact afterward). No repo files were affected; this was purely a local verification-environment workaround.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MIN-01/MIN-02/MIN-03 read surface is live and tested; ready for Plan 14-06 to extend `ministry.service.ts`/`ministry.controller.ts` with MIN-04 (revenue-to-government-share) and the MIN-07 PII-allowlist test, and Plan 14-07 to add CSV/PDF export routes (MIN-05/MIN-06) reusing the same `MinistryQueryDto` filters.
- No blockers identified for downstream plans.

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 7 created/modified files verified present; all 3 commit hashes (3355670, 4f2da40, 41f44d1) verified in git log.
