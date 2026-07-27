---
phase: quick
plan: 260727-bhw
subsystem: ui
tags: [expo-router, react-query, expo-image, expo-image-picker, ndpa, mobile]

# Dependency graph
requires:
  - phase: none
    provides: n/a — closes gaps 3 and 4 of the 2026-07-27 mobile completeness audit against already-complete backend endpoints
provides:
  - "mobile/app/profile-edit.tsx: Edit Profile screen (firstName/lastName form + avatar picker/upload)"
  - "profile-edit route registered in mobile/app/_layout.tsx"
  - "UserProfile.avatarUrl field + real avatar rendering (AvatarRing) on the Profile tab"
  - "Danger Zone account-deletion flow on the Profile tab (NDPA right-to-erasure)"
affects: [mobile-profile, mobile-auth, ndpa-compliance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "expo-image ExpoImage with contentFit=cover + initials-text fallback for avatar rendering (already established in stays/[id].tsx, now reused in profile.tsx and profile-edit.tsx)"
    - "Multipart FormData upload built inline (uri/name/type asset shape) for a single-call-site avatar upload — no shared helper added to lib/api.ts"
    - "Destructive-confirmation Alert.alert pattern (Cancel + style:'destructive' confirm) reused for account deletion, mirroring the existing Sign Out pattern"

key-files:
  created:
    - mobile/app/profile-edit.tsx
  modified:
    - mobile/app/_layout.tsx
    - mobile/app/(tabs)/profile.tsx

key-decisions:
  - "Duplicated getInitials() locally in profile-edit.tsx rather than extracting a shared helper — small pure function, matches this codebase's existing per-screen duplication convention (e.g. AdireOrnament)"
  - "Avatar upload and name-save are independent useMutation calls (not a single combined save) — avatar upload persists immediately via POST /users/me/avatar per backend design, while name changes require an explicit Save tap"
  - "handleDeleteAccount() calls DELETE /users/me/data first; POST /auth/logout is wrapped in its own try/catch so a failed token-blacklist call never blocks clearing local SecureStore tokens or navigating to /onboarding"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-07-27
---

# Quick Task 260727-bhw: Mobile Profile Edit + Avatar Upload + Account Deletion Summary

**New mobile Edit Profile screen (name + expo-image-picker avatar upload via POST /users/me/avatar) and a Danger Zone NDPA account-deletion flow on the Profile tab — no backend changes, both target endpoints were already production-ready.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-27T13:31:06Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Users can now edit their first/last name and upload/replace their avatar photo from a dedicated `profile-edit` screen, reachable via a Pencil icon next to the display name on the Profile tab.
- The real avatar photo now renders (via `expo-image`, initials-fallback preserved) on both the Profile tab's `AvatarRing` and the new Edit Profile screen.
- Users can permanently delete (NDPA-anonymize) their account from a visually separated "Danger Zone" section below Sign Out, gated by an explicit, irreversibility-worded confirmation dialog.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the Edit Profile screen (name + avatar upload), register its route, and wire real avatar display into the Profile tab** - `37f85b9` (feat)
2. **Task 2: Add a separated, confirmed account-deletion "Danger Zone" to the Profile tab** - `46f19c6` (feat)

_Note: this quick task's docs (SUMMARY.md/STATE.md) are committed separately by the orchestrator, not part of the task commits above._

## Files Created/Modified
- `mobile/app/profile-edit.tsx` - New screen: loads `/users/me` via `useQuery`, seeds local firstName/lastName/avatarUrl state once (guarded so a background refetch never clobbers in-progress edits), lets the user pick a library photo (`expo-image-picker`) and upload it via multipart `POST /users/me/avatar`, and save firstName/lastName via `PATCH /users/me`
- `mobile/app/_layout.tsx` - Registered `<Stack.Screen name="profile-edit" options={{ title: 'Edit Profile', presentation: 'card' }} />` immediately after the `kyc` screen registration
- `mobile/app/(tabs)/profile.tsx` - Added `avatarUrl?: string | null` to `UserProfile`; `AvatarRing` now renders an `expo-image` real photo when `avatarUrl` is present (falls back to initials text otherwise); added a Pencil-icon edit entry point beside the display name (`router.push('/profile-edit')`); added `handleDeleteAccount()` and a new "Danger Zone" section (destructive-styled "Delete account" button) below the existing Sign Out section

## Decisions Made
- Avatar upload persists to the backend immediately on selection (the `POST /users/me/avatar` endpoint already writes `avatarUrl` server-side per the plan's verified facts) — the Edit Profile screen's "Save changes" button only covers the name fields, and is disabled when both fields are unchanged, empty, or a save is already in flight.
- `handleDeleteAccount()`'s `/auth/logout` call is deliberately isolated in its own `try/catch` so a network hiccup on token blacklisting can never prevent the client from clearing its own local session state — matching threat register mitigation T-quick-04.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<done>` criteria are met: the screen/route/avatar-display/edit-entry-point exist as specified (Task 1), and the Danger Zone flow calls `DELETE /users/me/data` → best-effort `POST /auth/logout` → unconditional token clear → `/onboarding` navigation, with a failed erase call leaving tokens/navigation untouched (Task 2).

## Issues Encountered

`cd mobile && npx tsc --noEmit` reports 5 pre-existing errors unrelated to this plan's files, caused by this worktree's `node_modules` missing two declared dependencies (`@sentry/react-native`, `@react-native-community/datetimepicker`) — confirmed present in `package.json` but absent from `node_modules` in this environment, and confirmed unrelated to `profile.tsx`/`profile-edit.tsx`/`_layout.tsx` by filtering `tsc` output for those file paths (zero matches both before and after Task 2's changes). Out of scope per the deviation rules' scope boundary (pre-existing, unrelated to current task's changes) — not fixed, not a plan-file issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both mobile completeness-audit gaps this plan targeted (profile-edit screen, account-deletion UI) are closed.
- Remaining gaps from the same 2026-07-27 audit (forgot/change-password flow, email verification, driver/rider dashboard reachability, host dashboard stub, vendor/organiser onboarding UI) are unchanged and still tracked in `.planning/STATE.md`'s Blockers/Concerns section — not in scope for this quick task.

---
*Phase: quick*
*Completed: 2026-07-27*

## Self-Check: PASSED

- FOUND: mobile/app/profile-edit.tsx
- FOUND: mobile/app/_layout.tsx
- FOUND: mobile/app/(tabs)/profile.tsx
- FOUND: .planning/quick/260727-bhw-add-mobile-profile-edit-screen-with-avat/260727-bhw-SUMMARY.md
- FOUND: commit 37f85b9
- FOUND: commit 46f19c6
