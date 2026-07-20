---
phase: 20-grpc-blue-green-healthcheck-retrofit
plan: 05
subsystem: infra
tags: [runbook, blue-green, canary, notifications-service, madge, jest, e2e, ci-gate]

# Dependency graph
requires:
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    plan: 01
    provides: "notifications-service /healthz + grpc.health.v1.Health RPC, railway.toml healthcheckPath wiring"
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    plan: 02
    provides: "Distributed cron-lock guard pattern on all 6 GRPC-06b-named crons"
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    plan: 03
    provides: "grpc.notifications_service.canary_enabled kill-switch + zero-circular-dependency module graph"
  - phase: 20-grpc-blue-green-healthcheck-retrofit
    plan: 04
    provides: "wallet-invariant.e2e-spec.ts rewrite + test:e2e:tours wired into CI, fully green"
provides:
  - "docs/blue-green-cutover-runbook.md — the operator-executable, sequenced blue-green cutover procedure GRPC-06c requires, with an explicit rollback path and Pitfall 2 warning"
  - "Confirmed-green full backend regression: 57 unit suites/700 tests, test:e2e:tours (2 suites/17 tests), test:e2e:settlement-splits (pre-existing DB-state gate, 2 skipped as before), test:e2e:settlement-disputes (1 suite/3 tests), zero circular dependencies via madge"
