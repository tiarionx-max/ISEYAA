# Phase 18: Settlement Split Centralization - Research

**Researched:** 2026-07-19
**Domain:** Prisma/NestJS settlement-config centralization on an existing atomic N-way wallet fan-out engine (`SettlementService`)
**Confidence:** HIGH — every claim below is either copied from already-completed milestone research (`ARCHITECTURE.md` §Q5, `PITFALLS.md` Pitfall 10) or independently re-verified against live source in this session (`schema.prisma`, `settlement.service.ts`, `admin.controller.ts`/`admin.service.ts`, and 6/6 call sites). Drift found during re-verification is called out explicitly below.

## Summary

Phase 18 replaces 6 duplicated `PlatformConfig.findUnique()` pairs (Transport, Delivery, Marketplace, Events, Stays, Studio) with one new `SettlementSplitTier` Prisma model and a single `SettlementService.resolveSplit(module, amountNgn)` resolver. This is a pure refactor of *where the split percentage comes from* — no module's computed split changes on day one (D-03's unit-conversion note for Transport/Delivery is the only numeric transformation, and it's a format change, not a value change). The existing `settle()` engine, its idempotency/drift/lock-order guarantees, and every call site's `settle()` invocation itself are untouched.

Live-code re-verification this session confirms CONTEXT.md's and ARCHITECTURE.md's file/line references are accurate as of 2026-07-19 (see `## Drift Check` below) with one important nuance not previously called out: **Stays resolves and *stores* its split percentage at booking-creation time** (`Booking.govtLevyPct`, `stays.service.ts:192-225`), not at settlement (escrow-release) time (`stays.service.ts:325-381`). This is a pre-existing snapshot pattern, not something Phase 18 introduces — but it means the migration must call `resolveSplit()` at booking creation for Stays, continuing to persist the result on the `Booking` row, and must NOT move the resolution point to escrow-release time, or split-percentage changes made during an active escrow hold (up to 24h+ post-checkout, effectively longer since bookings can sit for weeks before checkout) would retroactively apply to bookings already priced — a real money-flow change CONTEXT.md's "preserve current behavior" instruction (D-01/D-02 framing) implicitly rules out but doesn't explicitly name for Stays.

