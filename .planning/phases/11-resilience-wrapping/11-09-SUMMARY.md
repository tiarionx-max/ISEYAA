---
phase: 11-resilience-wrapping
plan: 09
subsystem: infra
tags: [cockatiel, resilience, circuit-breaker, anthropic-sdk, sse, jest, fake-timers]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping
    provides: ResilienceService (backend/src/resilience/resilience.service.ts) with per-vendor cockatiel circuit-breaker + retry + timeout policies, built in earlier waves of this phase
provides:
  - streamChatWithTools and streamItinerary in ai.service.ts genuinely bounded by cockatiel's 8000ms per-attempt anthropic timeout and failureThreshold:3 circuit breaker (previously only syntactically wrapped — the wrapped promise resolved in microtask time regardless of real connection health)
  - Fake-timer regression test suite proving timeout engagement (~8000-8100ms) and breaker-opening (after 3 consecutive failures) against the REAL ResilienceService, not a mock
  - AbortSignal reference-identity test closing WR-02 for ai.service.spec.ts
affects: [11-resilience-wrapping, ai-module]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "await stream.withResponse() inside resilience.execute('anthropic', ...) to force the wrapped promise to await real HTTP connection establishment instead of resolving as soon as the synchronous MessageStream object is returned"
    - "Real-instance fake-timer regression test pattern (Test.createTestingModule with the bare ResilienceService class + jest.useFakeTimers()/advanceTimersByTimeAsync) mirrored from backend/src/resilience/__tests__/retry-timeout-composition.spec.ts, applied at a vendor call-site level rather than inside ResilienceService's own test file"

key-files:
  created: []
  modified:
    - backend/src/modules/ai/ai.service.ts
    - backend/src/modules/ai/__tests__/ai.service.spec.ts

key-decisions:
  - "Fixed both streamChatWithTools and streamItinerary call sites identically: const s = anthropic.messages.stream(...); await s.withResponse(); return s; — matches 11-REVIEW.md CR-01's proposed fix exactly"
  - "getLgaIntelligence left byte-for-byte unchanged since it uses messages.create() (a real Promise), which was already correctly protected by resilience.execute"
  - "Test C counts messages.stream() invocations via a closure-scoped counter incremented inside the mock stream factory, rather than indexing into the mocked Anthropic constructor's call history — avoids fragility from multiple Anthropic instances being constructed across nested describe blocks in the same test file"

patterns-established:
  - "Vendor-call-site resilience regression tests should construct a SEPARATE TestingModule with the real ResilienceService (not the file's default mocked-resilience module) plus fake timers, to prove the wrapped promise's timing behavior under simulated vendor latency — source inspection alone cannot catch a defect where correct-looking code (resilience.execute(...) wrapping a vendor call) resolves in microtask time regardless of real network health"

requirements-completed: [RESIL-01]

# Metrics
duration: 32min
completed: 2026-07-16
---

# Phase 11 Plan 09: Anthropic streaming resilience gap-closure (CR-01) Summary

