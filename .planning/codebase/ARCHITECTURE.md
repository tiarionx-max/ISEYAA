<!-- refreshed: 2026-05-12 -->
# Architecture

**Analysis Date:** 2026-05-12

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                │
├──────────────────────┬─────────────────────┬───────────────────────┤
│  Web (Next.js 14)    │  Mobile (Expo 51)   │  Admin (web/admin)    │
│  `web/src/app/`      │  `mobile/app/`      │  `web/src/app/admin/` │
│  NextAuth + TanStack │  expo-router + TQ   │  role-gated page      │
└──────────┬───────────┴──────────┬──────────┴──────────┬────────────┘
           │  axios + JWT Bearer  │                      │
           └──────────────────────┴──────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│              NestJS Modular Monolith  (backend/)                   │
│              Global prefix: /api/v1   Port: 3001                   │
├──────────┬──────────┬──────────┬──────────┬──────────┬────────────┤
│  auth    │  users   │  events  │  stays   │  market  │  wallet    │
│  lgas    │ tourism  │  studio  │  admin   │  notifs  │  ai        │
│  webhooks│          │          │          │          │            │
└──────────┴────┬─────┴──────────┴──────────┴──────────┴────────────┘
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
┌─────────┐ ┌───────┐ ┌──────────────────────────┐
│Prisma   │ │Redis  │ │  CommonModule (Global)    │
│(Postgres│ │(ioredis│ │  PaystackService          │
│ + ORM)  │ │ cache)│ │  S3Service (AWS)          │
│`prisma/ │ │`redis/│ │  SendgridService          │
│schema`  │ │`      │ │  QrService / ImageService │
└────┬────┘ └───────┘ └──────────────────────────┘
     │
     ▼
┌───────────────────┐
│ PostgreSQL         │
│ (DATABASE_URL)    │
└───────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| AppModule | Root NestJS module; imports all feature modules | `backend/src/app.module.ts` |
| PrismaModule | Global `@Global()` ORM client for PostgreSQL | `backend/src/prisma/prisma.module.ts` |
| CommonModule | Global `@Global()` shared services (Paystack, S3, Sendgrid, QR, Image) | `backend/src/common/common.module.ts` |
| RedisModule | ioredis wrapper; OTP store, JWT blacklist, token rotation | `backend/src/redis/redis.service.ts` |
| AuthModule | JWT login/register/OTP/refresh/logout; Passport + JwtStrategy | `backend/src/modules/auth/auth.module.ts` |
| UsersModule | User profiles, KYC fields (NIN/BVN), role management | `backend/src/modules/users/users.module.ts` |
| LgasModule | 20 Ogun State LGA records; attractions read-only API | `backend/src/modules/lgas/lgas.module.ts` |
| TourismModule | Attractions CRUD; category/LGA filtering | `backend/src/modules/tourism/tourism.module.ts` |
| EventsModule | Event CRUD + approval workflow; ticket purchase + QR | `backend/src/modules/events/events.module.ts` |
| StaysModule | Property listings + Booking (escrow lifecycle) | `backend/src/modules/stays/stays.module.ts` |
| MarketplaceModule | Vendor onboarding; product catalogue; order lifecycle | `backend/src/modules/marketplace/marketplace.module.ts` |
| StudioModule | Studio space listings; booking/payment flow | `backend/src/modules/studio/studio.module.ts` |
| WalletModule | Balance, KYC tiers, Paystack top-up, credit/debit ledger | `backend/src/modules/wallet/wallet.module.ts` |
| AdminModule | Dashboard KPIs, revenue analytics, approval queues | `backend/src/modules/admin/admin.module.ts` |
| NotificationsModule | FCM push via Firebase; token registration | `backend/src/modules/notifications/notifications.module.ts` |
| AiModule | Claude Sonnet streaming chat; itinerary generator; LGA intel | `backend/src/modules/ai/ai.module.ts` |
| WebhooksModule | Paystack + Flutterwave webhook ingestion → EventEmitter2 dispatch | `backend/src/modules/webhooks/webhooks.module.ts` |
| Web App | Next.js 14 App Router; NextAuth sessions; TanStack Query | `web/src/` |
| Mobile App | Expo SDK 51 + expo-router; AsyncStorage offline cache | `mobile/app/` |
| Shared Package | TypeScript interfaces, enums, constants, DTOs shared across clients | `shared/src/` |

## Pattern Overview

**Overall:** NestJS Modular Monolith + Next.js App Router + Expo Mobile (monorepo)

