---
phase: 19-settlement-dispute-adjustment-workflow
plan: 02
subsystem: payments
tags: [prisma, nestjs, wallet, settlement, transactions, tdd]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation
    provides: SettlementService's locked $transaction / SELECT FOR UPDATE / idempotency-precheck / P2002-fallback architecture, which adjust() mirrors
provides:
  - "SettlementService.adjust() — compensating-transaction primitive for applying dispute corrections against already-settled Transaction rows"
  - "Exported SettlementAdjustmentLine / SettlementAdjustmentInput interfaces"
  - "Exported InsufficientAdjustmentBalanceError class (typed, instanceof-catchable)"
affects: [19-03-settlement-dispute-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compensating-transaction pattern: new append-only Transaction rows referencing an original settlement via a -ADJ-${n} reference suffix, never mutating the original rows"
    - "Canonical sorted-walletId lock order reused verbatim from settle() to avoid the same deadlock class across two independent atomic wallet-fan-out primitives"
    - "Typed domain error (InsufficientAdjustmentBalanceError) checked first, before the generic P2002 idempotency-race branch, so callers can distinguish a business-rule rejection from a benign replay"

key-files:
  created: []
  modified:
    - backend/src/common/services/settlement.service.ts
    - backend/src/common/services/__tests__/settlement.service.spec.ts

key-decisions:
  - "adjust() never touches the platform/system wallet — every line is caller-supplied and caller-directed; there is no drift-absorption row (unlike settle())"
  - "Insufficient-balance check runs INSIDE the $transaction, after SELECT FOR UPDATE has locked the row, so it is race-safe against a concurrent debit draining the wallet between check and write"
  - "wireTransaction() test mock was extended with real rollback semantics (buffered-write truncation + balance-snapshot restore on callback throw) to faithfully mirror Prisma's all-or-nothing $transaction commit behavior — needed to prove no partial write survives a failed adjust() batch, including earlier-processed lines"

patterns-established:
  - "SettlementAdjustmentInput/SettlementAdjustmentLine shape for any future adjust() caller (19-03's SettlementDisputesService.resolve() is the first consumer)"

requirements-completed: [SETTLE-10c, SETTLE-10d]

# Metrics
duration: ~35min
completed: 2026-07-20
---

# Phase 19 Plan 02: SettlementService.adjust() Compensating-Transaction Primitive Summary

**Added `SettlementService.adjust()` — a general-purpose credit/debit wallet-adjustment primitive with append-only ledger rows, canonical wallet lock ordering, idempotency, and a typed insufficient-balance rejection, built additively alongside the existing `settle()` without touching it.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files modified:** 2

## Accomplishments

- `SettlementService.adjust()` writes new, append-only `Transaction` rows referencing the original settlement via `${originalReference}-ADJ-${n}` (1-based, caller array order) — the original settlement's rows are never mutated (SETTLE-10c)
- Debit lines that would take a wallet negative are rejected via a typed, catchable `InsufficientAdjustmentBalanceError` before any wallet mutation commits — verified with a test where an earlier-processed, individually-valid credit line in the same batch is also rolled back (SETTLE-10d)
- Wallet locking uses the same canonical sorted-by-`walletId` order `settle()` already uses, inside `adjust()`'s own `$transaction`, avoiding the deadlock class `settle()`'s own comment documents
- Idempotency: reference-prefix precheck (`${originalReference}-ADJ-`) before entering the transaction, with a P2002 fallback identical in shape to `settle()`'s — and the typed insufficient-balance error is checked and rethrown *before* the P2002 branch so it's never misclassified as a benign replay
- A guard rejects `adjust()` calls against an `originalReference` with no settled `Transaction` row at all
- A `Number.isFinite()` guard on every line's `deltaNgn` runs before `$transaction` is entered

## Task Commits

Each task was committed atomically, following the TDD RED -> GREEN cycle (no REFACTOR commit needed — implementation matched the plan's spec cleanly on first pass):

1. **Task 1 (RED): add failing tests for `adjust()`** - `fdc0a61` (test)
2. **Task 1 (GREEN): implement `SettlementService.adjust()`** - `2f150bb` (feat)

## Files Created/Modified

- `backend/src/common/services/settlement.service.ts` - Added `InsufficientAdjustmentBalanceError` class, `SettlementAdjustmentLine`/`SettlementAdjustmentInput` interfaces, and `async adjust()` method (placed immediately after `settle()`, before the failure-path comment divider)
- `backend/src/common/services/__tests__/settlement.service.spec.ts` - Added a new `describe('adjust()', ...)` block (8 tests across 7 behavior scenarios — one scenario parameterized over NaN/Infinity); extended `wireTransaction()`'s options with `initialBalances` and added genuine rollback semantics (buffered-write truncation + balance-snapshot restore on a failed `$transaction` callback) so the insufficient-balance scenario can assert zero partial writes

## Decisions Made

- Extended `wireTransaction()`'s mock `$transaction` implementation to truncate `txn.walletUpdates`/`txn.transactionCreates` back to their pre-call length and restore the pre-call balance snapshot whenever the callback throws. This was necessary because the plan's insufficient-balance test scenario requires proving that an *earlier-processed, individually-valid* line in the same batch (a credit that would have succeeded) never commits when a *later* line in the same batch fails — the previous mock had no rollback semantics at all (writes were pushed to the shared capture array in real time, permanently). This change is additive/backward-compatible: no existing `settle()` scenario (A–L) asserts on `txn.walletUpdates`/`txn.transactionCreates` counts after a failure path, and Scenario H (`onSettled` reading live counts mid-transaction) still works because writes are still pushed in real time during the callback — only a subsequent throw unwinds them.
- Also extended the `$executeRaw` mock to capture the actual interpolated `walletId` value (previously only the template's literal strings were captured, discarding the substituted values) — needed to assert the ascending lock-order sequence in the new lock-order test. No existing test asserted on the previous string-only capture format, so this is a safe extension.

## Deviations from Plan

None - plan executed exactly as written. The `<action>` section's byte-level algorithm description (idempotency precheck, original-existence guard, `Number.isFinite` validation, canonical lock order, per-line write loop, `InsufficientAdjustmentBalanceError` throw-before-P2002-check ordering) was implemented verbatim.

## Issues Encountered

- **Worktree had no `node_modules`** (fresh git worktree, workspace dependencies never installed). Resolved by creating NTFS directory junctions (`root/node_modules`, `backend/node_modules`, `shared/node_modules`) pointing at the main repo's already-installed `node_modules` directories — these junctions are gitignored and were not committed. This is an environment-setup workaround, not a code change; no deviation to the plan's actual deliverable.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SettlementService.adjust()`, `SettlementAdjustmentInput`/`SettlementAdjustmentLine`, and `InsufficientAdjustmentBalanceError` are all exported and ready for `19-03-PLAN.md`'s `SettlementDisputesService.resolve()` to consume directly — the interface signature matches the one specified in `19-02-PLAN.md`'s `<interfaces>` block exactly.
- `settle()`'s signature, behavior, and all existing call sites remain byte-for-byte untouched — verified via the full backend suite (652/652 passing, up from the pre-plan baseline of 644).
- No blockers. This plan had no dependency on `19-01-PLAN.md` (the `SettlementDispute` Prisma model) and ran independently in Wave 1 as designed.

---
*Phase: 19-settlement-dispute-adjustment-workflow*
*Completed: 2026-07-20*
