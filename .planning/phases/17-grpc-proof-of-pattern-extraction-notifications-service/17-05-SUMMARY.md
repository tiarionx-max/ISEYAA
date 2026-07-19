---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
plan: 05
subsystem: infra
tags: [docker-compose, env-config, notifications-service, grpc, local-dev-topology]

# Dependency graph
requires:
  - phase: 17 (plans 01-04)
    provides: notifications-service gRPC scaffold, NotificationsClientModule facade consuming NOTIFICATIONS_SERVICE_URL
provides:
  - docker-compose.yml notifications-service service block (independent container, port 5008)
  - backend service wired to reach notifications-service via NOTIFICATIONS_SERVICE_URL=notifications-service:5008 and depends_on
  - .env.example documentation marking NOTIFICATIONS_SERVICE_URL as a live, consumed config value with dev + Railway examples
affects: [17-06 (verification/wrap-up), any future phase extracting a second gRPC service and needing a docker-compose template to copy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["docker-compose service block for a gRPC microservice built from a production Dockerfile with repo-root build context (to include packages/proto workspace source), using service_started depends_on for gRPC-only services with no HTTP healthcheck endpoint"]

key-files:
  created: []
  modified:
    - docker-compose.yml
    - .env.example

key-decisions:
  - "Reused the existing production backend/apps/notifications-service/Dockerfile for the compose block instead of authoring a new Dockerfile.dev — no dev-loop live-reload Dockerfile exists for this service today; accepted the simpler no-live-reload tradeoff for local topology testing (per plan)"
  - "Used service_started (not service_healthy) for backend's depends_on on notifications-service — no HTTP healthcheck endpoint exists for this gRPC-only service today"
  - "Reused the existing NOTIFICATIONS_SERVICE_URL placeholder var in .env.example rather than introducing a new NOTIFICATIONS_GRPC_URL var — zero .env.example churn, matches convention for the other 7 not-yet-live services"

patterns-established:
  - "gRPC microservice docker-compose block pattern: build context '.' (repo root) + dockerfile path into backend/apps/<service>/Dockerfile, env_file .env, explicit DATABASE_URL/REDIS_URL overrides for compose DNS names, depends_on postgres/redis service_healthy"

requirements-completed: [GRPC-03]

# Metrics
duration: 5min
completed: 2026-07-19
---

# Phase 17 Plan 05: Docker Compose + .env.example Local Dev Topology Summary

**Added notifications-service as an independently-built, independently-running container in docker-compose.yml (repo-root build context, port 5008) and documented NOTIFICATIONS_SERVICE_URL in .env.example as the one live, consumed gRPC target URL among the 8 placeholder vars.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-19T01:35:16Z
- **Completed:** 2026-07-19T01:35:31Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `docker-compose up` now brings up notifications-service alongside postgres/redis/backend/web as a genuinely separate container, built from the production `backend/apps/notifications-service/Dockerfile` with repo-root build context (required for the `packages/proto` workspace source to be in the Docker build context)
- Backend container gains `NOTIFICATIONS_SERVICE_URL: notifications-service:5008` (compose DNS service name, not localhost) and a `depends_on: notifications-service: condition: service_started` entry
- `.env.example` now documents `NOTIFICATIONS_SERVICE_URL` as the one live, consumed Phase 17 config value (read by `NotificationsClientModule`'s `ClientsModule.registerAsync` factory), with an inline dev-mode example distinguishing docker-compose (`notifications-service:5008`) from bare-metal dev (`localhost:5008`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add notifications-service to docker-compose.yml's local dev topology** - `757483b` (feat)
2. **Task 2: Document NOTIFICATIONS_SERVICE_URL as a live, consumed config value in .env.example** - `4776363` (docs)

_Plan metadata commit made separately per worktree protocol (SUMMARY.md + REQUIREMENTS.md only; STATE.md/ROADMAP.md excluded — orchestrator owns those)._

## Files Created/Modified
- `docker-compose.yml` - New `notifications-service` top-level service block (build context `.`, dockerfile `backend/apps/notifications-service/Dockerfile`, container_name `iseyaa_notifications_service`, port `5008:5008`, depends_on postgres/redis `service_healthy`); backend service gains `NOTIFICATIONS_SERVICE_URL` env var and a `service_started` dependency on notifications-service
- `.env.example` - Comment above `NOTIFICATIONS_SERVICE_URL=` noting Phase 17 live consumption by `NotificationsClientModule`; new dev-mode example comment below it documenting the docker-compose vs. bare-metal `nest start` resolution difference

## Decisions Made
- Reused the production Dockerfile rather than authoring a `Dockerfile.dev` for notifications-service — no dev-loop live-reload variant exists yet for gRPC service scaffolds, and authoring one was explicitly out of this plan's scope. Accepted the simpler no-live-reload tradeoff; local topology testing (verifying the container boots and is reachable) does not require hot-reload.
- Used `service_started` instead of `service_healthy` for backend's dependency on notifications-service, since no HTTP healthcheck endpoint exists for this gRPC-only service today. Adding one is future scaffolding work, not in scope here.
- Kept `NOTIFICATIONS_SERVICE_URL` as the single variable name (no new `NOTIFICATIONS_GRPC_URL`) — resolves RESEARCH.md's Open Question 1 with zero `.env.example` churn and matches the convention already set for the other 7 not-yet-live `*_SERVICE_URL` placeholders.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their acceptance criteria on first pass.

## Issues Encountered
- `docker compose config` initially failed with "env file .env not found" (the worktree has no `.env`, only `.env.example`, since `.env` is gitignored). This is expected/correct behavior, not a bug — the compose file legitimately requires `.env` at runtime. Verified YAML validity by temporarily copying `.env.example` to `.env`, running `docker compose config` (passed cleanly, only the pre-existing unrelated `version` attribute deprecation warning appeared), then deleting the temporary `.env` file before committing. No file was left in a dirty/uncommitted state.

## User Setup Required

None - no external service configuration required. Local `docker-compose up` will now build and start notifications-service automatically once a real `.env` is present (already a pre-existing requirement for `docker-compose up` in general).

## Next Phase Readiness
- `docker-compose.yml` and `.env.example` now genuinely reflect notifications-service as a separately-deployed process in local dev, matching the Railway topology this phase targets (ROADMAP.md success criterion 2)
- No blockers for Plan 17-06 (verification/wrap-up) — this plan's must-haves (docker-compose entry + `.env.example` documentation) are both satisfied and committed

---
*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Completed: 2026-07-19*
