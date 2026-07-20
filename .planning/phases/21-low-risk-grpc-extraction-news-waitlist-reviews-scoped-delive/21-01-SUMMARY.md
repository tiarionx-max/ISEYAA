---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
plan: 01
subsystem: infra
tags: [grpc, resilience, cockatiel, nestjs, docker-compose, railway, blue-green-deploy]

# Dependency graph
requires:
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    provides: "Healthcheck-gated blue-green cutover pattern (railway.toml healthcheckPath, canary-flag PATCH endpoint, 6-step runbook procedure) proven live with notifications-service"
provides:
  - "Vendor union + RESILIENCE_DEFAULTS entries for newsGrpc/waitlistGrpc/reviewsGrpc/deliveryOtpGrpc, ready for ResilienceService.execute() calls in later plans"
  - "nest-cli.json project registrations for news-service/waitlist-service/reviews-service/delivery-otp-service (apps/<name> scaffolds to be created by later plans)"
  - "backend/package.json build:services script covering all 12 apps/*-service names"
  - ".env.example placeholders (ports 5009-5012) for the 4 new service URLs"
  - "docker-compose.yml service blocks + backend wiring for the 4 new services (Dockerfiles to be created by later plans)"
  - "docs/blue-green-cutover-runbook.md sections for each of the 4 new services (own canary flag key, port, resilience vendor key) plus a D-05 risk-ascending rollout order note"
