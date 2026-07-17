---
phase: 12
slug: settlement-engine-foundation
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
validated: 2026-07-17
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.x + ts-jest 29.1.x |
| **Config file** | `backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\.spec\.ts$'`) |
| **Quick run command** | `cd backend && npx jest <changed-spec-file>.spec.ts` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~5-15s per spec file (quick) / several minutes (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx jest <changed-spec-file>.spec.ts`
- **After every plan wave:** Run `cd backend && npm test` — critical after Wave 2 since Plan 12-03 refactors `TourSettlementService`, a component with 12 existing passing scenarios that must not regress
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds (single spec) / a few minutes (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|------------------|-----------|--------------------|-------------|--------|
| 12-01-* | 01 | 1 | SETTLE-01, SETTLE-02, SETTLE-08 | T-12-01 | Atomic N-way fan-out, SELECT FOR UPDATE, idempotency (incl. P2002 replay guard), drift assertion ≤0.02 | unit | `npx jest settlement.service.spec.ts` | ✅ `backend/src/common/services/__tests__/settlement.service.spec.ts` | ✅ green |
| 12-02-* | 02 | 1 | SETTLE-02, SETTLE-05, SETTLE-06 | — | Schema push + Ministry User/Wallet + PlatformConfig fee/levy keys seeded and queryable | integration/CLI | `cd backend && npx prisma db push && npx prisma db seed` (verify via `psql`/Prisma Studio query) | ✅ `Booking.govtLevyPct` in schema.prisma:440,468; ministry user/wallet + PlatformConfig keys seeded (`backend/prisma/seed.ts`) | ✅ green |
| 12-03-* | 03 | 2 | SETTLE-01 | T-12-01 | `TourSettlementService` delegates to `SettlementService`; all 12 existing scenarios still pass byte-for-byte | unit (regression) | `npx jest tour-settlement.service.spec.ts` | ✅ `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` | ✅ green |
| 12-04-* | 04 | 2 | SETTLE-06 | T-12-01 | Marketplace `handleOrderPayment` credits vendor + Ministry + platform via `SettlementService` | unit | `npx jest marketplace.service.spec.ts -t "settlement"` | ✅ file exists — new test case added | ✅ green |
| 12-05-* | 05 | 2 | SETTLE-06 | T-12-01 | Events `handleTicketPayment` credits organizer + Ministry + platform (3-way, D-09 amendment) | unit | `npx jest events.service.spec.ts -t "settlement"` | ✅ file exists — new test case added | ✅ green |
| 12-06-* | 06 | 2 | SETTLE-06 | T-12-01 | Studio `handleStudioPayment` credits Ministry + platform (2-way, no vendor leg) | unit | `npx jest studio.service.spec.ts -t "settlement"` | ✅ file exists — new test case added | ✅ green |
| 12-07-* | 07 | 2 | SETTLE-05, SETTLE-06 | T-12-01 | `releaseEscrow()` applies `Booking.govtLevyPct` — host no longer gets 100%; `@OnEvent` wiring added | unit | `npx jest stays.service.spec.ts -t "escrow"` | ✅ file exists — new test case added | ✅ green |
| 12-08-* | 08 | 2 | SETTLE-07 | T-12-02 | Recipient retrieves own itemized statement; non-admin cross-recipient access returns 403 (IDOR guard) | unit + integration | `npx jest settlement.controller.spec.ts` | ✅ `backend/src/common/controllers/__tests__/settlement.controller.spec.ts` | ✅ green |
| 12-09-* | 09 | 3 | SETTLE-01, SETTLE-08 | T-12-01..04 | Full regression green; grep-verifiable audit of all 4 blocking threats resolved | full suite + audit | `cd backend && npm test` | ✅ aggregate of all above | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/src/common/services/__tests__/settlement.service.spec.ts` — covers SETTLE-01, SETTLE-02, SETTLE-08 (new `SettlementService` unit tests, mirror `tour-settlement.service.spec.ts`'s mock-`$transaction`-capture technique)
- [x] `backend/src/common/controllers/__tests__/settlement.controller.spec.ts` — covers SETTLE-07
- [x] Prisma schema push + seed (Plan 12-02, [BLOCKING]) for `Booking.govtLevyPct`, Ministry `User`/`Wallet`, and new `PlatformConfig` fee/levy keys — prerequisite fixture data every downstream test in Wave 2 depends on

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (unit/integration tests per requirement above).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (quick) / few minutes (full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-17 (via `/gsd-plan-phase 12` plan-checker pass — 0 blockers)

---

## Validation Audit 2026-07-17

Post-execution audit against the plan-time contract above: all 9 tasks' automated commands re-run, plus a full-suite regression check.

| Metric | Count |
| --- | --- |
| Requirements audited | 8 (SETTLE-01, 02, 05, 06, 07, 08 + regression) |
| Gaps found | 0 |
| Resolved | 0 (none needed) |
| Escalated to manual-only | 0 |

**Evidence:**

- `cd backend && npx jest settlement.service.spec.ts settlement.controller.spec.ts tour-settlement.service.spec.ts marketplace.service.spec.ts events.service.spec.ts studio.service.spec.ts stays.service.spec.ts` → 7 suites, 141 tests, all passed
- `cd backend && npx jest` (full suite) → 42 suites, 505 tests, all passed — confirms `TourSettlementService` regression (SETTLE-01) and no cross-phase breakage
- `Booking.govtLevyPct` present in `backend/prisma/schema.prisma:440,468`; Ministry `User`/`Wallet` + `PlatformConfig` settlement keys present in `backend/prisma/seed.ts`

All 9 Per-Task Map rows moved from ⬜ pending → ✅ green. All 3 Wave 0 checklist items checked. `nyquist_compliant: true` confirmed — no gaps remain.
