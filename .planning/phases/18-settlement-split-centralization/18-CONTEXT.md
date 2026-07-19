# Phase 18: Settlement Split Centralization - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Every settlement call site (Transport, Delivery, Marketplace, Events, Stays, Studio) currently reads its split percentage inline via its own duplicated `PlatformConfig.findUnique()` pair. This phase replaces those 6 duplicated reads with a single, validated, effective-dated `SettlementSplitTier` resolver (`SettlementService.resolveSplit()`), used exclusively by all 6 call sites. It does NOT introduce amount-based/vendor-category tiering logic (SETTLE-11e, explicitly deferred to backlog) — it centralizes today's flat per-module split into one source of truth.

</domain>

<decisions>
## Implementation Decisions

### Known inconsistencies (preserve current money-flow, don't silently change it)
- **D-01:** Studio currently fetches `platformFeePct` from `PlatformConfig` but never applies it to the split — the platform silently absorbs 100% of the remainder after the govt levy (`studio.service.ts`). When centralizing: Studio's `SettlementSplitTier` row gets `platformPct = null` (remainder absorbed by platform), preserving exact current behavior. Fixing this apparent bug is explicitly OUT of scope for this phase — it's a deliberate money-flow change that deserves its own decision, not a side effect of a refactor.
- **D-02:** Marketplace has a per-vendor `Vendor.govtLevyPct` DB column that overrides the module-level government levy for that vendor. The centralized resolver does NOT absorb this. `resolveSplit('marketplace', amount)` returns only the module-level default (the platform-fee piece); `marketplace.service.ts` continues reading `Vendor.govtLevyPct` directly for the per-vendor levy override, exactly as it does today. No vendor-scoped tier rows this phase — that shape of work belongs to SETTLE-11e (deferred).

### Percentage unit (canonical representation)
- **D-03:** `SettlementSplitTier`'s `earnerPct`/`ministryPct`/`platformPct` columns store **decimal fractions in the 0–1 range** (e.g., `0.10`, not `10`). This matches 4 of the 6 modules (Marketplace, Events, Stays, Studio) as-is. Transport's and Delivery's current whole-number-percent `PlatformConfig` values (5, 10, 15) must be divided by 100 exactly once during the one-time data migration script that seeds the `'default'` tier rows from existing config.

### Admin surface
- **D-04:** Phase 18 builds **backend CRUD endpoints only** for `SettlementSplitTier` — new role-gated `GET`/`PATCH` endpoints on the existing `AdminController` (list by module, update one row). No new web admin UI page this phase. This matches the project's existing pattern: there has never been a dedicated frontend for config editing (only the generic untyped `PATCH /admin/config/:key`), and the requirement ("operator can view and update... without a code deploy") is satisfied by an authenticated API call. A dedicated web page is a legitimate future enhancement, not part of this phase's scope.

### Effective-dating scope
- **D-05:** "Effective-dated" means **immediate-effect only**, not future-scheduled. A `SettlementSplitTier` update takes effect for every settlement from the moment it's saved onward. Old tier rows are never deleted or overwritten (kept for audit/history), but `resolveSplit()` always resolves "the currently active row as of now" — it never needs to reason about a future `effectiveFrom` date. This satisfies Success Criteria #1's exact wording ("takes effect for settlements from that point forward") with no scheduling UI or as-of-settlement-time lookup logic needed. Already-settled transactions naturally retain their historical percentage (SETTLE-11c) because `settle()` computes and stores amounts once, at settlement time — it never re-reads config for a past transaction.

