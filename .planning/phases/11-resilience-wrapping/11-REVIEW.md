---
phase: 11-resilience-wrapping
reviewed: 2026-07-16T17:56:30Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - backend/src/resilience/resilience.service.ts
  - backend/src/resilience/__tests__/retry-timeout-composition.spec.ts
  - backend/src/resilience/__tests__/resilience.service.spec.ts
  - backend/src/common/services/paystack.service.ts
  - backend/src/common/services/__tests__/paystack.service.spec.ts
  - backend/src/common/services/s3.service.ts
  - backend/src/common/services/__tests__/s3.service.spec.ts
  - backend/src/modules/notifications/notifications.service.ts
  - backend/src/modules/notifications/__tests__/notifications.service.spec.ts
  - backend/src/modules/ai/ai.service.ts
  - backend/src/modules/ai/__tests__/ai.service.spec.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 11: Code Review Report (Gap-Closure Batch — Plans 11-06/11-07/11-08)

**Reviewed:** 2026-07-16T17:56:30Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This review covers the gap-closure batch that fixed CR-01 (retry/timeout composition order) and CR-02 (missing AbortSignal propagation) from the original 11-REVIEW.md/11-VERIFICATION.md. This report replaces the prior 11-REVIEW.md; the finding IDs below (CR-01, WR-01, etc.) are freshly numbered for this batch and do not refer to the same findings as the previous review.

**CR-01 (composition order) verified correct.** Traced `cockatiel`'s actual `wrap()` implementation (`node_modules/cockatiel/dist/Policy.js`): `wrap(breaker, retry, timeout)` nests execution as `breaker(retry(timeout(fn)))` — timeout is innermost and re-applied fresh on every retry attempt, exactly as the code comment claims. `retry-timeout-composition.spec.ts`'s fake-timer regression test correctly exercises this (3 attempts × 800ms each, well past a single 1000ms timeout window, all pass because timeout resets per-attempt). Also verified `RetryPolicy`'s `maxAttempts: 0` is a genuine zero-retry no-op (`retries < maxAttempts` is `0 < 0 = false`), confirming `paystackRefund`'s design intent. All 81 tests across the 9 affected suites pass (`npx jest` run performed as part of this review).

**CR-02 (AbortSignal propagation) is correctly wired for every non-AI call site.** `paystack.service.ts`, `s3.service.ts`, `notifications.service.ts`, `auth.service.ts`, and `delivery.service.ts` all destructure `{ signal }` from the resilience context and forward it into the underlying HTTP call (`axios` `signal`, AWS SDK `abortSignal`, native `fetch` `signal`) — verified each option name is correct against the actual library APIs in `node_modules`.

