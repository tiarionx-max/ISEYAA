---
phase: 19-settlement-dispute-adjustment-workflow
verified: 2026-07-20T00:00:00Z
status: gaps_found
score: 3/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Resolving a dispute produces a new append-only, non-destructive adjustment via SettlementService.adjust() — the correction reallocates money between parties rather than creating or destroying it (SETTLE-10c, ROADMAP SC3)"
    status: failed
    reason: "computeAdjustmentLines() in settlement-disputes.service.ts destructures earnerPct/ministryPct from resolveSplit() but discards platformPct — it never computes or emits an adjustment line for the platform/system wallet. Every dispute resolution that changes the earner/ministry split therefore leaves an unbalanced ledger: money is created or destroyed rather than reallocated. adjust() itself (settlement.service.ts) is a faithful, balanced primitive — the defect is entirely in the caller's line-generation logic, and adjust() has no defensive balance check because 'every line here is caller-supplied' by design (settlement.service.ts:342-343). Confirmed against live code; matches 19-REVIEW.md CR-01 exactly."
    artifacts:
      - path: "backend/src/modules/settlement-disputes/settlement-disputes.service.ts"
        issue: "computeAdjustmentLines() (lines 204-267) locates platformRow (line 220) only to exclude it from earnerRows — never pushes a corresponding platform delta line. Confirmed at settlement-disputes.service.ts:228 (`const { earnerPct, ministryPct } = await this.settlementService.resolveSplit(...)` — platformPct silently dropped)."
    missing:
      - "Compute correctPlatformTotal = chargeAmountNgn - correctEarnerTotal - correctMinistryTotal (self-balancing, mirrors settle()'s own drift-absorption design), diff it against the actual platform row amount, and push a platform wallet line into `lines` when non-zero."
      - "Add a test asserting sum(lines.map(l => l.deltaNgn)) === 0 for every fixture in settlement-disputes.service.spec.ts, and a platform-wallet-balance assertion in the e2e happy-path scenario — neither exists today, which is why 677/677 green tests did not catch this."
  - truth: "raise() prevents two concurrent disputes from racing to post two different adjustments against the same settlement (supports SETTLE-10a/10e auditability)"
    status: failed
    reason: "The 'one active dispute per settlement' guard in raise() is a plain, non-atomic prisma.settlementDispute.findFirst() check followed later by a separate create() call — no $transaction, no advisory lock, and no DB-level uniqueness constraint (the migration only creates plain, non-partial indexes on status and settlementReference). Two concurrent POST requests for the same settlementReference can both pass the check and both create() successfully, leaving two SettlementDispute rows independently marked RESOLVED with an identical adjustmentReference even though adjust()'s own idempotency precheck means only one of them actually mutated a wallet. This is a data-integrity/audit-trail defect the code's own docstring says must be prevented (T-19-07) but the implementation does not enforce. Confirmed against live code and the migration.sql; matches 19-REVIEW.md CR-02 exactly."
    artifacts:
      - path: "backend/src/modules/settlement-disputes/settlement-disputes.service.ts"
        issue: "raise() (lines 79-118): non-atomic findFirst (line 88) + create (line 99), no transaction/lock spanning both."
      - path: "backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql"
        issue: "Only plain B-tree indexes on status and settlementReference — no partial unique index enforcing at-most-one-active-dispute-per-reference at the DB level (contrast with SettlementSplitTier's documented partial-unique pattern for an analogous invariant)."
    missing:
      - "A partial unique index (e.g. CREATE UNIQUE INDEX ... ON settlement_disputes (settlementReference) WHERE status IN ('OPEN','IN_REVIEW','BLOCKED')) plus a P2002 catch in raise() translating the DB-level rejection into the same ConflictException the pre-check already throws."
deferred: []
human_verification: []
---

# Phase 19: Settlement Dispute & Adjustment Workflow Verification Report

