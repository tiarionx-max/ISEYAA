---
phase: 08-mobile-redesign
plan: 05
subsystem: mobile
tags: [mobile, react-native, expo, stays, marketplace, events, cart]
requires: [08-01, 08-02, 08-04, 08-04b]
provides:
  - "Book hub 4-pane switcher (Events / Stays / Studio / Marketplace)"
  - "EventsSubsection component (migrated EventsFeed + QR scan-in FAB)"
  - "Stays browse — 10 categories + 2-col photo-first grid"
  - "Marketplace browse — 8 categories + 2-col product grid + cart trigger"
affects:
  - "mobile/app/(tabs)/book.tsx (full rewrite)"
  - "mobile/components/book/EventsSubsection.tsx (NEW)"
tech_stack:
  added: []
  patterns:
    - "expo-image for all photo loads (CONTEXT cross-cutting)"
    - "PressableScale wraps every card press"
    - "FlatList numColumns=2 + columnWrapperStyle for 2-col grids"
    - "useCartStore subscription drives header badge re-render"
    - "Dynamic require('expo-haptics') pattern mirrors profile.tsx / PressableScale"
key_files:
  created:
    - "mobile/components/book/EventsSubsection.tsx (382 LOC)"
  modified:
    - "mobile/app/(tabs)/book.tsx (1077 LOC, full rewrite)"
    - ".planning/phases/08-mobile-redesign/deferred-items.md (env issue logged)"
decisions:
  - "Default active section = 'stays' (showcase redesign this phase)"
  - "Studio sub-section inlined in book.tsx (not extracted) — legacy FeedCard look preserved verbatim"
  - "Wishlist state held in local React state (persistence deferred per CONTEXT)"
  - "Discount badge GREEN-LIT (Task 0 confirmed Product.compareAtPrice at schema.prisma:450)"
metrics:
  duration_minutes: 35
  tasks_completed: 3
  files_created: 1
  files_modified: 2
completed: 2026-06-12
---

# Phase 8 Plan 08-05: Book Hub 4-Pane (Events + Stays + Studio + Marketplace) Summary

Rewrote `mobile/app/(tabs)/book.tsx` as a four-pane Book hub with locked CONTEXT sub-sections (Events / Stays / Studio / Marketplace), migrated the legacy EventsFeed + QR scan-in FAB into a new self-contained `EventsSubsection` component, and built fresh Airbnb-style Stays browse + Temu-style Marketplace browse experiences with a cart-aware header.

## Task 0 — Schema Audit Result

**`Product.compareAtPrice` is PRESENT** at `backend/prisma/schema.prisma:450`:

```prisma
compareAtPrice  Decimal?  // "was ₦X" — for sale strikethrough
```

→ **Discount badge sub-task GREEN-LIT.** Implemented in `ProductCard` as a red pill (`-{pct}%`) shown only when `compareAtPrice > price`.

## Four Sub-Sections Wired

| Sub-section | Status | Implementation |
| --- | --- | --- |
| **Events** | Migrated | Renders `<EventsSubsection />`. Self-contained — owns its own `useQuery({ queryKey: ['events'], queryFn: () => fetcher('/events?limit=10') })` and absolute-positioned QR scan-in FAB at `bottom: 24, right: 24` routing to `/qr-checkin`. Preserves the legacy FeedCard look + skeleton shimmer. |
| **Stays** | NEW | 10-category `CategoryStrip` from `STAY_CATEGORIES`. `useQuery({ queryKey: ['stays-browse', activeId], queryFn: () => fetcher('/properties?' + buildStayQuery(cat)) })` with 30s staleTime. 2-col FlatList grid, `expo-image` covers with `CARD_COLORS` LinearGradient fallback, price `Chip` overlay (bottom-left), type badge (top-left), rating star (top-right). |
| **Studio** | Legacy preserved | Inlined `StudioSection` component renders single-column FeedCards with the existing `/studio/feed?limit=10` query, same press-to-ai-chat behavior. Per CONTEXT §Navigation Architecture decision: redesign deferred. |
| **Marketplace** | NEW | 8-category `CategoryStrip` from `MARKETPLACE_CATEGORIES`. `useQuery({ queryKey: ['products-browse', activeId], queryFn: () => fetcher('/products?' + buildMarketplaceQuery(cat)) })` with 30s staleTime. 2-col grid with square `aspectRatio: 1` thumbnails via `expo-image`, discount pill (gated), wishlist heart (local state), and Add button at `minHeight: 44` calling `useCartStore.getState().addItem(MinimalProduct, 1)` + dynamic `Haptics.impactAsync`. |

## EventsSubsection Component Summary

`mobile/components/book/EventsSubsection.tsx` — 382 LOC, no props, default export not used (named export only). Internal structure:

