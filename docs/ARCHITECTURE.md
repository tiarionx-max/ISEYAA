<!-- generated-by: gsd-doc-writer -->
# ISEYAA Architecture

## System Overview

ISEYAA is Ogun State Government's unified digital super-platform for transport, tourism,
events, accommodation, commerce, delivery, and government services, consumed through an
iOS/Android app (React Native + Expo) and a Next.js web admin dashboard, backed by a
NestJS API and an in-app wallet.

The backend is a monorepo undergoing an incremental **strangler-fig migration from a
NestJS monolith to gRPC microservices**. Most domain modules (auth, wallet, events, stays,
marketplace, transport, delivery, admin, AI, etc.) still live and run inside a single
`backend` NestJS application. Five domains — **notifications, news, waitlist, reviews, and
delivery-otp** — have been extracted into standalone gRPC microservices
(`backend/apps/<name>-service`) that the monolith calls through thin `*-client` facade
modules. Each facade is protected by a shared circuit-breaker/retry/timeout layer
(`ResilienceService`, built on `cockatiel`) and a Postgres-backed canary kill-switch, so a
struggling or unreachable microservice degrades to a `ServiceUnavailableException` instead
of taking the monolith down with it. A further seven domains (`auth`, `wallet`, `events`,
`stays`, `marketplace`, `admin`, `ai`) already have scaffolded gRPC apps under
`backend/apps/` with generated proto contracts, but are not yet wired into
`docker-compose.yml` or called via client facades — they represent the next extraction
wave rather than services live in production traffic today.

All extracted and monolith services currently share one PostgreSQL 16 database and one
Redis 7 instance; a Kafka producer/consumer wrapper (`KafkaService`) exists for future
async event-driven communication between services but is a no-op until `KAFKA_BROKER_URL`
is configured.

## Component Diagram

```text
                         ┌───────────────────────────┐
                         │   Mobile (Expo/RN, iOS+    │
                         │   Android) — expo-router   │
                         └─────────────┬─────────────┘
                                        │  REST /api/v1/*
                         ┌─────────────▼─────────────┐
                         │   Web (Next.js App Router) │
                         │   NextAuth + TanStack Query│
                         └─────────────┬─────────────┘
                                        │  REST /api/v1/*
┌───────────────────────────────────────▼──────────────────────────────────────┐
│                        backend — NestJS monolith (port 3001)                  │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ Feature modules: auth, users, lgas, tourism, tour-guides,             │    │
│  │ tour-packages, tour-bookings, reviews-admin, events, stays,           │    │
│  │ transport, delivery, marketplace, studio, wallet, admin,              │    │
│  │ settlement-disputes, ministry, ai, webhooks, news-admin, search       │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ *-client facades: notifications-client, news-client, waitlist-client, │    │
│  │ reviews-client, delivery-otp-client  →  ResilienceService (circuit    │    │
│  │ breaker/retry/timeout) + PlatformConfig canary flag  →  gRPC call     │    │
│  └───────────────┬──────────────────┬───────────────┬──────────┬────────┘    │
└──────────────────┼──────────────────┼───────────────┼──────────┼─────────────┘
                    │ gRPC :5008       │ gRPC :5009    │ gRPC     │ gRPC
                    ▼                  ▼               ▼:5010,5011▼:5012
        ┌───────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌────────────────┐
        │ notifications-svc  │ │  news-service │ │ waitlist-svc │ │reviews-svc /    │
        │ (backend/apps/...) │ │               │ │              │ │delivery-otp-svc │
        └─────────┬──────────┘ └───────┬───────┘ └──────┬───────┘ └────────┬────────┘
                   │                   │                │                  │
                   └───────────────────┴────────┬───────┴──────────────────┘
                                                  ▼
                                   ┌───────────────────────────┐
                                   │ PostgreSQL 16 (shared DB)  │
                                   │ Redis 7 (OTP/blacklist)    │
                                   └───────────────────────────┘

  backend/apps/{auth,wallet,events,stays,marketplace,admin,ai}-service
  (scaffolded gRPC apps — proto contracts generated, not yet deployed
   or called from a *-client facade; next extraction wave)
```

