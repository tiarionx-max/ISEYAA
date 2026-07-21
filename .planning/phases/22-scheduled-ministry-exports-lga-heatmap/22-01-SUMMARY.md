---
phase: 22-scheduled-ministry-exports-lga-heatmap
plan: 01
subsystem: database
tags: [prisma, postgres, sendgrid, migration, ministry-export]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard
    provides: MINISTRY_VIEWER role, CSV/PDF export services this plan's digest reuses
provides:
  - MinistryExportSubscription Prisma model + ExportCadence/ExportDeliveryStatus enums
  - Applied migration exposing prisma.ministryExportSubscription delegate
  - SendgridService.sendMinistryDigest() with base64 attachment support and no-swallow rejection contract
affects: [22-02-subscription-crud, 22-03-scheduler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-place-update subscription model (no audit-trail insert/deactivate) — contrasts with SettlementSplitTier's insert-new-row pattern"
    - "Dedicated SendGrid method per capability (sendMinistryDigest) rather than overloading sendEmail()'s signature"

key-files:
  created:
    - backend/prisma/migrations/20260721131842_add_ministry_export_subscription/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/common/services/sendgrid.service.ts
    - backend/src/common/services/__tests__/sendgrid.service.spec.ts

key-decisions:
  - "MinistryExportSubscription uses in-place field updates (no @@unique, no audit trail) per CONTEXT.md D-02/D-03/D-04/D-11/D-12 — future 22-02 CRUD mutates rows directly rather than inserting new rows and deactivating old ones"
  - "sendMinistryDigest() omits the attachments key entirely (not attachments: []) when no attachments are supplied, matching the D-15 size-guard fallback contract 22-03 depends on"
  - "sendMinistryDigest() deliberately has no try/catch, mirroring sendOtpEmail()'s no-swallow contract so 22-03's resilience.execute('sendgrid', ...) call sees real failures and can mark lastStatus = FAILED"

patterns-established:
  - "Pattern: New SendGrid capabilities get their own dedicated method (params object in, Promise<void> out) rather than extending sendEmail()'s signature"

requirements-completed: [MIN-08a]

# Metrics
duration: ~25min
completed: 2026-07-21
---

# Phase 22 Plan 01: Ministry Export Subscription Schema + SendGrid Digest Foundation Summary

**New `MinistryExportSubscription` Prisma model (typed recipients/cadence/status columns) plus a dedicated `SendgridService.sendMinistryDigest()` method supporting base64 PDF+CSV attachments, laying the foundation Plans 22-02 (CRUD) and 22-03 (scheduler) build on.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-21T13:00:00Z
- **Completed:** 2026-07-21T13:23:10Z
- **Tasks:** 3 completed (Task 3 was TDD: RED + GREEN)
- **Files modified:** 3 (1 migration file created)

## Accomplishments
- Added `ExportCadence`/`ExportDeliveryStatus` enums and `MinistryExportSubscription` model to `schema.prisma`, matching `SettlementSplitTier`'s UUID-PK/`@@map` style but with in-place updates (no audit-trail insert/deactivate pattern)
- Applied migration `20260721131842_add_ministry_export_subscription`, creating the `ministry_export_subscriptions` table; regenerated Prisma Client now exposes the `ministryExportSubscription` delegate
- Added `SendgridService.sendMinistryDigest()` — a dedicated method supporting `to[]`/`subject`/`html`/optional `attachments[]`, with 3 new passing tests covering attachment passthrough, omitted-attachments key exclusion, and rejection propagation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MinistryExportSubscription model + enums to schema.prisma** - `a1a8915` (feat)
2. **Task 2: Push the schema migration and generate the Prisma Client** - `16183cf` (feat)
3. **Task 3: Add SendgridService.sendMinistryDigest()** - `e004460` (test, RED) + `41ea154` (feat, GREEN)

**Plan metadata:** committed separately (see final commit in this worktree)

_Note: Task 3 was TDD — RED (failing test) then GREEN (implementation) commits, per plan's `tdd="true"` marker._

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `ExportCadence`, `ExportDeliveryStatus` enums and `MinistryExportSubscription` model after `SettlementSplitTier`
- `backend/prisma/migrations/20260721131842_add_ministry_export_subscription/migration.sql` - CREATE TYPE x2 + CREATE TABLE `ministry_export_subscriptions` + index on `isActive`
- `backend/src/common/services/sendgrid.service.ts` - New `sendMinistryDigest()` method, no changes to any existing method signature
- `backend/src/common/services/__tests__/sendgrid.service.spec.ts` - New `describe('sendMinistryDigest', ...)` block with 3 tests

## Decisions Made
- Followed the plan's `<interfaces>` block verbatim for both the Prisma model and the SendGrid method signature — no interface deviations
- Confirmed via test assertions that `attachments` key is fully absent (not an empty array) from the `sgMail.send()` call payload when no attachments are supplied, since 22-03's future D-15 size-guard fallback depends on this exact shape

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing worktree dependencies (node_modules)**
- **Found during:** Task 1 (running `npx prisma validate`)
- **Issue:** This is a freshly-created git worktree; `node_modules` was completely absent (0 files) in both `backend/` and repo root, so `npx prisma` fell back to a mismatched globally-cached Prisma 7.8.0 (incompatible with this schema's `url`/`directUrl` datasource properties, which are Prisma 5.x syntax)
- **Fix:** Ran `npm ci --workspace=backend --include-workspace-root` from the worktree root to materialize `node_modules` exactly per the committed `package-lock.json` (root pins `prisma@^7.8.0` as a devDependency for tooling elsewhere in the monorepo; `backend/package.json` pins `prisma@^5.11.0`, which npm workspaces correctly nests locally in `backend/node_modules` since the two are semver-incompatible)
- **Files modified:** None (node_modules is gitignored, not committed)
- **Verification:** `backend/node_modules/prisma/package.json` reports version `5.22.0` (satisfies `^5.11.0`); `npx prisma validate` and `npx prisma migrate dev` both resolve to the correct local 5.22.0 binary
- **Committed in:** N/A (no source changes; environment setup only)

**2. [Rule 3 - Blocking] Created local `backend/.env` for Prisma CLI**
- **Found during:** Task 1 (running `npx prisma validate`)
- **Issue:** `DATABASE_URL`/`DIRECT_URL` env vars were not found — the Prisma CLI (unlike NestJS's `ConfigModule`, which resolves `envFilePath` to the repo root per `README.md`) loads `.env` only from the `prisma/` directory or the invocation `cwd` (`backend/`), neither of which had one in this fresh worktree
- **Fix:** Copied the existing root `.env` (already present in the main checkout, pointing at the already-running local Docker Postgres container on `localhost:5432`) to `backend/.env`
- **Files modified:** `backend/.env` (gitignored, not committed — confirmed via `git check-ignore -v`)
- **Verification:** `npx prisma validate` and `npx prisma migrate dev`/`migrate status` all succeed against `iseyaa_dev` on `localhost:5432`
- **Committed in:** N/A (gitignored local environment file, not committed)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking environment setup issues specific to this fresh worktree checkout; no source-code or schema deviations from the plan)
**Impact on plan:** Zero impact on scope or deliverables — both fixes were prerequisite tooling/environment setup, not functional changes. No scope creep.

## Issues Encountered
- Migration apply also picked up one previously-uncommitted-to-this-DB migration (`20260720040000_settlement_dispute_partial_unique_active`) that was already present in the committed `migrations/` folder but not yet applied to this worktree's fresh Docker Postgres volume — this was pre-existing catch-up, not a new migration created by this plan, and required no code change.

## User Setup Required

None - no external service configuration required. `SENDGRID_API_KEY` behavior is unchanged from existing `SendgridService` conventions (stub mode when absent/placeholder).

## Next Phase Readiness
- `prisma.ministryExportSubscription` delegate is live and ready for Plan 22-02's CRUD routes
- `SendgridService.sendMinistryDigest()` is ready for Plan 22-03's `@Cron` scheduler to call via `resilience.execute('sendgrid', ...)`
- No blockers identified for 22-02 or 22-03

---
*Phase: 22-scheduled-ministry-exports-lga-heatmap*
*Completed: 2026-07-21*

## Self-Check: PASSED

All claimed files verified present on disk:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260721131842_add_ministry_export_subscription/migration.sql`
- `backend/src/common/services/sendgrid.service.ts`
- `backend/src/common/services/__tests__/sendgrid.service.spec.ts`
- `.planning/phases/22-scheduled-ministry-exports-lga-heatmap/22-01-SUMMARY.md`

All claimed commit hashes verified present in git history:
- `a1a8915`, `16183cf`, `e004460`, `41ea154`, `15a221d`
