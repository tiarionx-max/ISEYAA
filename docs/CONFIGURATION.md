<!-- generated-by: gsd-doc-writer -->
# Configuration

ISEYAA is configured entirely through environment variables. The canonical list lives in
[`.env.example`](../.env.example) at the repository root. Copy it to `.env` for local
development — Docker Compose and the NestJS backend both read from that file.

```bash
cp .env.example .env
```

## Environment variables

The backend loads variables via `@nestjs/config`'s `ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '..', '.env') })`
(`backend/src/app.module.ts`). Web reads `NEXT_PUBLIC_*` variables through Next.js's built-in env
support, and mobile reads `EXPO_PUBLIC_*` variables bundled at build time by Expo.

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ENV` | Optional | `development` | Sentry environment tag and Infisical environment slug used by `backend/Dockerfile` |
| `NODE_ENV` | Optional | unset (dev) | Standard Node environment flag; `production` disables Swagger docs in `backend/src/main.ts` |
| `PORT` | Optional | `3001` | Backend HTTP port (`ConfigService.get('PORT', 3001)` in `backend/src/main.ts`) |
| `ALLOWED_ORIGINS` | Optional | `http://localhost:3000,http://localhost:19006` | Comma-separated CORS allow-list (`backend/src/main.ts`) |
| `DATABASE_URL` | **Required** | — | PostgreSQL connection string (Prisma `datasource db`, `backend/prisma/schema.prisma`). Startup fails without it (`backend/start.sh`, `backend/src/main.ts`) |
| `DIRECT_URL` | Optional | falls back to `DATABASE_URL` | Unpooled Postgres connection used only by `prisma migrate deploy` (bypasses Neon's pooler); `backend/start.sh` exports `DIRECT_URL=$DATABASE_URL` if absent |
| `REDIS_URL` | Optional | — | Redis connection string (`backend/src/redis/redis.service.ts`) for OTP state, JWT blacklist, caching |
| `JWT_SECRET` | **Required** | — | Access token signing secret; startup fails without it |
| `JWT_REFRESH_SECRET` | **Required** | — | Refresh token signing secret; startup fails without it |
| `PAYSTACK_SECRET_KEY` | Required for payments | — | Paystack API secret key (primary payment gateway) |
| `PAYSTACK_PUBLIC_KEY` | Required for payments | — | Paystack public key |
| `PAYSTACK_WEBHOOK_SECRET` | Required for payments | — | HMAC-SHA512 secret to verify Paystack webhook signatures |
| `FLUTTERWAVE_SECRET_KEY` | Optional | — | Flutterwave fallback payment gateway key |
| `SENDGRID_API_KEY` | Optional | — | Legacy SendGrid key; superseded by `RESEND_API_KEY` |
| `SENDGRID_FROM_EMAIL` | Optional | — | Legacy SendGrid sender address |
| `RESEND_API_KEY` | Required for transactional email | — | Resend API key — replaces `SENDGRID_API_KEY` as of the SendGrid-to-Resend migration; `SendgridService` internals now call the Resend SDK |
| `SENDCHAMP_API_KEY` | Optional | stub mode | OTP SMS delivery via Sendchamp (replaces Termii/Twilio/Meta WhatsApp — all rejected/blocked, 260728). If absent, OTPs are logged to the console instead of sent (stub mode). WHATSAPP-channel requests are also delivered via this SMS path — Sendchamp's WhatsApp channel needs a separately-approved message template not yet set up |
| `SENDCHAMP_SENDER_NAME` | Optional | `Sendchamp` | Sendchamp SMS sender name — must be a registered alphanumeric sender ID once one exists; defaults to the literal string `Sendchamp` until then |
| `GOOGLE_MAPS_API_KEY` | Required for maps | — | Google Maps integration (mobile); consumed by `mobile/app.json`, `mobile/android/app/build.gradle`, and `AndroidManifest.xml` — not referenced under `web/` |
| `ANTHROPIC_API_KEY` | Required for AI features | — | Claude API key (`@anthropic-ai/sdk`) for streaming chat and itinerary generation |
| `CF_ACCOUNT_ID` | Required for R2 mode | — | Cloudflare account ID; used to build the R2 S3-compatible endpoint |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Required for R2 mode | — | Cloudflare R2 credentials (`backend/src/common/services/s3.service.ts`) |
| `R2_BUCKET` | Optional | `iseyaa-media` | R2 bucket name |
| `R2_PUBLIC_URL` | Optional | — | Public CDN URL prefix for R2 objects |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Required for AWS S3 mode | — | AWS credentials; if set, `S3Service` uses AWS S3 instead of R2 |
| `AWS_S3_BUCKET` | Optional | `iseyaa-media` | S3 bucket name (AWS mode) |
| `AWS_REGION` | Optional | `af-south-1` | S3 region (AWS mode) |
| `AWS_CLOUDFRONT_URL` | Optional | — | CloudFront CDN base URL for media (AWS mode) |
| `TYPESENSE_HOST` | Optional | `localhost` | Typesense search server host |
| `TYPESENSE_API_KEY` | Optional | — | Typesense search API key |
| `TYPESENSE_PROTOCOL` | Optional | `http` | Typesense connection protocol |
| `TYPESENSE_PORT` | Optional | `8108` | Typesense server port |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Required for push | — | Firebase service account JSON read by `notifications.service.ts` for FCM push notifications; `FIREBASE_SERVER_KEY` in `.env.example` is a stale/unused legacy entry not referenced anywhere in `backend/` |
| `AUTH_SERVICE_URL` | Optional | placeholder | gRPC endpoint for the extracted `auth-service` (Wave 3 microservices split) |
| `WALLET_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `wallet-service` |
| `EVENTS_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `events-service` |
| `STAYS_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `stays-service` |
| `MARKETPLACE_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `marketplace-service` |
| `ADMIN_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `admin-service` |
| `AI_SERVICE_URL` | Optional | placeholder | gRPC endpoint for `ai-service` |
| `NOTIFICATIONS_SERVICE_URL` | Optional | `localhost:5008` | gRPC endpoint actively consumed by `NotificationsClientModule` (`backend/src/modules/notifications-client/notifications-client.module.ts`); resolves to `notifications-service:5008` via Docker Compose DNS in local dev |
| `NEWS_SERVICE_URL` | Optional | — | gRPC endpoint actively consumed by `NewsClientModule` (`backend/src/modules/news-client/news-client.module.ts`) to register a live gRPC client — not a placeholder |
| `WAITLIST_SERVICE_URL` | Optional | — | gRPC endpoint actively consumed by `WaitlistClientModule` (`backend/src/modules/waitlist-client/waitlist-client.module.ts`) — not a placeholder |
| `REVIEWS_SERVICE_URL` | Optional | — | gRPC endpoint actively consumed by `ReviewsClientModule` (`backend/src/modules/reviews-client/reviews-client.module.ts`) — not a placeholder |
| `DELIVERY_OTP_SERVICE_URL` | Optional | — | gRPC endpoint actively consumed by `DeliveryOtpClientModule` (`backend/src/modules/delivery-otp-client/delivery-otp-client.module.ts`) — not a placeholder |
| `SENTRY_DSN` | Optional | — | Sentry DSN for backend error tracking (`backend/src/main.ts`, `@sentry/nestjs`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional | `''` | Sentry DSN for mobile crash reporting (`mobile/app/_layout.tsx`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional | — | OpenTelemetry OTLP endpoint (Grafana Cloud) |
| `GRAFANA_CLOUD_OTLP_TOKEN` | Optional | — | Base64-encoded basic auth token for the OTLP exporter |
| `OTEL_SERVICE_NAME` | Optional | `iseyaa-api` | Service name reported to the OTLP collector |
| `ENCRYPTION_KEY` | **Required** | — | AES-256-GCM master key (64 hex chars / 32 bytes) for encrypting NIN/BVN at rest; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` | Optional | — | Upstash Vector (BAAI/bge-m3) for AI personalisation; falls back to no personalisation if absent |
| `DOJAH_API_KEY` / `DOJAH_APP_ID` | Optional | stub mode | Dojah NIN verification; stub mode logs `[DOJAH STUB] ...` if absent |
| `SMILE_IDENTITY_PARTNER_ID` / `SMILE_IDENTITY_API_KEY` | Not referenced in code | — | Listed in `.env.example` for Smile Identity Tier 3 liveness, but `backend/` contains no reference to these variables; `kyc.service.ts`'s `completeLiveness()` is an unconditional MVP stub that completes liveness without checking either variable |
| `EXPO_PUBLIC_API_URL` | Optional | `http://localhost:3001/api/v1` | Backend API base URL bundled into the mobile app at build time (`mobile/lib/api.ts`) |
| `NEXT_PUBLIC_API_URL` | Optional | `http://localhost:3001/api/v1` | Backend API base URL for the web app (`web/src/lib/api.ts`, `web/src/lib/auth.ts`) |
| `NEXTAUTH_SECRET` | Required for production | `iseyaa-dev-secret` (dev fallback) | NextAuth session signing secret (`web/src/lib/auth.ts`) |
| `INFISICAL_TOKEN` / `INFISICAL_PROJECT_ID` | Optional | — | Secrets manager credentials; if both are set, `backend/Dockerfile`'s startup command wraps `start.sh` with `infisical run` instead of reading Railway env vars directly |

## Config file format

Beyond environment variables, ISEYAA uses a small number of declarative config files:

- **`backend/prisma/schema.prisma`** — Prisma `datasource db` block declares `url = env("DATABASE_URL")`
  and `directUrl = env("DIRECT_URL")`. All PostgreSQL models, enums, and relations live here.
- **`docker-compose.yml`** — Local development stack: `postgres` (16-alpine), `redis` (7-alpine, 256MB
  `maxmemory`, `allkeys-lru`), `backend`, `web`, and five extracted microservices
  (`notifications-service`, `news-service`, `waitlist-service`, `reviews-service`, `delivery-otp-service`).
  Compose overrides `DATABASE_URL`, `REDIS_URL`, and the `*_SERVICE_URL` gRPC endpoints to use Docker's
  internal service-name DNS instead of the `localhost` values in `.env`.
- **`railway.toml`** (repo root) — Monolith deployment config: builds `backend/Dockerfile` from the repo
  root context, starts via `/app/backend/start.sh`, health-checks `GET /api/v1/health`.
- **`backend/apps/<service>/railway.toml`** — Per-microservice Railway deploy config for each extracted
  gRPC service (`auth-service`, `wallet-service`, `events-service`, `stays-service`,
  `marketplace-service`, `admin-service`, `ai-service`, `notifications-service`, `news-service`,
  `waitlist-service`, `reviews-service`, `delivery-otp-service`). Each declares its own
  `dockerfilePath` and `watchPaths` so Railway only redeploys a service when its own source changes.
- **`mobile/app.json`** — Expo config; `extra.eas.projectId` and `owner` fields are EAS Build metadata,
  not runtime configuration.

## Required vs optional settings

`backend/src/main.ts` performs an explicit startup check before the app boots:

```ts
const missing = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].filter(k => !config.get<string>(k));
if (missing.length) {
  console.error(`FATAL: missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
```

`backend/start.sh` (the container entrypoint) performs the same check earlier, before running Prisma
migrations, so a misconfigured deploy fails fast with a clear error rather than partially starting:

```sh
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Set it in Railway → service → Variables." >&2
  exit 1
fi
```

`ENCRYPTION_KEY` is also effectively required in production — KYC encryption of NIN/BVN
(AES-256-GCM) depends on it, though it is not part of the `main.ts` fail-fast list.

Everything else degrades gracefully rather than blocking startup:

- **Stub mode** — `SENDCHAMP_API_KEY`, `DOJAH_API_KEY`, and `UPSTASH_VECTOR_*`
  each fall back to a stub/no-op path (OTPs logged to console, AI personalisation
  skipped) when absent. Acceptable for local development, not for production. Tier 3 liveness
  (`completeLiveness()` in `kyc.service.ts`) is an unconditional MVP stub regardless of env vars —
  `SMILE_IDENTITY_PARTNER_ID` / `SMILE_IDENTITY_API_KEY` have no effect on it.
- **Storage auto-detection** — `S3Service` (`backend/src/common/services/s3.service.ts`) checks
  `AWS_ACCESS_KEY_ID` first, then `R2_ACCESS_KEY_ID`; if neither is set it logs a warning and throws a
  clean error only when an upload is actually attempted, rather than failing at startup.

## Defaults

Defaults are set inline at the point of use via `ConfigService.get(key, defaultValue)` rather than in a
central config schema:

| Variable | Default | Set in |
|---|---|---|
| `PORT` | `3001` | `backend/src/main.ts` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:19006` | `backend/src/main.ts` |
| `APP_ENV` | `development` | `backend/src/main.ts` (Sentry `environment`) |
| `AWS_S3_BUCKET` / `R2_BUCKET` | `iseyaa-media` | `backend/src/common/services/s3.service.ts` |
| `AWS_REGION` | `af-south-1` | `backend/src/common/services/s3.service.ts` |
| `SENDCHAMP_SENDER_NAME` | `Sendchamp` | `.env.example` |
| `TYPESENSE_HOST` / `TYPESENSE_PROTOCOL` / `TYPESENSE_PORT` | `localhost` / `http` / `8108` | `.env.example` |
| `OTEL_SERVICE_NAME` | `iseyaa-api` | `.env.example` |
| `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | `web/src/lib/api.ts`, `mobile/lib/api.ts` |
| `NEXTAUTH_SECRET` | `iseyaa-dev-secret` | `web/src/lib/auth.ts` (development fallback only — must be overridden in production) |
| `DIRECT_URL` | value of `DATABASE_URL` | `backend/start.sh` |

## Per-environment overrides

There are no `.env.development` / `.env.production` files in the repository — only `.env.example`.
Per-environment configuration is handled by the deployment target instead:

- **Local development** — `.env` (git-ignored, copied from `.env.example`) is read by the NestJS backend
  directly and injected into Docker Compose containers via `env_file: .env`. `docker-compose.yml`
  additionally overrides `DATABASE_URL`, `REDIS_URL`, and the microservice `*_SERVICE_URL` values so
  containers resolve each other by Compose service name instead of `localhost`.
- **Production (Railway)** <!-- VERIFY: confirm current Railway project/service names and whether Infisical is actively wired for this deployment --> —
  environment variables are set directly in each Railway service's Variables panel, or supplied through
  Infisical (`INFISICAL_TOKEN` + `INFISICAL_PROJECT_ID`) if configured. `backend/Dockerfile`'s CMD checks
  for both Infisical variables at container start: if present, it runs
  `infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- start.sh`; otherwise it
  runs `start.sh` directly against whatever variables Railway injected. The `.env.example` file documents
  production-only values inline as commented examples near the bottom (live Paystack keys, the Neon
  pooled/unpooled `DATABASE_URL` variants, and the production `ALLOWED_ORIGINS` list).
- **Database connection pooling (production)** — the monolith backend and `notifications-service` read the
  same `DATABASE_URL` variable name but are given distinct pooled connection strings sized per the
  comments in `.env.example` (monolith `connection_limit=20`, `notifications-service`
  `connection_limit=5`), against a Neon `-pooler` endpoint. `DIRECT_URL` is shared, unpooled, and used
  only for `prisma migrate deploy`.
- **Test** — Jest test suites (`backend/**/__tests__/*.spec.ts`) mock external services and do not read
  the real `.env` file for most unit tests; no dedicated `.env.test` exists in the repository.

<!-- VERIFY: exact production values for ALLOWED_ORIGINS, EXPO_PUBLIC_API_URL, Neon endpoint hostnames, and Railway service URLs should be confirmed against the live Railway/Neon dashboards rather than the commented placeholders in .env.example -->