**Key Characteristics:**
- Each backend feature is a self-contained NestJS module: `controller → service → prisma`
- `PrismaModule` and `CommonModule` are `@Global()` — injected everywhere without re-importing
- Payment flows use Paystack; webhook events are dispatched via `EventEmitter2` to `@OnEvent()` handlers within feature services
- Authentication uses short-lived JWT access tokens (15 min) + long-lived refresh tokens (30 days); refresh tokens are blacklisted in Redis on rotation/logout
- OTP-based phone verification uses Redis with 5-minute TTL and brute-force lockout (3 attempts → 15-minute lock)
- All clients communicate exclusively through `GET/POST /api/v1/*` REST endpoints
- `shared/` is an npm workspace package consumed by both `web/` and `mobile/` for type safety

## Layers

**HTTP Layer (Controllers):**
- Purpose: Route HTTP requests, validate with DTOs, delegate to services
- Location: `backend/src/modules/*/[name].controller.ts`
- Contains: `@Get`, `@Post`, `@Patch`, `@Delete` handlers; `@UseGuards`, `@Roles` decorators; Swagger `@ApiTags`
- Depends on: Service layer, Guards, Decorators
- Used by: NestJS HTTP adapter (Express)

**Business Logic Layer (Services):**
- Purpose: Domain logic, data access, external service calls
- Location: `backend/src/modules/*/[name].service.ts`
- Contains: Prisma queries, Paystack/S3/Sendgrid calls, `@OnEvent()` webhook handlers
- Depends on: PrismaService, CommonModule services (global), RedisService, ConfigService
- Used by: Controllers, other services via module exports

**Data Access Layer (Prisma):**
- Purpose: Single ORM gateway to PostgreSQL
- Location: `backend/src/prisma/prisma.service.ts`, `backend/prisma/schema.prisma`
- Contains: `PrismaService extends PrismaClient`; schema with all models
- Depends on: `DATABASE_URL` env var
- Used by: All feature services

**Cross-Cutting Infrastructure (CommonModule):**
- Purpose: Shared infrastructure services available everywhere without re-importing
- Location: `backend/src/common/`
- Contains: `PaystackService`, `S3Service`, `SendgridService`, `QrService`, `ImageService`; `RolesGuard`, `@Roles`, `@CurrentUser` decorators; `UserRole` enum
- Depends on: ConfigService, external APIs
- Used by: Any module (global export)

