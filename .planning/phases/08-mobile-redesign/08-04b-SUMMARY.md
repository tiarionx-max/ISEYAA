---
phase: 08-mobile-redesign
plan: 04b
subsystem: mobile/routing
tags: [mobile, expo-router, stack-routes, wave-2, pre-registration]
requires: []
provides:
  - "Stack registration for mobile/app/marketplace/[id].tsx (consumed by 08-06)"
  - "Stack registration for mobile/app/cart.tsx (consumed by 08-06)"
  - "Stack registration for mobile/app/checkout.tsx (consumed by 08-06)"
  - "Stack registration for mobile/app/host.tsx (consumed by 08-07)"
affects:
  - "mobile/app/_layout.tsx (root Stack — additive only)"
tech_stack_added: []
tech_stack_patterns:
  - "Pre-registered Stack screens before screen file creation — Expo Router warns on push to unregistered route names, so route registrations must land before the screens that consume them"
key_files_created: []
key_files_modified:
  - "mobile/app/_layout.tsx (+4 lines)"
decisions:
  - "cart uses presentation: 'transparentModal' with animation: 'none' — slide-in is driven by 08-06 via Reanimated; stack-level transition would compound and feel laggy"
  - "marketplace/[id] uses default card presentation (no presentation override) — matches existing events/[id] and stays/[id] pattern"
  - "host uses headerShown: false because 08-07 owns its own progress-stepper header"
metrics:
  duration_minutes: 8
  completed: "2026-06-12"
  tasks_completed: 1
  files_changed: 1
  commits: 2
requirements: [MOB-RD-05, MOB-RD-06]
---

# Phase 8 Plan 04b: Pre-register Wave 3 Stack Routes Summary

Pre-registered four `<Stack.Screen>` entries in `mobile/app/_layout.tsx` so Wave 3 plans (08-05 / 08-06 / 08-07) have truly disjoint file ownership, resolving H-4 (Option A) from 08-PLAN-CHECK.

## What landed

Inserted directly after the existing `<Stack.Screen name="stays/[id]" .../>` registration in `mobile/app/_layout.tsx`:

```tsx
<Stack.Screen name="marketplace/[id]" options={{ title: 'Product' }} />
<Stack.Screen name="cart" options={{ headerShown: false, presentation: 'transparentModal', animation: 'none' }} />
<Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'card' }} />
<Stack.Screen name="host" options={{ headerShown: false, presentation: 'card' }} />
```

Insertion point: between line 47 (`stays/[id]`) and the former line 48 (`transport-flow`). New lines occupy 48–51 in the post-edit file.

## Stack.Screen count

| State           | Count |
| --------------- | ----- |
| Before          | 17    |
| After           | 21    |
| Delta           | +4    |

`grep -c "<Stack.Screen" mobile/app/_layout.tsx` returns 21. Exactly the expected delta.

## Truths verified

- Root Stack registers all 4 new Wave 3 routes (`marketplace/[id]`, `cart`, `checkout`, `host`) — confirmed by `grep -E 'name="(marketplace/\[id\]|cart|checkout|host)"'` returning 4 matches.
- Existing Stack.Screen registrations are unchanged — `git diff` shows only `+4` lines, zero deletions, zero modifications to the 17 prior entries.
- No Wave 3 plan needs to edit `_layout.tsx` — disjoint file ownership achieved (08-05 owns `book.tsx` + `components/book/`, 08-06 owns `marketplace/[id].tsx` + `cart.tsx` + `checkout.tsx`, 08-07 owns `host.tsx` + `(tabs)/profile.tsx`).
- Sentry init, QueryClient init, and the auth-redirect `useEffect` are untouched.

## Deviations from Plan

### Process deviation (not a code deviation): absolute-path safety #3099 self-correction

**Found during:** Task 1 (first Edit attempt)
**Issue:** First `Edit` call used the absolute path `C:\Developer\work\ISEYAA\mobile\app\_layout.tsx` (main repo path) rather than the worktree path. The Edit landed in the main repo working tree instead of the worktree.
**Fix:** Detected the divergence via `wc -l` comparison (main: 67 lines with edit, worktree: 63 lines unchanged). Reverted main repo with `git checkout -- mobile/app/_layout.tsx` (file-scoped, allowed). Re-applied the same edit at the worktree path `C:\Developer\work\ISEYAA\.claude\worktrees\agent-a419f5b3888f1cc52\mobile\app\_layout.tsx`.
**Files modified:** None permanently outside scope. Main repo working tree returned to clean (`git status --short mobile/app/_layout.tsx` empty post-revert).
**Commit:** No commit landed in main repo. Final commit `26815fa` is in the worktree only.

No code deviations from the plan. The 4 Stack.Screen lines are byte-for-byte what the plan specified.

## Deferred Issues

- **Pre-existing TS error in `mobile/app/_layout.tsx` line 1:** `error TS2307: Cannot find module '@sentry/react-native' or its corresponding type declarations.` Already logged in `.planning/phases/08-mobile-redesign/deferred-items.md` under Plan 08-02. Unrelated to this plan's additions — caused by missing `node_modules/@sentry/*` after `npm install` was not re-run since the dependency was added. The 4 new `<Stack.Screen>` lines this plan adds are syntactically valid TSX and would compile without error once the Sentry types resolve.

## Commits

| # | Type   | Hash    | Summary                                                          |
| - | ------ | ------- | ---------------------------------------------------------------- |
| 1 | feat   | 26815fa | feat(08-04b): pre-register Wave 3 Stack routes in _layout.tsx    |
| 2 | docs   | pending | docs(08-04b): SUMMARY                                            |

## Self-Check: PASSED

- FOUND: `mobile/app/_layout.tsx` (modified, +4 lines, 21 `<Stack.Screen>` entries)
- FOUND: commit `26815fa` in `git log` of branch `worktree-agent-a419f5b3888f1cc52`
- FOUND: all 4 new route names present via grep
- FOUND: main repo working tree clean (no stray edit from the absolute-path mishap)
