---
phase: quick
plan: 260723-gik
subsystem: payments
tags: [wallet, mobile, idempotency, react-native, tanstack-query]

# Dependency graph
requires: []
provides:
  - "mobile/app/send.tsx sends a required idempotencyKey on every POST /wallet/transfer request"
affects: [wallet, mobile-send-screen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local Math.random()-based idempotency/id generation for non-security-sensitive dedup keys, avoiding the unlinked uuid/crypto.getRandomValues() polyfill on Hermes (mirrors ai-chat.tsx's uuidv4())"

key-files:
  created: []
  modified:
    - "mobile/app/send.tsx"

key-decisions:
  - "Replicated ai-chat.tsx's local Math.random()-based uuidv4() construction rather than adding the uuid package or a native crypto polyfill, since idempotency keys only need per-request uniqueness, not cryptographic unpredictability"
  - "Generated the idempotencyKey fresh inside handleSend() on every invocation (not stored in state) so a genuine second Send attempt after a failed first one gets its own key and is never silently collapsed into a duplicate"

patterns-established:
  - "Client-generated idempotency keys for wallet-mutation endpoints: generate fresh per user-initiated action, never cache/reuse across attempts"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-07-23
---

# Quick Task 260723-gik: Fix Wallet Send Screen Missing Required idempotencyKey Summary

**Added a client-generated idempotencyKey to mobile/app/send.tsx's POST /wallet/transfer call, fixing a guaranteed HTTP 400 that made wallet-to-wallet Send completely non-functional**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-23T16:54:00Z
- **Completed:** 2026-07-23T16:58:58Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `mobile/app/send.tsx` now includes a valid `idempotencyKey` (8-64 chars) on every `/wallet/transfer` request, satisfying `TransferDto`'s required-field validation
- Each real Send button press generates its own fresh key via `generateIdempotencyKey()`, so a legitimate retry after a failed/timed-out attempt is never suppressed as a duplicate by the backend's dedup logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate and send a fresh idempotencyKey on every wallet transfer attempt** - `7f844de` (fix)

**Plan metadata:** (orchestrator will commit SUMMARY.md/STATE.md separately)

## Files Created/Modified
- `mobile/app/send.tsx` - Added `generateIdempotencyKey()` helper, added `idempotencyKey: string` to `transferMutation`'s payload type, and updated `handleSend()` to generate and pass a fresh key on every invocation

## Decisions Made
- Reused the exact `Date.now().toString(36)` + two `Math.random().toString(36)` segments construction from `ai-chat.tsx`'s `uuidv4()` rather than introducing the `uuid` package (confirmed unused elsewhere in `mobile/`, and Hermes lacks `crypto.getRandomValues()` without an unlinked native polyfill)
- Key generation happens inline at the top of `handleSend()`, not in component state or at render time, ensuring uniqueness per real send attempt while the pre-existing `transferMutation.isPending` guard still prevents double-firing from a single press

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx tsc --noEmit` in `mobile/` shows only pre-existing, unrelated errors (missing `@sentry/react-native` and `@react-native-community/datetimepicker` type declarations in other files — not caused by this change and out of scope per the deviation rules' scope boundary). No new type errors were introduced by the edits to `send.tsx`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wallet-to-wallet Send is now functional end-to-end (client sends all fields `TransferDto` requires). No blockers. Backend idempotency enforcement (`transfer.dto.ts`, `wallet.service.ts`) was out of scope and untouched, per plan.

---
*Phase: quick*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: mobile/app/send.tsx
- FOUND: .planning/quick/260723-gik-fix-wallet-send-screen-missing-required-/260723-gik-SUMMARY.md
- FOUND: 7f844de (commit)
