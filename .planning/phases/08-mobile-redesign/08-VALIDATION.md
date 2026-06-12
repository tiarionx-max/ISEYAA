# Phase 8 — Mobile Redesign Validation

**Status: Draft — to be filled by 08-10 verifier**
**Phase:** 08-mobile-redesign
**Created:** 2026-06-09 (planner — iteration 2)
**Closes Nyquist gate:** 8e (planning validation)

## Overview

Phase 8 is a mobile-UI phase. Most acceptance is **manual smoke checking on a physical Android device** (the EAS preview APK from 08-09) supplemented by a small amount of **automated checks** (TypeScript compile, existing-test regression, backend/web no-diff). There is no automated UI test rig for the mobile app this phase; visual diffs are confirmed by the human verifier in 08-10.

No automated UI snapshot tests are added this phase (deferred). The validation strategy below is honest about that: criteria 1-7 are sampled by hand, criterion 8 is fully automated.

---

## Acceptance Tests

Each MOB-RD-* success criterion from `ROADMAP.md` Phase 8 maps to one or more acceptance tests. Tick after observation. If not ticked → file under Regressions in `08-VERIFICATION.md`.

### MOB-RD-01 — 5-tab navigation
- [ ] **AT-01.1** `ls "mobile/app/(tabs)/"` returns exactly 6 entries: `_layout.tsx`, `book.tsx`, `concierge.tsx`, `index.tsx`, `profile.tsx`, `wallet.tsx`. _(automated — bash)_
- [ ] **AT-01.2** App's tab bar shows exactly 5 tabs (Discover / Book / Wallet / Concierge / You). _(manual — visual)_
- [ ] **AT-01.3** Transport / Delivery reachable from Concierge tab. Driver / Rider reachable from You tab mode cards. _(manual — interaction)_

### MOB-RD-02 — Discover news ticker
- [ ] **AT-02.1** News ticker visible at top of Discover, scrolling horizontally, LIVE red pulse animating. _(manual — visual)_
- [ ] **AT-02.2** Headlines come from `GET /api/v1/news?limit=20` — confirmed via Network inspector OR backend log. _(manual — instrumented)_
- [ ] **AT-02.3** Tapping a headline with a `link` field opens the OS browser. _(manual — interaction)_
- [ ] **AT-02.4** Hero greeting, search, and curated feed below the ticker render unchanged from before this phase. _(manual — diff against pre-phase screenshot)_

### MOB-RD-03 — Stays category browse
- [ ] **AT-03.1** Book hub shows 4 sub-section tabs: Events, Stays, Studio, Marketplace (H-1 — none dropped). _(manual — visual)_
- [ ] **AT-03.2** Stays sub-section shows exactly 10 category chips in the order: All / Stays / Lounges / Clubs / Beach / Tours / Experiences / Memberships / Attractions / Featured. _(manual — visual)_
- [ ] **AT-03.3** Tapping each chip refetches with the right query string (`types=...`, `bookingMode=MEMBERSHIP`, or `featured=true`). _(manual — backend log tail)_
- [ ] **AT-03.4** Grid is photo-first 2-column using real `coverImageUrl` images. _(manual — visual)_

### MOB-RD-04 — Stay detail mode-aware booking
- [ ] **AT-04.1** NIGHTLY property: check-in + check-out datetimepickers + guests stepper + email field + total = nights × pricePerNight. _(manual — interaction + math)_
- [ ] **AT-04.2** HOURLY property: date + start time datetimepickers + duration stepper + email + total = hours × pricePerHour. _(manual — interaction + math)_
- [ ] **AT-04.3** TIMED_EVENT property: date + slot picker + email + total = `pricePerHour × slot length` (NOT people × pricePerNight — H-3). _(manual — math)_
- [ ] **AT-04.4** MEMBERSHIP property: benefits list + 4 duration chips + email + total = months × membershipMonthlyPrice. _(manual — math)_
- [ ] **AT-04.5** 4-image gallery scrolls horizontally with paging dots. _(manual — visual)_
- [ ] **AT-04.6** Highlights render as a list with CheckCircle2 icons; amenities render as Chip pills. _(manual — visual)_
- [ ] **AT-04.7** Email field defaults from `me.email` on mount in all 4 sheets. _(manual — interaction)_
- [ ] **AT-04.8** Confirm in any sheet POSTs to `/api/v1/properties/:id/bookings` (NOT `/stays/bookings`) and opens Paystack URL in `expo-web-browser`. _(manual — backend log + browser handoff)_

