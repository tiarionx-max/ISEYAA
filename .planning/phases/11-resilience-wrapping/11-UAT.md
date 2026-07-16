---
status: complete
phase: 11-resilience-wrapping
source: 11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md, 11-06-SUMMARY.md, 11-07-SUMMARY.md, 11-08-SUMMARY.md, 11-09-SUMMARY.md, 11-10-SUMMARY.md, 11-11-SUMMARY.md
started: 2026-07-16T20:30:00Z
updated: 2026-07-16T23:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend server, clear ephemeral state, start fresh. Server boots without errors, ResilienceModule initializes its 7 vendor policies without throwing, and a basic API call returns live data.
result: PASSED (initially only after workarounds; both root-cause bugs have since been fixed — see Gaps). Core criteria confirmed: server booted cleanly, all 7 ResilienceService vendor policies (paystack, paystackRefund, termiiAuth, termiiDelivery, anthropic, s3, fcm) logged ready without throwing, and GET /api/v1/lgas returned 200 with live DB data. Two blocking bugs surfaced during testing (deleteOutDir/tsbuildinfo cache race, and npm run dev:backend not loading root .env) and were fixed via quick task 260716-lbl, then re-verified with a genuine double cold-start (no manual workarounds, no manually exported env vars) — both passed cleanly on both runs.

### 2. Single Vendor Outage Is Isolated
expected: Simulate a Paystack outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable host, or trigger 5+ consecutive failures) — wallet top-up/payment calls fail fast with a "Paystack is temporarily unavailable" message, while unrelated features (browsing events, tourism attractions, S3 uploads) continue working normally.
result: |
  PASSED, via two complementary checks (see note on methodology below).

  Live E2E (isolated backend instance on port 3098, real DB, `PAYSTACK_SECRET_KEY`
  overridden to a garbage value for that one process launch only — root `.env` untouched,
  the existing dev instance on port 3001 was left running undisturbed): registered a test
  user, then fired 7 consecutive `POST /wallet/topup` calls. All 7 returned `503` with
  exactly `"Paystack is temporarily unavailable, please try again shortly"` in ~150-350ms
  each (no hang). In the same run, unrelated endpoints stayed fully healthy on 200s with
  live data: `GET /lgas`, `GET /attractions`, `GET /events`, `GET /users/me`, and
  `GET /wallet/balance` (wallet *reads* are unaffected — only the Paystack-backed write
  path fails). Confirmed via backend log that every one of the 7 calls made a real live
  HTTP round-trip to `api.paystack.co` and got a genuine `401 Invalid key` back each time.

  Automated (`backend/src/resilience/__tests__/vendor-outage-isolation.spec.ts`, all 4
  tests passing): proves the other half of the criterion that the live 401 method above
  cannot — the actual circuit-breaker fail-fast behavior. Using the real `ResilienceService`
  (only Prisma mocked) fed 5 consecutive *transient* (HTTP 500) failures, confirms the
  paystack breaker opens at exactly `failureThreshold` (5), that calls 6+ reject
  immediately WITHOUT invoking the vendor function again, and that the S3 policy on the
  same `ResilienceService` instance is completely unaffected and keeps succeeding
  throughout — direct proof of cross-vendor isolation.

  Methodology note: the UAT wording's first suggested method ("point PAYSTACK_SECRET_KEY
  at an unreachable host") isn't actually possible as written —
  `backend/src/common/services/paystack.service.ts` hardcodes
  `baseUrl = 'https://api.paystack.co'`; the secret key and the target host are
  independent, and there's no env var for the URL. Separately, `isTransientError()` in
  `resilience.service.ts` deliberately excludes HTTP 401 (bad credentials) from breaker
  accounting — by design, only 408/429/5xx and network-level errors count, so credential
  errors alone never open the breaker or prove the fail-fast-without-network-call
  behavior. Used the two checks above together instead of one live call that couldn't
  cover both halves.

  Skipped a live S3 upload as the "unrelated feature" proof for S3 specifically, to avoid
  writing a real object to the AWS bucket configured in `.env` without explicit
  authorization (that `.env` has previously-flagged live-looking credentials — see the
  Note below). S3 isolation is instead covered by the automated test above, which proves
  cross-vendor isolation at the `ResilienceService` layer without any real AWS call.

  Side observation for Test 3: while running the automated test, `ResilienceService`'s
  `onBreak` handler logged the raw `reason.error` object as the second arg to
  `logger.error()` (visible in test output as `Object(1) { response: { status: 500 } }`).
  Worth checking directly with a realistic axios-error shape (which includes
  `config.headers.Authorization`) when Test 3 runs, rather than assuming the mocked
  `{ response: { status: 500 } }` shape used here is representative.

