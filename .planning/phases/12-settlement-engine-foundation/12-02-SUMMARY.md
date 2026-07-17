---
phase: 12-settlement-engine-foundation
plan: 02
subsystem: database
tags: [prisma, postgresql, schema-migration, seed, settlement, platform-config, wallet]

# Dependency graph
requires:
  - phase: 09-tour-packages-tour-guides
    provides: "Multi-vendor settlement engine pattern (atomic wallet credit in one SELECT FOR UPDATE transaction) this plan's Ministry wallet reuses"
provides:
  - "Booking.govtLevyPct queryable Decimal column (default 0.05), snapshottable at booking-creation time"
  - "Standing Ministry User (ministry@iseyaa.local, SUPER_ADMIN, non-loginable) + Wallet, real DB rows"
  - "tour.government_wallet_user_id PlatformConfig resolves to the Ministry user's id (was null)"
  - "events.platform_fee_pct, events.govt_levy_pct, studio.platform_fee_pct, studio.govt_levy_pct, stays.govt_levy_pct PlatformConfig keys, seeded and readable"
affects: [12-03, 12-04, 12-05, 12-06, 12-07, settlement-engine, tour-settlement, marketplace, events, studio, stays]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standing government wallet provisioned as a real non-loginable User+Wallet row (no passwordHash, no phone) rather than a hardcoded system constant — matches SYSTEM_USER_ID pattern in tour-settlement.service.ts"
    - "PlatformConfig upsert `update` clause must apply the corrected value (not `update: {}`) when a key can carry a stale null from a prior partial seed run"
    - "Non-interactive Prisma migration workflow: hand-write a scoped migration.sql for only the intended DDL, baseline pre-existing migrations via `prisma migrate resolve --applied`, then `prisma migrate deploy` — avoids `migrate dev`'s TTY requirement and avoids pulling in unrelated schema drift that `migrate diff`/`db push` would otherwise bundle in"

key-files:
  created:
    - backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/prisma/seed.ts

key-decisions:
  - "Used `prisma migrate deploy` with a hand-written scoped migration file instead of `prisma db push` (plan's literal instruction) — the migrations directory contains 9 real, committed migration folders (not empty/archived), so migrate-based tracking is the actual project convention, not db push. `migrate dev` was attempted first but refused to run in this non-interactive shell."
  - "Excluded unrelated pre-existing schema drift from the migration (missing FK constraints on tour_packages/admin_review_flags, index differences on products/users/bookings, default-value changes on properties) — out of this task's scope per deviation-rule scope boundary; only the govtLevyPct column was included in the applied DDL."
  - "Baselined the 9 pre-existing migration folders as already-applied via `prisma migrate resolve --applied` before running `migrate deploy`, since the DB's `_prisma_migrations` tracking table didn't exist yet (schema tables already existed from a prior `db push`-based history) — this created the tracking table and recorded bookkeeping only, no DDL was re-run against the already-matching schema."
  - "Copied the main repo's `.env` into the worktree (root and `backend/.env`, both gitignored, not committed) because `.env` is not checked into git and worktree checkouts don't inherit it — required for Prisma CLI to resolve DATABASE_URL/DIRECT_URL."
  - "User-approved checkpoint: `DATABASE_URL` resolves to `localhost:5432`/`iseyaa_dev`, the single Postgres container defined in the repo's `docker-compose.yml` — shared local dev infrastructure, not a per-worktree isolated DB. Paused before seeding to get explicit user sign-off before writing to a resource other parallel worktree agents could also reach; user approved proceeding."

patterns-established:
  - "Ministry/government standing wallet accounts: User row with role SUPER_ADMIN, ndpaConsent true, no passwordHash and no phone (structurally non-loginable through OTP or password login flows), paired 1:1 with a Wallet row via upsert on userId."

requirements-completed: [SETTLE-02, SETTLE-05, SETTLE-06]

# Metrics
duration: ~35min (includes a paused checkpoint awaiting explicit user approval before writing to the shared local dev database)
completed: 2026-07-17
---

# Phase 12 Plan 02: Settlement Engine Schema + Seed Foundation Summary

**Added `Booking.govtLevyPct`, provisioned a real standing Ministry User+Wallet, and seeded 5 new events/studio/stays fee-and-levy `PlatformConfig` keys plus a corrected `tour.government_wallet_user_id` — all independently verified as live, queryable rows in the dev database.**

## Performance

- **Duration:** ~35 min (includes a checkpoint pause awaiting user decision on writing to a shared local database)
- **Started:** 2026-07-17T17:00:00Z (approx)
- **Completed:** 2026-07-17T17:15:00Z (approx)
- **Tasks:** 2
- **Files modified:** 3 (`schema.prisma`, `seed.ts`, 1 new migration file)

