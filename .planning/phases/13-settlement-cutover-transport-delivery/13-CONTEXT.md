# Phase 13: Settlement Cutover — Transport & Delivery - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Move Transport's live driver payouts and Delivery's live rider payouts off their current hardcoded 85/15 and 80/20 splits and onto the generalized three-way `SettlementService` built in Phase 12 — adding the Ministry as a real third leg — with mandatory shadow-mode verification proving no live payout amount changes silently before either module cuts over.

**In scope:**
- Transport's `completeTrip()` settlement converges onto `SettlementService.settle()` — three-way split (driver / Ministry / platform), replacing the inline `$transaction` that only credits the driver wallet today.
- Delivery's `completeDelivery()` settlement converges onto `SettlementService.settle()` the same way — three-way split (rider / Ministry / platform).
- New PlatformConfig keys for both modules' Ministry/platform commission split (structure and defaults are Claude's discretion — see Decisions).
- A from-scratch shadow-mode verification harness: batch re-computation over historical completed trips/deliveries, followed by a live dual-run bake period comparing new-vs-old on every real completion, before either module's cutover flag can flip.
- Independent per-module `PlatformConfig` cutover flags (`transport.settlement_engine_enabled`, `delivery.settlement_engine_enabled`) acting as both the go-live switch and an instant rollback lever.
- For the first time, real wallet credits for the platform's and Ministry's commission on every trip/delivery (today: computed but never credited to any wallet — see Decisions).

**Out of scope (belongs to other phases or explicitly deferred):**
- Ministry Dashboard UI consuming this settlement data — Phase 14.
- Dispute/adjustment workflow (SETTLE-10) — deferred to v2 per PROJECT.md.
- Configurable per-module Ministry split tiers beyond what this phase needs (SETTLE-11) — deferred to v2.
- Any change to how fares/fees are computed (`getFareEstimate`, `getFeeEstimate`, surge pricing) — untouched, only the post-completion settlement step changes.
- Building a real rider/customer wallet-debit or Paystack-charge flow for trip fares — genuinely out of scope; fares remain uncollected via wallet/Paystack in this codebase today (see Decisions), and introducing one is a separate, much larger change not implied by SETTLE-03/04/09.

</domain>

<decisions>
## Implementation Decisions

