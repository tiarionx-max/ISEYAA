---
status: testing
phase: 12-settlement-engine-foundation
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md, 12-04-SUMMARY.md, 12-05-SUMMARY.md, 12-06-SUMMARY.md, 12-07-SUMMARY.md, 12-08-SUMMARY.md, 12-09-SUMMARY.md]
started: 2026-07-17T21:24:53Z
updated: 2026-07-17T21:24:53Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend server. Clear ephemeral state if applicable. Start the backend from scratch. Server boots without errors, the new `20260717170330_settle_02_booking_govt_levy_pct` migration applies cleanly (or is already applied), `npx prisma db seed` completes without error, and a basic API call returns live data.
result: pass
evidence: |
  `npx prisma migrate status` — "10 migrations found... Database schema is up to date!"
  `npx prisma db seed` re-ran clean and idempotent (0 new rows on all seeded entities, 31 PlatformConfig rows).
  Fresh `npm run start:dev` booted with no errors, all modules/routes mapped, `GET /api/v1/health` → HTTP 200.
  Live DB query confirmed `bookings.govtLevyPct` column exists (numeric, default 0.05), Ministry user+wallet exist (`ministry@iseyaa.local`, SUPER_ADMIN, no password/phone, wallet id `50bc9a43-...`), and all 6 new/fixed PlatformConfig keys resolve correctly including `tour.government_wallet_user_id` pointing at the Ministry user's real UUID.

### 2. Tour Booking Settlement (regression)
expected: Complete a tour booking payment (webhook or test flow). Guide/Host/Organiser/Attraction vendor wallets are credited their split amounts, the Ministry wallet is credited its levy, and the platform wallet absorbs the remainder — identical behavior to before, now routed through the shared SettlementService.
result: pass
evidence: `npx jest tour-settlement.service.spec.ts` — all scenarios green, delegating to real (non-mocked) SettlementService.

### 3. Marketplace Order Settlement
expected: Complete a marketplace order payment. The vendor's wallet is credited `Order.vendorPayout`, the Ministry wallet is credited `Order.govtLevy`, the order status flips to PROCESSING, and stock decrements — all atomically. Previously no wallet was credited at all for marketplace orders.
result: pass
evidence: `npx jest marketplace.service.spec.ts` — green, including settle-call assertions on recipient amounts and the onSettled status-flip/stock-decrement wiring.

### 4. Events Ticket Settlement
expected: Purchase an event ticket. The organizer's wallet is credited per `events.platform_fee_pct`/`events.govt_levy_pct` (fallback 10%/5%), the Ministry wallet is credited the levy share, and the ticket status flips to ISSUED with `TicketType.sold` incremented.
result: pass
evidence: `npx jest events.service.spec.ts` — green, covers configured-percentage split, fallback path, and atomic onSettled ticket-issue transition.

### 5. Studio Booking Settlement
expected: Pay for a studio booking. Only the Ministry wallet is credited (2-way split — no vendor/owner leg, since studio facilities are Ministry-owned), the platform wallet absorbs the remainder, and the booking status flips to CONFIRMED.
result: pass
evidence: `npx jest studio.service.spec.ts` — green, explicitly asserts no VENDOR/HOST/OWNER recipient tag is present.

### 6. Stays Escrow Release (SETTLE-05 fix)
expected: Trigger escrow release for a completed stay booking. The host is credited `total - govtLevy` (NOT the full 100% of totalPrice as before), and the Ministry wallet is credited the levy share taken from the booking's snapshotted `govtLevyPct`.
result: pass
evidence: |
  `npx jest stays.service.spec.ts` — green. The literal regression test `"SETTLE-05 regression: settles host at 42750 (NOT 100% of totalPrice) and Ministry at 2250..."` (line 380) asserts `hostRecipient.amountNgn === 42750` on a ₦45000 booking at 5% levy — proving the fix, not just the plan's claim of it.

### 7. Settlement Statement — Self View
expected: As a logged-in non-admin user (vendor, guide, host, or organizer with a wallet), call `GET /settlements/statement`. Response shows an itemized list of that user's own CREDIT transactions, most recent first.
result: pass
evidence: `npx jest settlement.controller.spec.ts` → "self-resolves the wallet for a non-admin user with no walletId supplied" passes.

### 8. Settlement Statement — IDOR Protection
expected: As a non-admin user, call `GET /settlements/statement?walletId=<someone-else's-wallet-id>`. The `walletId` query param is ignored — the response still shows only the caller's own statement, never another user's.
result: pass
evidence: `npx jest settlement.controller.spec.ts` → "IDOR proof: a non-admin user supplying an attacker-controlled walletId still resolves their own wallet" passes.

### 9. Settlement Statement — Admin Override
expected: As a SUPER_ADMIN or LGA_ADMIN, call `GET /settlements/statement?walletId=<specific-wallet-id>`. Response shows that specific wallet's statement (admin is permitted to look up any wallet).
result: pass
evidence: `npx jest settlement.controller.spec.ts` → SUPER_ADMIN override, LGA_ADMIN in-LGA override, LGA_ADMIN out-of-LGA forbidden, and LGA_ADMIN-with-no-lgaId forbidden all pass (11/11 total in this suite, broader coverage than the 6 cases the plan summary described).

### 10. Duplicate Webhook Replay Protection
expected: Deliver the same payment webhook (same reference) twice in quick succession. Wallets are credited exactly once — the second delivery is treated as a benign replay, not a duplicate credit or a spurious refund.
result: pass
evidence: `npx jest settlement.service.spec.ts` → scenario E (pre-transaction idempotency precheck short-circuits) and scenario F (mid-transaction P2002 race treated as benign replay) both pass.

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — full backend regression: 42/42 suites, 505/505 tests green]
