# Iṣẹ́yáá — Ogun State Digital Super-Platform

> The unified digital platform for all 20 LGAs of Ogun State. Tourism, events, stays, marketplace, studio booking, wallet, and government services in a single system.

## Architecture

```
ISEYAA/
├── backend/          NestJS monolith (TypeScript, Prisma, PostgreSQL 16, Redis) + gRPC microservices in backend/apps/
├── web/              Next.js 14 frontend (App Router, Tailwind, Framer Motion)
├── mobile/           Expo SDK 51 React Native app
├── shared/           TypeScript types/DTOs/constants shared by web + mobile (npm workspace)
├── packages/proto/   Shared gRPC/protobuf definitions (npm workspace)
├── docs/             Runbooks (e.g. blue-green-cutover-runbook.md)
├── monitoring/       Observability configuration
└── load-tests/       Load/performance test scripts
```

`backend/src/` is a NestJS monolith that still serves most domains in-process: auth, wallet, events, stays, marketplace, studio, admin, ai, tourism, transport, delivery, users, settlement-disputes, ministry, lgas, webhooks. `backend/apps/` additionally contains 12 independently-buildable/deployable gRPC microservice scaffolds, each with its own `railway.toml` + `Dockerfile`. Of those 12, only 5 are actually live-wired into local dev today via `docker-compose.yml` and called from the monolith over gRPC through thin client modules (`notifications-client`, `news-client`, `waitlist-client`, `reviews-client`, `delivery-otp-client`): `notifications-service`, `news-service`, `waitlist-service`, `reviews-service`, and `delivery-otp-service` (the last scoped to the single `VerifyDeliveryOtp` RPC — the rest of the delivery flow stays in-process). The other 7 (`admin-service`, `ai-service`, `auth-service`, `events-service`, `marketplace-service`, `stays-service`, `wallet-service`) are Railway-deployable scaffolds for future extraction — their domains are still served entirely in-process by the monolith today, not "extracted". See `docs/blue-green-cutover-runbook.md` for the blue-green canary cutover process used when shifting live traffic to a newly-extracted service.

## Prerequisites

- Node.js 20 LTS
- PostgreSQL 16
- Redis 7
- Cloudflare R2 (or AWS S3 — `S3Service` auto-detects based on which env vars are set)
- Paystack account
- SendGrid account
- Docker + Docker Compose (recommended — boots Postgres, Redis, backend, web, and the 5 live-wired gRPC services together; see `docker-compose.yml`)

## Local Setup

### 1. Clone and install

```bash
git clone <repo>
cd ISEYAA
npm install
```

Root `package.json` declares npm workspaces (`backend`, `web`, `mobile`, `shared`, `packages/proto`), so a single `npm install` from the repo root installs every workspace. To install a single workspace only, use `npm install --workspace=<name>` (e.g. `npm install --workspace=backend`).

### 2. Environment variables

The backend (and Docker Compose) reads a single root `.env` file — copy it from `.env.example`, not `backend/.env`:

```bash
cp .env.example .env
```

`ConfigModule` in `backend/src/app.module.ts` resolves `envFilePath` to the repo root, and every service in `docker-compose.yml` uses `env_file: .env` (repo root).

