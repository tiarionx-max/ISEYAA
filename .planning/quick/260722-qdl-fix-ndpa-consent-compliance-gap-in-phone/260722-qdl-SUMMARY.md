---
phase: quick
plan: 260722-qdl
subsystem: auth
tags: [nestjs, class-validator, prisma, expo, react-native, ndpa, compliance]

# Dependency graph
requires:
  - phase: none
    provides: n/a (standalone quick task)
provides:
  - Real (non-fabricated) NDPA consent capture on the mobile phone-OTP signup path
  - PhoneAuthDto.ndpaConsent field validated via @IsBoolean(), mirroring RegisterDto's pattern
  - phoneAuth() guard rejecting new-user creation without real consent, scoped to new-user branch only
  - Mobile OTP screen consent checkbox gating OTP submission
affects: [auth, mobile-onboarding, ndpa-compliance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New-user-only consent gate: place the ndpaConsent truthiness check inside the isNewUser branch of a dual-purpose signup/login method, not at the top of the method, to avoid forcing re-consent on existing-user login"
    - "Mobile consent-gated auto-submit: disable both the touchable wrapper (disabled prop) and the underlying hidden TextInput (editable prop) driving an auto-submit-on-Nth-character flow, plus a redundant guard inside the onChange handler itself, as defense in depth against any single gate being bypassed"

key-files:
  created: []
  modified:
    - backend/src/modules/auth/dto/phone-auth.dto.ts
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - mobile/app/auth/otp.tsx

key-decisions:
  - "Consent guard placed inside phoneAuth()'s `if (!user) { isNewUser = true; ... }` branch only — existing users logging back in via phone-OTP are never re-challenged for consent, avoiding a login regression while closing the fabricated-consent gap at account creation"
  - "ndpaConsentAt is written conditionally (`dto.ndpaConsent ? new Date() : undefined`) rather than unconditionally, keeping the server-generated timestamp semantically tied to real consent even though the preceding guard already guarantees truthiness by that point in the code path"
  - "Mobile OTP entry gated via three independent layers (TouchableOpacity disabled, hidden TextInput editable, handleChange's own consent check) since the screen has no separate submit button — entry auto-submits on the 6th digit"

patterns-established:
  - "Cross-platform consent copy consistency: mobile checkbox uses the exact same wording as web/src/app/register/page.tsx's NDPA consent label, with the NDPA acronym highlighted in GOLD to match the web's highlighted-span treatment"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-07-23
---

# Quick Task 260722-qdl: Fix NDPA Consent Compliance Gap in Phone-OTP Signup Summary

**Closed an NDPA compliance gap where `AuthService.phoneAuth()` hardcoded `ndpaConsent: true` for every mobile OTP signup — now requires and persists real caller-supplied consent, scoped only to new-user creation, with a matching consent checkbox added to the mobile OTP screen.**

## Performance

- **Duration:** ~9 min (commit-to-commit, 19:05:04 to 19:13:31 local)
- **Started:** 2026-07-22T19:05:04-05:00 (plan pre-dispatch commit)
- **Completed:** 2026-07-22T19:13:31-05:00 (Task 2 commit)
- **Tasks:** 2/2 completed
- **Files modified:** 4

## Accomplishments
- `PhoneAuthDto` now has a required, validated `ndpaConsent: boolean` field (mirrors `RegisterDto`'s established `@IsBoolean()` pattern)
- `AuthService.phoneAuth()` throws `BadRequestException('NDPA consent is required to create an account')` when creating a NEW user with falsy/missing `ndpaConsent`, and persists the real value + a real server-generated `ndpaConsentAt` only when consent is true
- Existing users logging back in via phone-OTP are unaffected — the guard is scoped strictly inside the `isNewUser` branch, no regression to login UX
- `mobile/app/auth/otp.tsx` now renders a consent checkbox (defaulting to unchecked) above the OTP entry, using the same wording as the web register flow, and gates OTP submission on three independent layers until checked

## Task Commits

Each task was committed atomically:

1. **Task 1: Add real NDPA consent to PhoneAuthDto and phoneAuth() (backend)** - `cd74e13` (fix)
2. **Task 2: Add NDPA consent checkbox to the mobile OTP screen and wire it to the API call** - `107fcae` (feat)

_Note: Task 1 was declared `tdd="true"` in the plan frontmatter, but its `<behavior>` block describes adding new test cases and updating existing ones to an existing, already-implemented method rather than a fresh RED→GREEN cycle for a not-yet-existing feature — the guard logic and tests were implemented together in a single commit rather than as separate `test(...)` → `feat(...)` commits. All required test coverage (4 new tests + 3 updated pre-existing tests) is present and passing; see TDD Gate Compliance below._

## Files Created/Modified
- `backend/src/modules/auth/dto/phone-auth.dto.ts` - Added `ndpaConsent: boolean` field with `@IsBoolean()`, no `@IsOptional()` (required)
- `backend/src/modules/auth/auth.service.ts` - `phoneAuth()`: added consent guard inside the new-user branch; replaced hardcoded `ndpaConsent: true, ndpaConsentAt: new Date()` with the real `dto.ndpaConsent` value and a conditional timestamp
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` - Added 4 new tests (consent-false rejection, consent-omitted rejection, consent-true persists real value + `expect.any(Date)`, existing-user login unaffected); updated 3 pre-existing new-user tests to pass `ndpaConsent: true`; added `as any` casts on 2 pre-existing calls (lockout test, existing-user test) that intentionally omit the now-required field to preserve their original intent without TS errors
- `mobile/app/auth/otp.tsx` - Added `consent` state (default `false`), consent checkbox UI (custom inline `TouchableOpacity` + `View`, no new dependency), gated `TouchableOpacity`/`TextInput`/`handleChange` on consent, and wired `ndpaConsent: consent` into the `/auth/phone-auth` POST body

## Decisions Made
- Consent-required check placed inside the `if (!user) { isNewUser = true; ... }` branch of `phoneAuth()`, not at the method's top — per the plan's explicit design decision, this closes the fabricated-consent gap at signup while never forcing existing users to re-consent on login.
- `ndpaConsentAt: dto.ndpaConsent ? new Date() : undefined` used instead of unconditional assignment, for explicitness and to avoid ever reintroducing a hardcoded literal, even though the preceding guard already guarantees `dto.ndpaConsent === true` by that point.
- Mobile consent gate implemented with three independent layers (touchable `disabled`, `TextInput` `editable`, and a guard inside `handleChange`) since `otp.tsx` has no separate submit button — the auto-submit-on-6th-digit path required defense in depth per the plan.
- 2 pre-existing test calls (the lockout test and a newly-added existing-user-login test) intentionally omit `ndpaConsent` from their `phoneAuth()` call args to prove the omission doesn't matter for those code paths (lockout throws before reaching the guard; existing-user path never reaches the guard). These use `as any` casts to satisfy TypeScript's now-required field without fabricating a value that isn't semantically relevant to what's being tested.

## Deviations from Plan

None — plan executed exactly as written, including the exact design decision (new-user-only scoping), exact message string, exact mobile consent copy, and exact gating mechanism (disabled + editable + handleChange guard) all as specified in `<action>` steps.

One minor addition not explicitly called out in the plan's action steps but required for the plan's own `<verify>` command to run at all: the worktree had no `node_modules` installed for any workspace (fresh worktree checkout). Symlinked `node_modules` (root, `backend/`, `mobile/`, `web/`, `shared/`) from the main repo checkout at `C:/Developer/work/ISEYAA/` after confirming `package-lock.json` is byte-identical between the two checkouts. This is a build-environment fix, not a code change — no files were added to git (all `node_modules` paths are `.gitignore`d, confirmed via `git check-ignore -v` and `git status --short` showing no new untracked entries after symlinking).

## Issues Encountered
- TypeScript flagged 2 pre-existing test calls (`... }).rejects.toThrow(ForbiddenException)` lockout test, and the newly-added existing-user-login test) as missing the now-required `ndpaConsent` field. Resolved with `as any` casts on those specific calls, since the field is genuinely irrelevant to what each test exercises (lockout is checked before the consent guard; existing-user login never reaches the new-user branch at all).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend and mobile changes are both committed and independently verified (backend: full jest suite + tsc; mobile: tsc only, per plan's stated verification limitation).
- No emulator/runtime verification was performed or claimed for the mobile change — static code review and TypeScript compilation only, as explicitly directed by the plan for this environment. A human on-device check of the new consent checkbox (visual rendering, tap behavior, and end-to-end signup flow against a running backend) remains an open item for a future manual verification pass, consistent with the project's existing pattern of deferred on-device UI checks (see STATE.md Deferred Items — "Phase 15 human UAT — On-device visual/UX check of 3 new mobile screens").

## TDD Gate Compliance

Task 1 was marked `tdd="true"` but its `<behavior>` block described extending test coverage on an already-existing method (`phoneAuth()` already exists; only a new field/guard was added) rather than building a wholly new feature from scratch. Guard logic and its test coverage were committed together in a single `fix(auth): ...` commit rather than as separate `test(...)` (RED) → `feat(...)` (GREEN) commits. All 4 new tests plus the 3 updated pre-existing tests are present, correctly assert the new behavior (verified independently by re-reading the diff and re-running `npx jest src/modules/auth`, which shows all 8 `phoneAuth` tests passing, including the exact new test names), and the full backend suite (859 tests, 76 suites) passes with no regressions.

## Self-Check: PASSED

All 4 modified files confirmed present on disk; both task commits (`cd74e13`, `107fcae`) confirmed present in git log.

---
*Phase: quick*
*Completed: 2026-07-23*
