# Phase 20: gRPC Blue-Green Healthcheck Retrofit - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 12
**Analogs found:** 9 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/apps/notifications-service/src/main.ts` | config/bootstrap | request-response (hybrid HTTP+gRPC) | `backend/src/main.ts` (HTTP half) + itself (gRPC half, current file) | partial (no existing hybrid-app precedent anywhere in repo) |
| `backend/apps/notifications-service/src/health.controller.ts` (new) | controller | request-response | `backend/src/health/health.controller.ts` | exact |
| `backend/apps/notifications-service/railway.toml` | config | — | `backend/railway.toml` (monolith) | exact |
| `backend/src/modules/stays/stays.service.ts` (`releaseEscrow`) | service, cron | event-driven (scheduled) | `backend/src/modules/wallet/wallet.service.ts:224-246` (setNx lock shape) + `backend/src/modules/transport/transport.service.ts` (RedisService DI pattern) | role-match (lock primitive same; shape must be adapted, RedisService not yet injected here) |
| `backend/src/modules/delivery/delivery.service.ts` (`cleanStaleRiderHeartbeats`) | service, cron | event-driven (scheduled) | `backend/src/modules/wallet/wallet.service.ts:224-246` (setNx lock shape) | role-match (RedisService already injected in this file) |
| `backend/src/modules/transport/transport.service.ts` (`cleanStaleDriverHeartbeats`) | service, cron | event-driven (scheduled) | `backend/src/modules/wallet/wallet.service.ts:224-246` (setNx lock shape) | role-match (RedisService already injected in this file) |
| `backend/src/modules/tour-bookings/tour-notifications.service.ts` (3 crons) | service, cron | event-driven (scheduled) | `backend/src/modules/wallet/wallet.service.ts:224-246` (lock shape) + `backend/src/modules/transport/transport.service.ts` (RedisService DI pattern) | role-match (lock primitive same; RedisService not yet injected here) |
| `backend/src/modules/notifications-client/notifications-client.service.ts` (canary flag) | service, gRPC facade | request-response | `backend/src/modules/transport/transport.service.ts:528-534` and `backend/src/modules/delivery/delivery.service.ts:577-583` (`*_settlement_engine_enabled` flag read) | exact (this is the literal precedent CONTEXT.md D-01 names) |
| `backend/src/modules/notifications-client/notifications-client.module.ts` (`forwardRef()` fix) | module (DI wiring) | — | none — zero `forwardRef()` usage anywhere in codebase | no analog (first-of-its-kind; use NestJS official docs pattern) |
| `.github/workflows/ci.yml` (add `test:e2e:tours` step) | CI config | batch | same file, lines 88-90 (`test:e2e:settlement-splits` step) | exact |
| `docs/blue-green-cutover-runbook.md` (new) | documentation | — | none — no `docs/` directory exists in repo today | no analog |
| `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` (extend) | test | request-response | same file (existing test structure) | exact |

## Pattern Assignments

### `backend/apps/notifications-service/src/main.ts` (bootstrap, hybrid HTTP+gRPC)

**Analogs:** current file (gRPC half) + `backend/src/main.ts` (HTTP-listener half, for the general "create app, apply config, listen" shape — do NOT copy helmet/compression/CORS/Swagger from the monolith, those are monolith-only concerns)

**Current gRPC-only bootstrap** (`backend/apps/notifications-service/src/main.ts`, full file, 19 lines):
```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'notifications',
      protoPath: join(__dirname, '../../../../../packages/proto/notifications.proto'),
      url: '0.0.0.0:5008',
    },
  });
  await app.listen();
  console.log('notifications-service gRPC listening on :5008');
}

