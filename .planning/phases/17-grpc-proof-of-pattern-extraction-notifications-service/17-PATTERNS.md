# Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 17
**Analogs found:** 14 / 17 (3 have no direct in-repo analog — first-of-kind gRPC client wiring; NestJS official docs cited instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/modules/notifications-client/notifications-client.module.ts` (NEW) | provider/config (dynamic module) | request-response | `backend/src/modules/auth/auth.module.ts` (`JwtModule.registerAsync`) | role-match (registerAsync+ConfigService shape); no in-repo `ClientsModule` precedent exists |
| `backend/src/modules/notifications-client/notifications-client.service.ts` (NEW) | service (facade over gRPC client) | request-response (unary RPC) | `backend/src/common/services/paystack.service.ts` | role-match (resilience-wrapped external-vendor call + `ServiceUnavailableException` on failure) |
| `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` (NEW) | test | request-response | `backend/src/resilience/__tests__/resilience.service.spec.ts` + `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` | role-match (NestJS `Test.createTestingModule` + manual mock provider pattern) |
| `backend/src/modules/notifications/notifications.controller.ts` (MODIFIED) | controller (REST) | request-response | itself (pre-change version) | exact — same file, swap injected service only |
| `backend/src/modules/tour-bookings/tour-notifications.service.ts` (MODIFIED) | service (cron + event handler) | event-driven / batch | itself (pre-change version) | exact — same file, swap injected service only |
| `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` (MODIFIED) | test | event-driven | itself (pre-change version) | exact — swap `provide: NotificationsService` → `provide: NotificationsClientService` |
| `backend/src/resilience/resilience.types.ts` (MODIFIED) | config (types + defaults) | — | itself (pre-change version) | exact — add `notificationsGrpc` to `Vendor` union + `RESILIENCE_DEFAULTS` |
| `backend/src/resilience/resilience.service.ts` (MODIFIED) | service (shared classifier/utility) | transform | itself (pre-change version, `isTransientError()`) | exact — add a branch, don't restructure |
| `backend/src/resilience/__tests__/resilience.service.spec.ts` (MODIFIED) | test | transform | itself (pre-change version) | exact — extend `isTransientError narrowing` describe block |
| `backend/package.json` (MODIFIED) | config | — | root `package.json`'s workspaces array (for the dependency-declaration convention) | role-match |
| `backend/Dockerfile` (MODIFIED) | config (build) | file-I/O | `backend/apps/notifications-service/Dockerfile` (identical gap, same fix shape) | exact-pattern (same `npm ci` line needs the same correction in both files) |
| `backend/apps/notifications-service/Dockerfile` (MODIFIED) | config (build) | file-I/O | `backend/Dockerfile` | exact-pattern (mirror fix) |
| `backend/apps/notifications-service/src/notifications-grpc.controller.ts` (MODIFIED) | controller (gRPC server) | request-response | itself (pre-change version) | exact — pass through the new `data` field |
| `packages/proto/notifications.proto` (MODIFIED) | contract/schema | — | itself (pre-change version) | exact — additive-only field |
| `docker-compose.yml` (MODIFIED) | config (deploy topology) | — | existing `backend:`/`web:` service blocks in the same file | role-match (no gRPC service block precedent exists yet — first of kind) |
| `.env.example` (MODIFIED) | config | — | existing `# ─── gRPC Microservices (Wave 3) ───` block (`NOTIFICATIONS_SERVICE_URL` already there) | exact — same section, naming decision required (see Shared Patterns / Open Question) |
| `.planning/phases/17-.../17-CALLER-GRAPH-AUDIT.md` (NEW, D-11) | documentation artifact | — | RESEARCH.md's own "Caller-Graph Audit" table (already drafted, lines 531-540) | exact — copy verbatim, it's already grep-verified |

## Pattern Assignments

### `backend/src/modules/notifications-client/notifications-client.module.ts` (NEW)

**Analog:** `backend/src/modules/auth/auth.module.ts` (lines 12-19) for the `registerAsync` shape; `backend/src/common/common.module.ts` for the "small dedicated module, export the service" shape (D-02 explicitly says "mirrors CommonModule's shared-infra pattern" — but note `CommonModule` is `@Global()` while `NotificationsClientModule` is explicitly imported per-consumer, matching how `NotificationsModule` itself is imported today, not globally).

**registerAsync pattern to copy** (`backend/src/modules/auth/auth.module.ts` lines 12-19):
```typescript
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get('JWT_SECRET'),
    signOptions: { expiresIn: '15m' },
  }),
}),
```

**Module import/export shape to copy** (`backend/src/modules/notifications/notifications.module.ts`, full file — 10 lines):
```typescript
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

**Adapted target shape** (from RESEARCH.md Pattern 1, already vetted against this repo — use directly):
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { NotificationsClientService } from './notifications-client.service';

export const NOTIFICATIONS_PACKAGE = 'NOTIFICATIONS_PACKAGE';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'notifications',
            protoPath: join(__dirname, '../../../../packages/proto/notifications.proto'),
            url: config.get<string>('NOTIFICATIONS_GRPC_URL', 'localhost:5008'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [NotificationsClientService],
  exports: [NotificationsClientService],
})
export class NotificationsClientModule {}
```

---

### `backend/src/modules/notifications-client/notifications-client.service.ts` (NEW)

**Analog:** `backend/src/common/services/paystack.service.ts` (lines 1-63) — the strongest in-repo match for "wrap an external-network call in `ResilienceService.execute()`, log the failure detail, throw `ServiceUnavailableException` with a friendly message."

**Imports pattern** (`paystack.service.ts` lines 1-4):
```typescript
import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ResilienceService } from '../../resilience/resilience.service';
```

**Resilience + error-handling pattern to copy** (`paystack.service.ts` lines 40-62):
```typescript
try {
  const response = await this.resilience.execute('paystack', ({ signal }) =>
    axios.post(
      `${this.baseUrl}/transaction/initialize`,
      { email, amount: amountKobo, reference, metadata, ...(callbackUrl && { callback_url: callbackUrl }) },
      { headers: { Authorization: `Bearer ${secretKey}` }, signal },
    ),
  );
  const { authorization_url, access_code, reference: ref } = response.data.data;
  return { authorizationUrl: authorization_url, accessCode: access_code, reference: ref };
} catch (err) {
  const status = (err as any)?.response?.status;
  const body = (err as any)?.response?.data;
  this.logger.error(`Paystack initiate failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
  throw new ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly');
}
```

**Exact method signatures to preserve** (D-01 — from `backend/src/modules/notifications/notifications.service.ts`, full file, 121 lines — the facade must match these 3 method shapes byte-for-byte at the call-site level):
```typescript
async listForUser(_userId: string): Promise<any[]> { return []; }
async registerToken(userId: string, token: string) { /* returns { registered: true } */ }
async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) { /* returns { sent, reason? } */ }
```

**Target facade implementation** (from RESEARCH.md Pattern 2 — vetted against this repo's exact method signatures and error convention, use directly):
```typescript
import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { notifications } from '@iseyaa/proto';
import { ResilienceService } from '../../resilience/resilience.service';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.module';

