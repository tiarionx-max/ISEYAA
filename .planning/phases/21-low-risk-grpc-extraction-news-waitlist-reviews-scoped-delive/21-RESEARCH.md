# Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP - Research

**Researched:** 2026-07-20
**Domain:** NestJS hybrid gRPC microservice extraction (Railway-deployed), replicating an existing live pattern 4 times
**Confidence:** HIGH (the entire pattern to replicate is live, working code in this repo — `notifications-service` — not external/training-data knowledge)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Delivery OTP service scope
- **D-01:** The new `delivery-otp-service` reuses the full `DeliveryModule` as-is (import it wholesale into the new app, matching exactly how `notifications-service` imports the full `NotificationsModule`), rather than extracting `verifyOtp`'s Redis+Prisma logic into a new lean OTP-only module. Accepted tradeoff: `WalletModule`/`AuthModule` (pulled in for the Socket.IO gateway) ship into the new process even though `VerifyDeliveryOtp` itself never touches them. Chosen for speed and precedent-fidelity over minimal blast radius — matches the low-risk/low-effort framing of this phase.
- **D-02:** `DeliveryService.verifyOtp()` (backend/src/modules/delivery/delivery.service.ts:489-521) is not stateless — it reads/writes Redis keys `delivery:otp:{orderId}` and `delivery:otp:attempts:{orderId}`, and writes `prisma.deliveryOrder.otpVerifiedAt`. The extracted service needs both Redis and Prisma access via the shared `RedisModule`/`PrismaModule`, same as every other extracted service — no new architecture needed, this is the established pattern from Phase 17/20, not a new decision point.

#### Service naming
- **D-03:** The new Delivery service is named `delivery-otp-service`, not `delivery-service` — the name deliberately signals narrow, permanent-until-GRPC-07x-unblocks scope, matching how REQUIREMENTS.md already separates GRPC-07 (this phase) from GRPC-07x (deferred full extraction). If/when full Delivery extraction happens later, that is expected to be a new or renamed service, not an in-place growth of this one.

