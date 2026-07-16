---
phase: 11-resilience-wrapping
verified: 2026-07-16T20:15:00Z
status: gaps_found
score: 21/22 must-haves verified (1 human-needed excluded from denominator)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 25/27
  gaps_closed:
    - "ai.service.ts's streamChatWithTools and streamItinerary now await stream.withResponse() inside resilience.execute('anthropic', ...) before returning the stream, giving cockatiel's 8000ms per-attempt timeout and failureThreshold:3 circuit breaker a genuine window over the real Anthropic HTTP connection instead of resolving in microtask time on the synchronous MessageStream object — proven by a fake-timer regression test using the REAL ResilienceService (not a mock) that demonstrates a hung connection is NOT flagged before ~8000ms and IS flagged after advanceTimersByTimeAsync(8100), and that the breaker opens (stops invoking messages.stream) after 3 consecutive timeouts. getLgaIntelligence (.messages.create(), a real Promise) confirmed byte-for-byte unchanged."
    - "NotificationsService.registerToken (WR-01) now reads existing User.metadata via findUnique, spreads it, and merges in fcmToken before writing — no longer blindly overwrites the whole metadata JSON document. Verified in source and by dedicated merge-preservation + null-metadata tests."
    - "resilience.service.ts's isTransientError() (WR-03) now recognizes axios's own ERR_CANCELED cancellation code in its network-code allowlist, alongside the already-handled fetch/undici ABORT_ERR code — no longer dependent on a timing coincidence between cockatiel's TaskCancelledError and axios's CanceledError winning a race. Verified in source and by a dedicated regression test."
    - "AbortSignal reference-identity test coverage (WR-02) is now complete across all 6 vendor call-site spec files (paystack, ai, notifications, s3, auth/termii, delivery/termii) — each has exactly one .toBe(controller.signal) reference-identity assertion, confirmed by direct grep count across all 6 files."
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "Circuit-breaker OPEN log events do not leak raw vendor error objects (which may carry Authorization headers/secrets for axios-based vendors) into application logs — a prerequisite for RESIL-02's 'visible in observability' success criterion to be trustworthy rather than itself a new vulnerability"
    status: failed
    reason: >
      A fresh, independent code review (11-REVIEW.md, dated after this round's gap-closure
      plans 11-09/11-10/11-11) found a NEW Critical-severity defect in resilience.service.ts
      that none of this round's 3 plans touched or were scoped to fix: onBreak() (line 130)
      calls `this.logger.error(\`Circuit breaker OPEN for ${vendor}\`, reason.error as any)`,
      passing the raw vendor error object as NestJS Logger's second argument. For every
      axios-based vendor this phase wraps (paystack, paystackRefund, fcm), a failed
      request's error object carries `.config.headers.Authorization` (the outbound Paystack
      secret key or FCM OAuth bearer token). NestJS's default Logger.error does not treat a
      non-string second argument as a stack-trace string — it serializes and prints the
      entire object. This directly contradicts the sanitization comment written two lines
      below in the same method ("Never interpolate raw request/response payloads here —
      vendor name + generic error class only (T-11-03)"), which the OTel span attribute and
      Sentry.captureMessage() calls correctly follow — only the plain logger.error() call
      violates it. I independently confirmed this is not just a theoretical read: re-running
      the full backend suite for this verification reproduced the exact behavior live —
      `vendor-outage-isolation.spec.ts` printed `[ResilienceService] Circuit breaker OPEN for
      paystack` followed by `Object(1) { response: { status: 500 } }` to stdout the moment
      the paystack breaker opened, proving the raw error object is genuinely serialized into
      the log stream today, not merely a hypothetical. onBreak() fires on every
      consecutive-failure-threshold crossing — precisely the moment a vendor call has just
      failed and its error object (headers included) is freshest — making this a reliably
      reproducible secret-leak path into whatever log sink is configured (stdout, file, log
      aggregator) for a Nigerian-government financial platform with explicit AES-256-GCM/PII
      and wallet-security constraints. This gap was not part of the original CR-01/CR-02 gap
      list or this round's 3 targeted plans (11-09 fixed Anthropic streaming, 11-10 fixed FCM
      metadata overwrite, 11-11 fixed ERR_CANCELED classification) — it was introduced back
      in Wave 1 (11-01-PLAN.md) and has never been addressed by any gap-closure round to date.
    artifacts:
      - path: "backend/src/resilience/resilience.service.ts"
        issue: "Line 130: this.logger.error(`Circuit breaker OPEN for ${vendor}`, reason.error as any) passes the raw vendor error object (which may include axios's .config.headers.Authorization for paystack/paystackRefund/fcm) to Logger.error's second argument, which NestJS serializes and prints in full — contradicting the sanitization already correctly applied 2 lines below for the OTel span attribute and Sentry.captureMessage() call in the same method."
    missing:
      - "Sanitize the plain logger.error() call in onBreak() to match the already-sanitized Sentry/OTel calls in the same method, e.g.: this.logger.error(`Circuit breaker OPEN for ${vendor}: ${(reason.error as Error)?.message ?? 'bad_result'}`); — never pass reason.error (or any vendor error object) as a second argument to Logger.error() anywhere the error may carry .config/.headers/.request data."
      - "A regression test asserting logger.error is never called with a raw object containing an Authorization/headers/config key when the breaker opens due to an axios-shaped rejection (to prevent this exact defect from silently reappearing in a future edit)."
