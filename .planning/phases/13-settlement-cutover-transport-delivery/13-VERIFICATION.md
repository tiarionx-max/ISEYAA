---
phase: 13-settlement-cutover-transport-delivery
verified: 2026-07-18T00:45:44Z
status: passed
score: 4/4 roadmap truths verified (code-complete); 1 independent finding resolved post-verification
overrides_applied: 0
---

# Phase 13: Settlement Cutover (Transport & Delivery) Verification Report

**Phase Goal:** Transport and Delivery's live driver/rider payouts move onto the generalized three-way settlement engine, with shadow-mode verification proving no live payout amount changes silently
**Verified:** 2026-07-18T00:45:44Z
**Status:** passed (amended post-verification — see Resolution Addendum)
**Re-verification:** No — initial verification, addendum added after orchestrator applied the recommended fix

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Transport's settlement runs on a three-way, `PlatformConfig`-driven split (driver, Ministry, platform), replacing the hardcoded 85/15 | ✓ VERIFIED | `transport.service.ts:554-640` — `cutoverEnabled` branch reads `transport.govt_levy_pct`/`transport.platform_fee_pct` from `PlatformConfig`, builds `[DRIVER, MINISTRY]` recipients, calls `settlementService.settle()`. Legacy 85/15 path (`transport_platform_fee_pct`) untouched at lines 644-702. Test asserts `settle()` called with `{tag:'DRIVER', amountNgn:1275}`/`{tag:'MINISTRY', amountNgn:75}` for fare=1500. |
| 2 | Delivery's settlement runs on a three-way, `PlatformConfig`-driven split, replacing the hardcoded 80/20 | ✓ VERIFIED | `delivery.service.ts:585-665` — identical pattern; reads `delivery.govt_levy_pct`/`delivery.platform_fee_pct`, `[RIDER, MINISTRY]` recipients via `settlementService.settle()`. Legacy 80/20 path (`delivery_platform_fee_pct`) untouched at lines 667-753. Test asserts `{tag:'RIDER', amountNgn:640}`/`{tag:'MINISTRY', amountNgn:40}` for fee=800. |
| 3 | A shadow-mode comparison run computes the new engine's payouts alongside the old hardcoded-percentage output for a representative sample of real Transport/Delivery transactions, with zero discrepancy, before cutover is marked complete | ✓ VERIFIED (mechanism proven, no live data yet) | Two independent mechanisms exist and both work correctly: (a) **Stage 2 live dual-run** — every real `completeTrip()`/`completeDelivery()` call on the legacy (flag-off) path writes a `ShadowSettlementComparison` row comparing old vs. recomputed-new formula (`transport.service.ts:704-732`, `delivery.service.ts:725-752`), verified by passing tests asserting `matched: true`. (b) **Stage 1 batch script** `backend/scripts/shadow-settlement-verify.ts` — independently run, exits 0, `grep -c '\.settle(\|wallet\.update(\|wallet\.create('` returns 0 (confirmed read-only), prints `Transport Stage 1: 0 sampled, 0 mismatches` / `Delivery Stage 1: 0 sampled, 0 mismatches` (dev DB has no historical COMPLETED/DELIVERED rows yet — reported cleanly per spec, not an error). Real-transaction zero-discrepancy proof is deferred to the explicitly-documented manual D-08 bake-period gate (correctly out of this phase's automated scope per the task brief). |
| 4 | Post-cutover, live driver and rider wallet credits match the shadow-mode-verified amounts exactly — no payout regression observed | ✓ VERIFIED (code guarantee; live cutover not yet flipped) | Both cutover flags (`transport.settlement_engine_enabled`, `delivery.settlement_engine_enabled`) are seeded `false` — no live cutover has occurred yet (expected; D-08 gate is manual/future). The code guarantee is proven at the unit level: driver/rider earnings formulas are bit-for-bit identical between legacy and cutover branches (subtract-first for Transport, multiply-first for Delivery — verified in both `transport.service.ts`/`delivery.service.ts` and independently re-verified in `shadow-settlement-verify.ts`), and `SettlementService`'s reference-prefix idempotency precheck + `P2002` fallback prevents double-crediting on retry. |

**Score:** 4/4 roadmap truths verified at the code level.

### Cross-Cutting Constraints

| # | Constraint | Status | Evidence |
|---|------------|--------|----------|
| 1 | Driver/rider payout amounts stay bit-for-bit unchanged from today's formula (D-01) in both pre/post-cutover paths | ✓ VERIFIED | Transport: subtract-first (`totalCommission = round(fare*pct/100*100)/100; driverEarnings = round((fare-totalCommission)*100)/100`) identical in both branches. Delivery: multiply-first (`riderEarnings = round(fee*(1-pct/100)*100)/100`) identical in both branches. Test fixtures assert exact figures (1275/75, 640/40). |
| 2 | Platform fee/levy percentages always read from `PlatformConfig` — never hardcoded | ✓ VERIFIED | All 4 new percentage keys (`transport.govt_levy_pct`, `transport.platform_fee_pct`, `delivery.govt_levy_pct`, `delivery.platform_fee_pct`) read via `prisma.platformConfig.findUnique` in both files; in-code numeric fallbacks (`?? 5`, `?? 10`, `?? 15`) are safety defaults matching the project's existing convention (e.g. `getFareEstimate`'s `defaults.base`), not hardcoded production values — actual values are DB-driven via seed.ts. |
| 3 | Idempotency reference changes from random-UUID to deterministic (`ISY-TRP-<tripId>` / `ISY-DLV-<orderId>`) only on the cutover-enabled path | ✓ VERIFIED | `reference: \`ISY-TRP-${tripId}\`` / `\`ISY-DLV-${orderId}\`` only appear in the `cutoverEnabled === true` branches. Legacy branches still generate `ref = ISY-DRV-${uuidv4()...}` / `ISY-RDR-${uuidv4()...}` — `grep -c "uuidv4"` returns 2 in each file (both legacy `ref` generation call sites intact). `CLAUDE.md`'s Naming Patterns section documents the new convention. |
| 4 | D-08's live bake-period gate is manual, post-deployment, not code-enforced by this phase | ✓ VERIFIED (correctly out of scope) | Both cutover flags seeded `false`; no code path auto-flips them. `13-04-SUMMARY.md`/threat register (T-13-11) explicitly documents this as an accepted, non-code-enforced precondition. Consistent with the task brief's explicit instruction this must not block verification. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` (`ShadowSettlementComparison`) | New model, `matched Boolean`, `@@map("shadow_settlement_comparisons")` | ✓ VERIFIED | Model present at line 663-675, matches spec exactly including both `@@index` clauses. |
| `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/` | `CREATE TABLE "shadow_settlement_comparisons"` | ✓ VERIFIED | Migration file contains the table creation; `npx prisma migrate status` implicitly confirmed by clean `tsc`/Jest runs against the generated Prisma Client (which requires the migration applied). |
| `backend/prisma/seed.ts` (6 new keys) | `transport.govt_levy_pct=5`, `transport.platform_fee_pct=10`, `delivery.govt_levy_pct=5`, `delivery.platform_fee_pct=15`, `transport.settlement_engine_enabled=false`, `delivery.settlement_engine_enabled=false` | ✓ VERIFIED | All 6 upserts present at seed.ts:1518-1591 with exact keys/values; legacy `transport_platform_fee_pct=15`/`delivery_platform_fee_pct=20` unchanged at lines 1269/1299. |
| `backend/src/modules/transport/transport.service.ts` | Cutover-flag-gated `completeTrip()` delegating to `SettlementService` | ✓ VERIFIED | Contains `settlementService.settle(` (line 593); `grep -c "tx.wallet.update"` = 1 (only in legacy branch, lines 641-702); status precondition present (CR-03 fix). |
| `backend/src/modules/transport/__tests__/transport.service.spec.ts` | Coverage for both flag states + shadow-write + failure paths | ✓ VERIFIED, WIRED | 31+ tests including cutover-true/false, shadow-write assertion, and WR-04's onFailure/terminal-state tests (lines 754-816). Full suite green (`npx jest transport.service.spec` passes). |
| `backend/src/modules/delivery/delivery.service.ts` | Cutover-flag-gated `completeDelivery()` delegating to `SettlementService` | ✓ VERIFIED | Contains `settlementService.settle(` (line 623); `grep -c "tx.wallet.update"` = 1 (only in legacy branch, lines 667-753). |
| `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` | Coverage for both flag states + shadow-write + failure paths | ✓ VERIFIED, WIRED (see gap note below) | Cutover-true/false tests, shadow-write assertion, CR-02 double-complete-race test, CR-01 IN_TRANSIT-revert test all present and passing. Missing: a test asserting the onFailure handler does NOT resurrect a terminal (CANCELLED/DELIVERED/EXPIRED) order — see Human Verification item. |
| `backend/scripts/shadow-settlement-verify.ts` | Stage 1 read-only historical batch script | ✓ VERIFIED, WIRED | Exports `verifyTransportShadow`/`verifyDeliveryShadow`; zero wallet-mutating calls confirmed via grep; ran successfully against local dev DB (exit 0, both summary lines printed); kobo-precision comparison (WR-07 fix) present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `transport.service.ts::completeTrip()` | `settlement.service.ts::settle()` | `this.settlementService.settle(...)` | ✓ WIRED | Confirmed at line 593; constructor DI at line 55. |
| `transport.service.ts::completeTrip()` (false branch) | `prisma.shadowSettlementComparison.create()` | fire-and-forget try/catch outside `$transaction` | ✓ WIRED | Confirmed at lines 707-732, syntactically after the `$transaction` block (659-702) resolves. |
| `delivery.service.ts::completeDelivery()` | `settlement.service.ts::settle()` | `this.settlementService.settle(...)` | ✓ WIRED | Confirmed at line 623; constructor DI at line 68. |
| `delivery.service.ts::completeDelivery()` (false branch) | `prisma.shadowSettlementComparison.create()` | fire-and-forget try/catch outside `$transaction` | ✓ WIRED | Confirmed at lines 729-752, after the `$transaction` block (681-723). |
| `shadow-settlement-verify.ts` | `Trip`/`DeliveryOrder` tables (read-only) | raw `PrismaClient` query | ✓ WIRED | `prisma.trip.findMany`/`prisma.deliveryOrder.findMany` confirmed; zero `.settle(`/`wallet.update(`/`wallet.create(` calls anywhere in the file. |

### Independent Money-Movement Assessment (CR-02 / CR-03 Re-Examination)

Per the task brief's explicit request, both fixes marked "requires human verification" in `13-REVIEW-FIX.md` were independently re-examined against `backend/src/modules/delivery/delivery.service.ts` and `backend/src/modules/transport/transport.service.ts`, tracing the full transaction/rollback semantics through `SettlementService.settle()`.

**CR-02 (Delivery `onSettled` atomic guard) — CORRECT.** `onSettled` now runs `tx.deliveryOrder.updateMany({ where: { id: orderId, status: { in: ['COLLECTING', 'IN_TRANSIT'] } }, ... })` and throws when `count === 0` (`delivery.service.ts:637-650`). Because `onSettled` executes *inside* `SettlementService`'s single `$transaction` (after wallet credits are written but before commit — `settlement.service.ts:229`), a thrown error here rolls back the entire transaction, including the wallet credits already written earlier in the same transaction call. This genuinely closes the double-payout race: two concurrent `completeDelivery()` calls are serialized by `SettlementService`'s canonical `SELECT ... FOR UPDATE` wallet-lock order, and the loser's `onSettled` guard finds `count === 0` and safely rolls back with no partial credit. The `{ in: ['COLLECTING', 'IN_TRANSIT'] }` set is consistent with (and exhaustive against) the function's own upfront completable-status allow-list at line 536. **Verdict: the guard is complete and correct.**

**CR-03 (Transport precondition + guarded `onFailure`) — CORRECT.** The new `if (trip.status !== 'IN_PROGRESS') throw BadRequestException(...)` precondition (line 521-523) mirrors `arrivedAtPickup`/`startTrip`. `onFailure`'s revert is now `tx.trip.updateMany({ where: { id: tripId, status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } }, data: { status: 'IN_PROGRESS' } })` (lines 630-638) — cross-checked against `schema.prisma`'s `TripStatus` enum (`SEARCHING | MATCHED | ARRIVED | IN_PROGRESS | COMPLETED | CANCELLED | EXPIRED`), confirming the `notIn` terminal set (`COMPLETED`, `CANCELLED`, `EXPIRED`) is exhaustive — no legitimate mid-flow status is misclassified as terminal. Two new regression tests (`transport.service.spec.ts:754-816`) directly exercise both the terminal-non-revert and non-terminal-safe-revert cases and pass. **Verdict: the guard is complete and correct.**

**New independent finding (not raised by the original review): Delivery's `onFailure` lacks the analogous terminal-state guard.** `delivery.service.ts:655-664`'s `onFailure` still performs an *unconditional* `this.prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: 'IN_TRANSIT' } })` — CR-01 only swapped the invalid enum literal (`'PICKED_UP'` → `'IN_TRANSIT'`); it did not add the `notIn`-terminal-status guard that CR-03 added for Transport's structurally identical `onFailure` handler. Traced concrete scenario: rider calls `completeDelivery()` on an `IN_TRANSIT` order; concurrently the sender calls `cancelOrder()` (permitted — `IN_TRANSIT` is not in `cancelOrder`'s terminal-status blocklist) and the order transitions to `CANCELLED`; `completeDelivery()`'s `settle()` proceeds, `onSettled`'s CR-02 guard correctly finds `count === 0` (status is `CANCELLED`, not in `['COLLECTING','IN_TRANSIT']`) and throws, rolling back the wallet credits (no double-payout on *this* attempt) — but `onFailure` then unconditionally reverts the order back to `IN_TRANSIT`, resurrecting a cancelled delivery into a completable state. A subsequent `completeDelivery()` call (OTP-verified flag persists in the DB) can then successfully pay the rider for a delivery the sender explicitly cancelled. This is the same class of bug CR-03 fixed for Transport, left unaddressed for Delivery. Confirmed via test-suite inspection: `delivery.service.spec.ts:501-532`'s only `onFailure` test asserts the revert target is the valid `'IN_TRANSIT'` literal — no test exercises the terminal-order-resurrection scenario (unlike Transport's explicit test at `transport.service.spec.ts:754-786`).

This does not violate any of this phase's declared must-haves/success criteria (all of which concern split formulas, percentages, and idempotent references, not `onFailure` terminal-state safety), so it is not scored as a FAILED truth. However, it is a genuine, provable correctness gap on the live wallet-crediting path, structurally identical to a defect the same review cycle already fixed for the sibling module — routed to Human Verification below rather than silently passed or silently blocked.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SETTLE-03 | 13-02 | Transport's settlement generalized to a 3-way `PlatformConfig`-driven split, replacing hardcoded 85/15 | ✓ SATISFIED (code); REQUIREMENTS.md checkbox not updated | Code evidence per Truth #1 above. `.planning/REQUIREMENTS.md:58` still shows `[ ]` / traceability table row 124 still shows "Pending" — a documentation-lag gap, not a code gap (flagged below). |
| SETTLE-04 | 13-03 | Delivery's settlement generalized to a 3-way `PlatformConfig`-driven split, replacing hardcoded 80/20 | ✓ SATISFIED (code); REQUIREMENTS.md checkbox not updated | Code evidence per Truth #2 above. `.planning/REQUIREMENTS.md:59` still shows `[ ]` / traceability table row 125 still shows "Pending" — same documentation-lag gap. |
| SETTLE-09 | 13-01, 13-02, 13-03, 13-04 | Transport/Delivery cutover verified in shadow mode against hardcoded-percentage output before going live | ✓ SATISFIED | Code evidence per Truth #3/#4 above. `.planning/REQUIREMENTS.md:64` already shows `[x]` / traceability row 130 already shows "Complete" — consistent with code evidence. |

**Orphaned requirements check:** `.planning/REQUIREMENTS.md` maps only SETTLE-03/04/09 to Phase 13; all three appear in at least one plan's `requirements:` frontmatter (13-02: SETTLE-03,09; 13-03: SETTLE-04,09; 13-01/13-04: SETTLE-09). No orphaned requirements.

**Documentation gap (non-blocking):** `REQUIREMENTS.md`'s checkboxes/traceability table for SETTLE-03 and SETTLE-04 were not updated to reflect completion, even though SETTLE-09 (completed in the same phase) was updated. This is inconsistent bookkeeping that should be corrected (likely a milestone-audit-time update was only partially applied) but does not reflect a code deficiency — recommend updating `.planning/REQUIREMENTS.md` lines 58-59 and the traceability table rows 124-125 to `[x]`/"Complete".

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/delivery/delivery.service.ts` | 655-664 | Unconditional status revert in `onFailure` (no terminal-state guard) | ⚠️ Warning | See Independent Money-Movement Assessment above — routed to Human Verification, not treated as a blocking gap since outside declared must-haves. |
| `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql` | 1-19 | Migration bundles pre-existing, unrelated schema drift (most notably `admin_review_flags_reviewId_fkey` CASCADE→RESTRICT) under the settlement-cutover migration name | ℹ️ Info (already surfaced) | Investigated by `13-REVIEW-FIX.md` (WR-06, correctly left as-is — genuine pre-existing drift, not introduced by this phase) and documented in `deferred-items.md`. Confirmed present in the migration SQL (line 2, 55) during this verification. Not a Phase 13 defect; flagged here per the task brief's explicit instruction to confirm it's surfaced, which it is. |

No `TBD`/`FIXME`/`XXX` unreferenced debt markers found in the files modified by this phase.

### Independent Test Execution (not taken from SUMMARY claims)

| Check | Command | Result |
|-------|---------|--------|
| TypeScript compile | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | ✓ 0 errors |
| Transport/Delivery/Settlement specs | `npx jest transport.service.spec delivery.service.spec settlement.service.spec --silent` | ✓ 4 suites, 73 tests passing |
| Full backend regression suite | `cd backend && npm test` | ✓ 42 suites, 511 tests passing (SUMMARY claimed 506 pre-review-fix; +5 matches the 5 new WR-04 tests added during the fix pass) |
| Schema model presence | `grep -n "model ShadowSettlementComparison"` | ✓ Present, matches spec |
| Seed key presence | `grep -n` for all 6 new keys | ✓ All 6 present with correct values; legacy keys unchanged |
| `tx.wallet.update` containment | `grep -c` both files | ✓ Exactly 1 each, confirmed lexically inside the legacy `else` branch by direct file read |
| `uuidv4` legacy path intact | `grep -c` both files | ✓ 2 each (legacy ref generation preserved) |
| CLAUDE.md naming convention | `grep -n "ISY-TRP-\|ISY-DLV-"` | ✓ Both entries present in Naming Patterns section |
| Git commit provenance | `git log --oneline --all \| grep <hashes>` | ✓ All 17 commits referenced across the 4 SUMMARY.md files + REVIEW-FIX.md confirmed present in history |
| Stage 1 script safety | `grep -c '\.settle(\|wallet\.update(\|wallet\.create('` | ✓ 0 (script contains zero wallet-mutating calls) |

### Resolution Addendum (post-verification, applied by orchestrator)

Both items this report originally routed to `human_needed` have been resolved:

1. **Delivery `onFailure` terminal-order-resurrection gap — FIXED.** Applied option (b) from the Human Verification guidance above: `delivery.service.ts`'s `onFailure` now runs `this.prisma.deliveryOrder.updateMany({ where: { id: orderId, status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } }, data: { status: 'IN_TRANSIT' } })` with a `count === 0` no-op log, mirroring Transport's CR-03 guard exactly. Commit `fee2844`. Two tests updated/added in `delivery.service.spec.ts` (the existing revert-target test updated to assert the `updateMany`/`notIn` shape; a new test mirroring Transport's terminal-state-does-not-resurrect case). Full backend suite re-run independently after the fix: 42 suites, 512 tests, all passing (`tsc --noEmit` also clean).
2. **`REQUIREMENTS.md` SETTLE-03/SETTLE-04 documentation lag — FIXED.** Checkboxes and traceability table rows updated to `[x]`/"Complete", consistent with the code evidence already documented in the Requirements Coverage section above.

Status upgraded from `human_needed` to `passed` — no outstanding items block phase completion.

---

## Gaps Summary

No FAILED truths. All four ROADMAP success criteria and all cross-cutting constraints are verified against the actual codebase (not SUMMARY claims) — schema/config foundation, both service rewrites, the Stage 1 script, the full test suite (independently re-run, 512/512 green after the addendum fix), and the commit history all check out. All ten Critical/Warning findings from `13-REVIEW.md` are now resolved: nine were fixed during the code-review-fix pass, WR-06 was correctly investigated and left as-is (pre-existing unrelated drift, already surfaced in `deferred-items.md`), and the one gap this verification independently discovered (Delivery's `onFailure` terminal-state guard) was fixed per the Resolution Addendum above.

Documentation lag (`REQUIREMENTS.md` SETTLE-03/SETTLE-04 checkboxes) is also resolved — see addendum.

---

_Verified: 2026-07-18T00:45:44Z_
_Verifier: Claude (gsd-verifier)_
_Addendum applied: 2026-07-18 by orchestrator (Claude Sonnet 5)_
