# Phase 16: Connection Pooling Infrastructure - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 10
**Analogs found:** 8 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/__tests__/prisma-config.spec.ts` | test | request-response (config-presence assertion) | `backend/src/redis/__tests__/redis.service.spec.ts` (structure only) | partial — no prior precedent for a bare env-var-assertion spec in this codebase |
| `backend/apps/notifications-service/src/app.module.ts` | module (DI wiring) | request-response | `backend/apps/wallet-service/src/app.module.ts` (already correctly wired) | exact — same file shape, sibling gRPC scaffold, just missing one import |
| `backend/src/common/services/db-metrics.service.ts` | service | batch (scheduled poll → gauge) | `backend/src/modules/stays/stays.service.ts` (`releaseEscrow` cron) + `backend/src/modules/admin/admin.service.ts` (`$queryRaw` typed rows) | role-match (cron) + role-match (raw SQL) — composite analog |
| `backend/src/instrumentation.ts` | config (OTel bootstrap) | event-driven (SDK init) | itself (existing file, additive change) | exact — extend, don't replace |
| `.env.example` | config | request-response (env template) | itself (existing file, additive change) | exact |
| `packages/proto/package.json` | config (build script) | build/transform | `shared/package.json` (`"build": "tsc"` workspace pattern) | exact |
| `packages/proto/tsconfig.json` | config | build/transform | `shared/tsconfig.json` | exact |
| `load-tests/k6/main.js` | test (load script) | request-response (HTTP) + streaming (new gRPC) | itself (existing file, additive import + composed default fn) | exact |
| `load-tests/k6/scenarios/notifications-grpc-flow.js` | test (load scenario) | request-response (unary gRPC) | `load-tests/k6/scenarios/wallet-flow.js` | role-match — same scenario-file shape, HTTP→gRPC swap |
| `MANUAL-ACTIONS.md` | config (ops doc) | — | itself (existing file, line 21 correction) | exact |

## Pattern Assignments

### `backend/prisma/__tests__/prisma-config.spec.ts` (test, config-presence)

**Analog:** No true precedent exists in this codebase — every existing `__tests__/*.spec.ts` file wraps `@nestjs/testing`'s `Test.createTestingModule` or mocks a class directly (see `backend/src/redis/__tests__/redis.service.spec.ts` lines 1-37, `backend/src/resilience/__tests__/resilience.service.spec.ts` lines 1-37). This new file is a bare assertion against `process.env`, no DI container needed.

**Closest structural precedent** — `backend/src/redis/__tests__/redis.service.spec.ts` (lines 1-37):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../redis.service';
import { ConfigService } from '@nestjs/config';

function makeConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key in values) return values[key];
      return defaultValue;
    }),
  } as unknown as ConfigService;
}

describe('RedisService', () => {
  beforeEach(() => {
```

**Recommended shape (from RESEARCH.md Code Examples, already vetted against project's `__tests__/` co-location convention):**
```typescript
// backend/prisma/__tests__/prisma-config.spec.ts
describe('Prisma connection pooling configuration', () => {
  it('DATABASE_URL uses the Neon pooler endpoint with an explicit connection_limit', () => {
    const url = process.env.DATABASE_URL ?? '';
    if (url.includes('localhost')) return; // skip in local dev against docker-compose Postgres
    expect(url).toContain('-pooler');
    expect(url).toMatch(/connection_limit=\d+/);
  });
});
```

**Test file naming convention** (from CLAUDE.md Naming Patterns): `<service>.spec.ts` in a `__tests__/` subdirectory — `prisma-config.spec.ts` inside `backend/prisma/__tests__/` breaks slightly from the `backend/src/**/__tests__/` convention (all 49 existing spec files live under `backend/src/`, none under `backend/prisma/`) — confirm with planner whether `backend/src/prisma/__tests__/prisma-config.spec.ts` (matching every other spec's location under `src/`) is preferred over the RESEARCH.md-suggested `backend/prisma/__tests__/` path. `backend/src/prisma/prisma.service.ts` already exists as the natural co-location target.

---

### `backend/apps/notifications-service/src/app.module.ts` (module, DI wiring)

**Analog:** `backend/apps/wallet-service/src/app.module.ts` (full file, 20 lines) — a sibling gRPC scaffold with the identical shape that is NOT missing the `ResilienceModule` import in this analog's case (wallet-service doesn't inject `ResilienceService` in its own controller/service chain, so it happens not to need it — but the *module import pattern* is exactly what notifications-service needs to copy).

**Current broken file** (`backend/apps/notifications-service/src/app.module.ts`, full 14 lines):
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RedisModule, CommonModule, NotificationsModule],
  controllers: [NotificationsGrpcController],
})
export class AppModule {}
```