### MOB-RD-05 — Marketplace cart + checkout
- [ ] **AT-05.1** Marketplace sub-section shows 8 category chips in order: All / Fashion / Crafts / Food / Art / Tech / Agriculture / Featured. _(manual — visual)_
- [ ] **AT-05.2** Product grid shows discount badges on products with `compareAtPrice > price` (gated by 08-05 Task 0 audit). _(manual — visual)_
- [ ] **AT-05.3** Wishlist heart toggles per product. _(manual — interaction)_
- [ ] **AT-05.4** Tapping a product opens detail with gallery + qty stepper + Add to Cart + Buy Now. _(manual — visual + interaction)_
- [ ] **AT-05.5** Add to Cart increments the bag icon badge in the Book hub header (badge reflects `useCartStore.getState().totalCount()`). _(manual — interaction)_
- [ ] **AT-05.6** Bag icon tap opens cart drawer (right-slide modal) — triggers `useCartDrawerStore.getState().openDrawer()`. _(manual — interaction)_
- [ ] **AT-05.7** Cart drawer shows items + qty stepper + remove + subtotal (from `useCartStore.getState().totalPrice()`). _(manual — visual + math)_
- [ ] **AT-05.8** Checkout screen has order summary + single email field defaulted from session + Pay button. **Verify there is NO delivery-address input** (H-2). _(manual — visual)_
- [ ] **AT-05.9** Submit POSTs to `POST /api/v1/orders` with `{ items, email }` body. Body MUST NOT contain `deliveryAddress`, `phone`, or any other extra field (backend rejects via `forbidNonWhitelisted`). Confirm in backend log. _(manual — backend log)_
- [ ] **AT-05.10** Paystack hosted page opens in `expo-web-browser`. After close, cart is cleared and user returns to Book tab. _(manual — interaction)_
- [ ] **AT-05.11** AsyncStorage key is `iseyaa-cart-v1` — confirmed via temporary `console.log('CART_KEY iseyaa-cart-v1', items)` patch (L-4). **Remove the patch before final commit.** _(manual — instrumented)_

### MOB-RD-06 — Host onboarding
- [ ] **AT-06.1** You tab shows "Become a host" card only when `me.registeredRoles` does not include `HOST`. _(manual — visual + state)_
- [ ] **AT-06.2** Tapping the card opens `/host`. Hero uses `CARD_GRADIENTS.goldHero` (no inline 4-stop hex). _(manual — visual + grep)_
- [ ] **AT-06.3** 3 benefit cards + 7 hostable chips + 3 Q&A accordion items render correctly. _(manual — visual)_
- [ ] **AT-06.4** Gold CTA fires `POST /api/v1/users/me/become-host`. _(manual — backend log)_
- [ ] **AT-06.5** On success, alert shows, user returns to profile, "Become a host" card disappears. _(manual — interaction)_

### MOB-RD-07 — EAS preview build
- [ ] **AT-07.1** `eas build --platform android --profile preview --non-interactive` returns a build URL. _(automated — EAS CLI)_
- [ ] **AT-07.2** Build status flips to "finished" on EAS dashboard. _(manual — dashboard watch)_
- [ ] **AT-07.3** APK install URL captured in `08-VERIFICATION.md`. _(manual — copy/paste)_
- [ ] **AT-07.4** APK installs on a physical Android device and launches without first-screen crash. _(manual — physical device)_

