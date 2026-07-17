---
phase: 13
slug: settlement-cutover-transport-delivery
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 13-01-XX | TBD | 0 | SETTLE-09 | T-13-01 | Rewrite of `transport.service.spec.ts`'s `completeTrip` mocks from direct-`$transaction` assertions to `SettlementService.settle()` call-shape assertions | unit | `npx jest transport.service.spec -t completeTrip` | ✅ existing spec, needs rewrite | ⬜ pending |
| 13-01-XX | TBD | 0 | SETTLE-09 | T-13-01 | Rewrite of `delivery.service.spec.ts`'s `completeDelivery` mocks, same pattern | unit | `npx jest delivery.service.spec -t completeDelivery` | ✅ existing spec, needs rewrite | ⬜ pending |
| 13-02-XX | TBD | 1 | SETTLE-03 | T-13-01 / T-13-02 | `completeTrip()` credits driver (unchanged 85%), Ministry (new), platform (implicit) via `SettlementService.settle()`, canonical lock ordering preserved | unit | `npx jest transport.service.spec -t completeTrip` | ✅ (post-rewrite) | ⬜ pending |
| 13-02-XX | TBD | 1 | SETTLE-04 | T-13-01 / T-13-02 | `completeDelivery()` same 3-way pattern for RIDER | unit | `npx jest delivery.service.spec -t completeDelivery` | ✅ (post-rewrite) | ⬜ pending |
| 13-02-XX | TBD | 1 | SETTLE-03/04 | — | Deterministic idempotency reference (`ISY-TRP-<tripId>` / `ISY-DLV-<orderId>`) replaces random-UUID scheme so replay-detection works | unit | `npx jest transport.service.spec delivery.service.spec -t idempoten` | ❌ Wave 0 gap | ⬜ pending |
| 13-02-XX | TBD | 1 | SETTLE-03/04 | — | Cutover flag (`transport.settlement_engine_enabled` / `delivery.settlement_engine_enabled`) gates old-vs-new code path correctly for both `true`/`false` states, including instant rollback | unit | `npx jest transport.service.spec delivery.service.spec -t "settlement_engine_enabled"` | ❌ Wave 0 gap | ⬜ pending |
| 13-03-XX | TBD | 1 | SETTLE-09 | T-13-03 | Shadow-mode Stage 1 batch script produces zero discrepancies against historical sample | integration/manual | `ts-node backend/scripts/shadow-settlement-verify.ts` | ❌ Wave 0 — net-new script | ⬜ pending |
| 13-03-XX | TBD | 1 | SETTLE-09 | T-13-03 | Shadow-mode Stage 2 live dual-run persists comparison rows with `matched: true` for every real completion during bake period | unit + manual bake period | `npx jest transport.service.spec -t shadow` + live 3-day/100-tx observation | ❌ Wave 0 — net-new model + coverage | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/scripts/shadow-settlement-verify.ts` — Stage 1 batch script stub (net-new, follows `seed.ts`'s raw-`PrismaClient` convention; no `NestFactory.createApplicationContext` pattern exists yet in this codebase)
- [ ] `ShadowSettlementComparison` Prisma model + migration (if planner accepts the recommended durable-persistence design for Stage 2 bake tracking) — net-new, needs `prisma migrate dev`
- [ ] Rewrite `backend/src/modules/transport/__tests__/transport.service.spec.ts`'s `completeTrip` describe block — current mocks assert the OLD direct-`$transaction`/`wallet.update` shape; must mock `SettlementService.settle()` instead, mirroring how `studio.service.spec.ts:17` mocks `resolveMinistryWallet`
- [ ] Rewrite `backend/src/modules/delivery/__tests__/delivery.service.spec.ts`'s `completeDelivery` describe block — same rewrite
- [ ] New test coverage for the cutover flag branch (both `true`/`false` states) in both service spec files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Stage 2 live bake-period gate: 3 elapsed days OR 100 completed trips/deliveries, zero discrepancies (D-08) | SETTLE-09 | Requires real live traffic over a multi-day wall-clock window; cannot be simulated in a unit/integration test run | Query `ShadowSettlementComparison` (or log output) after the bake window; confirm `matched: true` for 100% of rows before flipping `transport.settlement_engine_enabled` / `delivery.settlement_engine_enabled` to `true` |
| Post-cutover live payout parity (Success Criterion 4) | SETTLE-03/04/09 | Requires observing real driver/rider wallet credits after the flag flips, not reproducible in CI | Spot-check the first N post-cutover `completeTrip`/`completeDelivery` calls' wallet credit amounts against the shadow-mode-verified expected amounts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
