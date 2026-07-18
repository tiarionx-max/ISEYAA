---
phase: 16-connection-pooling-infrastructure
plan: 02
subsystem: infra
tags: [opentelemetry, otel, prisma, postgres, pg_stat_activity, grafana-cloud, nestjs-schedule, observability]

# Dependency graph
requires:
  - phase: 02-free-first-infra-migration
    provides: OpenTelemetry/Grafana Cloud OTLP trace pipeline already live in backend/src/instrumentation.ts
provides:
  - DbMetricsService — cron-polls pg_stat_activity every 30s, exposes true combined open-connection count across all processes
  - postgres_open_connections OTel observable gauge, registered via metrics.getMeter('iseyaa-db')
  - metricReader wired into the existing NodeSDK, exporting metrics over the same Grafana Cloud OTLP pipeline already receiving traces
affects: [16-03-combined-topology-load-test, 16-04-grafana-alert-pool-02]

# Tech tracking
tech-stack:
  added: ["@opentelemetry/exporter-metrics-otlp-http@^0.218.0", "@opentelemetry/sdk-metrics@^2.7.1"]
  patterns:
    - "OTel observable gauge pattern: onModuleInit() acquires a meter via metrics.getMeter(name), creates an observable gauge, registers a callback that reads a service-level cached field (avoids awaiting DB calls inside the OTel callback itself)"
    - "Cron-cached-value pattern: @Cron poll writes to a private field; a synchronous getter/OTel callback reads the cached field — keeps the metrics export path free of live DB round-trips"

key-files:
  created:
    - backend/src/common/services/db-metrics.service.ts
    - backend/src/common/services/__tests__/db-metrics.service.spec.ts
  modified:
    - backend/src/common/common.module.ts
    - backend/src/instrumentation.ts
    - backend/package.json
    - package-lock.json

key-decisions:
  - "Placed DbMetricsService alphabetically between CsvExportService and DojahService in common.module.ts's providers/exports arrays (true string-sort order: 'Db' < 'Do'), not literally between DojahService and EncryptionService as the plan's action text stated — the plan's own stated intent was 'matching the file's existing alphabetical ordering', which this satisfies; the plan's literal instruction was internally inconsistent with that intent."
  - "Ran a one-time `npx prisma generate` in this worktree before the tsc verification — the worktree had no generated @prisma/client, causing ~40 unrelated pre-existing TS errors across ministry/tour-packages/transport/wallet modules; this is an environment-setup step, not a code change, and none of those files were touched by this plan."

requirements-completed: [POOL-02]

# Metrics
duration: ~20min
completed: 2026-07-18
---

# Phase 16 Plan 02: Postgres Connection Observability Pipeline Summary

**DbMetricsService cron-polls pg_stat_activity every 30s and exports a postgres_open_connections OTel observable gauge over the existing Grafana Cloud OTLP pipeline.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-18T19:20:07Z (approx, per STATE.md session continuity)
- **Completed:** 2026-07-18T19:31:59Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 (2 created, 3 modified) + package-lock.json

## Accomplishments

