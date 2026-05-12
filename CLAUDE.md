<!-- GSD:project-start source:PROJECT.md -->
## Project

**ISEYAA Super Platform**

ISEYAA is Ogun State Government's unified digital super-platform for ~7 million citizens, tourists, and vendors across Nigeria. It consolidates transport, tourism, events, accommodation, commerce, delivery, and government services into a single app — iOS + Android (React Native) + Web Admin (Next.js) — powered by an in-app wallet and real-time government analytics dashboard.

Operated by LJ Entertainment under contract with Ogun State. Confidential government project.

**Core Value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

### Constraints

- **Tech stack**: Node.js 20 LTS + NestJS + TypeScript strict across all services — no runtime changes
- **Mobile**: React Native + Expo SDK 51 — must support iOS + Android simultaneously
- **Payments**: Paystack primary, Flutterwave fallback — CBN-compliant flows only
- **Data residency**: Nigerian citizen PII (BVN, NIN) must be encrypted AES-256-GCM at rest; bcrypt hash for lookup
- **Wallet security**: SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations
- **Platform fee source**: Always from DB (`platformConfig` table), never hardcoded
- **Performance**: P95 < 500ms under 10,000 concurrent users; driver match < 60s; WebSocket GPS < 1s latency
- **App size**: iOS < 40MB, Android < 30MB for App Store submission
- **Compliance**: NDPA (Nigerian Data Protection Act) — right to erasure implemented
- **Cost target**: ~$11/mo MVP infrastructure (free-first stack) vs $600/mo original AWS stack
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.3.x — All four workspaces (backend, web, mobile, shared)
- JavaScript — `seed-demo.js`, `smoke-test.js` in `backend/`; `next.config.js`, `postcss.config.js` in `web/`
## Runtime
- Node.js >=20.0.0 (Node 20 LTS — enforced via `engines` in root `package.json`)
- Docker image `node:20-alpine` for backend container (`backend/Dockerfile.dev`)
- npm >=10.0.0 (enforced via `engines`)
- Workspaces: npm workspaces at root (`package.json` workspaces: `["backend","web","mobile","shared"]`)
- Lockfile: present (`package-lock.json` at root)
## Frameworks
- NestJS 10.3.x (`@nestjs/core`, `@nestjs/common`) — REST API framework, modular DI
- NestJS Swagger 7.3.x (`@nestjs/swagger`) — API documentation at `/api/docs`
- NestJS Throttler 5.1.x (`@nestjs/throttler`) — Rate limiting (100 req / 60s global)
- NestJS Schedule 4.0.x (`@nestjs/schedule`) — Cron/scheduled tasks
- NestJS EventEmitter 2.0.x (`@nestjs/event-emitter`) — Internal domain event bus
- Passport 0.7.x + `passport-jwt` 4.0.x — JWT authentication strategy
- Next.js 14.1.3 — App Router + Pages Router (both present: `src/app/` and `src/pages/`)
- React 18.2.x / ReactDOM 18.2.x
- Expo SDK ~51.0.0 — React Native build toolchain
- React Native 0.74.0
- Expo Router ~3.5.0 — File-based navigation (`main: "expo-router/entry"`)
- React Navigation 6.x (`@react-navigation/native`) — Navigation primitives
- Pure TypeScript library — no runtime framework
- Exports types, DTOs, constants to `backend/` and both client workspaces via `@iseyaa/shared` path alias
- Jest 29.7.x — All workspaces
- ts-jest 29.1.x — TypeScript transformer for backend Jest
- jest-expo ~51.0.0 — Expo-aware Jest preset for mobile
- `@nestjs/testing` 10.3.x — NestJS testing utilities
- `@nestjs/cli` 10.3.x — NestJS build & dev server (`nest build`, `nest start --watch`)
- TypeScript compiler (`tsc`) — Shared library build
- Metro bundler — React Native/Expo bundler (configured via `app.json` `web.bundler: "metro"`)
## Key Dependencies
- `@prisma/client` 5.11.x + `prisma` 5.11.x — ORM and DB migration tool; schema at `backend/prisma/schema.prisma`
- `@nestjs/jwt` 10.2.x + `jsonwebtoken` (transitive) — JWT access tokens (15m) and refresh tokens (30d), blacklisted in Redis
- `ioredis` 5.3.x — Redis client for OTP state, token blacklist, caching (`backend/src/redis/redis.service.ts`)
- `class-validator` 0.14.x + `class-transformer` 0.5.x — DTO validation pipeline (global `ValidationPipe`)
- `@anthropic-ai/sdk` 0.52.x — Anthropic Claude API client (streaming chat + itinerary AI)
- `@aws-sdk/client-s3` 3.1045.x — AWS S3 file uploads (`backend/src/common/services/s3.service.ts`)
- `@sendgrid/mail` 8.1.6 — Transactional email (`backend/src/common/services/sendgrid.service.ts`)
- `@tanstack/react-query` 5.24.x — Server state management (web + mobile)
- `zustand` 4.5.x — Client state management (web + mobile)
- `zod` 3.22.x — Runtime schema validation (web + mobile)
- `next-auth` 4.24.x — Session management for the web app (`web/src/lib/auth.ts`)
- `bcrypt` 5.1.x — Password hashing (12 salt rounds, `backend/src/modules/auth/auth.service.ts`)
- `helmet` 7.1.x — HTTP security headers (`backend/src/main.ts`)
- `compression` 1.7.x — Gzip response compression (`backend/src/main.ts`)
- `sharp` 0.34.x — Image resize/conversion (`backend/src/common/services/image.service.ts`)
- `qrcode` 1.5.x — QR code PNG generation for tickets (`backend/src/common/services/qr.service.ts`)
- `uuid` 9.0.x — UUID v4 generation for references and JTI claims
- `axios` 1.6.x — HTTP client (Paystack, Termii, FCM calls; web/mobile API client)
- `framer-motion` 11.x — Animation library (web)
- `lucide-react` 0.359.x — Icon set (web)
- `recharts` 3.8.x — Charts for admin dashboards (web)
- `react-hook-form` 7.51.x + `@hookform/resolvers` 3.3.x — Form handling (web)
- `sonner` 1.4.x — Toast notifications (web)
- `tailwind-merge` 2.2.x + `clsx` 2.1.x — Conditional Tailwind class merging (web)
- `expo-secure-store` ~13.0.x — Encrypted token storage (mobile)
- `expo-camera` + `expo-barcode-scanner` — QR ticket scanning (mobile)
- `react-native-reanimated` ~3.10.x + `react-native-gesture-handler` ~2.16.x — Native animations/gestures (mobile)
- `@react-native-async-storage/async-storage` 1.23.1 — Key-value storage (mobile)
## Configuration
- Root `.env` loaded by Docker Compose via `env_file: .env`
- Backend reads env via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) in `backend/src/app.module.ts`
- Web reads env via Next.js built-in env support; `NEXT_PUBLIC_API_URL` is the only public var
- Mobile reads env via `expo-constants`
- Example file: `.env.example` at repo root (lists all required vars)
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` / `REDIS_HOST` / `REDIS_PORT` — Redis connection
- `JWT_SECRET` — Access token signing secret
- `JWT_REFRESH_SECRET` — Refresh token signing secret
- `PAYSTACK_SECRET_KEY` — Paystack API key
- `PAYSTACK_WEBHOOK_SECRET` — Webhook HMAC-SHA512 secret
- `FLUTTERWAVE_SECRET_KEY` — Flutterwave fallback key
- `ANTHROPIC_API_KEY` — Claude API key
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET` / `AWS_REGION` — S3 uploads
- `AWS_CLOUDFRONT_URL` — CDN base URL for media
- `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` — Transactional email
- `TERMII_API_KEY` / `TERMII_SENDER_ID` — OTP SMS delivery
- `FIREBASE_SERVER_KEY` — FCM push notifications
- `GOOGLE_MAPS_API_KEY` — Maps integration (web)
- `NEXTAUTH_SECRET` — NextAuth session signing secret
- `backend/tsconfig.json` — CommonJS target, ES2021, `emitDecoratorMetadata: true` (required for NestJS DI)
- `web/tsconfig.json` — Extends Next.js defaults
- `mobile/tsconfig.json` — Expo TypeScript config
- `shared/tsconfig.json` — Strict TypeScript for shared types
- `backend/nest-cli.json` — NestJS CLI project configuration
## Platform Requirements
- Node.js 20 LTS
- npm 10+
- Docker + Docker Compose (for Postgres 16 + Redis 7 containers via `docker-compose.yml`)
- Expo CLI for mobile development
- `prisma migrate dev` run from root via `npm run prisma:migrate`
- Backend: containerised Node.js 20 (Docker, port 3001)
- Web: Next.js server-rendered (port 3000)
- Mobile: Expo EAS Build or bare React Native build pipeline; bundle IDs `ng.gov.ogun.iseyaa` (iOS/Android)
- Database: PostgreSQL 16
- Cache: Redis 7 (256MB maxmemory, allkeys-lru policy)
- Storage: AWS S3 (region `af-south-1` default) + CloudFront CDN
- API prefix: `/api/v1`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- NestJS service files: `<module>.service.ts` (e.g., `auth.service.ts`, `wallet.service.ts`)
- NestJS controller files: `<module>.controller.ts`
- NestJS module files: `<module>.module.ts`
- DTO files: `<action>-<entity>.dto.ts` (e.g., `create-event.dto.ts`, `purchase-ticket.dto.ts`)
- Test files: `<service>.spec.ts` in a `__tests__/` subdirectory (e.g., `backend/src/modules/auth/__tests__/auth.service.spec.ts`)
- Guard spec files: co-located as `<guard>.spec.ts` alongside the guard (e.g., `backend/src/common/guards/roles.guard.spec.ts`)
- Next.js pages: `page.tsx` inside App Router directories (e.g., `web/src/app/events/page.tsx`)
- Expo screens: PascalCase default export in `app/(tabs)/<name>.tsx` (e.g., `mobile/app/(tabs)/events.tsx`)
- Classes and decorators: `PascalCase` (e.g., `AuthService`, `JwtAuthGuard`, `RegisterDto`)
- Functions and methods: `camelCase` (e.g., `createBooking`, `handleTicketPayment`, `slugify`)
- Module-level constants: `SCREAMING_SNAKE_CASE` (e.g., `OTP_TTL`, `KYC_TIER_1_LIMIT`, `REFRESH_TTL_SECONDS`)
- Prisma select projections reused across methods: `SCREAMING_SNAKE_CASE` object literal (e.g., `USER_SELECT` in `auth.service.ts`)
- Test fixture IDs: `SCREAMING_SNAKE_CASE` (e.g., `USER_ID`, `BOOKING_ID`, `PAYSTACK_REF`)
- Enums: `PascalCase` name, `SCREAMING_SNAKE_CASE` members (e.g., `UserRole.CITIZEN`, `UserRole.SUPER_ADMIN`)
- Page components: `PascalCase` default export named after the route (e.g., `EventsPage`, `DashboardPage`)
- Sub-components defined in the same file: `PascalCase` (e.g., `EventCard`, `EventSkeleton`, `EmptyState`)
- Hooks: `camelCase` starting with `use` (standard React convention)
- Wallet top-up: `ISY-FUND-<12-char-uppercase>`
- Ticket purchase: `ISY-TKT-<12-char-uppercase>`
- Stay booking: `ISY-STY-<12-char-uppercase>`
- Order payment: `ISY-ORD-<12-char-uppercase>`
- Escrow release: `ISY-ESC-<8-char-uppercase>`
- Studio booking: `ISY-SBO-<12-char-uppercase>`
## Code Style
- ESLint with `@typescript-eslint/recommended` (`backend/.eslintrc.js`)
- No Prettier config detected — indentation follows 2-space convention throughout
- `@typescript-eslint/explicit-function-return-type`: off (return types omitted on most methods)
- `@typescript-eslint/no-explicit-any`: off (`any` used freely in Prisma filter spreads and DTO casts)
- `@typescript-eslint/interface-name-prefix`: off
- `strict` mode implied by `@typescript-eslint/recommended`
- Decorators enabled (NestJS requires `experimentalDecorators`)
## Import Organization
- Backend: relative paths only (no `@/` alias configured)
- Web: `@/` maps to `web/src/` (`tsconfig.json` `paths`)
- Mobile: relative paths (e.g., `../../lib/api`)
## Error Handling
## Logging
- `logger.warn()` — missing optional config (e.g., `TERMII_API_KEY` not set, stub mode active)
- `logger.error()` — caught exceptions in side-effect handlers, external API failures
- `logger.log()` — successful important business events (e.g., escrow release, wallet credit)
- Normal request/response flow (handled by NestJS interceptors)
- Successful DTO validation
## Comments
- Module-level section dividers using `// ── Section Name ──────────────────────` (seen in `admin.service.ts`, `marketplace.service.ts`, `ai.service.ts`)
- Inline constants explaining magic numbers (e.g., `const OTP_TTL = 300; // 5 minutes`)
- Critical business rules that are non-obvious (e.g., `// SELECT FOR UPDATE prevents concurrent double-bookings` in `stays.service.ts:166`)
- Stub detection comments (e.g., `// Token already invalid — logout is still successful`)
- `// NEVER hardcode` warnings on platform fee configs
## DTO Design
- All request bodies have a corresponding DTO class
- Optional fields use `@IsOptional()` + `?` type modifier
- Enum fields use `@IsEnum` with a human-readable error message
- Phone validation uses `@IsMobilePhone('en-NG')` for Nigerian numbers
## Service Design
## Controller Design
## Frontend (Web) Component Design
- `FOREST = '#1A6B3C'` / `#1a472a`
- `GOLD = '#C8962A'`
- `JUNGLE = '#1C2B2B'`
## Mobile (Expo) Component Design
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Each backend feature is a self-contained NestJS module: `controller → service → prisma`
- `PrismaModule` and `CommonModule` are `@Global()` — injected everywhere without re-importing
- Payment flows use Paystack; webhook events are dispatched via `EventEmitter2` to `@OnEvent()` handlers within feature services
- Authentication uses short-lived JWT access tokens (15 min) + long-lived refresh tokens (30 days); refresh tokens are blacklisted in Redis on rotation/logout
- OTP-based phone verification uses Redis with 5-minute TTL and brute-force lockout (3 attempts → 15-minute lock)
- All clients communicate exclusively through `GET/POST /api/v1/*` REST endpoints
- `shared/` is an npm workspace package consumed by both `web/` and `mobile/` for type safety
## Layers
- Purpose: Route HTTP requests, validate with DTOs, delegate to services
- Location: `backend/src/modules/*/[name].controller.ts`
- Contains: `@Get`, `@Post`, `@Patch`, `@Delete` handlers; `@UseGuards`, `@Roles` decorators; Swagger `@ApiTags`
- Depends on: Service layer, Guards, Decorators
- Used by: NestJS HTTP adapter (Express)
- Purpose: Domain logic, data access, external service calls
- Location: `backend/src/modules/*/[name].service.ts`
- Contains: Prisma queries, Paystack/S3/Sendgrid calls, `@OnEvent()` webhook handlers
- Depends on: PrismaService, CommonModule services (global), RedisService, ConfigService
- Used by: Controllers, other services via module exports
- Purpose: Single ORM gateway to PostgreSQL
- Location: `backend/src/prisma/prisma.service.ts`, `backend/prisma/schema.prisma`
- Contains: `PrismaService extends PrismaClient`; schema with all models
- Depends on: `DATABASE_URL` env var
- Used by: All feature services
- Purpose: Shared infrastructure services available everywhere without re-importing
- Location: `backend/src/common/`
- Contains: `PaystackService`, `S3Service`, `SendgridService`, `QrService`, `ImageService`; `RolesGuard`, `@Roles`, `@CurrentUser` decorators; `UserRole` enum
- Depends on: ConfigService, external APIs
- Used by: Any module (global export)
- Purpose: Ephemeral key/value store for OTP state, JWT blacklist, session tokens
- Location: `backend/src/redis/redis.service.ts`
- Key patterns: `otp:{phone}`, `otp_lock:{phone}`, `blacklist:{jti}`
- Depends on: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` env vars
- Used by: AuthService
- Purpose: Public-facing web app, citizen dashboard, admin panel
- Location: `web/src/`
- Pattern: All pages are `'use client'`; data fetched via TanStack Query using `fetcher()` from `web/src/lib/api.ts`; auth via NextAuth with `CredentialsProvider` backed by backend `/auth/login`
- Depends on: Backend API, `NEXT_PUBLIC_API_URL`, `NEXTAUTH_SECRET`
- Used by: End users via browser
- Purpose: iOS/Android citizen app with offline-first attractions browsing
- Location: `mobile/app/`, `mobile/lib/`
- Pattern: expo-router file-based navigation; TanStack Query for server state; `expo-secure-store` for JWT; `AsyncStorage` for offline cache (1-hour TTL) and bookmarks
- Depends on: Backend API, `EXPO_PUBLIC_API_URL`
- Purpose: Single source of truth for TypeScript types, enums, constants, and DTOs
- Location: `shared/src/`
- Contains: `IUser`, `IEvent`, `IWallet`, `ITransaction`, `ILGA` interfaces; `UserRole`, `EventStatus`, `TransactionType`, `PaymentGateway` enums; `OGUN_LGA_NAMES`, `API_PREFIX` constants
- Used by: `web/`, `mobile/` (as npm workspace)
## Data Flow
### Primary Request Path (Authenticated REST)
### Payment & Webhook Flow
### OTP Phone Verification Flow
### AI Itinerary Flow (SSE)
- Backend: Stateless HTTP; ephemeral state in Redis (OTP, JWT blacklist)
- Web: TanStack Query (`staleTime: 30s`); NextAuth JWT session in cookie
- Mobile: TanStack Query (`staleTime: 60s`); AsyncStorage offline cache (1-hour TTL); `expo-secure-store` for access token
## Key Abstractions
- Purpose: Encapsulate a domain feature (controller + service + DTOs)
- Examples: `backend/src/modules/auth/auth.module.ts`, `backend/src/modules/wallet/wallet.module.ts`
- Pattern: `@Module({ controllers, providers, exports })` — export service if other modules need to call it
- Purpose: Provide infrastructure services without per-module imports
- Examples: `backend/src/prisma/prisma.module.ts` (`@Global()`), `backend/src/common/common.module.ts` (`@Global()`)
- Pattern: Decorated with `@Global()` and imported once in `AppModule`
- Purpose: Request validation and type enforcement at the HTTP boundary
- Examples: `backend/src/modules/auth/dto/register.dto.ts`, `backend/src/modules/events/dto/create-event.dto.ts`
- Pattern: `class-validator` decorators on class properties; `ValidationPipe` (global, `whitelist: true, forbidNonWhitelisted: true`) strips unknown fields
- Purpose: Decouple webhook ingestion from feature business logic
- Examples: `payment.ticket_purchase`, `payment.stay_booking`, `payment.order_payment`, `payment.studio_booking`
- Pattern: `WebhooksService` emits → feature service has `@OnEvent('payment.{type}')` handler
- Purpose: Eliminate type drift between backend responses and client consumers
- Examples: `IUser`, `IEvent`, `IWallet`, `ITransaction` in `shared/src/types/index.ts`
- Pattern: Backend generates response shape; shared package declares matching interface; clients import from `shared`
## Entry Points
- Location: `backend/src/main.ts`
- Triggers: `npm run dev:backend` → NestJS bootstrap
- Responsibilities: Creates NestJS app with rawBody (for webhooks), applies helmet/compression/CORS/ValidationPipe, sets global prefix `/api/v1`, configures Swagger at `/api/docs`, listens on PORT (default 3001)
- Location: `web/src/app/layout.tsx` (root layout), `web/src/app/page.tsx` (landing page)
- Triggers: `npm run dev:web` → Next.js dev server
- Responsibilities: Wraps all pages with `SessionProvider` + `QueryClientProvider` + `Toaster`
- Location: `web/src/app/api/auth/[...nextauth]/` (route handler using `web/src/lib/auth.ts`)
- Responsibilities: Handles NextAuth credential login, JWT callbacks, session hydration with `accessToken` and `role`
- Location: `mobile/app/_layout.tsx`
- Triggers: `npx expo start`
- Responsibilities: Wraps Stack navigator with `GestureHandlerRootView` + `QueryClientProvider`; defines screen options (forest/gold theme); registers modal routes (`qr-checkin`, event/stay detail screens)
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
### Inline SQL in service via `$queryRaw`
### `any` type casts on shared data
## Error Handling
- Services throw `NotFoundException`, `ConflictException`, `BadRequestException`, `ForbiddenException`, `UnauthorizedException` — NestJS converts these to correct HTTP status codes
- External service failures (Paystack, S3, Termii, FCM) are caught, logged via `Logger`, and either rethrown or degraded gracefully (e.g., Termii stub logs OTP to console when `TERMII_API_KEY` is absent)
- Audit log failures are swallowed silently (`catch (err) { this.logger.error(...) }`) to prevent auth flows from failing on non-critical logging
- Webhook handlers return `{ received: true }` on success regardless of processing outcome (standard webhook pattern)
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
