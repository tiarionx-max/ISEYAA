---
phase: quick
plan: 260727-jk8
subsystem: mobile
tags: [mobile, ui, cleanup, react-native-svg]
requires: []
provides:
  - "10 mobile screens with the decorative Adire ornament SVG fully removed (no component, wrapper, dead style, or dangling import)"
  - "Unobstructed KYC-tier-limit text on the Profile tab's KYC-progress card"
affects:
  - "mobile/app/onboarding.tsx"
  - "mobile/app/auth/forgot-password.tsx"
  - "mobile/app/auth/register.tsx"
  - "mobile/app/auth/email.tsx"
  - "mobile/app/auth/phone.tsx"
  - "mobile/app/events/[id].tsx"
  - "mobile/app/search.tsx"
  - "mobile/app/(tabs)/index.tsx"
  - "mobile/app/(tabs)/profile.tsx"
  - "mobile/app/(tabs)/wallet.tsx"
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - "mobile/app/onboarding.tsx"
    - "mobile/app/auth/forgot-password.tsx"
    - "mobile/app/auth/register.tsx"
    - "mobile/app/auth/email.tsx"
    - "mobile/app/auth/phone.tsx"
    - "mobile/app/events/[id].tsx"
    - "mobile/app/search.tsx"
    - "mobile/app/(tabs)/index.tsx"
    - "mobile/app/(tabs)/profile.tsx"
    - "mobile/app/(tabs)/wallet.tsx"
decisions:
  - "Deleted the entire react-native-svg import line in all 10 files, per the plan's pre-confirmed grep that Svg/G/Rect/Path/Line/Circle are used only inside each file's AdireOrnament function body"
metrics:
  duration: "~20 minutes"
  completed: "2026-07-27"
---

# Quick Task 260727-jk8: Remove the decorative Adire ornament SVG Summary

Deleted the locally-duplicated `AdireOrnament` SVG component (Yoruba-textile-inspired square/circle motif), its positioning `<View>` wrapper, dead `StyleSheet` key, and unused `react-native-svg` import from all 10 mobile screens that rendered it — including the Profile tab's KYC-progress card where it visually overlapped the TIER 2/TIER 3 daily-limit text the user flagged directly.

## What Was Built

**Task 1 — 5 auth-flow screens (Variant A ornament)** (commit `8354979`)

