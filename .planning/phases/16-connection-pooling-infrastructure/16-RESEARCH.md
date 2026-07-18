# Phase 16: Connection Pooling Infrastructure - Research

**Researched:** 2026-07-18
**Domain:** Neon Postgres connection pooling (Prisma), NestJS DI across a second gRPC process, k6 native gRPC load testing, OTel metrics → Grafana Cloud alerting
**Confidence:** MEDIUM-HIGH (pooler mechanics and Prisma config are HIGH/CITED against official docs; exact Neon plan/connection ceiling is ASSUMED and flagged — cannot be verified from the repo, requires a human dashboard check)

## Summary

This phase has three real technical threads, not one. The headline task — pointing `DATABASE_URL` at Neon's `-pooler` endpoint with an explicit `connection_limit` — is mechanically simple and already half-documented in this repo (`MANUAL-ACTIONS.md` already tells operators to use "pooler URL with `?pgbouncer=true`"). The harder, non-obvious work is (1) getting `notifications-service` to actually boot at all as a second real process, and (2) getting real numbers to size `connection_limit` and the Grafana alert threshold against, since the actual Neon plan/compute size is not recorded anywhere in this codebase.

On (1): research confirms two independent, currently-undocumented boot blockers for `notifications-service`, beyond the already-folded INT-02 proto compile-step. `CommonModule`'s `PaystackService` **and** the feature module's own `NotificationsService` both constructor-inject `ResilienceService` from `ResilienceModule`, which is `@Global()` in the monolith's `AppModule` but is **never imported anywhere in `notifications-service`'s own `AppModule`** — Nest's `@Global()` decorator only broadcasts within the module tree it was imported into, and `notifications-service` builds an entirely separate tree. Booting `notifications-service` today, even after fixing INT-02, will throw a DI resolution error at startup. This must be pulled into this phase's plan (fix: import `ResilienceModule` into `notifications-service`'s `AppModule`) — POOL-02's load test has no second process to test against otherwise.

On (2): the actual Neon plan/tier used by this project is not recorded in any config file, `.env.example`, or planning doc. The only signal is the project's explicit "~$11/mo free-first infrastructure" cost target and PROJECT.md's "zero idle cost" framing of the Neon migration, which strongly (but not certainly) implies the **Neon Free plan**. Neon's Free plan autoscales up to 2 CU but the documented autoscale floor (and therefore worst-case `max_connections`) is not published per-plan — it must be read from the live Neon Console (Project → Settings → Compute) before `connection_limit`/alert-threshold numbers are finalized. This research provides Neon's public `max_connections`-by-CU table so the planner has real numbers to reason with once the CU floor is confirmed, and recommends conservative sizing that stays safely under even the smallest published tier (0.25 CU → 104 `max_connections`) so the phase is not blocked on that dashboard check.

**Primary recommendation:** Use Neon's built-in `-pooler` endpoint with Prisma's native `connection_limit`/`pool_timeout` query params (no `pgbouncer=true` needed — that flag is for legacy PgBouncer <1.21, not Neon's managed proxy). Fix the `ResilienceModule` DI gap in `notifications-service` as an in-phase prerequisite task before attempting the combined-topology load test. Drive gRPC load with k6's **native** `k6/net/grpc` module (no `xk6-grpc` extension needed — unary gRPC has been built into core k6 since v0.49.0). Track open connections via a scheduled `pg_stat_activity` query exported as an OTel gauge metric to the existing Grafana Cloud OTLP pipeline, not via Prisma's own pool-metrics preview feature (which only reports each process's own view, not the true cross-process Postgres-server total that POOL-02 needs).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pooled DB connection string | API / Backend (Prisma `DATABASE_URL`) | Database / Storage (Neon pooler proxy) | Prisma is the connecting client; Neon's PgBouncer-based proxy is the thing being connected through — config lives in both places (env var + Neon-side proxy behavior) |
| `connection_limit` sizing | API / Backend | — | Purely a Prisma-client-side setting (caps that process's own connection pool); not a Neon/PgBouncer server setting |
| Combined-topology load generation | External tooling (k6) | API / Backend (monolith + notifications-service, targets of the load) | k6 is an external process; it must reach both the monolith's HTTP surface and notifications-service's gRPC surface directly since no in-process caller exists yet |
| Open-connection metric collection | API / Backend (scheduled query + OTel exporter) | Database / Storage (`pg_stat_activity` is the data source) | The metric must reflect true server-side state across BOTH processes combined, which only a direct Postgres query (not per-process Prisma metrics) can provide |
| Alert threshold / dashboard | Observability (Grafana Cloud) | — | Alert rule configuration lives in Grafana Cloud UI, not in this repo — no Grafana-as-code exists here today (same pattern as Phase 11's RESIL-02) |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POOL-01 | Every Prisma client (monolith + `notifications-service`) connects through a pooled connection string with an explicit, documented `connection_limit` | Neon `-pooler` connection string format confirmed [CITED: Neon docs]; Prisma `connection_limit`/`pool_timeout` query params confirmed as the correct mechanism [CITED: Neon's official Prisma guide]; `notifications-service` boot blockers found and must be fixed first (see Common Pitfalls) |
| POOL-02 | A combined-topology load test confirms total open Postgres connections stay under Neon's ceiling with monolith + `notifications-service` running concurrently | k6 native `k6/net/grpc` module confirmed as the mechanism to drive gRPC load without a new extension [CITED: Grafana k6 docs]; `pg_stat_activity`-based metric collection recommended for true cross-process connection count; Neon's `max_connections`-by-CU table provided for sizing, with the specific active tier flagged as unverified (see Assumptions Log) |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use Neon's built-in `-pooler` endpoint (append `-pooler` to the Neon host in the connection string) rather than a self-hosted PgBouncer container. Zero new infrastructure, zero new cost, fits the project's free-first cost target — no docker-compose or Railway changes needed beyond the connection string itself.
- **D-02:** Both the monolith and `notifications-service` use the pooled `-pooler` URL as their runtime `DATABASE_URL`. `DIRECT_URL` (already present in `schema.prisma`) stays unpooled and is used only by `prisma migrate`, unchanged from today.
- **D-03:** The actual Neon plan/tier and its connection ceiling is unknown at discussion time — researcher must confirm the real number from the Neon dashboard/docs before planning sizes anything. Do not assume a specific tier's numbers. *(Research outcome: could not be confirmed from the repo/dashboard access available in this session — see Assumptions Log A1/A2. Public Neon docs numbers are provided as a sizing baseline; a live dashboard check remains a hard prerequisite before finalizing exact numbers.)*
- **D-04:** `connection_limit` is split asymmetrically between the two processes, proportional to load: the monolith (13+ modules, high query volume) gets the bulk of the researched ceiling; `notifications-service` (1 module, low volume) gets a small fixed slice. Exact numbers are the planner's call once D-03's research lands.
- **D-05:** When the pool maxes out under load, requests queue on Prisma's default `pool_timeout` (10s) and then throw a timeout error if still unserved — this is already today's behavior, just now bounded by an explicit `connection_limit` instead of Prisma's silent default of 10. No new circuit-breaker/fail-fast wrapping via `ResilienceModule` this phase.
- **D-06:** The combined-topology load test extends the existing `load-tests/k6/main.js` script rather than a new dedicated connection-ceiling-only script — add `notifications-service` traffic (via its gRPC trigger path, since it has no public HTTP endpoint) into the same k6 run so both processes are under load simultaneously.
- **D-07:** The new Grafana alert on open Postgres connections fires at 80% of the researched ceiling (from D-03) — standard early-warning threshold.

### Folded Todos

- **INT-02 — Add compile step to `packages/proto`:** `packages/proto/package.json` declares compiled `main`/`types` entry points but `generate.sh` only emits `.ts` source, and there's no build script — `require('@iseyaa/proto')` fails at real Node.js runtime even though `nest build` passes. Folded into this phase because POOL-02's combined-topology load test needs `notifications-service` to actually boot and run as a second real process.

### Claude's Discretion

- Exact `connection_limit` numbers for each process (D-04) — sized during planning once D-03's research confirms the real Neon ceiling.
- Exact Grafana alert threshold value in absolute connection count (D-07) — computed as 80% of whatever D-03's research reveals.
- Precise mechanics of extending `load-tests/k6/main.js` to also drive `notifications-service` (D-06) — implementation detail for planning, given `notifications-service` has no public HTTP surface (only a gRPC controller today).

### Deferred Ideas (OUT OF SCOPE)

- Self-hosted PgBouncer (D-01's rejected alternative) — deferred indefinitely unless Neon's built-in pooler proves insufficient.
- Fail-fast pool-exhaustion handling via `ResilienceModule`/cockatiel (D-05's rejected alternative) — deferred; Prisma's default `pool_timeout` queueing is used this phase.
- `notifications-service`'s actual live gRPC extraction and cutover (`ClientGrpc` wiring, caller-graph audit) — Phase 17's GRPC-03/04/05 scope; this phase only needs the service running for the load test, not extracted into production traffic.
- Any change to `prisma migrate`'s use of `DIRECT_URL` — unchanged, still unpooled, used only for migrations.
- **Wire ResilienceModule into gRPC service scaffolds (INT-01)** — reviewed by the user but not formally folded as a discussed decision. **Research finding: this cannot actually stay deferred for `notifications-service` specifically** — see Common Pitfalls "ResilienceModule DI Blocker." The scoped fix (import `ResilienceModule` into `notifications-service`'s `AppModule` only) must be pulled into this phase; INT-01's broader scope (all 8 scaffolds) can stay deferred to Phase 17 for the other 7 services not exercised by this phase's load test.

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 5.22.0 (already installed) [VERIFIED: backend/package.json] | ORM client whose `datasource.url` reads the pooled `DATABASE_URL` | Already the project's ORM; `connection_limit`/`pool_timeout` query-param support is unchanged across 5.x — no version bump needed for this phase |
| Neon built-in pooler | N/A (managed proxy, no package) | PgBouncer-based connection multiplexing in transaction mode, reached via the `-pooler` hostname suffix | Zero-infra, zero-cost, already Neon's documented recommended pattern for serverless/Node clients [CITED: neon.com/docs/connect/connection-pooling] |
| `k6` (binary, not npm) | Any version ≥ v0.49.0 (native `k6/net/grpc` unary support) | Load-generation tool for the combined-topology test | Already used by this project (`load-tests/k6/main.js`); native gRPC module removes the need for the `xk6-grpc` extension the phase description hinted at |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opentelemetry/exporter-metrics-otlp-http` | ^0.218.0 (matches existing `@opentelemetry/sdk-node` ^0.218.0 pin) [VERIFIED: npm registry has 0.218.0 published] | Exports a custom OTel gauge metric (open Postgres connections) to the same Grafana Cloud OTLP endpoint already used for traces | New dependency — the project currently only wires a `traceExporter` in `backend/src/instrumentation.ts`, no `metricReader` |
| `@nestjs/schedule` | ^6.1.3 (already installed) | Cron job to periodically query `pg_stat_activity` and update the gauge | Already used elsewhere in the codebase (escrow release cron); same pattern applies here |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_stat_activity` scheduled query for the connections metric | Prisma's `previewFeatures = ["metrics"]` + `prisma.$metrics.json()` | Prisma metrics only report that ONE process's own pool view (`prisma_pool_connections_open`), not the combined monolith+notifications-service total the requirement asks for. Would need per-process scraping + summing, which is strictly more work and less accurate (misses connections opened by `prisma migrate`, ad-hoc scripts, etc.) than one direct query against the shared Postgres server. Not recommended. |
| k6 native `k6/net/grpc` | `xk6-grpc` extension / custom `xk6` build | Not needed — unary gRPC support was merged into k6 core in v0.49.0. Building a custom `xk6` binary would add a CI/tooling burden (Go toolchain, custom binary distribution) for zero functional gain over the built-in module. Only relevant if streaming gRPC calls were needed, which `NotificationsService`'s two unary RPCs (`SendPush`, `RegisterToken`) do not require. |
| Neon built-in pooler (D-01, locked) | Self-hosted PgBouncer container | Rejected by user decision — extra infra/cost for no capability gain at this project's scale; Neon's managed proxy already runs PgBouncer under the hood. |

**Installation:**
```bash
cd backend
npm install @opentelemetry/exporter-metrics-otlp-http@^0.218.0
```

**Version verification:** [VERIFIED: npm registry, checked 2026-07-18]
- `@opentelemetry/exporter-metrics-otlp-http`: versions up to 0.220.0 published; 0.218.0 exists and matches the project's existing `@opentelemetry/sdk-node`/`auto-instrumentations-node` pin family (`^0.218.0`), avoiding a version-skew bump across the whole OTel dependency set.
- `@prisma/client` / `prisma`: project is pinned to 5.22.0 / 5.11.0 respectively — well behind the current registry latest (7.9.0-dev line, with 6.x/7.x stable also published). This phase does NOT require or recommend a Prisma major-version bump; `connection_limit` query-param behavior is unchanged across 5.x/6.x for the classic (non-driver-adapter) PostgreSQL connector. Flagging only so the planner doesn't confuse this repo's actual Prisma version with the `prisma": "^7.8.0"` line seen in the ROOT `package.json`'s stray devDependency (unused — the real, in-effect Prisma version is `backend/package.json`'s 5.x pin).

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   k6 combined-topology run   │
                         │  (load-tests/k6/main.js)     │
                         └──────────────┬───────────────┘
                     HTTP (existing)    │    gRPC (new: k6/net/grpc)
              ┌──────────────────────────┴───────────────────────────┐
              ▼                                                      ▼
   ┌────────────────────────┐                          ┌─────────────────────────────┐
   │   Monolith (backend)    │                          │   notifications-service      │
   │   NestJS HTTP + Prisma  │                          │   gRPC-only + Prisma          │
   │   DATABASE_URL=-pooler  │                          │   DATABASE_URL=-pooler        │
   │   connection_limit=N1   │                          │   connection_limit=N2 (small) │
   └────────────┬────────────┘                          └───────────────┬─────────────┘
                │                                                      │
                │   both processes' Prisma clients dial the SAME       │
                └──────────────────────┬───────────────────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │  Neon pooler (-pooler hostname)     │
                     │  PgBouncer transaction-mode proxy   │
                     │  multiplexes many client sessions    │
                     │  onto a smaller real backend pool    │
                     └──────────────────┬───────────────────┘
                                        ▼
                     ┌───────────────────────────────────┐
                     │  Neon Postgres 16 (actual server)   │
                     │  max_connections ceiling (CU-based) │
                     │  pg_stat_activity = ground truth     │
                     └──────────────────┬───────────────────┘
                                        │  scheduled query (cron, both processes
                                        │  or a dedicated small script)
                                        ▼
                     ┌───────────────────────────────────┐
                     │  OTel metrics exporter               │
                     │  (open-connections gauge)             │
                     └──────────────────┬───────────────────┘
                                        ▼
                     ┌───────────────────────────────────┐
                     │  Grafana Cloud (OTLP endpoint,        │
                     │  already receiving traces)             │
                     │  Alert rule @ 80% of ceiling (D-07)   │
                     └───────────────────────────────────┘
```

A reader tracing the primary use case: k6 drives HTTP traffic into the monolith and gRPC traffic into `notifications-service` simultaneously → both processes' independently-pooled Prisma clients dial Neon's `-pooler` endpoint → the pooler multiplexes those client connections onto Neon's real Postgres backend connection pool, bounded by `max_connections` for the active compute size → a scheduled query against `pg_stat_activity` reads the true combined open-connection count → that count is exported as an OTel gauge to the same Grafana Cloud pipeline already receiving traces → a Grafana alert rule (configured in the Grafana UI, not in this repo) fires at 80% of the researched ceiling.

### Recommended Project Structure

```
backend/
├── prisma/schema.prisma          # unchanged structurally; url already reads DATABASE_URL, directUrl already reads DIRECT_URL
├── src/
│   ├── prisma/
│   │   ├── prisma.service.ts     # unchanged (connection_limit lives in the URL, not code)
│   │   └── __tests__/
│   │       └── prisma-config.spec.ts   # NEW — asserts DATABASE_URL contains -pooler + connection_limit (Wave 0 gap, see Validation Architecture)
│   ├── resilience/
│   │   └── resilience.module.ts  # unchanged — the FIX is importing this INTO notifications-service, not changing it
│   ├── common/
│   │   └── services/db-metrics.service.ts   # NEW — cron-scheduled pg_stat_activity query, OTel gauge update
│   └── instrumentation.ts        # MODIFIED — add metricReader alongside existing traceExporter
├── apps/notifications-service/src/
│   └── app.module.ts             # MODIFIED — add ResilienceModule to imports (the DI-blocker fix)
├── .env.example                  # MODIFIED — add DIRECT_URL example, pooled DATABASE_URL example with connection_limit, per-process env var naming if split (e.g. NOTIF_DATABASE_URL) if D-04 needs distinct URLs per process
packages/proto/
├── package.json                  # MODIFIED — add "build": "tsc" (or equivalent) script (INT-02)
├── tsconfig.json                 # NEW (if absent) — needed for the build script above
load-tests/k6/
├── main.js                       # MODIFIED — add a notifications gRPC scenario to the default export (D-06)
├── scenarios/
│   └── notifications-grpc-flow.js  # NEW — k6/net/grpc client hitting SendPush/RegisterToken
```

### Pattern 1: Pooled connection string with explicit connection_limit

**What:** Point Prisma's runtime `DATABASE_URL` at Neon's `-pooler` hostname and add `connection_limit`/`pool_timeout` as query params. `DIRECT_URL` stays pointed at the non-pooled hostname for `prisma migrate`.

**When to use:** Every runtime Prisma client (monolith + `notifications-service`) in this phase.

**Example:**
```bash
# .env — runtime queries go through the pooler
DATABASE_URL="postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&connection_limit=20&pool_timeout=10"

# migrations bypass the pooler entirely (unchanged from today's intent, per D-02)
DIRECT_URL="postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require"
```
```prisma
// backend/prisma/schema.prisma — no structural change needed, already correct
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```
Source: [CITED: neon.com/docs/guides/prisma — official Neon Prisma integration guide, confirms `connection_limit`/`pool_timeout` as the recommended tuning params and `-pooler` hostname format]

**Note on `pgbouncer=true`:** Do NOT add this query param for Neon. It is a Prisma flag meant for legacy standalone PgBouncer deployments below v1.21 to force protocol-level-only prepared statements; Neon's managed pooler is documented to work correctly with Prisma via the plain `connection_limit`/`pool_timeout` params without it [CITED: neon.com/docs/guides/prisma]. `MANUAL-ACTIONS.md` in this repo currently instructs operators to add `?pgbouncer=true` — this is stale guidance from the Phase 2 infra migration and should be corrected as part of this phase's `.env.example`/docs update.

### Pattern 2: Fixing the notifications-service DI boot blocker

**What:** `notifications-service`'s `AppModule` imports `CommonModule` (which provides `PaystackService`, which needs `ResilienceService`) and its own `NotificationsModule` (whose `NotificationsService` also directly needs `ResilienceService`), but never imports `ResilienceModule`. `@Global()` modules only broadcast within the module tree they were imported into — since `notifications-service` builds a wholly separate NestJS application context from the monolith, the monolith's `ResilienceModule` import does nothing for it.

**When to use:** Required before `notifications-service` can boot at all, for this phase's load test to have a real second process.

**Example:**
```typescript
// backend/apps/notifications-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { CommonModule } from '../../../src/common/common.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module'; // ADD THIS
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    ResilienceModule, // ADD THIS — fixes PaystackService + NotificationsService DI resolution
    CommonModule,
    NotificationsModule,
  ],
  controllers: [NotificationsGrpcController],
})
export class AppModule {}
```
Source: [VERIFIED: backend/src/resilience/resilience.module.ts confirms `@Global()` + exports `ResilienceService`; backend/src/common/services/paystack.service.ts:27 and backend/src/modules/notifications/notifications.service.ts:23 both constructor-inject `ResilienceService`; backend/apps/notifications-service/src/app.module.ts confirmed missing the import]

### Pattern 3: k6 native gRPC load against notifications-service

**What:** Use `k6/net/grpc` (built into k6 core since v0.49.0) to call `NotificationsService.SendPush`/`RegisterToken` directly, since the monolith has no in-process caller to piggyback on yet (that's Phase 17 scope).

**Example:**
```javascript
// load-tests/k6/scenarios/notifications-grpc-flow.js
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
Source: [CITED: grafana.com/docs/k6/latest/javascript-api/k6-net-grpc/]; RPC method names/fields confirmed against `packages/proto/notifications.proto` [VERIFIED: repo file]

### Pattern 4: Open-connection metric via scheduled pg_stat_activity query

**What:** A `@nestjs/schedule` cron (in the monolith, since it's the process with 24/7 uptime under Railway; `notifications-service` doesn't need its own copy) periodically queries the shared Postgres server's total open connections and records it as an OTel observable gauge.

**Example:**
```typescript
// backend/src/common/services/db-metrics.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { metrics } from '@opentelemetry/api';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DbMetricsService implements OnModuleInit {
  private currentOpenConnections = 0;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const meter = metrics.getMeter('iseyaa-db');
    const gauge = meter.createObservableGauge('postgres_open_connections');
    gauge.addCallback((result) => {
      result.observe(this.currentOpenConnections);
    });
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollOpenConnections() {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database()
    `;
    this.currentOpenConnections = Number(rows[0]?.count ?? 0);
  }
}
```
```typescript
// backend/src/instrumentation.ts — add a metricReader alongside the existing traceExporter
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const sdk = new NodeSDK({
  traceExporter: /* unchanged */,
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
Source: [ASSUMED — standard OTel Node.js metrics API pattern; not verified against this project's specific Grafana Cloud OTLP metrics ingestion endpoint, which may require a distinct URL path from the traces endpoint already configured — flag for confirmation during implementation, see Open Questions]

### Anti-Patterns to Avoid

- **Relying on Prisma's `$metrics.json()` for the cross-process total:** It only reports the calling process's own pool state — summing two separately-scraped values is fragile and can double-count or miss connections from `prisma migrate`/ad-hoc scripts. Query `pg_stat_activity` directly for ground truth instead.
- **Setting `connection_limit` without also setting `pool_timeout`:** Leaving `pool_timeout` at Prisma's default (10s) is fine per D-05, but it must be an explicit, documented choice in the connection string/plan, not an accidental omission — the whole point of this phase is making previously-silent defaults explicit.
- **Adding `pgbouncer=true` "just in case":** This flag is for pre-1.21 standalone PgBouncer; Neon's pooler doesn't need it and the existing `MANUAL-ACTIONS.md` guidance recommending it should be corrected, not propagated further.
- **Building a custom `xk6-grpc` binary:** Unnecessary — native `k6/net/grpc` covers this phase's two unary RPCs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Connection pooling in front of Postgres | Custom PgBouncer container/config | Neon's built-in `-pooler` endpoint (D-01, locked) | Zero-infra, already managed, already documented in this repo's `MANUAL-ACTIONS.md` |
| gRPC load generation | Custom Node.js gRPC load script | k6 native `k6/net/grpc` module | Already the project's load-testing tool; native gRPC support removes any need for custom tooling |
| Cross-process connection counting | Custom TCP/connection-tracking middleware | `pg_stat_activity` (built into Postgres) | Postgres already tracks every real backend connection server-side; querying it is authoritative and requires zero new infrastructure |

**Key insight:** Every piece of this phase has a managed/built-in answer already available in the current stack (Neon's pooler, Postgres's own activity view, k6's own gRPC client) — the risk in this phase is process/DI wiring gaps (the `ResilienceModule` blocker, the proto compile step), not missing tooling.

## Common Pitfalls

### Pitfall 1: ResilienceModule DI Blocker Prevents notifications-service From Booting

**What goes wrong:** `notifications-service` throws a Nest dependency-resolution error at startup (`Nest can't resolve dependencies of the PaystackService (?, ResilienceService)` or the equivalent for `NotificationsService`) and never reaches `app.listen()`.

**Why it happens:** `ResilienceModule` is `@Global()` in `backend/src/resilience/resilience.module.ts`, but `@Global()` only makes a module's exports available within the module tree it was imported into. The monolith's `AppModule` imports it; `notifications-service`'s `AppModule` — a completely separate NestJS application bootstrap (`NestFactory.createMicroservice`) — does not. Both `PaystackService` (via `CommonModule`, which `notifications-service` does import) and `NotificationsService` (via `NotificationsModule`, which it also imports) constructor-inject `ResilienceService`, so the container has no provider for it.

**How to avoid:** Add `ResilienceModule` to `notifications-service`'s `AppModule.imports` (see Pattern 2 above). This is a two-line fix but is a hard prerequisite for POOL-02 — without it there is no second process to load-test.

**Warning signs:** `nest build notifications-service` passes (build-time DI checks are not exhaustive), but `node dist/apps/notifications-service/src/main.js` or `nest start notifications-service` crashes immediately on boot with a DI resolution error.

**Confidence:** HIGH — [VERIFIED: read `resilience.module.ts`, `common.module.ts`, `paystack.service.ts`, `notifications.service.ts`, and `notifications-service/src/app.module.ts` directly in this session]

### Pitfall 2: Neon's Real Connection Ceiling Is Not Recorded Anywhere in This Repo

**What goes wrong:** Planning `connection_limit`/alert-threshold numbers against a guessed Neon tier risks either being too conservative (starving the monolith under real load) or, worse, too generous (the alert never fires before hitting the actual ceiling).

**Why it happens:** No `.env.example`, docker-compose, planning doc, or memory file in this project records which Neon plan (Free/Launch/Scale) or compute size (CU) is actually provisioned. The only signal is the project's "~$11/mo free-first" cost framing, which suggests but does not confirm the Free plan.

**How to avoid:** Treat the numbers in this research (see Assumptions Log) as a conservative planning baseline, but require a Neon Console check (Project → Settings → Compute, or the Billing page) as a task in this phase's plan before the final `connection_limit`/alert-threshold values are locked in. Size `connection_limit` well under even the smallest published ceiling (104 at 0.25 CU) so the phase isn't blocked waiting on that confirmation.

**Warning signs:** If the combined `connection_limit` budget (monolith + notifications-service) is set close to or above the assumed 104-connection floor, any autoscale-down event on Neon's side (e.g., idle scale-to-0.25CU) could make the load test intermittently fail for reasons unrelated to actual application load.

**Confidence:** MEDIUM — public Neon docs numbers are HIGH confidence [CITED: neon.com/docs/connect/connection-pooling]; which tier/CU this specific project runs is LOW confidence / ASSUMED (see Assumptions Log A1, A2)

### Pitfall 3: PgBouncer Transaction-Mode Pooling Breaks SQL-Level Prepared Statements

**What goes wrong:** Long-lived `PREPARE`/`EXECUTE` SQL statements, session-level `SET` commands, advisory locks, and temp tables do not survive across transaction boundaries when routed through Neon's transaction-mode pooler.

**Why it happens:** Neon's pooler runs PgBouncer in `transaction` pool mode, which returns the underlying server connection to the pool after every transaction — anything session-scoped is lost.

**How to avoid:** Prisma's Node.js driver for Postgres uses protocol-level prepared statements (not SQL-level `PREPARE`), which transaction-mode pooling does support — this is why Neon's official Prisma guide does NOT recommend the `pgbouncer=true` flag (that flag exists specifically to force Prisma into protocol-level-only mode for poolers that need it; Neon's proxy already handles it transparently). The actual risk in this codebase is any `$queryRaw`/`$executeRaw` call that uses session state (`SET search_path`, advisory locks) — a grep of the codebase during planning should confirm none of the existing raw-SQL call sites (e.g., `admin.service.ts`'s raw revenue query, this phase's new `pg_stat_activity` query) rely on session-scoped state across multiple statements.

**Confidence:** HIGH — [CITED: neon.com/docs/connect/connection-pooling; Prisma official PgBouncer docs]

### Pitfall 4: `.env.example` Currently Has No `DIRECT_URL` Entry and Stale `pgbouncer=true` Guidance

**What goes wrong:** A developer following `.env.example` alone would not know `DIRECT_URL` is required (schema.prisma has required it since Phase 2), and `MANUAL-ACTIONS.md`'s existing instruction to add `?pgbouncer=true` to the Neon connection string is unnecessary/stale per Pitfall 3's finding.

**Why it happens:** `.env.example` was never updated after `DIRECT_URL` was added to `schema.prisma`'s datasource block; `MANUAL-ACTIONS.md`'s Neon guidance predates confirming the exact param requirements.

**How to avoid:** This phase's plan should update `.env.example` with both a pooled `DATABASE_URL` (with `connection_limit`/`pool_timeout`) and a `DIRECT_URL` example, and correct `MANUAL-ACTIONS.md`'s `pgbouncer=true` guidance.

**Confidence:** HIGH — [VERIFIED: read `.env.example` in full, `DIRECT_URL` absent; read `MANUAL-ACTIONS.md` line 21 confirming the `pgbouncer=true` guidance]

### Pitfall 5: Docker Build Path for notifications-service Has a Separate, Unrelated `@iseyaa/proto` Gap

**What goes wrong:** Even after INT-02 (packages/proto compile step) is fixed, `docker build` for `notifications-service` will still fail, because `backend/package.json` never declares `@iseyaa/proto` as a dependency and the Dockerfile's `npm ci --workspace=backend --include=workspace=shared` never links the `packages/proto` workspace at all.

**Why it happens:** This is a pre-existing, separate defect already flagged in `STATE.md`'s Pending Todos ("Docker build fix before Phase 17") — distinct from INT-02 (which is about the missing compile step, reproducible even in local `npm install` where workspace linking DOES work).

**How to avoid:** This phase's load test does not need to run via Docker/Railway — D-01 explicitly says "no docker-compose or Railway changes needed beyond the connection string itself," and no Railway service is yet provisioned for `notifications-service` (confirmed: `railway.toml` exists but PROJECT.md confirms the Railway-side service was never created). Run the combined-topology load test against locally-built processes (`nest build` + `node dist/...` or `nest start`), where local `npm install` at the repo root already links all workspaces correctly and only INT-02's runtime-require gap applies. Flag the Docker-specific gap as explicitly OUT of this phase's scope, relevant instead to Phase 17 when `notifications-service` needs a real Railway deployment.

**Confidence:** HIGH — [VERIFIED: read `backend/apps/notifications-service/Dockerfile`, confirms `npm ci --workspace=backend --include=workspace=shared` never touches `packages/proto`; grepped `backend/package.json`, confirms `@iseyaa/proto` is not listed as a dependency; read `STATE.md`'s Pending Todos confirming this is already a tracked, separate item]

## Code Examples

### packages/proto build script (INT-02 fix)

```json
// packages/proto/package.json
{
  "scripts": {
    "generate": "bash generate.sh",
    "build": "tsc -p tsconfig.json"
  }
}
```
```json
// packages/proto/tsconfig.json (new file, if absent)
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
Source: [ASSUMED — no existing `packages/proto/tsconfig.json` was found in this session; standard `tsc` compile-in-place pattern inferred from the package.json's `main: generated/index.js` / `types: generated/index.d.ts` expectation. Verify the exact `rootDir`/`outDir` combination compiles `generated/*.ts` to `generated/*.js` in place without clobbering the `.ts` sources `generate.sh` regenerates on every proto change.]

Wire into root `build:all`:
```json
// package.json (root) — packages/proto already in the workspaces array;
// npm run build --workspaces --if-present will now pick up the new "build" script automatically
```

### Prisma config-presence test (Wave 0 gap)

```typescript
// backend/src/prisma/__tests__/prisma-config.spec.ts
describe('Prisma connection pooling configuration', () => {
  it('DATABASE_URL uses the Neon pooler endpoint with an explicit connection_limit', () => {
    const url = process.env.DATABASE_URL ?? '';
    // Skip in local dev against docker-compose Postgres (no -pooler suffix expected there)
    if (url.includes('localhost')) return;
    expect(url).toContain('-pooler');
    expect(url).toMatch(/connection_limit=\d+/);
  });
});
```
Source: [ASSUMED — new test file, no prior precedent in this codebase for a config-presence spec; pattern follows the project's existing `__tests__/` co-location convention]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `pgbouncer=true` query param for any PgBouncer-fronted Postgres | Only needed for standalone PgBouncer < v1.21; Neon's managed proxy and PgBouncer ≥ 1.21 don't need it | Documented as of current Prisma docs (exact version-gate: PgBouncer 1.21.0) | This repo's `MANUAL-ACTIONS.md` still recommends the flag — should be corrected in this phase |
| `xk6-grpc` extension for k6 gRPC load testing | Native `k6/net/grpc` module, unary support built into k6 core | k6 v0.49.0 | No custom k6 binary build needed for this phase's two unary RPCs |
| Legacy Firebase FCM `/fcm/send` API (unrelated to this phase but touches the same `NotificationsService` this phase's load test exercises) | Firebase Admin SDK v9+ / FCM HTTP v1 | Google deprecated legacy API July 2024 | Not in this phase's scope, but worth knowing: `NotificationsService.sendPush()` already uses the v1 API per `CONCERNS.md`'s "Firebase Legacy API" entry being about token STORAGE, not the send API itself — re-confirmed correct during this research: `notifications.service.ts` calls `https://fcm.googleapis.com/v1/projects/...` (current API), so the load test's `SendPush` RPC will attempt a real (or failing, if unconfigured) FCM call each invocation — flag for the planner to stub/mock FCM during the load test, not hit the real API at load-test volume |

**Deprecated/outdated:**
- `pgbouncer=true` for Neon connections (see above)
- The project's `MANUAL-ACTIONS.md` Neon pooler guidance is stale on this specific point

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | This project runs on Neon's **Free plan** (not Launch/Scale) | Summary, Pitfall 2, Standard Stack sizing | If actually on Launch/Scale, the real `max_connections` ceiling could be 4-30x higher than the conservative floor used here — not dangerous (the plan would just be more conservative than necessary), but the Grafana alert threshold (D-07, 80% of ceiling) would be needlessly tight and could false-positive-alert well below the real limit |
| A2 | The active/floor compute size on whatever Neon plan is in use is at or near the autoscale minimum (0.25 CU → 104 `max_connections`) during low-traffic periods | Pitfall 2, connection_limit sizing recommendation | If the project has a higher fixed/minimum compute size configured, this assumption is overly conservative (same low-risk direction as A1) — but if Neon autoscales DOWN to 0.25 CU during idle periods (which Free/Launch plans do to save cost) and the load test doesn't account for that transient low ceiling, the load test could show false pool-exhaustion failures at the START of a ramp-up before Neon's autoscaler reacts |
| A3 | Neon's official Prisma guide's example `connection_limit=20` is a reasonable STARTING point for the monolith's slice of D-04's asymmetric split (not a final number) | Standard Stack, Pattern 1 | Low risk — explicitly framed as a starting point, not prescribed as final; planner is expected to size D-04's exact split |
| A4 | The `@opentelemetry/exporter-metrics-otlp-http` OTLP metrics endpoint uses the same `OTEL_EXPORTER_OTLP_ENDPOINT`/`GRAFANA_CLOUD_OTLP_TOKEN` env vars already configured for traces, with no separate metrics-specific endpoint path required | Pattern 4 (Code Examples) | If Grafana Cloud requires a distinct OTLP metrics ingestion path/token scope from the traces endpoint already wired in `instrumentation.ts`, the gauge metric would silently fail to export (same class of "code-side wired, live delivery unconfirmed" gap already documented for RESIL-02) — should be verified against the live Grafana Cloud OTLP endpoint config during implementation, not assumed from docs alone |

**If this table is empty:** N/A — see entries above; all four should be confirmed before the plan's numbers are treated as final.

## Open Questions (RESOLVED)

1. **What is the actual Neon plan/compute-size configuration for this project?**
   - What we know: Cost target (~$11/mo total) and "zero idle cost" framing strongly suggest Neon Free plan; Neon's public docs give a `max_connections`-by-CU table (104 @ 0.25 CU up to 3,357+ @ 8 CU).
   - What's unclear: The exact plan and CU autoscale range actually provisioned for this project — not recorded in any repo file, env example, or memory.
   - Recommendation: This phase's plan should include an early task requiring a human to check the Neon Console (Project → Settings → Compute, or Billing page) and record the actual plan/CU range in `.env.example` comments or a short note in `PROJECT.md`, before `connection_limit`/alert-threshold values are treated as final. Until then, size conservatively against the 0.25 CU floor (104 `max_connections`, ~93 effective pooled limit at 90%).
   - **Resolved:** Plan 16-04 Task 1 (checkpoint:human-verify) requires the operator to check the Neon Console and record the confirmed plan/CU/ceiling in `16-VERIFICATION.md`; Plan 16-04 Task 3 then applies the confirmed `connection_limit` to the live production Railway `DATABASE_URL`.

2. **Does the Grafana Cloud OTLP endpoint accept metrics at the same URL/token as traces?**
   - What we know: `backend/src/instrumentation.ts` currently only wires a `traceExporter` against `OTEL_EXPORTER_OTLP_ENDPOINT`.
   - What's unclear: Whether Grafana Cloud's specific OTLP gateway configured for this project (`otlp-gateway-prod-us-east-0.grafana.net/otlp` per `.env.example`) accepts metrics at the same path, or needs a distinct metrics-specific path/scope.
   - Recommendation: Verify against the live Grafana Cloud OTLP config during implementation (same "code-wired, live-delivery-needs-confirmation" pattern already established for RESIL-02 in Phase 11) — do not treat metric delivery as confirmed until a HUMAN-UAT step observes the gauge in Grafana.
   - **Resolved:** Plan 16-04 Task 2 (checkpoint:human-verify) has the operator log into Grafana Cloud during the combined-topology run and confirm the `postgres_open_connections` gauge shows live, moving values — metric delivery over the shared OTLP endpoint is confirmed there.

3. **Should `notifications-service`'s FCM calls be stubbed during the combined-topology load test?**
   - What we know: `NotificationsService.sendPush()` calls the real FCM v1 API if `FIREBASE_SERVICE_ACCOUNT_JSON` is configured; if not configured, it safely no-ops with a logged warning.
   - What's unclear: Whether the load-test environment has `FIREBASE_SERVICE_ACCOUNT_JSON` set (which would send real, possibly-throttled FCM calls at load-test volume) or unset (safe no-op, but then the load test isn't exercising the full code path, including whatever latency/resilience behavior `ResilienceService.execute('fcm', ...)` adds).
   - Recommendation: Confirm the load-test environment's `FIREBASE_SERVICE_ACCOUNT_JSON` state before running; if set, either point at a test/sandbox FCM project or accept the no-op path is what's actually being tested for connection-pool purposes (which is fine, since the FCM call happens AFTER the Prisma query in `sendPush`, so connection behavior is unaffected either way).
   - **Resolved:** Plan 16-03 Task 1's action reasoning settled this at planning time — no stubbing is required because `sendPush()`'s Prisma query executes before any FCM call, so the connection-pool behavior under test is unaffected by FCM's configured/no-op state either way.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| k6 binary | POOL-02 combined-topology load test | Not verified in this session (no shell access to check installed binaries beyond repo files) | Repo comment says "choco install k6 on Windows"; needs ≥ v0.49.0 for native `k6/net/grpc` | If an older k6 is installed, upgrade is required — no viable fallback for gRPC load without it |
| Neon Console / dashboard access | D-03 ceiling confirmation | Not verified — requires human login to Neon's web console, outside this research session's tool access | — | None — this is a genuine human-confirmation prerequisite, not something researchable further from the repo |
| Grafana Cloud account/OTLP token | D-07 alert configuration, metric delivery confirmation | `GRAFANA_CLOUD_OTLP_TOKEN` exists as an env var slot in `.env.example`; live value/access not verified in this session | — | Same "code-wired, live-delivery-unconfirmed" pattern as RESIL-02; plan should include a HUMAN-UAT step |
| `@opentelemetry/exporter-metrics-otlp-http` npm package | Pattern 4 metric export | ✓ published on npm at a version matching the project's existing OTel pin family | 0.218.0 (matches `^0.218.0` family) | — |

**Missing dependencies with no fallback:**
- Neon Console access to confirm the real plan/CU (A1/A2) — blocks finalizing exact `connection_limit`/alert-threshold numbers, though conservative defaults let the plan proceed without blocking on this.

**Missing dependencies with fallback:**
- k6 gRPC support — if the installed k6 binary predates v0.49.0, upgrading it is a low-effort fallback (no code changes needed).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x (backend, existing) |
| Config file | `backend/jest` config in `package.json` (unit); `backend/test/jest-e2e.json` (e2e) |
| Quick run command | `cd backend && npx jest prisma-config.spec.ts` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| POOL-01 | `DATABASE_URL` for both processes uses `-pooler` + explicit `connection_limit` | unit (config-presence assertion) | `cd backend && npx jest prisma-config.spec.ts -x` | ❌ Wave 0 — new file, see Code Examples |
| POOL-01 | `notifications-service` boots successfully with `ResilienceModule` imported | integration (manual boot check) | `cd backend && npx nest build notifications-service && node dist/apps/notifications-service/src/main.js` (expect clean listen log, no DI error, Ctrl+C to stop) | manual-only — no automated boot-smoke test exists for any of the 8 gRPC scaffolds today; adding one is optional polish, not required for this phase's success criteria |
| POOL-02 | Combined-topology load test confirms total open connections stay under the researched ceiling | load test (k6) | `k6 run --vus 50 --duration 60s load-tests/k6/main.js` (smoke) → `k6 run --env BASE_URL=... --env NOTIFICATIONS_GRPC_URL=... load-tests/k6/main.js` (full combined run) | ❌ Wave 0 — `main.js` needs the new notifications gRPC scenario wired in (D-06) |
| POOL-02 | Grafana shows the open-connections metric with an alert configured | manual (Grafana UI + human confirmation) | N/A — Grafana alert rules are not code in this repo (same pattern as RESIL-02) | manual-only, by design |

### Sampling Rate

- **Per task commit:** `cd backend && npx jest prisma-config.spec.ts` (fast, config-presence only)
- **Per wave merge:** `cd backend && npm test` (full backend unit suite) + a k6 smoke run (`--vus 50 --duration 60s`) against locally-running monolith + notifications-service
- **Phase gate:** Full k6 combined-topology run (`--vus 500` ramping toward realistic combined load, NOT necessarily the full 10,000-VU production-scale run — see Open Question 1 re: Free-tier ceiling likely being far below what a 10K-VU run would need) + a live Grafana dashboard check confirming the gauge metric is visible and the alert rule is saved, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/src/prisma/__tests__/prisma-config.spec.ts` — new config-presence test covering POOL-01
- [ ] `load-tests/k6/scenarios/notifications-grpc-flow.js` — new gRPC scenario covering POOL-02, needs wiring into `load-tests/k6/main.js`'s default export
- [ ] `packages/proto/tsconfig.json` — needed for the INT-02 build script (Code Examples); does not currently exist

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | This phase touches infra connection config, not auth flows |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | No | No new user-facing input surface introduced |
| V6 Cryptography | No | Neon's `-pooler` connection already enforces `sslmode=require`; no new crypto surface introduced by this phase |
| V7 Error Handling / Logging | Yes | The `DATABASE_URL` (including its embedded password) must never be logged — the new `pg_stat_activity` query and any connection-config debug logging added in this phase must log connection COUNTS, not the connection string itself |
| V14 Configuration | Yes | `connection_limit`, `pool_timeout`, and the `-pooler` hostname are new deploy-time config values — must be documented (per D-04's "explicit, documented" requirement) in `.env.example` and, per this project's existing convention, never hardcoded in source |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Connection string (with embedded DB password) leaked via logs, error messages, or Sentry breadcrumbs | Information Disclosure | Ensure any new error handling around Prisma connection failures in this phase logs the error TYPE/CODE, not the raw connection string; this is a pre-existing risk in the codebase (not newly introduced) but worth re-confirming isn't newly exposed by any new logging added for the `pg_stat_activity` cron |
| Connection pool exhaustion as an availability/DoS vector | Denial of Service | This is literally what POOL-01/02 addresses — explicit `connection_limit` + `pool_timeout` bounds the blast radius of any single process's connection usage; the Grafana alert (D-07) provides early warning before a DoS-style exhaustion event takes down the shared database for all services |

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma`, `backend/src/prisma/prisma.service.ts`, `backend/src/prisma/prisma.module.ts` — confirmed current (zero) pool config [VERIFIED: read directly]
- `backend/src/resilience/resilience.module.ts`, `backend/src/common/common.module.ts`, `backend/src/common/services/paystack.service.ts`, `backend/src/modules/notifications/notifications.service.ts`, `backend/apps/notifications-service/src/app.module.ts` — confirmed the DI boot blocker [VERIFIED: read directly]
- `backend/apps/notifications-service/src/notifications-grpc.controller.ts`, `packages/proto/notifications.proto` — confirmed the gRPC surface/method names for the load test [VERIFIED: read directly]
- `packages/proto/package.json`, `packages/proto/generate.sh` — confirmed the INT-02 compile-step gap [VERIFIED: read directly]
- `backend/apps/notifications-service/Dockerfile`, `backend/package.json` — confirmed the separate Docker workspace-scope gap and that it's out of this phase's execution path [VERIFIED: read directly]
- `load-tests/k6/main.js`, `load-tests/k6/scenarios/*.js` — confirmed existing k6 script structure to extend [VERIFIED: read directly]
- `backend/src/instrumentation.ts` — confirmed only a `traceExporter` is currently wired, no metrics [VERIFIED: read directly]
- [Neon: Connection pooling](https://neon.com/docs/connect/connection-pooling) — `-pooler` hostname format, `max_connections`-by-CU table, transaction-mode PgBouncer behavior, prepared-statement caveat [CITED: official Neon docs]
- [Neon: Using Prisma with Neon](https://neon.com/docs/guides/prisma) — official recommended `.env`/`connection_limit`/`pool_timeout` pattern, confirms `pgbouncer=true` not needed [CITED: official Neon docs]
- [Prisma: Configure Prisma Client with PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer) — `pgbouncer=true` version-gate (< PgBouncer 1.21), prepared-statement mechanics [CITED: official Prisma docs]
- [Grafana k6: k6/net/grpc](https://grafana.com/docs/k6/latest/javascript-api/k6-net-grpc/) — native unary gRPC client API, confirms no extension needed since k6 v0.49.0 [CITED: official k6 docs]
- `.planning/codebase/CONCERNS.md` §"No Database Connection Pooling Configured" — prior audit finding this phase resolves [VERIFIED: read directly]
- `.planning/research/PITFALLS.md` Pitfall 3 — prior Phase 2/v2.0-milestone research already identifying this exact pool-exhaustion risk [VERIFIED: read directly]

### Secondary (MEDIUM confidence)
- Neon's Free/Launch/Scale plan compute-size defaults and cost structure — from WebSearch results cross-referencing Neon's pricing page and third-party pricing breakdowns (not fetched directly from neon.com/pricing in this session) [MEDIUM: WebSearch summary, partially corroborated by the official docs fetch above]

### Tertiary (LOW confidence)
- This specific project's actual Neon plan/compute tier — not found anywhere in the repo; inferred only from cost-target framing (see Assumptions Log A1/A2)

## Metadata

**Confidence breakdown:**
- Standard stack (pooler mechanics, Prisma config, k6 gRPC): HIGH — verified against official Neon/Prisma/k6 documentation
- Architecture (DI blocker, boot sequence, metric pipeline): HIGH for the DI blocker (directly verified in codebase) / MEDIUM for the metrics-export pattern (standard OTel pattern, not verified against this project's live Grafana Cloud config)
- Pitfalls: HIGH for all codebase-verified findings (Pitfalls 1, 4, 5); MEDIUM for the Neon-ceiling sizing pitfall (Pitfall 2) since the exact tier is unconfirmed

**Research date:** 2026-07-18
**Valid until:** 30 days for the codebase-specific findings (DI blocker, INT-02 gap) unless those are fixed by this phase; Neon/Prisma/k6 documentation findings valid until the next major version change in any of those three products (check before reuse if this research is referenced beyond ~90 days)
