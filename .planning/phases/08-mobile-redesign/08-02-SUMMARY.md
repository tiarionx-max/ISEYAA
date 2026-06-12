---
phase: 08-mobile-redesign
plan: 02
subsystem: mobile
tags: [mobile, ui-primitives, reanimated, news-ticker]
requires: [mobile/lib/tokens.ts, mobile/lib/api.ts, react-native-reanimated, lucide-react-native, @tanstack/react-query]
provides:
  - mobile/components/NewsTicker.tsx
  - mobile/components/ui/PressableScale.tsx
  - mobile/components/ui/CategoryStrip.tsx
  - mobile/components/ui/Chip.tsx
affects: []
tech-stack:
  added: []
  patterns:
    - "Animated.loop + translateX + useNativeDriver:true marquee (no react-native-marquee dep)"
    - "Reanimated v3 useSharedValue + useAnimatedStyle + withSpring press-scale 0.97"
    - "Dynamic require() for expo-haptics so missing package is a silent no-op"
key-files:
  created:
    - mobile/components/NewsTicker.tsx
    - mobile/components/ui/PressableScale.tsx
    - mobile/components/ui/CategoryStrip.tsx
    - mobile/components/ui/Chip.tsx
  modified: []
decisions:
  - "LIVE_RED constant lives inline at top of NewsTicker.tsx (documented one-off exception to no-inline-hex rule, per plan must_haves)"
  - "PressableScale spring tuning: pressIn = stiffness 400/damping 25 (snappy down), pressOut = stiffness 300/damping 20 (smooth release)"
  - "CategoryStrip uses Pressable not PressableScale (color-flip behavior matches web, no scale animation needed)"
  - "LIVE-pulse uses RN's core Animated (manual two-phase oscillation) instead of Reanimated because the parent Animated.loop is the same Animated API and mixing libs in one component was avoided for consistency"
metrics:
  duration_minutes: 12
  completed_date: 2026-06-12T13:51:36Z
  tasks_completed: 3
  files_created: 4
  files_modified: 0
---

# Phase 8 Plan 02: Wave 1 Shared UI Primitives Summary

Four shared `mobile/components/**` primitives that every downstream Wave 2/3/4 plan will import: NewsTicker marquee, PressableScale animation contract, CategoryStrip icon-tab strip, and Chip pill. Wave 1 parallel-safe — touches nothing in `mobile/lib/**` or any tab/screen file.

## Files Created

| File | Purpose | Exports |
|------|---------|---------|
| `mobile/components/NewsTicker.tsx` | Animated.loop translateX marquee + LIVE pulse + fallback headlines, queries `/news?limit=20` | `NewsTicker` |
| `mobile/components/ui/PressableScale.tsx` | Reanimated scale-0.97 spring on press, dynamic expo-haptics no-op fallback, 44pt min touch target | `PressableScale`, `PressableScaleProps` |
| `mobile/components/ui/CategoryStrip.tsx` | Horizontal lucide-icon category tabs, stateless, 44pt min touch per tab | `CategoryStrip`, `CategoryStripItem`, `CategoryStripProps` |
| `mobile/components/ui/Chip.tsx` | UI-SPEC §4 pill (32px h, RADIUS_PILL, gold-dim active state) | `Chip`, `ChipProps` |

## Commits

| Hash | Task | Files |
|------|------|-------|
| `3ec5637` | Task 1: PressableScale + Chip primitives | `PressableScale.tsx`, `Chip.tsx` |
| `ad00d07` | Task 2: CategoryStrip (44pt min touch per tab) | `CategoryStrip.tsx` |
| `095e5de` | Task 3: NewsTicker (Animated.loop marquee, link field) | `NewsTicker.tsx` |

## Animation Parameters

**PressableScale (react-native-reanimated 3.10.1):**
- Press in: `withSpring(0.97, { stiffness: 400, damping: 25 })` — snappy press feedback.
- Press out: `withSpring(1, { stiffness: 300, damping: 20 })` — slightly softer release.
- Uses `useSharedValue(1)` + `useAnimatedStyle` + `Animated.View` from `react-native-reanimated`.

