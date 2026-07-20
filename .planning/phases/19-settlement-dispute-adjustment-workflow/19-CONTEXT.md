# Phase 19: Settlement Dispute & Adjustment Workflow - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A `SUPER_ADMIN` can raise a dispute against any already-completed settlement `Transaction` (transport, delivery, marketplace, events, stays, studio, or tour), have it move through a reviewed state machine, and — on resolve — have a corrected adjustment posted as new, append-only `Transaction` rows via a new `SettlementService.adjust()` primitive. The original settlement rows are never mutated. This phase does NOT add self-service dispute filing for vendors/riders (SETTLE-10f, explicitly deferred to backlog) and does NOT add a web admin UI page — backend API only, matching Phase 18's precedent.

</domain>

<decisions>
## Implementation Decisions

### Resolution mechanics — system-computed, reviewer approves
- **D-01:** When a `SUPER_ADMIN` resolves a dispute, the system — not the reviewer — computes the adjustment. `SettlementDisputeService.resolve()` calls `SettlementService.resolveSplit(module, originalAmountNgn)` against the original settlement's amount, diffs the result against what was actually paid out (recoverable from the original settlement's `Transaction` rows/`SettlementRecipient` amounts), and derives the adjustment line(s) automatically. There is no manual amount-entry path and no reviewer-editable override — the reviewer's action is limited to approve (triggers `adjust()`) or dismiss (no adjustment). This directly implements the `PROJECT.md` decision that `resolveSplit()` is "the source of truth for what split should have applied."
- Because the adjustment is always system-derived from `resolveSplit()`, a dispute is inherently scoped to "the split percentage that applied at settlement time was wrong" — not general-purpose fraud/wrong-recipient claw-back (that class of correction is out of scope for how `resolve()` computes its number, though the underlying `adjust()` primitive is written generally per the architecture research).

### Roles & scope
- **D-02:** Only `SUPER_ADMIN` can raise, review (move to `IN_REVIEW`), resolve, or dismiss a dispute. No `STATE_ADMIN` involvement this phase — single-role permission model, matching Phase 18's admin-only CRUD precedent (no separation-of-duties split between "flag" and "authorize").
- **D-03:** Disputes can be raised against a completed settlement from any module that produces one: transport, delivery, marketplace, events, stays, studio, and tour packages (the pre-existing multi-vendor engine, settled via the same `SettlementService.settle()`). `SettlementDispute.module` stores which one.

### State machine — 5 statuses, BLOCKED is retryable
- **D-04:** The state machine is `OPEN → IN_REVIEW → RESOLVED | DISMISSED | BLOCKED`, extending the 4 values named in ROADMAP.md/REQUIREMENTS.md with a 5th: `BLOCKED`. This is the mechanical answer to SETTLE-10d ("blocked... flagged for manual ops resolution rather than allowed to post") — when `adjust()`'s pre-debit balance check fails, the dispute moves to `BLOCKED`, not `DISMISSED` (which means "no adjustment warranted") and not silently left `IN_REVIEW`.
- **D-05:** `BLOCKED` is **not terminal**. A `SUPER_ADMIN` can re-invoke resolve on a `BLOCKED` dispute at any time — the system re-runs the same `resolveSplit()`-derived computation and re-checks the balance. If the recipient's wallet has since been topped up (e.g. by an out-of-band manual ops action), the retry succeeds and the dispute moves to `RESOLVED`. Every attempt (including ones that re-land on `BLOCKED`) is logged to `AuditLog` per SETTLE-10e.
- Every dispute-state transition (raise→`OPEN`, →`IN_REVIEW`, →`RESOLVED`, →`DISMISSED`, →`BLOCKED`, and `BLOCKED`→retry→`RESOLVED`/`BLOCKED` again) writes an `AuditLog` entry with who/when/why/amount, satisfying SETTLE-10e for every action, not just the terminal ones.