### Ministry's cut & split ratios
- **D-01 (LOCKED):** Driver keeps exactly 85% of fare, rider keeps exactly 80% of fee — bit-for-bit unchanged from today. Ministry's cut is carved out of what is today pure platform commission (the remaining 15% / 20%), not out of the driver/rider's share. This deliberately diverges from Phase 12's Marketplace/Events/Stays precedent (`vendorPayout = total - platformFee - govtLevy`, where the levy reduces the vendor/host's take) — resolved this way because Phase 13's own roadmap success criteria explicitly require "no live driver/rider payout amount changes silently" and "live driver and rider wallet credits match the shadow-mode-verified amounts exactly." The Marketplace-style levy-reduces-earner-payout model is structurally incompatible with that requirement for these two modules.
- **D-02 (Claude's discretion, exercised):** Two new PlatformConfig keys per module, summing to today's existing total: `transport.govt_levy_pct` + `transport.platform_fee_pct` = 15 (unchanged total commission pool); `delivery.govt_levy_pct` + `delivery.platform_fee_pct` = 20 (unchanged total). Default `govt_levy_pct` = 5% for both (mirrors the existing 5% precedent already seeded for Events/Studio/Stays), with `platform_fee_pct` absorbing the remainder (10% Transport, 15% Delivery). All values DB-configurable per CLAUDE.md's "platform fee source always from DB, never hardcoded."

### Platform wallet crediting (net-new bookkeeping change)
- **D-03 (LOCKED):** Confirmed intended — treat as a bug fix, not a scope violation. Today, Transport/Delivery only credit the driver/rider wallet; the platform's commission is computed and stored on `Trip.platformFee` / `DeliveryOrder.platformFee` but never actually credited to any wallet, and there is no rider/customer wallet debit anywhere in either module (fares are not collected via Paystack or wallet debit in this codebase — see Scouting Findings below). Cutting over to `SettlementService` will, for the first time, put real credits into the platform's system wallet and the Ministry's wallet on every trip/delivery completion. This is consistent with SETTLE-01's audit-trail requirement and matches how every other settled module (Marketplace, Events, Stays, Tour) already behaves.
- **D-04 (Claude's discretion, exercised):** `SettlementService.settle()` inputs for both modules: `amountKobo = fare × 100` (sourced from `Trip.fare` / `DeliveryOrder.fee`, matching what's already used to compute today's split), `buyerWalletId = null` (there is no real buyer/rider wallet debit to refund from), `gateway = 'INTERNAL'`. On settlement failure, `onFailure` should revert the trip/delivery status (e.g. back to a retryable state) rather than attempt a wallet refund, since `RefundService.refund()` requires a real `buyerWalletId` and none exists for these two modules.

### Shadow-mode verification design
- **D-05 (LOCKED):** Two-stage verification, built from scratch (confirmed: zero shadow/dry-run infrastructure exists anywhere in the codebase today). Stage 1 — a batch script re-computes the new three-way split against a sample of already-completed historical `Trip`/`DeliveryOrder` rows (using their stored `fare`/`fee`), diffing against the recorded `platformFee`/`driverEarnings`/`riderEarnings`. Stage 2 — a live dual-run bake period where `completeTrip`/`completeDelivery` continue crediting wallets via today's unchanged code path (zero risk to live payouts) while also computing — log-only, never crediting — what `SettlementService` would have produced, comparing the two on every real completion. Both stages must pass before a module's cutover flag can flip.
- **D-06 (Claude's discretion, exercised):** Exact-match required for driver/rider payout amounts specifically — stricter than `SettlementService`'s own ±₦0.02 drift tolerance, since this comparison exists specifically to prove the two paths agree, not to absorb legitimate rounding. Results logged via `Logger` plus a queryable report (script output file or simple summary), no new alerting infrastructure needed since this is a one-time pre-cutover gate rather than an ongoing pipeline.

### Cutover mechanism & rollback
- **D-07 (LOCKED):** Independent per-module `PlatformConfig` boolean flags — `transport.settlement_engine_enabled`, `delivery.settlement_engine_enabled` — read at `completeTrip()`/`completeDelivery()` time. Either module can cut over as soon as its own shadow-mode bake period passes cleanly, without waiting on the other. The same flag doubles as an instant rollback lever (flip back to `false`, no redeploy) if a live regression is discovered post-cutover.
- **D-08 (Claude's discretion, exercised):** Minimum bake-period gate before a flag flip is allowed: whichever is later of 3 elapsed days OR 100 completed trips/deliveries, with zero discrepancies across the full bake sample (per D-06's exact-match bar). After roughly 2 weeks of stable live operation on the new path with no regressions, the old inline hardcoded-split code and the shadow-comparison logging can be removed in a follow-up cleanup pass — but the `PlatformConfig` flag itself should remain in place afterward (cheap to keep) as a documented, if normally-unused, kill switch. A government payments system benefits from a standing rollback lever even after the legacy code path is cleaned up.

### Scouting Findings (informs planning — not decisions, but load-bearing facts)
- **Fare payment model:** Neither Transport nor Delivery collects the fare/fee via Paystack webhook or wallet debit anywhere in the current codebase — `webhooks.service.ts` has zero transport/delivery cases, and grepping both service files for any DEBIT-type wallet operation returns nothing. The `fare`/`fee` values are purely bookkeeping numbers driving the driver/rider credit; there is no traceable inbound charge funding today's driver/rider payout. This is pre-existing behavior, unchanged by this phase, and directly shapes D-04's `buyerWalletId = null` decision.
- **Idempotency scheme mismatch:** Today's Transport/Delivery idempotency guard is trip/order-status-based (`updateMany({ where: { status: 'IN_PROGRESS' } })`, count===0 throw) with a fresh random UUID reference generated on every call — not the reference-prefix idempotency `SettlementService.settle()` expects (`Transaction.findFirst({ reference: { startsWith: '${reference}-' } })`). Cutover requires a **stable, deterministic reference per trip/delivery** (e.g. `ISY-TRP-<tripId-derived>` / `ISY-DLV-<orderId-derived>`) so replay-detection works correctly — this is an implementation detail for the planner/researcher, not a product decision requiring further user input.
- **`resolveMinistryWallet()` is hardcoded to Tour's key:** `SettlementService.resolveMinistryWallet()` (`settlement.service.ts:321-328`) reads only the `tour.government_wallet_user_id` PlatformConfig key. Transport/Delivery reusing the same standing Ministry wallet (rather than needing separate per-module Ministry wallets) is the natural read of Phase 12's "standing Ministry wallet" design — the planner should confirm whether to reuse `resolveMinistryWallet()` as-is (same wallet, same key) or generalize it to accept a key parameter, but no separate Ministry wallet per module is implied by anything discussed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Settlement engine (Phase 12 foundation being extended)
- `backend/src/common/services/settlement.service.ts` — the shared `settle()` API this phase must converge onto. Key lines: `SettlementInput`/`SettlementRecipient` interfaces (34-61), idempotency precheck (94-103) + `P2002` race fallback (236-253), drift-tolerance assertion ≤0.02 (123-144), atomic `$transaction` + canonical-order `SELECT ... FOR UPDATE` fan-out (146-232), `handleSettlementFailure` refund path (262-296), `resolveMinistryWallet()` hardcoded to `tour.government_wallet_user_id` (321-328).
- `backend/src/modules/tour-bookings/tour-settlement.service.ts:217-271` — the reference template for how a domain service resolves recipients then delegates to one `settlementService.settle()` call, including `onSettled`/`onFailure` hooks doing the booking-status transition inside the same tx.
- `.planning/phases/12-settlement-engine-foundation/12-CONTEXT.md` — full Phase 12 decision record (D-01 through D-11), especially D-03 (drift-tolerance policy) and the SettlementService architectural commitments.

### Modules being cut over
- `backend/src/modules/transport/transport.service.ts:503-586` — `completeTrip()`, the current 85/15 split (516-524) and driver-only wallet credit (`$transaction`, 535-578). Triggered directly from `PATCH trips/:id/complete` (`transport.controller.ts:184-196`, `@Roles(DRIVER)`), not a webhook or cron.
- `backend/src/modules/delivery/delivery.service.ts:516-608` — `completeDelivery()`, the current 80/20 split (548-556) and rider-only wallet credit (566-608). Triggered from `PATCH orders/:id/complete` (`delivery.controller.ts:175-187`, `@Roles(DRIVER)`).
- `backend/prisma/seed.ts:1269` — `transport_platform_fee_pct` = 15 seed value; `backend/prisma/seed.ts:1299` — `delivery_platform_fee_pct` = 20 seed value. New `govt_levy_pct` keys per D-02 should follow the same seeding pattern used at `seed.ts:1469-1514` for Events/Studio/Stays.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — SETTLE-03, SETTLE-04, SETTLE-09 (full requirement text).
- `.planning/ROADMAP.md` §"Phase 13: Settlement Cutover — Transport & Delivery" — goal, 4 success criteria, dependency on Phase 12.
- `.planning/PROJECT.md` §Key Decisions — "Transport/Delivery cutover onto the new settlement engine is its own gated phase (13)... with mandatory shadow-mode verification — never a big-bang swap of live payouts."

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — "Platform fee source: Always from DB, never hardcoded"; "SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations"; reference-pattern conventions (`ISY-<TYPE>-<12-char-uppercase>`) to extend for Transport/Delivery settlement references.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettlementService.settle()` — the entire fan-out/idempotency/drift/audit-trail engine is ready to call; Transport/Delivery just need to resolve a `SettlementRecipient[]` array (driver-or-rider + Ministry) and call it, mirroring Tour's delegation pattern.
- `resolveMinistryWallet()` — directly reusable if Transport/Delivery share Tour's standing Ministry wallet (see Scouting Findings).

### Established Patterns
- Per-module `PlatformConfig` fee-percentage read pattern (`marketplace.service.ts:187`, `transport.service.ts:517-520`, `delivery.service.ts:548-552`) — the direct analog for the two new `govt_levy_pct`/`platform_fee_pct` keys per module.
- `TourSettlementService`'s domain-service-resolves-then-delegates shape (`tour-settlement.service.ts:217-271`) is the template both `completeTrip()` and `completeDelivery()` should converge to, replacing their current inline `$transaction` blocks.

### Integration Points
- `completeTrip()`/`completeDelivery()` are the sole call sites needing modification — no webhook, no Kafka consumer, no cron involved for either module's settlement path (unlike Marketplace/Events/Studio/Stays in Phase 12).
- Both endpoints are driver/rider-initiated direct HTTP calls (`@Roles(DRIVER)`), not asynchronous event consumers — the cutover flag check and shadow-mode comparison both happen synchronously inline within the existing request/response cycle.

</code_context>

<specifics>
## Specific Ideas

- No specific UI/UX or copy was discussed — this phase is backend-only (`UI hint: no` per ROADMAP.md).
- The "5% Ministry levy" default chosen for D-02 explicitly mirrors the existing Events/Studio/Stays precedent value (not a new number invented for this phase) — worth flagging to the planner as a reasonable, consistent-feeling default rather than an arbitrary pick, though the actual government-negotiated rate is ultimately a business decision that can be tuned via PlatformConfig without a redeploy.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Two adjacent process/hygiene items were raised alongside this discussion but are not phase-13 implementation scope: filing INT-01/INT-02 from the v2.0 milestone audit as explicit prerequisite tasks for Phase 16/17, and re-running Phase 11's stale VERIFICATION.md. These are being handled directly as follow-up actions, not folded into Phase 13's CONTEXT.md.)

</deferred>

---

*Phase: 13-settlement-cutover-transport-delivery*
*Context gathered: 2026-07-17*
