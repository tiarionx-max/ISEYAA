# Phase 12: Settlement Engine Foundation - Research

**Researched:** 2026-07-17
**Domain:** NestJS/Prisma atomic multi-party wallet settlement (fintech ledger fan-out)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SettlementService generalization scope**
- **D-01:** `TourSettlementService` is migrated onto the new shared `SettlementService`, not left untouched. This is the primary proof that the abstraction generalizes (Tour is the hardest case: true N-way vendor resolution across GUIDE/HOST/ORGANISER/ATTRACTION types), not just a parallel implementation validated only by simpler 2-3 recipient cases.
- **D-02:** The shared service keeps `TourSettlementService`'s exact transactional primitives: single `prisma.$transaction`, raw `SELECT ... FOR UPDATE` per recipient wallet row, idempotency via `<paystackRef>-<recipientTag>` reference suffixes, append-only `Transaction` CREDIT rows per recipient.
- **D-03:** Drift-tolerance policy carries over unchanged: the platform's own commission wallet always absorbs all rounding drift and any unresolved-recipient shares (e.g., an attraction with no linked wallet). Ministry never absorbs remainder. Drift threshold stays ≤0.02 (throw + trigger refund if exceeded).

**Webhook/event wiring**
- **D-04:** Marketplace, Events, and Studio each get an `@OnEvent('payment.<type>')` handler dual-wired alongside their existing (already-present) Kafka `onModuleInit` consumer — mirroring exactly how `TourSettlementService` (`@OnEvent('payment.tour_booking')`, line 97) is the one part of the codebase that already works correctly. This does not depend on whether Kafka is actually live in this deployment.
- **D-05:** Stays also gets the same `@OnEvent` treatment as part of this work even though SETTLE-06 names only Marketplace/Events/Studio — scouting confirmed `stays.service.ts` has the identical gap (Kafka-only, no `@OnEvent`). Since Stays' settlement path is being touched anyway for the escrow fix (SETTLE-05), fixing its dead-end wiring in the same pass avoids leaving a fourth silently-broken consumer standing.

**Ministry & platform wallet provisioning**
- **D-06:** Provision the standing Ministry wallet only — create a real `User` (non-loginable, government-owned) + `Wallet` row via migration/seed, and set the `tour.government_wallet_user_id` `PlatformConfig` value to that user's id (currently `null`/"requires_operator_setup" in seed data).
- **D-07:** Do NOT formalize the platform's own ad-hoc `SYSTEM_USER_ID` bootstrap pattern (flagged in `tour-settlement.service.ts` comments as needing "a proper SystemWallet model") in this phase. It already works and isn't required by any SETTLE-0x requirement — tracked as a deferred idea.

**Per-module split design**
- **D-08 (Marketplace):** No schema change needed — `Vendor.govtLevyPct`, `platformFeePct` (from `PlatformConfig.PLATFORM_FEE_PCT`), and `Order.platformFee`/`govtLevy`/`vendorPayout` already exist and are computed correctly at order-creation time (`marketplace.service.ts:186-204`). The only fix is making `handleOrderPayment` actually call `SettlementService` to credit vendor/Ministry/platform wallets from those already-stored amounts — today it only decrements stock and flips status, no wallet crediting happens at all.
- **D-09 (Events):** Net new — add a uniform, platform-wide `events.platform_fee_pct` and `events.govt_levy_pct` in `PlatformConfig` (same KV pattern as Transport/Delivery), applied identically to every event. No per-organizer negotiated rate (no existing field to extend, unlike Marketplace).
- **D-10 (Studio):** Net new — add uniform `studio.platform_fee_pct` / `studio.govt_levy_pct` in `PlatformConfig`. Studio settlement is a two-recipient case (platform + Ministry) — no vendor/owner wallet leg, since `StudioSlot` has no owner field and these are Ministry-owned facilities (`isGovernmentPriority` flag confirms this).
- **D-11 (Stays):** Add `govtLevyPct` to the `Booking` model (it does not exist today — the only existing `govtLevyPct` field is on `Vendor`, unrelated to Stays). Value is snapshotted onto `Booking` at booking-creation time (sourced from a `PlatformConfig` key), not read live from `PlatformConfig` at escrow-release time — this matches how `Vendor.govtLevyPct` already behaves (fixed to the record, not to the moment of settlement) and avoids a mid-cycle levy change retroactively affecting bookings already priced under the old rate.