**Redis Layer:**
- Purpose: Ephemeral key/value store for OTP state, JWT blacklist, session tokens
- Location: `backend/src/redis/redis.service.ts`
- Key patterns: `otp:{phone}`, `otp_lock:{phone}`, `blacklist:{jti}`
- Depends on: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` env vars
- Used by: AuthService

**Web Frontend (Next.js 14 App Router):**
- Purpose: Public-facing web app, citizen dashboard, admin panel
- Location: `web/src/`
- Pattern: All pages are `'use client'`; data fetched via TanStack Query using `fetcher()` from `web/src/lib/api.ts`; auth via NextAuth with `CredentialsProvider` backed by backend `/auth/login`
- Depends on: Backend API, `NEXT_PUBLIC_API_URL`, `NEXTAUTH_SECRET`
- Used by: End users via browser

**Mobile Frontend (Expo SDK 51):**
- Purpose: iOS/Android citizen app with offline-first attractions browsing
- Location: `mobile/app/`, `mobile/lib/`
- Pattern: expo-router file-based navigation; TanStack Query for server state; `expo-secure-store` for JWT; `AsyncStorage` for offline cache (1-hour TTL) and bookmarks
- Depends on: Backend API, `EXPO_PUBLIC_API_URL`

**Shared Package:**
- Purpose: Single source of truth for TypeScript types, enums, constants, and DTOs
- Location: `shared/src/`
- Contains: `IUser`, `IEvent`, `IWallet`, `ITransaction`, `ILGA` interfaces; `UserRole`, `EventStatus`, `TransactionType`, `PaymentGateway` enums; `OGUN_LGA_NAMES`, `API_PREFIX` constants
- Used by: `web/`, `mobile/` (as npm workspace)

## Data Flow

### Primary Request Path (Authenticated REST)

1. Client sends `Authorization: Bearer <accessToken>` to `GET/POST /api/v1/{resource}` (`web/src/lib/api.ts:8-13`, `mobile/lib/api.ts:8-11`)
2. NestJS `JwtAuthGuard` → `JwtStrategy.validate()` extracts `{ userId, role, jti }` into `req.user` (`backend/src/modules/auth/strategies/jwt.strategy.ts`)
3. `RolesGuard` checks `@Roles(...)` decorator on controller method (`backend/src/common/guards/roles.guard.ts`)
4. Controller handler calls service method with `@CurrentUser()` userId
5. Service queries PostgreSQL via `PrismaService`, calls external APIs if needed
6. JSON response returned; TanStack Query caches on client

### Payment & Webhook Flow

1. Service calls `PaystackService.initiatePayment()` → returns `authorizationUrl` to client (`backend/src/common/services/paystack.service.ts`)
2. User completes payment on Paystack-hosted page
3. Paystack POSTs to `POST /api/v1/webhooks/paystack` with HMAC-SHA512 signature
4. `WebhooksService.handlePaystack()` verifies signature, routes by `metadata.type` (`backend/src/modules/webhooks/webhooks.service.ts:17-63`)
5. For ticket/stay/order/studio payments: `eventEmitter.emit('payment.{type}', payload)` dispatched to `@OnEvent()` handler in the owning feature service
6. For wallet top-up: `WalletService.creditWallet()` called directly within WebhooksService

### OTP Phone Verification Flow

1. `POST /api/v1/auth/otp/send` → Redis stores `otp:{phone}` with 5-min TTL; Termii SMS sent if `TERMII_API_KEY` set
2. `POST /api/v1/auth/otp/verify` → Redis validated; on success, `user.status` set to `ACTIVE` in PostgreSQL
3. Lock applied in Redis (`otp_lock:{phone}`, 15-min TTL) after 3 failed attempts

### AI Itinerary Flow (SSE)

1. `POST /api/v1/ai/itinerary` with `{ startLgaSlug, durationDays, interests, budgetNgn, partySize }`
2. `AiService.streamItinerary()` fetches LGA, attractions, events, stays from Prisma
3. Builds structured context prompt; calls Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) via streaming
4. Emits SSE events: `status` → `delta` (text chunks) → `itinerary` (parsed JSON) → `done`

**State Management:**
- Backend: Stateless HTTP; ephemeral state in Redis (OTP, JWT blacklist)
- Web: TanStack Query (`staleTime: 30s`); NextAuth JWT session in cookie
- Mobile: TanStack Query (`staleTime: 60s`); AsyncStorage offline cache (1-hour TTL); `expo-secure-store` for access token

## Key Abstractions

**NestJS Module:**
- Purpose: Encapsulate a domain feature (controller + service + DTOs)
- Examples: `backend/src/modules/auth/auth.module.ts`, `backend/src/modules/wallet/wallet.module.ts`
- Pattern: `@Module({ controllers, providers, exports })` — export service if other modules need to call it

**Global Module:**
- Purpose: Provide infrastructure services without per-module imports
- Examples: `backend/src/prisma/prisma.module.ts` (`@Global()`), `backend/src/common/common.module.ts` (`@Global()`)
- Pattern: Decorated with `@Global()` and imported once in `AppModule`

**DTO (Data Transfer Object):**
- Purpose: Request validation and type enforcement at the HTTP boundary
- Examples: `backend/src/modules/auth/dto/register.dto.ts`, `backend/src/modules/events/dto/create-event.dto.ts`
- Pattern: `class-validator` decorators on class properties; `ValidationPipe` (global, `whitelist: true, forbidNonWhitelisted: true`) strips unknown fields

**EventEmitter2 Domain Event:**
- Purpose: Decouple webhook ingestion from feature business logic
- Examples: `payment.ticket_purchase`, `payment.stay_booking`, `payment.order_payment`, `payment.studio_booking`
- Pattern: `WebhooksService` emits → feature service has `@OnEvent('payment.{type}')` handler

**Shared Interfaces:**
- Purpose: Eliminate type drift between backend responses and client consumers
- Examples: `IUser`, `IEvent`, `IWallet`, `ITransaction` in `shared/src/types/index.ts`
- Pattern: Backend generates response shape; shared package declares matching interface; clients import from `shared`

## Entry Points

**Backend API Server:**
- Location: `backend/src/main.ts`
- Triggers: `npm run dev:backend` → NestJS bootstrap
- Responsibilities: Creates NestJS app with rawBody (for webhooks), applies helmet/compression/CORS/ValidationPipe, sets global prefix `/api/v1`, configures Swagger at `/api/docs`, listens on PORT (default 3001)

**Web App:**
- Location: `web/src/app/layout.tsx` (root layout), `web/src/app/page.tsx` (landing page)
- Triggers: `npm run dev:web` → Next.js dev server
- Responsibilities: Wraps all pages with `SessionProvider` + `QueryClientProvider` + `Toaster`

**Web NextAuth API Route:**
- Location: `web/src/app/api/auth/[...nextauth]/` (route handler using `web/src/lib/auth.ts`)
- Responsibilities: Handles NextAuth credential login, JWT callbacks, session hydration with `accessToken` and `role`

**Mobile App:**
- Location: `mobile/app/_layout.tsx`
- Triggers: `npx expo start`
- Responsibilities: Wraps Stack navigator with `GestureHandlerRootView` + `QueryClientProvider`; defines screen options (forest/gold theme); registers modal routes (`qr-checkin`, event/stay detail screens)

**Prisma Schema:**
- Location: `backend/prisma/schema.prisma`
- Triggers: `npm run prisma:migrate` / `prisma:generate`
- Responsibilities: Defines all PostgreSQL models, enums, and relations

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. No worker threads. Async I/O only — never block the loop with synchronous CPU work.
- **Global state:** `PrismaService` and `CommonModule` services are module-level singletons (NestJS IoC). `RedisService` holds a single ioredis client instance. No other global mutable state.
- **Circular imports:** No known circular dependency chains between modules. `WebhooksModule` imports `WalletModule` — the only explicit cross-module service dependency.
- **EventEmitter coupling:** `WebhooksService` dispatches domain events that must be handled by feature services. Adding a new payment type requires: (1) new `metadata.type` case in `WebhooksService`, (2) `@OnEvent()` handler in the target feature service.
- **JWT token storage (web):** Access token stored in NextAuth JWT cookie, not in-memory or localStorage. Refresh token sent via POST body on rotation — never in Authorization header.
- **JWT token storage (mobile):** Access token stored in `expo-secure-store` (hardware-backed secure enclave on iOS/Android).
- **NDPA compliance constraint:** User registration requires `ndpaConsent: true` — enforced in `AuthService.register()` at line 54. This is a legal requirement (Nigerian Data Protection Act).

## Anti-Patterns

### Direct cross-module service calls (except via exports)

**What happens:** `WebhooksService` directly calls `WalletService.creditWallet()` for wallet top-ups instead of emitting an event.
**Why it's wrong:** Creates tight coupling between `WebhooksModule` and `WalletModule`; bypasses the event-driven pattern used for all other payment types.
**Do this instead:** Emit `'payment.wallet_topup'` event and handle it in `WalletService` with `@OnEvent('payment.wallet_topup')`, matching the pattern at `backend/src/modules/webhooks/webhooks.service.ts:48`.

### Inline SQL in service via `$queryRaw`

**What happens:** `AdminService.getRevenue()` uses `this.prisma.$queryRaw` with template literals for LGA revenue breakdown.
**Why it's wrong:** Bypasses Prisma type safety; query is not validated at compile time; harder to maintain.
**Do this instead:** Use Prisma `groupBy` or `aggregate` with explicit `select` when possible. Reserve `$queryRaw` only for queries Prisma cannot express.

### `any` type casts on shared data

**What happens:** Multiple web/mobile pages use `any` for API responses (e.g., `tickets.map((t: any) => ...)` in `web/src/app/dashboard/page.tsx:209`).
**Why it's wrong:** Eliminates the value of the `shared/` package's typed interfaces; type errors can reach production silently.
**Do this instead:** Import the matching interface from `shared` (e.g., `IEvent`, `ITransaction`) and type the `useQuery` generic: `useQuery<ITransaction[]>(...)`.

## Error Handling

**Strategy:** Throw NestJS built-in HTTP exceptions from service layer; global `ValidationPipe` handles DTO validation errors automatically.

**Patterns:**
- Services throw `NotFoundException`, `ConflictException`, `BadRequestException`, `ForbiddenException`, `UnauthorizedException` — NestJS converts these to correct HTTP status codes
- External service failures (Paystack, S3, Termii, FCM) are caught, logged via `Logger`, and either rethrown or degraded gracefully (e.g., Termii stub logs OTP to console when `TERMII_API_KEY` is absent)
- Audit log failures are swallowed silently (`catch (err) { this.logger.error(...) }`) to prevent auth flows from failing on non-critical logging
- Webhook handlers return `{ received: true }` on success regardless of processing outcome (standard webhook pattern)

## Cross-Cutting Concerns

**Logging:** `Logger` from `@nestjs/common` used in every service. Instance created as `private readonly logger = new Logger(ServiceName.name)`. No centralized log aggregation configured.

**Validation:** Global `ValidationPipe` with `{ whitelist: true, transform: true, forbidNonWhitelisted: true }` applied in `backend/src/main.ts:21-23`. All request bodies validated via class-validator DTOs.

**Authentication:** Passport JWT strategy (`ExtractJwt.fromAuthHeaderAsBearerToken()`). Protected routes use `@UseGuards(JwtAuthGuard)`. Role-based access uses `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.SUPER_ADMIN)`.

**Rate Limiting:** `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` applies globally — 100 requests per 60 seconds per IP. Defined in `backend/src/app.module.ts:5-8`.

**Security Hardening:** `helmet()` and `compression()` middleware applied at bootstrap (`backend/src/main.ts:14-15`). CORS origin whitelist from `ALLOWED_ORIGINS` env var.

---

*Architecture analysis: 2026-05-12*
