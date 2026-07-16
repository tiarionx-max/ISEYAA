---
phase: 11-resilience-wrapping
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - backend/package.json
  - backend/src/app.module.ts
  - backend/src/common/services/__tests__/paystack.service.spec.ts
  - backend/src/common/services/__tests__/s3.service.spec.ts
  - backend/src/common/services/paystack.service.ts
  - backend/src/common/services/s3.service.ts
  - backend/src/modules/ai/__tests__/ai.service.spec.ts
  - backend/src/modules/ai/ai.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/notifications/__tests__/notifications.service.spec.ts
  - backend/src/modules/notifications/notifications.service.ts
  - backend/src/resilience/__tests__/resilience.service.spec.ts
  - backend/src/resilience/__tests__/vendor-outage-isolation.spec.ts
  - backend/src/resilience/resilience.module.ts
  - backend/src/resilience/resilience.service.ts
  - backend/src/resilience/resilience.types.ts
findings:
  critical: 2
  warning: 6
  info: 2
  total: 10
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the resilience-wrapping choke-point (`ResilienceService` + `resilience.types.ts`) and all six vendor call sites it wraps (Paystack, S3/R2, Anthropic, Termii/Twilio in `auth.service.ts`, Termii in `delivery.service.ts`, FCM in `notifications.service.ts`), plus their unit tests.

The unit-test suite is thorough at the "does `resilience.execute()` get called with the right vendor key and does a rejection map to `ServiceUnavailableException`" level, and correctly proves several of the documented pitfalls (paystackRefund zero-retry, cross-vendor breaker isolation, 4xx never trips the breaker). However, I traced the actual `cockatiel` library source (`node_modules/cockatiel/dist/{Policy,RetryPolicy,TimeoutPolicy}.js`) rather than trusting the inline "RESEARCH.md" comments, and found two structural defects in `ResilienceService.onModuleInit()` that the mocked tests cannot detect because the tests never simulate real vendor latency:

1. The policy composition order makes a **single** `timeoutMs` budget cover the **entire** retry sequence (all attempts + backoff), instead of giving each attempt its own timeout. This silently defeats the per-vendor `retryCount` for any call that is merely slow rather than instantly failing — which is precisely the scenario retries exist for.
2. None of the six call sites forward the `AbortSignal` that cockatiel hands them into the underlying `axios`/`fetch`/S3-SDK/Anthropic-SDK call. This means an "aggressive" timeout only makes the *caller* stop waiting — the real HTTP request keeps running in the background, unobserved. For `paystackRefund` in particular this recreates the exact double-refund race the code's own comments say `retryCount: 0` was designed to prevent (a "timed out" refund can still land server-side after the client has already surfaced a failure).

These two issues compound each other and affect every vendor wrapped in this phase, so they are listed as BLOCKER/Critical. Several smaller robustness and log-hygiene issues are listed as Warnings.

## Critical Issues

### CR-01: Timeout wraps the whole retry loop instead of each individual attempt

**File:** `backend/src/resilience/resilience.service.ts:53-63`
**Issue:**
```ts
const composed = wrap(
  breaker,
  timeout(cfg.timeoutMs, TimeoutStrategy.Aggressive),
  retry(handleWhen(isTransientError), { maxAttempts: cfg.retryCount, ... }),
);
```
`cockatiel`'s `wrap(...)` composes policies so the **first** argument is outermost and the **last** is innermost (verified directly in `node_modules/cockatiel/dist/Policy.js:213-226`: `run(context, i)` calls `p[0].execute(next => run(..., 1), ...)`). So this line is equivalent to:

```ts
breaker.execute(() => timeout.execute(() => retry.execute(fn)));
```

`timeout` therefore wraps the **entire** `retry.execute(fn)` call — i.e. the first attempt, all backoff delays, and every retry attempt must all complete inside one shared `cfg.timeoutMs` window. This is backwards from the standard Polly/cockatiel pattern (`retry(timeout(action))`), where `timeout` is innermost so **each attempt** gets its own fresh budget, and `retry` decides whether to run another full attempt+timeout cycle.

Concretely, for `paystack` (`timeoutMs: 10_000`, `retryCount: 2`): if the first HTTP attempt is merely slow (e.g. 8s under vendor load — exactly the kind of transient degradation retries exist to survive), only 2s remain for the `ExponentialBackoff` (200ms–3000ms) plus two more full attempts. The retry mechanism is effectively disabled under the very conditions it was added for, and callers instead get a generic timeout failure that also counts toward the `ConsecutiveBreaker` threshold — so a vendor that is merely slow (not down) can trip the circuit breaker for everyone, because retries never actually get a chance to run.

