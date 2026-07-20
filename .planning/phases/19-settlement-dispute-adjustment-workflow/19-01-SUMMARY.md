---
phase: 19-settlement-dispute-adjustment-workflow
plan: 01
subsystem: database
tags: [prisma, postgres, migration, settlement, schema]

# Dependency graph
requires:
  - phase: 18-settlement-split-centralization
    provides: SettlementSplitTier model and resolveSplit() convention this dispute model's money/decimal column style follows
provides:
  - SettlementDispute Prisma model with 5-value status state machine (OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED)
  - User.settlementDisputesRaised inverse relation
  - Live `settlement_disputes` table in the dev database via migration 20260720022922_add_settlement_dispute
  - Regenerated Prisma Client exposing `prisma.settlementDispute`
affects: [19-02-settlement-adjust-service, 19-03-settlement-disputes-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AdminReviewFlag-style plain-String status field (no Prisma enum) for dispute state machines — mirrors AdminReviewFlag.status exactly, application-layer state-machine guards belong in the service layer, not a DB CHECK constraint"
    - "assignedTo as a plain nullable String userId (not an FK) — matches AdminReviewFlag's existing reviewer-assignment convention"

key-files:
  created:
    - backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql
  modified:
    - backend/prisma/schema.prisma

key-decisions:
  - "No @@unique on settlementReference — a settlement can accumulate multiple historical (terminal) disputes over time; uniqueness-of-one-active-dispute is enforced in application code in 19-03, not the schema (mirrors SettlementSplitTier's partial-unique-index rationale, but here it's app-layer since a dispute row itself has no 'active' boolean)"
  - "Decimal (not Float) for requestedAdjustmentNgn — matches SettlementSplitTier's money-adjacent column convention"
  - "No Prisma enum for status — matches AdminReviewFlag's plain-String precedent exactly, not a new pattern"

patterns-established:
  - "SettlementDispute extends the AdminReviewFlag state-machine precedent to a 5-value status set, adding BLOCKED for the compliance/clawback-policy case flagged in v2.1 research"

requirements-completed: [SETTLE-10a, SETTLE-10b]

# Metrics
duration: ~20min
completed: 2026-07-20
---

# Phase 19 Plan 01: Settlement Dispute Schema Foundation Summary

**Added the `SettlementDispute` Prisma model (5-value status state machine, FK to User via `raisedBy`, plain-string `assignedTo` matching the `AdminReviewFlag` convention) and applied it as a live migration — the schema every other Phase 19 plan depends on.**

## Performance

- **Duration:** ~20 min (active work; elapsed wall-clock time included an unrelated harness stall)
- **Tasks:** 2 completed
- **Files modified:** 2 (schema.prisma, new migration.sql)

## Accomplishments
- `SettlementDispute` model added to `backend/prisma/schema.prisma`, extending the existing `AdminReviewFlag` state-machine precedent (plain `status` String, `assignedTo`/`resolution`/`resolvedAt` shape, `@@map(snake_case)`) to a 5-value status set (`OPEN | IN_REVIEW | RESOLVED | DISMISSED | BLOCKED`)
- `User.settlementDisputesRaised` inverse relation array added, Prisma correctly infers the relation unambiguously (single FK field, no `@relation` name needed)
- Migration `20260720022922_add_settlement_dispute` generated via `prisma migrate dev` and applied to the dev database — no hand-written SQL
- Two prior pending migrations from Phase 18 (`add_settlement_split_tier`, `settlement_split_tier_partial_unique_active`) were also applied as a side effect of running `migrate dev` against a dev database that had fallen behind — this is expected `migrate dev` behavior (it applies all pending migrations before creating a new one), not new work from this plan
- Prisma Client regenerated; `prisma.settlementDispute` delegate confirmed present in `node_modules/.prisma/client/index.d.ts`
- Full backend test suite (54 suites / 644 tests) run green after schema change, confirming no regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SettlementDispute Prisma model + User relation** - `f0ff0de` (feat)
2. **Task 2: [BLOCKING] Verify migration applied cleanly and Prisma Client is live** - verification-only, no code changes; folded into Task 1's committed state (see Verification below) — `prisma migrate status` confirms "Database schema is up to date!" with zero pending migrations against commit `f0ff0de`

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `SettlementDispute` model + `User.settlementDisputesRaised` relation array entry
- `backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql` - `CREATE TABLE "settlement_disputes"` + FK to `users` + indexes on `status` and `settlementReference`

## Decisions Made
- No `@@unique` on `settlementReference` per plan spec — a settlement can have zero or one *active* dispute but multiple historical/terminal ones over time; single-active-dispute enforcement deferred to `19-03-PLAN.md` application code
- Plain `String` status (no Prisma enum), `Decimal` for money, `assignedTo` as bare `String?` — all match existing `AdminReviewFlag`/`SettlementSplitTier` precedents exactly, as directed by the plan

## Deviations from Plan

None - plan executed exactly as written. Two out-of-scope pending migrations (Phase 18's `add_settlement_split_tier` and its partial-unique-index follow-up) were applied automatically by `prisma migrate dev` because the local dev database had not yet been brought current — this is standard Prisma behavior, not scope creep, and those migrations were already committed to the repo by Phase 18's plans; this plan did not author or modify them.

## Issues Encountered
- Local dev Postgres/Redis containers (`iseyaa_postgres`, `iseyaa_redis`) and Docker Desktop itself were not running at plan start in this worktree; started Docker Desktop and the existing (previously-created, stopped) containers rather than creating new ones, to avoid diverging from the shared dev database state other phases/plans rely on.
- Prisma CLI requires a `.env` alongside `backend/prisma/schema.prisma` (or in `backend/`) to resolve `DATABASE_URL`/`DIRECT_URL` for `migrate`/`validate`/`db execute` — the app itself loads `.env` from the repo root via an explicit `envFilePath` in `ConfigModule.forRoot()`, but the Prisma CLI does not follow that same path resolution. Copied the existing root `.env` (already gitignored, not committed) to both the worktree root and `backend/` so local CLI commands could resolve datasource env vars; this is local dev tooling only, no code or schema behavior changed.
- `backend/prisma/migrations/migration_lock.toml` showed a spurious "modified" status after running migrations due to line-ending normalization only (no content diff) — reverted with `git checkout --` to keep the commit scoped to actual schema/migration changes.
- No `node_modules` existed in this worktree at start; ran `npm ci --workspace=backend --include-workspace-root` to install dependencies (root `package.json` pins `prisma@^7.8.0` as a devDependency, but `backend/package.json` correctly pins `prisma@^5.11.0`/resolved `5.22.0` — the nested `backend/node_modules/.bin/prisma` binary was used throughout, not the root-hoisted 7.8.0, to match the project's actual Prisma major version).

## User Setup Required

None - no external service configuration required. This plan touches only the Prisma schema and a local dev-database migration; no runtime application code was added.

## Next Phase Readiness
- `19-02-PLAN.md` (SettlementService.adjust()) can proceed independently — it does not reference `SettlementDispute`.
- `19-03-PLAN.md` (SettlementDisputesService) can now proceed — `prisma.settlementDispute.*` is live and type-checks against the regenerated client.
- No blockers identified.

---
*Phase: 19-settlement-dispute-adjustment-workflow*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: backend/prisma/migrations/20260720022922_add_settlement_dispute/migration.sql
- FOUND: .planning/phases/19-settlement-dispute-adjustment-workflow/19-01-SUMMARY.md
- FOUND: commit f0ff0de