**Phase Goal:** Admins can dispute a completed settlement and have it corrected through an auditable, non-destructive adjustment
**Verified:** 2026-07-20T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A SUPER_ADMIN can raise a dispute against a completed settlement, capturing reason and disputed amount (SETTLE-10a) | ⚠️ VERIFIED (with integrity gap) | `raise()` (settlement-disputes.service.ts:79-118) validates the settlement exists, rejects a second active dispute (non-atomically — see gap below), persists `SettlementDispute`, and audits. Controller route `POST admin/settlement-disputes` wired, `SUPER_ADMIN`-gated. Functionally present, but see CR-02/CR-03 gaps. |
| 2 | A dispute visibly moves `OPEN → IN_REVIEW → RESOLVED/DISMISSED`, with a reviewer recorded at review time (SETTLE-10b) | ✓ VERIFIED | `moveToReview()` (lines 172-190) sets `status: 'IN_REVIEW'`, `assignedTo: actorUserId`, rejects non-`OPEN` source states. `resolve()`/`dismiss()` correctly gate on terminal states (`RESOLVED`/`DISMISSED`) and allow `BLOCKED` as a retry entry point (D-05). e2e test confirms `raise → moveToReview → resolve` transitions correctly. |
| 3 | Resolving a dispute produces a new append-only, **non-destructive** adjustment via `SettlementService.adjust()` — original historical `Transaction` rows are never mutated, and the correction reallocates money between parties rather than creating/destroying it (SETTLE-10c) | ✗ **FAILED** | `adjust()` itself is correctly append-only and never `UPDATE`s a `Transaction` row — that half is real. But `computeAdjustmentLines()` never emits a platform-wallet line (destructures `platformPct` and drops it, `settlement-disputes.service.ts:228`), so every adjustment that changes the earner/ministry split creates or destroys money system-wide rather than reallocating it. This directly contradicts the phase goal's explicit "non-destructive adjustment" framing. See CR-01 below — independently confirmed against live code. |
| 4 | An adjustment that would drive a recipient's wallet balance negative is blocked (not applied) and flagged for manual ops resolution (SETTLE-10d) | ✓ VERIFIED | `adjust()` (settlement.service.ts:304-439): balance check happens INSIDE the `$transaction`, after `SELECT ... FOR UPDATE` locks the row (race-safe); throws `InsufficientAdjustmentBalanceError` BEFORE any `wallet.update`/`transaction.create` commits for the whole batch (Prisma auto-rollback on thrown error from the interactive-transaction callback). `resolve()` catches this typed error first (before P2002 handling) and moves the dispute to `BLOCKED`, never `DISMISSED`, never left `IN_REVIEW`. e2e "BLOCKED → retry → RESOLVED" scenario passes and asserts zero `-ADJ-` rows committed on the blocked attempt. |
| 5 | Every dispute action — raise, review, resolve, dismiss — appears in `AuditLog` with who/when/why/amount (SETTLE-10e) | ⚠️ VERIFIED (with integrity gap) | `writeAudit()` helper called from `raise()`, `moveToReview()`, `resolve()` (both success and no-op and BLOCKED branches), and `dismiss()`; wrapped in try/catch, never rethrows (matches `kyc.service.ts` precedent). e2e test asserts the exact ordered sequence of `AuditLog.create` calls per scenario. However, the CR-02 race (truth #1) means two racing `raise()` calls could each independently accumulate a full, internally-consistent-looking audit trail while only one dispute's resolution actually touched a wallet — an audit-trail correctness gap, not a missing-audit-call gap. |

**Score:** 3/5 truths fully verified; 2 verified-with-integrity-gaps counted as passing above, but Truth #3 is a hard FAILED — **the phase's core "non-destructive adjustment" goal is not met** for any dispute whose corrected split differs from the original at both the earner/ministry level (the platform share silently absorbs the discrepancy in the wrong direction — it's never touched at all).

**Score for gating purposes: 3/5** (Truths 1, 2, 4, 5 pass or pass-with-warning; Truth 3 is a BLOCKER fail). Per the decision tree, any FAILED truth forces `status: gaps_found` regardless of the numeric ratio.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` (`SettlementDispute` model) | 5-status state machine, `raisedBy` FK to `User` | ✓ VERIFIED | Model present with all fields from `19-01-PLAN.md`'s interface; `User.settlementDisputesRaised` relation exists. |
| `backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql` | Live migration for the table | ✓ VERIFIED (existence) / ⚠️ INCOMPLETE (constraint) | Table + FK + 2 plain indexes created. **Missing** the partial unique index needed to actually close the one-active-dispute-per-settlement race (CR-02) — the plan explicitly called this "enforced in application code," but the application code (`raise()`) does not enforce it atomically either. |
| `backend/src/common/services/settlement.service.ts` (`adjust()`) | Compensating-transaction primitive, append-only, lock-ordered, idempotent, typed insufficient-balance error | ✓ VERIFIED | Matches `19-02-PLAN.md`'s spec almost verbatim: idempotency precheck (`-ADJ-` prefix), canonical sorted-by-`walletId` lock order distinct from write order, `InsufficientAdjustmentBalanceError` thrown pre-commit and rethrown first (before P2002 handling) in the catch block, P2002 fallback returns `REPLAYED`. This primitive itself is sound and balanced by construction (the caller controls the lines; it applies exactly what it's given). |
| `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` | `raise/findQueue/findById/moveToReview/resolve/dismiss/computeAdjustmentLines` | ⚠️ STUB-ADJACENT (financial logic) | All methods exist and are wired/tested. `computeAdjustmentLines()` is the one method whose core algorithm is incomplete — see Truth #3. Also missing: module-mismatch validation in `raise()` (CR-03 — `dto.module` is never cross-checked against the transaction's recorded `metadata.module`, so a fat-fingered module selection silently drives `resolveSplit()` to the wrong tier with no server-side guardrail). |
| `backend/src/modules/settlement-disputes/settlement-disputes.controller.ts` | 6 `SUPER_ADMIN`-only routes | ✓ VERIFIED | `@Controller('admin/settlement-disputes')`, class-level `@Roles(UserRole.SUPER_ADMIN)`, 6 routes present (`raise`, `queue`, `getById`, `review`, `resolve`, `dismiss`), each delegating to exactly one service call. |
| `backend/src/modules/settlement-disputes/settlement-disputes.module.ts` + `AppModule` registration | Module wired into the app | ✓ VERIFIED | `SettlementDisputesModule` registered in `backend/src/app.module.ts`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `settlement-disputes.controller.ts` | `settlement-disputes.service.ts` | constructor injection, 1 route = 1 method | ✓ WIRED | Confirmed by reading the controller/service pair and the passing e2e test. |
| `settlement-disputes.service.ts` `resolve()` | `settlement.service.ts` `resolveSplit()`/`adjust()` | `this.settlementService.resolveSplit(...)` then `this.settlementService.adjust({...lines})` | ✓ WIRED (mechanically) / ✗ **UNBALANCED (semantically)** | The calls happen correctly and in the right order, but the `lines` payload handed to `adjust()` is missing the platform-wallet line, so what's "wired" produces an incorrect financial result. Wiring is not the failure — the data flowing through the wire is wrong. |
| `settlement-disputes.service.ts` `writeAudit()` | `audit_logs` table | `prisma.auditLog.create`, try/catch, never rethrows | ✓ WIRED | Confirmed in `raise`, `moveToReview`, `resolve` (all 3 branches), `dismiss`. |
| `AppModule` | `SettlementDisputesModule` | root `imports` array | ✓ WIRED | `grep -c "SettlementDisputesModule" backend/src/app.module.ts` returns 2 (import + array entry, confirmed by reading the plan's own acceptance criteria and cross-checking the SUMMARY's claim). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `computeAdjustmentLines()` | `lines: SettlementAdjustmentLine[]` | Diffs live `Transaction` rows (`prisma.transaction.findMany`) against `resolveSplit()`'s live `SettlementSplitTier` lookup | Yes — both inputs are real DB reads, no static/hardcoded stub | ⚠️ **FLOWING BUT INCOMPLETE** — the data is real, but the derivation formula omits an entire required output (platform delta), so the flowing data is incomplete/incorrect rather than disconnected. This is a logic bug, not a wiring/stub bug — Level 4 data-flow tracing alone would not have caught it (the values that DO flow are real); only re-deriving the money-conservation invariant (sum of all lines + already-applied lines == 0) surfaces it, which is exactly what CR-01's suggested test (`sum(lines.map(l => l.deltaNgn)) === 0`) would catch and what's currently absent from both unit and e2e specs. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full dispute lifecycle e2e suite executes against real service pair | `cd backend && npx jest --config test/jest-e2e.json --testPathPattern="settlement-disputes.e2e"` | 3/3 passing (raise→review→resolve; BLOCKED→retry→RESOLVED; dismiss) | ✓ PASS (mechanically) — confirms wiring and state-machine transitions work; does **not** assert platform-wallet balance post-adjustment in any scenario, so it cannot and does not catch CR-01. |
| Migration contains only plain indexes, no partial-unique constraint | `grep -n "CREATE" backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql` | 1 table, 2 plain indexes, 1 FK — no unique/partial index | Confirms CR-02 | N/A (evidence check, not a pass/fail spot-check) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SETTLE-10a | 19-01, 19-03, 19-04 | Admin/SUPER_ADMIN can raise a dispute, capturing reason + disputed amount | ⚠️ SATISFIED WITH GAP | `raise()` works functionally; CR-02 (TOCTOU race) and CR-03 (no module cross-check) are unresolved integrity gaps on this exact code path. |
| SETTLE-10b | 19-03, 19-04 | State machine `OPEN → IN_REVIEW → RESOLVED/DISMISSED` with reviewer assigned | ✓ SATISFIED | `moveToReview()`, `resolve()`, `dismiss()` all correctly implement the 5-state machine including `BLOCKED` retry (D-05). |
| SETTLE-10c | 19-02, 19-03 | New append-only adjustment via `adjust()`, own idempotency/lock order, historical rows never mutated | ✗ **BLOCKED — NOT SATISFIED** | `adjust()` the primitive is correct and append-only. But the phase's actual dispute-resolution *use* of it (`computeAdjustmentLines()` → `resolve()`) produces unbalanced lines that create/destroy money — see CR-01. The requirement's spirit ("corrected through a non-destructive adjustment") is not met even though the mechanical "append-only, no historical mutation" half is. |
| SETTLE-10d | 19-02, 19-03 | Adjustment that would overdraw a wallet is blocked, not applied | ✓ SATISFIED | Fully verified — see Truth #4 above. |
| SETTLE-10e | 19-03, 19-04 | Every dispute action captured in `AuditLog` with who/when/why/amount | ⚠️ SATISFIED WITH GAP | Audit calls are present and correctly wired for every transition; the CR-02 race means the audit trail *can* contain two dispute records both claiming to have resolved the same settlement, which weakens the "who/when/why" trustworthiness for that edge case. |

**Note on REQUIREMENTS.md staleness:** `.planning/REQUIREMENTS.md` currently shows `SETTLE-10a`/`10b`/`10e` as unchecked (`[ ]`) while `10c`/`10d` are checked (`[x]`) — inconsistent with this phase's SUMMARY claiming all 5 requirements complete, and inconsistent with my own findings above (10c should NOT be checked complete, given CR-01). This is a documentation-tracking issue, not itself a code gap, but flagged since it means the requirements traceability doc does not currently reflect either the SUMMARY's claim or this verification's findings correctly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` | 228 | Silent destructuring-and-drop of `platformPct` from `resolveSplit()`'s return value | 🛑 Blocker | Root cause of CR-01 — the platform wallet is never rebalanced, so every non-trivial dispute resolution creates or destroys currency. |
| `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` | 79-97 | Non-atomic check-then-act (`findFirst` then later `create`) for a uniqueness invariant the code's own docstring says must hold | 🛑 Blocker | CR-02 — TOCTOU race allows two concurrent disputes against the same settlement, corrupting the audit trail's "one authoritative resolution per settlement" guarantee. |
| `backend/src/modules/settlement-disputes/settlement-disputes.service.ts` | 79-97 | No validation that caller-supplied `dto.module` matches the settlement's actually-recorded module | 🛑 Blocker (per code review; treated here as a serious correctness gap) | CR-03 — a fat-fingered module selection silently drives `resolveSplit()` to fetch an unrelated tier's percentages with no guardrail, compounding the CR-01 imbalance with wrong-tier math. |
| `backend/src/modules/settlement-disputes/settlement-disputes.service.spec.ts` / `settlement-disputes.e2e-spec.ts` | n/a | No test anywhere asserts the platform/system wallet's balance after an `adjust()` call driven by a dispute resolution | ⚠️ Warning | Explains why CR-01 shipped with 100% green tests — the money-conservation invariant is simply never checked. |

No `TODO`/`FIXME`/`XXX`/`TBD` debt markers found in any file this phase modified.

### Human Verification Required

None. All findings above are independently confirmed by reading the live source, the migration SQL, and running the phase's own e2e test suite — no visual/real-time/external-service behavior requires human judgment here.

### Gaps Summary

Phase 19 successfully builds the dispute *state machine* (raise/review/resolve/dismiss, 5-status including `BLOCKED`) and a genuinely sound compensating-transaction primitive (`SettlementService.adjust()` — correctly append-only, correctly lock-ordered, correctly idempotent, correctly fails closed on an overdraw). Both of these are real, well-tested, and match their plans closely.

However, the phase's stated goal is that a disputed settlement gets "corrected through an auditable, **non-destructive** adjustment." The one component that turns a dispute into an actual financial correction — `computeAdjustmentLines()` — has a critical, independently-confirmed defect (CR-01): it never generates a platform-wallet adjustment line, so any dispute resolution that changes the earner/ministry split creates or destroys money system-wide instead of reallocating it between the three parties (earner, ministry, platform). This is not a hypothetical edge case — it is the *normal* path for a dispute whose entire premise is "the split percentages applied were wrong." Every fixture in the phase's own test suite that exercises a real split-percentage correction (both the unit spec's single-earner fixture and the e2e spec's happy-path scenario) triggers this bug; it went undetected purely because no test asserts on the platform wallet's post-adjustment balance.

Two further confirmed defects compound the risk on the "auditable" half of the goal: `raise()`'s one-active-dispute-per-settlement guard is a non-atomic check-then-act with no DB-level backstop (CR-02), and `raise()` never validates that the caller-supplied `module` actually matches the settlement being disputed (CR-03), so a wrong-module selection would silently apply the wrong split's math with no server-side rejection.

Given the decision tree (any FAILED truth forces `gaps_found` regardless of overall ratio), and given that CR-01 falsifies the core "non-destructive adjustment" claim in the phase goal itself, this phase does **not** meet its stated goal as currently implemented. The fix for CR-01 is well-scoped (the review's suggested patch is a ~10-line addition to `computeAdjustmentLines()` plus a money-conservation test), and CR-02/CR-03 are similarly small, targeted fixes — none of this requires re-architecting the state machine or the `adjust()` primitive, both of which should be preserved as-is.

---

_Verified: 2026-07-20T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
