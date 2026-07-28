---
phase: quick
plan: 260728-9ha
status: complete
subsystem: mobile
tags: [ui-bug, book-screen, scrollview]
---

# Summary: Book screen section switcher is now horizontally scrollable

User reported being unable to "slide through" the Events/Stays/Studio/Market/Tours row on the Book screen. Confirmed via direct code read: the switcher was a plain non-scrolling `<View style={{flexDirection:'row'}}>` with 5 chip labels — anything overflowing past the screen edge was completely unreachable, with no scroll affordance at all.

## Change

`mobile/app/(tabs)/book.tsx`: wrapped the switcher in a horizontal `ScrollView` (`showsHorizontalScrollIndicator={false}`). Moved the bottom border from the row content style to the ScrollView container itself, so it still spans the full screen width even when the scrollable content is narrower than the screen (e.g. wide tablets).

## Verification

`cd mobile && npx tsc --noEmit` — clean. Live emulator re-verification was not possible — the Android emulator had disconnected after this session's very long test run. This is a standard, low-risk RN pattern (wrap overflowing row in ScrollView); user will confirm on the next APK install.

## Deviations

Made directly (not the full plan → worktree-executor cycle) given the small, well-understood scope and to get the fix into the next APK build quickly.
