# Phase 12: Settlement Engine Foundation - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract `TourSettlementService`'s proven atomic N-way wallet fan-out pattern into a shared `SettlementService` in `CommonModule`, provision a standing Ministry wallet, and fix two pre-existing revenue bugs: Stays' zero-govt-levy escrow release, and Marketplace/Events/Studio's non-functional settlement wiring (computed-but-never-credited, or not-computed-at-all, revenue splits). Every downstream dashboard/report built on settlement data (Phase 14 Ministry Dashboard) depends on this being correct.

**In scope:**
- Generalized `SettlementService` (CommonModule) — single `$transaction`, `SELECT FOR UPDATE` per recipient wallet, idempotency keys, drift-tolerance assertion (≤0.02), append-only `Transaction` audit trail
- Standing Ministry wallet, provisioned as a real `User`+`Wallet`, wired via the existing (currently `null`) `tour.government_wallet_user_id` `PlatformConfig` key
- `@OnEvent` handlers added to Marketplace, Events, Studio (and effectively Stays, since none currently have one) so settlement actually fires — today only Kafka `onModuleInit` consumers exist, which are a dead end unless Kafka is genuinely running
- Marketplace: wire its already-computed `platformFee`/`govtLevy`/`vendorPayout` (on `Order`) into real wallet credits via `SettlementService`
- Events: add platform-wide fee/levy config (net new — no split fields exist today) and wire ticket-purchase settlement
- Studio: add platform-wide fee/levy config (net new) and wire booking settlement as a two-recipient case (platform + Ministry — no vendor leg)
- Stays: add `Booking.govtLevyPct` (net new field, snapshotted at booking creation), fix `releaseEscrow()` to apply it as an N-way fan-out instead of crediting the host 100%
- `TourSettlementService` refactored to delegate its fan-out to the new shared `SettlementService` (proves genuine reuse on the hardest, most N-way-general existing case)
- Per-recipient itemized settlement statement retrieval (backend/API only — `UI hint: no` for this phase)
- Automated test proving N-way splits sum exactly to the buyer's paid amount across non-round amounts, zero drift

