---
phase: quick
plan: 260727-aym
subsystem: auth
tags: [react-native, expo-router, expo-secure-store, ndpa, mobile]

requires:
  - phase: 260726-riy
    provides: mobile/app/auth/email.tsx sign-in screen, api.ts axios instance, push-notifications helper, tokens.ts design system
provides:
  - Mobile email+password self-service registration screen (mobile/app/auth/register.tsx)
  - Route registration for auth/register in mobile/app/_layout.tsx
  - Discoverable "sign up" links from onboarding.tsx and auth/email.tsx
affects: [mobile-auth, onboarding]

tech-stack:
  added: []
  patterns:
    - "Mobile auth screens mirror email.tsx's scaffold (AdireOrnament, LinearGradient layers, KeyboardAvoidingView) with a ScrollView wrapper when the field count grows"
    - "NDPA consent checkbox pattern (consentRow/consentBox/consentBoxChecked) reused verbatim from otp.tsx across all consent-gated screens"
    - "Nigerian phone formatting logic (0xxx -> +234xxx) reused verbatim from phone.tsx"

key-files:
  created:
    - mobile/app/auth/register.tsx
  modified:
    - mobile/app/_layout.tsx
    - mobile/app/onboarding.tsx
    - mobile/app/auth/email.tsx

key-decisions:
  - "Registration screen omits role/channel from the POST /auth/register body so the backend defaults every mobile self-registration to CITIZEN, keeping vendor/organiser/host onboarding out of scope"
  - "Reused email.tsx's exact token-extraction/SecureStore/push/router.replace pattern for post-registration auth, since /auth/register returns the same { user, accessToken, refreshToken } shape as /auth/login"

patterns-established:
  - "New multi-field auth screens use ScrollView (keyboardShouldPersistTaps=handled) instead of a fixed content View to avoid clipping on small screens"

requirements-completed: []

duration: 4min
completed: 2026-07-27
---

# Quick Task 260727-aym: Add Mobile Email+Password Registration Screen Summary

**New `mobile/app/auth/register.tsx` screen collecting name/email/phone/password plus a gated NDPA consent checkbox, posting to the existing `POST /auth/register` backend endpoint and auto-signing the user in — closing the mobile self-service account-creation gap that only phone+OTP auto-registration previously covered.**

## Performance

- **Duration:** 4 min (07:57:20 -> 08:01:24, plan-authoring commit to last task commit)
- **Started:** 2026-07-27T08:00:00-05:00 (approx, executor dispatch)
- **Completed:** 2026-07-27T08:01:24-05:00
- **Tasks:** 2/2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- New `mobile/app/auth/register.tsx` screen: firstName/lastName/email/phone/password fields, Nigerian phone formatting (reused from `phone.tsx`), NDPA consent checkbox (reused verbatim from `otp.tsx`), gated CTA, calls `POST /auth/register` with the exact 6-field body (no `role`/`channel`), stores tokens via `expo-secure-store`, registers push token, navigates to `/(tabs)`.
- Route registered in `mobile/app/_layout.tsx` (`auth/register`, `headerShown: false`), matching the `auth/phone`/`auth/otp`/`auth/email` pattern.
- New-user entry point added to `mobile/app/onboarding.tsx` ("New to Iṣẹ́yáá? Create an account").
- Existing-user-realizes-they-need-to-sign-up entry point added to `mobile/app/auth/email.tsx` ("Don't have an account? Sign up").

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mobile registration screen and register its route** - `4f05be1` (feat)
2. **Task 2: Link the new registration screen from onboarding and email sign-in** - `732a4a9` (feat)

**Plan metadata:** pending (orchestrator commits SUMMARY.md/STATE.md separately)

## Files Created/Modified

- `mobile/app/auth/register.tsx` - New registration screen (firstName/lastName/email/phone/password + NDPA consent, POST /auth/register, SecureStore token persistence, navigate to /(tabs))
- `mobile/app/_layout.tsx` - Registers `auth/register` as a headerless Stack.Screen
- `mobile/app/onboarding.tsx` - Adds `handleRegisterPress()` + "New to Iṣẹ́yáá? Create an account" link
- `mobile/app/auth/email.tsx` - Adds "Don't have an account? Sign up" link to `/auth/register`

## Decisions Made

- Omitted `role`/`channel` from the registration request body entirely (backend defaults to `CITIZEN`) — this screen is general citizen self-registration, not vendor/organiser/host onboarding, per the plan's explicit instruction.
- Reused `otp.tsx`'s NDPA consent styles/markup verbatim rather than re-deriving a new consent UI, keeping the pattern consistent across all consent-gated mobile screens.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched the plan's field lists, readiness gate formula, request body shape, and navigation targets exactly.

## Issues Encountered

- `npx tsc --noEmit` reports 5 pre-existing errors unrelated to this plan's files: `app/_layout.tsx(1,25)` missing `@sentry/react-native` type declarations, and 4 `components/stays/*`/`components/tours/*` files missing `@react-native-community/datetimepicker` type declarations. These are pre-existing missing-dependency issues in the shared `node_modules` install (confirmed present before this plan's changes and unrelated to any file this plan touches) — out of scope per the deviation rules' scope boundary, not fixed here. No new type errors were introduced by either task's changes.

## User Setup Required

None - no external service configuration required. No backend changes; uses the already-live `POST /auth/register` endpoint.

## Next Phase Readiness

- Mobile now has three account-entry paths: phone+OTP auto-registration, email+password sign-in, and email+password self-service registration — feature-complete relative to this quick task's objective.
- Manual on-device verification (form validation, consent gating, actual account creation against a live backend, duplicate-email/phone error surfacing) was not performed as part of this quick task — recommend an on-device smoke test before considering this fully verified end-to-end.
- The pre-existing `@sentry/react-native` / `@react-native-community/datetimepicker` missing type-declaration issue (see Issues Encountered) is unrelated tech debt worth a follow-up dependency-install pass if it starts blocking CI.

## Self-Check: PASSED

- FOUND: mobile/app/auth/register.tsx
- FOUND: auth/register registered in mobile/app/_layout.tsx
- FOUND: auth/register link in mobile/app/onboarding.tsx
- FOUND: auth/register link in mobile/app/auth/email.tsx
- FOUND: commit 4f05be1
- FOUND: commit 732a4a9

---
*Quick task: 260727-aym*
*Completed: 2026-07-27*
