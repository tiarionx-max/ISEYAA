---
phase: 20-grpc-blue-green-healthcheck-retrofit
plan: 01
subsystem: infra
tags: [grpc, nestjs, terminus, railway, healthcheck, notifications-service]

# Dependency graph
requires:
  - phase: 17-grpc-proof-of-pattern-extraction
    provides: "notifications-service as the first genuinely separate deployed gRPC process (own Railway service, ClientGrpc, port 5008)"
provides:
  - "notifications-service hybrid NestJS bootstrap: HTTP listener (port 8080/PORT) alongside the existing gRPC listener (port 5008), same process"
  - "grpc.health.v1.Health RPC on notifications-service's gRPC port, responding SERVING via grpc-health-check's HealthImplementation"
  - "GET /healthz HTTP endpoint (terminus HealthCheckService, zero indicators) for Railway's healthcheckPath"
  - "railway.toml healthcheckPath=/healthz + healthcheckTimeout=60 wired for health-gated rollout"
  - "jest.config.js roots extended to scan backend/apps/**/src/__tests__ (previously silently undiscovered)"
affects: ["20-05 (blue-green cutover runbook, depends on this health signal)", "21 (GRPC-07/08 extraction, depends on Phase 20 as a hard prerequisite)"]

# Tech tracking
tech-stack:
  added: ["grpc-health-check ^2.1.0"]
  patterns:
    - "NestJS hybrid bootstrap: NestFactory.create() + app.connectMicroservice() + app.startAllMicroservices() + app.listen() replacing pure createMicroservice() for services needing both an HTTP healthcheck surface and a gRPC business port in one process"
    - "onLoadPackageDefinition hook registers a second proto package (grpc.health.v1) and wires HealthImplementation directly onto the raw grpc-js Server instance NestJS creates internally"

key-files:
  created:
    - backend/apps/notifications-service/src/health.controller.ts
    - backend/apps/notifications-service/src/__tests__/grpc-health.spec.ts
    - backend/apps/notifications-service/src/__tests__/health.controller.spec.ts
  modified:
    - backend/apps/notifications-service/src/main.ts
    - backend/apps/notifications-service/src/app.module.ts
    - backend/apps/notifications-service/railway.toml
    - backend/apps/notifications-service/Dockerfile
    - backend/package.json
    - backend/jest.config.js

key-decisions:
  - "Health.Check RPC responds SERVING unconditionally at boot (no live DB/Redis dependency probe) — matches the monolith's own zero-indicator check([]) pattern; deeper health probing explicitly out of scope per 20-CONTEXT.md (risk-accepted as T-20-03 in the plan's threat register)"
  - "Omitted @nestjs/swagger decorators on HealthController — notifications-service's app.module.ts has no Swagger setup wired, so adding @ApiTags/@ApiOperation would introduce an unused dependency to this scaffold"
  - "HTTP listener bound to process.env.PORT ?? 8080, distinct from the unchanged gRPC business port 5008 — Railway's healthcheckPath is HTTP-only and cannot probe gRPC/TCP directly"

patterns-established:
  - "Wave 0 test harness: raw grpc-js client + HealthImplementation-backed in-memory server proves gRPC health wiring without booting the full Nest app or a live Postgres/Redis connection"

requirements-completed: [GRPC-06a]

# Metrics
duration: 25min
completed: 2026-07-20
---

# Phase 20 Plan 01: gRPC Blue-Green Healthcheck Retrofit Summary

**notifications-service now boots as a NestJS hybrid app — HTTP `/healthz` (terminus) alongside the existing gRPC port 5008, which now also serves a real `grpc.health.v1.Health` RPC via `grpc-health-check`'s `HealthImplementation` — with `railway.toml` wired to poll `/healthz` for health-gated rollout.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-20T19:09:00Z (approx, per prior commit history)
- **Completed:** 2026-07-20T19:21:44Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 modified, 3 created

## Accomplishments
- Rewrote `notifications-service`'s bootstrap from a pure `createMicroservice()` gRPC-only process into a NestJS hybrid application: `NestFactory.create()` → `app.connectMicroservice()` (gRPC, now serving both the `notifications` package and `grpc.health.v1`) → `app.startAllMicroservices()` → `app.listen()` (HTTP, `/healthz`)
- Added `HealthController` (`@nestjs/terminus`, zero registered indicators) exposing `GET /healthz`, wired into `app.module.ts` via `TerminusModule`
- Updated `railway.toml` (`healthcheckPath = "/healthz"`, `healthcheckTimeout = 60`) and `Dockerfile` (`EXPOSE 8080` alongside the existing `EXPOSE 5008`) so Railway's rollout is now health-gated instead of a blunt process-alive check
- Extended `jest.config.js`'s `roots` to scan `backend/apps/**/src/__tests__` (mirroring the existing `scripts/` precedent) — without this, specs under `backend/apps/notifications-service/src/__tests__/` are silently never discovered by `npm test`
- Added two Wave 0 unit tests: a raw `@grpc/grpc-js` client against a `HealthImplementation`-backed in-memory server (proves the exact wiring shape used in `main.ts`, no live app boot needed) and a `Test.createTestingModule` DI check proving `HealthController.check()` resolves `status: 'ok'` — both pass with zero Postgres/Redis dependency

