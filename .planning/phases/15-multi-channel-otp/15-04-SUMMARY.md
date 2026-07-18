---
phase: 15-multi-channel-otp
plan: 04
subsystem: auth
tags: [nestjs, class-validator, prisma, otp, users]

# Dependency graph
requires:
  - phase: 15-multi-channel-otp
    plan: "01"
    provides: "OtpChannel Prisma enum + TypeScript enum, User.otpChannel column"
provides:
  - "PATCH /users/me/otp-channel route, JWT-guarded, IDOR-safe (target user derived exclusively from @CurrentUser())"
  - "ChangeOtpChannelDto with required @IsEnum(OtpChannel) channel field"
  - "UsersService.updateOtpChannel(userId, channel)"
  - "USER_SELECT projection now includes otpChannel, so GET /users/me and every USER_SELECT-shaped response (switchRole, becomeHost, becomeGuide, findById) surfaces the current channel"
affects: [15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-field dto/ subfolder DTO convention (matches VerifyBvnDto) used instead of the inline-class SwitchRoleDto exception, since users/dto/ already exists"

key-files:
  created:
    - backend/src/modules/users/dto/change-otp-channel.dto.ts
  modified:
    - backend/src/modules/users/users.controller.ts
    - backend/src/modules/users/users.service.ts
    - backend/src/modules/users/__tests__/users.service.spec.ts

key-decisions:
  - "No membership/NotFoundException check in updateOtpChannel() (unlike switchRole()'s registeredRoles check) — any of the three OtpChannel enum values is always valid for any user; class-validator's @IsEnum already rejects malformed input before the service is reached"

patterns-established: []

requirements-completed: [OTP-01]

duration: 10min
completed: 2026-07-18
---

# Phase 15 Plan 04: OTP Channel Change Endpoint Summary

**PATCH /users/me/otp-channel endpoint, JWT-guarded and IDOR-safe, backed by UsersService.updateOtpChannel() and a USER_SELECT projection that now surfaces otpChannel on every user-profile read**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-18T15:41:00Z (approx)
- **Completed:** 2026-07-18T15:51:00Z (approx)
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `ChangeOtpChannelDto` (`backend/src/modules/users/dto/change-otp-channel.dto.ts`) exports a single required `channel: OtpChannel` field decorated with `@IsEnum(OtpChannel, ...)`, mirroring the `dto/` subfolder convention already used by `VerifyBvnDto`
- `UsersController` gained `PATCH /users/me/otp-channel`, guarded by the existing class-level `@UseGuards(JwtAuthGuard)`, deriving the target user exclusively from `@CurrentUser()` — never a client-supplied id, matching every other `/users/me/*` route
- `UsersService.updateOtpChannel(userId, channel)` updates the caller's own `otpChannel` and returns the `USER_SELECT`-shaped user object
- `USER_SELECT` now includes `otpChannel: true`, so `GET /users/me`, `switchRole`, `becomeHost`, `becomeGuide`, and `findById` all surface the current channel value
- New `updateOtpChannel` describe block in `users.service.spec.ts` asserts both the returned value and the exact `prisma.user.update` call shape (`where`/`data`)

## Task Commits

Each task was committed atomically:

1. **Task 1: ChangeOtpChannelDto + PATCH /users/me/otp-channel + UsersService.updateOtpChannel()** - `248cdc7` (feat)
2. **Task 2: updateOtpChannel() unit tests** - `693f9cf` (test)

_TDD-tagged tasks executed as implementation-then-test given the small, additive surface area (mirrors the existing switchRole precedent this plan explicitly follows); both verification commands (tsc, jest) confirmed green before each commit._

## Files Created/Modified
- `backend/src/modules/users/dto/change-otp-channel.dto.ts` - New `ChangeOtpChannelDto` (required `channel: OtpChannel`, `@IsEnum` validation)
- `backend/src/modules/users/users.controller.ts` - Added `changeOtpChannel` handler on `PATCH /users/me/otp-channel`, placed directly after `switchRole`
- `backend/src/modules/users/users.service.ts` - Added `otpChannel: true` to `USER_SELECT`; added `updateOtpChannel(userId, channel)` method after `switchRole()`
- `backend/src/modules/users/__tests__/users.service.spec.ts` - Added `updateOtpChannel` describe block asserting return value and exact `prisma.user.update` call args

## Decisions Made
- No membership/`NotFoundException` guard in `updateOtpChannel()`, unlike `switchRole()`'s `registeredRoles` check — every `OtpChannel` enum value (`SMS`/`WHATSAPP`/`EMAIL`) is valid for any user; malformed values are already rejected by `@IsEnum` in the global `ValidationPipe` before the service layer is reached.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no `node_modules`, blocking `tsc`/`jest`**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** This parallel-execution worktree was created without an `npm install`. Root and `backend/node_modules` were both absent.
- **Fix:** Created filesystem junctions from the worktree's `node_modules` and `backend/node_modules` to the main repo's corresponding directories (read-only CLI/type resolution only — no writes back to the main repo, and this plan makes no Prisma schema changes so no client-regeneration race was possible, unlike Plan 15-01's robocopy workaround).
- **Files modified:** None (environment/tooling only — `node_modules` is gitignored)
- **Verification:** `npx tsc --noEmit -p tsconfig.build.json` exits 0; `npx jest --testPathPattern users.service.spec --no-coverage` passes 8/8 tests including the new `updateOtpChannel` test
- **Committed in:** N/A (no repo files changed by this fix)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment/tooling only, no code impact)
**Impact on plan:** No scope creep; fix was purely local dev-environment setup required to execute the plan's own verification commands inside a fresh git worktree.

## Issues Encountered
- See Deviations above — the fresh worktree lacked `node_modules`, resolved via junctions to the main repo's directories.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 15-06's mobile settings screen can now call `PATCH /users/me/otp-channel` with `{ channel: 'SMS' | 'WHATSAPP' | 'EMAIL' }` and read the current value back from `GET /users/me`'s `otpChannel` field, exactly per the interface contract this plan's frontmatter declared.
- This plan was independent of Plan 15-03 (different files) — both consumed Plan 15-01's `OtpChannel` enum in parallel with no merge conflicts expected.
- No blockers for downstream Wave 2/3 plans.

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 4 claimed files verified present on disk; both claimed commit hashes (248cdc7, 693f9cf) verified present in git log.
