---
phase: quick-260813-lhc
plan: 01
subsystem: security
tags: [nestjs, prisma, ioredis, sentry, jest, tdd, kyc, throttling, webhooks, expo]

# Dependency graph
requires: []
provides:
  - "DojahService.verifyNin / PaystackService.resolveBvn hard-fail with ServiceUnavailableException in production when unconfigured (NODE_ENV==='production')"
  - "otp/send, otp/verify, phone-auth, reset-password throttled at 5 req/60s (matching register/login's F-05 pattern)"
  - "handleFlutterwave regression coverage (missing hash, wrong hash, wrong-length hash, valid-hash dispatch, wallet_topup credit)"
  - "MarketplaceService.handleOrderPayment stock decrement floor-guarded via updateMany(stock: {gte: quantity}) — cannot go negative"
  - "RedisService retryStrategy degraded-mode branch logs at ERROR + Sentry.captureMessage (redis.event=degraded_mode tag)"
  - "mobile/app.json iOS privacy manifest deduplicated (NSPrivacyAccessedAPICategoryUserDefaults appears once)"
affects: [auth, payments, webhooks, marketplace, redis, mobile-ios]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NODE_ENV==='production' gate on ConfigService (DI-mockable) for hard-fail-vs-stub branching in third-party-key-unconfigured code paths"
    - "Floor-guarded Prisma updateMany (where: {..., field: {gte: n}}) as a race-safe alternative to unconditional update/decrement"
    - "Sentry.captureMessage(message, {level:'error', tags:{...}}) explicit alert capture for silent degraded-mode conditions (mirrors resilience.service.ts's circuit-open pattern)"

key-files:
  created:
    - backend/src/common/services/__tests__/dojah.service.spec.ts
  modified:
    - backend/src/common/services/dojah.service.ts
    - backend/src/common/services/paystack.service.ts
    - backend/src/common/services/__tests__/paystack.service.spec.ts
    - backend/src/modules/auth/auth.controller.ts
    - backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts
    - backend/src/modules/marketplace/marketplace.service.ts
    - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
    - backend/src/redis/redis.service.ts
    - backend/src/redis/__tests__/redis.service.spec.ts
    - mobile/app.json

key-decisions:
  - "Flutterwave HMAC compare (already timing-safe since d5aee86) and marketplace stock decrement (already inside the settlement transaction) were NOT re-implemented — investigation confirmed both were already correct; work was redirected to regression tests (Flutterwave) and a floor guard against a genuine concurrency gap (marketplace), per the planner's investigation findings"
  - "Redis fail-open behavior (all `if (!this.client || !this.enabled) return <safe-default>` guards) deliberately left untouched — only the log level + Sentry capture at the degraded-mode retryStrategy branch changed"
  - "Marketplace oversold decrement is skipped and logged, never throws — the settlement transaction has already moved real wallet money by the time the stock write runs, so aborting would roll back a completed payment over an inventory-only concern"

patterns-established:
  - "Hard-fail-in-prod / stub-in-dev branching for any future third-party-KYC-style integration should reuse the `this.config.get<string>('NODE_ENV') === 'production'` + ServiceUnavailableException pattern established here"

requirements-completed: [PRODREADY-01, PRODREADY-02, PRODREADY-03, PRODREADY-04, PRODREADY-05, PRODREADY-06]

# Metrics
duration: 35min
completed: 2026-08-13
---

# Quick Task 260813-lhc: Production Readiness Security Fixes Summary

**Six production-readiness fixes: KYC stub hard-fail in prod, OTP/phone-auth throttling, Flutterwave webhook regression coverage, marketplace oversell floor guard, loud Redis degraded-mode alerting, and iOS privacy manifest dedup.**

## Performance

- **Duration:** ~35 min (task execution; excludes worktree setup and `npm install --workspace=backend` + `prisma generate` bootstrap, which this environment required from scratch)
- **Started:** 2026-08-13T20:41:31Z (first task commit)
- **Completed:** 2026-08-13T20:45:41Z (last task commit)
- **Tasks:** 4/4
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- `DojahService.verifyNin()` and `PaystackService.resolveBvn()` now throw `ServiceUnavailableException` in production when their API keys are unset, closing a fake-`verified:true` KYC bypass that would have let any NIN/BVN pass verification in a misconfigured prod deploy. Non-prod stub behavior (dev/test/CI) is byte-identical to before.
- `otp/send`, `otp/verify`, `phone-auth`, `reset-password` now carry the same `@Throttle({limit:5, ttl:60_000})` decorator `register`/`login` already had — closing the last unthrottled OTP-guessing/credential-stuffing surface.
- `WebhooksService.handleFlutterwave()` gained its first-ever test coverage (previously zero test cases existed for it) — missing-hash, wrong-hash, wrong-length-hash, valid-hash dispatch, and wallet-credit paths are now regression-locked so a future refactor cannot silently reintroduce a non-timing-safe comparison.
- `MarketplaceService.handleOrderPayment`'s stock decrement is now floor-guarded via `updateMany({where: {stock: {gte: quantity}}})` — a concurrent oversell (multiple PENDING orders that individually passed `createOrder`'s pre-payment check but collectively exceed stock) is now skipped and logged at error level instead of silently corrupting the stock figure.
- `RedisService`'s `retryStrategy` degraded-mode branch (fires after 3 failed connection attempts) now logs at `ERROR` level and calls `Sentry.captureMessage` with an alert-worthy `redis.event=degraded_mode` tag, mirroring the existing circuit-breaker-open pattern in `resilience.service.ts`. Fail-open behavior itself (all the `if (!this.client || !this.enabled) return <safe-default>` guards) is unchanged.
- `mobile/app.json`'s iOS `NSPrivacyAccessedAPITypes` array had a byte-identical duplicate `NSPrivacyAccessedAPICategoryUserDefaults` entry — removed, exactly one entry remains (verified via `grep -c` returning 1 and `JSON.parse` succeeding).

