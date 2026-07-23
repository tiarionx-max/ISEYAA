---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/(tabs)/index.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "The NEAR YOU attractions grid renders through a FlatList, not a synchronous View+.map() over up to 50 items"
    - "Off-screen/unrendered attraction cards do not all mount their entrance/pulse animations on first paint of the Discover tab"
    - "The attraction grid still visually reads as a 2-column grid with the same card width, spacing, and card content as before"
    - "Skeleton loading state and empty state for the NEAR YOU section render exactly as before (unchanged JSX/styles)"
    - "The Discover screen's outer ScrollView remains the single scroll container -- no RN nested VirtualizedList-in-ScrollView warning"
    - "The horizontal Upcoming Events FlatList and every other section of the screen is untouched"
  artifacts:
    - path: "mobile/app/(tabs)/index.tsx"
      provides: "FlatList-based virtualized attraction grid replacing the plain View+.map() grid, nested safely inside the outer page ScrollView via scrollEnabled={false}"
  key_links:
    - from: "mobile/app/(tabs)/index.tsx (NEAR YOU section data branch)"
      to: "AttractionCard renderItem"
      via: "FlatList numColumns={2} renderItem"
      pattern: "numColumns={2}"
    - from: "mobile/app/(tabs)/index.tsx (attraction FlatList)"
      to: "outer page ScrollView"
      via: "scrollEnabled={false} so the FlatList never claims its own scroll axis"
      pattern: "scrollEnabled={false}"
---

<objective>
Convert the "NEAR YOU" attractions grid on the Discover tab (`mobile/app/(tabs)/index.tsx`) from a plain `View` + `.map()` render (which mounts all up to 50 `AttractionCard` instances simultaneously, each running an entrance/press animation) into a virtualized `FlatList` with `numColumns={2}` and `scrollEnabled={false}`, nested safely inside the screen's existing outer `ScrollView`.

Purpose: Fix a performance issue where the Discover tab mounts up to 50 animated cards in a single synchronous render pass. Virtualizing via FlatList batches initial rendering (`initialNumToRender`/`maxToRenderPerBatch`) instead of mounting everything at once, matching the pattern already used correctly by the "Upcoming Events" horizontal FlatList just above it in the same file.

Output: Updated `mobile/app/(tabs)/index.tsx` where the NEAR YOU attraction data branch renders via `FlatList`, with identical visual output (card width, 2-column layout, gaps, skeleton state, empty state) to the current `View`+`.map()` implementation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

<interfaces>
<!-- Current relevant code in mobile/app/(tabs)/index.tsx -->

Imports already include FlatList (line 8), so no new import is required:
```
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList, Animated, Pressable, useWindowDimensions } from 'react-native';
```

`AttractionCard` component signature (line ~275-334, unchanged, do not modify):
```typescript
function AttractionCard({
  item, index, cardWidth, isBookmarked, onBookmark,
}: {
  item: any; index: number; cardWidth: number;
  isBookmarked: boolean; onBookmark: (id: string) => void;
}): JSX.Element
```

Screen state feeding the grid (line ~401-460, unchanged):
```typescript
const { width: screenWidth } = useWindowDimensions();
const CARD_W = (screenWidth - 48) / 2;
const [bookmarks, setBookmarks] = useState<string[]>([]);
const [attractions, setAttractions] = useState<any[]>([]);
// ...
const filteredAttractions = attractions.filter(
  (a) => !search || a.name.toLowerCase().includes(search.toLowerCase())
);
const showAttractionSkeleton = attractionsFetching && attractions.length === 0;
async function handleBookmark(id: string) { /* toggles bookmarks state */ }
```