**`.env`** (repo root — grouped below by section; see `.env.example` for the full list)
```env
# Application
APP_ENV=development
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/iseyaa"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="change-me-in-production"
JWT_REFRESH_SECRET="change-me-in-production"

# Payments — Paystack (primary) / Flutterwave (fallback)
PAYSTACK_SECRET_KEY="sk_test_..."
PAYSTACK_PUBLIC_KEY="pk_test_..."
PAYSTACK_WEBHOOK_SECRET="whsec_..."
FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-..."

# Messaging
SENDGRID_API_KEY="SG...."
SENDGRID_FROM_EMAIL="noreply@iseyaa.gov.ng"
TERMII_API_KEY="TL..."
TERMII_SENDER_ID="ISEYAA"

# Maps
GOOGLE_MAPS_API_KEY="AIza..."

# AI
ANTHROPIC_API_KEY="sk-ant-..."

# Object storage — Cloudflare R2 (primary; replaces AWS S3 + CloudFront, zero egress fees)
CF_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="iseyaa-media"
R2_PUBLIC_URL="https://cdn.iseyaa.gov.ng"
# — or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET / AWS_CLOUDFRONT_URL / AWS_REGION
#   instead; S3Service auto-detects AWS mode whenever AWS_ACCESS_KEY_ID is set

# Search
TYPESENSE_HOST=localhost
TYPESENSE_API_KEY="..."
TYPESENSE_PROTOCOL=http
TYPESENSE_PORT=8108

# Push
FIREBASE_SERVER_KEY="AAAA..."

# gRPC service URLs — only these 5 are consumed today (docker-compose service names in dev);
# the other *_SERVICE_URL vars in .env.example are unused placeholders for future extractions
NOTIFICATIONS_SERVICE_URL="notifications-service:5008"
NEWS_SERVICE_URL="news-service:5009"
WAITLIST_SERVICE_URL="waitlist-service:5010"
REVIEWS_SERVICE_URL="reviews-service:5011"
DELIVERY_OTP_SERVICE_URL="delivery-otp-service:5012"

# Observability
SENTRY_DSN="..."
OTEL_EXPORTER_OTLP_ENDPOINT="..."
OTEL_SERVICE_NAME="iseyaa-api"

NODE_ENV="development"
```

**`web/.env.local`**
```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-in-production"
```

**`mobile/.env`**
```env
EXPO_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### 3. Database setup

```bash
cd backend
npx prisma db push          # creates all tables (idempotent)
npx prisma db seed          # optional: seed LGAs + test data
```

### 4. Start services

```bash
# Terminal 1 — Backend API
cd backend && npm run start:dev

# Terminal 2 — Web frontend
cd web && npm run dev

