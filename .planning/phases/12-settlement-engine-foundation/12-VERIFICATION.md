---
phase: 12-settlement-engine-foundation
verified: 2026-07-17T18:45:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 12: Settlement Engine Foundation Verification Report

**Phase Goal:** A shared, generalized `SettlementService` exists with a standing Ministry wallet, and the two pre-existing revenue bugs (Stays' zero-fee escrow release, Marketplace/Events/Studio's missing webhook consumers) are fixed — so every downstream dashboard/report built on top of settlement data is correct from day one
**Verified:** 2026-07-17T18:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A `SettlementService` in `CommonModule` performs an atomic N-way wallet fan-out (single `$transaction`, `SELECT FOR UPDATE` per recipient wallet, idempotency key, drift-tolerance assertion, append-only audit trail), generalized from `TourSettlementService`'s pattern and used by at least one caller | ✓ VERIFIED | `backend/src/common/services/settlement.service.ts:91-258` implements `settle()` with single `$transaction`, canonical-order `SELECT ... FOR UPDATE` on every recipient + system wallet (CR-01 fix applied — sorted lock order, not caller-array order), pre-transaction idempotency precheck + in-transaction `P2002` fallback narrowed to `reference` constraint (WR-01 fix), `Math.abs(drift) > 0.02` assertion before the transaction, append-only `Transaction` CREDIT rows. `TourSettlementService` (`tour-settlement.service.ts:240`), Marketplace, Events, Studio, and Stays all call `this.settlementService.settle(...)` — 5 live callers, not just 1. |
| 2 | A standing Ministry wallet exists, reusing the existing `tour.government_wallet_user_id` `PlatformConfig` entity as its recipient wallet | ✓ VERIFIED | Live DB query against `iseyaa_dev` confirms `PlatformConfig.tour.government_wallet_user_id` = `c6d9501a-8591-4e1c-baa3-d45b64b5bf7b`, which resolves to a real `User` row (`ministry@iseyaa.local`, role `SUPER_ADMIN`, `passwordHash: null` — non-loginable) with a paired `Wallet` row (`id: 50bc9a43-...`, `balance: 0`). Not just seed code — verified as a live, queryable row. |
| 3 | Marketplace, Events, and Studio payments settle automatically via working `@OnEvent` consumers for `payment.order_payment`, `payment.ticket_purchase`, and `payment.studio_booking` — a wallet credit appears for each payment type after completion, where previously none did | ✓ VERIFIED | `marketplace.service.ts:260` `@OnEvent('payment.order_payment')` → `settlementService.settle()` with VENDOR+MINISTRY recipients (amounts = `Order.vendorPayout`/`govtLevy` verbatim). `events.service.ts` `@OnEvent('payment.ticket_purchase')` → 3-way ORGANISER+MINISTRY+platform split sourced from `events.platform_fee_pct`/`events.govt_levy_pct` (confirmed live in DB: 0.10/0.05). `studio.service.ts:157` `@OnEvent('payment.studio_booking')` → 2-way MINISTRY+platform split (no vendor leg, per D-10), sourced from `studio.platform_fee_pct`/`studio.govt_levy_pct` (confirmed live: 0.10/0.05). All three dual-wired alongside pre-existing Kafka `onModuleInit` consumers, unmodified. Unit tests cover the wallet-credit assertions in `marketplace.service.spec.ts`, `events.service.spec.ts`, `studio.service.spec.ts`. |
| 4 | Stays' `releaseEscrow()` cron reads and applies `Booking.govtLevyPct` — hosts no longer receive 100% of the booking price, confirmed by an automated test | ✓ VERIFIED | `stays.service.ts:311-367` `releaseEscrow()` computes `hostAmountNgn = total - govtLevyNgn` from `Number(booking.govtLevyPct)` (row-level snapshot, D-11) and calls `settlementService.settle()` with a HOST + MINISTRY 2-way fan-out (`gateway: 'INTERNAL'`). `createBooking()` snapshots `govtLevyPct` from `stays.govt_levy_pct` PlatformConfig at creation time (confirmed live: 0.05; `Booking.govtLevyPct` confirmed as a live DB column via `information_schema.columns`). `stays.service.spec.ts` includes the literal regression proof: host credited `42750` (not `45000`) on a `45000` total at 5% levy. Escrow reference upgraded to 16 hex chars (WR-05 fix — collision-resistance for the idempotency key). |
| 5 | Each settlement recipient (vendor/rider, Ministry, platform) can retrieve a per-recipient, itemized settlement statement | ✓ VERIFIED | `SettlementService.getStatement(walletId, opts)` queries `Transaction` CREDIT rows by `walletId` + optional date range. `SettlementController` (`GET /settlements/statement`) is IDOR-proof: non-admin `walletId` query params are structurally ignored — `targetWalletId` always resolves via `prisma.wallet.findUnique({ where: { userId: user.userId } })` unless the caller is `SUPER_ADMIN` (unrestricted) or `LGA_ADMIN` (now LGA-scoped via a cross-check against the target wallet owner's `lgaId` — WR-06 fix). `dateFrom`/`dateTo` validated with a clean 400 on invalid input (WR-08 fix). `settlement.controller.spec.ts` includes the IDOR regression case and the WR-06 LGA-scoping cases. |
| 6 | An automated test asserts N-way split calculations sum exactly to the buyer's paid amount across a wide range of non-round amounts, with zero rounding/remainder drift | ✓ VERIFIED | `settlement.service.spec.ts` Scenario C parametrizes over `[9999.99, 10000.01, 33333.33, 7.77, 1000000.13]` across a 3-recipient 33/33/34 split, asserting the sum of every written CREDIT row equals `amountKobo / 100` to the kobo for each amount. Confirmed passing in the current test run. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/common/services/settlement.service.ts` | Generalized N-way fan-out engine | ✓ VERIFIED | Exists, substantive (352 lines), wired (5 callers), all 9 code-review fixes (CR-01, WR-01–WR-08) present in current source |
| `backend/src/common/controllers/settlement.controller.ts` | IDOR-proof statement endpoint | ✓ VERIFIED | Exists, substantive, registered in `CommonModule.controllers`, WR-06/WR-08 fixes present |
| `backend/src/common/common.module.ts` | Registers `SettlementService` + `SettlementController` | ✓ VERIFIED | `grep` confirms both in imports, providers/exports, controllers arrays |
| `backend/prisma/schema.prisma` | `Booking.govtLevyPct` field | ✓ VERIFIED | Confirmed as a live DB column via `information_schema.columns` query |
| `backend/prisma/seed.ts` | Ministry User+Wallet + 6 fee/levy PlatformConfig keys | ✓ VERIFIED | Confirmed via live DB query — all 6 keys (`events.*`, `studio.*`, `stays.govt_levy_pct`, `marketplace.platform_fee_pct`) non-null with expected values |
| `backend/src/modules/tour-bookings/tour-settlement.service.ts` | Delegates fan-out to `SettlementService` (D-01 proof) | ✓ VERIFIED | `grep` confirms `this.settlementService.settle(` at line 240, `module: 'tour_booking'`, `refSuffix: \`V-${r.idx}\`` — legacy reference format preserved; `ensureSystemWallet`/`systemWalletId`/`SYSTEM_USER_ID` removed |
| `backend/src/modules/marketplace/marketplace.service.ts` | `handleOrderPayment` settles vendor+Ministry | ✓ VERIFIED | `@OnEvent('payment.order_payment')` + `settlementService.settle()`, WR-04/WR-07 fixes present |
| `backend/src/modules/events/events.service.ts` | `handleTicketPayment` settles organiser+Ministry+platform | ✓ VERIFIED | `@OnEvent('payment.ticket_purchase')` + `settlementService.settle()`, WR-04 fix present |
| `backend/src/modules/studio/studio.service.ts` | `handleStudioPayment` settles Ministry (2-way) | ✓ VERIFIED | `@OnEvent('payment.studio_booking')` + `settlementService.settle()`, WR-04 fix present |
| `backend/src/modules/stays/stays.service.ts` | `releaseEscrow()` N-way fan-out + `@OnEvent` dual-wire | ✓ VERIFIED | `@OnEvent('payment.stay_booking')` present; `releaseEscrow` uses `settlementService.settle()`, WR-05 fix present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `common.module.ts` | `settlement.service.ts` | providers + exports (`@Global()`) | WIRED | Confirmed by grep + injectable in all 5 caller modules without local re-registration |
| `tour-settlement.service.ts` | `settlement.service.ts` | `this.settlementService.settle(...)` | WIRED | 12/12 pre-existing Tour scenarios pass unmodified through the delegation |
| `marketplace.service.ts` | `settlement.service.ts` | `@OnEvent` + `settlementService.settle(...)` | WIRED | Test coverage asserts recipient amounts match `Order.vendorPayout`/`govtLevy` |
| `events.service.ts` | PlatformConfig `events.platform_fee_pct`/`govt_levy_pct` | `prisma.platformConfig.findUnique` | WIRED | Confirmed live in DB (0.10/0.05), read (never hardcoded as primary source) |
| `studio.service.ts` | PlatformConfig `studio.platform_fee_pct`/`govt_levy_pct` | `prisma.platformConfig.findUnique` | WIRED | Confirmed live in DB (0.10/0.05) |
| `stays.service.ts` | `Booking.govtLevyPct` | row-level snapshot read at `releaseEscrow()` | WIRED | Confirmed live DB column; snapshot-not-live-read pattern (D-11) verified in source |
| `settlement.controller.ts` | `settlement.service.ts` | `settlementService.getStatement(...)` | WIRED | Confirmed by grep + controller spec |

### Behavioral Spot-Checks / Automated Verification

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend test suite green | `cd backend && npm test` | 42 suites passed, 505 tests passed, 0 failures | ✓ PASS |
| TypeScript compiles clean | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | Exit 0, no output | ✓ PASS |
| Settlement/Tour/Controller specs isolated re-run | `npx jest settlement.service.spec.ts settlement.controller.spec.ts tour-settlement.service.spec.ts` | 3 suites, 37 tests passed | ✓ PASS |
| Ministry wallet live in DB | Prisma query against `iseyaa_dev` | Non-null `PlatformConfig` value resolving to a real User+Wallet pair | ✓ PASS |
| 6 fee/levy PlatformConfig keys live in DB | Prisma query against `iseyaa_dev` | All 6 keys non-null with documented values | ✓ PASS |
| `Booking.govtLevyPct` live DB column | `information_schema.columns` query | Column present | ✓ PASS |
| No debt-marker anti-patterns in phase-modified files | grep TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | 0 matches across all 8 core phase files | ✓ PASS |

### Code Review Fix Verification (12-REVIEW.md findings, applied after SUMMARY.md files were written)

| Finding | Fix Required | Status | Evidence |
|---------|-------------|--------|----------|
| CR-01 (Critical) | Canonicalize `SELECT FOR UPDATE` lock order to prevent deadlock-induced spurious refunds | ✓ FIXED | `settlement.service.ts:158-165` sorts recipients by `walletId` before the locking loop, separately from credit-row creation order |
| WR-01 | Narrow `P2002` catch to the `reference` constraint specifically | ✓ FIXED | `settlement.service.ts:243-247` checks `err.meta?.target` includes `'reference'` |
| WR-02 | Floor/sanity check on recipient/platform amounts | ✓ FIXED | `settlement.service.ts:108-116, 138-144` reject negative recipient amounts and materially-negative platform commission |
| WR-03 | `RefundService` should branch on gateway for WALLET-originated settlements | ✓ FIXED | `refund.service.ts:82-134` branches on `isWalletGateway`, credits the buyer wallet back directly instead of calling Paystack |
| WR-04 | Gate post-settlement side effects on `status === 'SETTLED'` | ✓ FIXED | All three callers (marketplace, events, studio) check `settlementResult.status === 'SETTLED'` before sending notifications |
| WR-05 | Escrow reference needs more entropy (32-bit collision risk) | ✓ FIXED | `stays.service.ts:345` uses 16 hex chars (64 bits), hyphens stripped |
| WR-06 | `LGA_ADMIN` should be scoped to their own LGA, not state-wide | ✓ FIXED | `settlement.controller.ts:69-84` cross-checks admin's `lgaId` against target wallet owner's `lgaId`, throws `ForbiddenException` on mismatch |
| WR-07 | Marketplace fee key un-namespaced and never seeded | ✓ FIXED | `marketplace.service.ts:193` uses `marketplace.platform_fee_pct` (confirmed live in DB: 0.10) |
| WR-08 | `dateFrom`/`dateTo` unvalidated before `new Date()` | ✓ FIXED | `settlement.controller.ts:56-61` throws `BadRequestException` on invalid ISO date strings |

All 9 findings (1 Critical, 8 Warning) from `12-REVIEW.md` are confirmed present in the shipped code — the SUMMARY.md files predate these fixes, but direct source inspection confirms they are live.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| SETTLE-01 | 12-01, 12-03, 12-09 | Shared `SettlementService` generalizes Tour's pattern | ✓ SATISFIED | `settlement.service.ts` + `tour-settlement.service.ts` delegation, proven by 5 live callers and full-suite regression |
| SETTLE-02 | 12-01, 12-02 | Standing Ministry wallet via `tour.government_wallet_user_id` | ✓ SATISFIED | Live DB row confirmed |
| SETTLE-05 | 12-02, 12-07 | Stays `releaseEscrow()` fix (govtLevyPct applied) | ✓ SATISFIED | Live DB column + code + regression test (`42750` not `45000`) |
| SETTLE-06 | 12-02, 12-04, 12-05, 12-06, 12-07 | Marketplace/Events/Studio (+ Stays, D-05) working `@OnEvent` consumers | ✓ SATISFIED | All 4 modules dual-wired and tested |
| SETTLE-07 | 12-08 | Per-recipient itemized settlement statement | ✓ SATISFIED | `GET /settlements/statement`, IDOR-proof, LGA-scoped |
| SETTLE-08 | 12-01, 12-09 | N-way split sums exactly, zero drift | ✓ SATISFIED | Scenario C parametrized test across 5 non-round amounts |

No orphaned requirements — REQUIREMENTS.md maps SETTLE-03/04/09 to Phase 13 (confirmed out of scope for this phase per ROADMAP.md's requirement-to-phase table), and all of SETTLE-01/02/05/06/07/08 are claimed by at least one Phase 12 plan.

### Anti-Patterns Found

None. Grep scan for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` across all 8 core phase-modified files (`settlement.service.ts`, `settlement.controller.ts`, `refund.service.ts`, `tour-settlement.service.ts`, `marketplace.service.ts`, `events.service.ts`, `studio.service.ts`, `stays.service.ts`) returned zero matches.

One pre-existing (not caused by this phase) dead-test-code item is logged in `deferred-items.md`: `wallet-invariant.e2e-spec.ts` doesn't match the Jest `testRegex` (hyphen before `spec`, not a dot) and is never executed by CI. This predates Phase 12, is not part of any phase 12 plan's `files_modified`, and does not affect the phase goal — recorded as informational only, not a gap.

### Human Verification Required

None. This phase is explicitly `UI hint: no` (backend/API only per CONTEXT.md) — every observable truth is verifiable through automated tests and direct database/source inspection, which was performed. No visual, real-time, or external-service-dependent behavior requires human judgment for this phase's scope.

### Gaps Summary

No gaps. All 6 ROADMAP success criteria are verified against live source code and a live database, not just SUMMARY.md narrative. The full backend test suite (42 suites / 505 tests) is green, TypeScript compiles clean, and all 9 code-review findings (1 Critical CR-01 deadlock/spurious-refund fix, 8 Warnings) from `12-REVIEW.md` — which were fixed in commits after the plan SUMMARY.md files were written — are confirmed present in the current shipped source via direct file inspection, not assumed from commit messages.

---

_Verified: 2026-07-17T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
