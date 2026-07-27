---
phase: quick
plan: 260727-exm
subsystem: mobile
tags: [mobile, ministry, analytics, dashboard, role-guard, revenue, read-only]
requires: []
provides:
  - "mobile/app/ministry-dashboard.tsx — read-only Ministry Dashboard screen (visitor entries, purpose breakdown, revenue, top LGAs)"
  - "profile.tsx conditional 'Ministry Dashboard' reachability entry gated on MINISTRY_VIEWER/STATE_ADMIN/SUPER_ADMIN"
affects:
  - "mobile/app/(tabs)/profile.tsx"
  - "mobile/app/_layout.tsx"
tech-stack:
  added: []
  patterns:
    - "canViewMinistry active-role gate (mirrors RolesGuard's own single-role check, not registeredRoles[]) + router.replace('/(tabs)') redirect with no content flash"
    - "plain View-based bar-list (chartList/chartRow/barTrack/barFill), verbatim from event-analytics/[id].tsx, reused for 4 separate panels on one screen"
    - "client-side aggregation of a flat backend array into per-key totals via Map, reused three times (visitor-entries by LGA, purpose-breakdown by purpose, revenue byModuleLga by LGA)"
    - "zero-extra-fetch derived panel: Top LGAs list computed from the same visitorEntries query result already used by the Visitor Entries panel"
key-files:
  created:
    - "mobile/app/ministry-dashboard.tsx"
  modified:
    - "mobile/app/(tabs)/profile.tsx"
    - "mobile/app/_layout.tsx"
decisions:
  - "Sorted the Visitor Entries panel descending by per-LGA total (not explicitly specified by the plan) for UI readability, matching the Purpose Breakdown panel's explicit descending-sort requirement — not a deviation from any stated plan constraint"
  - "Ran a one-time npm install (root workspace) at the start of execution — mobile/node_modules was completely absent in this worktree, which would have made 'npx tsc --noEmit' either fail entirely or produce false-positive missing-module errors on every date-picker-using file. No tracked file (package.json/package-lock.json) was modified by this install; node_modules is gitignored"
metrics:
  duration: "~20 minutes (including one-time dependency install)"
  completed: "2026-07-27"
---

# Quick Task 260727-exm: Build a read-only ministry analytics dashboard Summary

Built a read-only mobile port of the web ministry analytics dashboard (`web/src/app/admin/ministry/page.tsx`): a role-gated `mobile/app/ministry-dashboard.tsx` screen showing visitor entries (per-LGA tourist/citizen/other breakdown), purpose-of-visit, revenue-to-government (by module/month/LGA), and a "Top LGAs by visitor count" ranked list replacing the web's LGA×Month heatmap — reachable only by `MINISTRY_VIEWER`/`STATE_ADMIN`/`SUPER_ADMIN` via a new conditional Profile menu entry.

## What Was Built

**Task 1 — Role-gated screen shell + filters + visitor-entries + purpose-breakdown panels** (commit `7e23cdd`)