## Task Commits

Each task was committed atomically:

1. **Task 1: Hard-fail KYC stubs in production (Dojah NIN + Paystack BVN)** - `8281bde` (fix)
2. **Task 2: Tighten auth throttle + Flutterwave webhook regression coverage** - `d8378a8` (feat)
3. **Task 3: Floor-guard marketplace stock decrement against oversell** - `22fa35b` (fix)
4. **Task 4: Loud-log Redis degraded mode + fix iOS privacy manifest** - `f887ed3` (fix)

**Plan metadata:** commit pending (docs: complete plan) — created by the orchestrator after this SUMMARY

## Files Created/Modified

- `backend/src/common/services/dojah.service.ts` - `verifyNin()` throws `ServiceUnavailableException` in production when unconfigured
- `backend/src/common/services/paystack.service.ts` - `resolveBvn()` throws `ServiceUnavailableException` in production when unconfigured
- `backend/src/common/services/__tests__/dojah.service.spec.ts` - New file; covers prod-throw vs non-prod-stub branches + existing axios-success/failure paths
- `backend/src/common/services/__tests__/paystack.service.spec.ts` - Added 2 tests covering `resolveBvn()`'s prod-throw vs non-prod-stub branches
- `backend/src/modules/auth/auth.controller.ts` - Added `@Throttle(5/60s)` to `sendOtp`, `verifyOtp`, `phoneAuth`, `resetPassword`
- `backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts` - Added `describe('handleFlutterwave', ...)` block with 5 new tests; extended `mockConfig.get` to also return `FLUTTERWAVE_SECRET_KEY`
- `backend/src/modules/marketplace/marketplace.service.ts` - `onSettled`'s stock loop now uses floor-guarded `tx.product.updateMany` instead of unconditional `tx.product.update`
- `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` - Updated the existing stock-decrement test for the new `updateMany` shape; added a new oversold (`count:0`) test
- `backend/src/redis/redis.service.ts` - `retryStrategy`'s `times >= 3` branch now logs `.error()` and calls `Sentry.captureMessage`; added `import * as Sentry from '@sentry/nestjs'`
- `backend/src/redis/__tests__/redis.service.spec.ts` - Added `jest.mock('@sentry/nestjs', ...)` and a new test asserting both the ERROR log and `Sentry.captureMessage` call shape
- `mobile/app.json` - Removed the duplicate `NSPrivacyAccessedAPICategoryUserDefaults` entry from `expo.ios.privacyManifests.NSPrivacyAccessedAPITypes`

## Decisions Made

- Followed the planner's investigation findings verbatim for items 2 and 3 (Flutterwave HMAC and marketplace stock decrement were already fixed by prior work) — added regression tests / a floor guard instead of redundant re-implementation, so the actual security property is verified rather than assumed.
- Used `jest.spyOn(Logger.prototype, 'error')` for both the marketplace oversold-log assertion and the Redis degraded-mode-log assertion, matching the existing pattern already established in `resilience.service.spec.ts` (no new spy convention introduced).

## Deviations from Plan

None — plan executed exactly as written, including the two intentionally-adjusted tasks (Flutterwave regression tests instead of re-fixing an already-fixed HMAC compare; marketplace floor guard instead of re-adding an already-present stock decrement).

## Issues Encountered

- This worktree environment started with no `node_modules` anywhere in the monorepo and no generated Prisma client, so the plan's `npx jest` / `npx tsc` verification commands could not run as written. Resolved by running `npm install --workspace=backend --no-audit --no-fund` (1072 packages, ~39s) and `npx prisma generate` (using the backend's local `prisma@5.11.x` binary, not the conflicting root `prisma@^7.8.0` devDependency) before running any tests. This is a one-time environment bootstrap, not a plan deviation — no plan files were changed to work around it.
- All verification commands from the plan then ran successfully: all 5 touched/new spec files pass (73 tests total across dojah/paystack/webhooks/marketplace/redis specs), `tsc --noEmit` is clean, `grep -c NSPrivacyAccessedAPICategoryUserDefaults mobile/app.json` returns exactly `1`, and `grep -n "@Throttle" backend/src/modules/auth/auth.controller.ts` shows exactly 6 occurrences.
- Confirmed via `git diff --name-only` against the plan's base commit that exactly the 11 files listed in the plan's `files_modified` frontmatter were touched — no unrelated files.

## User Setup Required

None - no external service configuration required. (Sentry DSN and Redis/Paystack/Dojah credentials are pre-existing production configuration, unaffected by this change.)

## Next Phase Readiness

- All 6 must-have truths from the plan are satisfied and test-covered.
- No blockers. This closes the production-readiness gaps identified in the task brief; no follow-up quick task is required by this work itself.

---
*Phase: quick-260813-lhc*
*Completed: 2026-08-13*

## Self-Check: PASSED

All 11 code files + this SUMMARY.md confirmed present on disk. All 4 task commits (`8281bde`, `d8378a8`, `22fa35b`, `f887ed3`) confirmed present in git log.
