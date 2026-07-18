---
phase: 16-connection-pooling-infrastructure
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/apps/notifications-service/src/app.module.ts
  - backend/apps/notifications-service/src/main.ts
  - backend/package.json
  - backend/src/common/common.module.ts
  - backend/src/common/services/__tests__/db-metrics.service.spec.ts
  - backend/src/common/services/db-metrics.service.ts
  - backend/src/instrumentation.ts
  - backend/src/prisma/__tests__/prisma-config.spec.ts
  - load-tests/k6/main.js
  - load-tests/k6/scenarios/notifications-grpc-flow.js
  - packages/proto/package.json
  - packages/proto/tsconfig.json
findings:
  critical: 3
  warning: 4
  info: 1
  total: 8
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 16 wires DB connection-pool observability (`DbMetricsService` + a `postgres_open_connections` OTel gauge) into the monolith and the new `notifications-service` gRPC microservice, plus adds a k6 load-test scenario for the gRPC surface. The unit-level code (the gauge/cron polling logic, the Prisma config-presence test, the k6 scenario file) is individually well-written and defensively coded (e.g. the careful "never log the raw connection string" comment in `db-metrics.service.ts`). However, tracing the code across module boundaries surfaces three independently-provable BLOCKERs that together mean the phase's actual goal — observing DB connections "across all processes (monolith + notifications-service)" — silently does not work for the notifications-service process, and OTLP export is broken for **both** processes:

1. `notifications-service`'s `AppModule` never imports `ScheduleModule.forRoot()`, so `@Cron()` never actually gets registered by `@nestjs/schedule` in that microservice — `pollOpenConnections()` never runs there.
2. `instrumentation.ts` passes the *same* base `OTEL_EXPORTER_OTLP_ENDPOINT` value verbatim as `url` to both the trace and metric OTLP exporters. Because `url` is explicitly supplied, the OTel SDK does **not** auto-append the required `/v1/traces` / `/v1/metrics` signal path (that auto-append only happens when `url` is left `undefined` and the SDK resolves it from env internally). Both signals get POSTed to the same un-suffixed base URL — this breaks OTLP export for the monolith too, not just notifications-service.
3. `notifications-service`'s `main.ts`/`package.json` never load `instrumentation.ts` for that process (no `--require` wiring anywhere reachable from these files, unlike the monolith's `start:prod` script), so even if (1) and (2) were fixed, that process's OTel SDK is never started at all.

Additional WARNING-level design issues: importing the full `CommonModule` (17 providers + 2 HTTP controllers, including Paystack/S3/Dojah/Vector/Settlement) into a narrowly-scoped gRPC-only microservice; a metric-semantics risk with the new gauge; and a hardcoded production `BASE_URL` default in the k6 harness.

## Critical Issues

### CR-01: `@Cron` never registers in notifications-service — `ScheduleModule.forRoot()` is missing

**File:** `backend/apps/notifications-service/src/app.module.ts:10-18`
**Issue:** `DbMetricsService.pollOpenConnections()` (`backend/src/common/services/db-metrics.service.ts:28-40`) is decorated with `@Cron(CronExpression.EVERY_30_SECONDS)`. `@nestjs/schedule`'s cron wiring is provided **only** by the dynamic module returned from `ScheduleModule.forRoot()` (`node_modules/@nestjs/schedule/dist/schedule.module.js`): it registers `ScheduleExplorer`, which is the `OnModuleInit` hook that actually scans providers for `@Cron` metadata and calls `schedulerOrchestrator.addCron(...)`. Without `ScheduleModule.forRoot()` imported anywhere in a given Nest application's module graph, `ScheduleExplorer` is never instantiated, so the scan/registration step never runs — **silently, with no error thrown**.

`notifications-service`'s `AppModule` imports `CommonModule` (which provides `DbMetricsService` globally) but does not import `ScheduleModule`. Compare with the monolith's `backend/src/app.module.ts`, which does `ScheduleModule.forRoot()`. As a result, the `postgres_open_connections` gauge in the notifications-service process is permanently stuck at its initial value of `0` — the cron poll that would update it never fires. This directly contradicts the gauge's own description string: "Combined open Postgres connection count across all processes (monolith + notifications-service)".

**Fix:**
```ts
// backend/apps/notifications-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    CommonModule,
    NotificationsModule,
  ],
  controllers: [NotificationsGrpcController],
})
export class AppModule {}
```
Note this is likely also missing from every other `apps/*-service/app.module.ts` that imports `CommonModule` (e.g. `wallet-service`) — worth a follow-up sweep, though those files are outside this review's scope.

### CR-02: OTLP exporters POST to a URL missing the required `/v1/traces` / `/v1/metrics` signal path

