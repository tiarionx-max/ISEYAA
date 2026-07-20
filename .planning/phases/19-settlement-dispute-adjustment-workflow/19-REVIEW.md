---
phase: 19-settlement-dispute-adjustment-workflow
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - backend/prisma/schema.prisma
  - backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql
  - backend/src/common/services/settlement.service.ts
  - backend/src/common/services/__tests__/settlement.service.spec.ts
  - backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts
  - backend/src/modules/settlement-disputes/dto/resolve-dispute.dto.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
  - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.controller.ts
  - backend/src/modules/settlement-disputes/settlement-disputes.module.ts
  - backend/src/app.module.ts
  - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.e2e-spec.ts
  - backend/package.json
findings:
  critical: 3
  warning: 4
  info: 3
  total: 10
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the Settlement Dispute & Adjustment Workflow (`SettlementService.adjust()` primitive + the new `SettlementDisputesModule`). The state-machine plumbing (raise/queue/review/resolve/dismiss), audit logging, and the `adjust()` transaction/locking/idempotency mechanics are well tested and mirror the existing `settle()` primitive's proven patterns (canonical lock ordering, P2002 replay handling, atomic rollback).

However, tracing the actual money math in `SettlementDisputesService.computeAdjustmentLines()` — the core "diff what was paid against what should have been paid" routine this whole phase exists to implement — surfaces a serious accounting defect: **the derived adjustment lines never touch the platform/system wallet**, so every non-trivial dispute resolution either creates or destroys currency rather than reallocating it between parties. This was not caught by the unit or e2e tests because none of them assert on the platform wallet's balance after an adjustment. Two further correctness/integrity gaps were found in `raise()` (a TOCTOU race on the "one active dispute per settlement" invariant, and no validation that the caller-supplied `module` actually matches the settlement being disputed). All three are Critical and should block merge.

## Critical Issues

### CR-01: `computeAdjustmentLines()` never adjusts the platform/system wallet — adjustments create or destroy money

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:204-267`
**Issue:**
`computeAdjustmentLines()` reconstructs `earnerDeltaTotal` and `ministryDelta` from `resolveSplit()`'s `earnerPct`/`ministryPct`, but **destructures `platformPct` out and never uses it** (line 228: `const { earnerPct, ministryPct } = await this.settlementService.resolveSplit(...)`), and it locates `platformRow` (line 220) purely to *exclude* it from `earnerRows` — it never computes a corresponding platform delta or pushes a line for `platformRow.walletId`.

Concretely, for the service spec's own "single-earner" fixture (lines 251-287 of `settlement-disputes.service.spec.ts`): actual payout was DRIVER 8500 + MINISTRY 500 = 9000 (no platform row in that fixture). Corrected split (90/6/4) implies DRIVER 8100, MINISTRY 540, PLATFORM 360. The code emits `lines = [{MINISTRY: +40}, {DRIVER: -400}]` — net `-360` removed from the wallet ledger with nothing crediting the platform's corrected +360 share. In the e2e happy-path scenario (`settlement-disputes.e2e-spec.ts:235-293`), the original settlement *does* include a `-PLAT` row (created unconditionally by `settle()`), and the corrected split (85/5/10) implies the platform's share should *shrink* from 2100 to 1000 — a −1100 platform debit that is silently skipped, meaning DRIVER (+1000) and MINISTRY (+100) are credited ₦1100 with **no offsetting debit anywhere in the ledger**. Every call to `SettlementService.adjust()` from this code path is therefore unbalanced.

This is exactly the invariant `SettlementService.settle()` enforces defensively (drift-tolerance assert, `settlement.service.ts:160-186`) but `adjust()` performs no such check (by design — see the comment at `settlement.service.ts:341-343`, "every line here is caller-supplied and caller-directed"), so the burden of conservation-of-money falls entirely on the caller. `computeAdjustmentLines()` is the only caller in this phase and does not honor it. Neither `settlement-disputes.service.spec.ts` nor `settlement-disputes.e2e-spec.ts` assert on the platform/system wallet's post-adjustment balance, which is why this shipped without a failing test.

**Fix:** Include the platform wallet in the diff. `platformRow.walletId` is already selected in the query — use it:
```typescript
const platformRow = rows.find((r) => r.reference.endsWith('-PLAT'));
// ...
const correctEarnerTotal = Math.round(chargeAmountNgn * earnerPct * 100) / 100;
const correctMinistryTotal = Math.round(chargeAmountNgn * ministryPct * 100) / 100;
// Platform absorbs whatever's left, mirroring settle()'s own drift-absorption design —
// self-balancing regardless of whether earnerPct+ministryPct+platformPct sums to exactly 1.
const correctPlatformTotal = Math.round((chargeAmountNgn - correctEarnerTotal - correctMinistryTotal) * 100) / 100;
const actualPlatformTotal = platformRow ? Number(platformRow.amount) : 0;
const platformDelta = Math.round((correctPlatformTotal - actualPlatformTotal) * 100) / 100;

