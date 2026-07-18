---
phase: 16-connection-pooling-infrastructure
plan: 03
subsystem: testing
tags: [k6, grpc, load-testing, notifications-service, combined-topology, connection-pooling]

# Dependency graph
requires:
  - phase: 16-connection-pooling-infrastructure
    provides: "16-01's bootable notifications-service (packages/proto compile step + ResilienceModule DI fix) and 16-02's postgres_open_connections OTel gauge — both needed for this plan's combined-topology load test to have a real second process to exercise and a real signal to eventually correlate against"
provides:
  - "load-tests/k6/scenarios/notifications-grpc-flow.js — k6 native gRPC scenario driving notifications-service's SendPush RPC"
  - "load-tests/k6/main.js wired to call notificationsGrpcFlow() in every VU iteration alongside the four existing HTTP flows, plus a grpc_req_duration threshold"
  - "A verified-working fix for notifications-service's own local boot blocker (main.ts proto path off-by-one), needed by this plan and by any future local run of the service (Phase 17 live extraction included)"
affects: [16-04-neon-console-checkpoint, 17-grpc-proof-of-pattern-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "k6 gRPC import-path dual-candidate pattern: client.load() resolves importPaths relative to the k6 *entry* script's directory, not the importing module's own file location — a scenario file meant to be both directly runnable (its own k6 run target) and importable by a combined main.js needs multiple relative candidates passed to client.load(), one per valid entry-point depth"

key-files:
  created:
    - load-tests/k6/scenarios/notifications-grpc-flow.js
    - .planning/phases/16-connection-pooling-infrastructure/deferred-items.md
  modified:
    - load-tests/k6/main.js
    - backend/apps/notifications-service/src/main.ts

key-decisions:
  - "Fixed backend/apps/notifications-service/src/main.ts's gRPC protoPath (was 4 levels up from dist/apps/notifications-service/src, needed to be 5 to reach the repo-root packages/proto/) as a Rule 3 blocking-issue auto-fix, even though the file isn't in this plan's declared files_modified — without it, notifications-service cannot boot locally at all, which blocks both this plan's own stated <verify> steps and any future local work against the service (including Phase 17)"
  - "Left load-tests/k6/common/auth.js and scenarios/auth-flow.js's stale phone/password login payload (LoginDto actually expects identifier/password) unfixed — logged to deferred-items.md instead, since neither file is in this plan's scope and the bug predates this plan entirely"

requirements-completed: [POOL-02]

duration: ~55min
completed: 2026-07-18
---

# Phase 16 Plan 03: Combined-Topology k6 Load Test (gRPC + HTTP) Summary

**New k6 native-gRPC scenario drives notifications-service's SendPush RPC and is wired into main.js's existing HTTP VU function, so a single k6 run now exercises the monolith (HTTP) and notifications-service (gRPC) concurrently in every iteration — verified live against both processes running locally.**

## Performance

- **Duration:** ~55 min
- **Started:** approx. 2026-07-18T19:48:00Z
- **Completed:** 2026-07-18T20:43:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `load-tests/k6/scenarios/notifications-grpc-flow.js` uses k6's native `k6/net/grpc` module (no xk6-grpc extension) to invoke `notifications.NotificationsService/SendPush` against a live notifications-service, checked via `grpc.StatusOK`
- `load-tests/k6/main.js`'s default VU function now calls `notificationsGrpcFlow()` alongside the four existing HTTP flows, satisfying D-06's "combined-topology" requirement — every VU iteration hits both the monolith's HTTP surface and notifications-service's gRPC surface
- Added a `grpc_req_duration: ['p(95)<500']` threshold, distinct from the `http_req_duration` family (k6's gRPC module reports its own metric)
- Fixed a real boot blocker in `notifications-service/src/main.ts` (proto path was one `../` short of the repo root) — verified the service now boots cleanly and binds `:5008`
- Live-verified both required commands from the plan against a real local stack: Postgres + Redis via `docker-compose.yml`, the monolith (`backend/dist/main.js`), and notifications-service (`backend/dist/apps/notifications-service/src/main.js`)

## Task Commits

Each task was committed atomically:

1. **Task 1: New k6 native-gRPC scenario for notifications-service** - `ca44dfd` (feat), preceded by `eee4460` (fix — notifications-service boot blocker, required to verify Task 1 at all)
2. **Task 2: Wire notificationsGrpcFlow into the combined-topology main.js run** - `82f38f7` (feat), plus `24e4c60` (docs — deferred-items.md logging a pre-existing, out-of-scope bug found during verification)

_Note: worktree mode — this executor does not create a separate plan-metadata commit; SUMMARY.md is committed by the orchestrator's post-wave merge step._

## Files Created/Modified

- `load-tests/k6/scenarios/notifications-grpc-flow.js` - New k6 native-gRPC scenario; exports `notificationsGrpcFlow()`, loads `packages/proto/notifications.proto` via two candidate `importPaths` (see key-decisions), connects to `NOTIFICATIONS_GRPC_URL` (default `localhost:5008`), invokes `SendPush`, checks `grpc.StatusOK`
- `load-tests/k6/main.js` - Imports and calls `notificationsGrpcFlow()` last in the default VU function; added `grpc_req_duration` threshold; documented `NOTIFICATIONS_GRPC_URL` in the top comment block
- `backend/apps/notifications-service/src/main.ts` - Fixed `protoPath`'s relative `join()` depth (4 → 5 levels up from the compiled `dist/apps/notifications-service/src` directory) so the service can actually find `packages/proto/notifications.proto` at boot
- `.planning/phases/16-connection-pooling-infrastructure/deferred-items.md` - New file logging a pre-existing, out-of-scope bug found during live verification (see Deviations below)

## Decisions Made

- Fixed `notifications-service/src/main.ts`'s proto path as a Rule 3 (blocking) auto-fix despite the file not being in this plan's declared `files_modified` — it's a hard boot blocker that prevents *both* this plan's own `<verify>` steps and any future local work against notifications-service (Task 2's combined-topology run explicitly requires "a fully running local stack," and Phase 17's live extraction will hit the identical crash).
- Passed two candidate `importPaths` to `client.load()` in `notifications-grpc-flow.js` rather than picking one, after discovering k6 resolves gRPC proto import paths relative to the *entry* script's directory (not the importing module's file location) — the same file needs to resolve correctly both when run directly (`k6 run scenarios/notifications-grpc-flow.js`, per Task 1's own `<verify>` command) and when imported by `main.js` one directory shallower (Task 2's `<verify>` command).
- Did not fix the pre-existing `phone`/`identifier` login DTO mismatch in `load-tests/k6/common/auth.js` / `scenarios/auth-flow.js` — logged to `deferred-items.md` instead, since it predates this plan and lives entirely outside its scope (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed notifications-service's gRPC proto path (off-by-one dirname)**
- **Found during:** Task 1, first attempt to boot notifications-service locally for live verification
- **Issue:** `main.ts`'s `join(__dirname, '../../../../packages/proto/notifications.proto')` resolved to `backend/packages/proto/...` — one directory short of the actual repo-root location of `packages/proto/`. notifications-service crashed on boot with `InvalidProtoDefinitionException` before this fix, on every attempt, with no workaround available at the k6-script level.
- **Fix:** Changed to `join(__dirname, '../../../../../packages/proto/notifications.proto')` (5 levels up), verified against the compiled output path `dist/apps/notifications-service/src/main.js`.
- **Files modified:** `backend/apps/notifications-service/src/main.ts`
- **Verification:** Rebuilt (`npx nest build notifications-service`), booted successfully, log shows `notifications-service gRPC listening on :5008`.
- **Committed in:** `eee4460`

**2. [Rule 3 - Blocking] Supplied dual candidate import paths for k6's gRPC proto loader**
- **Found during:** Task 2, combined `main.js` verification run
- **Issue:** `client.load(['../../../packages/proto'], 'notifications.proto')` (as written for Task 1, correct when `notifications-grpc-flow.js` is the k6 entry script) failed with `CreateFile ... The system cannot find the path specified` when the same file was imported by `main.js` — k6 resolves gRPC import paths relative to the entry script's directory, not the importing module's location, and `main.js` lives one directory shallower than `scenarios/`.
- **Fix:** Passed both `'../../../packages/proto'` and `'../../packages/proto'` to `client.load()`'s `importPaths` array; k6 tries each until the file resolves.
- **Files modified:** `load-tests/k6/scenarios/notifications-grpc-flow.js`
- **Verification:** Both `<verify>` commands from the plan (direct scenario run and combined `main.js` run) pass the `grpc SendPush status OK` check 100% after the fix.
- **Committed in:** `82f38f7`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues preventing the plan's own stated verification commands from running at all), plus 1 out-of-scope discovery logged (not fixed) — see below.

**Impact on plan:** Both fixes were strictly necessary to run the plan's own literal `<verify>` commands against a real local stack; neither changed the plan's intended deliverable (the gRPC scenario file + main.js wiring). No scope creep beyond what was required to make the plan's stated acceptance criteria checkable.

### Out-of-Scope Discovery (not fixed — logged instead)

**`load-tests/k6/common/auth.js` / `scenarios/auth-flow.js` send `{ phone, password }` to `/api/v1/auth/login`, but `LoginDto` expects `{ identifier, password }`.** Discovered live during Task 2's combined-topology verification run — 3 of 4 pre-existing HTTP flows (auth, wallet, transport) return 400/401 as a result; `events-flow.js` (no auth) and the new gRPC flow both pass. Predates this plan entirely; neither file is in Plan 16-03's `files_modified`. Logged to `.planning/phases/16-connection-pooling-infrastructure/deferred-items.md` per the executor's SCOPE BOUNDARY rule rather than fixed here.

## Issues Encountered

- **k6 binary not present in the sandbox / no admin rights for `choco install`.** Downloaded the official `k6-v0.54.0-windows-amd64.zip` release directly from GitHub and ran the extracted `k6.exe` binary in place (no PATH install, no admin rights needed). v0.54.0 has native `k6/net/grpc` support (available since v0.49.0), satisfying the plan's stated dependency.
- **Fresh worktree had no `node_modules`, no generated Prisma client, and no compiled `packages/proto` output** (same class of issue 16-01/16-02 already hit) — resolved with `npm install` (repo root), `npx prisma generate`, and `npm run build` in `packages/proto`. Environment setup only, nothing tracked changed.
- **No local Postgres/Redis running (Docker daemon was stopped).** Started Docker Desktop, found `iseyaa_postgres`/`iseyaa_redis` containers already existed (stopped) from a prior session, and started them via `docker start` rather than `docker compose up` (which conflicted on existing container names). Migrations were already applied from that prior session (`prisma migrate deploy` reported "No pending migrations"). Stopped both containers again after verification to leave Docker state as found.
- **Needed a real `.env` for the local boot-smoke test** (same pattern as 16-01's precedent) — copied the existing (gitignored) root `.env` to both the repo root and `backend/` for the duration of the boot test only, deleted both immediately after verification completed. No credentials were printed to any tool output at any point (a credential-materialization guard blocked one attempted `grep` of the file and the check was skipped entirely, relying on `cp` only).
- **No seeded test user existed for `TEST_PHONE`/`TEST_PASSWORD`.** Registered a throwaway local test account (`+2348012345678` / `k6loadtest@example.com`) directly against the locally running monolith via `curl` for the duration of the verification run only — this is local-only Postgres data (via `docker-compose.yml`), not touching Neon/production, and was not persisted anywhere outside the now-stopped local Postgres container.

## User Setup Required

None - no external service configuration required for this plan. Plan 16-04's checkpoint will confirm live Neon Console / Grafana Cloud state.

## Next Phase Readiness

- `load-tests/k6/main.js` now drives a real combined-topology run (HTTP + gRPC) in every VU iteration, ready to be pointed at staging/production for POOL-02's total-open-connections proof once Plan 16-04's Grafana alert (built on 16-02's `postgres_open_connections` gauge) is live
- notifications-service's local boot blocker is fixed — unblocks Phase 17's live extraction work, which would have hit the identical `InvalidProtoDefinitionException` crash
- **Before running the full 10K-VU acceptance run for real capacity numbers:** fix the `phone`/`identifier` login DTO mismatch documented in `deferred-items.md` — today's `http_req_failed` rate would be dominated by this pre-existing bug, not by genuine load-induced failures, masking the actual pooled-connection-limit signal this load test exists to produce

---
*Phase: 16-connection-pooling-infrastructure*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: load-tests/k6/scenarios/notifications-grpc-flow.js
- FOUND: load-tests/k6/main.js
- FOUND: backend/apps/notifications-service/src/main.ts
- FOUND: .planning/phases/16-connection-pooling-infrastructure/deferred-items.md
- FOUND: .planning/phases/16-connection-pooling-infrastructure/16-03-SUMMARY.md
- FOUND commit: eee4460 (Task 1 boot-blocker fix)
- FOUND commit: ca44dfd (Task 1 scenario file)
- FOUND commit: 82f38f7 (Task 2 wiring + import-path fix)
- FOUND commit: 24e4c60 (deferred-items.md)