affects: [21-02-news-service-extraction, 21-03-waitlist-service-extraction, 21-04-reviews-service-extraction, 21-05-delivery-otp-service-extraction, 21-06, 21-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vendor resilience registration: add a Vendor union member + matching RESILIENCE_DEFAULTS entry mirroring an existing same-shape vendor (fcm/notificationsGrpc) rather than inventing new tuning"
    - "Per-service canary flag key convention: grpc.<service_name>_service.canary_enabled (opt-out semantics per D-06)"
    - "docker-compose service block convention: build.context '.', build.dockerfile 'backend/apps/<name>/Dockerfile', container_name 'iseyaa_<name_with_underscores>', shared DATABASE_URL/REDIS_URL, dedicated port, depends_on postgres+redis healthy"

key-files:
  created: []
  modified:
    - backend/src/resilience/resilience.types.ts
    - backend/nest-cli.json
    - backend/package.json
    - .env.example
    - docker-compose.yml
    - docs/blue-green-cutover-runbook.md

key-decisions:
  - "Followed the notifications-service precedent exactly for all 4 new vendors/services rather than introducing per-service tuning variance, since none of the 4 extractions are wallet-adjacent (GRPC-05/GRPC-07 scoping decision already made at phase-planning time)"
  - "docker-compose.yml service blocks reference Dockerfiles that don't exist yet (apps/<name>/Dockerfile created in later plans) — docker compose config validates the YAML/interpolation without requiring those files to exist"
  - "nest-cli.json project entries reference tsconfig.app.json paths that don't exist yet for the same reason — expected until later plans scaffold apps/<name>/"

patterns-established:
  - "Pattern 1: 4-way mechanical scaffolding fan-out — every shared config file (resilience types, nest-cli, package.json, .env.example, docker-compose, runbook) gets the same 4 additions in the same order (News, Waitlist, Reviews, Delivery OTP), avoiding wave-ordering conflicts across the 4 staggered per-service extraction plans"

requirements-completed: [GRPC-07, GRPC-08]

# Metrics
duration: ~20min
completed: 2026-07-20
---

# Phase 21 Plan 01: Shared gRPC Extraction Scaffolding Summary

**Registered 4 new gRPC vendor resilience policies, nest-cli.json project entries, build:services coverage, .env.example placeholders, docker-compose service blocks, and blue-green runbook sections for News/Waitlist/Reviews/Delivery OTP — pure configuration, zero domain logic, matching the notifications-service precedent exactly four times over.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-20T22:04:40Z
- **Tasks:** 2/2 completed
- **Files modified:** 6

## Accomplishments
- `resilience.types.ts`'s `Vendor` union and `RESILIENCE_DEFAULTS` now register `newsGrpc`/`waitlistGrpc`/`reviewsGrpc`/`deliveryOtpGrpc` with the same `{timeoutMs:5000, retryCount:1, failureThreshold:8, halfOpenAfterMs:20000}` tuning as `notificationsGrpc`
- `nest-cli.json` has 12 top-level project entries (8 pre-existing + 4 new), and `build:services` now iterates all 12 service names
- `.env.example` and `docker-compose.yml` are pre-wired for the 4 new services (URLs on ports 5009-5012, service blocks, `depends_on`/`environment` wiring on `backend`) so each per-service extraction plan only has to add its own `apps/<name>/` directory and Dockerfile, never touch these shared files
- `docs/blue-green-cutover-runbook.md` gained 4 new per-service cutover sections (own canary flag key, gRPC port, resilience vendor key) plus an explicit D-05 risk-ascending rollout order note (News -> Waitlist -> Reviews -> Delivery OTP), with the existing `notifications-service` section left byte-for-byte unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Register the 4 new gRPC vendors in resilience.types.ts + nest-cli.json + package.json build:services** - `b0aa0f3` (feat)
2. **Task 2: Wire .env.example, docker-compose.yml, and extend the blue-green cutover runbook for all 4 new services** - `c0f8ebb` (feat)

**Plan metadata:** (this commit, made after this summary)

## Files Created/Modified
- `backend/src/resilience/resilience.types.ts` - Added newsGrpc/waitlistGrpc/reviewsGrpc/deliveryOtpGrpc to Vendor union + RESILIENCE_DEFAULTS
- `backend/nest-cli.json` - Added news-service/waitlist-service/reviews-service/delivery-otp-service project entries
- `backend/package.json` - Extended build:services script to cover all 12 apps/*-service names
- `.env.example` - Added NEWS_SERVICE_URL/WAITLIST_SERVICE_URL/REVIEWS_SERVICE_URL/DELIVERY_OTP_SERVICE_URL placeholders (ports 5009-5012)
- `docker-compose.yml` - Added 4 new service blocks + backend depends_on/environment wiring for news-service/waitlist-service/reviews-service/delivery-otp-service
- `docs/blue-green-cutover-runbook.md` - Added 4 new per-service cutover sections + D-05 rollout-order note; existing notifications-service section unchanged

## Decisions Made
- Mirrored `notificationsGrpc`'s exact tuning and inline comment rationale for all 4 new vendors rather than inventing per-service tuning, per plan instruction and since same-region Railway-internal gRPC hop rationale applies identically to all 4
- Placed the new `.env.example` placeholders after the existing `NOTIFICATIONS_SERVICE_URL` line and its explanatory dev-mode comment (rather than splitting the var from its comment) to preserve readability while still satisfying "immediately after" placement intent
- Added the D-05 rollout-order note at the top of the newly-added runbook block (not at the very top of the whole document) per the plan's explicit placement instruction ("near the top of the new content")

## Deviations from Plan

None - plan executed exactly as written. Two blocking-issue fixes were needed to make the plan's own `<verify>` commands actually runnable in this worktree (Rule 3 — auto-fix blocking issues, not scope changes to the plan's file list):

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran `npm install` and `npx prisma generate` to make `tsc --noEmit` runnable**
- **Found during:** Task 1 verification
- **Issue:** This worktree had no `node_modules` (gitignored, never installed) and no generated Prisma client, so `npx tsc --noEmit -p tsconfig.json` failed with hundreds of `Cannot find module` / missing-Prisma-model errors unrelated to this plan's changes — the build environment itself was not bootstrapped, not a code defect
- **Fix:** Ran `npm install --prefer-offline --no-audit --no-fund` at the workspace root, then `npx prisma generate` in `backend/`
- **Files modified:** None (installs `node_modules`, generates Prisma client — both gitignored, not committed)
- **Verification:** `cd backend && npx tsc --noEmit -p tsconfig.json` exits 0 after the install
- **Committed in:** N/A (gitignored artifacts, not part of any task commit)

**2. [Rule 3 - Blocking] Created a temporary local `.env` (copied from `.env.example`) to make `docker compose config` runnable**
- **Found during:** Task 2 verification
- **Issue:** `docker-compose.yml`'s `backend`/`web` services reference `env_file: .env`; this worktree had no `.env` (gitignored, contains real secrets in the main repo, correctly not checked in), so `docker compose -f docker-compose.yml config` failed with `env file ... not found` before it could even parse/validate the YAML this plan modified
- **Fix:** Temporarily copied `.env.example` to `.env` for local validation only, ran `docker compose -f docker-compose.yml config` (exit 0, full interpolated config printed including all 4 new service blocks and URL vars), then deleted the temporary `.env` immediately after
- **Files modified:** None persisted (`.env` is gitignored and was deleted after verification; never staged or committed)
- **Verification:** `docker compose -f docker-compose.yml config` exits 0; confirmed via `git status --short` that no `.env` remained afterward
- **Committed in:** N/A (temporary local file only, not committed)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — environment bootstrap blockers, zero code/config changes beyond what the plan specified)
**Impact on plan:** No scope creep. Both fixes were required only to execute the plan's own `<verify>` commands in this fresh worktree; neither altered any tracked file beyond the plan's specified `files_modified` list.

## Issues Encountered
None beyond the two blocking-issue fixes documented above.

## User Setup Required

None - no external service configuration required. This plan touches only in-repo config/scaffolding files; no secrets, no new environment variables requiring real values (all 4 new `*_SERVICE_URL` entries are non-secret Railway-internal DNS placeholders following the existing 8-service pattern).

## Next Phase Readiness

- Plans 21-02 through 21-05 (the 4 per-service extractions) can now each add only their own `apps/<name>/` directory + Dockerfile without touching any shared config file — `resilience.types.ts`, `nest-cli.json`, `package.json`, `.env.example`, `docker-compose.yml`, and the runbook are all pre-wired for all 4 services simultaneously, eliminating wave-ordering conflicts across the D-04/D-05 staggered rollout.
- `npx nest build <service>` will still fail for the 4 new service names until their `apps/<name>/tsconfig.app.json` files exist (expected — created by the per-service extraction plans, not a gap in this plan).
- No blockers for the next plan in wave order.

---
*Phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive*
*Completed: 2026-07-20*