This is untested: `resilience.service.spec.ts` and `vendor-outage-isolation.spec.ts` only use mock `fn`s that reject **synchronously**, so the whole retry+backoff sequence always finishes in well under the configured `timeoutMs` in every test — the bug can't manifest with an instantly-rejecting mock and is invisible to the current suite.

**Fix:** Put `timeout` innermost so each attempt (not the whole retry sequence) is time-boxed, and let `retry` orchestrate repeating the timed attempt:
```ts
const composed = wrap(
  breaker,
  retry(handleWhen(isTransientError), {
    maxAttempts: cfg.retryCount,
    backoff: new ExponentialBackoff({ initialDelay: 200, maxDelay: 3_000 }),
  }),
  timeout(cfg.timeoutMs, TimeoutStrategy.Aggressive),
);
```
Add a regression test that uses a `fn` which resolves/rejects after a real (fake-timer-driven) delay approaching `cfg.timeoutMs`, to prove each attempt gets its own budget.

---

### CR-02: AbortSignal from cockatiel's timeout is never propagated to the underlying vendor call

**File:** `backend/src/resilience/resilience.service.ts:73-79` (contract), and every call site:
- `backend/src/common/services/paystack.service.ts:41-53, 75-79, 126-130`
- `backend/src/common/services/s3.service.ts:75-85`
- `backend/src/modules/ai/ai.service.ts:279-287, 491-497, 532-543`
- `backend/src/modules/auth/auth.service.ts:302-315, 346-356`
- `backend/src/modules/delivery/delivery.service.ts:330-343`
- `backend/src/modules/notifications/notifications.service.ts:93-110`

