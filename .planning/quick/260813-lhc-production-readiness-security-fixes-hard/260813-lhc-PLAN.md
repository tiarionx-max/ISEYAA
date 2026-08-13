---
phase: quick-260813-lhc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/common/services/dojah.service.ts
  - backend/src/common/services/paystack.service.ts
  - backend/src/common/services/__tests__/dojah.service.spec.ts
  - backend/src/common/services/__tests__/paystack.service.spec.ts
  - backend/src/modules/auth/auth.controller.ts
  - backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts
  - backend/src/modules/marketplace/marketplace.service.ts
  - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
  - backend/src/redis/redis.service.ts
  - backend/src/redis/__tests__/redis.service.spec.ts
  - mobile/app.json
autonomous: true
requirements: [PRODREADY-01, PRODREADY-02, PRODREADY-03, PRODREADY-04, PRODREADY-05, PRODREADY-06]

must_haves:
  truths:
    - "In production (NODE_ENV=production), NIN verification (DojahService) and BVN verification (PaystackService) throw ServiceUnavailableException instead of returning a fake verified:true when their API keys are unset"
    - "In non-production environments (dev/test/CI), NIN/BVN verification stub behavior is byte-identical to today — still returns verified:true when keys are unset"
    - "Flutterwave webhook signature verification is confirmed timing-safe (crypto.timingSafeEqual) by an automated regression test — no plain string comparison exists or is reintroduced"
    - "Marketplace stock decrement on order-payment settlement never drives a product's stock negative — an oversold decrement is skipped and loudly logged instead of silently applied"
    - "Auth OTP-related endpoints (otp/send, otp/verify, phone-auth, reset-password) carry an explicit tighter-than-global @Throttle decorator, matching the existing register/login pattern"
    - "Redis entering degraded mode after 3 failed connection attempts logs at ERROR level (not WARN) and is captured by Sentry.captureMessage with an alert-worthy tag"
    - "mobile/app.json's iOS NSPrivacyAccessedAPITypes array contains exactly one NSPrivacyAccessedAPICategoryUserDefaults entry, not two"
  artifacts:
    - path: "backend/src/common/services/dojah.service.ts"
      provides: "Production hard-fail on unconfigured NIN verification"
      contains: "ServiceUnavailableException"
    - path: "backend/src/common/services/paystack.service.ts"
      provides: "Production hard-fail on unconfigured BVN verification"
      contains: "ServiceUnavailableException"
    - path: "backend/src/common/services/__tests__/dojah.service.spec.ts"
      provides: "New test file covering prod-throw vs non-prod-stub branches"
      contains: "NODE_ENV"
    - path: "backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts"
      provides: "Regression coverage for handleFlutterwave signature verification"
      contains: "handleFlutterwave"
    - path: "backend/src/modules/auth/auth.controller.ts"
      provides: "Tighter throttle on OTP/phone-auth/reset-password endpoints"
      contains: "otp/send"
    - path: "backend/src/modules/marketplace/marketplace.service.ts"
      provides: "Floor-guarded stock decrement inside handleOrderPayment's onSettled callback"
      contains: "updateMany"
    - path: "backend/src/redis/redis.service.ts"
      provides: "Loud degraded-mode alerting"
      contains: "Sentry.captureMessage"
    - path: "mobile/app.json"
      provides: "Deduplicated iOS privacy manifest"
  key_links:
    - from: "KycService.verifyNin/verifyBvn"
      to: "DojahService.verifyNin / PaystackService.resolveBvn"
      via: "throws ServiceUnavailableException in production when unconfigured, propagates as 503 to the caller"
      pattern: "ServiceUnavailableException"
    - from: "RedisService.onModuleInit retryStrategy"
      to: "logger.error + Sentry.captureMessage"
      via: "fires when times >= 3 (Redis unreachable after 3 attempts)"
      pattern: "Sentry\\.captureMessage"
    - from: "MarketplaceService.handleOrderPayment onSettled"
      to: "tx.product.updateMany"
      via: "atomic floor-guarded decrement inside the existing settlement $transaction"
      pattern: "stock:\\s*\\{\\s*gte"
