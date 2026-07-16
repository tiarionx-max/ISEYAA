---
phase: 11-resilience-wrapping
plan: 03
subsystem: infra
tags: [cockatiel, circuit-breaker, resilience, nestjs, fcm, anthropic, sse]

# Dependency graph
requires:
  - phase: 11-01
    provides: "@Global() ResilienceService.execute(vendor, fn) facade with 7 cached per-vendor cockatiel policies (including anthropic and fcm)"
provides:
  - "NotificationsService.sendPush() FCM call routed through resilience.execute('fcm', ...) with D-02 never-throw contract preserved"
  - "AiService's three Anthropic call sites (streamChatWithTools, streamItinerary, getLgaIntelligence) routed through resilience.execute('anthropic', ...) with connection-only retry scoping"
  - "getLgaIntelligence error handling (previously none) with ServiceUnavailableException on resilience-policy failure"
affects: [11-04-termii-wrapping, 11-05-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connection-only retry boundary: resilience.execute wraps only the anthropic.messages.stream() connection-establishment call; the for-await chunk loop and finalMessage() run entirely outside the policy so a mid-stream failure is never retried"
    - "Anthropic SDK client constructed with maxRetries:0 so cockatiel is the single source of retry truth for that vendor (no compounding SDK+cockatiel retries)"
    - "async () => this.anthropic.messages.stream({...}) wrapper — MessageStream itself is not PromiseLike, so the arrow function passed to resilience.execute must be declared async to satisfy the (context) => PromiseLike<T> signature"

key-files:
  created: []
  modified:
    - backend/src/modules/notifications/notifications.service.ts
    - backend/src/modules/notifications/__tests__/notifications.service.spec.ts
    - backend/src/modules/ai/ai.service.ts
    - backend/src/modules/ai/__tests__/ai.service.spec.ts

key-decisions:
  - "Wrapped only axios.post(...) in NotificationsService.sendPush, leaving the surrounding try/catch untouched — D-02's swallow-and-report contract now proven to survive a simulated circuit-open via a dedicated test"
  - "Anthropic streaming call sites wrap only the connection call (messages.stream(...)), never the for-await consumption loop — guarantees a post-first-token failure is never silently retried"
  - "getLgaIntelligence's new catch block throws a static ServiceUnavailableException string, never the raw err.message or Anthropic error body (T-11-01 mitigation)"

patterns-established:
  - "Vendor call sites that return a non-Promise stream object (Anthropic's MessageStream) must wrap the resilience.execute callback in an async arrow function, not a plain arrow returning the stream call directly"

requirements-completed: [RESIL-01]

# Metrics
duration: 25min
completed: 2026-07-16
---

# Phase 11 Plan 03: FCM + Anthropic Resilience Wrapping Summary

**NotificationsService.sendPush (FCM) and AiService's three Anthropic call sites now route through ResilienceService.execute, preserving FCM's D-02 never-throw contract and scoping Anthropic's retry to the stream-connection attempt only, plus first-time error handling for getLgaIntelligence**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-16T15:16:00Z (approx, worktree branch-point)
- **Completed:** 2026-07-16T15:40:05Z
- **Tasks:** 2 completed
- **Files modified:** 4 (2 service files, 2 spec files)

## Accomplishments
- `NotificationsService.sendPush()`'s FCM `axios.post` call now routes through `resilience.execute('fcm', ...)` — D-02's never-throw swallow-and-report contract proven to survive a simulated circuit-open via a new dedicated test
- New `notifications.service.spec.ts` test file (4 passing cases) — this service previously had zero test coverage
- `AiService`'s Anthropic client is now constructed with `maxRetries: 0`, making cockatiel the single source of retry truth for that vendor (removes the SDK+cockatiel double-retry compounding risk from RESEARCH.md Pitfall 3)
- `streamChatWithTools()` and `streamItinerary()` both wrap only the `anthropic.messages.stream()` connection call in `resilience.execute('anthropic', ...)` — the `for await` chunk-consumption loop and `finalMessage()` call run entirely outside the policy, so a mid-stream failure (after the first token) is never retried
- `getLgaIntelligence()` gains error handling for the first time: the Anthropic `messages.create()` call is resilience-wrapped inside a new `try/catch` that throws a static `ServiceUnavailableException` on any failure — no raw vendor error detail is ever surfaced (T-11-01)

## Task Commits

Each task was committed atomically:

1. **Task 1a: Add failing test for NotificationsService.sendPush resilience wrapping** - `193de5c` (test — RED)
1. **Task 1b: Wrap NotificationsService.sendPush FCM call in resilience.execute** - `9e1a995` (feat — GREEN)
2. **Task 2a: Add failing tests for AiService resilience wrapping** - `79b31a8` (test — RED)
2. **Task 2b: Wrap AiService Anthropic calls in resilience.execute (connection-only retry)** - `54b8e0e` (feat — GREEN)

_Both tasks are TDD tasks (RED → GREEN). No refactor commit was needed — implementation was clean on first pass after one type-fix iteration (see Issues Encountered)._

## Files Created/Modified
- `backend/src/modules/notifications/notifications.service.ts` - Injected `ResilienceService`; wrapped `axios.post(...)` FCM call in `resilience.execute('fcm', ...)`; surrounding try/catch (D-02 contract) unchanged
- `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` - New file: 4 test cases covering no_token/not_configured guards, success path (asserts `resilience.execute` called with `'fcm'`), and D-02 never-throw contract under simulated circuit-open
- `backend/src/modules/ai/ai.service.ts` - `Anthropic` client constructed with `maxRetries: 0`; injected `ResilienceService`; wrapped all three Anthropic call sites (`streamChatWithTools`, `streamItinerary`, `getLgaIntelligence`) in `resilience.execute('anthropic', ...)`; `getLgaIntelligence` gained a new try/catch throwing `ServiceUnavailableException`
- `backend/src/modules/ai/__tests__/ai.service.spec.ts` - Added `ResilienceService` mock provider; new test asserting connection-only retry boundary (mid-stream never retried, `vector.upsertInteraction` not called on connection failure); new `getLgaIntelligence` describe block (success + `ServiceUnavailableException` on failure)

## Decisions Made
- Anthropic's `messages.stream(...)` call returns a `MessageStream` object that is not itself `PromiseLike` (no `.then()`), so the callback passed to `resilience.execute` had to be declared `async () => this.anthropic.messages.stream({...})` rather than a plain arrow directly returning the call — TypeScript's own suggestion ("Did you mean to mark this function as 'async'?") confirmed this was the correct fix, not a workaround.
- `messages.create(...)` (used in `getLgaIntelligence`) returns a genuine `Promise` already, so no async-wrapper adjustment was needed there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resilience.execute` callback needed `async` wrapper for Anthropic's `messages.stream()` calls**
- **Found during:** Task 2 (GREEN implementation, `npx tsc` type errors during `npx jest` run)
- **Issue:** `this.anthropic.messages.stream({...})` returns `MessageStream`, which lacks a `.then()` method, so passing it directly as the `resilience.execute` callback failed `PromiseLike<T>` type-checking (`TS2741: Property 'then' is missing`)
- **Fix:** Marked the arrow function callback `async` (`async () => this.anthropic.messages.stream({...})`) in both `streamChatWithTools()` and `streamItinerary()`, which correctly wraps the returned `MessageStream` in a resolved Promise without changing runtime behavior
- **Files modified:** `backend/src/modules/ai/ai.service.ts`
- **Verification:** `npx jest src/modules/ai/__tests__/ai.service.spec.ts` — all 14 tests pass; `npx tsc --noEmit` shows zero errors in `ai.service.ts`
- **Committed in:** `54b8e0e` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, type-correctness only — no behavior change)
**Impact on plan:** Necessary for the wrap to compile at all; no scope creep, no behavior change from what the plan specified.

## Issues Encountered
- The worktree had no `node_modules` installed at all (fresh worktree, not yet `npm install`'d). Ran `npm install --workspace=backend` from the worktree root before any test could execute — this is expected worktree setup, not a plan deviation, and is called out per the executor's worktree guidance note.
- Pre-existing, unrelated TypeScript compile errors exist elsewhere in the codebase (`tour-packages`, `transport`, `wallet`, `stays`, `studio` modules) — confirmed via scoped `npx tsc --noEmit | grep` that none touch `notifications.service.ts`, `ai.service.ts`, or `resilience/*` (out of this plan's scope per the deviation rules' scope boundary).

## User Setup Required

None - no external service configuration required. `ResilienceService` was already globally registered by Plan 01.

## Next Phase Readiness

- FCM and Anthropic vendor call sites are both resilience-wrapped and test-covered.
- Plan 04 (Termii wrapping) can proceed independently — no shared code with this plan beyond the already-established `ResilienceService.execute(vendor, fn)` facade.
- No blockers.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*

## Self-Check: PASSED

All modified files verified present on disk; all 4 commits (`193de5c`, `9e1a995`, `79b31a8`, `54b8e0e`) verified present in git log.
