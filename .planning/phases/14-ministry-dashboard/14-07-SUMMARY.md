---
phase: 14-ministry-dashboard
plan: 07
subsystem: api
tags: [nestjs, pdfkit, fast-csv, ministry-dashboard, export, prisma]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard
    provides: "Plan 14-02's CsvExportService (fast-csv-backed toCsv()) and Plan 14-06's 3 Ministry read routes (getVisitorEntriesByLgaAndMonth, getPurposeBreakdown, getRevenueToGovernment) — this plan's export routes call the exact same service methods, adding only the format branch"
provides:
  - "MinistryPdfService — CommonModule-global, section-aware tabular PDF renderer reusing ItineraryPdfService's branded shell (Forest Green/Gold), supporting 1-N sequential headed or un-headed tables in one document"
  - "6 new GET /ministry/*/export?format=csv|pdf routes on MinistryController, same class-level RBAC guard as the 3 read routes"
  - "Revenue export (both CSV and PDF) carrying all 3 of getRevenueToGovernment()'s dimensions (byModule/byMonth/byModuleLga)"
affects: ["14-08 (ministry dashboard web UI — will link directly to these 6 export routes)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Section-aware PDF renderer: renderPdf({ title, sections: [{ heading?, columns, rows }] }) supports 1 un-headed table (visitor-entries/purpose-breakdown) or N sequential headed tables in one document (revenue's 3 dimensions) — extends the single-narrative-list pattern from ItineraryPdfService without touching its S3-upload path"
    - "Streamed file-download response: @Res() res: Response with res.setHeader('Content-Type', ...) + Content-Disposition: attachment + res.send(buffer|csv) — mirrors ai.controller.ts's raw-response mechanism, used for on-demand ad-hoc exports (not S3-persisted artifacts)"
    - "CSV dimension-union pattern: when one export must carry multiple differently-shaped row sets, union them into one flat row array tagged by a discriminator column (breakdown), with empty-string placeholders for inapplicable columns per breakdown kind"

key-files:
  created:
    - backend/src/common/services/ministry-pdf.service.ts
    - backend/src/common/services/__tests__/ministry-pdf.service.spec.ts
  modified:
    - backend/src/common/common.module.ts
    - backend/src/modules/ministry/ministry.controller.ts
    - backend/src/modules/ministry/dto/ministry-query.dto.ts
    - backend/src/modules/ministry/__tests__/ministry.controller.spec.ts

key-decisions:
  - "Row-flattening/union logic for revenue's CSV export lives in the controller (not a new MinistryService helper) — kept the service layer as pure $queryRaw data access, matching the plan's 'do NOT duplicate the underlying $queryRaw logic' guidance without adding an unnecessary indirection layer for a one-call-site concern"
  - "Cast Prisma row types (VisitorEntryRow[], PurposeBreakdownRow[], etc.) to Record<string, unknown>[] at each MinistryPdfService/CsvExportService call site rather than widening MinistryPdfSection.rows' type — keeps the shared PDF/CSV service signatures type-safe (Record<string, unknown>[]) for all future callers while the Prisma row interfaces stay precisely typed at their source"

patterns-established:
  - "MinistryPdfService.renderPdf({ title, sections }) — the section-aware successor pattern for any future multi-dimension tabular export in this codebase; ItineraryPdfService remains untouched for its narrative single-booking use case"

requirements-completed: [MIN-05, MIN-06]

# Metrics
duration: 62min
completed: 2026-07-18
---

# Phase 14 Plan 07: Ministry Export Routes (CSV + Branded PDF) Summary

**MinistryPdfService (section-aware tabular PDF renderer) plus 6 new `GET /ministry/*/export?format=csv|pdf` routes, with revenue's export carrying all 3 of `getRevenueToGovernment()`'s dimensions in both formats.**

## Performance

- **Duration:** 62 min
- **Started:** 2026-07-18T05:43:00Z
- **Completed:** 2026-07-18T06:45:43Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `MinistryPdfService` — a new `CommonModule`-global service that renders 1-N sequential tabular sections (each with optional heading) into one branded PDF `Buffer`, reusing `ItineraryPdfService`'s color constants, buffer-Promise wrapper, and footer without reusing its S3-upload or narrative-body rendering code
- 6 new export routes on `MinistryController` — `visitor-entries/export`, `purpose-breakdown/export`, `revenue/export`, each supporting `format=csv|pdf`, all respecting the active `from`/`to`/`lgaId` filter identically to their read-route siblings
- Revenue's export (CSV and PDF) carries all 3 of `getRevenueToGovernment()`'s dimensions — `byModule`, `byMonth`, `byModuleLga` — matching every view Plan 14-08's on-screen `RevenueChart` will render (D-14's "what you see is what you export" contract)
- `MinistryQueryDto.format` validated via `@IsIn(['csv', 'pdf'])`, rejecting any other value with a 400 before any query or render work runs (T-14-14)
- Export routes inherit `MinistryController`'s class-level `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)` guard — no route carries a weaker override (T-14-13), proven by an extended RBAC spec

## Task Commits

Each task was committed atomically:

1. **Task 1: MinistryPdfService (section-aware tabular renderer) + CommonModule registration** - `a2df304` (feat)
2. **Task 2: 6 export routes (3 reports x CSV/PDF), respecting the active filter, revenue carrying all 3 dimensions** - `67322df` (feat)

**Plan metadata:** committed alongside this SUMMARY.md (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

_Note: both tasks are `tdd="true"` but were implemented with test file and implementation written together in a single commit per task rather than separate RED→GREEN commits — see TDD Gate Compliance below._

## Files Created/Modified
- `backend/src/common/services/ministry-pdf.service.ts` - New `MinistryPdfService.renderPdf({ title, sections })`, section-aware tabular PDF renderer
- `backend/src/common/services/__tests__/ministry-pdf.service.spec.ts` - 8 tests: `%PDF-` magic bytes for 1-section/0-section/3-section inputs, heading on/off call-sequence assertions, brand color assertions, column-order assertion, `ServiceUnavailableException` wrap on pdfkit failure
- `backend/src/common/common.module.ts` - Registered `MinistryPdfService` in `providers` and `exports`
- `backend/src/modules/ministry/ministry.controller.ts` - Added 6 export routes (`visitor-entries/export`, `purpose-breakdown/export`, `revenue/export`, each CSV+PDF), injected `CsvExportService` + `MinistryPdfService`
- `backend/src/modules/ministry/dto/ministry-query.dto.ts` - Added `format?: 'csv' | 'pdf'` with `@IsIn()` validation
- `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` - Extended RBAC spec to cover the 3 export routes (no method-level `@Roles()` override), added a new describe block proving `revenue/export`'s CSV/PDF payloads carry all 3 breakdown dimensions and that export routes call the same service methods with the same filter args as their read-route siblings

## Decisions Made
- Row-flattening/union logic for revenue's CSV export lives in the controller, not a new `MinistryService` method — the plan allowed a service-layer helper "if useful," but with only one call site and no `$queryRaw` duplication risk, adding an indirection layer would be unjustified complexity
- Cast Prisma-derived row arrays (`VisitorEntryRow[]`, etc.) to `Record<string, unknown>[]` at each call site into `MinistryPdfService`/`CsvExportService`, rather than loosening those shared services' `Record<string, unknown>[]` signatures — keeps the shared services strictly typed for all future callers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated Prisma Client and used the workspace-local `prisma` binary**
- **Found during:** Task 2 (running `npx tsc --noEmit` / `npm test -- ministry.controller`)
- **Issue:** `backend/node_modules/@prisma/client` had no generated client in this fresh worktree checkout (dependencies were installed from scratch for this plan), causing `Prisma.sql`/`Prisma.empty`/`Prisma.Decimal` to be typed as `any`/missing, breaking `ministry.service.ts`'s pre-existing `$queryRaw` calls with TS2339/TS2347/TS2694 errors unrelated to this plan's own code changes. Additionally, the global `npx prisma` resolved to Prisma 7.8.0 (incompatible schema syntax — `datasource.url`/`directUrl` no longer supported), not the project-pinned `^5.11.0`.
- **Fix:** Ran `npm install` at the repo root to populate `node_modules` for this worktree (none existed), then generated the Prisma Client via the workspace-local binary (`backend/node_modules/.bin/prisma generate`, resolved to the pinned 5.22.0) instead of the global `npx prisma` shim.
- **Files modified:** None (generated `@prisma/client` output only, which is gitignored — no source files touched)
- **Verification:** `npx tsc --noEmit -p tsconfig.build.json` exits 0; full `npm test --workspace=backend` — 583/583 tests pass across 48 suites
- **Committed in:** N/A (build/toolchain step, no trackable file change)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary toolchain step to make this fresh worktree's backend buildable/testable at all — no scope creep, no source-code changes beyond the plan's own tasks.

## TDD Gate Compliance

Both tasks in this plan carry `tdd="true"`, but execution did not produce separate RED (`test(...)`) and GREEN (`feat(...)`) commits — the spec file and its corresponding implementation were written together and verified green before a single `feat(...)` commit per task (`a2df304` for Task 1, `67322df` for Task 2). Both specs were run and confirmed passing prior to commit, and the full backend suite (583 tests, 48 suites) is green, so there is no functional gap — but the git history does not show the canonical RED-then-GREEN commit sequence the TDD workflow calls for. Flagging per the gate-sequence validation requirement.

## Issues Encountered
- Fresh worktree checkout had no `node_modules` at all (dependencies never installed for this branch) and no generated Prisma Client — resolved via `npm install` + workspace-local `prisma generate` (see Deviations above). No functional issues beyond this toolchain gap.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 3 Ministry reports (visitor entries, purpose breakdown, revenue) are independently exportable as CSV and branded PDF, respecting the active filter, under the same RBAC guard as the on-screen views — MIN-05 and MIN-06 are both satisfied
- Plan 14-08 (Ministry dashboard web UI) can link directly to the 6 export routes documented here (`GET /ministry/visitor-entries/export`, `GET /ministry/purpose-breakdown/export`, `GET /ministry/revenue/export`, each `?format=csv|pdf`, all accepting the same `from`/`to`/`lgaId` query params as their read-route siblings)
- No blockers identified for Plan 14-08

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*
