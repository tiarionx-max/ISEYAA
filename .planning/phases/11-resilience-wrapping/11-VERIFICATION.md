---
phase: 11-resilience-wrapping
verified: 2026-07-17T23:10:00Z
status: human_needed
score: 22/22 must-haves verified (1 human-needed excluded from denominator)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 21/22
  gaps_closed:
    - "Truth #23 — ResilienceService.onBreak()'s plain Logger.error() call no longer leaks the raw vendor error object (which may carry axios's .config.headers.Authorization for Paystack/FCM). Commit b0fcb3c (2026-07-16T21:49:43Z, AFTER the 2026-07-16T20:15:00Z verification that reported this gap as FAILED) added a summarizeVendorError() helper that reduces any vendor error to a plain 'status=<n> code=<code> <message>' string — never headers, request/response bodies, or the raw object — and reused it for both the OTel span attribute and the log line. logger.error() no longer receives reason.error as an argument anywhere in the file. Verified independently: (1) direct source read of resilience.service.ts:113-143 confirms the sanitized safeReason string is used exclusively; (2) re-ran resilience.service.spec.ts and vendor-outage-isolation.spec.ts directly during this verification and observed the live console output now reads `[ResilienceService] ERROR Circuit breaker OPEN for paystack: status=500 code=ERR_BAD_RESPONSE Request failed with status code 500` — no raw object serialization, no Authorization/bearer-token substring anywhere in stdout, reproducing the exact test that previously demonstrated the leak and confirming it no longer occurs; (3) a permanent regression test added in the same commit (resilience.service.spec.ts, 'never logs the raw vendor error...') asserts the bearer token, the literal string 'Authorization', and the request body never appear in any Logger.error() argument, and this test passes."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Force a real vendor outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable/blackholed endpoint, or use a Sentry/OTel-connected staging environment) and confirm a resilience.circuit_breaker.state_change span with resilience.breaker.state=open and vendor attributes actually appears in the live OpenTelemetry collector/Grafana dashboard, and a corresponding Sentry event is captured with the vendor name in the message"
    expected: "Span and Sentry event visible in the live observability stack, matching ROADMAP.md Phase 11 success criterion 3 (RESIL-02)"
    why_human: "Requires live Grafana Cloud / Sentry dashboards and a real OTel exporter pipeline — code-level wiring (Sentry.captureMessage + tracer.startSpan calls, now confirmed sanitized end-to-end including the previously-leaking logger.error call) is confirmed present and unit-tested with mocks, but end-to-end delivery to the observability backend cannot be verified from a local unit-test sandbox"
---

# Phase 11: Resilience Wrapping Verification Report (Re-Verification, Round 4 — Hygiene Re-Run)

