# Phase 9: Tour Packages & Tour Guides - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning
**Source:** Synthesized from operator product spec (Tour Packages & Tour Guides expansion of Tourism module) + ROADMAP.md Phase 9 success criteria + live codebase audit (UserRole enum, BookingStatus enum, marketplace settlement pattern, wallet ledger pattern)

<domain>
## Phase Boundary

Expand the existing Tourism module from attractions-only to a full experience-selling platform: curated tour packages bundling 1+ attractions + optional stay + optional event + optional transport leg + 1 tour guide, sold at a single tourist-facing price with automatic multi-vendor commission splitting on payment success.

**Audience:** TOURIST role (already exists in `UserRole` enum) + new TOUR_GUIDE role. Diaspora, corporate, families, schools, and churches are all targeted use cases — modeled as group bookings, not separate user types.

**In scope:**
- New `TOUR_GUIDE` role with onboarding flow (profile + languages + certifications + Tier-2 KYC + availability calendar) gated by LGA_ADMIN approval.
- New `TourPackage` model — references 1+ attractions, optional propertyId (stays), optional eventId, optional transport leg, 1 tourGuideId. Has `price`, structured `itinerary[]` template, per-package `settlementSplit[]` table.
- New structured `Itinerary` model — distinct from the existing AI-suggested free-text itinerary in the AI module.
- Tour booking lifecycle with date constraint check (guide available + attraction open + event date matches).
- **Multi-vendor commission split** — single buyer payment fans out to N downstream vendors via atomic SELECT FOR UPDATE wallet ledger writes; failure of any leg rolls back the entire booking and refunds the buyer.
- Group bookings (≥10 passengers) with split-bill mode + bulk discount tier from PlatformConfig.
- Post-tour rating: guide + package + individual venues; <2-star ratings trigger admin review queue.
- Web admin queues (package approval, guide KYC, revenue breakdown).
- Mobile: new "Tours" sub-section in Book hub (becomes the 5th sub-section), tour detail screen, trips list on profile tab, rating modal.

**Out of scope:**
- Flights inventory integration (Amadeus/Duffel/Travelport) — Phase 10 candidate.
- Multi-currency display (NGN-only for v1; diaspora pays via Paystack international cards in NGN equivalent).
- Group bookings >50 passengers (corporate sales contract handled outside the app).
- AI module changes — the existing free-text AI itinerary endpoint is preserved as-is. Reconciliation rule below.
- New payment gateway — reuses existing Paystack flow.
- New KYC vendor — reuses Phase 5's `EncryptionService` + Dojah NIN verifier.
- New scheduler — reuses existing `NotificationsService` cron for 24h-before push.

</domain>

<decisions>
## Implementation Decisions

### Role model (LOCKED — verified against schema.prisma:13)
- `UserRole` enum already contains: `CITIZEN`, `TOURIST`, `VENDOR`, `ORGANISER`, `HOST`, `DRIVER`, `CREATIVE`, `LGA_ADMIN`, etc. Only ADD `TOUR_GUIDE`. Do NOT add new roles for "diaspora", "corporate", etc. — those are TOURIST flavors handled at booking time (group size + group leader).
- Migration MUST extend the enum, not replace it. Use Prisma's enum-extend pattern (additive only).

### Multi-vendor commission split (LOCKED — the biggest architectural delta)
- Use existing wallet ledger primitive `SELECT FOR UPDATE` (proven in `wallet.service.ts`, also in `marketplace.service.ts`).
- ONE Prisma `$transaction` per buyer payment success event. Inside the transaction:
  1. Lock buyer's wallet row.
  2. For each vendor in `TourPackage.settlementSplit[]`: lock vendor's wallet, write `Transaction` credit, increment vendor balance.
  3. Write platform commission `Transaction` for the remainder.
  4. Write `TourBooking` status → CONFIRMED.
- ANY failure inside the transaction → entire rollback → Paystack refund kicked via existing `RefundService` (or create if missing).
- Settlement split sum constraint: DB-level CHECK constraint that `sum(percentage) ≤ 100`; service-level guard before insert.
- Idempotency: settlement keyed by Paystack `reference`; replays must be no-ops (already true for marketplace; verify with test).
- **No Kafka in v1 of this** — write the multi-vendor split inline in the webhook handler the same way `marketplace.handleOrderPayment` does today. Kafka migration can be a Phase 6 cleanup item.

