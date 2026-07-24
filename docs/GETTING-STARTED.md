<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide gets ISEYAA running locally: the NestJS backend, the 5 live-wired gRPC
microservices it depends on, the Next.js web app, and the Expo mobile app. For the
full architecture (monolith + gRPC extraction strategy), see [ARCHITECTURE.md](ARCHITECTURE.md).
For the complete environment variable reference, see [CONFIGURATION.md](CONFIGURATION.md).

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | `20 LTS` | Pinned in `backend/Dockerfile.dev` and all three `.github/workflows/ci.yml` jobs. The production `backend/Dockerfile` builds on `node:22-alpine`, and root `package.json` `engines.node` requires `>=22.0.0` — install Node 22 only if you plan to run production builds locally. |
| npm | `>=10.0.0` | Enforced via root `package.json` `engines.npm` |
| Docker + Docker Compose | Any recent version | Recommended — boots Postgres, Redis, the backend, the web app, and the 5 live-wired gRPC services together (`docker-compose.yml`) |
| PostgreSQL | `16` | Only needed if running the backend outside Docker |
| Redis | `7` | Only needed if running the backend outside Docker |
| Expo CLI / Expo Go | SDK `51` | For running the mobile app (`mobile/`) |

You do not need every third-party account to start developing — most integrations
(Termii SMS, Dojah NIN verification, Smile Identity liveness, push notifications) run
in a stub/no-op mode when their API keys are absent, and log a warning instead of
failing. See [CONFIGURATION.md](CONFIGURATION.md) for the full required-vs-optional
breakdown. At minimum you need:

- A PostgreSQL connection (`DATABASE_URL`) — Docker Compose provides this locally
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — startup fails without these
- `ENCRYPTION_KEY` — a 64-hex-char (32-byte) AES-256-GCM key, required by the KYC module; generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Installation Steps

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd ISEYAA
npm install
```

Root `package.json` declares npm workspaces (`backend`, `web`, `mobile`, `shared`,
`packages/proto`), so a single `npm install` from the repo root installs every
workspace. To install a single workspace only, use
`npm install --workspace=<name>` (e.g. `npm install --workspace=backend`).

### 2. Configure environment variables

The backend (and Docker Compose) reads a single root `.env` file — copy it from
`.env.example`, not `backend/.env`:

```bash
cp .env.example .env
```

`ConfigModule` in `backend/src/app.module.ts` resolves `envFilePath` to the repo
root, and every service in `docker-compose.yml` uses `env_file: .env` (repo root).
Fill in `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY` at minimum — see
[CONFIGURATION.md](CONFIGURATION.md) for what each variable does and which ones are
required.

Web and mobile also need their own local env files:

```bash
# web/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-in-production"
```

```bash
# mobile/.env
EXPO_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### 3. Start Postgres, Redis, and the gRPC microservices

The backend calls 5 domains (notifications, news, waitlist, reviews, delivery-otp)
over gRPC via thin client modules. The easiest way to satisfy those dependencies is
`docker-compose up`, which boots Postgres, Redis, the backend, the web app, and all 5
live-wired services together:

```bash
docker-compose up -d
```

If you'd rather run the backend directly with `npm run start:dev` (step 5 below),
you still need Postgres 16 and Redis 7 reachable at the `DATABASE_URL` and
`REDIS_URL` you set in `.env`, and the 5 gRPC services running — otherwise any code
path touching notifications, news, waitlist, reviews, or delivery-OTP verification
will fail to reach its gRPC dependency.

### 4. Set up the database

From `backend/`:

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

`npx prisma db seed` runs the seed script declared in `backend/package.json`'s
`prisma.seed` field (`prisma/seed.ts`) — seeds the 20 Ogun State LGAs plus test
data.

### 5. Start the apps

```bash
# Terminal 1 — Backend API
cd backend && npm run start:dev

# Terminal 2 — Web frontend
cd web && npm run dev

# Terminal 3 — Mobile (Expo Go on a phone, or an emulator)
cd mobile && npm start
```

Or, if you used `docker-compose up -d` in step 3, the backend and web app are
already running — you only need to start mobile manually.

## First Run

Once the backend and web app are running:

- Backend health / API base: `http://localhost:3001/api/v1`
- Swagger UI (full OpenAPI spec): `http://localhost:3001/api/docs`
- Web app: `http://localhost:3000`
- Mobile: scan the QR code printed by `npm start` (in `mobile/`) with Expo Go, or
  press `a`/`i` to launch an Android/iOS emulator

Confirm the backend is healthy by opening `http://localhost:3001/api/docs` in a
browser — you should see the Swagger UI listing all API modules (Auth, Tourism,
Events, Stays, Marketplace, Studio, Wallet, Admin, Delivery, Notifications,
Waitlist, News, Reviews, AI).

Run the backend test suite to confirm your setup is working end-to-end:

```bash
cd backend && npm test
```

## Common Setup Issues

- **Backend fails to start with a JWT or encryption error.** `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY` are required — the backend throws on
  boot if they're missing or, for `ENCRYPTION_KEY`, not exactly 64 hex characters
  (32 bytes). Generate values as shown in Prerequisites above and set them in the
  root `.env` file (not `backend/.env`).
- **Requests to notifications, news, waitlist, reviews, or delivery-OTP endpoints
  fail or hang.** These 5 domains are served by separate gRPC microservices
  (`backend/apps/<name>-service`), not the monolith. If you're running
  `npm run start:dev` directly instead of `docker-compose up`, make sure those 5
  services are also running and that `NOTIFICATIONS_SERVICE_URL`,
  `NEWS_SERVICE_URL`, `WAITLIST_SERVICE_URL`, `REVIEWS_SERVICE_URL`, and
  `DELIVERY_OTP_SERVICE_URL` in `.env` point to them.
- **Wrong `.env` file edited.** The backend and Docker Compose both read the `.env`
  file at the repository root, not `backend/.env`. If env vars don't seem to take
  effect, confirm you edited the root file.
- **Node version mismatch.** Local dev and CI are pinned to Node 20 LTS, but the
  production `backend/Dockerfile` and root `package.json` `engines.node` target
  Node `>=22.0.0`. If `npm install` warns about engine mismatches or a production
  build behaves differently than dev, check which Node version is active
  (`node -v`).
- **Third-party features silently no-op.** Termii SMS OTP, Dojah NIN verification,
  Smile Identity liveness checks, and FCM push notifications all fall back to a
  stub/no-op mode with a logged warning when their API keys are absent from `.env`.
  This is expected in local dev — see [CONFIGURATION.md](CONFIGURATION.md) for the
  full list of optional-vs-required variables.

## Next Steps

- [ARCHITECTURE.md](ARCHITECTURE.md) — system overview, the monolith-to-gRPC
  strangler-fig migration, and component responsibilities
- [CONFIGURATION.md](CONFIGURATION.md) — full environment variable reference
- `README.md` (repository root) — module reference, API route overview, and key
  technical decisions
