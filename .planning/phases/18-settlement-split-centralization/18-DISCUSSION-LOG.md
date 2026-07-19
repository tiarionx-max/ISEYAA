# Phase 18: Settlement Split Centralization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-19
**Phase:** 18-Settlement Split Centralization
**Areas discussed:** Known inconsistencies, Percentage unit, Admin surface, Effective-dating scope

---

## Known inconsistencies

**Question 1:** Studio's `platformFeePct` is fetched but never applied to the split — the platform silently absorbs 100% of the remainder after the govt levy today. When we centralize this into `SettlementSplitTier`, what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve as-is | Studio's tier row gets `platformPct = null` (remainder absorbed, exactly like today). Zero money-flow change. | ✓ |
| Fix it now | Start actually deducting Studio's configured platform cut as a real recipient share — a deliberate money-flow change. | |
| Not sure — explain more | Wanted more detail before deciding. | |

**User's choice:** Preserve as-is
**Notes:** Fixing the apparent bug is a separate, explicit decision for later — not a side effect of this refactor.

**Question 2:** Marketplace has a per-vendor `Vendor.govtLevyPct` DB column that overrides the module-level government levy for that specific vendor. Should the new centralized resolver absorb this, or should Marketplace keep applying its own vendor-column override alongside the resolver?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep vendor override separate | `resolveSplit('marketplace', amount)` returns the module-level default; Marketplace continues reading `Vendor.govtLevyPct` directly, as today. | ✓ |
| Fold vendor override into resolver | Model per-vendor levy as a vendor-scoped `SettlementSplitTier` row. | |

**User's choice:** Keep vendor override separate
**Notes:** Matches SETTLE-11e being explicitly deferred (tiered/vendor-category splits are next-milestone scope).

---

## Percentage unit

**Question:** SettlementSplitTier needs one canonical unit for `earnerPct`/`ministryPct`/`platformPct`. Source data today is split between whole-number percents (Transport: 5/10/15, Delivery: 5/15) and decimal fractions (Marketplace: 0.10, Events: 0.1/0.05, Stays: 0.05, Studio: 0.10/0.05). Which representation should the new column use?

| Option | Description | Selected |
|--------|-------------|----------|
| Decimal fraction 0–1 | Store 0.10 not 10. Matches 4 of 6 modules as-is; Transport/Delivery values divided by 100 during migration. | ✓ |
| Whole-number percent 0–100 | Store 10 not 0.10. Matches Transport/Delivery as-is; other 4 modules multiplied by 100 during migration. | |
| Not sure — explain more | Wanted to see resolveSplit() math under each option first. | |

**User's choice:** Decimal fraction 0–1
**Notes:** None.

---

## Admin surface

**Question:** Requirement 1 says an operator must view/update split percentages without a code deploy. There's currently no dedicated admin web page for any config (only a generic untyped `PATCH /admin/config/:key` backend endpoint, no frontend for it). What should Phase 18 build?

| Option | Description | Selected |
|--------|-------------|----------|
| Backend CRUD endpoints only | New role-gated GET/PATCH endpoints on AdminController for SettlementSplitTier. Satisfies the requirement via API. | ✓ |
| Backend + new web admin page | Same backend endpoints, plus a new page in web/src/app/admin/. | |

**User's choice:** Backend CRUD endpoints only
**Notes:** Matches the project's existing pattern — config editing has never had a dedicated web page.

---

## Effective-dating scope

**Question:** "Effective-dated" per SETTLE-11c means already-settled transactions keep their historical percentage even after config changes. Do you also want to support scheduling a change for a future date/time, or is immediate-effect-only sufficient?

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate-effect only | A tier update takes effect from the moment it's saved onward. Old rows kept for audit history; resolveSplit() always resolves the currently active row. | ✓ |
| Support future scheduling | Admin can set a change with a future effectiveFrom; resolveSplit() must resolve as of settlement time. | |

**User's choice:** Immediate-effect only
**Notes:** No current requirement asks for future scheduling; matches Success Criteria #1's exact wording.

---

## Claude's Discretion

- Exact shape of the `SettlementSplitTier` migration script (dedicated migration + backfill script vs. seed.ts edit) — planner should follow the architecture research's recommendation (dedicated script, since production config values may be stakeholder-tuned).
- Whether to include unused `minAmountNgn`/`maxAmountNgn` columns on the schema for future tiering.
- Whether to shadow-verify (old flat-key result vs. new resolver result) per call site before cutover, mirroring the proven SETTLE-09 pattern.

## Deferred Ideas

- Amount-based or vendor-category tiering (SETTLE-11e) — explicitly out of scope, backlogged.
- Fixing Studio's unapplied platform fee — noted, deliberately deferred.
- Web admin UI page for split editing — backend-only this phase.
- Future-dated split scheduling — immediate-effect only this phase.
- "Wire ResilienceModule into gRPC service scaffolds (INT-01)" todo — weakly matched (score 0.4) but belongs to Phase 20/21, not this phase. Reviewed, not folded.
