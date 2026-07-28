# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**AI / LLM:**
- Anthropic Claude — Streaming chat assistant, AI trip-itinerary generator, LGA intelligence briefs
  - SDK/Client: `@anthropic-ai/sdk` 0.52.x
  - Model: `claude-sonnet-4-20250514`
  - Auth: `ANTHROPIC_API_KEY`
  - Implementation: `backend/src/modules/ai/ai.service.ts`
  - Endpoints: `POST /api/v1/ai/chat` (SSE stream), `POST /api/v1/ai/itinerary` (SSE stream), `GET /api/v1/ai/lga/:id/intelligence`

**Maps:**
- Google Maps — Interactive map embeds in web frontend
  - SDK/Client: `@googlemaps/react-wrapper` 1.2.x (web)
  - Auth: `GOOGLE_MAPS_API_KEY`

**SMS / OTP:**
- Sendchamp — Phone number OTP verification for citizen onboarding (replaces Termii/Twilio/Meta WhatsApp — all rejected/blocked, 260728)
  - SDK/Client: Native `fetch` call to `https://api.sendchamp.com/api/v1/sms/send`
  - Auth: `SENDCHAMP_API_KEY` (Bearer token)
  - Sender name: `SENDCHAMP_SENDER_NAME` (default: `Sendchamp`)
  - Implementation: `backend/src/modules/auth/auth.service.ts` (`sendSendchampSms` private method), `backend/src/modules/delivery/delivery.service.ts` (`sendDeliveryOtp` private method)
  - Fallback: If `SENDCHAMP_API_KEY` is absent, OTP is logged as a warning (dev stub). WHATSAPP-channel OTP requests are also delivered via this SMS path — Sendchamp's WhatsApp channel needs a separately-approved message template not yet set up

**Push Notifications:**
- Firebase Cloud Messaging (FCM) — Mobile push notifications for booking/ticket confirmations
  - SDK/Client: Direct HTTP POST to `https://fcm.googleapis.com/fcm/send`
  - Auth: `FIREBASE_SERVER_KEY`
  - Implementation: `backend/src/modules/notifications/notifications.service.ts`
  - FCM tokens stored per-user in `User.metadata.fcmToken` (JSON field)

## Data Storage

**Databases:**
- PostgreSQL 16 — Primary relational database (all domain data)
  - Connection: `DATABASE_URL`
  - Client: Prisma ORM 5.11.x (`@prisma/client`)
  - Schema: `backend/prisma/schema.prisma` (20 models, 15 enums)
  - Migrations: `backend/prisma/migrations/`
  - Seed: `backend/prisma/seed.ts` (invoked via `npm run prisma:migrate`)
  - Dev container: `postgres:16-alpine` via `docker-compose.yml`

**Caching / Session State:**
- Redis 7 — OTP storage, JWT refresh-token blacklist, general caching
  - Connection: `REDIS_HOST` + `REDIS_PORT` (default: `localhost:6379`) or `REDIS_URL`
  - Password: `REDIS_PASSWORD` (optional)
  - Client: `ioredis` 5.3.x
  - Implementation: `backend/src/redis/redis.service.ts` (globally exported `RedisModule`)
  - Key patterns:
    - `otp:<phone>` — 5-minute OTP with attempt counter (`"<otp>:<attempts>"`)
    - `otp_lock:<phone>` — 15-minute lockout after 3 failed attempts
    - `blacklist:<jti>` — Revoked refresh token JTI (TTL = remaining token lifetime)
  - Dev container: `redis:7-alpine` (256MB maxmemory, allkeys-lru) via `docker-compose.yml`

**File Storage:**
- AWS S3 — Media uploads (images, videos, audio, documents)
  - SDK/Client: `@aws-sdk/client-s3` 3.1045.x
  - Auth: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  - Bucket: `AWS_S3_BUCKET` (default: `iseyaa-media-dev`)
  - Region: `AWS_REGION` (default: `af-south-1`)
  - Implementation: `backend/src/common/services/s3.service.ts`
  - CDN: AWS CloudFront — `AWS_CLOUDFRONT_URL` prefixed to returned media URLs
  - Image pipeline: `sharp` (resize to 1200×630, JPEG 85% quality) before S3 upload via `backend/src/common/services/image.service.ts`
  - Media records stored in `MediaContent` Prisma model with `s3Key` and `url` fields