### 3. Circuit-Breaker Open Event Does NOT Leak Vendor Secrets to Logs
expected: When a vendor breaker opens (e.g. after simulated Paystack failures), the application log line for "Circuit breaker OPEN for paystack" contains only the vendor name and a generic error message — it must NOT print the raw vendor error object, and specifically must never show an Authorization header or bearer token value in the log output.
result: |
  ISSUE FOUND, then FIXED (commit pending). This was the exact bug flagged as a side
  observation during Test 2: `ResilienceService.onBreak()` at `resilience.service.ts:130`
  called `this.logger.error(\`Circuit breaker OPEN for ${vendor}\`, reason.error as any)` —
  passing the *raw* vendor error object as the second arg to NestJS's `Logger.error()`.

  Reproduced with a realistic axios-error shape (matching exactly what
  `paystack.service.ts` throws on a real HTTP failure: `error.config.headers.Authorization
  = 'Bearer <secret>'`, plus `error.config.data` with the request body). Confirmed via a
  spied `Logger.prototype.error` and the real `ConsoleLogger` stderr output that NestJS's
  default logger prints the ENTIRE object on a second line — `Authorization: Bearer
  sk_live_...` in full, plus the request body (customer email + amount). This would have
  put every vendor's live secret key into stdout/stderr and any downstream log aggregator
  the first time a breaker opened in production.

  Fix applied in `backend/src/resilience/resilience.service.ts`: added a
  `summarizeVendorError()` helper that reduces any vendor error to `status=<n>
  code=<code> <message>` — never headers, request/response bodies, or the raw object —
  and reused it for both the OTel span attribute (previously only inlined for the span,
  now shared) and the log line, which now reads `Circuit breaker OPEN for paystack:
  status=500 code=ERR_BAD_RESPONSE Request failed with status code 500` with zero secret
  material. `logger.error()` no longer receives `reason.error` as an argument at all.

  Added a permanent regression test in `resilience.service.spec.ts` ("never logs the raw
  vendor error — a realistic axios error with an Authorization header must not reach
  Logger.error (UAT Test 3)") that feeds the same realistic axios-error shape and asserts
  the bearer token, the literal string "Authorization", and the request body never appear
  anywhere in the arguments passed to `Logger.error()`. Full resilience suite (19 tests)
  and full backend suite (444 tests) pass after the fix; one unrelated pre-existing
  failure (`tour-guides.service.spec.ts` fails to even load due to a missing native
  `detect-libc` module for `bcrypt` in this environment) is untouched by this change.

### 4. FCM Token Registration Preserves Existing Profile Data
expected: A user with existing metadata (e.g. saved preferences) registers a new FCM push token. After registration, the previously-saved preference data is still present on the user record — not wiped out by the token write.
result: |
  PASSED. This was already fixed earlier in the phase (commit fe0ecca, plan 11-10,
  tracked as WR-01) — `NotificationsService.registerToken()` in
  `backend/src/modules/notifications/notifications.service.ts:57-65` reads the user's
  existing `metadata` via `findUnique`, spreads it, then adds `fcmToken` before writing
  back, instead of overwriting the whole JSON column with `{ fcmToken: token }`.

  Verified live end-to-end against the running dev backend (port 3001, real DB): registered
  a fresh test user via `POST /auth/register`, seeded `metadata` directly via Prisma with
  `{ preferences: { theme: 'dark', language: 'yo' }, someOtherKey: 'keep-me' }` (simulating
  pre-existing saved profile data — there's no dedicated "set preferences" endpoint, so
  metadata was seeded at the DB layer as the closest real-world equivalent), then called the
  real `POST /notifications/register-token` endpoint with a bearer token for that user.
  Metadata after the call was
  `{ fcmToken: 'test-fcm-token-abc123', preferences: { theme: 'dark', language: 'yo' },
  someOtherKey: 'keep-me' }` — both pre-existing keys survived untouched alongside the new
  `fcmToken`. Test user and wallet cleaned up afterward.

  Also covered by two permanent unit tests already added in `notifications.service.spec.ts`
  at fix time: "Test 1: merges the new fcmToken into existing metadata, preserving
  pre-existing keys" and "Test 2: writes just { fcmToken } when there is no prior metadata
  (null), without crashing" — the null-metadata edge case isn't practical to re-verify live
  (every registered user gets `metadata: null` by default) but is exercised by the unit test.

### 5. AI Chat/Itinerary Streaming Recovers From a Slow/Down Anthropic
expected: If the Anthropic API is slow or unreachable, an AI chat or itinerary-generation request does not hang indefinitely — it times out within roughly 8 seconds and returns a graceful error/fallback to the client instead of a stuck connection.
result: |
  ISSUE FOUND, then FIXED. Verified two ways: the pre-existing fake-timer regression
  suite (Test A/B/C in `ai.service.spec.ts`, using the real `ResilienceService`, hung-stream
  mocks) confirmed the per-client-request contract — no SSE error before ~8000ms, an SSE
  error after 8100ms, and the breaker opens after 3 consecutive timeouts — but those mocks
  are plain objects with no `.on()` method, so they could never exercise the real Anthropic
  SDK's internal event machinery.

  A genuine live E2E check filled that gap: spun up an isolated backend instance (port
  3099, real DB/Redis, existing dev instance on 3001 left untouched) with
  `ANTHROPIC_BASE_URL` pointed at a local TCP "black-hole" server (accepts connections,
  never responds — simulates an unreachable/hung Anthropic) via the SDK's documented
  `ANTHROPIC_BASE_URL` env var, no source changes needed for the setup itself. Called the
  real `POST /api/v1/ai/itinerary` endpoint (no auth guard). Result: HTTP 201 after
  ~8.04s with the expected SSE `event: error` / `"AI service unavailable"` frame — the
  per-request contract held. BUT immediately after, the entire backend process crashed
  (confirmed reproducible on a second identical run): an uncaught `APIUserAbortError`
  thrown from deep inside `@anthropic-ai/sdk`'s `MessageStream` internals, taking down
  every user's connection, not just the one hitting the slow vendor — the opposite of
  vendor isolation, the core premise of this phase.

  Root cause (traced against `node_modules/@anthropic-ai/sdk/src/lib/MessageStream.ts`):
  `MessageStream` is its own lightweight event emitter (not Node's `EventEmitter`, but the
  same "unhandled 'error' crashes the process" contract). When cockatiel's 8000ms timeout
  aborts the request's `AbortSignal`, the SDK's internal `_run()` promise chain calls
  `#handleError()` → `_emit('abort', error)` (line ~340). `_emit()`'s own logic
  (`resilience.service.ts` equivalent inside the SDK) reads: if no listener is registered
  for that event AND `.done()`/`.finalMessage()`/`.emitted()` was never called on the
  stream, it does a raw `Promise.reject(error)` — an unhandled rejection, which Node
  (v24, default `--unhandled-rejections=throw`) turns into a process crash. `ai.service.ts`
  never attached an `.on('error', ...)` / `.on('abort', ...)` listener to the streams
  returned by `this.anthropic.messages.stream(...)` in `streamChatWithTools` or
  `streamItinerary`, and the abort always happens during `await s.withResponse()` — before
  the stream is ever returned to the caller and before `.finalMessage()` is reachable — so
  neither the "attach a listener" nor the "call .done()/.finalMessage() first" escape hatch
  the SDK itself documents (inline comment at the crash site) was ever exercised.

  This is why 444+ passing unit tests never caught it: every existing mock stream is a
  plain object without an `.on()` method, so none of them could reproduce the SDK's real
  event-dispatch mechanics — only a real `MessageStream` instance, only reachable via a
  live call, exhibits this.

  Fix applied in `backend/src/modules/ai/ai.service.ts` (both `streamChatWithTools` and
  `streamItinerary` call sites): register no-op `s.on('error', () => {})` and
  `s.on('abort', () => {})` on the stream immediately after construction, before awaiting
  `s.withResponse()`. This satisfies the SDK's "at least one listener" check so it never
  falls through to the raw `Promise.reject(error)`; the real failure still surfaces to our
  code exactly as before via `withResponse()`'s own rejection, caught by each method's
  existing outer try/catch — zero change to client-facing behavior or timing.
  `getLgaIntelligence` (uses `.messages.create()`, a real `Promise`, no `MessageStream`
  involved) was never affected — confirmed with its own live call (8.02s, graceful 503
  `"AI service is temporarily unavailable, please try again shortly"`, instance unaffected).

  Re-verified live after the fix: both `POST /ai/itinerary` and `POST /ai/chat` (with a
  real registered user's JWT) against the same black-hole server returned their graceful
  SSE error at ~8.0-8.1s, and — critically — the isolated backend instance stayed up and
  serving `GET /lgas` with a 200 immediately afterward, on both endpoints, confirmed twice.

  Added a permanent regression test in `ai.service.spec.ts` ("UAT Test 5 regression:
  registers no-op 'error' and 'abort' listeners...") asserting `s.on(...)` is called with
  both event names during the hung-connection timeout path; updated the existing mock
  stream helpers (`makeStream`, `mockItineraryStream`, `hungStream`) to include a mocked
  `.on()` so they don't throw `s.on is not a function` now that production code calls it.
  Full backend suite (463 tests, all 40 suites) passes after the fix.

### 6. Breaker State Changes Are Visible in Observability (Sentry/OTel)
expected: When a vendor circuit breaker opens, closes, or half-opens, a corresponding event appears in Sentry (a captured message naming the vendor) and/or the configured OpenTelemetry backend (a span with the breaker state and vendor attributes) — visible to whoever monitors the platform's observability dashboards.
result: |
  PASSED. No live Sentry/OTel target existed anywhere (local `.env` or Railway) at the
  start of this test, so the user created a Sentry project and added a real `SENTRY_DSN`
  to the repo-root `.env`.

  Verified with a real (unmocked) call to the production code path, without touching the
  running dev server or the real Paystack API: a one-off NestJS-testing-module script
  wired `ResilienceService` the same way `resilience.service.spec.ts` does, but left
  `@sentry/nestjs` and `@opentelemetry/api` unmocked, then fed 6 consecutive synthetic
  transient (HTTP 500) failures into `service.execute('paystack', ...)`. The real paystack
  breaker opened at exactly `failureThreshold` (5) — call 6 fail-fasted with "Execution
  prevented because the circuit breaker is open" — and the log line stayed clean
  (`Circuit breaker OPEN for paystack: status=500 synthetic failure #5`, no raw error
  object, consistent with the Test 3 fix). The real `onBreak()` handler called
  `Sentry.captureMessage('Circuit breaker opened: paystack', { level: 'error', tags: {
  vendor: 'paystack', 'resilience.event': 'circuit_open' } })` using the real DSN, and
  `Sentry.flush(5000)` returned `true` (event actually delivered over the network, not
  just queued). User confirmed live in their Sentry Issues feed: an event titled "Circuit
  breaker opened: paystack", Level: Error — exact match to the expected criterion.

  Side observation (not a gap, see note below): the same live check surfaced a second,
  unrelated Sentry event (`listen EADDRINUSE :::3001`, Unhandled, `bootstrap(main.ts)`) —
  confirming Sentry's default uncaught-exception capture is also active, a bonus proof
  point for this test's premise even though it wasn't the event being tested for.

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

### Note (not a gap, flagged only): EADDRINUSE crash on bootstrap surfaced by the Sentry check for Test 6
found_in: Test 6 (Breaker State Changes Are Visible in Observability)
description: |
  While confirming the Test 6 Sentry event, the user's Sentry Issues feed also showed an
  unrelated event: `listen EADDRINUSE: address already in use :::3001`, Level: Error,
  Unhandled, tagged `bootstrap(main.ts)`. Consistent with a second `npm run dev:backend`
  process attempting to bind port 3001 while the existing dev instance was already
  running, and crashing unhandled during `app.listen()` in `main.ts` instead of failing
  gracefully. The already-running instance was confirmed unaffected and healthy
  (`GET /api/v1/lgas` returned live `200` immediately after). Not tracked as a Gap since
  no reproduction steps were deliberately taken and the live instance was never down —
  flagged here only so it's visible if it recurs. If it becomes a recurring nuisance,
  `main.ts`'s `app.listen()` could catch `EADDRINUSE` and log a clear "port already in
  use" message instead of an unhandled crash.

### Gap 4 (RESOLVED): An aborted Anthropic MessageStream crashed the entire backend process, not just the one slow request
found_in: Test 5 (AI Chat/Itinerary Streaming Recovers From a Slow/Down Anthropic)
description: |
  `AiService.streamChatWithTools()` and `AiService.streamItinerary()` in
  `backend/src/modules/ai/ai.service.ts` construct an Anthropic `MessageStream` via
  `this.anthropic.messages.stream(...)` and await `s.withResponse()` inside
  `resilience.execute('anthropic', ...)`, but never attached an `.on('error', ...)` or
  `.on('abort', ...)` listener to the stream. `MessageStream` is its own lightweight event
  emitter (not Node's `EventEmitter`, but the same "unhandled error crashes the process"
  contract). When cockatiel's 8000ms per-attempt timeout aborts the request's
  `AbortSignal`, the SDK's internal `_run()` promise chain reacts by emitting an internal
  `'abort'` event; since zero listeners were registered and neither `.done()` nor
  `.finalMessage()` had ever been called on that stream instance (the abort happens during
  `withResponse()`, before the stream is ever returned to the caller), the SDK's own
  `_emit()` logic falls through to a raw `Promise.reject(error)` — an unhandled promise
  rejection that crashes the entire Node process under Node's default
  `--unhandled-rejections=throw` behavior (confirmed on Node v24).

  Reproduced live and twice-confirmed reproducible: an isolated backend instance (port
  3099, `ANTHROPIC_BASE_URL` pointed at a local TCP black-hole server that accepts
  connections but never responds) received a real `POST /api/v1/ai/itinerary` call, which
  correctly returned a graceful SSE `event: error` at ~8.04s (a fully correct per-request
  contract) — but the entire process then crashed with an uncaught `APIUserAbortError`,
  taking down every other in-flight and future request on that instance, not just the one
  hitting the slow vendor. This is the exact opposite of the phase's core premise (isolate
  a single vendor's failure); it's invisible to the existing fake-timer unit-test suite
  because every mocked stream in `ai.service.spec.ts` is a plain object with no `.on()`
  method, so none of them exercise the real SDK's event-dispatch mechanics — only a live
  call against a real `MessageStream` instance surfaces it.
resolution: |
  Added no-op `s.on('error', () => {})` and `s.on('abort', () => {})` registrations in
  `backend/src/modules/ai/ai.service.ts`, immediately after constructing the stream and
  before awaiting `s.withResponse()`, at both call sites (`streamChatWithTools` and
  `streamItinerary`). This satisfies the SDK's internal "at least one listener registered"
  check, so it never falls through to the raw `Promise.reject(error)` path; the real
  failure still surfaces through `withResponse()`'s own rejection exactly as before, caught
  by each method's existing outer try/catch — no change to client-facing behavior or
  timing. `getLgaIntelligence` (uses `.messages.create()`, a real `Promise`, no
  `MessageStream` involved) was confirmed unaffected by this class of bug both by code
  inspection and a live call (8.02s, graceful 503, instance unaffected).

  Re-verified live after the fix on both `POST /ai/itinerary` and `POST /ai/chat` against
  the same black-hole server: graceful SSE error at ~8.0-8.1s, and the isolated backend
  instance stayed up and kept serving `GET /lgas` with 200s immediately afterward — on
  both endpoints. Added a permanent regression test in `ai.service.spec.ts` asserting the
  stream's `.on(...)` is called with both `'error'` and `'abort'` during the hung-connection
  timeout path, and updated the existing mock stream helpers (`makeStream`,
  `mockItineraryStream`, `hungStream`) to include a mocked `.on()` so they reflect the real
  SDK's shape and don't throw `s.on is not a function` now that production code calls it.
  Full backend suite (463 tests, all 40 suites) passes after the fix.

### Gap 3 (RESOLVED): Circuit-breaker open events logged the raw vendor error, including Authorization headers and request bodies
found_in: Test 3 (Circuit-Breaker Open Event Does NOT Leak Vendor Secrets to Logs)
description: |
  `ResilienceService.onBreak()` in `backend/src/resilience/resilience.service.ts` called
  `this.logger.error(\`Circuit breaker OPEN for ${vendor}\`, reason.error as any)` — the
  raw vendor error object was passed directly as the second argument to NestJS's
  `Logger.error()`. Reproduced with a realistic axios-error shape matching what
  `paystack.service.ts` actually throws (`error.config.headers.Authorization` set to a
  bearer secret), plus the request body. NestJS's default `ConsoleLogger` prints that entire
  object on a second output line, so the vendor's live bearer token/API key and the
  request payload would be written to stdout/stderr — and any log aggregator ingesting
  it — the first time any vendor's breaker opened in production. This was foreshadowed as
  a side observation during Test 2 (mocked error shape hid the leak; the realistic shape
  exposed it).
resolution: |
  Added `summarizeVendorError()` to `resilience.service.ts`, reducing any vendor error to
  a plain `status=... code=... message` string only — never headers, request/response
  bodies, or the raw object. Reused it for both the OTel span's `resilience.breaker.reason`
  attribute and the log line; `Logger.error()` no longer receives `reason.error` at all.
  Added a permanent regression test in `resilience.service.spec.ts` that feeds the same
  realistic axios-error shape and asserts the bearer token, the literal string
  "Authorization", and the request body never appear in any argument passed to
  `Logger.error()`. Full resilience suite (19 tests) and full backend suite (444 tests)
  pass after the fix.

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
