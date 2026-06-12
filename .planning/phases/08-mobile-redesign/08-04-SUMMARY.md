---
phase: 08-mobile-redesign
plan: 04
subsystem: mobile
tags: [mobile, expo-router, tabs, cleanup]
requirements: [MOB-RD-01]
dependency_graph:
  requires: []
  provides:
    - "Clean 5-tab expo-router structure (Discover, Book, Wallet, Concierge, You)"
    - "Legacy tab files removed — no dangling registrations"
  affects:
    - "08-05 (Book hub) — must re-implement events/stays/studio sub-sections"
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - "mobile/app/(tabs)/_layout.tsx (stripped 9 lines: 7 hidden Tabs.Screen + 1 comment + 1 blank)"
  deleted:
    - "mobile/app/(tabs)/events.tsx (206 lines)"
    - "mobile/app/(tabs)/stays.tsx (171 lines)"
    - "mobile/app/(tabs)/studio.tsx (282 lines)"
    - "mobile/app/(tabs)/transport.tsx (673 lines)"
    - "mobile/app/(tabs)/delivery.tsx (764 lines)"
    - "mobile/app/(tabs)/driver.tsx (812 lines)"
    - "mobile/app/(tabs)/rider.tsx (1104 lines)"
decisions:
  - "Pre-deletion audit ran clean — zero router.push/replace calls to bare (tabs)/<legacy> routes anywhere in mobile/app, mobile/components, mobile/lib. No rewrites needed."
  - "All /events/[id] and /stays/[id] navigations (book.tsx, index.tsx, search.tsx) target the detail stack screens at mobile/app/events/[id]/ and mobile/app/stays/[id]/ — unaffected by tab deletion."
  - "Migration destinations verified pre-deletion: transport-flow.tsx, delivery-flow.tsx, driver-dashboard.tsx, rider-dashboard.tsx all present in mobile/app/."
metrics:
  duration_minutes: 7
  completed_date: 2026-06-12
---

# Phase 8 Plan 08-04: Legacy Tab Cleanup Summary

5-tab final structure asserted: `mobile/app/(tabs)/` contains exactly `_layout.tsx`, `index.tsx`, `book.tsx`, `wallet.tsx`, `concierge.tsx`, `profile.tsx`. Seven legacy tab files (events/stays/studio/transport/delivery/driver/rider) deleted; seven hidden `<Tabs.Screen href={null}>` registrations stripped from `_layout.tsx`. Closes MOB-RD-01 SC1.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Cross-reference audit (read-only) | (no commit — zero hits) | mobile/app, mobile/components, mobile/lib |
| 2 | Delete 7 legacy tab files | db289d1 | events/stays/studio/transport/delivery/driver/rider tabs |
| 3 | Strip hidden Tabs.Screen registrations | 2c7215b | mobile/app/(tabs)/_layout.tsx |

## Pre-Deletion Destination Audit

All migration destinations verified present in `mobile/app/`:

| Legacy tab | Destination | Owner | Status |
|------------|-------------|-------|--------|
| `events.tsx` | Book hub Events sub-section | 08-05 (Wave 3) | EventsFeed source already lives in `book.tsx:179-217` — deletion preserves logic |
| `stays.tsx` | Book hub Stays sub-section | 08-05 (Wave 3) | StaysFeed source already lives in `book.tsx:218-240` — deletion preserves logic |
| `studio.tsx` | Book hub Studio sub-section | 08-05 (Wave 3) | Logic re-implemented in 08-05 |
| `transport.tsx` | `transport-flow.tsx` modal + Concierge entry | existing | `mobile/app/transport-flow.tsx` present |
| `delivery.tsx` | `delivery-flow.tsx` modal + Concierge entry | existing | `mobile/app/delivery-flow.tsx` present |
| `driver.tsx` | `driver-dashboard.tsx` modal + You tab card | existing | `mobile/app/driver-dashboard.tsx` present |
| `rider.tsx` | `rider-dashboard.tsx` modal + You tab card | existing | `mobile/app/rider-dashboard.tsx` present |

## Cross-Reference Audit Results

```bash
$ grep -rnE "router\.(push|replace).*\(tabs\)/(events|stays|studio|transport|delivery|driver|rider)" mobile/app mobile/components mobile/lib
  No router push/replace hits

$ grep -rnE "from .*\(tabs\)/(events|stays|studio|transport|delivery|driver|rider)" mobile/app mobile/components mobile/lib
  No relative imports
```

