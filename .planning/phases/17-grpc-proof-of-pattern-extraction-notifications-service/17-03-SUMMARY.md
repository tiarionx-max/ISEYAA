---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
plan: 03
subsystem: api
tags: [grpc, nestjs-microservices, resilience, cockatiel, rxjs, notifications]

# Dependency graph
requires:
  - phase: 17-01
    provides: notifications-service scaffold builds cleanly, ResilienceModule wired into all gRPC service scaffolds, @iseyaa/proto declared as a backend dependency
provides:
  - "NotificationsClientModule — first ClientGrpc registration in this codebase, gRPC client for the notifications package, env-var-driven target (NOTIFICATIONS_SERVICE_URL)"
  - "NotificationsClientService — thin facade matching NotificationsService's exact 3-method contract (listForUser/registerToken/sendPush), backed by ClientGrpc + resilience.execute('notificationsGrpc', ...)"
  - "Copy-paste template for future single-vendor gRPC client extractions (GRPC-07, deferred)"
affects: [17-04-cutover-plan, grpc-extraction-pattern]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ClientGrpc facade pattern: dedicated NotificationsClientModule wraps ClientsModule.registerAsync + a thin service exposing the pre-extraction method signatures byte-for-byte, so call sites swap one import with zero other changes"
    - "gRPC call resilience wrapping: resilience.execute(vendor, fn) around firstValueFrom(clientMethod(...)) mirrors the existing HTTP-vendor pattern (Paystack/Sendgrid/FCM) — same catch-log-throw-503 shape"

key-files:
  created:
    - backend/src/modules/notifications-client/notifications-client.module.ts
    - backend/src/modules/notifications-client/notifications-client.service.ts
    - backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts
  modified: []

key-decisions:
  - "Reused the pre-existing NOTIFICATIONS_SERVICE_URL .env.example placeholder rather than introducing NOTIFICATIONS_GRPC_URL — CONTEXT.md D-04 addendum, zero .env.example churn"
  - "Erased the TS type at the firstValueFrom() call boundary (as any) to work around a pre-existing dual-rxjs-version package-lock.json artifact (backend nests rxjs@7.8.1, workspace root pins rxjs@7.8.2) — see Deviations"

patterns-established:
  - "Pattern 1: gRPC client facade — new module exports a string token + registerAsync client, new service injects @Inject(TOKEN) ClientGrpc, caches client.getService(...) in onModuleInit, converts each Observable-returning proxy method via firstValueFrom, wraps in resilience.execute, throws ServiceUnavailableException on failure with vendor-specific wording"

requirements-completed: [GRPC-03]

# Metrics
duration: 25min
completed: 2026-07-19
---

# Phase 17 Plan 03: NotificationsClientModule/Service gRPC Facade Summary

**First `ClientGrpc` facade in the codebase — `NotificationsClientModule`/`NotificationsClientService` wrap `notifications-service`'s gRPC contract behind `NotificationsService`'s exact existing method signatures, resilience-wrapped and throwing 503 on transport failure, ready for Plan 17-04's cutover.**

## Performance

- **Duration:** ~25 min (includes worktree `npm install` + `prisma generate`, neither of which existed in this fresh worktree)
- **Started:** 2026-07-19T06:23:00-05:00 (approx.)
- **Completed:** 2026-07-19T06:48:39-05:00
- **Tasks:** 2 (Task 2 executed as a full RED/GREEN TDD cycle)
- **Files modified:** 3 created, 0 modified

## Accomplishments
- `NotificationsClientModule` registers the first-ever `ClientGrpc` client in this codebase, targeting `notifications-service` via `NOTIFICATIONS_SERVICE_URL` (reusing the existing unused `.env.example` placeholder)
- `NotificationsClientService` implements `listForUser`/`registerToken`/`sendPush` call-compatible with today's in-process `NotificationsService`, so Plan 17-04's cutover is a minimal import swap at both call sites
- Both network-calling methods (`registerToken`, `sendPush`) route through `resilience.execute('notificationsGrpc', ...)`, matching Phase 11's vendor-wrapping pattern, and throw `ServiceUnavailableException` (never a silent success) on transport failure
- `sendPush` always sends `data: data ?? {}` to the gRPC request, matching D-08's proto fix (already present in the generated types) so Plan 17-04's cutover has zero push-payload regression
- 7/7 spec cases pass; `tsc --noEmit` and `npm run build` both compile with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NotificationsClientModule (D-02, D-04)** - `74e7aef` (feat)
2. **Task 2 RED: failing spec for NotificationsClientService** - `278bb4a` (test)
2. **Task 2 GREEN: NotificationsClientService implementation** - `8e0abb0` (feat)

**Plan metadata:** committed alongside this SUMMARY.md (see final commit)

_Note: Task 2 (`tdd="true"`) ran a full RED→GREEN cycle: the spec was written and confirmed failing (module not yet created, TS2307) before the implementation was restored and verified passing._

## Files Created/Modified
- `backend/src/modules/notifications-client/notifications-client.module.ts` - `ClientsModule.registerAsync` gRPC client registration for the `notifications` package; exports `NOTIFICATIONS_PACKAGE` token
- `backend/src/modules/notifications-client/notifications-client.service.ts` - Thin gRPC facade over `notifications-service`; wraps `registerToken`/`sendPush` in `resilience.execute('notificationsGrpc', ...)`; `listForUser` stays a local no-op stub
- `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` - 7 test cases covering all 6 `<behavior>` scenarios plus a combined resilience-routing assertion

