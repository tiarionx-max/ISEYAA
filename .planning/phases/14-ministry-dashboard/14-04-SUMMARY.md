---
phase: 14-ministry-dashboard
plan: 04
subsystem: api
tags: [visitor-log, events, stays, ministry-dashboard, prisma, nestjs, tdd]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard
    provides: "VisitorLogService, VISITOR_PURPOSE_VALUES/DEFAULT_VISITOR_PURPOSE constants, and the VisitorLog schema (Plan 14-02)"
provides:
  - "Event check-in (checkin()) writes a VisitorLog row (sourceType EVENT) on every successful ticket scan"
  - "Stay payment confirmation (handleStayPayment()) writes a VisitorLog row (sourceType STAY) with a future-dated visitedAt equal to booking.checkIn"
  - "Optional purpose-of-visit field on both PurchaseTicketDto and CreateBookingDto, validated against VISITOR_PURPOSE_VALUES and persisted into Ticket.metadata/Booking.metadata"
affects: ["14-05 (Tour Bookings third VisitorLog write site)", "future Ministry dashboard aggregation queries (MIN-02/MIN-03)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VisitorLog write-site pattern: constructor-inject VisitorLogService, call .record() immediately after the state-changing update, wrapped in its own .catch() so a write failure never blocks the primary flow (check-in response / confirmation emails)"
    - "Purpose-of-visit defaulting applied at read time (not write time) — DEFAULT_VISITOR_PURPOSE.{EVENT|STAY} fallback lives at the VisitorLog call site, keeping a single source of truth for defaults"

key-files:
  created: []
  modified:
    - backend/src/modules/events/dto/purchase-ticket.dto.ts
    - backend/src/modules/events/events.service.ts
    - backend/src/modules/events/__tests__/events.service.spec.ts
    - backend/src/modules/stays/dto/create-booking.dto.ts
    - backend/src/modules/stays/stays.service.ts
    - backend/src/modules/stays/__tests__/stays.service.spec.ts
    - backend/src/modules/stays/__tests__/stays-isolation.spec.ts

key-decisions:
  - "userRole cast as any at both VisitorLogService.record() call sites, matching the existing admin.service.ts:104 convention (Prisma's generated role string-literal-union type isn't directly assignable to the codebase's nominal UserRole enum)"
  - "Stays' visitedAt uses booking.checkIn (future-dated), not new Date() — required by D-02's read-time filtering already implemented in Plan 14-03's queries"

patterns-established:
  - "Any NestJS service gaining a new constructor-injected provider must grep for sibling *-isolation.spec.ts / other test files that build a standalone TestingModule for that service — they need the same provider mock added or the full suite fails to compile"

requirements-completed: [MIN-02, MIN-03]

# Metrics
duration: 14min
completed: 2026-07-18
---

# Phase 14 Plan 04: Events & Stays VisitorLog Write Sites Summary

**Event check-in and stay-payment confirmation now each write exactly one VisitorLog row (EVENT/STAY sourceType), with an optional citizen-supplied purpose-of-visit threaded through both checkout DTOs and defaulted per D-06 when omitted.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-18T01:17:54-05:00
- **Completed:** 2026-07-18T01:31:16-05:00
- **Tasks:** 2 (both TDD)
- **Files modified:** 7 (6 in scope + 1 Rule 3 fix)

## Accomplishments
- `EventsService.checkin()` writes a `VisitorLog` row (sourceType `EVENT`) exactly once on the `VALID` path, using the event's `lgaId`, a fresh `visitedAt`, and the ticket owner's role — never on `NOT_FOUND`/`ALREADY_USED`/forbidden paths, and never blocking the check-in response on write failure
- `StaysService.handleStayPayment()` writes a `VisitorLog` row (sourceType `STAY`) exactly once on successful confirmation, with `visitedAt` set to the booking's future `checkIn` date (per D-02) — never blocking guest/host confirmation emails on write failure
- `PurchaseTicketDto` and `CreateBookingDto` both gain an optional `purpose` field validated against `VISITOR_PURPOSE_VALUES`, persisted into `Ticket.metadata`/`Booking.metadata` at checkout and read back with a per-type default (`DEFAULT_VISITOR_PURPOSE.EVENT`/`.STAY`) at the VisitorLog write site

## Task Commits

Each task followed RED → GREEN TDD:

1. **Task 1: Events — purpose capture + VisitorLog write at check-in**
   - `52f9440` test(14-04): add failing test for VisitorLog write at event check-in
   - `5c51c65` feat(14-04): wire VisitorLog write into event check-in
2. **Task 2: Stays — purpose capture + VisitorLog write at payment confirmation**
   - `88acd95` test(14-04): add failing test for VisitorLog write at stay confirmation
   - `0f48ab4` feat(14-04): wire VisitorLog write into stay payment confirmation
   - `bea8410` fix(14-04): register VisitorLogService in stays-isolation test module (Rule 3)

_Note: SUMMARY.md commit itself is separate (see final commit)._

## Files Created/Modified
- `backend/src/modules/events/dto/purchase-ticket.dto.ts` - optional `purpose` field, `@IsIn(VISITOR_PURPOSE_VALUES)`
- `backend/src/modules/events/events.service.ts` - `VisitorLogService` injected; `purchaseTicket()` persists `dto.purpose`; `checkin()` writes VisitorLog on `VALID`
- `backend/src/modules/events/__tests__/events.service.spec.ts` - fixtures gain `event.lgaId`/`user.role`; 3 new `checkin()` tests (write-once, resolves VALID on rejection, no write on non-VALID paths)
- `backend/src/modules/stays/dto/create-booking.dto.ts` - optional `purpose` field, `@IsIn(VISITOR_PURPOSE_VALUES)`
- `backend/src/modules/stays/stays.service.ts` - `VisitorLogService` injected; `createBooking()` persists `dto.purpose`; `handleStayPayment()` writes VisitorLog with `visitedAt: booking.checkIn`
- `backend/src/modules/stays/__tests__/stays.service.spec.ts` - fixtures gain `property.lgaId`/`user.role`/`metadata`; 2 new `handleStayPayment()` tests (write-once with future-dated `visitedAt`, emails still send on rejection)
- `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` - added `VisitorLogService` provider mock (Rule 3 fix, see below)

## Decisions Made
- `userRole` cast `as any` at both call sites, following the pre-existing `admin.service.ts:104` convention rather than introducing a new type-narrowing helper — kept consistent with the interface note in the plan's context block
- Purpose defaulting applied at read time (VisitorLog call site) rather than write time (ticket/booking creation) — matches the plan's stated rationale of a single source of truth for defaults

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered VisitorLogService in stays-isolation.spec.ts's TestingModule**
- **Found during:** Task 2, full-suite verification (`npm test --workspace=backend`)
- **Issue:** `stays-isolation.spec.ts` builds its own standalone `TestingModule` for `StaysService` (separate from `stays.service.spec.ts`) and did not have a `VisitorLogService` provider mock. Adding the new constructor parameter to `StaysService` broke this sibling test file's Nest dependency resolution ("Nest can't resolve dependencies of the StaysService ... argument VisitorLogService at index [7]").
- **Fix:** Added `import { VisitorLogService }`, a `mockVisitorLog` fixture, and the corresponding provider entry to the `TestingModule` builder — mirroring the pattern already used in `stays.service.spec.ts`.
- **Files modified:** `backend/src/modules/stays/__tests__/stays-isolation.spec.ts`
- **Verification:** `npm test --workspace=backend -- --runInBand` — all 46 suites / 549 tests pass
- **Committed in:** `bea8410`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary follow-through of the constructor-injection change made in Task 2; no scope creep — searched for and found only this one sibling test file affected (grep confirmed no equivalent standalone TestingModule exists for `EventsService`).

## Issues Encountered
- Full-suite `npm test --workspace=backend` (without `--runInBand`) intermittently failed 6 unrelated test suites with a `Cannot find module './version'` error inside `@sentry/node`'s bundled `@opentelemetry/instrumentation-mongodb` — confirmed this is a parallel-jest-worker file-system race against the worktree's `node_modules` (verified the file exists on disk, and the same run passes cleanly with `--runInBand`). Not caused by this plan's changes; not reproducible when running `--runInBand` or the individual `events.service`/`stays.service` suites directly. No code changes made for this — purely a local-environment parallelism artifact.
- This worktree had no `node_modules` on disk (fresh worktree checkout). Created temporary Windows junctions (`mklink /J`) from the worktree's `node_modules`/`backend/node_modules` to the main repo's real installs to run tests, then removed the junctions (`rmdir`, non-recursive — target content confirmed intact) once verification completed. No trace left in git (both paths are `.gitignore`d).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Two of D-01's three VisitorLog write sites are now live (Events check-in, Stays payment confirmation). Plan 14-05 wires the third (Tour Bookings).
- MIN-02/MIN-03's aggregation queries (built in Plan 14-03) now have real data flowing in from these two sources once deployed.
- No blockers identified for downstream plans.

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*

## Self-Check: PASSED

All task commits (52f9440, 5c51c65, 88acd95, 0f48ab4, bea8410) and this SUMMARY's own commit verified present in `git log --oneline --all`. All files referenced in Files Created/Modified confirmed present on disk.