## Authentication & Identity

**Auth Provider:**
- Custom JWT (backend) — Primary auth for all clients
  - Implementation: `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/strategies/jwt.strategy.ts`
  - Access token: 15-minute expiry, signed with `JWT_SECRET`
  - Refresh token: 30-day expiry, signed with `JWT_REFRESH_SECRET`, JTI-based blacklist in Redis
  - Password hashing: bcrypt (12 rounds)
  - Guard: `JwtAuthGuard` + `RolesGuard` (`backend/src/common/guards/`)

- NextAuth (web only) — Session wrapper over backend credentials
  - Provider: `CredentialsProvider` — delegates to `POST /api/v1/auth/login`
  - Session strategy: JWT, 7-day maxAge
  - Auth: `NEXTAUTH_SECRET`
  - Implementation: `web/src/lib/auth.ts`
  - Stores `accessToken` and `role` in NextAuth JWT token, forwarded as `Authorization: Bearer` header

- Expo SecureStore (mobile only) — Encrypted local token storage
  - Plugin: `expo-secure-store` ~13.0.x (declared in `app.json` plugins)

**KYC / Identity Verification:**
- Phone-based OTP (Sendchamp) — Tier-1 KYC, required for wallet funding (daily limit ₦50,000)
- NIN / BVN verification fields — Tier-2 KYC (daily wallet limit ₦500,000); verification logic in `backend/src/modules/wallet/wallet.service.ts`
- NDPA consent — Required at registration (`User.ndpaConsent`, `User.ndpaConsentAt`)

## Payment Gateways

**Primary — Paystack:**
- Purpose: Ticket purchases, stay bookings, marketplace orders, studio bookings, wallet top-ups
- SDK/Client: Direct HTTP via `axios` to `https://api.paystack.co`
- Auth: `PAYSTACK_SECRET_KEY`
- Implementation: `backend/src/common/services/paystack.service.ts`
- Webhook endpoint: `POST /api/v1/webhooks/paystack`
- Webhook secret: `PAYSTACK_WEBHOOK_SECRET` (HMAC-SHA512 verification)
- References: prefixed `ISY-<MODULE>-<UUID12>` pattern
- Metadata types dispatched via `@nestjs/event-emitter`: `ticket_purchase`, `stay_booking`, `order_payment`, `studio_booking`, wallet top-up
- `paystackRef` stored on `Ticket`, `Booking`, `Order`, `StudioBooking`, `Transaction` models

**Fallback — Flutterwave:**
- Purpose: Fallback payment processor (partially implemented)
- Auth: `FLUTTERWAVE_SECRET_KEY`
- Webhook endpoint: `POST /api/v1/webhooks/flutterwave`
- Webhook verification: `verif-hash` header compared to `FLUTTERWAVE_SECRET_KEY`
- Implementation: `backend/src/modules/webhooks/webhooks.service.ts` (`handleFlutterwave`)
- Note: `FLUTTERWAVE` enum value exists in `PaymentGateway` but full payment initiation flow is not yet wired

**Internal Wallet:**
- Purpose: Platform NGN wallet for citizens/vendors (balance, transactions, escrow)
- Implementation: `backend/src/modules/wallet/wallet.service.ts`
- Currency: NGN; wallet created automatically on user registration
- Escrow: Booking `totalPrice` held until `escrowReleasedAt` (host payout model)
- `PaymentGateway.WALLET` and `PaymentGateway.INTERNAL` enum values for internal transfers

## Transactional Email