- New `mobile/app/ministry-dashboard.tsx`:
  - `canViewMinistry = ['MINISTRY_VIEWER','STATE_ADMIN','SUPER_ADMIN'].includes(me?.role ?? '')`, derived from `useQuery(['me'], () => fetcher('/users/me'))`. While `meLoading` or `!canViewMinistry`, renders only a centered `ActivityIndicator` — a `useEffect` fires `router.replace('/(tabs)' as any)` for disallowed roles once `me` settles, so a disallowed role never sees real panel content flash, and no "become a ministry viewer" CTA exists anywhere.
  - From/To date filters as two independent `Date` states (`fromDate` default `today-30d`, `toDate` default `today`, mirroring the web's `defaultDateRange()`), each a `Pressable` + conditionally-rendered `@react-native-community/datetimepicker` (`mode="date"`, verbatim pattern from `event-create.tsx`). Query strings (`from`/`to`) are derived inline via `.toISOString().slice(0,10)` at render time, never stored as separate state.
  - LGA filter: `useQuery(['lgas'], () => fetcher('/lgas'))` rendered as a horizontal `ScrollView` of `Chip` components ("All LGAs" + one per LGA). `lgaParam` is appended only to the visitor-entries and purpose-breakdown queries, never to revenue.
  - Visitor Entries panel: the flat `{ lgaId, lgaName, month, userRole, count }[]` response is aggregated client-side (`aggregateVisitorEntriesByLga`) into one row per LGA (fallback `'Unknown'`), summing `count` into `tourist`/`citizen`/`other` buckets, rendered as a bar-list with a caption line (`Tourist N · Citizen N · Other N`) beneath each bar, sorted descending by total.
  - Purpose Breakdown panel: the flat `{ purpose, month, count }[]` response aggregated by `purpose` across all months, sorted descending, rendered as the same bar-list pattern.
  - Both panels handle loading (`ActivityIndicator`) and empty-array states with plain text messages, never an error banner.

**Task 2 — Revenue panel + Top-LGAs list + Profile/route wiring** (commit `a3ea44a`)

- Appended to `mobile/app/ministry-dashboard.tsx`, below Purpose Breakdown, in the same `ScrollView`:
  - Revenue query: `useQuery(['ministry-revenue', from, to], () => fetcher('/ministry/revenue?from=...&to=...'))` — deliberately never appends `lgaParam` since the backend route doesn't accept one. `revenueIsEmpty` mirrors the web's own check for the ministry-wallet-unresolved degradation case (`{byModule:[],byMonth:[],byModuleLga:[]}`), rendering a plain "No revenue data for this period." message, never an error.
  - Three revenue sub-sections, all via `formatCurrency` (duplicated `₦${amount.toLocaleString('en-NG')}` helper, matching `event-analytics/[id].tsx`'s convention): "By module" (sorted descending by total), "By month" (sorted ascending/chronological by month string — the one panel that is NOT sorted by value), "By LGA (stays, marketplace, tours)" (client-aggregated from `byModuleLga` by `lgaName`, sorted descending).
  - "Top LGAs by visitor count" panel: reuses the already-computed `visitorLgaAgg` from Task 1 (zero additional network request), taking the top 10 by total and rendering a ranked bar-list with `#1`/`#2`/... badges.
- `mobile/app/(tabs)/profile.tsx`: added `BarChart3` to the `lucide-react-native` import list; added `canViewMinistry` derivation alongside `alreadyHost`/`alreadyVendor`; inserted `...(canViewMinistry ? [{ icon: BarChart3, label: 'Ministry Dashboard', sub: 'Government analytics', onPress: () => router.push('/ministry-dashboard' as never) }] : [])` into the `menuRows` array literal immediately before the `Change Password` entry, so `Change Password` remains last regardless of whether the conditional entry renders.
- `mobile/app/_layout.tsx`: registered `<Stack.Screen name="ministry-dashboard" options={{ title: 'Ministry Dashboard', presentation: 'card' }} />` as the last `Stack.Screen`, immediately after `saved-places`.

## Verification

- `cd mobile && npx tsc --noEmit` run after each task — both runs produced **zero** errors (a one-time `npm install` at the repo root was required first; see Deviations below).
- Manual read-through confirmed: no "become a ministry viewer"/"request access" CTA of any kind exists in `ministry-dashboard.tsx` (`grep` for `POST|PATCH|DELETE|export|share|expo-file-system|expo-sharing` returns zero matches outside the file's own `export default` statement and a doc-comment).
- Manual read-through confirmed: disallowed roles hit `router.replace('/(tabs)' as any)` inside a `useEffect`, and the component returns only a centered spinner (both while `meLoading` and while `!canViewMinistry`) — no real panel content can render before the redirect fires.
- Manual read-through confirmed: the `GET /ministry/revenue` query string never includes `lgaId` (`lgaParam` is only referenced in the visitor-entries and purpose-breakdown query strings).
- Manual read-through confirmed: the "Top LGAs by visitor count" panel reads from `visitorLgaAgg` (computed in Task 1's render body from the existing `visitorEntries` query) — no new `useQuery` call was added for it.
- Manual read-through confirmed: `profile.tsx`'s new menu entry is array-spread conditionally on `canViewMinistry`, not unconditionally rendered.
- `git diff <base>..HEAD --stat -- backend/` confirmed zero backend files were touched.
- Post-commit deletion check (`git diff --diff-filter=D`) on both task commits: no deletions.

## Deviations from Plan

### Rule 3 (auto-fix blocking issue) — worktree behind expected base commit

At startup, `git merge-base --is-ancestor <EXPECTED_BASE> HEAD` reported MISMATCH. Working tree was clean, so the fix was `git reset --hard <EXPECTED_BASE>`, landing exactly on the plan's pre-dispatch commit. No file changes had been made prior to this correction, and no work was lost.

### Rule 3 (auto-fix blocking issue) — mobile node_modules entirely absent

`mobile/node_modules` (and, in fact, every workspace's `node_modules`, and the root `node_modules`) did not exist in this worktree at all. Running `npx tsc --noEmit` before installing produced 9 `TS2307: Cannot find module` errors across multiple files (`@sentry/react-native` in `_layout.tsx`; `@react-native-community/datetimepicker` in `event-create.tsx`, `driver-application.tsx`, `event-edit/[id].tsx`, three `components/stays/*BookingSheet.tsx` files, `components/tours/TourBookingSheet.tsx`, and my new `ministry-dashboard.tsx`) — none caused by this plan's own code, but making it impossible to get real type-checking signal on the new file. Ran a single `npm install` from the repo root (npm workspaces hoist most packages to the root `node_modules` but nest React Native native-module packages like these two under `mobile/node_modules` — confirmed via `find`). This installed packages only; `package.json`/`package-lock.json` at every level were confirmed byte-identical to the pre-install state via `git diff --stat` (zero changes), and `node_modules/` is gitignored, so nothing was staged or committed for this step. After install, both task verifications produced zero `tsc` errors.

### None affecting behavior — all other plan guidance followed exactly

Every field name, endpoint shape, gating pattern, and simplification called out in the plan's `<verified_facts>` matched the real files inspected this session with no adjustment needed (e.g., the `RevenueData`/`VisitorEntryRow`/`PurposeRow` interfaces, the `lgaParam` exclusion on the revenue query, the `Chip`/`DateTimePicker` component reuse, the exact `profile.tsx`/`_layout.tsx` insertion points).

## Known Stubs

None. All four panels (visitor entries, purpose breakdown, revenue, top LGAs) are fully wired to the real `GET /ministry/visitor-entries`, `GET /ministry/purpose-breakdown`, `GET /ministry/revenue`, and `GET /lgas` endpoints — no placeholder/mock data.

## Commits

- `7e23cdd` — feat(quick-260727-exm): ministry dashboard role gate, filters, visitor-entries + purpose-breakdown panels
- `a3ea44a` — feat(quick-260727-exm): ministry dashboard revenue panel, top-LGAs list, profile/route wiring

## Self-Check: PASSED

- FOUND: mobile/app/ministry-dashboard.tsx (515 lines, exceeds min_lines: 300)
- FOUND: mobile/app/(tabs)/profile.tsx (BarChart3 import, canViewMinistry derivation, conditional menu row before Change Password)
- FOUND: mobile/app/_layout.tsx (ministry-dashboard Stack.Screen registered)
- FOUND: commit 7e23cdd
- FOUND: commit a3ea44a
- CONFIRMED: `cd mobile && npx tsc --noEmit` exits with zero output/errors
- CONFIRMED: zero backend files modified (`git diff 82fc2bd..HEAD --stat -- backend/` is empty)
