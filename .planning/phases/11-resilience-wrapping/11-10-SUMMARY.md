---
phase: 11-resilience-wrapping
plan: 10
subsystem: api
tags: [nestjs, notifications, prisma, jest, fcm, resilience, data-integrity]

# Dependency graph
requires:
  - phase: 11-resilience-wrapping
    provides: ResilienceService (cockatiel-based retry/timeout/circuit-breaker wrapper) used by NotificationsService.sendPush
provides:
  - Read-then-merge NotificationsService.registerToken implementation that preserves pre-existing User.metadata keys
  - AbortSignal reference-identity test for NotificationsService.sendPush, closing the notifications.service.ts slice of WR-02
affects: [11-resilience-wrapping, any future phase that stores additional keys on User.metadata]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-then-merge JSON column update: findUnique (select only the JSON column) -> object-spread existing value -> update, instead of a blind overwrite, to avoid destroying co-located data on a shared JSON column"
    - "AbortSignal reference-identity test pattern (mockResilience.execute.mockImplementationOnce injecting a real AbortController().signal, then asserting axios call args[2].signal toBe(controller.signal)) mirrored from paystack.service.spec.ts Test 7"

key-files:
  created: []
  modified:
    - backend/src/modules/notifications/notifications.service.ts
    - backend/src/modules/notifications/__tests__/notifications.service.spec.ts

key-decisions:
  - "Used select: { metadata: true } on the findUnique read in registerToken to avoid pulling the full User row for a single-field read"
  - "Preserved return shape { registered: true } exactly, per plan constraint not to change listForUser() or sendPush() production logic"

patterns-established:
  - "Read-then-merge pattern for any future write to User.metadata (or other shared JSON columns) — never blind-overwrite a JSON blob more than one feature may write to"

requirements-completed: [RESIL-01]

# Metrics
duration: 2min
completed: 2026-07-16
---

# Phase 11 Plan 10: Notifications metadata merge + AbortSignal coverage Summary

**Fixed a latent data-destruction trap in FCM token registration (read-then-merge instead of blind overwrite of `User.metadata`) and closed a test-coverage gap proving `sendPush`'s AbortSignal reference-identity forwarding.**

## Performance

- **Duration:** ~2 min (task work; environment setup for node_modules junctions took longer but is not part of the plan's task time)
- **Started:** 2026-07-16T14:29:00Z (approx, first commit at 14:31:10)
- **Completed:** 2026-07-16T14:32:33Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `NotificationsService.registerToken` no longer overwrites the entire `User.metadata` JSON document on every FCM token registration — it now reads existing metadata via `findUnique`, spreads it, and merges in the new `fcmToken` before writing
- Added two dedicated tests proving the merge behavior: one with pre-existing keys (`preferences.theme`) surviving the write, one with `metadata: null` (no crash on spreading `null`)
- Added a reference-identity test proving `sendPush` forwards the *exact* `AbortSignal` instance cockatiel provides into `axios.post`'s request config (not merely an equal-shaped object), mirroring the existing pattern in `paystack.service.spec.ts` Test 7
- Full backend regression suite (40 suites, 453 tests) passes with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix registerToken to merge metadata instead of overwrite (WR-01)** - `fe0ecca` (fix, TDD RED→GREEN)
2. **Task 2: Add AbortSignal reference-identity test for sendPush (WR-02)** - `5f9758b` (test)

_Note: Task 1 used TDD — a RED-phase test run confirmed the merge-preservation test failed against the pre-fix overwrite implementation before the fix was applied and committed together with its passing tests._

## Files Created/Modified
- `backend/src/modules/notifications/notifications.service.ts` - `registerToken` changed from a single blind `update({ data: { metadata: { fcmToken: token } } })` to a read-then-merge: `findUnique({ select: { metadata: true } })` → object-spread → `update`
- `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` - Added `update: jest.fn()` to `mockPrisma.user`; added a `describe('NotificationsService.registerToken', ...)` block with the merge-preservation and null-metadata tests; added one AbortSignal reference-identity test to the existing `describe('NotificationsService.sendPush', ...)` block

## Decisions Made
- Used `select: { metadata: true }` on the `findUnique` read (rather than fetching the full user row) since `registerToken` only needs the `metadata` field
- Kept the merge test assertions using `expect.objectContaining({ data: {...} })` per the plan's specified assertion style, matching the exact nested-object shape rather than a partial/deep-equal check on `data.metadata` alone

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` and `<behavior>` specs precisely; no architectural changes, no scope additions beyond what was specified.

### Environment note (not a plan deviation)
This worktree was branched from a commit ~86 commits behind the current `microservices-redesign` branch tip and did not yet contain the `11-resilience-wrapping` phase directory or `resilience.service.ts` at all. Verified the worktree branch had zero unique commits ahead of the merge-base (i.e., it was a pure ancestor with nothing to lose) before fast-forward merging `microservices-redesign` into the worktree branch to bring in the plan file and its dependencies. This was necessary to have anything to execute — no production code was affected by this step, it only brought the worktree branch up to date with commits already on `microservices-redesign`. Additionally, `node_modules` was not present in the worktree (git worktrees don't carry `node_modules`); created Windows NTFS junctions (`mklink /J`) pointing at the main repo's `node_modules` and `backend/node_modules` to run tests without a full reinstall. Neither the merge nor the junctions are tracked by git and do not appear in any commit.

## Issues Encountered
- Initial `ln -s` attempts in Git Bash on Windows silently produced partial/broken directory copies instead of true symlinks/junctions for `node_modules`; resolved by using `cmd //c "mklink /J ..."` (NTFS junction, no admin privilege required) instead, which correctly resolved all packages including `@nestjs/testing`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `registerToken` is now safe for any future feature that co-locates additional data on `User.metadata` (e.g. preferences, device info) — it will no longer be silently wiped on FCM token re-registration
- WR-01 and the notifications.service.ts slice of WR-02 from `11-REVIEW.md` are closed
- Full backend suite green (40 suites / 453 tests) — no regressions introduced

---
*Phase: 11-resilience-wrapping*
*Completed: 2026-07-16*