**SendGrid:**
- Purpose: Booking confirmations, ticket confirmations with QR, studio booking confirmations
- SDK/Client: `@sendgrid/mail` 8.1.6
- Auth: `SENDGRID_API_KEY`
- From address: `SENDGRID_FROM_EMAIL` (default: `noreply@iseyaa.gov.ng`)
- Implementation: `backend/src/common/services/sendgrid.service.ts`
- Template emails (inline HTML, no external template service):
  - `sendTicketConfirmation` — includes QR code image URL
  - `sendBookingConfirmation` — guest and host variants
  - `sendStudioBookingConfirmation` — includes preparation checklist

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry, Datadog, or similar SDK present

**Logs:**
- NestJS built-in `Logger` class — used in all services; writes to stdout
- Audit log: `AuditLog` Prisma model — records user actions (`USER_REGISTERED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`) with IP address, user agent, old/new values

## CI/CD & Deployment

**Hosting:**
- Docker Compose (`docker-compose.yml`) — local dev orchestration for backend + web + postgres + redis
- Backend Docker image: `backend/Dockerfile.dev` (Node 20 Alpine, Prisma generate, `start:dev` entrypoint)
- Dedicated web `Dockerfile.dev` referenced in `docker-compose.yml` but not present in repo
- Production deployment target: not specified (no CI config, Kubernetes manifests, or Fly/Railway/Render config detected)

**CI Pipeline:**
- Not detected — no `.github/workflows/`, `.gitlab-ci.yml`, or similar

## Webhooks & Callbacks

**Incoming:**
- `POST /api/v1/webhooks/paystack` — Paystack `charge.success` events; HMAC-SHA512 signature verified from `x-paystack-signature` header; raw body forwarded for correct HMAC computation (`rawBody: true` on NestFactory)
- `POST /api/v1/webhooks/flutterwave` — Flutterwave `charge.completed` events; `verif-hash` header verified

**Outgoing:**
- Paystack `callback_url` — optional parameter on `initiatePayment` (`backend/src/common/services/paystack.service.ts`); not globally configured
- FCM push — outgoing HTTP to `https://fcm.googleapis.com/fcm/send`
- Sendchamp SMS — outgoing HTTP to `https://api.sendchamp.com/api/v1/sms/send`

## Environment Configuration

**Required env vars (all workspaces):**

| Variable | Consumer | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | backend | Redis connection |
| `JWT_SECRET` | backend | Access token signing |
| `JWT_REFRESH_SECRET` | backend | Refresh token signing |
| `PAYSTACK_SECRET_KEY` | backend | Paystack payment initiation |
| `PAYSTACK_PUBLIC_KEY` | backend/web | Paystack client-side key |
| `PAYSTACK_WEBHOOK_SECRET` | backend | Webhook HMAC verification |
| `FLUTTERWAVE_SECRET_KEY` | backend | Flutterwave webhook verification |
| `ANTHROPIC_API_KEY` | backend | Claude AI calls |
| `AWS_ACCESS_KEY_ID` | backend | S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | backend | S3 uploads |
| `AWS_S3_BUCKET` | backend | Upload bucket name |
| `AWS_REGION` | backend | AWS region |
| `AWS_CLOUDFRONT_URL` | backend | CDN prefix for media URLs |
| `SENDGRID_API_KEY` | backend | Transactional email |
| `SENDGRID_FROM_EMAIL` | backend | Email sender address |
| `SENDCHAMP_API_KEY` | backend | OTP SMS delivery |
| `SENDCHAMP_SENDER_NAME` | backend | SMS sender name |
| `FIREBASE_SERVER_KEY` | backend | FCM push notifications |
| `GOOGLE_MAPS_API_KEY` | web | Google Maps embeds |
| `NEXT_PUBLIC_API_URL` | web | Backend API base URL |
| `NEXTAUTH_SECRET` | web | NextAuth session signing |
| `PORT` | backend | HTTP listen port (default 3001) |
| `ALLOWED_ORIGINS` | backend | CORS allowed origins (comma-separated) |

**Secrets location:**
- Root `.env` — loaded by Docker Compose (`env_file: .env`) and Next.js (`dotenv` auto-loading)
- `backend/.env` — standalone backend development (not version-controlled)
- `.env.example` at repo root — canonical list of all required vars with placeholder values

---

*Integration audit: 2026-05-12*
