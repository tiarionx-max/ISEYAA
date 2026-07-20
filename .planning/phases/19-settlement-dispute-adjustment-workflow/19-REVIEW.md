---
phase: 19-settlement-dispute-adjustment-workflow
reviewed: 2026-07-20T11:20:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - backend/package.json
  - backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql
  - backend/prisma/migrations/20260720040000_settlement_dispute_partial_unique_active/migration.sql
  - backend/prisma/schema.prisma
  - backend/src/app.module.ts
  - backend/src/common/services/__tests__/settlement.service.spec.ts
  - backend/src/common/services/settlement.service.ts
  - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.e2e-spec.ts
  - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
  - backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts
  - backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.controller.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.module.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 19: Code Review Report (Full Re-Review After Gap-Closure Plan 19-05)

**Reviewed:** 2026-07-20T11:20:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Full re-review of the Settlement Dispute & Adjustment Workflow after gap-closure plan 19-05,
which claimed to close three prior CRITICAL findings from the original `19-REVIEW.md`:
CR-01 (money-conservation gap — platform wallet never adjusted), CR-02 (TOCTOU race on
"one active dispute per settlement"), and CR-03 (no `module` cross-check in `raise()`).

**All three of those specific fixes were verified present and correct:**
- **CR-02 (fixed):** DB-level partial unique index `settlement_disputes_active_per_reference`
  (`20260720040000_settlement_dispute_partial_unique_active/migration.sql`) backstops the
  in-app `findFirst` precheck in `raise()`; the resulting `P2002` is translated into the same
  `ConflictException` as the precheck, closing the race.
- **CR-03 (fixed):** `raise()` now compares `dto.module` against
  `(original.metadata as any)?.module` and rejects a mismatch with `BadRequestException`,
  while tolerating legacy rows with no recorded module (verified by test).
- **CR-01 (fixed for the case it targeted):** the platform wallet's own compensating line is
  now derived via the self-balancing formula
  `correctPlatformTotal = chargeAmountNgn - correctEarnerTotal - correctMinistryTotal` (never
  the nullable `platformPct` directly) and is pushed into `lines` whenever non-negligible.

All 78 relevant unit/e2e tests pass (`settlement-disputes.service.spec.ts`,
`settlement-disputes.e2e-spec.ts`, `settlement.service.spec.ts`) and `tsc --noEmit` is clean.

**However, this re-review found that the underlying root cause of CR-01 was only partially
closed.** `computeAdjustmentLines()` still silently drops a category's corrected delta (with no
compensating adjustment anywhere) whenever that category has no *actual* wallet-bearing
Transaction row to receive it — while `correctPlatformTotal`'s formula unconditionally
subtracts that category's full corrected total regardless of whether it was actually
deliverable. This reproduces the exact same class of ledger-imbalance bug the original CR-01
fix addressed for the platform side, just triggered from the ministry/earner side instead. It
is written up below as a new CR-01 finding (superseding/extending the closed one), since it is
not covered by any existing test and is otherwise indistinguishable in severity from the
originally-reported CR-01. Several warning/info items from the original review that were out
of gap-closure scope remain open and are carried forward unchanged.

## Critical Issues

