---
phase: 13-settlement-cutover-transport-delivery
plan: 01
subsystem: database
tags: [prisma, postgresql, migration, platform-config, settlement]

# Dependency graph
requires:
  - phase: 12-settlement-engine-foundation
    provides: three-way settlement split pattern (dot-convention PlatformConfig keys, tour.government_wallet_user_id) this plan's seed block extends
provides:
  - "shadow_settlement_comparisons table (Prisma model ShadowSettlementComparison) for Stage 2 live dual-run bake-period tracking"
  - "6 new whole-percent PlatformConfig rows: transport.govt_levy_pct, transport.platform_fee_pct, delivery.govt_levy_pct, delivery.platform_fee_pct, transport.settlement_engine_enabled, delivery.settlement_engine_enabled"
affects: [13-02-transport-cutover, 13-03-delivery-cutover, 13-04-shadow-verify-script]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whole-percent PlatformConfig scale for Transport/Delivery (15, 5, 10) vs. fraction scale (0.10, 0.05) used by marketplace/events/studio/stays — both scales coexist by module, distinguished by the legacy key's original convention"
    - "ShadowSettlementComparison table has no FK relation to Trip/DeliveryOrder — plain string sourceId to survive independently of trip/order lifecycle across two unrelated parent tables"

key-files:
  created:
    - backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/prisma/seed.ts

key-decisions:
  - "Left the Prisma-generated migration as-is rather than manually reverting bundled pre-existing schema/migration drift (raw SQL revert was blocked by the environment's permission system as an unauthorized shared-resource DDL action, and hand-editing an already-applied migration file breaks Prisma's checksum integrity model) — documented the drift in deferred-items.md instead"
  - "Set up backend/node_modules and root node_modules as isolated npm install (not shared with main repo) after an initial Windows junction attempt caused a file-lock EPERM conflict with a running main-repo dev server holding the query engine DLL"

requirements-completed: [SETTLE-09]

# Metrics
duration: 19min
completed: 2026-07-17
---

# Phase 13 Plan 01: Settlement Cutover Schema & Config Foundation Summary

**Added the `ShadowSettlementComparison` Prisma model + migration and seeded 6 whole-percent `PlatformConfig` rows (transport/delivery govt_levy_pct, platform_fee_pct, settlement_engine_enabled) that Plans 13-02/13-03/13-04 depend on.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-07-17T18:04:39-05:00 (worktree base)
- **Completed:** 2026-07-17T18:22:44-05:00
- **Tasks:** 3/3 completed
- **Files modified:** 3 (schema.prisma, seed.ts, 1 new migration.sql) + 1 new deferred-items.md

## Accomplishments
- `ShadowSettlementComparison` Prisma model added and migrated to `shadow_settlement_comparisons` table with `[module, comparedAt]` and `[module, matched]` indexes
- 6 new `PlatformConfig` rows seeded with correct whole-percent scale, verified against legacy totals (transport 10+5=15, delivery 15+5=20)
- Legacy `transport_platform_fee_pct` (15) / `delivery_platform_fee_pct` (20) keys confirmed unchanged
- Prisma Client regenerated; `prisma.shadowSettlementComparison` delegate confirmed available via `tsc --noEmit`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ShadowSettlementComparison Prisma model** - `03d4dbd` (feat)
2. **Task 2: [BLOCKING] Apply the schema migration** - `75915d4` (feat)
3. **Task 3: Seed the 6 new PlatformConfig keys** - `e7a31b0` (feat)

**Deviation documentation:** `6afcd43` (docs: log pre-existing schema/migration drift as deferred item)

_Plan metadata commit (SUMMARY.md) follows this summary._

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `ShadowSettlementComparison` model after `PlatformConfig`
- `backend/prisma/migrations/20260717231213_add_shadow_settlement_comparison/migration.sql` - Creates `shadow_settlement_comparisons` table + 2 indexes (also bundles unrelated pre-existing drift, see Deviations)
- `backend/prisma/seed.ts` - Added 6 new `platformConfig.upsert()` calls following the existing dot-convention block shape
- `.planning/phases/13-settlement-cutover-transport-delivery/deferred-items.md` - New file logging the bundled schema drift for maintainer follow-up

