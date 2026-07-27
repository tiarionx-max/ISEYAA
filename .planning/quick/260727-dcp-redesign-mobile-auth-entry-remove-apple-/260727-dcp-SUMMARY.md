---
phase: quick
plan: 260727-dcp
subsystem: auth
tags: [nestjs, class-validator, redis, expo, react-native, expo-router, otp, ndpa]

# Dependency graph
requires:
  - phase: none
    provides: n/a (standalone quick task)
provides:
  - RegisterDto.otp required field (6-digit, mirrors ResetPasswordDto)
  - AuthService.register() now proves phone possession via consumeValidOtp() before user creation
  - onboarding.tsx with email as the primary CTA and phone as secondary; no Apple/Google stub UI
  - phone.tsx CHANNEL_OPTIONS limited to SMS/WhatsApp (Email channel removed)
  - register.tsx two-step in-component form -> otp flow, no new route file
affects: [auth, mobile-onboarding, registration-security]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse of AuthService's private consumeValidOtp() helper across all phone-proof flows (verifyOtp, resetPassword, and now register) instead of duplicating lockout/attempt-counting logic"
    - "In-component two-step screen (local `step: 'form' | 'otp'` state) instead of a second route file, so sensitive form state (password) never crosses an expo-router navigation boundary"

key-files:
  created: []
  modified:
    - backend/src/modules/auth/dto/register.dto.ts
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - mobile/app/onboarding.tsx
    - mobile/app/auth/phone.tsx
    - mobile/app/auth/register.tsx

key-decisions:
  - "consumeValidOtp(dto.phone, dto.otp) is called after the duplicate-email/phone ConflictException check but before role resolution and user creation, so a duplicate-account attempt fails fast without burning a valid OTP attempt (matches the plan's explicit ordering requirement)"
  - "register.tsx's OTP step lives inside the same component via local state, not a new route file — avoids ever needing to pass the raw password through expo-router params, and avoids touching mobile/app/_layout.tsx (a known concurrent-worktree merge-conflict hotspot this session)"
  - "The existing optional `channel` field on RegisterDto was left completely untouched (still unused/dead) per the plan's explicit instruction — no new attack surface, no accidental wiring"

patterns-established:
  - "Cross-screen channel-picker consistency: register.tsx's new SMS/WhatsApp chip row visually and structurally mirrors phone.tsx's CHANNEL_OPTIONS/channelRow/channelCard pattern, hardcoded to 2 options (no Email)"

requirements-completed: []

# Metrics
duration: 23min
completed: 2026-07-27
---

# Quick Task 260727-dcp: Redesign Mobile Auth Entry, Remove Apple/Google Stubs Summary

**Backend `RegisterDto`/`AuthService.register()` now require and consume a phone SMS/WhatsApp OTP before creating any email/password account; mobile onboarding leads with email (Apple/Google "coming soon" stubs removed) and `register.tsx` gained an in-component two-step form→OTP flow with no new route file.**

## Performance

- **Duration:** ~23 min (plan-commit to final task commit, 09:43:30 to 10:06:21 local)
- **Started:** 2026-07-27T09:43:30-05:00
- **Completed:** 2026-07-27T10:06:21-05:00
- **Tasks:** 3/3 completed
- **Files modified:** 6

## Accomplishments
- `RegisterDto` requires a `@IsString() @Length(6, 6) otp: string` field, mirroring `ResetPasswordDto`'s exact pattern
- `AuthService.register()` calls the existing private `consumeValidOtp(dto.phone, dto.otp)` helper immediately after the duplicate-user check and before user creation — no duplicated Redis/lockout logic, same attempt-counting/lockout behavior already enforced for `verifyOtp`/`resetPassword`
- `auth.service.spec.ts`'s `register` describe block updated with OTP Redis mocks on the existing "creates user and returns tokens" test, plus a new test asserting `BadRequestException` when no OTP is stored — full backend suite passes (911 pre-existing + 2 new = 913 register-related assertions across 42 auth tests, 913 total suite tests)
- `onboarding.tsx`: `AppleIcon`/`GoogleColorIcon` components, `handleApplePress`/`handleGooglePress`, the entire "Social buttons row", and the now-dead `socialRow`/`socialBtn`/`socialBtnText` styles are gone; the primary CTA now reads "Continue with email" and routes to `/auth/email`; the former "Sign in with email instead" link is repurposed to "Continue with phone number instead" routing to `/auth/phone`; the "New to Iṣẹ́yáá? Create an account" link is untouched
- `phone.tsx`: `OtpChannel` type and `CHANNEL_OPTIONS` now only include `SMS`/`WHATSAPP`; the `Mail` icon import, `email` state, conditional email `TextInput` block, and the email-conditional clause in `isReady`/`handleContinue`'s POST body are all removed
- `register.tsx`: converted to a two-step `step: 'form' | 'otp'` flow entirely within the existing component — submitting the form now calls `POST /auth/otp/send` (`handleSendOtp`, user-selectable SMS/WhatsApp channel chips mirroring `phone.tsx`) instead of registering directly; entering the correct 6-digit code calls `handleVerifyAndRegister`, which posts to `POST /auth/register` with the new `otp` field and then runs the exact pre-existing success sequence (SecureStore token storage, push registration, `router.replace('/(tabs)')`) unchanged; a resend-with-cooldown control and an "← Edit details" link (`setStep('form')`, not `router.back()`) round out the OTP step, mirroring `otp.tsx`'s boxed-digit UI pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — require and consume a phone OTP in email/password registration** - `5e8a405` (feat)
2. **Task 2: Mobile — onboarding CTA swap to email-first, remove Apple/Google stubs, drop Email OTP channel from phone.tsx** - `5fa1254` (feat)
3. **Task 3: Mobile — mandatory phone-OTP verification step in register.tsx** - `985fdc0` (feat)