@Injectable()
export class NotificationsClientService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsClientService.name);
  private grpcService!: notifications.NotificationsServiceClient;

  constructor(
    @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit() {
    this.grpcService = this.client.getService<notifications.NotificationsServiceClient>('NotificationsService');
  }

  async listForUser(_userId: string): Promise<any[]> {
    return []; // D-03: local no-op stub — no proto RPC, no network call.
  }

  async registerToken(userId: string, token: string): Promise<{ registered: boolean }> {
    try {
      const res = await this.resilience.execute('notificationsGrpc', () =>
        firstValueFrom(this.grpcService.registerToken({ userId, fcmToken: token })),
      );
      return { registered: res.success };
    } catch (err: any) {
      this.logger.error(`gRPC registerToken failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('Notifications service is temporarily unavailable, please try again shortly');
    }
  }

  async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const res = await this.resilience.execute('notificationsGrpc', () =>
        firstValueFrom(this.grpcService.sendPush({ userId, title, body, data: data ?? {} })),
      );
      return { sent: res.success };
    } catch (err: any) {
      this.logger.error(`gRPC sendPush failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('Notifications service is temporarily unavailable, please try again shortly');
    }
  }
}
```

**Divergence to flag in the plan (not a pattern to copy, a decision to make):** the in-process service never throws — `sendPush`/`registerToken` return `{ sent: false, reason }` shapes on business-logic failure. The facade above only throws on **transport failure**. `SendPushResponse` proto currently has no `reason` field (Pitfall 5) — decide whether to widen it or accept the gap in the D-11 audit doc.

---

### `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` (NEW)

**Analog 1 (mock-provider wiring shape):** `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` lines 1-74 — `Test.createTestingModule({ providers: [ServiceUnderTest, { provide: Dep, useValue: mockDep }] }).compile()`.

**Analog 2 (resilience/circuit-breaker test shape, if testing gRPC-specific transient classification too):** `backend/src/resilience/__tests__/resilience.service.spec.ts` lines 24-37 (module setup) and lines 212-226 (`.code`-shaped rejection → still retries pattern) — directly reusable for asserting `notificationsGrpc`'s numeric gRPC status-code classification once `isTransientError()` is patched.

**Mock `ClientGrpc`/`getService` shape (no in-repo precedent — first `ClientGrpc` mock in this codebase):**
```typescript
const mockGrpcService = { sendPush: jest.fn(), registerToken: jest.fn() };
const mockClientGrpc = { getService: jest.fn().mockReturnValue(mockGrpcService) };
// mockGrpcService.sendPush.mockReturnValue(of({ success: true })) — use rxjs `of()` since
// gRPC client methods return Observables (firstValueFrom converts them in the facade).
```

---

### `backend/src/modules/notifications/notifications.controller.ts` (MODIFIED)

**Analog:** itself, pre-change (full file, 31 lines) — only the import + injected type change; guard/decorator/route shapes are untouched.

**Current shape to preserve exactly (guards, decorators, routes)** (lines 1-30):
```typescript
import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Req() req: any) { return this.notificationsService.listForUser(req.user.userId); }

  @Post('register-token')
  registerToken(@Req() req: any, @Body('token') token: string) {
    return this.notificationsService.registerToken(req.user.userId, token);
  }

  @Post('send')
  send(@Body() body: { userId: string; title: string; message: string; data?: any }) {
    return this.notificationsService.sendPush(body.userId, body.title, body.message, body.data);
  }
}
```

**Minimal diff (D-01 requires "minimal diff" swap):** replace the `NotificationsService` import + injected type with `NotificationsClientService` from `../notifications-client/notifications-client.service`. Do NOT touch guards, decorators, or route paths. D-06's 503 propagation is automatic — the facade throws `ServiceUnavailableException`, NestJS's exception layer converts it to HTTP 503 with no controller-level try/catch needed (matches how every other controller in this codebase lets `ServiceUnavailableException` bubble — confirmed convention, no controller anywhere wraps a service call in try/catch for this).

---

### `backend/src/modules/tour-bookings/tour-notifications.service.ts` (MODIFIED)

**Analog:** itself, pre-change (full file, 479 lines) — only the constructor injection type changes (line 6 import, line 54 constructor param); all 3 `@Cron` methods' `this.notifications.sendPush(...)` call sites (lines 195-200, 278-283, 337-341) stay byte-identical since the facade preserves the same method signature.

**Constructor injection to change** (lines 1-58):
```typescript
import { NotificationsService } from '../notifications/notifications.service';
// ...
constructor(
  private readonly prisma: PrismaService,
  private readonly notifications: NotificationsService,   // → NotificationsClientService
  private readonly sendgrid: SendgridService,
  private readonly pdf: ItineraryPdfService,
  private readonly config: ConfigService,
) {}
```

**Existing catch-and-log-no-rethrow contract to preserve (D-07 — do NOT change this)** (e.g. lines 230-235):
```typescript
} catch (err: any) {
  this.logger.error(`pushTMinus24h failed for booking ${b.id}: ${err.message}`);
  // Leave flag unset → retry on next hourly tick.
}
```
D-07 confirms: the facade's `ServiceUnavailableException` throw is caught here exactly as any other error would be — no change to this catch block's non-rethrow contract, only to what type gets thrown underneath it.

**Module wiring to update** (`backend/src/modules/tour-bookings/tour-bookings.module.ts` line 10, line 33):
```typescript
import { NotificationsModule } from '../notifications/notifications.module';
// ...
imports: [TourPackagesModule, TourGuidesModule, NotificationsModule],  // → NotificationsClientModule
```

---

### `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` (MODIFIED)

**Analog:** itself, pre-change (lines 1-74 shown) — swap the mock provider token only.

**Current mock-provider shape to change** (lines 1-9, 62-71):
```typescript
import { NotificationsService } from '../../notifications/notifications.service';
// ...
mockNotifications = { sendPush: jest.fn().mockResolvedValue({ sent: true }) };
// ...
providers: [
  TourNotificationsService,
  { provide: PrismaService, useValue: mockPrisma },
  { provide: NotificationsService, useValue: mockNotifications },   // → NotificationsClientService
  { provide: SendgridService, useValue: mockSendgrid },
  { provide: ItineraryPdfService, useValue: mockPdf },
  { provide: ConfigService, useValue: mockConfig },
],
```
Per Pitfall 4 (RESEARCH.md): confirm no `NotificationsService`-shaped mock survives unreferenced after the swap — grep the file for `NotificationsService` post-edit.

---

### `backend/src/resilience/resilience.types.ts` (MODIFIED)

**Analog:** itself, pre-change (full file, 45 lines) — add one union member + one `RESILIENCE_DEFAULTS` entry, following the existing per-vendor comment convention.

**Current shape** (lines 11-20, 29-44):
```typescript
export type Vendor =
  | 'paystack'
  | 'paystackRefund'
  | 'termiiAuth'
  | 'termiiDelivery'
  | 'anthropic'
  | 's3'
  | 'fcm'
  | 'metaWhatsapp'
  | 'sendgrid';

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  // ...
  fcm: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // ...
};
```

**Pattern to copy — add `notificationsGrpc`** (per RESEARCH.md's Claude's Discretion recommendation, mirroring `fcm`'s shape since both are push-notification-related, best-effort, non-financial):
```typescript
export type Vendor =
  | 'paystack'
  | 'paystackRefund'
  | 'termiiAuth'
  | 'termiiDelivery'
  | 'anthropic'
  | 's3'
  | 'fcm'
  | 'metaWhatsapp'
  | 'sendgrid'
  | 'notificationsGrpc';