**File:** `backend/src/instrumentation.ts:8-25`
**Issue:** Both exporters are constructed with the **exact same** `url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT`:
```ts
traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT, ... }),
metricReader: new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT, ... }),
  ...
}),
```
Per the OTel JS SDK's URL-resolution logic (`@opentelemetry/otlp-exporter-base/build/src/configuration/otlp-http-configuration.js: mergeOtlpHttpConfigurationWithDefaults`), when `url` is explicitly supplied by the caller it is used **verbatim** (`validateUserProvidedUrl` only parses/normalizes it, it does not append anything). The `/v1/traces` and `/v1/metrics` signal-resource-path suffixing (`getHttpConfigurationDefaults`) is only applied when `url` is left `undefined` and the SDK resolves it from `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` internally via `getNodeHttpConfigurationFromEnvironment`.

Because this code explicitly passes the same base endpoint as `url` for both exporters, traces are POSTed to `<OTEL_EXPORTER_OTLP_ENDPOINT>` and metrics are POSTed to the **same** `<OTEL_EXPORTER_OTLP_ENDPOINT>` — neither includes the signal-specific path. Grafana Cloud's OTLP gateway (referenced by `GRAFANA_CLOUD_OTLP_TOKEN`) requires requests at `<gateway>/v1/traces` and `<gateway>/v1/metrics` respectively. As written, neither signal will be delivered correctly (expect 404s or a collector-side routing failure) — this breaks OTel export for **every** process that loads `instrumentation.ts`, including the monolith, not just notifications-service. It directly defeats the purpose of `DbMetricsService`'s `postgres_open_connections` gauge (Phase 16's stated goal) since the exported metric never reaches Grafana.

**Fix:**
```ts
const OTLP_BASE = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '';
const authHeader = { Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN ?? ''}` };

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${OTLP_BASE}/v1/traces`,
    headers: authHeader,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${OTLP_BASE}/v1/metrics`,
      headers: authHeader,
    }),
    exportIntervalMillis: 30000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
```
(Alternatively, omit `url` entirely on both exporters and let the SDK's own env-based resolution auto-append the signal path — but headers must still be supplied explicitly either way since `GRAFANA_CLOUD_OTLP_TOKEN` isn't a standard OTel env var.)

### CR-03: `instrumentation.ts` is never loaded for the notifications-service process

**File:** `backend/apps/notifications-service/src/main.ts:1-19`, `backend/package.json:6-19`
**Issue:** `instrumentation.ts` carries the explicit contract "loaded via `--require` BEFORE `main.ts`; do NOT import NestJS modules here" — it must be required as a `node --require` flag before the process's entrypoint, since it needs to patch modules before they're first `require()`'d elsewhere. The monolith's `start:prod` script does this correctly: `"start:prod": "node --require ./dist/instrumentation.js dist/main.js"`.

For `notifications-service`, there is no equivalent. `backend/apps/notifications-service/src/main.ts` calls `NestFactory.createMicroservice(...)` directly with no `--require` wiring anywhere reachable from `main.ts` or `package.json` — `package.json` has exactly one `start:prod` script and it targets the monolith's `dist/main.js`, not `dist/apps/notifications-service/.../main.js`. (Corroborating evidence outside the reviewed file set: `backend/apps/notifications-service/Dockerfile`'s `CMD` runs `node ./backend/dist/apps/notifications-service/src/main.js` directly, with no `--require` flag at all.)

Net effect: even after fixing CR-01 and CR-02, the notifications-service process never initializes the OpenTelemetry SDK, so `metrics.getMeter('iseyaa-db')` in `db-metrics.service.ts` resolves against the OTel API's default no-op `MeterProvider` — the observable gauge callback exists but is never actually exported anywhere.

**Fix:** Add a dedicated prod-start script (and wire it into the Dockerfile CMD, outside this review's file set) so the microservice also loads instrumentation before boot:
```json
"start:prod:notifications-service": "node --require ./dist/instrumentation.js dist/apps/notifications-service/src/main.js"
```
`nest build notifications-service` must emit `dist/instrumentation.js` too (it currently does, since `instrumentation.ts` lives under `backend/src/` which is part of the default build's `rootDir`) — verify the per-app `tsconfig.app.json` build includes it, then update `backend/apps/notifications-service/Dockerfile`'s `CMD` to use this script instead of invoking `main.js` directly.

## Warnings

### WR-01: `CommonModule` pulls unrelated infrastructure (Paystack, S3, Dojah, Vector, Settlement, Upload) into a narrowly-scoped gRPC microservice

**File:** `backend/apps/notifications-service/src/app.module.ts:16`, `backend/src/common/common.module.ts:22-64`
**Issue:** `notifications-service`'s only job is `SendPush`/`RegisterToken` over gRPC, yet importing the `@Global() CommonModule` drags in 17 providers and 2 HTTP controllers (`SettlementController`, `UploadController`) that are entirely unrelated to notifications and unreachable in a `Transport.GRPC`-only microservice context (no HTTP adapter is mounted, so these controllers' `@Get`/`@Post` routes are dead weight). Concretely:
- `SettlementService.onModuleInit()` runs `ensureSystemWallet()` (two Prisma `upsert` writes) on **every cold start / restart** of this service, purely as a side effect of pulling in `CommonModule` — redundant DB writes unrelated to notifications, on every Railway restart (`restartPolicyMaxRetries = 3` in `railway.toml` compounds this on flapping deploys).
- `SettlementController`/`UploadController` are instantiated with `JwtAuthGuard`/`ApiBearerAuth` dependencies that assume an HTTP request pipeline this microservice doesn't have.
- Larger blast radius: a config/DI regression in any of the 17 `CommonModule` providers (Paystack, S3, Dojah, Vector, etc.) can now break notifications-service bootstrap even though none of those services are used by notifications.

**Fix:** Extract just `DbMetricsService` (and any other providers notifications-service genuinely needs) into a smaller, purpose-built module (e.g. `DbMetricsModule`) that `notifications-service` imports directly, instead of importing the entire `CommonModule`.

### WR-02: `postgres_open_connections` gauge risks double/triple counting if summed across service instances

**File:** `backend/src/common/services/db-metrics.service.ts:14-21,31-33`
**Issue:** The query `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()` already returns the **database-wide** total connection count, regardless of which process runs it — it is not scoped to the querying process's own connections. Once CR-01 is fixed and both the monolith and notifications-service export this same-named gauge (`postgres_open_connections`) via OTLP, each process will report the *same* database-wide total as its own reading. Grafana/Prometheus typically differentiate time series by resource attributes such as `service.name`/`job`; a dashboard panel that does `sum(postgres_open_connections)` across those series would double the true connection count (or worse, with more replicas). The description string ("Combined open Postgres connection count across all processes") reads as if this metric is *meant* to be summed, which is incorrect given how it's computed.
**Fix:** Either (a) update the description/comment to explicitly instruct dashboard authors to use `max()`/`last()` across instances rather than `sum()`, since every instance reports the same database-wide total, or (b) scope the query per-process (e.g. filter by `pid = pg_backend_pid()` won't give a meaningful "open connections" number, so (a) is the more realistic fix) and clarify the metric semantics in the code comment.

### WR-03: k6 load test defaults to hitting the production API when `BASE_URL` is not explicitly set

**File:** `load-tests/k6/main.js:1-2,30`
**Issue:** `const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';` — the file's own header comment documents the smoke-test invocation as `k6 run --vus 50 --duration 60s load-tests/k6/main.js` with **no** `--env BASE_URL=...`, meaning that command (as documented) targets the live production API by default, not a local/staging environment. Given `options.stages` ramps to 10,000 VUs and this is a live citizen-facing government platform (per `CLAUDE.md`: real Paystack payment flows, wallet operations), an operator forgetting `--env BASE_URL=https://staging.railway.app` on the "full acceptance run" command risks running a 10k-VU load test against production.
**Fix:** Default `BASE_URL` to a safe local value (e.g. `http://localhost:3001`) and require `--env BASE_URL=...` explicitly for any non-local run, or add a runtime guard that refuses to proceed against the production hostname unless a `CONFIRM_PROD=1` env var is also set.