### Admin surface
- **D-06:** Backend REST endpoints only (raise / list+queue / get / review / resolve / dismiss), role-gated `SUPER_ADMIN`, under the existing admin auth pattern. No new web admin page this phase — consistent with Phase 18's D-04 and the project's API-first admin tooling pattern. A dedicated dispute-queue UI is a reasonable future enhancement, not part of this phase.

### Claude's Discretion
- Exact DTO shape for raising a dispute (`raise-dispute.dto.ts`) — must capture `settlementReference`, `module`, `reason`, and the requester's believed `requestedAdjustmentNgn` per SETTLE-10a ("capturing reason and disputed amount"); `requestedAdjustmentNgn` is informational only since D-01 means the system computes the actual adjustment, not the raiser's number.
- Whether `SettlementDisputeService`/`SettlementDisputesController` structurally mirrors `ReviewsService`'s `findFlagQueue()`/`findFlagById()`/`resolveFlag()` pattern verbatim (research recommends this — same `OPEN|IN_REVIEW|RESOLVED|DISMISSED` shape as `AdminReviewFlag`, extended with `BLOCKED`).
- Exact reference-suffix scheme for adjustment `Transaction` rows (research proposes `${originalReference}-ADJ-${n}`, parallel to `RefundService`'s `-RFND` suffix) and lock-order reuse (`settle()`'s canonical sorted-by-walletId order, line ~159) — planner should follow the architecture research's recommendation verbatim, this is a locked architectural precedent, not an open choice.
- Whether `adjust()`'s idempotency precheck follows the exact `reference`-prefix + `P2002`-fallback pattern `settle()` already uses, or a simplified variant — research recommends reusing verbatim.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` (Phase 19 section, lines ~434-444) — goal, success criteria, requirements list, depends-on Phase 18
- `.planning/REQUIREMENTS.md` (SETTLE-10a through SETTLE-10e, lines ~24-28) — locked v1 requirements for this phase
- `.planning/REQUIREMENTS.md` (SETTLE-10f, line ~50) — explicitly deferred backlog item (self-service vendor/rider dispute filing) — confirms no new raiser role this phase

### Research (already completed for this milestone)
- `.planning/research/ARCHITECTURE.md` §"Q4 — Settlement dispute/adjustment workflow (SETTLE-10)" (lines ~103-150) — the `SettlementDispute` Prisma model proposal, `SettlementService.adjust()` method design (idempotency, lock order, insufficient-funds path), state-machine precedent (`AdminReviewFlag`), new module layout
- `.planning/research/ARCHITECTURE.md` §"Build Order Across All 7 Features" (lines ~208-228) — confirms SETTLE-11 (Phase 18, already shipped) must precede SETTLE-10 (this phase) because `resolveSplit()` is the dispute resolver's source of truth
- `.planning/STATE.md` "Blockers/Concerns" — flags the insufficient-balance clawback policy as needing explicit design sign-off; **resolved by this discussion as D-04/D-05 (BLOCKED status, retryable)**, consistent with REQUIREMENTS.md SETTLE-10d's "blocked... flagged for manual ops" wording (not the research doc's earlier "platform wallet absorbs" alternative, which REQUIREMENTS.md's locked wording supersedes)