**Import-block pattern to copy** (`backend/apps/wallet-service/src/app.module.ts` lines 1-19 — the multi-line `imports` array formatting):
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { WalletModule } from '../../../src/modules/wallet/wallet.module';
import { WalletGrpcController } from './wallet-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    CommonModule,
    WalletModule,
  ],
  controllers: [WalletGrpcController],
})
export class AppModule {}
```

**Where `ResilienceModule` is correctly imported in the monolith** (`backend/src/app.module.ts` lines 7-46 — the reference for the import path and placement in the array):
```typescript
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { RedisModule } from './redis/redis.module';
import { ResilienceModule } from './resilience/resilience.module';
...
imports: [
    PrismaModule,
    CommonModule,
    RedisModule,
    ResilienceModule,
    AuthModule,
    UsersModule,
    LgasModule,
```

**Fix to apply** — add one import line + one array entry, matching notifications-service's existing relative-path depth (`../../../src/...`, three levels up from `backend/apps/notifications-service/src/`):
```typescript
import { ResilienceModule } from '../../../src/resilience/resilience.module';
// ...
imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, RedisModule, ResilienceModule, CommonModule, NotificationsModule],
```

**Source of the module being imported** — `backend/src/resilience/resilience.module.ts` (full file, 9 lines):
```typescript
import { Global, Module } from '@nestjs/common';
import { ResilienceService } from './resilience.service';

@Global()
@Module({
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}
```
Note: `@Global()` only broadcasts within the module tree it's imported into — this is exactly why notifications-service (a separate `NestFactory.createMicroservice` bootstrap) needs its own explicit import despite the monolith already having it globally available.

---

### `backend/src/common/services/db-metrics.service.ts` (service, scheduled batch poll → OTel gauge)

**Analog 1 (cron pattern):** `backend/src/modules/stays/stays.service.ts` lines 13, 325-339 — `@Cron` decorator usage on a service method:
```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
...
  @Cron(CronExpression.EVERY_HOUR)
  async releaseEscrow(): Promise<void> {
    // Escrow releases 24 h after checkOut — not checkIn — to give host time to report issues
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dueBookings = await this.prisma.booking.findMany({
      where: {
        checkOut: { lt: cutoff },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as any },
        escrowReleasedAt: null,
        deletedAt: null,
      },
      include: { property: { select: { hostId: true } } },
      take: 100,
    });
```
Note the module-level section-divider comment convention (`// ── Section Name ──`) and inline comment explaining non-obvious business logic — both apply to `db-metrics.service.ts`'s cron method too (e.g. explain why `pg_stat_activity` over Prisma's `$metrics`).

**Analog 2 (typed `$queryRaw` pattern):** `backend/src/modules/admin/admin.service.ts` lines 1-6, 59-67:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}
...
      this.prisma.$queryRaw<{ lgaId: string; lgaName: string; total: number }[]>`
        SELECT l.id AS "lgaId", l.name AS "lgaName", COALESCE(SUM(o."govtLevy"), 0) AS total
        FROM orders o
        JOIN vendors v ON o."vendorId" = v.id
        JOIN lgas l ON v."lgaId" = l.id
        WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
        GROUP BY l.id, l.name
        ORDER BY total DESC
      `,
