---
phase: 18
slug: settlement-split-centralization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-19
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x (`backend/package.json`, already configured) |
| **Config file** | `backend/jest.config.js` (existing, no changes needed) |
| **Quick run command** | `npm run test -- <touched-module>.service` (from `backend/`) |
| **Full suite command** | `npm run test` (from `backend/`) |
| **Estimated runtime** | ~60-120 seconds (full backend suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- <touched-module>.service` (from `backend/`) — fast, scoped to the module just changed
- **After every plan wave:** Run `npm run test` (full backend suite) — catches cross-module regressions (e.g., a `resolveSplit()` signature change breaking a call site not directly touched in that wave)
- **Before `/gsd-verify-work`:** Full suite must be green, plus a manual review of the migration script's dry-run output against live-shaped `PlatformConfig` fixtures — this touches real money math, so treat the migration script's correctness as requiring more than automated-test confidence alone before it is ever run against production data
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-01 | TBD | 0 | SETTLE-11a | — | Migration script produces correct `SettlementSplitTier` rows for all 6 modules from live `PlatformConfig` values, including D-03's whole-number/decimal-fraction unit conversion for Transport/Delivery | unit | `npm run test -- migrate-settlement-split-tiers` | ❌ W0 — new spec | ⬜ pending |
| TBD-02 | TBD | 1 | SETTLE-11b | — | `resolveSplit()` returns correct percentage for a known module, throws on missing row, throws on malformed (non-finite) row | unit | `npm run test -- settlement.service` | file exists — extend `settlement.service.spec.ts` | ⬜ pending |
| TBD-03 | TBD | 1 | SETTLE-11b | — | Each of the 6 call sites (Transport, Delivery, Marketplace, Events, Stays, Studio) calls `resolveSplit()` exactly once and computes an identical `SettlementRecipient[]` shape/amounts as before migration | unit/regression | `npm run test -- transport.service delivery.service marketplace.service events.service stays.service studio.service` | all 6 exist — extend with pre/post-migration comparison cases | ⬜ pending |
| TBD-04 | TBD | 1 | SETTLE-11c | — | Stays: `resolveSplit()` is called and its result stored on `Booking.govtLevyPct` at booking-creation time, NOT re-read at escrow-release time; a tier update after booking creation does not affect that booking's escrow payout | unit/regression | `npm run test -- stays.service` | file exists — extend with a "config changed mid-escrow-hold" case | ⬜ pending |
| TBD-05 (→ 18-01 Task 2, Scenario L) | 18-01 | 1 | SETTLE-11c | — | A settled `Transaction` row's stored amount is unaffected by a subsequent `SettlementSplitTier` update (settle once → update tier → re-fetch original `Transaction` → unchanged) | integration | `npm run test -- settlement.service` | ✅ planned — extends `settlement.service.spec.ts` (new Scenario L, see `18-01-PLAN.md` Task 2) | ⬜ pending |
| TBD-06 | TBD | 1 | SETTLE-11d | — | `settle()` rejects a `NaN`/`Infinity` recipient amount with a loud thrown error before any wallet mutation occurs | unit | `npm run test -- settlement.service` | file exists — extend with new Scenario (K) | ⬜ pending |
| TBD-07 | TBD | 1 | SETTLE-11d | — | `resolveSplit()` rejects a malformed `SettlementSplitTier` row (non-finite Decimal, e.g. mocked Prisma response) before it reaches `settle()` | unit | `npm run test -- settlement.service` | same file | ⬜ pending |
| TBD-08 | TBD | 1-2 | (cross-cutting) | — | Shadow-verify (if adopted): compute old flat-key result + new `resolveSplit()` result for each of the 6 modules against representative live-shaped fixtures, assert zero discrepancy | integration | `npm run test -- shadow-verify-settlement-splits` (if built) | ❌ W0 — optional, only if shadow-verify adopted | ⬜ pending |

*Task IDs are placeholders — the planner assigns real plan/task IDs; this map's rows must be reconciled against the actual PLAN.md task IDs once planning completes.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts` — new, covers SETTLE-11a's backfill correctness including D-03's unit conversion
- [ ] `backend/src/common/services/__tests__/settlement-split-immutability.spec.ts` (or extend `settlement.service.spec.ts`) — new/extended, covers SETTLE-11c's "historical settlements retain old percentage" invariant
- [ ] Extend existing `backend/src/modules/{transport,delivery,marketplace,events,stays,studio}/__tests__/*.service.spec.ts` (all 6 already exist) with pre/post-migration regression assertions for SETTLE-11b
- [ ] Extend `backend/src/common/services/__tests__/settlement.service.spec.ts` (exists — 10 scenarios A-J documented in its own header comment) with new Scenario(s) for SETTLE-11d's `Number.isFinite()` guard

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration script dry-run output review against live-shaped `PlatformConfig` fixtures | SETTLE-11a | Touches real money math on a one-time backfill against production config values — automated test confidence alone is insufficient before this ever runs against production data | Run migration script in dry-run mode against a snapshot/staging copy of production `PlatformConfig`, manually diff resulting `SettlementSplitTier` rows against expected values per module (see D-03 conversion table) |
| Admin `GET`/`PATCH` endpoint role-gating | SETTLE-11a | Role-gating correctness (research found `AdminController`'s actual default is `SUPER_ADMIN, LGA_ADMIN`, not `STATE_ADMIN` as CONTEXT.md D-04 assumed) needs a manual authenticated-request check against the deployed role model, not just a unit-level guard mock | Call new endpoints with `SUPER_ADMIN` and non-`SUPER_ADMIN` tokens, confirm 200 vs 403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
