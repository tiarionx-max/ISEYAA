---
phase: quick
plan: 260727-6nh
subsystem: api
tags: [grpc, ts-proto, nestjs, prisma, paystack, events, stays, admin, rbac]

requires: []
provides:
  - "events-service ReserveTicket / stays-service CreateBooking gRPC RPCs now delegate to the real EventsService.purchaseTicket / StaysService.createBooking (in-process service injection), returning live Paystack authorization_url/access_code/payment_reference instead of reading a pre-existing PENDING row"
  - "Event.status DRAFT to PENDING_APPROVAL to APPROVED/PUBLISHED/CANCELLED lifecycle, reachable via PATCH events/:id/submit-for-approval (ORGANISER) and PATCH admin/events/:id/status (SUPER_ADMIN/LGA_ADMIN)"
  - "admin-grpc ApproveItem itemType='event' now actually publishes the event instead of no-op'ing"
affects: [events, stays, admin, gRPC extraction backlog]

tech-stack:
  added: []
  patterns:
    - "gRPC microservice app.module.ts imports the real feature module (EventsModule/StaysModule) + KafkaModule alongside PrismaModule/RedisModule/CommonModule/ResilienceModule for in-process service injection — mirrors the proven wallet-service pattern"
    - "gRPC handlers wrap the real service call in try/catch and return a {success:false, ...empty-ids} fallback on any thrown exception rather than letting it cross the gRPC transport boundary"

key-files:
  created:
    - backend/src/modules/admin/dto/update-event-status.dto.ts
  modified:
    - packages/proto/events.proto
    - packages/proto/stays.proto
    - packages/proto/generated/events.ts
    - packages/proto/generated/stays.ts
    - backend/apps/events-service/src/app.module.ts
    - backend/apps/events-service/src/events-grpc.controller.ts
    - backend/apps/stays-service/src/app.module.ts
    - backend/apps/stays-service/src/stays-grpc.controller.ts
    - backend/src/modules/events/events.service.ts
    - backend/src/modules/events/events.controller.ts
    - backend/src/modules/events/__tests__/events.service.spec.ts
    - backend/src/modules/admin/admin.service.ts
    - backend/src/modules/admin/admin.controller.ts
    - backend/src/modules/admin/__tests__/admin.service.spec.ts
    - backend/apps/admin-service/src/admin-grpc.controller.ts

key-decisions:
  - "ReserveTicket rejects quantity > 1 with {success:false} rather than looping purchaseTicket calls — purchaseTicket only ever creates one Ticket per call, so silently mispurchasing (or partially purchasing) was avoided by explicit rejection, per plan spec"
  - "admin-grpc's new 'event' case in ApproveItem always sets status to PUBLISHED (not APPROVED) — matches the plan's rationale that nothing else in the codebase differentiates APPROVED from PUBLISHED today"
  - "updateEventStatus/submitForApproval write no audit log entry, matching the existing sibling pattern (updateVendorStatus/updateUserStatus) — explicitly accepted (T-quick-05) as out of scope for this plan"

patterns-established:
  - "UpdateEventStatusDto follows the resolve-flag.dto.ts convention: literal union type + const array + @IsEnum(ARRAY, {message}) + @ApiProperty({enum: ARRAY})"

requirements-completed: []

duration: ~70min
completed: 2026-07-27
---

# Quick Task 260727-6nh: Wire real reservation logic into events/stays gRPC + event-approval workflow Summary

**Replaced two fake/no-op gRPC reservation stubs with real Paystack-backed ticket/booking creation, and built the missing DRAFT to PENDING_APPROVAL to PUBLISHED event-approval workflow end to end (REST + gRPC).**

## Performance

- **Duration:** ~70 min (includes first-time worktree `npm install` ~3 min + Prisma client regeneration)
- **Tasks:** 2 completed
- **Files modified:** 15 (14 modified, 1 created)

