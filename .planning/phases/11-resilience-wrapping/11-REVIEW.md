---
phase: 11-resilience-wrapping
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - backend/src/modules/ai/ai.service.ts
  - backend/src/modules/ai/__tests__/ai.service.spec.ts
  - backend/src/modules/notifications/notifications.service.ts
  - backend/src/modules/notifications/__tests__/notifications.service.spec.ts
  - backend/src/resilience/resilience.service.ts
  - backend/src/resilience/__tests__/resilience.service.spec.ts
  - backend/src/common/services/__tests__/s3.service.spec.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 11: Code Review Report (Round 2 Gap-Closure — Plans 11-09/11-10/11-11)

**Reviewed:** 2026-07-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This is a fresh review of the current state of the resilience-wrapping files after plans 11-09 (Anthropic streaming CR-01 fix), 11-10 (FCM metadata-merge WR-01 fix), and 11-11 (axios `ERR_CANCELED` WR-03 fix + AbortSignal reference-identity test sweep). I verified all four targeted gap-closures directly in the source and confirmed they are correctly implemented and covered by real regression tests:

- **Anthropic streaming blind spot (fixed):** both `streamChatWithTools` and `streamItinerary` now `await s.withResponse()` inside the `resilience.execute('anthropic', ...)` callback before returning the stream, giving cockatiel's per-attempt 8s timeout a genuine window over the real connection. `ai.service.spec.ts`'s new `describe('... real cockatiel timeout + breaker engagement ...')` block proves this with fake timers against a real `ResilienceService` instance (hung-connection test doesn't resolve before ~8000ms, does after 8100ms, and the breaker opens after 3 consecutive timeouts and stops invoking `messages.stream` again). Solid regression coverage.
- **FCM metadata overwrite (fixed):** `NotificationsService.registerToken` now reads existing `user.metadata` and spreads it before setting `fcmToken`, instead of replacing the whole JSON blob. Both the empty-prior-metadata and non-empty-prior-metadata cases are covered by tests.
- **Axios `ERR_CANCELED` (fixed):** `isTransientError` now includes `'ERR_CANCELED'` in its recognized network-code allowlist, and a dedicated regression test (`WR-03 — axios ERR_CANCELED`) proves a `CanceledError`-shaped rejection is retried.
- **AbortSignal reference-identity coverage (fixed):** every vendor call site in this file set (`anthropic`, `fcm`, `s3`, `termiiAuth`, `termiiDelivery`) now has a dedicated test asserting the exact `AbortSignal` instance cockatiel hands out reaches the underlying HTTP call's signal option.

However, this fresh pass surfaced **one new Critical-severity defect introduced by this phase's own code** (a raw-error logging call in `resilience.service.ts` that leaks secrets/Authorization headers into application logs, directly contradicting the sanitization comment written immediately below it), plus several Warnings/Info items — some newly found, some carried forward unaddressed from the prior `11-REVIEW.md` round.

## Critical Issues

### CR-01: `ResilienceService.onBreak()` logs the raw vendor error object, leaking Authorization headers/secrets into application logs

**File:** `backend/src/resilience/resilience.service.ts:130`

**Issue:** Inside `onBreak()`, the OTel span attribute and the `Sentry.captureMessage()` call are both correctly sanitized — they extract only `.message` or a generic reason string, per the comment directly above the Sentry call ("Never interpolate raw request/response payloads here — vendor name + generic error class only (T-11-03)"). But the line immediately preceding that comment does exactly what the comment forbids:

```ts
this.logger.error(`Circuit breaker OPEN for ${vendor}`, reason.error as any);
```

`reason.error` is the raw error thrown by the wrapped vendor call — for every `axios`-based vendor in this phase (`paystack`, `paystackRefund`, `fcm`), a failed request's error object carries `.config.headers`, which includes the outbound `Authorization: Bearer <token>` header (Paystack secret key, FCM OAuth bearer token) or other request-identifying data. NestJS's default `Logger.error(message, secondArg)` does not treat a non-string second argument as a stack-trace string — it serializes and prints the entire object. I verified this directly:

```text
$ node -e "const {Logger}=require('@nestjs/common'); new Logger('t').error('Circuit breaker OPEN for paystack', { config: { headers: { Authorization: 'Bearer SECRET_TOKEN_XYZ' } }, message: 'Request failed with status code 500' });"
...
Object(2) {
  config: { headers: { Authorization: 'Bearer SECRET_TOKEN_XYZ' } },
  message: 'Request failed with status code 500'
}
```

`onBreak()` fires on every consecutive-failure-threshold crossing — precisely the moment a vendor call has just failed and its error object is freshest/most complete — making this a reliably reproducible secret-leak path into whatever log sink is configured (stdout, file, log aggregator), for every vendor wrapped by `ResilienceService`, not just the ones reviewed in this file set.

**Fix:** Mirror the sanitization already applied two lines above, for the plain logger call too:

```ts
this.logger.error(
  `Circuit breaker OPEN for ${vendor}: ${(reason.error as Error)?.message ?? 'bad_result'}`,
);
```

Do not pass `reason.error` (or any vendor error object) as a second argument to `Logger.error()` anywhere errors may carry `.config`/`.headers`/`.request` data.

## Warnings

### WR-01: `NotificationsService.sendPush`'s Google OAuth token fetch is not covered by resilience wrapping

**File:** `backend/src/modules/notifications/notifications.service.ts:83-88`

**Issue:** Only the final `axios.post(...)` to FCM's `messages:send` endpoint is wrapped in `resilience.execute('fcm', ...)`. The preceding network call needed to obtain the bearer token — `await this.fcmAuthClient.getAccessToken();` (a real call out to Google's OAuth token endpoint via `google-auth-library`) — runs completely outside the resilience layer: no per-attempt timeout, no circuit-breaker accounting, no retry policy. If Google's token endpoint is slow or intermittently failing, every `sendPush()` call pays the full (unbounded) latency of that call with no fail-fast protection, and repeated failures never trip the `fcm` breaker — defeating a core goal of this phase for half of the FCM vendor's real network surface.

