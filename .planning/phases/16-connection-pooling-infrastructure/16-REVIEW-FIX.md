---
phase: 16-connection-pooling-infrastructure
fixed_at: 2026-07-18T23:30:00Z
review_path: .planning/phases/16-connection-pooling-infrastructure/16-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-07-18T23:30:00Z
**Source review:** .planning/phases/16-connection-pooling-infrastructure/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04)
- Fixed: 7
- Skipped: 0
- Out of scope (not attempted, per `fix_scope: critical_warning`): IN-01

## Fixed Issues

### CR-01: `@Cron` never registers in notifications-service — `ScheduleModule.forRoot()` is missing

**Files modified:** `backend/apps/notifications-service/src/app.module.ts`
**Commit:** e4812bf
**Applied fix:** Added `ScheduleModule` import and `ScheduleModule.forRoot()` to the `imports` array, matching the monolith's `app.module.ts`. This registers `ScheduleExplorer`, which scans providers for `@Cron` metadata — without it, `DbMetricsService.pollOpenConnections()` never ran in this process and the gauge stayed pinned at 0.

### CR-02: OTLP exporters POST to a URL missing the required `/v1/traces` / `/v1/metrics` signal path

**Files modified:** `backend/src/instrumentation.ts`
**Commit:** 69d98ee
**Applied fix:** Introduced `OTLP_BASE` (defaulting to empty string, not `undefined`, to avoid an `"undefined/v1/..."` URL) and appended `/v1/traces` and `/v1/metrics` explicitly to the trace and metric exporter URLs respectively, since the OTel SDK only auto-appends signal paths when `url` is left unset.

### CR-03: `instrumentation.ts` is never loaded for the notifications-service process

**Files modified:** `backend/package.json`, `backend/apps/notifications-service/tsconfig.app.json`, `backend/apps/notifications-service/Dockerfile`
**Commit:** 7d3d98a
**Applied fix:** Added a `start:prod:notifications-service` npm script that `--require`s `dist/instrumentation.js` before `dist/apps/notifications-service/src/main.js`. Additionally — beyond the review's literal suggestion — verified that `nest build notifications-service`'s `tsconfig.app.json` `include: ["src/**/*"]` (relative to `apps/notifications-service/`) does **not** actually reach `backend/src/instrumentation.ts`, since nothing imports it (by design — it's loaded via `--require`, not `import`) and TypeScript's include globs are relative to the tsconfig's own directory. Added an explicit `"../../src/instrumentation.ts"` entry to `include` so the build actually emits `dist/instrumentation.js` for this service. Updated the Dockerfile's `CMD` to add `--require ./backend/dist/instrumentation.js` ahead of the existing `main.js` invocation, per the task instruction to complete this wiring even though the Dockerfile was outside the original review's file set.

### WR-01: `CommonModule` pulls unrelated infrastructure into a narrowly-scoped gRPC microservice

**Files modified:** `backend/src/common/db-metrics.module.ts` (new file), `backend/apps/notifications-service/src/app.module.ts`
**Commit:** 8f13e50
**Applied fix:** Created a purpose-built `DbMetricsModule` exporting only `DbMetricsService`, and swapped notifications-service's `CommonModule` import for it. Verified (via grep across `backend/src/modules/notifications` and the gRPC controller) that nothing else in this microservice depends on any other `CommonModule` provider, so this is a safe narrowing. This also stops `SettlementService.onModuleInit()`'s redundant wallet-upsert writes from running on every notifications-service cold start.

### WR-02: `postgres_open_connections` gauge risks double/triple counting if summed across service instances

**Files modified:** `backend/src/common/services/db-metrics.service.ts`
**Commit:** c972313
**Applied fix:** Added an inline comment and rewrote the gauge's `description` string to explicitly state the metric is database-wide (not per-process) and that dashboards must use `max()`/`last()` across the `service.name` resource attribute rather than `sum()`.

### WR-03: k6 load test defaults to hitting the production API when `BASE_URL` is not explicitly set

**Files modified:** `load-tests/k6/main.js`
**Commit:** 6029148
**Applied fix:** Changed the `BASE_URL` fallback from `https://iseyaa-api.railway.app` to `http://localhost:3001`, so the documented smoke-test invocation (which omits `--env BASE_URL=...`) no longer silently targets the live production API.

### WR-04: `notifications-grpc-flow.js` leaks the gRPC client connection when `invoke()` throws

**Files modified:** `load-tests/k6/scenarios/notifications-grpc-flow.js`
**Commit:** 0c67af2
**Applied fix:** Wrapped the payload construction and `client.invoke(...)` call in `try { ... } finally { client.close(); }`, matching the review's suggested fix exactly, so the connection is always closed even if `invoke()` throws.

## Skipped Issues

None — all in-scope findings were fixed. IN-01 (`packages/proto/tsconfig.json` omits `strict` mode) was intentionally not attempted; it is Info-severity and outside `fix_scope: critical_warning`.

---

_Fixed: 2026-07-18T23:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
