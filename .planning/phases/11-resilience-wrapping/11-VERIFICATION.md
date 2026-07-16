---
phase: 11-resilience-wrapping
verified: 2026-07-16T12:00:00Z
status: gaps_found
score: 24/25 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Every call site to Paystack, Termii, Anthropic, Cloudflare R2/S3, and Firebase FCM is wrapped in a cockatiel-based circuit-breaker + retry + timeout + fallback policy that functions correctly under real (non-instant) vendor latency"
    status: failed
    reason: >
      Two unresolved structural defects in ResilienceService.onModuleInit()'s policy
      composition, both already flagged as CRITICAL in this phase's own code review
      (11-REVIEW.md CR-01/CR-02, status: issues_found) and confirmed still present via
      direct source inspection — not detected by any of the phase's automated tests
      because every test mock rejects synchronously (11-REVIEW.md IN-01 already
      documents this blind spot).
      (1) CR-01 — composition order `wrap(breaker, timeout(cfg.timeoutMs, ...),
      retry(...))` makes cockatiel's `timeout` the OUTER policy wrapping the ENTIRE
      retry+backoff sequence, not each individual attempt (verified against
      node_modules/cockatiel/dist/Policy.js composition semantics: first arg is
      outermost). For paystack (timeoutMs 10s, retryCount 2), one merely-slow (not
      down) 8s first attempt leaves only 2s for backoff + two more full attempts —
      the retry mechanism is disabled for exactly the "slow, not down" scenario it
      exists to survive, and a purely-slow vendor can trip the ConsecutiveBreaker
      because retries never get a chance to run.
      (2) CR-02 — none of the 6 wrapped call sites (paystack.service.ts,
      s3.service.ts, ai.service.ts x3, auth.service.ts, delivery.service.ts,
      notifications.service.ts) forward cockatiel's `context.signal` into the
      underlying axios/fetch/S3-SDK/Anthropic-SDK call (`grep -rn "signal"` across
      all six files returns zero matches). Cockatiel's "aggressive" timeout only
      rejects the caller's promise early; it never aborts the in-flight request.
      For `paystackRefund` specifically this reintroduces the exact double-refund
      race the `retryCount: 0` design (Plan 01, threat T-11-05) was built to
      prevent — a client-side "timed out" refund can still land server-side after
      the caller has already surfaced failure, with nothing to correlate or cancel
      it.
    artifacts:
      - path: "backend/src/resilience/resilience.service.ts"
        issue: "Lines 53-63: wrap(breaker, timeout(...), retry(...)) — timeout wraps the whole retry sequence instead of each attempt (should be wrap(breaker, retry(...), timeout(...)))"
      - path: "backend/src/common/services/paystack.service.ts"
        issue: "resilience.execute callbacks discard the { signal } context param at all 3 call sites (initiatePayment, resolveBvn, refundCharge) — no axios `signal` option passed"
      - path: "backend/src/common/services/s3.service.ts"
        issue: "resilience.execute callback discards { signal } — PutObjectCommand send has no abortSignal"
      - path: "backend/src/modules/ai/ai.service.ts"
        issue: "All 3 Anthropic call sites (streamChatWithTools, streamItinerary, getLgaIntelligence) discard { signal } — no { signal } passed to the SDK call"
      - path: "backend/src/modules/auth/auth.service.ts"
        issue: "sendTermii's resilience.execute callback discards { signal } — fetch() has no signal option"
      - path: "backend/src/modules/delivery/delivery.service.ts"
        issue: "sendTermiiDeliveryOtp's resilience.execute callback discards { signal } — fetch() has no signal option"
      - path: "backend/src/modules/notifications/notifications.service.ts"
        issue: "sendPush's resilience.execute callback discards { signal } — axios.post has no signal option"
    missing:
      - "Reorder resilience.service.ts's composition to wrap(breaker, retry(...), timeout(...)) so each attempt (not the whole retry sequence) gets its own timeout budget"
      - "Thread context.signal from every resilience.execute(vendor, ({ signal }) => ...) callback into the underlying axios/fetch (signal option), S3 SDK (abortSignal request option), and Anthropic SDK ({ signal } request option) calls at all 7 call sites"
      - "Add a regression test using fake timers / a delayed-resolution mock fn to prove each retry attempt gets its own timeout window (not detectable with the current synchronous-reject mocks per 11-REVIEW.md IN-01)"
      - "Add a test asserting the AbortSignal cockatiel provides is the same object forwarded to the mocked HTTP client, for at least one call site"