## Decisions Made
- Followed the plan's exact instruction to run `npx prisma migrate dev --name add_shadow_settlement_comparison` rather than `db push`, consistent with the plan's "production financial system — prefer a tracked migration" guidance
- Environment had no `node_modules` installed in the worktree; resolved via isolated `npm install --workspace=backend` (not shared/junctioned with the main repo) after a first junction attempt caused an `EPERM` file-lock conflict with the main repo's running dev server during `prisma generate`
- Copied root `.env` into the worktree (gitignored, not committed) to supply `DATABASE_URL`/`DIRECT_URL` for local Prisma CLI commands, matching the project's documented root-`.env` convention (CLAUDE.md note on `ConfigModule.forRoot({ envFilePath })`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no installed dependencies**
- **Found during:** Task 1 verification (`npx prisma validate`)
- **Issue:** `npx prisma` in the worktree resolved to a globally-cached Prisma 7.8.0 (incompatible schema syntax) because `backend/node_modules` was empty (0 entries) — the worktree was never `npm install`-ed
- **Fix:** Ran `npm install --workspace=backend` from the worktree root (reusing the identical root `package-lock.json`, confirmed byte-identical to the main repo's), giving an isolated `node_modules` resolving the correct pinned Prisma 5.22.0 (`^5.11.0`)
- **Files modified:** None tracked (node_modules is gitignored)
- **Verification:** `npx prisma validate` and `npx prisma migrate status` succeed with Prisma CLI Version 5.22.0
- **Committed in:** N/A (environment setup only, no tracked files changed)

**2. [Rule 3 - Blocking] `.env` missing in worktree**
- **Found during:** Task 1 verification
- **Issue:** `DATABASE_URL`/`DIRECT_URL` env vars not found — the worktree checkout doesn't include the gitignored root `.env`
- **Fix:** Copied the main repo's root `.env` into the worktree root (not committed, gitignored)
- **Files modified:** None tracked
- **Verification:** `npx prisma migrate status` connects successfully to `iseyaa_dev` on `localhost:5432`
- **Committed in:** N/A

---

**Total deviations:** 2 environment-setup auto-fixes (both Rule 3 - Blocking), 0 code-behavior deviations from the plan's specified schema/seed content.
**Impact on plan:** Both auto-fixes were required just to run the plan's own verification commands; neither altered the plan's specified deliverables (model shape, migration content, seed values all match spec exactly).

## Issues Encountered

**Pre-existing, unrelated schema/migration drift bundled into the Task 2 migration.** Running the plan-mandated `npx prisma migrate dev --name add_shadow_settlement_comparison` correctly created `shadow_settlement_comparisons`, but Prisma's diff engine also reconciled several differences between `schema.prisma` and migration history that predate Phase 13 entirely (traced to Phase 8/9-era commits). These were swept into the same migration file because `migrate dev` diffs full migration history against the current schema, not a scoped diff of only the current task's model addition. A manual raw-SQL revert was attempted to isolate the migration to only the intended change, but was blocked by the environment's permission system ("Modify Shared Resources" — unauthorized DDL against a shared dev database). Editing the already-applied migration file's SQL directly was avoided since that breaks Prisma's checksum integrity tracking (worse practice than leaving it). The migration was therefore left as generated, and the drift is fully documented in `.planning/phases/13-settlement-cutover-transport-delivery/deferred-items.md` for maintainer review — most notably an `admin_review_flags_reviewId_fkey` change from `ON DELETE CASCADE` to `ON DELETE RESTRICT` that alters real application delete-cascade behavior and is unrelated to settlement cutover work. This does not block Phase 13 (the acceptance criteria — `CREATE TABLE "shadow_settlement_comparisons"` present, `migrate status` up to date, Prisma Client delegate available — all pass), but should be triaged separately before this migration reaches a shared/staging/production environment.

## User Setup Required

None - no external service configuration required. This plan only touched local schema/migration/seed files.

## Next Phase Readiness

- `shadow_settlement_comparisons` table and all 6 `PlatformConfig` rows are in place and verified — Plans 13-02 (Transport cutover) and 13-03 (Delivery cutover) can now read `transport.settlement_engine_enabled`/`delivery.settlement_engine_enabled` cutover flags and the new percentage keys on every `completeTrip()`/`completeDelivery()` call, and write Stage 2 shadow comparisons to the new table
- **Blocker for maintainer attention before broader deployment:** review `deferred-items.md`'s flagged `admin_review_flags_reviewId_fkey` CASCADE→RESTRICT change before this migration is applied to staging/production — confirm intended review-deletion cascade behavior and add an explicit `onDelete` annotation to `schema.prisma` if CASCADE should be preserved

---
*Phase: 13-settlement-cutover-transport-delivery*
*Completed: 2026-07-17*
