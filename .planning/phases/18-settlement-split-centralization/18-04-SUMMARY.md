---
phase: 18-settlement-split-centralization
plan: 04
subsystem: api
tags: [nestjs, prisma, class-validator, admin, settlement, rbac]

# Dependency graph
requires:
  - phase: 18-settlement-split-centralization (plan 01)
    provides: "SettlementSplitTier Prisma model + migration"
provides:
  - "GET /admin/settlement-splits and PATCH /admin/settlement-splits/:id backend routes, SUPER_ADMIN-only"
  - "AdminService.listSplitTiers()/updateSplitTier() with insert-new-row/deactivate-old audit trail semantics"
affects: [19-settlement-dispute-adjustment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Insert-new-row/deactivate-old audit trail for admin-editable financial config (no in-place UPDATE ever mutates a historical split value)"
    - "Route-level @Roles() override narrower than controller class-level default for money-adjacent endpoints (matches existing getRevenue() precedent)"

key-files:
  created:
    - backend/src/modules/admin/dto/update-split-tier.dto.ts
  modified:
    - backend/src/modules/admin/admin.service.ts
    - backend/src/modules/admin/admin.controller.ts
    - backend/src/modules/admin/__tests__/admin.service.spec.ts

key-decisions:
  - "updateSplitTier() computes final earnerPct/ministryPct/platformPct from dto ?? prior row before the >1 sum check, with explicit undefined-vs-null handling on platformPct so an admin can keep it deliberately null (Studio's row) on a partial update"
  - "Both new routes carry explicit @Roles(UserRole.SUPER_ADMIN), overriding the controller's class-level SUPER_ADMIN+LGA_ADMIN default, per RESEARCH.md's Drift Check recommendation for money-flow config"

requirements-completed: [SETTLE-11a, SETTLE-11c]

# Metrics
duration: ~20min
completed: 2026-07-19
---

# Phase 18 Plan 04: Settlement Split Tier Admin CRUD Summary

**Backend-only GET/PATCH `/admin/settlement-splits` CRUD surface for `SettlementSplitTier`, with insert-new-row/deactivate-old audit trail semantics and SUPER_ADMIN-only route gating — no web admin UI ships this phase (D-04).**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `UpdateSplitTierDto` validates `earnerPct`/`ministryPct` (0-1 range) and nullable `platformPct` (explicit `null` respected as "set to null", not "unset")
- `AdminService.listSplitTiers(module?)` and `AdminService.updateSplitTier(id, dto)` — the latter runs a single `$transaction` that deactivates the prior row (`isActive: false`) before creating the new active row, satisfying D-05's "old tier rows are never deleted or overwritten" requirement
- `updateSplitTier()` rejects any combination where `earnerPct + ministryPct + (platformPct ?? 0) > 1` with a `BadRequestException`, before any database write
- `GET /admin/settlement-splits` (optional `?module=` filter) and `PATCH /admin/settlement-splits/:id` routes added to `AdminController`, both carrying explicit `@Roles(UserRole.SUPER_ADMIN)` — narrower than the controller's class-level `SUPER_ADMIN, LGA_ADMIN` default, matching the existing `getRevenue()` money-adjacent precedent

## Task Commits

Each task was committed atomically:

1. **Task 1: UpdateSplitTierDto + AdminService.listSplitTiers()/updateSplitTier()** - `2dc819a` (feat)
2. **Task 2: GET/PATCH /admin/settlement-splits routes (SUPER_ADMIN-only, DTO-validated)** - `dcb844f` (feat)

**Plan metadata:** committed together with this SUMMARY.md (worktree mode — orchestrator handles final metadata commit after merge)

_Note: Task 1 was declared `tdd="true"` in the plan; tests were written and asserted alongside the implementation in the same commit (existing `admin.service.spec.ts` file was extended, not a separate RED-phase file) — see TDD Gate Compliance note below._

## Files Created/Modified
- `backend/src/modules/admin/dto/update-split-tier.dto.ts` - `UpdateSplitTierDto` (class-validator, 0-1 range, nullable `platformPct`)
- `backend/src/modules/admin/admin.service.ts` - `listSplitTiers()`/`updateSplitTier()` (insert-new-row/deactivate-old transaction)
- `backend/src/modules/admin/admin.controller.ts` - `GET`/`PATCH /admin/settlement-splits*` routes, SUPER_ADMIN-only
- `backend/src/modules/admin/__tests__/admin.service.spec.ts` - tests for `listSplitTiers` (filtered/unfiltered) and `updateSplitTier`'s NotFoundException/BadRequestException guards and transaction ordering

## Decisions Made
- `finalPlatformPct` computation distinguishes `dto.platformPct === undefined` (keep prior value) from `dto.platformPct === null` (explicitly clear it) — required because D-01's Studio row uses `platformPct: null` deliberately and a partial PATCH must be able to preserve that
- Deactivation (`tx.settlementSplitTier.update({ isActive: false })`) runs strictly before the new row's `tx.settlementSplitTier.create()` inside the same `$transaction`, because the `@@unique([module, tierName])` constraint would otherwise reject the new active row while the old one is still active — verified in the test via `invocationCallOrder`

## Deviations from Plan

**1. [Rule 3 - Blocking] Regenerated Prisma client and linked worktree `node_modules`**
- **Found during:** Task 1 setup (pre-implementation environment check, per the plan's parallel-execution note)
- **Issue:** The worktree had no `node_modules` at all (git worktrees don't carry them), and the plan's fallback note (`npx prisma generate` if `settlementSplitTier` type errors appear) assumed `node_modules` already existed and only the generated client was stale. `npx prisma` also resolved to a global Prisma 7.8.0 (schema-incompatible with this project's pinned 5.11.x), producing `P1012` validation errors on the pinned `datasource.url`/`directUrl` schema syntax.
- **Fix:** Created NTFS junctions (`mklink /J`) from the worktree's `node_modules` and `backend/node_modules` to the main repo's already-installed `node_modules` (same machine, same dependency tree — main repo's `18-01` base already had these installed), then ran the local `backend/node_modules/.bin/prisma generate` (v5.22.0, matching `@prisma/client` in `package.json`) to confirm the `SettlementSplitTier` delegate was present on `PrismaService`.
- **Files modified:** None (environment-only; no repo files changed, no commit)
- **Verification:** `grep settlementSplitTier node_modules/.prisma/client/index.d.ts` confirmed the delegate existed before writing any service code; `npm run test -- admin.service` and full `npm run test` (639/639 passing) confirmed no downstream Prisma typing issues
- **Committed in:** N/A — environment setup only, not part of any task commit

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Environment-only fix required to unblock any TypeScript compilation or test run in this worktree; no application code affected, no scope creep.

## TDD Gate Compliance

Task 1 was marked `tdd="true"` in the plan, but its `<behavior>` block described target test assertions to add to the *existing* `admin.service.spec.ts` file rather than a standalone RED-phase file, and the task's single `<verify>` step (`npm run test -- admin.service`) was run once after both the DTO/service implementation and its tests were written together — there is no separate `test(...)` commit preceding a `feat(...)` commit for this task; both landed in one `feat(18-04): ...` commit (`2dc819a`). This follows the plan's own commit-type guidance (a single `feat` task, not a dedicated TDD RED/GREEN/REFACTOR plan-level gate) but does not satisfy the strict "test commit before feat commit" TDD gate sequence. No functional gap: all listed `<behavior>` test cases exist and pass in the committed test file.

## Issues Encountered
None beyond the Prisma/node_modules environment setup documented above.

## User Setup Required
None - no external service configuration required. The plan explicitly scopes out any new web admin UI (D-04) — operators use authenticated API calls (e.g. via Postman/curl with a SUPER_ADMIN JWT) until a future phase adds a UI.

## Next Phase Readiness
- `GET`/`PATCH /admin/settlement-splits*` are live and SUPER_ADMIN-gated; ready for Phase 19's dispute/adjustment workflow to reference the same `SettlementSplitTier` audit trail as its source of truth for "what split should have applied" at a given point in time
- **Manual-only verification still outstanding (per 18-VALIDATION.md):** live-request role-gating check (SUPER_ADMIN token expects 200, non-SUPER_ADMIN e.g. LGA_ADMIN token expects 403) against a running dev server — not provable by unit-level guard mocks alone, not performed in this worktree
- No blockers for Wave 2 sibling plans (18-02/18-03) — this plan touched only disjoint admin-module files

---
*Phase: 18-settlement-split-centralization*
*Completed: 2026-07-19*

## Self-Check: PASSED

- FOUND: backend/src/modules/admin/dto/update-split-tier.dto.ts
- FOUND: backend/src/modules/admin/admin.service.ts
- FOUND: backend/src/modules/admin/admin.controller.ts
- FOUND: .planning/phases/18-settlement-split-centralization/18-04-SUMMARY.md
- FOUND commit: 2dc819a (Task 1)
- FOUND commit: dcb844f (Task 2)
- FOUND commit: 16eb269 (SUMMARY.md)
