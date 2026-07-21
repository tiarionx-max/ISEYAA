---
phase: quick
plan: 260720-qth
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "README.md's Architecture section lists all real top-level directories (backend, web, mobile, shared, packages, docs, monitoring, load-tests) and explains that backend/ is a monolith + gRPC-microservices hybrid, not a pure NestJS monolith"
    - "README.md's env var documentation matches the real root .env.example (not a stale synthetic backend/.env block)"
    - "README.md's Module Reference documents every module present in backend/src/modules/ (including Delivery, Notifications, Waitlist, News, Reviews, AI — previously missing)"
    - "README.md's Running Tests section does not assert a hardcoded stale test count; it reflects a freshly-measured suite count or a non-specific accurate phrasing"
    - "README.md's Deployment Checklist accounts for Railway + the independently-deployable gRPC services, not only a single monolith target"
  artifacts:
    - path: "README.md"
      provides: "Corrected, current architecture/setup/module/test/deployment documentation"
      contains: "backend/apps/"
  key_links:
    - from: "README.md Architecture section"
      to: "backend/apps/ (12 gRPC service directories) and docker-compose.yml (5 live-wired services)"
      via: "prose description of monolith+microservices hybrid, matching real docker-compose.yml service list"
      pattern: "notifications-service|news-service|waitlist-service|reviews-service|delivery-otp-service"
---

<objective>
Correct README.md so it accurately reflects the current codebase (branch `microservices-redesign`) instead of describing a stale pure-NestJS-monolith architecture. The README currently under-documents the repo's real top-level layout, omits the gRPC microservices architecture entirely, has a stale/wrong env-var block (references AWS S3/CloudFront vars and a per-directory `.env` layout that no longer match the code), is missing 6 of the ~15 real backend modules from "Module Reference", asserts a hardcoded stale test count ("153 tests, 11 suites"), and has a Deployment Checklist that implies a single monolith deploy target when Railway now deploys the monolith, web, and multiple independent gRPC services separately.

This is a documentation-accuracy correction only — no application code changes. Use Edit (not a full rewrite) to preserve the parts of README.md that are still accurate: the "Key Technical Decisions" table, the bulk of the "API Overview" table, and the bulk of the existing per-module bullet lists in "Module Reference".

