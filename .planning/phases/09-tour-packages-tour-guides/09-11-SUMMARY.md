# 09-11 SUMMARY — Mobile Tours Sub-section + Screens + Booking Sheet

**Phase:** 09 — Tour Packages & Tour Guides
**Plan:** 09-11
**Closes:** TOUR-03, TOUR-05, TOUR-06, TOUR-07 (mobile-side)

---

## What was built

### New screens (3)

| Screen | File | Route |
|--------|------|-------|
| Tour detail | `mobile/app/tours/[id].tsx` | `/tours/:slug` |
| My trips | `mobile/app/trips/index.tsx` | `/trips` |
| Rate tour (deep-link) | `mobile/app/tours/rate/[bookingId].tsx` | `/tours/rate/:bookingId` |

### New components (5)

| Component | File | Purpose |
|-----------|------|---------|
| TourCard | `mobile/components/tours/TourCard.tsx` | 2-column grid card for tours browse |
| ItineraryTimeline | `mobile/components/tours/ItineraryTimeline.tsx` | Vertical timeline with gold hour-pills |
| TourBookingSheet | `mobile/components/tours/TourBookingSheet.tsx` | Sticky booking form (date, passengers, split-bill) |
| SplitBillShareSheet | `mobile/components/tours/SplitBillShareSheet.tsx` | Modal to share split-bill join link |
| RatingModal | `mobile/components/tours/RatingModal.tsx` | 3-section independent rating modal (guide/package/venue) |

### Modified files (3)

- **`mobile/lib/category-config.ts`** — `TOUR_CATEGORIES` (10 entries) + `TourCategory` type + `buildTourQuery()` function appended; icons: Sparkles, Landmark, Music, Palette, PartyPopper, Utensils, Heart, Star, BookOpen, Briefcase
- **`mobile/app/_layout.tsx`** — 3 new `Stack.Screen` registrations added: `tours/[id]`, `trips/index`, `tours/rate/[bookingId]`
- **`mobile/app/(tabs)/book.tsx`** — Tours added as 5th sub-section in the Book hub switcher; `ToursSection` component fetches `GET /tour-packages?{buildTourQuery}` and renders a 2-column `TourCard` grid

---

## Key implementation notes

### Slug-vs-[id] filename note

The route file is named `tours/[id].tsx` (consistent with `stays/[id].tsx` naming) but the value passed via `router.push('/tours/' + pkg.slug)` is the **package slug**, not a numeric/UUID id. The screen reads `useLocalSearchParams({ id })` but queries `GET /api/v1/tour-packages/:slug`. This is documented with a comment at the top of the file.

### Split-bill flow

When `splitBill: true` is submitted and the API returns `splitBillJoinLink`, the `SplitBillShareSheet` is shown immediately after the Paystack WebBrowser session opens. The sheet provides three sharing actions: copy link (via native Share as fallback — expo-clipboard is not installed), native share sheet, and WhatsApp deep-link.

### Rating modal architecture

Three sections (Guide, Package, Venue) each submit independently via `POST /api/v1/reviews`. Each section tracks its own `pending`, `submitted`, `error` state. A progress indicator counts submitted sections (0–3). Venue section shows a picker when multiple venues are available.

### No new npm dependencies

All packages used (`@react-native-community/datetimepicker`, `expo-image`, `expo-web-browser`, `expo-linear-gradient`, `lucide-react-native`, `react-native` built-ins) were already installed. `expo-clipboard` is not installed — copy-link falls back to `Share.share()`.

---

## Inline hex verification

```
grep -rn "#[0-9a-fA-F]{6}" mobile/components/tours/ mobile/app/tours/ mobile/app/trips/
```

**Result: 0 matches** — all colors use tokens from `mobile/lib/tokens.ts`.

---

## TypeScript check

```
cd mobile && npx tsc --noEmit
```

All errors from the check are pre-existing workspace-level module resolution errors for `expo-image`, `expo-web-browser`, `@sentry/react-native`, and `@react-native-community/datetimepicker` — the same errors present in `stays/[id].tsx` and other Phase 8 screens. **No new TypeScript errors introduced by Plan 09-11.**

---

## API contracts consumed

| Method | Endpoint | Screen |
|--------|----------|--------|
| GET | `/tour-packages?{query}` | book.tsx ToursSection |
| GET | `/tour-packages/:slug` | tours/[id].tsx |
| POST | `/tour-bookings` | tours/[id].tsx booking mutation |
| GET | `/tour-bookings/me` | trips/index.tsx |
| GET | `/tour-bookings/:bookingId` | tours/rate/[bookingId].tsx |
| POST | `/reviews` | RatingModal (x3 sections) |