**However, a new and more serious defect was found in `ai.service.ts`:** the resilience wrapping around Anthropic's `.stream()` calls provides no actual timeout/retry/circuit-breaker protection, because `.stream()` returns synchronously without waiting for the connection to establish. This is not a regression introduced by the CR-01/CR-02 fixes — it predates Plan 11-08 and remains broken after it, even though 11-08 correctly threads the AbortSignal into `.stream()`'s options. See CR-01 below (this batch's own numbering).

## Critical Issues

### CR-01: `AiService`'s resilience wrapping around Anthropic `.stream()` calls provides no actual timeout/retry/circuit-breaker protection

**File:** `backend/src/modules/ai/ai.service.ts:279-290` (`streamChatWithTools`) and `backend/src/modules/ai/ai.service.ts:494-503` (`streamItinerary`)

**Issue:** Both call sites wrap the *establishment* of the Anthropic stream in `resilience.execute('anthropic', ...)`:

```ts
const stream = await this.resilience.execute('anthropic', async ({ signal }) =>
  this.anthropic.messages.stream({ ... }, { signal }),
);
```

The comment above this code claims: *"Connection-only retry boundary: resilience wraps only establishing the stream."* This is incorrect. `@anthropic-ai/sdk`'s `messages.stream()` has the type signature `stream(body, options?): MessageStream` (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:35`) — it is **synchronous**, returning a `MessageStream` object immediately. The actual HTTP request is kicked off in the background via `MessageStream._run(() => this._createMessage(...))` (`node_modules/@anthropic-ai/sdk/lib/MessageStream.js:110-118`), which is **fire-and-forget** and never awaited by `.stream()` itself.

Consequently, the `async ({ signal }) => this.anthropic.messages.stream(...)` callback passed to `resilience.execute` resolves in microtask time — long before cockatiel's per-attempt `timeout(cfg.timeoutMs)` (8000ms for `anthropic`) can ever fire, and without ever rejecting on a real connection failure. This means:

1. **The 8-second timeout never applies to the actual network request.** If the Anthropic API hangs during connection setup, cockatiel's `TimeoutPolicy` will never observe it — the wrapped promise already resolved before the timer becomes relevant (verified by tracing `TimeoutPolicy.execute()` in `node_modules/cockatiel/dist/TimeoutPolicy.js:56-76`: it races `fn(context)` against a timer, and `fn(context)` here settles almost instantly).
2. **The circuit breaker never opens due to connection-level failures** on these two paths, because `resilience.execute()` essentially always resolves successfully (the breaker never sees the eventual real network error).
3. Real connection failures (DNS, TLS, hung connection, 5xx) surface later as an `'error'` event on the async iterator (`for await (const chunk of stream)`, `node_modules/@anthropic-ai/sdk/lib/MessageStream.js:521-527`) — entirely **outside** the `resilience.execute()` call, silently bypassing retry/timeout/breaker.

This directly contradicts the 11-08 commit message's claim ("an aggressive resilience timeout now actually cancels the in-flight Anthropic stream/request instead of only abandoning the caller's promise") — the AbortSignal *is* threaded correctly into `.stream()`'s options, but cockatiel's timeout timer that would fire that abort never gets a meaningful window to run, since the policy chain resolves before the timer is relevant.

Note `getLgaIntelligence` (`ai.service.ts:538-552`) is **not** affected — it uses `this.anthropic.messages.create(...)`, which returns a real `Promise` that only resolves once the response is received, so resilience wrapping works correctly there.

This gap is not caught by any test: `ai.service.spec.ts` mocks `messages.stream()` synchronously (matching real behavior) but never exercises timing with fake timers the way `retry-timeout-composition.spec.ts` does for the generic resilience service — so there is no regression test that would have caught this.

**Fix:** Make the wrapped operation actually wait for the connection before resolving, e.g. by awaiting the stream's connection promise inside the resilience-wrapped callback:

```ts
const stream = await this.resilience.execute('anthropic', async ({ signal }) => {
  const s = this.anthropic.messages.stream({ ...params }, { signal });
  await s.withResponse(); // resolves once the connection is established / response headers arrive
  return s;
});
```

(`MessageStream.withResponse()` awaits the internal `_connectedPromise`, which only resolves after the underlying HTTP response begins — see `node_modules/@anthropic-ai/sdk/lib/MessageStream.js:82-92`.) This gives cockatiel's per-attempt timeout a real window to enforce, and lets the circuit breaker see genuine connection failures. Add a fake-timer regression test analogous to `retry-timeout-composition.spec.ts` that simulates a slow/hanging Anthropic connection and asserts the resilience timeout actually fires for `streamChatWithTools`/`streamItinerary`.

## Warnings

### WR-01: `NotificationsService.registerToken` overwrites the entire `user.metadata` JSON blob instead of merging

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

`User.metadata` is a Prisma `Json?` field. This `update()` replaces the entire JSON document with `{ fcmToken: token }`, discarding any other keys that may already exist on `metadata`. Currently nothing else in the codebase writes other keys into `User.metadata`, so there is no observable data loss today — but this is a latent trap: the next feature that stores anything else in `user.metadata` (preferences, device info, etc.) will have its data silently wiped every time a user re-registers an FCM token (e.g. on every app relaunch).

**Fix:** Merge instead of replace, e.g. read-then-merge:

```ts
const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
const metadata = { ...(user?.metadata as Record<string, any> | undefined), fcmToken: token };
await this.prisma.user.update({ where: { id: userId }, data: { metadata } });
```

### WR-02: AbortSignal reference-identity is only tested for one of six resilience-wrapped call sites

**Files:** `backend/src/common/services/__tests__/paystack.service.spec.ts:78-92` (has it) vs. `s3.service.spec.ts`, `notifications.service.spec.ts`, `ai.service.spec.ts`, `auth.service.spec.ts`, `delivery.service.spec.ts` (do not)

**Issue:** CR-02 in the original review was specifically about missing AbortSignal propagation into the underlying vendor call. Only `paystack.service.spec.ts` ("Test 7") asserts that the *exact same* `AbortSignal` instance cockatiel provides reaches the underlying call (`expect(mockedAxios.post.mock.calls[0][2]?.signal).toBe(controller.signal)`). The other five spec files only assert that `resilience.execute` was called with the right vendor key and a function — none of them verify the signal actually reaches `s3.send()`'s `abortSignal` option, `fetch()`'s `signal` option (notifications, auth, delivery), or the Anthropic SDK's `options.signal`. A regression that silently dropped the signal forwarding in any of these five services (e.g. a future refactor) would not be caught by the current test suite.

**Fix:** Add a reference-identity assertion (mirroring paystack's Test 7) to each of the other five spec files, e.g. for `s3.service.spec.ts`:

```ts
it('forwards the exact AbortSignal into S3Client.send as abortSignal', async () => {
  const controller = new AbortController();
  mockResilience.execute.mockImplementationOnce((_v, fn) => fn({ signal: controller.signal }));
  await service.upload('k', Buffer.from('x'), 'image/jpeg');
  const sendMock = (service.getClient() as any).send;
  expect(sendMock.mock.calls[0][1]?.abortSignal).toBe(controller.signal);
});
```

### WR-03: `isTransientError` does not recognize axios's own abort-cancellation error code (`ERR_CANCELED`)

**File:** `backend/src/resilience/resilience.service.ts:194-216`

**Issue:** When cockatiel's aggressive timeout fires, it aborts the shared `AbortSignal` passed into `axios`. Axios (1.x) reacts to signal abortion by rejecting with a `CanceledError` whose `.code` is `'ERR_CANCELED'` (not `'ABORT_ERR'`, which is the native `fetch`/`undici` abort code already handled at line 205). `isTransientError`'s recognized-code allowlist (`ECONNREFUSED, ETIMEDOUT, ECONNRESET, ENOTFOUND, EAI_AGAIN, ABORT_ERR`) does not include `ERR_CANCELED`, and axios's `CanceledError.name` is `'CanceledError'`, not `'AbortError'` (the check at line 211), so it also fails that branch.

In practice this is usually masked because cockatiel's own `TaskCancelledError` (with `isTaskCancelledError: true`, handled at line 199) wins the `Promise.race` against the underlying axios call in `TimeoutPolicy`'s aggressive strategy — so the axios-side `CanceledError` rarely reaches `isTransientError` first. But this is a timing coincidence, not a guarantee: a future move to `TimeoutStrategy.Cooperative` (which does *not* race and instead waits for `fn` to observe and honor the abort itself — see `node_modules/cockatiel/dist/TimeoutPolicy.js:66-67`) would surface the axios `CanceledError` directly, and it would be misclassified as non-transient — silently excluding it from retry and from the circuit breaker's failure accounting.

**Fix:** Add `'ERR_CANCELED'` to the recognized network-code allowlist:

```ts
['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR', 'ERR_CANCELED'].includes(code)
```

## Info

### IN-01: `ResilienceService.readConfig()` does not filter soft-deleted `PlatformConfig` rows

**File:** `backend/src/resilience/resilience.service.ts:95-97`

**Issue:** `this.prisma.platformConfig.findMany({ where: { key: { in: Object.values(keys) } } })` does not exclude rows with `deletedAt` set. If an operator soft-deletes a misconfigured threshold row expecting the per-key default to take over, the stale (deleted) value would still be picked up at next process restart. This matches the existing convention elsewhere in the codebase (e.g. `tour-bookings.service.ts` also reads `platformConfig` without a `deletedAt` filter), so it's not a regression introduced by this batch, but it's worth flagging since `readConfig()` is brand-new code for this phase and is exactly the kind of place a `deletedAt: null` filter would matter most (security/reliability thresholds).

### IN-02: Resilience test suites leave a background timer running past teardown

**File:** `backend/src/resilience/__tests__/resilience.service.spec.ts`, `backend/src/resilience/__tests__/retry-timeout-composition.spec.ts`

**Issue:** Running the full test batch (`npx jest src/resilience ...`) produces `A worker process has failed to exit gracefully ... Active timers can also cause this, ensure that .unref() was called on them.` This is most likely `ConsecutiveBreaker`'s internal `halfOpenAfter` timer surviving past the test's lifetime, since `ResilienceService` has no `onModuleDestroy()` to tear down its cached breakers. In a long-running NestJS process this is harmless (the breakers are meant to live for the process lifetime), but it's worth confirming this doesn't accumulate open handles in short-lived contexts (e.g. serverless, CLI scripts, or CI test workers that spin up the module repeatedly).

---

_Reviewed: 2026-07-16T17:56:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