### Claude's Discretion
- Exact shape of the `SettlementSplitTier` migration script (Prisma migration + one-off data-backfill script vs. seed.ts edit) — research recommends a dedicated migration script since production `PlatformConfig` rows may hold stakeholder-tuned values that must carry over, not reset to seed defaults. Planner should follow this recommendation.
- Whether to keep the unused `minAmountNgn`/`maxAmountNgn` columns on the schema (nullable, unused this phase) for future tiering, per the architecture research's suggestion — low-cost to include now, avoids a future migration if SETTLE-11e is ever picked up.
- Whether shadow-verification (compute old flat-key result + new resolver result, compare, log discrepancy) is used per call site before cutover — recommended by research, mirrors the proven SETTLE-09 pattern already used for Transport/Delivery.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` (Phase 18 section, lines ~415-424) — goal, success criteria, requirements list
- `.planning/REQUIREMENTS.md` (SETTLE-11a/b/c/d, lines ~20-23) — locked v1 requirements
- `.planning/REQUIREMENTS.md` (SETTLE-11e, line ~49) — explicitly deferred backlog item (tiered/vendor-category splits) — confirms amount/category tiering is OUT of scope this phase

### Research (already completed for this milestone)
- `.planning/research/ARCHITECTURE.md` §Q5 "Configurable per-module Ministry split tiers (SETTLE-11)" — proposed `SettlementSplitTier` Prisma schema, `resolveSplit()` method signature, migration/seed approach, shadow-verify recommendation
- `.planning/research/PITFALLS.md` Pitfall 10 "Json-shape/NaN migration risk" — validation guard requirements (Number.isFinite(), loud-failure-not-silent-NaN), key-namespacing guidance, regression test requirement (feeds SETTLE-11d)

### Settlement engine (existing, LOCKED architectural commitments)
- `backend/src/common/services/settlement.service.ts` — `SettlementService.settle()` (the atomic N-way fan-out engine this phase's resolver feeds into); `resolveMinistryWallet()` (line 321) is the existing precedent for "always fresh, never cached" resolution style that `resolveSplit()` should mirror
- `backend/prisma/schema.prisma` — `PlatformConfig` model (line ~682, untyped `Json` value column — the source of today's 6 duplicated reads)

### 6 call sites to migrate
- `backend/src/modules/transport/transport.service.ts` (lines ~554-568 read, ~593-640 settle call) — whole-number pct keys `transport.govt_levy_pct`, `transport.platform_fee_pct`
- `backend/src/modules/delivery/delivery.service.ts` (lines ~585-602 read, ~623-678 settle call) — whole-number pct keys `delivery.govt_levy_pct`, `delivery.platform_fee_pct`
- `backend/src/modules/marketplace/marketplace.service.ts` (lines ~189-211 read, ~285-308 settle call) — fraction key `marketplace.platform_fee_pct` + per-vendor `Vendor.govtLevyPct` override (see D-02)
- `backend/src/modules/events/events.service.ts` (lines ~244-253 read, ~263-286 settle call) — fraction keys `events.platform_fee_pct`, `events.govt_levy_pct`
- `backend/src/modules/stays/stays.service.ts` (lines ~192-193, ~349-374) — fraction key `stays.govt_levy_pct` only (no explicit platform fee key — platform cut is implicit/absorbed)
- `backend/src/modules/studio/studio.service.ts` (lines ~170-175 read, ~182-198 settle call) — fraction keys `studio.platform_fee_pct` (fetched but unused, see D-01), `studio.govt_levy_pct`

### Seed data
- `backend/prisma/seed.ts` (~lines 1265-1583) — current `platformConfig.upsert()` calls for all 6 modules' flat keys; migration script must read production's actual current values (not reset to these seed defaults)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettlementService.resolveMinistryWallet()` (`settlement.service.ts:321-328`) — existing "always fresh, never cached" DB-read pattern to mirror for `resolveSplit()`
- `ShadowSettlementComparison` model (referenced in research, used by SETTLE-09's prior cutover) — precedent for shadow-verifying old-vs-new split computation before switching a call site over live

### Established Patterns
- Every settlement call site follows the same shape: read config → compute split → build `SettlementRecipient[]` → call `settlementService.settle()`. The migration is mechanical per call site: replace the read+compute block with one `resolveSplit()` call, keep the `settle()` call itself unchanged.
- `PlatformConfig.value` is untyped `Json` — every existing read does `cfg ? Number(cfg.value) : <fallback>`. This exact pattern already caused one near-miss (Delivery's `WR-01` boolean-coercion comment) — the new `SettlementSplitTier` model uses typed `Decimal` columns specifically to avoid repeating this class of bug.
- `SettlementService.settle()` already has a negative-recipient-amount guard (line 108-116) and a ±0.02 drift-tolerance assertion (line 124-131) — SETTLE-11d's `Number.isFinite()` NaN guard should sit alongside these, defense-in-depth against a malformed split reaching wallet math.

### Integration Points
- New `SettlementSplitTier` Prisma model + migration, colocated with `PlatformConfig` in `schema.prisma`
- New `resolveSplit()` method added to `SettlementService`, called by all 6 feature services
- New endpoints on the existing `AdminController`/`AdminService` (`backend/src/modules/admin/`) for viewing/updating tier rows — reuses existing role-gating pattern (`STATE_ADMIN`/`SUPER_ADMIN`)

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references — this is a backend/data-model centralization phase with no user-facing surface beyond the new admin API endpoints.

</specifics>

<deferred>
## Deferred Ideas

- **Amount-based or vendor-category tiering** (SETTLE-11e) — the `SettlementSplitTier` schema may include unused `minAmountNgn`/`maxAmountNgn` columns to avoid a future migration, but no branching logic on them ships this phase. Explicitly out of scope per REQUIREMENTS.md backlog.
- **Fixing Studio's unapplied platform fee** (D-01) — noted as a real inconsistency, deliberately deferred rather than fixed as a side effect of this refactor.
- **Web admin UI page for split editing** (D-04) — backend-only this phase; a dedicated frontend page is a reasonable future enhancement if operators find the API-only workflow inconvenient.
- **Future-dated split scheduling** (D-05) — immediate-effect only this phase; scheduling a change for a future date is real added complexity with no current requirement asking for it.

### Reviewed Todos (not folded)
- "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — weakly matched this phase (score 0.4) but is actually gRPC-extraction-resilience work belonging to Phase 20/21, not settlement splits. Left for those phases.

</deferred>

---

*Phase: 18-Settlement Split Centralization*
*Context gathered: 2026-07-19*