### WR-04: `notifications-grpc-flow.js` leaks the gRPC client connection when `invoke()` throws

**File:** `load-tests/k6/scenarios/notifications-grpc-flow.js:13-29`
**Issue:** `client.connect(...)` and `client.invoke(...)` are not wrapped in `try/finally`; if `connect()` or `invoke()` throws (e.g. connection refused, deadline exceeded), `client.close()` on line 28 is skipped for that iteration, leaving the connection unclosed for the remainder of the VU's lifecycle.
**Fix:**
```js
export default function notificationsGrpcFlow() {
  client.connect(__ENV.NOTIFICATIONS_GRPC_URL || 'localhost:5008', { plaintext: true });
  try {
    const payload = {
      user_id: __ENV.TEST_USER_ID || 'k6-load-test-user',
      title: 'Load test',
      body: 'ping',
    };
    const res = client.invoke('notifications.NotificationsService/SendPush', payload);
    check(res, { 'grpc SendPush status OK': (r) => r && r.status === grpc.StatusOK });
  } finally {
    client.close();
  }
}
```

## Info

### IN-01: `packages/proto/tsconfig.json` omits `strict` mode, inconsistent with the rest of the monorepo

**File:** `packages/proto/tsconfig.json:1-13`
**Issue:** Every other workspace's `tsconfig.json` (`shared/tsconfig.json` sets `"strict": true`; `backend/tsconfig.json` explicitly documents its relaxed settings) makes a deliberate choice about strictness. `packages/proto/tsconfig.json` sets neither `strict` nor any of the individual strict flags, defaulting to non-strict. Since this package only compiles `ts-proto`-generated code, this is low-risk, but worth aligning for consistency if hand-written helpers are ever added to `packages/proto/generated/index.ts`.
**Fix:** Add `"strict": true` (or explicitly document why not, mirroring `backend/tsconfig.json`'s comment-free-but-explicit relaxed flags).

---

_Reviewed: 2026-07-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