```
This is the codebase's established pattern for typed tagged-template raw SQL — `db-metrics.service.ts`'s `pg_stat_activity` query should follow the same `this.prisma.$queryRaw<RowType[]>\`...\`` shape (tagged template, not `Prisma.sql` string concatenation) and cast `bigint`/`Decimal` results to `Number()` before use, matching `admin.service.ts` line 41's `Number(revenueResult._sum.totalAmount ?? 0)` convention.

**Constructor injection convention** (`PrismaService`) — matches every service in the codebase; `db-metrics.service.ts` should use the same `constructor(private prisma: PrismaService) {}` shape, not a separate raw `pg` client.

**Security note (V7 Error Handling / Logging, from RESEARCH.md):** Never log the connection string — only log connection COUNTS. No existing service in this codebase logs `DATABASE_URL`; keep that invariant.

---

### `backend/src/instrumentation.ts` (config, OTel bootstrap — additive change)

**Current full file** (21 lines, this IS the analog — extend in place):
```typescript
// CRITICAL: loaded via --require BEFORE main.ts; do NOT import NestJS modules here
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    headers: {
      Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN ?? ''}`,
    },
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

**Pattern to replicate for the new `metricReader`:** reuse the exact same `url`/`Authorization: Basic ${GRAFANA_CLOUD_OTLP_TOKEN}` header shape already proven for `traceExporter` — add a sibling `metricReader` key to the same `NodeSDK({...})` constructor call, per RESEARCH.md Pattern 4:
```typescript
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const sdk = new NodeSDK({
  traceExporter: /* unchanged, as above */,
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: { Authorization: `Basic ${process.env.GRAFANA_CLOUD_OTLP_TOKEN ?? ''}` },
    }),
    exportIntervalMillis: 30000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
```
**Flag:** RESEARCH.md Open Question 2 — unverified whether Grafana Cloud's OTLP gateway accepts metrics at the same URL/token as traces. Do not treat delivery as confirmed without a HUMAN-UAT observation step.

---

### `.env.example` (config, additive — no `DIRECT_URL` currently present)

**Current relevant section** (`.env.example` lines 6-7 — this is the ENTIRE current Database section, `DIRECT_URL` is absent):
```
# ─── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://iseyaa:iseyaa_dev_password@localhost:5432/iseyaa_dev
```

**Section-divider comment convention to preserve** (matches every other section in the file, e.g. lines 1, 6, 9, 12, 16, 21, 24, 30, 36, 39, 42, 49, 55, 58, 68):
```
# ─── Section Name ──────────────────────────────────────────────────────────────
```

**Production-override convention already established** (lines 96-107 — how the file documents prod-specific values as trailing commented/annotated block):
```
# ── Production Deployment ──────────────────────────────────────────────
# Set in Railway environment variables (NOT in .env file)
NODE_ENV=production
...
# Neon production database branch
# DATABASE_URL=postgresql://...@...neon.tech/iseyaa?sslmode=require
```
This existing commented Neon example (line 107) is the exact line that needs to gain the `-pooler` suffix + `connection_limit`/`pool_timeout` params per D-01/D-02, and a new `DIRECT_URL` line needs to be added alongside it (Pitfall 4 finding — `DIRECT_URL` has never been in this file despite `schema.prisma` requiring it since Phase 2).