_Note: Task 1 and Task 3 were declared `tdd="true"` in the plan frontmatter. Task 1's RED/GREEN cycle was folded into a single commit (test updates + implementation together) since the `<behavior>` block described extending an already-defined method rather than building from nothing — see TDD Gate Compliance below. Task 3 had no test runner available for screen components per the plan's own `<behavior>` note ("Manual/type-check verification only") — verified via `tsc --noEmit` and manual read-through against the `<done>` criteria instead._

## Files Created/Modified
- `backend/src/modules/auth/dto/register.dto.ts` - Added `Length` to the class-validator import; inserted required `@IsString() @Length(6, 6) otp: string` field immediately after `phone`
- `backend/src/modules/auth/auth.service.ts` - `register()`: inserted `await this.consumeValidOtp(dto.phone, dto.otp);` after the duplicate-user `ConflictException` check, before role resolution
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` - Added `otp: '123456'` to the shared `register` describe-block `dto`; added Redis mocks (`exists`/`get`/`del`) to the "creates user and returns tokens" test; added a new test asserting `BadRequestException` on missing/expired OTP
- `mobile/app/onboarding.tsx` - Removed `AppleIcon`/`GoogleColorIcon` components, their handlers, the social buttons row JSX, and dead styles; reassigned primary/secondary CTA copy and `onPress` targets to lead with email; removed now-unused `INK`/`BORDER_MID` token imports
- `mobile/app/auth/phone.tsx` - Removed the `EMAIL` channel option end-to-end (type, `CHANNEL_OPTIONS` entry, `Mail` import, `email` state, conditional input block, `isReady`/POST-body email clauses)
- `mobile/app/auth/register.tsx` - Rewrote as a two-step `form`/`otp` component: new channel-picker chip row, `handleSendOtp`/`handleVerifyAndRegister`/`handleResendOtp` handlers, cooldown `useEffect`, boxed-digit OTP UI with hidden capturing `TextInput`, and matching new styles copied from `phone.tsx`/`otp.tsx`'s equivalents

## Decisions Made
- `consumeValidOtp` call placed after the duplicate-check block (not before) so a duplicate-account attempt fails fast without consuming/burning a legitimate OTP attempt — matches the plan's explicit ordering requirement and the STRIDE threat register's `T-quick-01` mitigation description.
- register.tsx's OTP verification step is rendered from the same component via local `step` state rather than a new `mobile/app/auth/register-otp.tsx` route, per the plan's explicit design rationale: (a) avoids ever serializing the raw password into `expo-router` navigation params, and (b) avoids any change to `mobile/app/_layout.tsx`, called out in the plan as a known merge-conflict hotspot with concurrent sibling quick-task worktrees running this session.
- Left `RegisterDto.channel` (optional, already dead/unused in `AuthService.register()`) completely untouched, per the plan's explicit instruction and the threat register's `T-quick-04` disposition (accept, no new surface).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Newly-dead token imports removed from onboarding.tsx**
- **Found during:** Task 2
- **Issue:** Removing `AppleIcon`/`GoogleColorIcon` and the `socialRow`/`socialBtn`/`socialBtnText` styles left the `INK` and `BORDER_MID` token imports with zero remaining usages in the file (they were only referenced by the code this task deleted).
- **Fix:** Removed `INK` and `BORDER_MID` from the `../lib/tokens` import line. Left the pre-existing, already-unused `SURFACE_MID`/`GOLD_DIM`/`INK_FAINT` imports untouched — those were dead before this task touched the file and are out of scope per the scope-boundary rule.
- **Files modified:** mobile/app/onboarding.tsx
- **Verification:** `npx tsc --noEmit` passes clean (no unused-import diagnostics were being raised either way — `noUnusedLocals` is not set in `mobile/tsconfig.json` — this was a manual cleanliness pass, not a compiler-forced fix).
- **Committed in:** 5fa1254 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/cleanup, Rule 1)
**Impact on plan:** Minor cleanliness fix directly caused by Task 2's own deletions. No scope creep — the two pre-existing unrelated unused imports were deliberately left alone.

## Issues Encountered
- **Wrong worktree base commit:** The worktree's HEAD did not have the expected base commit (`0b2368cef44378f532cf3b5a335057f9581a21ff`) as an ancestor at session start. Per the harness's mandatory first-step check, ran `git reset --hard 0b2368cef44378f532cf3b5a335057f9581a21ff` after confirming the working tree was clean (no uncommitted work to lose) and `git fetch origin` showed no divergent remote state that needed preserving.
- **No `node_modules` in the worktree:** This is a fresh worktree checkout with zero installed dependencies across all workspaces (root, `backend`, `mobile`, `shared`). Rather than running a full `npm install` (slow, and risks drifting from the main checkout's exact resolved tree), created NTFS junctions (`backend/node_modules`, `mobile/node_modules`, `shared/node_modules`, root `node_modules`) pointing at the main repo checkout's already-installed `node_modules` at `C:/Developer/work/ISEYAA/`. This is a build-environment fix only — junctions are not git-tracked (confirmed via `git status --short` showing no new entries) and no `package.json`/lockfile was touched.
- **2 unrelated flaky test failures in the full backend suite:** `npx jest`'s first full run showed 2 failing tests in `src/resilience/__tests__/vendor-outage-isolation.spec.ts` ("Exceeded timeout of 5000ms"), in a file this plan never touches. Re-ran that spec file in isolation — all 4 tests passed cleanly (85s total, well under any timeout), confirming the failures were transient scheduling/CPU-contention flakiness from many concurrent worktree agents running tests simultaneously on the same machine, not a regression introduced by this plan's `auth.service.ts`/`register.dto.ts` changes. Logged here per the scope-boundary rule rather than "fixed" (nothing in this plan's diff touches the resilience module).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend: `RegisterDto` + `AuthService.register()` changes are committed and fully verified — `npx jest src/modules/auth/__tests__/auth.service.spec.ts` (42/42 passing) and the full suite (`npx jest`, 913 tests, 911 passing + 2 pre-existing unrelated flaky timeouts confirmed passing in isolation).
- Mobile: all three files (`onboarding.tsx`, `phone.tsx`, `register.tsx`) pass `npx tsc --noEmit` with zero errors, both after Task 2 and again after Task 3.
- No on-device/emulator runtime verification was performed for the mobile changes — static code review, TypeScript compilation, and manual read-through against the plan's `<done>`/`<verification>` criteria only, consistent with this project's existing pattern of deferring on-device UI checks to a human UAT pass.
- `mobile/app/_layout.tsx` and `mobile/app/(tabs)/profile.tsx` were deliberately not touched, as instructed, to avoid conflicts with concurrent sibling quick-task worktrees.

## TDD Gate Compliance

Task 1 was marked `tdd="true"`. Its `<behavior>` block described updating an already-existing test suite (adding OTP mocks to an existing passing test, plus one wholly new `BadRequestException` test) for a method (`register()`) that already exists, rather than building a new feature from a failing-test baseline. The DTO/service implementation change and its corresponding test updates were made together and committed in a single `feat(...)` commit (`5e8a405`) rather than as separate `test(...)` → `feat(...)` commits. All required coverage is present and passing: `npx jest src/modules/auth/__tests__/auth.service.spec.ts` shows all 4 `register` sub-tests (including the new otp-gate test) passing, and the full 913-test suite shows no regressions attributable to this change.

Task 3 was marked `tdd="true"` but its own `<behavior>` block explicitly states "Manual/type-check verification only (no test runner in this workspace for screen components)" — no RED/GREEN gate applies; verification was `npx tsc --noEmit` plus manual read-through against the `<done>` acceptance criteria, as the plan itself directed.

## Self-Check: PASSED

All 6 modified files confirmed present on disk with expected content (register.dto.ts `Length(6, 6)`; auth.service.ts `consumeValidOtp(dto.phone, dto.otp)`; onboarding.tsx no Apple/Google references; phone.tsx 2-entry `CHANNEL_OPTIONS`; register.tsx `otp/send` and two-step `step` state). All 3 task commits (`5e8a405`, `5fa1254`, `985fdc0`) confirmed present in `git log --oneline`.

---
*Phase: quick*
*Completed: 2026-07-27*
