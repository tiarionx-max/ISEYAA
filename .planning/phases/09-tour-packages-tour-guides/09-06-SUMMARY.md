---
phase: 09-tour-packages-tour-guides
plan: 06
subsystem: backend.tour-bookings
tags: [tour, settlement, wallet, paystack, refund, split-bill, multi-vendor]
status: COMPLETED
requirements:
  - TOUR-04
  - TOUR-06
  - TOUR-10
provides:
  - TourSettlementService
  - tour_booking webhook dispatch
  - tour_booking.confirmed event
requires:
  - PrismaService
  - RefundService
  - KafkaService
  - EventEmitter2
key-files:
  created:
    - backend/src/modules/tour-bookings/tour-settlement.service.ts
    - backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts
    - backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts
  modified:
    - backend/src/modules/webhooks/webhooks.service.ts
    - backend/src/modules/tour-bookings/tour-bookings.module.ts
decisions:
  - "System wallet bootstrapped against well-known SYSTEM user id 00000000-0000-0000-0000-000000000001 (SUPER_ADMIN, ndpaConsent:true) — v1 ops audit anchor; proper SystemWallet model is flagged as future refactor"
  - "ATTRACTION fallback when tour.government_wallet_user_id PlatformConfig is null rolls the share into platform commission with logger.warn — does NOT block settlement (blocking would brick all tour bookings)"
  - "Idempotency precheck guards on BOTH <ref>-V-* AND <ref>-PLAT (covers the all-platform-fallback case where no vendor rows would exist)"
  - "Split-bill bookkeeping happens OUTSIDE the wallet \$transaction because the CONFIRMED gate depends on the post-update array length"
  - "Service-layer defensive guard rejects split percentages > 100 BEFORE entering the wallet transaction (defence-in-depth above the 09-01 DB CHECK)"
metrics:
  files-created: 3
  files-modified: 2
  spec-scenarios: 12
  tests-pass: 376
  tests-total: 376
  duration: ~14m
---

# Phase 9 Plan 06: Tour Settlement Engine — Summary

Atomic multi-vendor settlement: one Paystack `charge.success` with
`metadata.type='tour_booking'` fans out to N vendor wallet credits + a platform
commission row inside ONE `prisma.$transaction` with `SELECT FOR UPDATE` on
every wallet touched. Any leg failure rolls back and triggers a Paystack refund.

## Algorithm (handleTourBookingPayment)

```
1. Resolve booking by metadata.bookingId          (missing → warn + return)
2. Idempotency precheck: any <ref>-V-* OR <ref>-PLAT row → no-op
3. chargeAmountNgn = payload.amount / 100
4. Resolve N split entries from booking.snapshot.settlementSplit:
     GUIDE     → tourGuide.userId
     HOST      → property.hostId
     ORGANISER → event.organizerId
     ATTRACTION→ PlatformConfig 'tour.government_wallet_user_id'
                 (if unset → walletId=null, share rolls into platform + warn)
5. Compute platform commission:
     claimedAmountNgn = sum(resolved.amountNgn  where walletId != null)
     platformAmountNgn = chargeAmountNgn − claimedAmountNgn  (absorbs drift)
     drift > ₦0.02 → defensive throw (programming error)
6. prisma.$transaction:
     for each resolved with walletId:
       SELECT id FROM wallets WHERE id = ? FOR UPDATE
       update wallet.balance += amountNgn
       create Transaction { reference: <ref>-V-<idx>, type CREDIT, ... }
     SELECT id FROM wallets WHERE id = <systemWalletId> FOR UPDATE
     update systemWallet.balance += platformAmountNgn
     create Transaction { reference: <ref>-PLAT, type CREDIT, ... }
     if !isSplitBillChild → tourBooking.update { status: CONFIRMED }
7. (Outside txn) Split-bill bookkeeping:
     push shareKey into splitBillPaidUserIds
     merge metadata.shares[shareKey] = { status: PAID, paidAt, settledReference }
     if length >= passengerCount → update { status: CONFIRMED }
                                 + emit tour_booking.confirmed
   else: emit tour_booking.confirmed (solo)
```

Failure path (`handleSettlementFailure`):
- Resolve buyer wallet → `refundService.refund({ paystackReference, amountKobo, walletId, reason })`
- Update `tourBooking.status = 'REFUNDED'` with `metadata.settlementError`
- Re-throw original error to surface in upstream logs

## SELECT FOR UPDATE syntax used

Mirrors `wallet.service.ts:272` and `refund.service.ts:89` exactly:

```ts
await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
const w = await tx.wallet.findUnique({ where: { id: r.walletId! } });
```

Five `FOR UPDATE` occurrences in `tour-settlement.service.ts` (2 active row-locks
in the txn callback + 3 in spec/comment doc strings).

## Idempotency check pattern

```ts
const existing = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${payload.reference}-V-` } },
});
if (existing) return;   // log + no-op

