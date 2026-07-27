---
phase: quick
plan: 260727-eca
subsystem: mobile
tags: [mobile, profile, driver, host, vendor, role-guard, reachability]
requires: []
provides:
  - "profile.tsx permanent host/vendor 'Go to dashboard' links"
  - "ensureDriverRole role-drift guard on all three DRIVER-gated mutations"
affects:
  - "mobile/app/(tabs)/profile.tsx"
  - "mobile/app/onboarding.tsx"
  - "mobile/app/driver-dashboard.tsx"
  - "mobile/app/driver-application.tsx"
tech-stack:
  added: []
  patterns:
    - "if/else CTA rendering (never neither branch) mirroring existing driver-become/driver-complete pattern"
    - "ensureDriverRole client-side role reconciliation before RolesGuard-protected mutations, mirroring ensureOrganiserRole"
key-files:
  created: []
  modified:
    - "mobile/app/(tabs)/profile.tsx"
    - "mobile/app/onboarding.tsx"
    - "mobile/app/driver-dashboard.tsx"
    - "mobile/app/driver-application.tsx"
decisions:
  - "Kept host/vendor CTA card styles (hostCtaWrap/hostCtaCard/etc.) unchanged, reusing them for the new dashboard-link branch rather than introducing a new style block, per plan instruction"
  - "Used ternary if/else (`alreadyHost ? (...) : (...)`) instead of two independent boolean-gated blocks, guaranteeing exactly one branch always renders"
metrics:
  duration: "~25 minutes"
  completed: "2026-07-27"
---

# Quick Task 260727-eca: Fix mobile reachability gaps + add permanent dashboard links Summary

Added permanent host/vendor "Go to dashboard" links to profile.tsx (replacing CTAs that vanished once already onboarded), added an `ensureDriverRole` role-drift guard to the three previously-unguarded DRIVER-gated mutations, and removed three dead unreachable try/catch/Alert wrappers in onboarding.tsx.

## What Was Built

**Task 1 — Permanent host/vendor dashboard links + onboarding cleanup** (commit `57365cd`)

- `mobile/app/(tabs)/profile.tsx`: the Host CTA block and Vendor CTA block were each converted from a bare `{!alreadyX && (...)}` guard (which rendered nothing once the role was already onboarded) into an if/else (`alreadyX ? (...) : (...)`) so exactly one card always renders:
  - `alreadyHost` true → "Go to my host dashboard" card (`LayoutDashboard` icon, routes to `/host-dashboard`)
  - `alreadyHost` false → unchanged "Become a host" card (`Home` icon, routes to `/host`)
  - `alreadyVendor` true → "Go to my vendor dashboard" card (`LayoutDashboard` icon, routes to `/vendor-dashboard`)
  - `alreadyVendor` false → unchanged "Become a vendor" card (`Store` icon, routes to `/vendor`)
  - Both new branches reuse the existing `hostCtaWrap`/`hostCtaCard`/`hostCtaInner`/`hostCtaIconBox`/`hostCtaTextBlock`/`hostCtaTitle`/`hostCtaSub` styles unchanged, matching the same card idiom already used for the driver-dashboard link (line ~835 of the same file).
- `mobile/app/onboarding.tsx`: `handlePhonePress`, `handleEmailPress`, `handleRegisterPress` simplified from `try { router.push(...) } catch { Alert.alert('Coming soon', ...) }` to a single direct `router.push(...)` call each. The now-unused `Alert` import was removed from the `react-native` import list (confirmed via grep — no other `Alert` usage remained in the file).

**Task 2 — `ensureDriverRole` role-drift guard** (commit `92da90d`)

- Added an identical module-scope `ensureDriverRole(currentRole: string | undefined): Promise<void>` helper to all three files, mirroring `organiser-dashboard.tsx`'s existing `ensureOrganiserRole` shape and comment style: if `currentRole !== 'DRIVER'`, calls `PATCH /users/me/role` with `{ role: 'DRIVER' }` before the mutation proceeds.
  - `profile.tsx`: placed after the token imports, before `// ── Types ──`. Called as `await ensureDriverRole(user?.role)` as the first line of `toggleOnlineMutation`'s `mutationFn`, reusing the file's existing `['me']` query.
  - `driver-dashboard.tsx`: placed after the `fmt()` helper. Added a new `['me']` query (`useQuery<{ role?: string }>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') })`) sharing the same cache key as `profile.tsx`. Called as `await ensureDriverRole(me?.role)` as the first line of `toggleMutation`'s `mutationFn`.
  - `driver-application.tsx`: placed after `defaultExpiry()`. Added `useQuery` to the `@tanstack/react-query` import and `fetcher` to the `../lib/api` import. Added the same `['me']` query inside the component, before the `mutation` declaration. Called as `await ensureDriverRole(me?.role)` as the first line of `mutation`'s `mutationFn`, before the existing `POST /transport/drivers` call.