**Recommended addition** (per RESEARCH.md Pattern 1, adapted to this file's existing local-dev + prod-comment convention):
```
# ─── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://iseyaa:iseyaa_dev_password@localhost:5432/iseyaa_dev
# DIRECT_URL is required by schema.prisma's datasource block for `prisma migrate` — unpooled, bypasses the Neon pooler
# DIRECT_URL=postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require

# Neon production database branch (pooled — runtime queries only; do NOT use for `prisma migrate`)
# DATABASE_URL=postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&connection_limit=<N>&pool_timeout=10
# DIRECT_URL=postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require
```
Also relevant: existing `NOTIFICATIONS_SERVICE_URL` line 66 in the gRPC section — if D-04's asymmetric split needs a distinct `connection_limit` per process, a `NOTIFICATIONS_DATABASE_URL` env var may need to sit near this gRPC section rather than the Database section; planner's call.

---

### `packages/proto/package.json` + `packages/proto/tsconfig.json` (config, build step — INT-02 fix)

**Analog:** `shared/package.json` (full file, 14 lines) + `shared/tsconfig.json` (full file, 13 lines) — the only other workspace package in this repo with a pure-`tsc` build script, and it's already wired into the root `build:all` via `npm run build --workspaces --if-present`.

**`shared/package.json`** (full file):
```json
{
  "name": "@iseyaa/shared",
  "version": "1.0.0",
  "description": "Shared TypeScript types, constants and DTOs for ISEYAA",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "~5.3.3"
  }
}
```

**`shared/tsconfig.json`** (full file):
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Current broken `packages/proto/package.json`** (full file, 19 lines — no `build` script, `main`/`types` point at a `generated/` dir that only ever contains `.ts` since `generate.sh` emits source only):
```json
{
  "name": "@iseyaa/proto",
  "version": "0.1.0",
  "description": "gRPC proto types for ISEYAA microservices",
  "main": "generated/index.js",
  "types": "generated/index.d.ts",
  "scripts": {
    "generate": "bash generate.sh"
  },
  "dependencies": {
    "@bufbuild/protobuf": "^2.12.0",
    "@grpc/grpc-js": "^1.14.3",
    "@nestjs/microservices": "^11.1.19",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "grpc-tools": "^1.13.0"
  }
}
```

**Fix** — add `"build": "tsc -p tsconfig.json"` to `scripts`, following `shared/package.json`'s exact key placement (after `"generate"`), and add a new `tsconfig.json` mirroring `shared/tsconfig.json`'s options but targeting `generated/` instead of `src/` (per RESEARCH.md Code Examples — `rootDir`/`outDir` both `generated/` for compile-in-place, since `main`/`types` already point there):
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "CommonJS",
    "declaration": true,
    "outDir": "generated",
    "rootDir": "generated",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["generated/**/*.ts"]
}
```
**No further root wiring needed** — `package.json` (root) line 11 already lists `packages/proto` in `workspaces`, and line 16's `"build:all": "npm run build --workspaces --if-present"` will automatically pick up the new `build` script.

---

### `load-tests/k6/main.js` (load test, additive import + composed default function)

**Current full file** (35 lines — this is both the analog and the file being modified):
```javascript
// Run locally (smoke test, 50 VUs): k6 run --vus 50 --duration 60s load-tests/k6/main.js
// Full acceptance run (10K VUs): k6 run --env BASE_URL=https://staging.railway.app load-tests/k6/main.js
// Requires: k6 binary installed (choco install k6 on Windows)
// Requires: TEST_PHONE and TEST_PASSWORD env vars for authenticated endpoints

