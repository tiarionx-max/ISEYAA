---
phase: quick
plan: 01
subsystem: ui
tags: [react-native, flatlist, expo, mobile, performance]

requires: []
provides:
  - "Virtualized NEAR YOU attractions grid on the mobile Discover tab (mobile/app/(tabs)/index.tsx)"
affects: [mobile-discover-tab, mobile-performance]

tech-stack:
  added: []
  patterns:
    - "Nested non-scrolling FlatList (scrollEnabled={false}) inside an outer page ScrollView, mirroring the file's existing horizontal Upcoming Events FlatList idiom"

key-files:
  created: []
  modified:
    - "mobile/app/(tabs)/index.tsx"

key-decisions:
  - "Used FlatList numColumns={2} + scrollEnabled={false} + columnWrapperStyle instead of introducing a separate scroll container, keeping the outer page ScrollView as the single scroll axis"
  - "Kept skeleton and empty-state branches byte-for-byte unchanged; only the data-rendering branch was converted"

patterns-established: []

requirements-completed: []

duration: 12min
completed: 2026-07-23
---

# Quick Task 260723-fnm: Virtualize Discover Tab Attractions Grid Summary

**Converted the Discover tab's NEAR YOU attractions grid from a synchronous `View`+`.map()` render of up to 50 `AttractionCard` instances into a virtualized `FlatList` (numColumns=2, scrollEnabled=false) nested inside the existing outer page `ScrollView`.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments
- NEAR YOU attraction grid now renders through `FlatList` with `initialNumToRender={6}` / `maxToRenderPerBatch={6}`, staggering the initial mount instead of mounting all filtered attractions (up to 50) and their entrance/pulse animations synchronously
- 2-column visual layout preserved via `numColumns={2}` + new `attractionRow` style (`paddingHorizontal: SPACE_4, gap: SPACE_3`) reproducing the original `attractionGrid` row spacing
- Vertical row gap reproduced via `ItemSeparatorComponent` instead of flex `gap`, avoiding a trailing gap after the last row
- Nested safely inside the existing outer `ScrollView` via `scrollEnabled={false}` — no nested-VirtualizedList-in-ScrollView warning risk
- Skeleton loading branch and empty-state branch left completely untouched (still use `styles.attractionGrid` / `styles.empty` exactly as before)
- Upcoming Events horizontal FlatList and every other section of the screen untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Virtualize the NEAR YOU attractions grid with FlatList** - `c22b8c3` (perf)
2. **Task 2: Verify no regressions via grep and manual read-through** - no code changes required; verification-only, folded into commit `c22b8c3`'s review (see Deviations below for the one automated-check discrepancy found and resolved by re-verification, not by changing code)

## Files Created/Modified
- `mobile/app/(tabs)/index.tsx` - NEAR YOU data-rendering branch converted from `View`+`.map()` to `FlatList`; added `attractionRow` style; skeleton/empty branches, `AttractionCard`, `CARD_W`, and Upcoming Events FlatList untouched

## Decisions Made
- Followed the plan's exact FlatList prop set (`data`, `keyExtractor`, `numColumns={2}`, `scrollEnabled={false}`, `columnWrapperStyle`, `ItemSeparatorComponent`, `initialNumToRender`/`maxToRenderPerBatch`, `renderItem`) with no deviation from the specified interface

## Deviations from Plan

### Auto-fixed Issues

None — no code deviations. Plan executed exactly as written for the implementation (Task 1).

### Verification Note (not a code deviation)

Task 2's automated verify script (`node -e "..."`) asserts `styles.attractionGrid` should appear **2** times in the file after the change ("the style definition and the skeleton branch's usage"). Running it produced 1 match, not 2, because the plan's own comment mis-describes the script's regex: `/styles\.attractionGrid/g` only matches usages of the form `styles.attractionGrid` (JSX `style={styles.attractionGrid}`), not the `StyleSheet.create` key definition itself, which is written as `attractionGrid: {` (no `styles.` prefix). Before this change there were genuinely 2 usages (skeleton branch + the old data-branch `.map()` block); after removing the data branch's usage, only the skeleton branch's usage remains, so the correct count is 1, not 2.

This is a bug in the plan's verification script's expectation, not in the implementation. Manually re-verified against the plan's actual `<done>` criteria for Task 2:
- Exactly 2 `<FlatList` usages in the file (Upcoming Events + NEAR YOU) — confirmed.
- Zero remaining `filteredAttractions.map` — confirmed.
- `styles.attractionGrid` style definition still exists and is still referenced by the skeleton branch only (1 usage, as expected once the data branch stopped using it) — confirmed.
- Full read-through of lines 596-640 confirms `SectionHeader`, skeleton branch, and empty-state branch are visually identical to the original, and `CARD_W`, `bookmarks`, `handleBookmark` are correctly threaded into the new FlatList's `renderItem`.

No code change was made in response to this — the implementation is correct per the plan's stated intent; only the plan's own hardcoded verify-script number was inaccurate.

---

**Total deviations:** 0 code deviations (1 verification-script discrepancy, resolved by manual re-verification against the plan's true intent, no code changed).
**Impact on plan:** None. Implementation matches plan objective and all interface requirements exactly.

## Issues Encountered

`npm run typecheck` in `mobile/` fails with 4 pre-existing errors unrelated to this change: `@sentry/react-native` (in `app/_layout.tsx`) and `@react-native-community/datetimepicker` (in `components/stays/*BookingSheet.tsx`, `components/tours/TourBookingSheet.tsx`) modules are not present in this worktree's `node_modules`. These are out-of-scope pre-existing dependency-installation gaps in the worktree, not caused by this task's edit — `app/(tabs)/index.tsx` produces zero typecheck errors of its own. Logged to `deferred-items.md` in the phase directory per scope-boundary rule; not fixed as part of this quick task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Change is self-contained to `mobile/app/(tabs)/index.tsx`. Recommended manual smoke test before merge (per plan's verification section, not part of the automated gate): run the Expo app, open the Discover tab, confirm the NEAR YOU grid still shows a 2-column layout with correct spacing, skeleton shimmer while loading, and the empty state on a no-match search.

---
*Phase: quick*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: mobile/app/(tabs)/index.tsx
- FOUND: .planning/quick/260723-fnm-virtualize-the-discover-tab-attractions-/260723-fnm-SUMMARY.md
- FOUND: commit c22b8c3