---

<objective>
Six independent production-readiness fixes bundled into one quick task, grouped into four tasks by subsystem. Investigation during planning found that 2 of the 6 items reported in the task brief are **already fixed** in the current codebase (Flutterwave webhook HMAC compare already uses `crypto.timingSafeEqual`; marketplace stock decrement already exists inside `handleOrderPayment`'s settlement transaction) — those two get regression-test coverage / a defensive hardening pass instead of a redundant re-implementation, so the actual security property is verified rather than assumed.

Purpose: Close real production gaps — silent fake-pass KYC stubs, unthrottled OTP/phone-auth brute-force surface, silent Redis failure with no alerting, and an iOS privacy-manifest duplicate that risks App Store rejection — without touching any of this session's other unrelated code.
Output: 4 execution tasks across backend (KYC hard-fail, auth throttle + webhook test, marketplace oversell guard, Redis loud-logging) and mobile (privacy manifest dedupe), each independently verifiable via `npx jest` / grep.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

<investigation_findings>
Confirmed during planning (do not re-derive — act on these directly):

1. **KYC stubs (dojah.service.ts / paystack.service.ts)** — CONFIRMED BUG. Both `DojahService.verifyNin()` (line 31-34) and `PaystackService.resolveBvn()` (line 113-116) return `{ verified: true, ... }` unconditionally whenever their respective API key env vars are unset, in ANY environment including production. This codebase's canonical "are we in production" check is `process.env.NODE_ENV === 'production'` (see `backend/src/main.ts:45,58` — `APP_ENV` is a DIFFERENT var used only for Sentry/Infisical environment tagging, not application-level branching; do not use it here). Both services already inject `ConfigService` and already call `this.config.get<string>(...)` for their own API keys — use `this.config.get<string>('NODE_ENV')` (same DI-mockable pattern the existing test suites already use) rather than raw `process.env.NODE_ENV`, so unit tests can drive both branches via the existing `mockConfig.get` fixture pattern.

2. **Flutterwave webhook signature check** — ALREADY FIXED, not a current bug. `WebhooksService.handleFlutterwave()` (`backend/src/modules/webhooks/webhooks.service.ts:111-128`) already compares the `verif-hash` header against `FLUTTERWAVE_SECRET_KEY` using `crypto.timingSafeEqual` with a length-check guard (matching the Paystack handler's HMAC-SHA512 pattern immediately above it). This was fixed in a prior commit (`d5aee86`). The gap that remains: `backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts` has ZERO test cases for `handleFlutterwave` — every test in the file exercises `handlePaystack` only. Add regression tests so this timing-safe behavior can never silently regress.

3. **Marketplace stock decrement** — ALREADY IMPLEMENTED, not missing. `MarketplaceService.handleOrderPayment()`'s `onSettled` callback (`backend/src/modules/marketplace/marketplace.service.ts:390-398`) already decrements `product.stock` for every order item, atomically inside the same `prisma.$transaction` that `SettlementService.settle()` opens (SELECT FOR UPDATE on wallet rows + this decrement all commit-or-rollback together). What is genuinely missing: the decrement (`data: { stock: { decrement: item.quantity } }`) has no floor guard — under extreme concurrency where multiple PENDING orders collectively exceed available stock (each individually passed `createOrder`'s pre-payment stock check, but stock is never reserved at order-creation time), the decrement can drive `stock` negative. Add a floor-guarded `updateMany` (`where: { id, stock: { gte: item.quantity } }`) so an oversold decrement is skipped and loudly logged instead of corrupting the stock figure — this does NOT change the settlement/wallet logic, only the stock-write inside the existing callback.

4. **Auth throttling** — PARTIALLY already done. `AuthController.register()` and `.login()` (`backend/src/modules/auth/auth.controller.ts:31,40`) already carry `@Throttle({ default: { limit: 5, ttl: 60_000 } })` (comment: "F-05"). The endpoints that do NOT have this and inherit only the global 100/60s default are `otp/send`, `otp/verify`, `phone-auth`, and `reset-password` — these are exactly the OTP-guessing/credential-stuffing surface the task is concerned about. Add the same `@Throttle({ default: { limit: 5, ttl: 60_000 } })` decorator to all four, matching the existing F-05 pattern and comment style exactly.

5. **Redis degraded-mode logging** — CONFIRMED GAP. `backend/src/redis/redis.service.ts:29` logs `this.logger.warn('Redis unreachable after 3 attempts — entering degraded mode')` inside the `retryStrategy` callback when `times >= 3`. Change to `logger.error` with a clearer message, AND add `Sentry.captureMessage(..., { level: 'error', tags: {...} })` mirroring the exact alert-worthy pattern already established in `backend/src/resilience/resilience.service.ts:140-143` (`onBreak` — "D-09: circuit-open is alert-worthy; captured explicitly since no global exception filter is registered"). Do NOT touch the fail-open behavior itself (all the `if (!this.client || !this.enabled) return <safe-default>` guards throughout the file) — that is an intentional, unrelated design choice per CLAUDE.md's audit-log-swallowing precedent. Only the log level + Sentry capture at line 29 changes.

6. **iOS privacy manifest duplicate** — CONFIRMED. `mobile/app.json`'s `expo.ios.privacyManifests.NSPrivacyAccessedAPITypes` array (lines 26-39) contains the exact same `{ NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] }` object twice. Remove the duplicate, leaving exactly one entry. Do NOT add File Timestamp / System Boot Time / Disk Space categories — no grep evidence in `mobile/` confirms the app uses APIs in those categories, and the task brief explicitly says not to add categories speculatively.
</investigation_findings>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hard-fail KYC stubs in production (Dojah NIN + Paystack BVN)</name>
  <files>backend/src/common/services/dojah.service.ts, backend/src/common/services/paystack.service.ts, backend/src/common/services/__tests__/dojah.service.spec.ts, backend/src/common/services/__tests__/paystack.service.spec.ts</files>
  <behavior>
    - dojah.service.ts verifyNin(): when apiKey/appId unset AND NODE_ENV==='production' -> throws ServiceUnavailableException, logs via this.logger.error(...), makes NO axios call.
    - dojah.service.ts verifyNin(): when apiKey/appId unset AND NODE_ENV!=='production' (including undefined, 'development', 'test') -> unchanged existing behavior: this.logger.warn(...) + returns { verified: true, name: 'Stub User' }.
    - paystack.service.ts resolveBvn(): same two branches, mirroring the exact same NODE_ENV check, throwing ServiceUnavailableException in prod (this class already imports ServiceUnavailableException — reuse it, do not import a new exception type) and preserving the existing stub return { verified: true, firstName: 'Stub', lastName: 'User' } in non-prod.
  </behavior>
  <action>
In backend/src/common/services/dojah.service.ts: inside verifyNin(nin), the existing "if (!this.apiKey || !this.appId) { ... return { verified: true, name: 'Stub User' }; }" block (currently lines 31-34) must branch on this.config.get&lt;string&gt;('NODE_ENV'). When it equals 'production': log this.logger.error('[DOJAH] NIN verification unavailable in production — DOJAH_API_KEY/DOJAH_APP_ID not configured') and throw new ServiceUnavailableException('NIN verification is temporarily unavailable') (add ServiceUnavailableException to the existing @nestjs/common import). Otherwise, keep the current logger.warn + stub return exactly as-is.

In backend/src/common/services/paystack.service.ts: inside resolveBvn(bvn), the existing "if (!secretKey) { ... return { verified: true, firstName: 'Stub', lastName: 'User' }; }" block (currently lines 113-116) gets the identical branch: this.config.get&lt;string&gt;('NODE_ENV') === 'production' -> this.logger.error('Paystack BVN verification unavailable in production — PAYSTACK_SECRET_KEY not configured') + throw new ServiceUnavailableException('BVN verification is temporarily unavailable') (already imported in this file — no new import needed). Otherwise keep the current warn + stub return.

Do NOT touch initiatePayment(), chargeAuthorization(), or refundCharge() in paystack.service.ts — those already throw on a missing secret key unconditionally (no stub path exists there to guard).

Create backend/src/common/services/__tests__/dojah.service.spec.ts (new file — none currently exists). Mirror the existing DI/mocking pattern from backend/src/common/services/__tests__/paystack.service.spec.ts (mock ConfigService with a get: jest.fn((key, def) => ({...}[key] ?? def)) fixture, jest.mock('axios')). Cases: (a) prod + no keys -> throws ServiceUnavailableException, axios never called; (b) non-prod + no keys -> returns { verified: true, name: 'Stub User' }; (c) keys present -> existing axios-success and axios-failure paths (BadRequestException on axios reject) still work unchanged — reuse/adapt the existing axios-mock pattern from paystack.service.spec.ts since dojah.service.ts also uses axios.get.

In backend/src/common/services/__tests__/paystack.service.spec.ts, add to the describe('resolveBvn()', ...) block: two new tests — (a) mockConfig.get returning no PAYSTACK_SECRET_KEY AND NODE_ENV: 'production' -> resolveBvn() rejects with ServiceUnavailableException; (b) no PAYSTACK_SECRET_KEY AND no NODE_ENV (or 'development') -> resolves to { verified: true, firstName: 'Stub', lastName: 'User' }. Existing tests in this file already always provide PAYSTACK_SECRET_KEY: 'sk_test_xxx' via the shared mockConfig fixture, so they are unaffected by this change — confirm this stays true after editing.
  </action>
  <verify>
    <automated>cd backend && npx jest src/common/services/__tests__/dojah.service.spec.ts src/common/services/__tests__/paystack.service.spec.ts --silent</automated>
  </verify>
  <done>dojah.service.ts and paystack.service.ts both throw ServiceUnavailableException in production when their respective keys are unset, and preserve today's stub behavior in every non-production NODE_ENV value; new dojah.service.spec.ts + updated paystack.service.spec.ts pass, covering both branches for both services.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tighten auth throttle on OTP/phone-auth/reset-password + lock in Flutterwave webhook signature regression coverage</name>
  <files>backend/src/modules/auth/auth.controller.ts, backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts</files>
  <behavior>
    - auth.controller.ts: otp/send, otp/verify, phone-auth, reset-password each reject a 6th request within 60s from the same client with a 429 (ThrottlerGuard is already globally registered in app.module.ts — adding @Throttle is sufficient, no new guard wiring needed).
    - webhooks.service.spec.ts: handleFlutterwave(hash, body) — valid hash (equal to configured FLUTTERWAVE_SECRET_KEY) processes the event; missing hash -> UnauthorizedException; wrong-length or mismatched hash -> UnauthorizedException; a charge.completed/successful event with metadata.type in the shared switch (e.g. order_payment) dispatches via the event bus, mirroring the existing handlePaystack dispatch assertions already in this file.
  </behavior>
  <action>
In backend/src/modules/auth/auth.controller.ts, add @Throttle({ default: { limit: 5, ttl: 60_000 } }) immediately above each of the following four handlers, matching the exact decorator + comment style already used above register()/login() (lines 29-31, 38-40 — reuse the "F-05" comment wording, e.g. "// F-05: stricter than the app-wide default (100 req/60s) — OTP/phone-auth endpoints are the primary brute-force surface."): sendOtp() (@Post('otp/send')), verifyOtp() (@Post('otp/verify')), phoneAuth() (@Post('phone-auth')), resetPassword() (@Post('reset-password')). Throttle is already imported from @nestjs/throttler at the top of the file — no new import needed. Do not modify refresh() or logout() — those are not part of this fix (refresh/logout are not brute-force-guessable surfaces the same way).

In backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts, add a new top-level describe('handleFlutterwave', ...) block (the file currently only tests handlePaystack). Add a FLUTTERWAVE_SECRET_KEY constant, extend the existing mockConfig.get jest fn to also return it for that key (currently mockConfig.get only returns PAYSTACK_WEBHOOK_SECRET for one key and '' otherwise — extend the switch/ternary to cover both keys without breaking existing Paystack tests). Test cases: (1) missing hash header -> service.handleFlutterwave(undefined as any, body) (or '') rejects UnauthorizedException; (2) hash present but not equal to the configured secret -> rejects UnauthorizedException; (3) hash exactly equal to FLUTTERWAVE_SECRET_KEY with a charge.completed/data.status:'successful'/metadata.type:'order_payment' body -> resolves { received: true } and mockEvents.emit was called with 'payment.order_payment'; (4) same valid-hash event but metadata.type:'wallet_topup' with a walletId -> mockWallet.creditWallet called (mirror the existing Paystack wallet_topup test's assertion shape, adjusted for Flutterwave's naira-not-kobo amount field data.amount).
  </action>
  <verify>
    <automated>cd backend && npx jest src/modules/webhooks/__tests__/webhooks.service.spec.ts --silent</automated>
  </verify>
  <done>otp/send, otp/verify, phone-auth, reset-password all carry the same @Throttle(5/60s) decorator register/login already have; webhooks.service.spec.ts has passing handleFlutterwave coverage for missing-hash, wrong-hash, and valid-hash dispatch paths, confirming crypto.timingSafeEqual behavior is regression-locked.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Floor-guard marketplace stock decrement against oversell</name>
  <files>backend/src/modules/marketplace/marketplace.service.ts, backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts</files>
  <behavior>
    - handleOrderPayment's onSettled callback: for each order item, if product.stock >= item.quantity, decrement succeeds exactly as today. If product.stock &lt; item.quantity (oversold), the decrement is skipped (stock unchanged, never goes negative) and this.logger.error(...) fires with the productId/orderId/requested-vs-available context.
    - Existing passing test 'wires status flip and stock decrement into the onSettled callback' (line 391) continues to pass unmodified — the tx.product.update call in that test's mock becomes tx.product.updateMany; update the mock/assertion to match the new method name and args shape, do not change its intent.
  </behavior>
  <action>
In backend/src/modules/marketplace/marketplace.service.ts, inside handleOrderPayment's onSettled callback (around line 391-397), replace the existing "for (const item of order.orderItems) { await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } }); }" loop with a floor-guarded version using tx.product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } }), capturing the returned { count }. When count === 0, call this.logger.error() with a message identifying the product id, order id, and requested quantity (e.g. "Stock oversold for product X on order Y — decrement skipped, stock left unchanged. Manual reconciliation required.") and continue the loop (do NOT throw — the settlement transaction must still commit; the buyer already paid and wallets already settled in this same transaction, so aborting here would roll back money movements over an inventory-only concern). This is the ONLY change in this method — do not alter the settlement/wallet/notification logic above or below it.

In backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts, update the existing 'wires status flip and stock decrement into the onSettled callback' test's mockTx fixture: change "product: { update: jest.fn().mockResolvedValue({}) }" to "product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } }", and change the assertion from expecting mockTx.product.update to expecting mockTx.product.updateMany was called with a where clause containing the product id and a stock: { gte: ... } guard. Add one new test in the same describe('handleOrderPayment', ...) block: mockTx.product.updateMany resolves { count: 0 } (oversold case) -> assert the onSettled callback still resolves without throwing, and that the oversold condition was logged at error level (spy on Logger.prototype.error, or reuse whatever logger-assertion pattern this file already has — check the top of the file first before adding a new spy pattern).
  </action>
  <verify>
    <automated>cd backend && npx jest src/modules/marketplace/__tests__/marketplace.service.spec.ts --silent</automated>
  </verify>
  <done>handleOrderPayment's stock decrement uses a floor-guarded updateMany that can never drive stock negative; an oversold decrement is skipped and logged at error level rather than silently corrupting the stock figure or throwing and rolling back an already-settled payment; all marketplace.service.spec.ts tests pass including the updated and new stock-decrement cases.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Loud-log Redis degraded mode + fix iOS privacy manifest duplicate</name>
  <files>backend/src/redis/redis.service.ts, backend/src/redis/__tests__/redis.service.spec.ts, mobile/app.json</files>
  <behavior>
    - redis.service.ts: when the ioredis retryStrategy callback fires with times >= 3, it calls this.logger.error(...) (not .warn) AND Sentry.captureMessage(...) with level: 'error' and a tag identifying this as a Redis-degraded event, then still returns null to stop retrying (unchanged fail-open behavior).
    - mobile/app.json: expo.ios.privacyManifests.NSPrivacyAccessedAPITypes has exactly 1 element (currently 2 identical elements).
  </behavior>
  <action>
In backend/src/redis/redis.service.ts, inside the retryStrategy: (times) => { if (times >= 3) { ... } ... } block (currently line 28-31), change the existing this.logger.warn('Redis unreachable after 3 attempts — entering degraded mode') call to this.logger.error(...) with a clearer message identifying the operational impact (OTP brute-force locking and JWT blacklist are now fail-open until Redis recovers), and add immediately after it a Sentry.captureMessage(...) call with { level: 'error', tags: { 'redis.event': 'degraded_mode' } } — mirror the exact Sentry.captureMessage(message, { level: 'error', tags: {...} }) call shape used in backend/src/resilience/resilience.service.ts:140-143. Add "import * as Sentry from '@sentry/nestjs';" at the top of redis.service.ts (not currently imported). Keep "return null;" unchanged directly after — the retry-stop / fail-open behavior itself must not change, only the two new lines of alerting before it.

In backend/src/redis/__tests__/redis.service.spec.ts, add a jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn(), captureException: jest.fn() })) at the top (mirroring backend/src/resilience/__tests__/resilience.service.spec.ts's exact mock shape) and import * as Sentry from '@sentry/nestjs'. Add a new test: construct the service with a REDIS_URL configured, call onModuleInit(), extract the retryStrategy function from the captured RedisMock.mock.calls[0][1].retryStrategy, invoke it with times=3, and assert both Logger.prototype.error fired (spy it via jest.spyOn(Logger.prototype, 'error')) and Sentry.captureMessage was called with a message containing "degraded" and options containing level: 'error'.

In mobile/app.json, inside expo.ios.privacyManifests.NSPrivacyAccessedAPITypes (lines 26-39), delete the second (duplicate) NSPrivacyAccessedAPICategoryUserDefaults/CA92.1 object, leaving exactly one entry in the array. Do not add any other category — no grep evidence in mobile/ was found during planning that the app uses File Timestamp / System Boot Time / Disk Space APIs, and the task brief explicitly says not to add categories speculatively. Validate the file is still valid JSON after the edit (e.g. by re-reading it).
  </action>
  <verify>
    <automated>cd backend && npx jest src/redis/__tests__/redis.service.spec.ts --silent; grep -c NSPrivacyAccessedAPICategoryUserDefaults mobile/app.json</automated>
  </verify>
  <done>Redis retryStrategy's degraded-mode branch logs at error level and calls Sentry.captureMessage with an alert-worthy tag, matching the resilience.service.ts precedent, without changing any fail-open return-value behavior elsewhere in the file; redis.service.spec.ts passes including the new degraded-mode test; mobile/app.json's NSPrivacyAccessedAPICategoryUserDefaults entry appears exactly once (grep -c returns 1) and the file remains valid JSON.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Client (mobile/web) -> Backend KYC endpoints | Citizen-submitted NIN/BVN, verified against Dojah/Paystack third-party identity APIs |
| Paystack/Flutterwave -> Backend webhooks | Untrusted internet-facing POST endpoints; must cryptographically prove origin before acting on payment events |
| Backend -> Redis | Internal infra dependency backing OTP lockout + JWT blacklist; its unavailability silently weakens two independent security controls |
| Client -> Auth endpoints | Untrusted, unauthenticated (pre-login) surface — OTP/phone-auth/reset-password are natural brute-force/credential-stuffing targets |
| Concurrent order payments -> Product.stock | Multiple webhook deliveries / concurrent PENDING orders racing against a shared inventory counter |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|------------------|
| T-260813-01 | Spoofing | DojahService.verifyNin / PaystackService.resolveBvn | mitigate | Task 1 — hard-fail with ServiceUnavailableException in production when API keys are unset, closing the fake-verified:true bypass that would let any NIN/BVN pass KYC in a misconfigured prod deploy |
| T-260813-02 | Tampering | WebhooksService.handleFlutterwave | mitigate (already in place; hardened with tests) | Task 2 — `crypto.timingSafeEqual` already prevents a timing side-channel on the shared-secret comparison; regression tests added so a future refactor cannot silently reintroduce `===` |
| T-260813-03 | Tampering | MarketplaceService.handleOrderPayment stock decrement | mitigate | Task 3 — floor-guarded `updateMany` prevents a race/oversell scenario from driving `product.stock` negative; loudly logged instead of silently corrupting inventory data |
| T-260813-04 | Denial of Service (brute force) | AuthController otp/send, otp/verify, phone-auth, reset-password | mitigate | Task 2 — explicit `@Throttle(5/60s)` on all four, matching the existing register/login pattern; defense-in-depth alongside the existing Redis-backed 3-attempt/15-min OTP lockout |
| T-260813-05 | Denial of Service (silent degradation) | RedisService retryStrategy degraded mode | mitigate | Task 4 — `logger.error` + `Sentry.captureMessage` make a Redis outage (which silently fail-opens OTP lockout and JWT blacklist) operationally visible instead of a buried WARN log line |
| T-260813-06 | Information Disclosure / compliance | mobile/app.json iOS privacy manifest | accept (compliance fix, not a security vuln) | Task 4 — duplicate entry removed; a malformed/duplicated privacy manifest risks App Store review rejection, not a runtime security exposure |
</threat_model>

<verification>
- `cd backend && npx jest src/common/services/__tests__/dojah.service.spec.ts src/common/services/__tests__/paystack.service.spec.ts src/modules/webhooks/__tests__/webhooks.service.spec.ts src/modules/marketplace/__tests__/marketplace.service.spec.ts src/redis/__tests__/redis.service.spec.ts --silent` — all touched/new spec files pass.
- `cd backend && npx tsc --noEmit -p tsconfig.json` — no new type errors introduced across all 5 backend source files touched.
- `grep -c NSPrivacyAccessedAPICategoryUserDefaults mobile/app.json` returns exactly `1`.
- `grep -n "@Throttle" backend/src/modules/auth/auth.controller.ts` shows 6 occurrences (register, login, otp/send, otp/verify, phone-auth, reset-password).
- No file outside the 11 listed in `files_modified` is touched.
</verification>

<success_criteria>
- Production KYC verification hard-fails instead of silently faking a pass when Dojah/Paystack keys are missing; non-prod/dev/CI behavior is unchanged.
- Flutterwave webhook signature verification's existing timing-safe compare is regression-tested, not re-implemented.
- Marketplace stock can no longer go negative from a concurrent oversell during settlement; existing settlement/wallet logic is untouched.
- otp/send, otp/verify, phone-auth, and reset-password carry the same tight throttle register/login already have.
- Redis degraded mode is now an ERROR-level, Sentry-captured event instead of a buried WARN log line; fail-open behavior itself is unchanged.
- mobile/app.json's iOS privacy manifest has no duplicate entries.
- Full backend jest suite for the 5 touched spec files passes; backend tsc is clean; no unrelated files touched.
</success_criteria>

<output>
After completion, create `.planning/quick/260813-lhc-production-readiness-security-fixes-hard/260813-lhc-SUMMARY.md`
</output>
