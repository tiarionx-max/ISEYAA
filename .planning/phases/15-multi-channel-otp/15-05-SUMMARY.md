---
phase: 15-multi-channel-otp
plan: 05
subsystem: ui
tags: [expo-router, react-native, lucide-react-native, otp, mobile]

# Dependency graph
requires:
  - phase: 15-multi-channel-otp
    provides: "POST /auth/otp/send channel/email request fields + fallbackUsed response flag (15-03)"
provides:
  - "phone.tsx 3-card SMS/WhatsApp/Email channel picker (SMS default) wired into POST /auth/otp/send"
  - "phone.tsx conditional email TextInput + isReady email-pattern gate, only when channel === 'EMAIL'"
  - "phone.tsx forwards backend fallbackUsed to otp.tsx via router.push params"
  - "otp.tsx Fallback Notice Banner (D-10 locked copy) seeded from route param and re-derived after resend()"
affects: [15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unwrap api.post response via `res.data?.data ?? res.data ?? {}` before reading response fields — matches otp.tsx's existing verify() convention, now reused in phone.tsx's handleContinue() and otp.tsx's resend()"

key-files:
  created: []
  modified:
    - mobile/app/auth/phone.tsx
    - mobile/app/auth/otp.tsx

key-decisions:
  - "Did not add expo-haptics selection feedback on channel-card press despite UI-SPEC Component 1 mentioning Haptics.selectionAsync() — plan's <action> block (the literal execution spec for this task) omits it, expo-haptics is not a declared mobile/package.json dependency (only lazy-`require`'d defensively in profile.tsx), and no acceptance criterion or done criterion references it; adding it would be unrequested scope beyond what the plan specifies"
  - "Reused the exact inputWrapper/inputWrapperActive style pair for the conditional email input (per plan instruction) rather than introducing new email-specific input styles, keeping visual consistency with the existing phone input on the same screen"

patterns-established: []

requirements-completed: [OTP-01, OTP-02]

# Metrics
duration: 20min
completed: 2026-07-18
---

# Phase 15 Plan 05: Registration Channel Picker + Fallback Notice Banner Summary

**Wired the UI-SPEC Component 1 (3-card SMS/WhatsApp/Email channel picker) into `phone.tsx` and Component 2 (SMS-fallback notice banner with D-10's locked copy) into `otp.tsx`, both additive insertions into the existing OTP registration/verification flow with no redesign.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-18T15:47:00Z (approx)
- **Completed:** 2026-07-18T16:07:00Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `phone.tsx` renders 3 selectable channel cards (SMS/WhatsApp/Email, SMS default) between the phone number input and the "Send code →" CTA, each meeting the UI-SPEC's 76px height / 14px radius / gold-selected visual spec and `accessibilityRole="radio"` contract
- WhatsApp's card is always rendered unconditionally — no feature flag or Meta template-approval check gates its visibility (D-04); a failed WhatsApp send is handled entirely server-side (Plan 15-03's SMS fallback) and surfaced via the banner added in Task 2
- Selecting Email reveals a conditional email `TextInput` (reusing the existing `inputWrapper`/`inputWrapperActive` styles) and the CTA's `isReady` gate now additionally requires a plausible email pattern (`/\S+@\S+\.\S+/`) before activating when Email is selected
- `handleContinue()` posts `{ phone, channel, ...(channel === 'EMAIL' ? { email } : {}) }` to `POST /auth/otp/send`, unwraps the response the same way `otp.tsx`'s `verify()` does, and forwards `fallbackUsed` (stringified) as a route param to `/auth/otp`
- `otp.tsx` seeds a new `fallbackUsed` state from the `fallbackUsed` route param and renders the exact locked-copy banner ("We sent your code via SMS instead" / "Your original channel didn't respond in time.") below the "Sent to {maskedPhone}" subtitle and above the OTP digit boxes, only when `fallbackUsed` is true
- `resend()` now unwraps its own response and calls `setFallbackUsed(payload.fallbackUsed === true)`, so a manual resend's own outcome updates the banner — the request shape itself stays `{ phone }` unchanged (D-05: channel is never re-prompted on resend, server reuses the channel on file)
- Banner carries `accessibilityLiveRegion="polite"` + `accessibilityRole="text"` so screen readers announce it without requiring manual focus
- `cd mobile && npx tsc --noEmit` exits 0 (confirmed clean against both modified files; four pre-existing unrelated `TS2307` errors were present before this plan's edits and are traced to a stale/incomplete worktree `node_modules` link, not this plan's code — see Deviations)

## Task Commits

Each task was committed atomically:

1. **Task 1: phone.tsx — channel picker + conditional email input** - `55fad51` (feat)
2. **Task 2: otp.tsx — Fallback Notice Banner** - `97a63ab` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `mobile/app/auth/phone.tsx` — Added `MessageSquare`/`MessageCircle`/`Mail` icon imports, `GOLD_DIM` token import, `channel`/`email` local state, a 3-card channel picker + conditional email input inserted between the phone input and CTA, and updated `handleContinue()`/`isReady` to post the channel/email and forward `fallbackUsed`
- `mobile/app/auth/otp.tsx` — Added `Info` icon import, `SUCCESS_DIM`/`SUCCESS_TEXT`/`INK_DIM` token imports, `fallbackUsed` state seeded from the route param, a conditionally-rendered Fallback Notice Banner, and updated `resend()` to unwrap its response and refresh `fallbackUsed`

## Decisions Made
- Skipped `expo-haptics` selection feedback on channel-card taps (see key-decisions above) — plan's literal `<action>` spec omits it and the package isn't a declared dependency in this codebase's mobile workspace
- Kept the email input's styling identical to the existing phone input (`inputWrapper`/`inputWrapperActive`) exactly as the plan directed, rather than introducing new dedicated email-field styles

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no `node_modules` for `mobile/` or the workspace root**
- **Found during:** Pre-verification (before running `npx tsc --noEmit`)
- **Issue:** This parallel-execution worktree was created without `npm install`; neither the root nor `mobile/` `node_modules` existed, so `npx tsc` could not resolve any dependency (React Native, Expo, lucide-react-native, etc.)
- **Fix:** Created Windows junctions from the worktree's root `node_modules` and `mobile/node_modules` to the main repo's corresponding directories (read-only type-checking use, no writes back to the main repo). First attempt via the Bash tool's path translation produced a malformed doubled-prefix junction target (`C:\C:\...`); corrected by re-running `mklink /J` with an explicit native Windows path.
- **Files modified:** None (environment/tooling only — `node_modules` is gitignored, not part of any commit)
- **Verification:** `cd mobile && npx tsc --noEmit` exits 0 after the corrected junctions were in place; a pre-fix run surfaced 4 pre-existing `TS2307` errors in unrelated files (`app/_layout.tsx`, three `components/*BookingSheet.tsx`/`TourBookingSheet.tsx` files referencing `@sentry/react-native` and `@react-native-community/datetimepicker`) caused solely by the malformed junction, not by this plan's edits — these disappeared once the junction was corrected
- **Committed in:** N/A (no repo files changed by this fix)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment/tooling only, no code impact)
**Impact on plan:** No scope creep; fix was purely local dev-environment setup required to execute the plan's own verification command inside a fresh git worktree (same pattern as Plans 15-01/15-02/15-03's worktree setup).

## Issues Encountered
None beyond the node_modules linking issue documented above.

## User Setup Required

None - no new external service configuration required. This plan is presentation-layer only against the already-live `POST /auth/otp/send` contract from Plan 15-03.

## Next Phase Readiness
- `phone.tsx` and `otp.tsx` now fully implement OTP-01 (channel selection at registration, SMS default) and OTP-02 (visible fallback notice with D-10's locked copy) on the mobile client
- Plan 15-06 (settings-screen channel switch + profile menu entry) can proceed independently — this plan touched only `phone.tsx`/`otp.tsx`, not `otp-channel-settings.tsx` or `profile.tsx`
- No blockers for downstream Wave 3 sibling plan (15-06)

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*