affects: ["21-low-risk-grpc-extraction (inherits this runbook pattern for its own new service cutovers)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First docs/ top-level directory in the repo — markdown-only operational runbooks, no new tooling (D-04)"

key-files:
  created:
    - docs/blue-green-cutover-runbook.md
  modified: []

key-decisions:
  - "Runbook documents the 6-step sequence verbatim from the plan's <interfaces> block (canary off -> Railway health-gated swap -> direct synthetic verification -> canary on -> 15-min actively-watched bake -> flag-flip rollback), reproducing the exact PATCH endpoint/body and config key name rather than paraphrasing"
  - "Pitfall 2 called out explicitly as its own labeled warning inside Step 5: the Grafana/circuit-breaker signals are only meaningful after the canary flag flips back on in Step 4, since Step 1 already made the monolith stop calling notifications-service entirely"
  - "All 3 known manual-only checks (Railway healthcheck-blocks-promotion, concurrent cron-replica dedup, breaker-tuning lever) recorded in the runbook with one-line rationale each, per 20-VALIDATION.md's Manual-Only Verifications table — none silently dropped"

patterns-established:
  - "docs/ as the location for future operator runbooks (e.g. Phase 21's own service cutovers can extend this same file rather than starting a new one, per the runbook's own intro sentence)"

requirements-completed: [GRPC-06c]

# Metrics
duration: 20min
completed: 2026-07-20
---

# Phase 20 Plan 05: Blue-Green Cutover Runbook + Full Cross-Plan Regression Sweep Summary

**Authored `docs/blue-green-cutover-runbook.md` (the repo's first `docs/` file) documenting the 6-step sequenced blue-green cutover procedure with its rollback path and Pitfall-2 warning, then ran the full cross-plan regression sweep — 57 unit suites/700 tests, both e2e suites, and a zero-circular-dependency madge scan — confirming Plans 01-04's combined changes leave the codebase fully green.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-20T14:40:00Z (approx)
- **Completed:** 2026-07-20T15:00:00Z (approx)
- **Tasks:** 2/2 completed
- **Files modified:** 1 created, 0 modified

## Accomplishments

- `docs/blue-green-cutover-runbook.md` created with: Prerequisites section (Railway dashboard, SUPER_ADMIN/LGA_ADMIN JWT, Grafana Cloud access); the exact 6-step sequenced procedure (canary flag off via `PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled` with `{"value": false}` → Railway health-gated container swap → direct synthetic verification against the new container, bypassing the canary flag entirely → canary flag back on with `{"value": true}` → 15-minute actively-watched bake window → flag-flip rollback); a dedicated Rollback section; a Bake window section defining "actively watched" operationally; and a Known manual-only checks section listing all 3 items from 20-VALIDATION.md
- Confirmed the exact `CANARY_FLAG_KEY = 'grpc.notifications_service.canary_enabled'` string and the `resilience.notificationsGrpc.breaker_failure_threshold` PlatformConfig key against source (`notifications-client.service.ts:12`, `resilience.service.ts:90`) before writing them into the runbook, and cross-checked the admin controller's `PATCH config/:key` route (`admin.controller.ts:96-100`) for the exact endpoint shape
- Full cross-plan regression sweep, all green:
  - `npm test -- --forceExit --passWithNoTests` → 57 suites, 700 tests passing (includes 20-01's 2 new health specs and 20-02's 12 new lock-guard test cases)
  - `npm run test:e2e:tours -- --forceExit --passWithNoTests` → 2 suites (`wallet-invariant.e2e-spec.ts`, `e2e-tour-booking.e2e-spec.ts`), 17 tests passing (20-03's circular-dependency fix + 20-04's rewrite both hold)
  - `npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests` → 1 suite, 2 tests skipped (pre-existing DB-state gate, unchanged from before this plan), exit 0
  - `npm run test:e2e:settlement-disputes -- --forceExit --passWithNoTests` → 1 suite, 3 tests passing
  - `npx madge --circular --extensions ts --ts-config tsconfig.json src/app.module.ts` → "No circular dependency found!" (196 files scanned)
  - Full chained command (all 5 in sequence, `&&`-joined exactly as the plan's `<automated>` verify block specifies) → exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Author docs/blue-green-cutover-runbook.md** - `21fbe7c` (docs)
2. **Task 2: Full cross-plan regression sweep** - verification-only, no files modified, no commit (per plan's own `<files>` note: "none — verification-only task, no files modified")

**Plan metadata:** (this commit — SUMMARY.md only, worktree mode; STATE.md/ROADMAP.md owned by orchestrator)

## Files Created/Modified

- `docs/blue-green-cutover-runbook.md` - First file in a new top-level `docs/` directory; the operator-executable blue-green cutover procedure required by GRPC-06c, covering `notifications-service` today and extensible to future Phase 21 extractions

## Decisions Made

- Reproduced the exact PATCH endpoint path, body shape, and `grpc.notifications_service.canary_enabled` config key verbatim in the runbook (not paraphrased), matching the plan's explicit instruction and the actual source (`notifications-client.service.ts:12`)
- Placed Pitfall 2's warning inline inside Step 5 (not just in a separate "gotchas" appendix) so an operator reading the steps in order encounters the warning at the exact point it matters — immediately after being told to watch the two rollback-trigger signals
- Documented "actively watched" operationally (human keeps the Grafana dashboard open and refreshing for the full 15 minutes) rather than leaving it as an abstract adjective, per the plan's explicit requirement

## Deviations from Plan

None — plan executed exactly as written. Task 1 produced the runbook exactly per the `<interfaces>` block's 6-step sequence; Task 2 ran the exact 5-command verification chain specified in the plan's `<automated>` block with zero failures, so no regression-fixing was needed.

## Issues Encountered

- **Missing `node_modules` in the git worktree:** consistent with 20-02/20-03/20-04's prior notes, this worktree checkout had no installed dependencies. Resolved identically — Windows junctions (`mklink /J`) pointing `node_modules` and `backend/node_modules` at the main working tree's already-installed packages (read-only reuse, no `package.json`/lockfile changes, gitignored, never staged).
- **No `.env` in the worktree:** copied the main working tree's root `.env` into the worktree root (gitignored, never staged) to provide `DATABASE_URL`/`REDIS_URL` for the e2e suites, which require a real local Postgres 16 + Redis 7 instance.

## User Setup Required

None — no external service configuration required for this plan's own scope. The runbook itself documents prerequisites an *operator* needs (Railway dashboard access, a SUPER_ADMIN/LGA_ADMIN JWT, Grafana Cloud access) for actually *running* a cutover in the future — those are operational prerequisites for using the artifact this plan produced, not setup required to complete this plan.

## Next Phase Readiness

- GRPC-06c is now demonstrably satisfied: the documented, sequenced, operator-executable rollback path exists (`docs/blue-green-cutover-runbook.md`), and the underlying primitives it assembles (20-01's health check, 20-02's cron locks, 20-03's canary kill-switch, 20-04's green `test:e2e:tours` CI gate) are all confirmed working together with zero cross-plan regressions.
- Phase 20 is complete: all 3 requirement IDs (GRPC-06a, GRPC-06b, GRPC-06c) are satisfied across Plans 01-05.
- Phase 21 (Low-Risk gRPC Extraction) can proceed — its hard prerequisite (a working health-gated blue-green pattern) is now fully built and documented, and this runbook is explicitly designed to be extended (not replaced) for Phase 21's new service cutovers.
- Remaining known-manual items (Railway healthcheck-blocks-promotion test, concurrent-cron-replica test, live Grafana dashboard confirmation of a real cutover) are recorded in the runbook itself and in 20-VALIDATION.md — not blockers, but real operator-executed verifications that remain open until a live Railway cutover is actually run.

## Known Stubs

None — this plan produced a markdown-only documentation artifact and ran verification commands; no code, UI, or data-flow stubs were introduced.

## Threat Flags

None — the runbook introduces no new network endpoints, auth paths, or schema changes; it documents existing, already-gated surfaces (the admin config PATCH endpoint, already `SUPER_ADMIN`/`LGA_ADMIN` + `JwtAuthGuard`-protected). Consistent with this plan's own `<threat_model>` (T-20-12 mitigated by the runbook's numbered/sequential steps; T-20-13 accepted per D-04's explicit scope).

---
*Phase: 20-grpc-blue-green-healthcheck-retrofit*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: `docs/blue-green-cutover-runbook.md` (exists, contains the exact `canary_enabled` string 4 times, all 6 sequencing steps, the 15-minute bake window, Pitfall 2's warning, all 3 known manual-only checks)
- FOUND commit `21fbe7c` in `git log --oneline --all`
- CONFIRMED: full regression chain (`npm test`, `npm run test:e2e:tours`, `npm run test:e2e:settlement-splits`, `npm run test:e2e:settlement-disputes`, `npx madge --circular`) exits 0 with zero failures — 57 unit suites/700 tests, 2 e2e:tours suites/17 tests, 1 settlement-splits suite/2 skipped (pre-existing gate), 1 settlement-disputes suite/3 tests, zero circular dependencies