# Terminal 3 — Mobile (needs Expo Go on phone or emulator)
cd mobile && npm start
```

- Backend: http://localhost:3001
- Swagger UI: http://localhost:3001/api/docs
- Web: http://localhost:3000
- Mobile: scan QR with Expo Go

Recommended: `docker-compose up -d` from the repo root instead of running the backend manually — it also boots the 5 live-wired gRPC services (`notifications-service`, `news-service`, `waitlist-service`, `reviews-service`, `delivery-otp-service`) that the monolith calls over gRPC. Running `npm run start:dev` on its own, without those 5 services running, means any code path touching notifications, news, waitlist, reviews, or delivery-OTP verification will fail to reach its gRPC dependency.

## API Overview

All routes are prefixed with `/api/v1`.

| Module | Key Routes |
|--------|-----------|
| Auth | `POST /auth/register` `POST /auth/login` |
| Tourism | `GET /tourism/lgas` `GET /tourism/attractions` |
| Events | `GET /events` `POST /events` `POST /events/:id/tickets` |
| Tickets | `POST /tickets/:qr_hash/checkin` |
| Stays | `GET /stays/properties` `POST /stays/properties/:id/bookings` |
| Marketplace | `GET /marketplace/products` `POST /marketplace/orders` |
| Studio | `GET /studio/slots` `POST /studio/bookings` `GET /studio/feed` |
| Wallet | `GET /wallet/balance` `GET /wallet/transactions` `POST /wallet/topup` |
| Admin | `GET /admin/dashboard` `GET /admin/revenue` |
| Webhooks | `POST /webhooks/paystack` |
| Delivery | `POST /delivery/orders` `POST /delivery/orders/:id/verify-otp` `PATCH /delivery/orders/:id/complete` |
| Notifications | `GET /notifications` `POST /notifications/register-token` `POST /notifications/send` |
| Waitlist | `POST /waitlist` `GET /waitlist/stats` |
| News | `GET /news` |
| Reviews | `POST /reviews` `GET /reviews` `GET /admin/reviews/queue` |
| AI | `POST /ai/chat` `POST /ai/itinerary` `POST /ai/lga-intel` |

Full OpenAPI spec: http://localhost:3001/api/docs (Swagger UI)

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `SELECT FOR UPDATE` via `prisma.$transaction + $queryRaw` | Prevents concurrent double-bookings in stays and studio modules |
| `EventEmitter2` for payment events | Decouples WebhooksService from feature modules — no circular imports |
| `rawBody: true` in NestFactory | Required for Paystack HMAC-SHA512 webhook signature verification |
| `prisma db push` over `migrate dev` | Non-interactive Windows environment; `migrate dev` requires a TTY |
| CBN KYC tiers in wallet | Regulatory compliance: Tier 1 (phone) = ₦50K/day, Tier 2 (NIN/BVN) = ₦500K/day |
| Platform fee from `platform_config` table | Fee % is never hardcoded — ops team can update via admin panel without deployment |
| `@Global()` CommonModule | PaystackService, S3Service, SendgridService, QrService, ImageService provided once |
| Framer Motion page transitions | Consistent animated entry for all Next.js pages |
| AsyncStorage for offline cache | Attractions and bookmarks survive network loss on mobile |

## Running Tests

```bash
cd backend && npm test              # 70 test suites (npx jest --listTests to recount)
cd backend && npm run test:cov      # coverage report — run for current pass/fail totals
```

## Deployment Checklist

This is a multi-target Railway deployment, not a single monolith deploy: `railway.toml` (repo root) deploys the monolith, `web/railway.toml` deploys the web app, and each `backend/apps/<service>/railway.toml` deploys that gRPC service independently. See `docs/blue-green-cutover-runbook.md` for the blue-green cutover process used when shifting live traffic to a newly-extracted gRPC service (notifications, news, waitlist, reviews, delivery-otp), including the `grpc.<service>_service.canary_enabled` `platformConfig` kill-switches.

- [ ] Set `NODE_ENV=production` on every deployed target (monolith, web, and each live gRPC service)
- [ ] Set all secrets (JWT_SECRET, JWT_REFRESH_SECRET, PAYSTACK_*, R2_*/AWS_*, SENDGRID_*) in environment
- [ ] Set `NEXTAUTH_SECRET` to a 32+ char random string
- [ ] Run `npx prisma db push` against production DB
- [ ] Configure Paystack webhook URL: `https://api.iseyaa.gov.ng/api/v1/webhooks/paystack`
- [ ] Set Paystack `PAYSTACK_WEBHOOK_SECRET` to match your Paystack dashboard secret
- [ ] Configure storage bucket CORS policy for frontend uploads (R2 bucket, or S3 bucket if running in AWS mode)
- [ ] Set `R2_PUBLIC_URL` + `R2_BUCKET` (or `AWS_CLOUDFRONT_URL` + `AWS_S3_BUCKET` if running in AWS mode) per `S3Service`'s dual-mode env var reads
- [ ] Enable Redis persistence (`appendonly yes`) for cron job state
- [ ] Set up DB backups (pg_dump daily minimum)
- [ ] Configure rate limiting on `/auth` routes in nginx/API gateway
- [ ] Confirm each live-wired gRPC service's `grpc.<service>_service.canary_enabled` `platformConfig` flag before cutting traffic to it

## Module Reference