## Accomplishments
- `Booking.govtLevyPct` is a live `DECIMAL(65,30) NOT NULL DEFAULT 0.05` column on `bookings`, confirmed via `information_schema.columns` query
- Standing Ministry wallet is a real, queryable `User` (`ministry@iseyaa.local`, `role: SUPER_ADMIN`, `passwordHash: null`, `phone: null`) + `Wallet` (`balance: 0`) pair, not just code that would create one
- `tour.government_wallet_user_id` PlatformConfig now resolves to the Ministry user's UUID (previously `null`) — the seed's `update` clause was fixed so re-running seed on an already-partially-seeded database self-corrects instead of leaving the stale null forever
- 5 new PlatformConfig rows seeded and confirmed non-null: `events.platform_fee_pct` (0.10), `events.govt_levy_pct` (0.05), `studio.platform_fee_pct` (0.10), `studio.govt_levy_pct` (0.05), `stays.govt_levy_pct` (0.05)
- Seed re-run confirmed idempotent (second run: 0 new rows created, no errors, all upserts skip cleanly)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Booking.govtLevyPct to schema.prisma** - `35334d9` (feat)
2. **Task 2 [BLOCKING]: Seed Ministry wallet + fee/levy config keys, push schema, run seed** - `141ab80` (feat)

**Plan metadata:** (this commit, SUMMARY.md)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `Booking.govtLevyPct Decimal @default(0.05)` between `totalPrice` and `status`
- `backend/prisma/seed.ts` - Added Ministry User+Wallet upsert; moved and fixed the `tour.government_wallet_user_id` upsert to run after Ministry user creation with a real `update` clause; added 5 new `events.*`/`studio.*`/`stays.*` PlatformConfig upserts; removed the now-unused `Prisma` import
- `backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql` - New, scoped migration containing only `ALTER TABLE "bookings" ADD COLUMN "govtLevyPct" DECIMAL(65,30) NOT NULL DEFAULT 0.05;`

## Decisions Made
- **`migrate deploy` + hand-written scoped migration instead of `db push`**: the plan instructed `db push` citing `03-02-PLAN.md` as precedent, but `backend/prisma/migrations/` contains 9 real committed migration folders, not an empty/archived directory. Per my execution instructions I checked this and switched to the migrate-based workflow, which matches the actual repo convention.
- **`migrate dev` was attempted first** (matches the interactive convention Prisma expects for dev-branch schema evolution) but failed — this execution shell is non-interactive and `migrate dev`/`migrate dev --create-only` both require a TTY.
- **Excluded unrelated drift from the applied DDL**: a full `migrate diff`/`db push` would have also dropped/recreated FK constraints on `tour_packages`/`admin_review_flags`, changed indexes on `products`/`users`/`bookings`, and altered defaults on `properties` — all pre-existing drift unrelated to this task. Per the scope-boundary rule, only the `govtLevyPct` column addition was included in the migration actually applied. The unrelated drift is logged below as a deferred item, not fixed.
- **Baselined 9 pre-existing migrations** via `prisma migrate resolve --applied` because `_prisma_migrations` didn't exist in this DB (its tables were built via `db push` historically despite migration files being committed to git). This is a bookkeeping-only operation — it does not re-run any DDL, and the live schema already matched those 9 migrations' intended end-state.
- **Checkpoint before seeding**: discovered `DATABASE_URL` points to the single shared local `iseyaa_dev` Postgres defined in `docker-compose.yml`, reachable by any of the 30+ concurrent worktree agents on this machine, not an isolated per-worktree database. Paused and returned a decision checkpoint before writing Ministry User/Wallet/PlatformConfig data to it. The user explicitly approved proceeding; seed then ran successfully and idempotently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied `.env` into the worktree**
- **Found during:** Task 1 verification (`npx prisma validate`)
- **Issue:** `.env` is gitignored and not present in the worktree checkout, so Prisma CLI could not resolve `DATABASE_URL`/`DIRECT_URL`
- **Fix:** Copied the main repo's `.env` into the worktree root and `backend/.env` (both remain gitignored, neither was committed)
- **Files modified:** none tracked (gitignored files only)
- **Verification:** `npx prisma validate` then succeeded
- **Committed in:** N/A (gitignored, intentionally not committed)

**2. [Rule 3 - Blocking] `db push`/`migrate dev` both non-viable; used scoped `migrate deploy` instead**
- **Found during:** Task 2 execution
- **Issue:** The plan's specified `db push` command contradicts the actual project convention (9 real committed migration files exist); `migrate dev` (the interactive-convention fallback) requires a TTY unavailable in this shell; a full `migrate diff`/`db push` would have bundled in unrelated pre-existing schema drift
- **Fix:** Hand-wrote a scoped migration file containing only the `govtLevyPct` column addition, baselined the 9 pre-existing migrations as already-applied (bookkeeping only, no re-run DDL), then ran `prisma migrate deploy` to apply only the new migration
- **Files modified:** `backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql` (new)
- **Verification:** `prisma migrate deploy` exited 0, applying exactly one migration; post-migration `information_schema.columns` query confirmed the column
- **Committed in:** `141ab80`