**Fix:** Wrap the token acquisition in the same resilience policy (a distinct vendor key, e.g. `fcmAuth`, may be warranted since its failure semantics differ from the send call), or at minimum apply an explicit timeout:

```ts
const accessTokenResponse = await this.resilience.execute('fcm', () => this.fcmAuthClient!.getAccessToken());
```

### WR-02: `AiService`'s 3-turn agentic loop cap silently drops the final response when the cap is hit mid tool-use

**File:** `backend/src/modules/ai/ai.service.ts:276-334`

**Issue:** `for (let turn = 0; turn < 3; turn++)` bounds the tool-use loop. If `finalMessage.stop_reason === 'tool_use'` on the third (last permitted) iteration, the code pushes the assistant/tool-result messages onto `messageHistory` (lines 328-329) and the loop condition then terminates the loop — but no further call to Claude is made to synthesize a final answer using those tool results. Execution falls straight through to `res.write('data: [DONE]\n\n'); res.end();` (lines 336-337). The client receives the raw tool result events but never a closing assistant message acknowledging them, and no distinguishing SSE event (e.g. `{error: 'max_turns_reached'}`) is emitted to explain the truncation — the stream just ends as if it completed normally.

**Fix:** Detect the cap being hit and emit an explicit signal, e.g.:

```ts
if (turn === 2 && finalMessage.stop_reason === 'tool_use') {
  res.write(`data: ${JSON.stringify({ warning: 'max_turns_reached' })}\n\n`);
}
```

### WR-03: Malformed-config regression coverage only exercises 2 of the 4 hardened `readConfig()` keys

**File:** `backend/src/resilience/__tests__/resilience.service.spec.ts:150-187`