## Decisions Made
- **NOTIFICATIONS_SERVICE_URL over NOTIFICATIONS_GRPC_URL:** per CONTEXT.md D-04's addendum, reused the pre-existing unused `.env.example` placeholder (`notifications-service.railway.internal:5008`) instead of introducing a new env var name — zero `.env.example` churn, matches the naming convention already set for the other 7 not-yet-live `*_SERVICE_URL` vars.
- **`protoPath` via 4 `../` segments:** confirmed by direct `node -e` path resolution from `backend/src/modules/notifications-client` to `packages/proto/notifications.proto`; matches the depth pattern already proven correct in `backend/apps/notifications-service/src/main.ts`.
- **No `controllers` array in `NotificationsClientModule`:** per the plan's explicit instruction — moving `NotificationsController`'s registration is Plan 17-04's cutover-wave responsibility, not this plan's.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no `node_modules` or generated Prisma client**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** This worktree was never `npm install`-ed; `tsc` failed with dozens of `TS2307: Cannot find module` errors across the entire backend (unrelated to this plan's files) plus a missing `@prisma/client` output.
- **Fix:** Ran `npm install` from the worktree root (per parallel-executor instructions — real install, no junctions/symlinks to the main repo) and `npm run prisma:generate`.
- **Files modified:** None (only `node_modules/` and `backend/node_modules/@prisma/client`, neither tracked in git)
- **Verification:** `npx tsc --noEmit -p tsconfig.json` dropped from 100+ unrelated errors to only the 2 errors described in deviation #2 below.

**2. [Rule 3 - Blocking] Pre-existing dual-rxjs-version lockfile artifact broke `firstValueFrom()` typing**
- **Found during:** Task 2 GREEN verification (`npx tsc --noEmit`)
- **Issue:** `package-lock.json` pins two different `rxjs` installs that both satisfy every `package.json`'s declared `^7.8.1`: the workspace root resolves to `rxjs@7.8.2`, while `backend/node_modules/rxjs` is a separate nested copy pinned at `rxjs@7.8.1`. `@iseyaa/proto`'s generated `Observable<T>` return type (from the root copy) and `backend`'s own `firstValueFrom`/`rxjs` import (from the nested copy) are structurally identical but nominally incompatible — TypeScript's structural typing treats their `Subscriber`'s *protected* members as belonging to different declaring classes, producing `TS2345` on both `firstValueFrom(this.grpcService.registerToken(...))` and the `sendPush` equivalent. This is the first code in the repo to call `firstValueFrom()` on an `@iseyaa/proto`-typed Observable, so it's the first place this pre-existing lockfile duplication becomes visible as a compile error.
- **Fix:** Attempted `npm dedupe` first (safer than reinstalling); it failed on an unrelated pre-existing peer-dependency conflict (`typescript@7.0.2` vs. `@nestjs/schematics@11.1.0`'s `>=4.8.2` requirement, unrelated to rxjs and out of this task's scope to resolve). Applied a minimal, scoped `as any` type-erasure on the `Observable` argument passed into `firstValueFrom()` at the two call sites (`registerToken`, `sendPush`) — both Observables are runtime-identical (same class shape, same `rxjs` API surface), so this has zero behavioral effect; it only silences a compile-time nominal-typing false positive.
- **Files modified:** `backend/src/modules/notifications-client/notifications-client.service.ts` (inline comments document the rationale at both call sites)
- **Verification:** `npx tsc --noEmit -p tsconfig.json` and `npm run build` both compile with zero errors after the fix; all 7 spec cases still pass (the cast has no runtime effect, confirmed by the passing failure-path tests which still correctly propagate rejected Observables through `firstValueFrom`)
- **Committed in:** `8e0abb0` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues, neither caused by this plan's design, both pre-existing repo/environment state)
**Impact on plan:** Both fixes were necessary to complete the plan's own stated verification steps (`tsc --noEmit`, `npm run build`). No scope creep — neither touched files outside this plan's declared `files_modified`, and the rxjs lockfile duplication itself was left unresolved (fixing it properly requires a broader dependency-graph change flagged as out of scope).

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required. `NOTIFICATIONS_SERVICE_URL` was already present in `.env.example` since Phase 10; no new env var introduced.

## Next Phase Readiness
- `NotificationsClientModule`/`NotificationsClientService` exist, are fully spec-tested (7/7 passing), and are call-compatible with `NotificationsService`'s existing 3-method contract — ready for Plan 17-04 to rewire `NotificationsController` and `TourNotificationsService` onto the new facade.
- Plan 17-04 should be aware of the dual-rxjs-version lockfile artifact (see Deviations #2) if it introduces any further `firstValueFrom()`/`@iseyaa/proto` Observable interop — the same `as any` boundary-cast pattern applies until the underlying `package-lock.json` duplication is resolved (tracked here for a future todo, not blocking this milestone).

---
*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Completed: 2026-07-19*

## Self-Check: PASSED

All created files verified present on disk:
- FOUND: backend/src/modules/notifications-client/notifications-client.module.ts
- FOUND: backend/src/modules/notifications-client/notifications-client.service.ts
- FOUND: backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts
- FOUND: .planning/phases/17-grpc-proof-of-pattern-extraction-notifications-service/17-03-SUMMARY.md

All commit hashes verified present in git log:
- FOUND: 74e7aef (feat: NotificationsClientModule)
- FOUND: 278bb4a (test: RED spec)
- FOUND: 8e0abb0 (feat: NotificationsClientService GREEN)
- FOUND: d0e03f0 (docs: SUMMARY.md)