if (platformRow?.walletId && Math.abs(platformDelta) >= 0.01) {
  lines.push({ walletId: platformRow.walletId, deltaNgn: platformDelta });
}
```
Add a test asserting `sum(lines.map(l => l.deltaNgn)) === 0` (mirroring `settlement.service.spec.ts`'s Scenario C zero-drift pattern) for every fixture in this spec file, and add a platform-wallet-balance assertion to the e2e spec.

### CR-02: `raise()` has an unenforced TOCTOU race on "one active dispute per settlement"

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:79-118`
**Issue:** The docstring above `raise()` (lines 68-78) explicitly states this exact failure mode must be prevented: *"two concurrent disputes racing to resolve the same settlement could otherwise post two DIFFERENT adjustments, with the second silently REPLAYing onto the first's numbers (T-19-07)."* But the actual guard is a plain, non-atomic `findFirst` (line 88) followed later by `create` (line 99) — no `$transaction`, no advisory lock, and critically no DB-level constraint. Contrast this with `SettlementSplitTier` in the same schema (`schema.prisma:696-720`), which documents and implements a *partial unique index* specifically to close this class of race for an analogous "at most one active row" invariant — that pattern was not applied to `SettlementDispute`, and the migration (`20260720022922_add_settlement_dispute/migration.sql`) creates only plain (non-unique, non-partial) indexes on `status` and `settlementReference`.

Two concurrent `POST /admin/settlement-disputes` calls for the same `settlementReference` will both pass the `activeExisting` check and both `create()` successfully. `SettlementService.adjust()`'s own `Transaction.reference` uniqueness does prevent a literal double financial application (the second `resolve()` call's `adjust()` invocation will hit the `-ADJ-` prefix idempotency precheck or a P2002 fallback and return `REPLAYED`), but both `SettlementDispute` rows are still independently marked `RESOLVED` with the identical `adjustmentReference` (`settlement-disputes.service.ts:320-331`) — even though only one of them actually caused a wallet mutation. For a government financial audit trail, having two dispute records both claim to have resolved the same correction is a data-integrity defect, and it's one the implementer's own comment says is out of scope to allow.

**Fix:** Add a partial unique index (mirroring the `SettlementSplitTier` pattern) via raw SQL in a migration:
```sql
CREATE UNIQUE INDEX "settlement_disputes_active_per_reference"
  ON "settlement_disputes" ("settlementReference")
  WHERE "status" IN ('OPEN', 'IN_REVIEW', 'BLOCKED');
```
and catch the resulting P2002 in `raise()` to translate it into the same `ConflictException` the pre-check already throws, closing the race window.

### CR-03: `raise()` never validates that `dto.module` matches the settlement actually being disputed

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:79-97`
**Issue:** `raise()`'s only existence check is `transaction.findFirst({ where: { reference: { startsWith: `${dto.settlementReference}-` } } })` (line 80-83) — it selects `{ id: true }` only and never compares the found row's `metadata.module` against the caller-supplied `dto.module`. `dto.module` is later persisted verbatim onto the `SettlementDispute` row (line 102) and is what `resolve()` passes into `computeAdjustmentLines(dispute.module, ...)` → `settlementService.resolveSplit(module, chargeAmountNgn)` (settlement.service.ts:513-539) to select the `SettlementSplitTier` used for the entire correction.

If a SUPER_ADMIN selects the wrong module for a given `settlementReference` (a plausible fat-finger error given `module` is a free-choice enum unrelated to how the reference string is structured), `resolveSplit()` silently fetches a completely unrelated tier's `earnerPct`/`ministryPct`, and the resulting adjustment lines (already dubious per CR-01) get computed and applied against the wrong percentages with no server-side guardrail — there's no cross-check anywhere in the request path that would reject this.

**Fix:** In `raise()`, select `metadata` from the found transaction row and validate it matches:
```typescript
const original = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${dto.settlementReference}-` } },
  select: { id: true, metadata: true },
});
if (!original) throw new NotFoundException('No settlement found for this reference');
const recordedModule = (original.metadata as any)?.module;
if (recordedModule && recordedModule !== dto.module) {
  throw new BadRequestException(
    `module mismatch: settlement is recorded under "${recordedModule}", not "${dto.module}"`,
  );
}
```

## Warnings

### WR-01: `RaiseDisputeDto.settlementReference` / `.reason` accept empty strings

