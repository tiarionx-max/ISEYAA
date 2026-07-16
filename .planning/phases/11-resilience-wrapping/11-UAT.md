---
status: testing
phase: 11-resilience-wrapping
source: 11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md, 11-06-SUMMARY.md, 11-07-SUMMARY.md, 11-08-SUMMARY.md, 11-09-SUMMARY.md, 11-10-SUMMARY.md, 11-11-SUMMARY.md
started: 2026-07-16T20:30:00Z
updated: 2026-07-16T20:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 2
name: Single Vendor Outage Is Isolated
expected: |
  Simulate a Paystack outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable host, or
  trigger 5+ consecutive failures) — wallet top-up/payment calls fail fast with a
  "Paystack is temporarily unavailable" message, while unrelated features (browsing
  events, tourism attractions, S3 uploads) continue working normally.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend server, clear ephemeral state, start fresh. Server boots without errors, ResilienceModule initializes its 7 vendor policies without throwing, and a basic API call returns live data.
result: PASSED (initially only after workarounds; both root-cause bugs have since been fixed — see Gaps). Core criteria confirmed: server booted cleanly, all 7 ResilienceService vendor policies (paystack, paystackRefund, termiiAuth, termiiDelivery, anthropic, s3, fcm) logged ready without throwing, and GET /api/v1/lgas returned 200 with live DB data. Two blocking bugs surfaced during testing (deleteOutDir/tsbuildinfo cache race, and npm run dev:backend not loading root .env) and were fixed via quick task 260716-lbl, then re-verified with a genuine double cold-start (no manual workarounds, no manually exported env vars) — both passed cleanly on both runs.

### 2. Single Vendor Outage Is Isolated
expected: Simulate a Paystack outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable host, or trigger 5+ consecutive failures) — wallet top-up/payment calls fail fast with a "Paystack is temporarily unavailable" message, while unrelated features (browsing events, tourism attractions, S3 uploads) continue working normally.
result: [pending]

### 3. Circuit-Breaker Open Event Does NOT Leak Vendor Secrets to Logs
expected: When a vendor breaker opens (e.g. after simulated Paystack failures), the application log line for "Circuit breaker OPEN for paystack" contains only the vendor name and a generic error message — it must NOT print the raw vendor error object, and specifically must never show an Authorization header or bearer token value in the log output.
result: [pending]

### 4. FCM Token Registration Preserves Existing Profile Data
expected: A user with existing metadata (e.g. saved preferences) registers a new FCM push token. After registration, the previously-saved preference data is still present on the user record — not wiped out by the token write.
result: [pending]

### 5. AI Chat/Itinerary Streaming Recovers From a Slow/Down Anthropic
expected: If the Anthropic API is slow or unreachable, an AI chat or itinerary-generation request does not hang indefinitely — it times out within roughly 8 seconds and returns a graceful error/fallback to the client instead of a stuck connection.
result: [pending]

### 6. Breaker State Changes Are Visible in Observability (Sentry/OTel)
expected: When a vendor circuit breaker opens, closes, or half-opens, a corresponding event appears in Sentry (a captured message naming the vendor) and/or the configured OpenTelemetry backend (a span with the breaker state and vendor attributes) — visible to whoever monitors the platform's observability dashboards.
result: [pending]

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

### Gap 1 (RESOLVED): deleteOutDir + stale TypeScript incremental cache crashes every backend restart
found_in: Test 1 (Cold Start Smoke Test)
description: |
  `backend/nest-cli.json` has `deleteOutDir: true`, which wipes `backend/dist/` on every
  `nest start --watch` launch. `backend/tsconfig.json` had `"incremental": true` with no
  explicit `tsBuildInfoFile`, so TypeScript wrote its incremental cache to the project root
  (`backend/tsconfig.build.tsbuildinfo`) instead of inside `dist/`. When `deleteOutDir` wiped
  `dist/` but the tsbuildinfo cache survived, tsc saw "no source changed" and skipped
  emitting — `dist/` stayed empty, Nest tried to `require('dist/main')`, and the process
  crashed. 100% reproducible on any second cold start.
resolution: |
  Fixed via quick task 260716-lbl (commit 178d1fd): added
  `"tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo"` to `backend/tsconfig.json`, so the
  incremental cache now lives inside `dist/` and is wiped alongside it. Also untracked the
  stray git-committed `backend/tsconfig.tsbuildinfo` / `web/tsconfig.tsbuildinfo` files
  (already gitignored via `*.tsbuildinfo` but still in the git index) so a stale cache can
  never be committed again. Re-verified with a genuine double cold-start of
  `npm run dev:backend` — both runs booted cleanly with no manual cache deletion required.

### Gap 2 (RESOLVED): `npm run dev:backend` doesn't load the root `.env`
found_in: Test 1 (Cold Start Smoke Test)
description: |
  `backend/src/main.ts` checked `process.env.DATABASE_URL/JWT_SECRET/JWT_REFRESH_SECRET` at
  the top of `bootstrap()`, before Nest's `ConfigModule` (which loads `.env` via dotenv) ever
  initialized. `ConfigModule.forRoot({ isGlobal: true })` had no `envFilePath`, so it looked
  for `.env` relative to `process.cwd()` — since this is an npm workspace, `npm run
  dev:backend` runs with cwd = `backend/`, which has no `.env` of its own (the real `.env`
  lives at the repo root). Result: `FATAL: missing required environment variables` on any
  cold start unless the shell already had them exported. Docker Compose was unaffected
  (`env_file: .env` injects vars directly into the container's `process.env`), but the
  documented native dev command did not work as-is.
resolution: |
  Fixed via quick task 260716-lbl (commit 5bd04f4): `ConfigModule.forRoot()` in
  `backend/src/app.module.ts` now sets `envFilePath` to the repo-root `.env`
  (`path.resolve(__dirname, '..', '..', '.env')`), and the fatal env-var check in
  `backend/src/main.ts` moved to run after `app.get(ConfigService)`, reading via
  `config.get()` instead of raw `process.env`. Verified `@nestjs/config`'s `loadEnvFile`
  silently no-ops when the path doesn't exist (safe for Docker, where root `.env` isn't
  copied into the image) and only fills keys not already in `process.env` (Docker-injected
  vars still win). Re-verified with a genuine double cold-start with zero manually exported
  env vars — both runs booted cleanly.

### Note (not fixed, flagged only): live-looking secrets in root `.env`
found_in: Test 1 (Cold Start Smoke Test)
description: |
  `c:\Developer\work\ISEYAA\.env` contains what look like live credentials — a `sk_live_`
  Paystack secret key, real-looking AWS access keys, and an Anthropic key — in a local dev
  file. Separately, `PAYSTACK_WEBHOOK_SECRET` is set to an unrelated third-party URL instead
  of an HMAC secret, which would make Paystack webhook signature verification meaningless if
  used as-is. Deliberately not modified — out of scope for the deleteOutDir/env-loading fix
  and needs an explicit decision from the user (rotate keys, confirm test-mode vs. live-mode
  intent, fix the webhook secret). Already tracked in `.planning/STATE.md` Blockers/Concerns
  ("Live Paystack secret key present in `.env` — recommend rotating to test-mode keys").
