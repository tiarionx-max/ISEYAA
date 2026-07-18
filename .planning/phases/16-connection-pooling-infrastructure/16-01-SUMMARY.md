---
phase: 16-connection-pooling-infrastructure
plan: 01
subsystem: infra
tags: [prisma, neon, connection-pooling, grpc, nestjs, resilience, typescript-build]

# Dependency graph
requires:
  - phase: 10-documentation-correction-grpc-build-fix
    provides: notifications-service gRPC scaffold that builds cleanly (nest build exit 0)
  - phase: 11-resilience-wrapping
    provides: ResilienceModule + ResilienceService (cockatiel circuit-breaker/retry/timeout/fallback)
provides:
  - packages/proto with a working tsc build step producing real require()-able generated/*.js + *.d.ts output (INT-02 fix)
  - notifications-service AppModule that boots without a Nest DI resolution error (ResilienceModule wired into its own bootstrap tree)
  - Documented Neon -pooler DATABASE_URL pattern (monolith connection_limit=20, notifications-service connection_limit=5, both pool_timeout=10) + DIRECT_URL in .env.example
  - Corrected MANUAL-ACTIONS.md DATABASE_URL guidance (stale pgbouncer=true replaced with -pooler + connection_limit/pool_timeout) and a Phase 16 manual-action stub section
  - backend/src/prisma/__tests__/prisma-config.spec.ts config-presence guard for the -pooler/connection_limit pattern
affects: [16-02-grafana-connection-gauge, 16-03-combined-topology-load-test, 16-04-neon-console-checkpoint, 17-grpc-proof-of-pattern-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-tsc workspace build (packages/proto/tsconfig.json) mirrors shared/tsconfig.json's compile pattern but compiles in place (outDir=rootDir=generated) instead of to a separate dist/"
    - "gRPC service scaffolds (backend/apps/*-service) need their own explicit @Global()-module imports — @Global() only broadcasts within the NestFactory tree it was imported into, not across separate bootstrap trees"

key-files:
  created:
    - packages/proto/tsconfig.json
    - backend/src/prisma/__tests__/prisma-config.spec.ts
  modified:
    - packages/proto/package.json
    - backend/apps/notifications-service/src/app.module.ts
    - .env.example
    - MANUAL-ACTIONS.md
    - .gitignore
    - package-lock.json

key-decisions:
  - "packages/proto/generated/*.js and *.d.ts compiled output added to .gitignore (not committed) — treated as regenerable build output analogous to backend/dist/, consistent with the codebase's existing dist/build gitignore pattern; only the ts-proto-generated *.ts sources stay tracked"
  - "tsconfig.json needed an explicit exclude: [\"node_modules\"] to work around a tsc quirk where outDir === the include-root directory causes TypeScript to silently auto-exclude the entire outDir (matching zero input files) when no exclude array is specified"
  - "Rephrased two explanatory 'don't use pgbouncer' mentions in .env.example/MANUAL-ACTIONS.md to avoid the literal substring 'pgbouncer=true', since the plan's acceptance criteria required zero occurrences of that exact string even in prose explaining not to use it"

patterns-established:
  - "Config-presence spec pattern (bare process.env assertion, no TestingModule) for guarding deploy-time env var shape — first instance of this pattern in the codebase, see backend/src/prisma/__tests__/prisma-config.spec.ts"

requirements-completed: [POOL-01]

duration: 25min
completed: 2026-07-18
---

# Phase 16 Plan 01: Fix Boot Blockers + Document Pooled Connection Strings Summary

**Fixed packages/proto's missing tsc compile step and notifications-service's ResilienceModule DI gap (both hard boot blockers), then documented Neon's `-pooler` DATABASE_URL pattern with explicit `connection_limit`/`pool_timeout` for both processes, backed by a config-presence test.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-18T19:10:00Z (approx.)
- **Completed:** 2026-07-18T19:34:49Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified, including package-lock.json and .gitignore as auto-fixes)

## Accomplishments
- `packages/proto` now has a real `build` script (`tsc -p tsconfig.json`) that compiles `generated/*.ts` to real, `require()`-able `.js`/`.d.ts` output — previously `nest build` passed via tsc's lenient module resolution while `require('@iseyaa/proto')` would fail at real Node.js runtime
- `notifications-service` boots cleanly with no Nest DI resolution error — verified via a 4-second boot-smoke run that reaches `AppModule dependencies initialized` / `CommonModule dependencies initialized` and is killed only by the timeout (exit 124), not by a crash
- `.env.example` and `MANUAL-ACTIONS.md` document the POOL-01 pattern concretely: monolith gets `connection_limit=20`, notifications-service gets `connection_limit=5`, both on Neon's `-pooler` hostname with `pool_timeout=10` and zero occurrences of the legacy `pgbouncer=true` flag
- A passing config-presence test (`backend/src/prisma/__tests__/prisma-config.spec.ts`) guards the `-pooler`/`connection_limit` pattern going forward, skipping the assertion for local dev

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix packages/proto compile step (INT-02)** - `fb2b3b5` (fix)
2. **Task 2: Fix notifications-service ResilienceModule DI blocker** - `f0b819e` (fix)
3. **Task 3: Document pooled connection string (POOL-01) + config-presence test** - `83eb596` (docs)

_Note: worktree mode — this executor does not create a separate plan-metadata commit; SUMMARY.md is committed by the orchestrator's post-wave merge step._

## Files Created/Modified
- `packages/proto/package.json` - Added `build` script + `typescript` devDependency
- `packages/proto/tsconfig.json` - New compile-in-place tsconfig for `generated/*.ts` (mirrors `shared/tsconfig.json`, minus `strict`)
- `.gitignore` - Added `packages/proto/generated/*.js` and `*.d.ts` as regenerable build output
- `backend/apps/notifications-service/src/app.module.ts` - Added `ResilienceModule` import, positioned between `RedisModule` and `CommonModule`
- `.env.example` - Documented `DIRECT_URL` under Database section; replaced the stale single-line Neon example under Production Deployment with monolith + notifications-service pooled `DATABASE_URL` examples, `DIRECT_URL`, and the 83-connection Grafana alert threshold comment
- `MANUAL-ACTIONS.md` - Corrected the `DATABASE_URL` row's stale legacy-pgbouncer guidance; appended a Phase 16 manual-action stub section ending in a `16-approved` resume signal
- `backend/src/prisma/__tests__/prisma-config.spec.ts` - New config-presence test
- `package-lock.json` - Synced with the new `typescript` devDependency added to `packages/proto/package.json`

## Decisions Made
- Compiled `packages/proto/generated/*.js`/`*.d.ts` output is gitignored rather than committed — the plan's `files_modified` list only named `package.json`/`tsconfig.json`, and this matches the codebase's existing pattern of gitignoring build output (`backend/dist/`, `dist/`, `build/`). The `.ts` sources (already tracked, produced by `generate.sh`) remain committed as the source of truth.
- Rephrased two "don't use `pgbouncer=true`" explanatory comments to avoid the literal substring, since the plan's acceptance criteria required zero occurrences of that exact string anywhere in `.env.example`/`MANUAL-ACTIONS.md`, including in prose warning against it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worked around a tsc quirk that silently matched zero input files**
- **Found during:** Task 1 verification (`npx tsc -p tsconfig.json`)
- **Issue:** With `outDir` and `rootDir` both set to `"generated"` and `include: ["generated/**/*.ts"]` (compile-in-place, as the plan specified), TypeScript auto-excludes `outDir` by default when no `exclude` array is present in the config — since `outDir` was identical to the include-root directory, this silently excluded every input file (`error TS18003: No inputs were found`).
- **Fix:** Added an explicit `"exclude": ["node_modules"]` to `packages/proto/tsconfig.json`. Specifying any `exclude` array (even one that doesn't mention `generated`) suppresses TypeScript's automatic outDir-exclusion default.
- **Files modified:** `packages/proto/tsconfig.json`
- **Verification:** `npx tsc -p tsconfig.json` exits 0; all 16 proto modules + `index` compile to `.js`/`.d.ts`
- **Committed in:** `fb2b3b5` (Task 1 commit)

**2. [Rule 3 - Blocking] npm ci failed with EUSAGE after adding the typescript devDependency**
- **Found during:** Task 2, attempting to build/boot-smoke-test notifications-service
- **Issue:** `packages/proto/package.json`'s new `typescript` devDependency (added in Task 1) wasn't reflected in `package-lock.json`, so `npm ci` refused to install (`Missing: typescript@5.3.3 from lock file`). The worktree also had no `node_modules` at all initially.
- **Fix:** Ran `npm install` at the repo root to both populate `node_modules` and sync `package-lock.json`.
- **Files modified:** `package-lock.json`
- **Verification:** `npx nest build notifications-service` exits 0 after the lockfile sync
- **Committed in:** `f0b819e` (Task 2 commit)

**3. [Rule 3 - Blocking] `nest build notifications-service` failed on a pre-existing Prisma type error until `prisma generate` ran**
- **Found during:** Task 2 build verification
- **Issue:** `src/common/services/settlement.service.ts` referenced `Prisma.PrismaClientKnownRequestError`, which only exists on the generated `@prisma/client` types — the client hadn't been generated yet in this fresh worktree install.
- **Fix:** Ran `npx prisma generate` (schema/codegen step, not a code change — nothing to commit).
- **Files modified:** none (generated artifact, gitignored via existing `node_modules` exclusion)
- **Verification:** `npx nest build notifications-service` exits 0 afterward
- **Committed in:** N/A (no source change; environment setup only)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues preventing task completion, no scope creep). None required an architectural decision or changed the plan's actual deliverables.
**Impact on plan:** All three fixes were necessary purely to get the plan's own stated verification commands to run in a fresh worktree checkout; the plan's intended code changes (packages/proto build script + tsconfig, ResilienceModule wiring, .env.example/MANUAL-ACTIONS.md/spec) were implemented exactly as specified.