## Accomplishments
- Extended `events.proto`/`stays.proto` with `email`/`guests` request fields and `authorization_url`/`access_code`/`payment_reference` response fields, regenerated `packages/proto/generated/{events,stays}.ts` via `bash packages/proto/generate.sh`, and confirmed via `git diff --stat` that only those two generated files (plus the two `.proto` sources) carry real content changes — the rest of the barrel's line-ending-only "modified" status in `git status` was left untouched.
- Rewired `EventsGrpcController.ReserveTicket` and `StaysGrpcController.CreateBooking` to inject the real `EventsService`/`StaysService` (in-process, same pattern as `wallet-grpc.controller.ts`) and delegate to `purchaseTicket`/`createBooking` — both now create real PENDING rows and return live Paystack authorization data, wrapped in try/catch so any thrown exception (sold out, event not published, date conflict, Paystack down) degrades to `{success:false, ...empty-ids}` instead of crashing the gRPC transport.
- Added `EventsService.submitForApproval(userId, eventId)` (DRAFT -> PENDING_APPROVAL, with ownership + status guards) and wired it to `PATCH events/:id/submit-for-approval` (ORGANISER, own events only).
- Added `AdminService.updateEventStatus(id, status)` (APPROVED/PUBLISHED/CANCELLED) and wired it to `PATCH admin/events/:id/status` (SUPER_ADMIN/LGA_ADMIN, validated via new `UpdateEventStatusDto`).
- Added an `'event'` case to `admin-grpc`'s `ApproveItem` switch, so `itemType='event'` now actually publishes the event instead of doing nothing.
- Added 3 new tests for `submitForApproval` (happy path, wrong-status rejection, not-owner rejection) and 2 new tests for `updateEventStatus` (happy path, not-found) — full targeted jest run green (58/58 tests in both touched suites).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend events/stays proto contracts and wire real reservation logic into the gRPC controllers** - `43df6cf` (feat)
2. **Task 2: Build the event-approval workflow (organizer submit + admin approve + gRPC wiring)** - `ce0eaa4` (feat)

**Plan metadata:** committed separately by the orchestrator (SUMMARY.md / STATE.md not committed by this agent per instructions)

## Files Created/Modified
- `packages/proto/events.proto` - Added `email` to `ReserveTicketRequest`; added `authorization_url`/`access_code`/`payment_reference` to `ReserveTicketResponse`
- `packages/proto/stays.proto` - Added `email`/`guests` to `CreateBookingRequest`; added `authorization_url`/`access_code`/`payment_reference` to `CreateBookingResponse`
- `packages/proto/generated/events.ts` / `stays.ts` - Regenerated via `generate.sh` (ts-proto camelCases the new fields as `email`, `guests`, `authorizationUrl`, `accessCode`, `paymentReference`)
- `backend/apps/events-service/src/app.module.ts` - Imports `EventsModule` + `KafkaModule` alongside existing `PrismaModule`/`RedisModule`/`CommonModule`/`ResilienceModule`
- `backend/apps/events-service/src/events-grpc.controller.ts` - `ReserveTicket` now injects `EventsService`, rejects `quantity > 1` with `{success:false}`, otherwise delegates to `purchaseTicket()` in a try/catch
- `backend/apps/stays-service/src/app.module.ts` - Imports `StaysModule` + `KafkaModule`
- `backend/apps/stays-service/src/stays-grpc.controller.ts` - `CreateBooking` now injects `StaysService` and delegates to `createBooking()` in a try/catch
- `backend/src/modules/events/events.service.ts` - New `submitForApproval(userId, eventId)` method
- `backend/src/modules/events/events.controller.ts` - New `PATCH :id/submit-for-approval` route (ORGANISER)
- `backend/src/modules/events/__tests__/events.service.spec.ts` - New `describe('submitForApproval', ...)` block (4 tests)
- `backend/src/modules/admin/admin.service.ts` - New `updateEventStatus(id, status)` method under a new `// ── Events ──` section
- `backend/src/modules/admin/admin.controller.ts` - New `PATCH events/:id/status` route (inherits class-level SUPER_ADMIN/LGA_ADMIN guard)
- `backend/src/modules/admin/dto/update-event-status.dto.ts` - New `UpdateEventStatusDto` (literal union + const array + `@IsEnum`)
- `backend/src/modules/admin/__tests__/admin.service.spec.ts` - New `describe('updateEventStatus', ...)` block (2 tests) + extended `mockPrisma.event` with `findFirst`/`update`
- `backend/apps/admin-service/src/admin-grpc.controller.ts` - New `case 'event':` in `ApproveItem`'s switch, calling `updateEventStatus(itemId, 'PUBLISHED')`