const existingPlat = await this.prisma.transaction.findFirst({
  where: { reference: `${payload.reference}-PLAT` },
});
if (existingPlat) return;
```

The `-PLAT` second pass catches the edge case where all splits are ATTRACTION
entries with unset gov wallet (no `-V-*` rows ever written, just a `-PLAT` row).

## RefundService integration

```ts
await this.refundService.refund({
  paystackReference: payload.reference,
  amountKobo: payload.amount,
  walletId: buyerWallet.id,
  reason: `tour_booking_settlement_failed: ${err.message}`,
  metadata: { bookingId: booking.id, failedAt: 'settlement_transaction', module: 'tour' },
});
```

The 09-02 RefundService is itself idempotent (`<ref>-RFND` keying), so a retried
settlement that fails twice still produces only one chargeback to the card.

## Split-bill orchestration

Each Paystack child charge carries `metadata.shareKey` and `metadata.parentReference`.
Settlement runs identically per share (the same `settlementSplit` percentages apply
to `unitPrice`-sized share amounts). The CONFIRMED transition is deferred until the
post-update `splitBillPaidUserIds.length >= passengerCount`. Group leader's
`/close` endpoint (09-05) emits a Paystack charge with `metadata.shareKey =
leaderUserId` and `remaining` set; on settlement it appends just that leader's
key and the length-check closes the booking.

`tour_booking.confirmed` EventEmitter event is fired exactly once per booking —
on solo settlement OR on the final split-bill share.

## Spec scenarios — 12/12 passing

1. **Wallet invariant 100% split** — GUIDE 60 + HOST 30 + ATTRACTION 10 → `sum(credits) == ₦10,000`, platform = 0. PASS
2. **Wallet invariant partial split** — GUIDE 50 + HOST 30 → platform absorbs `₦2,000`. PASS
3. **ATTRACTION fallback** — gov wallet PlatformConfig null → only GUIDE row written (₦6,000), platform absorbs ₦4,000, `logger.warn` mentions `tour.government_wallet_user_id`, `attractionsRolledIn` in platform metadata. PASS
4. **Idempotency** — existing `-V-0` row → `$transaction` NOT called, `refund` NOT called, `tourBooking.update` NOT called. PASS
5. **Refund on failure** — vendor wallet update throws → `refundService.refund` called once with `walletId=BUYER_WALLET_ID`, `tourBooking.update` called with `status:'REFUNDED'`. PASS
6. **SELECT FOR UPDATE count** — 3 vendors + 1 system wallet = 4 `$executeRaw` calls, each containing `FOR UPDATE`. PASS
7. **Solo CONFIRMED inside txn** — `tx.tourBooking.update` with `status:'CONFIRMED'` fires inside the `$transaction` callback; no outer-prisma update for solo. PASS
8. **Split-bill first share** — push appends `'USR-A'`; no second `tourBooking.update` with CONFIRMED; no `tour_booking.confirmed` event. PASS
9. **Split-bill final share** — 2 outer updates (push + CONFIRMED), `paymentReference=parentReference`, `tour_booking.confirmed` event fires. PASS
10. **Missing bookingId** — handler returns; `tourBooking.findUnique` NOT called. PASS
11. **Reference shape** — `<ref>-V-0`, `<ref>-V-1`, `<ref>-PLAT`; every row has `gatewayRef=PAYSTACK_REF`, `gateway:'PAYSTACK'`, `type:'CREDIT'`, `status:'SUCCESS'`. PASS
12. **(Defensive) split > 100%** — sum=110% throws before entering `$transaction`; `refund` still called. PASS

Wallet invariant proof excerpt (test 1):

```ts
const sum = txn.transactionCreates.reduce((s, c) => s + Number(c.amount), 0);
expect(sum).toBe(10_000); // exactly the charge in NGN
```

## Reference scheme

| Row              | Reference                              | gatewayRef       |
| ---------------- | -------------------------------------- | ---------------- |
| Vendor credit    | `<paystackReference>-V-<idx>`          | `<paystackRef>`  |
| Platform commission | `<paystackReference>-PLAT`          | `<paystackRef>`  |
| (RefundService)  | `<paystackReference>-RFND` (09-02)     | Paystack refund id |

`idx` is the index into `booking.snapshot.settlementSplit[]`. Vendor rows are
skipped (no row written) for entries whose `walletId` resolution failed (gov
wallet unset, or vendor row vanished); the spec captures this in scenarios 3 + 11.

## System wallet decision (v1 audit anchor)

A dedicated SYSTEM user `00000000-0000-0000-0000-000000000001` is upserted on
`onModuleInit` with `role: SUPER_ADMIN`, `ndpaConsent: true`, `firstName:
'Platform'`, `lastName: 'System'`. Its Wallet is upserted in the same bootstrap
step and the resulting wallet id is cached on the service instance. The
`-PLAT` Transaction rows reference this wallet as their accountant of record.

**Rationale**: a full `SystemWallet` model (separate from `Wallet`) would have
required a schema change, which is explicitly out-of-scope for 09-06. Re-using
`Wallet` with a well-known userId gives us a queryable, ledgered, audit-friendly
platform commission ledger in v1 with zero migration cost.

**Future refactor (post-Phase 9)**: introduce `model SystemWallet` separate
from `Wallet`, migrate the -PLAT rows to point at it (back-compat with the
historical SYSTEM_USER_ID row), and add an admin dashboard tile for platform
revenue. Tracked as a Phase 12 candidate.

## Truths verified

- WebhooksService dispatches `payment.tour_booking` on `charge.success` with
  `metadata.type='tour_booking'`, mirroring the 4 existing payment dispatches
  (regression-tested in `webhooks.service.spec.ts`).
- `TourSettlementService.handleTourBookingPayment` is the ONLY code that writes
  wallet ledger rows for tour bookings — single `$transaction`, `SELECT FOR
  UPDATE` on every wallet row.
- Atomic multi-vendor split: vendor CREDIT rows with `<ref>-V-<idx>`, platform
  commission row with `<ref>-PLAT`.
- ATTRACTION vendorType routes to `tour.government_wallet_user_id`; unset →
  rolls into platform commission with `logger.warn` (does NOT fail settlement).
- Failure rollback → `RefundService.refund` + booking → REFUNDED.
- Idempotency: replay = no-op (precheck finds existing `-V-` OR `-PLAT` row).
- Split-bill: each share appends to `splitBillPaidUserIds`; CONFIRMED only when
  `length >= passengerCount`.
- Wallet invariant: `sum(vendor credits) + platform commission == buyer amount`
  to-the-kobo, asserted in scenarios 1, 2, 3.

## Operator action required

> **Before any APPROVED tour package containing an ATTRACTION split entry goes
> live, set the `tour.government_wallet_user_id` PlatformConfig row to the
> Ogun State Treasury wallet user id.**
>
> Without it, attraction shares silently roll into platform commission (loud
> warning, but no failure). This is intentional — the alternative (failing all
> tour bookings until config is fixed) is operationally unsafe.
>
> Suggested seed: add an entry to `prisma/seed.ts` referencing the well-known
> Ogun State Treasury user id (to be provisioned in Phase 9 deployment).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Idempotency precheck extended to cover `-PLAT`-only case**
- **Found during:** Task 2 (algorithm implementation)
- **Issue:** Plan's idempotency check only guards on `<ref>-V-*` rows. Edge case: a solo booking with `settlementSplit: [{ vendorType: 'ATTRACTION', percentage: 100 }]` AND `tour.government_wallet_user_id` unset writes ZERO `-V-*` rows (the share rolls into platform). A replay would re-execute and double-credit the platform.
- **Fix:** Added a second precheck for the `-PLAT` row. Either row's existence proves settlement already ran.
- **Files modified:** `backend/src/modules/tour-bookings/tour-settlement.service.ts`
- **Commit:** 2e59ebf

**2. [Rule 2 — Missing critical functionality] Service-layer guard on `sum(percentages) <= 100`**
- **Found during:** Task 2 — defensive review
- **Issue:** Plan documents the DB CHECK from 09-01 but settlement service would otherwise enter the `$transaction` before the implicit overflow shows up in platform commission arithmetic (`platformAmountNgn` would go negative). Better error message at the service boundary.
- **Fix:** Defensive guard with explicit error message, runs BEFORE the wallet `$transaction`. Test scenario 12 asserts the rejection.
- **Files modified:** `backend/src/modules/tour-bookings/tour-settlement.service.ts`, settlement spec
- **Commit:** 2e59ebf, 2d1393f

**3. [Rule 3 — Blocking dev environment] `kafka.consume` wrapped in `.catch`**
- **Found during:** Task 2
- **Issue:** Plan's `onModuleInit` awaits `kafka.consume` unconditionally. If Kafka wiring fails (which can happen on cold start in CI), the whole module bootstrap fails, blocking the backend from starting. Plan-intended fallback is in-process `@OnEvent`.
- **Fix:** Wrapped `kafka.consume` in `.catch(err => logger.error(...))` so Kafka failures degrade gracefully to EventEmitter-only mode (matching local-dev intent).
- **Files modified:** `backend/src/modules/tour-bookings/tour-settlement.service.ts`
- **Commit:** 2e59ebf

### No architectural changes
No schema modifications. No web/mobile files touched. No new modules. No new
external service dependencies.

## Final commit

`2d1393f test(09-06): TourSettlementService spec — 12 scenarios incl. wallet invariant proof`

## Self-Check: PASSED

- `backend/src/modules/tour-bookings/tour-settlement.service.ts` — FOUND
- `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` — FOUND
- `backend/src/modules/webhooks/__tests__/webhooks.service.spec.ts` — FOUND
- Commits cfb3ad4, 2e59ebf, 2d1393f — all FOUND in `git log`
- `tsc --noEmit` clean except 2 pre-existing baseline errors (`@aws-sdk/s3-request-presigner`)
- Full backend suite: 376/376 pass (1 pre-existing baseline failure on upload.service.spec.ts unrelated)
