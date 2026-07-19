---
phase: 18-settlement-split-centralization
verified: 2026-07-19T19:05:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "CR-01's real-database regression test provides working, ongoing protection against the SettlementSplitTier unique-constraint regression"
  gaps_remaining: []
  regressions: []
---

# Phase 18: Settlement Split Centralization Verification Report

**Phase Goal:** Every settlement call site resolves its split percentage from one validated, effective-dated source instead of duplicated inline reads
**Verified:** 2026-07-19T19:05:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + PLAN must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An operator can view and update per-module split percentages via `SettlementSplitTier` without a code deploy, effective going forward | ✓ VERIFIED | Unchanged since initial pass. `GET/PATCH /admin/settlement-splits*` SUPER_ADMIN-only routes present (`admin.controller.ts`), `AdminService.updateSplitTier()` transaction logic confirmed. Quick regression: `npm test` still 54/54 suites, 644/644 tests passing. |
| 2 | A settlement completed under an old percentage retains that percentage even after config later changes (effective-dated, not retroactive) | ✓ VERIFIED | Unchanged. `settle()` never re-resolves config; Stays snapshots `govtLevyPct` at booking time; immutability regression (Scenario L) still passing in the unit suite. |
| 3 | All 6 settlement call sites (Transport, Delivery, Marketplace, Events, Stays, Studio) resolve their split exclusively via `SettlementService.resolveSplit()` | ✓ VERIFIED | Unchanged. All 6 call sites confirmed calling `resolveSplit()` exactly once each; no direct `platformConfig.findUnique` for split keys remains. |
| 4 | Malformed/NaN-corrupted split config is rejected by `settle()` before reaching a wallet mutation | ✓ VERIFIED | Unchanged. `Number.isFinite()` guard present ahead of the negative-amount check; Scenario K passing. |
| 5 | Migration script backfills all 6 modules' live `PlatformConfig` values, D-03 unit conversion applied exactly once, D-01 Studio null/zero preserved | ✓ VERIFIED | Unchanged. `migrate-settlement-split-tiers.ts` and its spec still present and passing. |
| 6 | CR-01 blocker (unique constraint breaking the audit-trail update path) is actually fixed in the current schema, AND has ongoing, reachable regression protection | ✓ VERIFIED (gap closed) | Schema/migration fix unchanged (`@@unique` removed, partial `WHERE "isActive" = true` unique index added — `schema.prisma:695-719`, migration `20260719180003_settlement_split_tier_partial_unique_active`). **Gap closure confirmed:** `backend/package.json` now defines `"test:e2e:settlement-splits": "jest --config test/jest-e2e.json --testPathPattern=\"e2e-settlement-split-tier-audit-trail\""` (line 20). `.github/workflows/ci.yml` now runs this as its own step (`E2E tests (settlement split tier audit trail)`, lines 88-90) inside the `backend` job, positioned after the live Postgres service is provisioned (lines 14-26), `prisma db push --force-reset` runs (line 78), and the job-level `DATABASE_URL: postgresql://iseyaa:iseyaa_test@localhost:5432/iseyaa_test` env var is set (line 37) — this value does not match any of the test file's skip conditions (`!dbUrl`, `localhost:54321`, `placeholder`, `''`), so `skipE2E` evaluates `false` in CI and the two regression tests actually execute, not just get scheduled-and-skipped. Independently re-ran `npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests` in this verification pass: 1 suite / 2 tests, both `skipped` in this local environment (no `DATABASE_URL` set here, matching the file's documented skip-gate behavior) — confirms the script/testPathPattern wiring is syntactically correct and picks up exactly the intended file, with the only reason for local skip being environment, not misconfiguration. |
| 7 | WR-03 float-drift guard applied consistently across all 5 `settle()` call sites | ✓ VERIFIED | Unchanged. `Math.round(x * 100)` present at all 5 `amountKobo:` call sites. |

