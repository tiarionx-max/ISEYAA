---
phase: 08-mobile-redesign
plan: 01
subsystem: mobile
tags: [mobile, expo, redesign, cart, tokens, deps]
status: COMPLETE
requires: []
provides:
  - "STAY_CATEGORIES (10)"
  - "MARKETPLACE_CATEGORIES (8)"
  - "buildStayQuery / buildMarketplaceQuery helpers"
  - "useCartStore / useCartDrawerStore (zustand, AsyncStorage-persisted as iseyaa-cart-v1)"
  - "CartItem type"
  - "CARD_GRADIENTS.goldHero 4-stop tuple"
  - "expo-image + expo-web-browser + datetimepicker installed (SDK-51 compatible)"
affects:
  - "All downstream Phase 8 plans (02-10) — every Book hub + checkout surface imports from these primitives"
tech-stack:
  added:
    - "expo-image ~1.13.0"
    - "expo-web-browser ~13.0.3"
    - "@react-native-community/datetimepicker 8.0.1"
  patterns:
    - "zustand persist with createJSONStorage(() => AsyncStorage)"
    - "URLSearchParams-based query builders shared between Stays + Marketplace"
key-files:
  created:
    - "mobile/lib/category-config.ts"
    - "mobile/lib/cart-store.ts"
  modified:
    - "mobile/lib/tokens.ts"
    - "mobile/package.json"
    - "package-lock.json"
decisions:
  - "Used npx expo install — Expo's SDK 51 resolver picked expo-image ~1.13.0 (plan stated ~1.12.x); resolver wins per the plan's own guidance"
  - "Widened CARD_GRADIENTS type from Record<string,[string,string]> to Record<string,string[]> to admit the 4-stop goldHero alongside existing 2-stop tones"
metrics:
  duration: "~3 minutes (4 tasks)"
  completed: "2026-06-12"
  task_count: 4
  file_count: 5
requirements: [MOB-RD-05]
---

# Phase 8 Plan 01: Mobile Redesign — Foundations Summary

Bootstrapped the three new Expo libraries every downstream Phase 8 plan
depends on, and stood up the two shared lib modules — category-config
(single source of truth for 10 stay + 8 marketplace categories) and
cart-store (zustand + AsyncStorage cart mirror of `web/src/lib/cart.ts`).
Also added a 4-stop `CARD_GRADIENTS.goldHero` token tuple so the host
hero in 08-07 doesn't have to inline hex stops.

## Objective Achieved

Yes. All four task `done` criteria satisfied, all four `must_haves.truths`
verified, all three `must_haves.artifacts` produced with the exact exports
listed in the plan, and the `key_link` (cart-store -> AsyncStorage via
`createJSONStorage`) is present.

## Files Changed

| File | Change | Notes |
|------|--------|-------|
| `mobile/package.json` | +3 deps | expo-image ~1.13.0, expo-web-browser ~13.0.3, @react-native-community/datetimepicker 8.0.1 |
| `package-lock.json` | regenerated | Workspaces lockfile updated; datetimepicker hoisted under `mobile/node_modules/` (peer-dep resolution) |
| `mobile/lib/tokens.ts` | +1 key, type widened | Added `CARD_GRADIENTS.goldHero` 4-stop; widened map type from `Record<string,[string,string]>` to `Record<string,string[]>`. All existing 2-stop entries unchanged. |
| `mobile/lib/category-config.ts` | NEW (100 lines) | Exports `STAY_CATEGORIES` (10), `MARKETPLACE_CATEGORIES` (8), `buildStayQuery`, `buildMarketplaceQuery`, `StayCategory`, `MarketplaceCategory`. Lucide icons sourced from `lucide-react-native`. |
| `mobile/lib/cart-store.ts` | NEW (126 lines) | Byte-for-byte mirror of `web/src/lib/cart.ts` with two deltas: drops `'use client';` directive and uses `AsyncStorage` instead of the `localStorage`/SSR-fallback branch. Exports `useCartStore`, `useCartDrawerStore`, `CartItem`. |

## Cart Store Mirror Confirmation

`mobile/lib/cart-store.ts` mirrors `web/src/lib/cart.ts` exactly:

- **`CartItem` shape:** identical 6-field record (productId, name, price,
  imageUrl: string|null, vendorName, quantity) — no `compareAtPrice`,
  `thumbnailUrl`, or `vendorId` invented.
- **`MinimalProduct` input:** identical (id, name, price: number|string,
  imageUrls?, vendor?.businessName fallback to `'Iseyaa Vendor'`).
- **`useCartStore` methods:** `addItem` (Math.max(1, Math.floor(qty))
  normalization + duplicate merge by productId), `removeItem`, `updateQty`
  (deletes if qty<1), `clear`, `totalCount`, `totalPrice` — all logic
  copied byte-for-byte.
- **Persistence:** `name: 'iseyaa-cart-v1'`, `partialize: state => ({ items })`.
- **`useCartDrawerStore` methods:** `openDrawer`, `closeDrawer`,
  `toggleDrawer` — NOT renamed to `open/close/toggle`.

Only platform differences:

1. Dropped the `'use client';` directive (React Native doesn't use it).
2. Replaced the `typeof window !== 'undefined' ? localStorage : SSR-stub`
   branch with `AsyncStorage` from `@react-native-async-storage/async-storage`,
   since RN always has AsyncStorage.

## tokens.ts Diff Summary

One-line conceptual diff: `CARD_GRADIENTS` map type widens from a 2-tuple
to `string[]`, and a sixth key `goldHero: ['#3a2e15', '#6a4a14', '#C8962A', '#4a3208']`
is appended after the existing `indigo` entry. No other token (color, type
scale, spacing, radius, font) touched.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Deps in package.json | `node -e "..."` (per plan) | OK expo-image:~1.13.0 expo-web-browser:~13.0.3 @react-native-community/datetimepicker:8.0.1 |
| Deps on disk | `ls node_modules/<dep>/package.json` | All 3 present (datetimepicker hoisted under `mobile/node_modules/`) |
| tokens.ts has goldHero | `node -e "..."` (per plan) | OK |
| category-config IDs | `node -e "..."` (per plan) | OK 18 ids (10 stay + 8 marketplace) |
| cart-store contract | `node -e "..."` (per plan) | OK (all required tokens present, no forbidden fields) |
| `grep iseyaa-cart-v1` | per plan verification | 2 matches |
| `grep -E 'openDrawer\|closeDrawer\|toggleDrawer'` | per plan verification | 7 matches (>= 3) |
| `grep goldHero` | per plan verification | 2 matches |
| TypeScript strict (`npx tsc --noEmit`) | in `mobile/` workspace | Clean — zero errors |

## Tests Run

- `cd mobile && npx tsc --noEmit` — clean exit, no new errors.
- No mobile Jest tests exist that exercise the new modules (test wiring is
  Phase 8 follow-up work, not in scope for 08-01). Existing tests not
  modified, so no regression possible.
- Did NOT run `eas build` — that is 08-09's scope per the plan pre-flight note.

## Deviations from Plan

### 1. [Rule 3 - Resolver Pin] `expo-image` resolved to `~1.13.0`, not `~1.12.x`

- **Found during:** Task 1 (`npx expo install`).
- **Issue:** Plan stated the expected version is `~1.12.x`. Expo's
  SDK-51 resolver returned `~1.13.0` instead.
- **Action:** Accepted Expo's resolver decision. The plan itself says
  "do NOT use `npm install` directly — Expo's resolver enforces the
  right minor for SDK 51", so the resolver is the source of truth.
  `1.13.x` is the current Expo-blessed minor for SDK 51 in npm.
- **Impact:** None. API surface unchanged; downstream plans import
  `expo-image` by name, not version. Plan's `must_haves.truths` only
  requires importability, not a specific minor.
- **Files modified:** `mobile/package.json`, `package-lock.json`.

### 2. [Info] datetimepicker hoisted into nested `mobile/node_modules/`

- **Found during:** Task 1 verification (`ls` of root `node_modules/`).
- **Issue:** Plan's `done` step expected `node_modules/@react-native-community/datetimepicker/package.json` to exist at root.
- **Action:** Inspected workspace hoisting — npm placed it under
  `mobile/node_modules/@react-native-community/datetimepicker/` due to
  peer-dep resolution against `react-native@0.74.5`. This is normal
  npm-workspaces behavior and TypeScript resolves it correctly (tsc
  passes cleanly).
- **Impact:** None. Module is importable from `mobile/` source. No fix
  required.

## Commits

| Task | Type | Hash | Subject |
|------|------|------|---------|
| 1 | chore | `6869cdf` | chore(08-01): install expo-image, expo-web-browser, datetimepicker (SDK 51) |
| 2 | feat  | `aa15e36` | feat(08-01): add CARD_GRADIENTS.goldHero 4-stop tuple to tokens |
| 3 | feat  | `d28e171` | feat(08-01): add mobile/lib/category-config.ts — STAY + MARKETPLACE source of truth |
| 4 | feat  | `7028319` | feat(08-01): add mobile/lib/cart-store.ts — mirrors web/src/lib/cart.ts (MOB-RD-05) |

## Known Stubs

None. Both new lib modules are fully wired; no placeholder data, no
hardcoded empty arrays flowing to UI. The category configs are static
by design (10 + 8 entries, matching web verbatim), and the cart store
starts at `items: []` because that's the expected empty state — not a
stub.

## Threat Flags

None. Plan 08-01 introduces no new network endpoints, no auth paths, no
new file-access patterns, no schema changes, no trust-boundary crossings.
Cart persistence to AsyncStorage stores non-PII commerce metadata
(productId, name, price, imageUrl, vendorName, quantity) — same surface
web already has in localStorage with the same `iseyaa-cart-v1` key.

## Self-Check: PASSED

- mobile/lib/category-config.ts: FOUND
- mobile/lib/cart-store.ts: FOUND
- mobile/lib/tokens.ts (goldHero present): FOUND
- mobile/package.json (3 deps): FOUND
- Commit 6869cdf: FOUND in git log
- Commit aa15e36: FOUND in git log
- Commit d28e171: FOUND in git log
- Commit 7028319: FOUND in git log
- TypeScript clean: YES

## Status: COMPLETE
