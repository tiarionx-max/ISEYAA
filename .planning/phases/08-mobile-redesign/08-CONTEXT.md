# Phase 8: Mobile Redesign - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Source:** Synthesized from handoff document + existing `.planning/mobile-redesign-UI-SPEC.md` (2026-05-21) + current web reference implementations

<domain>
## Phase Boundary

Bring the Expo SDK 51 mobile app in line with the redesigned web experience that landed in commits `475f88d` (Airbnb stays), `9634559` (Temu marketplace + billboard + news ticker), and `8933d26` (R2/S3 + avatar endpoint). Mobile is currently on the pre-redesign UI; the most recent EAS preview APK predates the web redesign.

In scope:
- Finish the 5-tab navigation migration from the May-21 UI spec (Discover/Book/Wallet/Concierge/You). Old tabs (events, stays, studio, transport, delivery, driver, rider) must be removed from `mobile/app/(tabs)/` and either migrated into Book/Concierge sub-sections or pushed to modal/stack routes.
- Airbnb-style stays browse with 10 category tabs (All / Stays / Lounges / Clubs / Beach / Tours / Experiences / Memberships / Attractions / Featured).
- Stay detail with 4-image gallery, highlights, amenity chips, and a sticky booking sheet whose UI switches on `property.bookingMode` (NIGHTLY / HOURLY / TIMED_EVENT / MEMBERSHIP).
- Temu-style marketplace with 8 category tabs (fashion / crafts / food / art / tech / agriculture + featured + all), product detail, cart drawer (zustand + AsyncStorage persistence as `iseyaa-cart-v1`), and checkout that hands off to Paystack.
- News ticker component on Discover sourced from `GET /api/v1/news`.
- Host onboarding screen reachable from the You tab — matches `web/src/app/host/page.tsx` and fires `POST /api/v1/users/me/become-host`.
- Fresh Android EAS preview build at the end.

Out of scope:
- Any backend changes — all endpoints already exist.
- Web app changes.
- Vendor onboarding screen (mentioned in handoff §8.2 but tracked as a separate follow-up phase).
- Listing creation forms (handoff §8.2), real maps (§8.3), reviews (§8.4), messaging (§8.5), search wire-up (§8.6) — these are explicitly deferred and live as separate roadmap items.

</domain>

<decisions>
## Implementation Decisions

### Navigation Architecture (LOCKED — from UI spec)
- 5-tab layout: `index` (Discover), `book` (Hub), `wallet`, `concierge`, `profile` (You).
- Tabs route file: `mobile/app/(tabs)/_layout.tsx` — keep as the registration point.
- Removed tabs migrate as follows:
  - `events.tsx` → Book hub → Events sub-section
  - `stays.tsx` → Book hub → Stays sub-section
  - `studio.tsx` → Book hub → Studio sub-section
  - `transport.tsx` → Concierge tab → Transport entry point (existing `transport-flow.tsx` modal stays)
  - `delivery.tsx` → Concierge tab → Delivery entry point (existing `delivery-flow.tsx` modal stays)
  - `driver.tsx` → You tab → Driver Mode card → `driver-dashboard.tsx` full-screen modal
  - `rider.tsx` → You tab → Rider Mode card → `rider-dashboard.tsx` full-screen modal
- Modal/stack routes already exist for: `qr-checkin`, `kyc`, `events/[id]`, `stays/[id]`, `driver-dashboard`, `rider-dashboard`, `transport-flow`, `delivery-flow`, `ai-chat`, `notifications`, `topup`. Keep them — do not duplicate.

### Design Tokens (LOCKED — from UI spec §Design Tokens)
- Single source of truth: `mobile/lib/tokens.ts`. Create if absent; import everywhere.
- No inline hex strings in component files after the redesign lands.
- Palette: surface-deep `#050E0E`, surface-mid `#0D1F1F`, surface-raised `#162B2B`, surface-high `#1E3535`, forest `#1A6B3C`, gold `#D4A843`, cream `#F5EDD6`, ink `#FFFFFF` + opacity tiers.
- Type scale: exactly 4 sizes × 2 weights — Display 36/700, Heading 22/700, Body 14/400, Caption 12/400 (with 14/700 Body emphasis variant).
- Spacing: 4px base — {4,8,12,16,20,24,32,48,64}.
- 60/30/10 split: surface-mid dominant, surface-raised secondary, gold accent 10% only on active tab indicator, primary CTAs, focus rings, price/balance display, active filter chips.