## Decisions Made
- **`quantity > 1` explicit rejection in `ReserveTicket`:** `EventsService.purchaseTicket` has no `quantity` parameter and always creates exactly one `Ticket`. Rather than looping calls (which could partially succeed/fail and leave inconsistent state) or silently ignoring `quantity`, the handler logs a warning and returns `{success:false}` immediately for `quantity > 1`, documenting the current single-ticket-per-call limitation.
- **`admin-grpc`'s `'event'` case always sets `PUBLISHED`** (never `APPROVED`) — matches the plan's verified fact that nothing else in the codebase currently differentiates an `APPROVED`-but-unpublished state from `PUBLISHED`.
- **No audit log entry added** for `submitForApproval`/`updateEventStatus` — matches the existing sibling pattern (`updateVendorStatus`/`updateUserStatus` also write no audit row); threat register item T-quick-05 explicitly accepts this as out of scope.

## Deviations from Plan

None — plan executed exactly as written for both tasks. One infrastructure prerequisite was required and resolved before any plan work could begin (see Issues Encountered): this worktree had no `node_modules` at all, which is normal first-run worktree setup, not a plan defect.

## Issues Encountered
- **Fresh worktree had no `node_modules`.** A first attempt to speed things up by directory-junctioning the worktree's `node_modules` to the main repo's `node_modules` caused `@iseyaa/proto`'s compiled output (imported via `node_modules/@iseyaa/proto` -> `generated/index.js`) to resolve to the **main repo's** stale build instead of this worktree's edited `packages/proto/generated/*.ts` — `apps/events-service`/`apps/stays-service` tsc checks failed with "Property 'email' does not exist on type 'ReserveTicketRequest'" even though the source `.proto`/`.ts` were correctly edited in the worktree. Resolved by removing the junctions (`rmdir`, which only removes the reparse point, not target content — verified the main repo's `node_modules` was untouched afterward) and running a full `npm install` in the worktree instead, which correctly creates workspace symlinks (`node_modules/@iseyaa/proto` -> the worktree's own `packages/proto`) rather than pointing at the main repo.
- **Prisma client generated by `npm install`'s postinstall was stale/out of sync with `schema.prisma`** (missing many models/enums like `TourPackageCategory`, `ExportCadence`, etc.), causing widespread unrelated tsc errors on the first post-install check. Resolved with an explicit `cd backend && npx prisma generate`, which regenerated the client correctly against the current schema — after which all four required tsc checks (main + events-service + stays-service + admin-service) passed clean with zero errors, confirming the stale client (not any plan-related code) was the cause.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both events-service and stays-service gRPC microservices can now create real, Paystack-backed reservations when a gRPC caller reaches `ReserveTicket`/`CreateBooking` — no live caller exists yet (confirmed by the plan's verified_facts grep), so this is dormant-but-correct infrastructure for a future gRPC-facing consumer.
- The event-approval workflow is fully wired end to end: an ORGANISER can move their own DRAFT event to PENDING_APPROVAL, and a SUPER_ADMIN/LGA_ADMIN can move it onward via REST or via the admin-grpc `ApproveItem` RPC. `AdminService.getDashboard()`'s pre-existing `pending_approvals` metric (which already counted `PENDING_APPROVAL` events) will now reflect real submitted events instead of always reading zero.
- Full backend jest suite (76 suites, 881 tests) and `tsc --noEmit` across the main backend project plus every touched `apps/*/tsconfig.app.json` (events-service, stays-service, admin-service) pass clean.
- Flutterwave webhook gap remains explicitly out of scope, per user decision (unchanged in this plan).

---
*Phase: quick*
*Completed: 2026-07-27*

## Self-Check: PASSED

- FOUND: backend/src/modules/admin/dto/update-event-status.dto.ts
- FOUND: packages/proto/generated/events.ts
- FOUND: packages/proto/generated/stays.ts
- FOUND: commit 43df6cf (Task 1: events/stays gRPC reservation wiring)
- FOUND: commit ce0eaa4 (Task 2: event-approval workflow)
