# Phase 19: Settlement Dispute & Adjustment Workflow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-19
**Phase:** 19-Settlement Dispute & Adjustment Workflow
**Areas discussed:** Resolution flow, Roles & scope, Insufficient funds mechanics, Admin UI, BLOCKED retry

---

## Resolution flow

| Option | Description | Selected |
|--------|-------------|----------|
| System-computed, reviewer approves | System calls resolveSplit() with the original amount, computes what the split should have been, diffs against what was actually paid, proposes the adjustment automatically. Reviewer approves or dismisses — no manual amount entry. | ✓ |
| Reviewer enters amount manually | Reviewer types wallet(s) and delta amount(s) directly; resolveSplit() output shown only as a reference hint. | |
| Hybrid — system suggests, reviewer can override | System pre-fills a resolveSplit()-computed default; reviewer can edit before submitting. | |

**User's choice:** System-computed, reviewer approves
**Notes:** Directly implements the PROJECT.md decision that resolveSplit() is "the source of truth for what split should have applied." No manual-override path this phase.

---

## Roles & scope

| Option | Description | Selected |
|--------|-------------|----------|
| SUPER_ADMIN only, all 6+ modules | Only SUPER_ADMIN raises/reviews/resolves; applies to transport, delivery, marketplace, events, stays, studio, and tour packages. | ✓ |
| SUPER_ADMIN + STATE_ADMIN can raise, SUPER_ADMIN resolves | Both tiers can raise; only SUPER_ADMIN can review/resolve/dismiss. | |
| SUPER_ADMIN + STATE_ADMIN both raise and resolve | Either role can perform any dispute action. | |

**User's choice:** SUPER_ADMIN only, all 6+ modules
**Notes:** Matches Phase 18's admin-only CRUD precedent. No separation-of-duties split this phase.

---

## Insufficient funds mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| New BLOCKED status | 5th status value, distinct from DISMISSED, reached when the debit would go negative. Stays visible in queue for manual ops follow-up. | ✓ |
| Stay IN_REVIEW with a flag field | Add an insufficientFundsFlag boolean; dispute stays IN_REVIEW, ops resolves out-of-band, re-attempt resolution. | |
| RESOLVED with adjustmentReference null | Mark RESOLVED but leave adjustmentReference null; keeps state machine to exactly 4 named values. | |

**User's choice:** New BLOCKED status
**Notes:** Mechanical answer to SETTLE-10d's "blocked... flagged for manual ops resolution" wording. Supersedes the architecture research's earlier "platform wallet absorbs shortfall" alternative — REQUIREMENTS.md's locked wording wins.

---

## BLOCKED retry

| Option | Description | Selected |
|--------|-------------|----------|
| Retryable — can re-attempt resolve from BLOCKED | Not terminal; SUPER_ADMIN can re-invoke resolve later, system re-checks balance, moves to RESOLVED if it now succeeds. | ✓ |
| Terminal — BLOCKED ends the dispute | Once BLOCKED, done; any actual remediation happens entirely outside this workflow. | |

**User's choice:** Retryable — can re-attempt resolve from BLOCKED
**Notes:** Matches the requirement's framing as "flagged for manual ops resolution" rather than "closed."

---

## Admin UI

| Option | Description | Selected |
|--------|-------------|----------|
| Backend API only | New REST endpoints only, no new web page this phase — matches Phase 18. | ✓ |
| Add a web admin dispute queue page | New Next.js page showing the queue, detail view, resolve/dismiss action. | |

**User's choice:** Backend API only
**Notes:** Consistent with Phase 18's D-04 and the project's API-first admin tooling pattern.

---

## Claude's Discretion

- Exact DTO shape for raising a dispute (`raise-dispute.dto.ts`)
- Whether `SettlementDisputeService`/`SettlementDisputesController` mirrors `ReviewsService`'s flag-queue trio verbatim (recommended by research)
- Exact reference-suffix scheme for adjustment `Transaction` rows (research proposes `${originalReference}-ADJ-${n}`) and lock-order reuse
- Whether `adjust()`'s idempotency precheck follows `settle()`'s exact pattern or a simplified variant (research recommends reuse verbatim)

## Deferred Ideas

- Self-service dispute filing by vendors/riders (SETTLE-10f) — own role-permission surface and abuse controls needed, explicitly backlog
- Web admin dispute-queue UI page — reasonable future enhancement once API-only workflow proves out
- Reviewer-editable/manual adjustment amounts — larger scope change not requested this phase
- STATE_ADMIN involvement in the dispute workflow — could be added later if ops throughput becomes a bottleneck
