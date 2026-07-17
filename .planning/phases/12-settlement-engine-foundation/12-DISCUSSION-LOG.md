# Phase 12: Settlement Engine Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 12-settlement-engine-foundation
**Areas discussed:** SettlementService generalization scope, Webhook/event consumer wiring, Ministry/platform wallet provisioning, Rounding policy & Stays govtLevyPct sourcing, Studio recipient model, Events split configuration

---

## SettlementService generalization scope

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate Tour onto shared service | Refactor TourSettlementService to delegate to the new CommonModule SettlementService — proves reuse on the hardest N-way case | ✓ |
| Leave Tour as-is, build shared service for new callers only | Lower risk, doesn't touch live Tour code, but abstraction only proven on simpler 2-3 recipient cases | |

**User's choice:** Migrate Tour onto shared service.
**Notes:** Chosen because it's the only way to guarantee the shared abstraction actually fits a true N-way vendor-resolution caller, not just the simpler new cases.

---

## Webhook/event consumer wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-wire like TourSettlementService | Add @OnEvent handlers to Marketplace/Events/Studio matching the one proven-working pattern; works regardless of Kafka's live status | ✓ |
| Fix/verify the Kafka consumer path instead | Verify KAFKA_BROKER_URL is live and fix consumption there instead of adding a second code path | |

**User's choice:** Dual-wire like TourSettlementService.
**Notes:** Scouting found the "missing webhook consumers" framing in SETTLE-06 undersells the issue — none of Marketplace/Events/Studio/Stays have @OnEvent handlers at all, only Kafka onModuleInit consumers. Stays was folded into this fix too (D-05) even though SETTLE-06 doesn't name it, since it has the identical gap and is already being touched for the escrow fix.

---

## Ministry & platform wallet provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Provision Ministry wallet only, leave SYSTEM_USER_ID as-is | Real User+Wallet for Ministry via migration/seed; leave platform's ad-hoc SYSTEM_USER_ID bootstrap untouched | ✓ |
| Provision both Ministry wallet AND a formal SystemWallet model | Also replace the ad-hoc SYSTEM_USER_ID pattern with a first-class concept | |

**User's choice:** Provision Ministry wallet only.
**Notes:** SystemWallet formalization deferred — not required by any SETTLE-0x requirement, tracked as a deferred idea.

---

## Rounding policy & Stays govtLevyPct sourcing

| Option | Description | Selected |
|--------|-------------|----------|
| Platform absorbs remainder + snapshot govtLevyPct at booking | Matches Tour precedent (platform is deterministic remainder-holder) and Marketplace's existing Vendor.govtLevyPct pattern (fixed to the record) | ✓ |
| Read levy live from PlatformConfig at release time | Simpler but a mid-cycle levy change would retroactively affect already-priced bookings | |

**User's choice:** Platform absorbs remainder + snapshot govtLevyPct at booking creation.
**Notes:** Booking.govtLevyPct does not exist today — confirmed the only existing govtLevyPct field is on Vendor, unrelated to Stays. Net new field required.

---

## Studio recipients

| Option | Description | Selected |
|--------|-------------|----------|
| Two-way split only — platform + Ministry | Studio spaces are Ministry-owned facilities; no vendor payout leg needed | ✓ |
| Add a studio-owner/vendor concept in this phase | Model studios as vendor-run for future non-government studio onboarding | |

**User's choice:** Two-way split only.
**Notes:** Confirmed via schema audit — StudioSlot has isGovernmentPriority flag but no ownerId field anywhere.

---

## Events split configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform PlatformConfig-driven rate for all events | Single events.platform_fee_pct / events.govt_levy_pct in PlatformConfig, applied equally to every event | ✓ |
| Per-organizer negotiated rate, mirroring Vendor.govtLevyPct | Add govtLevyPct/platformFeePct directly on Event/organizer record | |

**User's choice:** Uniform PlatformConfig-driven rate.
**Notes:** Confirmed via schema audit — Event/TicketType have zero fee/split fields today, unlike Marketplace's existing per-vendor pattern. No current need for per-organizer negotiated rates.

---

## Claude's Discretion

- Settlement statement (SETTLE-07) API access scope and query shape — standard `@Roles()`-gated pattern (own statement for recipients, any for admins), queried off the `Transaction` audit trail's `metadata` payload. No UI this phase (`UI hint: no`).

## Deferred Ideas

- Formal `SystemWallet` model replacing the ad-hoc `SYSTEM_USER_ID` bootstrap pattern (documented in code as a future refactor).
- Per-organizer/per-studio negotiated fee rates for Events/Studio.
- Studio owner/vendor concept.
- Verifying whether Kafka (`KAFKA_BROKER_URL`) is actually live in the current deployment — not required to resolve this phase, but worth a follow-up investigation given Phase 2's roadmap claims about Kafka have already been found inaccurate once (Phase 10's documentation-correction work).