Broader sweep for bare `/events`, `/stays`, etc. navigation targets returned only `/events/[id]` and `/stays/[id]` detail-screen pushes (in `book.tsx`, `index.tsx`, `search.tsx`) — these route to `mobile/app/events/[id]/...` and `mobile/app/stays/[id]/...` stack screens, NOT the deleted tab screens. No rewrites required.

## QR-FAB JSX Preserved (for 08-05 EventsSubsection)

The Scan-In QR FAB lived in the header of the deleted `events.tsx`. Capturing the full block here so 08-05's Book hub events sub-section can re-host it:

```tsx
// Source: mobile/app/(tabs)/events.tsx:55-62 (deleted in 08-04, commit db289d1)
import { QrCode } from 'lucide-react-native';
import { router } from 'expo-router';

<TouchableOpacity
  style={styles.qrButton}
  onPress={() => router.push('/qr-checkin')}
>
  <QrCode size={16} color={GOLD} />
  <Text style={styles.qrButtonText}>Scan In</Text>
</TouchableOpacity>

// Companion styles (events.tsx:125-136):
qrButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: 'rgba(200,150,42,0.12)',
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(200,150,42,0.3)',
},
qrButtonText: { color: GOLD, fontSize: 12, fontWeight: '700' },
```

## Acceptance Verification

```bash
$ ls "mobile/app/(tabs)/"
_layout.tsx
book.tsx
concierge.tsx
index.tsx
profile.tsx
wallet.tsx
# count: 6 (1 layout + 5 tabs) ✓

$ grep -c "Tabs.Screen" "mobile/app/(tabs)/_layout.tsx"
5  ✓

$ grep -c "href: null" "mobile/app/(tabs)/_layout.tsx"
0  ✓

$ cd mobile && npx tsc --noEmit 2>&1 | grep -E "tabs/"
(no errors in (tabs)/ files)  ✓
```

## Must-Haves: Truth Assertions

- [x] `mobile/app/(tabs)/` contains exactly 5 .tsx files: index, book, wallet, concierge, profile (plus _layout.tsx) — confirmed
- [x] `_layout.tsx` registers exactly 5 Tabs.Screen entries — no hidden legacy declarations remain — confirmed
- [x] Functionality previously reached via legacy tabs is still reachable via modal/stack routes (transport-flow, delivery-flow, driver-dashboard, rider-dashboard) or via Book hub (events/stays/studio handled in Wave 3) — confirmed via destination audit

## Deviations from Plan

None — plan executed exactly as written.

The plan anticipated possible cross-reference hits requiring rewrites; the audit returned zero hits, so the `BLOCKERS.md` escape hatch was not invoked.

## Out-of-Scope Discovery (Logged, NOT Fixed)

`cd mobile && npx tsc --noEmit` surfaces one pre-existing error completely unrelated to this plan:

```
app/_layout.tsx(1,25): error TS2307: Cannot find module '@sentry/react-native'
or its corresponding type declarations.
```

- Location: `mobile/app/_layout.tsx` (root layout — NOT in this plan's scope; owned by 08-04b)
- Cause: missing `@sentry/react-native` dependency in `mobile/package.json`
- Verified pre-existing: file last modified by `1f3c3df fix(auth): add phone-auth endpoint…` (before phase 08 started); my plan did not touch this file (`git diff HEAD~2 HEAD -- mobile/app/_layout.tsx` is empty)
- Per executor SCOPE BOUNDARY: out-of-scope errors are NOT auto-fixed in this plan. Flagged here for 08-04b.

## Final Commit Hashes

- `db289d1` — chore(08-04): delete 7 legacy tab files (4,012 deletions)
- `2c7215b` — refactor(08-04): strip 7 hidden Tabs.Screen entries from tabs/_layout.tsx

## Self-Check: PASSED

- [x] `mobile/app/(tabs)/_layout.tsx` exists and contains 5 Tabs.Screen (5 visible entries, 0 hidden)
- [x] 7 legacy tab files removed from disk (`ls mobile/app/(tabs)/*.tsx` returns 6 entries)
- [x] Commit `db289d1` exists in `git log`
- [x] Commit `2c7215b` exists in `git log`
- [x] No `(tabs)/` directory TypeScript errors after edits
