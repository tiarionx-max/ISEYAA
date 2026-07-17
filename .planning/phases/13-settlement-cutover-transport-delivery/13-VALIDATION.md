---
phase: 13
slug: settlement-cutover-transport-delivery
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x (`backend/jest.config.js`) |
| **Config file** | `backend/jest.config.js` (rootDir: `src`, testRegex `.*\.spec\.ts$`) |
| **Quick run command** | `cd backend && npx jest transport.service.spec delivery.service.spec settlement.service.spec --silent` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~60 seconds (quick) / ~180 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest transport.service.spec delivery.service.spec settlement.service.spec --silent`
- **After every plan wave:** Run `cd backend && npm test` (full backend suite, including `tour-settlement.service.spec.ts` to confirm no regression to the shared `SettlementService` contract)
- **Before `/gsd-verify-work`:** Full suite must be green + Stage 1 batch script run against production-like historical data (zero mismatches) + Stage 2 bake-period gate satisfied (D-08: 3 days OR 100 tx, zero discrepancies) BEFORE either cutover flag flips to `true`.
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-T1 | 13-01 | 1 | SETTLE-09 | — | Add `ShadowSettlementComparison` Prisma model (schema only) | n/a (schema) | `cd backend && npx prisma validate` | ✅ finalized | ⬜ pending |
| 13-01-T2 | 13-01 | 1 | SETTLE-09 | T-13-01a | Apply migration; `shadowSettlementComparison` delegate available on generated Prisma Client | n/a (migration) | `cd backend && npx prisma migrate status` | ✅ finalized | ⬜ pending |
| 13-01-T3 | 13-01 | 1 | SETTLE-09 | T-13-01a | Seed 6 new `PlatformConfig` rows (govt_levy_pct/platform_fee_pct/settlement_engine_enabled × 2 modules) | n/a (seed) | `cd backend && npx prisma db seed` | ✅ finalized | ⬜ pending |
| 13-02-T1 | 13-02 | 2 | SETTLE-03, SETTLE-09 | T-13-01, T-13-02, T-13-03 | `completeTrip()` credits driver (unchanged 85%), Ministry (new), platform (implicit) via `SettlementService.settle()`, canonical lock ordering preserved; deterministic `ISY-TRP-<tripId>` idempotency reference; Stage-2 shadow write on the `false` path | unit (TDD) + typecheck | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | ✅ finalized | ⬜ pending |
| 13-02-T2 | 13-02 | 2 | SETTLE-03, SETTLE-09 | T-13-01, T-13-03 | Rewrite of `transport.service.spec.ts`'s `completeTrip` mocks from direct-`$transaction` assertions to `SettlementService.settle()` call-shape assertions; cutover-flag `true`/`false` coverage; shadow-write assertion | unit | `cd backend && npx jest transport.service.spec --silent` | ✅ finalized | ⬜ pending |
| 13-03-T1 | 13-03 | 2 | SETTLE-04, SETTLE-09 | T-13-05, T-13-06, T-13-07 | `completeDelivery()` same 3-way pattern for RIDER (multiply-first formula preserved); deterministic `ISY-DLV-<orderId>` idempotency reference; Stage-2 shadow write on the `false` path | unit (TDD) + typecheck | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | ✅ finalized | ⬜ pending |
| 13-03-T2 | 13-03 | 2 | SETTLE-04, SETTLE-09 | T-13-05, T-13-07 | Rewrite of `delivery.service.spec.ts`'s `completeDelivery` mocks, same pattern; cutover-flag `true`/`false` coverage; shadow-write assertion | unit | `cd backend && npx jest delivery.service.spec --silent` | ✅ finalized | ⬜ pending |
| 13-04-T1 | 13-04 | 3 | SETTLE-09 | T-13-09 | Shadow-mode Stage 1 batch script (`shadow-settlement-verify.ts`) produces zero discrepancies against historical sample; provably read-only (no `.settle(`/`wallet.update(`/`wallet.create(`) | integration (script run) | `cd backend && npx ts-node --compiler-options {\"module\":\"CommonJS\"} scripts/shadow-settlement-verify.ts` | ✅ finalized | ⬜ pending |
| 13-04-T2 | 13-04 | 3 | SETTLE-03, SETTLE-04, SETTLE-09 | T-13-10 | Full backend suite green (zero regression to Phase 12 `SettlementService` callers); source-level audit confirms no surviving direct `tx.wallet.update` outside the legacy `else` branch in either service | unit (full suite) | `cd backend && npm test` | ✅ finalized | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/scripts/shadow-settlement-verify.ts` — Stage 1 batch script (follows `seed.ts`'s raw-`PrismaClient` convention; no `NestFactory.createApplicationContext` pattern exists yet in this codebase) — **planned in Plan 13-04, Task 1**
- [x] `ShadowSettlementComparison` Prisma model + migration — **planned in Plan 13-01, Task 1 (model) + Task 2 (migration)**
- [x] Rewrite `backend/src/modules/transport/__tests__/transport.service.spec.ts`'s `completeTrip` describe block — current mocks assert the OLD direct-`$transaction`/`wallet.update` shape; must mock `SettlementService.settle()` instead, mirroring how `studio.service.spec.ts:17` mocks `resolveMinistryWallet` — **planned in Plan 13-02, Task 2**
- [x] Rewrite `backend/src/modules/delivery/__tests__/delivery.service.spec.ts`'s `completeDelivery` describe block — same rewrite — **planned in Plan 13-03, Task 2**
- [x] New test coverage for the cutover flag branch (both `true`/`false` states) in both service spec files — **planned in Plan 13-02, Task 2 and Plan 13-03, Task 2**

All Wave 0 gaps identified during research are now covered by concrete tasks across the finalized plan set (13-01 → 13-02/13-03 → 13-04, in dependency-ordered waves 1 → 2 → 3). `wave_0_complete: true` reflects planning-time coverage — execution status per task remains tracked in the Per-Task Verification Map above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Stage 2 live bake-period gate: 3 elapsed days OR 100 completed trips/deliveries, zero discrepancies (D-08) | SETTLE-09 | Requires real live traffic over a multi-day wall-clock window; cannot be simulated in a unit/integration test run | Query `ShadowSettlementComparison` (or log output) after the bake window; confirm `matched: true` for 100% of rows before flipping `transport.settlement_engine_enabled` / `delivery.settlement_engine_enabled` to `true` |
| Post-cutover live payout parity (Success Criterion 4) | SETTLE-03/04/09 | Requires observing real driver/rider wallet credits after the flag flips, not reproducible in CI | Spot-check the first N post-cutover `completeTrip`/`completeDelivery` calls' wallet credit amounts against the shadow-mode-verified expected amounts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (revision iteration 1 — checker warnings W1/W2/W3/W6 addressed in Plans 13-02/13-03/13-04 and 13-RESEARCH.md; sign-off reflects finalized plan set, execution still pending)