### CR-01: `computeAdjustmentLines()` still leaks money when a recipient category has no persisted wallet row to receive its correction

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:259-317`

**Issue:**
The gap-closure fix correctly made the platform's own correction self-balancing
(`correctPlatformTotal = chargeAmountNgn - correctEarnerTotal - correctMinistryTotal`), and
correctly guards *pushing* a line on whether a destination wallet is actually known
(`ministryRow?.walletId`, `earnerRowsWithWallet.length > 0 && actualEarnerTotal > 0`). But
those two things are inconsistent with each other: **`correctPlatformTotal`'s subtraction is
unconditional**, while the corresponding ministry/earner line is only pushed when there is a
concrete wallet to receive it. Whenever a category is owed a nonzero correction but has no
matching original Transaction row (or, for earners, a total of exactly `0`), the correction is
subtracted out of the platform's total but never lands anywhere — `sum(lines[].deltaNgn)` ends
up nonzero and `adjust()` faithfully applies an unbalanced set of debits/credits, destroying (or
manufacturing) real money.

There are three independent trigger paths for this, all in the same function:

1. **No `ministryRow` at all** (line 279: `if (ministryRow?.walletId && ...)`) — plausible
   whenever a settlement was originally recorded without a ministry-tagged recipient (e.g. the
   ministry wallet was unconfigured at settle-time — `resolveMinistryWallet()` explicitly
   documents that it "may resolve `null`"), and the *currently active* `SettlementSplitTier`
   used for the correction now assigns `ministryPct` a nonzero share. This is exactly the
   scenario this feature exists for: correcting a settlement made under an old/wrong tier.
2. **No `earnerRowsWithWallet` at all** (line 284-288: guarded by
   `earnerRowsWithWallet.length > 0`) — the symmetric case for a multi-vendor (e.g. Tour)
   settlement where every earner recipient had an unresolved/`null` wallet at settle-time.
3. **`earnerRowsWithWallet` present but `actualEarnerTotal === 0`** (same guard,
   `actualEarnerTotal > 0`) — e.g. a fully-comped/promotional booking where the earner's
   original row legitimately recorded `amountNgn: 0`, but the corrected split now assigns a
   nonzero earner share. The proportional-distribution loop divides by `actualEarnerTotal`
   (line 292: `Number(row.amount) / actualEarnerTotal`), so this branch is skipped entirely to
   avoid a division by zero — but the correction is dropped, not redistributed evenly.

Worked example for trigger path 1: a `transport` settlement originally settled DRIVER ₦9,500 +
PLATFORM ₦500 on a ₦10,000 charge, with no MINISTRY row. An admin later updates the `transport`
`SettlementSplitTier` to `earnerPct: 0.85, ministryPct: 0.05, platformPct: 0.10` and resolves a
dispute against that settlement:

```
chargeAmountNgn        = 10000
correctEarnerTotal      = 8500   actualEarnerTotal   = 9500  -> earnerDelta   = -1000 (pushed)
correctMinistryTotal    =  500   actualMinistryTotal =    0  -> ministryDelta =  500  (DROPPED — no ministryRow)
correctPlatformTotal    = 10000 - 8500 - 500 = 1000
actualPlatformTotal     =  500                              -> platformDelta =  500  (pushed)

lines = [ {DRIVER, -1000}, {PLATFORM, +500} ]
sum(lines.deltaNgn) = -1000 + 500 = -500   // must be 0
```

`adjust()` applies exactly these two lines: the driver is debited ₦1,000 and the platform is
credited only ₦500, ending at exactly `correctPlatformTotal` (₦1,000) as though the ministry had
already been paid its ₦500 — which it never was, and which no wallet in the system now holds.
₦500 has been destroyed from the ledger with no error, warning, or `BLOCKED` state raised. This
is not covered by any existing test: every current test fixture happens to include a
wallet-bearing row for every category the resolved split assigns a nonzero percentage to, which
is precisely why this variant of the bug survived the CR-01 fix.

**Fix:** Do not let `correctPlatformTotal` "claim" a category's corrected total unless there is
an actual wallet that will receive the corresponding line for it — mirror `settle()`'s own
semantics, where any recipient with no resolvable wallet has its share rolled into the platform
commission instead of vanishing:

```typescript
// A category's corrected total is only "delivered" if a wallet exists to receive it —
// otherwise it stays with the platform (mirrors settle()'s own unresolved-recipient
// roll-up), so correctPlatformTotal never claims a share nobody will actually get.
const ministryDelivered = ministryRow?.walletId;
const earnerDelivered = earnerRowsWithWallet.length > 0 && actualEarnerTotal > 0;

