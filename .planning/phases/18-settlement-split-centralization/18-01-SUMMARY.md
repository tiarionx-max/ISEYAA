---
phase: 18-settlement-split-centralization
plan: 01
subsystem: payments
tags: [prisma, postgresql, settlement, nestjs, jest, tdd]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation
    provides: SettlementService (settle(), resolveMinistryWallet(), atomic N-way wallet fan-out)
provides:
  - SettlementSplitTier Prisma model + applied migration (settlement_split_tiers table)
  - SettlementService.resolveSplit(module, amountNgn) — always-fresh resolver mirroring resolveMinistryWallet()
  - settle()'s Number.isFinite() NaN/Infinity recipient-amount guard (SETTLE-11d)
  - backend/scripts/migrate-settlement-split-tiers.ts — idempotent PlatformConfig -> SettlementSplitTier backfill
  - 6 backfilled SettlementSplitTier default-tier rows in the dev DB (transport/delivery/marketplace/events/stays/studio)
affects: [18-02-transport-delivery-cutover, 18-03-remaining-modules-cutover, 18-04-admin-crud, 19-settlement-dispute-adjustment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "always-fresh config resolver (resolveSplit mirrors resolveMinistryWallet — no caching, throws loud on missing/malformed rows)"
    - "settle() never internally re-resolves split config, keeping settled Transaction rows immutable by construction (SETTLE-11c)"
    - "one-off backfill scripts: raw PrismaClient (no NestJS DI), require.main === module runner guard, validate-all-before-write-any"

key-files:
  created:
    - backend/prisma/migrations/20260719152059_add_settlement_split_tier/migration.sql
    - backend/scripts/migrate-settlement-split-tiers.ts
    - backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/common/services/settlement.service.ts
    - backend/src/common/services/__tests__/settlement.service.spec.ts
    - backend/jest.config.js

key-decisions:
  - "Local dev environment had no reachable Postgres (no .env, no running Docker daemon) — started the machine's pre-installed local PostgreSQL 16 Windows service directly via pg_ctl and reset it to match this branch's migration history before generating the new migration; this DB is disposable local dev data, not shared/production."
  - "Rule 3 fix: jest.config.js's rootDir='src' silently excluded backend/scripts/ from test discovery entirely (0 files scanned outside src/) — added roots: ['<rootDir>', '<rootDir>/../scripts'] so the plan's specified scripts/__tests__/*.spec.ts location is actually discoverable by `npm run test`."
  - "Rule 1 fix: rounded computeModuleSplit()'s derived earnerPct to 10 decimal places — sequential float subtraction (1 - 0.05 - 0.15) landed on 0.7999999999999999 instead of 0.8 due to IEEE-754 drift, which would have persisted verbatim into the Decimal column; 10dp is far finer than the engine's ±0.02 kobo drift tolerance."

requirements-completed: [SETTLE-11a, SETTLE-11b, SETTLE-11d]

# Metrics
duration: 20min
completed: 2026-07-19
---

# Phase 18 Plan 01: Settlement Split Centralization — Foundation Summary

**Added the `SettlementSplitTier` Prisma model + migration, `SettlementService.resolveSplit()` (always-fresh resolver), a `Number.isFinite()` NaN/Infinity guard in `settle()`, and an idempotent backfill script that migrated all 6 modules' live `PlatformConfig` percentages into the new table.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-19T15:15:00Z (approx, worktree setup)
- **Completed:** 2026-07-19T15:31:39Z
- **Tasks:** 3/3 completed
- **Files modified:** 7 (2 schema/migration, 2 service+spec, 1 jest config, 2 script+spec)

## Accomplishments
- `SettlementSplitTier` model (Decimal 0-1 fraction split percentages, `@@unique([module, tierName])`, `@@index([module, isActive])`) added to `schema.prisma`, migration generated and applied against a local dev Postgres instance
- `SettlementService.resolveSplit(module, amountNgn)` added — queries the active `default` tier fresh on every call (never cached), throws a plain `Error` on a missing row or on any non-finite percentage field
- `settle()`'s existing recipient-amount validation loop now rejects `NaN`/`Infinity` amounts (SETTLE-11d) as a sibling check placed before the existing negative-amount guard — confirmed `settle()` itself never calls `resolveSplit()` internally, so already-persisted `Transaction` rows are immutable by construction (SETTLE-11c), proven by a dedicated regression test (Scenario L)
- `backend/scripts/migrate-settlement-split-tiers.ts` backfilled all 6 modules (`transport`, `delivery`, `marketplace`, `events`, `stays`, `studio`) into the dev DB, with D-03's whole-number-to-fraction conversion (Transport/Delivery) applied exactly once, D-02's no-levy-key handling (Marketplace), and D-01's forced `platformPct: null` / `earnerPct: 0` (Studio) all verified against the live table

## Task Commits

Each task was committed atomically (Tasks 2 and 3 used the TDD RED -> GREEN cycle):

1. **Task 1: Add SettlementSplitTier Prisma model + generate migration** - `01f00db` (feat)
2. **Task 2 (RED): failing tests for resolveSplit() + NaN guard + immutability** - `567ae14` (test)
3. **Task 2 (GREEN): implement resolveSplit() + NaN/Infinity recipient guard** - `5dae3d8` (feat)
4. **Task 3 (RED): failing tests for settlement split tier backfill script** - `c7ac745` (test, includes jest.config.js Rule 3 fix)
5. **Task 3 (GREEN): backfill SettlementSplitTier rows from live PlatformConfig** - `dd89669` (feat, includes Rule 1 float-precision fix)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `SettlementSplitTier` model
- `backend/prisma/migrations/20260719152059_add_settlement_split_tier/migration.sql` - Generated migration, applied to dev DB
- `backend/src/common/services/settlement.service.ts` - Added `resolveSplit()`; added NaN/Infinity guard to `settle()`'s recipient loop
- `backend/src/common/services/__tests__/settlement.service.spec.ts` - Added `resolveSplit()` success/missing/malformed tests, Scenario K (NaN/Infinity guard), Scenario L (SETTLE-11c immutability regression)
- `backend/scripts/migrate-settlement-split-tiers.ts` - New one-off idempotent backfill script
- `backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts` - New spec covering D-01/D-02/D-03 conversion rules, idempotency, and abort-before-any-write
- `backend/jest.config.js` - Added `roots` config so `scripts/__tests__/` is discoverable by Jest (previously silently excluded by `rootDir: 'src'`)

## Decisions Made
- Started the machine's local PostgreSQL 16 service directly (via `pg_ctl`, since the Windows service required admin rights this session didn't have) because no `.env` existed in the worktree and Docker Desktop's daemon wasn't running — this is disposable local dev data scoped to this machine, reset via `prisma migrate reset --force` to align with the branch's existing 13 migrations before generating the new one.
- Rounded `computeModuleSplit()`'s derived `earnerPct` to 10 decimal places to eliminate IEEE-754 subtraction drift (`1 - 0.05 - 0.15` otherwise persists as `0.7999999999999999`) before it reaches the Decimal column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jest.config.js excluded `backend/scripts/` from test discovery entirely**
- **Found during:** Task 3 (writing the RED test at `backend/scripts/__tests__/migrate-settlement-split-tiers.spec.ts`, as the plan's frontmatter specifies)
- **Issue:** `jest.config.js` sets `rootDir: 'src'` with no `roots` override, so Jest's default `roots: ['<rootDir>']` only ever scans `backend/src/`. A probe test placed at `backend/scripts/__tests__/_probe.spec.ts` was confirmed invisible to `npm run test -- <pattern>` ("233 files checked" in `src`, 0 matches) — this would have made the plan's specified test file location permanently undiscoverable, blocking `npm run test -- migrate-settlement-split-tiers` from ever running.
- **Fix:** Added `roots: ['<rootDir>', '<rootDir>/../scripts']` to `jest.config.js`.
- **Files modified:** `backend/jest.config.js`
- **Verification:** Probe test confirmed discovered post-fix; `npm run test -- migrate-settlement-split-tiers` passes (6/6); full suite re-run confirmed no new duplicate/broken discovery (634/634 passing, up from 628 pre-Task-3).
- **Committed in:** `c7ac745` (Task 3 RED commit)

**2. [Rule 1 - Bug] Float-precision drift in computed `earnerPct`**
- **Found during:** Task 3, after running the script against the dev DB and inspecting stored rows
- **Issue:** `delivery`'s `earnerPct` (`1 - 0.05 - 0.15`) computed to `0.7999999999999999` in JS due to sequential floating-point subtraction landing on an adjacent representable double, and this persisted verbatim into the `Decimal` column instead of the intended `0.8`.
- **Fix:** Rounded the general-branch `earnerPct` computation to 10 decimal places (`Math.round(rawEarnerPct * 1e10) / 1e10`) — far finer than the engine's existing ±0.02 kobo drift tolerance, so no precision loss at any currency-relevant scale.
- **Files modified:** `backend/scripts/migrate-settlement-split-tiers.ts`
- **Verification:** Re-ran the script against the dev DB after `TRUNCATE settlement_split_tiers` — `delivery.earnerPct` now stores exactly `0.800000000000000000000000000000`; all 6 test cases and the full backend suite still green.
- **Committed in:** `dd89669` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking test-infra gap, 1 float-precision bug)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria to be verifiable/correct. No scope creep — no call sites, admin CRUD, or additional modules touched.