bootstrap();
```

**Required rewrite shape** (per RESEARCH.md Pattern 2, NestJS official hybrid-app docs — HIGH confidence, no repo precedent to copy verbatim since this is the first hybrid app in the codebase):
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['notifications', 'grpc.health.v1'],
      protoPath: [
        join(__dirname, '../../../../../packages/proto/notifications.proto'),
        healthCheckProtoPath, // from 'grpc-health-check'
      ],
      url: '0.0.0.0:5008',
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080); // HTTP — Railway's healthcheckPath polls this
  console.log('notifications-service gRPC :5008, HTTP healthz :8080');
}
```
Preserve the existing `protoPath` relative-depth comment/convention (5×`../` from this file's `__dirname` to reach `packages/proto/`) — do not change the depth math when adding the second proto entry.

**Import block precedent** for keeping `AppModule` unchanged shape (`backend/apps/notifications-service/src/app.module.ts`, full file):
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
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
    DbMetricsModule,
    NotificationsModule,
  ],
  controllers: [NotificationsGrpcController],
})
export class AppModule {}
```
`HealthController` (new) must be added to this module's `controllers` array alongside `NotificationsGrpcController` — do not create a separate module for it, matching this codebase's habit of keeping small scaffolds flat.

---

### `backend/apps/notifications-service/src/health.controller.ts` (new controller, request-response)

**Analog:** `backend/src/health/health.controller.ts` (full file, 17 lines) — exact match, copy verbatim minus the `@ApiTags`/`@ApiOperation` Swagger decorators (this scaffold app has no Swagger setup — verify before copying; if absent, drop those two decorators and the `@nestjs/swagger` import):
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  check() {
    return this.health.check([]);
  }
}
```
Note: the monolith's route is `GET /health` (under global prefix `/api/v1` → `/api/v1/health`). The new scaffold's route in RESEARCH.md's example uses `@Get('healthz')` with no route prefix (`@Controller()`, not `@Controller('health')`) since this hybrid app has no global `/api/v1` prefix applied — confirm which path `railway.toml`'s `healthcheckPath` should point at and keep both in sync. `HealthModule` companion (if one exists for the monolith) should be checked (`backend/src/health/health.module.ts`) for whether `TerminusModule` needs importing into `AppModule` — it is not currently imported in `notifications-service`'s `AppModule` and will need adding.

---

### `backend/apps/notifications-service/railway.toml` (config)

**Analog:** `backend/railway.toml` (monolith, full file, 15 lines):
```toml
# railway.toml — monolith deployment config (Wave 1-2)
# Wave 3: per-microservice toml files live at backend/apps/<service>/railway.toml
# healthcheckPath requires GET /api/v1/health endpoint (created in Plan 02-04)

[build]
builder = "DOCKERFILE"
dockerfilePath = "backend/Dockerfile"
buildContext = "."

[deploy]
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Current notifications-service file** (full file, 8 lines — to be modified in place):
```toml
[build]
dockerfilePath = "backend/apps/notifications-service/Dockerfile"
buildContext = "."

[deploy]
watchPaths = ["backend/apps/notifications-service/**", "backend/src/modules/notifications/**", "packages/proto/**"]
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```
Add `healthcheckPath = "/healthz"` (or whatever path `health.controller.ts` ends up using) and `healthcheckTimeout = 60` to the `[deploy]` block, mirroring the monolith's key names exactly. Keep `watchPaths` and the existing `restartPolicy*` keys unchanged. Note this file has no `builder = "DOCKERFILE"` key (monolith has it, this file relies on `dockerfilePath` alone) — do not add it unless verified necessary, to keep the diff minimal.

---

### Cron distributed-lock pattern — applies to 6 methods across 4 files

**Analog (the only existing `setNx()` precedent in the codebase):** `backend/src/modules/wallet/wallet.service.ts:224-246`
```typescript
// C-02: idempotency lock — prevents two concurrent topup requests from both passing
// the daily-limit check at the same millisecond (TOCTOU race).
const idempKey = `topup:lock:${userId}`;
const acquired = await this.redis.setNx(idempKey, '1', 30); // 30s lock
if (!acquired) {
  throw new BadRequestException('A top-up is already in progress — please wait');
}

const reference = `ISY-FUND-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

try {
  const payment = await this.paystack.initiatePayment({ /* ... */ });
  return { reference, authorizationUrl: payment.authorizationUrl };
} finally {
  // Release the lock regardless of success or failure
  await this.redis.del(idempKey);
}
```

