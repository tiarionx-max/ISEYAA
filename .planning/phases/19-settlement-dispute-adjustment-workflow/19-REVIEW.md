---
phase: 19-settlement-dispute-adjustment-workflow
reviewed: 2026-07-20T14:10:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - backend/src/modules/settlement-disputes/settlement-disputes.service.ts
  - backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 19: Code Review Report (Gap-Closure Plan 19-06 — `computeAdjustmentLines()` Residual Money-Conservation Fix)

**Reviewed:** 2026-07-20T14:10:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

This pass reviews gap-closure plan 19-06, which introduced `earnerDelivered`/`ministryDelivered`
gating in `computeAdjustmentLines()` to close the residual CR-01 finding from the prior
19-REVIEW.md cycle: a category (ministry or earner) with no wallet-bearing Transaction row to
receive its correction was having its corrected total silently subtracted out of
`correctPlatformTotal` without ever landing anywhere, breaking `sum(lines[].deltaNgn) === 0`.

**The three specific trigger paths that prior CR-01 enumerated are correctly fixed.** I
hand-traced the arithmetic for all three (no `ministryRow`, no `earnerRowsWithWallet`,
`actualEarnerTotal === 0`) and confirmed `sum(lines[].deltaNgn) === 0` holds by construction for
each, matching the self-balancing formula the fix introduces
(`correctPlatformTotal = chargeAmountNgn - (earnerDelivered ? correctEarnerTotal :
actualEarnerTotal) - (ministryDelivered ? correctMinistryTotal : actualMinistryTotal)`). The
three new regression tests (`settlement-disputes.service.spec.ts:445-558`) assert **exact** line
arrays via `toEqual([...])` (not `arrayContaining` and not merely a sum-to-zero check), and I
independently re-derived every expected number by hand — all three match the code's actual
output exactly, so these tests are not false-positives.

**However, the fix is asymmetric and leaves one more combination unhandled**: it defends the
ministry/earner side of the ledger (via the new gating variables) but has no equivalent guard for
the case where the **platform (`-PLAT`) row itself** is missing or has no wallet — the exact same
class of silent money-conservation bug the fix was written to close, just triggered from the
opposite direction. See CR-01 below. I also found two pre-existing issues (not introduced by
19-06, but touching the same code paths) worth flagging for completeness per the adversarial
review mandate: WR-02 below.

## Critical Issues

### CR-01: `computeAdjustmentLines()` still breaks `sum(lines) === 0` when the platform (`-PLAT`) row is missing or walletless — the new gating has no `platformDelivered` counterpart

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:277-324`

**Issue:**
The 19-06 fix introduces `ministryDelivered`/`earnerDelivered` (lines 277-279) so that
`correctPlatformTotal` (lines 313-319) only "claims" a category's *corrected* total when there is
an actual wallet to push a compensating line to for it — otherwise it falls back to that
category's *actual* total, so nothing is lost. This is correct and complete for the
ministry/earner side.

But the platform side of the same ledger has no analogous guard. The final push is gated only on
`platformRow?.walletId` (line 322) — the code clearly anticipates `platformRow` can be
`undefined` (hence the optional chaining) — yet when that's true, `platformDelta` (a real,
possibly large, nonzero number representing money owed *to* the ledger to balance the ministry
and/or earner corrections that *were* pushed) is computed and then simply discarded. There is no
"retain it somewhere" fallback (there is nowhere left to retain it — platform is itself the
fallback target) and no error/guard raised. Whenever `ministryDelivered` or `earnerDelivered` is
`true` and their line(s) get pushed, but the platform line does not, the invariant this function's
own docstring guarantees ("Every non-empty `lines` result sums to 0 by construction",
lines 240-241) is false for that call, and `adjust()` (`settlement.service.ts:304-439`) will
faithfully post an unbalanced set of wallet debits/credits with no error, no `BLOCKED` state, and
no audit flag — silently manufacturing or destroying real money, exactly as the original CR-01
did for the ministry/earner side.

Worked example (mirrors the exact structure of the prior CR-01 write-up, mirrored to the platform
side): a settlement recorded DRIVER ₦8,500 (wallet `W1`) + MINISTRY ₦500 (wallet `W2`) with **no**
`-PLAT` row at all (e.g. a settlement recorded through some future/legacy code path that doesn't
write a platform commission row, or a row that was later hard-deleted/corrupted). `resolveSplit()`
now returns `earnerPct: 0.9, ministryPct: 0.06`:

```
chargeAmountNgn      = 9000
correctEarnerTotal    = 8100   actualEarnerTotal   = 8500  -> earnerDelta   = -400  (pushed, W1)
correctMinistryTotal  =  540   actualMinistryTotal =  500  -> ministryDelta =  +40  (pushed, W2)
correctPlatformTotal  = 9000 - 8100 - 540 = 360
actualPlatformTotal   =    0   (no platformRow -> defaults to 0)
platformDelta         =  360                               -> NOT PUSHED (platformRow undefined)