**Primary recommendation:** Add `SettlementSplitTier` to `schema.prisma` (schema from `ARCHITECTURE.md` §Q5, confirmed still correct), add `SettlementService.resolveSplit()` mirroring `resolveMinistryWallet()`'s always-fresh read style, migrate the 6 call sites mechanically (swap 2 `findUnique` calls for 1 `resolveSplit()` call, keep `settle()` calls unchanged), add a dedicated one-off migration script (not a `seed.ts` edit) to backfill `'default'` tier rows from each module's live `PlatformConfig` values, add `Number.isFinite()` guards to `SettlementService.settle()`, and add CRUD endpoints to the existing `AdminController`/`AdminService`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Split percentage storage (`SettlementSplitTier` model) | Database / Storage | — | New Prisma model, colocated with `PlatformConfig` in `schema.prisma` |
| Split resolution (`resolveSplit()`) | API / Backend | Database / Storage | Lives on `SettlementService` (backend business logic), reads DB fresh every call — same tier as `resolveMinistryWallet()` |
| Call-site migration (6 modules) | API / Backend | — | Each module's `*.service.ts` replaces inline config reads with one resolver call; no client-facing change |
| Admin CRUD endpoints | API / Backend | — | New `GET`/`PATCH` routes on existing `AdminController`, role-gated; no new web UI this phase (D-04) |
| Shadow-verification (optional, Claude's discretion) | API / Backend | Database / Storage | Reuses `ShadowSettlementComparison` model (already exists, untyped `module: String`, no schema change needed to reuse for non-transport/delivery modules) |
| Runtime NaN/shape guard (SETTLE-11d) | API / Backend | — | Sits inside `SettlementService.settle()` itself (defense-in-depth), independent of which upstream code produced a bad value |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETTLE-11a | Per-module settlement split percentages stored as structured, validated, effective-dated config via new `SettlementSplitTier` model, replacing 6 duplicated inline `PlatformConfig` reads | `## Standard Stack`, `## Code Examples` — schema + migration script shape |
| SETTLE-11b | `SettlementService.resolveSplit()` is the single resolver used by every settlement call site — no module computes its split inline | `## Architecture Patterns` Pattern 1, `## Code Examples`, `## Drift Check` (6 call sites confirmed) |
| SETTLE-11c | Split percentage changes are effective-dated; already-settled transactions retain the percentage in effect at settlement time | `## Common Pitfalls` Pitfall "Stays' Snapshot-at-Booking-Time Pattern", `## Drift Check` |
| SETTLE-11d | Runtime shape validation + `Number.isFinite()` guard added to `SettlementService.settle()` to reject NaN-corrupted config before a wallet mutation | `## Code Examples` (guard placement), `## Validation Architecture` |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Studio currently fetches `platformFeePct` from `PlatformConfig` but never applies it to the split — the platform silently absorbs 100% of the remainder after the govt levy (`studio.service.ts`). When centralizing: Studio's `SettlementSplitTier` row gets `platformPct = null` (remainder absorbed by platform), preserving exact current behavior. Fixing this apparent bug is explicitly OUT of scope for this phase.
- **D-02:** Marketplace has a per-vendor `Vendor.govtLevyPct` DB column that overrides the module-level government levy for that vendor. The centralized resolver does NOT absorb this. `resolveSplit('marketplace', amount)` returns only the module-level default (the platform-fee piece); `marketplace.service.ts` continues reading `Vendor.govtLevyPct` directly for the per-vendor levy override, exactly as it does today. No vendor-scoped tier rows this phase.
- **D-03:** `SettlementSplitTier`'s `earnerPct`/`ministryPct`/`platformPct` columns store **decimal fractions in the 0–1 range** (e.g., `0.10`, not `10`). This matches 4 of the 6 modules (Marketplace, Events, Stays, Studio) as-is. Transport's and Delivery's current whole-number-percent `PlatformConfig` values (5, 10, 15) must be divided by 100 exactly once during the one-time data migration script that seeds the `'default'` tier rows from existing config.
- **D-04:** Phase 18 builds **backend CRUD endpoints only** for `SettlementSplitTier` — new role-gated `GET`/`PATCH` endpoints on the existing `AdminController` (list by module, update one row). No new web admin UI page this phase.
- **D-05:** "Effective-dated" means **immediate-effect only**, not future-scheduled. A `SettlementSplitTier` update takes effect for every settlement from the moment it's saved onward. Old tier rows are never deleted or overwritten (kept for audit/history), but `resolveSplit()` always resolves "the currently active row as of now." Already-settled transactions naturally retain their historical percentage (SETTLE-11c) because `settle()` computes and stores amounts once, at settlement time — it never re-reads config for a past transaction.

### Claude's Discretion

- Exact shape of the `SettlementSplitTier` migration script (Prisma migration + one-off data-backfill script vs. seed.ts edit) — research recommends a dedicated migration script since production `PlatformConfig` rows may hold stakeholder-tuned values that must carry over, not reset to seed defaults. Planner should follow this recommendation. **This research provides a concrete script shape below — see `## Code Examples`.**
- Whether to keep the unused `minAmountNgn`/`maxAmountNgn` columns on the schema (nullable, unused this phase) for future tiering — low-cost to include now, avoids a future migration if SETTLE-11e is ever picked up.
- Whether shadow-verification (compute old flat-key result + new resolver result, compare, log discrepancy) is used per call site before cutover — recommended by research, mirrors the proven SETTLE-09 pattern already used for Transport/Delivery.

### Deferred Ideas (OUT OF SCOPE)

- **Amount-based or vendor-category tiering (SETTLE-11e)** — schema may include unused `minAmountNgn`/`maxAmountNgn` columns, but no branching logic on them ships this phase.
- **Fixing Studio's unapplied platform fee (D-01)** — noted as a real inconsistency, deliberately deferred.
- **Web admin UI page for split editing (D-04)** — backend-only this phase.
- **Future-dated split scheduling (D-05)** — immediate-effect only this phase.
</user_constraints>

## Drift Check (live code vs. CONTEXT.md / ARCHITECTURE.md claims, re-verified 2026-07-19)

All claims below were independently re-read from source this session. **No material drift found** in the 6 call-site line ranges or the core schema/service claims — CONTEXT.md and ARCHITECTURE.md are accurate. One nuance not previously surfaced (Stays' snapshot timing) is flagged.

| Claim | CONTEXT.md/ARCHITECTURE.md said | Verified in this session | Status |
|-------|----------------------------------|---------------------------|--------|
| `PlatformConfig` model location | `schema.prisma` line ~682, untyped `Json` value column | Confirmed: line 682, `value Json`, no runtime type enforcement | MATCH |
| `SettlementService.settle()` negative-amount guard | lines 108-116 | Confirmed: lines 108-116 exactly | MATCH |
| `SettlementService.settle()` drift-tolerance assertion | lines 124-131 | Confirmed: lines 124-131 (`Math.abs(drift) > 0.02` check) | MATCH |
| `resolveMinistryWallet()` "always fresh" pattern | line 321 | Confirmed: `async resolveMinistryWallet()` at line 321, reads `platformConfig.findUnique` fresh every call, no caching | MATCH |
| Transport read + settle call | ~554-568 read, ~593-640 settle | Read is 556-568 (govt levy + platform fee `findUnique` pair), settle call is 593-640 exactly | MATCH (read slightly narrower, same block) |
| Delivery read + settle call | ~585-602 read, ~623-678 settle | Read is 590-597, settle call is 623-678 exactly | MATCH |
| Marketplace read + settle call | ~189-211 read, ~285-308 settle | Read is 192-196 (fee + vendor levy), settle call is 285-308 exactly | MATCH |
| Events read + settle call | ~244-253 read, ~263-286 settle | Read is 246-249, settle call is 263-286+ | MATCH |
| Stays read + settle call | ~192-193, ~349-374 | Read is 192-193 (booking creation), settle call is 361-374 inside `releaseEscrow()` (325-381) | MATCH, **but see nuance below** |
| Studio read + settle call | ~170-175 read, ~182-198 settle | Read is 172-175, settle call is 182-198 exactly, `platformFeePct` confirmed read but only used in `platformMetadata.configuredPlatformFeePct` (line 198), never in the actual split math — D-01 confirmed live | MATCH |
| `PlatformConfig.value` untyped Json footgun (WR-01) | Referenced as prior near-miss | Confirmed: `delivery.service.ts:581-583` has the exact `cutoverCfg?.value === true` strict-equality comment | MATCH |
| Seed data key names/values | `seed.ts` ~1265-1583 | Confirmed exact keys/values: `transport.govt_levy_pct=5`, `transport.platform_fee_pct=10`, `delivery.govt_levy_pct=5`, `delivery.platform_fee_pct=15`, `marketplace.platform_fee_pct=0.10`, `events.platform_fee_pct=0.10`, `events.govt_levy_pct=0.05`, `studio.platform_fee_pct=0.10`, `studio.govt_levy_pct=0.05`, `stays.govt_levy_pct=0.05` (lines 1269-1567) | MATCH |
| `Vendor.govtLevyPct` column | Per-vendor override, D-02 | Confirmed: `schema.prisma:500`, `Decimal @default(0)` | MATCH |
| `Booking.govtLevyPct` column | Not explicitly discussed in CONTEXT.md | Confirmed: `schema.prisma:472`, `Decimal @default(0.05)` — **this is the snapshot column Stays already uses to lock in the percentage at booking time** | **NEW FINDING — see below** |
| Admin role-gating for new endpoints | CONTEXT.md D-04 says "reuses existing role-gating pattern (STATE_ADMIN/SUPER_ADMIN)" | `AdminController`'s class-level `@Roles()` is actually `SUPER_ADMIN, LGA_ADMIN` (not `STATE_ADMIN`); the more sensitive `getRevenue()` route overrides to `@Roles(SUPER_ADMIN)` only | **MINOR DRIFT — see below, planner must pick explicitly** |
| `ShadowSettlementComparison` model | Referenced as reusable, comment says `module: 'transport' \| 'delivery'` | Confirmed: `schema.prisma:695-707`, `module` field is an untyped `String` (comment is stale/aspirational, not an enum) — reusable for any module string with zero schema change | MATCH (comment is misleading but field is generic) |
| `AdminController`'s existing `PATCH /admin/config/:key` | Untyped generic config editor, D-04 precedent | Confirmed: `admin.controller.ts:95-99` → `admin.service.ts:165-171`, `prisma.platformConfig.upsert()` | MATCH |
| backend has `zod` as a dependency | PITFALLS.md Pitfall 10 says "consider adding to backend" | Confirmed: `backend/package.json` has **no** `zod` dependency today | MATCH (confirms the gap, not a claim to verify against) |

### New finding: Stays' snapshot-at-booking-time pattern

Stays is architecturally different from the other 5 modules. `Booking.govtLevyPct` (`schema.prisma:472`) already stores the resolved percentage **at booking-creation time** (`stays.service.ts:192-225`, written into the `booking.create()` call). The `@Cron`-driven `releaseEscrow()` job (`stays.service.ts:325-381`, runs hourly, releases escrow 24h after checkout — which can itself be days/weeks after the booking was created) reads `booking.govtLevyPct` **from the stored row**, never re-queries `PlatformConfig`.

This means Stays already has its own "effective-dated, locked at settlement time" semantics baked in — except "settlement time" for Stays, as currently coded, is booking-creation time, not escrow-release time. `resolveSplit()` must be called at booking creation (replacing the `stays.service.ts:192` read) and its result stored on `Booking.govtLevyPct`, exactly as today. **Do not** move the `resolveSplit()` call to inside `releaseEscrow()` — doing so would let an admin's split-percentage change retroactively apply to bookings made before the change, during their (potentially multi-week) escrow hold, which is a real money-flow behavior change the phase's "preserve current behavior" framing (D-01/D-02) is designed to prevent, even though CONTEXT.md doesn't name this specific case.

### Minor drift: Admin role-gating

CONTEXT.md's D-04 says the new endpoints reuse "the existing role-gating pattern (STATE_ADMIN/SUPER_ADMIN)." Live code shows `AdminController`'s class-level default is `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)` — `STATE_ADMIN` is not currently used anywhere in this controller, though it exists in the `UserRole` enum (`user-role.enum.ts:11`). The one existing money-adjacent route (`GET /admin/revenue`) overrides to `@Roles(UserRole.SUPER_ADMIN)` only (excludes `LGA_ADMIN`).

**Recommendation:** New `SettlementSplitTier` endpoints control money-flow config directly (more sensitive than the read-only revenue report) — follow the `getRevenue()` precedent and gate them `@Roles(UserRole.SUPER_ADMIN)` only, explicitly excluding both `LGA_ADMIN` (too broad — LGA-scoped admins shouldn't set platform-wide splits) and not introducing `STATE_ADMIN` unless the planner has an explicit reason to widen access beyond the existing money-config precedent. This is a Claude's-Discretion-adjacent call the planner should make explicitly, not silently inherit the controller's default `LGA_ADMIN` inclusion.

## Standard Stack

### Core

| Component | Version/Location | Purpose | Why Standard |
|-----------|------|---------|--------------|
| Prisma ORM | 5.11.x (already in use) | New `SettlementSplitTier` model + migration | Matches every other new model this project has added (`ShadowSettlementComparison`, `AdminReviewFlag`) |
| `SettlementService` | `backend/src/common/services/settlement.service.ts` (existing, `@Global()` via `CommonModule`) | Hosts new `resolveSplit()` method | Already the single source of truth for settlement math; `resolveMinistryWallet()` is the exact precedent to mirror |
| `AdminController`/`AdminService` | `backend/src/modules/admin/` (existing) | New CRUD endpoints for tier rows | D-04 — reuses existing role-gating and untyped-config-editor precedent, no new module needed |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| One-off Node/ts-node migration script (not `seed.ts`) | Backfill `SettlementSplitTier.'default'` rows from live `PlatformConfig` values | Run once, post-`prisma migrate deploy`, before the 6 call sites are cut over to `resolveSplit()` |
| `Number.isFinite()` guard (native JS, no new dependency) | SETTLE-11d — reject NaN before wallet mutation | Inside `SettlementService.settle()`, alongside the existing negative-amount check |
| Hand-written type guard (no `zod` addition recommended) | Validate `SettlementSplitTier` row shape at `resolveSplit()` read time | Given the new model uses **typed Prisma `Decimal` columns** (not untyped `Json`), the NaN-shape risk Pitfall 10 describes for `PlatformConfig` is structurally smaller here — a hand-rolled `Number.isFinite(Number(tier.earnerPct))` check per field is sufficient and avoids adding `zod` to backend for one call site; do not add `zod` to backend for this phase alone unless the planner independently decides backend-wide runtime validation is worth introducing now |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `SettlementSplitTier` table | JSON sub-schema inside `PlatformConfig.value` | Rejected in ARCHITECTURE.md §Q5 — can't cleanly express multiple named percentages/tiers without inventing a schema-within-a-schema; contradicts the project's own precedent of using dedicated tables (`ShadowSettlementComparison`, `AdminReviewFlag`) for structured data |
| One-off migration script | `seed.ts` edit | Rejected — `seed.ts` resets to hardcoded defaults; production `PlatformConfig` rows may hold stakeholder-tuned values that must carry over unchanged |
| Hand-written `Number.isFinite()` guard | `zod` schema validation | `zod` is heavier than needed for typed `Decimal` columns; reserve for if/when backend-wide runtime validation is adopted as a separate initiative |

**Installation:** No new packages required — `Prisma`, `@nestjs/*`, and the existing `SettlementService`/`AdminController` infrastructure cover this phase entirely.

**Version verification:** Not applicable — no new external dependency introduced this phase. `@prisma/client`/`prisma` stay at the project's existing pinned `5.11.x`.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │  6 Feature Services (Transport/Delivery/         │
                    │  Marketplace/Events/Stays/Studio)                │
                    │                                                   │
                    │  BEFORE: 2× platformConfig.findUnique() inline   │
                    │  AFTER:  1× settlementService.resolveSplit(      │
                    │            module, amountNgn)                    │
                    └───────────────────┬───────────────────────────────┘
                                        │ resolveSplit(module, amountNgn)
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │  SettlementService.resolveSplit()                │
                    │  - queries SettlementSplitTier WHERE module=X    │
                    │    AND isActive=true (tierName='default' only    │
                    │    this phase — no amount-range branching)       │
                    │  - Number.isFinite() guard on every % field      │
                    │  - throws loudly on missing/malformed row        │
                    │  - always fresh read, never cached               │
                    │    (mirrors resolveMinistryWallet())             │
                    └───────────────────┬───────────────────────────────┘
                                        │ { earnerPct, ministryPct, platformPct }
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │  Feature service computes SettlementRecipient[]  │
                    │  from resolved percentages (unchanged math per   │
                    │  module — Transport keeps subtract-first,        │
                    │  Delivery keeps multiply-first, per Pitfall 1)   │
                    └───────────────────┬───────────────────────────────┘
                                        │ settle({ module, reference, recipients, ... })
                                        ▼
                    ┌─────────────────────────────────────────────────┐
                    │  SettlementService.settle() — UNCHANGED          │
                    │  (idempotency precheck, negative-amount guard    │
                    │  + NEW Number.isFinite() guard, atomic           │
                    │  $transaction, SELECT FOR UPDATE lock order,     │
                    │  drift-tolerance assertion)                      │
                    └───────────────────┬───────────────────────────────┘
                                        │
                                        ▼
                              Wallet balance writes +
                              Transaction ledger rows

  Admin path (separate, read/write config):
  AdminController (GET/PATCH, SUPER_ADMIN-gated)
       │
       ▼
  AdminService → prisma.settlementSplitTier.findMany()/update()
       (direct Prisma access, no SettlementService round-trip needed
        for CRUD — same pattern as existing getConfig()/setConfig())
```

### Recommended Project Structure

No new module/folder — this phase extends existing files:

```
backend/prisma/schema.prisma          # + SettlementSplitTier model
backend/prisma/migrations/            # + new migration (schema change)
backend/scripts/                      # + one-off backfill script (new file, e.g. migrate-settlement-split-tiers.ts)
backend/src/common/services/
  └── settlement.service.ts           # + resolveSplit(), + Number.isFinite() guard in settle()
backend/src/modules/{transport,delivery,marketplace,events,stays,studio}/
  └── *.service.ts                    # each: replace 2 findUnique() calls with 1 resolveSplit() call
backend/src/modules/admin/
  ├── admin.controller.ts             # + GET/PATCH split-tier routes
  └── admin.service.ts                # + listSplitTiers()/updateSplitTier()
```

### Pattern 1: Centralized "always fresh" resolver (mirrors existing `resolveMinistryWallet()`)

**What:** A single method on `SettlementService` that queries the DB fresh on every call — no in-memory caching, no TTL — exactly matching the codebase's existing precedent for money-adjacent config lookups.

**When to use:** Any settlement call site currently doing `prisma.platformConfig.findUnique()` inline.

**Example:**
```typescript
// Source: backend/src/common/services/settlement.service.ts:321-328 (existing precedent, resolveMinistryWallet)
async resolveMinistryWallet(): Promise<{ id: string } | null> {
  const cfg = await this.prisma.platformConfig.findUnique({
    where: { key: 'tour.government_wallet_user_id' },
  });
  const userId = (cfg?.value as string | null | undefined) ?? null;
  if (!userId) return null;
  return this.prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
}

// NEW — resolveSplit() follows the identical "no cache, throw loud on bad shape" style:
async resolveSplit(module: string, amountNgn: number): Promise<{
  earnerPct: number;
  ministryPct: number;
  platformPct: number | null;
}> {
  const tier = await this.prisma.settlementSplitTier.findFirst({
    where: { module, isActive: true, tierName: 'default' },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!tier) {
    throw new Error(`No active SettlementSplitTier found for module="${module}" — refusing to settle with an undefined split`);
  }
  const earnerPct = Number(tier.earnerPct);
  const ministryPct = Number(tier.ministryPct);
  const platformPct = tier.platformPct != null ? Number(tier.platformPct) : null;
  if (!Number.isFinite(earnerPct) || !Number.isFinite(ministryPct) || (platformPct !== null && !Number.isFinite(platformPct))) {
    throw new Error(`Malformed SettlementSplitTier for module="${module}" (id=${tier.id}) — non-finite percentage value, refusing to settle`);
  }
  return { earnerPct, ministryPct, platformPct };
}
```

### Pattern 2: Mechanical per-call-site migration (preserve exact rounding order)

**What:** Each of the 6 call sites has its own rounding order (Transport: subtract-first; Delivery: multiply-first — see Pitfall 1 in prior research). `resolveSplit()` only replaces the *config lookup*, never the arithmetic that follows it.

**When to use:** Every one of the 6 call sites.

**Example (Transport, before/after):**
```typescript
// BEFORE (transport.service.ts:556-563)
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'transport.govt_levy_pct' } });
const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;
const platformFeeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'transport.platform_fee_pct' } });
const platformFeePct = platformFeeCfg ? Number(platformFeeCfg.value) : 10;

