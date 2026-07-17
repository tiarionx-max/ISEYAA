---
phase: 12-settlement-engine-foundation
reviewed: 2026-07-17T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - backend/src/common/services/settlement.service.ts
  - backend/src/common/services/__tests__/settlement.service.spec.ts
  - backend/src/common/common.module.ts
  - backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql
  - backend/prisma/schema.prisma
  - backend/prisma/seed.ts
  - backend/src/modules/tour-bookings/tour-settlement.service.ts
  - backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts
  - backend/src/modules/marketplace/marketplace.service.ts
  - backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
  - backend/src/modules/marketplace/__tests__/marketplace-isolation.spec.ts
  - backend/src/modules/events/events.service.ts
  - backend/src/modules/events/__tests__/events.service.spec.ts
  - backend/src/modules/studio/studio.service.ts
  - backend/src/modules/studio/__tests__/studio.service.spec.ts
  - backend/src/modules/stays/stays.service.ts
  - backend/src/modules/stays/__tests__/stays.service.spec.ts
  - backend/src/modules/stays/__tests__/stays-isolation.spec.ts
  - backend/src/common/controllers/settlement.controller.ts
  - backend/src/common/controllers/__tests__/settlement.controller.spec.ts
findings:
  critical: 1
  warning: 8
  info: 2
  total: 11
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19 (18 listed + `backend/src/common/services/refund.service.ts` read for context, not counted toward `files_reviewed`)
**Status:** issues_found

## Summary

`SettlementService` (12-01) is a well-designed, heavily-tested generalization of the Tour settlement primitives: the idempotency precheck + in-transaction `P2002` race fallback (Pitfall 1) is correctly implemented and proven by Scenario F in the spec, `resolveMinistryWallet()` genuinely never caches (Scenario I), and the drift-tolerance math is sound for the current 2-recipient call patterns (marketplace, events, studio, stays escrow, tour). The IDOR mitigation on `GET /settlements/statement` is solid and directly tested (self-scoping is enforced server-side regardless of a client-supplied `walletId`).

However, one correctness gap in the core locking discipline is serious enough to block: `SELECT ... FOR UPDATE` is issued in caller-supplied recipient-array order with no canonical ordering, which is a classic Postgres deadlock setup once two different modules (or two different `TourPackage.settlementSplit` orderings sharing a guide/organiser/host) lock overlapping wallets concurrently in different orders — and the failure mode is a **spurious buyer refund on a payment that should have settled cleanly**. Several other findings below are latent risks in the shared engine that aren't reachable by today's five call sites but should be closed before more callers are added on top of this foundation, per its own "generalized, caller-agnostic" design goal.

## Critical Issues

### CR-01: SELECT FOR UPDATE lock order is caller-controlled, not canonicalized — deadlock risk causes spurious refunds on valid payments

**File:** `backend/src/common/services/settlement.service.ts:125-134` (recipient lock loop), `:158-164` (system wallet lock)
**Also affects:** `backend/src/modules/tour-bookings/tour-settlement.service.ts:217-227` (recipients built directly from `snapshot.settlementSplit` array order — an admin/vendor-controlled JSON field, not sorted)

**Issue:** Inside the single `$transaction`, `settle()` locks recipient wallets in the exact order they appear in `input.recipients` (filtered to those with a `walletId`), then locks the system wallet last:

```ts
for (const r of input.recipients.filter((x) => x.walletId)) {
  await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
  ...
}
await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${this.systemWalletId} FOR UPDATE`;
```

There is no sort/canonical ordering of the recipient wallet IDs before locking. The system wallet is always last, so that part is safe, but recipient-to-recipient ordering is whatever the caller passed in. For `TourSettlementService`, that order is literally `snapshot.settlementSplit` — a JSON array captured from `TourPackage.settlementSplit`, which different tour packages can list in different orders (e.g. Package A: `[ORGANISER, GUIDE]`, Package B: `[GUIDE, ORGANISER]` — plausible when the same organiser/guide pair is reused across multiple packages). If bookings against Package A and Package B settle concurrently and share both the guide's and the organiser's wallet, transaction A locks `wallet(ORGANISER)` then blocks on `wallet(GUIDE)`; transaction B locks `wallet(GUIDE)` then blocks on `wallet(ORGANISER)` — classic deadlock. Postgres's deadlock detector aborts one side with a raw error that is **not** a `P2002` (`Prisma.PrismaClientKnownRequestError` with code `P2002` is the only error type special-cased in the `catch` block at lines 193-200). The deadlock error falls through to `handleSettlementFailure()`, which calls `RefundService.refund()` — refunding a buyer whose payment should have settled successfully, purely because of transient lock contention that a retry (or a canonical lock order) would have resolved without ever refunding anyone.

**Fix:** Sort recipients (and, if a buyer-wallet debit is ever added for `gateway: 'WALLET'`, include the buyer wallet in the same sort) by `walletId` before the locking loop, so every concurrent `settle()` call acquires locks in one global, deterministic order:

```ts
const sortedRecipients = [...input.recipients]
  .filter((x) => x.walletId)
  .sort((a, b) => (a.walletId! < b.walletId! ? -1 : a.walletId! > b.walletId! ? 1 : 0));