const correctPlatformTotal =
  Math.round(
    (chargeAmountNgn
      - (earnerDelivered ? correctEarnerTotal : actualEarnerTotal)
      - (ministryDelivered ? correctMinistryTotal : actualMinistryTotal)) * 100,
  ) / 100;
```

At minimum, add a regression test for each of the three trigger paths above that asserts
`sum(lines.map(l => l.deltaNgn)) === 0` — mirroring the money-conservation assertions the 19-05
gap-closure already added for the platform-side case. Consider also whether silently retaining
an owed-but-undeliverable ministry/earner share on the platform wallet is the right product
behavior, versus raising to `BLOCKED` so a SUPER_ADMIN is forced to resolve the missing-wallet
condition before any partial adjustment is posted.

## Warnings

### WR-01: `raise()`'s settlement-existence check does not filter `status: 'SUCCESS'`

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:90-96`

**Issue:** The precheck in `raise()` —

```typescript
const original = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${dto.settlementReference}-` } },
  select: { id: true, metadata: true },
});
```

— has no `status: 'SUCCESS'` filter, unlike `computeAdjustmentLines()`'s equivalent query
(`settlement-disputes.service.ts:247-254`, which explicitly filters `status: 'SUCCESS'`). A
dispute can therefore be successfully raised (`201 Created`) against a `settlementReference`
whose only matching rows are `FAILED`/`PENDING`/`REVERSED` — a settlement that never actually
completed. The dispute is then stuck: calling `resolve()` on it throws an uncaught
`NotFoundException` out of `computeAdjustmentLines()` ("No settled Transaction rows found..."),
surfacing as a confusing 404 on an already-created OPEN dispute rather than `raise()` rejecting
it up front with its own "no settlement found" 404.

**Fix:** Add `status: 'SUCCESS'` to `raise()`'s existence check, matching
`computeAdjustmentLines()`'s stricter filter.

### WR-02: Lost-update race across the dispute state machine's non-atomic transitions

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:202-220, 328-412, 421-444`

**Issue:** `moveToReview()`, `resolve()`, and `dismiss()` each follow a `findUnique` →
in-process status check → `update()` sequence with no `WHERE status = <expected>` guard on the
final write and no optimistic-lock version column. Two concurrent SUPER_ADMIN requests against
the *same* dispute id (e.g. one operator calls `/resolve` while another calls `/dismiss` in the
same request window) can both pass their own initial status check and both proceed to write.
`adjust()` itself is idempotent/atomic, so no double financial application can occur — but the
`SettlementDispute` row's own bookkeeping is not protected: whichever `update()` lands last wins,
and since each transition's `update()` payload only sets the fields relevant to that transition
(`dismiss()` never touches `adjustmentReference`), the row can end up `status: 'DISMISSED'` while
`adjustmentReference` remains set from a concurrently-completed `resolve()` — i.e. the audit
record claims "no adjustment was warranted" while a real compensating transaction was actually
posted. The CR-02 partial unique index only protects "at most one active dispute per
`settlementReference`"; it does not protect a single dispute row's own transition consistency.

**Fix:** Add a status-guarded conditional update (e.g. Prisma `updateMany` with
`where: { id, status: { in: [...expectedStatuses] } }`, verifying `count === 1` before treating
the transition as applied) to `moveToReview()`/`resolve()`/`dismiss()`.