gRPC-client-only wrapper modules (`notifications-client`, `news-client`, `waitlist-client`, `reviews-client`, `delivery-otp-client`) are not documented separately below — they are thin proxies to the extracted services described in the [Architecture](#architecture) section, not standalone business-logic modules.

### EventsModule
- `ORGANISER` role creates and manages events
- Ticket purchase → Paystack → `charge.success` webhook → QR PNG → S3 → SendGrid email
- HMAC-SHA512 webhook verification before any processing
- Check-in: `POST /tickets/:qr_hash/checkin` → `VALID` | `ALREADY_USED` | `NOT_FOUND`
- Event cover images resized to 1200×630 JPEG 85% via Sharp

### StaysModule
- `HOST` role CRUD for properties
- 90-day availability calendar via `SELECT FOR UPDATE` transaction
- Escrow: host payout held until 24h after check-in (`@Cron(EVERY_HOUR)`)
- Reviews: unlocked 24h after check-out, rating 1–5

### MarketplaceModule
- Vendors apply → `LGA_ADMIN`/`SUPER_ADMIN` approve
- Fee split read from `platform_config` key `PLATFORM_FEE_PCT` (never hardcoded)
- Order lifecycle: `PENDING → PROCESSING → SHIPPED → DELIVERED`
- Email notifications to buyer + vendor on every status transition

### StudioModule
- Government priority slots: visible to `LGA_ADMIN`/`SUPER_ADMIN` only
- Booking uses `SELECT FOR UPDATE` row lock to prevent double-booking
- Confirmed booking triggers prep checklist email (5 items) via SendGrid
- Creative uploads: audio (mp3/wav/aac/flac) + video (mp4/mov/avi/webm) up to 500MB
- Published content feeds back via `GET /studio/feed`

### WalletModule
- CBN KYC Tier 1 (phone): ₦50,000/day; Tier 2 (NIN/BVN): ₦500,000/day
- Topup via Paystack; webhook credits wallet + creates Transaction record
- Cursor-paginated transaction history with type/module/date filters
- Escrow balance = sum of CONFIRMED stays not yet released

### AdminModule
- Dashboard: total_users, DAU, total_revenue, active_events, pending_approvals, wallet_GTV
- Revenue breakdown: govt_levy by LGA, by vendor category, by month
- User/vendor/property/studio-slot management
- Platform config CRUD (including PLATFORM_FEE_PCT)

### DeliveryModule
- Riders apply via `createDeliveryRider`; `LGA_ADMIN` approves before they can go online
- Fee estimate read from `platformConfig` (`delivery_base_fee`, `delivery_platform_fee_pct`) — never hardcoded
- OTP-gated handoff: `POST /delivery/orders/:id/verify-otp` is served by the extracted `delivery-otp-service` via `DeliveryOtpClientService` (gRPC), gated by a `grpc.delivery_otp_service.canary_enabled` kill-switch; `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` stay in-process
- Completion settles rider earnings + government levy through the shared `SettlementService.resolveSplit('delivery', fee)`, with a deterministic `ISY-DLV-<orderId>` idempotency reference
- `@Cron(EVERY_30_SECONDS)` clears stale rider heartbeats

### NotificationsModule
- FCM HTTP v1 push via a Google service-account JWT (`FIREBASE_SERVICE_ACCOUNT_JSON`); logs a warning and no-ops if not configured
- `POST /notifications/register-token` stores the device's FCM token on the user's `metadata` JSON field
- `GET /notifications` currently returns an empty list — no `Notification` persistence model exists yet in the Prisma schema

### WaitlistModule
- `POST /waitlist` upserts by `(source, email)` or `(source, phone)` — re-submitting with extra info refreshes phone/fullName without duplicating the entry
- Requires at least one of email or phone
- `GET /waitlist/stats` returns signup counts grouped by `source`

### NewsModule
- `GET /news` returns live, non-deleted `NewsItem` rows ordered by `isPriority` then `publishedAt`, optionally filtered by `category`
- Read-only — no create/update endpoints exposed yet

### ReviewsModule
- `POST /reviews` auto-flags any review with `rating <= 2`, creating the review and its `AdminReviewFlag` row in one transaction
- Public reads (`GET /reviews`, per-target routes) exclude flagged reviews
- `LGA_ADMIN`+ moderation queue: `GET /admin/reviews/queue`, `GET /admin/reviews/flags/:id`, `POST /admin/reviews/flags/:id/resolve` (OPEN/IN_REVIEW → RESOLVED or DISMISSED; 409 if already terminal)

### AiModule
- `POST /ai/chat` streams Claude (`claude-sonnet-4-20250514`) responses via SSE, with tool-calling against attractions, events, stays, ride estimates, and weather
- `POST /ai/itinerary` streams a multi-day itinerary grounded in real attractions/events/stays for the requested LGA(s)
- `POST /ai/lga-intel` answers ad-hoc questions about a specific LGA
- All Anthropic calls are wrapped in `ResilienceService.execute('anthropic', ...)` for circuit-breaking/retries
