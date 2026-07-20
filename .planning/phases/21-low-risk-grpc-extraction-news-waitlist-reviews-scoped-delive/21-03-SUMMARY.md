---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 03
subsystem: infra
tags: [grpc, nestjs, microservices, waitlist, canary, resilience, tdd, sizing-gate]

# Dependency graph
requires:
  - phase: 21-02
    provides: "News gRPC extraction — proven apps/<name>-service + <name>-client facade + canary PlatformConfig kill-switch pattern to mirror"
provides:
  - "backend/apps/waitlist-service: independently-buildable hybrid HTTP+gRPC NestJS app exposing GrpcMethod('WaitlistService','JoinWaitlist'/'GetWaitlistStats') and /healthz"
  - "backend/src/modules/waitlist-client: WaitlistClientService canary+resilience-wrapped gRPC facade reconstructing the join {message,position,id} shape and the stats grouped-array shape, WaitlistClientModule registering WaitlistController"
  - "POST /api/v1/waitlist and GET /api/v1/waitlist/stats now served via WaitlistClientService -> waitlist-service gRPC, with a working canary kill-switch (grpc.waitlist_service.canary_enabled)"
  - "D-08 sizing gate for the GetWaitlistStats per-source fan-out recorded PASS — canary flip is unblocked pending a separate later operational action"
