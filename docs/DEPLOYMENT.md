<!-- generated-by: gsd-doc-writer -->
# Deployment

ISEYAA is deployed as **multiple independent Railway services**, not a single monolith
deploy — plus a separately built/submitted Expo mobile app. This doc covers the backend
monolith, the web admin dashboard, the extracted gRPC microservices, the mobile app build
pipeline, rollback, and monitoring. For the full environment variable reference, see
[`docs/CONFIGURATION.md`](./CONFIGURATION.md).

## Deployment targets

| Target | Config file | Platform |
|---|---|---|
| Backend monolith | `railway.toml` (repo root) | Railway — builds `backend/Dockerfile` from the repo root context |
| Web admin dashboard | `web/railway.toml` | Railway — Railpack builder, `npm run build --workspace=@iseyaa/web` |
| Extracted gRPC microservices (live) | `backend/apps/{notifications,news,waitlist,reviews,delivery-otp}-service/railway.toml` | Railway — each builds its own `backend/apps/<service>/Dockerfile` |
| Scaffolded gRPC microservices (not yet deployed) | `backend/apps/{auth,wallet,events,stays,marketplace,admin,ai}-service/railway.toml` | Railway-deployable, but currently unused — their domains still run in-process in the monolith |
| Local development stack | `docker-compose.yml` | Docker Compose — `postgres`, `redis`, `backend`, `web`, and the 5 live microservices |
| Mobile app (iOS/Android) | `mobile/eas.json` | Expo Application Services (EAS) Build + Submit → App Store / Google Play |