**Phase Goal:** A single vendor outage (Paystack, Termii, Anthropic, Cloudflare R2/S3, or Firebase FCM) degrades only the dependent feature, not the whole API, and that degradation is visible in observability
**Verified:** 2026-07-17T23:10:00Z
**Status:** human_needed
**Re-verification:** Yes — re-run requested by v2.0-MILESTONE-AUDIT.md (2026-07-17T22:30:00Z). The prior 11-VERIFICATION.md record (2026-07-16T20:15:00Z, `status: gaps_found`) reported one blocking gap (Truth #23: raw vendor-error-object logging leak in `onBreak()`). Commit `b0fcb3c` (2026-07-16T21:49:43Z — AFTER that verification's timestamp) fixed it, but the verification record was never re-run against the fix. This round independently re-verifies the fix from first principles (not by trusting SUMMARY.md/11-SECURITY.md claims) and additionally investigates a second claim from the milestone audit: that `11-SECURITY.md`'s T-11-03 disposition overstates the scope of what `b0fcb3c` actually fixed.

## Goal Achievement

### Gap Closure Status (from prior 11-VERIFICATION.md, 2026-07-16T20:15:00Z)

| Prior Gap (Truth #23) | Status | Evidence |
|---|---|---|
| `resilience.service.ts`'s `onBreak()` passes the raw vendor error object (`reason.error as any`) as `Logger.error()`'s second argument — a reproducible secret-leak path for axios-based vendors (Paystack/FCM `.config.headers.Authorization`) | ✓ CLOSED | Source now reads (resilience.service.ts:113-114, 134): `const safeReason = reason.isolated ? 'isolated' : reason.error ? summarizeVendorError(reason.error) : 'bad_result';` ... `this.logger.error(\`Circuit breaker OPEN for ${vendor}: ${safeReason}\`);` — `reason.error` is never passed to `Logger.error()`. `summarizeVendorError()` (line 190) extracts only `status`, `code`, and `.message` — never headers, request/response bodies, or the raw object. Directly re-ran `resilience.service.spec.ts` and `vendor-outage-isolation.spec.ts` (the exact suite whose console output previously proved the live leak) and observed the corrected output: `[ResilienceService] ERROR Circuit breaker OPEN for paystack: status=500` / `... status=500 code=ERR_BAD_RESPONSE Request failed with status code 500` — no raw object, no Authorization substring, anywhere in stdout across both runs. |

### Independent Investigation: Does T-11-03's "closed" disposition in 11-SECURITY.md overstate the fix's scope?

The milestone audit flagged that `11-SECURITY.md`'s threat T-11-03 claims blanket closure ("push/SMS catch blocks log only `err.message`, never phone numbers, OTPs, or push token bodies") but that 5 call sites outside `resilience.service.ts` still pass a raw `err` object to `Logger.error()`. Independently grepped and read each site in full context (not taking the audit's word for it):

| Call Site | Raw `err` Passed? | Confirmed | Underlying Error Source | Practical Leak Risk |
|---|---|---|---|---|
| `auth.service.ts:323` — `this.logger.error('Termii request failed — falling back to Twilio', err)` | Yes | ✓ Confirmed by direct read (lines 301-324) | `fetch()` network-level rejection (Termii SMS API) | Lower — Node's native `fetch`/undici does not attach outbound request config (headers/body) to a network-failure `TypeError`, unlike axios's `error.config`. The Termii `api_key` sits in the POST body of a *separate* successful-response-check path (`response.text()`), not in the thrown network error object. |
| `auth.service.ts:364` — `this.logger.error('Twilio request failed', err)` | Yes | ✓ Confirmed by direct read (lines 340-365) | `fetch()` network-level rejection (Twilio SMS API) | Lower — same reasoning; the Basic-auth `Authorization` header (line 353) is set on the outbound request object passed to `fetch()`, not attached to fetch's thrown error on network failure. |
| `delivery.service.ts:349` — `this.logger.error('Termii delivery OTP request failed', err)` | Yes | ✓ Confirmed by direct read (lines 329-350) | `fetch()` network-level rejection (Termii delivery-OTP API) | Lower — identical shape to the two Termii sites above. |
| `ai.service.ts:353` — `this.logger.error('AI stream error', err)` | Yes | ✓ Confirmed by direct read (lines 345-356) | Anthropic SDK `APIError` (thrown by `messages.stream`/`.create`) | Lower — Anthropic SDK error objects carry `.status` and response `.headers` (rate-limit metadata), not the outbound `ANTHROPIC_API_KEY`; the API key is never attached to the SDK's thrown error. |
| `ai.service.ts:546` — `this.logger.error('Itinerary stream error', err)` | Yes | ✓ Confirmed by direct read | Anthropic SDK `APIError` | Lower — same reasoning. |
| `ai.service.ts:579` — `this.logger.error('LGA intelligence request failed', err)` | Yes | ✓ Confirmed by direct read | Anthropic SDK `APIError` | Lower — same reasoning. |

**Finding: the milestone audit's claim is CONFIRMED accurate.** All 5 sites do pass a raw `err` object to `Logger.error()`'s second argument, structurally identical to the pattern that was Critical-severity in `resilience.service.ts`. However, the practical severity genuinely is lower than the original finding for the reason both the audit and this independent check converge on: these call sites are fed by `fetch()` (Termii/Twilio, which does not attach outbound request config to network-failure errors the way axios does) or the Anthropic SDK (whose `APIError` carries only response data, not the outbound API key) — not by axios, whose `error.config.headers.Authorization` was the exact mechanism that made the `resilience.service.ts` finding a reproducible live secret leak. `b0fcb3c`'s commit message and diff confirm its scope was `resilience.service.ts` only — it did not touch any of these 5 sites. `11-SECURITY.md`'s T-11-03 disposition text ("push/SMS catch blocks log only `err.message`") is therefore not accurate for these 5 sites as currently written (they still log the whole `err` object, not just `.message`) — this is a documentation-accuracy gap in the security register, not a newly-discovered code defect, and none of these 5 sites were in scope for any of the 11 plans that executed this phase (Wave 2's 11-04/11-08 touched `auth.service.ts`/`delivery.service.ts`/`ai.service.ts` only for AbortSignal propagation, not logging sanitization).

This is reported below as a WARNING-severity anti-pattern (structural inconsistency, lower practical risk, pre-existing since Wave 2, outside this phase's originally-scoped must-haves) — not a phase-goal blocker. It does not affect the status determination below, consistent with how the milestone audit classified it as `tech_debt`.

### Observable Truths (Full Re-Check)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every call site wrapped in a cockatiel-based circuit-breaker + retry + timeout + fallback policy that functions correctly under real (non-instant) vendor latency (ROADMAP SC1) | ✓ VERIFIED | Unchanged since last round; `ai.service.ts:277-303, 520-524` still show `await s.withResponse()` at both streaming call sites; `resilience.service.ts` policy composition (lines 44-72) unchanged. Regression check only (no new evidence needed — full suite re-run below confirms no drift). |
| 2 | Simulating a Paystack outage causes graceful degradation via fallback while unrelated vendor policies/endpoints keep working (ROADMAP SC2) | ✓ VERIFIED | Re-ran `vendor-outage-isolation.spec.ts` directly during this verification: 4/4 tests pass, paystack breaker opens after consecutive transient failures, unrelated vendor policy on the same `ResilienceService` instance still resolves. |
| 3 | Circuit-breaker transitions (closed→open→half-open) appear as spans/log events in Grafana/Sentry/OTel (ROADMAP SC3 / RESIL-02) | ? HUMAN NEEDED | Code-level wiring confirmed (`onBreak`/`onReset`/`onHalfOpen` at `resilience.service.ts:113-161`), unit-tested with mocks, and — as of this round — the log-event half is now genuinely sanitized end-to-end (Truth #23 closed). Live-dashboard delivery cannot be confirmed from a local sandbox; unchanged human-verification item. |
| 4 | cockatiel pinned at exactly `^3.2.1` | ✓ VERIFIED | `backend/package.json:53` — `"cockatiel": "^3.2.1"`, re-confirmed this round. |
| 5 | One cached cockatiel policy instance per vendor, built once at `onModuleInit` | ✓ VERIFIED | `resilience.service.ts:38-73` — structurally unchanged. |
| 6 | Per-vendor thresholds read from PlatformConfig, hardened against malformed values (WR-01, round 1) | ✓ VERIFIED | `positiveInt`/`nonNegativeInt` helpers unchanged (`resilience.service.ts:169-182`). |
| 7 | Circuit breaker opens after configured consecutive-failure threshold and fails fast until half-open | ✓ VERIFIED | Re-run, still passes. |
| 8 | Business-logic 4xx errors never count toward a vendor's breaker failure threshold | ✓ VERIFIED | Unchanged, still passes. |
| 9 | Breaker state transitions produce a sanitized Sentry capture and a sanitized OTel span attribute naming the vendor | ✓ VERIFIED | `resilience.service.ts:116-142` — span attribute uses `safeReason` (never raw error); `Sentry.captureMessage` uses a generic templated string + tags. **The accompanying plain `logger.error` call is now ALSO sanitized (closes the prior gap in this same truth).** |
| 10 | Paystack refunds default to zero cockatiel retries | ✓ VERIFIED | Unchanged. |
| 11 | cockatiel's own per-attempt timeout cancellation (`TaskCancelledError`) still counts as transient and triggers the next retry attempt | ✓ VERIFIED | `isTransientError()` (`resilience.service.ts:217`) checks `isTaskCancelledError === true` ahead of the network-code checks; unchanged. |
| 12 | A bare application bug (e.g. `TypeError`) does not count toward a vendor's circuit-breaker consecutive-failure threshold (WR-04) | ✓ VERIFIED | Final catch-all in `isTransientError()` still returns `false` for unrecognized shapes; unchanged. |
| 13 | Paystack's initiatePayment/resolveBvn/refundCharge forward the AbortSignal into axios's `signal` option, with reference-identity proof | ✓ VERIFIED | Unchanged since last round; not re-derived, quick regression check only. |
| 14 | S3Service.upload forwards the AbortSignal into the S3 SDK's `abortSignal` option, with reference-identity proof | ✓ VERIFIED | Unchanged. |
| 15 | NotificationsService.sendPush forwards the AbortSignal into axios's `signal` option, with reference-identity proof | ✓ VERIFIED | Unchanged. |
| 16 | auth.service.ts's sendTermii and delivery.service.ts's sendTermiiDeliveryOtp forward the AbortSignal into fetch's `signal` option, with reference-identity proof | ✓ VERIFIED | Unchanged; confirmed `signal` is threaded into both `fetch()` calls read during this round's T-11-03 investigation (`auth.service.ts:314`, `delivery.service.ts:342`). |
| 17 | ai.service.ts's 3 Anthropic call sites forward the AbortSignal into the SDK's RequestOptions AND the two streaming sites are now genuinely bounded by cockatiel's timeout/breaker | ✓ VERIFIED | Unchanged since last round. |
| 18 | Full backend test suite passes with zero regressions from the entire gap-closure batch | ✓ VERIFIED | Directly re-ran `cd backend && npm test`: **42 suites, 505 tests, all passing** (grown from 40/461 at last verification — additional suites/tests from Phases 12/13 work merged since, none regressed). |
| 19 | No global axios interceptor exists that would compound retry behavior alongside cockatiel | ✓ VERIFIED | Unchanged. |
| 20 | NotificationsService.registerToken merges the new fcmToken into existing User.metadata instead of overwriting the whole document (WR-01, round 2) | ✓ VERIFIED | Unchanged. |
| 21 | isTransientError() classifies axios's own ERR_CANCELED cancellation code as transient (WR-03, round 2) | ✓ VERIFIED | `resilience.service.ts:224` — `'ERR_CANCELED'` present in the network-code allowlist. |
| 22 | AbortSignal reference-identity test coverage is complete across all 6 vendor-call-site spec files (WR-02 full sweep, round 2) | ✓ VERIFIED | Unchanged. |
| 23 | Circuit-breaker OPEN log events do not leak raw vendor error objects (potential secrets/Authorization headers) into application logs | ✓ VERIFIED (was FAILED) | `resilience.service.ts:134` now logs `safeReason` (a `summarizeVendorError()` output: `status=<n> code=<code> <message>` only). Independently re-run `resilience.service.spec.ts` (14/14 pass, including the dedicated regression test asserting no bearer token/Authorization/request-body substring reaches `Logger.error()`) and `vendor-outage-isolation.spec.ts` (4/4 pass) — live console output for both confirms the sanitized log line format, closing this gap. |

**Score:** 22/22 relevant truths verified (Truth #3 remains human-needed and is excluded from the denominator per standard scoring convention). Truth #23, the sole prior FAILED item, is now VERIFIED.

### Deferred Items

None. No later phase in `.planning/ROADMAP.md` (Phases 12-17) addresses logging sanitization or the T-11-03 scope-accuracy finding above.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resilience/resilience.service.ts` | `onBreak()` does not leak raw vendor error data via plain `logger.error()` | ✓ VERIFIED | Line 134 now uses `safeReason`; `summarizeVendorError()` helper (line 190) confirmed present and correctly scoped (status/code/message only). |
| `backend/src/resilience/__tests__/resilience.service.spec.ts` | Regression test proving `logger.error` never receives a raw vendor error / Authorization substring | ✓ VERIFIED | Test `'never logs the raw vendor error — a realistic axios error with an Authorization header must not reach Logger.error (UAT Test 3)'` present and passing; directly re-executed. |
| `backend/src/modules/ai/ai.service.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/delivery/delivery.service.ts` | (Investigated, not a required artifact for this phase's must-haves) | ⚠️ Anti-pattern present, not a MISSING/STUB artifact | 5 call sites still pass raw `err` to `Logger.error()` — see Anti-Patterns section. Lower practical severity than the closed `resilience.service.ts` finding; not in original phase scope. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `resilience.service.ts`'s `onBreak()` | application log sink | `this.logger.error(\`Circuit breaker OPEN for ${vendor}: ${safeReason}\`)` | ✓ SAFELY WIRED (was UNSAFELY WIRED) | The sanitized `safeReason` string reaches the log sink; the raw vendor error object no longer does. Confirmed by direct source read and live test re-run. |
| `resilience.service.ts`'s `onBreak()` | Sentry / OTel span | `Sentry.captureMessage(...)` / `span.setAttribute('resilience.breaker.reason', safeReason)` | ✓ WIRED | Unchanged — was already correctly sanitized in the prior round. |

### Data-Flow Trace (Level 4)

The equivalent trace for this phase (established across all prior rounds): does the *error data* that flows into `onBreak()` get sanitized before reaching an external sink (logs, Sentry, OTel)? Tracing `reason.error` from the cockatiel breaker callback (line 113) through `summarizeVendorError()` (line 114/190) to `Logger.error()`'s single string argument (line 134) confirms it IS now sanitized on all three paths (log, Sentry, OTel) — the divergence that existed in the prior round (log path unsanitized, Sentry/OTel paths sanitized) has been eliminated; all three now read from the same `safeReason` value.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend regression suite | `cd backend && npm test` | 42 suites, 505 tests passed | ✓ PASS |
| Circuit-breaker OPEN log event does NOT print raw vendor error object (resilience.service.spec.ts) | `cd backend && npx jest src/resilience/__tests__/resilience.service.spec.ts --silent` | 14/14 tests pass; console shows `Circuit breaker OPEN for paystack: status=500 code=ERR_BAD_RESPONSE Request failed with status code 500` — no raw object, no Authorization substring | ✓ PASS |
| Circuit-breaker OPEN log event does NOT print raw vendor error object (vendor-outage-isolation.spec.ts — the exact suite that previously reproduced the live leak) | `cd backend && npx jest src/resilience/__tests__/vendor-outage-isolation.spec.ts --silent` | 4/4 tests pass; console shows `Circuit breaker OPEN for paystack: status=500` — sanitized, matching the fix | ✓ PASS |
| cockatiel pinned at `^3.2.1` | `grep -n "\"cockatiel\"" backend/package.json` | `"cockatiel": "^3.2.1"` | ✓ PASS |
| `ai.service.ts` streaming sites still await real connection establishment | `grep -n "withResponse" backend/src/modules/ai/ai.service.ts` | Present at lines 302, 523 | ✓ PASS |
| T-11-03 scope claim (5 sites still logging raw `err`) | `grep -n "logger.error" auth.service.ts delivery.service.ts ai.service.ts` + manual read of each site | Confirmed: `auth.service.ts:323,364`; `delivery.service.ts:349`; `ai.service.ts:353,546,579` all pass raw `err` object | ✓ CONFIRMED (audit claim accurate) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files declared or discovered for this phase — SKIPPED (Jest-test-based verification per the phase's own 11-VALIDATION.md).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| RESIL-01 | 11-01..11-11 | Every call to Paystack, Termii, Anthropic, R2/S3, FCM wrapped in circuit-breaker + retry + timeout + fallback, single vendor outage degrades only dependent feature | ✓ SATISFIED | All 9 wrapped call sites function under real vendor latency; full regression suite passes (42/42 suites, 505/505 tests). `REQUIREMENTS.md` line 21 already correctly shows `- [x] RESIL-01`. |
| RESIL-02 | 11-01, 11-05 | Vendor-call failures and circuit-breaker transitions visible in Grafana/Sentry/OTel | ⚠️ PARTIAL / HUMAN NEEDED | Code-level sanitized OTel span + Sentry capture confirmed wired; the log-event half of this same path is now ALSO sanitized (Truth #23 closed this round, previously a genuine defect). Live Grafana/Sentry dashboard delivery remains an open human-verification item — `REQUIREMENTS.md` line 22 already correctly reflects this as "Partial (live Grafana/Sentry dashboard confirmation pending)". |

**Note (resolved this round):** `REQUIREMENTS.md` lines 21-22 and the traceability table (lines 102-103) were flagged as stale by the prior verification round. Independently re-checked during this verification: `REQUIREMENTS.md` now correctly shows `RESIL-01` checked complete and `RESIL-02` marked "Partial (live Grafana/Sentry dashboard confirmation pending — see v2.0-MILESTONE-AUDIT.md)" — this documentation-sync gap was already corrected (by the 2026-07-17 milestone audit) prior to this verification run.

No orphaned requirements found — RESIL-01 and RESIL-02 both appear in every plan's `requirements:` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/auth/auth.service.ts` | 323, 364 | `this.logger.error(<message>, err)` passes the raw caught error object (from `fetch()`) as `Logger.error()`'s second argument | ⚠️ Warning | Structurally identical to the pattern that was Critical in `resilience.service.ts`, but practical risk is lower: `fetch()` network-failure errors do not attach outbound request config/headers the way axios errors do, so no confirmed secret-leak path exists today. Still an inconsistency with the phase's own sanitization principle; not fixed by `b0fcb3c` (out of that commit's scope) and not part of this phase's original must-haves. Recommend re-scoping `11-SECURITY.md`'s T-11-03 disposition to enumerate these sites accurately rather than claiming blanket closure, per the milestone audit's recommendation. |
| `backend/src/modules/delivery/delivery.service.ts` | 349 | Same pattern (`fetch()`-based Termii delivery OTP error) | ⚠️ Warning | Same reasoning as above. |
| `backend/src/modules/ai/ai.service.ts` | 353, 546, 579 | Same pattern (Anthropic SDK `APIError` passed raw to `Logger.error()`) | ⚠️ Warning | Same reasoning; Anthropic SDK error objects carry only response data (status, response headers), not the outbound `ANTHROPIC_API_KEY`. |
| `backend/src/modules/notifications/notifications.service.ts` | 51 | `// TODO: persistence not yet wired` in unrelated `listForUser` method | ℹ️ Info | Pre-existing, not touched by this phase; re-confirmed unchanged this round. |

No `TBD`/`FIXME`/`XXX` markers found in `resilience.service.ts` or its spec file.

### Human Verification Required

#### 1. Live observability confirmation (RESIL-02 / ROADMAP SC3)

**Test:** Force a real vendor outage (e.g., temporarily point `PAYSTACK_SECRET_KEY` at an unreachable endpoint, or exercise the code against a staging environment wired to the real OTel collector + Sentry project).
**Expected:** A `resilience.circuit_breaker.state_change` span with `resilience.breaker.state: 'open'` and `resilience.vendor` attributes appears in the Grafana/OTel pipeline, and a matching Sentry event (`Circuit breaker opened: <vendor>`) is captured.
**Why human:** Requires a live Grafana Cloud/Sentry/OTel-collector pipeline; code-level instrumentation is confirmed present and unit-tested with mocks (and, as of this round, the log-event path is also confirmed sanitized end-to-end), but end-to-end delivery to the observability backend cannot be verified in a local Jest sandbox. This item was correctly scoped as human-verification (not a code defect) by every prior verification round, and remains genuinely open — no attempt has been made to invent a workaround for it.

### Gaps Summary

**No gaps found.** The sole blocking gap from the prior verification round (Truth #23 — raw vendor error object leaking into application logs via `ResilienceService.onBreak()`) is confirmed closed by commit `b0fcb3c`, independently re-verified from first principles in this round (source read + live test re-execution reproducing the exact prior leak scenario, now sanitized) rather than by trusting SUMMARY.md, 11-UAT.md, or 11-SECURITY.md claims.

One item remains genuinely open and is routed to human verification, unchanged from every prior round: live Grafana/Sentry dashboard confirmation of a real vendor outage producing a visible span + Sentry event (RESIL-02's "visible in observability" success criterion, live-pipeline half). This cannot be verified from a sandbox and no workaround has been invented for it.

One additional finding, investigated per this round's explicit brief: the milestone audit's claim that `11-SECURITY.md`'s T-11-03 disposition overstates its fix scope is **confirmed accurate** — 5 call sites (`auth.service.ts:323,364`, `delivery.service.ts:349`, `ai.service.ts:353,546,579`) still pass raw `err` objects to `Logger.error()`, structurally identical to the pattern fixed in `resilience.service.ts` but with genuinely lower practical risk (fetch-based and Anthropic-SDK errors don't carry outbound Authorization/API-key data the way axios's `error.config.headers` does). This is reported as a WARNING-severity anti-pattern and a security-register accuracy recommendation, not a phase-goal blocker — consistent with the milestone audit's own `tech_debt` classification. It does not affect this phase's `status`.

**Recommendation (non-blocking, for a future hygiene pass or Phase 15 prerequisite, since Phase 15 — Multi-Channel OTP — will add more Termii/WhatsApp call sites on this same pattern):** Apply the same `summarizeVendorError()`-style sanitization (or a shared helper) to the 5 identified call sites, and correct `11-SECURITY.md`'s T-11-03 disposition text to accurately enumerate them rather than claiming blanket closure.

---

## Verification Metadata

**Verification approach:** Goal-backward re-verification (hygiene re-run after code-level fix landed post-timestamp), following the previous round's established 23-truth must-haves list plus one independently-investigated additional finding per this round's brief.
**Must-haves source:** Carried forward from prior 11-VERIFICATION.md (2026-07-16T20:15:00Z), itself derived from ROADMAP.md Success Criteria + 11 PLAN.md frontmatter files.
**Automated checks:** 22 passed, 0 failed (1 excluded — human-needed)
**Human checks required:** 1 (unchanged — live observability pipeline confirmation)
**Total verification time:** ~20 min

---
*Verified: 2026-07-17T23:10:00Z*
*Verifier: Claude (gsd-verifier)*