// AFTER — single resolver call; NOTE the returned pct is now a 0-1 fraction (D-03),
// so downstream math that assumed whole-number percent (/100) must convert once.
const { earnerPct, ministryPct } = await this.settlementService.resolveSplit('transport', fare);
const govtLevyPct = ministryPct * 100;      // convert back to whole-number-pct shape
const platformFeePct = (1 - earnerPct - ministryPct) * 100; // or however platformPct is modeled
// ...rest of subtract-first math is UNCHANGED
```

### Anti-Patterns to Avoid

- **Re-querying config inside `releaseEscrow()` for Stays:** Would change money-flow behavior for bookings already made before a split change — see `## Drift Check` new finding above. Keep `resolveSplit()` at booking-creation time for Stays.
- **Overloading `PlatformConfig.value`'s Json shape:** Pitfall 10 (prior research) explicitly warns against this. `SettlementSplitTier` sidesteps it entirely by using typed `Decimal` columns from day one — do not fall back to a Json-shaped tier config.
- **Reusing `settle()`'s existing negative-amount check as the SETTLE-11d guard:** That check catches `amountNgn < 0`, not `NaN` (JS: `NaN < 0` is `false`). SETTLE-11d needs an explicit, separate `Number.isFinite()` check.
- **Migrating Transport/Delivery's *live, cutover-flagged* config keys into the tiered shape in the same pass as new/all modules, without also updating their `resolveSplit()` migration:** Not a risk here since all 6 modules migrate together this phase (unlike Pitfall 10's original warning about a *partial* migration) — but the backfill script must still handle Transport/Delivery's whole-number-to-fraction conversion (D-03) correctly, or their live settlement math silently breaks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Effective-dating / audit history of config changes | A custom `effectiveFrom`/versioning query engine | `SettlementSplitTier` rows kept forever (never deleted), `resolveSplit()` just picks the currently-active row — D-05's explicit simplification | The phase explicitly scopes out future-dated scheduling; a full temporal-versioning system is over-engineering for "immediate effect only" |
| Config-value shape validation | A generic runtime schema library (`zod`, `joi`) added just for this | Hand-written `Number.isFinite()` checks against typed `Decimal` columns | Typed columns already eliminate most of the shape-ambiguity risk `PlatformConfig.value: Json` had; a full schema-validation library is disproportionate for 3 numeric fields |
| Shadow-verification comparison logging | A new comparison table/model | Existing `ShadowSettlementComparison` model (`schema.prisma:695-707`) — untyped `module: String` field already accepts any module name, zero schema change needed | Already built and proven for SETTLE-09's Transport/Delivery cutover; reuse directly if shadow-verification is used (Claude's Discretion) |