- `useShimmerOpacity()` skeleton hook (migrated verbatim from legacy `book.tsx:62-75`).
- `SkeletonCard` rendered ×2 during `isLoading`.
- `EventCard` consumes `EventItem` (id, title, ticketPrice, startDate, venue, lga, averageRating) — mirrors the legacy FeedCard JSX with `tag="Event"`.
- `useQuery({ queryKey: ['events'], queryFn: () => fetcher('/events?limit=10') })` — same query key as legacy so the React Query cache is reused.
- QR scan-in FAB: `<PressableScale>` wrapping a `<View>` with `QrCode` lucide icon + "Scan ticket" text. Absolute-positioned. Sourced from `08-04-SUMMARY.md §QR-FAB JSX Preserved` (the deleted `events.tsx:55-62` block).

## Header — Cart Bag

```tsx
const count = useCartStore((s) => s.items.reduce((a, i) => a + i.quantity, 0));
<Pressable onPress={() => useCartDrawerStore.getState().openDrawer()} ...>
  <ShoppingBag size={20} color={INK} />
  {count > 0 ? <View style={styles.bagBadge}><Text>{count > 99 ? '99+' : count}</Text></View> : null}
</Pressable>
```

Subscribing to the items array (not `getState().totalCount()`) is intentional — `useCartStore.getState()` reads are non-reactive and would not re-render the badge after `addItem`. The selector totals `quantity` inline so the result is equivalent to `totalCount()`.

## `formatPrice` Helper Signature

Mirrored from `web/src/app/stays/page.tsx::formatPrice`:

```ts
function formatPrice(p: Property): { primary: string; suffix: string };
```

Switches on `bookingMode` ∈ `{HOURLY, MEMBERSHIP, TIMED_EVENT, NIGHTLY}`. Uses `Number(n ?? 0).toLocaleString()` for locale formatting. Returns `{primary, suffix}` — primary shown in the price Chip overlay, suffix shown beneath the title in the card body.

## Deviations from Plan

### Auto-Fixed

**1. [Rule 1 — Bug] CartBag badge subscription pattern**
- The plan suggested `useCartStore.getState().totalCount()` for the header badge. `getState()` is a non-reactive read inside a functional component — the badge would not update when items are added.
- **Fix:** Use the reactive selector form `useCartStore((s) => s.items.reduce((a, i) => a + i.quantity, 0))`. Logically identical to `totalCount()` (which iterates the same `items` array) but properly subscribes to re-renders.
- **Tap handler unchanged:** `useCartDrawerStore.getState().openDrawer()` is still imperative — a `getState()` call is correct in an event handler since no subscription is needed.
- **File:** `mobile/app/(tabs)/book.tsx`, `CartBag` component.

### None Otherwise

Plan executed as written — 4 sub-sections wired, both new browse experiences shipping, Studio preserved, Add button at 44pt, all photo loads on `expo-image`, all colors from tokens (sole inline hex: `DISCOUNT_RED = '#EF4444'` explicitly allowed by the plan).

## Wishlist Persistence — Deferred

Wishlist IDs are stored in component-local `useState<Set<string>>` only. Per CONTEXT, server-side persistence (a `Wishlist` table + `/users/me/wishlist` endpoint) is a future-phase concern. The current behavior: hearts reset on tab unmount/remount, which matches the deliberate trade-off.

## Verification

| Check | Result |
| --- | --- |
| `compareAtPrice` audit | PRESENT (line 450) |
| EventsSubsection import wired in book.tsx | YES |
| 4 sub-section literals (`events|stays|studio|marketplace`) | 10 occurrences |
| `minHeight: 44` count in book.tsx | 3 (bagBtn / switcherItem wrapper / addBtn) |
| `STAY_CATEGORIES`, `MARKETPLACE_CATEGORIES`, `/properties`, `/products`, `useCartStore`, `CategoryStrip`, `expo-image`, `EventsSubsection`, `openDrawer`, `totalCount` literal tokens present | YES |
| `useCartDrawerStore.getState().open()` (wrong method) absent | YES |
| `npx tsc --noEmit` (mobile) | 2 errors — both env-related (missing `node_modules`): pre-existing Sentry baseline + new `expo-image` (same root cause, logged to `deferred-items.md`). Zero new project-code errors. |

## Deferred Items

- `mobile/app/(tabs)/book.tsx(32,36): error TS2307: Cannot find module 'expo-image'` — Same root cause as the existing Sentry deferred item: the worktree has no installed `node_modules`. `expo-image` is in `mobile/package.json` (~1.13.0) and required by the plan. Will resolve on `npm install`. Logged in `.planning/phases/08-mobile-redesign/deferred-items.md`.

## Commits

| Hash | Message |
| --- | --- |
| `6295823` | feat(08-05): create EventsSubsection with migrated EventsFeed + QR scan-in FAB |
| `4ec2b06` | feat(08-05): rewrite Book hub with 4-pane switcher + Stays/Marketplace browse + cart header |
| `757b979` | docs(08-05): log expo-image typecheck error as deferred env issue |

## Self-Check: PASSED

- File `mobile/components/book/EventsSubsection.tsx` FOUND (382 LOC).
- File `mobile/app/(tabs)/book.tsx` FOUND (1077 LOC).
- Commit `6295823` FOUND in git log.
- Commit `4ec2b06` FOUND in git log.
- Commit `757b979` FOUND in git log.