### Stays (Airbnb-style)
- Categories source: hardcoded list in `mobile/app/(tabs)/book.tsx` Stays sub-section, mirroring `web/src/app/stays/page.tsx`. Order: All, Stays, Lounges, Clubs, Beach, Tours, Experiences, Memberships, Attractions, Featured.
- Category → API filter map: most categories filter by `propertyType` (HOTEL/GUESTHOUSE/APARTMENT/VILLA/RESORT → "Stays"; LOUNGE → Lounges; CLUB → Clubs; BEACH → Beach; TOUR → Tours; EXPERIENCE → Experiences; ATTRACTION → Attractions). Memberships filters by `bookingMode=MEMBERSHIP`. Featured filters by `isFeatured=true`. All shows everything.
- Grid: photo-first 2-column (matching UI spec §Cards — Attraction Grid Card, but with real `coverImageUrl` instead of CARD_COLORS gradient).
- Search pill: UI only for this phase, no backend wire-up.

### Stay Detail
- Reuse existing `mobile/app/stays/[id].tsx` route — confirmed present.
- 4-image gallery: horizontal FlatList with paging; falls back to `coverImageUrl` repeated if fewer images.
- Highlights: render `property.highlights[]` as a vertical list with `CheckCircle2` lucide icons.
- Amenity chips: render `property.amenities[]` as wrapped pills using the UI spec Chip token.
- Booking sheet (sticky at bottom): switch on `property.bookingMode`:
  - `NIGHTLY` — date range picker (check-in / check-out) + guest count + total = nights × `pricePerNight`.
  - `HOURLY` — date + start time + duration in hours + total = hours × `pricePerHour`.
  - `TIMED_EVENT` — date + time slot picker + total = `pricePerHour` × selected slot length (or flat `pricePerNight` if no slot data).
  - `MEMBERSHIP` — duration selector (1mo / 3mo / 6mo / 12mo) + total = months × `membershipMonthlyPrice` + benefits list display.
- Confirm → POST `/api/v1/stays/bookings` (existing endpoint) → Paystack handoff (existing in-app browser flow via `expo-web-browser`).

### Marketplace (Temu-style)
- Categories: All / Fashion / Crafts / Food / Art / Tech / Agriculture / Featured (8 tabs).
- Category → API filter: `?category=<name>` on `GET /api/v1/products`. Featured filters by `isFeatured=true`.
- Grid: 2-column, square thumbs, discount badge (compare-at vs current price), wishlist heart toggle.
- Product detail: gallery + qty stepper + Add to Cart + Buy Now + tabbed description/shipping/reviews.
- Cart: zustand store `mobile/lib/cart-store.ts` persisted to AsyncStorage as `iseyaa-cart-v1`. Mirror web's `useCartDrawerStore` shape so the data model stays consistent.
- Cart drawer: right-slide modal (`presentation: 'transparentModal'` with reanimated slide). Trigger: bag icon in the Book hub header with item count badge.
- Checkout screen: order summary + delivery address form + Paystack handoff. Existing endpoint `POST /api/v1/cart/checkout` is the contract.

### News Ticker
- Component: `mobile/components/NewsTicker.tsx`.
- Animation: `Animated.loop(Animated.timing(translateX, { toValue: -contentWidth, duration: 60000, easing: Easing.linear, useNativeDriver: true }))`. No `react-native-marquee` dep — keep bundle lean.
- LIVE pulse dot: small red circle with pulsing opacity animation in the corner, matching web `NewsTicker`.
- Data source: `GET /api/v1/news?limit=20` via `useQuery` (TanStack Query is already wired in `mobile/app/_layout.tsx`).
- Position: top of Discover scroll, below safe area, above the hero greeting.

### Host Onboarding
- Route: new file `mobile/app/host.tsx` (modal stack screen — not a tab).
- Trigger: "Become a host" card in You tab (`(tabs)/profile.tsx`). If `user.isHost === true` already, hide the card.
- Hero: gold gradient + cream display heading, matching web `/host`.
- 3 benefit cards: vertical scroll, each with lucide icon + heading + body.
- Q&A section: collapsible accordion (3-4 questions, content from web `/host`).
- Confirm CTA: gold primary button → `POST /api/v1/users/me/become-host` → on success, refetch `/users/me` and navigate to `(tabs)/profile.tsx` with a toast.

### EAS Preview Build
- Command: `cd mobile && eas build --platform android --profile preview --non-interactive`.
- Pre-flight: `mobile/eas.json` already has `preview` profile (confirm from Phase 7 plan 07-01).
- Profile config check: bundle ID `ng.gov.ogun.iseyaa`, `versionCode` bumped by +1 from last build.
- On success: capture the install URL in `08-VERIFICATION.md`.