**Key insight:** Every piece of infrastructure this phase needs (fresh-read resolver pattern, admin config-editor pattern, shadow-comparison logging, audit-via-never-delete) already exists in this codebase in a proven, working form. The work is entirely mechanical application of existing patterns to a new table, not new architecture.

## Common Pitfalls

### Pitfall: Stays' Snapshot-at-Booking-Time Pattern Gets Silently "Fixed" Into a Live-Reread Bug

**What goes wrong:** A developer migrating Stays sees `releaseEscrow()` (the method that actually calls `settle()`) and reasonably assumes that's where `resolveSplit()` belongs — moving the split resolution from booking-creation time to escrow-release time.

**Why it happens:** `resolveSplit()`'s natural call-site instinct is "right before `settle()`," which is true for the other 5 modules but not Stays, where the existing code deliberately snapshots the percentage at booking creation into `Booking.govtLevyPct` and reads that stored value at settlement time instead of re-querying config.

**How to avoid:** Call `resolveSplit('stays', totalPrice)` at `stays.service.ts:192` (booking creation), store the result into `Booking.govtLevyPct` exactly as today, and leave `releaseEscrow()`'s read of `booking.govtLevyPct` (line 350) completely unchanged.

**Warning signs:** Any diff that adds a `resolveSplit()` call inside `releaseEscrow()` or removes the `Booking.govtLevyPct` column write at booking creation.