// notificationsGrpc: same-region Railway-internal gRPC hop — expected faster than the
// FCM HTTP round-trip it wraps; mirrors fcm's shape as a starting point (tunable via
// PlatformConfig without a code change — see ResilienceService.readConfig()).
notificationsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
```

---

### `backend/src/resilience/resilience.service.ts` (MODIFIED)

**Analog:** itself, pre-change — `isTransientError()` function (lines 212-235).

**Current function to extend (add a branch, do not restructure)**:
```typescript
function isTransientError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;

  if ((err as any)?.isTaskCancelledError === true) return true;

  const code = (err as any)?.code;
  if (
    typeof code === 'string' &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR', 'ERR_CANCELED'].includes(code)
  ) {
    return true;
  }

  if ((err as any)?.name === 'AbortError') return true;

  return false;
}
```

**New branch to insert (from RESEARCH.md Pattern 3 — must land BEFORE the string-code branch's `typeof code === 'string'` check, since gRPC's `.code` is numeric and would otherwise silently fall through)**:
```typescript
import { status as GrpcStatus } from '@grpc/grpc-js';
// ...
const grpcCode = (err as any)?.code;
if (typeof grpcCode === 'number') {
  return (
    grpcCode === GrpcStatus.UNAVAILABLE ||
    grpcCode === GrpcStatus.DEADLINE_EXCEEDED ||
    grpcCode === GrpcStatus.RESOURCE_EXHAUSTED
  );
}
```
Do NOT add `INTERNAL`/`UNKNOWN`/`INVALID_ARGUMENT` — same exclusion rationale already applied to axios 4xx (deterministic failures should not retry).

---

### `backend/src/resilience/__tests__/resilience.service.spec.ts` (MODIFIED)

**Analog:** itself, pre-change — `isTransientError narrowing (WR-04)` describe block (lines 190-244) is the exact test shape to replicate for the new gRPC branch.

**Pattern to copy** (lines 212-226 — "still retries genuine network-level errors shaped with a recognized `.code`"):
```typescript
it('still retries genuine network-level errors shaped with a recognized .code (e.g. ECONNREFUSED)', async () => {
  await service.onModuleInit();
  const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });
  try { await service.execute('paystack', fn); } catch { /* expected */ }
  expect(fn.mock.calls.length).toBeGreaterThan(1);
});
```
**New test to add (mirror shape, numeric gRPC code, use the new `notificationsGrpc` vendor)**:
```typescript
it('retries a gRPC ServiceError with numeric code UNAVAILABLE (14) for the notificationsGrpc vendor', async () => {
  await service.onModuleInit();
  const fn = jest.fn().mockRejectedValue({ code: 14 /* UNAVAILABLE */, details: 'no connection' });
  try { await service.execute('notificationsGrpc', fn); } catch { /* expected */ }
  expect(fn.mock.calls.length).toBeGreaterThan(1);
});
```
**Also required:** update line 40's stale comment (`'builds all 9 vendor policies...'` → `'builds all 10 vendor policies...'`) per Pitfall 6 — purely descriptive, `Object.keys(RESILIENCE_DEFAULTS)` iteration itself needs no change.

---

### `backend/apps/notifications-service/src/notifications-grpc.controller.ts` (MODIFIED)

**Analog:** itself, pre-change (full file, 21 lines).

**Current shape**:
```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import { notifications } from '@iseyaa/proto';

