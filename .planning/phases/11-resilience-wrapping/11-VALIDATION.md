---
phase: 11
slug: resilience-wrapping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
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
- **Before `/gsd-verify-work`:** Full suite must be green, plus a manual/scripted forced-outage smoke test matching success criterion 2 (force a Paystack timeout via a mocked/intercepted axios call, confirm `GET /api/v1/events` still responds normally in the same test run)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-01 | 01 | 0 | RESIL-01 | — | `cockatiel@^3.2.1` installed and pinned (not the Node≥22/ESM-only `4.0.0`) | manual/CLI | `cd backend && npm ls cockatiel` shows `3.2.1` | ❌ W0 | ⬜ pending |
| TBD-02 | TBD | TBD | RESIL-01 | T-11-01 | `ResilienceService` builds one cached policy per vendor at `onModuleInit`, reading PlatformConfig with hardcoded fallback | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -x` | ❌ W0 | ⬜ pending |
| TBD-03 | TBD | TBD | RESIL-01 | T-11-02 | Circuit breaker opens after N consecutive transient failures, stays open (fails fast) until `halfOpenAfter` elapses | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -t "circuit breaker" -x` | ❌ W0 | ⬜ pending |
| TBD-04 | TBD | TBD | RESIL-01 | — | `PaystackService.initiatePayment` throws `ServiceUnavailableException` when the resilience policy's error escapes | unit | `npx jest src/common/services/__tests__/paystack.service.spec.ts -x` | ❌ W0 (no spec file exists) | ⬜ pending |
| TBD-05 | TBD | TBD | RESIL-01 | — | `NotificationsService.sendPush` still returns `{sent:false, reason:'send_failed'}` (never throws) when FCM is circuit-open (D-02) | unit | `npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ❌ W0 (no spec file exists) | ⬜ pending |
| TBD-06 | TBD | TBD | RESIL-01 | — | `AiService.streamChatWithTools`/`streamItinerary` retry only the connection call, never mid-stream; `getLgaIntelligence` now has error handling | unit | `npx jest src/modules/ai/__tests__/ai.service.spec.ts -x` | ✅ (existing file, add cases) | ⬜ pending |
| TBD-07 | TBD | TBD | RESIL-01 | — | Termii legs in `auth.service.ts`/`delivery.service.ts` fall through to existing fallback chains unchanged when Termii's circuit is open (D-03/D-08) | unit | `npx jest src/modules/auth/__tests__/auth.service.spec.ts -x` | ✅ auth / ❌ W0 delivery | ⬜ pending |
| TBD-08 | TBD | TBD | RESIL-02 | T-11-03 | `onBreak` handler calls `Sentry.captureMessage` and creates an OTel span with `resilience.breaker.state: 'open'` attribute (D-09) | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -t "onBreak" -x` | ❌ W0 | ⬜ pending |
| TBD-09 | TBD | TBD | RESIL-02 | — | Simulated Paystack outage → wallet top-up fails with 503 while `GET /api/v1/events` continues responding (success criterion 2) | integration/e2e | `cd backend && npx jest --config test/jest-e2e.json --testPathPattern=resilience` | ❌ W0 (no precedent e2e resilience spec) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are placeholders (TBD) — the planner assigns real plan/task IDs; this table's rows map 1:1 to the Phase Requirements → Test Map produced by research and must be reconciled against the final PLAN.md task IDs during planning.*

---

## Wave 0 Requirements

- [ ] Package install: `npm install cockatiel@^3.2.1 --workspace=backend` (pin exactly — do NOT let `npm install cockatiel` resolve unpinned to `4.0.0`, which is Node≥22/ESM-only and incompatible with this CommonJS backend)
- [ ] `backend/src/resilience/resilience.module.ts` + `resilience.service.ts` + `resilience.types.ts` — net-new module, no existing file to extend
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — unit tests for policy construction, PlatformConfig fallback, event wiring (mock `PrismaService`, mock `@sentry/nestjs`, mock `@opentelemetry/api`'s `trace.getTracer`)
- [ ] `backend/src/common/services/__tests__/paystack.service.spec.ts` — does not exist yet; needed to test the new `ServiceUnavailableException` throw path
- [ ] `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` — does not exist yet; needed to verify the swallow-and-report contract survives wrapping (D-02)
- [ ] `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (or at least the `sendTermiiDeliveryOtp` slice) — does not exist yet
- [ ] A forced-outage e2e/integration spec matching success criterion 2 exactly (Paystack timeout injection + concurrent unrelated-endpoint health check) — no existing precedent; closest analog is the `wallet-invariant` e2e spec structure (`test/jest-e2e.json`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Circuit-breaker state transitions visible in Grafana/Sentry/OTel stack (success criterion 3) | RESIL-02 | Requires live Grafana Cloud/Sentry dashboards, not reproducible in a unit/e2e test sandbox | Force a vendor outage locally (e.g. mock Paystack timeout), confirm a span with `resilience.breaker.state` attributes appears in the OTel exporter output/collector logs, and confirm a Sentry event is captured with the vendor name in the message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