Current NEAR YOU render block to replace (line ~598-633) -- exact structure:
```tsx
<View style={[styles.section, styles.sectionLast]}>
  <SectionHeader kicker="NEAR YOU" title="Within 5 km" linkLabel="Map" onLink={() => {}} />
  {showAttractionSkeleton ? (
    <View style={styles.attractionGrid}>
      <SkeletonCard width={CARD_W} height={200} />
      <SkeletonCard width={CARD_W} height={200} />
      <SkeletonCard width={CARD_W} height={200} />
      <SkeletonCard width={CARD_W} height={200} />
    </View>
  ) : filteredAttractions.length === 0 ? (
    <View style={styles.empty}>
      <MapPin size={36} color={INK_FAINT} />
      <Text style={styles.emptyTitle}>Nothing nearby yet</Text>
      <Text style={styles.emptyBody}>Try a different area or check back later.</Text>
    </View>
  ) : (
    <View style={styles.attractionGrid}>
      {filteredAttractions.map((item, index) => (
        <AttractionCard
          key={item.id}
          item={item}
          index={index}
          cardWidth={CARD_W}
          isBookmarked={bookmarks.includes(item.id)}
          onBookmark={handleBookmark}
        />
      ))}
    </View>
  )}
</View>
```

Reference pattern already correct in the same file -- Upcoming Events horizontal FlatList (line ~585-594), showing the project's existing FlatList idiom (data/keyExtractor/renderItem):
```tsx
<FlatList
  data={events}
  keyExtractor={(item) => item.id}
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.eventListContent}
  snapToInterval={252}
  decelerationRate="fast"
  renderItem={({ item, index }) => <EventCard item={item} index={index} />}
/>
```