@Controller()
export class NotificationsGrpcController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @GrpcMethod('NotificationsService', 'SendPush')
  async sendPush(data: notifications.SendPushRequest): Promise<notifications.SendPushResponse> {
    await this.notificationsService.sendPush(data.userId, data.title, data.body);
    return { success: true };
  }

  @GrpcMethod('NotificationsService', 'RegisterToken')
  async registerToken(data: notifications.RegisterTokenRequest): Promise<notifications.RegisterTokenResponse> {
    await this.notificationsService.registerToken(data.userId, data.fcmToken);
    return { success: true };
  }
}
```

**Change required (D-08 — pass through the new `data` field, one-line diff on `sendPush`)**:
```typescript
async sendPush(data: notifications.SendPushRequest): Promise<notifications.SendPushResponse> {
  await this.notificationsService.sendPush(data.userId, data.title, data.body, data.data);
  return { success: true };
}
```
This is the **only** line that changes in this file — `registerToken` is untouched.

---

### `packages/proto/notifications.proto` (MODIFIED)

**Analog:** itself, pre-change (full file, 27 lines).

**Additive diff (D-08)**:
```protobuf
message SendPushRequest {
  string user_id = 1;
  string title = 2;
  string body = 3;
  map<string, string> data = 4;   // NEW
}
```
After editing, regenerate: `bash packages/proto/generate.sh` (confirmed working as of Phase 16 — produces `packages/proto/generated/notifications.ts`). ts-proto's default (`useMapType` unset/false, confirmed in `packages/proto/generate.sh`) generates the map as a plain `Record<string,string>`-shaped object, structurally compatible with `NotificationsService.sendPush()`'s existing `data?: Record<string, string>` param — no transform code needed at either boundary.

**Open item to resolve during planning, not blocking:** whether `SendPushResponse` also needs `string reason = 2;` (Pitfall 5) — grep `web/src mobile/app` for consumption of a `reason` field on the push-send response before deciding.

---

### `backend/package.json` (MODIFIED)

**Change required (folded Docker todo):** add `"@iseyaa/proto"` to `dependencies` (alongside the existing block shown above), matching the existing dependency-declaration style (exact semver, no `^` inconsistency with the rest of the block — check `packages/proto/package.json`'s own declared `version` field and mirror it verbatim). Followed by a root `npm install` to refresh `package-lock.json` (`npm ci` requires an in-sync lockfile — editing only `package.json` will make Docker's `npm ci` step fail).

---

### `backend/Dockerfile` (MODIFIED) and `backend/apps/notifications-service/Dockerfile` (MODIFIED)

**Analog:** each other — both files have the *identical* gap and need the *identical* fix (Pitfall 1/2).

**Current broken line in both files**:
```dockerfile
RUN npm ci --workspace=backend --include=workspace=shared
```

**Corrected line (Pitfall 2 — `--include=workspace=X` is not a valid npm CLI flag; `--include` only accepts `prod|dev|optional|peer`)**:
```dockerfile
RUN npm ci --workspace=backend --workspace=packages/proto
```
Also confirm both Dockerfiles' `COPY packages/` step already stages `packages/proto`'s source before this `npm ci` line runs (monolith Dockerfile line 17 `COPY packages/ ./packages/` already does; `notifications-service`'s Dockerfile line 8 `COPY packages/proto/ ./packages/proto/` already does too — no COPY change needed, only the `npm ci` flag fix in both files).

---

### `docker-compose.yml` (MODIFIED)

**Analog:** the existing `backend:` and `web:` service blocks in the same file (lines 37-56, 58-74) — no gRPC-specific service block precedent exists in this repo yet; this is the first one.

**Convention to copy (env_file, restart policy, depends_on with healthcheck conditions)** — from the existing `backend:` block:
```yaml
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile.dev
  container_name: iseyaa_backend
  restart: unless-stopped
  env_file: .env
  environment:
    DATABASE_URL: postgresql://iseyaa:iseyaa_dev_password@postgres:5432/iseyaa_dev
    REDIS_URL: redis://redis:6379
  ports:
    - '3001:3001'
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