**`setNx()` primitive itself** (`backend/src/redis/redis.service.ts:126-137`, NOT modified this phase — D-08 keeps behavior as-is):
```typescript
/**
 * Atomic SET NX EX — sets the key only if it does not exist, with a TTL.
 * Returns true if the lock was acquired, false if it already existed.
 * If Redis is unavailable, returns true (optimistic — allow the operation).
 */
async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!this.client || !this.enabled) return true; // optimistic fallback
  try {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch { return true; } // optimistic fallback on error
}
```

**Required NEW shape for crons** (skip-and-return, NOT try/finally — no repo precedent yet, first cron-lock in the codebase; per RESEARCH.md Pattern 3, apply to all 6 target methods):
```typescript
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
Do NOT wrap the existing body in try/finally with `this.redis.del()` — a killed-mid-tick cron never reaches `finally`; TTL alone is the safety net (see RESEARCH.md Anti-Patterns). TTL must stay strictly under each cron's own interval:

| File | Method | Interval | Lock TTL |
|------|--------|----------|----------|
| `stays.service.ts:329-330` | `releaseEscrow` | `EVERY_HOUR` | 3300s |
| `delivery.service.ts:829-830` | `cleanStaleRiderHeartbeats` | `EVERY_30_SECONDS` | 25s |
| `transport.service.ts:822-823` | `cleanStaleDriverHeartbeats` | `EVERY_30_SECONDS` | 25s |
| `tour-notifications.service.ts:163-164` | `pushTMinus24h` | `EVERY_HOUR` | 3300s |
| `tour-notifications.service.ts:243-244` | `pushTMinus2h` | `*/15 * * * *` | 840s |
| `tour-notifications.service.ts` (~line 302) | `pushPostTourRating` | `*/15 * * * *` | 840s |

**Constructor injection gap — `RedisService` is MISSING in 2 of the 4 target files:**
- `backend/src/modules/transport/transport.service.ts:14,51` — already has `RedisService` injected (copy this DI shape):
  ```typescript
  import { RedisService } from '../../redis/redis.service';
  // ...
  constructor(
    // ...
    private redis: RedisService,
  ) {}
  ```
- `backend/src/modules/delivery/delivery.service.ts:16,62` — already has `RedisService` injected, same shape.
- `backend/src/modules/stays/stays.service.ts` — **`RedisService` NOT currently injected.** Must add the same `import { RedisService } from '../../redis/redis.service';` + constructor param shown above. `RedisModule` is `@Global()` (`backend/src/redis/redis.module.ts`), so no module-level import is needed in `StaysModule` — constructor injection alone is sufficient.
- `backend/src/modules/tour-bookings/tour-notifications.service.ts` — **`RedisService` NOT currently injected.** Same fix required; current constructor (lines 52-58):
  ```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsClientService,
    private readonly sendgrid: SendgridService,
    private readonly pdf: ItineraryPdfService,
    private readonly config: ConfigService,
  ) {}
  ```
  Add `private readonly redis: RedisService,` to this list plus the import.

**Excluded cron (D-07 — do NOT add a lock):** `backend/src/common/services/db-metrics.service.ts`'s `pollOpenConnections` (`EVERY_30_SECONDS`) — only writes a local in-memory gauge, no shared side effect. Leave unmodified.

---

### `backend/src/modules/notifications-client/notifications-client.service.ts` (canary flag gate)

**Analog (exact precedent named by CONTEXT.md D-01):** `backend/src/modules/transport/transport.service.ts:528-534`
```typescript
// D-07: cutover-flag gate — read fresh on every call, never cached.
const cutoverCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'transport.settlement_engine_enabled' },
});
// WR-01: strict equality avoids Boolean("false") === true footgun on the
// untyped Json PlatformConfig column for this safety-critical flag.
const cutoverEnabled = cutoverCfg?.value === true;
```
Same pattern, `backend/src/modules/delivery/delivery.service.ts:577-583`:
```typescript
// 13-03: read the cutover flag from PlatformConfig — NEVER hardcode.
const cutoverCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery.settlement_engine_enabled' },
});
const cutoverEnabled = cutoverCfg?.value === true;
```

**Current file to modify** (`backend/src/modules/notifications-client/notifications-client.service.ts`, full file, 74 lines) — note this file has NO `PrismaService` injected today (it's a pure gRPC facade). Per RESEARCH.md's Critical Design Clarification, the flag semantics here are a **kill switch** (not a route-to-old-vs-new), read once inside this service before every gRPC attempt, reusing the existing `ServiceUnavailableException` degrade path already present at lines 57 and 70:
```typescript
constructor(
  @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
  private readonly resilience: ResilienceService,
) {}
// registerToken/sendPush both currently: try { ... } catch (err) { logger.error(...); throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE); }
```
Add `PrismaService` to the constructor (mirrors every other feature service's DI shape — e.g. `stays.service.ts`, `transport.service.ts` both inject `PrismaService` as their first param), and gate each network method with the flag-read-then-throw shape shown above, key name `grpc.notifications_service.canary_enabled`, defaulting to `true` when the row is absent (per RESEARCH.md's resolution — this is a safety brake on an already-live feature, not a new opt-in).

**Test analog** for the new flag test cases — extend `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` (existing file, 154 lines) using its established `makeService()` factory + `mockClientGrpc`/`mockResilience` shape; add a `mockPrisma = { platformConfig: { findUnique: jest.fn() } }` following `wallet.service.spec.ts`'s `mockRedis` mocking convention (`const mockRedis = { setNx: jest.fn().mockResolvedValue(true), del: jest.fn().mockResolvedValue(1) };`).

---

### `backend/src/modules/notifications-client/notifications-client.module.ts` (`forwardRef()` fix, D-09)

**No analog** — `grep forwardRef` across `backend/src` returns zero matches; this will be the first use in the codebase. Do not guess the cyclic edge from static reads — RESEARCH.md Pitfall 3 confirms the root cause could not be isolated statically. Reproduce `npm run test:e2e:tours` against a live Postgres instance first and read Nest's full circular-dependency stack trace (it lists every module in the cycle in order) before choosing which side of the cycle gets `forwardRef(() => X)`.

**Current file** (full file, 52 lines) — the two modules in the suspected cycle per RESEARCH.md: `NotificationsClientModule` (this file) and `TourBookingsModule` (`backend/src/modules/tour-bookings/tour-bookings.module.ts:34`, which imports `NotificationsClientModule` alongside `TourPackagesModule`/`TourGuidesModule`). No bidirectional static edge was found — the actual fix location must come from the runtime stack trace, not this file read alone.

**NestJS `forwardRef()` official usage shape** (for whichever side needs it, once confirmed):
```typescript
@Module({
  imports: [forwardRef(() => OtherModule)],
  // ...
})
```

---

### `.github/workflows/ci.yml` (CI wiring)

**Analog:** same file, lines 88-90 (existing `test:e2e:settlement-splits` step):
```yaml
      - name: E2E tests (settlement split tier audit trail)
        working-directory: backend
        run: npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests
```
Add an equivalent step for `test:e2e:tours`, placed adjacent (before or after) this step, same `working-directory: backend` pattern:
```yaml
      - name: E2E tests (tour booking + wallet invariant + KYC encryption)
        working-directory: backend
        run: npm run test:e2e:tours -- --forceExit --passWithNoTests
```
`package.json` script already exists (`backend/package.json:19`): `"test:e2e:tours": "jest --config test/jest-e2e.json --testPathPattern=\"wallet-invariant|kyc-encryption|e2e-tour-booking\""` — no new script needed, only the CI step and the underlying `forwardRef()` fix (D-09) that makes it pass.

---

### `docs/blue-green-cutover-runbook.md` (new, documentation)

**No analog** — no `docs/` directory exists anywhere in the repository today (`Glob("docs/**/*.md")` returned zero files). This is a net-new documentation artifact with no in-repo markdown-runbook precedent to copy structure from. Base its content directly on CONTEXT.md's D-01 through D-06 decisions and RESEARCH.md's "System Architecture Diagram" sequence (flag off → Railway deploy/promote → synthetic verify → flag on → 15-min watched bake → rollback = flip flag back), plus RESEARCH.md Pitfall 2's explicit sequencing warning (breaker/Grafana signal is only meaningful once the flag is back on).

## Shared Patterns

### `PlatformConfig` flag-gated cutover (D-01's literal precedent)
**Source:** `backend/src/modules/transport/transport.service.ts:528-534`, `backend/src/modules/delivery/delivery.service.ts:577-583`
**Apply to:** `notifications-client.service.ts`'s new canary-flag gate
```typescript
const cutoverCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<key>' } });
const cutoverEnabled = cutoverCfg?.value === true; // strict equality — never Boolean(cfg.value)
```

### Admin config read/write (already exists, reused as-is — no new endpoint)
**Source:** `backend/src/modules/admin/admin.service.ts:166-172`, `backend/src/modules/admin/admin.controller.ts:96-100`
**Apply to:** operator flag-flip step in the runbook (`PATCH /api/v1/admin/config/:key` with `{ "value": false|true }`), no code changes needed here
```typescript
setConfig(key: string, value: any) {
  return this.prisma.platformConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
}
```

### Distributed cron lock (`setNx()`, skip-and-return shape)
**Source:** primitive at `backend/src/redis/redis.service.ts:131-137`; existing (differently-shaped) caller at `backend/src/modules/wallet/wallet.service.ts:224-246`
**Apply to:** all 6 named crons in `stays.service.ts`, `delivery.service.ts`, `transport.service.ts`, `tour-notifications.service.ts`
```typescript
const acquired = await this.redis.setNx(`cron-lock:<methodName>`, '1', <ttlSecondsUnderInterval>);
if (!acquired) { this.logger.debug('<methodName>: lock held by another replica — skipping this tick'); return; }
```

### Terminus HTTP health check
**Source:** `backend/src/health/health.controller.ts` (full file)
**Apply to:** `backend/apps/notifications-service/src/health.controller.ts` (new)
```typescript
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}
  @Get()
  @HealthCheck()
  check() { return this.health.check([]); }
}
```

### `ServiceUnavailableException` degrade path (reused, not new)
**Source:** `backend/src/modules/notifications-client/notifications-client.service.ts:9,57,70`
**Apply to:** the canary-flag-off branch — throw the exact same exception/message already thrown on real gRPC failure, so zero caller-side error handling changes anywhere
```typescript
const UNAVAILABLE_MESSAGE = 'Notifications service is temporarily unavailable, please try again shortly';
throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/apps/notifications-service/src/main.ts` (hybrid rewrite) | bootstrap | request-response | No hybrid HTTP+gRPC app exists anywhere in this codebase yet — all 8 `backend/apps/*-service` scaffolds are pure `createMicroservice()`. Use NestJS official docs pattern (RESEARCH.md Pattern 2) as the template instead of an in-repo analog. |
| `backend/src/modules/notifications-client/notifications-client.module.ts` (`forwardRef()`) | module (DI) | — | Zero `forwardRef()` usage anywhere in the codebase (confirmed via grep in RESEARCH.md). First-of-its-kind; exact insertion point requires live reproduction of the circular-dependency stack trace, not static analog matching. |
| `docs/blue-green-cutover-runbook.md` | documentation | — | No `docs/` directory exists in the repo today; no markdown-runbook precedent to model structure on. |
| gRPC health-check wiring itself (`onLoadPackageDefinition` + `grpc-health-check`) | integration | request-response | First gRPC health check ever added in this codebase (RESEARCH.md Wave 0 gap) — no prior `HealthImplementation` usage to copy; follow the NestJS-docs code sample verbatim instead. |

## Metadata

**Analog search scope:** `backend/src/modules/{wallet,transport,delivery,stays,tour-bookings,notifications,notifications-client,admin}/`, `backend/src/{health,redis}/`, `backend/apps/*-service/`, `backend/railway.toml`, `.github/workflows/ci.yml`, repo root `docs/` (absent)
**Files scanned:** ~20 (targeted Grep + Read, no full-repo scan needed — CONTEXT.md/RESEARCH.md canonical refs already named exact files/line numbers for nearly every target)
**Pattern extraction date:** 2026-07-20