human_verification:
  - test: "Force a real vendor outage (e.g. point PAYSTACK_SECRET_KEY at an unreachable/blackholed endpoint, or use a Sentry/OTel-connected staging environment) and confirm a resilience.circuit_breaker.state_change span with resilience.breaker.state=open and vendor attributes actually appears in the live OpenTelemetry collector/Grafana dashboard, and a corresponding Sentry event is captured with the vendor name in the message"
    expected: "Span and Sentry event visible in the live observability stack, matching ROADMAP.md Phase 11 success criterion 3 (RESIL-02)"
    why_human: "Requires live Grafana Cloud / Sentry dashboards and a real OTel exporter pipeline — code-level wiring (Sentry.captureMessage + tracer.startSpan calls) is confirmed present and unit-tested with mocks, but end-to-end delivery to the observability backend cannot be verified from a local unit-test sandbox"
---

# Phase 11: Resilience Wrapping Verification Report

**Phase Goal:** Wrap every external vendor integration (Paystack, S3, FCM, Anthropic, Termii auth, Termii delivery) in a per-vendor circuit-breaker + retry + timeout resilience policy, so a single vendor outage degrades only that vendor's dependent feature while the rest of the platform stays fully operational — proven by an automated test.
**Verified:** 2026-07-16T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every call site wrapped in a cockatiel-based circuit-breaker + retry + timeout + fallback policy that functions correctly under real vendor latency (ROADMAP SC1) | ✗ FAILED | Wrapping exists syntactically at all 7 vendor keys, but the retry/timeout composition order bug (CR-01) and missing AbortSignal propagation (CR-02) — both already flagged CRITICAL by this phase's own 11-REVIEW.md and unresolved in current code — mean retry does not correctly bound each attempt and timeout does not actually cancel in-flight requests. See gaps section. |
| 2 | Simulating a Paystack outage causes graceful degradation via fallback while unrelated vendor policies/endpoints keep working (ROADMAP SC2) | ✓ VERIFIED | `vendor-outage-isolation.spec.ts` (real `ResilienceService`, only `PrismaService` mocked) proves the Paystack breaker opens after 5 consecutive transient failures and fails fast (call count stops growing), while `execute('s3', fn2)` on the SAME instance still resolves `'uploaded-ok'` — ran directly: `npx jest src/resilience --silent` → 2 suites, 11 tests pass |
| 3 | Circuit-breaker transitions (closed→open→half-open) appear as spans/log events in Grafana/Sentry/OTel (ROADMAP SC3 / RESIL-02) | ? HUMAN NEEDED | Code-level wiring confirmed: `onBreak`/`onReset`/`onHalfOpen` call `trace.getTracer('iseyaa-resilience').startSpan(...)` and `Sentry.captureMessage(...)` with vendor + state attributes (resilience.service.ts:105-151), unit-tested with mocks. Live-dashboard delivery is explicitly called out as a manual-only verification in the phase's own 11-VALIDATION.md and cannot be confirmed from a local sandbox. |
| 4 | cockatiel pinned at exactly `^3.2.1` (not the Node≥22/ESM-only `4.0.0`) | ✓ VERIFIED | `backend/package.json` line 53: `"cockatiel": "^3.2.1"`; `npm ls cockatiel` → `cockatiel@3.2.1` |
| 5 | One cached cockatiel policy instance per vendor (7 vendors incl. paystackRefund), built once at `onModuleInit`, never rebuilt per-call | ✓ VERIFIED | `resilience.service.ts:38-70` — `circuitBreaker(...)` call appears only inside `onModuleInit`'s loop over `Object.keys(RESILIENCE_DEFAULTS)` (7 keys); `execute()` only does a `Map.get` lookup, no construction |
| 6 | Per-vendor thresholds read from PlatformConfig with per-vendor key granularity, falling back to RESILIENCE_DEFAULTS | ✓ VERIFIED | `readConfig()` (resilience.service.ts:81-103) queries `prisma.platformConfig.findMany` for `resilience.<vendor>.{timeout_ms,retry_count,breaker_failure_threshold,half_open_after_ms}`, falls back to `RESILIENCE_DEFAULTS[vendor]` per-key |
| 7 | Circuit breaker opens after configured consecutive-failure threshold and fails fast until half-open | ✓ VERIFIED | `resilience.service.spec.ts` + `vendor-outage-isolation.spec.ts` both assert `fn.mock.calls.length` stabilizes at `failureThreshold` and stops growing on subsequent calls — both suites pass |
| 8 | Business-logic 4xx errors never count toward a vendor's breaker failure threshold | ✓ VERIFIED | `isTransientError()` (resilience.service.ts:159-163) explicitly excludes non-408/429/5xx statuses; dedicated test in `resilience.service.spec.ts` drives >5 status-400 failures and asserts `fn` is invoked every time (no fail-fast) |
| 9 | Breaker state transitions produce both a Sentry capture and an OTel span naming the vendor | ✓ VERIFIED | `onBreak` (resilience.service.ts:107-133) calls both `tracer.startSpan(...)` with `resilience.vendor` attribute and `Sentry.captureMessage(...)` with `tags: { vendor, ... }`; asserted in `resilience.service.spec.ts` |
| 10 | Paystack refunds default to zero cockatiel retries | ✓ VERIFIED | `RESILIENCE_DEFAULTS.paystackRefund.retryCount === 0` (resilience.types.ts:31); dedicated test proves `fn` invoked exactly once per `execute('paystackRefund', fn)` call |
| 11 | initiatePayment/resolveBvn route through `resilience.execute('paystack', ...)`; refundCharge through `resilience.execute('paystackRefund', ...)` | ✓ VERIFIED | `paystack.service.ts` lines 41, 75, 126 — grep confirms exactly 2x `'paystack'` + 1x `'paystackRefund'` |
| 12 | Circuit-open/timeout/retry-exhausted failure surfaces as generic `ServiceUnavailableException`, never the raw axios error | ✓ VERIFIED | All 3 `PaystackService` catch blocks throw static-string `ServiceUnavailableException`; `paystack.service.spec.ts` (8 tests) passes |
| 13 | resolveBvn still throws BadRequestException for a genuine invalid-BVN business response, distinct from vendor-outage | ✓ VERIFIED | `resolveBvn` catch block: `if (err instanceof BadRequestException) throw err;` before the `ServiceUnavailableException` fallback; tested |
| 14 | S3Service.upload() routes through `resilience.execute('s3', ...)` and throws ServiceUnavailableException on failure | ✓ VERIFIED | `s3.service.ts:75-96`; `s3.service.spec.ts` (7 tests, incl. new failure case) passes |
| 15 | NotificationsService.sendPush() never throws — still returns `{sent:false, reason:'send_failed'}` on circuit-open (D-02) | ✓ VERIFIED | `notifications.service.ts:93-113` — surrounding try/catch unchanged, wraps only `axios.post`; `notifications.service.spec.ts` dedicated test simulates `mockResilience.execute` rejection and asserts the promise resolves (not rejects) |
| 16 | AiService's Anthropic client constructed with `maxRetries:0` | ✓ VERIFIED | `ai.service.ts:97` — `new Anthropic({ apiKey: ..., maxRetries: 0 })` |
| 17 | streamChatWithTools/streamItinerary retry only the connection attempt; mid-stream failure never retried | ✓ VERIFIED | `resilience.execute('anthropic', ...)` wraps only `messages.stream(...)`; the `for await` consumption loop runs outside the policy (ai.service.ts:279, 491); dedicated test asserts `vector.upsertInteraction` not called on connection-failure |
| 18 | getLgaIntelligence has error handling (previously none), throws ServiceUnavailableException on failure | ✓ VERIFIED | `ai.service.ts:531-550` — new try/catch wraps `resilience.execute('anthropic', ...)`; tested (success + failure cases) |
| 19 | auth.service.ts's Termii→Twilio→console-stub fallback chain unchanged when Termii circuit is open (D-03) | ✓ VERIFIED | `auth.service.ts:302` wraps only the `fetch()` call; surrounding catch/fallback untouched; `auth.service.spec.ts` (20 tests) passes incl. dedicated circuit-open test |
| 20 | delivery.service.ts's Termii→log-and-swallow fallback unchanged when circuit is open (D-03) | ✓ VERIFIED | `delivery.service.ts:330` wraps only `fetch()`; `delivery.service.spec.ts` (10 tests) passes incl. dedicated circuit-open test |
| 21 | The two Termii call sites use independent resilience policies (termiiAuth vs termiiDelivery), never unified (D-08) | ✓ VERIFIED | `auth.service.ts` uses `'termiiAuth'`, `delivery.service.ts` uses `'termiiDelivery'` — distinct `Vendor` keys with independent `RESILIENCE_DEFAULTS` entries and independent breaker instances in the `Map` |
| 22 | A simulated Paystack outage opens only the Paystack circuit; S3 circuit on the same instance is unaffected | ✓ VERIFIED | `vendor-outage-isolation.spec.ts` test 3 — directly re-ran, passes |
| 23 | Once Paystack circuit is open, no further calls dispatched to the mock vendor function (fail-fast) | ✓ VERIFIED | `vendor-outage-isolation.spec.ts` test 2 — `fn.mock.calls.length` stable after threshold — directly re-ran, passes |
| 24 | Full backend test suite passes with zero regressions from Plans 01-04's combined changes | ✓ VERIFIED | Directly re-ran `cd backend && npm test`: **39 suites, 443 tests, all passing** — matches SUMMARY claim exactly |
| 25 | No global axios interceptor exists that would compound retry behavior alongside cockatiel | ✓ VERIFIED | Directly re-ran `grep -rn "axios.interceptors" backend/src` → zero matches |