## Task Commits

Each task was committed atomically:

1. **Task 1: Hybrid HTTP+gRPC bootstrap + health controller + railway.toml + Dockerfile** - `bd49605` (feat)
2. **Task 2: Wave 0 test harness — raw gRPC health client + HTTP healthz controller unit tests** - `ccb2d59` (test)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Task 1 implemented the hybrid bootstrap/controller/config first; Task 2 added the proving Wave 0 test harness per the plan's explicit two-task split (test harness deliberately deferred to its own dedicated task rather than interleaved per-task RED/GREEN)._

## Files Created/Modified
- `backend/apps/notifications-service/src/main.ts` - Hybrid bootstrap: `NestFactory.create()` + `connectMicroservice()` (gRPC, dual package `['notifications', 'grpc.health.v1']`, `onLoadPackageDefinition` wires `HealthImplementation`) + `startAllMicroservices()` + `listen()` (HTTP `/healthz`)
- `backend/apps/notifications-service/src/health.controller.ts` - `@Controller() @Get('healthz') @HealthCheck() check()` returning `this.health.check([])`
- `backend/apps/notifications-service/src/app.module.ts` - Added `TerminusModule` import and `HealthController` to `controllers`
- `backend/apps/notifications-service/railway.toml` - Added `healthcheckPath = "/healthz"`, `healthcheckTimeout = 60`
- `backend/apps/notifications-service/Dockerfile` - Added `EXPOSE 8080`
- `backend/package.json` - Added `grpc-health-check ^2.1.0` dependency
- `backend/jest.config.js` - Extended `roots` to include `<rootDir>/../apps`
- `backend/apps/notifications-service/src/__tests__/grpc-health.spec.ts` - Raw grpc-js client proving `Health.Check` resolves `SERVING` for two concurrent RPCs
- `backend/apps/notifications-service/src/__tests__/health.controller.spec.ts` - DI-level proof that `HealthController.check()` resolves `status: 'ok'`

## Decisions Made
- Health responds `SERVING` unconditionally at boot, no live dependency probe — deliberate scope limit per `20-CONTEXT.md` and the plan's threat register (T-20-03, accepted)
- Omitted Swagger decorators on `HealthController` since this scaffold has no `@nestjs/swagger` wiring today
- HTTP listener on `process.env.PORT ?? 8080`, kept fully separate from the unchanged gRPC business port 5008

## Deviations from Plan

None - plan executed exactly as written. One environment-only adjustment (not a code deviation, not committed): the worktree's generated Prisma client was stale from workspace setup, causing 20 pre-existing test suites to fail with `TS2339`/`TS2305` errors unrelated to this plan's files (e.g. `Prisma.PrismaClientKnownRequestError`, `TourPackage` type exports). Running `npx prisma generate` (a build artifact regeneration, not a source change) resolved all 20 failures — confirmed via a full `npm test` run afterward: 57/57 suites, 685/685 tests passing, including both new Wave 0 specs.

## Issues Encountered
- Initial `grpc-health.spec.ts` cast (`grpc.Client & {...}` direct `as` cast) failed TypeScript's structural-overlap check (`TS2352`) against `ServiceClient`. Fixed by adding an explicit `as unknown as HealthClientType` two-step cast — a standard TS pattern for casting between structurally-unrelated types, no behavior change.
- `npm run build:services` fails under this Windows/Git-Bash environment because `npm run` invokes the script via `cmd.exe`, which cannot parse the `for s in ...; do ... done` POSIX shell loop in `backend/package.json`. This is a pre-existing environment/tooling limitation unrelated to this plan's changes (out of scope per deviation rules' scope boundary) — verified instead by running `npx nest build <service>` directly for all 8 services in Git Bash, all succeeding with zero TypeScript errors, including `notifications-service`.

## User Setup Required

None - no external service configuration required. (Railway's actual pickup of the new HTTP port for `notifications-service` is explicitly deferred to deploy time per the plan's `<verification>` section and `20-RESEARCH.md` Open Question 1 — tracked for `20-05-PLAN.md`'s runbook, not required to pass locally.)

## Next Phase Readiness
- `notifications-service` now has a concrete, pollable health signal (`GET /healthz`) and a real `grpc.health.v1.Health` RPC — both required inputs for `20-05-PLAN.md`'s blue-green cutover runbook (GRPC-06c) and a hard prerequisite for Phase 21's new gRPC extractions (per STATE.md's logged decision)
- No blockers. Manual Railway dashboard confirmation of the new HTTP port remains an explicit deploy-time checklist item, not a code blocker.

---
*Phase: 20-grpc-blue-green-healthcheck-retrofit*
*Completed: 2026-07-20*