**Both Anthropic SSE streaming call sites (`streamChatWithTools`, `streamItinerary`) now `await stream.withResponse()` inside `resilience.execute('anthropic', ...)`, giving cockatiel's 8000ms per-attempt timeout and 3-failure circuit breaker a genuine window over the real HTTP connection instead of resolving instantly on the synchronous `MessageStream` object.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-16T13:46:54-05:00 (branch caught up to microservices-redesign tip)
- **Completed:** 2026-07-16T14:17:59-05:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Closed the single blocking gap flagged by `11-VERIFICATION.md`'s re-verification (2026-07-16): `.messages.stream()` is synchronous and returns immediately, so wrapping it alone in `resilience.execute()` gave cockatiel's timeout/breaker no real window over the actual HTTP request. Both call sites now `await s.withResponse()` — which awaits the Anthropic SDK's internal `_connectedPromise` — before returning the stream.
- Added a fake-timer regression test suite that builds `AiService` against the REAL `ResilienceService` (not the file's mocked one) and proves, under simulated time, that a hung connection is bounded at ~8000-8100ms and that the `anthropic` circuit breaker opens after 3 consecutive failures — a test that would have failed against the pre-fix code (the wrapped promise resolved in microtask time, so the SSE error would have appeared immediately, not after the timeout window, and the breaker would never have opened).
- Closed WR-02 for `ai.service.spec.ts` with a strict reference-identity assertion that the exact `AbortSignal` instance from `resilience.execute`'s context reaches `messages.stream(...)`'s options object.
- Corrected the misleading "Connection-only retry boundary: resilience wraps only establishing the stream" code comments (which asserted a contract the code never actually delivered) at both call sites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix both Anthropic streaming call sites to genuinely await connection establishment** - `ab64ec4` (fix)
2. **Task 2: Add real-ResilienceService fake-timer regression tests and an AbortSignal reference-identity test** - `60cb6f3` (test)

**Plan metadata:** (this commit) `docs(11-09): complete plan`

## Files Created/Modified
- `backend/src/modules/ai/ai.service.ts` - Both `streamChatWithTools` and `streamItinerary`'s `resilience.execute('anthropic', ...)` callbacks now assign the stream to a local `s`, `await s.withResponse()`, then return `s`; misleading comments corrected; `getLgaIntelligence` untouched
- `backend/src/modules/ai/__tests__/ai.service.spec.ts` - `withResponse` mock added to `makeStream()`/`mockItineraryStream`; new `Anthropic` import + Sentry/OTel mocks (needed to construct the real `ResilienceService`); `platformConfig` stub added to `mockPrisma`; new describe block with 3 real-ResilienceService fake-timer tests (Test A/B/C); one AbortSignal reference-identity test (Test D) added to the existing `streamChatWithTools — basic SSE output` describe

## Decisions Made
- Followed 11-REVIEW.md CR-01's proposed fix verbatim (`const s = ...stream(...); await s.withResponse(); return s;`) at both call sites rather than any alternative shape, since the plan's `must_haves.key_links` pinned the exact pattern (`await s\.withResponse\(\)`) and variable name (`s`) at both sites.
- Used an explicit unrolled 3-call sequence for Test C (rather than a `for` loop) so `advanceTimersByTimeAsync` appears as 3 separate literal source occurrences, matching the plan's acceptance criterion (`grep -c "advanceTimersByTimeAsync"` >= 4 across Tests A/B/C).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branched from a commit predating all of phase 11's wave 1-3 work**
- **Found during:** Pre-task setup, before reading `backend/src/modules/ai/ai.service.ts`
- **Issue:** This worktree's branch (`worktree-agent-af3d434aa70f23c20`) was created from a commit (`548eea7`) that predates the entire `11-resilience-wrapping` phase — the `.planning/phases/11-resilience-wrapping/` directory, `backend/src/resilience/` module, and the `resilience.execute('anthropic', ...)` wrapping this plan needed to modify did not exist in the worktree at all. `git merge-base HEAD microservices-redesign` equaled the worktree's own `HEAD` exactly, confirming the worktree branch had zero unique commits of its own — it was a pure ancestor, not a diverged branch.
- **Fix:** Ran `git merge --ff-only microservices-redesign`, a zero-conflict fast-forward (no destructive operation — the worktree branch had no commits of its own to lose) that brought the branch up to the same tip as `microservices-redesign`, including all prior phase 11 waves and the `ResilienceService`/`resilience.types.ts` this plan depends on.
- **Files modified:** N/A (git ref update only, no working-tree file edits)
- **Verification:** `git log --oneline -3` confirmed `aba85be` (the commit that added `11-09-PLAN.md`) as the new tip; `git rev-parse --abbrev-ref HEAD` confirmed the branch name (`worktree-agent-af3d434aa70f23c20`) was unchanged by the fast-forward.
- **Commit:** N/A (ref update, not a file-content commit)

**2. [Rule 3 - Blocking] Fresh worktree had no installed dependencies or generated Prisma client**
- **Found during:** Task 1 verification (`npx jest src/modules/ai/__tests__/ai.service.spec.ts`)
- **Issue:** `node_modules` did not exist at all in this worktree (first run failed with `Cannot find module '@nestjs/testing'`); after `npm install`, the full-suite verification for Task 2 (`npm test`) failed 10/40 suites with Prisma TypeScript errors (`Property 'sql' does not exist on type 'typeof Prisma'`, missing `TourPackage`/`TransactionWhereInput` exports) because the Prisma client had never been generated against `backend/prisma/schema.prisma` in this fresh checkout.
- **Fix:** Ran `npm install` at the repo root (workspaces-aware, ~2338 packages) and `npx prisma generate` inside `backend/`.
- **Files modified:** None tracked in git (`node_modules/`, `.prisma/client/` are gitignored build artifacts)
- **Verification:** `cd backend && npm test` — 40/40 suites, 454/454 tests passing, exit code 0
- **Commit:** N/A (no trackable file changes — environment setup only)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking environment/setup issues, zero code-level deviations from the plan's specified fix)
**Impact on plan:** Both auto-fixes were prerequisite environment setup, not scope creep — the plan's actual code changes (ai.service.ts fix + regression tests) were implemented exactly as specified once the worktree/dependencies were in a runnable state.

## Issues Encountered
- None beyond the two environment/setup items documented above as deviations.

## TDD Gate Compliance

Task 2 was marked `tdd="true"` in the plan, but it is a test-only addition proving behavior already delivered by Task 1 within the same plan (a "gap-closure regression test," not new production behavior) — there is no separate production-code change for Task 2 to gate with a GREEN commit. Commit order is `fix(11-09)` (Task 1, the actual behavior change) followed by `test(11-09)` (Task 2, the regression proof), which is the correct order for a regression test added immediately after its own fix, though it does not match the canonical RED-before-GREEN TDD sequence (there is no commit where Test A/B/C exist and fail against the old code, since the old code was already replaced by Task 1's commit before Task 2 began). This is consistent with the plan's own framing: Task 2's `<done>` criterion explicitly states the new tests "would have failed against the pre-Task-1 code," describing expected behavior under a hypothetical rollback rather than a literal RED phase actually executed in this plan's git history.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RESIL-01 is now genuinely true (not just syntactically present) for the two highest-traffic, most latency-sensitive AI endpoints (chat, itinerary generation).
- `getLgaIntelligence` was already correctly protected and remains untouched.
- Full backend regression suite passes (40/40 suites, 454/454 tests) — no regressions introduced.
- This closes the last item noted as blocking in `11-VERIFICATION.md`'s 2026-07-16 re-verification pass for CR-01; the orchestrator should re-run phase 11 verification to confirm no other gaps remain before considering the phase fully closed.

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: backend/src/modules/ai/ai.service.ts
- FOUND: backend/src/modules/ai/__tests__/ai.service.spec.ts
- FOUND: .planning/phases/11-resilience-wrapping/11-09-SUMMARY.md
- FOUND commit: ab64ec4 (Task 1)
- FOUND commit: 60cb6f3 (Task 2)
- FOUND commit: ebdd5d8 (plan metadata)