### Pitfall: NaN Guard Placed in the Wrong Method

**What goes wrong:** SETTLE-11d's guard gets added only inside `resolveSplit()`, not inside `settle()` itself — leaving `settle()` still vulnerable to a NaN reaching it via any future call site that doesn't go through `resolveSplit()` (or a bug in the percent-to-amount arithmetic downstream of a valid `resolveSplit()` result).

**Why it happens:** It's tempting to guard "at the source" only.

**How to avoid:** SETTLE-11d explicitly requires the guard **directly inside `SettlementService.settle()`** (per REQUIREMENTS.md wording and PITFALLS.md Pitfall 10's recommendation) — add `Number.isFinite(r.amountNgn)` to the existing loop at `settle()` lines 108-116, alongside the negative-amount check, not just inside `resolveSplit()`. Both guards should exist: `resolveSplit()` guards its own read, `settle()` guards its own input regardless of source.

### Pitfall: Migration Script Resets Production Values to Seed Defaults

**What goes wrong:** Backfill script is written against `seed.ts`'s hardcoded values instead of reading live `PlatformConfig` rows, silently reverting any stakeholder-tuned production percentage back to the original seed default.

**Why it happens:** `seed.ts` is the easiest reference to copy from when writing a migration.

**How to avoid:** The backfill script must query `prisma.platformConfig.findUnique({ where: { key } })` for each of the 12 existing keys (2 per module × 6 modules) and use `cfg.value` — falling back to the seed default ONLY if the row is genuinely absent (matching each call site's own existing fallback behavior, e.g. `5`/`10`/`15` for Transport/Delivery, `0.10`/`0.05` for the other 4).

## Code Examples

### `SettlementSplitTier` Prisma model

```prisma
// Source: .planning/research/ARCHITECTURE.md §Q5 (re-verified compatible with live schema.prisma this session)
model SettlementSplitTier {
  id            String    @id @default(uuid())
  module        String    // 'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio' | 'tour'
  tierName      String    @default("default") // supports future volume/category tiering without a schema change
  minAmountNgn  Decimal?  // nullable — null means "no lower bound" (unused this phase, Claude's Discretion to include)
  maxAmountNgn  Decimal?  // nullable — null means "no upper bound" (unused this phase)
  earnerPct     Decimal   // vendor/rider/host share (0-1 fraction, D-03)
  ministryPct   Decimal   // government levy share (0-1 fraction, D-03)
  platformPct   Decimal?  // optional explicit platform cut; if null, platform absorbs the remainder (D-01 preserves Studio's current null-remainder behavior)
  isActive      Boolean   @default(true)
  effectiveFrom DateTime  @default(now())
  metadata      Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([module, tierName])
  @@index([module, isActive])
  @@map("settlement_split_tiers")
}
```

### Migration/backfill script shape (recommended concrete implementation)

```typescript
// Source: recommended by this research, following ARCHITECTURE.md §Q5's "dedicated
// migration script, not a seed.ts edit" recommendation, and CONTEXT.md's Claude's-Discretion
// note. Place at backend/scripts/migrate-settlement-split-tiers.ts, run once via
// `npx ts-node scripts/migrate-settlement-split-tiers.ts` after `prisma migrate deploy`.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// module -> { levyKey, feeKey, defaultLevy, defaultFee, wholeNumberPct }
// wholeNumberPct=true means divide by 100 once (D-03) — Transport/Delivery only.
const MODULE_CONFIG: Record<string, {
  levyKey: string; feeKey: string | null;
  defaultLevy: number; defaultFee: number | null;
  wholeNumberPct: boolean;
}> = {
  transport: { levyKey: 'transport.govt_levy_pct', feeKey: 'transport.platform_fee_pct', defaultLevy: 5, defaultFee: 10, wholeNumberPct: true },
  delivery:  { levyKey: 'delivery.govt_levy_pct',  feeKey: 'delivery.platform_fee_pct',  defaultLevy: 5, defaultFee: 15, wholeNumberPct: true },
  marketplace: { levyKey: null as any, feeKey: 'marketplace.platform_fee_pct', defaultLevy: 0, defaultFee: 0.10, wholeNumberPct: false }, // D-02: no module-level levy key, vendor-scoped only
  events:    { levyKey: 'events.govt_levy_pct',    feeKey: 'events.platform_fee_pct',    defaultLevy: 0.05, defaultFee: 0.10, wholeNumberPct: false },
  stays:     { levyKey: 'stays.govt_levy_pct',      feeKey: null, defaultLevy: 0.05, defaultFee: null, wholeNumberPct: false }, // no explicit platform fee key today
  studio:    { levyKey: 'studio.govt_levy_pct',     feeKey: 'studio.platform_fee_pct',    defaultLevy: 0.05, defaultFee: 0.10, wholeNumberPct: false }, // D-01: feeKey read but unused in split math
};

async function main() {
  for (const [module, cfg] of Object.entries(MODULE_CONFIG)) {
    const levyRow = cfg.levyKey ? await prisma.platformConfig.findUnique({ where: { key: cfg.levyKey } }) : null;
    const feeRow = cfg.feeKey ? await prisma.platformConfig.findUnique({ where: { key: cfg.feeKey } }) : null;

    let ministryPct = levyRow ? Number(levyRow.value) : cfg.defaultLevy;
    let platformPct = feeRow ? Number(feeRow.value) : cfg.defaultFee;

    if (cfg.wholeNumberPct) {
      ministryPct = ministryPct / 100;
      if (platformPct !== null) platformPct = platformPct / 100;
    }

    if (!Number.isFinite(ministryPct) || (platformPct !== null && !Number.isFinite(platformPct))) {
      throw new Error(`Migration aborted: non-finite value computed for module="${module}" (ministryPct=${ministryPct}, platformPct=${platformPct}) — check source PlatformConfig rows before retrying`);
    }

    // D-01: Studio's platformPct is intentionally set to null even though a fee
    // config row exists — the value is fetched but never applied to the split
    // today (platform silently absorbs the remainder). Preserve that exactly.
    const finalPlatformPct = module === 'studio' ? null : platformPct;

    // earnerPct is derived, not stored config: 1 - ministryPct - (platformPct ?? 0)
    const earnerPct = finalPlatformPct !== null
      ? 1 - ministryPct - finalPlatformPct
      : 1 - ministryPct; // remainder implicitly goes to platform, not earner, when platformPct is null (D-01) —
                          // NOTE: verify per-module which side absorbs the "no explicit platformPct" remainder;
                          // Studio's current code has NO earner recipient row at all (only MINISTRY + platform-absorbed
                          // remainder) — earnerPct for Studio should be 0/unused, confirm against studio.service.ts
                          // recipients array (only 'MINISTRY' tag present) before finalizing this script.

    await prisma.settlementSplitTier.upsert({
      where: { module_tierName: { module, tierName: 'default' } },
      update: {}, // do not overwrite if already migrated — script is idempotent
      create: {
        module,
        tierName: 'default',
        earnerPct,
        ministryPct,
        platformPct: finalPlatformPct,
        isActive: true,
      },
    });
    console.log(`Migrated ${module}: ministryPct=${ministryPct}, platformPct=${finalPlatformPct}, earnerPct=${earnerPct}`);
  }
}

main().finally(() => prisma.$disconnect());
```

**Important caveat on the script above:** the `earnerPct` derivation shown is illustrative, not verified against every module's exact recipient-array shape. Transport/Delivery have an explicit `DRIVER`/`RIDER` recipient (earner). Marketplace/Events/Stays have `VENDOR`/`ORGANISER`/`HOST` earner recipients. **Studio has no earner recipient row at all today** (`studio.service.ts:187-195` — only `MINISTRY` is in the `recipients` array; the remainder goes to the platform system wallet automatically via `settle()`'s drift-absorption). This means Studio's `SettlementSplitTier.earnerPct` may be semantically unused/`0` — the planner must confirm against the exact 6 call sites' recipient arrays which of `earnerPct`/`ministryPct`/`platformPct` are actually consumed per module before finalizing the migration script and `resolveSplit()`'s return-value mapping at each call site. **This is a concrete task for the plan, not something to leave implicit.**

### `Number.isFinite()` guard placement in `settle()`

```typescript
// Source: recommended addition to backend/src/common/services/settlement.service.ts,
// inside the existing loop at lines 108-116 (SETTLE-11d)
for (const r of input.recipients) {
  if (!Number.isFinite(r.amountNgn)) {
    const err = new Error(
      `Non-finite recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error (NaN/Infinity reached settle())`,
    );
    await this.handleSettlementFailure(input, err);
    throw err;
  }
  if (r.amountNgn < 0) {
    // existing check, unchanged
    const err = new Error(
      `Negative recipient amount for ${r.tag} (${r.refSuffix}), module=${input.module}, ref=${input.reference}) — programming error`,
    );
    await this.handleSettlementFailure(input, err);
    throw err;
  }
}
```

