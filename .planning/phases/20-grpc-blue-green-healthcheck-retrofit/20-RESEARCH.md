# Phase 20: gRPC Blue-Green Healthcheck Retrofit - Research

**Researched:** 2026-07-20
**Domain:** NestJS gRPC microservice health-checking on Railway, distributed cron locking with ioredis, app-level canary-flag cutover for a single-hostname gRPC service
**Confidence:** HIGH — every discretion item CONTEXT.md flagged as needing verification was resolved against either official NestJS documentation (Context7), Railway's own docs/community threads, the npm registry, or direct reads of the exact files this phase touches. One item (the canary flag's precise semantics) required original synthesis reconciling several CONTEXT.md decisions — flagged clearly below as `[ASSUMED]`/discretion, not verified precedent.

## Summary

This phase is almost entirely de-risked by CONTEXT.md's D-01 through D-09 — the job here was to resolve the four "Claude's Discretion" items plus two additional ambiguities the CONTEXT.md canonical refs implicitly raise. All four resolve to concrete, low-effort answers:

1. **gRPC health check** — use the official `grpc-health-check` npm package (documented directly in NestJS's own gRPC microservices guide) via the `onLoadPackageDefinition` hook. Do **not** hand-roll a proto or add a new file to `packages/proto/` — the npm package ships its own standard `grpc.health.v1` proto and Node implementation, and NestJS's own docs show exactly this integration pattern for a `Transport.GRPC` microservice.
2. **Railway healthcheckPath + gRPC** — confirmed via Railway's own docs and community feedback threads: Railway healthchecks are HTTP-only, no native TCP/gRPC healthcheck exists (an open, unimplemented feature request as of this research). **A small HTTP sidecar is required.** The concrete mechanism is NestJS's documented "hybrid application" pattern (`NestFactory.create()` + `app.connectMicroservice()` + `startAllMicroservices()` + `app.listen()`), reusing `@nestjs/terminus` exactly like the monolith's existing `backend/src/health/health.controller.ts`.
3. **Cron lock pattern** — `RedisService.setNx()`'s exact signature and fail-open behavior confirmed at `backend/src/redis/redis.service.ts:131-137`; all 6 target methods confirmed present with exact line numbers and cron expressions; the wallet.service.ts precedent (a request-scoped, `finally`-released lock) needs a *different* shape for crons (skip-and-return, no throw, TTL as the actual safety net since there's no request/response `finally` guarantee).
4. **ResilienceService circuit-breaker tuning** — `notificationsGrpc`'s `ConsecutiveBreaker(8)` requires 8 *consecutive* transient failures (not a rate) to open; given Railway's healthcheck gates promotion, a well-executed cutover should produce zero failures during the swap. No code change recommended; the breaker's state is already one of D-06's two documented rollback signals, and its threshold is live-tunable via `PlatformConfig` (`resilience.notificationsGrpc.breaker_failure_threshold`) with no redeploy if the operator wants to loosen it before a specific cutover.

A fifth, more consequential finding surfaced during research and is **not** one of the four discretion bullets CONTEXT.md listed, but is necessary to implement D-01 correctly: **the canary flag cannot literally "route to the new vs. old instance"** the way Transport/Delivery's settlement-engine flag does, because `notifications-service` is a single Railway service with one stable internal hostname — there is no second network target to flip between without standing up a second parallel Railway service (which D-01 explicitly rejects). The coherent resolution (detailed in `## Critical Design Clarification` below) is that the flag is a **kill switch gating whether the monolith is allowed to call notifications-service at all**, independent of which code version Railway is currently running underneath — "rollback" means the monolith gracefully stops depending on notifications (reusing the exact `ServiceUnavailableException` path that already exists for real outages), not a literal traffic reroute. This reading is internally consistent with every other D-0x decision (synthetic-only shadow-verify, no parallel environment, "flip the same flag back" rollback) and should be confirmed as a locked design decision during planning, not left ambiguous.