for (const r of sortedRecipients) {
  await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
  ...
}
```
(Recipient-credit rows can still be created/ordered by the original array for reference-suffix purposes — only the *locking* order needs to be canonicalized.)

## Warnings

### WR-01: Broad `P2002` catch conflates any unique-constraint violation with a benign duplicate-delivery replay

**File:** `backend/src/common/services/settlement.service.ts:193-200`

**Issue:**
```ts
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
  this.logger.warn(...);
  return { status: 'REPLAYED', platformAmountNgn: 0, recipientCredits: [] };
}
```
This treats *any* `P2002` inside the transaction as "safe, already-settled — no-op." It doesn't inspect `err.meta?.target` to confirm the violated constraint is actually `Transaction.reference`. Concretely: if a caller ever supplies two recipients with the same `refSuffix` (a caller bug, not a race), the second `tx.transaction.create()` throws `P2002` on the `reference` unique constraint, the whole `$transaction` rolls back (nothing is persisted — not even the first recipient's genuinely-earned credit), and the code reports `REPLAYED` as if this were a harmless duplicate delivery. The caller's `onSettled` (which flips `ticket.status → ISSUED`, `order.status → PROCESSING`, etc.) never runs because that code path returns before entering the transaction on this branch too. The net effect: the buyer's Paystack charge succeeded, but the domain record is silently left `PENDING` forever while the system believes settlement already happened. Today's five call sites all use distinct hardcoded `refSuffix` values (so this isn't currently reachable), but this is the shared, reusable primitive other 12-0x modules build on, and the failure mode is invisible (no exception surfaces, no alert fires).

**Fix:** Narrow the check to the specific constraint this fallback is designed for:
```ts
const target = (err.meta?.target as string[] | string | undefined) ?? '';
const isReferenceConflict = Array.isArray(target) ? target.includes('reference') : String(target).includes('reference');
if (err.code === 'P2002' && isReferenceConflict) { ... }
```

### WR-02: No floor/sanity check on recipient or platform commission amounts

**File:** `backend/src/common/services/settlement.service.ts:105-118, 132-134`

**Issue:** `settle()` validates only that total drift is within ±₦0.02 of the charged amount; it never asserts `r.amountNgn >= 0` for any recipient, nor `platformAmountNgn >= 0`. If an upstream `PlatformConfig` percentage is misconfigured (e.g. `govtLevyPct + platformFeePct > 1` for an order, or a `TourPackage.settlementSplit` entry with a negative percentage), a caller can compute a negative `amountNgn` for a recipient. `settle()` will happily create a `type: 'CREDIT'` transaction row with a negative `amount` and apply `after = before + r.amountNgn`, silently reducing that wallet's balance under the wrong transaction semantics, with no guard preventing it.

**Fix:** Add a defensive assert in `settle()` before entering the transaction:
```ts
for (const r of input.recipients) {
  if (r.amountNgn < 0) throw new Error(`Negative recipient amount for ${r.tag} (${r.refSuffix})`);
}
if (platformAmountNgn < 0) throw new Error(`Negative platform commission (module=${input.module})`);
```

### WR-03: `RefundService.refund()` always calls the Paystack refund API, regardless of the original settlement's gateway

**File:** `backend/src/common/services/refund.service.ts:76-80`, in conjunction with `SettlementGateway` including `'WALLET'` in `backend/src/common/services/settlement.service.ts:32`

**Issue:** `RefundService.refund()` unconditionally calls `this.paystack.refundCharge(...)`. None of today's callers pass `gateway: 'WALLET'` (all use `'PAYSTACK'` or `'INTERNAL'` with no `buyerWalletId`), so this is currently unreachable — but the type signature explicitly advertises `'WALLET'` as a supported gateway. If a future caller settles an in-app-wallet-funded payment (debiting the buyer's wallet before calling `settle()`) and the settlement subsequently fails, `handleSettlementFailure()` will call `refund()`, which will call Paystack with a reference that was never a real Paystack charge, fail, and — per the documented "don't mask the original error" behavior — be silently logged and swallowed. The buyer's wallet, already debited, is never credited back. This is explicitly called out as "out of scope for this service" in the `RefundService` doc comment, but that leaves a live landmine for the next caller who exercises the `'WALLET'` gateway value that already exists in the shared type.

**Fix:** Either remove `'WALLET'` from `SettlementGateway` until a wallet-credit-back path exists in `RefundService`, or branch on `input.gateway`/an explicit `refundMethod` and implement a wallet-credit fallback before any caller is wired to use it.

### WR-04: Settlement callers never check `SettlementResult.status`, so REPLAYED results still trigger customer-facing side effects

**File:** `backend/src/modules/events/events.service.ts:260-310`, `backend/src/modules/marketplace/marketplace.service.ts:281-325`, `backend/src/modules/studio/studio.service.ts:182-223`

**Issue:** All three webhook handlers call `await this.settlementService.settle({...})` and then unconditionally proceed to notify the customer (`sendTicketConfirmation`, `notifyOrderUpdate`, `sendStudioBookingConfirmation`) without inspecting the returned `status`. Under a duplicate webhook delivery race (Paystack redelivers, or both the in-process `EventEmitter2` handler and a Kafka consumer fire for the same event), the outer `status !== 'PENDING'` guard can pass for both deliveries before either commits, `settle()` correctly de-duplicates the wallet-side effects via the `REPLAYED`/`P2002` paths, but the notification code after it still runs — sending duplicate confirmation emails/QR regenerations to the same buyer.

**Fix:** Gate the post-settlement side effects on `result.status === 'SETTLED'`:
```ts
const result = await this.settlementService.settle({ ... });
if (result.status === 'SETTLED' && ticket.user.email) {
  await this.sendgrid.sendTicketConfirmation({ ... });
}
```

### WR-05: Escrow release reference has only 32 bits of entropy and now doubles as the settlement idempotency key

**File:** `backend/src/modules/stays/stays.service.ts:340`

**Issue:**
```ts
const reference = `ISY-ESC-${booking.id.slice(0, 8).toUpperCase()}`;
```
This matches the documented naming convention (`ISY-ESC-<8-char-uppercase>`), but `SettlementService.settle()`'s idempotency precheck is a `startsWith` match on this exact reference. Slicing a UUID to 8 hex characters yields only 32 bits of entropy; at platform scale (birthday-paradox territory around tens of thousands of escrow releases), two different `booking.id`s can produce the same 8-char prefix. When that happens, the *second* booking's escrow release is misidentified as an already-settled replay of the first: the host is never paid, `escrowReleasedAt` is never set on the second booking, and the `@Cron(EVERY_HOUR)` job will keep re-selecting it and re-hitting the same false-replay outcome indefinitely, with no alert.

**Fix:** Derive the escrow reference from the full booking UUID (or a longer slice, e.g. 16+ hex chars) rather than the first 8 characters, since this reference is now load-bearing for financial idempotency, not just a display label.

### WR-06: `LGA_ADMIN` can view any wallet's itemized statement platform-wide, not just wallets in their LGA

**File:** `backend/src/common/controllers/settlement.controller.ts:45-56`

**Issue:**
```ts
const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.LGA_ADMIN;
let targetWalletId: string;
if (isAdmin && walletId) {
  targetWalletId = walletId;
}
```
Both `SUPER_ADMIN` and `LGA_ADMIN` are treated identically here: either role can pass an arbitrary `walletId` and retrieve any recipient's full itemized settlement history, with no check that the target wallet's owner belongs to the LGA the admin administers. Elsewhere in the codebase `LGA_ADMIN` is a scoped role (e.g. `AdminReviewFlag.assignedTo` comments describe it as "LGA_ADMIN userId" for LGA-scoped review handling). This endpoint gives `LGA_ADMIN` state-wide financial visibility, which is broader authorization than the role name implies and is not covered by any test in `settlement.controller.spec.ts` (both admin tests use the same unrestricted-access assertion for `SUPER_ADMIN` and `LGA_ADMIN`).

**Fix:** For `LGA_ADMIN`, resolve the target wallet's owning user's `lgaId` and verify it matches the admin's own `lgaId` before allowing the override; reserve unrestricted cross-LGA access for `SUPER_ADMIN` only.

### WR-07: Marketplace platform fee key is un-namespaced and never seeded — always falls back to the hardcoded 10% default

**File:** `backend/src/modules/marketplace/marketplace.service.ts:190-191`, `backend/prisma/seed.ts` (no `PLATFORM_FEE_PCT` entry)

**Issue:**
```ts
const feeConfig = await this.prisma.platformConfig.findUnique({ where: { key: 'PLATFORM_FEE_PCT' } });
const platformFeePct = feeConfig ? Number(feeConfig.value) : 0.10;
```
Every other module in this phase seeds its fee/levy keys with a `module.key_name` convention (`events.platform_fee_pct`, `events.govt_levy_pct`, `studio.platform_fee_pct`, `studio.govt_levy_pct`, `stays.govt_levy_pct` — all present in `seed.ts` around lines 1444-1502). Marketplace's key, `PLATFORM_FEE_PCT`, breaks that naming convention (also used, confusingly, by an unrelated transport-fee `setConfig` test in `admin.service.spec.ts`) and is never seeded anywhere. In practice this means the "NEVER hardcode" platform-fee constraint (CLAUDE.md) is violated in effect for marketplace: production will always run on the in-code `0.10` fallback until an operator manually creates the `PLATFORM_FEE_PCT` row via the admin config endpoint.

**Fix:** Rename the key to `marketplace.platform_fee_pct` (matching the other modules) and add a seed entry for it, consistent with the other four fee/levy keys already seeded in this phase.

### WR-08: `dateFrom`/`dateTo` query params are passed unvalidated into `new Date(...)`

**File:** `backend/src/common/controllers/settlement.controller.ts:39-58`, `backend/src/common/services/settlement.service.ts:243-260`

**Issue:** The controller accepts raw `@Query('dateFrom')`/`@Query('dateTo')` strings with no `class-validator` DTO (`@IsISO8601()` or similar), and `getStatement()` passes them straight into `new Date(opts.dateFrom)`. An invalid string produces an `Invalid Date`, which Prisma will reject when building the `gte`/`lte` filter, surfacing as an unhandled 500 rather than a clean, client-correctable 400.

**Fix:** Validate with a lightweight query DTO (`@IsOptional() @IsISO8601() dateFrom?: string;`) or add an explicit `isNaN(new Date(...).getTime())` guard in the controller that throws `BadRequestException`.

## Info

### IN-01: `resolveMinistryWallet()` reads a `tour.`-namespaced config key but is now used platform-wide

**File:** `backend/src/common/services/settlement.service.ts:264-271`

**Issue:** `PlatformConfig` key `tour.government_wallet_user_id` is read by `resolveMinistryWallet()`, which is now called generically from `marketplace.service.ts`, `events.service.ts`, `studio.service.ts`, and `stays.service.ts` — none of which are tour-related. The `tour.` prefix is a naming leak from this method's origin in `TourSettlementService` and could mislead a future maintainer into thinking it's tour-scoped configuration only.

**Fix:** Consider renaming the key to a module-neutral name (e.g. `settlement.government_wallet_user_id`) in a follow-up migration, or at minimum document in the seed comment that this key is shared platform-wide, not tour-specific (the current seed comment at `seed.ts:1434-1436` only explains the ATTRACTION-routing rationale, not the cross-module reuse).

### IN-02: Fixed ₦0.02 drift tolerance does not scale with recipient count

**File:** `backend/src/common/services/settlement.service.ts:110-118`

**Issue:** Each recipient's share is independently rounded to the nearest kobo (`Math.round(... * 100) / 100`), so worst-case cumulative rounding error grows roughly linearly with recipient count (~half a kobo per recipient). The drift-tolerance assert is a flat ₦0.02 regardless of how many recipients a given `settle()` call has. Today's call sites cap out at 2 recipients (well within tolerance), but `TourSettlementService` already supports up to 4 (`GUIDE`/`HOST`/`ORGANISER`/`ATTRACTION`), and a future N-way split module could legitimately trip the "drift exceeded — programming error" throw (and the resulting refund) purely from rounding, not a real bug.

**Fix:** Scale the tolerance to recipient count, e.g. `Math.max(0.02, 0.01 * input.recipients.length)`, or document the current fixed cap as an explicit, enforced limit on recipient count.

---

_Reviewed: 2026-07-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
