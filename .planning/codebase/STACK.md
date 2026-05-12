# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript 5.3.x — All four workspaces (backend, web, mobile, shared)

**Secondary:**
- JavaScript — `seed-demo.js`, `smoke-test.js` in `backend/`; `next.config.js`, `postcss.config.js` in `web/`

## Runtime

**Environment:**
- Node.js >=20.0.0 (Node 20 LTS — enforced via `engines` in root `package.json`)
- Docker image `node:20-alpine` for backend container (`backend/Dockerfile.dev`)

**Package Manager:**
- npm >=10.0.0 (enforced via `engines`)
- Workspaces: npm workspaces at root (`package.json` workspaces: `["backend","web","mobile","shared"]`)
- Lockfile: present (`package-lock.json` at root)

## Frameworks

**Backend (`backend/`):**
- NestJS 10.3.x (`@nestjs/core`, `@nestjs/common`) — REST API framework, modular DI
- NestJS Swagger 7.3.x (`@nestjs/swagger`) — API documentation at `/api/docs`
- NestJS Throttler 5.1.x (`@nestjs/throttler`) — Rate limiting (100 req / 60s global)
- NestJS Schedule 4.0.x (`@nestjs/schedule`) — Cron/scheduled tasks
- NestJS EventEmitter 2.0.x (`@nestjs/event-emitter`) — Internal domain event bus
- Passport 0.7.x + `passport-jwt` 4.0.x — JWT authentication strategy

**Web (`web/`):**
- Next.js 14.1.3 — App Router + Pages Router (both present: `src/app/` and `src/pages/`)
- React 18.2.x / ReactDOM 18.2.x

**Mobile (`mobile/`):**
- Expo SDK ~51.0.0 — React Native build toolchain
- React Native 0.74.0
- Expo Router ~3.5.0 — File-based navigation (`main: "expo-router/entry"`)
- React Navigation 6.x (`@react-navigation/native`) — Navigation primitives

**Shared (`shared/`):**
- Pure TypeScript library — no runtime framework
- Exports types, DTOs, constants to `backend/` and both client workspaces via `@iseyaa/shared` path alias

**Testing:**
- Jest 29.7.x — All workspaces
- ts-jest 29.1.x — TypeScript transformer for backend Jest
- jest-expo ~51.0.0 — Expo-aware Jest preset for mobile
- `@nestjs/testing` 10.3.x — NestJS testing utilities

**Build/Dev:**
- `@nestjs/cli` 10.3.x — NestJS build & dev server (`nest build`, `nest start --watch`)
- TypeScript compiler (`tsc`) — Shared library build
- Metro bundler — React Native/Expo bundler (configured via `app.json` `web.bundler: "metro"`)

## Key Dependencies

**Critical:**
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

**Infrastructure:**
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

**Environment:**
- Root `.env` loaded by Docker Compose via `env_file: .env`
- Backend reads env via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) in `backend/src/app.module.ts`
- Web reads env via Next.js built-in env support; `NEXT_PUBLIC_API_URL` is the only public var
- Mobile reads env via `expo-constants`
- Example file: `.env.example` at repo root (lists all required vars)

**Key required env vars:**
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

**Build:**
- `backend/tsconfig.json` — CommonJS target, ES2021, `emitDecoratorMetadata: true` (required for NestJS DI)
- `web/tsconfig.json` — Extends Next.js defaults
- `mobile/tsconfig.json` — Expo TypeScript config
- `shared/tsconfig.json` — Strict TypeScript for shared types
- `backend/nest-cli.json` — NestJS CLI project configuration

## Platform Requirements

**Development:**
- Node.js 20 LTS
- npm 10+
- Docker + Docker Compose (for Postgres 16 + Redis 7 containers via `docker-compose.yml`)
- Expo CLI for mobile development
- `prisma migrate dev` run from root via `npm run prisma:migrate`

**Production:**
- Backend: containerised Node.js 20 (Docker, port 3001)
- Web: Next.js server-rendered (port 3000)
- Mobile: Expo EAS Build or bare React Native build pipeline; bundle IDs `ng.gov.ogun.iseyaa` (iOS/Android)
- Database: PostgreSQL 16
- Cache: Redis 7 (256MB maxmemory, allkeys-lru policy)
- Storage: AWS S3 (region `af-south-1` default) + CloudFront CDN
- API prefix: `/api/v1`

---

*Stack analysis: 2026-05-12*