**Primary recommendation:** Use `grpc-health-check` (npm) + NestJS hybrid-app pattern for GRPC-06a; guard all 6 named crons with a skip-and-return `setNx()` wrapper using a TTL just under each cron's own interval; implement the canary flag as an all-or-nothing "is notifications-service call-eligible" kill switch read once per call inside `NotificationsClientService`, defaulting to `true` in steady state; fold in the `NotificationsClientModule` circular-dependency fix by first reproducing the failure with a real Postgres instance (static analysis could not isolate the exact cyclic edge — see Open Questions).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| gRPC health endpoint (`grpc.health.v1.Health`) | API / Backend (gRPC microservice process) | — | Lives inside `notifications-service`'s own process, served on the same gRPC port; not a client-facing concern |
| HTTP `/healthz` sidecar for Railway | API / Backend (gRPC microservice process, hybrid HTTP+gRPC) | CDN/Static (Railway's proxy, which polls it) | Same process as above, second listener; Railway's edge proxy is the consumer |
| Distributed cron lock (`setNx`) | API / Backend (monolith — all 6 crons live in the monolith, not the extracted service) | Database / Storage (Redis) | Redis is the coordination substrate; the guarded logic itself is monolith business logic |
| Canary flag read/write | API / Backend (monolith: `NotificationsClientService` reads; `AdminController` writes) | Database / Storage (`PlatformConfig` table) | Same pattern as SETTLE-09 — config lives in Postgres, read fresh on every call, no caching |
| Bake-window observability | CDN/Static (Grafana Cloud, external) | API / Backend (`ResilienceService` breaker state, in-process) | Both signals already exist; this phase adds no new observability tier |
| Rollback runbook | — (documentation artifact) | — | Not a running system component |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRPC-06a | `notifications-service` exposes `grpc.health.v1.Health` wired to Railway's `healthcheckPath` | `grpc-health-check` npm package + `onLoadPackageDefinition` hook (official NestJS pattern) for the gRPC side; NestJS hybrid-app pattern (`connectMicroservice`) + `@nestjs/terminus` reuse for the HTTP sidecar Railway actually polls, since Railway cannot healthcheck gRPC/TCP directly |
| GRPC-06b | All 6 named `@Cron` jobs guarded by `RedisService.setNx()` | Exact method/line/cron-expression inventory below; concrete skip-and-return wrapper pattern; `db-metrics.service.ts`'s `pollOpenConnections` confirmed correctly excluded per D-07 |
| GRPC-06c | Shadow-verify + manual pointer-flip blue-green proven end-to-end with documented rollback | Exact `PlatformConfig` read/write mechanism confirmed (`AdminService.setConfig` / `PATCH /api/v1/admin/config/:key`); Critical Design Clarification resolves what the flag actually gates for a single-hostname service |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The "pointer" an operator flips is a `PlatformConfig`-style flag, reusing the exact pattern already proven by SETTLE-09 for Transport/Delivery's settlement-engine cutover (a boolean/percentage config row a `ClientGrpc`-calling code path checks before routing to the new vs. old instance). This satisfies GRPC-06c's literal "manual pointer-flip" wording without building a full parallel-Railway-environment/proxy/DNS-weight-shifting canary (rejected) and without relying solely on Railway's built-in health-gated rollout (rejected as insufficient alone).
- **D-02:** Adding `grpc.health.v1.Health` (GRPC-06a) is still required regardless of D-01 — it's what makes Railway's own rollout behave like blue-green instead of recreate. Necessary but not sufficient for GRPC-06c's operator-driven cutover proof.
- **D-03:** Shadow-verify is **synthetic-payload verification only** — test/synthetic RPCs (health check calls + known-safe test notifications to an ops-owned test number/email) directly to the new instance before flipping the flag. No live citizen traffic touches the new instance until the flag flips; the flip is instant/atomic, no gradual live-percentage split.
- **D-04:** Rollback is a markdown runbook (e.g. `docs/blue-green-cutover-runbook.md`). No new CLI/script — rollback is "flip the same config flag back."
- **D-05:** Bake window is **15 minutes, actively watched** by the operator (not passive/unattended, not a longer 1-hour window).
- **D-06:** Rollback trigger signal is the existing Grafana Cloud dashboard's gRPC error rate for `notifications-service` plus `ResilienceService`'s circuit-breaker state (open = trouble). No new dashboard/alert rule.
- **D-07:** Exactly 6 `@Cron` jobs get the lock: `stays.service.ts` `releaseEscrow` (EVERY_HOUR), `delivery.service.ts` `cleanStaleRiderHeartbeats` (EVERY_30_SECONDS), `transport.service.ts` `cleanStaleDriverHeartbeats` (EVERY_30_SECONDS), `tour-notifications.service.ts`'s `pushTMinus24h` (EVERY_HOUR), `pushTMinus2h` (`*/15 * * * *`), `pushPostTourRating` (`*/15 * * * *`). `db-metrics.service.ts`'s `pollOpenConnections` (EVERY_30_SECONDS) is explicitly left unlocked.
- **D-08:** `setNx()` keeps existing fail-open behavior unchanged for every guarded cron, including `releaseEscrow` — if Redis is unreachable, the lock optimistically returns "acquired" and the job still runs. No fail-closed policy for financial crons this phase.
- **D-09 (folded scope):** Fix the `NotificationsClientModule` circular-dependency bug breaking `test:e2e:tours`. Add the missing `forwardRef()`, get `npm run test:e2e:tours` green locally, then wire it into `.github/workflows/ci.yml` alongside the existing `test:e2e:settlement-splits` step.

### Claude's Discretion

- Exact shape of `grpc.health.v1.Health` implementation (hand-rolled proto + `HealthController` vs. npm package) — **resolved below: use `grpc-health-check` npm package.**
- Whether Railway's `healthcheckPath` can target gRPC directly, or requires an HTTP `/healthz` sidecar — **resolved below: sidecar required, confirmed against Railway's own docs/community.**
- Exact `PlatformConfig` key name/shape for the canary flag and where the `ClientGrpc`-calling code checks it — **resolved below, with an important semantics clarification beyond just "pick a key name."**
- `ResilienceService` circuit-breaker tuning for the cutover window — **resolved below: no change recommended, reasoning provided.**

### Deferred Ideas (OUT OF SCOPE)

- Full parallel-Railway-environment/proxy-based traffic-split canary (D-01) — explicitly rejected as more infrastructure than this milestone's budget/risk tolerance.
- Automated rollback script/CLI (D-04) — deferred in favor of a manual runbook.
- Numeric rollback threshold + new Grafana alert rule (D-06) — deferred; human-watched window doesn't need an automated alert on top.
- Fail-closed cron locking for financial crons (D-08) — would require `setNx()` to distinguish "lock acquired" from "Redis unavailable," which it currently cannot. Noted as future hardening only.
- "Wire ResilienceModule into gRPC service scaffolds" (INT-01) — already resolved in all 8 scaffolds, no action needed this phase.
</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `grpc-health-check` | `^2.1.0` [VERIFIED: npm registry, `npm view grpc-health-check version` → `2.1.0`, published 2025-08-06] | Implements the gRPC Health Checking Protocol (`grpc.health.v1.Health`) server-side | This is the exact package NestJS's own official documentation demonstrates for adding health checks to a `Transport.GRPC` microservice [CITED: github.com/nestjs/docs.nestjs.com/blob/master/content/microservices/grpc.md, via Context7] |
| `@nestjs/terminus` | `^11.1.1` [VERIFIED: `backend/package.json`, already installed] | HTTP health-check aggregation for the `/healthz` sidecar | Already used by the monolith's `backend/src/health/health.controller.ts` — zero new pattern, zero new dependency |

**Version verification:**
```bash
npm view grpc-health-check version        # 2.1.0
npm view grpc-health-check dependencies    # { '@grpc/proto-loader': '^0.7.13' }
```
`grpc-health-check` has no runtime dependency on `@grpc/grpc-js` itself (works against any grpc-js-based server, including this repo's `^1.14.3`); its own `@grpc/proto-loader` `^0.7.13` range coexists fine alongside the repo's `^0.8.1` in nested `node_modules` — no version-clash risk since these are independent installs, not shared singletons.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/microservices` | `^11.1.19` [VERIFIED: `backend/package.json`] | Provides `MicroserviceOptions`, `Transport.GRPC`, and the hybrid-app `connectMicroservice()` API | Already the transport layer for `notifications-service`; the hybrid-app pattern is a mode of the same package, not a new dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `grpc-health-check` | Hand-rolled `packages/proto/grpc-health.proto` + a `@GrpcMethod('Health','Check')` controller | More boilerplate (new `.proto` file, ts-proto codegen, a controller class) for zero functional benefit — `grpc-health-check`'s bundled proto IS the standard `grpc.health.v1` contract, and NestJS's own docs already show the exact integration. Hand-rolling only makes sense if the team wants zero new npm dependencies at any cost, which isn't the pattern this codebase follows elsewhere (it already pulls in single-purpose small packages like `qrcode`, `sharp`). |
| `grpc-health-check` | `grpc-js-health-check` (community drop-in fork targeting `@grpc/grpc-js` explicitly) | `grpc-health-check` (the canonical, NestJS-docs-referenced package) already works with `@grpc/grpc-js` per its own README's usage example; no need for a less-established fork [MEDIUM confidence — `grpc-js-health-check`'s exact API compatibility wasn't independently verified since the canonical package already suffices] |
| Hybrid HTTP+gRPC app (`connectMicroservice`) | A wholly separate tiny HTTP-only sidecar process/container just for `/healthz` | Two processes to deploy/monitor/scale instead of one; the hybrid-app pattern is NestJS's documented, zero-extra-infrastructure answer to "one process, two protocols" |

**Installation:**
```bash
npm install grpc-health-check --workspace=backend
```

## Critical Design Clarification: What the Canary Flag Actually Gates

CONTEXT.md's D-01 describes the flag as routing "to the new vs. old instance," mirroring Transport/Delivery's `*_settlement_engine_enabled` pattern. Direct code reads show why a literal transplant of that pattern doesn't fit `notifications-service`:

- **Transport/Delivery's flag** (`backend/src/modules/delivery/delivery.service.ts:577-583`, `backend/src/modules/transport/transport.service.ts:~530`) gates between **two code paths in the same process** — the legacy inline `$transaction` credit vs. the new `SettlementService.settle()` call. Both branches exist simultaneously in one deployed artifact; the flag picks which branch runs.
- **`notifications-service`'s architecture is different.** Since Phase 17 (17-04, D-01), the monolith has **no in-process notifications implementation left to fall back to** — `NotificationsController` and `TourNotificationsService` both call `NotificationsClientService`, which is a pure gRPC facade over `notifications-service` [VERIFIED: `backend/src/modules/notifications-client/notifications-client.service.ts`, `backend/src/modules/notifications/notifications.module.ts` comment: *"NotificationsController moved to NotificationsClientModule's controllers array so the monolith's REST endpoints are served by the gRPC facade"*].
- **Railway gives one stable hostname per service** (`NOTIFICATIONS_SERVICE_URL`, resolved once at `ClientsModule.registerAsync` factory init) [VERIFIED: `backend/src/modules/notifications-client/notifications-client.module.ts:40`; confirmed by prior research in `.planning/research/ARCHITECTURE.md` §Q2 finding 3]. A genuine "route to old vs. new instance" would require **two simultaneously-live Railway services with distinct hostnames** — exactly the parallel-environment approach D-01 explicitly rejects.

**Resolution `[ASSUMED — recommend confirming as a locked decision during planning, not treating as settled precedent]`:** The flag's real function for this specific service is a **kill switch gating whether the monolith is allowed to call `notifications-service` at all**, independent of which code Railway happens to be running underneath at that moment:

- **Steady state:** flag is `true` (or the row is absent and code treats absence as `true`, matching the "on by default" spirit of this being a safety gate added around an already-live feature, not a new opt-in).
- **Before a deploy:** operator can flip the flag to `false` first, so the monolith immediately stops depending on notifications-service (reusing the existing `ServiceUnavailableException` degrade path — see below) while Railway performs its own healthcheck-gated container swap underneath, invisible to the monolith either way.
- **After Railway promotes the new container:** operator runs D-03's synthetic verification directly against the service (bypassing the monolith entirely — e.g. a raw gRPC health/test-send call from a dev machine or CI job), independent of the flag.
- **Flag flips to `true`:** the monolith resumes calling notifications-service — whatever version Railway is currently running is what gets called; there is no "old instance" left to route to once Railway's own rollout has already replaced the container, which is exactly why D-02 states the gRPC healthcheck is "necessary but not sufficient" and D-01 needs a *separate* thing for the operator to flip.
- **Rollback (D-04):** "flip the flag back" now cleanly means "stop depending on notifications-service again," which the operator can do instantly regardless of what Railway is running, while separately triggering an actual Railway rollback/redeploy of the previous known-good commit if the code itself needs reverting (a distinct, already-existing Railway capability — redeploying a prior build — not something this phase needs to build).

This reading is internally consistent with D-03 (synthetic-only verification, no live traffic pre-flip), D-04 (runbook says "flip the flag back," no new tooling), and D-06 (watch Grafana/circuit-breaker during the bake window — both signals are about whether the monolith's calls to notifications-service are succeeding, which only makes sense if the flag is gating those calls, not a network route). **Recommend the planner treat this as the concrete design for D-01**, rather than the more literal (and structurally unbuildable-within-scope) "route to new vs old instance" reading.

**Implementation shape:**
- New key: `grpc.notifications_service.canary_enabled` (mirrors `<module>.<capability>_enabled` naming convention already used by `delivery.settlement_engine_enabled`/`transport.settlement_engine_enabled`).
- Read inside `NotificationsClientService` (the single choke point both call sites already funnel through — `NotificationsController` and `TourNotificationsService`, confirmed as the only 2 consumers via `grep NotificationsClientService`), not duplicated at each call site.
- Read pattern: mirror the exact strict-equality style already proven at `delivery.service.ts:577-583` — `const cfg = await this.prisma.platformConfig.findUnique({ where: { key: 'grpc.notifications_service.canary_enabled' } }); const enabled = cfg ? cfg.value === true : true;` (absent row defaults to `true` — the feature is live today; this flag is a safety brake being added around it, not a new opt-in gate).
- On `enabled === false`: throw the same `ServiceUnavailableException(UNAVAILABLE_MESSAGE)` `NotificationsClientService` already throws on a real gRPC failure (`backend/src/modules/notifications-client/notifications-client.service.ts:57,70`) — zero new caller-side error handling needed anywhere, since every existing call site already tolerates this exception.
- Write path: no new endpoint needed (see below).

## Architecture Patterns

### System Architecture Diagram

```
Operator (runbook, D-04)
   │
   │ 1. PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled  {value: false}
   ▼
AdminController ──▶ AdminService.setConfig() ──▶ PlatformConfig.upsert()  [Postgres]
                                                          │
                                                          │ read fresh, every call
                                                          ▼
Monolith (NestJS)                              NotificationsClientService
  NotificationsController ─┐                     ├─ reads canary_enabled flag
  TourNotificationsService ┘──calls──────────────▶├─ if false: throw ServiceUnavailableException
                                                    └─ if true: gRPC call via ClientGrpc
                                                              │
                                                              │ NOTIFICATIONS_SERVICE_URL
                                                              │ (stable Railway internal hostname)
                                                              ▼
                                            Railway: notifications-service (single service)
                                              ┌─────────────────────────────────────┐
                                              │ Hybrid NestJS app (main.ts)          │
                                              │  - HTTP listener :8080 /healthz ─────┼──▶ Railway proxy polls
                                              │    (terminus HealthCheckService)     │    healthcheckPath
                                              │  - gRPC listener :5008               │    (gates promotion of
                                              │    - NotificationsGrpcController      │     new container →
                                              │    - grpc-health-check Health service │     blue-green primitive)
                                              └─────────────────────────────────────┘
                                                              │
                                              2. Operator synthetic-verify (D-03):
                                                 direct gRPC health/test-send calls,
                                                 bypassing the monolith entirely
                                                              │
                                              3. Operator watches Grafana + ResilienceService
                                                 breaker state for 15 min (D-05/D-06)
                                                              │
                                              4. PATCH .../canary_enabled {value: true}
                                                 → monolith resumes real citizen traffic
```

### Recommended Project Structure

No new top-level directories. Changes land in existing locations:
```
backend/
├── apps/notifications-service/
│   ├── src/main.ts                 # rewritten: hybrid app (HTTP + gRPC), not pure createMicroservice
│   ├── src/health.controller.ts    # NEW — thin @nestjs/terminus GET /healthz
│   └── railway.toml                # + healthcheckPath, watchPaths unchanged
├── src/modules/notifications-client/
│   ├── notifications-client.service.ts   # + canary flag read before each gRPC call
│   └── notifications-client.module.ts    # + forwardRef() fix (D-09)
├── src/modules/{stays,delivery,transport}/*.service.ts   # + setNx() guard in 3 of the 6 crons
├── src/modules/tour-bookings/tour-notifications.service.ts  # + setNx() guard in 3 of the 6 crons
└── package.json                    # + grpc-health-check dependency

docs/
└── blue-green-cutover-runbook.md   # NEW — D-04 markdown runbook
```

### Pattern 1: gRPC Health Check via `onLoadPackageDefinition`

**What:** Register the standard `grpc.health.v1.Health` service alongside the existing `notifications` package on the same gRPC server, using the officially NestJS-documented hook.
**When to use:** Any `Transport.GRPC` microservice that needs Railway (or any orchestrator) to distinguish "process up" from "process actually serving correctly."
**Example:**
```typescript
// Source: NestJS official docs (content/microservices/grpc.md), via Context7 — HIGH confidence
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';

const grpcApp = app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: ['notifications', 'grpc.health.v1'],
    protoPath: [
      join(__dirname, '../../../../../packages/proto/notifications.proto'),
      healthCheckProtoPath,
    ],
    url: '0.0.0.0:5008',
    onLoadPackageDefinition: (pkg, server) => {
      const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
      healthImpl.addToServer(server);
      healthImpl.setStatus('', 'SERVING');
    },
  },
});
```
Note: `onLoadPackageDefinition` receives the raw `@grpc/grpc-js` `Server` NestJS is managing internally — the health service is added directly to it, no `@Controller`/`@GrpcMethod` boilerplate needed for `Check`/`Watch`.

### Pattern 2: NestJS Hybrid Application (HTTP sidecar + gRPC)

**What:** Bootstrap the process as a normal HTTP `INestApplication` first, then attach the gRPC microservice on top, so one process serves both an HTTP healthcheck and the gRPC business traffic.
**When to use:** Any gRPC-only service on Railway that needs `healthcheckPath` (Railway is HTTP-only — see Common Pitfalls).
**Example:**
```typescript
// Source: NestJS official docs (content/faq/hybrid-application.md), via Context7 — HIGH confidence
// Rewritten backend/apps/notifications-service/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['notifications', 'grpc.health.v1'],
      protoPath: [join(__dirname, '../../../../../packages/proto/notifications.proto'), healthCheckProtoPath],
      url: '0.0.0.0:5008',
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080); // HTTP — this is what Railway's healthcheckPath polls
  console.log('notifications-service gRPC :5008, HTTP healthz :8080');
}
```
`AppModule` needs a companion HTTP controller (mirrors `backend/src/health/health.controller.ts`'s existing `@nestjs/terminus` pattern exactly):
```typescript
// backend/apps/notifications-service/src/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get('healthz')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
```

### Pattern 3: Cron Distributed Lock (skip-and-return, not throw-and-release)

**What:** Guard a `@Cron` method so only one replica's tick actually executes per interval, using the existing fail-open `setNx()` primitive.
**When to use:** All 6 named crons (D-07). Deliberately different shape from `wallet.service.ts:227`'s request-scoped lock — a cron has no request/response cycle guaranteeing a `finally` runs if the process is killed mid-tick, so the TTL itself (not a `finally`-released `del`) is the actual safety net against a stuck lock.
**Example:**
```typescript
// Pattern derived from existing precedent at backend/src/redis/redis.service.ts:131-137
// and backend/src/modules/wallet/wallet.service.ts:224-246 (request-scoped variant),
// adapted for a Cron's fire-and-forget lifecycle — HIGH confidence (direct code read
// of the primitive), MEDIUM confidence on the "skip silently" convention (new to this
// codebase, no cron-lock precedent exists yet per Pitfall 4).
@Cron(CronExpression.EVERY_HOUR)
async releaseEscrow(): Promise<void> {
  const acquired = await this.redis.setNx('cron-lock:releaseEscrow', '1', 3300); // 55min, < 1h interval
  if (!acquired) {
    this.logger.debug('releaseEscrow: lock held by another replica — skipping this tick');
    return;
  }
  // ... existing body unchanged ...
}
```
TTL guidance per interval (keep TTL strictly less than the cron's own interval so a crashed replica's stale lock self-clears before the next legitimate tick, never blocking it):

| Cron | Interval | Suggested lock TTL |
|------|----------|---------------------|
| `releaseEscrow` | `EVERY_HOUR` | 3300s (55 min) |
| `cleanStaleRiderHeartbeats` | `EVERY_30_SECONDS` | 25s |
| `cleanStaleDriverHeartbeats` | `EVERY_30_SECONDS` | 25s |
| `pushTMinus24h` | `EVERY_HOUR` | 3300s (55 min) |
| `pushTMinus2h` | `*/15 * * * *` | 840s (14 min) |
| `pushPostTourRating` | `*/15 * * * *` | 840s (14 min) |

### Anti-Patterns to Avoid

- **Reusing `wallet.service.ts`'s `finally { del() }` shape verbatim for crons:** that pattern is correct for a request-scoped lock inside a guaranteed try/finally around a single HTTP request, but a cron killed mid-execution (deploy, OOM, crash) never reaches its `finally` — relying on explicit release alone (without a bounded TTL as backstop) risks a permanently stuck lock blocking every future replica. TTL-as-safety-net is the correct shape here.
- **Hand-rolling a `grpc.health.v1` proto** when the `grpc-health-check` npm package already implements exactly this, is the pattern NestJS's own docs demonstrate, and requires zero `packages/proto/` changes or ts-proto codegen.
- **Interpreting D-01's "route to new vs. old instance" literally** by standing up a second Railway service/hostname for notifications-service — this is the parallel-environment approach D-01 itself explicitly rejects. See Critical Design Clarification above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| gRPC health protocol implementation | A custom `Check`/`Watch` proto + controller | `grpc-health-check` npm package + `onLoadPackageDefinition` | Standard protocol, standard package, NestJS's own docs show this exact integration — building a bespoke version adds proto-authoring + codegen + testing surface for a solved problem |
| HTTP healthcheck aggregation for the sidecar | A bare `@Get('healthz') check() { return {status:'ok'} }` with no real readiness signal | `@nestjs/terminus`'s `HealthCheckService`, mirroring `backend/src/health/health.controller.ts` | Already a project dependency and pattern; terminus supports adding real indicators later (DB/Redis reachability) without a rewrite |
| Distributed cron coordination | A custom leader-election scheme or a new locking library | `RedisService.setNx()` (already exists, already fail-open by design) | The exact primitive Pitfall 4 in prior milestone research already named as the fix — it's a "small, mechanical, already-primitive-backed change," not a new subsystem |

**Key insight:** Every piece of this phase already has an existing, proven primitive somewhere in the codebase (health checks → terminus; locks → `setNx()`; config flags → `PlatformConfig` + `AdminController`). The actual work is wiring, not invention — resist the urge to design anything net-new beyond the canary-flag semantics clarification above.

## Common Pitfalls

### Pitfall 1: Assuming Railway's `healthcheckPath` Can Target gRPC or TCP Directly

**What goes wrong:** A `railway.toml` `healthcheckPath` pointed at a gRPC endpoint (or left unset, assuming Railway will "figure out" the gRPC port is healthy) silently does nothing — Railway's healthcheck mechanism issues an HTTP GET and expects a 200; it has no protocol-aware TCP/gRPC probe.
**Why it happens:** Reasonable assumption given "healthcheck" is a generic-sounding config key, and the monolith's own `railway.toml` already uses it successfully — but for HTTP, not gRPC.
**How to avoid:** Confirmed via Railway's own docs and an open, unimplemented community feature request (`station.railway.com/feedback/add-support-for-tcp-or-grpc-healthchecks-...`) that this is HTTP-only, as of this research. Build the hybrid HTTP+gRPC app (Pattern 2) and point `healthcheckPath` at the new HTTP route.
**Warning signs:** `railway.toml` healthcheckPath set to something like `:5008` or a gRPC method name with no HTTP route ever added.

### Pitfall 2: Circuit Breaker State Only Reflects Calls That Are Actually Attempted

**What goes wrong:** If the canary flag (per the Critical Design Clarification) is `false` during a cutover, `NotificationsClientService` never attempts a gRPC call at all — meaning `ResilienceService`'s `notificationsGrpc` breaker state stays whatever it was before (it won't reflect the new deployment's health, because nothing is calling it). D-06's "watch the circuit-breaker state" signal is **only meaningful once the flag is flipped back to `true`** and real calls resume.
**Why it happens:** The kill-switch design (this phase's own resolution) and the breaker are two independent signals that only compose correctly in a specific order.
**How to avoid:** The runbook (D-04) should sequence explicitly: (1) flag off → (2) Railway deploy/promote → (3) synthetic verify directly against the service (bypasses flag, bypasses breaker) → (4) flag on → (5) *now* watch Grafana + breaker state for the 15-minute bake window, since only now are real calls flowing through it.
**Warning signs:** A runbook draft that says "watch the breaker" before the flag is flipped back on.

### Pitfall 3: `test:e2e:tours`'s Circular Dependency Root Cause Wasn't Isolated by Static Analysis

**What goes wrong:** The pending todo (`2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md`) names `NotificationsClientModule` as the module Nest's error message implicates, but static grep of the module graph found no obvious bidirectional edge: `NotificationsClientModule` has no `imports` beyond `ClientsModule`/`ConfigModule`, and the only module importing it (`TourBookingsModule`, plus a second, independent top-level import in `AppModule`) does not appear in `NotificationsClientModule`'s own `imports` array. `grep forwardRef` across `backend/src` shows **zero existing uses of `forwardRef()` anywhere in this codebase** — meaning this will be the first.
**Why it happens:** Nest's circular-dependency error can surface from an indirect, multi-hop cycle, or a provider-level (not module-level) circular constructor injection, which static file reads alone don't always reveal — the actual stack trace only appears when the DI container tries to resolve it at runtime (`npm run test:e2e:tours` against a real Postgres instance, per the todo's own reproduction steps).
**How to avoid:** Before writing a fix, reproduce the failure locally with a live Postgres connection (`npm run test:e2e:tours`) and read Nest's full circular-dependency error output — it typically lists every module in the cycle in order. Do not guess which side needs `forwardRef()` from static reads alone.
**Warning signs:** A plan that specifies "add `forwardRef()` to `NotificationsClientModule`'s import of X" without X having been confirmed by an actual reproduced stack trace.

### Pitfall 4: `wallet-invariant.e2e-spec.ts` May Not Actually Exercise the Circular Dependency

**What goes wrong:** `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` (despite its `.e2e-spec.ts` suffix and inclusion in `test:e2e:tours`'s `testPathPattern`) directly instantiates `TourSettlementService` with mocked `PrismaService`/`RefundService`/`KafkaService` — it does not appear to bootstrap `AppModule` via `Test.createTestingModule` the way `e2e-tour-booking.e2e-spec.ts` does (confirmed: `setup-e2e-tours.ts`'s `bootstrapE2EApp()` uses `Test.createTestingModule({ imports: [AppModule] })`, and only `e2e-tour-booking.e2e-spec.ts` imports that helper). If the circular-dependency error only throws during full `AppModule` compilation, `wallet-invariant.e2e-spec.ts` failing might be a secondary/unrelated symptom (or a shared-jest-worker cascade), not proof the same root cause affects both files.
**Why it happens:** The todo's file list groups both specs together based on both failing when the pattern is run together; it doesn't establish that both fail for the *same* reason.
**How to avoid:** Run `e2e-tour-booking.e2e-spec.ts` and `wallet-invariant.e2e-spec.ts` in isolation (not via the combined `testPathPattern`) during the fix, to confirm whether the circular-dependency error is specific to the `AppModule`-bootstrapping spec only.
**Warning signs:** A fix that resolves `e2e-tour-booking.e2e-spec.ts` but `wallet-invariant.e2e-spec.ts` still fails for an unrelated reason, mistakenly attributed to an incomplete `forwardRef()` fix.

## Code Examples

### Admin config write path (already exists, no new endpoint needed for the canary flag)
```typescript
// Source: backend/src/modules/admin/admin.service.ts:166-172 (direct code read, HIGH confidence)
setConfig(key: string, value: any) {
  return this.prisma.platformConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
```
```typescript
// Source: backend/src/modules/admin/admin.controller.ts:96-100 (direct code read, HIGH confidence)
@Patch('config/:key')
@ApiOperation({ summary: 'Upsert platform config value' })
setConfig(@Param('key') key: string, @Body('value') value: any) {
  return this.adminService.setConfig(key, value);
}
```
Operator runbook step: `PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled` with body `{ "value": false }` (then `{ "value": true }` to flip back) — already role-gated `SUPER_ADMIN`/`LGA_ADMIN` + `JwtAuthGuard` at the controller level, no new auth work.

### SETTLE-09's exact strict-equality read pattern (template for the new flag)
```typescript
// Source: backend/src/modules/delivery/delivery.service.ts:577-583 (direct code read, HIGH confidence)
const cutoverCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery.settlement_engine_enabled' },
});
// WR-01: strict equality avoids Boolean("false") === true footgun on the
// untyped Json PlatformConfig column for this safety-critical flag.
const cutoverEnabled = cutoverCfg?.value === true;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `notifications-service` bootstraps via pure `NestFactory.createMicroservice()` (gRPC-only, no HTTP) | Hybrid app: `NestFactory.create()` + `connectMicroservice()` + `startAllMicroservices()` | This phase | Enables Railway's `healthcheckPath` to gate rollout at all; today Railway can only detect "process crashed," not "process up but broken" |
| No `@Cron` job in the codebase has any distributed-lock guard | All 6 named crons guarded by `RedisService.setNx()` | This phase | Closes the double-fire risk any dual-liveness window (blue-green cutover or accidental horizontal scale) creates — previously only `wallet.service.ts`'s request-scoped lock used this primitive |

**Deprecated/outdated:** None — this phase adds capability, it doesn't replace an existing deprecated pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The canary flag's correct semantics are "kill switch gating whether the monolith calls notifications-service at all," not "route between two live instances" | Critical Design Clarification | If the planner instead builds a literal dual-hostname routing mechanism, it either requires the parallel-Railway-environment approach D-01 explicitly rejected, or produces a flag that has no real effect (since `ClientGrpc`'s target is resolved once at module init and Railway only exposes one hostname per service) — wasted implementation effort or a flag that doesn't actually gate anything |
| A2 | The exact root cause of the `NotificationsClientModule` circular dependency could not be isolated via static analysis; grep found no `forwardRef()` usage anywhere in the codebase and no obvious bidirectional module edge | Common Pitfalls 3 & 4 | Planner should budget time to reproduce the failure live (real Postgres) before writing the fix, rather than assuming a specific one-line `forwardRef()` insertion point is already known |
| A3 | Railway's healthcheck mechanism cannot target gRPC or TCP as of this research (based on official docs + a still-open, unimplemented community feature request) | Standard Stack, Pattern 2, Pitfall 1 | If Railway ships gRPC/TCP healthcheck support before this phase executes, the HTTP-sidecar work becomes unnecessary extra surface (though still harmless/functional) — worth a quick re-check of Railway's changelog at implementation time given this is an actively-requested feature |

## Open Questions

1. **Does Railway's per-service networking configuration support one service exposing both a private-networking gRPC port (5008) and a healthcheck-polled HTTP port (8080) simultaneously?**
   - What we know: Railway's `healthcheckPath` config is documented as HTTP-only and works via the service's assigned domain/port; the monolith already does exactly this pattern (one process, `healthcheckPath` + business traffic on the same port 3001).
   - What's unclear: `notifications-service` currently exposes ONLY the internal gRPC port (5008) with no public/private HTTP port at all — whether Railway's dashboard/project settings need an explicit second port declared (beyond what `railway.toml`'s `[deploy]` section covers) for the healthcheck to actually reach the new HTTP listener is a Railway *project configuration* question that static repo research cannot resolve; it may require an operator action in Railway's dashboard during execution, not purely a code/toml change.
   - Recommendation: Treat as a verify-at-deploy-time step in the phase plan (not a blocker for writing the code), and have the operator confirm Railway's networking tab picks up the new HTTP port automatically (Railway typically auto-detects a listening port) before considering GRPC-06a done.

2. **Which specific file/edge causes the `NotificationsClientModule` circular dependency?**
   - What we know: The todo names the module and the two failing spec files; grep confirms zero existing `forwardRef()` usage codebase-wide and no obvious static bidirectional import.
   - What's unclear: The exact cyclic edge — likely only visible in Nest's actual runtime error stack trace when `test:e2e:tours` is run against a real Postgres instance.
   - Recommendation: First task in this workstream should be "reproduce locally, capture the full Nest circular-dependency stack trace," before deciding where `forwardRef()` goes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `grpc-health-check` (npm) | GRPC-06a | Not yet installed — but confirmed published and installable | `2.1.0` on npm registry | None needed — package is small, stable, zero heavy transitive deps |
| Real Postgres instance (for `test:e2e:tours` reproduction, D-09) | Folded scope fix | Available via `docker-compose.yml` (`postgres` service) or CI's `postgres:16-alpine` service container | — | CI already runs Postgres for other e2e suites; local dev can use the existing `docker-compose.yml` stack |
| Railway project access (to verify HTTP+gRPC dual-port config) | GRPC-06a deploy verification | Assumed available to the operator (existing live `notifications-service` deployment) | — | If unavailable during planning, defer this specific verification to execution/deploy time (see Open Question 1) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — `grpc-health-check` is a straightforward `npm install`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x (unit) + `ts-jest`, separate `jest --config test/jest-e2e.json` profile for e2e (`.e2e-spec.ts$` files) [VERIFIED: `backend/package.json`, `backend/test/jest-e2e.json`] |
| Config file | `backend/test/jest-e2e.json` (e2e), default Jest config in `backend/package.json` (unit) |
| Quick run command | `npm test -- --forceExit --passWithNoTests` (backend unit tests, matches CI step) |
| Full suite command | `npm run test:e2e:tours -- --forceExit --passWithNoTests` (once D-09's fix lands and this is wired into CI) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRPC-06a | `grpc.health.v1.Health` responds `SERVING` on the gRPC port | unit/integration | New spec asserting `HealthImplementation` wiring — e.g. a small grpc-js client call against a test server instance | ❌ Wave 0 |
| GRPC-06a | HTTP `/healthz` returns 200 | unit | `supertest`-free HTTP client hit against the hybrid app's HTTP listener (mirrors monolith's own health check test, if one exists — verify) | ❌ Wave 0 (confirm no existing `health.controller.spec.ts` first) |
| GRPC-06b | Two concurrent `setNx()` calls for the same cron key → only one acquires | unit | New spec per guarded cron (or one shared spec exercising the `RedisService.setNx()` guard helper directly) asserting the second call returns `false` when Redis reports the key exists | ❌ Wave 0 |
| GRPC-06b | Redis unreachable → cron still executes (fail-open, D-08) | unit | Existing `redis.service.spec.ts` pattern (mock `enabled=false`) extended per guarded cron, or one shared assertion on the `setNx()` primitive itself (already implicitly covered — `RedisService.setNx()` already returns `true` when disabled, confirmed at `redis.service.ts:132`) | ✅ (primitive already tested; per-cron call-site test still needed) |
| GRPC-06c | Canary flag `false` → `NotificationsClientService` throws `ServiceUnavailableException` without attempting a gRPC call | unit | Extend `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` (existing mock pattern for `ClientGrpc`/`ResilienceService` already established) | ✅ file exists, needs new test cases |
| GRPC-06c | Canary flag `true`/absent → existing gRPC call behavior unchanged | unit | Same file — regression case ensuring the flag addition doesn't alter today's passing tests | ✅ |
| D-09 | `test:e2e:tours` passes locally against real Postgres | e2e | `npm run test:e2e:tours -- --forceExit --passWithNoTests` | ✅ (test files exist; currently failing — this IS the fix target) |

### Sampling Rate

- **Per task commit:** `npm test -- --forceExit --passWithNoTests` (backend unit tests)
- **Per wave merge:** `npm run test:e2e:tours` (once green) + `npm run test:e2e:settlement-splits` (existing, must stay green)
- **Phase gate:** Both e2e suites green, plus a manual/operator-executed dual-liveness check (see Wave 0 gap below — no automated equivalent exists) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] No existing test proves two replicas of the same cron actually coexist and only one fires — `docker-compose.yml`'s `notifications-service` block uses a fixed `container_name` and fixed host port mapping (`5008:5008`), which blocks `docker compose up --scale notifications-service=2` without first removing both (Wave 0 task: either add a scale-friendly compose override for this specific validation, or explicitly document this as a manual/operator-executed test in the runbook rather than an automated one).
- [ ] No existing spec file for `backend/src/health/health.controller.ts` was found during this research — confirm whether one exists before assuming the new `notifications-service` health controller needs a net-new test pattern invented from scratch.
- [ ] `grpc-health-check`'s `HealthImplementation` wiring has no existing test precedent in this codebase (first gRPC health check ever added here) — Wave 0 should include writing a minimal test harness (a raw `@grpc/grpc-js` client dialing the test server's health port) before relying on manual `grpcurl`-style verification alone.

## Sources

### Primary (HIGH confidence)
- Context7 (`/nestjs/docs.nestjs.com`) — `content/microservices/grpc.md` (gRPC health check via `grpc-health-check` + `onLoadPackageDefinition`; multi-package `protoPath`/`package` arrays), `content/faq/hybrid-application.md` (hybrid app `connectMicroservice`/`startAllMicroservices` pattern), `content/faq/http-adapter.md`
- npm registry — `npm view grpc-health-check version/dependencies/time.modified` (2.1.0, published 2025-08-06, depends on `@grpc/proto-loader@^0.7.13`); `npm view grpc-health-check readme` (API shape: `HealthImplementation`, `ServingStatusMap`, `addToServer`, `setStatus`)
- Direct codebase reads (all HIGH confidence, this session): `backend/src/redis/redis.service.ts` (setNx exact signature/behavior), `backend/src/modules/wallet/wallet.service.ts:224-246` (existing lock precedent), `backend/apps/notifications-service/src/{main.ts,app.module.ts,notifications-grpc.controller.ts}`, `backend/apps/notifications-service/railway.toml`, `backend/apps/notifications-service/Dockerfile`, `backend/src/modules/notifications-client/{notifications-client.module.ts,notifications-client.service.ts,__tests__/notifications-client.service.spec.ts}`, `backend/src/modules/notifications/{notifications.module.ts,notifications.controller.ts}`, `backend/src/modules/admin/{admin.service.ts,admin.controller.ts}`, `backend/src/modules/{stays,delivery,transport}/*.service.ts` (exact cron line numbers/expressions), `backend/src/modules/tour-bookings/tour-notifications.service.ts` (exact cron line numbers/expressions), `backend/src/common/services/db-metrics.service.ts` (confirmed excluded cron), `backend/src/resilience/{resilience.service.ts,resilience.types.ts}` (ConsecutiveBreaker semantics, live-tunable via PlatformConfig), `backend/src/health/{health.controller.ts,health.module.ts}` (existing terminus pattern), `backend/src/app.module.ts`, `backend/src/modules/tour-bookings/tour-bookings.module.ts`, `backend/src/modules/admin/admin.module.ts`, `backend/src/modules/settlement-disputes/settlement-disputes.module.ts`, `packages/proto/{generate.sh,notifications.proto,package.json}`, `docker-compose.yml`, `.github/workflows/ci.yml`, `backend/package.json`, `.planning/todos/pending/2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md`, `backend/test/{setup-e2e-tours.ts,e2e-tour-booking.e2e-spec.ts,jest-e2e.json}`, `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts`

### Secondary (MEDIUM confidence)
- [Railway Deployments — Healthchecks docs](https://docs.railway.com/deployments/healthchecks) — confirms HTTP-only, 200-status polling model, `RAILWAY_HEALTHCHECK_TIMEOUT_SEC` env var
- [Railway Help Station: "Add support for TCP or GRPC healthchecks"](https://station.railway.com/feedback/add-support-for-tcp-or-grpc-healthchecks-c6768f58) — confirms this is a still-open, unimplemented feature request as of this research (cross-referenced against the official docs above, consistent)
- [gRPC Health Checking Protocol guide](https://grpc.io/docs/guides/health-checking/) — confirms `Check`/`Watch` RPC shapes and the standard `grpc.health.v1.Health` service contract `grpc-health-check` implements

### Tertiary (LOW confidence)
- None — every finding in this research was cross-verified against either official documentation, the npm registry, or direct repository reads.

## Metadata

**Confidence breakdown:**
- Standard stack (grpc-health-check + terminus hybrid pattern): HIGH — official NestJS docs, verified npm registry
- Architecture (canary flag semantics): MEDIUM — internally consistent original synthesis reconciling multiple CONTEXT.md decisions, not itself a verified external precedent; flagged as A1 in Assumptions Log
- Cron lock pitfalls: HIGH — exact primitive and all 6 target methods directly confirmed in code
- Circular dependency root cause (D-09): LOW — could not be isolated statically; flagged as Open Question 1/A2, requires live reproduction before implementation

**Research date:** 2026-07-20
**Valid until:** 30 days (stable NestJS/Railway ecosystem; re-check Railway's gRPC/TCP healthcheck feature request status if this phase slips past that window, per A3)