### Admin CRUD endpoints (mirrors existing `getConfig()`/`setConfig()` pattern)

```typescript
// admin.controller.ts additions — SUPER_ADMIN only, per the Drift Check recommendation above
@Get('settlement-splits')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'List settlement split tiers, optionally filtered by module' })
listSplitTiers(@Query('module') module?: string) {
  return this.adminService.listSplitTiers(module);
}

@Patch('settlement-splits/:id')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Update a settlement split tier row (creates a new row per D-05, or updates in place — planner to decide)' })
updateSplitTier(@Param('id') id: string, @Body() data: { earnerPct?: number; ministryPct?: number; platformPct?: number | null }) {
  return this.adminService.updateSplitTier(id, data);
}

// admin.service.ts additions
listSplitTiers(module?: string) {
  return this.prisma.settlementSplitTier.findMany({
    where: module ? { module } : undefined,
    orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

updateSplitTier(id: string, data: { earnerPct?: number; ministryPct?: number; platformPct?: number | null }) {
  // Validate finite before writing — same discipline as SETTLE-11d's settle() guard.
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null && !Number.isFinite(v)) {
      throw new BadRequestException(`${k} must be a finite number`);
    }
  }
  return this.prisma.settlementSplitTier.update({ where: { id }, data });
}
```

**Open design question for the planner (D-05-adjacent, not explicitly resolved by CONTEXT.md):** should `PATCH /admin/settlement-splits/:id` update the existing row in place, or insert a new row (deactivating the old one) to preserve a literal audit trail of every historical value? D-05 says "old tier rows are never deleted or overwritten (kept for audit/history)" — this implies **insert-new-row-and-deactivate-old**, not an in-place `update()`. The code example above does an in-place `update()` for simplicity; **the planner should change this to an insert-new/deactivate-old pattern** (`isActive: false` on the old row, new row created with the new values) to actually satisfy D-05's stated audit-history requirement. Flagging this explicitly since the naive CRUD `PATCH` implementation (shown above, copied from the existing `setConfig()` precedent) does NOT satisfy D-05 as literally written.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| 6× duplicated `platformConfig.findUnique()` pairs, untyped `Json` value | 1× `SettlementSplitTier` typed-Decimal model + `resolveSplit()` resolver | This phase (18) | Eliminates the `NaN`-shape risk class entirely for split-percentage config; centralizes the "which module gets what split" question into one auditable table |

