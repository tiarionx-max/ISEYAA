---
phase: quick
plan: 260728-a8e
status: complete
subsystem: mobile
tags: [ui-bug, event-create, property-create, lga-picker]
---

# Summary: Create Event / Edit Event / Create Property now use a real LGA picker

User reported the Create Event screen's submit button stayed disabled even after typing values into every field. Root cause: the "LGA ID" field was a raw free-text input with placeholder "LGA UUID" — a pre-existing, explicitly-flagged gap ("no LGA picker component exists anywhere in mobile yet") that made the field practically impossible for a real organiser to fill correctly, since nobody knows Ogun State LGA UUIDs by heart. The identical pattern existed verbatim in `event-edit/[id].tsx` and `property-create.tsx`.

## Change

All three files now fetch `GET /lgas` (existing 20-record, unauthenticated endpoint) and render a horizontal-scroll row of the app's existing shared `Chip` component in place of the raw text input. Tapping a chip sets `lgaId` to that LGA's real database id — no free text, no UUID to know or guess.

## Verification

`cd mobile && npx tsc --noEmit` — clean across all three files. Manual diff review confirmed each picker only ever sets `lgaId` to an id sourced from `GET /lgas`. Live emulator re-verification not yet done — user will confirm on the next APK install.

## Deviations

Made directly (not the full plan → worktree-executor cycle), consistent with this session's pattern for fixes discovered through live user testing.
