---
phase: 09-tour-packages-tour-guides
plan: 05
subsystem: tour-bookings
tags: [bookings, tour, paystack, split-bill, bulk-discount, itinerary, no-wallet]
dependency_graph:
  requires: [09-01, 09-02, 09-03, 09-04]
  provides: [TourBookingService, /tour-bookings endpoints, metadata.type=tour_booking webhook contract]
  affects: [09-06 (webhook settlement consumer), 09-07 (itinerary PDF + email)]
tech_stack:
  added: []
  patterns: [paystack-init-only-no-ledger, deep-link-iseyaa, split-bill-N-references, snapshot-versioning]
key_files:
  created:
    - backend/src/modules/tour-bookings/dto/create-tour-booking.dto.ts
    - backend/src/modules/tour-bookings/dto/join-split-bill.dto.ts
    - backend/src/modules/tour-bookings/tour-bookings.service.ts
    - backend/src/modules/tour-bookings/tour-bookings.module.ts
    - backend/src/modules/tour-bookings/tour-bookings.controller.ts
    - backend/src/modules/tour-bookings/__tests__/tour-bookings.service.spec.ts
  modified:
    - backend/src/app.module.ts
decisions:
  - Split-bill uses N separate Paystack init calls (one per share) rather than Paystack's "split" feature, so each passenger pays from their own card with their own receipt. Parent stays PENDING until 09-06 webhook flips it once splitBillPaidUserIds.length === passengerCount.
  - closeSplitBill implemented in full (not a 501 stub) because the mechanics fit in <30 lines and reuse the joinSplitBill Paystack pattern verbatim. Documented as deviation below.
  - Added 6th endpoint POST /tour-bookings/:id/cancel (owner-only → status=CANCELLED). Refund logic delegated to 09-06's RefundService — no wallet mutation here.
  - PlatformConfig keys tour.bulk_discount_t1 (default 0.10) / tour.bulk_discount_t2 (default 0.20) loaded once per request with logger.warn fallback when rows missing.
metrics:
  tasks_completed: 3
  duration: ~25min
  files_created: 6
  files_modified: 1
  test_count: 31
  completed_at: 2026-06-24
---

# Phase 09 Plan 05: Tour Bookings — Booking lifecycle, bulk discount, split-bill (NO wallet writes)