### TourGuide model (LOCKED)
- One `TourGuide` row per user (1:1 with `User`, like `Vendor`). FK back to userId; require `userRole` contains `TOUR_GUIDE` via service-layer guard.
- Fields: `userId`, `bio`, `yearsExperience`, `languagesSpoken: string[]`, `certifications: string[]` (S3 URLs), `kycTier`, `availability: Json` (calendar — block dates), `status: PENDING|APPROVED|REJECTED`, `rating`, `reviewCount`, `createdAt`.
- KYC: reuse `EncryptionService` AES-256-GCM for NIN; reuse Dojah NIN verifier. NIN never persisted plaintext.
- LGA_ADMIN approval pattern mirrors Vendor approval (see `marketplace.service.approveVendor`).

### TourPackage model (LOCKED)
- Fields: `id`, `slug`, `lgaId`, `tourGuideId`, `name`, `description`, `category` (enum: HERITAGE / CULTURAL / ADIRE / FESTIVAL / FOOD / FAMILY / FAITH / SCHOOL / CORPORATE), `price` (Decimal NGN), `durationHours`, `maxGroupSize`, `coverImageUrl`, `imageUrls: string[]`, `attractionIds: string[]` (1+ required), `propertyId?` (FK Property optional), `eventIds: string[]` (optional, multi), `transportNote?` (string — optional, no FK; full transport-as-package is deferred), `itineraryTemplate: Json` (array of `{hour: int, title: string, description: string, location?: string}`), `settlementSplit: Json` (array of `{vendorType: 'GUIDE'|'HOST'|'ORGANISER'|'ATTRACTION', vendorId: string, percentage: number}`), `rating`, `reviewCount`, `status: DRAFT|PENDING|APPROVED|REJECTED`, timestamps.
- Validation: `itineraryTemplate.length >= 1`, `settlementSplit.sum(p => p.percentage) <= 100`, `attractionIds.length >= 1`.

### TourBooking model (LOCKED)
- Fields: `id`, `reference` (`ISY-TOUR-<12char>` per CLAUDE.md naming convention), `tourPackageId`, `buyerUserId`, `groupLeaderUserId?` (null for solo), `tourDate` (Date), `passengerCount` (int 1-50), `passengers: Json?` (array of `{name, phone}` for groups), `unitPrice` (Decimal — could equal `package.price` or discounted via bulk tier), `totalAmount` (Decimal), `paymentReference?`, `status: BookingStatus` (reuse existing enum: PENDING|CONFIRMED|CHECKED_IN|CHECKED_OUT|CANCELLED|REFUNDED), `itineraryId` (FK to materialized `Itinerary` row), `splitBillEnabled: boolean`, `splitBillPaidUserIds: string[]` (for split-bill: per-passenger payment tracking), timestamps.
- Reuse `BookingStatus` enum — do NOT introduce a parallel `TourBookingStatus` enum.