## Issues Encountered
- No `.env` file existed in this worktree and no reachable Postgres instance (no Docker daemon running) — resolved by starting the machine's existing local PostgreSQL 16 installation directly and creating a local-only `backend/.env` (gitignored, matches the repo's own `.env.example` local-dev credentials) pointing `DATABASE_URL`/`DIRECT_URL` at it. The pre-existing local DB's migration history predated 7 of this branch's 13 migrations, so `prisma migrate reset --force` was run first (safe — disposable local dev data, not shared/production) before generating the new `add_settlement_split_tier` migration.

## User Setup Required

None - no external service configuration required. (Note: this plan's dev-DB work used a local-machine PostgreSQL instance; the `backend/.env` created for this session is gitignored and local-only, matching the repo's `.env.example` pattern — no secrets were introduced.)

## Next Phase Readiness
- `resolveSplit()` and the `SettlementSplitTier` table are now live and ready for `18-02-PLAN.md` (Transport/Delivery call-site cutover) and `18-03-PLAN.md` (Marketplace/Events/Stays/Studio call-site cutover) to consume directly.
- `settle()`'s immutability guarantee (SETTLE-11c) is regression-tested — downstream plans can safely update `SettlementSplitTier` rows without needing to re-verify already-settled `Transaction` rows are unaffected.
- No blockers. One open note for whoever runs this phase's plans against a fresh environment: this worktree's local dev DB access relied on a pre-existing local PostgreSQL 16 Windows install on this specific machine, not the project's documented Docker Compose flow — future plans in this phase should confirm their own execution environment has DB connectivity (Docker, a `.env` pointing at a reachable instance, or this same local fallback) before assuming `prisma migrate dev`/`ts-node` script runs will work out of the box.

## Self-Check: PASSED

All 7 claimed files found on disk; all 5 claimed commit hashes (`01f00db`, `567ae14`, `5dae3d8`, `c7ac745`, `dd89669`) found in git history.

---
*Phase: 18-settlement-split-centralization*
*Completed: 2026-07-19*