`packages/proto` is the shared contract package: `.proto` files per domain, compiled to
generated TypeScript clients/interfaces under `packages/proto/generated`, and consumed by
both the monolith's `*-client` modules and each microservice's gRPC controller via the
`@iseyaa/proto` workspace import.

## Data Flow

**Primary REST request (citizen app or web dashboard):**
1. Mobile/web client sends `GET/POST /api/v1/*` with a JWT bearer token.
2. `backend/src/main.ts` bootstraps a single Express-backed NestJS app: `helmet` →
   `compression` → CORS allow-list → global `ValidationPipe` (`whitelist: true,
   forbidNonWhitelisted: true`) → `/api/v1` global prefix.
3. `JwtAuthGuard`/`RolesGuard` validate the token and role before the controller runs.
4. The controller delegates to its module's service, which reads/writes PostgreSQL via
   `PrismaService` and may call shared global services (`PaystackService`, `S3Service`,
   `SendgridService` (email sent via the Resend SDK), `QrService`, `ImageService` from `CommonModule`).

**Extracted-domain request (e.g., push notification, latest news, waitlist join):**
1. A feature module (e.g., `NotificationsClientModule`) calls its `*-client` service
   instead of talking to Prisma/an external vendor directly.
2. The client service checks a `PlatformConfig` canary flag
   (`grpc.<service>_service.canary_enabled`) — any value other than an explicit stored
   `false` means "enabled." A disabled flag short-circuits to
   `ServiceUnavailableException` without attempting the gRPC call.
3. If enabled, the call is wrapped in `ResilienceService.execute(vendor, fn)`, which runs
   a per-vendor `cockatiel` policy (timeout → retry with exponential backoff → circuit
   breaker), built once per vendor at process startup from `RESILIENCE_DEFAULTS` merged
   with any `PlatformConfig` overrides. gRPC status codes `UNAVAILABLE`,
   `DEADLINE_EXCEEDED`, and `RESOURCE_EXHAUSTED` are treated as transient and retried;
   everything else is not.
4. The gRPC call is dispatched over the internal Docker/Railway network to the target
   microservice (e.g., `notifications-service:5008`), which handles it with its own
   `@GrpcMethod()` controller and its own connection to the same shared Postgres/Redis.
5. On breaker-open, timeout exhaustion, or any non-transient failure, the client service
   logs a scrubbed error summary (never headers/tokens/payloads) and throws
   `ServiceUnavailableException` back to the calling module — degrading gracefully rather
   than propagating a raw gRPC error to the HTTP response.

**Payment & webhook flow:**
1. Paystack/Flutterwave POSTs a signed webhook to `WebhooksModule`.
2. `WebhooksService` verifies the signature and emits an internal domain event via
   `EventEmitter2` (e.g., `payment.ticket_purchase`, `payment.stay_booking`).
3. The owning feature service (Events, Stays, Marketplace, Studio) has an `@OnEvent()`
   handler that completes the domain transaction (mark ticket paid, release escrow,
   credit wallet) under a `SELECT FOR UPDATE` lock where wallet balances are mutated.
4. The handler responds `{ received: true }` regardless of downstream outcome, per
   standard webhook-ack convention; failures are logged, not surfaced to the vendor.

**OTP phone verification flow:**
1. `AuthModule` requests an OTP; the code and a lock counter are stored in Redis
   (`otp:{phone}`, `otp_lock:{phone}`) with a 5-minute TTL and a 3-attempt lockout.
2. Delivery is either inline (Termii SMS, guarded by `ResilienceService`'s `termiiAuth`/
   `termiiDelivery` vendor policies) or routed through the extracted `delivery-otp-service`
   for delivery-flow OTPs via `DeliveryOtpClientService`.

## Key Abstractions

- **Feature module** — self-contained `controller → service → DTO` unit per domain, e.g.
  `backend/src/modules/wallet/wallet.module.ts`. Pattern: `@Module({ controllers,
  providers, exports })`.
- **`*-client` facade module** — thin gRPC boundary in front of an extracted
  microservice, e.g. `backend/src/modules/notifications-client/notifications-client.service.ts`,
  `backend/src/modules/news-client/news-client.service.ts`,
  `backend/src/modules/waitlist-client/waitlist-client.service.ts`,
  `backend/src/modules/reviews-client/reviews-client.service.ts`,
  `backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts`. Each exposes
  the exact method surface the monolith previously called locally, so call sites can swap
  imports with a minimal diff.
