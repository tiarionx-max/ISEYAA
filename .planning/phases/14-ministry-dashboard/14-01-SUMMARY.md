---
phase: 14-ministry-dashboard
plan: 01
subsystem: database
tags: [prisma, postgresql, rbac, schema-migration]

# Dependency graph
requires: []
provides:
  - "MINISTRY_VIEWER UserRole value in schema.prisma, backend/src/common/enums/user-role.enum.ts, and shared/src/types/index.ts"
  - "visitor_logs table (VisitorLog Prisma model) with zero PII columns, queryable via prisma.visitorLog"
  - "VisitorSourceType enum (EVENT, STAY, TOUR)"
  - "LGA.visitorLogs[] back-relation"
affects: [14-ministry-dashboard, ministry-dashboard-api, ministry-dashboard-web]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-authored additive Prisma migrations for enum extension (ALTER TYPE ... ADD VALUE) to avoid Prisma's drop/recreate diff behavior on enums referenced by FKs — same convention as Phase 9's TOUR_GUIDE migration"
    - "Polymorphic sourceId column (no FK enforced) for cross-module references, mirroring ShadowSettlementComparison's precedent"

key-files:
  created:
    - backend/prisma/migrations/20260718000000_phase14_ministry_dashboard/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/common/enums/user-role.enum.ts
    - shared/src/types/index.ts

key-decisions:
  - "VisitorLog column list deliberately excludes every PII field (BVN/NIN/phone/name/email) — structural half of MIN-07's zero-row-level-PII guarantee, not query-time filtering"
  - "MINISTRY_VIEWER excluded from REGISTERABLE_ROLES — Ministry accounts are admin-provisioned, not self-registered, matching LGA_ADMIN/STATE_ADMIN/SUPER_ADMIN/TOUR_GUIDE"

patterns-established:
  - "Pattern: additive UserRole enum extension via hand-authored migration.sql (ALTER TYPE ADD VALUE first, before any DDL using the new value)"

requirements-completed: [MIN-01, MIN-07]

# Metrics
duration: ~30min
completed: 2026-07-18
---

# Phase 14 Plan 01: Ministry Dashboard Schema Foundation Summary

