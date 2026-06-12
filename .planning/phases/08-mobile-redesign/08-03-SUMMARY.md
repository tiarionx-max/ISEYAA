---
phase: 08-mobile-redesign
plan: 03
subsystem: mobile
tags: [mobile, discover, news-ticker, additive-edit]
wave: 2
depends_on: [08-02]
requirements: [MOB-RD-02]
requires: ["mobile/components/NewsTicker.tsx (from 08-02)"]
provides:
  - "Discover screen with integrated NewsTicker at top of scroll"
affects:
  - "mobile/app/(tabs)/index.tsx"
tech-stack:
  added: []
  patterns: ["additive JSX insertion", "relative-path component import"]
key-files:
  created: []
  modified:
    - "mobile/app/(tabs)/index.tsx"
decisions:
  - "Kept edit strictly additive (+2 lines) — full Discover hero redesign deferred per CONTEXT M-1"
  - "Imported NewsTicker via relative '../../components/NewsTicker' to match existing import style for fetcher/storage"
  - "Inserted <NewsTicker /> as first child of ScrollView (inside SafeAreaView edges=['top']) so it respects the notch and renders above all existing content without wrapping it"
metrics:
  duration: "~5 min"
  completed: "2026-06-12"
  tasks: 1
  files_modified: 1
  lines_added: 2
  lines_removed: 0
---

# Phase 8 Plan 08-03: NewsTicker Integration into Discover Summary

One-liner: Inserted `<NewsTicker />` into `mobile/app/(tabs)/index.tsx` as a strictly additive 2-line edit, satisfying MOB-RD-02 success criterion #2 without touching the rest of the Discover screen.

## What Was Built

A single additive edit to the Discover tab (`mobile/app/(tabs)/index.tsx`):

1. **Import added (line 18):**
   ```ts
   import { NewsTicker } from '../../components/NewsTicker';
   ```
   Placed adjacent to the existing relative-path imports for `fetcher` (`../../lib/api`) and `storage` (`../../lib/storage`) to match local convention.

2. **JSX element inserted (line 470):**
   ```tsx
   <NewsTicker />
   ```
   Placed as the first child of the `<ScrollView>` (line 467), inside the `<SafeAreaView edges={['top']}>` so the ticker sits below the notch but above the hero greeting/location/bell block. No wrapping `<View>` — NewsTicker brings its own height + border styling per 08-02.

That's the full change. No state, hooks, refs, styles, or other JSX modified.

## Verification

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep -c "<NewsTicker" mobile/app/(tabs)/index.tsx` | 1 | 1 | PASS |
| `grep -E "import.*NewsTicker"` matches | yes | yes (line 18) | PASS |
| `git diff --stat` lines changed | ≤ 6 | 2 | PASS |
| `cd mobile && npx tsc --noEmit` new errors | 0 | 0 (pre-existing `@sentry/react-native` on `app/_layout.tsx` is tracked in `deferred-items.md`) | PASS |
| Discover existing content intact | yes | yes (hero greeting, search, curated feed, bookmarks JSX unchanged) | PASS |

### `must_haves.truths` validation

- "Discover tab renders the NewsTicker at the top of the scroll, below safe area, above the hero greeting" — VERIFIED: `<NewsTicker />` at line 470, immediately after `<ScrollView>` opens at line 467, inside `<SafeAreaView edges={['top']}>` at line 464, above the hero `<View style={styles.heroWrapper}>` at line 471.
- "Existing Discover content (hero greeting, search, curated feed, bookmarks) still works" — VERIFIED: 2-line additive diff confirms no other JSX touched.

### `must_haves.artifacts` validation

- `mobile/app/(tabs)/index.tsx` contains `<NewsTicker` — VERIFIED (single occurrence at line 470).

### `must_haves.key_links` validation

- `import { NewsTicker } from '../../components/NewsTicker'` matches pattern `import.*NewsTicker` — VERIFIED at line 18.

## Deviations from Plan

None. The plan was executed exactly as written: one import added, one JSX element inserted, no other changes.

## Scope Deferrals (Documented)

Per CONTEXT.md M-1 deferral and the plan's `<objective>` block, the **full Discover hero redesign** per UI-SPEC §TAB 0 is **deferred to a follow-up phase**. Specifically, the following remain on the existing 1101-line implementation and are NOT touched here:

- Rotating billboard hero (UI-SPEC §TAB 0 — replaced with current static `heroWrapper` + adire ornament + dusk gradient).
- Sticky search bar with mic affordance (current search is inline, non-sticky).
- Quick Action Pills carousel.
- Curated section overhaul (current FlatList-driven feed retained as-is).

This plan inserts the news ticker only and leaves the rest of the Discover screen at parity with HEAD prior to this change.

## Files Modified

| File | Change | Lines added | Lines removed |
|------|--------|-------------|---------------|
| `mobile/app/(tabs)/index.tsx` | Added NewsTicker import + element | 2 | 0 |

Line count: 1101 → 1103.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `13afa94` | feat(08-03) | insert NewsTicker into Discover scroll |

## Self-Check: PASSED

- `mobile/app/(tabs)/index.tsx` — FOUND (modified, 1103 lines, +2 vs prior HEAD)
- Commit `13afa94` — FOUND on `worktree-agent-a154ace36c7fa1c1a`
- `mobile/components/NewsTicker.tsx` (dependency from 08-02) — FOUND
- TypeScript: no new errors introduced (the single pre-existing `@sentry/react-native` error on `mobile/app/_layout.tsx` is the tracked deferred item)