import authFlow from './scenarios/auth-flow.js';
import walletFlow from './scenarios/wallet-flow.js';
import eventsFlow from './scenarios/events-flow.js';
import transportFlow from './scenarios/transport-flow.js';

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '3m', target: 10000 },
    { duration: '5m', target: 10000 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.001'],
    'http_req_duration{endpoint:wallet}': ['p(95)<500'],
    'http_req_duration{endpoint:events}': ['p(95)<500'],
    'http_req_duration{endpoint:auth}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function () {
  authFlow();
  walletFlow();
  eventsFlow();
  transportFlow();
}
```

**Pattern to extend:** add `import notificationsGrpcFlow from './scenarios/notifications-grpc-flow.js';` alongside the existing four imports, call it inside `export default function () { ... }` alongside the other three flow calls, and add a `http_req_duration{endpoint:notifications}`-style threshold IF k6 tags gRPC metrics the same way (verify — gRPC metrics in k6 use `grpc_req_duration`, not `http_req_duration`, so the threshold key needs to be `'grpc_req_duration': [...]` per k6's native gRPC module, not copy-pasted verbatim from the HTTP thresholds).

---

### `load-tests/k6/scenarios/notifications-grpc-flow.js` (load test scenario, new)

**Analog:** `load-tests/k6/scenarios/wallet-flow.js` (full file, 24 lines) — closest existing scenario file in shape (single authenticated call + check + sleep), though it's HTTP not gRPC.

**`wallet-flow.js`** (full file):
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { getToken } from '../common/auth.js';

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function walletFlow() {
  const token = getToken(BASE_URL, __ENV.TEST_PHONE, __ENV.TEST_PASSWORD);

  const res = http.get(
    `${BASE_URL}/api/v1/wallet/balance`,
    {
      headers: { Authorization: `Bearer ${token}` },
      tags: { endpoint: 'wallet' },
    },
  );

  check(res, {
    'wallet balance status 200': (r) => r.status === 200,
  });

  sleep(1);
}
```
Naming convention to follow: `export default function <camelCaseName>Flow()`, `const BASE_URL = __ENV.BASE_URL || '...'` fallback pattern, `check(res, { 'description': (r) => ... })`, trailing `sleep(1)`.

**gRPC-specific adaptation** (RESEARCH.md Pattern 3, cross-checked against the actual proto contract below):
```javascript
import grpc from 'k6/net/grpc';
import { check } from 'k6';

const client = new grpc.Client();
client.load(['../../../packages/proto'], 'notifications.proto');

export default function notificationsGrpcFlow() {
  client.connect(__ENV.NOTIFICATIONS_GRPC_URL || 'localhost:5008', { plaintext: true });

  const res = client.invoke('notifications.NotificationsService/SendPush', {
    user_id: __ENV.TEST_USER_ID || 'k6-load-test-user',
    title: 'Load test',
    body: 'ping',
  });

  check(res, { 'grpc SendPush status OK': (r) => r && r.status === grpc.StatusOK });

  client.close();
}
```