### Itinerary model (LOCKED — the third architectural delta)
- New structured artifact (distinct from AI module's free-text itinerary).
- Fields: `id`, `tourBookingId` (FK, 1:1), `items: Json` (materialized from `TourPackage.itineraryTemplate` at booking time, with concrete datetimes), `notes?`, timestamps.
- Reconciliation with AI itinerary: AI suggestions are FREE TEXT in `AiConversation.messages[]`. Structured itineraries are CONTRACTS. Bridge: a `Save as bookable` CTA on the AI screen converts an AI suggestion into a TourPackage DRAFT visible to the user; from there a TOUR_GUIDE can pick it up and refine into a publishable package. The conversion is one-directional (AI → structured). The structured itinerary never feeds back into the AI conversation.

### Group booking & bulk discount (LOCKED)
- `passengerCount` 1-9 → standard `package.price` per passenger.
- `passengerCount` 10-24 → bulk tier 1 (discount % from PlatformConfig `tour.bulk_discount_t1`).
- `passengerCount` 25-50 → bulk tier 2 (PlatformConfig `tour.bulk_discount_t2`).
- `passengerCount > 50` → return 400 with message "Contact corporate sales for groups over 50".
- Split-bill mode: `groupLeader` initiates booking with `splitBillEnabled: true`; backend generates a shared payment link; each passenger pays their `unitPrice`; booking reaches CONFIRMED only when all passengers have paid (or group leader manually marks "close booking" and absorbs the gap).

### Rating flow (LOCKED)
- Reuse the existing `Review` model if one exists for stays/marketplace — verify in schema audit (Task 0 for planner). If absent, create a polymorphic `Review` model: `(targetType: GUIDE|PACKAGE|VENUE, targetId, userId, tourBookingId, rating 1-5, comment?, photos: string[], createdAt)`.
- Aggregate rating recompute: cron job OR @OnEvent handler (decision in plan — recommend cron + invalidation on new review).
- <2-star ratings auto-flag → `adminReviewQueue` table OR a `flagged: boolean` column.

### Notification cadence (LOCKED)
- T-24h before `tourDate`: push + email "Your tour is tomorrow" with itinerary attached.
- T-2h: push "Your guide is on the way".
- T+1h after `tourDate + durationHours`: push "Rate your tour".
- All via existing `NotificationsService` + scheduled cron (existing pattern from Phase 5).

### Mobile UI (LOCKED — fits cleanly into Phase 8 architecture)
- Add "Tours" as the 5th sub-section in Book hub (joins Events/Stays/Studio/Marketplace).
- Reuse `mobile/lib/category-config.ts` pattern — add `TOUR_CATEGORIES`.
- Reuse `mobile/components/ui/CategoryStrip.tsx` for category tabs.
- New screen `mobile/app/tours/[id].tsx` — tour package detail (itinerary timeline + guide profile card + date picker + group size + book CTA).
- New screen `mobile/app/trips/index.tsx` — list of user's tour bookings (past + upcoming).
- Reuse the booking-sheet pattern from Phase 8 (`mobile/components/stays/*BookingSheet.tsx`) — add `TourBookingSheet.tsx`.

### Web UI (LOCKED)
- New page `web/src/app/tours/page.tsx` — public browse (Airbnb-style like stays).
- New page `web/src/app/tours/[slug]/page.tsx` — public package detail.
- New page `web/src/app/host/tours/new/page.tsx` — host/guide creates package (multi-step form).
- New page `web/src/app/become-a-guide/page.tsx` — guide onboarding (analog to `/host`).
- Admin pages: `web/src/app/admin/tours/queue/page.tsx` (package approval), `web/src/app/admin/guides/queue/page.tsx` (guide KYC), `web/src/app/admin/tours/revenue/page.tsx` (per-package vendor breakdown).

### Claude's Discretion (planner picks)
- Whether to extract a shared `SettlementService` from marketplace + tour (DRY) or inline tour settlement in `TourService` first and refactor later.
- Whether `Itinerary.items` should be a JSON column or a separate `ItineraryItem` table.
- Whether bulk discount tiers (counts + percentages) live in PlatformConfig (preferred) or hardcoded constants (faster but worse).
- Exact schema for `availability` Json column on TourGuide (calendar formats — pick one and stick with it).
- Cron vs @OnEvent for rating recompute.
- Whether group split-bill uses N Paystack subaccounts (Paystack split feature) or N separate Paystack init calls.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema + service patterns to mirror
- `backend/prisma/schema.prisma` — UserRole enum (line 13), BookingStatus enum (line 87), PropertyType enum, Attraction model (line 260), Vendor model, Booking model, Transaction/Wallet models.
- `backend/src/modules/marketplace/marketplace.service.ts` — single-vendor commission split + webhook handler (`handleOrderPayment`). Tour multi-vendor split mirrors this but iterates settlement table.
- `backend/src/modules/wallet/wallet.service.ts` — SELECT FOR UPDATE pattern, Transaction creation, idempotency key handling.
- `backend/src/modules/stays/stays.service.ts` — booking lifecycle, escrow release.
- `backend/src/modules/users/users.service.ts` — role assignment, `become-host` pattern (analog for `become-guide`).
- `backend/src/modules/tourism/tourism.service.ts` — existing attractions service (extend, don't replace).

### KYC + encryption
- `backend/src/common/services/encryption.service.ts` — AES-256-GCM, reused as-is.
- `backend/src/common/services/dojah.service.ts` — NIN verifier, reused as-is.

### Notifications
- `backend/src/modules/notifications/notifications.service.ts` — FCM push, reused.
- Phase 5 cron pattern for scheduled pushes (look up exact file via codebase audit).

### Web reference patterns
- `web/src/app/stays/page.tsx` (browse), `web/src/app/stays/[id]/page.tsx` (detail with sticky booking) — translate for tours.
- `web/src/app/host/page.tsx` — analog for `/become-a-guide`.

### Mobile reference patterns
- `mobile/app/(tabs)/book.tsx` — add Tours as 5th sub-section (Phase 8 architecture).
- `mobile/components/stays/*BookingSheet.tsx` — analog for `TourBookingSheet.tsx`.
- `mobile/lib/category-config.ts` — add `TOUR_CATEGORIES`.

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — reference number format (`ISY-TOUR-<12char>`), naming conventions, error handling, anti-patterns.

</canonical_refs>

<specifics>
## Specific Ideas

- Tour package categories should hardcode to 9 enum values to match the audience: HERITAGE / CULTURAL / ADIRE / FESTIVAL / FOOD / FAMILY / FAITH / SCHOOL / CORPORATE. Don't make it open-ended in v1.
- `ISY-TOUR-<12char>` reference format per CLAUDE.md naming pattern (existing references: ISY-FUND/ISY-TKT/ISY-STY/ISY-ORD/ISY-ESC/ISY-SBO).
- Each settlement-split entry's `vendorType` discriminates how to find the vendor's wallet — GUIDE looks up `TourGuide.userId`, HOST looks up `Property.hostUserId`, ORGANISER looks up `Event.organiserUserId`, ATTRACTION may not have a vendor wallet (attractions are government-owned today — flag to planner: how do attraction commissions settle? Probably to a government wallet — needs decision).
- Split-bill payment link: use a deep link `iseyaa://tour-booking/:id/join` that opens the mobile app and routes to a "Pay your share" screen prefilled with the share amount.
- For attraction tickets included in a tour package, decision needed: pre-purchase tickets at package booking time (lock inventory) OR lazy-purchase at tour start (risk of sold-out). Recommend pre-purchase + cancellation refund window.
- Use `expo-image` for all tour cover images on mobile (Phase 8 standard).
- Tour cover images should be 1600×1000 (16:10) to match the existing CDN conventions.

</specifics>

<deferred>
## Deferred Ideas

- **Flights vertical** (Amadeus/Duffel/Travelport integration) — entire separate phase. Track as Phase 10 candidate.
- **Multi-currency display** — diaspora pays in NGN via Paystack international cards; multi-currency UI is post-v1.
- **Corporate sales contracts** (groups > 50) — handled outside app via email/contract; out of scope for booking engine.
- **TOUR_GUIDE earnings dashboard** — read-only summary screen is in scope (matches driver earnings); historical analytics + payout schedule customization are deferred.
- **Tour package versioning / change history** — a guide editing a published package should create a v2 vs. mutating v1 (so historical bookings keep their snapshot). Recommend snapshotting `TourPackage` JSON onto `TourBooking.snapshot` at booking time as the lightweight v1 solution; deferring full versioning.
- **AI integration: package recommendation** — Phase 5's vector recommender could surface tour packages. Out of scope this phase; integration ticket post-launch.
- **Tour guide messaging / chat** — let tourists DM a guide pre-booking. Deferred to a general messaging phase (handoff doc §8.5).
- **Reviews/ratings polymorphic table** — if not introduced in this phase, the rating model lives in a tour-local table; harmonize in a later refactor when stays/marketplace also need polymorphic ratings.
- **Attraction-as-vendor wallet** — for v1, attraction-commission line items credit a single government wallet; per-attraction vendor onboarding is a later phase.

</deferred>

---

*Phase: 09-tour-packages-tour-guides*
*Context gathered: 2026-06-23*