### WR-03: `GET /admin/settlement-disputes/queue`'s `status` query param is unvalidated

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts:81-87`, `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:156-179`

**Issue:** `@Query('status') status?: string` accepts any string and is passed straight into
`findQueue()`'s Prisma `where: { status }` with no validation against the known 5-value set
(`OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED`). Not exploitable (Prisma parameterizes the
query), but a typo'd status (e.g. `?status=OPEND`) silently returns an empty paginated result
instead of a `400`, making the mistake hard to notice from admin tooling. (Carried over from the
original review — not in gap-closure 19-05's scope.)

**Fix:** Validate `status` against the known set (e.g. a small `@IsIn([...])`-decorated query
DTO, or an explicit check that throws `BadRequestException` for unrecognized values).

### WR-04: `RaiseDisputeDto` fields accept empty strings and unbounded/negative values

**File:** `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts:29-54`

**Issue:** `settlementReference` and `reason` are validated only with `@IsString()` (plus
`@MaxLength(1000)` on `reason`), so both accept `""` — meaningless for an audit-trail field that
exists specifically to justify a financial correction, and `settlementReference: ""` is fed
directly into a `startsWith` Prisma filter. `settlementReference` also has no `@MaxLength` bound,
unlike `reason`/`resolution` elsewhere in the same feature. Separately, `requestedAdjustmentNgn`
(`@IsNumber()` only) accepts negative values despite being purely informational display data.
(Carried over from the original review — not in gap-closure 19-05's scope.)

**Fix:** Add `@IsNotEmpty()` to `settlementReference` and `reason`, a `@MaxLength` bound to
`settlementReference`, and `@Min(0)` to `requestedAdjustmentNgn`.

## Info

### IN-01: `getQueue()`'s `page`/`limit` params are typed optional despite `DefaultValuePipe` guaranteeing they're always defined

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts:81-87`

**Issue:** `@Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number` — the
`DefaultValuePipe` guarantees `page`/`limit` are always defined by the time the handler body
runs, so the `?` optional modifier is misleading; the service also independently re-defaults via
`opts.page ?? 1`, making the controller-level default redundant either way. (Carried over,
unchanged since the original review.)

**Fix:** Drop the `?` (`page: number`), or drop `DefaultValuePipe` and let the service's own
defaulting be the single source of truth.

### IN-02: `computeAdjustmentLines()` is public purely to support direct unit testing, bypassing the controller's authorization boundary

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:222-243`

**Issue:** The comment above it ("INTERNAL — exposed for the spec and for resolve()")
acknowledges this trade-off. There is no authorization check inside the service itself (by
documented design — SUPER_ADMIN-only enforcement lives entirely at the controller), so any
future code that imports `SettlementDisputesService` and calls this method directly bypasses
that boundary entirely. Not exploitable today since nothing else calls it. (Carried over,
unchanged since the original review.)

**Fix:** No action required now; consider `@internal` JSDoc tagging, or a cast-based test access
pattern, if stricter encapsulation is ever desired.

### IN-03: `resolveSplit()` ignores its `amountNgn` parameter, so amount-tiered splits are silently unsupported by dispute resolution too

**File:** `backend/src/common/services/settlement.service.ts:513-539`

**Issue:** Pre-existing from an earlier phase (not introduced by Phase 19), but directly
consumed by `computeAdjustmentLines()` (`settlement-disputes.service.ts:267-270`).
`resolveSplit(module, amountNgn)` never references `amountNgn` in its `where` clause — it always
fetches the single `tierName: 'default'` row regardless of the schema's `minAmountNgn`/
`maxAmountNgn` fields (`schema.prisma:700-701`). If amount-tiered splits are ever configured,
both original settlement and dispute-resolution adjustments will silently use the same (wrong)
tier. (Carried over — flagged again here only because this phase's `computeAdjustmentLines()`
inherits the same limitation.)

**Fix:** Out of scope for this phase; flag for whoever implements amount-tiered splits.

### IN-04: `SettlementDispute.status` is an unconstrained `String` column, not a Prisma enum

**File:** `backend/prisma/schema.prisma:1138`

**Issue:** The 5-value status contract (`OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED`) is
enforced only by application code and comments, not by the schema — mirrors the existing
`AdminReviewFlag.status` precedent, so this is a consistent project pattern rather than a
regression. It does mean any future raw SQL, seed script, or direct-write admin tooling against
this table can produce an out-of-range status value with no DB-level rejection.

**Fix:** Optional/low-priority — consider a Prisma enum in a future phase only if direct-write
tooling against this table becomes common; not blocking given the existing project-wide
precedent.

---

_Reviewed: 2026-07-20T11:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