Purpose: Keep README.md trustworthy as the entry point for anyone (including future Claude sessions) onboarding onto this repo.
Output: Corrected `README.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
These facts were confirmed by direct inspection of the current codebase (2026-07-20, branch `microservices-redesign`). Use them directly — do not re-derive from scratch, but do re-Read the cited files before editing to catch any drift since this plan was written and to get exact current line numbers for Edit.

**Repo root structure** (`ls -d */` at repo root): `backend/`, `web/`, `mobile/`, `shared/`, `packages/` (contains `packages/proto`, an npm workspace — see root `package.json` `workspaces` array), `docs/` (contains `docs/blue-green-cutover-runbook.md`), `monitoring/`, `load-tests/`.

**Backend is a hybrid, not a pure monolith:**
- `backend/src/modules/` (the NestJS monolith, still the source of truth for most domains) contains: `admin`, `ai`, `auth`, `delivery`, `delivery-otp-client`, `events`, `lgas`, `marketplace`, `ministry`, `news`, `news-client`, `notifications`, `notifications-client`, `reviews`, `reviews-client`, `settlement-disputes`, `stays`, `studio`, `tour-bookings`, `tour-guides`, `tour-packages`, `tourism`, `transport`, `users`, `waitlist`, `waitlist-client`, `wallet`, `webhooks`.
- `backend/apps/` contains 12 independently-buildable/deployable gRPC service directories, each with its own `railway.toml` + `Dockerfile`: `admin-service`, `ai-service`, `auth-service`, `delivery-otp-service`, `events-service`, `marketplace-service`, `news-service`, `notifications-service`, `reviews-service`, `stays-service`, `waitlist-service`, `wallet-service`. `backend/package.json`'s `build:services` script builds all 12 via `nest build <service>`.
- Of those 12, only 5 are actually wired into local dev today (`docker-compose.yml` defines services `postgres`, `redis`, `backend`, `web`, `notifications-service`, `news-service`, `waitlist-service`, `reviews-service`, `delivery-otp-service` — the backend container depends_on all 5 and gets their URLs via env vars `NOTIFICATIONS_SERVICE_URL`/`NEWS_SERVICE_URL`/`WAITLIST_SERVICE_URL`/`REVIEWS_SERVICE_URL`/`DELIVERY_OTP_SERVICE_URL`). The monolith calls these 5 through gRPC client modules: `backend/src/modules/notifications-client`, `news-client`, `waitlist-client`, `reviews-client`, `delivery-otp-client`. Delivery-OTP extraction is scoped to `VerifyDeliveryOtp` only — `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery`/`DeliveryGateway` remain in-process in `backend/src/modules/delivery` (per `.planning/STATE.md` Decisions).
- The other 7 (`admin-service`, `ai-service`, `auth-service`, `events-service`, `marketplace-service`, `stays-service`, `wallet-service`) exist as Railway-deployable scaffolds under `backend/apps/` but are NOT in `docker-compose.yml` and have no corresponding `*-client` module in `backend/src/modules/` — their domains are still served entirely in-process by the monolith today (`AuthModule`, `WalletModule`, `EventsModule`, `StaysModule`, `MarketplaceModule`, `AdminModule`, `AiModule`). Do not claim these are "extracted" — they are scaffolds for future extraction.
- Canary/rollback for the live-extracted services is controlled via `platformConfig` keys shaped `grpc.<service>_canary_enabled` (a kill-switch, not hardcoded), documented in `docs/blue-green-cutover-runbook.md`.

**Env vars** — root `.env.example` (NOT per-directory `.env` files for backend) is the real source of truth for the backend + Docker Compose. Confirmed via `backend/src/app.module.ts` line 41: `ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '..', '.env') })` — this resolves to the repo-root `.env`, not `backend/.env`. `docker-compose.yml` also uses `env_file: .env` (repo root) for every service. Real var groups present in `.env.example` (use these group headers, values are placeholders):
- Application: `APP_ENV`, `PORT` (default `3001`), `ALLOWED_ORIGINS`
- Database: `DATABASE_URL` (+ optional `DIRECT_URL` for `prisma migrate`, unpooled)
- Redis: `REDIS_URL`
- Auth: `JWT_SECRET`, `JWT_REFRESH_SECRET`
- Payments: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_SECRET_KEY` (fallback)
- Messaging: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, plus WhatsApp (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TEMPLATE_NAME`, `META_WHATSAPP_TEMPLATE_LANG`)
- Maps: `GOOGLE_MAPS_API_KEY`
- AI: `ANTHROPIC_API_KEY`
- Object storage: **`.env.example` documents Cloudflare R2 as the primary convention** (`CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`) — comment says "replaces AWS S3 + CloudFront (zero egress fees)". `backend/src/common/services/s3.service.ts` auto-detects: if `AWS_ACCESS_KEY_ID` is set it uses AWS S3 mode (`AWS_S3_BUCKET`, `AWS_CLOUDFRONT_URL`, `AWS_REGION`); else if `R2_ACCESS_KEY_ID` is set it uses R2 mode. README's current `S3_BUCKET_NAME`/`CDN_BASE_URL` var names in its backend/.env block do not match either real mode — fix this.
- Search: `TYPESENSE_HOST`, `TYPESENSE_API_KEY`, `TYPESENSE_PROTOCOL`, `TYPESENSE_PORT`
- Push: `FIREBASE_SERVER_KEY`
- gRPC service URLs: `AUTH_SERVICE_URL`, `WALLET_SERVICE_URL`, `EVENTS_SERVICE_URL`, `STAYS_SERVICE_URL`, `MARKETPLACE_SERVICE_URL`, `ADMIN_SERVICE_URL`, `AI_SERVICE_URL` (unused placeholders today — no consuming client module yet), `NOTIFICATIONS_SERVICE_URL`, `NEWS_SERVICE_URL`, `WAITLIST_SERVICE_URL`, `REVIEWS_SERVICE_URL`, `DELIVERY_OTP_SERVICE_URL` (these 5 ARE consumed today)
- Observability: `SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_CLOUD_OTLP_TOKEN`, `OTEL_SERVICE_NAME`
- KYC/AI concierge: `ENCRYPTION_KEY` (AES-256-GCM, 64 hex chars), `UPSTASH_VECTOR_REST_URL`/`UPSTASH_VECTOR_REST_TOKEN`, `DOJAH_API_KEY`/`DOJAH_APP_ID`, `SMILE_IDENTITY_PARTNER_ID`/`SMILE_IDENTITY_API_KEY`
- Mobile build: `EXPO_PUBLIC_API_URL`

For `web/.env.local`, grep of `web/src` confirms ONLY these are actually read: `NEXT_PUBLIC_API_URL` (`web/src/lib/api.ts`, `web/src/lib/auth.ts`), plus NextAuth's own required vars `NEXTAUTH_URL`/`NEXTAUTH_SECRET` (consumed internally by `next-auth`, not via explicit `process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY` anywhere in `web/src` — that var in the current README is unused/stale, remove it). For `mobile/.env`, only `EXPO_PUBLIC_API_URL` is read (`mobile/lib/api.ts`).

**main.ts facts (already correct in README, verify not accidentally changed):** global prefix `api/v1` (`app.setGlobalPrefix('api/v1')`), Swagger at `api/docs` (non-production only), default port `3001` (`config.get<number>('PORT', 3001)`).

**Missing module route facts** (from `grep -n "@Controller\|@Get(\|@Post(\|@Patch(\|@Delete(" backend/src/modules/<module>/*.controller.ts`):
- Delivery (`backend/src/modules/delivery/delivery.controller.ts`, `@Controller('delivery')`): `GET /delivery/fee-estimate`, `POST /delivery/riders`, `PATCH /delivery/riders/:id/approve`, `POST /delivery/go-online`, `POST /delivery/go-offline`, `GET /delivery/riders/earnings`, `POST /delivery/orders`, `PATCH /delivery/orders/:id/accept`, `POST /delivery/orders/:id/verify-otp`, `PATCH /delivery/orders/:id/complete`, `PATCH /delivery/orders/:id/rate`, `PATCH /delivery/orders/:id/cancel`
- Notifications (`@Controller('notifications')`): `GET /notifications`, `POST /notifications/register-token`, `POST /notifications/send`
- Waitlist (`@Controller('waitlist')`): `POST /waitlist`, `GET /waitlist/stats`
- News (`@Controller('news')`): `GET /news`
- Reviews (`@Controller('reviews')` + `@Controller('admin/reviews')`): `POST /reviews`, `GET /reviews`, `GET /admin/reviews/queue`, `GET /admin/reviews/flags/:id`, `POST /admin/reviews/flags/:id/resolve`
- AI (`@Controller('ai')`): `POST /ai/chat`, `POST /ai/recommend`, `POST /ai/itinerary`, `POST /ai/lga-intel`

**Test count** — do NOT hardcode a number without measuring at execution time. `cd backend && npx jest --listTests 2>&1` lists one test file path per line (fast, no DB/Redis required) — count the lines to get the current suite/file count and use that measured number. Do not attempt to run the full `npm test` (requires live Postgres/Redis) just to get an individual `it()`/`test()` count — phrase the individual-test-case count non-specifically (e.g., "run `npm run test:coverage` for current pass/fail totals") rather than guessing.

**Deployment reality**: `railway.toml` at repo root deploys the monolith (`backend/Dockerfile`, healthcheck `/api/v1/health`). `web/railway.toml` deploys the web app separately. Each `backend/apps/<service>/railway.toml` deploys that service independently on Railway. `docs/blue-green-cutover-runbook.md` documents the blue-green cutover process using `platformConfig` `grpc.<service>_canary_enabled` kill-switches for the live-extracted services.
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Architecture, Prerequisites, and Local Setup sections</name>
  <files>README.md</files>
  <action>
    Read the current README.md in full first (it is short, ~198 lines) to get exact current line numbers, then use Edit (not Write) for each change below.

    1. Replace the "## Architecture" ASCII diagram (currently only lists backend/web/mobile) with the real top-level layout: backend/ (NestJS monolith + gRPC microservices, see below), web/ (Next.js 14), mobile/ (Expo SDK 51), shared/ (TypeScript types/DTOs/constants consumed by web+mobile via npm workspace), packages/proto (shared gRPC/protobuf definitions, npm workspace), docs/ (runbooks, e.g. blue-green-cutover-runbook.md), monitoring/, load-tests/. Immediately after the diagram, add 2-4 sentences explaining the hybrid: backend/src/ is the NestJS monolith serving most domains (auth, wallet, events, stays, marketplace, studio, admin, ai, tourism, transport, delivery, users, settlement-disputes, ministry, lgas, webhooks); backend/apps/ contains 12 independently-deployable gRPC microservice scaffolds; as of now 5 are actually live-wired into local dev via docker-compose and called from the monolith over gRPC (notifications-service, news-service, waitlist-service, reviews-service, delivery-otp-service — the last scoped to VerifyDeliveryOtp only), while the other 7 (admin-service, ai-service, auth-service, events-service, marketplace-service, stays-service, wallet-service) are Railway-deployable scaffolds for future extraction whose domains are still served in-process by the monolith today. Reference docs/blue-green-cutover-runbook.md for the canary cutover process. Use the verified_facts in context — do not invent additional detail.

    2. In "## Prerequisites", keep Node.js 20 LTS (matches backend/Dockerfile.dev's node:20-alpine and CLAUDE.md), PostgreSQL 16, Redis 7. Change "AWS S3 (or compatible)" to "Cloudflare R2 (or AWS S3 — S3Service auto-detects based on which env vars are set)" to match backend/src/common/services/s3.service.ts's actual dual-mode behavior. Add "Docker + Docker Compose (recommended — boots Postgres, Redis, backend, web, and the 5 live-wired gRPC services together; see docker-compose.yml)" as a prerequisite/recommended item.

    3. In "### 1. Clone and install", replace the pnpm/per-directory install steps. Root package.json already declares npm workspaces (backend, web, mobile, shared, packages/proto), so a single `npm install` from the repo root installs everything. Remove `npm install -g pnpm # optional` and the three separate `cd <dir> && npm install` blocks; replace with `npm install` run once from the repo root, with an optional note that `npm install --workspace=<name>` can install a single workspace if needed.

    4. In "### 2. Environment variables", replace the current three synthetic `.env` code blocks (backend/.env, web/.env.local, mobile/.env) as follows:
       - Explain that the backend (and Docker Compose) reads a single root `.env` (copied from `.env.example`), NOT `backend/.env` — cite that ConfigModule's envFilePath resolves to the repo root.
       - Rewrite the "backend/.env" example block into a root `.env` example block, grouped by the real section headers from verified_facts (Application, Database, Redis, Auth, Payments — Paystack/Flutterwave, Messaging, Maps, AI, Object storage [R2 primary, AWS S3 alternate], Search, Push, gRPC service URLs, Observability). Use placeholder values in the same style as the current README (e.g. `sk_test_...`), not real secrets — pull placeholder shapes from `.env.example`, do not copy any real key material.
       - Keep the `web/.env.local` block but reduce it to only `NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — remove `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (confirmed unused in web/src via grep).
       - Keep the `mobile/.env` block as-is (`EXPO_PUBLIC_API_URL` — confirmed used).

    5. In "### 4. Start services", after the existing three-terminal manual instructions, add a note that `docker-compose up -d` from the repo root is the recommended path since it also boots the 5 live-wired gRPC services (notifications/news/waitlist/reviews/delivery-otp) that the monolith calls over gRPC — running the monolith manually via `npm run start:dev` without those 5 services means any code path touching notifications, news, waitlist, reviews, or delivery-OTP verification will fail to reach its gRPC dependency.

    Do not change "## API Overview", "## Key Technical Decisions", "## Running Tests", "## Deployment Checklist", or "## Module Reference" in this task — those are handled in Tasks 2 and 3.
  </action>
  <verify>
    <automated>grep -c "backend/apps" README.md && grep -c "R2_BUCKET\|Cloudflare R2" README.md && grep -c "docker-compose" README.md</automated>
  </verify>
  <done>README.md's Architecture section lists shared/, packages/, docs/, monitoring/, load-tests/ alongside backend/web/mobile and explains the monolith+microservices hybrid with the real 5-live/7-scaffold split. Prerequisites and Local Setup (install steps, env var blocks, start-services note) match the real root-level npm workspaces + root .env.example + docker-compose.yml setup, with no invented or stale var names.</done>
</task>

<task type="auto">
  <name>Task 2: Add missing modules to API Overview and Module Reference</name>
  <files>README.md</files>
  <action>
    Read the current "## API Overview" table and "## Module Reference" section of README.md (after Task 1's edits) to get exact current line numbers.

    1. In "## API Overview", add table rows for the 6 modules currently missing, using the exact routes from context's verified_facts (Missing module route facts): Delivery, Notifications, Waitlist, News, Reviews, AI. Keep the existing rows (Auth, Tourism, Events, Tickets, Stays, Marketplace, Studio, Wallet, Admin, Webhooks) unchanged — they remain accurate. Follow the existing table's terse style (2-4 representative routes per module, not an exhaustive list) — for Delivery pick the most representative subset (e.g. `POST /delivery/orders`, `POST /delivery/orders/:id/verify-otp`, `PATCH /delivery/orders/:id/complete`) rather than all 12 routes.

    2. In "## Module Reference", add a new subsection for each of the 6 missing modules (DeliveryModule, NotificationsModule, WaitlistModule, NewsModule, ReviewsModule, AiModule), in the same style as the existing EventsModule/StaysModule/MarketplaceModule/StudioModule/WalletModule/AdminModule subsections (3-5 short bullets per module). Before writing each subsection, Read the corresponding service file(s) under backend/src/modules/<module>/ (e.g. delivery.service.ts, notifications.service.ts, waitlist.service.ts, news.service.ts, reviews.service.ts, ai.service.ts) to ground each bullet in real behavior — cover: primary actor/role (if any), the core business rule or workflow, and any connection to Wallet/Settlement/gRPC-client modules where applicable (e.g. delivery-otp-client, notifications-client, news-client, waitlist-client, reviews-client). Do not fabricate details not visible in the source — if a detail can't be confirmed cheaply, omit it rather than guess.

    3. Add one sentence at the top of "## Module Reference" noting that gRPC-client-only wrapper modules (notifications-client, news-client, waitlist-client, reviews-client, delivery-otp-client) are not separately documented here since they are thin proxies to the extracted services described in the Architecture section — this avoids implying they are separate business-logic modules.
  </action>
  <verify>
    <automated>grep -c "DeliveryModule\|NotificationsModule\|WaitlistModule\|NewsModule\|ReviewsModule\|AiModule" README.md</automated>
  </verify>
  <done>README.md's API Overview table has rows for Delivery, Notifications, Waitlist, News, Reviews, and AI with real routes. README.md's Module Reference has a subsection for each of those 6 modules, grounded in the real service files, in the same style as existing subsections.</done>
</task>

<task type="auto">
  <name>Task 3: Fix Running Tests and Deployment Checklist sections</name>
  <files>README.md</files>
  <action>
    Read the current "## Running Tests" and "## Deployment Checklist" sections of README.md (after Tasks 1-2's edits) to get exact current line numbers.

    1. Run `cd backend && npx jest --listTests 2>&1` and count the resulting lines (one test file path per line — this is fast and does not require Postgres/Redis to be running). Replace "153 tests, 11 suites" in "## Running Tests" with the freshly-measured suite/file count (e.g. "N test suites" using the real count you just measured — do not reuse the stale 153/11 figures and do not invent a new number without having actually run the command). For the individual test-case count, do not guess a number — phrase it non-specifically, e.g. add a note like "run `npm run test:coverage` for current pass/fail totals" instead of asserting a fixed count.

    2. In "## Deployment Checklist", update it to reflect that this is no longer a single-target deploy:
       - Note that `railway.toml` (repo root) deploys the monolith, `web/railway.toml` deploys the web app, and each `backend/apps/<service>/railway.toml` deploys that gRPC service independently on Railway.
       - Reference `docs/blue-green-cutover-runbook.md` for the blue-green cutover process for the live-extracted gRPC services (notifications, news, waitlist, reviews, delivery-otp), including the `platformConfig` `grpc.<service>_canary_enabled` kill-switches.
       - Fix the CDN/storage checklist item: replace "Set `CDN_BASE_URL` to CloudFront distribution domain" with the real R2-primary convention (`R2_PUBLIC_URL` + `R2_BUCKET`, or `AWS_CLOUDFRONT_URL` + `AWS_S3_BUCKET` if running in AWS mode) per S3Service's actual dual-mode env var reads.
       - Keep the existing generic items (NODE_ENV, JWT/PAYSTACK/SENDGRID secrets, NEXTAUTH_SECRET, prisma db push, Paystack webhook config, DB backups, rate limiting) — they remain accurate, just adjust wording if it implied a single deploy target.
  </action>
  <verify>
    <automated>grep -c "railway.toml" README.md && grep -c "R2_PUBLIC_URL\|blue-green" README.md</automated>
  </verify>
  <done>README.md's Running Tests section reflects a freshly-measured (not stale-hardcoded) suite count and phrases the individual test-case count non-specifically. README.md's Deployment Checklist documents the multi-target Railway deployment (monolith + web + per-service) and the correct R2/CloudFront storage var, referencing docs/blue-green-cutover-runbook.md.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| README.md content → developer clipboard | Env var example blocks in README are copy-paste targets for local `.env` setup |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | README.md env var example blocks | mitigate | Task 1 explicitly requires placeholder values only, sourced from `.env.example`'s placeholder shapes — never copy real key material (e.g. the live Paystack `sk_live_...` key flagged as a pre-existing repo concern in `.planning/STATE.md` Blockers/Concerns) into README.md |
| T-quick-02 | Tampering | README.md documentation accuracy | accept | Documentation-only change; no code, config, or deploy behavior is altered by this plan — worst case is stale prose, not a functional regression |

</threat_model>

<verification>
1. `grep -c "backend/apps" README.md` returns > 0 (Architecture section documents the microservices directory).
2. `grep -c "Cloudflare R2" README.md` returns > 0 (Prerequisites/env vars reflect real storage convention, not stale AWS-only claim).
3. `grep -c "DeliveryModule\|NotificationsModule\|WaitlistModule\|NewsModule\|ReviewsModule\|AiModule" README.md` returns 6 (all missing modules now documented).
4. README.md no longer contains the literal string "153 tests, 11 suites".
5. `grep -c "railway.toml" README.md` returns > 0 (Deployment Checklist documents multi-service Railway deployment).
6. Manual read-through: "Key Technical Decisions" table and the previously-accurate API Overview rows (Auth, Tourism, Events, Tickets, Stays, Marketplace, Studio, Wallet, Admin, Webhooks) are unchanged from the original.
</verification>

<success_criteria>
- README.md's Architecture section accurately lists all real top-level directories and explains the monolith+microservices hybrid with the correct 5-live/7-scaffold split.
- README.md's Prerequisites, install steps, and env var documentation match the real root `.env.example`, root npm workspaces, and `docker-compose.yml` — no stale per-directory `.env` claims, no unused vars, no wrong storage-provider vars.
- README.md's API Overview and Module Reference document all ~15 real backend modules, including the 6 previously missing (Delivery, Notifications, Waitlist, News, Reviews, AI).
- README.md's Running Tests section reflects a freshly-measured count, not a stale hardcoded one.
- README.md's Deployment Checklist accounts for the real multi-target Railway deployment and correct storage vars.
- No real secrets or key material were introduced into README.md.
- Parts of README.md that were already accurate (Key Technical Decisions table, previously-correct API routes, main.ts-derived facts) are unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/260720-qth-correct-readme-md-inaccuracies-against-c/260720-qth-SUMMARY.md`
</output>