**Score:** 7/7 truths fully verified. The previously-partial truth (#6) is now fully closed — the CR-01 fix is both structurally correct (schema/migration) and has a reachable, executing regression test wired into CI.

### Gap Closure Detail (from previous VERIFICATION.md)

**Original gap:** "CR-01's real-database regression test provides working, ongoing protection against the SettlementSplitTier unique-constraint regression" — the test file existed but was unreachable from any executable test command (not in `npm test`'s jest roots, not in `test:e2e:tours`'s `--testPathPattern`, not in CI).

**Fix verified in this pass:**
1. New isolated npm script added — `backend/package.json:20`, `"test:e2e:settlement-splits"` — confirmed present via direct read.
2. New CI step added — `.github/workflows/ci.yml:88-90`, `"E2E tests (settlement split tier audit trail)"` — confirmed present via direct read, correctly placed after Postgres provisioning/schema push and before Build.
3. Confirmed the CI-configured `DATABASE_URL` does not trigger the test file's skip gate — this test WILL execute (not just be scheduled) on every CI run, closing the exact gap the prior verification flagged (a well-written test with zero reachable execution path).
4. Independently ran the isolated script locally (`npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests`) — behaves exactly as designed (skips without `DATABASE_URL`, matches `e2e-tour-booking.e2e-spec.ts`'s established skip convention).
5. Independently ran `npm run test:e2e:tours` locally and confirmed it currently fails with `A circular dependency has been detected inside NotificationsClientModule...` on both `wallet-invariant.e2e-spec.ts` and `e2e-tour-booking.e2e-spec.ts` — corroborating the claim that this is a real, pre-existing, unrelated bug (not a Phase 18 regression) and that the new settlement-splits test correctly avoids it by using a raw `PrismaClient` with no NestJS app bootstrap (`test/e2e-settlement-split-tier-audit-trail.e2e-spec.ts` imports only `PrismaClient`, never `Test.createTestingModule`).
6. Confirmed `NotificationsClientModule` (actual path: `backend/src/modules/notifications-client/notifications-client.module.ts` — the todo file's frontmatter lists the older, incorrect path `backend/src/notifications-client/notifications-client.module.ts`, a minor documentation inaccuracy, non-blocking) was last touched by Phase 17 commits (`74e7aef`, `8e70aab`), confirming the circular-dependency bug predates Phase 18 and is correctly scoped out as separate follow-up work.
7. Follow-up todo filed and confirmed present: `.planning/todos/pending/2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md`.
8. Full backend unit-test suite re-run as regression check: 54/54 suites, 644/644 tests passing — no regressions introduced by the CI/package.json changes.

**Documentation-sync gap also closed:** `.planning/REQUIREMENTS.md` line 22 now shows `- [x] **SETTLE-11c**` and the traceability table (line 85) now shows `SETTLE-11c | Phase 18 | Complete` — confirmed via direct read, matching all 4 phase-18 SUMMARY.md files' `requirements-completed` claims.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` (`SettlementSplitTier`) | Model + partial-unique-safe constraint | ✓ VERIFIED | Unchanged from prior pass |
| `backend/prisma/migrations/20260719180003_settlement_split_tier_partial_unique_active/` | CR-01 fix migration | ✓ VERIFIED | Unchanged |
| `backend/src/common/services/settlement.service.ts` (`resolveSplit`, NaN guard) | Resolver + guard | ✓ VERIFIED | Unchanged |
| `backend/scripts/migrate-settlement-split-tiers.ts` | Backfill script | ✓ VERIFIED | Unchanged |
| `backend/src/modules/{transport,delivery,events,marketplace,stays,studio}/*.service.ts` | 6 `resolveSplit()` call sites | ✓ VERIFIED | Unchanged |
| `backend/src/modules/admin/{dto/update-split-tier.dto.ts,admin.service.ts,admin.controller.ts}` | Admin CRUD surface | ✓ VERIFIED | Unchanged |
| `backend/test/e2e-settlement-split-tier-audit-trail.e2e-spec.ts` | CR-01 real-DB regression test | ✓ VERIFIED | Now reachable via `npm run test:e2e:settlement-splits`, wired into CI — no longer orphaned |
| `backend/package.json` (`test:e2e:settlement-splits` script) | Isolated e2e script for the CR-01 test | ✓ VERIFIED | Present at line 20, correct `testPathPattern` |
| `.github/workflows/ci.yml` (new E2E step) | CI execution of the CR-01 test | ✓ VERIFIED | Present at lines 88-90, correctly sequenced after Postgres provisioning |
| `.planning/todos/pending/2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md` | Follow-up documentation for the unrelated bug | ✓ VERIFIED | Present, well-documented; minor inaccurate file path in frontmatter (non-blocking) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `migrate-settlement-split-tiers.ts` | `settlement_split_tiers` table | `prisma.settlementSplitTier.findFirst` + `create` | ✓ WIRED | Unchanged |
| `settlement.service.ts (resolveSplit)` | `settlement_split_tiers` table | `prisma.settlementSplitTier.findFirst(...)` | ✓ WIRED | Unchanged |
| `transport.service.ts` / `delivery.service.ts` / `events.service.ts` | `settlement.service.ts (resolveSplit)` | `this.settlementService.resolveSplit(...)` | ✓ WIRED | Unchanged |
| `marketplace.service.ts` / `stays.service.ts` / `studio.service.ts` | `settlement.service.ts (resolveSplit)` | `this.settlementService.resolveSplit(...)` | ✓ WIRED | Unchanged |
| `admin.controller.ts` | `admin.service.ts` | `this.adminService.(listSplitTiers\|updateSplitTier)` | ✓ WIRED | Unchanged |
| `admin.service.ts (updateSplitTier)` | `settlement_split_tiers` table | `prisma.$transaction([update isActive:false, create new row])` | ✓ WIRED | Now backed by a reachable, real-Postgres regression test in CI |
| `backend/test/e2e-settlement-split-tier-audit-trail.e2e-spec.ts` | `test:e2e:settlement-splits` npm script → CI step | `testPathPattern` match + `.github/workflows/ci.yml` step | ✓ WIRED | **Gap closed.** Confirmed script picks up exactly this file; confirmed CI's `DATABASE_URL` does not trigger the skip gate; confirmed step is sequenced after Postgres/schema setup |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| SETTLE-11a | 18-01, 18-04 | `SettlementSplitTier` model replaces 6 duplicated inline `PlatformConfig` reads; operator can view/update via API without a code deploy | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` shows `[x]` / Complete |
| SETTLE-11b | 18-01, 18-02, 18-03 | `resolveSplit()` is the single resolver used by every settlement call site | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` shows `[x]` / Complete |
| SETTLE-11c | 18-01, 18-02, 18-03, 18-04 | Split changes are effective-dated; already-settled transactions retain the percentage in effect at settlement time | ✓ SATISFIED | Code evidence unchanged. **Doc-sync gap closed:** `.planning/REQUIREMENTS.md` line 22 and line 85 now both show `[x]`/"Complete", matching all 4 phase-18 SUMMARY.md claims. |
| SETTLE-11d | 18-01 | Runtime shape validation + `Number.isFinite()` guard in `settle()` rejects NaN-corrupted config before a wallet mutation | ✓ SATISFIED | Unchanged; `REQUIREMENTS.md` shows `[x]` / Complete |

No orphaned requirement IDs — all 4 (SETTLE-11a/b/c/d) declared in phase-18 plans and present in `.planning/REQUIREMENTS.md`'s Settlement Flexibility section, all now marked Complete in both the checklist and the traceability table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any phase-18 core files, `ci.yml`, or `package.json` changes scanned this pass | — | — |
| `.planning/todos/pending/2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md` | frontmatter `files:` | Lists `backend/src/notifications-client/notifications-client.module.ts`, but the actual path is `backend/src/modules/notifications-client/notifications-client.module.ts` | ℹ️ Info | Minor documentation inaccuracy in a deferred follow-up todo; does not affect Phase 18's goal or its gap closure — flagged for whoever picks up that todo next |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| New isolated e2e script exists and targets the correct file | `cd backend && npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests` | 1 suite / 2 tests, both `skipped` (no `DATABASE_URL` in this local environment) — confirms correct `testPathPattern` match and correct skip-gate behavior, matching the file's documented convention | ✓ PASS |
| CI's `DATABASE_URL` does not trigger the test's skip gate | Manual trace: `ci.yml:37` value vs. skip conditions in `e2e-settlement-split-tier-audit-trail.e2e-spec.ts:20-25` | `postgresql://iseyaa:iseyaa_test@localhost:5432/iseyaa_test` does not match `!dbUrl`, `localhost:54321`, `placeholder`, or `''` — test WILL execute in CI | ✓ PASS |
| Circular-dependency claim is real and pre-existing | `cd backend && npm run test:e2e:tours -- --forceExit --passWithNoTests` | Fails with `A circular dependency has been detected inside NotificationsClientModule...` on both `wallet-invariant` and `e2e-tour-booking` suites — confirms the claim independently | ✓ PASS (confirms claim) |
| `NotificationsClientModule` predates Phase 18 | `git log --oneline -3 -- src/modules/notifications-client/notifications-client.module.ts` | Last touched by Phase 17 commits (`74e7aef`, `8e70aab`) only | ✓ PASS |
| Full backend unit suite regression check | `cd backend && npm test -- --forceExit --passWithNoTests` | 54 suites, 644 tests, all passed | ✓ PASS |
| REQUIREMENTS.md SETTLE-11c doc-sync | Direct read of `.planning/REQUIREMENTS.md` lines 22, 85 | Both show `[x]` / "Complete" | ✓ PASS |

### Data-Flow Trace (Level 4)

Not applicable in the UI-rendering sense — backend-only settlement logic, unchanged from the initial pass. No hardcoded/static stub data found in the CI/package.json wiring changes either — the new CI step invokes the real jest e2e config against a live-provisioned Postgres service, not a mocked or static substitute.

### Human Verification Required

None. All items from the prior gap are concretely, non-ambiguously verifiable by static inspection (script/CI file contents) and local test execution (skip-gate behavior, circular-dependency reproduction, full regression suite) — no matters of subjective judgment remain. The only residual item (SUMMARY.md 18-04's note about a manual SUPER_ADMIN-vs-non-SUPER_ADMIN role-gating check against a running dev server) was already out of scope for the previous verification's gap and is not part of this re-verification's mandate; it does not block phase goal achievement given the guard logic is otherwise unit-tested and unchanged since the initial pass.

### Gaps Summary

No gaps remain. The single gap from the initial verification pass — the CR-01 real-database regression test being unreachable from any executable test command — is now closed: a dedicated, isolated npm script (`test:e2e:settlement-splits`) was added that runs only this test via raw `PrismaClient` (avoiding the unrelated, pre-existing `NotificationsClientModule` circular-dependency bug that breaks the other e2e suites), and that script is wired into `.github/workflows/ci.yml` as its own step, correctly sequenced after live Postgres provisioning and schema push. Independent verification in this pass confirmed: (1) the script correctly targets the intended file, (2) CI's `DATABASE_URL` will not trigger the test's skip gate, meaning the test actually executes in CI rather than being scheduled-and-skipped, (3) the circular-dependency bug is real, reproducible, and predates Phase 18 (Phase 17 origin), correctly justifying its exclusion from this phase's scope and its documentation as separate follow-up work, and (4) no regressions were introduced — the full 644-test backend suite still passes. The secondary documentation-sync gap (`REQUIREMENTS.md`'s stale `SETTLE-11c` status) is also confirmed closed.

Phase 18's goal — every settlement call site resolving its split percentage from one validated, effective-dated source instead of duplicated inline reads — is fully achieved and now has durable, CI-enforced regression protection against its most subtle failure mode (the real-Postgres unique-constraint interaction that unit-level mocks cannot catch).

---

_Verified: 2026-07-19T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