- `mobile/app/onboarding.tsx`, `mobile/app/auth/forgot-password.tsx`, `mobile/app/auth/register.tsx`, `mobile/app/auth/email.tsx`, `mobile/app/auth/phone.tsx`
- Each file: removed the `import Svg, { Rect, Line, Circle } from 'react-native-svg';` line, the local `function AdireOrnament(...) {...}` definition (including its `// ── Adire ornament ──` header comment in `onboarding.tsx` only, per the plan), the `<View style={styles.adireWrapper} pointerEvents="none"><AdireOrnament .../></View>` render block (plus the `{/* ── Adire ornament — centered at top ── */}` comment in `onboarding.tsx` only), and the `adireWrapper` `StyleSheet.create` key.
- `onboarding.tsx` also had a one-line `// Adire ornament centered near top` comment directly above the `adireWrapper` style key (not separately called out in the plan's table, but clearly tied to the dead style) — removed it too as part of the same style-key deletion to avoid an orphaned comment.

**Task 2 — 5 tab/detail screens (mixed Variant A/B ornament), including the flagged Profile KYC card** (commit `a8920ca`)

- `mobile/app/events/[id].tsx`, `mobile/app/search.tsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/profile.tsx`, `mobile/app/(tabs)/wallet.tsx`
- Same 4-part deletion applied per file: import line, `AdireOrnament` function (with its header comment in all 5 files, as the plan noted), the render block (with its `{/* Adire ornament ... */}` comment in `events/[id].tsx`, `search.tsx`, `profile.tsx`, `wallet.tsx` — `(tabs)/index.tsx` had no comment and no `pointerEvents="none"`, deleted as-is), and the dead style key (`ornamentWrap`, `heroAdire`, `adireOrnamentPos`, `adireContainer`, `adireOrnament` respectively).
- `mobile/app/(tabs)/profile.tsx`: confirmed by direct read that the `kycGradient` card's children are now only the kicker (`KYC PROGRESS`), headline, tier-grid (containing the TIER 1/2/3 limit text), and CTA — no ornament element remains, no other element repositioned.

## Verification

- `cd mobile && npx tsc --noEmit` run after each task. Both runs produced the identical set of 9 pre-existing `TS2307: Cannot find module` errors (`@sentry/react-native`, `@react-native-community/datetimepicker`), all in files untouched by this plan and unrelated to `react-native-svg` or any Adire ornament code. No new errors introduced by either task.
- `grep -n "AdireOrnament\|from 'react-native-svg'"` across all 10 files: zero matches after both tasks.
- `grep -n "adireWrapper\|ornamentWrap\|heroAdire\|adireOrnamentPos\|adireContainer\|adireOrnament"` across all 10 files: zero matches after both tasks.
- Manual read-through of `mobile/app/(tabs)/profile.tsx`'s `kycGradient` JSX (lines 665-677 post-edit): confirmed only kicker/headline/tier-grid/CTA content remains, no ornament, no overlap with the TIER 2/TIER 3 limit text.

## Deviations from Plan

### None affecting behavior — line numbers matched exactly

Every file was re-read before editing to reconfirm line numbers against the plan's `<verified_facts>` table. All 10 files matched the plan's cited line numbers exactly (import line, function definition range, render block, style key location) with zero drift.

### Rule 1 (auto-fix bug) — stray closing brace after phone.tsx style-key deletion

- **Found during:** Task 1 (`mobile/app/auth/phone.tsx`)
- **Issue:** The Edit tool call that deleted the `adireWrapper` style key's body used an `old_string` ending at `zIndex: 1,` rather than including the block's closing `},`, which left a dangling `  },` line immediately before `content: {` in the `StyleSheet.create` call — a syntax-breaking artifact.
- **Fix:** Immediately re-read the affected lines, spotted the stray `},`, and applied a follow-up edit removing it.
- **Files modified:** `mobile/app/auth/phone.tsx`
- **Verification:** Re-read the file to confirm `root: { flex: 1, backgroundColor: SURFACE_DEEP },` is now followed directly by `content: {` with no orphaned brace; `npx tsc --noEmit` passed clean afterward.
- **Committed in:** `8354979` (Task 1 commit — fixed before commit, so no separate commit needed)

### Rule 3 (auto-fix blocking issue) — worktree ahead of expected base commit

At startup, `git merge-base --is-ancestor <EXPECTED_BASE> HEAD` reported MISMATCH: this worktree's HEAD (`e7e9f0f`) contained several unrelated quick-task commits merged after the expected base commit (`31784f8`, the plan commit itself), meaning the worktree was created from a stale/wrong ref. Working tree was clean (`git status --short` empty), so the fix was `git reset --hard 31784f8e2a5e4ba36a9a48975fc7311d2c44abda`, verified safe beforehand by confirming no uncommitted work existed. No file changes had been made prior to this correction.

### Deferred (out of scope, not fixed)

Pre-existing missing npm packages (`@sentry/react-native`, `@react-native-community/datetimepicker`) cause 9 `tsc --noEmit` `TS2307` errors, none in files touched by this plan and unrelated to the ornament removal. Not fixed — outside this plan's declared `files_modified` scope and an environment install gap, not a bug introduced by this change.

## Known Stubs

None. This was a pure subtractive change — no new UI, no new data flow, no placeholder introduced.

## Commits

- `8354979` — fix(quick-260727-jk8): remove decorative Adire ornament SVG from 5 auth-flow screens
- `a8920ca` — fix(quick-260727-jk8): remove decorative Adire ornament SVG from 5 tab/detail screens

## Self-Check: PASSED

- FOUND: mobile/app/onboarding.tsx
- FOUND: mobile/app/auth/forgot-password.tsx
- FOUND: mobile/app/auth/register.tsx
- FOUND: mobile/app/auth/email.tsx
- FOUND: mobile/app/auth/phone.tsx
- FOUND: mobile/app/events/[id].tsx
- FOUND: mobile/app/search.tsx
- FOUND: mobile/app/(tabs)/index.tsx
- FOUND: mobile/app/(tabs)/profile.tsx
- FOUND: mobile/app/(tabs)/wallet.tsx
- FOUND: commit 8354979
- FOUND: commit a8920ca