**Issue:** The `describe('readConfig() — malformed DB config falls back to defaults (WR-01)')` block only has tests for a malformed `timeout_ms` (line 151) and a malformed `retry_count` (line 169). `breaker_failure_threshold` and `half_open_after_ms` — both also routed through `positiveInt()` in production code (`resilience.service.ts:106-107`) — have no malformed-value regression test. A future change that broke `positiveInt()`'s behavior specifically for one of those two keys (e.g. an off-by-one in how the key name is derived) would not be caught by this suite.

**Fix:** Add the analogous two tests, e.g.:

```ts
it('falls back to the default failureThreshold when breaker_failure_threshold is malformed', async () => {
  prisma.platformConfig.findMany.mockResolvedValue([
    { key: 'resilience.paystack.breaker_failure_threshold', value: 'not-a-number' },
  ]);
  await service.onModuleInit();
  // assert breaker still opens after RESILIENCE_DEFAULTS.paystack.failureThreshold consecutive failures
});
```

## Info

### IN-01: `readConfig()` still does not filter soft-deleted `PlatformConfig` rows (carried over, unaddressed)

**File:** `backend/src/resilience/resilience.service.ts:93-98`

**Issue:** Flagged in the prior `11-REVIEW.md` round as IN-01 and not addressed by plans 11-09/11-10/11-11. `this.prisma.platformConfig.findMany({ where: { key: { in: Object.values(keys) } } })` still has no `deletedAt: null` filter, so a soft-deleted (intentionally retired) threshold row would still be picked up at next process restart instead of falling back to `RESILIENCE_DEFAULTS`.

**Fix:** Add `deletedAt: null` to the `where` clause.

### IN-02: No `onModuleDestroy` teardown for cached circuit breakers (carried over, unaddressed)

**File:** `backend/src/resilience/resilience.service.ts`

**Issue:** Flagged in the prior round as IN-02, still unaddressed. `ResilienceService` has no `onModuleDestroy()`, so `ConsecutiveBreaker`'s internal `halfOpenAfter` timers are never explicitly cleared. Harmless for the long-running production process, but confirmed still producing "a worker process has failed to exit gracefully" warnings when running the resilience test suites, and could accumulate open handles in short-lived contexts (serverless, CLI scripts, CI workers that reinstantiate the module repeatedly).

**Fix:** Implement `onModuleDestroy()` to dispose cached breakers if cockatiel exposes a disposal API, or explicitly document why teardown is intentionally skipped.

### IN-03: `NotificationsService.registerToken`'s read-then-merge-then-write is not atomic

**File:** `backend/src/modules/notifications/notifications.service.ts:57-65`

**Issue:** The WR-01 fix correctly merges `fcmToken` into existing metadata, but the `findUnique` → `update` sequence is not transactional. If any other concurrent write to the same `user.metadata` JSON blob occurs between the read and the write (e.g. two rapid `registerToken` calls from a user's multiple devices, or a future feature that also writes `user.metadata`), one write can still silently clobber the other's changes. This is the same class of bug as the original overwrite defect, just narrower — no other code path writes `User.metadata` today, so it is low-risk in practice, but worth noting since the "no other writer today" reasoning is exactly what allowed the original bug to go unnoticed for a while.

**Fix:** If/when a second writer to `user.metadata` is introduced, revisit this with either a `$transaction` + row lock, a JSON-patch-style Prisma update (`{ metadata: { ...jsonPathSet... } }`), or an optimistic-concurrency check.

### IN-04: `NotificationsService.initFcm()` passes the same service-account credentials twice

**File:** `backend/src/modules/notifications/notifications.service.ts:37-44`

**Issue:** `client_email`/`private_key` are passed both to the `GoogleAuth` constructor's `credentials` option (line 38) and again to `.fromJSON({...})` (lines 40-44) with an identical shape. The constructor's `credentials` option is unused since `.fromJSON()` overrides the client construction. This is dead/redundant configuration — harmless today, but a future edit to one copy without the other would silently diverge.

**Fix:** Drop the unused `credentials` option from the `GoogleAuth` constructor call, or construct the `JWT` client directly instead of going through `GoogleAuth().fromJSON()`.

---

_Reviewed: 2026-07-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