Of the 12 microservice scaffolds under `backend/apps/`, only 5 are live-wired into the
monolith today (called via `*-client` gRPC facade modules and present in
`docker-compose.yml`): `notifications-service`, `news-service`, `waitlist-service`,
`reviews-service`, and `delivery-otp-service` (the last is scoped to a single
`VerifyDeliveryOtp` RPC). The remaining 7 — `auth-service`, `wallet-service`,
`events-service`, `stays-service`, `marketplace-service`, `admin-service`, `ai-service` —
have Dockerfiles and `railway.toml` files ready to deploy but are not yet called from the
monolith; their domains are still served entirely in-process. See
[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for the strangler-fig extraction pattern.

Each live-wired extracted service exposes an HTTP `GET /healthz` endpoint (see
`backend/apps/notifications-service/src/health.controller.ts`) alongside its primary gRPC
port, and `railway.toml` sets `healthcheckPath = "/healthz"` with a 60s timeout and
`restartPolicyType = "on_failure"` (3 retries). The monolith's health endpoint is
`GET /api/v1/health` (`backend/src/health/health.controller.ts`, `@nestjs/terminus`),
matching `healthcheckPath` in the root `railway.toml`. The 7 scaffolded-but-undeployed
services' `railway.toml` files do not yet declare a `healthcheckPath`.

## Build pipeline

`.github/workflows/ci.yml` runs on every push and pull request to `main` and
`development`, with three parallel jobs — it validates the codebase but does **not**
itself deploy anything:

1. **Backend — Lint / Test / Build** — spins up ephemeral `postgres:16-alpine` and
   `redis:7-alpine` service containers, runs `npx prisma generate` + `prisma db push
   --force-reset`, `npm run lint`, `npm test`, the `test:e2e:settlement-splits` and
   `test:e2e:tours` suites, then `npm run build`. All third-party API keys are set to the
   literal string `stub` — services degrade gracefully when keys are absent.
2. **Web — Lint / Build** — `npm run lint` and `npm run build` in `web/`.
3. **Mobile — Type-check** — `npm run typecheck` in `mobile/` (no build/publish step).

A second workflow, `.github/workflows/check-no-env.yml`, runs on every push and PR and
fails the build if any `.env` (or `.env.*` other than `.env.example`) file is committed to
git — a guardrail against secret leakage.

<!-- VERIFY: Railway deployment is triggered by its own GitHub integration watching the main branch (per MANUAL-ACTIONS.md Phase 2 instructions), not by a step inside .github/workflows/ci.yml — confirm the current auto-deploy trigger and branch mapping in the Railway dashboard for each service -->

Deployment itself is handled by Railway's git-push-to-deploy integration per service, each
building from its own `railway.toml` `[build]` section:

- Monolith: `dockerfilePath = "backend/Dockerfile"`, `buildContext = "."` (repo root, so
  the `shared/` and `packages/proto` workspaces are available at build time)
- Web: Railpack builder, `buildCommand = "npm run build --workspace=@iseyaa/web"`
- Each microservice: its own `backend/apps/<service>/Dockerfile`, `buildContext = "."`

`backend/Dockerfile` is a multi-stage `node:22-alpine` build that installs the Infisical
CLI, installs `backend` + `packages/proto` workspace dependencies, force-installs a
musl-compatible `sharp` binary for Alpine, runs `prisma generate` and `npm run build`, and
starts via `backend/start.sh`. At container start, if `INFISICAL_TOKEN` and
`INFISICAL_PROJECT_ID` are both set, the CMD wraps `start.sh` with
`infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production}`; otherwise
it runs `start.sh` directly against whatever environment variables Railway injected.

`backend/start.sh` (the container entrypoint) fails fast if `DATABASE_URL`, `JWT_SECRET`,
or `JWT_REFRESH_SECRET` are missing, falls back `DIRECT_URL` to `DATABASE_URL` if unset,
runs `npx prisma migrate deploy`, seeds reference LGA data only if the `LGA` table is
empty, then execs `node --require ./dist/instrumentation.js ./dist/main.js`
(OpenTelemetry instrumentation is loaded before the app boots).

## Environment setup

Every deployed target needs its own environment variables set in that Railway service's
Variables tab (or via Infisical, if `INFISICAL_TOKEN` + `INFISICAL_PROJECT_ID` are
configured for that service). See [`docs/CONFIGURATION.md`](./CONFIGURATION.md) for the
full variable reference, including which are required vs optional and their defaults.

Minimum required for the monolith to boot: `DATABASE_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`. `ENCRYPTION_KEY` (AES-256-GCM, 64 hex chars) is required in practice
for KYC (NIN/BVN encryption) even though it isn't in `main.ts`'s fail-fast list — generate
it with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Production-specific variable changes (per `MANUAL-ACTIONS.md` Phase 7 checklist):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (disables Swagger docs at `/api/docs`, tightens CORS) |
| `ALLOWED_ORIGINS` | Comma-separated production origins, no trailing slash <!-- VERIFY: exact production ALLOWED_ORIGINS list --> |
| `DATABASE_URL` | Neon **production** branch, pooled `-pooler` endpoint <!-- VERIFY: current Neon project/branch names --> |
| `REDIS_URL` | Upstash **production** environment, TLS URL <!-- VERIFY: current Upstash environment name --> |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` | Live (`sk_live_*`) keys, matching the live webhook URL configured in the Paystack dashboard |
| `JWT_SECRET` | Rotated 64-char hex, distinct from staging/dev |
| `ENCRYPTION_KEY` | **Do not rotate** once BVN/NIN data has been encrypted with it, unless ciphertext is migrated first |

After updating variables, verify with:

```bash
curl -s https://<production-api-host>/api/v1/health
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" https://<production-api-host>/api/docs
# Expected: 404 (Swagger disabled in production)

curl -s -H "Origin: https://evil.com" -I https://<production-api-host>/api/v1/health | grep -i access-control
# Expected: no access-control-allow-origin header
```

<!-- VERIFY: the live production API hostname (e.g. an *.up.railway.app domain or custom domain) is not committed to the repository; confirm against the Railway dashboard before using it in scripts or webhook configuration -->

Before go-live, also configure:

- The Paystack webhook URL to `https://<production-api-host>/api/v1/webhooks/paystack`,
  with `PAYSTACK_WEBHOOK_SECRET` matching the dashboard's HMAC-SHA512 signing secret.
- Storage bucket CORS policy for the active storage mode — Cloudflare R2 (`R2_*` vars) or
  AWS S3 (`AWS_*` vars); `S3Service` auto-detects which mode is active based on which
  credential set is present.
- Redis persistence (`appendonly yes`) — already the default in `docker-compose.yml`'s
  local `redis` service command; confirm the same flag is set on the production Redis
  provider for cron job state durability.
- Each live-wired gRPC service's `grpc.<service>_service.canary_enabled` `platformConfig`
  flag, before cutting production traffic to it — see the Blue-green cutover section below.

## Local development stack

`docker-compose.yml` runs the full local stack: `postgres` (16-alpine, healthchecked),
`redis` (7-alpine, `--appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru`,
healthchecked), `backend` (built from `backend/Dockerfile.dev`, port 3001), `web` (built
from `web/Dockerfile.dev`, port 3000), and the 5 live microservices
(`notifications-service` :5008, `news-service` :5009, `waitlist-service` :5010,
`reviews-service` :5011, `delivery-otp-service` :5012). The `backend` service depends on
all 5 microservices plus `postgres`/`redis` being healthy/started before it starts, and
Compose overrides `DATABASE_URL`, `REDIS_URL`, and the `*_SERVICE_URL` variables to use
Docker's internal service-name DNS instead of the `localhost` values in `.env`.

```bash
cp .env.example .env
docker compose up
```

## Mobile app deployment (EAS Build)

The mobile app is built and submitted independently of the backend/web Railway
deployments, via Expo Application Services. `mobile/eas.json` defines three build
profiles:

| Profile | Distribution | Android build type | Notes |
|---|---|---|---|
| `development` | internal | APK | `developmentClient: true`; fastest path to install on a physical device without App Store review |
| `preview` | internal | APK | Same API URL as production; used for internal QA |
| `production` | store | App Bundle (AAB) | Submitted to the App Store / Play Store |

All three profiles point `EXPO_PUBLIC_API_URL` at
`https://iseyaabackend-production.up.railway.app/api/v1`
<!-- VERIFY: confirm this is still the correct production backend URL bundled into mobile builds --> ,
baked into the JS bundle at build time (not read from a runtime `.env` on-device).

```bash
npm install -g eas-cli
eas login
cd mobile
eas init                      # prints your EAS project ID

npm run build:dev:android     # fastest — no Apple account needed
npm run build:dev:ios         # requires Apple Developer account, installs via TestFlight

npm run build:ios             # eas build --profile production --platform ios
npm run build:android         # eas build --profile production --platform android

npm run submit:ios            # eas submit --profile production --platform ios
npm run submit:android        # eas submit --profile production --platform android
```

Before the first production submission, `mobile/eas.json` `submit.production.ios`
requires `appleTeamId` and `ascAppId` to be filled in (from App Store Connect), and
`submit.production.android` requires `google-service-account.json` (gitignored) with a
Play Console service account key. Bundle IDs are `ng.gov.ogun.iseyaa` on both platforms.
Version bumps: increment `expo.ios.buildNumber` / `expo.android.versionCode` for every
build, and `expo.version` for user-visible releases. Verify IPA/AAB size stays under the
40MB (iOS) / 30MB (Android) App Store submission limits before submitting; use
`npm run atlas` to identify oversized bundle modules if a build exceeds the limit.

## Blue-green cutover for extracted microservices

Cutting live traffic to a newly-extracted gRPC service (or rolling one back) follows the
process in [`docs/blue-green-cutover-runbook.md`](./blue-green-cutover-runbook.md), keyed
on the `grpc.<service>_service.canary_enabled` flag in the `platformConfig` table — any
value other than an explicit stored `false` is treated as enabled, so the flag defaults
open. `ResilienceService` wraps every gRPC call to an extracted service in a
circuit-breaker/retry/timeout policy; if the target service is unhealthy or the breaker is
open, the calling `*-client` module degrades to `ServiceUnavailableException` instead of
propagating a raw gRPC failure.

## Rollback procedure

Railway automatically retains the last 10 deployment images per service.

1. Open the Railway dashboard → the affected service → **Deployments** tab.
2. Find the previous successful (green) deployment.
3. Click the three-dot menu → **Redeploy**.
4. Railway spins up the previous image — typically 2-3 minutes.
5. Verify: `curl https://<production-api-host>/api/v1/health` returns `200`.

**Database caveat:** a Railway rollback only reverts the container image — it does **not**
revert the database schema. Before any deployment that includes a Prisma migration, take a
database branch snapshot (e.g., a Neon branch) first. To revert a specific migration on
the branch: `npx prisma migrate resolve --rolled-back <migration-name>`.

## Monitoring

- **Error tracking (Sentry):** backend project `iseyaa-backend`
  (`SENTRY_DSN`, `@sentry/nestjs` initialized in `backend/src/main.ts`) and mobile project
  `iseyaa-mobile` (`EXPO_PUBLIC_SENTRY_DSN`, Sentry React Native SDK in
  `mobile/app/_layout.tsx`). Full alert rule configuration — including the specific rules,
  thresholds, and "Send Test Notification" verification steps — is documented in
  [`monitoring/sentry-alerts.md`](../monitoring/sentry-alerts.md).
- **Metrics and tracing (Grafana Cloud / OpenTelemetry):** the backend loads
  `./dist/instrumentation.js` before `main.js` at boot (see Build pipeline above) and
  exports traces/metrics to `OTEL_EXPORTER_OTLP_ENDPOINT` using `GRAFANA_CLOUD_OTLP_TOKEN`
  for auth, tagged with `OTEL_SERVICE_NAME` (default `iseyaa-api`). Import
  [`monitoring/grafana-dashboard.json`](../monitoring/grafana-dashboard.json) into
  Grafana Cloud (Dashboards → New → Import → Upload JSON) against your Prometheus data
  source to get RPS, P95 latency, error rate, WebSocket connection, and wallet transaction
  panels.
- **Verification:** after wiring monitoring, make an API request and confirm the Grafana
  RPS panel updates within ~30 seconds, and confirm a trace from `iseyaa-api` appears in
  Grafana Cloud → Explore → Traces within ~15 minutes. For Sentry, trigger a deliberate 404
  (`curl https://<host>/api/v1/nonexistent-route`) and confirm it appears under Issues
  within ~30 seconds.

<!-- VERIFY: Grafana Cloud org/dashboard URL, Sentry org slug, and Upstash/Neon dashboard URLs are operator-specific and not present in the repository -->