human_verification:
  - test: "Force a real vendor outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable/blackholed endpoint, or use a Sentry/OTel-connected staging environment) and confirm a resilience.circuit_breaker.state_change span with resilience.breaker.state=open and vendor attributes actually appears in the live OpenTelemetry collector/Grafana dashboard, and a corresponding Sentry event is captured with the vendor name in the message"
    expected: "Span and Sentry event visible in the live observability stack, matching ROADMAP.md Phase 11 success criterion 3 (RESIL-02)"
    why_human: "Requires live Grafana Cloud / Sentry dashboards and a real OTel exporter pipeline — code-level wiring (Sentry.captureMessage + tracer.startSpan calls) is confirmed present and unit-tested with mocks, but end-to-end delivery to the observability backend cannot be verified from a local unit-test sandbox"
---

# Phase 11: Resilience Wrapping Verification Report (Re-Verification, Round 3)

**Phase Goal:** A single vendor outage (Paystack, Termii, Anthropic, Cloudflare R2/S3, or Firebase FCM) degrades only the dependent feature, not the whole API, and that degradation is visible in observability
**Verified:** 2026-07-16T20:15:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure round 2 (Plans 11-09, 11-10, 11-11), which fixed the one blocking gap from the prior re-verification (Anthropic streaming timeout defect, CR-01 in 11-REVIEW.md's second pass) plus 2 additional warnings (WR-01 FCM metadata overwrite, WR-03 axios ERR_CANCELED classification) and a full AbortSignal reference-identity test sweep (WR-02)

## Goal Achievement

### Gap Closure Status (from prior 11-VERIFICATION.md re-verification)

| Prior Gap | Status | Evidence |
|---|---|---|
| ai.service.ts's streamChatWithTools/streamItinerary — resilience.execute('anthropic', ...) resolved before the real Anthropic HTTP connection was established, so cockatiel's timeout/retry/breaker never got a genuine window over real vendor latency | ✓ CLOSED | Both call sites (`ai.service.ts:282-295`, `ai.service.ts:500-511`) now do `const s = this.anthropic.messages.stream(...); await s.withResponse(); return s;` inside the `resilience.execute` callback. Directly re-read the source. `getLgaIntelligence` (`ai.service.ts:546-553`) confirmed byte-for-byte unchanged — still `.messages.create()`, a real Promise, needing no fix. A new fake-timer regression suite in `ai.service.spec.ts` (`describe('streamChatWithTools / streamItinerary — real cockatiel timeout + breaker engagement ...')`) was executed directly during this verification: with a hung-connection mock (`withResponse` never resolves), the wrapped call does NOT reject before `advanceTimersByTimeAsync(8100)`, and DOES reject after — confirmed by direct test run output showing `isTaskCancelledError: true` at ~8s, then after 3 consecutive timeouts a `BrokenCircuitError` ("Execution prevented because the circuit breaker is open") on the 4th call, proving the breaker's `failureThreshold: 3` is genuinely enforced, not a source-inspection assumption. |

### New Finding (surfaced by a fresh 11-REVIEW.md pass over this round's changes, NOT part of the original CR-01/CR-02/streaming gap list)

| Concern | Status | Evidence |
|---|---|---|
| Does `ResilienceService.onBreak()`'s plain `Logger.error()` call leak raw vendor error data (potentially including Authorization headers/secrets) every time a circuit breaker opens? | ✗ FAILED | `resilience.service.ts:130` — `this.logger.error(\`Circuit breaker OPEN for ${vendor}\`, reason.error as any)` passes the raw vendor error object to `Logger.error`'s second argument. Confirmed this is not merely theoretical: re-running the full backend test suite during this verification reproduced it live — `vendor-outage-isolation.spec.ts`'s console output showed `[ResilienceService] ERROR Circuit breaker OPEN for paystack` immediately followed by the raw error object (`Object(1) { response: { status: 500 } }`) printed to stdout. For a real axios-based failure (paystack/paystackRefund/fcm), that same object carries `.config.headers.Authorization` (the vendor secret key/bearer token) — this is the exact leak path the sanitization comment two lines below (for the OTel span and Sentry call, which ARE correctly sanitized) explicitly warns against, but which this one plain-logger call violates. |

### Observable Truths (Full Re-Check)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every call site wrapped in a cockatiel-based circuit-breaker + retry + timeout + fallback policy that functions correctly under real (non-instant) vendor latency (ROADMAP SC1) | ✓ VERIFIED | All 9 wrapped call sites (paystack×3, s3, fcm, termiiAuth, termiiDelivery, anthropic×3) now genuinely function under real latency — the previously-open gap (ai.service.ts's 2 streaming sites) is closed and independently proven by a passing fake-timer regression test using the real `ResilienceService`. |
| 2 | Simulating a Paystack outage causes graceful degradation via fallback while unrelated vendor policies/endpoints keep working (ROADMAP SC2) | ✓ VERIFIED | `vendor-outage-isolation.spec.ts` re-run directly as part of the full suite: paystack breaker opens after 5 consecutive transient failures and fails fast; unrelated vendor policy on the same `ResilienceService` instance still resolves. |
| 3 | Circuit-breaker transitions (closed→open→half-open) appear as spans/log events in Grafana/Sentry/OTel (ROADMAP SC3 / RESIL-02) | ? HUMAN NEEDED | Code-level wiring confirmed (`onBreak`/`onReset`/`onHalfOpen` at `resilience.service.ts:113-157`), unit-tested with mocks; live-dashboard delivery cannot be confirmed from a local sandbox. See also Truth #23 below — the log-event half of this criterion has a security defect. |
| 4 | cockatiel pinned at exactly `^3.2.1` | ✓ VERIFIED | `backend/package.json` still pins `^3.2.1`. |
| 5 | One cached cockatiel policy instance per vendor, built once at `onModuleInit` | ✓ VERIFIED | `resilience.service.ts:38-73` — structurally unchanged this round. |
| 6 | Per-vendor thresholds read from PlatformConfig, hardened against malformed values (WR-01, round 1) | ✓ VERIFIED | `positiveInt`/`nonNegativeInt` helpers still present and unchanged (`resilience.service.ts:165-178`). |
| 7 | Circuit breaker opens after configured consecutive-failure threshold and fails fast until half-open | ✓ VERIFIED | Re-run, still passes. |
| 8 | Business-logic 4xx errors never count toward a vendor's breaker failure threshold | ✓ VERIFIED | Unchanged, still passes. |
| 9 | Breaker state transitions produce a sanitized Sentry capture and a sanitized OTel span attribute naming the vendor | ✓ VERIFIED | `resilience.service.ts:116-138` — span attribute uses `.message` only; `Sentry.captureMessage` uses a generic templated string + tags. (The accompanying plain `logger.error` call is NOT sanitized — see Truth #23.) |
| 10 | Paystack refunds default to zero cockatiel retries | ✓ VERIFIED | Unchanged. |
| 11 | cockatiel's own per-attempt timeout cancellation (`TaskCancelledError`) still counts as transient and triggers the next retry attempt | ✓ VERIFIED | `isTransientError()` (`resilience.service.ts:199`) checks `isTaskCancelledError === true` ahead of the network-code checks; directly observed in this verification's test run (hung-connection test throws with `isTaskCancelledError: true` at the timeout boundary). |
| 12 | A bare application bug (e.g. `TypeError`) does not count toward a vendor's circuit-breaker consecutive-failure threshold (WR-04) | ✓ VERIFIED | Final catch-all in `isTransientError()` still returns `false` for unrecognized shapes; unchanged. |
| 13 | Paystack's initiatePayment/resolveBvn/refundCharge forward the AbortSignal into axios's `signal` option, with reference-identity proof | ✓ VERIFIED | `paystack.service.spec.ts` — exactly 1 `.toBe(controller.signal)` assertion confirmed present. |
| 14 | S3Service.upload forwards the AbortSignal into the S3 SDK's `abortSignal` option, with reference-identity proof | ✓ VERIFIED | `s3.service.spec.ts` — exactly 1 `.toBe(controller.signal)` assertion (added by Plan 11-11, Task 2). |
| 15 | NotificationsService.sendPush forwards the AbortSignal into axios's `signal` option, with reference-identity proof | ✓ VERIFIED | `notifications.service.spec.ts` — exactly 1 `.toBe(controller.signal)` assertion (added by Plan 11-10, Task 2). |
| 16 | auth.service.ts's sendTermii and delivery.service.ts's sendTermiiDeliveryOtp forward the AbortSignal into fetch's `signal` option, with reference-identity proof | ✓ VERIFIED | `auth.service.spec.ts` and `delivery.service.spec.ts` each show exactly 1 `.toBe(controller.signal)` assertion (added by Plan 11-11, Task 2). |
| 17 | ai.service.ts's 3 Anthropic call sites forward the AbortSignal into the SDK's RequestOptions AND the two streaming sites are now genuinely bounded by cockatiel's timeout/breaker | ✓ VERIFIED | `ai.service.spec.ts` — exactly 1 `.toBe(controller.signal)` assertion (Test D, Plan 11-09) plus the real-ResilienceService fake-timer suite (Tests A/B/C) proving functional timeout/breaker engagement — this closes the structural gap the prior verification round flagged. |
| 18 | Full backend test suite passes with zero regressions from the entire gap-closure batch (rounds 1 + 2) | ✓ VERIFIED | Directly re-ran `cd backend && npm test`: **40 suites, 461 tests, all passing** (up from 40/450 pre-round-2 — 11 new tests added by Plans 11-09/11-10/11-11, matching SUMMARY claims). |
| 19 | No global axios interceptor exists that would compound retry behavior alongside cockatiel | ✓ VERIFIED | Re-confirmed, zero matches. |
| 20 | NotificationsService.registerToken merges the new fcmToken into existing User.metadata instead of overwriting the whole document (WR-01, round 2) | ✓ VERIFIED | `notifications.service.ts:57-65` — `findUnique({ select: { metadata: true } })` → object-spread `{ ...(user?.metadata as Record<string, any> | undefined), fcmToken: token }` → `update`. Directly read in source; dedicated merge-preservation and null-metadata tests pass. |
| 21 | isTransientError() classifies axios's own ERR_CANCELED cancellation code as transient (WR-03, round 2) | ✓ VERIFIED | `resilience.service.ts:206` — `'ERR_CANCELED'` present in the network-code allowlist alongside `'ABORT_ERR'`. Dedicated regression test (`WR-03 — axios ERR_CANCELED`) passes. |
| 22 | AbortSignal reference-identity test coverage is complete across all 6 vendor-call-site spec files (WR-02 full sweep, round 2) | ✓ VERIFIED | Direct grep count: `paystack.service.spec.ts`, `s3.service.spec.ts`, `notifications.service.spec.ts`, `auth.service.spec.ts`, `delivery.service.spec.ts`, `ai.service.spec.ts` each show exactly 1 `.toBe(controller.signal)` assertion. |
| 23 | Circuit-breaker OPEN log events do not leak raw vendor error objects (potential secrets/Authorization headers) into application logs | ✗ FAILED | `resilience.service.ts:130` still passes `reason.error as any` directly to `Logger.error()`'s second argument, unaddressed by any of this round's 3 plans. Empirically reproduced during this verification's own test run — see New Finding above and Gaps. |

**Score:** 21/22 relevant truths verified (Truth #3 remains human-needed and is excluded from the denominator per standard scoring convention; Truth #23 is a genuine FAILED item, newly surfaced this round).

### Deferred Items

None. No later phase in `.planning/ROADMAP.md` (Phases 12-17) addresses logging sanitization or this specific defect in `resilience.service.ts`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/ai/ai.service.ts` | Both streaming call sites await real connection establishment; getLgaIntelligence untouched | ✓ VERIFIED | `await s.withResponse()` present at both sites (lines 293, 509); `getLgaIntelligence` unchanged. |
| `backend/src/modules/ai/__tests__/ai.service.spec.ts` | Fake-timer regression proving timeout/breaker engagement + AbortSignal reference-identity test | ✓ VERIFIED | 18 tests pass in isolation; real-ResilienceService describe block present and directly exercised (reproduced `isTaskCancelledError`/`BrokenCircuitError` in test output). |
| `backend/src/modules/notifications/notifications.service.ts` | Read-then-merge registerToken (WR-01) | ✓ VERIFIED | Confirmed in source. |
| `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` | Merge-preservation tests + AbortSignal reference-identity test | ✓ VERIFIED | Present and passing. |
| `backend/src/resilience/resilience.service.ts` | ERR_CANCELED in transient-error allowlist (WR-03) | ✓ VERIFIED | Confirmed in source, line 206. |
| `backend/src/resilience/resilience.service.ts` | onBreak() does not leak raw vendor error data via plain logger.error() | ✗ FAILED | Line 130 unchanged — still leaks raw error object; see gaps. |
| `backend/src/resilience/__tests__/resilience.service.spec.ts` | ERR_CANCELED regression test | ✓ VERIFIED | Present. |
| `backend/src/common/services/__tests__/s3.service.spec.ts`, `auth.service.spec.ts`, `delivery.service.spec.ts` | AbortSignal reference-identity tests (WR-02 sweep) | ✓ VERIFIED | Each has exactly 1 `.toBe(controller.signal)` assertion. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ai.service.ts`'s `streamChatWithTools`/`streamItinerary` | Anthropic's real HTTP connection | `resilience.execute('anthropic', async ({signal}) => { const s = ...stream(...); await s.withResponse(); return s; })` | ✓ WIRED | Confirmed in source at both call sites; functional engagement proven by fake-timer test. |
| `ai.service.ts`'s `getLgaIntelligence` | Anthropic's real HTTP connection | `.messages.create()` (real Promise) | ✓ WIRED | Unaffected, unchanged. |
| `notifications.service.ts`'s `registerToken` | `prisma.user.update` | merged metadata object spread | ✓ WIRED | Confirmed in source; findUnique precedes update. |
| `resilience.service.ts`'s `isTransientError` | recognized network-code allowlist | `'ERR_CANCELED'` literal | ✓ WIRED | Confirmed in source and by regression test. |
| `resilience.service.ts`'s `onBreak()` | application log sink | `this.logger.error(..., reason.error as any)` | ✗ UNSAFELY WIRED | The raw vendor error object (including potential secrets) reaches the log sink unsanitized — this IS "wired" in the sense of functioning, but it is wired in a way that violates the phase's own sanitization intent stated 2 lines below in the same file. |

### Data-Flow Trace (Level 4)

Not applicable in the classic UI sense. The equivalent trace here is: does the AbortSignal/timeout data actually reach and bound the real vendor call (Level 4 for this phase, as established by the prior verification round)? This was fully closed this round for `ai.service.ts`'s two remaining streaming sites — traced via a genuine fake-timer test rather than source inspection alone, and independently reproduced live during this verification. A second Level-4-style trace surfaced this round: does the *error data* that flows into `onBreak()` get sanitized before reaching an external sink (logs)? Tracing `reason.error` from the cockatiel breaker callback through to `Logger.error()`'s second argument shows it does NOT get sanitized on the plain-logger path, even though the OTel span and Sentry paths (fed by the same `reason.error`) are correctly sanitized 2-4 lines away in the same function.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend regression suite | `cd backend && npm test` | 40 suites, 461 tests passed | ✓ PASS |
| Anthropic streaming fake-timer regression (real ResilienceService) | `cd backend && npx jest src/modules/ai/__tests__/ai.service.spec.ts --silent` | 18/18 tests pass; console output shows `isTaskCancelledError: true` at the ~8s timeout boundary, then `BrokenCircuitError` ("circuit breaker is open") on the 4th call after 3 consecutive timeouts | ✓ PASS |
| `getLgaIntelligence` unchanged | `grep -n "getLgaIntelligence" -A 15 backend/src/modules/ai/ai.service.ts` | Still `.messages.create()`, no `withResponse` call | ✓ PASS |
| ERR_CANCELED recognized as transient | `grep -n "ERR_CANCELED" backend/src/resilience/resilience.service.ts` | Present in allowlist | ✓ PASS |
| AbortSignal reference-identity coverage complete (6 files) | `grep -c "toBe(controller.signal)" <6 spec files>` | Each returns exactly `1` | ✓ PASS |
| Circuit-breaker OPEN log event does NOT print raw vendor error object | Direct observation of `npm test` console output for `vendor-outage-isolation.spec.ts` | `[ResilienceService] ERROR Circuit breaker OPEN for paystack` immediately followed by `Object(1) { response: { status: 500 } }` printed to stdout | ✗ FAIL — confirms the new Critical finding live, not just via source read |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files declared or discovered for this phase — SKIPPED (Jest-test-based verification per the phase's own 11-VALIDATION.md).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| RESIL-01 | 11-01..11-11 | Every call to Paystack, Termii, Anthropic, R2/S3, FCM wrapped in circuit-breaker + retry + timeout + fallback, single vendor outage degrades only dependent feature | ✓ SATISFIED | All 9 wrapped call sites now function correctly under real vendor latency, including the previously-open `ai.service.ts` streaming gap (closed by Plan 11-09, proven with a genuine fake-timer test, not just source inspection). |
| RESIL-02 | 11-01, 11-05 | Vendor-call failures and circuit-breaker transitions visible in Grafana/Sentry/OTel | ⚠️ PARTIAL / HUMAN NEEDED | OTel span + Sentry capture are correctly sanitized and wired (code-verified, unit-tested); live-dashboard delivery still requires human confirmation. However, the plain-logger half of this same observability path (`onBreak()`'s `logger.error` call) is NOT safely wired — it leaks raw vendor error data including potential secrets, which is a genuine defect in the "visible in observability" deliverable, not merely an open human-verification item. |

**Note (carried forward, unresolved):** `REQUIREMENTS.md` lines 21-22 still show RESIL-01/RESIL-02 as unchecked `- [ ]` and the traceability table (lines 102-103) still lists both "Pending," despite `ROADMAP.md` marking Phase 11 "Complete" (2026-07-16). This documentation-sync gap persists across all three verification rounds. Given the new Critical finding below, this "Pending" status is arguably still accurate for RESIL-02 until the log-leak defect is fixed — recommend resolving both the code defect and the documentation sync together.

No orphaned requirements found — RESIL-01 and RESIL-02 both appear in every plan's `requirements:` frontmatter field, including this round's 3 gap-closure plans (11-09/11-10/11-11).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resilience/resilience.service.ts` | 130 | `this.logger.error(...)` called with a raw vendor error object as the second argument, in direct contradiction of the sanitization comment 4 lines below in the same method | 🛑 Blocker | Reliably reproducible secret/credential leak path (Paystack Authorization header, FCM OAuth bearer token) into whatever log sink is configured, triggered on every circuit-breaker-open event for axios-based vendors — empirically reproduced during this verification's test run. |
| `backend/src/modules/notifications/notifications.service.ts` | 51 | `// TODO: persistence not yet wired` in unrelated `listForUser` method | ℹ️ Info | Pre-existing, not touched by this phase or either gap-closure round; not a debt marker introduced here. |

No `TBD`/`FIXME`/`XXX` markers found in any file modified by this round's plans (11-09/11-10/11-11) or in `resilience.service.ts`.

### Human Verification Required

#### 1. Live observability confirmation (RESIL-02 / ROADMAP SC3)

**Test:** Force a real vendor outage (e.g., temporarily point `PAYSTACK_SECRET_KEY` at an unreachable endpoint, or exercise the code against a staging environment wired to the real OTel collector + Sentry project).
**Expected:** A `resilience.circuit_breaker.state_change` span with `resilience.breaker.state: 'open'` and `resilience.vendor` attributes appears in the Grafana/OTel pipeline, and a matching Sentry event (`Circuit breaker opened: <vendor>`) is captured.
**Why human:** Requires a live Grafana Cloud/Sentry/OTel-collector pipeline; code-level instrumentation is confirmed present and unit-tested with mocks, but end-to-end delivery to the observability backend cannot be verified in a local Jest sandbox.

### Gaps Summary

Round 2's gap-closure plans (11-09, 11-10, 11-11) successfully and verifiably closed everything they targeted:

1. **Anthropic streaming timeout blind spot** — the single blocking gap from the prior re-verification — is now genuinely closed. Both `streamChatWithTools` and `streamItinerary` await `stream.withResponse()` before returning, giving cockatiel's 8000ms timeout and 3-failure circuit breaker a real window over the actual Anthropic connection. This was proven with a fake-timer regression test using the real `ResilienceService`, and I independently re-ran that test during this verification and observed the exact expected sequence (timeout at ~8s, breaker opens after 3 consecutive failures).
2. **WR-01 (FCM metadata overwrite)** — `registerToken` now merges instead of overwrites `User.metadata`.
3. **WR-03 (axios ERR_CANCELED)** — `isTransientError()` now classifies it as transient.
4. **WR-02 (AbortSignal reference-identity coverage)** — now complete across all 6 vendor call-site spec files.

However, this same fresh review pass (`11-REVIEW.md`) surfaced a **new Critical-severity defect** in `resilience.service.ts` — the very module this phase exists to deliver — that none of round 2's 3 plans were scoped to touch: `onBreak()`'s plain `Logger.error()` call passes the raw vendor error object (potentially including Authorization headers/secrets for axios-based vendors) straight into the log stream, contradicting the sanitization the same method correctly applies to its OTel span and Sentry calls two lines above. I independently reproduced this live during this verification's own `npm test` run: the console output for `vendor-outage-isolation.spec.ts` showed the raw error object printed to stdout the instant the paystack breaker opened.

This directly undermines the trustworthiness of ROADMAP Phase 11's own success criterion 3 / RESIL-02 ("visible in observability") — a circuit-breaker-open event is designed to be the phase's signal that a vendor outage is happening, and for a Nigerian-government platform handling wallet/payment credentials, that same signal currently also leaks the vendor's secret credentials to whatever log aggregator is configured. Because this is independently reproducible (not merely a theoretical trace) and was found in code delivered entirely within this phase's own scope (Wave 1, `11-01-PLAN.md`), it is classified as a blocking gap rather than a soft warning — consistent with how CR-01/CR-02 and the Anthropic streaming defect were classified in the two prior verification rounds.

Three lower-severity Warnings from the fresh `11-REVIEW.md` remain unaddressed and are NOT classified as blockers against this phase's stated success criteria (they do not prevent the goal from being achieved, but should be tracked):
- WR-01 (this round's numbering): `NotificationsService.sendPush`'s Google OAuth token fetch (`this.fcmAuthClient.getAccessToken()`) runs outside `resilience.execute('fcm', ...)` — only the final `axios.post` is wrapped, so a slow/failing Google token endpoint has no timeout/breaker protection.
- WR-02 (this round's numbering): `AiService`'s 3-turn agentic tool-use loop silently drops the final synthesized answer if the turn cap is hit mid tool-use, with no distinguishing SSE signal to the client.
- WR-03 (this round's numbering): Malformed-config regression coverage in `resilience.service.spec.ts` only exercises 2 of the 4 hardened `readConfig()` keys (`timeout_ms`, `retry_count` — missing `breaker_failure_threshold`, `half_open_after_ms`).

---

*Verified: 2026-07-16T20:15:00Z*
*Verifier: Claude (gsd-verifier)*