affects: ["21-04 (Reviews — same shape-reconciliation technique at higher stakes)", "21-05/21-06 (Delivery OTP)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third application of the D-01/D-02/D-09 hybrid-gRPC-extraction pattern (first: notifications-service Phase 17/20, second: news-service 21-02) — apps/<name>-service scaffold + <name>-client facade module + canary PlatformConfig kill-switch + resilience.execute(vendor, ...) wrap"
    - "Shape-reconciliation facade pattern: thin proto response ({id, success} / {totalCount}) reconstructed into full REST shape ({message, position, id} / grouped [{source, count}]) via a monolith-side Prisma re-query after the gRPC call — first proven here, will recur at higher stakes for Reviews (21-04)"
    - "D-08 blocking sizing checkpoint: an accepted fan-out shortcut (per-source gRPC calls instead of a batched RPC) is only permitted to go live after an operator explicitly sizes it against real production/staging data volumes and records a pass/fail verdict — not a passive checklist row"

key-files:
  created:
    - backend/apps/waitlist-service/src/main.ts
    - backend/apps/waitlist-service/src/app.module.ts
    - backend/apps/waitlist-service/src/health.controller.ts
    - backend/apps/waitlist-service/src/waitlist-grpc.controller.ts
    - backend/apps/waitlist-service/railway.toml
    - backend/apps/waitlist-service/Dockerfile
    - backend/apps/waitlist-service/tsconfig.app.json
    - backend/apps/waitlist-service/src/__tests__/health.controller.spec.ts
    - backend/apps/waitlist-service/src/__tests__/grpc-health.spec.ts
    - backend/src/modules/waitlist-client/waitlist-client.constants.ts
    - backend/src/modules/waitlist-client/waitlist-client.service.ts
    - backend/src/modules/waitlist-client/waitlist-client.module.ts
    - backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts
  modified:
    - backend/src/modules/waitlist/waitlist.module.ts
    - backend/src/modules/waitlist/waitlist.controller.ts
    - backend/src/app.module.ts

key-decisions:
  - "apps/waitlist-service/src/app.module.ts omits ScheduleModule.forRoot() — WaitlistModule has zero @Cron providers, same reasoning as News (21-02)"
  - "waitlist-grpc.controller.ts's JoinWaitlist gRPC method intentionally does NOT return message/position — the proto has no fields for them; the monolith-side WaitlistClientService reconstructs the full REST shape via its own prisma.waitlistEntry.count() query after the gRPC call returns, matching the shape-reconciliation pattern Reviews (21-04) will need next"
  - "WaitlistClientService.stats() fans out one resilience-wrapped gRPC call per WAITLIST_SOURCES entry (2 today) rather than requiring a proto amendment for a batched multi-source RPC — accepted per D-08 conditional on Task 3's sizing gate, not silently accepted"
  - "D-08 sizing gate (Task 3) verdict: PASS — recorded below. This clears the sizing gate only; actually flipping grpc.waitlist_service.canary_enabled in any environment remains a separate, later operational action outside this plan's scope"

patterns-established: []

requirements-completed: [GRPC-08]

# Metrics
duration: N/A (Tasks 1-2 completed by prior agent; this continuation covers Task 3 + summary/self-check only)
completed: 2026-07-20
---

# Phase 21 Plan 03: Waitlist gRPC Extraction Summary

**Waitlist extracted into an independently-deployable hybrid HTTP+gRPC NestJS app (`apps/waitlist-service`), with a canary-gated `WaitlistClientService` facade routing both `POST /api/v1/waitlist` and `GET /api/v1/waitlist/stats` through gRPC while reconstructing both response shapes exactly — second of the D-05 risk-ascending 4-service rollout (News → Waitlist → Reviews → Delivery OTP), gated by a recorded D-08 sizing verdict (PASS).**

## Performance

- **Tasks:** 3 completed (Task 2 followed TDD RED/GREEN; Task 3 was a blocking human-verify checkpoint)
- **Files modified:** 16 (13 created, 3 modified)

## Accomplishments
- `apps/waitlist-service` builds cleanly (`nest build waitlist-service`) and its 2 Wave-0 health tests pass (Terminus `/healthz` + `grpc.health.v1.Health` SERVING)
- `WaitlistGrpcController` exposes `@GrpcMethod('WaitlistService','JoinWaitlist')` and `@GrpcMethod('WaitlistService','GetWaitlistStats')`, delegating unmodified to `WaitlistService.join`/`.stats`
- `WaitlistClientService` implements the canary-check -> `resilience.execute('waitlistGrpc', ...)` -> `ClientGrpc` facade pattern for both methods, fully covered by unit tests: join shape reconstruction (`{message, position, id}` via post-gRPC `prisma.waitlistEntry.count`), stats fan-out (`WAITLIST_SOURCES.length` parallel gRPC calls reassembled into the grouped array), canary-off kill-switch for both methods, and vendor-key assertions
- Monolith now routes both waitlist endpoints through `WaitlistClientModule` instead of the old in-process `WaitlistModule`; `backend/src/app.module.ts` no longer imports `WaitlistModule` directly (though `WaitlistModule` still provides/exports `WaitlistService` for `apps/waitlist-service`'s own in-process wiring)
- **D-08 sizing gate (Task 3) resolved: PASS** — see "D-08 Sizing Gate Verdict" below
- `cd backend && npx nest build waitlist-service` exits 0, `npx jest apps/waitlist-service src/modules/waitlist-client --silent` — 3 suites / 10 tests passed, `npx tsc --noEmit -p tsconfig.json` exits 0 (all re-verified during this continuation, no regressions)

## D-08 Sizing Gate Verdict

**Context (per 21-CONTEXT.md D-08):** `WaitlistClientService.stats()` fans out one gRPC call per `WAITLIST_SOURCES` entry (2 today: `marketplace_web`, `marketplace_mobile`) and reassembles the grouped `[{source, count}]` REST shape client-side, rather than requiring a proto amendment for a single batched multi-source RPC. This is an accepted implementation approach *conditional on* an explicit sizing check against real data volumes before the canary flag is ever flipped on — not a passive checklist row.

**Verification performed:** The human operator reviewed real staging/production `WaitlistEntry` row counts per source, using the SQL query specified in Task 3's how-to-verify (`SELECT source, COUNT(*) FROM "WaitlistEntry" GROUP BY source ORDER BY count(*) DESC;`), and confirmed:
- The distinct `source` values present in the data match `WAITLIST_SOURCES` exactly.
- Row counts per source are low (order of thousands, not millions), and each source's query is backed by a single indexed `groupBy`-equivalent lookup inside `waitlist-service`.

**Verdict: PASS** — Row counts and query shape pose no realistic P95 latency risk. The 2-way `GetWaitlistStats` gRPC fan-out is confirmed safe under real production/staging data volumes.

**Scope of this verdict:** PASS clears the D-08 sizing gate and unblocks Plan 21-03 as complete. It does **not** itself flip `grpc.waitlist_service.canary_enabled` in any environment — actually enabling the canary remains a separate, later operational action outside this plan's scope, per the deployment runbook.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold apps/waitlist-service (hybrid HTTP+gRPC app, 2-method controller)** - `f5d5cf8` (feat)
2. **Task 2 (RED): failing test for WaitlistClientService join-shape + stats-fan-out facade** - `ca97d9b` (test)
2. **Task 2 (GREEN): WaitlistClientService + monolith wiring** - `0a84426` (feat)
3. **Task 3: D-08 sizing gate — checkpoint, no source code changes; verdict recorded in this SUMMARY** (docs commit alongside this file, see below)

_Note: Task 2 was `tdd="true"` — RED and GREEN landed as separate commits per the TDD execution protocol. No REFACTOR commit was needed (implementation matched the target shape on first pass). Task 3 was a `checkpoint:human-verify` gate — it produces a recorded verdict, not code, so its "commit" is this SUMMARY.md landing in version control._

## Files Created/Modified
- `backend/apps/waitlist-service/src/main.ts` - Hybrid bootstrap: gRPC on `0.0.0.0:5010` (`waitlist` + `grpc.health.v1` packages), HTTP healthz on `process.env.PORT ?? 8080`
- `backend/apps/waitlist-service/src/app.module.ts` - Imports `WaitlistModule` (via relative path) + Prisma/Redis/Resilience/DbMetrics/Terminus; deliberately no `ScheduleModule`
- `backend/apps/waitlist-service/src/health.controller.ts` - Verbatim copy of the notifications-service/news-service Terminus `/healthz` controller
- `backend/apps/waitlist-service/src/waitlist-grpc.controller.ts` - `@GrpcMethod('WaitlistService','JoinWaitlist')` (returns `{id, success}`, no message/position) and `@GrpcMethod('WaitlistService','GetWaitlistStats')` (looks up one source's count from `WaitlistService.stats()`'s grouped result)
- `backend/apps/waitlist-service/railway.toml` / `Dockerfile` / `tsconfig.app.json` - Deploy scaffold mirroring news-service, service-name-substituted
- `backend/apps/waitlist-service/src/__tests__/health.controller.spec.ts` / `grpc-health.spec.ts` - Wave-0 health harness tests (verbatim, service-name-agnostic)
- `backend/src/modules/waitlist-client/waitlist-client.constants.ts` - Zero-import leaf file: `WAITLIST_PACKAGE` token
- `backend/src/modules/waitlist-client/waitlist-client.service.ts` - `WaitlistClientService`: canary check (`grpc.waitlist_service.canary_enabled`) -> `resilience.execute('waitlistGrpc', ...)` -> `ClientGrpc`; `join()` reconstructs `{message, position, id}` via post-gRPC `prisma.waitlistEntry.count`; `stats()` fans out `WAITLIST_SOURCES.length` parallel calls and reassembles the grouped array; catches log only `err?.message ?? err`
- `backend/src/modules/waitlist-client/waitlist-client.module.ts` - `ClientsModule.registerAsync` for the `waitlist` gRPC package (`WAITLIST_SERVICE_URL` env, default `localhost:5010`); registers `WaitlistController`
- `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` - Unit tests covering all `<behavior>` bullets from the plan (join shape reconstruction, join canary-off, join failure, stats fan-out/reassembly, stats canary-off, vendor-key assertions)
- `backend/src/modules/waitlist/waitlist.controller.ts` - Constructor now injects `WaitlistClientService` instead of `WaitlistService` (field name `waitlist` and both call sites unchanged)
- `backend/src/modules/waitlist/waitlist.module.ts` - `controllers: []`; still provides/exports `WaitlistService` for `apps/waitlist-service`'s own wiring
- `backend/src/app.module.ts` - Imports `WaitlistClientModule` in place of `WaitlistModule`

## Decisions Made
- Followed the plan's explicit instruction to omit `ScheduleModule.forRoot()` from `apps/waitlist-service/src/app.module.ts` since `WaitlistModule` has zero `@Cron` providers.
- D-08's sizing gate (Task 3) resolved PASS by the human operator reviewing real staging/production data — see "D-08 Sizing Gate Verdict" above for full detail.
- No architectural deviations — plan's task actions were followed as specified, matching the news-service (21-02) precedent for Tasks 1-2.

## Deviations from Plan

None - plan executed exactly as written, including the Task 3 checkpoint gate which produced the PASS verdict documented above rather than a code change.

One environment-only adjustment (not a code deviation, not tracked under Rules 1-4, consistent with 21-02): this worktree had no `node_modules` installed (git worktrees don't carry `node_modules` since it's gitignored). Symlinks from the main repo checkout were used to run `nest build`/`jest`/`tsc` verification commands. These symlinks are gitignored and were not committed.

## Issues Encountered
None.

## User Setup Required

None for this plan's code. `grpc.waitlist_service.canary_enabled` PlatformConfig row does not yet exist in the DB — absence defaults to enabled (existing gRPC-calling behavior), consistent with the opt-OUT kill-switch polarity used for `newsGrpc`/`notificationsGrpc`. Actually flipping the canary flag in any environment, and deploying `waitlist-service` to Railway, remain separate deployment-time follow-ups outside this plan's scope — now unblocked by the D-08 PASS verdict recorded above.

## Next Phase Readiness
- Waitlist is the second of 4 D-05 risk-ascending services landed; the shape-reconciliation facade pattern (thin proto response reconstructed into full REST shape via monolith-side Prisma re-query) is now proven end-to-end for both a single-record mutation (join) and a multi-record aggregation (stats fan-out).
- 21-04 (Reviews) will reuse this exact shape-reconciliation technique at higher stakes (in-memory pagination reconstruction of `{data, pagination}` from an unpaginated proto response). 21-05/21-06 (Delivery OTP) will additionally need `ScheduleModule` wiring since Delivery has `@Cron` providers.
- D-08's Waitlist half is now fully resolved (PASS). D-08's Reviews half (pagination fan-out sizing) remains open and will need its own sizing gate in 21-04.

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 17 files listed in key-files (created/modified) verified present on disk. All 4 commits (f5d5cf8, ca97d9b, 0a84426, 428826a) verified present in `git log --oneline --all`.

Re-ran full verification during this continuation (no regressions from Tasks 1-2):
- `cd backend && npx nest build waitlist-service` — exit 0
- `cd backend && npx jest apps/waitlist-service src/modules/waitlist-client --silent` — 3 suites / 10 tests passed
- `cd backend && npx tsc --noEmit -p tsconfig.json` — exit 0