**Note for the plan:** the existing `backend:` compose block builds from `Dockerfile.dev` (a dev-oriented Dockerfile with volume-mounted live reload), NOT `backend/Dockerfile` (the production image RESEARCH.md's example referenced). `backend/apps/notifications-service/` has no `Dockerfile.dev` counterpart today — confirm during planning whether local dev parity should (a) add a lightweight `Dockerfile.dev` for `notifications-service` matching the monolith's dev-loop pattern, or (b) reuse the existing production `Dockerfile` for the compose block (simpler, matches RESEARCH.md's draft, but no live-reload). Also add `NOTIFICATIONS_GRPC_URL: notifications-service:5008` to the `backend:` block's `environment:` (compose DNS service name, not `localhost`) and a `depends_on: notifications-service: condition: service_started` entry (no HTTP healthcheck endpoint exists for this gRPC-only service today, so `service_healthy` isn't available without adding one — condition: `service_started` is the only viable option without further scaffolding work).

---

### `.env.example` (MODIFIED)

**Analog:** the existing `# ─── gRPC Microservices (Wave 3) ───` block (lines 63-71), specifically `NOTIFICATIONS_SERVICE_URL=notifications-service.railway.internal:5008` (line 71) — already present, unused by any code today.

**Naming collision to resolve during planning (not this agent's call — flagged in RESEARCH.md Open Question 1):** D-04 locks in `NOTIFICATIONS_GRPC_URL` as the new var name. Either (a) rename to reuse `NOTIFICATIONS_SERVICE_URL` (zero `.env.example` churn, matches the other 7 not-yet-live services' convention), or (b) keep `NOTIFICATIONS_GRPC_URL` and comment out/remove the now-dead `NOTIFICATIONS_SERVICE_URL` placeholder. Document dev (`localhost:5008`) and Railway (`notifications-service.railway.internal:5008`) examples either way, following the exact style already used for the other 7 `*_SERVICE_URL` lines.

---

### `.planning/phases/17-.../17-CALLER-GRAPH-AUDIT.md` (NEW, D-11)

**Analog:** RESEARCH.md's own already-drafted, grep-verified table (RESEARCH.md lines 531-540) — copy directly, it is already the exact content D-11 requires:
```markdown
# Phase 17 — NotificationsService Caller-Graph Audit

| # | File | Line | Injection type | Disposition |
|---|------|------|-----------------|-------------|
| 1 | backend/src/modules/notifications/notifications.controller.ts | 11 | constructor injection | REWIRED → NotificationsClientService |
| 2 | backend/src/modules/tour-bookings/tour-notifications.service.ts | 54 | constructor injection | REWIRED → NotificationsClientService |
| 3 | backend/apps/notifications-service/src/notifications-grpc.controller.ts | 8 | constructor injection | UNCHANGED (this IS the extracted process's own server-side implementation, not a caller to migrate) |

**Confirmed via:** `grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" | grep -v ".spec.ts"` — zero other injection sites found.
**Confirmed zero pre-existing `ClientGrpc`/`ClientsModule` usage anywhere in the codebase** — this is the first cutover of its kind.
```
Must be committed **before** the cutover commit per D-11 — sequence this as its own early task/commit in the plan.

## Shared Patterns

### Resilience wrapping (cockatiel via ResilienceService)
**Source:** `backend/src/resilience/resilience.service.ts` `execute()` method (lines 76-82) + `backend/src/common/services/paystack.service.ts` (lines 40-62) as the calling convention.
**Apply to:** `notifications-client.service.ts`'s `sendPush`/`registerToken` (NOT `listForUser`, which stays a local stub per D-03).
```typescript
const res = await this.resilience.execute('notificationsGrpc', () =>
  firstValueFrom(this.grpcService.sendPush({ userId, title, body, data: data ?? {} })),
);
```
**Prerequisite (blocking, must land in the same task/commit):** `isTransientError()`'s gRPC numeric-code branch — see `resilience.service.ts`'s Pattern Assignment above. Without it the policy is inert (Pitfall 3).

### Error propagation: `ServiceUnavailableException` on vendor-call failure
**Source:** `backend/src/common/services/paystack.service.ts` line 61 — `throw new ServiceUnavailableException('<Vendor> is temporarily unavailable, please try again shortly')`. Identical convention used by `S3Service`, `AiService`, `events.service.ts`, `marketplace.service.ts` (per RESEARCH.md's Claude's Discretion note — confirmed a strong, consistent codebase-wide convention).
**Apply to:** `notifications-client.service.ts`'s catch blocks (D-06). No controller-level try/catch needed — NestJS's exception layer converts `ServiceUnavailableException` to HTTP 503 automatically; every existing controller in this codebase relies on this same bubble-up behavior.

### Catch-and-log-no-rethrow contract for cron/event handlers
**Source:** `backend/src/modules/tour-bookings/tour-notifications.service.ts` (e.g. lines 230-235, 291-295, 350-354) — every `@Cron`/`@OnEvent` handler already catches all errors and logs without rethrowing, so a downstream outage never crashes the scheduler.
**Apply to:** No code change needed in these catch blocks themselves (D-07) — the facade's new `ServiceUnavailableException` throw is simply absorbed by the existing catch exactly as any prior error was. Do not add a new try/catch layer around the facade call inside these handlers; the outer one already exists.

### Dynamic module registration with ConfigService (`registerAsync`)
**Source:** `backend/src/modules/auth/auth.module.ts` lines 12-19 (`JwtModule.registerAsync`) — the only existing `registerAsync` usage in the codebase, and the closest structural analog to `ClientsModule.registerAsync` (async factory + `ConfigService` injection + `ConfigModule` import).
**Apply to:** `notifications-client.module.ts`.

### Env-var-driven connection config
**Source:** `.env.example`'s existing `DATABASE_URL`/`REDIS_URL` pattern, and Phase 16's (POOL-01) precedent for documenting dev vs. Railway values side-by-side.
**Apply to:** `NOTIFICATIONS_GRPC_URL` (or the resolved name per the Open Question above) in `.env.example` and `ClientsModule.registerAsync`'s `useFactory`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/modules/notifications-client/notifications-client.module.ts` (`ClientsModule.registerAsync` for gRPC specifically) | provider/config | request-response | Zero existing `ClientGrpc`/`ClientsModule` usage anywhere in this codebase (confirmed via grep in RESEARCH.md) — `JwtModule.registerAsync` is the closest structural cousin but is a different underlying module type. Use RESEARCH.md's Pattern 1 (NestJS official docs via Context7) directly. |
| `docker-compose.yml`'s new `notifications-service:` block | config (deploy topology) | — | No gRPC-only service block exists in `docker-compose.yml` today (only HTTP-fronted `backend`/`web`). RESEARCH.md's draft (ASSUMED confidence) is the best available starting point; verify Docker DNS resolution works as expected during implementation. |
| `notifications-client.service.spec.ts`'s `ClientGrpc` mock | test | request-response | First `ClientGrpc`/gRPC-client mock in this codebase's test suite — no existing spec mocks an Observable-returning gRPC proxy method. Use `rxjs`'s `of()` to simulate the Observable return shape (rxjs already a transitive dependency, no new test-only dependency needed). |

## Metadata

**Analog search scope:** `backend/src/modules/notifications/`, `backend/src/modules/tour-bookings/`, `backend/src/resilience/`, `backend/src/common/services/`, `backend/src/modules/auth/`, `backend/apps/notifications-service/`, `packages/proto/`, root `docker-compose.yml`, `.env.example`, `backend/Dockerfile`, `backend/apps/notifications-service/Dockerfile`, `backend/package.json`
**Files scanned:** 17 target files + 6 additional analog-only reads (`paystack.service.ts`, `common.module.ts`, `auth.module.ts` excerpt, `resilience.service.spec.ts`, `tour-notifications.service.spec.ts`, `resilience.module.ts`)
**Pattern extraction date:** 2026-07-18
