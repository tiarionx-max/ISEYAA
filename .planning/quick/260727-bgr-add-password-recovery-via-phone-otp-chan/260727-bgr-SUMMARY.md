---
phase: quick
plan: 260727-bgr
subsystem: auth
tags: [nestjs, prisma, redis, bcrypt, expo-router, react-native, jwt]

# Dependency graph
requires:
  - phase: quick-260726-riy
    provides: mobile/app/auth/email.tsx (email+password sign-in screen)
  - phase: quick-260727-aym
    provides: mobile/app/auth/register.tsx (email+password registration) and the mobile completeness audit that surfaced this gap
provides:
  - Shared AuthService.consumeValidOtp private helper (redis OTP lockout/attempt-counting extracted from verifyOtp, reused by resetPassword)
  - POST /auth/reset-password backend endpoint (phone OTP + new password, auto-issues tokens)
  - PATCH /users/me/password backend endpoint (current + new password, logged-in, no re-issued tokens)
  - mobile/app/auth/forgot-password.tsx, mobile/app/auth/reset-password.tsx, mobile/app/change-password.tsx screens
  - Server-side refresh-token revocation on mobile logout (POST /auth/logout call added to profile.tsx handleLogout)
affects: [auth, mobile-onboarding, mobile-profile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared private helper extraction for redis OTP validate-and-consume logic (consumeValidOtp), reused across verifyOtp and resetPassword to avoid duplicated lockout logic"
    - "Password reset via phone OTP channel (Termii/Meta SMS/WhatsApp) rather than email, since Resend/SendGrid email delivery is not yet production-provisioned"

key-files:
  created:
    - backend/src/modules/auth/dto/reset-password.dto.ts
    - backend/src/modules/users/dto/change-password.dto.ts
    - mobile/app/auth/forgot-password.tsx
    - mobile/app/auth/reset-password.tsx
    - mobile/app/change-password.tsx
  modified:
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/auth.controller.ts
    - backend/src/modules/users/users.controller.ts
    - backend/src/modules/users/users.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - backend/src/modules/users/__tests__/users.service.spec.ts
    - mobile/app/auth/email.tsx
    - mobile/app/(tabs)/profile.tsx
    - mobile/app/_layout.tsx

key-decisions:
  - "Password reset uses the phone OTP channel exclusively, not email — Resend email delivery is not yet production-provisioned (RESEND_API_KEY unset), while Termii/Meta SMS/WhatsApp OTP is already proven for login/registration"
  - "resetPassword auto-issues fresh JWT tokens and signs the user in immediately (mirrors register()'s auto-login pattern), since the user has just proven phone possession via OTP"
  - "changePassword does NOT re-issue tokens — it's a logged-in action and the existing session must remain valid"
  - "Stale sessions are not proactively revoked on password reset (T-quick-06, accepted risk) — matches existing login()/phoneAuth() behavior; flagged in the plan's threat model as a known gap, not silently ignored"

patterns-established:
  - "consumeValidOtp(phone, otp) private helper on AuthService — any future flow needing 'prove possession of this phone's OTP' should call this instead of duplicating redis lock/attempt logic"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-27
---

# Quick Task 260727-bgr: Phone-OTP Password Recovery + Change Password + Server-Side Logout Summary

**Backend POST /auth/reset-password and PATCH /users/me/password endpoints (sharing a refactored consumeValidOtp redis-lockout helper) plus three new mobile screens and a logout fix that now revokes the refresh token server-side.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified/created:** 14 (8 backend, 6 mobile)

## Accomplishments

- Closed the "no password-recovery path" gap identified in the 2026-07-27 mobile completeness audit: users can now request a phone OTP, enter it with a new password, and land signed-in on `/(tabs)`
- Closed the "no change-password flow" gap: logged-in users can change their password via current-password verification without losing their session
- Fixed mobile logout to actually revoke the refresh token server-side (`POST /auth/logout`) instead of only clearing local SecureStore tokens
- Refactored `AuthService.verifyOtp`'s redis lockout/attempt-counting logic into a shared `consumeValidOtp` private helper, reused by the new `resetPassword` method, with zero duplicated redis code and the existing `verifyOtp` test suite passing unmodified

## Task Commits

1. **Task 1: Backend — shared OTP-consume helper, password-reset endpoint, change-password endpoint** - `6e6fd82` (feat)
2. **Task 2: Mobile — forgot-password, reset-password, change-password screens; logout fix; entry points** - `336e3ff` (feat)

_Note: the plan-level docs commit (`a52b3de`) predates these two task commits; the orchestrator will add a final docs-only commit for SUMMARY.md/STATE.md separately._

## Files Created/Modified

- `backend/src/modules/auth/auth.service.ts` - Added `consumeValidOtp` private helper (extracted from `verifyOtp`); `verifyOtp` now delegates to it; added `resetPassword(dto, ip?, ua?)` (validates OTP, hashes new password, audits `PASSWORD_RESET`, auto-issues tokens)
- `backend/src/modules/auth/auth.controller.ts` - Added `POST /auth/reset-password` (public, `@HttpCode(OK)`)
- `backend/src/modules/auth/dto/reset-password.dto.ts` - New `ResetPasswordDto` (phone, otp, newPassword)
- `backend/src/modules/users/users.service.ts` - Added `changePassword(userId, currentPassword, newPassword)` (bcrypt-verifies current password, hashes+updates new, audits `PASSWORD_CHANGED`)
- `backend/src/modules/users/users.controller.ts` - Added `PATCH /users/me/password` route
- `backend/src/modules/users/dto/change-password.dto.ts` - New `ChangePasswordDto` (currentPassword, newPassword)
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` - Added `describe('resetPassword', ...)` (4 tests: lockout propagation, no-OTP propagation, NotFoundException on unmatched phone, success path with bcrypt hash + audit + tokens); existing `verifyOtp` tests unchanged
- `backend/src/modules/users/__tests__/users.service.spec.ts` - Added `describe('changePassword', ...)` (4 tests: unknown user, null passwordHash, wrong current password, success path)
- `mobile/app/auth/forgot-password.tsx` - New screen: phone entry, calls `POST /auth/otp/send`, navigates to reset-password
- `mobile/app/auth/reset-password.tsx` - New screen: 6-digit OTP entry + new/confirm password, calls `POST /auth/reset-password`, auto-signs-in via SecureStore + `router.replace('/(tabs)')`
- `mobile/app/change-password.tsx` - New screen: current/new/confirm password, calls `PATCH /users/me/password`, stays logged in
- `mobile/app/auth/email.tsx` - Added "Forgot password? →" link to `/auth/forgot-password`
- `mobile/app/(tabs)/profile.tsx` - Added `KeyRound` import, `api` import, "Change Password" menu row, and fixed `handleLogout` to call `POST /auth/logout` (best-effort) with the stored refresh token before clearing SecureStore
- `mobile/app/_layout.tsx` - Registered `auth/forgot-password`, `auth/reset-password`, `change-password` as `Stack.Screen` entries

## Decisions Made

- Password reset uses phone OTP (SMS/WhatsApp via Termii/Meta), not email, per the plan's explicit rationale — email delivery via Resend is not yet production-provisioned
- `resetPassword` auto-issues tokens and signs the user in (mirrors `register()`); `changePassword` does not re-issue tokens (existing session stays valid)
- Old sessions are not proactively revoked on password reset — accepted risk (T-quick-06 in the plan's threat model), matching existing `login()`/`phoneAuth()` behavior

## Deviations from Plan

None - plan executed exactly as written. One environment note: the worktree had no `node_modules` at all (fresh worktree, dependencies not yet installed) — ran `npm install` at the workspace root and `npx prisma generate` in `backend/` before `tsc`/`jest` would run. This is standard worktree setup, not a plan deviation.

## Issues Encountered

None - the full backend jest suite (76 test suites, 894 tests, including the new `resetPassword`/`changePassword` describe blocks and the unmodified `verifyOtp` suite) passed on the first run after implementation, and `npx tsc --noEmit` was clean for both `backend/` and `mobile/`.

## User Setup Required

None - no external service configuration required. Password reset reuses the already-configured Termii/Meta SMS/WhatsApp OTP pipeline; no new environment variables introduced.

## Next Phase Readiness

- The `consumeValidOtp` pattern is now available for any future flow needing phone-OTP verification without duplicating redis lockout logic
- Remaining items from the 2026-07-27 mobile completeness audit (email verification, profile-edit screen, account-deletion UI, driver/rider dashboard reachability, vendor/organiser onboarding) are unaffected by this task and remain untriaged into plans — see `.planning/STATE.md` Blockers/Concerns

---
*Phase: quick*
*Completed: 2026-07-27*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`6e6fd82`, `336e3ff`) verified present in `git log`.