**Deprecated/outdated:** None — the flat `PlatformConfig` keys (`transport.govt_levy_pct` etc.) are not deleted this phase (no requirement to clean them up), just superseded as the *read* source for the 6 call sites. Leaving them in place is harmless (nothing reads them post-migration) but the planner may want to add a cleanup note/todo for a future phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Studio's `SettlementSplitTier.earnerPct` should be `0`/unused since Studio has no earner recipient in its `settle()` call today | `## Code Examples` migration script caveat | If wrong, the migration script's derived `earnerPct` for Studio could be a meaningless nonzero value that a future SETTLE-11e amount-tiering feature might accidentally consume; low risk since nothing reads `earnerPct` for Studio this phase, but should be explicitly confirmed by the planner against `studio.service.ts`'s recipients array before finalizing |
| A2 | New admin endpoints should be `SUPER_ADMIN`-only (excluding `LGA_ADMIN`), diverging from `AdminController`'s class-level default | `## Drift Check` "Minor drift: Admin role-gating" | If the planner instead reuses the class default (`SUPER_ADMIN, LGA_ADMIN`), LGA-scoped admins gain the ability to change platform-wide settlement splits — a real privilege-scope decision, not purely cosmetic; low-medium risk, easily corrected before merge if flagged in plan review |
| A3 | D-05's "kept for audit/history" language requires an insert-new-row/deactivate-old update pattern, not an in-place `UPDATE` | `## Code Examples` "Open design question" | If the planner implements in-place `UPDATE` instead, historical split values are lost the moment an admin changes a tier — directly contradicts D-05's explicit audit-history intent; medium risk, should be resolved in the plan before implementation, not discovered during code review |

**None of these are [ASSUMED] in the strict provenance sense used elsewhere in this document** — all three are direct, high-confidence inferences from re-reading live source code and CONTEXT.md's own wording this session (HIGH confidence on the underlying facts), but the *recommended resolution* in each case is this research's own judgment call, not an explicit CONTEXT.md decision. Flagging them here so the planner treats them as decisions to make explicitly, not defaults to inherit silently.

## Open Questions

1. **Studio's `earnerPct` semantics in the new model**
   - What we know: Studio's `settle()` call today has only a `MINISTRY` recipient — no earner wallet is credited at all; the "platform fee" config value is fetched but only logged into `platformMetadata`, never applied (D-01, confirmed live).
   - What's unclear: Whether `SettlementSplitTier.earnerPct` for Studio should be `0`, `null`, or simply left at whatever the derived-remainder math produces (since nothing reads it).
   - Recommendation: Set explicitly to `0` in the migration script with a comment explaining why, rather than a derived/ambiguous value — makes the row self-documenting for future SETTLE-11e work.

2. **In-place update vs. insert-new-row for the admin PATCH endpoint (D-05 audit-history)**
   - What we know: D-05 explicitly states old rows are "never deleted or overwritten."
   - What's unclear: CONTEXT.md doesn't specify the exact mechanism (versioned rows vs. a separate audit log table).
   - Recommendation: Insert-new-row + deactivate-old (`isActive: false` on the previous row, new row with `effectiveFrom: now()`), reusing the `@@unique([module, tierName])` constraint's implication that only ONE row per `(module, tierName)` can be `isActive: true` at a time — enforce this at the application level in `updateSplitTier()`, since Prisma's `@@unique` alone can't express "unique among active rows only" without a partial index (out of scope to add this phase; application-level enforcement in `AdminService` is sufficient given only `SUPER_ADMIN` can write here).

3. **Whether the flat `PlatformConfig` keys should be marked deprecated/soft-deleted post-migration**
   - What we know: Nothing requires this; the 6 call sites simply stop reading them.
   - What's unclear: Whether leaving them live (readable via the existing generic `GET/PATCH /admin/config/:key`) creates operator confusion (an admin could still "update" `transport.govt_levy_pct` via the old generic endpoint, with zero effect, since nothing reads it anymore).
   - Recommendation: Not blocking for this phase, but worth a one-line note/todo for a future cleanup phase — low priority, no money-flow risk either way since the keys become inert, not actively harmful.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x (`backend/package.json`, already configured) |