## Issues Encountered
- The boot-smoke verification for Task 2 requires a valid `ENCRYPTION_KEY` (64 hex chars) to reach past `EncryptionService`'s constructor, and `ConfigModule.forRoot({ isGlobal: true })` in `notifications-service/src/app.module.ts` (unlike the monolith's `AppModule`) has no explicit `envFilePath`, so it reads `.env` relative to `backend/`'s cwd, not the repo root. A local, gitignored `.env` (never committed) was created at both the repo root and `backend/` purely to run the boot-smoke test, then deleted immediately after — this is a pre-existing env-loading gap in the gRPC service scaffolds' `ConfigModule.forRoot()` calls (same category as the Quick Task 260716-lbl fix already applied to the monolith's `AppModule`), out of this plan's stated INT-02/ResilienceModule scope, and not something a real deploy would hit since Railway env vars are injected directly rather than read from a `.env` file.

## User Setup Required

None - no external service configuration required for this plan. Plan 16-04's checkpoint will walk the live Neon Console + Grafana Cloud confirmation steps referenced by the new MANUAL-ACTIONS.md Phase 16 stub section.

## Next Phase Readiness
- `notifications-service` is now a real, bootable second process — Plan 16-03's combined-topology load test has a second process to exercise
- `require('@iseyaa/proto')` resolves real compiled output locally; Docker's `@iseyaa/proto` module-resolution gap (tracked separately in STATE.md's pending todos, out of this plan's scope) still needs its own fix before Phase 17's live extraction, since the Dockerfile never invokes `packages/proto`'s new build script and the compiled output isn't committed to git
- The `-pooler`/`connection_limit` documentation and config-presence test are ready for Plan 16-04's checkpoint to reconcile against the live Neon Console's actual `max_connections` ceiling
- Flagged for Plan 16-04 or a future todo: `notifications-service/src/app.module.ts`'s `ConfigModule.forRoot()` should probably get the same `envFilePath` fix as the monolith's `AppModule` before a real multi-process deploy relies on `.env`-file-based config anywhere other than Railway env var injection

---
*Phase: 16-connection-pooling-infrastructure*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: packages/proto/tsconfig.json
- FOUND: backend/src/prisma/__tests__/prisma-config.spec.ts
- FOUND: .planning/phases/16-connection-pooling-infrastructure/16-01-SUMMARY.md
- FOUND commit: fb2b3b5 (Task 1)
- FOUND commit: f0b819e (Task 2)
- FOUND commit: 83eb596 (Task 3)
