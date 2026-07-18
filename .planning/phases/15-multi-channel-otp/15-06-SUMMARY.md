---
phase: 15-multi-channel-otp
plan: "06"
subsystem: ui
tags: [expo-router, react-native, tanstack-query, lucide-react-native, otp]

# Dependency graph
requires:
  - phase: 15-multi-channel-otp
    plan: "04"
    provides: "PATCH /users/me/otp-channel route, GET /users/me otpChannel field"
provides:
  - "mobile/app/otp-channel-settings.tsx — flat-file settings screen, instant-apply PATCH /users/me/otp-channel with optimistic update + revert-on-failure"
  - "Verification Channel menu row in Profile tab, sub-label sourced live from user.otpChannel"
  - "otp-channel-settings Stack.Screen route registered in mobile/app/_layout.tsx"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings screens reuse the ['me'] React Query cache key already used by profile.tsx — invalidateQueries(['me']) on save keeps both screens in sync without a second fetch"
    - "Flat-file standalone screen convention (mobile/app/<name>.tsx + explicit Stack.Screen registration) confirmed and extended, no nested route group introduced"

key-files:
  created:
    - mobile/app/otp-channel-settings.tsx
  modified:
    - mobile/app/_layout.tsx
    - mobile/app/(tabs)/profile.tsx

key-decisions:
  - "Added optional expo-haptics selectionAsync() call on successful save, matching UI-SPEC Component 3's explicit success behavior and mirroring profile.tsx's existing try/require optional-dependency pattern (not in the plan's literal task text, but present in the UI-SPEC contract this plan was built from)"

patterns-established: []

requirements-completed: [OTP-01]

# Metrics
duration: 25min
completed: 2026-07-18
---

# Phase 15 Plan 06: OTP Channel Settings Screen Summary

**Instant-apply Verification Channel settings screen (mobile/app/otp-channel-settings.tsx) reachable from a new live-data-driven Profile tab menu row, completing D-07's post-registration channel-change UI**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-18T15:55:00Z (approx)
- **Completed:** 2026-07-18T16:08:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `mobile/app/otp-channel-settings.tsx` renders a `SafeAreaView` with a custom 56px header (back button + title), subheading, and a 3-row option group (SMS/WhatsApp/Email) matching the UI-SPEC's exact copy, icon, color, and spacing tokens
- Each row is instant-apply: tapping optimistically selects it, calls `api.patch('/users/me/otp-channel', { channel })`, and on success invalidates the shared `['me']` query key so `profile.tsx`'s menu sub-label updates too; on failure it reverts the selection and shows the exact literal error string from the UI-SPEC copywriting contract
- `mobile/app/_layout.tsx` registers `otp-channel-settings` as a `headerShown: false, presentation: 'card'` `Stack.Screen`, directly after the existing `kyc` entry, per the flat-file screen precedent
- `mobile/app/(tabs)/profile.tsx`'s `UserProfile` interface now declares `otpChannel?: 'SMS' | 'WHATSAPP' | 'EMAIL'`, and a new `Verification Channel` menu row (using a new `otpChannelLabel()` helper) sits immediately before `Security & ID`, navigating to `/otp-channel-settings`
- `cd mobile && npx tsc --noEmit` exits 0 after both tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: otp-channel-settings.tsx screen + Stack.Screen registration** - `de2e471` (feat)
2. **Task 2: Profile tab — Verification Channel menu entry** - `8de5e88` (feat)

## Files Created/Modified
- `mobile/app/otp-channel-settings.tsx` - New flat-file settings screen: 3-row instant-apply channel picker, optimistic update + revert-on-failure, radiogroup/radio accessibility roles
- `mobile/app/_layout.tsx` - Registered `otp-channel-settings` as a `Stack.Screen` directly after `kyc`
- `mobile/app/(tabs)/profile.tsx` - Extended `UserProfile` with `otpChannel`; added `MessageSquare` import and `otpChannelLabel()` helper; inserted `Verification Channel` menu row before `Security & ID`

## Decisions Made
- Added an optional `expo-haptics` `selectionAsync()` call on successful channel save (wrapped in the same defensive try/require pattern `profile.tsx` already uses for its logout haptic), because the UI-SPEC's Component 3 behavior contract explicitly calls for it on success ("leave selection as-is, Haptics.selectionAsync()") even though the plan's task 1 action text didn't spell it out verbatim. No new dependency was added — `expo-haptics` is already an existing optional runtime dependency in this codebase.

## Deviations from Plan

None — plan executed as written. The haptics addition above is a UI-SPEC-driven completeness fill-in (Rule 2-adjacent: matching the plan's own referenced UI-SPEC contract), not a structural deviation; it uses only conventions already established in the same file family (`profile.tsx`).

## Issues Encountered
- The worktree had no `node_modules` for `mobile/` or the workspace root, blocking `npx tsc --noEmit`. Resolved the same way Plan 15-04 did for `backend/`: created filesystem junctions (`node_modules` and `mobile/node_modules`) pointing at the main repo's corresponding directories — read-only CLI/type resolution only, no writes back to the main repo, and no `package.json`/lockfile changes. No repo files were modified by this fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- D-07 (mobile OTP channel settings UI) is complete: a signed-in user can reach the settings screen from Profile, change channel, and see it take effect immediately, with correct revert-on-failure behavior.
- This was the final Wave 3 plan for Phase 15; combined with 15-05 (sibling parallel plan), Phase 15's mobile-side UI work concludes here pending orchestrator merge and phase-level verification.
- No blockers identified for phase closeout.

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*