| Config file | `backend/jest.config.js` (or equivalent inline config — existing, no changes needed) |
| Quick run command | `npm run test -- settlement.service.spec` (from `backend/`) |
| Full suite command | `npm run test` (from `backend/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| SETTLE-11a | `SettlementSplitTier` model + migration script produces correct rows for all 6 modules from live config values | unit | `npm run test -- migrate-settlement-split-tiers` | ❌ Wave 0 — new spec for the migration script |
| SETTLE-11a | D-03 unit conversion: Transport/Delivery whole-number pct correctly divided by 100 exactly once | unit | `npm run test -- migrate-settlement-split-tiers` (same file, dedicated case) | ❌ Wave 0 |
| SETTLE-11b | Each of the 6 call sites calls `resolveSplit()` exactly once, computes the identical `SettlementRecipient[]` shape as before migration (regression, same amounts for the same input) | unit/regression | `npm run test -- transport.service delivery.service marketplace.service events.service stays.service studio.service` | ❌ Wave 0 — extend existing `*.service.spec.ts` files (all 6 already exist per module) with pre/post-migration comparison cases |
| SETTLE-11b | `resolveSplit()` itself: correct percentage returned for a known module, throws on missing row, throws on malformed (non-finite) row | unit | `npm run test -- settlement.service` | file exists — extend `settlement.service.spec.ts` |
| SETTLE-11c | Stays: `resolveSplit()` called and stored at booking creation, NOT re-read at escrow-release time; changing a tier after booking creation does not affect that booking's escrow payout | unit/regression | `npm run test -- stays.service` | file exists — extend with a "config changed mid-escrow-hold" case |
| SETTLE-11c | A `Transaction` row's stored `amount` is unaffected by a subsequent `SettlementSplitTier` update — proven by settling once, updating the tier, then asserting a re-fetch of the original `Transaction` row is unchanged | integration | `npm run test -- settlement.service` (or a dedicated `settlement-split-immutability.spec.ts`) | ❌ Wave 0 (new dedicated spec recommended given cross-cutting nature) |
| SETTLE-11d | `settle()` rejects a `NaN`/`Infinity` recipient amount with a loud thrown error, before any wallet mutation occurs | unit | `npm run test -- settlement.service` | file exists — extend `settlement.service.spec.ts` with a new Scenario (K) |
| SETTLE-11d | `resolveSplit()` rejects a malformed `SettlementSplitTier` row (non-finite Decimal, e.g. simulated via a mocked Prisma response) before it reaches `settle()` | unit | `npm run test -- settlement.service` | same file |
| (cross-cutting) | Shadow-verify (if adopted per Claude's Discretion): compute old flat-key result + new `resolveSplit()` result for each of the 6 modules against representative live-shaped fixtures, assert zero discrepancy | integration | `npm run test -- shadow-verify-settlement-splits` (if built) | ❌ Wave 0 — optional, only if shadow-verify is adopted |

### Sampling Rate

- **Per task commit:** `npm run test -- <touched-module>.service` (from `backend/`) — fast, scoped to the module just changed
- **Per wave merge:** `npm run test` (full backend suite) — catches cross-module regressions (e.g., a `resolveSplit()` signature change breaking a call site not directly touched in that wave)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual review of the migration script's dry-run output against live-shaped `PlatformConfig` fixtures (not just the unit test) — given this touches real money math, treat the migration script's correctness as requiring more than automated-test confidence alone before it's ever run against production data

### Wave 0 Gaps

- [ ] `backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts` — new, covers SETTLE-11a's backfill correctness including D-03's unit conversion
- [ ] `backend/src/common/services/__tests__/settlement-split-immutability.spec.ts` (or extend `settlement.service.spec.ts`) — new/extended, covers SETTLE-11c's "historical settlements retain old percentage" invariant
- [ ] Extend existing `backend/src/modules/{transport,delivery,marketplace,events,stays,studio}/__tests__/*.service.spec.ts` (all 6 already exist) with pre/post-migration regression assertions for SETTLE-11b
- [ ] Extend `backend/src/common/services/__tests__/settlement.service.spec.ts` (exists — 10 scenarios A-J documented in its own header comment) with new Scenario(s) for SETTLE-11d's `Number.isFinite()` guard

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependency. All work is Prisma schema + existing NestJS service/controller code within the already-provisioned Node.js 20 + PostgreSQL 16 + existing `backend/` workspace. No new package installs, no new environment variables.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V4 Access Control | yes | New `GET`/`PATCH /admin/settlement-splits*` endpoints must be role-gated — recommend `@Roles(UserRole.SUPER_ADMIN)` only (see Drift Check), consistent with `JwtAuthGuard` + `RolesGuard` already applied at the `AdminController` class level |
| V5 Input Validation | yes | `PATCH` body validation: `earnerPct`/`ministryPct`/`platformPct` must be finite numbers in a sane range (0-1 per D-03); recommend a dedicated DTO with `class-validator` (`@IsNumber()`, `@Min(0)`, `@Max(1)`, `@IsOptional()`) rather than the untyped `Body() data: {...}` shape shown in the illustrative code example above — matches the project's established DTO convention (every other mutating endpoint uses a `class-validator`-decorated DTO; `AdminController`'s existing `updateStudioSlot`/`updateVendorStatus` untyped-body pattern is itself a minor existing deviation, not a precedent to extend) |
| V6 Cryptography | no | No secrets/PII touched by this phase |
| V2 Authentication | no (inherited) | Existing `JwtAuthGuard` on `AdminController`, unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Privilege escalation via overly broad role gate on money-config endpoints | Elevation of Privilege | `@Roles(UserRole.SUPER_ADMIN)` only, excluding `LGA_ADMIN` (see Drift Check recommendation) |
| Malformed/out-of-range split percentage silently accepted (e.g. `earnerPct: 1.5`, `ministryPct: -0.1`) | Tampering | DTO-level `@Min(0)/@Max(1)` validation on the `PATCH` body, in addition to `Number.isFinite()` at the `settle()`/`resolveSplit()` read boundary — defense in depth at both write and read time |
| Sum of `earnerPct + ministryPct + platformPct` exceeding 1.0 (over-allocating a settlement, silently absorbed as a negative platform commission or rejected by `settle()`'s existing drift guard) | Tampering | Recommend an additional validation in `updateSplitTier()`: reject if `earnerPct + ministryPct + (platformPct ?? 0) > 1` — this is a NEW check not present in any current call site (today's inline math never explicitly sums-and-validates before calling `settle()`; it relies on `settle()`'s ±0.02 drift-tolerance assertion catching gross misconfigurations only after the fact) |

## Sources

### Primary (HIGH confidence — direct source read, this session)

- `backend/prisma/schema.prisma` (lines 462-503, 682-707) — `Booking`, `Vendor`, `PlatformConfig`, `ShadowSettlementComparison` models
- `backend/src/common/services/settlement.service.ts` (full file) — `settle()`, `resolveMinistryWallet()`, negative-amount guard, drift-tolerance assertion
- `backend/src/modules/transport/transport.service.ts` (lines 540-650)
- `backend/src/modules/delivery/delivery.service.ts` (lines 580-680)
- `backend/src/modules/marketplace/marketplace.service.ts` (lines 180-315)
- `backend/src/modules/events/events.service.ts` (lines 240-290)
- `backend/src/modules/stays/stays.service.ts` (lines 185-385)
- `backend/src/modules/studio/studio.service.ts` (lines 160-210)
- `backend/src/modules/admin/admin.controller.ts` (full file)
- `backend/src/modules/admin/admin.service.ts` (lines 155-172)
- `backend/src/modules/admin/admin.module.ts` (full file)
- `backend/src/common/enums/user-role.enum.ts` (full file)
- `backend/prisma/seed.ts` (lines 1265-1570, grepped for split-percentage keys)
- `backend/src/common/services/__tests__/settlement.service.spec.ts` (lines 1-90, header + fixture/mock structure)
- `backend/package.json` (test scripts, confirmed no `zod` dependency)
- `.planning/config.json` (confirmed `nyquist_validation: true`)

### Primary (HIGH confidence — prior milestone research, already-completed)

- `.planning/research/ARCHITECTURE.md` §Q5 "Configurable per-module Ministry split tiers (SETTLE-11)" — proposed schema, `resolveSplit()` signature, migration recommendation
- `.planning/research/PITFALLS.md` Pitfall 10 "Migrating the Flat PlatformConfig Percentage to Per-Module Tiers on an Untyped Json Column Risks NaN-Corrupted Wallet Balances" — validation guard requirements, key-namespacing guidance

### Secondary (MEDIUM confidence)

- None — this phase required no external/web research; entirely a codebase-internal centralization task.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, entirely existing project infrastructure re-verified live
- Architecture: HIGH — schema/resolver pattern directly copied from an already-proven precedent (`resolveMinistryWallet()`), re-verified against live code this session
- Pitfalls: HIGH — Pitfall 10 (prior research) + this session's live-code re-read surfaced one new concrete finding (Stays' snapshot timing) not previously documented anywhere

**Research date:** 2026-07-19
**Valid until:** 2026-08-18 (30 days — stable internal codebase, no fast-moving external dependency)
