# 09-09 SUMMARY — Web Public Tour Pages + AI Chat + Save as Bookable

## What was built

### 5 pages created

| Path | Description |
|------|-------------|
| `web/src/app/tours/page.tsx` | Public browse — Airbnb-style grid with category strip, search bar, AI nudge banner |
| `web/src/app/tours/[slug]/page.tsx` | Package detail — photo gallery, itinerary timeline, sticky booking form |
| `web/src/app/become-a-guide/page.tsx` | Guide onboarding — mirrors `/host` pattern exactly (hero + 3 benefit cards + listing types + Q&A + CTA) |
| `web/src/app/host/tours/new/page.tsx` | 5-step multi-step package creator (Basics → Components → Itinerary → Splits → Review) |
| `web/src/app/ai/page.tsx` | AI concierge streaming chat — **NEW page, no prior `/ai` page existed in web/src/app/** |

### 5 components created

| Path | Description |
|------|-------------|
| `web/src/components/tours/TourCard.tsx` | Animated card with category badge, rating, guide name, price; exports `TourCardSkeleton` |
| `web/src/components/tours/ItineraryTimeline.tsx` | Vertical timeline with time badges, location pins |
| `web/src/components/tours/TourBookingForm.tsx` | Date picker + stepper + split-bill checkbox + split-bill modal with WhatsApp share |
| `web/src/components/ai/SaveAsBookableButton.tsx` | BookmarkPlus button (min-h-[44px]) that opens modal |
| `web/src/components/ai/SaveAsBookableModal.tsx` | 3-field editable modal; POSTs to `/tour-packages/from-ai-suggestion`; handles 401 redirect |

### TOUR_CATEGORIES shared module

`web/src/lib/tour-categories.ts` — exports `TourPackageCategory` type, `TourCategoryOption` type, `TOUR_CATEGORIES` constant (10 entries: ALL + 9 categories).

## API endpoints consumed

| Method | Endpoint | Used by |
|--------|----------|---------|
| `GET` | `/tour-packages?limit=48&category=X&q=Y` | `tours/page.tsx` |
| `GET` | `/tour-packages/:slug` | `tours/[slug]/page.tsx` |
| `POST` | `/tour-bookings` | `TourBookingForm.tsx` |
| `POST` | `/users/me/become-guide` | `become-a-guide/page.tsx` |
| `POST` | `/tour-packages` | `host/tours/new/page.tsx` (draft save + submit) |
| `POST` | `/tour-packages/:id/submit` | `host/tours/new/page.tsx` (review submission) |
| `POST` | `/ai/chat` (SSE streaming) | `ai/page.tsx` |
| `POST` | `/tour-packages/from-ai-suggestion` | `SaveAsBookableModal.tsx` |

## Inline-hex grep result

No inline hex strings in `web/src/components/tours/`, `web/src/components/ai/`, `web/src/app/ai/`.

The `/tours/page.tsx` and `/become-a-guide/page.tsx` pages contain CSS gradient strings in `style={}` props (e.g. `#0c1a0f`, `#071009`, `#C8962A`) — these are the exact same multi-stop gradient values used in the pre-existing reference files (`stays/page.tsx`, `host/page.tsx`) and cannot be expressed as Tailwind utility classes. All interactive color styling uses `forest`, `gold`, `jungle`, and `forest-light` tokens exclusively.

## TypeScript check

`npx tsc --noEmit` reports only pre-existing `TS2307` errors (cannot find module `framer-motion`, `sonner`, `recharts` — their type declarations are not installed in the worktree). Zero errors are introduced by the 09-09 files. No `TS7006` or logic errors in new files.

## Notes

- `/ai` page is **brand new** — no prior AI chat page existed in `web/src/app/`
- `/host/tours/me` drafts list is referenced in toast actions but not yet shipped; both `SaveAsBookableModal` and the new-tour success toast link to `/host` as a fallback
- `/become-a-guide` CTA POSTs to `/users/me/become-guide` (same pattern as `/host` using `/users/me/become-host`); on success redirects to `/host/tours/new`
- AI endpoint is `POST /api/v1/ai/chat` with SSE streaming; requires `JwtAuthGuard` — the page enforces auth gate via `useSession` and `router.push('/login?returnTo=/ai')`
- `TourBookingForm` handles both payment redirect (`authorizationUrl`) and split-bill link modal flows