### MOB-RD-08 — No regressions
- [ ] **AT-08.1** `cd backend && npm test` — all existing tests pass. _(automated — Jest)_
- [ ] **AT-08.2** `cd web && npm run typecheck` — no new TS errors. _(automated — tsc)_
- [ ] **AT-08.3** `git diff main -- 'backend/**' | wc -l` returns 0. _(automated — git)_
- [ ] **AT-08.4** `git diff main -- 'web/**' | wc -l` returns 0. _(automated — git, L-1)_
- [ ] **AT-08.5** `cd mobile && npx tsc --noEmit` — no new mobile TS errors. _(automated — tsc)_

---

## Sampling Plan

How each acceptance test is sampled during/after `/gsd-execute-phase`:

| Test bucket | When sampled | By whom | Cost |
|---|---|---|---|
| Automated `tsc --noEmit` checks | After each plan's executor completes | Plan executor | seconds |
| `npm test` regression check | After 08-08 (last code plan) and before 08-09 | Plan executor | ~30s |
| `git diff main -- 'web/**'` and `'backend/**'` | After 08-09 (right before final verification) | Plan executor | seconds |
| Manual smoke on EAS APK | During 08-10 checkpoint | Human verifier | ~30 min |
| Backend log tail for endpoint correctness | During 08-10 smoke (have backend log open) | Human verifier | part of 30 min |
| `console.log` cart-storage patch (L-4) | Once during 08-10, then removed | Human verifier | 5 min |

**Frequency rationale:** Mobile UI changes can't be sampled by automated test in this phase (no Detox / no snapshot rig). The verifier walks the APK ONCE end-to-end during 08-10. There is no "sample 10% of users" regime here — one human pass is the validation.

**Sample size:** N=1 (the human verifier). For a non-production mobile preview build with no automated UI rig, one pass against the EAS APK is the bar. If regressions are found, gap-closure plans run, and validation re-passes.

---

## Coverage Verification

Map each acceptance test back to its success criterion. Every SC must have ≥ 1 AT.

| Success Criterion | Acceptance Tests | Coverage |
|---|---|---|
| MOB-RD-01 (5-tab nav) | AT-01.1, AT-01.2, AT-01.3 | 3 tests |
| MOB-RD-02 (news ticker) | AT-02.1, AT-02.2, AT-02.3, AT-02.4 | 4 tests |
| MOB-RD-03 (Stays browse) | AT-03.1, AT-03.2, AT-03.3, AT-03.4 | 4 tests |
| MOB-RD-04 (Stay detail mode-aware) | AT-04.1 → AT-04.8 | 8 tests |
| MOB-RD-05 (Marketplace cart) | AT-05.1 → AT-05.11 | 11 tests |
| MOB-RD-06 (Host onboarding) | AT-06.1 → AT-06.5 | 5 tests |
| MOB-RD-07 (EAS preview) | AT-07.1 → AT-07.4 | 4 tests |
| MOB-RD-08 (no regressions) | AT-08.1 → AT-08.5 | 5 tests |
| **TOTAL** | | **44 tests** |

**Coverage gaps acknowledged:**
- No automated visual regression (no snapshot rig in mobile this phase — deferred).
- No load test (Phase 6 owns load testing).
- No accessibility audit (deferred; the design tokens enforce contrast but no programmatic check).

---

## What This Doc Is Not

- It is not a backend contract spec — that lives in `backend/src/modules/*/dto/*.dto.ts` and the OpenAPI at `/api/docs`.
- It is not a UAT script for end users — that's a separate document for the Ogun State acceptance team (not this phase).
- It is not a load/perf doc — Phase 6 owns those.

---

## Finalization

After 08-10's verifier ticks every box above and resolves any regressions, update the status line at the top of this file:

  **Status: Final — verified yyyy-mm-dd by <name>**

The 08-10 plan's success criteria require this flip.
