---
phase: 10-documentation-correction-grpc-build-fix
plan: 02
subsystem: infra
tags: [nestjs, typescript, docker, grpc, tsconfig, build]

# Dependency graph
requires:
  - phase: 10-documentation-correction-grpc-build-fix (plan 01)
    provides: Corrected ROADMAP.md/PROJECT.md documentation reflecting the real proto-only gRPC state
provides:
  - 8 working per-service TypeScript builds (auth, wallet, events, stays, marketplace, admin, ai, notifications-service) via nest build <service>
  - backend/package.json build:services script looping all 8 service builds
  - 8 Dockerfiles that fail loudly on a compile error (no error-masking) with corrected CMD entrypoints
  - Clean backend/apps/wallet-service/src with a .gitignore rule preventing recurrence of stray compiled artifacts
affects: [phase-16-connection-pooling, phase-17-grpc-proof-of-pattern-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-service tsconfig.app.json widens rootDir to backend/ (../..) instead of widening the shared base tsconfig.json, preserving the monolith's own dist/main.js output path"
    - "Dockerfile RUN lines never swallow build errors (no 2>/dev/null || true); a failed nest build now fails the docker build"

key-files:
  created: []
  modified:
    - backend/apps/auth-service/tsconfig.app.json
    - backend/apps/wallet-service/tsconfig.app.json
    - backend/apps/events-service/tsconfig.app.json
    - backend/apps/stays-service/tsconfig.app.json
    - backend/apps/marketplace-service/tsconfig.app.json
    - backend/apps/admin-service/tsconfig.app.json
    - backend/apps/ai-service/tsconfig.app.json
    - backend/apps/notifications-service/tsconfig.app.json
    - backend/package.json
    - backend/apps/auth-service/Dockerfile
    - backend/apps/wallet-service/Dockerfile
    - backend/apps/events-service/Dockerfile
    - backend/apps/stays-service/Dockerfile
    - backend/apps/marketplace-service/Dockerfile
    - backend/apps/admin-service/Dockerfile
    - backend/apps/ai-service/Dockerfile
    - backend/apps/notifications-service/Dockerfile
    - .gitignore

key-decisions:
  - "Widened rootDir at the per-service tsconfig.app.json level only, not the shared backend/tsconfig.json — keeps the monolith's own build output at dist/main.js, avoiding a breaking change to the live Railway start:prod command"
  - "Verified backend/npm run build:services (a POSIX for-loop script) using a scoped npm_config_script_shell env override pointing at Git Bash, rather than a persistent .npmrc/global config change, since Windows npm defaults script-shell to cmd.exe which cannot parse POSIX for loops — the script itself is correct and will run natively on Linux/Docker/CI where npm's default script-shell is sh"

patterns-established:
  - "Per-service TypeScript build config override pattern: extend the shared base tsconfig.json unmodified, override rootDir only in the leaf tsconfig.app.json when a service needs cross-directory imports into backend/src"
  - "Dockerfile build steps must never mask compile failures with 2>/dev/null || true; any nest build RUN line failing should fail the docker build"

requirements-completed: [GRPC-01]

# Metrics
duration: 7min
completed: 2026-07-15
---

# Phase 10 Plan 02: gRPC Service Build Fix Summary

**All 8 backend/apps/*-service gRPC scaffolds now build cleanly with `nest build <service>` exiting 0 and zero TypeScript errors; every Dockerfile fails loudly on a compile error instead of silently shipping a stale image.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-15T21:53:32Z
- **Completed:** 2026-07-15T21:59:56Z
- **Tasks:** 3 completed
- **Files modified:** 18

## Accomplishments
- Fixed the uniform TS6059 build failure across all 8 gRPC service scaffolds by widening `rootDir` to `../..` in each service's `tsconfig.app.json`, leaving `backend/tsconfig.json` (the monolith's own build config) byte-identical
- Added a `build:services` npm script that loops `nest build` across all 8 services and exits non-zero on any failure
- Removed the `2>/dev/null || true` error-masking pattern from all 8 Dockerfiles' `nest build` RUN lines, plus auth-service's dead fallback to a nonexistent `apps/auth-service/tsconfig.json`, so a broken compile now fails the docker build loudly instead of shipping a stale image
- Corrected every Dockerfile's CMD entrypoint from the previously-wrong `./backend/apps/SERVICE/dist/main.js` to the real nest-build output path `./backend/dist/apps/SERVICE/src/main.js`
- Removed 6 stray untracked compiled `.js`/`.js.map` artifacts from `backend/apps/wallet-service/src` and added a `.gitignore` rule to prevent recurrence

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen rootDir per-service, add build:services script, verify all 8 builds succeed** - `96611ac` (fix)
2. **Task 2: Remove Dockerfile error-masking and correct CMD entrypoint paths for all 8 services** - `0af25f0` (fix)
3. **Task 3: Remove stray compiled JS artifacts, add .gitignore rule, run full-plan verification** - `66bd1d2` (chore)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `backend/apps/{auth,wallet,events,stays,marketplace,admin,ai,notifications}-service/tsconfig.app.json` - Added `"rootDir": "../.."` so each service's compile can reach `backend/src` without a TS6059 rootDir violation
- `backend/package.json` - Added `build:services` script (POSIX for-loop over all 8 `nest build` invocations)
- `backend/apps/{auth,wallet,events,stays,marketplace,admin,ai,notifications}-service/Dockerfile` - Removed error-masking build patterns; split combined prisma-generate+build RUN lines for admin/ai/stays/marketplace/notifications-service; corrected CMD entrypoints to the real `backend/dist/apps/SERVICE/src/main.js` path
- `.gitignore` - Added `backend/apps/*/src/**/*.js` and `backend/apps/*/src/**/*.js.map` rules

## Decisions Made
- Per-service `rootDir` widening (not shared base) — see key-decisions in frontmatter for full rationale
- Used a scoped `npm_config_script_shell` environment override (not a persistent config change) to verify the POSIX `build:services` script locally on Windows, since the script is intentionally sh-style and will run correctly wherever npm's default script-shell is `/bin/sh` (Linux CI, Docker containers) — no change was needed to the script content itself, which matches the plan's exact specification

## Deviations from Plan

None - plan executed exactly as written. All three tasks, all acceptance criteria, and the plan-level verification block passed without requiring architectural changes or unplanned fixes.

## Issues Encountered
- Windows local `npm run build:services` invokes `cmd.exe` by default (not a POSIX shell), which cannot parse the `for s in ... do ... done` script syntax specified by the plan. This is an environment-specific quirk of running `npm run` natively on Windows, not a defect in the script itself — the script is correct and portable POSIX syntax consistent with the repo's existing Dockerfile RUN-line conventions (which execute inside Linux containers via `sh`). Verified correctness by running the script with `npm_config_script_shell` scoped to Git Bash for this session only, confirming exit 0 across all 8 services without altering any persistent project or global configuration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GRPC-01 satisfied: all 8 service scaffolds build cleanly and their Dockerfiles fail loudly on compile errors — a safe foundation for Phase 16 (Connection Pooling Infrastructure, depends on Phase 10) and Phase 17 (gRPC Proof-of-Pattern Extraction, depends on Phases 10/13/16)
- No blockers identified for Plan 03 or downstream phases

---
*Phase: 10-documentation-correction-grpc-build-fix*
*Completed: 2026-07-15*