**Settlement statements (Claude's Discretion)**
- Access scope: standard `@Roles()`-gated pattern — a recipient (vendor/organizer/host) can retrieve only their own statement; `SUPER_ADMIN`/`LGA_ADMIN` (and eventually `MINISTRY_VIEWER` in Phase 14) can retrieve any. Follow the existing `RolesGuard`/`@CurrentUser` pattern used elsewhere.
- Shape: query the `Transaction` audit trail by `walletId` + date range, grouped/filtered by the `metadata` payload shape `SettlementService` writes (recipientType, recipientId, sourceType, sourceId, percentage) — this is the natural query surface since no separate "statement" table needs to exist.
- No UI this phase (`UI hint: no` per ROADMAP.md) — API endpoint(s) only. Phase 14 (Ministry Dashboard) is the first UI consumer.

### Claude's Discretion
- Settlement statement access-control implementation details (which controller hosts the endpoint, exact route shape) — not locked, follow existing `@Roles()`/`@CurrentUser` conventions.
- Settlement statement query shape (filters, pagination) — not locked beyond "query Transaction by walletId + date range, filter by metadata".

### Deferred Ideas (OUT OF SCOPE)
- **Formal `SystemWallet` model** replacing the ad-hoc `SYSTEM_USER_ID` bootstrap pattern — flagged in `tour-settlement.service.ts` comments as a documented future refactor; not required by any SETTLE-0x requirement, explicitly left alone this phase (D-07).
- **Per-organizer/per-studio negotiated fee rates** for Events/Studio, mirroring `Vendor.govtLevyPct` — deferred until there's an actual need for organizers/studio managers to have individually different rates.
- **Studio owner/vendor concept** — deferred; studios remain Ministry-owned for now.
- **Verifying whether Kafka (`KAFKA_BROKER_URL`) is actually live in the current deployment** — not required to resolve this phase since the `@OnEvent` dual-wire fix (D-04) works regardless.
- **Transport/Delivery cutover onto the generalized engine** — Phase 13 (SETTLE-03, SETTLE-04, SETTLE-09).
- **Ministry Dashboard UI consuming the settlement ledger** — Phase 14.
- **Dispute/adjustment workflow (SETTLE-10)** and **configurable per-module Ministry split tiers (SETTLE-11)** — v2 deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETTLE-01 | Shared `SettlementService` in `CommonModule` generalizing `TourSettlementService`'s pattern | Confirmed exact source lines to extract (see Canonical Pattern below); generic API design proposed in Architecture Patterns; confirmed `CommonModule`/`PrismaModule` are both `@Global()` so no new imports needed in feature modules |
| SETTLE-02 | Standing Ministry wallet reusing `tour.government_wallet_user_id` | Confirmed seed.ts:1380-1394 currently seeds this key as `Prisma.JsonNull`; confirmed `ensureSystemWallet()` pattern (lines 471-492) as the template for the Ministry user+wallet upsert |
| SETTLE-05 | Stays' `releaseEscrow()` applies `Booking.govtLevyPct` | Confirmed current bug at stays.service.ts:327 (100% credited to host, no split); confirmed non-atomic `$transaction([...])` array call at 332-355 to replace with `SettlementService.settle()` |
| SETTLE-06 | Marketplace/Events/Studio working `@OnEvent` consumers | Confirmed root cause: webhooks.service.ts emits all 4 payment types correctly via EventEmitter2 (lines 39-72); confirmed zero `@OnEvent` handlers exist in marketplace/events/studio/stays services — only Kafka `onModuleInit` consumers, which are no-ops when `KAFKA_BROKER_URL` unset |
| SETTLE-07 | Per-recipient itemized settlement statement | Confirmed `Transaction.metadata: Json?` is the only viable query surface (no separate statement table); confirmed `RolesGuard`/`@CurrentUser` pattern for access scoping (wallet.controller.ts) |
| SETTLE-08 | N-way splits sum exactly to buyer-paid amount, zero drift | Confirmed exact test pattern to follow: `tour-settlement.service.spec.ts` (623 lines, 12 scenarios) already proves this invariant for Tour — same technique (sum `transaction.create` mock captures, assert equals `payload.amount / 100`) generalizes directly |
</phase_requirements>

## Summary

`TourSettlementService` (`backend/src/modules/tour-bookings/tour-settlement.service.ts`, 494 lines) is a proven, production-quality atomic N-way wallet fan-out: one `prisma.$transaction`, raw `SELECT ... FOR UPDATE` per wallet row, idempotency via reference-prefix precheck, append-only `Transaction` CREDIT rows, and a platform wallet that absorbs all rounding drift and unresolved shares (with a ≤₦0.02 defensive assertion). Every claim in CONTEXT.md's canonical references was verified directly against the current codebase — all line numbers, the webhook emit paths, the Kafka-only dead-end pattern in Marketplace/Events/Studio/Stays, and the `tour.government_wallet_user_id` unset seed value are exactly as described. No corrections needed.

The generalization work is conceptually narrow: extract Tour's transactional primitives into a caller-agnostic `SettlementService.settle()` that accepts a pre-resolved array of `{ tag, walletId, amountNgn, metadata }` recipients plus a total charge amount, and internally computes the platform's absorbing share, asserts drift, and performs the atomic fan-out — exactly Tour's steps 5-6 today. Each module's `@OnEvent` handler stays responsible for its own domain-specific resolution logic (Marketplace: already-computed `Order.platformFee/govtLevy/vendorPayout`; Events/Studio: new flat `PlatformConfig` rates; Stays: snapshotted `Booking.govtLevyPct`) — mirroring how Tour's handler resolves GUIDE/HOST/ORGANISER/ATTRACTION vendor types before ever touching the shared service. Status-flip side effects (order→PROCESSING, ticket→ISSUED, booking→CONFIRMED) must stay atomic with the wallet writes, so the service needs an optional in-transaction callback hook — Tour's existing step 6c (`if (!isSplitBillChild) tx.tourBooking.update(...)`) is the template for this.

One item needs explicit confirmation before planning locks the API shape: CONTEXT.md's D-09 (Events) doesn't state the recipient count. Given `Event.organizerId` exists (unlike Studio's ownerless `StudioSlot`) and Events needs to actually pay organizers, the natural read is Events is a 3-way split (organizer + Ministry + platform) — structurally identical to Marketplace and Stays. This is flagged as `[ASSUMED]` below and should be confirmed with the user or explicitly locked by the planner before implementation.

**Primary recommendation:** Build `SettlementService.settle()` as a caller-agnostic atomic fan-out primitive (pre-resolved recipients in, wallet credits + audit rows + drift-safe platform absorption out, with an optional in-transaction status-flip callback), migrate `TourSettlementService` onto it first (D-01, proves the abstraction on the hardest case), then wire the four simpler callers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Atomic wallet fan-out (locking, drift, audit rows) | API/Backend (`CommonModule`) | Database (Postgres row locks via `SELECT FOR UPDATE`) | Must run inside a single Postgres transaction; `SettlementService` is the sole owner of wallet-mutation logic per module boundary rules (CLAUDE.md: "SELECT FOR UPDATE on every debit") |
| Domain-specific split resolution (vendor/organizer/host lookup, percentage math) | API/Backend (feature module `@OnEvent` handler) | — | Each module owns its own vendor-resolution rules (Tour's GUIDE/HOST/ORGANISER/ATTRACTION switch, Marketplace's pre-computed fields) — `SettlementService` must stay domain-agnostic |
| Platform fee/levy configuration | Database (`PlatformConfig` table) | API/Backend (read-through, cached per-request only) | CLAUDE.md: "Platform fee source: Always from DB, never hardcoded" — no in-memory config caching beyond request scope |
| Settlement statement retrieval | API/Backend (new controller/route) | Database (`Transaction` table, JSON metadata filter) | No UI this phase; statement is a query over the existing audit trail, gated by `@Roles()` |
| Webhook ingestion (Paystack HMAC verify + type dispatch) | API/Backend (`WebhooksModule`) | — | Unchanged — `WebhooksService.handlePaystack()` already emits correctly; this phase only fixes downstream consumers |
| Idempotency / replay protection | Database (`Transaction.reference` unique constraint) | API/Backend (precheck query) | Precheck query is an optimization, not the sole safety net — the DB unique constraint is the authoritative guard (see Pitfall below) |

## Standard Stack

No new external dependencies are required for this phase — it is a pure extension of existing in-repo patterns (Prisma `$transaction`, NestJS `EventEmitter2`, existing `RefundService`).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 5.11.x `[VERIFIED: package.json]` | Atomic `$transaction`, raw `SELECT ... FOR UPDATE` via `$executeRaw` | Already the sole ORM/transaction layer for every wallet mutation in the codebase (`wallet.service.ts`, `tour-settlement.service.ts`, `refund.service.ts`) |
| `@nestjs/event-emitter` | 2.0.x `[VERIFIED: CLAUDE.md tech stack]` | In-process `@OnEvent`/`EventEmitter2` dispatch from `WebhooksService` to feature settlement handlers | Already the working half of the dual EventEmitter2+Kafka wiring pattern; Kafka is the non-functional half in every module except Tour |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | — |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `SELECT ... FOR UPDATE` raw SQL | Prisma's `Serializable` isolation level via `$transaction(fn, { isolationLevel: 'Serializable' })` | Serializable isolation avoids explicit row locks but adds retry-on-conflict complexity and is NOT what any existing wallet code in this repo does — would be an unjustified pattern deviation. Stick with the proven `SELECT FOR UPDATE` pattern per D-02. |
| Building a generic `SettlementService` from scratch | A decimal/money library (e.g. `dinero.js`, `decimal.js`) for the split math | The existing codebase uses plain `Number` + `Math.round(x*100)/100` for all NGN money math (kobo-to-naira conversion happens once at the Paystack boundary). Introducing a money library here would be inconsistent with every other financial calculation in the repo and is not requested by any SETTLE-0x requirement. The drift-tolerance-into-platform-wallet pattern exists precisely to make plain-`Number` math safe. |

**Installation:** None — no new packages.

## Architecture Patterns

### System Architecture Diagram

```
Paystack charge.success webhook
        │
        ▼
WebhooksService.handlePaystack()  (backend/src/modules/webhooks/webhooks.service.ts:33-92)
  - verifies HMAC-SHA512 signature
  - switches on metadata.type
  - emits BOTH EventEmitter2 (working) + Kafka (dead unless KAFKA_BROKER_URL set)
        │
        ├── payment.tour_booking ──────► TourSettlementService.handleTourBookingPaymentEvent()  [ALREADY WORKS]
        │                                   resolves GUIDE/HOST/ORGANISER/ATTRACTION → SettlementService.settle()
        │
        ├── payment.order_payment ─────► MarketplaceService @OnEvent handler [NET NEW]
        │                                   reads pre-computed Order.platformFee/govtLevy/vendorPayout
        │                                   → SettlementService.settle() (vendor + Ministry + platform)
        │
        ├── payment.ticket_purchase ───► EventsService @OnEvent handler [NET NEW]
        │                                   reads events.platform_fee_pct / events.govt_levy_pct from PlatformConfig
        │                                   → SettlementService.settle() (organizer + Ministry + platform)
        │
        ├── payment.studio_booking ────► StudioService @OnEvent handler [NET NEW]
        │                                   reads studio.platform_fee_pct / studio.govt_levy_pct from PlatformConfig
        │                                   → SettlementService.settle() (Ministry + platform — no vendor leg)
        │
        └── payment.stay_booking ──────► StaysService @OnEvent handler [NET NEW — D-05]
                                            only sets status=CONFIRMED at purchase time;
                                            actual settlement deferred to releaseEscrow() cron

                                          StaysService.releaseEscrow()  [FIXED THIS PHASE]
                                            @Cron(EVERY_HOUR) — reads Booking.govtLevyPct (snapshotted at booking-create)
                                            → SettlementService.settle() (host + Ministry + platform)

        ┌─────────────────────────────────────────────────────────────────┐
        │  SettlementService.settle()  (backend/src/common/services/, NEW) │
        │  ONE prisma.$transaction:                                        │
        │    for each resolved recipient with walletId:                    │
        │      SELECT ... FOR UPDATE  →  wallet.update  →  transaction.create│
        │    platform wallet: SELECT ... FOR UPDATE → credited with        │
        │      (chargeAmount - sum(resolved recipient amounts))            │
        │    [optional] onSettled(tx) callback — caller's own status flip  │
        │  On throw: handleSettlementFailure() → RefundService.refund()    │
        └─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/src/common/services/
├── settlement.service.ts          # NEW — SettlementService.settle(), generalized fan-out
├── __tests__/
│   └── settlement.service.spec.ts # NEW — mirrors tour-settlement.service.spec.ts's 12-scenario shape

backend/src/modules/tour-bookings/
├── tour-settlement.service.ts     # REFACTORED — delegates fan-out to SettlementService, keeps vendor resolution

backend/src/modules/marketplace/
├── marketplace.service.ts         # MODIFIED — handleOrderPayment calls SettlementService; add @OnEvent

backend/src/modules/events/
├── events.service.ts              # MODIFIED — handleTicketPayment calls SettlementService; add @OnEvent

backend/src/modules/studio/
├── studio.service.ts              # MODIFIED — handleStudioPayment calls SettlementService; add @OnEvent

backend/src/modules/stays/
├── stays.service.ts               # MODIFIED — releaseEscrow() calls SettlementService; add @OnEvent for stay_booking

backend/prisma/
├── schema.prisma                  # MODIFIED — Booking.govtLevyPct (new field)
├── seed.ts                        # MODIFIED — Ministry User+Wallet seed, tour.government_wallet_user_id set,
│                                     events.platform_fee_pct/govt_levy_pct, studio.platform_fee_pct/govt_levy_pct
├── migrations/
│   └── <timestamp>_settlement_engine_foundation/
```

### Pattern 1: Generalized `SettlementService.settle()` — caller-agnostic fan-out

**What:** A single method that accepts a fully-resolved list of recipients (module-specific resolution already done by the caller) plus the total charge amount, and performs the atomic locked fan-out + platform-absorption + drift assertion + audit trail — exactly Tour's steps 5-6 (lines 236-345) extracted into a reusable primitive.

**When to use:** Any `payment.*` consumer that needs to split a single Paystack charge across 1-N wallets plus the platform commission wallet.

**Proposed signature** (design recommendation — not found verbatim in codebase, synthesized from Tour's proven contract):
```typescript
// backend/src/common/services/settlement.service.ts

export interface SettlementRecipient {
  /** Used to build the Transaction.reference suffix (`<paystackRef>-<tag>`)
   *  and stored verbatim in Transaction.metadata.recipientType for statement
   *  queries. e.g. 'VENDOR', 'HOST', 'ORGANISER', 'GUIDE', 'MINISTRY'. */
  tag: string;
  /** Resolved wallet id, or null if unresolved (share rolls into platform —
   *  mirrors Tour's ATTRACTION-with-unset-gov-wallet fallback, D-03). */
  walletId: string | null;
  /** Pre-computed NGN amount for this recipient (2dp). Caller does the
   *  percentage math — SettlementService only sums and locks. */
  amountNgn: number;
  /** Extra fields merged into this recipient's Transaction.metadata
   *  (e.g. { vendorId, percentage, orderId }). */
  metadata?: Record<string, unknown>;
}

export interface SettlementInput {
  /** Original Paystack charge reference — idempotency anchor and the
   *  prefix for every generated Transaction.reference. */
  paystackReference: string;
  /** Total buyer-paid amount in kobo, as Paystack delivers it. */
  amountKobo: number;
  /** Pre-resolved recipients (does NOT include the platform row — that is
   *  always computed as chargeAmount - sum(resolved recipient amounts)). */
  recipients: SettlementRecipient[];
  /** Merged into the platform commission row's Transaction.metadata
   *  (e.g. { module: 'marketplace', orderId, unresolvedShares: [...] }). */
  platformMetadata?: Record<string, unknown>;
  /** Human-readable description prefix for CREDIT rows, e.g. 'Order commission'. */
  description: string;
  /** Runs INSIDE the same $transaction after all wallet writes succeed —
   *  use for the caller's own status flip (order→PROCESSING, ticket→ISSUED,
   *  booking→CONFIRMED). Mirrors Tour's step 6c. Optional — Stays'
   *  releaseEscrow() cron needs this for Booking.escrowReleasedAt. */
  onSettled?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export interface SettlementResult {
  platformAmountNgn: number;
  recipientCreditsNgn: { tag: string; amountNgn: number; walletId: string | null }[];
}

@Injectable()
export class SettlementService {
  async settle(input: SettlementInput): Promise<SettlementResult> {
    // 1. Idempotency precheck (see Pitfall: precheck is not the sole guard)
    // 2. Compute platformAmountNgn = chargeAmountNgn - sum(resolved recipients)
    // 3. Drift assert ≤ 0.02 (Tour lines 240-249)
    // 4. ONE $transaction: SELECT FOR UPDATE + credit each resolved recipient,
    //    then SELECT FOR UPDATE + credit platform wallet, then onSettled?.(tx)
    // 5. On throw: handleSettlementFailure() → RefundService.refund() (reuse as-is, D-07)
  }
}
```

**Why this shape:** It keeps `SettlementService` domain-agnostic (no knowledge of "vendor" vs "guide" vs "host" — just tagged wallet credits), which is what makes it genuinely reusable across Tour/Marketplace/Events/Studio/Stays rather than a Tour-shaped abstraction with special cases bolted on. The `onSettled` callback preserves D-02's "single `$transaction`" commitment for status flips that must be atomic with the wallet writes (Tour's step 6c already proves this need — split-bill CONFIRMED flip is deliberately OUTSIDE the txn because it depends on post-write array length, but the *simple* CONFIRMED flip for solo bookings is INSIDE).

**Ministry wallet resolution:** Every caller resolves the Ministry recipient the same way Tour resolves its ATTRACTION type today — read `PlatformConfig.tour.government_wallet_user_id`, look up `Wallet.findUnique({ where: { userId } })`, and if unresolved, pass `walletId: null` with `tag: 'MINISTRY'` so the share rolls into the platform wallet exactly like Tour's ATTRACTION fallback (D-03). This is a small helper worth extracting too (e.g. `SettlementService.resolveMinistryWallet()`) since every one of the 5 callers needs it identically.

### Pattern 2: Reference/idempotency scheme generalization

**What:** Tour's scheme is `<paystackRef>-V-<idx>` per vendor and `<paystackRef>-PLAT` for platform. Generalize to `<paystackRef>-<tag><idx>` (e.g. `-VENDOR0`, `-MINISTRY0`, `-HOST0`) for recipients and keep `-PLAT` fixed for the platform row — this preserves D-02's literal reference suffix scheme while making the tag self-describing in the audit trail (useful for SETTLE-07 statement filtering).

**Idempotency precheck:** Tour does two separate `findFirst` queries (one for `-V-` prefix, one for exact `-PLAT`). Since every settlement reference for a given `paystackReference` shares the prefix `${paystackReference}-`, this collapses to **one** query:
```typescript
const existing = await this.prisma.transaction.findFirst({
  where: { reference: { startsWith: `${input.paystackReference}-` } },
  select: { id: true },
});
if (existing) { /* replay no-op */ return; }
```
This is a safe simplification (not a locked decision — flag to planner as a minor improvement over the literal two-query pattern, functionally equivalent).

### Pattern 3: Booking.govtLevyPct snapshot-at-creation (Stays)

**What:** Add `govtLevyPct Decimal @default(0)` to `Booking`, populated at `createBooking()` time from a `PlatformConfig` key (e.g. `stays.govt_levy_pct`), NOT read live in `releaseEscrow()`. Exactly mirrors `Vendor.govtLevyPct`'s existing behavior — a per-record snapshot, not a live config read (D-11).

**Example — createBooking() addition:**
```typescript
// backend/src/modules/stays/stays.service.ts — createBooking(), before totalPrice calc
const levyCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'stays.govt_levy_pct' },
});
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 0.05; // fallback default, still DB-sourced when configured

// ...inside tx.booking.create({ data: { ..., govtLevyPct } })
```

**Example — releaseEscrow() fix (replaces lines 319-361):**
```typescript
for (const booking of dueBookings) {
  const hostUserId = booking.property.hostId;
  if (!hostUserId) continue;
  const hostWallet = await this.prisma.wallet.findUnique({ where: { userId: hostUserId } });
  if (!hostWallet) continue;

  const total = Number(booking.totalPrice);
  const govtLevyPct = Number(booking.govtLevyPct);
  const govtLevyNgn = +(total * govtLevyPct).toFixed(2);
  const hostAmountNgn = +(total - govtLevyNgn).toFixed(2); // platform absorbs drift, not host

  const govWallet = await this.resolveMinistryWallet(); // shared helper, D-03 fallback semantics

  await this.settlementService.settle({
    paystackReference: `ISY-ESC-${booking.id.slice(0, 8).toUpperCase()}`,
    amountKobo: total * 100,
    recipients: [
      { tag: 'HOST', walletId: hostWallet.id, amountNgn: hostAmountNgn, metadata: { bookingId: booking.id } },
      { tag: 'MINISTRY', walletId: govWallet?.id ?? null, amountNgn: govtLevyNgn, metadata: { bookingId: booking.id } },
    ],
    description: 'Escrow release',
    onSettled: async (tx) => {
      await tx.booking.update({ where: { id: booking.id }, data: { escrowReleasedAt: new Date() } });
    },
  });
}
```
Note the reference must change from the current `ISY-ESC-<8char>` scheme's Transaction row `reference` (which today is written raw as `reference` directly, not run through the settlement idempotency check) — `SettlementService.settle()` will generate the actual per-recipient reference suffixes from this base. Confirm the exact `ISY-ESC-*` naming convention (already used for the existing single-row escrow reference in CLAUDE.md's naming patterns) stays as the *base* reference passed to `settle()`.

### Anti-Patterns to Avoid
- **Baking domain vendor-resolution logic into `SettlementService`:** Would recreate Tour's GUIDE/HOST/ORGANISER/ATTRACTION switch inside the "generic" service, defeating the point of generalization. Resolution stays in each feature module's `@OnEvent` handler; `SettlementService` only receives pre-resolved `{ tag, walletId, amountNgn }` tuples.
- **Treating the Kafka `onModuleInit` consumers as the fix target:** They are not broken (they correctly `await this.kafka.consume(...)`) — they are simply unreachable because `KafkaService.emit()`/`consume()` are no-ops when `KAFKA_BROKER_URL` is unset (`kafka.service.ts:15,32-35,43-44`). Do not "fix" Kafka wiring; add the `@OnEvent` dual-wire per D-04 and leave Kafka as-is.
- **Reading `Booking.govtLevyPct`-equivalent config live at settlement time instead of snapshotting at creation:** Explicitly rejected by D-11 — would let a mid-cycle rate change retroactively alter already-priced bookings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row-level locking for concurrent wallet writes | Application-level mutex/queue, Redis lock, or Prisma `Serializable` isolation retries | Raw `SELECT ... FOR UPDATE` inside `$transaction`, exactly as `wallet.service.ts:274`, `refund.service.ts:89`, `tour-settlement.service.ts:258/297` already do | This is the established, tested, CLAUDE.md-mandated pattern across every wallet mutation in the repo. Introducing a second locking strategy for settlement would create two divergent concurrency-safety models in the same codebase. |
| Refund-on-failure flow | A new refund service or inline Paystack refund call | `RefundService.refund()` (`backend/src/common/services/refund.service.ts`) — already idempotent (`<ref>-RFND` keyed), already wraps `PaystackService.refundCharge()`, already writes a balance-neutral `REFUND` ledger row | D-07 explicitly says reuse as-is; it is already the exact shape `handleSettlementFailure` needs |
| Money/percentage rounding | A decimal/money library | Plain `Number` + `Math.round(x * 100) / 100`, with the platform wallet absorbing all drift (Tour's proven pattern) | Consistent with every other financial calc in the repo; the drift-absorption design is precisely what makes plain-float math safe here — introducing a decimal library would be an unrequested architecture change |
| Idempotency/replay protection | A separate idempotency-key table or Redis SETNX lock | `Transaction.reference @unique` constraint (schema.prisma:634) as the authoritative guard, with a `findFirst({ startsWith })` precheck as a fast-path optimization | The unique DB constraint already exists and is the correct authoritative mechanism; see Pitfall below for the precheck-alone race condition |

**Key insight:** Every "hand-roll risk" in this phase already has a proven, working reference implementation somewhere in the same repo (`tour-settlement.service.ts`, `wallet.service.ts`, `refund.service.ts`). The work here is extraction and generalization, not invention — deviating from these proven patterns to build something "cleaner" would be net-negative given SETTLE-08's zero-drift requirement is already solved once.

## Common Pitfalls

### Pitfall 1: Idempotency precheck race condition under concurrent duplicate webhook delivery
**What goes wrong:** `TourSettlementService`'s current precheck (`transaction.findFirst({ where: { reference: { startsWith } } })` before the `$transaction`) is a read-then-act check, not atomic. If Paystack (or a manual retry) delivers the same `charge.success` webhook twice within milliseconds, both invocations can pass the precheck before either commits. The first `$transaction` succeeds; the second hits the `Transaction.reference @unique` constraint (Postgres error `P2002`) partway through its own `$transaction`, which is caught by the existing `catch (err) { handleSettlementFailure(...); throw err; }` block — triggering an **unwarranted refund** for a payment that actually settled correctly on the first delivery.
**Why it happens:** The precheck query and the transactional write are not the same atomic operation; there's a window between them.
**How to avoid:** In the generalized `SettlementService.settle()`, catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` on `Transaction.reference` specifically, and treat it as a benign replay (log + return the existing rows) rather than routing it into `handleSettlementFailure`. This is a real latent bug in the current Tour implementation, not something CONTEXT.md flagged — worth fixing during the D-01 migration since it's a straightforward addition to the shared service's failure-path branching.
**Warning signs:** A refund fires for a `payment.*` reference where the buyer's item/booking was already correctly settled — check logs for `P2002` alongside `handleSettlementFailure`/refund log lines for the same reference.

### Pitfall 2: Ministry wallet resolution must not silently double-null when `tour.government_wallet_user_id` is later set
**What goes wrong:** Once SETTLE-02 sets `tour.government_wallet_user_id` to the real Ministry user id (D-06), every module that resolves "Ministry" the same way Tour resolves ATTRACTION will correctly start crediting it. But if any caller hardcodes or caches the wallet id at module-init time (the way `TourSettlementService.ensureSystemWallet()` caches `this.systemWalletId` once in `onModuleInit`), a later admin change to the `PlatformConfig` value would not take effect without a service restart.
**Why it happens:** `TourSettlementService` currently reads `tour.government_wallet_user_id` fresh on every `handleTourBookingPayment()` call (line 171-175) — it is NOT cached like the system wallet id. This is correct and must be preserved: the Ministry wallet lookup should always be a live per-settlement `PlatformConfig` read, never cached at bootstrap, since it's an operator-configurable value (unlike the platform's own well-known `SYSTEM_USER_ID`, which is intentionally a compile-time constant).
**How to avoid:** Keep the Ministry wallet resolution as a per-call `platformConfig.findUnique` + `wallet.findUnique`, exactly matching Tour's existing (correct) behavior. Do not "optimize" this into a cached field on `SettlementService` the way the system wallet is cached.
**Warning signs:** Ministry wallet credits stop appearing after an admin updates `tour.government_wallet_user_id` without a full backend redeploy.

### Pitfall 3: `SettlementService.settle()` transaction duration grows with recipient count — default Prisma transaction timeout
**What goes wrong:** Prisma's `$transaction` interactive-callback form has default `timeout: 5000ms` and `maxWait: 2000ms` (client-side, not overridden anywhere in this codebase `[VERIFIED: grep — no isolationLevel/timeout/maxWait config found in backend/src]`). Each recipient in the fan-out costs one round-trip `$executeRaw` (lock) + one `findUnique` + one `update` + one `create` — sequentially, not in parallel (Tour's existing `for` loop, line 256). Tour's worst case is 4 vendor types + 1 platform row = 5 sequential lock+write cycles; this has run in production-shaped tests without timeout issues, so 5-6 recipients is empirically safe, but this is a real ceiling to be aware of if any future module needs a larger N.
**Why it happens:** Interactive transactions hold a single Postgres connection for their full duration; NestJS/Prisma's default timeout exists precisely to bound worst-case lock hold time under connection-pool pressure.
**How to avoid:** For this phase's callers (Marketplace: 3, Events: 3, Studio: 2, Stays: 3, Tour: up to 5), no change needed — well within default limits. Document the ceiling in `SettlementService`'s docblock so a future caller with a genuinely large N (e.g. a marketplace order with many different vendors, which is explicitly disallowed today — `createOrder` throws `BadRequestException('All products must be from the same vendor')`) knows to either raise `timeout` explicitly or reconsider the design.
**Warning signs:** `PrismaClientKnownRequestError` with a transaction timeout message under load; correlate with recipient-count outliers in settlement payloads.

### Pitfall 4: Settlement statement query needs both `walletId` and `metadata` filtering — no GIN index exists on `Transaction.metadata`
**What goes wrong:** `Transaction` has `@@index([walletId])` (schema.prisma:645) but no index on the `metadata Json?` column. SETTLE-07's statement query needs `walletId` (fast, indexed) + date range (fast, on `createdAt` which has no explicit index either, but `walletId` narrows enough) + optional `metadata` field filters (e.g. `sourceType`, `recipientType`) for refinement. At MVP settlement volumes this is fine — Postgres will sequential-scan the small per-wallet row set after the `walletId` index narrows it. At scale (thousands of transactions per vendor wallet), unindexed JSON path filters could slow down.
**Why it happens:** No GIN index was ever added to `Transaction.metadata` because no prior feature needed to filter by it — the audit trail was write-only until now.
**How to avoid:** Not required for this phase (MVP-scale, no UI consumer yet — Phase 14 is the first real dashboard load). Note it as a follow-up: `CREATE INDEX ON transactions USING GIN (metadata)` if/when Phase 14's Ministry Dashboard queries prove slow. Do not add a premature index migration in this phase — SETTLE-07 only requires the endpoint to exist and return correct data, not to be optimized for a load pattern that doesn't exist yet.
**Warning signs:** Slow statement query response times once real transaction volume accumulates (a Phase 14 concern, not Phase 12).

## Code Examples

### Existing pattern: `SELECT FOR UPDATE` wallet lock (verified, reuse exactly)
```typescript
// Source: backend/src/modules/tour-bookings/tour-settlement.service.ts:256-270 (verified current)
for (const r of resolved.filter((x) => x.walletId)) {
  await tx.$executeRaw`SELECT id FROM wallets WHERE id = ${r.walletId} FOR UPDATE`;
  const w = await tx.wallet.findUnique({ where: { id: r.walletId! } });
  if (!w) throw new Error(`Vendor wallet vanished mid-transaction: ${r.walletId}`);
  const before = Number(w.balance);
  const after = before + r.amountNgn;
  await tx.wallet.update({ where: { id: r.walletId! }, data: { balance: after } });
  await tx.transaction.create({ data: { /* CREDIT row, see below */ } });
}
```

### Existing pattern: drift assertion (verified, reuse exactly — D-03)
```typescript
// Source: backend/src/modules/tour-bookings/tour-settlement.service.ts:236-249 (verified current)
const claimedAmountNgn = resolved.filter((r) => r.walletId).reduce((s, r) => s + r.amountNgn, 0);
const platformAmountNgn = Math.round((chargeAmountNgn - claimedAmountNgn) * 100) / 100;
const drift = chargeAmountNgn - claimedAmountNgn - platformAmountNgn;
if (Math.abs(drift) > 0.02) {
  const err = new Error(`Settlement drift exceeded ₦0.02 (drift=${drift}) — programming error`);
  await this.handleSettlementFailure(payload, booking, err);
  throw err;
}
```

### Existing pattern: SETTLE-08 test technique (verified, generalize directly)
```typescript
// Source: backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts:236-267 (verified current)
// Capture every Transaction.create() call performed inside the mocked $transaction,
// then assert the sum equals payload.amount / 100 exactly (to-the-kobo, non-round amounts).
const credits = txn.transactionCreates;
const sum = credits.reduce((s, c) => s + Number(c.amount), 0);
expect(sum).toBe(10_000); // exactly the charge in NGN, zero drift
```
This exact technique (mock `$transaction`'s callback, capture every `tx.transaction.create` call, sum `amount`, assert equality to `chargeAmountNgn`) is the template for `settlement.service.spec.ts`'s SETTLE-08 test — run it across "a wide range of non-round amounts" per the phase success criterion (e.g. parametrize over `[9999.99, 10000.01, 33333.33, 7.77, 1000000.13]`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Events (SETTLE-06/D-09) is a 3-way split — organizer + Ministry + platform — mirroring Marketplace/Stays, since `Event.organizerId` exists and organizers need to actually receive ticket revenue. CONTEXT.md's D-09 only specifies the two new `PlatformConfig` keys, not the recipient count. | Architecture Patterns, Summary | If Events is actually meant to be a 2-way split (Ministry + platform only, organizers unpaid this phase — mirroring Studio's ownerless design), the planner would build the wrong `SettlementRecipient` array shape and organizer wallets would never be credited, silently under-delivering SETTLE-06 for Events. Low likelihood (Events clearly has an organizer to pay, unlike Studio) but should be explicitly confirmed before the planner locks the Events handler's split logic. |
| A2 | `stays.govt_levy_pct` (or equivalent) is a net-new `PlatformConfig` key, snapshotted onto `Booking.govtLevyPct` at `createBooking()` time, with a sensible fallback default (e.g. 5%) if unset — CONTEXT.md's D-11 specifies the snapshot mechanism but not the exact `PlatformConfig` key name or fallback value. | Architecture Patterns (Pattern 3) | Low risk — any reasonable key name/fallback works as long as it's DB-sourced per CLAUDE.md; the planner should pick a name consistent with existing `PlatformConfig` naming conventions (`transport_platform_fee_pct`, `PLATFORM_FEE_PCT`, `tour.platform_commission_pct` — note the codebase is inconsistent between `snake_case` and `dot.case` naming already, so either convention is defensible). |
| A3 | The reference-suffix scheme generalizes to `<paystackRef>-<TAG><idx>` (e.g. `-VENDOR0`, `-MINISTRY0`) rather than literally reusing Tour's `-V-<idx>` for every module. CONTEXT.md D-02 says "idempotency via `<paystackRef>-<recipientTag>` reference suffixes" which supports this reading but doesn't give the exact string format. | Architecture Patterns (Pattern 2) | Cosmetic only — any consistent, collision-free suffix scheme satisfies D-02's intent (idempotency + audit clarity). Does not affect correctness of SETTLE-08's drift-sum invariant. |

**If this table is empty:** N/A — see above.

## Open Questions (RESOLVED)

1. **RESOLVED — Does Events settlement pay the organizer, or is it Ministry+platform only like Studio?**
   - What we know: `Event.organizerId` exists (an organizer to pay); Studio's 2-way design is explicitly justified by `StudioSlot` having no owner field, which does not apply to Events.
   - Resolution: Confirmed 3-way (organizer + Ministry + platform) via user clarification during `/gsd-plan-phase 12`. Recorded as a CONTEXT.md D-09 amendment and implemented in Plan 12-05.

2. **RESOLVED — Exact `PlatformConfig` key names for the four net-new fee/levy pairs (Events x2, Studio x2) and Stays' `govtLevyPct` snapshot source key.**
   - What we know: The KV pattern is well-established (`transport_platform_fee_pct`, `PLATFORM_FEE_PCT`, `tour.platform_commission_pct`) but the codebase mixes `snake_case` and `dot.case` naming conventions inconsistently across modules — there is no single canonical style to match.
   - Resolution: Followed the CONTEXT.md-suggested names literally (`events.platform_fee_pct`, `events.govt_levy_pct`, `studio.platform_fee_pct`, `studio.govt_levy_pct` — dot.case, module-prefixed), consistent with the `tour.*` keys they sit alongside conceptually. Implemented in Plans 12-02, 12-05, 12-06, 12-07.

## Environment Availability

Skipped — this phase has no new external dependencies. All required infrastructure (PostgreSQL via `DATABASE_URL`, existing Paystack webhook flow, existing `RefundService`) is already live and exercised by `TourSettlementService` in production-shaped tests today.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x `[VERIFIED: backend/jest.config.js]` |
| Config file | `backend/jest.config.js` (rootDir: `src`, testRegex: `.*\.spec\.ts$`) |
| Quick run command | `cd backend && npx jest src/common/services/__tests__/settlement.service.spec.ts` |
| Full suite command | `cd backend && npm test` (runs `jest` across all `*.spec.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SETTLE-01 | `SettlementService.settle()` performs atomic N-way fan-out with locking, idempotency, drift assertion | unit | `npx jest settlement.service.spec.ts -t "wallet invariant"` | ❌ Wave 0 — new file, mirror `tour-settlement.service.spec.ts`'s 12-scenario structure |
| SETTLE-01 | `TourSettlementService` still passes all 12 existing scenarios after migrating onto `SettlementService` | unit (regression) | `npx jest tour-settlement.service.spec.ts` | ✅ `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` — must stay green through the D-01 refactor |
| SETTLE-02 | Ministry wallet resolves via `tour.government_wallet_user_id` once seeded | unit | `npx jest settlement.service.spec.ts -t "ministry wallet"` | ❌ Wave 0 |
| SETTLE-05 | `releaseEscrow()` applies `Booking.govtLevyPct`, host no longer gets 100% | unit | `npx jest stays.service.spec.ts -t "escrow"` | ✅ file exists (`stays.service.spec.ts`) — needs new test case added, not a new file |
| SETTLE-06 | Marketplace/Events/Studio/Stays `@OnEvent` handlers fire and credit wallets | unit | `npx jest marketplace.service.spec.ts events.service.spec.ts studio.service.spec.ts stays.service.spec.ts -t "settlement"` | ✅ all 4 files exist — need new test cases added |
| SETTLE-07 | Recipient can retrieve own itemized statement; other recipients/roles blocked (403) | unit + integration | `npx jest settlement.controller.spec.ts` (or wherever the new endpoint lands) | ❌ Wave 0 — new controller + spec |
| SETTLE-08 | N-way splits sum exactly to buyer-paid amount across non-round amounts, zero drift | unit (parametrized) | `npx jest settlement.service.spec.ts -t "drift"` | ❌ Wave 0 — same file as SETTLE-01's core test |

### Sampling Rate
- **Per task commit:** `npx jest <changed-spec-file>.spec.ts`
- **Per wave merge:** `cd backend && npm test` (full suite — critical here since D-01 refactors `TourSettlementService`, a component with existing passing tests that must not regress)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/common/services/__tests__/settlement.service.spec.ts` — covers SETTLE-01, SETTLE-02, SETTLE-08 (new `SettlementService` unit tests, mirror `tour-settlement.service.spec.ts`'s mock-`$transaction`-capture technique)
- [ ] New settlement statement controller + `.spec.ts` — covers SETTLE-07 (exact file location is a planner decision — natural candidates: a new `SettlementController` in `CommonModule`, or an addition to `WalletController`)
- [ ] Prisma migration file for `Booking.govtLevyPct` + the Ministry `User`/`Wallet` seed rows + new `PlatformConfig` keys — not a test gap per se, but a Wave 0 prerequisite every downstream test depends on (tests will need fixture data reflecting the new schema/seed shape)

*(No framework install needed — Jest/ts-jest already fully configured and exercised by 25 existing `.spec.ts` files across the backend.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — webhook auth is HMAC-SHA512 signature verification (`webhooks.service.ts:26-31`), already implemented and out of this phase's scope |
| V3 Session Management | no | Settlement statement endpoint reuses existing JWT session/guard infrastructure — no new session handling |
| V4 Access Control | yes | `@Roles()` + `@CurrentUser()` pattern (`roles.guard.ts`) — a recipient can only fetch their own statement; `SUPER_ADMIN`/`LGA_ADMIN` can fetch any. Must verify `walletId` ownership server-side, not trust a client-supplied `walletId`/`userId` param blindly (IDOR risk — see below) |
| V5 Input Validation | yes | `class-validator` DTOs for any new statement-query endpoint (date-range params, pagination) — follow existing DTO conventions |
| V6 Cryptography | no | No new cryptographic material — existing AES-256-GCM PII encryption and Paystack HMAC verification are untouched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on settlement statement endpoint — a vendor requesting another vendor's `walletId`/statement by guessing/enumerating IDs | Elevation of Privilege | Resolve the requesting user's own `walletId` server-side from `@CurrentUser()` (e.g. via their `Vendor`/`Property`/`Event` ownership record), never accept a raw `walletId` param from non-admin roles. Admin roles (`SUPER_ADMIN`, `LGA_ADMIN`) may pass an explicit `walletId`/`userId` param since `@Roles()` already gates them. |
| Idempotency-bypass double-settlement via race-condition webhook replay | Repudiation / Tampering | Pitfall 1 above — rely on `Transaction.reference @unique` as the authoritative guard, not solely the precheck query; catch `P2002` as benign replay |
| Webhook payload tampering to inject an attacker-controlled `walletId`/recipient into the settlement fan-out | Tampering | Not a new risk surface — `SettlementService.settle()` never accepts a `walletId` directly from webhook payload data; every recipient wallet is resolved server-side from the domain model (`Vendor.userId`, `Property.hostId`, `PlatformConfig.tour.government_wallet_user_id`), exactly as Tour already does. Preserve this invariant in every new caller — do not add a code path that trusts `metadata.walletId` from the Paystack payload for settlement recipients (the existing `wallet_topup` case in `webhooks.service.ts:75-87` DOES trust `metadata.walletId`, but that is a fundamentally different, pre-existing, out-of-scope flow — do not copy that pattern into settlement). |
| Floating-point rounding manipulation to skim fractions of a kobo across many transactions | Tampering | Drift-tolerance assertion (≤₦0.02, throws on programming error) + platform-wallet-absorbs-remainder design already closes this; SETTLE-08's test explicitly verifies zero drift across non-round amounts |

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/tour-bookings/tour-settlement.service.ts` — read in full (494 lines), every CONTEXT.md line-number claim verified exactly
- `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` — read in full (623 lines), used as the SETTLE-08 test template
- `backend/src/modules/webhooks/webhooks.service.ts` — read in full, confirmed all 4 relevant `payment.*` emit paths + dead-lettered `default` case behavior
- `backend/src/modules/marketplace/marketplace.service.ts`, `events/events.service.ts`, `studio/studio.service.ts`, `stays/stays.service.ts` — read in full, confirmed Kafka-only wiring and existing computed-fields state (Marketplace) vs. greenfield state (Events/Studio) vs. buggy-100%-credit state (Stays)
- `backend/prisma/schema.prisma` (User, Event, TicketType, Property, Booking, Vendor, Order, StudioSlot, StudioBooking, Wallet, Transaction, PlatformConfig models) — read directly, all CONTEXT.md line ranges confirmed
- `backend/prisma/seed.ts:1360-1406` — read directly, confirmed `tour.government_wallet_user_id` seeded as `Prisma.JsonNull`
- `backend/src/common/services/refund.service.ts` — read in full, confirmed reusable-as-is shape
- `backend/src/common/common.module.ts`, `backend/src/prisma/prisma.module.ts`, `backend/src/kafka/kafka.module.ts` — confirmed all three are `@Global()`, so `SettlementService` in `CommonModule` needs no extra imports in any feature module
- `backend/src/common/enums/user-role.enum.ts`, `backend/src/common/guards/roles.guard.ts`, `backend/src/modules/wallet/wallet.controller.ts` — confirmed existing `@Roles()`/`@CurrentUser()` access-control pattern for the SETTLE-07 statement endpoint
- `backend/jest.config.js` and existing `.spec.ts` file inventory (25 files) — confirmed test framework/location conventions

### Secondary (MEDIUM confidence)
- Prisma `$transaction` default `timeout`/`maxWait` values (5000ms/2000ms) — from training knowledge of Prisma 5.x defaults, not re-verified against the installed `@prisma/client` version's docs in this session; codebase itself confirms no override exists (`grep` returned no matches for `isolationLevel|timeout|maxWait`)

### Tertiary (LOW confidence)
- None — every substantive architectural claim in this document was verified directly against the current repository state.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every pattern verified against existing, tested, production-shaped code in this repo
- Architecture: HIGH — the generalized `SettlementService.settle()` API design is synthesized (not found verbatim) but is a direct, narrow extraction of Tour's already-proven, already-tested transactional core; every primitive it depends on (locking, drift math, idempotency, refund) is a verified quote from working code
- Pitfalls: HIGH for Pitfalls 1-2 (found by direct code reading, not speculation) and 3-4 (grounded in verified schema/config absence); MEDIUM for the exact Prisma timeout default numbers (training-knowledge, not re-verified against installed package docs this session)

**Research date:** 2026-07-17
**Valid until:** Stable for the duration of this milestone (v2.0) — re-verify only if `@prisma/client` is upgraded past 5.11.x or if Phase 13's Transport/Delivery cutover reveals a recipient-count ceiling issue (Pitfall 3) that requires revisiting the transaction-timeout assumption.
