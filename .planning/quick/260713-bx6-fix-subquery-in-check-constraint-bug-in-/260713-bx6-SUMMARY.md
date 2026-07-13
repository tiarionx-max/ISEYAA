---
quick_id: 260713-bx6
status: complete
---

# Quick Task 260713-bx6: Fix subquery-in-CHECK-constraint bug in phase9 tour_packages migration

**Tasks:** 2/2 (plus 2 auto-fixed Rule 3 blocking deviations)
**Duration:** ~10 min

**Commits:**
- `cdd15b5`: fix(260713-bx6): replace subquery-in-CHECK with IMMUTABLE function
- `00c1fba`: fix(260713-bx6): remove dead broken CHECK statement from original phase9 migration

## What was fixed

The root cause was a `CHECK` constraint in `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` containing an inline correlated subquery (`SELECT SUM(...) FROM jsonb_array_elements(...)`), which PostgreSQL unconditionally rejects (`0A000`). Since DDL migrations run in a single transaction, this rolled back the *entire* migration on every apply attempt — meaning none of the 6 Phase 9 tables (`tour_guides`, `tour_packages`, `tour_bookings`, `itineraries`, `reviews`, `admin_review_flags`) had ever actually been created anywhere.

Fix: created a new migration `backend/prisma/migrations/20260713140000_fix_tour_packages_split_sum_check/migration.sql` with an `IMMUTABLE SQL` function `check_settlement_split_sum(jsonb)` that encapsulates the same sum logic, called from the `CHECK` expression instead of an inline subquery.

**Deviation (Rule 3, blocking):** Adding the new migration alone was insufficient — `prisma migrate deploy` always re-executes a rolled-back migration from its file, so the original broken statement kept failing identically on retry, permanently blocking the chain. Removed the dead, never-successfully-applied `CHECK` statement from the original `20260623120000_phase9_tour_packages/migration.sql` (safe: `_prisma_migrations` confirmed `finished_at IS NULL` / `applied_steps_count = 0` for every prior attempt — it never committed anywhere).

## Verified

- `prisma migrate deploy` applies both migrations cleanly against local `iseyaa_postgres` (localhost:5432/iseyaa_dev)
- All 6 Phase 9 tables exist
- `check_settlement_split_sum` returns `f` for 110%, `t` for 100%, `t` for NULL
- Full backend `npx jest`: 35/35 suites, 412/412 tests passing (after regenerating a stale Prisma Client — also a Rule 3 auto-fix)
- `schema.prisma` untouched, as required

## Note on STATE.md/ROADMAP.md

Per constraints, the executor did not commit `SUMMARY.md`/`STATE.md`/`ROADMAP.md`. It briefly ran the generic `gsd-sdk query state.advance-plan` / `state.update-progress` commands, which incorrectly mutated Phase 8's plan-sequence counters (unrelated to this quick task — those commands are meant for phase-plan execution, not quick tasks). It reverted `.planning/STATE.md` via `git checkout -- .planning/STATE.md` before finishing, so it was returned to its original, un-corrupted state. The orchestrator handled STATE.md updates for quick-task completion separately.

## Orchestrator note (added post-merge)

This SUMMARY.md was reconstructed from the executor agent's return message after the original uncommitted file was lost during worktree removal (the orchestrator removed the worktree without running the pre-removal SUMMARY.md rescue step). Content is a faithful reproduction of the executor's report; no new information added.