**Score:** 24/25 truths verified (1 human-needed item folded into truth #3 does not count against score per Step 9's ordering; 1 failed truth listed above)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resilience/resilience.types.ts` | Vendor union + per-vendor defaults | ✓ VERIFIED | 7-key union, `RESILIENCE_DEFAULTS` matches plan exactly incl. `paystackRefund.retryCount: 0` |
| `backend/src/resilience/resilience.service.ts` | Cached per-vendor policy registry + execute() + observability wiring | ⚠️ VERIFIED-WITH-DEFECT | Exists, exports `ResilienceService`, wired everywhere — but composition order (CR-01) and signal-propagation contract (CR-02) are structurally incorrect (see gaps) |
| `backend/src/resilience/resilience.module.ts` | `@Global()` module exporting ResilienceService | ✓ VERIFIED | 9-line file, `@Global()`, exports `ResilienceService` |
| `backend/src/common/services/paystack.service.ts` | Resilience-wrapped, D-01/D-05 contract | ✓ VERIFIED (wiring) | Wrapped, exception-mapped correctly; underlying signal/timeout defect inherited from ResilienceService |
| `backend/src/common/services/s3.service.ts` | Resilience-wrapped upload | ✓ VERIFIED (wiring) | Same caveat as above |
| `backend/src/modules/notifications/notifications.service.ts` | Resilience-wrapped FCM, D-02 preserved | ✓ VERIFIED | D-02 contract proven to survive circuit-open |
| `backend/src/modules/ai/ai.service.ts` | Resilience-wrapped Anthropic, connection-only retry | ✓ VERIFIED (wiring) | Same signal-propagation caveat |
| `backend/src/modules/auth/auth.service.ts` | termiiAuth-wrapped, fallback preserved | ✓ VERIFIED |  |
| `backend/src/modules/delivery/delivery.service.ts` | termiiDelivery-wrapped, fallback preserved | ✓ VERIFIED |  |
| `backend/src/resilience/__tests__/vendor-outage-isolation.spec.ts` | Cross-vendor isolation proof | ✓ VERIFIED | 4 `it()` blocks, all pass, substantive (real `ResilienceService`, only Prisma mocked) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `backend/src/app.module.ts` | `resilience.module.ts` | imports array | ✓ WIRED | `ResilienceModule` imported and registered between `RedisModule`/`AuthModule` |
| `paystack.service.ts` | `resilience.service.ts` | constructor injection + `execute('paystack'\|'paystackRefund', ...)` | ✓ WIRED | Confirmed by grep + passing tests |
| `s3.service.ts` | `resilience.service.ts` | constructor injection + `execute('s3', ...)` | ✓ WIRED | |
| `notifications.service.ts` | `resilience.service.ts` | constructor injection + `execute('fcm', ...)` | ✓ WIRED | |
| `ai.service.ts` | `resilience.service.ts` | constructor injection + `execute('anthropic', ...)` | ✓ WIRED | 3 call sites |
| `auth.service.ts` | `resilience.service.ts` | constructor injection + `execute('termiiAuth', ...)` | ✓ WIRED | |
| `delivery.service.ts` | `resilience.service.ts` | constructor injection + `execute('termiiDelivery', ...)` | ✓ WIRED | |
| `resilience.service.ts` | `PlatformConfig` (Prisma) | `prisma.platformConfig.findMany` | ✓ WIRED | |
| `resilience.service.ts` | `@sentry/nestjs` + `@opentelemetry/api` | `onBreak`/`onReset`/`onHalfOpen` handlers | ✓ WIRED | Present, but not confirmed to reach a live dashboard (human_needed) |
| `resilience.service.ts`'s `context.signal` | underlying axios/fetch/S3-SDK/Anthropic-SDK calls | `({ signal }) => ...(..., { signal })` | ✗ NOT WIRED | All 7 call sites discard `context` entirely — `grep -rn "signal" <6 files>` returns zero matches (CR-02) |

### Data-Flow Trace (Level 4)

Not applicable in the classic sense (no UI-rendered data) — the equivalent trace here is the composition/signal trace performed above (breaker→timeout→retry ordering and signal propagation), which surfaced the CR-01/CR-02 defects.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Resilience unit suite green | `cd backend && npx jest src/resilience --silent` | 2 suites, 11 tests passed | ✓ PASS |
| Vendor-call-site spec suites green | `cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts src/modules/delivery/__tests__/delivery.service.spec.ts src/modules/notifications/__tests__/notifications.service.spec.ts src/modules/ai/__tests__/ai.service.spec.ts src/common/services/__tests__/paystack.service.spec.ts src/common/services/__tests__/s3.service.spec.ts --silent` | 6 suites, 63 tests passed | ✓ PASS |
| Full backend regression suite | `cd backend && npm test` | 39 suites, 443 tests passed | ✓ PASS |
| cockatiel pinned version | `cd backend && npm ls cockatiel` | `cockatiel@3.2.1` | ✓ PASS |
| No global axios interceptor | `grep -rn "axios.interceptors" backend/src` | zero matches | ✓ PASS |
| No new TypeScript compile errors touching phase 11 files | `cd backend && npx tsc --noEmit -p tsconfig.json \| grep -iE "resilience\|app.module\|paystack.service\|s3.service\|notifications.service\|ai.service\|auth.service\|delivery.service"` | zero matches | ✓ PASS |
| AbortSignal actually propagated to a vendor call | `grep -n "signal" <6 call-site files>` | zero matches | ✗ FAIL (confirms CR-02) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files declared or discovered for this phase — SKIPPED (no runnable probes; phase verification is Jest-test-based per its own 11-VALIDATION.md).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| RESIL-01 | 11-01, 11-02, 11-03, 11-04, 11-05 | Every call to Paystack, Termii, Anthropic, R2/S3, FCM wrapped in circuit-breaker + retry + timeout + fallback, single vendor outage degrades only dependent feature | ⚠️ PARTIAL | Wrapping exists at all 7 vendor keys and cross-vendor isolation is proven; however the retry/timeout composition (CR-01) and missing signal propagation (CR-02) mean the "retry" and "timeout" pillars of this requirement do not function correctly under real (non-instant) vendor latency — see gaps |
| RESIL-02 | 11-01, 11-05 | Vendor-call failures and circuit-breaker transitions visible in Grafana/Sentry/OTel | ⚠️ CODE VERIFIED / HUMAN NEEDED | `Sentry.captureMessage` + OTel span calls present and unit-tested; live-dashboard delivery requires human confirmation per the phase's own 11-VALIDATION.md manual-verification section |

**Note:** `REQUIREMENTS.md` lines 21-22 still show RESIL-01/RESIL-02 as unchecked `- [ ]` checkboxes and the traceability table (line 102-103) lists both as "Pending," despite `ROADMAP.md` marking Phase 11 "Complete" and both requirements' Plan-frontmatter `requirements:` fields declaring them satisfied. This is a documentation-sync gap in `REQUIREMENTS.md`, not a code gap — flagged for housekeeping, not blocking.

No orphaned requirements found — RESIL-01 and RESIL-02 both appear in at least one plan's `requirements:` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resilience/resilience.service.ts` | 53-63 | `wrap(breaker, timeout(...), retry(...))` — timeout wraps the whole retry sequence, not each attempt | 🛑 Blocker | Retry mechanism effectively disabled for the "vendor is slow, not down" scenario; a merely-slow vendor can trip the breaker (CR-01, unresolved from 11-REVIEW.md) |
| 6 call sites (paystack/s3/ai/auth/delivery/notifications .service.ts) | various | `resilience.execute(vendor, () => ...)` discards `{ signal }` context param | 🛑 Blocker | Timeout never actually cancels the underlying HTTP/SDK request; reintroduces the double-refund race `paystackRefund.retryCount:0` was designed to prevent (CR-02, unresolved from 11-REVIEW.md) |
| `backend/src/resilience/resilience.service.ts` | 97-102 | DB-sourced config coerced with `Number(...)` and no NaN/positivity validation | ⚠️ Warning | A bad `PlatformConfig` row (e.g. non-numeric JSON value) can silently produce `timeoutMs: NaN`/`0` or `failureThreshold: 0`, causing a full vendor outage until next restart (WR-01, pre-existing from review, unresolved) |
| `backend/src/resilience/resilience.service.ts` | 159-163 | `isTransientError` treats any non-HTTP-shaped error (incl. application bugs, e.g. `TypeError`) as transient | ⚠️ Warning | A programming bug inside a wrapped callback can trip the circuit breaker and fail-fast for all users of that vendor, masking the real defect (WR-04) |
| `backend/src/modules/notifications/notifications.service.ts` | 171-177 | `registerToken` replaces `user.metadata` wholesale instead of merging | ⚠️ Warning | Pre-existing, unrelated to this phase's resilience wrap but noted in 11-REVIEW.md (WR-02) |
| `backend/src/common/services/paystack.service.ts` | 38 | Logs first 8 chars of `PAYSTACK_SECRET_KEY` on every payment initiation | ⚠️ Warning | Pre-existing, unrelated to resilience wrap (WR-03) |
| `backend/src/modules/ai/ai.service.ts` | 527 | `getLgaIntelligence`'s LGA lookup skips the `deletedAt: null` filter used elsewhere in the file | ⚠️ Warning | Pre-existing, unrelated to resilience wrap (WR-05) |
| `backend/src/modules/ai/ai.service.ts` | 532-549 | Response-shape bugs (e.g. empty `content[0]`) are caught by the same handler as real vendor failures and surfaced identically as `ServiceUnavailableException` | ⚠️ Warning | Masks genuine bugs as vendor outages during triage (WR-06) |
| `backend/src/modules/notifications/notifications.service.ts` | 51 | `// TODO: persistence not yet wired` in unrelated `listForUser` method | ℹ️ Info | Pre-existing, not touched by this phase; not a debt marker introduced by Phase 11 |

All 🛑 Blocker findings above (CR-01, CR-02) were independently confirmed present in the current codebase by this verification via direct source inspection and a `grep -rn "signal"` check — they are not carried forward from the review without re-checking.

### Human Verification Required

#### 1. Live observability confirmation (RESIL-02 / ROADMAP SC3)

**Test:** Force a real vendor outage (e.g., temporarily point `PAYSTACK_SECRET_KEY` at an unreachable endpoint, or exercise the code against a staging environment wired to the real OTel collector + Sentry project).
**Expected:** A `resilience.circuit_breaker.state_change` span with `resilience.breaker.state: 'open'` and `resilience.vendor` attributes appears in the Grafana/OTel pipeline, and a matching Sentry event (`Circuit breaker opened: <vendor>`) is captured.
**Why human:** Requires a live Grafana Cloud/Sentry/OTel-collector pipeline; code-level instrumentation is confirmed present and unit-tested with mocks, but end-to-end delivery to the observability backend cannot be verified in a local Jest sandbox. This is explicitly called out as manual-only in the phase's own `11-VALIDATION.md`.

### Gaps Summary

Phase 11 successfully delivers the **structural** shape of resilience wrapping: all 7 vendor call sites route through a single `ResilienceService.execute(vendor, fn)` choke point, cross-vendor circuit isolation is proven by a genuine automated test (not a stub — a real `ResilienceService` instance, only `PrismaService` mocked), 4xx exclusion works, the zero-retry `paystackRefund` policy is correctly distinct from `paystack`, Sentry/OTel wiring code is present and unit-tested, and the full 443-test backend regression suite is green with zero failures — all SUMMARY claims here were independently re-run and confirmed true, not just trusted.

However, the phase's own code review (`11-REVIEW.md`, `status: issues_found`) flagged two CRITICAL structural defects in the resilience engine itself — the single piece of code every other plan in this phase depends on — and **both remain unresolved in the current codebase**, confirmed by this verification via direct source inspection:

1. **CR-01 (composition order):** `timeout()` wraps the entire `retry()` sequence instead of each individual attempt, so the retry mechanism is effectively neutralized for a vendor that is merely slow (not fully down) — exactly the scenario retries exist to survive. This is invisible to every existing test because all mock functions reject synchronously (never simulate real latency), a blind spot the review itself documented (`IN-01`) and that persists today.
2. **CR-02 (signal propagation):** none of the 7 wrapped call sites forward cockatiel's `AbortSignal` into the underlying vendor call, so an "aggressive" timeout stops the caller from waiting but never cancels the real in-flight request. For `paystackRefund` — the vendor this phase's own comments and threat model (T-11-05) single out specifically to prevent double-refunds via `retryCount: 0` — this means a client-side "timed out" refund can still succeed server-side after the caller has already surfaced a failure, undermining the very protection the design claims to provide.

Both defects sit inside `backend/src/resilience/resilience.service.ts`, the phase's foundational deliverable (Plan 01), and propagate identically to every vendor wrapped downstream (Plans 02-04) since they all share the same `execute()` facade. Given the phase goal explicitly requires the resilience policy to correctly implement "circuit-breaker + retry + timeout," and given these two defects were already caught and documented as blockers by this project's own review process without being addressed, they are classified as a blocking gap here rather than a soft warning.

---

*Verified: 2026-07-16T12:00:00Z*
*Verifier: Claude (gsd-verifier)*
