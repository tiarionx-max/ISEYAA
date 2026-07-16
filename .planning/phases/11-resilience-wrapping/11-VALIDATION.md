---
phase: 11
slug: resilience-wrapping
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
reconciled: 2026-07-16
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
| 01.1 | 11-01 | 1 | RESIL-01 | — | `cockatiel@^3.2.1` installed and pinned (not the Node≥22/ESM-only `4.0.0`) | manual/CLI | `cd backend && npm ls cockatiel` shows `3.2.1` | ❌ W0 (created by this task) | ⬜ pending |
| 01.2 | 11-01 | 1 | RESIL-01 | T-11-04 | `ResilienceService` builds one cached policy per vendor at `onModuleInit`, reading PlatformConfig with hardcoded fallback; breaker opens on transient failures only, never on 4xx business errors | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -x` | ❌ W0 (created by this task) | ⬜ pending |
| 01.2 | 11-01 | 1 | RESIL-01 | T-11-02 | Circuit breaker opens after N consecutive transient failures, stays open (fails fast, no further calls to the mock vendor fn) until `halfOpenAfter` elapses | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -t "circuit breaker" -x` | ❌ W0 (created by this task) | ⬜ pending |
| 01.2 | 11-01 | 1 | RESIL-02 | T-11-03 | `onBreak` handler calls `Sentry.captureMessage` and creates an OTel span with `resilience.breaker.state: 'open'` attribute (D-09) | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts -t "onBreak" -x` | ❌ W0 (created by this task) | ⬜ pending |
| 01.3 | 11-01 | 1 | RESIL-01 | — | `ResilienceModule` (`@Global()`) registered in `AppModule`; `ResilienceService` injectable app-wide | unit + compile | `cd backend && npx jest src/resilience --silent && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (created by this task) | ⬜ pending |
| 02.1 | 11-02 | 2 | RESIL-01 | T-11-01 | `PaystackService.initiatePayment`/`resolveBvn`/`refundCharge` throw `ServiceUnavailableException` when the resilience policy's error escapes; `resolveBvn`'s business-response `BadRequestException` path is preserved and distinct | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/paystack.service.spec.ts -x` | ❌ W0 (created by this task — file did not exist) | ⬜ pending |
| 02.2 | 11-02 | 2 | RESIL-01 | T-11-01 | `S3Service.upload` throws `ServiceUnavailableException` when the resilience policy's error escapes | unit (tdd) | `cd backend && npx jest src/common/services/__tests__/s3.service.spec.ts -x` | ✅ (existing file — extend with new provider + case) | ⬜ pending |
| 03.1 | 11-03 | 2 | RESIL-01 | T-11-03 | `NotificationsService.sendPush` still returns `{sent:false, reason:'send_failed'}` (never throws) when FCM is circuit-open (D-02) | unit (tdd) | `cd backend && npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ❌ W0 (created by this task — file did not exist) | ⬜ pending |
| 03.2 | 11-03 | 2 | RESIL-01 | T-11-01, T-11-02 | `AiService.streamChatWithTools`/`streamItinerary` retry only the connection call, never mid-stream (`maxRetries:0` on the Anthropic client); `getLgaIntelligence` now has error handling and throws `ServiceUnavailableException` | unit (tdd) | `cd backend && npx jest src/modules/ai/__tests__/ai.service.spec.ts -x` | ✅ (existing file — extend with new provider + cases) | ⬜ pending |
| 04.1 | 11-04 | 2 | RESIL-01 | T-11-03 | `auth.service.ts`'s Termii leg falls through to its existing Twilio/stub fallback chain unchanged when Termii's circuit is open (D-03/D-08) | unit (tdd) | `cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts -x` | ✅ (existing file — extend with new provider + cases) | ⬜ pending |
| 04.2 | 11-04 | 2 | RESIL-01 | T-11-03, T-11-04 | `delivery.service.ts`'s Termii leg falls through to its existing log-and-swallow fallback unchanged when Termii's circuit is open, independent of `auth.service.ts`'s circuit (D-03/D-08) | unit (tdd) | `cd backend && npx jest src/modules/delivery/__tests__/delivery.service.spec.ts -x` | ✅ (existing file, 415 lines/8 cases — CORRECTED from original "does not exist yet" claim; extend with new provider + cases) | ⬜ pending |
| 05.1 | 11-05 | 3 | RESIL-01, RESIL-02 | T-11-02, T-11-04 | Simulated Paystack outage opens only the Paystack circuit; a different vendor (S3) policy on the same `ResilienceService` instance is unaffected and continues succeeding (success criterion 2, proven at the facade level — DB-free, deterministic, no full-app/HTTP bootstrap required) | unit (tdd) | `cd backend && npx jest src/resilience/__tests__/vendor-outage-isolation.spec.ts -x` | ❌ W0 (created by this task) | ⬜ pending |
| 05.2 | 11-05 | 3 | RESIL-01, RESIL-02 | — | Full backend suite green after all 5 plans' constructor changes; no global axios interceptor exists that would compound retry behavior alongside cockatiel | full suite + grep | `cd backend && npm test && grep -rn "axios.interceptors" backend/src` | n/a (regression gate, no new file) | ⬜ pending |

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

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Circuit-breaker state transitions visible in Grafana/Sentry/OTel stack (success criterion 3) | RESIL-02 | Requires live Grafana Cloud/Sentry dashboards, not reproducible in a unit/e2e test sandbox | Force a vendor outage locally (e.g. mock Paystack timeout), confirm a span with `resilience.breaker.state` attributes appears in the OTel exporter output/collector logs, and confirm a Sentry event is captured with the vendor name in the message |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (reconciled against actual file-existence checks performed during planning, including the `delivery.service.spec.ts` correction)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-reconciled 2026-07-16; execution-time sign-off pending `/gsd-execute-phase 11`.