**MINISTRY_VIEWER role value synced across three enum locations and a new zero-PII `visitor_logs` table, migrated onto the dev Postgres database — the schema foundation every later Phase 14 plan depends on.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `MINISTRY_VIEWER` added as the new last member of `UserRole` in `schema.prisma`, `backend/src/common/enums/user-role.enum.ts`, and `shared/src/types/index.ts`, with identical string values across all three — legacy values unchanged and unreordered
- `VisitorLog` Prisma model + `VisitorSourceType` enum created with the exact D-07 column list (lgaId, purpose, sourceType, sourceId, visitedAt, userRole, createdAt) — zero PII columns
- Hand-authored additive migration applied to the dev database (`iseyaa_dev`) — `prisma.visitorLog` is now a live Prisma Client delegate
- Both `backend` and `shared` workspaces type-check cleanly (`tsc --noEmit` exits 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema.prisma — MINISTRY_VIEWER enum value + VisitorLog model + LGA back-relation** - `348d65a` (feat)
2. **Task 2: [BLOCKING] Hand-author and apply the additive migration** - `7d8edbe` (feat)
3. **Task 3: Sync MINISTRY_VIEWER across the TypeScript UserRole enum and the shared client-facing enum** - `e08e4cd` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `MINISTRY_VIEWER` to `UserRole`; added `VisitorSourceType` enum, `VisitorLog` model, `LGA.visitorLogs[]` relation
- `backend/prisma/migrations/20260718000000_phase14_ministry_dashboard/migration.sql` - Hand-authored additive migration (ALTER TYPE, CREATE TYPE, CREATE TABLE, indexes, FK)
- `backend/src/common/enums/user-role.enum.ts` - Added `MINISTRY_VIEWER = 'MINISTRY_VIEWER'`; `REGISTERABLE_ROLES` left unchanged
- `shared/src/types/index.ts` - Added `MINISTRY_VIEWER = 'MINISTRY_VIEWER'` to the client-facing `UserRole` enum

## Decisions Made
- Followed Phase 9's exact hand-authored additive-migration convention (`ALTER TYPE ... ADD VALUE` before any DDL referencing the new value) rather than `prisma migrate dev`'s auto-diff, since the diff algorithm would otherwise drop and recreate `UserRole`, breaking every FK typed as `UserRole`
- `VisitorLog.sourceId` has no FK enforced (polymorphic across `Ticket`/`Booking`/`TourBooking`), matching `ShadowSettlementComparison`'s precedent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local dev environment had no working Node/Prisma toolchain in the worktree**
- **Found during:** Task 1 (running `npx prisma validate` for the first time)
- **Issue:** The worktree had no `node_modules` at all (fresh git worktree checkout, `node_modules` is gitignored), and no `.env` file, so `npx prisma` fell back to fetching a mismatched major version (7.8.0) from the registry, which rejects the schema's legacy `datasource.url`/`directUrl` syntax used by the pinned `prisma@^5.11.0`. Additionally, `DATABASE_URL`/`DIRECT_URL` were not available to the Prisma CLI.
- **Fix:** Copied the main repo's root `.env` into the worktree root and into `backend/prisma/.env` (both gitignored, not committed — matches existing `.gitignore` `.env`/`.env.*` patterns). Created Windows directory junctions from the worktree's `node_modules`, `backend/node_modules`, `web/node_modules`, `mobile/node_modules`, and `shared/node_modules` to the main repo's corresponding directories so the correct pinned dependency versions (including `prisma@5.22.0` satisfying `^5.11.0`) resolve. When `prisma generate` then hit a Windows file-lock (`EPERM`) on the shared `backend/node_modules/.prisma/client/query_engine-windows.dll.node` because the main repo's live `nest start --watch` / `node dist/main` processes had it open, replaced the `backend/node_modules` junction with a private `robocopy`'d copy (181MB, 6324 files) local to the worktree, so Prisma Client generation didn't require killing or disrupting the user's running dev/prod backend processes.
- **Files modified:** No tracked files — only local, gitignored `.env` files and `node_modules` directory structures (junctions + one private copy) inside the worktree. Verified `git status --short` showed no unintended tracked changes before each commit; one incidental `package-lock.json` change from an earlier failed auto-install attempt was discarded via `git checkout -- package-lock.json`.
- **Verification:** `npx prisma validate`, `npx prisma migrate status`, and `npx tsc --noEmit -p tsconfig.build.json` all passed cleanly after the fix.
- **Committed in:** Not committed (environment-local, gitignored — no tracked files affected).

---

**Total deviations:** 1 auto-fixed (1 blocking, environment setup only — no source code deviation)
**Impact on plan:** Purely a local worktree tooling gap; zero impact on the committed schema/migration/enum content, which matches the plan's `<interfaces>` spec exactly.

## Issues Encountered
- Windows file-lock (`EPERM`) on the shared Prisma query engine DLL, caused by the main repo's live backend processes (`nest start --watch` PID 12620, `node dist/main` PID 18776) holding the file open — resolved by generating the Prisma Client into a private, worktree-local copy of `backend/node_modules` instead of the shared junction, avoiding any need to stop the user's running processes.

## User Setup Required

None - no external service configuration required. (The `visitor_logs` table was migrated onto the local dev Postgres database already running via Docker Compose; no manual database setup needed.)

## Next Phase Readiness
- `MINISTRY_VIEWER` role and `prisma.visitorLog` delegate are now available for every subsequent Phase 14 plan (Ministry auth guard, dashboard KPIs, visitor-log write paths, CSV/PDF export, allowlist test in 14-06)
- No blockers identified

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*