#### Rollout sequencing
- **D-04:** All four services ship staggered, one at a time, each with its own canary flag flip and a bake period before the next starts — matching Phase 20's blue-green bake-period gate pattern. Rejected: shipping all four in one wave (faster but harder to isolate a regression to one service).
- **D-05:** Rollout order is risk-ascending: **News → Waitlist → Reviews → Delivery OTP**. Rationale: News and Waitlist are pure read/write CRUD with no cross-domain writes or shared mutable state (lowest risk, good pattern-proving warm-up). Reviews has a cross-domain rating recompute (writes into `TourGuide`/`TourPackage`/`Property`, other domains' tables). Delivery OTP touches Redis+Postgres state shared live with the still-in-process `DeliveryService` — highest risk, ships last.
- **D-06:** Per-service canary flags follow the existing `grpc.<service>_canary_enabled`-style key precedent (opt-out kill switch: absence or any value other than `false` means enabled) — one independent flag per service, not one combined phase-wide flag. This is precedent-following, not a new decision the user needed to make.

### Claude's Discretion
None — all three discussed areas (delivery-OTP module scope, service naming, rollout order) resolved to explicit user decisions above. The researcher/planner should still use judgment on: exact gRPC port assignments for the four new services (5001-5008 already taken by existing apps/services — this research recommends 5009-5012, see Assumption A1), and the mechanics of the bake-period length/gate criteria between each staggered rollout step (Phase 20's `20-CONTEXT.md`/`20-PATTERNS.md` and `docs/blue-green-cutover-runbook.md` are the reference for what "bake period" concretely means operationally — 15 minutes, actively watched, per Phase 20 D-05).

### Deferred Ideas (OUT OF SCOPE)
None raised — discussion stayed within phase scope. Full Delivery extraction (`RequestDelivery`/`AcceptDelivery`/`CompleteDelivery`/`DeliveryGateway`) is already tracked as GRPC-07x in REQUIREMENTS.md v2 section, not a new deferred idea from this discussion — explicitly out of scope for this phase, blocked on a transactional outbox/durable match-timeout redesign.

### Canonical References (from CONTEXT.md — MUST read before planning/implementing)
- `backend/apps/notifications-service/` — the only service actually live as a separate deployed Railway process today; the template for all four new services
- `backend/src/modules/notifications-client/notifications-client.service.ts` — the `ClientGrpc` facade + canary-flag + `resilience.execute()` wrapper pattern to replicate
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-CONTEXT.md`, `20-PATTERNS.md`, `20-RESEARCH.md` — canary flag semantics, bake-period gate mechanics, health-check-gated rollout requirement
- `packages/proto/{news,waitlist,reviews,delivery}.proto` — already-authored, unchangeable contracts (Phase 10-03)
- `.planning/REQUIREMENTS.md` lines 15-16, 43, 81-82 — GRPC-07/GRPC-07x/GRPC-08
- `.planning/ROADMAP.md` lines 487-495 — Phase 21 success criteria (fixed scope anchor)
- `.planning/STATE.md` line 80, 92 — GRPC-05 reaffirmed (no wallet-touching service extraction this milestone); Events/Stays/Marketplace/Studio explicitly NOT candidates for this phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRPC-07 | Delivery's `VerifyDeliveryOtp` RPC is extracted to a live, independently-deployed gRPC service (own Railway process, `ClientGrpc`, zero REST behavior change); `RequestDelivery`, `AcceptDelivery`, `CompleteDelivery`, and `DeliveryGateway` remain in-process this milestone | Pattern 1-7 (bootstrap/module/controller/facade/module/railway.toml/Dockerfile shapes) provide the exact scaffold; Pitfall 5 identifies the one genuine design gap (business-exception vs. transport-exception mapping across the gRPC boundary for OTP failure paths); D-01/D-02 (locked, copied into User Constraints) resolve module-scope questions; delivery.proto's `VerifyDeliveryOtp` RPC signature confirmed to match `DeliveryService.verifyOtp(orderId, dto)` 1:1 |
| GRPC-08 | The news, waitlist, and reviews modules are each extracted to live, independently-deployed gRPC services (own `.proto` contracts authored, own Railway process, `ClientGrpc`, zero REST behavior change) following the `notifications-service` pattern | Pattern 1-7 provide the exact scaffold for all 3; News confirmed near-mechanical (proto matches domain service 1:1); Waitlist confirmed mechanical except one stats-shape gap (Pitfall 1, with a recommended fan-out resolution flagged as Assumption A3/Open Question 2); Reviews confirmed to need explicit shape-reconciliation work beyond the mechanical pattern (Pitfalls 2-4, with one item — `ResolveReviewFlag`'s missing decision/resolution fields — surfaced as Open Question 1 requiring explicit sign-off before planning locks task shape) |

</phase_requirements>


## Summary

This phase is a **pure replication task**, not a design task. Phase 17 (extraction) + Phase 20 (health-check/blue-green retrofit) already produced one fully-working, hybrid HTTP+gRPC, health-checked, canary-flagged extracted service — `notifications-service` — and its monolith-side facade — `NotificationsClientService`/`NotificationsClientModule`. Every file that pattern touches has already been read in full for this research and is quoted below. The planner's job is to instantiate that exact shape four more times (News, Waitlist, Reviews, Delivery-OTP), in the risk-ascending order CONTEXT.md D-05 locks (News → Waitlist → Reviews → Delivery OTP), each gated by its own `PlatformConfig` canary kill-switch and each following Phase 20's health-check-gated rollout runbook (which explicitly states it "applies going forward to any service extracted in Phase 21 and beyond").

The one genuine design work in this phase is **not** infrastructure — it's **reconciling REST response shapes against already-authored, unchangeable proto contracts**. Three of the four proto files are thinner than their current REST response shapes:
1. `waitlist.proto`'s `GetWaitlistStats` takes one `source` and returns one `total_count` — but the current admin REST endpoint returns a **grouped array across all sources** in one call.
2. `reviews.proto`'s `ListReviews` has no pagination fields and `ReviewSummary` has no embedded `user` object — but the current REST endpoint paginates and embeds `{id, firstName, lastName, avatarUrl}` per review.
3. `reviews.proto`'s `CreateReview` returns only `{id, flagged}` — but the current REST endpoint returns the full created `Review` row.
4. `reviews.proto` has **no RPCs at all** for `ReviewsAdminController`'s `getFlagQueue`/`getFlag` (only `ResolveReviewFlag` is covered).

None of these are blockers — every one has a viable resolution using patterns already established in this codebase (client-side Prisma enrichment after a thin gRPC call, exactly as the monolith already does for other cross-service reads) — but the planner must explicitly design each one, they are not mechanical copy-paste like the rest of this phase.

**Primary recommendation:** Treat News and Waitlist as near-mechanical replications of the `notifications-service` pattern (Waitlist has one open design question — stats aggregation). Treat Reviews as the pattern-replication PLUS three explicit shape-reconciliation tasks (pagination, user enrichment, admin-queue bypass). Treat Delivery-OTP as the pattern-replication PLUS a hybrid controller (3 methods stay in-process, 1 method calls the new facade) rather than a full controller swap.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| News listing (read) | API/Backend (new `news-service` gRPC process) | API/Backend (monolith `NewsClientService` facade + REST controller) | Pure read, no cross-domain state — matches `notifications-service`'s `sendPush`/`registerToken` shape exactly |
| Waitlist join + stats | API/Backend (new `waitlist-service` gRPC process) | API/Backend (monolith facade does per-source RPC fan-out to reassemble REST shape) | CRUD + one shape-reconciliation concern (stats aggregation) |
| Review creation + public listing | API/Backend (new `reviews-service` gRPC process) | API/Backend (monolith facade enriches thin gRPC response with local Prisma reads for user embed + full row) | Cross-domain writes (TourGuide/TourPackage/Property) stay inside the extracted process; REST-shape enrichment stays in the monolith facade |
| Review admin queue (`getFlagQueue`/`getFlag`) | API/Backend (monolith, direct Prisma — NOT extracted) | — | No proto RPC exists for these two reads; extracting them is out of scope for this phase (proto is locked/unchangeable per CONTEXT.md) |
| Review flag resolution | API/Backend (new `reviews-service` gRPC process) | — | `ResolveReviewFlag` RPC exists and is covered |
| Delivery OTP verification | API/Backend (new `delivery-otp-service` gRPC process) | Database/Storage (shared Postgres `deliveryOrder.otpVerifiedAt` + shared Redis `delivery:otp:*` keys, both still touched by in-process `DeliveryService`) | Explicitly scoped down per CONTEXT.md D-01/D-02 — `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery`/`DeliveryGateway` stay in-process |
| Rollout gating (canary flag + health check) | API/Backend (`PlatformConfig` read in each new `*ClientService`) + Railway platform (`healthcheckPath`) | — | Reuses Phase 20's `grpc.<service>_canary_enabled` kill-switch and `grpc.health.v1.Health` pattern verbatim — no new architecture |

## Standard Stack

### Core (all already installed in `backend/package.json` — no new installs needed)

| Library | Version (installed) | Purpose | Why Standard (for this repo) |
|---------|---------|---------|--------------|
| `@nestjs/microservices` | `^11.1.19` | `ClientGrpc`/`@GrpcMethod`/`Transport.GRPC` | Already used by all 8 `apps/*-service` scaffolds and the monolith-side `notifications-client` |
| `grpc-health-check` | `^2.1.0` | `grpc.health.v1.Health` implementation (`HealthImplementation`, `protoPath`) | The exact library `notifications-service/src/main.ts` already uses post-Phase-20 |
| `@grpc/grpc-js` | `^1.14.3` | Underlying gRPC transport | Peer dep of `@nestjs/microservices` |
| `@nestjs/terminus` | (already a dep, used by `HealthController`) | HTTP `/healthz` `TerminusModule`/`HealthCheckService` | Matches `notifications-service/src/health.controller.ts` verbatim |
| `@iseyaa/proto` | `0.1.0` (workspace package, `packages/proto`) | Generated TS types for all 4 target protos (`news.ts`, `waitlist.ts`, `reviews.ts`, `delivery.ts` already exist under `packages/proto/generated/`) | Already generated — no `generate.sh` re-run needed unless a proto file itself changes (it doesn't this phase) |
| `cockatiel` (via `ResilienceService`) | (existing) | Circuit breaker + retry + timeout per new gRPC vendor key | `ResilienceService.execute('newsGrpc' | 'waitlistGrpc' | 'reviewsGrpc' | 'deliveryOtpGrpc', fn)` — **new `Vendor` union members must be added to `backend/src/resilience/resilience.types.ts`**, this is a required code change, not automatic |

**Installation:** None. Every package this phase needs is already in `backend/package.json`. Verified via direct read of `backend/package.json` (`@nestjs/microservices: ^11.1.19`, `grpc-health-check: ^2.1.0`, `@grpc/grpc-js: ^1.14.3`) — `[VERIFIED: package.json]`.

### Alternatives Considered

None — CONTEXT.md D-01 through D-06 already lock the pattern to "the exact pattern already proven live by `notifications-service`." This research does not evaluate alternatives; it documents the one pattern to replicate.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │              Monolith (backend)              │
                         │                                               │
  Web/Mobile clients ───▶│  NewsController ──▶ NewsClientService ───┐    │
  (REST /api/v1/*,        │  WaitlistController ──▶ WaitlistClientSvc─┤    │
   unchanged shape)       │  ReviewsController ──▶ ReviewsClientSvc ─┤    │──▶ PlatformConfig
                         │  DeliveryController.verifyOtp ──▶          │    │    (canary flag read,
                         │    DeliveryOtpClientService ────────────────┘    │     per-service key)
                         │  DeliveryController.{request,accept,complete}   │
                         │    ──▶ DeliveryService (in-process, unchanged)  │
                         └───────────────┬───────────────────────────────┘
                                         │ ClientGrpc (each *ClientService,
                                         │ gated by isCanaryEnabled() +
                                         │ ResilienceService.execute(vendor,...))
                     ┌───────────────────┼───────────────────┬─────────────────┐
                     ▼                   ▼                   ▼                 ▼
            ┌────────────────┐ ┌──────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
            │  news-service   │ │ waitlist-service  │ │ reviews-service │ │ delivery-otp-service  │
            │  :5009 gRPC     │ │ :5010 gRPC        │ │ :5011 gRPC      │ │ :5012 gRPC            │
            │  :PORT /healthz │ │ :PORT /healthz    │ │ :PORT /healthz  │ │ :PORT /healthz        │
            │  NewsModule     │ │ WaitlistModule     │ │ ReviewsModule   │ │ DeliveryModule (whole,│
            │  (wholesale)    │ │ (wholesale)        │ │ (wholesale —    │ │  incl. WalletModule/  │
            │                 │ │                    │ │  incl. its own  │ │  AuthModule pulled in │
            │                 │ │                    │ │  @OnEvent debounce│ │  for the Gateway —   │
            │                 │ │                    │ │  handler, now    │ │  D-01 accepted        │
            │                 │ │                    │ │  running here)   │ │  tradeoff)            │
            └───────┬─────────┘ └────────┬───────────┘ └────────┬────────┘ └──────────┬────────────┘
                    │                    │                       │                     │
                    └────────────────────┴───────────┬───────────┴─────────────────────┘
                                                       ▼
                                        Shared PostgreSQL (Prisma) + Shared Redis
                                        (no data-ownership boundary enforced —
                                         same instance every extracted service AND
                                         the monolith connect to, per established
                                         Phase 17/20 precedent)
```

Every extracted service is a standalone Railway process reachable only via its `ClientGrpc` facade in the monolith — REST endpoints stay in the monolith unchanged, only their controllers' injected service swaps from the in-process domain service to the new `*ClientService` facade (except Delivery, where only `verifyOtp` swaps — see Delivery section below).

### Recommended Project Structure

```
backend/
├── apps/
│   ├── news-service/                    # NEW — mirrors apps/notifications-service/ exactly
│   │   ├── Dockerfile
│   │   ├── railway.toml
│   │   ├── tsconfig.app.json
│   │   └── src/
│   │       ├── main.ts                  # hybrid bootstrap (HTTP /healthz + gRPC :5009)
│   │       ├── app.module.ts            # imports NewsModule wholesale + Prisma/Redis/Resilience/Terminus
│   │       ├── health.controller.ts     # copy verbatim from notifications-service
│   │       └── news-grpc.controller.ts  # @GrpcMethod('NewsService', 'ListNews')
│   ├── waitlist-service/                # NEW — same shape, port 5010
│   ├── reviews-service/                 # NEW — same shape, port 5011
│   └── delivery-otp-service/            # NEW — same shape, port 5012, imports DeliveryModule wholesale
├── src/
│   ├── modules/
│   │   ├── news/                        # UNCHANGED (NewsService/NewsModule stay — reused wholesale by news-service)
│   │   ├── waitlist/                    # UNCHANGED (same)
│   │   ├── reviews/                     # UNCHANGED (same)
│   │   ├── delivery/                    # UNCHANGED (DeliveryModule stays; DeliveryController gets ONE method swapped)
│   │   ├── news-client/                 # NEW — mirrors notifications-client/ exactly
│   │   │   ├── news-client.constants.ts   # NEWS_PACKAGE token (leaf file, breaks require cycle — Phase 20 D-09 lesson)
│   │   │   ├── news-client.module.ts      # ClientsModule.registerAsync + registers NewsController here instead
│   │   │   └── news-client.service.ts     # canary flag + resilience.execute('newsGrpc', ...) + gRPC call
│   │   ├── waitlist-client/             # NEW — same shape
│   │   ├── reviews-client/              # NEW — same shape
│   │   └── delivery-otp-client/         # NEW — same shape, but DeliveryController stays in delivery/ module,
│   │                                     #        only imports DeliveryOtpClientService alongside DeliveryService
│   └── resilience/
│       └── resilience.types.ts          # MODIFIED — add 'newsGrpc'|'waitlistGrpc'|'reviewsGrpc'|'deliveryOtpGrpc' to Vendor union + RESILIENCE_DEFAULTS
├── nest-cli.json                        # MODIFIED — add 4 new "projects" entries
├── package.json                         # MODIFIED — add 4 services to build:services loop
docker-compose.yml                        # MODIFIED — add 4 new service blocks + backend depends_on + env vars
.env.example                              # MODIFIED — add 4 new *_SERVICE_URL placeholders (5009-5012)
docs/blue-green-cutover-runbook.md        # MODIFIED — extend with per-service canary-flag-key + port sections (file already states it "applies going forward to any service extracted in Phase 21 and beyond")
```

### Pattern 1: Hybrid HTTP+gRPC bootstrap (copy from `notifications-service/src/main.ts`, change only package/protoPath/port)

**What:** `NestFactory.create()` (not `createMicroservice()`) + `app.connectMicroservice()` for gRPC + `app.listen(process.env.PORT ?? 8080)` for the HTTP healthz sidecar, both started via `app.startAllMicroservices()` before `app.listen()`.
**When to use:** Every new service in this phase, from day one — do not ship gRPC-only then retrofit health later (that was Phase 20's job; this phase's services must be born with it).
**Example (verbatim structure to replicate, full current file, `backend/apps/notifications-service/src/main.ts`):**
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
      package: ['news', 'grpc.health.v1'],                       // <- change per service
      protoPath: [
        join(__dirname, '../../../../../packages/proto/news.proto'), // <- change per service
        healthCheckProtoPath,
      ],
      url: '0.0.0.0:5009',                                        // <- change per service (5009/5010/5011/5012)
      onLoadPackageDefinition: (pkg, server) => {
        const healthImpl = new HealthImplementation({ '': 'UNKNOWN' });
        healthImpl.addToServer(server);
        healthImpl.setStatus('', 'SERVING');
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 8080);
  console.log('news-service gRPC :5009, HTTP healthz :8080');   // <- change per service
}

bootstrap();
```
`[VERIFIED: backend/apps/notifications-service/src/main.ts, read in full]`

### Pattern 2: `app.module.ts` — import the domain module wholesale, not a lean subset

**What:** The new app's `AppModule` imports `ConfigModule`, `ScheduleModule` (if the domain module has crons — none of these 4 do), `PrismaModule`, `RedisModule`, `ResilienceModule`, `TerminusModule`, and the **entire existing domain module** (`NewsModule`/`WaitlistModule`/`ReviewsModule`/`DeliveryModule`) — no new lean/split module is created.
**When to use:** All four services. CONTEXT.md D-01 explicitly locks this for Delivery ("reuses the full `DeliveryModule` as-is... rather than extracting `verifyOtp`'s Redis+Prisma logic into a new lean OTP-only module") and the same rationale (speed + precedent-fidelity) applies to News/Waitlist/Reviews.
**Example (current file, `backend/apps/notifications-service/src/app.module.ts`):**
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
`[VERIFIED: backend/apps/notifications-service/src/app.module.ts, read in full — note this is the CURRENT, post-Phase-20 file, already includes TerminusModule/HealthController, confirming Phase 20 is fully implemented]`

For `delivery-otp-service` specifically: `DeliveryModule` already imports `WalletModule` and `AuthModule` itself (see `backend/src/modules/delivery/delivery.module.ts`), so importing `DeliveryModule` wholesale pulls those in transitively — no extra import lines needed in the new app's `AppModule` beyond `DeliveryModule` itself. `DbMetricsModule` inclusion is optional/precedent-following, not load-bearing for this phase.

### Pattern 3: `*-grpc.controller.ts` — thin `@GrpcMethod` wrapper, delegates to the existing service unchanged

**What:** One `@Controller()` class per service with one `@GrpcMethod('<ProtoServiceName>', '<RpcName>')` method per RPC in that proto, each calling the existing (unmodified) domain service method and shaping its return to the proto response message.
**Example (current file, `backend/apps/notifications-service/src/notifications-grpc.controller.ts`):**
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
  // ...
}
```
`[VERIFIED: backend/apps/notifications-service/src/notifications-grpc.controller.ts, read in full]`

**Per-service RPC → domain method mapping (from proto files, all read in full this session):**

| Service | RPC | Proto request fields | Proto response fields | Domain method to call |
|---------|-----|----------------------|------------------------|------------------------|
| News | `ListNews` | `limit: int32`, `category: string` | `items: repeated NewsItemSummary` | `NewsService.findLatest(limit, category)` — signature matches exactly (`findLatest(limit = 20, category?: string)`) `[VERIFIED: news.proto + news.service.ts]` |
| Waitlist | `JoinWaitlist` | `email`, `phone`, `full_name`, `source` | `id`, `success` | `WaitlistService.join(dto)` — DTO has `source: WaitlistSource` (`@IsIn(['marketplace_web','marketplace_mobile'])`), `email?`, `phone?`, `fullName?`; controller must map proto snake_case → DTO camelCase | `[VERIFIED: waitlist.proto + waitlist.service.ts + join-waitlist.dto.ts]` |
| Waitlist | `GetWaitlistStats` | `source: string` | `total_count: int32` | **Shape mismatch — see Common Pitfalls #1.** No existing domain method returns a single source's count; `WaitlistService.stats()` takes no args and groups ALL sources. |
| Reviews | `CreateReview` | `target_type`, `target_id`, `user_id`, `tour_booking_id`, `rating: int32`, `comment` | `id`, `flagged: bool` | `ReviewsService.createReview(actorUserId, dto)` — dto shape is `{tourBookingId, targetType, targetId, rating, comment?, photos?}`; **proto has no `photos` field** — see Common Pitfalls #2 |
| Reviews | `ListReviews` | `target_type`, `target_id` | `reviews: repeated ReviewSummary {id, user_id, rating, comment, flagged, created_at}` | `ReviewsService.findByTarget(targetType, targetId, opts)` — **proto has no pagination fields, no `photos`, no embedded user profile** — see Common Pitfalls #3 |
| Reviews | `ResolveReviewFlag` | `review_id`, `resolved_by_id` | `success: bool` | `ReviewsService.resolveFlag(flagId, actorUserId, dto)` — **proto has no `decision`/`resolution` fields**, only `review_id`/`resolved_by_id` — see Common Pitfalls #4 |
| Delivery | `VerifyDeliveryOtp` | `order_id`, `otp` | `success: bool` | `DeliveryService.verifyOtp(orderId, dto)` where `dto = { otp }` — return shape maps `{verified: true} → {success: true}`; **service throws `BadRequestException` on wrong/expired OTP or lockout — gRPC controller must decide how these map to gRPC status/message, since `@GrpcMethod` by default converts thrown NestJS HttpExceptions to gRPC `UNKNOWN` status with the exception message, per NestJS docs — verify this is acceptable or needs explicit gRPC status-code mapping** `[VERIFIED: delivery.proto + delivery.service.ts:489-521]` |

### Pattern 4: `*-client.service.ts` — canary kill-switch + resilience-wrapped facade

**What:** Injects `PrismaService` (for the canary flag read) + the `ClientGrpc` token + `ResilienceService`. Every network method: (1) check `isCanaryEnabled()`, throw `ServiceUnavailableException` if false; (2) wrap the gRPC call in `resilience.execute('<vendorKey>', ...)`; (3) catch and rethrow as `ServiceUnavailableException`, logging only `err?.message`.
**Example (current file, full, `backend/src/modules/notifications-client/notifications-client.service.ts` — already quoted in full above under Code Examples; key excerpt):**
```typescript
const CANARY_FLAG_KEY = 'grpc.notifications_service.canary_enabled'; // -> grpc.news_service.canary_enabled, etc.
const UNAVAILABLE_MESSAGE = 'Notifications service is temporarily unavailable, please try again shortly'; // per-service wording

private async isCanaryEnabled(): Promise<boolean> {
  const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
  return cfg?.value !== false; // opt-OUT kill switch — absence/true/anything-but-false = enabled
}
```
`[VERIFIED: backend/src/modules/notifications-client/notifications-client.service.ts, read in full]`

**Canary flag keys to create this phase** (follow the exact `grpc.<service>_canary_enabled` naming CONTEXT.md D-06 locks):
- `grpc.news_service.canary_enabled`
- `grpc.waitlist_service.canary_enabled`
- `grpc.reviews_service.canary_enabled`
- `grpc.delivery_otp_service.canary_enabled`

### Pattern 5: `*-client.module.ts` + `*-client.constants.ts` — leaf-file token to avoid the circular-dependency bug Phase 20 (D-09) already fixed once

**What:** The gRPC client injection token (e.g. `NEWS_PACKAGE`) lives in its own zero-import file (`news-client.constants.ts`), not in `news-client.module.ts` or `news-client.service.ts` — this is a **hard-won lesson from Phase 20**, not a style preference. `notifications-client.module.ts`'s comment explicitly says: "extracted to a zero-import leaf file to break a require cycle... do not move this declaration back here."
**Example (current file, full, `backend/src/modules/notifications-client/notifications-client.module.ts`):** see Code Examples below — this is the module that **registers the REST controller** (`NotificationsController`) too, i.e. the client module owns both the gRPC client registration AND the REST controller whose handlers now call the facade.
`[VERIFIED: backend/src/modules/notifications-client/notifications-client.module.ts, read in full]`

**For this phase:** `NewsController`/`WaitlistController`/`ReviewsController` (+ `ReviewsAdminController`) move their `@Module()` registration from `news.module.ts`/`waitlist.module.ts`/`reviews.module.ts` into the new `news-client.module.ts`/`waitlist-client.module.ts`/`reviews-client.module.ts`, exactly as `NotificationsController` moved out of a (now-nonexistent, never observed in this repo) `notifications.module.ts`-owns-controller pattern into `notifications-client.module.ts`. The old `NewsModule`/`WaitlistModule`/`ReviewsModule` keep their service + (for Reviews) both controllers as `providers`/`exports` for the **new gRPC app** to import wholesale — they stop being imported by the monolith's `app.module.ts` in favor of the new `*ClientModule`.

**Delivery is the one exception to "controller moves wholesale":** `DeliveryController` stays in `backend/src/modules/delivery/delivery.module.ts`, registered where it already is. It gets a **second** injected service (`DeliveryOtpClientService`) alongside its existing `DeliveryService`, and only its `verifyOtp` handler switches to call the new facade — `requestDelivery`/`acceptDelivery`/`completeDelivery` keep calling `this.deliveryService` unchanged. `DeliveryModule` itself is imported in **two places** after this phase: the monolith's `app.module.ts` (unchanged, for the 3 in-process methods + `DeliveryGateway`) AND the new `delivery-otp-service`'s `app.module.ts` (new, wholesale import per Pattern 2).

### Pattern 6: `railway.toml` — health-checked from day one

**What:** Every new service's `railway.toml` includes `healthcheckPath = "/healthz"` and `healthcheckTimeout = 60` from the first commit — do not ship gRPC-only then retrofit (Phase 20 already did that retrofit once; these services are born with it).
**Example (current file, `backend/apps/notifications-service/railway.toml`):**
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
`[VERIFIED: backend/apps/notifications-service/railway.toml, read in full]`

Adapt `watchPaths` per service, e.g. for reviews: `["backend/apps/reviews-service/**", "backend/src/modules/reviews/**", "packages/proto/**"]`.

### Pattern 7: `Dockerfile` — includes `@iseyaa/proto` workspace install (the pending todo this fixed for)

**What:** `RUN npm ci --workspace=backend --workspace=packages/proto` (both workspaces, not just `backend`) — this exact line is why the `docker build` fails-for-all-8-images pending todo (`STATE.md` "Docker build fix before further live extraction") is already resolved: `backend/package.json` declares `"@iseyaa/proto": "0.1.0"` and root `package.json`'s `workspaces` array includes `"packages/proto"`. **This is already fixed** — `[VERIFIED: backend/package.json line 30 + root package.json line 11, both read in full]`. New Dockerfiles for the 4 services just need to copy this exact shape from `notifications-service/Dockerfile`, not from the older `auth-service/Dockerfile` (which predates the fix and only does `npm ci --workspace=backend --include=workspace=shared`).
**Example (current file, full, `backend/apps/notifications-service/Dockerfile`):**
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
`[VERIFIED: backend/apps/notifications-service/Dockerfile, read in full]`

### Anti-Patterns to Avoid

- **Extending the `.proto` files to fix shape mismatches:** CONTEXT.md is explicit that this phase "implements servers against existing, unchangeable contracts" (Phase 10-03 authored them). Resolve shape gaps in the client facade (Prisma enrichment, per-source RPC fan-out), not by editing `packages/proto/*.proto`.
- **Building a lean/split module for Delivery-OTP:** CONTEXT.md D-01 explicitly rejects this in favor of importing the whole `DeliveryModule` — do not "improve" on this decision during planning.
- **Skipping the health check for these 4 services "since it's Phase 20's job":** Phase 20 retrofitted an existing service; this phase's services must be built with the hybrid HTTP+gRPC + health check pattern from their first commit, per Success Criteria #3.
- **Reusing one combined canary flag for all 4 (or all-in-one-wave rollout):** CONTEXT.md D-04/D-06 explicitly lock one independent flag per service and staggered rollout — do not combine for "simplicity."
- **Declaring the token constant inside `*-client.module.ts` or `*-client.service.ts`:** Phase 20 already discovered and fixed a circular-dependency bug from this exact anti-pattern (D-09) — the leaf-file (`*-client.constants.ts`) placement is required, not optional style.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| gRPC health protocol | A custom health RPC/message shape | `grpc-health-check` npm package's `HealthImplementation` + `protoPath` | Already the exact library `notifications-service` uses; standard `grpc.health.v1.Health` service Railway/any gRPC health prober expects |
| HTTP healthcheck endpoint | A bespoke `/status` or `/ping` route | `@nestjs/terminus`'s `TerminusModule` + `HealthCheckService` + `@HealthCheck()` | Matches the exact monolith + `notifications-service` pattern; `check([])` (zero indicators) is intentional — this endpoint proves the process is up and serving, not deep-checking DB/Redis (that's what the gRPC call failing does) |
| Circuit breaker / retry / timeout per new gRPC vendor | A bespoke try/catch-with-retry loop | `ResilienceService.execute('<newVendorKey>', fn)` after adding the vendor key to `resilience.types.ts`'s `Vendor` union + `RESILIENCE_DEFAULTS` | Single choke-point circuit breaker already built (Phase 11); mirrors `notificationsGrpc`'s exact tuning rationale (same-region Railway-internal gRPC hop) |
| Canary kill-switch | A feature-flag SaaS or new admin UI | `PlatformConfig` row + `PATCH /api/v1/admin/config/:key` (already exists, `admin.controller.ts:96-100`) | Zero new tooling — the exact precedent CONTEXT.md D-06 names |
| Rollout runbook | A brand-new runbook document | Extend `docs/blue-green-cutover-runbook.md` in place | The file's own header text says it "applies going forward to any service extracted in Phase 21 and beyond" — it was written anticipating this phase |

**Key insight:** This phase has essentially zero net-new infrastructure decisions. Every piece of scaffolding (health check, hybrid bootstrap, canary flag, resilience policy, runbook) was already built generically enough in Phase 17/20 to be reused as-is. The only genuine engineering judgment calls are the proto/REST shape reconciliations documented in Common Pitfalls.

## Common Pitfalls

### Pitfall 1: Waitlist `GetWaitlistStats` proto shape cannot represent the current REST admin response in one call

**What goes wrong:** `GET /waitlist/stats` today (`WaitlistController.stats()` → `WaitlistService.stats()`) returns `[{source: 'marketplace_web', count: N}, {source: 'marketplace_mobile', count: M}]` — grouped across ALL sources, no arguments. The proto's `GetWaitlistStats` RPC takes a single `source: string` and returns a single `total_count: int32` — there is no way to get "all sources grouped" back from one RPC call.
**Why it happens:** The proto was authored (Phase 10-03) against a single-source-lookup mental model; the actual REST behavior it must now serve fans out across a small, fixed, known set of sources (`WAITLIST_SOURCES = ['marketplace_web', 'marketplace_mobile']` — a 2-element `const` array, not open-ended).
**How to avoid:** In `WaitlistClientService.stats()`, call `GetWaitlistStats` once per entry in `WAITLIST_SOURCES` (2 calls, in parallel via `Promise.all`) and reassemble the `[{source, count}]` array shape client-side. This is a viable fix specifically because `WAITLIST_SOURCES` is a small, closed, already-imported-from-`shared`-or-DTO enum, not open-ended — confirm this during planning by re-checking `join-waitlist.dto.ts`'s `WAITLIST_SOURCES` constant is still the single source of truth (it is, as of this research).
**Warning signs:** If `WAITLIST_SOURCES` grows to be dynamic/DB-driven in the future, this per-source fan-out approach breaks silently (stats for a new source would never be queried) — flag this coupling in a code comment.

### Pitfall 2: Reviews `ListReviews`/`CreateReview` proto shapes drop pagination, `photos`, and the embedded `user` profile

**What goes wrong:** `GET /reviews?targetType=&targetId=&page=&limit=` today returns `{data: [...], pagination: {page, limit, total, pages}}` where each review row embeds `user: {id, firstName, lastName, avatarUrl}` and `photos: string[]`. The proto's `ListReviewsResponse` returns a flat `repeated ReviewSummary` (no pagination envelope) and `ReviewSummary` has no `photos` field and only a bare `user_id` string (no embedded profile). Likewise `POST /reviews` today returns the full `Review` row (all Prisma columns); `CreateReviewResponse` returns only `{id, flagged}`.
**Why it happens:** Same root cause as Pitfall 1 — the proto was authored as a minimal RPC contract, not a full REST-response mirror.
**How to avoid:** In `ReviewsClientService`, after the thin gRPC call succeeds, do a follow-up Prisma read in the monolith (which still has full, unrestricted `PrismaService` access — nothing about this extraction removes that) to reassemble the exact REST shape clients already depend on: (a) for `findByTarget`, either request more than `limit` reviews aren't possible via the proto at all (`ListReviews` has no `limit`/`skip`) — the pragmatic resolution is that the gRPC service returns ALL reviews for a target (server-side, inside `reviews-service`, which still has the real Prisma query available) and the monolith facade paginates the already-fetched array in memory; this is fine at current review-volume-per-target but should be flagged to the planner as an explicit, deliberate scale tradeoff, not a silent behavior change; (b) for both `findByTarget` and `createReview`, batch-fetch the `photos` array and `user` profile fields via a direct `prisma.review.findMany`/`findUnique` + `prisma.user.findMany` in the monolith facade, keyed by the IDs the gRPC response already returned, and merge into the REST response before returning to the controller.
**Warning signs:** If `ReviewsClientService` is implemented as a pure 1:1 pass-through of the gRPC response without this enrichment step, the REST response shape silently changes (missing `photos`, missing `user`, missing `pagination` envelope) — this would violate Success Criteria #1's "zero client-visible behavior change" and should be caught by extending the existing `reviews.controller.spec.ts`/e2e tests to assert full response shape, not just status code.

### Pitfall 3: `reviews.proto` has zero RPC coverage for `ReviewsAdminController.getFlagQueue`/`getFlag`

**What goes wrong:** `GET /admin/reviews/queue` and `GET /admin/reviews/flags/:id` (both `LGA_ADMIN+`) call `ReviewsService.findFlagQueue()`/`findFlagById()` — neither has a corresponding RPC in `reviews.proto` (only `CreateReview`/`ListReviews`/`ResolveReviewFlag` exist).
**Why it happens:** These two admin-read endpoints were apparently out of scope when the proto was authored (Phase 10-03) — likely because they're low-traffic, admin-only reads with no cross-domain write concern, unlike `createReview`.
**How to avoid:** These two `ReviewsAdminController` handlers stay calling Prisma **directly from the monolith** (either by keeping a thin in-process `ReviewsService`-like read helper in the monolith, or — cleaner — by having `ReviewsAdminController`'s `getFlagQueue`/`getFlag` query `AdminReviewFlag`/`Review` directly via the monolith's own `PrismaService`, bypassing both `ReviewsService` and the new `ReviewsClientService` entirely). This is consistent with the "no data-ownership boundary enforced" established pattern (Reviews and Reviews-admin already share the same Postgres instance whether or not the write path is extracted) and does not violate D-02's proto-immutability constraint since no RPC is invoked at all for these two reads. `resolveFlag` (the third `ReviewsAdminController` handler) DOES have RPC coverage (`ResolveReviewFlag`) and should go through `ReviewsClientService` normally.
**Warning signs:** If the plan tries to route `getFlagQueue`/`getFlag` through a gRPC call that doesn't exist in the proto, this is a hard compile-time signal (TypeScript's generated client types from `@iseyaa/proto` won't have those methods) — should be caught immediately, not silently worked around.

### Pitfall 4: `ResolveReviewFlag`'s proto request has no `decision`/`resolution` fields

**What goes wrong:** `ResolveFlagDto` (REST) has `decision: 'RESOLVED' | 'DISMISSED'` and optional `resolution: string`. `ResolveReviewFlagRequest` (proto) has only `review_id` and `resolved_by_id` — no `decision`, no `resolution`.
**Why it happens:** Same proto-authored-thinner-than-REST pattern as the other Reviews mismatches.
**How to avoid:** This is a genuine functional gap, not just a display-shape gap — `decision` determines whether the flag becomes `RESOLVED` or `DISMISSED`, this cannot be reconstructed client-side after the fact from a boolean `success` response. Flag this explicitly as an **Open Question** for the planner/user: either (a) the proto genuinely needs a field added (contradicts "unchangeable contract" framing, would need explicit sign-off since CONTEXT.md frames protos as already-locked), or (b) `resolveFlag` is treated like Pitfall 3's admin-queue reads and stays fully in-process (not extracted at all this phase, despite CONTEXT.md's canonical_refs listing `ResolveReviewFlag` as one of the 3 covered RPCs). Given CONTEXT.md explicitly lists `ResolveReviewFlag` as an RPC this phase implements, this needs a decision, not a workaround — surfaced as Open Question 1 below.
**Warning signs:** Do not ship a gRPC `ResolveReviewFlag` implementation that hardcodes `decision: 'RESOLVED'` regardless of the admin's actual choice — that is a silent, dangerous behavior change (an admin choosing "Dismiss" would incorrectly resolve the flag).

### Pitfall 5: Delivery OTP failure paths (wrong OTP, expired, lockout) throw `BadRequestException` today — verify gRPC error mapping preserves REST status codes

**What goes wrong:** `DeliveryService.verifyOtp()` throws `BadRequestException` with specific messages for: OTP expired, incorrect OTP (with remaining-attempts count), and lockout after 5 attempts. Once this logic runs inside `delivery-otp-service` and crosses a gRPC boundary, NestJS's default `@GrpcMethod` exception handling converts thrown exceptions to a gRPC status (typically `UNKNOWN`/`INTERNAL`) with the exception's message as `details` — the monolith-side `DeliveryOtpClientService` then needs to catch that and re-throw the correct `BadRequestException` (HTTP 400) with the original message, not fall through to the generic `ServiceUnavailableException` (HTTP 503) pattern `notifications-client.service.ts` uses for transport failures.
**Why it happens:** `notifications-client.service.ts`'s existing catch-all (`catch (err) { throw new ServiceUnavailableException(...) }`) is designed for a service where every failure IS a transport/availability problem (no business-rule exceptions cross the gRPC boundary in that domain). Delivery OTP is different: some failures are legitimate business-rule 400s (wrong OTP) that must reach the DRIVER's mobile client as "incorrect OTP, N attempts remaining," not a generic "service unavailable" message.
**How to avoid:** `DeliveryOtpClientService.verifyOtp()` needs its own error-mapping logic — inspect the gRPC error's `details`/`message` and re-throw as `BadRequestException(message)` when it originated from a business-rule check inside `delivery-otp-service`, versus `ServiceUnavailableException` only for genuine transport failures (canary-off, connection refused, timeout, circuit open). This is the one place in this phase where the `notifications-client` pattern cannot be copied verbatim — it needs an explicit design decision during planning, not silent inheritance of the "always 503 on any catch" shape.
**Warning signs:** If a driver reports "the app just says service unavailable" instead of "incorrect OTP, 2 attempts remaining" after this extraction ships, this pitfall was not addressed.

### Pitfall 6: `RedisModule`/`PrismaModule` global availability means no extra wiring needed — but confirm this explicitly, don't assume

**What goes wrong:** None, if confirmed — this is a "verify, don't assume" pitfall. `PrismaModule` and `RedisModule` are both `@Global()` (per CLAUDE.md's Architectural Constraints and confirmed in Phase 20's pattern map), so importing them once in each new service's `AppModule` (per Pattern 2 above) is sufficient — no per-module re-import needed inside `NewsModule`/`WaitlistModule`/`ReviewsModule`/`DeliveryModule` themselves.
**Why it happens (if missed):** A planner unfamiliar with NestJS `@Global()` semantics might add redundant `imports: [PrismaModule]` inside the domain modules "just to be safe," which is harmless but unnecessary noise.
**How to avoid:** Follow the `notifications-service` precedent exactly — `PrismaModule`/`RedisModule` are imported ONLY in the new app's top-level `AppModule`, never inside the wholesale-imported domain module itself.

## Runtime State Inventory

> This phase is an extraction, not a rename/refactor/migration in the sense that section normally targets (no string renaming), but it does move where code that touches shared runtime state executes. Included per the spirit of the trigger condition since Delivery OTP moves a Redis/Postgres-touching code path to a new process.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no database schema changes, no new tables/collections. `deliveryOrder.otpVerifiedAt` column is read/written by the SAME Prisma model from two processes post-extraction (monolith's `completeDelivery` reads it; `delivery-otp-service`'s `verifyOtp` writes it) — this is explicitly accepted per CONTEXT.md D-02, not a migration concern. | None — code edit only (which process calls which method), no data migration |
| Live service config | None found — News/Waitlist/Reviews/Delivery have no external service config (no n8n workflows, no Datadog dashboards, no Tailscale ACLs referencing these domains) | None |
| OS-registered state | None — no `@Cron` jobs exist in News/Waitlist/Reviews modules. Delivery's crons (`cleanStaleRiderHeartbeats`) are NOT touched by this phase (already `setNx()`-locked by Phase 20, and not part of the `verifyOtp` extraction) | None |
| Secrets/env vars | 4 new `*_SERVICE_URL` env vars needed (`NEWS_SERVICE_URL`, `WAITLIST_SERVICE_URL`, `REVIEWS_SERVICE_URL`, `DELIVERY_OTP_SERVICE_URL`), following the exact placeholder pattern already present in `.env.example` for the 7 unused `*_SERVICE_URL` vars (auth/wallet/events/stays/marketplace/admin/ai) plus the 1 now-consumed one (`NOTIFICATIONS_SERVICE_URL`) | Code edit — add to `.env.example`, `docker-compose.yml` (`backend` service's `environment:` block + new service blocks), and each new `*-client.module.ts`'s `ClientsModule.registerAsync` `useFactory` (`config.get<string>('<X>_SERVICE_URL', 'localhost:<port>')`) |
| Build artifacts | `nest-cli.json`'s `projects` map needs 4 new entries (no entries exist for news/waitlist/reviews/delivery-otp today — confirmed via full file read); `backend/package.json`'s `build:services` shell-loop script (`for s in auth-service wallet-service ... notifications-service`) needs the 4 new service names appended or its build coverage silently excludes them | Code edit — both files, mechanical addition |

## Common Pitfalls (continued — infra/CI gaps found during research, not proto-shape issues)

### Pitfall 7: No CI step builds any `apps/*-service` scaffold today — a broken new service could merge without a build-failure signal

**What goes wrong:** `.github/workflows/ci.yml` runs `npm run build` (backend workspace default `nest build`, the monolith only) at two points, and two `test:e2e:*` jest suites — nothing in CI runs `backend/package.json`'s own `build:services` script or `npx nest build <new-service>` for any of the 8 existing `apps/*-service` scaffolds, confirmed via full grep of `ci.yml` (zero matches for "nest build", "build:services", or any `apps/*-service` path).
**Why it happens:** This predates Phase 21 — it's a pre-existing gap, not something this phase introduces, but this phase is the first time since `notifications-service` that a new scaffold's build correctness genuinely matters for a live rollout.
**How to avoid:** Not necessarily in this phase's required scope (CONTEXT.md doesn't mention CI), but worth flagging to the planner as a **Wave 0 gap** candidate — at minimum, each new service's Docker build should be exercised locally/manually before the health-check-gated Railway rollout (Success Criteria #3 already requires a live, working `/healthz` before go-live, which implicitly requires a successful build, but nothing catches a build regression automatically pre-merge).
**Warning signs:** A future PR that breaks one of these 4 new services' TypeScript compilation would pass CI green and only fail at Railway deploy time.

## Code Examples

### Full reference facade to replicate 4× (verbatim, `backend/src/modules/notifications-client/notifications-client.service.ts`)
```typescript
// Source: backend/src/modules/notifications-client/notifications-client.service.ts (read in full this session)
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
    return cfg?.value !== false;
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

### Full reference client-module to replicate 4× (verbatim, `backend/src/modules/notifications-client/notifications-client.module.ts`)
```typescript
// Source: backend/src/modules/notifications-client/notifications-client.module.ts (read in full this session)
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

### `resilience.types.ts` diff needed (add 4 new vendor keys)
```typescript
// Source: backend/src/resilience/resilience.types.ts (read in full this session) — MODIFY, do not create new file
export type Vendor =
  | 'paystack' | 'paystackRefund' | 'termiiAuth' | 'termiiDelivery'
  | 'anthropic' | 's3' | 'fcm' | 'metaWhatsapp' | 'sendgrid'
  | 'notificationsGrpc'
  | 'newsGrpc' | 'waitlistGrpc' | 'reviewsGrpc' | 'deliveryOtpGrpc'; // ADD

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  // ...existing entries unchanged...
  notificationsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  // Mirror notificationsGrpc's shape for all 4 new same-region Railway-internal gRPC hops:
  newsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  waitlistGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  reviewsGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  deliveryOtpGrpc: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
};
```

### Test pattern to replicate (structure only — from `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts`, 208 lines, read in full)
Key structural elements every new `*-client.service.spec.ts` should replicate: a `makeService(canaryFlagValue?)` factory building a `TestingModule` with mocked `ClientGrpc`/`ResilienceService`/`PrismaService`; test cases for (1) success path calling the mocked gRPC method with the exact expected payload, (2) gRPC/resilience failure → `ServiceUnavailableException` with the exact expected message, (3) canary flag `false` → `ServiceUnavailableException` WITHOUT calling `resilience.execute` or the gRPC client at all, (4) canary flag absent/`true` → unchanged existing behavior, (5) an assertion that `resilience.execute` is called with the correct vendor-key string as its first argument.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `apps/*-service` scaffolds are gRPC-only (`createMicroservice()`, no HTTP, no health) | Hybrid `NestFactory.create()` + `connectMicroservice()` + HTTP `/healthz` + `grpc.health.v1.Health` | Phase 20 (2026-07-20), applied first to `notifications-service` | This phase's 4 new services must be built with the CURRENT (post-Phase-20) shape from day one — do not copy the older 7 gRPC-only scaffolds (auth/wallet/events/stays/marketplace/admin/ai-service) as templates, they predate the health-check retrofit |
| Docker build for `apps/*-service` images failed (`TS2307: Cannot find module '@iseyaa/proto'`) | Fixed — `backend/package.json` declares `@iseyaa/proto` as a dependency, root `package.json` workspaces includes `packages/proto`, Dockerfiles run `npm ci --workspace=backend --workspace=packages/proto` | Between Phase 10 and Phase 20 (exact phase not identified, but confirmed fixed as of this research) | The STATE.md "Pending Todos" entry describing this as still-broken is **stale** — verified fixed by direct read of current `backend/package.json`/root `package.json`/`notifications-service/Dockerfile` |

**Deprecated/outdated:** STATE.md (as read at research time) describes Phase 20 as "NOT STARTED" and lists the Docker build issue as an open pending todo — both are contradicted by the actual repository state (Phase 20's `notifications-service` files are fully implemented post-health-check-retrofit, and the `@iseyaa/proto` workspace linkage is present). Treat STATE.md's phase-status prose as stale relative to git history (commits `e48ef6d`/`fb25840`/`f8b02b7` show Phase 20 completing) and trust direct file reads over STATE.md's narrative for this phase's planning baseline.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ports 5009 (news), 5010 (waitlist), 5011 (reviews), 5012 (delivery-otp) are free and the correct next-in-sequence assignment | Recommended Project Structure, Pattern 1 | LOW — confirmed via grep that no source file references 5009-5012 today; CONTEXT.md explicitly leaves exact port assignment to researcher/planner discretion, so this is a recommendation, not a locked fact |
| A2 | `@GrpcMethod`'s default NestJS exception-to-gRPC-status mapping converts a thrown `BadRequestException` to a gRPC error whose `message`/`details` preserves the original exception message | Pitfall 5 | MEDIUM — based on general NestJS microservices exception-handling behavior (training-knowledge), not verified against this specific `@nestjs/microservices ^11.1.19` version's exact behavior in this repo; planner should write a quick unit test confirming the exact shape before relying on message-string inspection in `DeliveryOtpClientService`'s catch block |
| A3 | Fanning out `GetWaitlistStats` once per `WAITLIST_SOURCES` entry (2 parallel RPC calls) is an acceptable resolution to Pitfall 1, rather than requiring a proto change | Pitfall 1 | LOW-MEDIUM — reasonable given `WAITLIST_SOURCES` is a small closed const array today, but this is a design recommendation from research, not a locked CONTEXT.md decision — flagged as Open Question 2 below for explicit sign-off |
| A4 | Server-side full-fetch + monolith-side in-memory pagination is an acceptable resolution to Reviews' pagination gap (Pitfall 2), rather than requiring a proto change | Pitfall 2 | MEDIUM — fine at current review volume per target (typically dozens, not thousands), but is a real, if minor, behavior/scale change from true DB-level `skip`/`take` pagination; flagged as Open Question 2 |

## Open Questions

1. **`ResolveReviewFlag`'s proto request has no `decision`/`resolution` fields, but CONTEXT.md lists it as an RPC this phase implements — how should the extracted service determine RESOLVED vs. DISMISSED?**
   - What we know: `ResolveReviewFlagRequest` proto message has only `review_id`/`resolved_by_id`; the REST `ResolveFlagDto` has a required `decision: 'RESOLVED'|'DISMISSED'` enum that changes the resulting `AdminReviewFlag.status`.
   - What's unclear: Whether this is an oversight in the Phase 10-03 proto authoring that needs a proto amendment (contradicting the "unchangeable contract" framing) or whether `resolveFlag` should instead stay in-process like `getFlagQueue`/`getFlag` (contradicting CONTEXT.md's canonical_refs, which lists it as covered).
   - Recommendation: Surface this to the user/discuss-phase before planning locks task shape — this is a genuine scope ambiguity, not something the planner should silently resolve either direction. If a proto amendment is ruled out, `resolveFlag` should be treated like Pitfall 3 (stays in-process, `ReviewsAdminController` keeps calling `ReviewsService` directly for all three admin methods, not just two) — this simplifies the plan by removing one RPC implementation entirely.

2. **Are Pitfalls 1 (Waitlist stats fan-out) and 2 (Reviews in-memory pagination) acceptable engineering tradeoffs, or does "zero client-visible behavior change" require something stricter?**
   - What we know: Both proposed resolutions preserve REST response *shape* exactly; neither changes response *values* at current data volumes.
   - What's unclear: Whether "zero client-visible behavior change" (Success Criteria #1) is intended to also cover subtle behavior deltas at scale (e.g., Reviews pagination degrading from O(page size) to O(all reviews for target) DB reads once extracted) that wouldn't be visible in a manual QA pass but would show up as a latency regression under load — relevant given the project's P95 < 500ms constraint (CLAUDE.md).
   - Recommendation: Planner should size these two fan-out/full-fetch approaches against realistic Reviews-per-target and Waitlist-per-source volumes (this research did not query production data volumes) before locking them as the implementation approach; if a single target commonly has hundreds of reviews, in-memory pagination inside `reviews-service` becomes a real P95 risk worth a follow-up task (e.g., proto amendment request) rather than silent acceptance.

3. **Should `nest-cli.json` project names and Railway service names use `news-service`/`waitlist-service`/`reviews-service` (matching `apps/` directory names) or something else?**
   - What we know: CONTEXT.md D-03 explicitly names `delivery-otp-service` (not `delivery-service`) for the 4th one, with clear rationale. No equivalent explicit naming decision exists for News/Waitlist/Reviews.
   - What's unclear: Whether `news-service`/`waitlist-service`/`reviews-service` (mirroring the existing `auth-service`/`wallet-service`/... naming convention) is assumed-obvious enough to not need a CONTEXT.md decision, or whether the planner should confirm this trivially before scaffolding.
   - Recommendation: Use `news-service`/`waitlist-service`/`reviews-service` (consistent with all 8 existing `apps/*-service` names) — LOW risk, no other convention exists in this codebase to consider.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@nestjs/microservices` | gRPC transport for all 4 new services + 4 new client modules | Yes | `^11.1.19` (backend/package.json) | — |
| `grpc-health-check` | Health protocol implementation | Yes | `^2.1.0` (backend/package.json) | — |
| `@grpc/grpc-js` | Underlying gRPC transport, gRPC status-code enum used in `resilience.service.ts`'s `isTransientError` | Yes | `^1.14.3` (backend/package.json) | — |
| `@iseyaa/proto` generated types for `news`/`waitlist`/`reviews`/`delivery` | `@GrpcMethod` request/response typing in all 4 new `*-grpc.controller.ts` | Yes — `packages/proto/generated/news.ts`, `waitlist.ts`, `reviews.ts`, `delivery.ts` all already exist | 0.1.0 workspace pkg | — (no `generate.sh` re-run needed, proto source files are unchanged this phase) |
| Docker (local build verification) | Each new service's Dockerfile build | Not verified this session (no `docker build` executed against a new service — none exist yet to build) | — | Manual verification recommended during Wave 0/1 before first Railway deploy, per Pitfall 7 |
| Railway CLI/dashboard access | Deploying 4 new Railway services, setting `healthcheckPath`, flipping canary `PlatformConfig` flags via the runbook | Not verified this session (requires operator credentials, out of scope for static research) | — | N/A — this is inherently an operator/deploy-time step, not something research can pre-verify |

**Missing dependencies with no fallback:** None — every library dependency is already installed and verified present in `backend/package.json`.

**Missing dependencies with fallback:** Docker build verification and Railway deploy access are operator-time concerns, not blocking for planning; flagged for the execute-phase/human-verification stage, not this research.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + `ts-jest` (backend), config at `backend/jest.config.js` |
| Config file | `backend/jest.config.js` — `roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../apps']` already scans `apps/*/src/__tests__` for any new service's specs, no config change needed |
| Quick run command | `cd backend && npx jest src/modules/news-client --silent` (per-module, adapt path per new client module) |
| Full suite command | `cd backend && npm test` |

### Phase Requirement → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| GRPC-08 (News) | `NewsClientService.findLatest` returns identical shape to current `NewsService.findLatest`, canary-gated, resilience-wrapped | unit | `npx jest src/modules/news-client/__tests__/news-client.service.spec.ts` | ❌ Wave 0 — new file, mirror `notifications-client.service.spec.ts` structure |
| GRPC-08 (Waitlist) | `WaitlistClientService.join`/`stats` preserve REST shape (stats fan-out per Pitfall 1) | unit | `npx jest src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` | ❌ Wave 0 — new file |
| GRPC-08 (Reviews) | `ReviewsClientService.createReview`/`findByTarget`/`resolveFlag` preserve REST shape (enrichment per Pitfall 2, admin-queue bypass per Pitfall 3) | unit | `npx jest src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` | ❌ Wave 0 — new file |
| GRPC-07 (Delivery OTP) | `DeliveryOtpClientService.verifyOtp` preserves current `BadRequestException` messages for wrong/expired/locked OTP (Pitfall 5), `ServiceUnavailableException` on transport failure | unit | `npx jest src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` | ❌ Wave 0 — new file |
| GRPC-08 (News/Waitlist/Reviews) | Each new gRPC controller's `@GrpcMethod` handlers correctly delegate to the (unmodified) domain service | unit | `npx jest apps/news-service`, `apps/waitlist-service`, `apps/reviews-service` (matches `apps/notifications-service/src/__tests__/` pattern) | ❌ Wave 0 — new files, mirror `health.controller.spec.ts`/`grpc-health.spec.ts` structure |
| GRPC-07 (Delivery OTP) | `delivery-otp-service`'s gRPC controller correctly delegates to `DeliveryService.verifyOtp` | unit | `npx jest apps/delivery-otp-service` | ❌ Wave 0 — new file |
| All | REST-facing controller endpoints (News/Waitlist/Reviews `GET`/`POST`, Delivery `verify-otp` PATCH) still return identical response shapes end-to-end | e2e / manual | No existing e2e suite targets these 4 domains specifically (only `test:e2e:tours` and `test:e2e:settlement-splits` exist) — recommend adding response-shape assertions to whatever manual/smoke QA pass accompanies each staggered rollout step | ❌ Wave 0 gap — no automated e2e coverage exists for News/Waitlist/Reviews/Delivery today, extraction correctness for REST-shape-preservation is currently only verifiable manually or via new unit-level shape assertions |
| Success Criteria #3 (all 4) | Each service's `grpc.health.v1.Health` + HTTP `/healthz` respond correctly before go-live | unit + manual | `npx jest apps/<service>` (mirrors `grpc-health.spec.ts`/`health.controller.spec.ts`) for the code-level check; the Railway `healthcheckPath`-blocks-promotion behavior itself is manual-only per `docs/blue-green-cutover-runbook.md`'s "Known manual-only checks" section (same caveat Phase 20 already documented, applies identically here) | ❌ Wave 0 — 4× new unit spec pairs, mirroring the 2 existing `notifications-service/src/__tests__/*.spec.ts` files exactly |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest <changed-module-path> --silent`
- **Per wave merge:** `cd backend && npm test` (full unit suite — no e2e suite exists for these 4 domains to include)
- **Phase gate:** Full unit suite green + each of the 4 new services' Docker build succeeds locally + Railway health-check-gated deploy succeeds (manual, per runbook) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/news-client/__tests__/news-client.service.spec.ts` — mirror `notifications-client.service.spec.ts` structure exactly
- [ ] `backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts` — plus explicit stats-fan-out assertion (Pitfall 1)
- [ ] `backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts` — plus enrichment assertions (Pitfall 2) and admin-queue-bypass assertions (Pitfall 3)
- [ ] `backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts` — plus business-exception-vs-transport-exception mapping assertions (Pitfall 5)
- [ ] `backend/apps/news-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — copy from `notifications-service` verbatim, adjust service name in test descriptions only
- [ ] `backend/apps/waitlist-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] `backend/apps/reviews-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] `backend/apps/delivery-otp-service/src/__tests__/health.controller.spec.ts` + `grpc-health.spec.ts` — same
- [ ] Framework install: none — Jest/ts-jest already configured and already scans `apps/*/src/__tests__` per `backend/jest.config.js`'s `roots` array

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partial — REST-facing endpoints keep their existing `JwtAuthGuard` (Waitlist `stats`, Reviews `create`/admin endpoints, Delivery `verify-otp` all already guard-protected in the monolith controller layer, unchanged by this extraction) | Existing `JwtAuthGuard`/`RolesGuard` — no new auth surface added; gRPC calls between monolith and new services are internal Railway-network calls with no independent auth layer, matching `notifications-service`'s existing (unauthenticated-at-the-gRPC-layer) precedent |
| V3 Session Management | No | Not applicable — gRPC internal service calls carry no session; REST session/JWT handling is unchanged, stays entirely in the monolith |
| V4 Access Control | Yes — `RolesGuard`/`@Roles()` on Waitlist `stats` (`SUPER_ADMIN`/`STATE_ADMIN`), Reviews admin endpoints (`LGA_ADMIN+`), Delivery `verify-otp` (`DRIVER`) | Unchanged — these guards live in the monolith's REST controller layer and are NOT bypassed by this extraction (the new gRPC services trust the monolith as their sole caller, same as `notifications-service` today) |
| V5 Input Validation | Yes | `class-validator` DTOs (`JoinWaitlistDto`, `CreateReviewDto`, `ResolveFlagDto`, `VerifyDeliveryOtpDto`) stay validated at the monolith's REST boundary (global `ValidationPipe`) BEFORE the gRPC call is made — the gRPC layer itself has no independent validation, matching existing precedent; do not skip DTO validation on the assumption gRPC "validates" anything |
| V6 Cryptography | No new concern | OTP generation/storage (Redis `delivery:otp:*` keys, 300s TTL) is unchanged by this extraction — same Redis instance, same key scheme, just read/written from a different process |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Internal gRPC call spoofing (a compromised process on the same Railway private network calling `delivery-otp-service` directly, bypassing the monolith's `RolesGuard`) | Spoofing / Elevation of Privilege | Not newly introduced by this phase (identical exposure already exists for `notifications-service`) — Railway's private networking is the only boundary; no mTLS/service-to-service auth exists in this codebase today. Out of scope to add in this phase (not named in CONTEXT.md/REQUIREMENTS.md); worth flagging as a pre-existing, not phase-introduced, gap |
| OTP brute-force via direct `delivery-otp-service` calls, bypassing the monolith's rate limiting (`@nestjs/throttler`, 100 req/60s, applied at the HTTP/REST layer only) | Tampering | `DeliveryService.verifyOtp`'s existing 5-attempt Redis-counter lockout (`delivery:otp:attempts:{orderId}`) is INSIDE the domain service, not the REST layer — it survives the extraction unchanged since it moves with the service, not left behind at the monolith boundary. Confirmed no additional exposure — `[VERIFIED: delivery.service.ts:493-499]` |
| PII/secret leakage in gRPC error logs | Information Disclosure | Existing `notifications-client.service.ts` pattern (`logger.error(err?.message ?? err)`, never the full error object) must be replicated in all 4 new client facades — do not log full gRPC error objects (may carry request payloads) |

## Sources

### Primary (HIGH confidence — all direct file reads this session, no external lookup needed)
- `backend/apps/notifications-service/{src/main.ts, src/app.module.ts, src/health.controller.ts, src/notifications-grpc.controller.ts, railway.toml, Dockerfile}` — the full reference implementation, read in full
- `backend/src/modules/notifications-client/{notifications-client.service.ts, notifications-client.module.ts, __tests__/notifications-client.service.spec.ts}` — the full reference facade + test pattern, read in full
- `backend/src/modules/{news,waitlist,reviews,delivery}/*.{controller,service,module}.ts` and DTO files — all 4 target domain modules, read in full
- `packages/proto/{news,waitlist,reviews,delivery,notifications}.proto` — all target proto contracts, read in full
- `backend/src/resilience/{resilience.service.ts, resilience.types.ts}` — vendor policy registration mechanism, read in full
- `backend/{package.json, nest-cli.json}`, root `package.json`, `.env.example`, `docker-compose.yml` — build/deploy config, relevant sections read
- `docs/blue-green-cutover-runbook.md` — the existing rollout runbook this phase must extend, read in full
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/{20-CONTEXT.md, 20-PATTERNS.md}` — the prior phase's locked decisions and pattern map, read in full
- `.planning/phases/21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive/21-CONTEXT.md` — this phase's locked user decisions, read in full
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — read in full (STATE.md's phase-status prose found stale relative to actual git/file state — see State of the Art)

### Secondary (MEDIUM confidence)
- NestJS `@GrpcMethod` default exception-to-gRPC-status mapping behavior (Pitfall 5, Assumption A2) — based on general NestJS microservices knowledge, not verified against a live gRPC call in this specific repo/version this session; flagged for planner verification

### Tertiary (LOW confidence)
- None used — this research relied entirely on direct repository reads (Context7/WebSearch were not needed; the entire pattern to replicate already exists as working code in this repo)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency already installed and verified present via direct `package.json` reads, zero new libraries needed
- Architecture: HIGH — the pattern to replicate is live, working code in this exact repository (`notifications-service` + `notifications-client`), not external/training-data knowledge
- Pitfalls: HIGH for infra/config pitfalls (7); MEDIUM for the proto/REST shape-reconciliation pitfalls (1-4) since the *existence* of each mismatch is verified by direct proto-file + service-code comparison, but the *recommended resolution* for each is a research judgment call, not a locked CONTEXT.md decision — flagged via Open Questions 1-2

**Research date:** 2026-07-20
**Valid until:** Proto files and the `notifications-service`/`notifications-client` reference pattern are stable, internal-only artifacts unlikely to change on their own — this research stays valid for the duration of Phase 21's planning and execution (no external dependency with its own release cadence). Re-verify only if Phase 20's runbook or canary-flag mechanics are modified before Phase 21 executes.