## Verification

- `cd mobile && npx tsc --noEmit` run after each task. Both runs produce the identical set of 7 pre-existing `TS2307: Cannot find module` errors (`@sentry/react-native`, `@react-native-community/datetimepicker` — confirmed absent from `node_modules` via `ls`), none of which are on lines touched by this plan and none of which changed count/location between the two runs. No new type errors were introduced by either task. See `deferred-items.md` in this directory for detail — this is an environment install gap, out of scope for this plan's file-modification scope.
- Manual read-through confirmed: `alreadyHost`/`alreadyVendor` if/else blocks in `profile.tsx` each render exactly one card (grep confirms both `/host-dashboard` and `/vendor-dashboard` `router.push` targets present, and both target route files `app/host-dashboard.tsx`/`app/vendor-dashboard.tsx` exist on disk).
- Manual read-through confirmed: `ensureDriverRole` is called as the first statement in all three mutationFns (`toggleOnlineMutation` in profile.tsx line 420, `toggleMutation` in driver-dashboard.tsx line 72, `mutation` in driver-application.tsx line 96) — all before any `/transport/*` call.
- Manual read-through confirmed: `onboarding.tsx` has zero remaining `Alert`/`try`/`catch` occurrences (grep returned no matches).

## Deviations from Plan

### None affecting behavior — line-number drift only

The plan's `<verified_facts>` cited exact line numbers (e.g. host CTA "currently lines 842-864", `toggleOnlineMutation` "lines 407-421"). The actual file was one line shorter overall (1460 vs. the plan's stated 1461-line count) but every cited block matched the plan's described content and line numbers exactly once located — no adjustment to the described logic was needed. No deviation from the plan's intended code changes occurred.

### Rule 3 (auto-fix blocking issue) — worktree behind expected base commit

At startup, `git merge-base --is-ancestor <EXPECTED_BASE> HEAD` reported MISMATCH: this worktree's HEAD was an *ancestor* of the expected base commit (the plan commit itself was missing from this worktree), not a diverged/conflicting history. Working tree was clean, so the fix was a safe fast-forward: `git reset --hard <EXPECTED_BASE>`, verified beforehand via `git merge-base --is-ancestor HEAD <EXPECTED_BASE>` to confirm no work would be lost. No file changes had been made prior to this correction.

### Deferred (out of scope, logged separately)

Pre-existing missing npm packages (`@sentry/react-native`, `@react-native-community/datetimepicker`) cause 7 `tsc --noEmit` errors unrelated to this plan's changes. Logged in `.planning/quick/260727-eca-fix-mobile-reachability-add-permanent-go/deferred-items.md`. Not fixed — installing packages is an environment action outside this plan's declared `files_modified` scope, and the errors are unrelated to any line this plan touches.

## Known Stubs

None. All new code paths (dashboard links, role-drift guard, simplified onboarding handlers) are fully wired to real navigation targets and real backend endpoints — no placeholder/mock data introduced.

## Commits

- `57365cd` — feat(quick-260727-eca): permanent host/vendor dashboard links, drop dead onboarding catch blocks
- `92da90d` — fix(quick-260727-eca): add ensureDriverRole role-drift guard to driver mutations

## Self-Check: PASSED

- FOUND: mobile/app/(tabs)/profile.tsx (ensureDriverRole at line 88, host-dashboard link at line 858, vendor-dashboard link at line 903)
- FOUND: mobile/app/onboarding.tsx (no Alert/try/catch remaining)
- FOUND: mobile/app/driver-dashboard.tsx (ensureDriverRole at line 31, me query, guard call at line 72)
- FOUND: mobile/app/driver-application.tsx (ensureDriverRole at line 71, me query, guard call at line 96)
- FOUND: commit 57365cd
- FOUND: commit 92da90d
