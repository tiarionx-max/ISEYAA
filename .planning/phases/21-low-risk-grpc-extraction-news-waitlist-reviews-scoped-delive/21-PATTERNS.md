# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 41 new files + 8 modified files (across 4 service replications)
**Analogs found:** 41 / 41 (every new file has a 1:1 analog in `notifications-service`/`notifications-client`; the 4 domain services being wrapped are the secondary analog for business logic)

This phase is a **pure 4x replication** of one already-live pattern. Every new file's closest analog is the corresponding file in `backend/apps/notifications-service/` (gRPC server side) or `backend/src/modules/notifications-client/` (monolith facade side). The domain logic being wrapped (News/Waitlist/Reviews/Delivery) is read from the existing, unmodified `backend/src/modules/{news,waitlist,reviews,delivery}/` modules — those files are NOT rewritten, only imported wholesale.

## File Classification

### News (rollout order 1 — lowest risk)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/apps/news-service/src/main.ts` | config (bootstrap) | request-response (hybrid HTTP+gRPC) | `backend/apps/notifications-service/src/main.ts` | exact |
| `backend/apps/news-service/src/app.module.ts` | config (DI root) | request-response | `backend/apps/notifications-service/src/app.module.ts` | exact |
| `backend/apps/news-service/src/health.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/health.controller.ts` | exact (copy verbatim) |
| `backend/apps/news-service/src/news-grpc.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | exact |
| `backend/apps/news-service/railway.toml` | config | — | `backend/apps/notifications-service/railway.toml` | exact |
| `backend/apps/news-service/Dockerfile` | config | — | `backend/apps/notifications-service/Dockerfile` | exact |
| `backend/apps/news-service/tsconfig.app.json` | config | — | `backend/apps/notifications-service/tsconfig.app.json` (not read — assume identical shape to other `apps/*/tsconfig.app.json`) | exact |
| `backend/src/modules/news-client/news-client.constants.ts` | config (DI token, leaf file) | — | `backend/src/modules/notifications-client/notifications-client.constants.ts` | exact |
| `backend/src/modules/news-client/news-client.service.ts` | service (facade) | request-response | `backend/src/modules/notifications-client/notifications-client.service.ts` | exact |
| `backend/src/modules/news-client/news-client.module.ts` | module | — | `backend/src/modules/notifications-client/notifications-client.module.ts` | exact |
| `backend/src/modules/news/news.module.ts` (MODIFIED: drop `NewsController` from `controllers`) | module | — | precedent: `notifications.module.ts` never registered `NotificationsController` post-extraction (research states no such file was observed) | role-match |
| `backend/src/app.module.ts` (MODIFIED: swap `NewsModule` import for `NewsClientModule`) | config | — | same file's existing `NotificationsClientModule` line | exact |

### Waitlist (rollout order 2)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/apps/waitlist-service/src/main.ts` | config (bootstrap) | request-response | `backend/apps/notifications-service/src/main.ts` | exact |
| `backend/apps/waitlist-service/src/app.module.ts` | config (DI root) | request-response | `backend/apps/notifications-service/src/app.module.ts` | exact |
| `backend/apps/waitlist-service/src/health.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/health.controller.ts` | exact (copy verbatim) |
| `backend/apps/waitlist-service/src/waitlist-grpc.controller.ts` | controller | request-response (CRUD) | `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | exact |
| `backend/apps/waitlist-service/railway.toml` | config | — | `backend/apps/notifications-service/railway.toml` | exact |
| `backend/apps/waitlist-service/Dockerfile` | config | — | `backend/apps/notifications-service/Dockerfile` | exact |
| `backend/src/modules/waitlist-client/waitlist-client.constants.ts` | config (DI token) | — | `backend/src/modules/notifications-client/notifications-client.constants.ts` | exact |
| `backend/src/modules/waitlist-client/waitlist-client.service.ts` | service (facade) | request-response + fan-out (stats) | `backend/src/modules/notifications-client/notifications-client.service.ts` | exact for `join()`; **no direct analog for the `stats()` fan-out** — closest is `Promise.all` patterns elsewhere in the codebase (none quoted; standard JS) |
| `backend/src/modules/waitlist-client/waitlist-client.module.ts` | module | — | `backend/src/modules/notifications-client/notifications-client.module.ts` | exact |
| `backend/src/modules/waitlist/waitlist.module.ts` (MODIFIED: drop `WaitlistController`) | module | — | same as News | role-match |
| `backend/src/app.module.ts` (MODIFIED: swap `WaitlistModule` for `WaitlistClientModule`) | config | — | same file's `NotificationsClientModule` line | exact |

### Reviews (rollout order 3)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/apps/reviews-service/src/main.ts` | config (bootstrap) | request-response | `backend/apps/notifications-service/src/main.ts` | exact |
| `backend/apps/reviews-service/src/app.module.ts` | config (DI root) | request-response + event-driven (debounce recompute now runs inside this process) | `backend/apps/notifications-service/src/app.module.ts` | exact |
| `backend/apps/reviews-service/src/health.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/health.controller.ts` | exact (copy verbatim) |
| `backend/apps/reviews-service/src/reviews-grpc.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | exact for shape; **CreateReview + ListReviews only** — `ResolveReviewFlag` is NOT implemented here per D-07 |
| `backend/apps/reviews-service/railway.toml` | config | — | `backend/apps/notifications-service/railway.toml` | exact |
| `backend/apps/reviews-service/Dockerfile` | config | — | `backend/apps/notifications-service/Dockerfile` | exact |
| `backend/src/modules/reviews-client/reviews-client.constants.ts` | config (DI token) | — | `backend/src/modules/notifications-client/notifications-client.constants.ts` | exact |
| `backend/src/modules/reviews-client/reviews-client.service.ts` | service (facade) | request-response + Prisma-enrichment (transform) | `backend/src/modules/notifications-client/notifications-client.service.ts` | exact for canary/resilience/error shape; **enrichment step (photos, user embed, in-memory pagination) has no analog in `notifications-client`** — this is genuinely new logic, use `ReviewsService.findByTarget`/`createReview` (below) as the shape reference for what to re-fetch |
| `backend/src/modules/reviews-client/reviews-client.module.ts` | module | — | `backend/src/modules/notifications-client/notifications-client.module.ts` | exact |
| `backend/src/modules/reviews/reviews.module.ts` (MODIFIED: `ReviewsController` moves out; `ReviewsAdminController` STAYS — see below) | module | — | role-match |  — this module keeps `ReviewsAdminController` (unlike News/Waitlist which lose their only controller) because `getFlagQueue`/`getFlag`/`resolveFlag` all stay in-process per D-07/Pitfall 3 |
| `backend/src/app.module.ts` (MODIFIED: `ReviewsModule` stays imported for `ReviewsAdminController`; add `ReviewsClientModule` for the public `ReviewsController`) | config | — | same file's `NotificationsClientModule` line, but Reviews needs BOTH modules imported simultaneously | role-match (two-module coexistence has no exact precedent — Delivery is the closer analog, see below) |

### Delivery OTP (rollout order 4 — highest risk, ships last)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/apps/delivery-otp-service/src/main.ts` | config (bootstrap) | request-response | `backend/apps/notifications-service/src/main.ts` | exact |
| `backend/apps/delivery-otp-service/src/app.module.ts` | config (DI root) | request-response (stateful: Redis+Postgres) | `backend/apps/notifications-service/src/app.module.ts` | exact — imports whole `DeliveryModule` (which transitively pulls `WalletModule`/`AuthModule` per D-01), same as `NotificationsModule` wholesale-import pattern |
| `backend/apps/delivery-otp-service/src/health.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/health.controller.ts` | exact (copy verbatim) |
| `backend/apps/delivery-otp-service/src/delivery-otp-grpc.controller.ts` | controller | request-response | `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | exact for shape; **error-mapping differs — see Shared Patterns > Delivery OTP error mapping** |
| `backend/apps/delivery-otp-service/railway.toml` | config | — | `backend/apps/notifications-service/railway.toml` | exact |
| `backend/apps/delivery-otp-service/Dockerfile` | config | — | `backend/apps/notifications-service/Dockerfile` | exact |
| `backend/src/modules/delivery-otp-client/delivery-otp-client.constants.ts` | config (DI token) | — | `backend/src/modules/notifications-client/notifications-client.constants.ts` | exact |
| `backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts` | service (facade) | request-response | `backend/src/modules/notifications-client/notifications-client.service.ts` | exact for canary/resilience skeleton; **exception-mapping catch block is a deliberate deviation — see Pitfall 5 in Shared Patterns** |
| `backend/src/modules/delivery-otp-client/delivery-otp-client.module.ts` | module | — | `backend/src/modules/notifications-client/notifications-client.module.ts`, BUT does **not** register `DeliveryController` (Delivery is the one exception — see below) | role-match |
| `backend/src/modules/delivery/delivery.controller.ts` (MODIFIED: inject `DeliveryOtpClientService` alongside `DeliveryService`; only `verifyOtp()` handler swaps) | controller | request-response | itself (existing file) — this is a **partial-swap**, not a full controller migration like News/Waitlist/Reviews | n/a (in-place edit) |
| `backend/src/modules/delivery/delivery.module.ts` (MODIFIED: add import of `DeliveryOtpClientModule` or direct provider registration) | module | — | itself (existing file) | n/a (in-place edit) |
| `backend/src/app.module.ts` (MODIFIED: `DeliveryModule` stays; import order/no swap needed since `DeliveryController` doesn't move) | config | — | n/a — Delivery needs no `app.module.ts` swap, unlike the other three | n/a |

### Cross-cutting infra (all 4 services)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/resilience/resilience.types.ts` (MODIFIED: add `newsGrpc`/`waitlistGrpc`/`reviewsGrpc`/`deliveryOtpGrpc` to `Vendor` union + `RESILIENCE_DEFAULTS`) | config | — | itself (existing `notificationsGrpc` entry, lines 21 and 48) | exact |
| `backend/nest-cli.json` (MODIFIED: 4 new `projects` entries) | config | — | itself (existing `notifications-service` entry, lines 72-80) | exact |
| `backend/package.json` (MODIFIED: `build:services` script line 22) | config | — | itself | exact |
| `docker-compose.yml` (MODIFIED: 4 new service blocks + `backend.environment`/`depends_on`) | config | — | itself (existing `notifications-service` block, lines 79-95, and `backend` service's lines 47/58-59) | exact |
| `.env.example` (MODIFIED: 4 new `*_SERVICE_URL` entries) | config | — | itself (existing lines 64-75) | exact |
| `docs/blue-green-cutover-runbook.md` (MODIFIED: extend with 4 new per-service sections) | config (docs) | — | itself (existing content — file already anticipates this per its own header text) | exact — see `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-PATTERNS.md` for the runbook structure to replicate |

### Tests (Wave 0, one pair per service + one spec per client)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/modules/news-client/__tests__/news-client.service.spec.ts` | test | — | `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` | exact |
| `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` | test | — | same, plus new fan-out assertion | exact |
| `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` | test | — | same, plus enrichment + admin-bypass assertions | exact |
| `backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` | test | — | same, plus business-vs-transport exception assertions | exact |
| `backend/apps/{news,waitlist,reviews,delivery-otp}-service/src/__tests__/health.controller.spec.ts` | test | — | `backend/apps/notifications-service/src/__tests__/health.controller.spec.ts` (not read this session — referenced in RESEARCH.md, exists per "mirror ... exactly") | exact |
| `backend/apps/{news,waitlist,reviews,delivery-otp}-service/src/__tests__/grpc-health.spec.ts` | test | — | `backend/apps/notifications-service/src/__tests__/grpc-health.spec.ts` (same) | exact |

## Pattern Assignments

### Pattern A: `src/main.ts` (all 4 services) — hybrid HTTP+gRPC bootstrap

**Analog:** `backend/apps/notifications-service/src/main.ts` (full file, 33 lines)

**Full file to replicate (change only `package`, `protoPath`, `url` port, and the console.log line):**
```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['notifications', 'grpc.health.v1'],           // <- 'news' | 'waitlist' | 'reviews' | 'delivery'
      protoPath: [
        join(__dirname, '../../../../../packages/proto/notifications.proto'), // <- swap filename
        healthCheckProtoPath,
      ],
      url: '0.0.0.0:5008',                                     // <- 5009 | 5010 | 5011 | 5012
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080);
  console.log('notifications-service gRPC :5008, HTTP healthz :8080'); // <- swap name+port
}

bootstrap();
```
Note: `delivery.proto`'s package is `delivery`, matching `DeliveryService` proto service name — `delivery-otp-service`'s `main.ts` package array is `['delivery', 'grpc.health.v1']` even though only `VerifyDeliveryOtp` is implemented server-side (the other 3 RPCs in the same proto package are simply never called by the gRPC controller — this is fine, proto packages aren't split per-RPC).

### Pattern B: `src/app.module.ts` (all 4 services) — wholesale domain-module import

**Analog:** `backend/apps/notifications-service/src/app.module.ts` (full file, 27 lines)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../../../src/prisma/prisma.module';
import { RedisModule } from '../../../src/redis/redis.module';
import { DbMetricsModule } from '../../../src/common/db-metrics.module';
import { ResilienceModule } from '../../../src/resilience/resilience.module';
import { NotificationsModule } from '../../../src/modules/notifications/notifications.module';
import { NotificationsGrpcController } from './notifications-grpc.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ResilienceModule,
    DbMetricsModule,
    NotificationsModule,
    TerminusModule,
  ],
  controllers: [NotificationsGrpcController, HealthController],
})
export class AppModule {}
```
For `delivery-otp-service`: swap `NotificationsModule` for `DeliveryModule` (`import { DeliveryModule } from '../../../src/modules/delivery/delivery.module'`) — `DeliveryModule` (`backend/src/modules/delivery/delivery.module.ts`) already imports `WalletModule` + `AuthModule` itself, so nothing extra is needed here (D-01, confirmed via reading `delivery.module.ts` in full: `imports: [WalletModule, AuthModule]`).
For `reviews-service`: swap for `ReviewsModule` — this also transitively brings the `@OnEvent('review.created')` debounce handler (`reviews.service.ts` lines 349-376) to run **inside this new process**, since `ReviewsService` (with its `@OnEvent` decorator) is a provider of the wholesale-imported module. `EventEmitter2` must be available — confirm `EventEmitterModule.forRoot()` is added to the new `AppModule`'s imports (the monolith's `app.module.ts` has it; `notifications-service`'s `app.module.ts` doesn't need it because `NotificationsService` has no `@OnEvent` handlers — this is a genuine one-off addition for `reviews-service` only, not present in the notifications template).

### Pattern C: `src/health.controller.ts` (all 4 services) — copy verbatim, zero changes

**Analog:** `backend/apps/notifications-service/src/health.controller.ts` (full file, 13 lines — quoted above under Read output; identical for all 4 new services, no per-service edits needed at all)
```typescript
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

### Pattern D: `src/*-grpc.controller.ts` (all 4 services) — thin `@GrpcMethod` wrapper

**Analog:** `backend/apps/notifications-service/src/notifications-grpc.controller.ts` (full file, 22 lines)
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
    const result = await this.notificationsService.sendPush(data.userId, data.title, data.body, data.data);
    return { success: result.sent };
  }

  @GrpcMethod('NotificationsService', 'RegisterToken')
  async registerToken(data: notifications.RegisterTokenRequest): Promise<notifications.RegisterTokenResponse> {
    await this.notificationsService.registerToken(data.userId, data.fcmToken);
    return { success: true };
  }
}
```

**Per-service RPC → domain method mapping (source: proto files read in full + domain service files read in full this session):**

`news-grpc.controller.ts` — 1 method:
```typescript
@GrpcMethod('NewsService', 'ListNews')
async listNews(data: news.ListNewsRequest): Promise<news.ListNewsResponse> {
  const items = await this.newsService.findLatest(data.limit || 20, data.category || undefined);
  return { items: items.map(i => ({
    id: i.id, headline: i.headline, summary: i.summary ?? '', link: i.link ?? '',
    source: i.source ?? '', category: i.category ?? '', imageUrl: i.imageUrl ?? '',
    publishedAt: i.publishedAt.toISOString(), isPriority: i.isPriority,
  })) };
}
```
`NewsService.findLatest(limit = 20, category?: string)` — `backend/src/modules/news/news.service.ts` lines 8-29 — signature matches the proto request 1:1 (`ListNewsRequest{ limit, category }`), no shape reconciliation needed.

`waitlist-grpc.controller.ts` — 2 methods:
```typescript
@GrpcMethod('WaitlistService', 'JoinWaitlist')
async joinWaitlist(data: waitlist.JoinWaitlistRequest): Promise<waitlist.JoinWaitlistResponse> {
  const result = await this.waitlistService.join({
    source: data.source as any, email: data.email || undefined,
    phone: data.phone || undefined, fullName: data.fullName || undefined,
  });
  return { id: result.id, success: true };
}

@GrpcMethod('WaitlistService', 'GetWaitlistStats')
async getWaitlistStats(data: waitlist.GetWaitlistStatsRequest): Promise<waitlist.GetWaitlistStatsResponse> {
  const grouped = await this.waitlistService.stats(); // [{source, count}, ...]
  const match = grouped.find(g => g.source === data.source);
  return { totalCount: match?.count ?? 0 };
}
```
`WaitlistService.join(dto)` and `.stats()` — `backend/src/modules/waitlist/waitlist.service.ts` lines 11-57. `join()`'s DTO fields (`source`, `email`, `phone`, `fullName`) map directly to `JoinWaitlistRequest`'s snake_case fields (generated TS client auto-camelCases them via `@iseyaa/proto`). `stats()` takes no args and returns ALL sources grouped — the gRPC controller filters server-side to the single requested `source` to match `GetWaitlistStatsResponse{ total_count }`'s single-source shape (Pitfall 1's server-side half; the client-side fan-out lives in `WaitlistClientService`, not here).

`reviews-grpc.controller.ts` — 2 methods only (NOT 3 — `ResolveReviewFlag` stays in-process per D-07):
```typescript
@GrpcMethod('ReviewsService', 'CreateReview')
async createReview(data: reviews.CreateReviewRequest): Promise<reviews.CreateReviewResponse> {
  const review = await this.reviewsService.createReview(data.userId, {
    tourBookingId: data.tourBookingId, targetType: data.targetType as any,
    targetId: data.targetId, rating: data.rating, comment: data.comment || undefined,
    // NOTE: proto has no `photos` field — photos are NOT settable via this gRPC path.
  });
  return { id: review.id, flagged: review.flagged };
}

@GrpcMethod('ReviewsService', 'ListReviews')
async listReviews(data: reviews.ListReviewsRequest): Promise<reviews.ListReviewsResponse> {
  // No pagination in proto — service-side returns ALL reviews for target;
  // monolith facade paginates in memory (D-08 accepted tradeoff, sizing check required).
  const { data: rows } = await this.reviewsService.findByTarget(data.targetType as any, data.targetId, { limit: 10000 });
  return { reviews: rows.map(r => ({
    id: r.id, userId: r.userId, rating: r.rating, comment: r.comment ?? '',
    flagged: r.flagged, createdAt: r.createdAt.toISOString(),
  })) };
}
```
`ReviewsService.createReview(actorUserId, dto)` — `backend/src/modules/reviews/reviews.service.ts` lines 65-164 (7 eligibility guards + atomic `$transaction` + `EventEmitter2.emit('review.created', ...)` at line 158 — unchanged, now fires and is consumed **inside `reviews-service`** since `@OnEvent` handler at lines 349-352 moved with the module). `ReviewsService.findByTarget(targetType, targetId, opts)` — lines 217-257, DB-level `skip`/`take` pagination exists in the domain service already; the gRPC controller must call it with a large `limit` (or add a dedicated "return all" code path) to satisfy the proto's pagination-less `ListReviewsRequest`.

`delivery-otp-grpc.controller.ts` — 1 method:
```typescript
@GrpcMethod('DeliveryService', 'VerifyDeliveryOtp')
async verifyDeliveryOtp(data: delivery.VerifyDeliveryOtpRequest): Promise<delivery.VerifyDeliveryOtpResponse> {
  const result = await this.deliveryService.verifyOtp(data.orderId, { otp: data.otp });
  return { success: result.verified };
}
```
`DeliveryService.verifyOtp(orderId, dto)` — `backend/src/modules/delivery/delivery.service.ts` lines 489-521 (verified full excerpt below under Shared Patterns > Delivery OTP). Throws `BadRequestException` on: OTP expired (line 503), incorrect OTP with remaining-attempts count (line 508), lockout after 5 attempts (line 498). `@GrpcMethod`'s default NestJS exception handling converts these to a gRPC error whose `message` carries the original text (Assumption A2 — planner should write a quick confirming unit test) — the monolith-side `DeliveryOtpClientService` must re-throw as `BadRequestException`, not `ServiceUnavailableException` (see Shared Patterns below).

### Pattern E: `src/*-client.service.ts` (News/Waitlist/Reviews) — canary + resilience facade

**Analog:** `backend/src/modules/notifications-client/notifications-client.service.ts` (full file, 97 lines)

Full reference (copy structure, swap vendor key / flag key / message / method bodies):
```typescript
import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { notifications } from '@iseyaa/proto';
import { PrismaService } from '../../prisma/prisma.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.constants';

const CANARY_FLAG_KEY = 'grpc.notifications_service.canary_enabled';
const UNAVAILABLE_MESSAGE = 'Notifications service is temporarily unavailable, please try again shortly';

@Injectable()
export class NotificationsClientService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsClientService.name);
  private grpcService!: notifications.NotificationsServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit(): void {
    this.grpcService = this.client.getService<notifications.NotificationsServiceClient>('NotificationsService');
  }

  private async isCanaryEnabled(): Promise<boolean> {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false; // opt-OUT: absence/true/anything-but-false = enabled
  }

  async registerToken(userId: string, token: string) {
    if (!(await this.isCanaryEnabled())) {
      this.logger.warn('registerToken: notifications-service canary flag disabled — refusing gRPC call');
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
    try {
      await this.resilience.execute('notificationsGrpc', () =>
        firstValueFrom(this.grpcService.registerToken({ userId, fcmToken: token }) as any),
      );
      return { registered: true };
    } catch (err: any) {
      this.logger.error(`Notifications gRPC registerToken failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }
  }
}
```

**Canary flag keys (D-06):** `grpc.news_service.canary_enabled`, `grpc.waitlist_service.canary_enabled`, `grpc.reviews_service.canary_enabled`, `grpc.delivery_otp_service.canary_enabled`.

**News (`NewsClientService`):** single `findLatest(limit, category)` method — near-verbatim copy of `registerToken`'s try/catch shape, no enrichment needed. Vendor key: `'newsGrpc'`.

**Waitlist (`WaitlistClientService`):** `join(dto)` copies the shape directly. `stats()` fans out per Pitfall 1 — the ONE genuinely new piece of logic in this facade, no analog exists in `notifications-client.service.ts`:
```typescript
import { WAITLIST_SOURCES } from '../waitlist/dto/join-waitlist.dto'; // reuse existing const, don't redeclare

async stats() {
  if (!(await this.isCanaryEnabled())) {
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
  try {
    const results = await Promise.all(
      WAITLIST_SOURCES.map((source) =>
        this.resilience.execute('waitlistGrpc', () =>
          firstValueFrom(this.grpcService.getWaitlistStats({ source }) as any),
        ),
      ),
    );
    return WAITLIST_SOURCES.map((source, i) => ({ source, count: results[i].totalCount }));
  } catch (err: any) {
    this.logger.error(`Waitlist gRPC stats failed: ${err?.message ?? err}`);
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
}
```
Source for `WAITLIST_SOURCES`: `backend/src/modules/waitlist/dto/join-waitlist.dto.ts` line 4 — `export const WAITLIST_SOURCES = ['marketplace_web', 'marketplace_mobile'] as const;`. Vendor key: `'waitlistGrpc'`.

**Reviews (`ReviewsClientService`):** `createReview`/`findByTarget` copy the canary+resilience skeleton but need a Prisma-enrichment step after the gRPC call returns (Pitfall 2) — this has no analog in `notifications-client.service.ts` (the facade there never touches Prisma beyond the canary flag read). Use `ReviewsService.findByTarget`'s `include: { user: { select: {...} } }` shape (`reviews.service.ts` lines 237-246) as the exact fields to re-fetch via a direct `this.prisma.user.findMany`/`this.prisma.review.findMany` call in the facade, keyed by the IDs the thin gRPC response returns. `resolveFlag` is **not implemented in this facade at all** — `ReviewsAdminController` keeps calling `ReviewsService.resolveFlag` directly (D-07). Vendor key: `'reviewsGrpc'`.

### Pattern F: `src/*-client.module.ts` + `*-client.constants.ts` (News/Waitlist/Reviews) — leaf-file token + controller relocation

**Analog:** `backend/src/modules/notifications-client/notifications-client.module.ts` (full file, 53 lines) + `notifications-client.constants.ts` (full file, 6 lines)

Constants file (copy verbatim structure, rename token):
```typescript
// leaf file — zero imports, breaks the module.ts <-> service.ts require cycle (Phase 20 D-09 lesson)
export const NOTIFICATIONS_PACKAGE = 'NOTIFICATIONS_PACKAGE';
```
→ `export const NEWS_PACKAGE = 'NEWS_PACKAGE';` / `WAITLIST_PACKAGE` / `REVIEWS_PACKAGE` / `DELIVERY_OTP_PACKAGE`.

Module file:
```typescript
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { NotificationsClientService } from './notifications-client.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.constants';

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
            url: config.get<string>('NOTIFICATIONS_SERVICE_URL', 'localhost:5008'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsClientService],
  exports: [NotificationsClientService],
})
export class NotificationsClientModule {}
```
For News/Waitlist: `controllers: [NewsController]` / `[WaitlistController]` — these controller classes stay physically located at `backend/src/modules/news/news.controller.ts`/`waitlist.controller.ts` (minimal-diff, matching the `NotificationsController` precedent's comment at `notifications-client.module.ts` lines 22-25: "controller's file stays physically located ... only its module registration and injected dependency changed").
For Reviews: `controllers: [ReviewsController]` ONLY — `ReviewsAdminController` stays registered in `reviews.module.ts`, NOT here (D-07/Pitfall 3 — three admin methods keep calling `ReviewsService` directly, no gRPC facade involved for the admin controller at all).
Default port fallbacks: `'localhost:5009'` (news) / `'localhost:5010'` (waitlist) / `'localhost:5011'` (reviews) / `'localhost:5012'` (delivery-otp).

### Pattern G: Delivery OTP — the one partial-swap controller (no full module migration)

**Analog for the client-service/module shape:** same as Pattern E/F above, vendor key `'deliveryOtpGrpc'`, flag key `grpc.delivery_otp_service.canary_enabled`. BUT `delivery-otp-client.module.ts` does **not** register `DeliveryController` — `DeliveryController` stays owned by `backend/src/modules/delivery/delivery.module.ts`.

**Analog for the controller edit:** `backend/src/modules/delivery/delivery.controller.ts` itself (existing file, read in full this session — imports at lines 1-26, `verifyOtp` handler at lines 163-173):
```typescript
// Current (lines 30-31, 163-173):
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}
  // ...
  @Post('orders/:id/verify-otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify OTP at dropoff — transitions IN_TRANSIT → ready for completion (DRIVER)' })
  verifyOtp(
    @Param('id') id: string,
    @Body() dto: VerifyDeliveryOtpDto,
  ) {
    return this.deliveryService.verifyOtp(id, dto);
  }
```
Target shape — add a second injected service, swap only this one handler's body:
```typescript
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly deliveryOtpClient: DeliveryOtpClientService,
  ) {}
  // ...
  verifyOtp(@Param('id') id: string, @Body() dto: VerifyDeliveryOtpDto) {
    return this.deliveryOtpClient.verifyOtp(id, dto.otp); // <- only this line changes
  }
  // requestDelivery / acceptDelivery / completeDelivery / all other handlers: UNCHANGED, still call this.deliveryService
```
`delivery.module.ts` needs `DeliveryOtpClientModule` added to its `imports` array (or `DeliveryOtpClientService` registered as a provider directly) — the exact wholesale-module-swap pattern used for News/Waitlist/Reviews' `app.module.ts` does NOT apply here since `DeliveryController` isn't moving to a new module.

**Delivery OTP error mapping (deviates from Pattern E — Pitfall 5, the one place `notifications-client`'s catch-all cannot be copied verbatim):**
```typescript
async verifyOtp(orderId: string, otp: string) {
  if (!(await this.isCanaryEnabled())) {
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
  try {
    const res = await this.resilience.execute('deliveryOtpGrpc', () =>
      firstValueFrom(this.grpcService.verifyDeliveryOtp({ orderId, otp }) as any),
    );
    return { verified: res.success };
  } catch (err: any) {
    // Business-rule failures (wrong/expired/locked OTP) surface here as gRPC errors whose
    // message carries DeliveryService.verifyOtp()'s original BadRequestException text
    // (delivery.service.ts lines 498/503/508) — these must reach the driver as 400s, not
    // be swallowed into a generic 503 like notifications-client.service.ts's catch-all does.
    if (isBusinessRuleError(err)) {           // planner defines this helper — e.g. gRPC status UNKNOWN + message match
      throw new BadRequestException(err.message);
    }
    this.logger.error(`Delivery OTP gRPC verifyOtp failed: ${err?.message ?? err}`);
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
}
```
Reference for the exact 3 messages that must reach the client unchanged — `backend/src/modules/delivery/delivery.service.ts` lines 489-521:
```typescript
async verifyOtp(orderId: string, dto: VerifyDeliveryOtpDto): Promise<{ verified: true }> {
  const order = await this.prisma.deliveryOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundException('Delivery order not found');

  const attemptsKey = `delivery:otp:attempts:${orderId}`;
  const attemptsStr = await this.redis.get(attemptsKey);
  const attempts = parseInt(attemptsStr ?? '0', 10);
  if (attempts >= 5) {
    throw new BadRequestException('Too many OTP attempts — order is locked. Contact support.');
  }

  const storedOtp = await this.redis.get(DELIVERY_OTP(orderId));
  if (storedOtp === null) {
    throw new BadRequestException('OTP expired. Request a new delivery to get a fresh code.');
  }
  if (storedOtp !== dto.otp) {
    await this.redis.set(attemptsKey, String(attempts + 1), 300);
    throw new BadRequestException(`Incorrect OTP. Ask the recipient to check their SMS. ${5 - attempts - 1} attempt(s) remaining.`);
  }

  await this.redis.del(attemptsKey);
  await this.prisma.deliveryOrder.update({ where: { id: orderId }, data: { otpVerifiedAt: new Date() } });
  return { verified: true };
}
```
This method body is UNCHANGED by the extraction — it just now executes inside `delivery-otp-service` instead of the monolith. Only its caller (`DeliveryController.verifyOtp`) and the transport in between change.

### Pattern H: `railway.toml` (all 4 services)

**Analog:** `backend/apps/notifications-service/railway.toml` (full file, 10 lines)
```toml
[build]
dockerfilePath = "backend/apps/notifications-service/Dockerfile"
buildContext = "."

[deploy]
watchPaths = ["backend/apps/notifications-service/**", "backend/src/modules/notifications/**", "packages/proto/**"]
healthcheckPath = "/healthz"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```
Swap `dockerfilePath` and both `watchPaths` entries per service (e.g. reviews: `["backend/apps/reviews-service/**", "backend/src/modules/reviews/**", "packages/proto/**"]`). `healthcheckPath`/`healthcheckTimeout`/`restartPolicy*` are identical across all 4 — do not vary these.

### Pattern I: `Dockerfile` (all 4 services)

**Analog:** `backend/apps/notifications-service/Dockerfile` (full file, 16 lines)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh && apk add infisical
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/
RUN npm ci --workspace=backend --workspace=packages/proto
COPY backend/ ./backend/
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build notifications-service
EXPOSE 5008
EXPOSE 8080
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node --require ./backend/dist/src/instrumentation.js ./backend/dist/apps/notifications-service/src/main.js"]
```
Swap: `nest build <service-name>` (line 12), both `EXPOSE` ports (lines 13-14, gRPC port only — line 14's `8080` HTTP healthz port is identical across all 4), and the final `CMD`'s `dist/apps/<service-name>/src/main.js` path. **Do NOT copy `backend/apps/auth-service/Dockerfile`** (or any of the other 6 pre-Phase-20 scaffolds) — they predate the `@iseyaa/proto` workspace fix and only run `npm ci --workspace=backend --include=workspace=shared`, which will fail `TS2307: Cannot find module '@iseyaa/proto'`.

## Shared Patterns

### Canary kill-switch (opt-out semantics)
**Source:** `backend/src/modules/notifications-client/notifications-client.service.ts` lines 12, 41-44
**Apply to:** All 4 new `*-client.service.ts` facades
```typescript
const CANARY_FLAG_KEY = 'grpc.notifications_service.canary_enabled'; // -> per-service key, D-06
private async isCanaryEnabled(): Promise<boolean> {
  const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
  return cfg?.value !== false; // absence, true, or anything but false → enabled
}
```

### Resilience-wrapped gRPC call + error logging discipline
**Source:** `backend/src/modules/notifications-client/notifications-client.service.ts` lines 59-77 (`registerToken`)
**Apply to:** Every network method in every new `*-client.service.ts`
```typescript
try {
  await this.resilience.execute('<vendorKey>', () =>
    firstValueFrom(this.grpcService.<method>({...}) as any),
  );
} catch (err: any) {
  this.logger.error(`<Service> gRPC <method> failed: ${err?.message ?? err}`); // NEVER log full err object (PII/payload leakage)
  throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
}
```
`err?.message ?? err` (never the full error object) is a required security discipline per RESEARCH.md's Security Domain section — matches `resilience.service.ts`'s `summarizeVendorError()` pattern.

### `resilience.types.ts` — vendor registration (mechanical diff)
**Source:** `backend/src/resilience/resilience.types.ts` lines 11-21, 30-48 (full file read)
```typescript
export type Vendor =
  | 'paystack' | 'paystackRefund' | 'termiiAuth' | 'termiiDelivery'
  | 'anthropic' | 's3' | 'fcm' | 'metaWhatsapp' | 'sendgrid'
  | 'notificationsGrpc'
  | 'newsGrpc' | 'waitlistGrpc' | 'reviewsGrpc' | 'deliveryOtpGrpc'; // ADD these 4

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  // ...existing entries unchanged, including line 48's notificationsGrpc...
  notificationsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  newsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  waitlistGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  reviewsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  deliveryOtpGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
};
```

### `nest-cli.json` — new service registration (mechanical diff)
**Source:** `backend/nest-cli.json` lines 72-80 (`notifications-service` entry, full file read)
```json
"news-service": {
  "type": "application",
  "root": "apps/news-service",
  "entryFile": "src/main",
  "sourceRoot": "apps/news-service/src",
  "compilerOptions": { "tsConfigPath": "apps/news-service/tsconfig.app.json" }
}
```
Repeat for `waitlist-service`, `reviews-service`, `delivery-otp-service`.

### `backend/package.json` `build:services` script (mechanical diff)
**Source:** `backend/package.json` line 22
```
"build:services": "for s in auth-service wallet-service events-service stays-service marketplace-service admin-service ai-service notifications-service; do npx nest build $s || exit 1; done"
```
Append ` news-service waitlist-service reviews-service delivery-otp-service` to the space-separated list before `notifications-service` or after it — order doesn't matter functionally.

### `.env.example` — new URL placeholders (mechanical diff)
**Source:** `.env.example` lines 64-75
```
AUTH_SERVICE_URL=auth-service.railway.internal:5001
WALLET_SERVICE_URL=wallet-service.railway.internal:5002
...
NOTIFICATIONS_SERVICE_URL=notifications-service.railway.internal:5008
```
Add: `NEWS_SERVICE_URL=news-service.railway.internal:5009`, `WAITLIST_SERVICE_URL=waitlist-service.railway.internal:5010`, `REVIEWS_SERVICE_URL=reviews-service.railway.internal:5011`, `DELIVERY_OTP_SERVICE_URL=delivery-otp-service.railway.internal:5012`.

### `docker-compose.yml` — new service blocks + backend wiring (mechanical diff)
**Source:** `docker-compose.yml` lines 44-59 (`backend` service's `environment`/`depends_on`) and lines 79-95 (`notifications-service` block, full block read)
```yaml
# backend service additions (alongside existing NOTIFICATIONS_SERVICE_URL on line 47):
environment:
  NEWS_SERVICE_URL: news-service:5009
  WAITLIST_SERVICE_URL: waitlist-service:5010
  REVIEWS_SERVICE_URL: reviews-service:5011
  DELIVERY_OTP_SERVICE_URL: delivery-otp-service:5012
depends_on:
  news-service: { condition: service_started }
  waitlist-service: { condition: service_started }
  reviews-service: { condition: service_started }
  delivery-otp-service: { condition: service_started }

# new service block (repeat 4x, matching this exact shape):
news-service:
  build:
    context: .
    dockerfile: backend/apps/news-service/Dockerfile
  container_name: iseyaa_news_service
  restart: unless-stopped
  env_file: .env
  environment:
    DATABASE_URL: postgresql://iseyaa:iseyaa_dev_password@postgres:5432/iseyaa_dev
    REDIS_URL: redis://redis:6379
  ports:
    - '5009:5009'
  depends_on:
    postgres: { condition: service_healthy }
    redis: { condition: service_healthy }
```

### Reviews module registration split (the one non-mechanical `app.module.ts` change)
**Source:** `backend/src/app.module.ts` — current imports include both `ReviewsModule` (line 18/55) and `NotificationsClientModule` (line 27/66) side by side; Delivery/Waitlist/News follow the same "old domain module OR new client module" pattern except Reviews needs BOTH simultaneously post-extraction:
```typescript
// Post-Phase-21 backend/src/app.module.ts imports array (Reviews-specific):
imports: [
  // ...
  ReviewsModule,        // KEPT — now only provides ReviewsAdminController (getFlagQueue/getFlag/resolveFlag stay in-process, D-07)
  ReviewsClientModule,  // NEW — provides ReviewsController (public create/list, routed through reviews-service gRPC)
  // NewsModule / WaitlistModule REMOVED, replaced 1:1 by NewsClientModule / WaitlistClientModule
  // DeliveryModule UNCHANGED — no swap, DeliveryController stays, gains a second injected service
  // ...
]
```
`ReviewsModule`'s `controllers` array (`backend/src/modules/reviews/reviews.module.ts` lines 24-29, currently `[ReviewsController, ReviewsAdminController]`) must drop `ReviewsController`, keeping only `ReviewsAdminController`.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Waitlist `stats()` fan-out logic (`Promise.all` over `WAITLIST_SOURCES`) | service (transform) | fan-out / batch | No existing facade in this codebase fans out N parallel gRPC calls to reassemble one REST shape — genuinely new logic (Pitfall 1). Use standard `Promise.all` — no library needed (Don't Hand-Roll table in RESEARCH.md confirms nothing to reach for here). |
| Reviews Prisma-enrichment step (photos + user embed + in-memory pagination) | service (transform) | transform | No existing facade in this codebase re-enriches a thin gRPC response with a follow-up Prisma query — genuinely new logic (Pitfall 2). Reference `ReviewsService.findByTarget`'s existing `include` shape (lines 237-246) for exactly which fields to re-fetch, but the "fetch after gRPC, not instead of" pattern itself has no analog. |
| Delivery OTP business-exception-vs-transport-exception mapping in the client facade | service (error handling) | request-response | Every other facade (`notifications-client`, and by extension News/Waitlist/Reviews) treats every gRPC failure as a transport failure (`ServiceUnavailableException`). Delivery OTP is the first case in this codebase where a business-rule 400 must cross the gRPC boundary intact — no existing precedent to copy, this is genuine new design per Pitfall 5/Assumption A2. Planner must write and confirm the exact gRPC-error-to-message-shape behavior via a unit test before relying on string/status inspection. |
| Reviews `EventEmitterModule.forRoot()` need in `reviews-service/src/app.module.ts` | config | event-driven | `notifications-service/src/app.module.ts` (Pattern B's analog) does not need this since `NotificationsService` has no `@OnEvent` handlers — this is a one-off addition needed only for `reviews-service` because `ReviewsService.onReviewCreated` (lines 349-352) is an `@OnEvent('review.created')` listener that moves with the wholesale module import. Confirm `EventEmitterModule` is available (likely needs adding to the new app's `imports`, mirroring `backend/src/app.module.ts`'s root-level registration, not `notifications-service`'s). |

## Metadata

**Analog search scope:** `backend/apps/notifications-service/`, `backend/src/modules/notifications-client/`, `backend/src/modules/{news,waitlist,reviews,delivery}/`, `packages/proto/{news,waitlist,reviews,delivery}.proto`, `backend/src/resilience/resilience.types.ts`, `backend/nest-cli.json`, `backend/package.json`, `.env.example`, `docker-compose.yml`
**Files scanned:** 24 files read in full this session (all quoted above), plus RESEARCH.md's own verbatim quotes cross-checked for consistency (no drift found)
**Pattern extraction date:** 2026-07-20
