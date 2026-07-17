# Phase 13: Settlement Cutover — Transport & Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 13-settlement-cutover-transport-delivery
**Areas discussed:** Ministry's cut & ratios, Platform wallet crediting, Shadow-mode design, Cutover & rollback

---

## Ministry's cut & ratios

| Option | Description | Selected |
|--------|-------------|----------|
| Out of platform's existing share | Driver keeps exactly 85%, rider keeps exactly 80% — unchanged. Ministry's cut carved out of what used to be pure platform commission. | |
| Out of driver/rider's share (like Marketplace) | Matches Phase 12's precedent exactly, but driver/rider take-home drops — appears to conflict with roadmap SC3/SC4 wording. | |
| You decide — pick whichever is consistent with the roadmap text | Claude resolves the tension by following the literal roadmap wording. | ✓ |

**User's choice:** You decide — Claude resolved in favor of "out of platform's existing share" (driver/rider payout unchanged), since that's the phase's own locked success criterion.
**Notes:** Surfaced a real tension: Phase 12's Marketplace/Events/Stays precedent reduces the vendor/host's payout by the govt levy, but Phase 13's roadmap explicitly requires driver/rider payouts to stay exactly unchanged. Documented as a deliberate divergence in CONTEXT.md D-01.

| Option | Description | Selected |
|--------|-------------|----------|
| Two new PlatformConfig keys per module summing to the existing total | e.g. transport.govt_levy_pct + transport.platform_fee_pct = 15. | |
| Reuse a single global govt-levy ratio across all modules | One PlatformConfig key applied uniformly platform-wide. | |
| You decide the structure and default value | Claude picks key structure and default split. | ✓ |

**User's choice:** You decide.
**Notes:** Claude chose two new per-module keys (govt_levy_pct + platform_fee_pct, summing to the existing 15/20 total), defaulting govt_levy_pct to 5% (mirrors the existing Events/Studio/Stays precedent).

---

## Platform wallet crediting

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — intended, treat as a bug fix | Consistent with SETTLE-01's audit-trail requirement and how every other module already works. | ✓ |
| Flag for stakeholder confirmation before implementing | Changes real cash position for the first time on two high-volume modules. | |

**User's choice:** Yes — intended, treat as a bug fix.
**Notes:** Confirmed today's gap (platform commission computed but never credited to any wallet, no rider debit exists either) is a pre-existing defect this phase should close, not preserve.

| Option | Description | Selected |
|--------|-------------|----------|
| amountKobo = fare×100, buyerWalletId = null, gateway = 'INTERNAL' | The fare is the notional pot being split three ways; no real buyer wallet to refund from. | |
| You decide | Claude picks the settle() input mapping. | ✓ |

**User's choice:** You decide.
**Notes:** Claude confirmed the amountKobo/buyerWalletId=null/gateway='INTERNAL' mapping, and additionally specified that on settlement failure, onFailure should revert trip/delivery status rather than attempt a wallet refund (since there's no real buyerWalletId to refund from).

---

## Shadow-mode design

| Option | Description | Selected |
|--------|-------------|----------|
| Batch re-computation over historical trips/deliveries | One-off script re-runs new split logic against completed rows, diffs vs. recorded amounts. | |
| Live dual-run bake period on real completions | Old path stays live; new path computed and logged only, compared on every real completion. | |
| Both — batch first, then a live bake period | More thorough, more implementation work. | ✓ |

**User's choice:** Both — batch first, then a live bake period.
**Notes:** Confirmed zero shadow/dry-run infrastructure exists anywhere in the codebase — this is a from-scratch build.

| Option | Description | Selected |
|--------|-------------|----------|
| Exact match required; log-only via Logger + a queryable report | Stricter than SettlementService's own ±0.02 drift tolerance. | |
| You decide the reporting mechanism and match threshold | Claude picks. | ✓ |

**User's choice:** You decide.
**Notes:** Claude chose exact-match for driver/rider payout amounts specifically (stricter than the ±0.02 drift tolerance, since this proves path-agreement not rounding absorption), logged via Logger + a queryable report, no new alerting infra.

---

## Cutover & rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Independent per-module PlatformConfig flags | Either module cuts over as soon as its own shadow-mode passes; instant rollback lever. | ✓ |
| One bundled cutover for both modules together | Simpler, but couples the two modules' timelines and rollback. | |

**User's choice:** Independent per-module PlatformConfig flags.
**Notes:** Also serves as the rollback mechanism (flip the flag back, no redeploy).

| Option | Description | Selected |
|--------|-------------|----------|
| You decide a reasonable bake threshold and cleanup plan | Claude picks a concrete threshold and documents flag/cleanup lifecycle. | ✓ |
| Keep the flag as a permanent kill switch, no cleanup | Never remove the old code path or flag. | |

**User's choice:** You decide.
**Notes:** Claude set the bake threshold at whichever is later of 3 days OR 100 completed trips/deliveries with zero discrepancies. Old code + shadow-logging can be cleaned up after ~2 weeks of stable operation, but the PlatformConfig flag itself stays as a documented kill switch.

---

## Claude's Discretion

- Ministry/platform split key structure and 5% default value (D-02)
- SettlementService input mapping for Transport/Delivery — amountKobo, buyerWalletId=null, gateway='INTERNAL', onFailure behavior (D-04)
- Shadow-mode discrepancy reporting mechanism and exact-match threshold (D-06)
- Bake-period threshold (3 days OR 100 completions, whichever later) and post-stability cleanup plan, keeping the flag as a permanent kill switch (D-08)
- Idempotency reference scheme (deterministic per-trip/order reference, replacing today's random-UUID-per-call scheme) — implementation detail, not raised as a user-facing question
- Whether to reuse `resolveMinistryWallet()` as-is (same Ministry wallet/key as Tour) vs. generalizing it — flagged as a planner decision, not resolved here

## Deferred Ideas

None raised as scope creep during this discussion. Two adjacent process/hygiene items were mentioned in the command context (filing INT-01/INT-02 from the v2.0 milestone audit as Phase 16/17 prerequisites, and re-running Phase 11's stale VERIFICATION.md) — these are not Phase 13 implementation scope and are being handled as separate follow-up actions outside this discussion.