- **`ResilienceService`** — `backend/src/resilience/resilience.service.ts`. `@Global()`
  singleton that builds one cached `cockatiel` circuit-breaker/retry/timeout policy per
  `Vendor` (Paystack, Termii, Anthropic, S3, FCM, WhatsApp, sendgrid, and each extracted
  service's gRPC channel) at startup from `backend/src/resilience/resilience.types.ts`
  defaults, overridable per key via `platformConfig`.
- **`KafkaService`** — `backend/src/kafka/kafka.service.ts`. Producer/consumer wrapper
  around `kafkajs`; a no-op when `KAFKA_BROKER_URL` is unset, reserved for future
  event-driven inter-service communication beyond the current gRPC request/response model.
- **`PrismaModule` / `CommonModule`** — `@Global()` NestJS modules
  (`backend/src/prisma/prisma.module.ts`, `backend/src/common/common.module.ts`) providing
  the ORM client and shared vendor services (Paystack, S3, `SendgridService`/email (sent via Resend SDK), QR, image
  processing) to every module without re-importing.
- **DTO validation pipeline** — `class-validator` decorators on request DTOs
  (`backend/src/modules/*/dto/*.dto.ts`), enforced by the global `ValidationPipe` in
  `backend/src/main.ts`.
- **`@iseyaa/proto` package** — `packages/proto/`. `.proto` contracts per extracted (and
  scaffolded) service, compiled via `generate.sh` into `packages/proto/generated/`, and
  imported by both the client facade (monolith side) and the `@GrpcMethod()` controller
  (microservice side) so both sides share one generated type contract.
- **Shared types package** — `shared/src/types`, `shared/src/dtos`, `shared/src/constants`.
  Single source of truth for interfaces (`IUser`, `IEvent`, `IWallet`, `ITransaction`),
  enums (`UserRole`, `EventStatus`, `TransactionType`), and constants (`OGUN_LGA_NAMES`,
  `API_PREFIX`), imported by both `web/` and `mobile/` as an npm workspace.

## Directory Structure Rationale

```text
backend/
  src/                        Monolith NestJS app — feature modules, common/prisma/redis,
                               resilience, kafka, search, health
    modules/                  One directory per domain (controller + service + dto);
                               "*-client" suffixed modules are gRPC facades over an
                               extracted microservice, not local business logic
    resilience/                Shared circuit-breaker/retry/timeout policy layer
    kafka/                     Kafka producer/consumer wrapper (currently dormant)
    search/                    Cross-domain search indexer/service/controller
    health/                    /api/v1/health readiness endpoint
  apps/                        NestJS "application" projects (nest-cli.json multi-app
                               monorepo) — one per extracted or scaffolded microservice.
                               Deployed today: notifications-service, news-service,
                               waitlist-service, reviews-service, delivery-otp-service
                               (all in docker-compose.yml). Scaffolded, not yet deployed:
                               auth-service, wallet-service, events-service, stays-service,
                               marketplace-service, admin-service, ai-service
  prisma/                      Single shared Prisma schema used by the monolith and every
                               extracted service (all read/write the same PostgreSQL DB)
packages/proto/                Protobuf contracts (.proto) + generated TS clients, the
                               shared source of truth between monolith clients and
                               microservice gRPC controllers
shared/                        Framework-agnostic TypeScript types/DTOs/constants consumed
                               by both web/ and mobile/ as an npm workspace
web/                            Next.js 14 App Router admin dashboard + citizen web surface
mobile/                         Expo SDK 51 / React Native citizen app (expo-router)
docs/                           Project documentation (this file, runbooks)
docker-compose.yml              Local dev orchestration: postgres, redis, backend, web,
                                 and the five deployed microservices, wired by internal
                                 hostname:port env vars (e.g. NOTIFICATIONS_SERVICE_URL)
railway.toml                    Monolith's Railway deploy config (Wave 1-2); each deployed
                                 microservice under backend/apps/<name>/railway.toml carries
                                 its own Wave-3 deploy config
```