**File:** `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts:33-45`
**Issue:** Both fields use only `@IsString()` (plus `@MaxLength(1000)` on `reason`) — `class-validator`'s `@IsString()` accepts `""`. A caller can raise a dispute with `settlementReference: ""` (which then matches `transaction.findFirst({ reference: { startsWith: '-' } })` — unlikely to match anything today, but is an unvalidated degenerate input) or `reason: ""`, which is meaningless for an audit trail entry that exists specifically to justify a financial correction.
**Fix:** Add `@IsNotEmpty()` to both fields.

### WR-02: `RaiseDisputeDto.requestedAdjustmentNgn` has no lower-bound validation

**File:** `backend/src/modules/settlement-disputes/dto/raise-dispute.dto.ts:47-53`
**Issue:** Documented as "informational only," but nothing stops a negative value from being submitted and persisted (`@IsNumber()` allows negatives). Low risk since it's never used to derive the actual adjustment, but a negative "requested adjustment" displayed in an admin queue is misleading noise at best.
**Fix:** Add `@Min(0)`.

### WR-03: Proportional earner-delta distribution silently drops the correction when `actualEarnerTotal === 0`

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:244-264`
**Issue:** The earner-delta distribution branch is gated on `actualEarnerTotal > 0` (line 247) to avoid a division-by-zero on `Number(row.amount) / actualEarnerTotal` (line 253). But if the original settlement legitimately recorded `$0` for every wallet-holding earner row (e.g. a fully-comped/promotional trip where the driver's line was `amountNgn: 0`) and the corrected split says earners should now receive a non-zero share, `earnerDeltaTotal` is silently discarded — no lines are generated for the earner side at all, and no error/log surfaces this. The correction is dropped rather than distributed (e.g. evenly across `earnerRowsWithWallet`).
**Fix:** When `actualEarnerTotal === 0` but `earnerRowsWithWallet.length > 0` and `Math.abs(earnerDeltaTotal) >= 0.01`, fall back to an even split across `earnerRowsWithWallet` instead of skipping the correction.

### WR-04: `findQueue()` accepts an unvalidated free-text `status` query param

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts:81-87`, `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:126-149`
**Issue:** `@Query('status') status?: string` has no `@IsEnum`/whitelist validation and is passed straight into `where: { status }` (service.ts:134). A typo'd status value (e.g. `?status=OPEM`) silently returns an empty page rather than a 400, making the failure hard to notice from an admin UI.
**Fix:** Validate `status` against `['OPEN','IN_REVIEW','RESOLVED','DISMISSED','BLOCKED']` (e.g. via a small query DTO with `@IsIn(...)`) and reject unknown values with a 400.

## Info

### IN-01: `getQueue()`'s `page`/`limit` params are typed optional despite always being populated

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts:81-87`
**Issue:** `@Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number` — the `DefaultValuePipe` guarantees `page`/`limit` are always defined, so the `?` optional modifier is misleading.
**Fix:** Drop the `?` (`page: number`), or drop `DefaultValuePipe` and handle defaults in the service only (the service already re-defaults via `opts.page ?? 1`, making the controller-level default redundant either way).

### IN-02: `computeAdjustmentLines()` is public purely to support direct unit testing

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:192-204`
**Issue:** The comment above it ("INTERNAL — exposed for the spec and for resolve()") acknowledges this is a deliberate encapsulation trade-off, but it does mean any other code that imports `SettlementDisputesService` can invoke the raw financial-diffing routine directly, bypassing the controller's `SUPER_ADMIN`-only guard entirely (there's no authorization check inside the service itself, by documented design). Not exploitable today since nothing else calls it, but worth a note for future maintainers extending this service.
**Fix:** No action required now; consider `@internal` JSDoc tagging or moving the test to use a `(service as any).computeAdjustmentLines` cast if stricter encapsulation is ever desired.

### IN-03: `resolveSplit()`'s `amountNgn` parameter is unused, so amount-tiered splits are silently ignored by dispute resolution too

**File:** `backend/src/common/services/settlement.service.ts:513-539`
**Issue:** Pre-existing from phase 18 (not introduced by this phase), but directly consumed by this phase's new `computeAdjustmentLines()` (`settlement-disputes.service.ts:228-231`). `resolveSplit(module, amountNgn)` never uses `amountNgn` in its `where` clause — it always fetches the single `tierName: 'default'` row regardless of the schema's `minAmountNgn`/`maxAmountNgn` fields (`schema.prisma:700-701`). If amount-tiered splits are ever configured, both original settlement and dispute-resolution adjustments would silently use the same (wrong) tier.
**Fix:** Out of scope for this phase's fix, but flag for whoever implements amount-tiered splits — `computeAdjustmentLines()` will inherit whatever `resolveSplit()` does once that's fixed, no changes needed on the dispute side.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