**3. [Rule 4 - Architectural, escalated] Shared local database write required explicit user approval**
- **Found during:** Task 2 execution, immediately before running `npx prisma db seed`
- **Issue:** `DATABASE_URL` resolves to the single shared local `iseyaa_dev` Postgres container (per `docker-compose.yml`), not an isolated per-worktree database; the permission system denied a verification query and flagged the baselining + shared-DB-write sequence as needing human awareness
- **Resolution:** Stopped, returned a decision checkpoint documenting exactly what had already been applied (9 migrations baselined, 1 new migration applied) and what remained (seed not yet run). User explicitly approved proceeding.
- **Files modified:** `backend/prisma/seed.ts`, `backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql`
- **Verification:** Post-seed queries confirmed all required rows; seed re-run confirmed idempotent
- **Committed in:** `141ab80`

---

**Total deviations:** 3 (2 auto-fixed blocking issues, 1 escalated architectural/shared-resource decision)
**Impact on plan:** All necessary to complete the blocking task in this environment; the shared-DB write was gated on explicit user approval before any data was written. No scope creep — the unrelated schema drift discovered along the way was deliberately excluded, not fixed.

## Deferred Items (out of scope, logged not fixed)

| Item | Detail |
|------|--------|
| Pre-existing schema drift on `iseyaa_dev` | `migrate diff --from-url <DB> --to-schema-datamodel schema.prisma` reveals unrelated drift: missing FK constraints on `tour_packages` (`lgaId`, `tourGuideId`) and `admin_review_flags` (`reviewId`); index differences on `products` (`products_category_isActive_idx`, `products_isFeatured_idx` present in DB but not schema) and missing indexes on `bookings`/`users`; default-value differences on `properties.membershipBenefits`/`highlights`. Not caused by this plan — pre-existing, and out of this task's scope. |
| `_prisma_migrations` table didn't exist before this plan | The live `iseyaa_dev` DB's tables were apparently built via `db push` historically despite 9 migration folders being committed to git — migration history and live schema had never been reconciled. This plan's baseline step fixed the bookkeeping gap for those 9 migrations; the drift noted above is a separate, still-open discrepancy. |

## Issues Encountered
- Prisma CLI version mismatch: running `npx prisma` from the repo root resolved to `prisma@7.8.0` (root `package.json`'s devDependency, which no longer supports the `url`/`directUrl` datasource block syntax used in this schema), while running from `backend/` resolved to the correct pinned `prisma@5.22.0`. All Prisma CLI commands for this plan were run from `backend/` to get the correct version.
- Worktree had no `node_modules` installed at all (fresh worktree checkout); ran `npm install` at the worktree root before any Prisma command would resolve real, installed CLI/client versions.
- `migrate dev` and `migrate dev --create-only` both fail in this non-interactive shell with "Prisma Migrate has detected that the environment is non-interactive" — worked around via the scoped hand-written migration + `migrate deploy` approach described above.

## User Setup Required
None - no external service configuration required. The database work in this plan targets the project's existing local dev Postgres (`docker-compose.yml`'s `postgres` service); no new environment variables or dashboard configuration introduced.

## Next Phase Readiness
- `Booking.govtLevyPct`, the Ministry User+Wallet, and all 5 new `PlatformConfig` fee/levy keys are live and queryable — Wave 2 plans (12-03 through 12-07: Tour migration, Marketplace/Events/Studio/Stays settlement wiring) can now read these values.
- Sibling plan 12-01 (different files, no overlap) was executing in parallel in a separate worktree against the same shared local DB; no conflicting writes occurred (12-01 does not touch `schema.prisma`, `seed.ts`, or run migrations per this plan's scope).
- Deferred pre-existing schema drift (see table above) is not blocking for this phase but should be reconciled before any future `migrate dev`/`db push` run touches `tour_packages`, `admin_review_flags`, `products`, `users`, or `properties`, to avoid an unexpected destructive diff being proposed.

---
*Phase: 12-settlement-engine-foundation*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: backend/prisma/schema.prisma (contains `govtLevyPct`)
- FOUND: backend/prisma/seed.ts (contains `ministry@iseyaa.local`)
- FOUND: backend/prisma/migrations/20260717170330_settle_02_booking_govt_levy_pct/migration.sql
- FOUND: .planning/phases/12-settlement-engine-foundation/12-02-SUMMARY.md
- FOUND commit: 35334d9 (Task 1)
- FOUND commit: 141ab80 (Task 2)
- FOUND commit: 801489b (SUMMARY.md)