**Issue:** `execute()`'s contract explicitly types the callback as `(context: { signal: AbortSignal }) => PromiseLike<T>`, and cockatiel's own README (`node_modules/cockatiel/readme.md:141, 201-227`) states: *"An AbortSignal will be passed to any executed function... In aggressive timeouts, we'll immediately throw a TaskCancelledError when the timeout is reached, in addition to marking the passed token as failed"* — i.e. the wrapped function is responsible for observing `context.signal` to actually cancel the in-flight operation; cockatiel itself does not force-abort non-cooperative work (confirmed in `TimeoutPolicy.js:52-76`: aggressive mode just races a timer against `fn(context, ...)` and rejects the *caller's* promise early — it never touches the underlying request).

Every call site in this phase calls `resilience.execute(vendor, () => axios.post(...))` / `() => fetch(...)` / `() => this.s3.send(...)` / `() => this.anthropic.messages.stream(...)` with a zero-argument arrow function that **discards** the `context` parameter entirely. None of them pass `context.signal` into `axios`'s `signal` option, `fetch`'s `signal` init property, the S3 SDK's `abortSignal` request option, or the Anthropic SDK's `{ signal }` request option.

Practical impact:
- When the "aggressive" timeout fires, callers correctly see a rejected promise and map it to `ServiceUnavailableException` — but the real HTTP request keeps executing in the background, untracked, until it naturally resolves or the process exits.
- For `paystackRefund` specifically (the vendor this phase's comments call out as the reason `retryCount: 0` exists — "a lost response after a server-side-successful refund must not trigger a second one"), a request that times out client-side can still succeed on Paystack's servers moments later. Because nothing cancels it and nothing correlates the eventual real response with the already-surfaced failure, any caller-level retry/manual-retry of the refund (triggered by the `ServiceUnavailableException`) recreates the exact double-refund race this design was meant to prevent.
- More generally, this defeats resource cleanup on timeout for every vendor (S3 uploads, Anthropic streams, FCM/Termii sends all keep running after the app has "given up" on them).

**Fix:** Thread the signal through at every call site, e.g.:
```ts
// paystack.service.ts
const response = await this.resilience.execute('paystack', ({ signal }) =>
  axios.post(url, body, { headers: { Authorization: `Bearer ${secretKey}` }, signal }),
);
```
```ts
// s3.service.ts
await this.resilience.execute('s3', ({ signal }) =>
  this.s3.send(new PutObjectCommand({ ... }), { abortSignal: signal }),
);
```
```ts
// ai.service.ts
const stream = await this.resilience.execute('anthropic', ({ signal }) =>
  this.anthropic.messages.stream({ ... }, { signal }),
);
```
```ts
// auth.service.ts / delivery.service.ts (fetch-based Termii calls)
const response = await this.resilience.execute('termiiAuth', ({ signal }) =>
  fetch('https://v3.api.termii.com/api/sms/send', { method: 'POST', headers: {...}, body: ..., signal }),
);
```
Add a test that asserts the `signal` passed to the mocked HTTP client is the same `AbortSignal` cockatiel provided (or at minimum, that it is defined), for at least one call site, to prevent regression.

## Warnings

### WR-01: DB-sourced resilience config is never validated before being fed into cockatiel

**File:** `backend/src/resilience/resilience.service.ts:97-102`
**Issue:**
```ts
return {
  timeoutMs: Number(byKey.get(keys.timeoutMs) ?? defaults.timeoutMs),
  retryCount: Number(byKey.get(keys.retryCount) ?? defaults.retryCount),
  failureThreshold: Number(byKey.get(keys.failureThreshold) ?? defaults.failureThreshold),
  halfOpenAfterMs: Number(byKey.get(keys.halfOpenAfterMs) ?? defaults.halfOpenAfterMs),
};
```
`PlatformConfig.value` is a Prisma `Json` column (`prisma/schema.prisma:652`), so an admin (or a buggy migration/seed) can store a non-numeric JSON value (e.g. `"fast"`, `{}`, or an empty string) under one of these keys. `??` only guards against `null`/`undefined`; it does not guard against `Number(...)` producing `NaN`, nor against a technically-numeric-but-nonsensical value like `0` or a negative number. A single bad row can silently produce `timeoutMs: NaN` (Node's `setTimeout` treats `NaN`/negative delays as ~0-1ms) or `timeoutMs: 0`, causing every call to that vendor to time out immediately platform-wide, or a `failureThreshold: 0` that trips the breaker permanently open. Since this is read once at process startup (`onModuleInit`), the failure mode is a full outage of a vendor integration (e.g. Paystack payments) until the next deploy/restart with a corrected config row.

**Fix:**
```ts
function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// ...
timeoutMs: positiveInt(byKey.get(keys.timeoutMs), defaults.timeoutMs),
retryCount: Number.isInteger(Number(byKey.get(keys.retryCount))) && Number(byKey.get(keys.retryCount)) >= 0
  ? Number(byKey.get(keys.retryCount)) : defaults.retryCount,
```

### WR-02: `registerToken` overwrites the entire `user.metadata` JSON blob instead of merging

**File:** `backend/src/modules/notifications/notifications.service.ts:57-63`
**Issue:**
```ts
async registerToken(userId: string, token: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { metadata: { fcmToken: token } as any },
  });
  return { registered: true };
}
```
`User.metadata` is a generic `Json?` column shared across the app (other services store arbitrary metadata on their own models the same way). A Prisma `Json` field update with a plain object literal fully **replaces** the column value — it does not merge. Every time a device registers/refreshes its push token (which can happen on every app launch), any other keys previously stored in this user's `metadata` are silently destroyed.
**Fix:** Read-then-merge, or use a dedicated column/table for the FCM token instead of overloading the generic `metadata` blob:
```ts
const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
await this.prisma.user.update({
  where: { id: userId },
  data: { metadata: { ...(user?.metadata as Record<string, unknown> ?? {}), fcmToken: token } },
});
```

### WR-03: Partial secret key written to logs on every Paystack payment initiation

**File:** `backend/src/common/services/paystack.service.ts:38`
**Issue:**
```ts
this.logger.log(`Paystack initiate: ref=${reference} amount=${amountKobo} keyPrefix=${secretKey.slice(0, 8)}…`);
```
This logs the first 8 characters of `PAYSTACK_SECRET_KEY` on every single payment initiation. While not the full secret, partial credential material in application logs (which typically flow to less-restricted log aggregators than secret stores) is unnecessary exposure for a payment-critical government platform and provides no debugging value that `mode: live/test` couldn't already give via a boolean flag.
**Fix:** Drop the key prefix from the log line entirely, or replace with a static, non-secret indicator (e.g. `secretKey.startsWith('sk_live_') ? 'live' : 'test'`).

### WR-04: `isTransientError` classifies any non-HTTP error as a vendor outage, including bugs

**File:** `backend/src/resilience/resilience.service.ts:159-163`
**Issue:**
```ts
function isTransientError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  return true; // network-level errors (ECONNREFUSED, ETIMEDOUT, DNS failures) have no `.response`
}
```
Any thrown error that isn't a shaped HTTP error (e.g. a `TypeError` from a null-pointer bug inside the wrapped callback, a JSON parse error, or any other programming defect in the call-site code) has no `.response` property either, and is therefore also classified as "transient" — meaning it counts toward both retry attempts and circuit-breaker failure accounting. A bug in application code (not a vendor outage) can trip the circuit breaker and start failing fast for all users of that vendor.
**Fix:** Narrow the network-error branch to recognized network-level error codes/types (e.g. `err.code` in `['ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENOTFOUND']`, `TaskCancelledError`, or `TypeError: fetch failed`) rather than treating "no `.response`" as a catch-all for "transient."

### WR-05: `getLgaIntelligence` skips the soft-delete filter used everywhere else in the file

**File:** `backend/src/modules/ai/ai.service.ts:527`
**Issue:** `tool_get_attractions`, `tool_get_events`, `tool_get_stays`, and `streamItinerary` all filter LGA lookups with `deletedAt: null` (lines 124-126, 155-157, 182-184, 369-371), but:
```ts
const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId } });
```
does not. A soft-deleted LGA can still be looked up and fed to the LGA-intelligence prompt, inconsistent with the soft-delete convention enforced elsewhere in this same service.
**Fix:** `where: { id: lgaId, deletedAt: null }` (or document explicitly why admin intelligence queries should bypass soft-delete, if intentional).

### WR-06: Genuine response-shape bugs are masked as vendor-unavailability

**File:** `backend/src/modules/ai/ai.service.ts:532-549`
**Issue:**
```ts
try {
  const response = await this.resilience.execute('anthropic', () => this.anthropic.messages.create({...}));
  return { answer: (response.content[0] as any).text, lgaId };
} catch (err) {
  this.logger.error('LGA intelligence request failed', err);
  throw new ServiceUnavailableException('AI service is temporarily unavailable, please try again shortly');
}
```
If `response.content` is empty or its first block isn't a text block, `(response.content[0] as any).text` throws a `TypeError` that is caught by the same handler as real vendor failures, and surfaced identically as `ServiceUnavailableException`. This conflates "Anthropic is down" with "our response-parsing assumption was wrong," making the real bug invisible in production (same log message, same generic user-facing error) and harder to distinguish from genuine outages when triaging alerts.
**Fix:** Validate the response shape explicitly and throw/log a distinct error for unexpected shapes, e.g. `const block = response.content.find(b => b.type === 'text'); if (!block) { this.logger.error(...); throw new ServiceUnavailableException(...); }`.

## Info

### IN-01: Resilience tests use real timers, which hides the composition-order bug (CR-01)

**File:** `backend/src/resilience/__tests__/resilience.service.spec.ts`, `backend/src/resilience/__tests__/vendor-outage-isolation.spec.ts`
**Issue:** All tests reject their mock `fn` synchronously and rely on real (non-fake) timers for the `ExponentialBackoff` delays. Because the mock never simulates realistic vendor latency, the entire retry+backoff sequence always completes well inside the configured `timeoutMs`, so CR-01 (timeout wrapping the whole retry loop) cannot be detected by this suite no matter how many assertions are added around call counts.
**Fix:** Add at least one test using `jest.useFakeTimers()` with a `fn` that resolves/rejects after a simulated delay close to `cfg.timeoutMs`, asserting each individual attempt — not the whole retry sequence — gets its own timeout window.

### IN-02: OTP lockout/attempt logic duplicated near-verbatim between `verifyOtp` and `phoneAuth`

**File:** `backend/src/modules/auth/auth.service.ts:146-179` and `181-203`
**Issue:** The lock-check, attempt-increment, and lockout-threshold logic is copy-pasted between `verifyOtp` and `phoneAuth` with no shared helper. A future fix to the lockout policy (e.g. changing `OTP_MAX_ATTEMPTS` semantics) risks being applied to only one of the two call sites.
**Fix:** Extract a private `verifyAndConsumeOtp(phone, otp): Promise<void>` helper shared by both methods.

---

_Reviewed: 2026-07-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
