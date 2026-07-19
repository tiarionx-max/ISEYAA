---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
plan: 01
subsystem: infra
tags: [grpc, docker, resilience, cockatiel, ts-proto, protobuf, notifications]

# Dependency graph
requires:
  - phase: 16-connection-pooling-infrastructure
    provides: packages/proto compile step (tsc), notifications-service boots cleanly
provides:
  - "@iseyaa/proto declared as an explicit backend dependency (pinned 0.1.0), resolvable by npm ci in both Docker images"
  - "Working docker build for backend/Dockerfile (monolith) and backend/apps/notifications-service/Dockerfile"
  - "gRPC-aware isTransientError() classifying UNAVAILABLE/DEADLINE_EXCEEDED/RESOURCE_EXHAUSTED as transient"
  - "notificationsGrpc resilience vendor policy (mirrors fcm's shape) registered in RESILIENCE_DEFAULTS"
  - "SendPushRequest.data (map<string,string>) proto field, regenerated types, and server-side controller passthrough"
  - "Fixed generate.sh barrel filter bug (excluded stray .d.ts compiled artifacts from proto module list)"
affects: [17-02, 17-03, 17-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gRPC numeric status-code classification in isTransientError() must be checked before the string .code branch, mirroring the existing isTaskCancelledError-before-string-code ordering"
    - "New resilience vendor policies default-mirror the closest existing vendor's threshold shape when no dedicated tuning data exists yet (notificationsGrpc mirrors fcm)"

key-files:
  created: []
  modified:
    - backend/package.json
    - package-lock.json
    - backend/Dockerfile
    - backend/apps/notifications-service/Dockerfile
    - backend/src/resilience/resilience.types.ts
    - backend/src/resilience/resilience.service.ts
    - backend/src/resilience/__tests__/resilience.service.spec.ts
    - packages/proto/notifications.proto
    - packages/proto/generated/notifications.ts
    - packages/proto/generate.sh
    - backend/apps/notifications-service/src/notifications-grpc.controller.ts

key-decisions:
  - "@iseyaa/proto pinned to exact 0.1.0 (no caret) — matches internal workspace package convention already used for other monorepo-local deps"
  - "notificationsGrpc resilience defaults mirror fcm's shape (5s timeout, 1 retry, 8-failure threshold, 20s half-open) — same-region Railway-internal hop, best-effort/non-financial, tunable later via PlatformConfig"
  - "SendPushResponse's missing `reason` field intentionally NOT added in this plan — zero client consumption confirmed by grep; deferred to Plan 17-04's caller-graph audit per RESEARCH.md Pitfall 5"

patterns-established:
  - "Docker npm ci workspace scope must explicitly list every workspace a service's package.json depends on (--workspace=backend --workspace=packages/proto) — the old --include=workspace=shared flag was never valid npm CLI syntax"

requirements-completed: []

# Metrics
duration: ~70min (includes one environment-restart interruption mid-session; work resumed from verified git state per coordinator)
completed: 2026-07-19
---

# Phase 17 Plan 01: gRPC Extraction Prerequisites (Docker, Resilience, Proto Widening) Summary

**Fixed three independent pre-existing blockers for notifications-service's live gRPC cutover: declared `@iseyaa/proto` as a backend dependency so both Docker images build cleanly, added numeric gRPC status-code classification to `ResilienceService.isTransientError()` so circuit-breaker/retry actually engage on real gRPC outages, and widened `SendPushRequest` with a `data` map field end-to-end from proto through generated types to the server controller.**

## Performance

- **Duration:** ~70 min (one mid-session environment-restart interruption; resumed cleanly from git-verified state)
- **Completed:** 2026-07-19
- **Tasks:** 3/3 completed
- **Files modified:** 11

## Accomplishments

- `docker build -f backend/Dockerfile` and `docker build -f backend/apps/notifications-service/Dockerfile` both now exit 0 with no `TS2307: Cannot find module '@iseyaa/proto'` error (verified with a live Docker daemon, not just inferred from `npm ci`)
- `ResilienceService.isTransientError()` now classifies gRPC's numeric `UNAVAILABLE` (14), `DEADLINE_EXCEEDED` (4), and `RESOURCE_EXHAUSTED` (8) status codes as transient — the prerequisite that makes Plan 17-03/17-04's resilience wrapping around the gRPC client call actually functional instead of silently inert
- `SendPushRequest` carries an optional `data: { [key: string]: string }` field from the `.proto` contract through the regenerated TypeScript types to the `notifications-grpc.controller.ts` server handler, which now passes it through to `NotificationsService.sendPush()`'s existing (already-optional) 4th parameter
- Fixed a real bug discovered in `packages/proto/generate.sh`: its barrel-generation filter matched any file ending in `.ts`, which incorrectly treated leftover compiled `.d.ts` artifacts (left behind whenever `npm run build --workspace=packages/proto` had run before `generate.sh`) as proto source modules, producing invalid re-export identifiers like `export * as admin.d from "./admin.d"` that broke `tsc`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix the @iseyaa/proto Docker dependency gap** - `e7bbc05` (fix)
2. **Task 2: Add gRPC-aware transient-error classification to ResilienceService** - `94ffe59` (feat)
3. **Task 3: Widen SendPushRequest with the data field and pass it through server-side (D-08)** - `ec0a019` (feat)

_No plan-metadata commit yet — will be added by this same agent after SUMMARY.md is written (worktree mode: SUMMARY.md + REQUIREMENTS.md only)._

## Files Created/Modified

- `backend/package.json` - Added `"@iseyaa/proto": "0.1.0"` to dependencies (pinned, no caret)
- `package-lock.json` - Refreshed via `npm install` to keep `npm ci` in sync with the new dependency
- `backend/Dockerfile` - Replaced invalid `--include=workspace=shared` with `--workspace=packages/proto` in the `npm ci` step
- `backend/apps/notifications-service/Dockerfile` - Same fix as above
- `backend/src/resilience/resilience.types.ts` - Added `notificationsGrpc` to the `Vendor` union and `RESILIENCE_DEFAULTS` (mirrors `fcm`'s shape)
- `backend/src/resilience/resilience.service.ts` - Imported `status as GrpcStatus` from `@grpc/grpc-js`; added a numeric-code branch in `isTransientError()` positioned before the existing string-code branch
- `backend/src/resilience/__tests__/resilience.service.spec.ts` - Added a `notificationsGrpc` UNAVAILABLE(14) retry test; updated the stale "9 vendor policies" comment to "10"
- `packages/proto/notifications.proto` - Added `map<string, string> data = 4;` to `SendPushRequest`
- `packages/proto/generated/notifications.ts` - Regenerated via `generate.sh`; now includes `data: { [key: string]: string }` on `SendPushRequest`
- `packages/proto/generate.sh` - Fixed the barrel-filter bug (excluded `.d.ts` from the proto-module scan)
- `backend/apps/notifications-service/src/notifications-grpc.controller.ts` - `sendPush` handler now passes `data.data` as the 4th argument to `notificationsService.sendPush(...)`

## Decisions Made

- `@iseyaa/proto` pinned to exact `0.1.0` (no `^`) per `packages/proto/package.json`'s own declared version — matches internal workspace package convention
- `notificationsGrpc` resilience defaults mirror `fcm`'s shape (5s timeout, 1 retry, 8-failure threshold, 20s half-open) rather than inventing new tuning values — same-region Railway-internal gRPC hop, best-effort/non-financial, tunable later via `PlatformConfig` without a code change
- `SendPushResponse`'s missing `reason` field intentionally NOT added — zero client consumption confirmed by a `web/src` and `mobile/app` grep; explicitly deferred to Plan 17-04's caller-graph audit per RESEARCH.md Pitfall 5, not silently regressed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed `generate.sh`'s barrel-generation filter picking up stale `.d.ts` compiled artifacts as proto modules**
- **Found during:** Task 3 (regenerating `packages/proto/generated/notifications.ts` after widening `SendPushRequest`)
- **Issue:** Task 1's Docker verification step required running `npm run build --workspace=packages/proto` (tsc compile-in-place, per Phase 16's compile step), which populated `packages/proto/generated/` with `.js`/`.d.ts` files. When Task 3 subsequently ran `bash packages/proto/generate.sh`, its barrel-generation Node script filtered files with `f.endsWith(".ts")`, which also matched `admin.d.ts`, `index.d.ts`, etc. — producing invalid JS identifiers (`export * as admin.d from "./admin.d";`) that failed `tsc -p tsconfig.json` with `TS1005: 'from' expected`. This is an order-dependent latent bug in `generate.sh` itself (build-then-generate, in that order, in the same directory, always triggers it), not something specific to this plan's proto edit.
- **Fix:** Cleaned the polluted `generated/*.js` and `generated/*.d.ts` files, then changed the filter to `f.endsWith(".ts") && !f.endsWith(".d.ts")` in `generate.sh`. Re-ran `generate.sh` (clean barrel, exit 0) and `npm run build --workspace=packages/proto` (exit 0).
- **Files modified:** `packages/proto/generate.sh` (also regenerated `packages/proto/generated/notifications.ts`, which was committed as part of Task 3's intended scope)
- **Verification:** `bash packages/proto/generate.sh` exits 0 and produces a barrel with only the 15 real proto module namespaces (no `.d` suffix entries); `npm run build --workspace=packages/proto` exits 0
- **Committed in:** `ec0a019` (part of Task 3's commit)

**2. [Rule 3 - Blocking] Regenerated the Prisma client after repeated scoped `npm ci` runs**
- **Found during:** Post-Task-3 full-suite regression run (`cd backend && npm test`, recommended by the plan's `<verification>` section)
- **Issue:** This plan's Task 1 acceptance criteria required running `npm ci --workspace=backend --workspace=packages/proto` twice (once to verify the Dockerfile fix, once again before Task 3's final verification pass). Each scoped `npm ci` reinstalls `backend/node_modules` but does not run `prisma generate`, leaving `node_modules/.prisma/client` stale/incomplete relative to `schema.prisma`. This caused 19 of 52 test suites (unrelated to this plan's changes — ministry, settlement, marketplace/stays/wallet isolation specs) to fail to compile with `TS2694`/`TS2339` errors referencing missing `Prisma.Decimal`, `Prisma.sql`, `Prisma.PrismaClientKnownRequestError`, `Prisma.TransactionWhereInput`.
- **Fix:** Ran `npx prisma generate` in `backend/`. Full suite re-run: 52/52 suites, 611/611 tests passing.
- **Files modified:** None (generated artifact under `node_modules/`, not tracked)
- **Verification:** `cd backend && npx jest --runInBand` — 52 passed, 52 total; 611 passed, 611 total
- **Committed in:** N/A (no source files changed; regenerated build artifact only)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues that prevented the plan's own verification steps from completing, both caused transitively by running this plan's own mandated build/install commands in sequence)
**Impact on plan:** Both fixes were necessary to get the plan's stated verification commands to a genuinely green state. No scope creep beyond what was needed to unblock Task 3's verification and the plan's recommended full-suite regression check.

## Issues Encountered

- Mid-session environment restart interrupted the agent after Task 2's commit and before Task 3 began. The coordinator verified worktree state (commits `e7bbc05` and `94ffe59` intact, `notifications.proto` still 3 fields) and directed a clean resume from Task 3 — no rework of Tasks 1-2 was needed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three prerequisites this plan targeted are now verified working: Docker builds resolve `@iseyaa/proto` (confirmed via live `docker build` for both images, not just `npm ci`), `isTransientError()` classifies gRPC failures as transient, and `SendPushRequest.data` flows end-to-end to the server controller.
- Plan 17-03 (facade) and Plan 17-04 (cutover) can now proceed without inheriting a silently-inert resilience wrapper or a broken production Docker image.
- `GRPC-03` (notifications-service running as a genuinely separate deployable process with zero REST behavior change) is intentionally NOT marked complete by this plan — it is a phase-level requirement satisfied only once Plan 17-03's facade and Plan 17-04's live cutover land. This plan only removed blocking prerequisites.
- `packages/proto/generate.sh`'s barrel-filter fix is a durable correctness fix (not scoped to this plan's proto edit) — any future `build`-then-`generate` sequence in this directory will now produce a correct barrel.

---
*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Completed: 2026-07-19*