**Verified proto contract** (`packages/proto/notifications.proto`, full file, 27 lines — field names confirmed for the gRPC scenario's request payload):
```proto
syntax = "proto3";
package notifications;

service NotificationsService {
  rpc SendPush (SendPushRequest) returns (SendPushResponse);
  rpc RegisterToken (RegisterTokenRequest) returns (RegisterTokenResponse);
}

message SendPushRequest {
  string user_id = 1;
  string title = 2;
  string body = 3;
}

message SendPushResponse {
  bool success = 1;
}
```
Field names (`user_id`, `title`, `body`) match the RESEARCH.md example exactly — safe to copy verbatim.

**FCM stub note (RESEARCH.md Open Question 3):** `NotificationsService.sendPush()` calls the real FCM v1 API only if `FIREBASE_SERVICE_ACCOUNT_JSON` is set; unset in the load-test env, this safely no-ops (logged warning) and the Prisma query still executes first, so connection-pool behavior is unaffected either way — no additional stubbing needed for this phase's purposes.

---

### `MANUAL-ACTIONS.md` (docs, correction — analog is itself)

**Current stale line** (`MANUAL-ACTIONS.md` line 21):
```
| `DATABASE_URL` | Neon PostgreSQL | Neon dashboard → Connection string (pooler URL with `?pgbouncer=true`) |
```

**Correction needed** (per RESEARCH.md Pattern 1's "Note on pgbouncer=true" and Pitfall 3 — Neon's managed pooler does not need this legacy flag, only pre-1.21 standalone PgBouncer does):
```
| `DATABASE_URL` | Neon PostgreSQL | Neon dashboard → Connection string, `-pooler` endpoint, add `connection_limit`/`pool_timeout` query params (no `pgbouncer=true` — that's for legacy standalone PgBouncer, not Neon's managed proxy) |
```
Table row format (pipe-delimited markdown table, three columns: Variable / Service / Where to get it) must be preserved exactly — same convention as the other 5 rows in this table (lines 19-26).

---

## Shared Patterns

### Prisma constructor injection
**Source:** every service in `backend/src/modules/*/*.service.ts` (e.g. `admin.service.ts` line 6, `stays.service.ts`)
**Apply to:** `db-metrics.service.ts`
```typescript
constructor(private prisma: PrismaService) {}
```

### `@Cron` scheduled task
**Source:** `backend/src/modules/stays/stays.service.ts` line 325 (`@Cron(CronExpression.EVERY_HOUR)`)
**Apply to:** `db-metrics.service.ts` (use `CronExpression.EVERY_30_SECONDS` per RESEARCH.md Pattern 4, not `EVERY_HOUR` — different polling cadence, same decorator mechanics)
```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
@Cron(CronExpression.EVERY_30_SECONDS)
async pollOpenConnections() { ... }
```

### Typed `$queryRaw` tagged template
**Source:** `backend/src/modules/admin/admin.service.ts` lines 59-67
**Apply to:** `db-metrics.service.ts`'s `pg_stat_activity` query
```typescript
this.prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database()`
```

### `@Global()` module + explicit per-app-scaffold import requirement
**Source:** `backend/src/resilience/resilience.module.ts` + `backend/src/app.module.ts` line 46
**Apply to:** `backend/apps/notifications-service/src/app.module.ts` — every gRPC scaffold under `backend/apps/*-service/src/app.module.ts` that constructor-injects `ResilienceService` (directly or via `CommonModule`'s `PaystackService`) needs its own explicit `ResilienceModule` import; `@Global()` does not cross separate `NestFactory` bootstrap trees.

### Module-level section-divider comments
**Source:** CLAUDE.md Conventions §Comments; seen in `admin.service.ts`, `marketplace.service.ts`, `.env.example` (every section)
**Apply to:** `db-metrics.service.ts`, any new `.env.example` section
```
// ── Section Name ──────────────────────
```
or in `.env.example`:
```
# ─── Section Name ──────────────────────────────────────────────────────────────
```

### Workspace package build script wiring
**Source:** `shared/package.json` (`"build": "tsc"`) + root `package.json` line 16 (`"build:all": "npm run build --workspaces --if-present"`)
**Apply to:** `packages/proto/package.json` — adding a `build` script requires zero additional root wiring since `packages/proto` is already in the root `workspaces` array (line 11) and `build:all` already targets all workspaces with `--if-present`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/prisma/__tests__/prisma-config.spec.ts` | test | config-presence | No existing spec in this codebase does a bare `process.env` assertion outside a `TestingModule`/mock harness — every one of the 49 existing spec files mocks a class or Prisma client. This is a genuinely new test shape; RESEARCH.md's Code Examples section is the only available template (see Pattern Assignments above). Also flag: its planned location (`backend/prisma/__tests__/`) breaks from the otherwise-universal `backend/src/**/__tests__/` convention — confirm the intended path with the planner. |
| `backend/src/instrumentation.ts` metric-export delivery to Grafana Cloud | config | event-driven | No prior OTel *metrics* pipeline exists in this repo — only the `traceExporter` is wired today. The `metricReader` addition is net-new; RESEARCH.md flags Grafana Cloud's OTLP metrics-endpoint-vs-traces-endpoint compatibility as Open Question 2, unverified against live infra. |

## Metadata

**Analog search scope:** `backend/src/`, `backend/apps/*/src/`, `backend/prisma/`, `load-tests/k6/`, `packages/proto/`, `shared/`, repo root config files (`package.json`, `.env.example`, `MANUAL-ACTIONS.md`)
**Files scanned:** ~30 (8 `app.module.ts` scaffolds, 49 `__tests__/*.spec.ts` glob results, 6 k6 files, 2 workspace `package.json`/`tsconfig.json` pairs, `instrumentation.ts`, `.env.example`, `MANUAL-ACTIONS.md`, `schema.prisma`, `prisma.service.ts`, `resilience.module.ts`, `admin.service.ts`, `stays.service.ts`)
**Pattern extraction date:** 2026-07-18