**NewsTicker (RN core Animated):**
- Marquee: `Animated.loop(Animated.timing(translateX, { toValue: -contentWidth, duration: 60000, easing: Easing.linear, useNativeDriver: true }))` — restarts whenever measured `contentWidth` changes.
- Headlines duplicated `[...items, ...items]` and content width measured via `onLayout` then halved so a seamless reset to 0 occurs at end of the first copy.
- LIVE dot pulse: explicit two-phase recursive `Animated.timing(1 → 0.4, 600ms) → (0.4 → 1, 600ms)` (no `Animated.sequence` shortcut, per plan).

## Reanimated Version

`react-native-reanimated@~3.10.1` (already in mobile/package.json, no new dep). All Reanimated APIs in PressableScale are v3-canonical: `useSharedValue`, `useAnimatedStyle`, `withSpring`, `Animated.View`.

## Decisions

1. **LIVE_RED hex location:** Declared as a `const LIVE_RED = '#EF4444'` at the top of `NewsTicker.tsx`, NOT promoted to `tokens.ts`. Rationale: it's a semantic-status color used by a single component, not part of the brand palette. Promoting it would conflate brand tokens with status-message tokens; the plan explicitly allowed an inline one-off here.

2. **PressableScale enforces 44pt touch target at the outer Pressable** (not the Animated.View). This guarantees the touch surface stays 44pt even when the scaled child shrinks to 0.97 — visible scale ≠ hit area.

3. **CategoryStrip uses raw `Pressable`** (not the new `PressableScale`). Tabs only flip color/underline on selection, not on press; adding a scale animation to a horizontal-scrolling list would feel jittery and disagree with the web implementation.

4. **NewsTicker uses RN core `Animated`** (not Reanimated). The marquee + pulse pair both live in `Animated`, avoiding the cost of mixing two animation libraries in one small component. Reanimated is reserved for press interactions where the perf gain matters.

5. **Haptics is wrapped in `try { require('expo-haptics') } catch { }`** following the existing pattern in `mobile/app/(tabs)/profile.tsx` lines 18-26. Verified before copying. If the package isn't installed (it isn't currently in `package.json`), press feedback silently no-ops instead of crashing.

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None.

## Deferred Issues

- Pre-existing typecheck error `app/_layout.tsx(1,25): Cannot find module '@sentry/react-native'` (logged to `.planning/phases/08-mobile-redesign/deferred-items.md`). Out of scope for this plan — touches no `mobile/components/**` file. Likely needs `npm install` from repo root, or an `@sentry/react-native` types resolution fix. Does not block 08-02 verification because our 4 new files compile cleanly.

## Verification Results

```
=== Inline-hex check (must show no matches outside LIVE_RED/EF4444) ===
(no offending matches)

=== minHeight: 44 in CategoryStrip ===
1

=== NewsTicker link/url assertions ===
2  (item.link references)
(no item.url — good)
```

```
=== tsc --noEmit (mobile workspace) ===
app/_layout.tsx(1,25): error TS2307: Cannot find module '@sentry/react-native'  ← PRE-EXISTING, deferred
(no new errors from the 4 new files)
```

```
=== Artifact existence + exports ===
FOUND: mobile/components/NewsTicker.tsx                   — export function NewsTicker
FOUND: mobile/components/ui/PressableScale.tsx            — export function PressableScale
FOUND: mobile/components/ui/CategoryStrip.tsx             — export function CategoryStrip
FOUND: mobile/components/ui/Chip.tsx                      — export function Chip
```

```
=== No new dependency added to mobile/package.json ===
(git diff HEAD -- mobile/package.json: empty)
```

## Known Stubs

None. All four components are functional primitives — the NewsTicker FALLBACK array is intentional UX polish (matches web `NewsTicker`), not a stub.

## Success Criteria Check

- [x] 4 files exist under `mobile/components/`
- [x] NewsTicker queries `/news?limit=20` via TanStack Query, opens links via `Linking.openURL(item.link)`
- [x] NewsTicker uses `Animated.loop` + `translateX` + `useNativeDriver: true` marquee
- [x] PressableScale uses `react-native-reanimated` `withSpring` (not `Animated.spring`)
- [x] CategoryStrip is generic, every tab enforces `minHeight: 44`
- [x] Chip matches UI-SPEC §4 (32px height, pill radius, gold-dim active state)
- [x] No new deps added to `mobile/package.json`
- [x] tsc clean on the 4 new files

## Self-Check: PASSED

- Files created: 4/4 verified on disk
- Commits: 3/3 verified in git log
- Verification commands: all passed
- No `mobile/package.json` mutation
- Pre-existing tsc error documented in `deferred-items.md`, not introduced by 08-02