### Settlement engine (existing, LOCKED architectural commitments)
- `backend/src/common/services/settlement.service.ts` — header comment "Architectural commitments (LOCKED — carried over from Tour, do not deviate)" (lines ~14-25); `settle()` (line 91) — negative-recipient-amount guard (lines 108-116), canonical sorted-by-walletId lock order (line ~159); `resolveMinistryWallet()` (line 328) and `resolveSplit()` (line 339, shipped in Phase 18) — both "always fresh, never cached" patterns `adjust()` should mirror for any live lookups it needs
- `backend/src/common/services/refund.service.ts` — `RefundService.refund()` — the existing compensating-transaction precedent `adjust()` follows (new `Transaction` rows, never mutate the original; reference suffix pattern; balance-neutral vs. real wallet debit/credit distinction)
- `backend/prisma/schema.prisma` — `AdminReviewFlag` model (line 1115) — the state-machine precedent (`OPEN | IN_REVIEW | RESOLVED | DISMISSED` string status, `assignedTo`, `resolution`, `resolvedAt`) that `SettlementDispute` extends with a 5th `BLOCKED` value (D-04); `AuditLog` model (line 735) — the audit trail every dispute action writes to per SETTLE-10e; `UserRole` enum (line 13) — confirms `SUPER_ADMIN`/`STATE_ADMIN` both exist (D-02 restricts to `SUPER_ADMIN` only)

### Existing review-queue pattern to mirror
- `backend/src/modules/reviews/reviews.service.ts` — `findFlagQueue()` (line 263), `findFlagById()` (line 297), `resolveFlag()` (line 320) — near-verbatim structural precedent for `SettlementDisputeService`'s queue/get/resolve methods
- `backend/src/modules/reviews/reviews.controller.ts` — controller shape (role-gating, route structure) to mirror for the new `settlement-disputes.controller.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettlementService.resolveSplit()` (`settlement.service.ts:339`, shipped Phase 18) — the exact primitive `SettlementDisputeService.resolve()` calls to compute "what the split should have been" (D-01)
- `RefundService.refund()` — compensating-transaction pattern to mirror for `adjust()`'s row-writing shape
- `ReviewsService`'s flag-queue trio (`findFlagQueue`/`findFlagById`/`resolveFlag`) — near-verbatim pattern for the new dispute service's queue/get/resolve methods

### Established Patterns
- Every wallet-mutating settlement primitive in this codebase runs one `$transaction`, locks every touched wallet with `SELECT FOR UPDATE` in canonical sorted-by-walletId order, and is idempotency-checked via a `reference`-prefix precheck before entering the transaction. `adjust()` must follow this exactly — it is not a new pattern, it's the same one `settle()` and `refund()` already use.
- Historical `Transaction` rows are never mutated anywhere in this codebase — every correction (refunds, and now dispute adjustments) is a new row referencing the original. This is a hard architectural invariant, not a per-phase choice.

### Integration Points
- New `backend/src/modules/settlement-disputes/` module (controller + service + DTOs), following the existing feature-module shape (`controller → service → prisma`)
- New `SettlementService.adjust()` method, additive only — `settle()`'s signature and the 6 existing call sites (transport/delivery/marketplace/events/stays/studio) are untouched
- New `SettlementDispute` Prisma model, colocated with `AdminReviewFlag`/`ShadowSettlementComparison` in `schema.prisma`

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references — this is a backend workflow/data-model phase with no user-facing surface beyond new admin API endpoints (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Self-service dispute filing by vendors/riders** (SETTLE-10f) — needs its own role-permission surface and abuse controls; explicitly out of scope per REQUIREMENTS.md backlog.
- **Web admin dispute-queue UI page** (D-06) — backend-only this phase; a dedicated frontend page is a reasonable future enhancement once the API-only workflow proves out.
- **Reviewer-editable/manual adjustment amounts** (D-01) — this phase's `resolve()` is strictly system-computed via `resolveSplit()`; a manual-override or free-form-fraud-correction path (different amount than what `resolveSplit()` derives) is a larger scope change not requested this phase — noted here so it isn't silently assumed later.
- **STATE_ADMIN involvement in the dispute workflow** (D-02) — could be added later (e.g. STATE_ADMIN raises, SUPER_ADMIN resolves) if ops throughput becomes a bottleneck with SUPER_ADMIN-only.

### Reviewed Todos (not folded)
None — no pending todos matched this phase during cross-reference.

</deferred>

---

*Phase: 19-Settlement Dispute & Adjustment Workflow*
*Context gathered: 2026-07-19*