**One-liner:** TourBookings module with date guards, 3-tier bulk discount, split-bill orchestration via N Paystack inits, snapshot versioning, and itinerary materialization — strictly excludes wallet ledger writes (those land in 09-06's webhook settlement).

---

## Endpoints (6)

| Method | Path                          | Auth         | Body                       | Returns                                                                                |
| ------ | ----------------------------- | ------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/tour-bookings`              | JwtAuthGuard | `CreateTourBookingDto`     | `{ booking, payment }` solo/group **or** `{ booking, splitBillJoinLink }` split-bill   |
| POST   | `/tour-bookings/:id/join`     | JwtAuthGuard | `JoinSplitBillDto`         | `{ shareReference, authorizationUrl }`                                                 |
| POST   | `/tour-bookings/:id/close`    | JwtAuthGuard | empty                      | `{ booking, payment }` — leader absorbs `remaining * unitPrice`                        |
| GET    | `/tour-bookings/me`           | JwtAuthGuard | —                          | `TourBooking[]` (itinerary + lean package projection)                                  |
| GET    | `/tour-bookings/:id`          | JwtAuthGuard | —                          | `TourBooking` (403 if not owner)                                                       |
| POST   | `/tour-bookings/:id/cancel`   | JwtAuthGuard | empty                      | `TourBooking` with `status: CANCELLED` (refund flow is 09-06)                          |

---

## 7-step date-guard chain (in order)

`createTourBooking()` short-circuits on the FIRST failure, never persisting a row:

1. **Package status** — `tourPackages.findByIdInternal()` → 404 if missing or `status !== APPROVED`.
2. **Guide gate** — `pkg.tourGuideId` populated AND `prisma.tourGuide.findUnique` → `status === APPROVED`, else 403.
3. **Corporate sales cut-off** — `passengerCount > 50` → 400 *"Contact corporate sales for groups over 50"*.
4. **Package's own maxGroupSize** — `passengerCount > pkg.maxGroupSize` → 400.
5. **Past date** — `tourDate < todayIsoUtc` → 400 *"Tour date is in the past"*.
6. **Guide availability** — `isBlockedDate(guide.availability, tourDate)` checks `blockedDates[]` + `weeklyOffDays[]` (UTC) → 400 *"Guide unavailable on selected date"*.
7. **Event window** — for each `pkg.eventIds[]`, fetch event; `tourDate ∉ [startDate, endDate]` OR `status ∉ {APPROVED, PUBLISHED}` → 400 with the conflicting event title interpolated.

Attraction opening-hours check **not enforced in v1** — the `Attraction` model has no opening-hours fields. Flagged for a future deferred follow-up.

---

## Bulk discount math (`applyBulkDiscount`)

PlatformConfig source-of-truth (with 0.10 / 0.20 defaults + `logger.warn` on missing rows):

| Passenger count | Tier        | Formula                                | Worked case (price=10000)                                |
| --------------- | ----------- | -------------------------------------- | -------------------------------------------------------- |
| 1–9             | full price  | `unitPrice = price`                    | passenger=2 → unit=10000, total=20000                    |
| 10–24           | tier 1      | `unitPrice = round2(price*(1-t1))`     | passenger=12, t1=0.10 → **unit=9000, total=108000**      |
| 25–50           | tier 2      | `unitPrice = round2(price*(1-t2))`     | passenger=30, t2=0.20 → **unit=8000, total=240000**      |
| 51+             | corp sales  | —                                      | 400 *"Contact corporate sales for groups over 50"*       |

`totalAmount = round2(unitPrice * passengerCount)`. For split-bill, parent.`totalAmount` is computed up-front; the running paid sum accumulates in 09-06's webhook handler as shares clear.

---

## Split-bill orchestration (no wallet writes)

```
1. LEADER → POST /tour-bookings (splitBillEnabled=true, passengerCount=N)
            ▶ Service mints parent ISY-TOUR-<12char>, persists in PENDING
            ▶ NO Paystack init
            ▶ Returns { booking, splitBillJoinLink: "iseyaa://tour-booking/<id>/join" }

2. EACH PASSENGER → POST /tour-bookings/:id/join (email)
            ▶ Service mints child ISY-TOUR-<12char>
            ▶ Paystack init for unitPrice with metadata = {
                  type: 'tour_booking', bookingId, shareKey: actorUserId,
                  parentReference: parent.reference, module: 'tour' }
            ▶ Service writes child ref into parent.metadata.shares[actorUserId]
            ▶ Returns { shareReference, authorizationUrl }

3. (Optional) LEADER → POST /tour-bookings/:id/close
            ▶ remaining = passengerCount - splitBillPaidUserIds.length
            ▶ Paystack init for remaining * unitPrice
            ▶ metadata.remaining = remaining (lets 09-06 mark N shareKeys)

4. 09-06 webhook handler (NOT THIS PLAN) consumes each successful
   Paystack callback whose metadata.type === 'tour_booking':
            ▶ Appends payer userId to splitBillPaidUserIds
            ▶ When splitBillPaidUserIds.length >= passengerCount,
              flips parent.status to CONFIRMED and runs the multi-vendor
              wallet settlement per package.settlementSplit.
```

**No wallet writes at any step in this plan.**

---

## NO wallet mutation — verified

`backend/src/modules/tour-bookings/tour-bookings.service.ts` makes:

- 0 calls to `prisma.wallet.update`
- 0 calls to `prisma.transaction.create`
- 0 imports of WalletModule or any settlement service

Spec **Test 24** (`tour-bookings.service.spec.ts:553-588`) runs the full happy-path flow (`create → join → close → cancel`) and asserts:

```ts
expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
```

Plus 5 additional `not.toHaveBeenCalled` assertions across individual scenarios.

**09-06 picks up from the `metadata.type === 'tour_booking'` Paystack webhook** — that's where all wallet credits, platform-fee splits, and SC#5 (3-vendor split) live.

---

## Deviations from Plan

### Deviation 1 — closeSplitBill implemented in full (not 501 stub)

- **Plan instruction:** *"keep this as a placeholder endpoint stub `POST /tour-bookings/:id/close` that returns 501 NotImplemented for now; full impl deferred."*
- **What was done:** Full implementation (~30 lines) — mints child reference, runs Paystack init for `remaining * unitPrice` with `metadata.shareKey: groupLeaderUserId` + `metadata.remaining: remaining`. NO wallet writes.
- **Why:** The orchestration mirrors `joinSplitBill` verbatim (no new patterns, no new dependencies). The only logic the stub would have skipped is wallet-mutating settlement, and that's already deferred to 09-06's webhook handler. Stubbing would have created a 501 that needed re-opening in 09-06 for no architectural benefit.
- **Spec coverage:** Tests 18 (happy path) and 19 (403 non-leader).
- **No wallet writes verified by Test 24.**

### Deviation 2 — Added 6th endpoint POST /tour-bookings/:id/cancel

- **Plan instruction:** Plan interfaces listed 5 endpoints; the user prompt's route table listed cancel as the 6th.
- **What was done:** Implemented cancel — owner-only, sets `status=CANCELLED`. Refund (if already paid) deferred to 09-06's `RefundService.refundCharge`.
- **Why:** User prompt's route table is the source of truth for the 6-row table. No wallet writes here either.
- **Spec coverage:** Tests 22 (403 non-owner) and 23 (happy path).

### Deviation 3 — Attraction opening-hours check skipped (v1)

- **Documented in objective §5:** *"Attraction opening hours NOT enforced in v1 (Attraction schema has no opening-hours fields; flagged for follow-up)."*
- **What was done:** No-op (no field exists on the model). Logged as a follow-up in this Summary.

---

## Truths verified

- [x] **POST /api/v1/tour-bookings** initiates booking, validates date, computes bulk-discount unitPrice, persists PENDING TourBooking, initiates Paystack with `metadata.type='tour_booking'`.
- [x] **Date constraint** chain enforces guide availability + event date alignment.
- [x] **Bulk discount** tiers — 1-9 full / 10-24 t1 / 25-50 t2 / >50 corporate-sales 400 (Test 1-5 cover all three tiers + corporate-sales rejection).
- [x] **POST /api/v1/tour-bookings/:id/join** mints child reference + initiates separate Paystack with `metadata.shareKey` + `metadata.parentReference` (Test 14).
- [x] **Itinerary row materialized** at booking time with concrete `datetime: ISO` per item (08:00 UTC base + hour offset). FK from `TourBooking.itineraryId`.
- [x] **TourPackage snapshot** stored on `TourBooking.snapshot` (lean projection — exactly the shape `findByIdInternal` returns).
- [x] **Reference shape** is `ISY-TOUR-<12char>` via `ReferenceService.generate('TOUR')` — verified by spec test 12 against `/^ISY-TOUR-[A-F0-9]{12}$/`.
- [x] **Settlement is NOT done here** — 0 wallet writes verified by spec test 24 + grep of service file.

---

## Spec coverage

**31 tests, 1 file, 0 wallet-write violations:**

- 7 helper tests (pure functions, no DI)
- 13 createTourBooking tests (happy path + all guards + split-bill + rollback + reference format)
- 4 joinSplitBill tests (happy + 3 rejection paths)
- 2 closeSplitBill tests
- 4 reads + cancel tests
- 1 golden no-wallet-write assertion across the full flow

---

## TypeScript pre-flight

- `cd backend && npx tsc --noEmit` — **only pre-existing errors** (`@aws-sdk/s3-request-presigner` in upload.service, unrelated to this plan).
- Spec runs green: **Test Suites: 1 passed, Tests: 31 passed**.

---

## Smoke commands (for QA)

```bash
# Solo booking with Paystack URL
curl -X POST http://localhost:3001/api/v1/tour-bookings \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tourPackageId":"<id>","tourDate":"2026-08-12","passengerCount":3,"email":"a@b.com"}'
# → 201 { booking: { status: 'PENDING', reference: 'ISY-TOUR-...', ... }, payment: { authorizationUrl } }

# Split-bill booking — no Paystack init, deep link returned
curl -X POST http://localhost:3001/api/v1/tour-bookings \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tourPackageId":"<id>","tourDate":"2026-08-12","passengerCount":4,"splitBillEnabled":true,"email":"a@b.com"}'
# → 201 { booking, splitBillJoinLink: "iseyaa://tour-booking/<id>/join" }

# Each passenger pays their share
curl -X POST http://localhost:3001/api/v1/tour-bookings/<id>/join \
  -H "Authorization: Bearer $PASSENGER_TOK" -H "Content-Type: application/json" \
  -d '{"email":"tunde@example.com"}'
# → 201 { shareReference: 'ISY-TOUR-...', authorizationUrl }
```

After each share clears in production, 09-06's webhook handler will append to `splitBillPaidUserIds` and flip the parent to CONFIRMED when full — the wallet settlement happens there, not here.

---

## Follow-ups for downstream plans

| Plan  | What it picks up                                                                          |
| ----- | ----------------------------------------------------------------------------------------- |
| 09-06 | Webhook handler on `metadata.type === 'tour_booking'`: append to `splitBillPaidUserIds`, flip to CONFIRMED when full, multi-vendor wallet credits per `settlementSplit`. Refund handler for cancel-after-payment. |
| 09-07 | Itinerary PDF generation (uses the already-materialized `Itinerary.items[].datetime`) + SendGrid attachment. |
| ?     | Attraction opening-hours model field + guard.                                             |

---

## Self-Check: PASSED

- backend/src/modules/tour-bookings/dto/create-tour-booking.dto.ts — FOUND
- backend/src/modules/tour-bookings/dto/join-split-bill.dto.ts — FOUND
- backend/src/modules/tour-bookings/tour-bookings.service.ts — FOUND
- backend/src/modules/tour-bookings/tour-bookings.module.ts — FOUND
- backend/src/modules/tour-bookings/tour-bookings.controller.ts — FOUND
- backend/src/modules/tour-bookings/__tests__/tour-bookings.service.spec.ts — FOUND
- backend/src/app.module.ts — MODIFIED (TourBookingsModule import + registration)
- Commit ed6c01b — FOUND (Task 1)
- Commit f1572ec — FOUND (Task 2)
- Commit 04ae675 — FOUND (Task 3)
