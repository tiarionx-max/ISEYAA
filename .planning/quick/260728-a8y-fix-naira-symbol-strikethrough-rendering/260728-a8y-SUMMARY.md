---
phase: quick
plan: 260728-a8y
status: complete
subsystem: mobile
tags: [ui-bug, font-rendering, currency, android]
---

# Summary: Naira symbol (₦) no longer renders broken on Android

User reported (via screenshot) visually broken ₦ amounts — a strikethrough/overlapping-glyph artifact — on the ride-fare screen and the profile wallet stat. Root cause: both affected styles used `fontFamily: FONT_DISPLAY`/`FONT_MONO`, which resolve to Android's generic `'serif'`/`'monospace'` font aliases (`mobile/lib/tokens.ts`) — aliases that lack a proper U+20A6 glyph. `FONT_UI` (`'sans-serif'` on Android) has correct coverage and is already used app-wide for body text with no complaints.

## Change

Swept all 25 files in `mobile/app/` containing a literal "₦" character. For each, traced every render site to its style, and changed `fontFamily` to `FONT_UI` only where the style both (a) renders the ₦ glyph and (b) used `FONT_DISPLAY`/`FONT_MONO`. 13 files needed a fix (see PLAN.md for the full per-style list); the other 12 either already used `FONT_UI` or had no `fontFamily` override at all. Non-currency headings/labels sharing the same font tokens were left untouched.

## Verification

`cd mobile && npx tsc --noEmit` — clean. Every changed file's diff was manually reviewed against `git diff` to confirm only genuine ₦-rendering styles were touched (e.g. `wallet.tsx`'s `balanceCurrency`/`balanceAmount` were deliberately left alone — they render the literal text "NGN" and a bare number, never the ₦ glyph itself). Live emulator re-verification not yet done — user will confirm on the next APK install.

## Deviations

Made directly (not the full plan → worktree-executor cycle). The mechanical 25-file sweep was delegated to a general-purpose subagent with a narrow, explicit scoping brief; its output was then verified file-by-file via `git diff` before being accepted, consistent with this session's pattern of reviewing subagent work before trusting it.