**Out of scope (belongs to later phases):**
- Transport/Delivery cutover onto the generalized engine — Phase 13 (SETTLE-03, SETTLE-04, SETTLE-09)
- Ministry Dashboard UI consuming the settlement ledger — Phase 14 (depends on this phase's standing wallet)
- Formalizing the platform's own ad-hoc `SYSTEM_USER_ID` bootstrap into a first-class `SystemWallet` model — explicitly deferred (see Deferred Ideas)
- Per-organizer/per-studio negotiated fee rates (Events/Studio use uniform PlatformConfig rates, not per-record overrides like Marketplace's `Vendor.govtLevyPct`)
- Adding an owner/vendor concept to Studio spaces — they remain Ministry-owned, two-way-split facilities

</domain>

<decisions>
## Implementation Decisions

### SettlementService generalization scope
- **D-01:** `TourSettlementService` is migrated onto the new shared `SettlementService`, not left untouched. This is the primary proof that the abstraction generalizes (Tour is the hardest case: true N-way vendor resolution across GUIDE/HOST/ORGANISER/ATTRACTION types), not just a parallel implementation validated only by simpler 2-3 recipient cases.
- **D-02:** The shared service keeps `TourSettlementService`'s exact transactional primitives: single `prisma.$transaction`, raw `SELECT ... FOR UPDATE` per recipient wallet row, idempotency via `<paystackRef>-<recipientTag>` reference suffixes, append-only `Transaction` CREDIT rows per recipient.
- **D-03:** Drift-tolerance policy carries over unchanged: the platform's own commission wallet always absorbs all rounding drift and any unresolved-recipient shares (e.g., an attraction with no linked wallet). Ministry never absorbs remainder. Drift threshold stays ≤0.02 (throw + trigger refund if exceeded).

### Webhook/event wiring
- **D-04:** Marketplace, Events, and Studio each get an `@OnEvent('payment.<type>')` handler dual-wired alongside their existing (already-present) Kafka `onModuleInit` consumer — mirroring exactly how `TourSettlementService` (`@OnEvent('payment.tour_booking')`, line 97) is the one part of the codebase that already works correctly. This does not depend on whether Kafka is actually live in this deployment.
- **D-05:** Stays also gets the same `@OnEvent` treatment as part of this work even though SETTLE-06 names only Marketplace/Events/Studio — scouting confirmed `stays.service.ts` has the identical gap (Kafka-only, no `@OnEvent`). Since Stays' settlement path is being touched anyway for the escrow fix (SETTLE-05), fixing its dead-end wiring in the same pass avoids leaving a fourth silently-broken consumer standing.

### Ministry & platform wallet provisioning
- **D-06:** Provision the standing Ministry wallet only — create a real `User` (non-loginable, government-owned) + `Wallet` row via migration/seed, and set the `tour.government_wallet_user_id` `PlatformConfig` value to that user's id (currently `null`/"requires_operator_setup" in seed data).
- **D-07:** Do NOT formalize the platform's own ad-hoc `SYSTEM_USER_ID` bootstrap pattern (flagged in `tour-settlement.service.ts` comments as needing "a proper SystemWallet model") in this phase. It already works and isn't required by any SETTLE-0x requirement — tracked as a deferred idea.

### Per-module split design
- **D-08 (Marketplace):** No schema change needed — `Vendor.govtLevyPct`, `platformFeePct` (from `PlatformConfig.PLATFORM_FEE_PCT`), and `Order.platformFee`/`govtLevy`/`vendorPayout` already exist and are computed correctly at order-creation time (`marketplace.service.ts:186-204`). The only fix is making `handleOrderPayment` actually call `SettlementService` to credit vendor/Ministry/platform wallets from those already-stored amounts — today it only decrements stock and flips status, no wallet crediting happens at all.
- **D-09 (Events):** Net new — add a uniform, platform-wide `events.platform_fee_pct` and `events.govt_levy_pct` in `PlatformConfig` (same KV pattern as Transport/Delivery), applied identically to every event. No per-organizer negotiated rate (no existing field to extend, unlike Marketplace).
- **D-10 (Studio):** Net new — add uniform `studio.platform_fee_pct` / `studio.govt_levy_pct` in `PlatformConfig`. Studio settlement is a two-recipient case (platform + Ministry) — no vendor/owner wallet leg, since `StudioSlot` has no owner field and these are Ministry-owned facilities (`isGovernmentPriority` flag confirms this).
- **D-11 (Stays):** Add `govtLevyPct` to the `Booking` model (it does not exist today — the only existing `govtLevyPct` field is on `Vendor`, unrelated to Stays). Value is snapshotted onto `Booking` at booking-creation time (sourced from a `PlatformConfig` key), not read live from `PlatformConfig` at escrow-release time — this matches how `Vendor.govtLevyPct` already behaves (fixed to the record, not to the moment of settlement) and avoids a mid-cycle levy change retroactively affecting bookings already priced under the old rate.

### Settlement statements (Claude's Discretion)
- Access scope: standard `@Roles()`-gated pattern — a recipient (vendor/organizer/host) can retrieve only their own statement; `SUPER_ADMIN`/`LGA_ADMIN` (and eventually `MINISTRY_VIEWER` in Phase 14) can retrieve any. Follow the existing `RolesGuard`/`@CurrentUser` pattern used elsewhere.
- Shape: query the `Transaction` audit trail by `walletId` + date range, grouped/filtered by the `metadata` payload shape `SettlementService` writes (recipientType, recipientId, sourceType, sourceId, percentage) — this is the natural query surface since no separate "statement" table needs to exist.
- No UI this phase (`UI hint: no` per ROADMAP.md) — API endpoint(s) only. Phase 14 (Ministry Dashboard) is the first UI consumer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pattern to generalize
- `backend/src/modules/tour-bookings/tour-settlement.service.ts` (494 lines) — the exact pattern SETTLE-01 generalizes. Key lines: `@OnEvent('payment.tour_booking')` (97), `handleTourBookingPayment` (108), idempotency precheck (129, 142), split resolution incl. `tour.government_wallet_user_id` lookup (158-175), unresolved-share-rolls-into-platform behavior (207-216), drift assertion ≤0.02 (236-249), the `$transaction` + raw `SELECT ... FOR UPDATE` fan-out (254-331), `handleSettlementFailure` refund path (409), ad-hoc `SYSTEM_USER_ID` bootstrap flagged as future-refactor (66, 471-492).
- `backend/prisma/schema.prisma:649-660` — `PlatformConfig` model (simple KV: `key`, `value: Json`, `isPublic`, `metadata`).
- `backend/prisma/seed.ts:1381-1394` — where `tour.government_wallet_user_id` is currently seeded as unset/`null`.

### Modules needing the fix
- `backend/src/modules/webhooks/webhooks.service.ts:33-90` — `handlePaystack()`, the `metadata.type` switch emitting both EventEmitter2 and Kafka events. Confirms `payment.order_payment`, `payment.ticket_purchase`, `payment.studio_booking`, `payment.stay_booking` are all emitted correctly today — the break is entirely on the consumer side.
- `backend/src/modules/marketplace/marketplace.service.ts` — `createOrder` (line ~160, computes `platformFee`/`govtLevy`/`vendorPayout`), `handleOrderPayment` (line 253, needs `SettlementService` call added), `onModuleInit` Kafka wiring (36-42, needs `@OnEvent` added alongside).
- `backend/src/modules/events/events.service.ts` — `handleTicketPayment` (line 217), `onModuleInit` Kafka wiring (43-49). No fee fields exist on `Event`/`TicketType` — net new PlatformConfig keys needed.
- `backend/src/modules/studio/studio.service.ts` — `handleStudioPayment` (line 154), `onModuleInit` Kafka wiring (48-54). No fee fields on `StudioSlot`/`StudioBooking` — net new.
- `backend/src/modules/stays/stays.service.ts` — `releaseEscrow()` `@Cron(CronExpression.EVERY_HOUR)` (line 304), current buggy full-amount credit (line 327), non-atomic `$transaction([...])` array call (332-355) to be replaced with the N-way fan-out. `onModuleInit` Kafka wiring (42-48), no `@OnEvent` (D-05).

### Data model
- `backend/prisma/schema.prisma:609-624` — `Wallet` model (`userId @unique`, `balance`, `currency`).
- `backend/prisma/schema.prisma:626-647` — `Transaction` model (`walletId`, `type`, `status`, `amount`, `reference @unique`, `gateway`, `gatewayRef`, `balanceBefore`/`balanceAfter`, `metadata: Json`) — the audit trail; no separate statement table exists or is needed.
- `backend/prisma/schema.prisma:430-454` — `Booking` model (Stays) — `govtLevyPct` field needs to be added here (D-11).
- `backend/prisma/schema.prisma:456-467` — `Vendor` model — existing `govtLevyPct` precedent to mirror for Stays' new field.

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — "Platform fee source: Always from DB (`platformConfig` table), never hardcoded"; "Wallet security: SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations."
- `.planning/PROJECT.md` §Decisions — "Three-way settlement split reusing Phase 9's multi-vendor engine" rationale entry.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TourSettlementService`'s transaction/idempotency/drift-assertion/audit-trail logic — this IS the thing being extracted, not just referenced.
- `RefundService` (used by `handleSettlementFailure`) — reuse as-is for the shared service's failure path.
- Existing `PlatformConfig` KV read pattern (`transport.service.ts:517-520`, `delivery.service.ts:552`) for the new Events/Studio fee keys.

### Established Patterns
- Dual EventEmitter2 + Kafka wiring per consumer (`@OnEvent` in the service + `kafka.consume` in `onModuleInit`) — only `tour-settlement.service.ts` currently does both correctly; every other payment consumer is Kafka-only today, which is the actual root cause of SETTLE-06 (not literally "missing consumers" — the consumers exist, they're just unreachable via the webhook's EventEmitter2 path).
- `Vendor.govtLevyPct` — per-record negotiated rate, already fully wired into Marketplace's order-creation math; Events/Studio deliberately do NOT get this per-record pattern (D-09, D-10) since no per-organizer/per-studio negotiation exists today.

### Integration Points
- `WebhooksService.handlePaystack()` is the single upstream emit point for all payment types — no changes needed there, only downstream consumers.
- `SettlementService` lives in `CommonModule` (global, per SETTLE-01) so every feature module can inject it without a module-to-module import.

</code_context>

<specifics>
## Specific Ideas

- Studio spaces are Ministry-owned facilities (`isGovernmentPriority` flag on `StudioSlot`) — settlement there is intentionally simpler (2-way: platform + Ministry) than Marketplace/Events/Tour, not an oversight to "fix" by adding a vendor concept.
- Marketplace's fix is narrower than it first appears: the split math already exists and is correct (`Order.platformFee`/`govtLevy`/`vendorPayout`), only the wallet-crediting step is missing. Events and Studio are the genuinely greenfield cases — no split fields, no computation, nothing.

</specifics>

<deferred>
## Deferred Ideas

- **Formal `SystemWallet` model** replacing the ad-hoc `SYSTEM_USER_ID` bootstrap pattern — flagged in `tour-settlement.service.ts` comments as a documented future refactor; not required by any SETTLE-0x requirement, explicitly left alone this phase (D-07).
- **Per-organizer/per-studio negotiated fee rates** for Events/Studio, mirroring `Vendor.govtLevyPct` — deferred until there's an actual need for organizers/studio managers to have individually different rates.
- **Studio owner/vendor concept** — deferred; studios remain Ministry-owned for now (see Specific Ideas).
- **Verifying whether Kafka (`KAFKA_BROKER_URL`) is actually live in the current deployment** — not required to resolve this phase since the `@OnEvent` dual-wire fix (D-04) works regardless, but worth a follow-up investigation given Phase 2's roadmap claims about Kafka consumers have already been found inaccurate once (Phase 10's documentation-correction work).

</deferred>

---

*Phase: 12-settlement-engine-foundation*
*Context gathered: 2026-07-16*
