# Phase 9 Verification — Tour Packages & Tour Guides

**Plan:** 09-13 (human checkpoint)
**Status:** AWAITING OPERATOR SIGN-OFF
**Date:** _______________________
**Operator:** _______________________
**Environment:** Railway dev / staging — _______________________

---

## Pre-flight Checklist

Before walking the SCs, complete all of these:

- [ ] `psql $DATABASE_URL -c "SELECT key, value FROM platform_config WHERE key LIKE 'tour.%'"` — confirm 6 rows
- [ ] Set `tour.government_wallet_user_id` to a real user UUID with a Wallet row (or explicitly accept null)
- [ ] Confirm 1+ LGA_ADMIN user with Wallet exists
- [ ] Confirm 1+ Property with host user that has a Wallet
- [ ] Confirm 1+ Event with organizer that has a Wallet
- [ ] Confirm 1+ Attraction exists
- [ ] Backend + web deployed to reachable environment
- [ ] Latest mobile EAS preview build on test device (versionCode 2)

---

## SC1 — TOUR_GUIDE role + onboarding + KYC + availability

**Status:** PASS / FAIL

**Evidence:**
```
[Paste DB query output or screenshot path here]

SELECT id, status, ninCiphertext, ninHash, kycTier FROM tour_guides WHERE userId='<userId>';
```

_Notes:_

---

## SC2 — TourPackage CRUD with structured itinerary + settlement split

**Status:** PASS / FAIL

**Evidence:**
```
[Paste DB query output or screenshot path here]

SELECT id, status, LENGTH(itinerary_template::text), LENGTH(settlement_split::text) FROM tour_packages WHERE id='<packageId>';
```

_Settlement sum guard confirmation (refused > 100%):_

_Notes:_

---

## SC3 — Tourist search + date constraint

**Status:** PASS / FAIL

**Evidence:**
```
[Paste 400 response for blocked date + 200/redirect for valid date]
```

_Category filter working on mobile:_

_Notes:_

---

## SC4 — Atomic multi-vendor split on payment success

**Status:** PASS / FAIL

**Evidence:**
```
[Paste query output]

SELECT reference, type, amount, wallet_id, metadata 
FROM transactions 
WHERE reference LIKE 'ISY-TOUR-%' 
ORDER BY created_at;

-- Sum check:
SELECT SUM(amount) FROM transactions WHERE reference LIKE '<ISY-TOUR-...>%';
-- Expected: <total booking amount NGN>
```

`tour.government_wallet_user_id` decision:
- [ ] Configured with real user ID: `<uuid>`
- [ ] Intentionally NULL (ATTRACTION splits roll into platform for v1)

_Notes:_

---

## SC5 — Itinerary 3-channel delivery

**Status:** PASS / FAIL

**Evidence:**
- Email PDF received: [ ] Yes / [ ] No
  - Subject: _______________________
  - Attachment/link present: [ ] Yes / [ ] No
- Mobile trips screen — itinerary timeline shown: [ ] Yes / [ ] No
- T-24h push notification received: [ ] Yes / [ ] No (or simulated via config)

_Notes:_

---

## SC6 — Group + bulk discount + split-bill

**Status:** PASS / FAIL

**Evidence:**
```
[Paste passengerCount=15 booking response showing discounted unitPrice]
[Paste passengerCount=30 booking response showing tier-2 discount]
[Paste split-bill booking response showing splitBillJoinLink]
```

_Close-split-bill (leader absorbs gap) tested:_ [ ] Yes / [ ] No / [ ] Deferred

_Notes:_

---

## SC7 — Post-tour rating + auto-flag

**Status:** PASS / FAIL

**Evidence:**
```
[Paste DB query]

SELECT id, target_type, target_id, rating, flagged FROM reviews WHERE tour_booking_id='<bookingId>';
SELECT id, status FROM admin_review_flags WHERE review_id IN (...);
```

_Web /admin/reviews/queue flag visible and resolved:_ [ ] Yes / [ ] No

_Notes:_

---

## SC8 — Web admin surface

**Status:** PASS / FAIL

**Evidence:**

| Admin page | Approve/Reject working | Screenshot/curl |
|------------|------------------------|-----------------|
| /admin/tours/queue | [ ] | |
| /admin/guides/queue | [ ] | |
| /admin/tours/revenue | [ ] chart renders | |
| /admin/reviews/queue | [ ] resolve works | |
| /admin/tours/utilization | [ ] heatmap renders | |

_Notes:_

---

## SC9 — Mobile UI

**Status:** PASS / FAIL

**Evidence:**

| Mobile screen | Working |
|---------------|---------|
| Book hub — 5 sub-sections (Events/Stays/Studio/Marketplace/Tours) | [ ] |
| Tours category strip + grid | [ ] |
| tours/[id] gallery | [ ] |
| tours/[id] itinerary timeline | [ ] |
| tours/[id] guide card | [ ] |
| tours/[id] sticky booking sheet | [ ] |
| trips/index upcoming + past sections | [ ] |
| Rating modal 3 tabs (Guide/Package/Venue) | [ ] |

_Notes:_

---

## SC10 — Tests + invariants

**Status:** PASS / FAIL

**Evidence:**
```bash
cd backend && npm test
# Output:
# Tests: ___ passed, ___ failed, ___ total
# Suites: ___ passed, ___ failed, ___ total

cd backend && npm run test:e2e:tours
# Output:
# Tests: ___ passed, ___ failed, ___ total
```

_All existing 282+ tests still passing:_ [ ] Yes / [ ] No

_Notes:_

---

## Overall Sign-off

| SC | Status |
|----|--------|
| SC1 — TOUR_GUIDE onboarding + KYC | |
| SC2 — TourPackage CRUD + settlement split | |
| SC3 — Tourist search + date constraint | |
| SC4 — Atomic multi-vendor split | |
| SC5 — Itinerary 3-channel delivery | |
| SC6 — Group + bulk discount + split-bill | |
| SC7 — Post-tour rating + auto-flag | |
| SC8 — Web admin surface | |
| SC9 — Mobile UI | |
| SC10 — Tests + invariants | |

**Phase 9 verdict:** PASS / FAIL (with noted gaps)

**Open gaps to close before marking complete:**
- _List any SCs that need follow-up plans_

**Operator signature:** _______________________
**Date signed:** _______________________

---

*Update `.planning/ROADMAP.md` Phase 9 entry to `[x]` after all SCs pass.*