lines = [ {W2, +40}, {W1, -400} ]
sum(lines.deltaNgn) = 40 + -400 = -360   // must be 0
```

`adjust()` would debit the driver ₦400 and credit the ministry ₦40, but the ₦360 that should have
landed on the platform wallet vanishes from the ledger with no trace.

**Reachability note (for triage):** under the current codebase, every settlement is created via
`SettlementService.settle()` (`settlement.service.ts:126-300`), which unconditionally writes a
`-PLAT` Transaction row (even when the commission is `₦0` — see the existing test fixture at
`settlement-disputes.service.spec.ts:323-329`) against the bootstrap-guaranteed system wallet
(`ensureSystemWallet()`, `settlement.service.ts:543-561`), so `platformRow` should always exist
with a non-null `walletId` for any settlement actually reachable today. I could not find a current
code path that creates `${settlementReference}-*` rows without a `-PLAT` row. That makes this
harder to trigger today than the ministry/earner variant was — but `computeAdjustmentLines()`
itself has no way to enforce or verify that precondition on the data it queries (it re-derives
everything from a raw `Transaction.findMany()`, with no check on where those rows came from), and
the function's own doc comment claims the invariant unconditionally. Given this is exactly the
same bug class the phase exists to eliminate, and the fix already includes explicit handling for
"what if I can't push a line to the wallet I want," the missing symmetric case is a genuine gap,
not a hypothetical concern — it should either be defended against or the ambient guarantee should
be enforced rather than assumed.

**Fix:** Add an explicit runtime invariant check before returning, so any future violation (from
this path or any other not yet discovered) fails loudly instead of silently corrupting the ledger:

```typescript
const sumOfDeltas = Math.round(lines.reduce((s, l) => s + l.deltaNgn, 0) * 100) / 100;
if (Math.abs(sumOfDeltas) >= 0.01) {
  throw new Error(
    `computeAdjustmentLines() produced an unbalanced adjustment for ` +
    `settlementReference="${settlementReference}" (module=${module}): ` +
    `sum(lines.deltaNgn)=${sumOfDeltas}, expected 0 — refusing to return an ` +
    `adjustment that would corrupt the ledger. Likely cause: a category was ` +
    `delivered (pushed a line) while another category it depends on for balance ` +
    `(e.g. the platform "-PLAT" row) was not found or has no walletId.`,
  );
}
return { lines, chargeAmountNgn };
```

This converts a silent money-conservation failure into a loud, safe one — consistent with the
project's existing "refuse rather than silently proceed" pattern for financial invariants (e.g.
`resolveSplit()`'s "refusing to settle with an undefined split" and `settle()`'s drift-exceeded
throw).

## Warnings

### WR-01: No regression test covers a missing/walletless platform row with a nonzero `platformDelta`

**File:** `backend/src/modules/settlement-disputes/__tests__/settlement-disputes.service.spec.ts:354-381`

**Issue:** The existing "no-op" test (`returns an empty lines array when resolveSplit() matches
what was originally applied`) is the only fixture in the file where `rows` omits a `-PLAT` row
entirely — but it pairs `earnerPct: 0.85, ministryPct: 0.15, platformPct: 0` with amounts that
happen to make `platformDelta === 0`, so the CR-01 gap above produces the same (correct-looking)
`lines: []` result whether or not the platform-fallback bug exists. This test cannot distinguish
"the function is correct" from "the function is broken but the numbers happen to cancel," which is
exactly how CR-01 survived undetected.

**Fix:** Add a regression test with a missing/walletless `-PLAT` row where `platformDelta` is
provably nonzero (using the worked example above, or similar), asserting the exact expected
`lines` array (per this file's own established pattern for the three residual-CR-01 tests) rather
than only a sum-to-zero check — and, once CR-01's fix lands, a test asserting the function throws
rather than returning an unbalanced result.

### WR-02: `resolve()` doesn't branch on `adjust()`'s `REPLAYED` status — a second dispute against an already-adjusted settlement silently no-ops while still reporting `RESOLVED` with a real `adjustmentReference`

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:370-401`; `backend/src/common/services/settlement.service.ts:304-317`

