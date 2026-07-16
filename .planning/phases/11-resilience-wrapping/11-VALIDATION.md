---
phase: 11
slug: resilience-wrapping
status: executed
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
reconciled: 2026-07-16
validated: 2026-07-16
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x |
| **Config file** | `backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`) |
| **Quick run command** | `cd backend && npx jest src/resilience --silent` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~30-60 seconds (quick) / several minutes (full suite incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest src/resilience --silent` (or the specific vendor service's spec file being touched)
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus 11-05's cross-vendor isolation test (`vendor-outage-isolation.spec.ts`) matching success criterion 2
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Reconciled against the final PLAN.md files (planning date 2026-07-16). Task IDs use the `{plan}.{task}` convention (e.g. `01.2` = Plan 11-01, Task 2).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01.1 | 11-01 | 1 | RESIL-01 | — | `cockatiel@^3.2.1` installed and pinned (not the Node≥22/ESM-only `4.0.0`) | manual/CLI | `cd backend && npm ls cockatiel` shows `3.2.1` | ✅ | ✅ green |
| 01.2 | 11-01 | 1 | RESIL-01 | T-11-04 | `ResilienceService` builds one cached policy per vendor at `onModuleInit`, reading PlatformConfig with hardcoded fallback; breaker opens on transient failures only, never on 4xx business errors | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -x` | ✅ | ✅ green |
| 01.2 | 11-01 | 1 | RESIL-01 | T-11-02 | Circuit breaker opens after N consecutive transient failures, stays open (fails fast, no further calls to the mock vendor fn) until `halfOpenAfter` elapses | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -t "circuit breaker" -x` | ✅ | ✅ green |
| 01.2 | 11-01 | 1 | RESIL-02 | T-11-03 | `onBreak` handler calls `Sentry.captureMessage` and creates an OTel span with `resilience.breaker.state: 'open'` attribute (D-09) | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -t "onBreak" -x` | ✅ | ✅ green |
| 01.3 | 11-01 | 1 | RESIL-01 | — | `ResilienceModule` (`@Global()`) registered in `AppModule`; `ResilienceService` injectable app-wide | unit + compile | `cd backend && npx jest src/resilience --silent && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 02.1 | 11-02 | 2 | RESIL-01 | T-11-01 | `PaystackService.initiatePayment`/`resolveBvn`/`refundCharge` throw `ServiceUnavailableException` when the resilience policy's error escapes; `resolveBvn`'s business-response `BadRequestException` path is preserved and distinct | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/paystack.service.spec.ts -x` | ✅ | ✅ green |
| 02.2 | 11-02 | 2 | RESIL-01 | T-11-01 | `S3Service.upload` throws `ServiceUnavailableException` when the resilience policy's error escapes | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/s3.service.spec.ts -x` | ✅ | ✅ green |
| 03.1 | 11-03 | 2 | RESIL-01 | T-11-03 | `NotificationsService.sendPush` still returns `{sent:false, reason:'send_failed'}` (never throws) when FCM is circuit-open (D-02) | unit (tdd) | `cd backend && npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ✅ | ✅ green |
| 03.2 | 11-03 | 2 | RESIL-01 | T-11-01, T-11-02 | `AiService.streamChatWithTools`/`streamItinerary` retry only the connection call, never mid-stream (`maxRetries:0` on the Anthropic client); `getLgaIntelligence` now has error handling and throws `ServiceUnavailableException` | unit (tdd) | `cd backend && npx jest src/modules/ai/__tests__/ai.service.spec.ts -x` | ✅ | ✅ green |
| 04.1 | 11-04 | 2 | RESIL-01 | T-11-03 | `auth.service.ts`'s Termii leg falls through to its existing Twilio/stub fallback chain unchanged when Termii's circuit is open (D-03/D-08) | unit (tdd) | `cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts -x` | ✅ | ✅ green |
| 04.2 | 11-04 | 2 | RESIL-01 | T-11-03, T-11-04 | `delivery.service.ts`'s Termii leg falls through to its existing log-and-swallow fallback unchanged when Termii's circuit is open, independent of `auth.service.ts`'s circuit (D-03/D-08) | unit (tdd) | `cd backend && npx jest src/modules/delivery/__tests__/delivery.service.spec.ts -x` | ✅ | ✅ green |
| 05.1 | 11-05 | 3 | RESIL-01, RESIL-02 | T-11-02, T-11-04 | Simulated Paystack outage opens only the Paystack circuit; a different vendor (S3) policy on the same `ResilienceService` instance is unaffected and continues succeeding (success criterion 2, proven at the facade level — DB-free, deterministic, no full-app/HTTP bootstrap required) | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/vendor-outage-isolation.spec.ts -x` | ✅ | ✅ green |
| 05.2 | 11-05 | 3 | RESIL-01, RESIL-02 | — | Full backend suite green after all 5 plans' constructor changes; no global axios interceptor exists that would compound retry behavior alongside cockatiel | full suite + grep | `cd backend && npm test && grep -rn "axios.interceptors" backend/src` | n/a (regression gate, no new file) | ✅ green |
| 06.1 | 11-06 | GC | RESIL-01, RESIL-02 | CR-01 | `wrap(breaker, retry(...), timeout(...))` reordered so `timeout` is innermost — each retry attempt gets its own timeout budget instead of one shared timeout for the whole retry+backoff sequence | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/retry-timeout-composition.spec.ts -x` | ✅ | ✅ green |
| 06.2 | 11-06 | GC | RESIL-01 | WR-01 | `readConfig()`'s `positiveInt`/`nonNegativeInt` helpers fall back to `RESILIENCE_DEFAULTS` per-key on malformed (non-numeric/negative/NaN) `PlatformConfig` rows instead of silently disabling protection | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -x` | ✅ | ✅ green |
| 06.3 | 11-06 | GC | RESIL-01, RESIL-02 | WR-04 | `isTransientError` no longer counts a bare application bug toward the circuit-breaker consecutive-failure threshold, while `isTaskCancelledError` retry-after-per-attempt-timeout behavior (CR-01) is preserved | unit (tdd) | `cd backend && npx jest src/resilience --silent` | ✅ | ✅ green |
| 07.1 | 11-07 | GC | RESIL-01 | CR-02 | Cockatiel's per-attempt `AbortSignal` forwarded into axios (`signal`) and AWS SDK v3 `send()` (`abortSignal`) at 5 call sites in `paystack.service.ts`/`s3.service.ts`/`notifications.service.ts`, proven by reference-identity assertions | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/paystack.service.spec.ts src/common/services/__tests__/s3.service.spec.ts src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ✅ | ✅ green |
| 08.1 | 11-08 | GC | RESIL-01 | CR-02 | `AbortSignal` propagated into all 3 Anthropic SDK call sites in `ai.service.ts` and both remaining Termii `fetch()` call sites (`auth.service.ts`, `delivery.service.ts`), closing the last 5 of 6 CR-02 defect sites (paired with 11-07) | unit (tdd) | `cd backend && npx jest src/modules/ai/__tests__/ai.service.spec.ts src/modules/auth/__tests__/auth.service.spec.ts src/modules/delivery/__tests__/delivery.service.spec.ts -x` | ✅ | ✅ green |
| 09.1 | 11-09 | GC | RESIL-01 | CR-01, WR-02 | `streamChatWithTools`/`streamItinerary` genuinely bounded by the per-attempt Anthropic timeout and breaker (`const s = anthropic.messages.stream(...); await s.withResponse(); return s;`), proven with fake-timer tests against the real `ResilienceService`; `AbortSignal` reference-identity test added for `ai.service.spec.ts` | unit (tdd, fake timers) | `cd backend && npx jest src/modules/ai/__tests__/ai.service.spec.ts -x` | ✅ | ✅ green |
| 10.1 | 11-10 | GC | RESIL-01 | WR-01 | `NotificationsService.registerToken` reads-then-merges `User.metadata` instead of overwriting pre-existing keys | unit (tdd) | `cd backend && npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ✅ | ✅ green |
| 10.2 | 11-10 | GC | RESIL-01 | WR-02 | `AbortSignal` reference-identity test added for `NotificationsService.sendPush`, closing the notifications.service.ts slice of WR-02 | unit (tdd) | `cd backend && npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ✅ | ✅ green |
| 11.1 | 11-11 | GC | RESIL-01 | WR-03 | `isTransientError` recognizes axios's `ERR_CANCELED` cancellation code as transient | unit (tdd) | `cd backend && npx jest src/resilience --silent` | ✅ | ✅ green |
| 11.2 | 11-11 | GC | RESIL-01 | WR-02 | `AbortSignal` reference-identity tests added for `S3Service.upload`, `auth.service.ts` `sendTermii`, `delivery.service.ts` `sendTermiiDeliveryOtp` — closes the remaining 3-of-5 WR-02 file slice (all 6 CR-02/WR-02 sites now covered across 11-07/08/09/10/11) | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/s3.service.spec.ts src/modules/auth/__tests__/auth.service.spec.ts src/modules/delivery/__tests__/delivery.service.spec.ts -x` | ✅ | ✅ green |
| 11.3 | 11-11 | GC | RESIL-01, RESIL-02 | — | Full backend regression suite green after all 11 plans (confirmed post-audit 2026-07-16: 40/40 suites, 463/463 tests, `npx prisma generate` re-run clean, no `axios.interceptors` global hook) | full suite + grep | `cd backend && npm test && grep -rn "axios.interceptors" backend/src` | n/a (regression gate, no new file) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs use `{plan}.{task}` (e.g. `02.1` = Plan 11-02, Task 1). Reconciled 2026-07-16 against the final PLAN.md task breakdown — supersedes the original `TBD-XX` placeholder rows.*
*Correction from the original draft: `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` was found to ALREADY EXIST (Phase 4 artifact, 415 lines, 8 passing cases) during planning — Task 04.2 modifies it in place rather than creating it. This does not change the Wave 0 gap count materially since the file still needs the new `ResilienceService` provider wired in, but it is not a net-new file.*

---

## Wave 0 Requirements

Wave 0 work is folded into Plan 11-01 (Task 1-3) and the first task of each dependent plan, per the "interface-first" ordering — there is no separate Wave 0 plan file; Plan 11-01 runs first (Wave 1) and every other plan depends on it.

- [ ] Package install: `npm install cockatiel@^3.2.1 @opentelemetry/api@^1.9.1 --workspace=backend` (pin exactly — do NOT let `npm install cockatiel` resolve unpinned to `4.0.0`) — **Plan 11-01, Task 1**
- [ ] `backend/src/resilience/resilience.module.ts` + `resilience.service.ts` + `resilience.types.ts` — net-new module — **Plan 11-01, Tasks 1-3**
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — unit tests for policy construction, PlatformConfig fallback, event wiring — **Plan 11-01, Task 2**
- [ ] `backend/src/common/services/__tests__/paystack.service.spec.ts` — did not exist; needed to test the new `ServiceUnavailableException` throw path — **Plan 11-02, Task 1**
- [ ] `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` — did not exist; needed to verify the swallow-and-report contract survives wrapping (D-02) — **Plan 11-03, Task 1**
- [ ] `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` — **CORRECTED: this file already exists (Phase 4, 8 cases)** — Plan 11-04 Task 2 extends it in place with a new `ResilienceService` provider + 2 new cases, it is not created from scratch
- [ ] A forced-outage isolation spec matching success criterion 2 — implemented as a DB-free, `ResilienceService`-facade-level test (not a full-app e2e with real Postgres) — **Plan 11-05, Task 1** — see rationale below

**Design decision — success criterion 2 verification approach:** The original draft proposed a full e2e/integration spec (`test/jest-e2e.json`, real DB, real HTTP server) to prove "Paystack outage → wallet top-up fails while `GET /api/v1/events` still responds." Planning determined this is better proven, deterministically and without a database dependency, at the `ResilienceService` facade level: since each vendor's cockatiel policy is a fully independent, isolated object in the `Map<Vendor, Policy>` registry (Plan 01), demonstrating that exhausting Paystack's circuit has zero effect on S3's circuit *is* the proof that "a single vendor outage degrades only the dependent feature" — the isolation is structural (separate policy instances), not something that requires a live HTTP round-trip through unrelated controllers to observe. This keeps the test in the fast (`npx jest src/resilience`) sampling loop rather than the slower, DB-dependent e2e suite. The full-app HTTP-level manifestation of this (e.g., an actual `GET /api/v1/events` call succeeding while `POST /wallet/topup` returns 503) is exercised implicitly by every vendor-specific unit test in Plans 02-04 already asserting `ServiceUnavailableException` is thrown correctly at the service layer that controllers depend on.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Circuit-breaker state transitions visible in Grafana/Sentry/OTel stack (success criterion 3) | RESIL-02 | Requires live Grafana Cloud/Sentry dashboards, not reproducible in a unit/e2e test sandbox | Force a vendor outage locally (e.g. mock Paystack timeout), confirm a span with `resilience.breaker.state` attributes appears in the OTel exporter output/collector logs, and confirm a Sentry event is captured with the vendor name in the message | ✅ verified — `11-UAT.md` Test 6 (2026-07-16): user provisioned a real `SENTRY_DSN`, fed 6 consecutive synthetic Paystack failures, `Sentry.flush(5000)` returned `true`, and confirmed a live "Circuit breaker opened: paystack" event in the Sentry Issues feed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (reconciled against actual file-existence checks performed during planning, including the `delivery.service.spec.ts` correction)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Post-execution audit confirms every Per-Task Map row is green against the current codebase (2026-07-16)
- [x] Manual-Only item (Grafana/Sentry/OTel visibility) verified live during UAT, not left outstanding

**Approval:** planner-reconciled 2026-07-16; execution-time sign-off confirmed 2026-07-16 via `/gsd-validate-phase 11` post-execution audit (see below). UAT completed and closed per `11-UAT.md` (5 passed, 1 issue found and fixed).

---

## Validation Audit 2026-07-16

Phase 11 executed across 11 plans (5 original + 6 code-review gap-closure plans: 11-06 through 11-11, closing `11-REVIEW.md` findings CR-01, CR-02, WR-01 through WR-04). The Per-Task Map above was reconciled against the executed codebase, not just the pre-execution plan — original rows 01.1-05.2 were re-verified green and rows for plans 06-11 (previously undocumented in this file) were added.

| Metric | Count |
|--------|-------|
| Gaps found | 2 (documentation-only: stale ⬜ pending statuses on 01-05; plans 06-11 missing from map entirely) |
| Test-coverage gaps (MISSING/PARTIAL) | 0 |
| Resolved | 2 (map updated in place; no new test files needed — all required tests already existed and pass) |
| Escalated | 0 |

**Verification performed:**
- `cd backend && npx jest src/resilience src/common/services/__tests__/paystack.service.spec.ts src/common/services/__tests__/s3.service.spec.ts src/modules/notifications/__tests__/notifications.service.spec.ts src/modules/ai/__tests__/ai.service.spec.ts src/modules/auth/__tests__/auth.service.spec.ts src/modules/delivery/__tests__/delivery.service.spec.ts --silent` → 9 suites, 94 tests, all passing
- `cd backend && npx prisma generate && npm test --silent` → 40 suites, 463 tests, all passing (0 failures)
- `cd backend && npm ls cockatiel` → `3.2.1` (pin confirmed, task 01.1)
- `grep -rn "axios.interceptors" backend/src` → no matches (task 05.2 regression gate confirmed)
- Manual-Only Grafana/Sentry/OTel item cross-checked against `11-UAT.md` Test 6 — confirmed passed live, not merely planned