Current `attractionGrid` style (line ~983-988) -- keep this style unchanged, it is still used verbatim for the skeleton-loading branch:
```typescript
attractionGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  paddingHorizontal: SPACE_4,
  gap: SPACE_3,
},
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Virtualize the NEAR YOU attractions grid with FlatList</name>
  <files>mobile/app/(tabs)/index.tsx</files>
  <action>
Replace only the data-rendering branch of the NEAR YOU section (the final `else` branch at line ~619-631 that currently wraps `filteredAttractions.map(...)` in a `View style={styles.attractionGrid}`) with a `FlatList`. Leave the skeleton branch (`showAttractionSkeleton ? ...`) and the empty-state branch (`filteredAttractions.length === 0 ? ...`) completely untouched -- do not touch their JSX or styles.

The new FlatList must have:
- `data={filteredAttractions}`
- `keyExtractor={(item) => item.id}`
- `numColumns={2}` (preserves the 2-column grid look)
- `scrollEnabled={false}` (this is mandatory -- it stops the FlatList from claiming the vertical scroll axis, so the existing outer page `ScrollView` remains the sole scroll container and no nested-VirtualizedList-in-ScrollView conflict/warning occurs)
- `columnWrapperStyle={styles.attractionRow}` (new style, see below) to reproduce the original row's horizontal `paddingHorizontal: SPACE_4` and `gap: SPACE_3` that `styles.attractionGrid` provided
- `ItemSeparatorComponent={() => <View style={{ height: SPACE_3 }} />}` to reproduce the original's vertical `gap: SPACE_3` between rows without adding a trailing margin after the last row
- `renderItem={({ item, index }) => <AttractionCard item={item} index={index} cardWidth={CARD_W} isBookmarked={bookmarks.includes(item.id)} onBookmark={handleBookmark} />}` (identical props to the current `.map()` call, minus the `key` prop which `keyExtractor` now supplies)
- Perf tuning props appropriate for a nested non-scrolling grid: `initialNumToRender={6}` and `maxToRenderPerBatch={6}` (staggers the initial mount into small batches instead of one synchronous 50-item pass; matches the fix's intent even though the list's own scroll axis is disabled)

Add one new style object `attractionRow` next to the existing `attractionGrid` style (do not delete or modify `attractionGrid` -- it is still used by the skeleton branch): `attractionRow: { paddingHorizontal: SPACE_4, gap: SPACE_3 }`.

Do not modify: `AttractionCard`, `SkeletonCard`, `styles.attractionGrid`, `styles.attractionCard`, `CARD_W` computation, the events `FlatList` above it, or any other section of the screen.
  </action>
  <verify>
    <automated>cd mobile && npm run typecheck</automated>
  </verify>
  <done>`npm run typecheck` in `mobile/` passes with no new errors, the NEAR YOU data branch uses `FlatList` with `numColumns={2}` and `scrollEnabled={false}`, and the skeleton/empty branches are byte-for-byte unchanged from before.</done>
</task>

<task type="auto">
  <name>Task 2: Verify no regressions via grep and manual read-through</name>
  <files>mobile/app/(tabs)/index.tsx</files>
  <action>
Run targeted greps to confirm the change landed correctly and nothing else in the file was disturbed:
1. Confirm exactly one new FlatList was added for attractions (the events FlatList must still be the only other one): grep for `<FlatList` should show 2 matches total in the file.
2. Confirm `scrollEnabled={false}` and `numColumns={2}` are both present exactly once (on the new attraction FlatList).
3. Confirm the old `.map(` call over `filteredAttractions` is gone (grep for `filteredAttractions.map` should return zero matches).
4. Confirm `styles.attractionGrid` still exists and is still referenced by the skeleton branch (grep for `styles.attractionGrid` should show 2 matches: the style definition and the skeleton branch's usage -- not 3, since the data branch no longer uses it).
5. Read the full updated NEAR YOU section (lines ~598 to the new FlatList's closing tag) once to eyeball that `SectionHeader`, the skeleton branch, and the empty-state branch are visually identical to the original, and that `CARD_W`, `bookmarks`, `handleBookmark` are still correctly threaded into `AttractionCard`.
No code changes in this task unless the greps reveal a discrepancy introduced in Task 1, in which case fix it here.
  </action>
  <verify>
    <automated>cd mobile && node -e "const fs=require('fs');const s=fs.readFileSync('app/(tabs)/index.tsx','utf8');const flatlists=(s.match(/<FlatList/g)||[]).length;const oldMap=(s.match(/filteredAttractions\.map/g)||[]).length;const gridRefs=(s.match(/styles\.attractionGrid/g)||[]).length;if(flatlists!==2)throw new Error('expected 2 FlatList usages, found '+flatlists);if(oldMap!==0)throw new Error('old filteredAttractions.map still present');if(gridRefs!==2)throw new Error('expected 2 attractionGrid references, found '+gridRefs);console.log('OK')"</automated>
  </verify>
  <done>Grep checks confirm exactly one new FlatList for attractions, the old inline `.map()` is fully removed, `styles.attractionGrid` remains intact for the skeleton branch only, and a manual read-through confirms no unintended changes elsewhere in the file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| N/A | This is a client-side rendering/performance change only. No new trust boundary, no new data input, no new external call. `filteredAttractions` is the same already-fetched/rendered data as before; only the render mechanism changes. |

## STRIDE Threat Register

No new threats introduced. This change touches only React Native render logic (FlatList vs View+map) for data that was already fetched and rendered on-screen before this change; it does not alter data fetching, storage, authentication, or trust boundaries.
</threat_model>

<verification>
1. `cd mobile && npm run typecheck` passes.
2. Grep-based structural check (Task 2 automated verify) passes: exactly 2 `<FlatList` usages in the file, zero remaining `filteredAttractions.map`, exactly 2 `styles.attractionGrid` references.
3. Manual smoke test (recommended before merge, not part of automated gate): run the Expo app, open the Discover tab, confirm the NEAR YOU grid still shows a 2-column layout with correct card spacing, skeleton shimmer while loading, and the empty state when a search yields no matches -- visually identical to before.
</verification>

<success_criteria>
- The NEAR YOU attractions section renders through `FlatList` with `numColumns={2}` and `scrollEnabled={false}`, nested inside the existing outer page `ScrollView` without introducing a nested-scroll conflict.
- Visual layout (card width via `CARD_W`, 2-column grid, gaps, skeleton state, empty state) is unchanged from before this fix.
- No other section of `mobile/app/(tabs)/index.tsx` (hero, quick actions, Upcoming Events) was modified.
- `npm run typecheck` in `mobile/` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260723-fnm-virtualize-the-discover-tab-attractions-/260723-fnm-SUMMARY.md`
</output>