### Claude's Discretion
- Component-level file organization within `mobile/components/` — group by domain (stays/, marketplace/, host/, common/) or flat. Planner picks.
- Whether to introduce a `mobile/lib/category-config.ts` for the 10-stay-category + 8-marketplace-category lists or hardcode in screens. Planner picks (preference: shared config since both UI surfaces need the data and tests need it too).
- Whether to extract the booking-sheet variants into 4 separate components or one with internal switching. Planner picks (preference: 4 components — better testability).
- Animation specifics for press states (scale 0.97 spring is locked from spec; exact stiffness/damping picker's call).
- Whether to bump `versionCode` automatically via an EAS hook or manually in `app.json`. Planner picks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Contract
- `.planning/mobile-redesign-UI-SPEC.md` — 5-tab nav, tokens, type scale, component contracts (cards, buttons, inputs, skeletons, tab bar). Treat as authoritative for everything except the Book hub category model (which expands per current web) and the Discover news ticker (which is new).

### Web Reference Implementations (translate, don't ape)
- `web/src/app/stays/page.tsx` — Airbnb-style category tabs + grid + search pill (437 lines).
- `web/src/app/stays/[id]/page.tsx` — 4-image gallery + highlights + amenity chips + mode-aware sticky booking sidebar (769 lines).
- `web/src/app/marketplace/page.tsx` — 8 category tabs + product grid + sticky vendor signup sidebar (643 lines).
- `web/src/app/host/page.tsx` — Host hero + benefits + Q&A + CTA (299 lines).
- `web/src/components/landing/NewsTicker.tsx` — News ticker shape + LIVE pulse.
- `web/src/components/landing/Billboard.tsx` — Hero rotation; Discover may borrow the rotation pattern but is not required to.
- `web/src/stores/cart-drawer-store.ts` (or wherever `useCartDrawerStore` lives) — cart data shape to mirror in mobile.

### Backend Contracts (do not modify)
- `backend/src/modules/stays/stays.controller.ts` — property + booking endpoints.
- `backend/src/modules/marketplace/marketplace.controller.ts` — product + cart + checkout.
- `backend/src/modules/users/users.controller.ts` — `POST /me/become-host`, `POST /me/avatar`.
- `backend/src/modules/news/news.controller.ts` — `GET /news?limit=20`.

### Mobile Baselines
- `mobile/app/(tabs)/_layout.tsx` — tab registration (165 lines).
- `mobile/app/(tabs)/book.tsx` — already exists (722 lines) — confirm/extend rather than recreate.
- `mobile/app/(tabs)/index.tsx` — Discover (1101 lines) — large, needs slimming during ticker insert.
- `mobile/app/stays/[id].tsx` — stay detail (existing, redesign target).
- `mobile/app/_layout.tsx` — root stack + providers.

### Stack Conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — project constraints, naming, error handling.

</canonical_refs>

<specifics>
## Specific Ideas

- Reuse `expo-image` everywhere — it's already a dep and gives free disk caching.
- Reuse `expo-linear-gradient` for the host hero, cart drawer backdrop, and stay-card photo overlay.
- For the cart drawer, present as `presentation: 'transparentModal'` route under `mobile/app/cart.tsx` rather than a custom in-tree overlay — expo-router handles the back gesture for free.
- Persist cart to AsyncStorage as `iseyaa-cart-v1` exactly to match web's key, in case we ever cross-device the cart in a later phase.
- For category strips, use a horizontal FlatList with `pagingEnabled={false}` and `showsHorizontalScrollIndicator={false}`. Active chip uses gold-dim bg + gold border per UI spec.
- For the news ticker, render the same text twice in a row inside the animated container — when translateX hits -contentWidth, instantly reset to 0 for a seamless loop. Use `useNativeDriver: true`.
- Bookings sheet for `MEMBERSHIP` should pre-fill the duration selector with "1 month" and render `membershipBenefits[]` as a bullet list — matches the web sidebar.

</specifics>

<deferred>
## Deferred Ideas

These were in the handoff doc but explicitly tracked as separate items, not this phase:

- §8.2 Listing creation forms (host /listings/new, vendor /products/new) and host/vendor dashboards.
- §8.3 Real Google Maps on stay detail (placeholder remains for this phase).
- §8.4 Reviews/ratings flow — schema, API, submission UI.
- §8.5 Real-time messaging — conversations, threads, WebSocket gateway.
- §8.6 Search backend (Typesense bootstrap + wire-up to search pills).
- iOS EAS preview build (Android-only this phase per handoff §8.1; iOS deferred to Phase 7 launch prep).
- Updating the May-21 UI spec doc itself with the new sections (host, ticker, expanded categories). Spec will be updated *after* implementation lands and the visual delta is settled, not before.

</deferred>

---

*Phase: 08-mobile-redesign*
*Context gathered: 2026-06-09*
