---
phase: 11-resilience-wrapping
plan: 08
subsystem: resilience
tags: [cockatiel, abortsignal, anthropic-sdk, fetch, termii, ai, auth, delivery]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping
    provides: "resilience.service.ts's execute<T>() signature already passes { signal } in its callback context (established in earlier plans of this phase)"
provides:
  - "AbortSignal propagation into all 3 Anthropic SDK call sites in ai.service.ts (streamChatWithTools, streamItinerary, getLgaIntelligence)"
  - "AbortSignal propagation into both remaining Termii fetch() call sites (auth.service.ts sendTermii, delivery.service.ts sendTermiiDeliveryOtp)"
affects: [11-07 (paystack/s3/notifications AbortSignal plan, disjoint file set, closes the same CR-02 finding), 11-VERIFICATION.md CR-02 remediation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resilience.execute(vendor, ({ signal }) => ...) — destructure signal from the resilience context object and forward it as the second RequestOptions argument to Anthropic SDK calls, or as a signal key in fetch()'s init object"

key-files:
  created: []
  modified:
    - backend/src/modules/ai/ai.service.ts
    - backend/src/modules/ai/__tests__/ai.service.spec.ts
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - backend/src/modules/delivery/delivery.service.ts
    - backend/src/modules/delivery/__tests__/delivery.service.spec.ts

key-decisions:
  - "Only the fetch()/messages.stream()/messages.create() call arguments changed — all surrounding Termii→Twilio→console-stub (D-03) and log-and-swallow fallback logic left untouched, matching the plan's explicit constraint"
  - "termiiAuth and termiiDelivery vendor keys kept distinct (D-08) — no merge of their resilience policies"

patterns-established:
  - "Test mocks for resilience.execute must invoke the callback with an object containing a signal key ({ signal: undefined }) rather than calling it bare, since production code now destructures { signal } from the context argument"

requirements-completed: [RESIL-01]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Phase 11 Plan 08: Thread AbortSignal into ai/auth/delivery Termii+Anthropic calls Summary

**Forwarded cockatiel's AbortSignal into all 3 Anthropic SDK call sites in ai.service.ts and both remaining Termii fetch() calls (auth.service.ts, delivery.service.ts), so an aggressive resilience timeout now actually cancels the in-flight request instead of merely abandoning the caller's promise.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T16:59:00Z
- **Completed:** 2026-07-16T17:11:38Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `ai.service.ts`'s `streamChatWithTools`, `streamItinerary`, and `getLgaIntelligence` all destructure `{ signal }` from `resilience.execute`'s context and pass it as the Anthropic SDK's second `RequestOptions` argument
- `auth.service.ts`'s `sendTermii` and `delivery.service.ts`'s `sendTermiiDeliveryOtp` both forward `signal` into `fetch()`'s init object
- All 3 affected spec files' `mockResilience.execute` initializers updated to invoke the callback with `{ signal: undefined }` instead of calling it bare, preventing a crash from the new destructuring signature
- Full backend regression suite (39 suites / 443 tests) passes with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread AbortSignal into ai.service.ts (3 Anthropic call sites)** - `4127b43` (fix)
2. **Task 2: Thread AbortSignal into auth.service.ts and delivery.service.ts Termii calls** - `4765286` (fix)

**Plan metadata:** (this commit, added after SUMMARY.md)

## Files Created/Modified
- `backend/src/modules/ai/ai.service.ts` - 3 Anthropic call sites (`streamChatWithTools`, `streamItinerary`, `getLgaIntelligence`) now pass `{ signal }` as the SDK's `RequestOptions` second argument
- `backend/src/modules/ai/__tests__/ai.service.spec.ts` - `mockResilience.execute` top-level initializer and `beforeEach`'s `mockImplementation` reset both invoke `fn({ signal: undefined })`
- `backend/src/modules/auth/auth.service.ts` - `sendTermii`'s `fetch()` call now includes `signal` in its init object
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` - `mockResilience.execute` initializer invokes `fn({ signal: undefined })`
- `backend/src/modules/delivery/delivery.service.ts` - `sendTermiiDeliveryOtp`'s `fetch()` call now includes `signal` in its init object
- `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` - `mockResilience.execute` initializer invokes `fn({ signal: undefined })`

## Decisions Made
- None beyond the plan's explicit instructions - followed the plan as specified, including the constraint to leave D-03/D-08 fallback chains and vendor key names untouched.

## Deviations from Plan

None - plan executed exactly as written. One environment-only accommodation was needed (documented below under Issues Encountered) but did not change any plan-scoped file.

## Issues Encountered
- This git worktree had no `node_modules` installed (fresh worktree checkout; `node_modules` is gitignored and not present in any worktree by default). Created Windows directory junctions (`New-Item -ItemType Junction`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's already-installed `node_modules` directories, so Jest could resolve `@nestjs/testing` and other dependencies without a fresh `npm install`. This is a local, gitignored, non-destructive filesystem link — it does not appear in `git status` and requires no commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CR-02 (missing AbortSignal propagation) is now closed for all 5 call sites this plan covers (3 in `ai.service.ts`, 1 each in `auth.service.ts`/`delivery.service.ts`), disjoint from Plan 11-07's paystack/s3/notifications call sites — together these two plans close all 6 files named in `11-VERIFICATION.md`'s CR-02 finding
- No blockers for subsequent phase work

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*