**Issue:** Pre-existing (not part of 19-06's diff — the `earnerDelivered`/`ministryDelivered`
gating is unrelated to this), but discovered while tracing `resolve()`'s call chain into `adjust()`
for this review, so flagging per the adversarial-review mandate to surface everything provable.
`raise()`'s active-dispute guard (`settlement-disputes.service.ts:105-114`) only blocks a *new*
dispute while one is `OPEN`/`IN_REVIEW`/`BLOCKED` — it does **not** block raising a second dispute
against a `settlementReference` that already has a `RESOLVED` dispute with a real adjustment
posted. When that second dispute is resolved, `computeAdjustmentLines()` recomputes a fresh diff
(correctly — it excludes `-ADJ-*` rows from its query so it isn't confused by them), and `resolve()`
passes those lines to `SettlementService.adjust()`. But `adjust()`'s very first step
(`settlement.service.ts:308-317`) is an idempotency precheck keyed **only** on whether *any*
`${originalReference}-ADJ-*` row already exists — not on whether the new lines match the old ones.
Since dispute 1 already posted `X-ADJ-1/2/3`, this precheck fires immediately and `adjust()`
returns `{ status: 'REPLAYED', recipientCredits: [] }` **without evaluating the new lines at all**
— even if the new correction is legitimately different (e.g. the `SettlementSplitTier` was updated
between dispute 1 and dispute 2, which is plausible: it's the exact scenario this whole feature
exists for). `resolve()` (lines 382-401) doesn't inspect `adjResult.status` before proceeding — it
unconditionally sets `status: 'RESOLVED'` and a real, non-null `adjustmentReference` on dispute 2,
and only records `adjResult.status` as an opaque string inside the `AuditLog.newValue` JSON (not
surfaced anywhere else). The dispute record therefore claims a correction was applied when nothing
was actually posted to any wallet — recoverable only by an operator who happens to inspect the raw
audit log JSON.

**Fix:** Have `resolve()` branch on `adjResult.status`:

```typescript
if (adjResult.status === 'REPLAYED') {
  // adjust() found this originalReference already has a prior real adjustment —
  // this dispute's lines were never applied. Surface that instead of claiming success.
  throw new ConflictException(
    `This settlement already has a posted adjustment (${dispute.settlementReference}-ADJ) — ` +
    `raise a new dispute only if the correction genuinely needs to change, and confirm the ` +
    `existing adjustment's numbers first.`,
  );
}
```
or, at minimum, record a distinguishable `resolution` string / different status so the dispute
record doesn't misrepresent what actually happened financially.

## Info

### IN-01: `computeAdjustmentLines()`'s docstring overclaims — the sum-to-zero guarantee is conditional on the platform row existing, not unconditional

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:240-241`

**Issue:** "Every non-empty `lines` result sums to 0 by construction" is stated without
qualification. As CR-01 shows, this is only true when the `-PLAT` row is present with a
`walletId` — which happens to always be true for settlements produced by the current
`SettlementService.settle()`, but is not enforced or verified by this function itself.

**Fix:** Either add the CR-01 runtime assertion (making the claim actually true unconditionally),
or caveat the docstring (e.g. "...provided the original settlement's `-PLAT` row is present with a
walletId, which `settle()` always guarantees") so a future reader doesn't rely on a guarantee the
code doesn't actually enforce.

### IN-02: `earnerRowsWithWallet`/`ministryRow?.walletId`/`platformRow?.walletId` truthy checks are effectively row-existence checks, not "does this row have a wallet" checks, given `Transaction.walletId` is schema-mandatory

**File:** `backend/src/modules/settlement-disputes/settlement-disputes.service.ts:259-261, 277-279, 322`; `backend/prisma/schema.prisma:662`

**Issue:** `Transaction.walletId` is declared `String` (not `String?`) in the schema — every
persisted Transaction row is guaranteed by the DB's foreign-key constraint to reference a real
wallet. Combined with `SettlementService.settle()` only ever creating rows for recipients that
already passed a `walletId` truthy filter (`settlement.service.ts:200,211`), a Transaction row
with a falsy `walletId` cannot currently exist in this table. That means `earnerRowsWithWallet`,
`ministryDelivered`, and the `platformRow?.walletId` guard are all, in practice, pure
row-*existence* checks (`ministryRow !== undefined`, etc.) dressed up as wallet-presence checks —
not wrong, but the accompanying comments ("no deliverable wallet row", "residual CR-01 fix... has
no deliverable wallet row") frame it as a distinct wallet-level concern that can't actually diverge
from row-existence today. Not a functional bug — just worth being precise about for future
maintainers, since it means the "row exists but has no wallet" branch these checks appear to guard
against is currently unreachable dead logic (as opposed to a defended live scenario).

**Fix:** No action required. Consider a one-line comment noting that `walletId` truthiness and row
existence are currently equivalent given the schema constraint, so a future maintainer doesn't
spend time hunting for a "walletless row" test fixture that can't exist.

---

_Reviewed: 2026-07-20T14:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