- `DbMetricsService` polls `pg_stat_activity` (filtered to `current_database()`) every 30 seconds via a typed `$queryRaw` tagged template, caching the count in a private field
- Registered a `postgres_open_connections` OTel observable gauge via `metrics.getMeter('iseyaa-db')` in `onModuleInit()`, with a callback that reads the cached count synchronously (no DB round-trip inside the OTel export path)
- `instrumentation.ts` now wires a `PeriodicExportingMetricReader` + `OTLPMetricExporter` into the existing `NodeSDK`, reusing the exact same `OTEL_EXPORTER_OTLP_ENDPOINT` / `GRAFANA_CLOUD_OTLP_TOKEN` env vars already proven for `traceExporter` — no new env var introduced
- `DbMetricsService` registered globally through `CommonModule` (providers + exports)
- Catch-block logs only `(err as Error)?.message`, never the raw error object or `DATABASE_URL`, per threat register T-16-04 (a Prisma connection failure's raw error can embed the connection string with its password)

## Task Commits

Each task was committed atomically:

1. **Task 1: DbMetricsService (cron poll + OTel gauge) + CommonModule registration** - `75aeb0a` (feat)
2. **Task 2: Wire OTel metricReader into instrumentation.ts + declare explicit dependencies** - `aca638b` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified

- `backend/src/common/services/db-metrics.service.ts` - New service: 30s cron poll of `pg_stat_activity`, exposes `getCurrentOpenConnections()`, registers the `postgres_open_connections` OTel observable gauge in `onModuleInit()`
- `backend/src/common/services/__tests__/db-metrics.service.spec.ts` - Covers the two required behaviors (successful count conversion; graceful failure with message-only logging and retained prior value) plus a default-value test
- `backend/src/common/common.module.ts` - Added `DbMetricsService` to both `providers` and `exports` arrays, alphabetically positioned before `DojahService`
- `backend/src/instrumentation.ts` - Added `metricReader` (PeriodicExportingMetricReader + OTLPMetricExporter) as a sibling to the existing `traceExporter`; additive only, no existing code removed/reordered
- `backend/package.json` - Added explicit `@opentelemetry/exporter-metrics-otlp-http@^0.218.0` and `@opentelemetry/sdk-metrics@^2.7.1` dependencies (previously only transitively hoisted, unverified in the manifest)
- `package-lock.json` - Regenerated via `npm install --workspace=backend` after the `package.json` edit

## Decisions Made

- Followed the plan's stated *intent* ("alphabetical ordering matching the file's existing convention") over its literal instruction text, which was internally contradictory (see key-decisions above). This is a documentation-accuracy fix, not a functional deviation — `DbMetricsService` is registered correctly either way.
- Ran `npx prisma generate` in the worktree to unblock `tsc --noEmit` verification; this is a one-time local environment setup action (the generated client lives in gitignored `node_modules/@prisma/client`), not a plan deviation requiring a commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran `npm install` at the workspace root and `npx prisma generate` in `backend/` before verification would run**
- **Found during:** Task 1, first verification attempt
- **Issue:** This git worktree had no `node_modules` installed at all (fresh worktree checkout), and after installing, `@prisma/client` had no generated types — `npx jest` failed with `Cannot find module '@nestjs/testing'` and `npx tsc --noEmit` produced ~40 pre-existing, plan-unrelated type errors across ministry/tour-packages/transport/wallet modules referencing missing Prisma-generated types.
- **Fix:** Ran `npm install` at the workspace root (installs all 4 workspaces + hoists `@opentelemetry/*` packages) and `npx prisma generate` in `backend/`. Neither command touches any tracked source file — `node_modules` and the generated Prisma client are both gitignored.
- **Files modified:** None (environment-only; `package-lock.json` changes were captured separately in Task 2's commit since Task 2's `npm install` for the new `@opentelemetry/*` deps regenerated it anyway)
- **Verification:** `npx jest db-metrics.service.spec.ts --bail` and `npx tsc --noEmit -p tsconfig.json` both pass cleanly after the fix
- **Committed in:** N/A (no source change; a required local setup step)

**2. [Documentation accuracy] Corrected common.module.ts's alphabetical placement per the plan's own stated rule**
- **Found during:** Task 1
- **Issue:** Plan's action text literally said "positioned alphabetically between DojahService and EncryptionService," but true alphabetical string-sort places `DbMetricsService` before `DojahService` (compare 'b' vs 'o' at index 1), i.e. between `CsvExportService` and `DojahService`.
- **Fix:** Placed the entry between `CsvExportService` and `DojahService` in both the `providers` and `exports` arrays, matching the plan's stated intent ("alphabetical ordering matching the file's existing convention") rather than the plan's literal (self-contradictory) instruction.
- **Files modified:** `backend/src/common/common.module.ts`
- **Verification:** Visual diff confirms correct alphabetical order (`CsvExportService, DbMetricsService, DojahService, EncryptionService, ...`)
- **Committed in:** `75aeb0a` (Task 1 commit)

---

**Total deviations:** 2 (1 blocking/environment, 1 documentation-accuracy correction)
**Impact on plan:** No scope creep. Both were necessary to complete verification correctly and to honor the plan's own stated intent.

## Issues Encountered

- Fresh worktree had zero `node_modules` and no generated Prisma client — resolved via `npm install` (workspace root) + `npx prisma generate` (backend). This is expected for any git-worktree-isolated executor and not specific to this plan's code changes.

## User Setup Required

None - no external service configuration required. Plan 16-04's checkpoint (separate plan) will confirm live Grafana Cloud metrics delivery via the Grafana Cloud UI; this plan only wires the code-side export path (per 16-RESEARCH.md Open Question 2, noted in the plan text).

## Next Phase Readiness

- `postgres_open_connections` gauge is code-complete and wired into the existing OTLP export pipeline, ready for Plan 16-03's combined-topology load test to read a live signal of total open Postgres connections
- Plan 16-04's Grafana alert (POOL-02, ROADMAP SC3) can now be built against a real exported metric name (`postgres_open_connections`) once live delivery is confirmed
- No blockers for downstream plans in this phase

---
*Phase: 16-connection-pooling-infrastructure*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: backend/src/common/services/db-metrics.service.ts
- FOUND: backend/src/common/services/__tests__/db-metrics.service.spec.ts
- FOUND: .planning/phases/16-connection-pooling-infrastructure/16-02-SUMMARY.md
- FOUND: commit 75aeb0a (Task 1)
- FOUND: commit aca638b (Task 2)
- FOUND: commit c50ef86 (SUMMARY.md)
