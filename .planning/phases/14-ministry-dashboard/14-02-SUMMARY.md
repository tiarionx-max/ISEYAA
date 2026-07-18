---
phase: 14-ministry-dashboard
plan: 02
subsystem: api
tags: [nestjs, prisma, csv, fast-csv, visitor-log, ministry-dashboard]

# Dependency graph
requires:
  - phase: 14-ministry-dashboard (plan 01)
    provides: "VisitorLog Prisma model, VisitorSourceType enum, MINISTRY_VIEWER UserRole value"
provides:
  - "VisitorLogService — sole write path into VisitorLog (D-08), CommonModule-global"
  - "CsvExportService — RFC4180-correct CSV writer backed by fast-csv, CommonModule-global"
  - "VISITOR_PURPOSE_VALUES / VisitorPurpose / DEFAULT_VISITOR_PURPOSE — D-05/D-06 taxonomy constant"
affects: [14-04-events-stays-wiring, 14-05-tour-bookings-wiring, 14-07-export-layer]

# Tech tracking
tech-stack:
  added: ["fast-csv@^5.0.7"]
  patterns:
    - "Single-purpose CommonModule service mirroring QrService's shape (constructor-injected PrismaService, no defensive try/catch inside the service)"
    - "Taxonomy/default-mapping constants exported from a dedicated constants file rather than hardcoded at call sites"

key-files:
  created:
    - backend/src/common/constants/visitor-purpose.constants.ts
    - backend/src/common/services/visitor-log.service.ts
    - backend/src/common/services/csv-export.service.ts
    - backend/src/common/services/__tests__/visitor-log.service.spec.ts
    - backend/src/common/services/__tests__/csv-export.service.spec.ts
  modified:
    - backend/src/common/common.module.ts
    - backend/package.json
    - package-lock.json

key-decisions:
  - "CsvExportService.toCsv() passes alwaysWriteHeaders:true to fast-csv's writeToString — without it, an empty rows array with an explicit headers array returns an empty string instead of a header-only CSV, which the plan's acceptance criteria explicitly required"

patterns-established:
  - "VisitorLogService.record() takes a single input object matching all 6 D-07 VisitorLog columns, no client-side purpose validation (validation deferred to DTO layer in Plans 14-04/14-05)"

requirements-completed: [MIN-03, MIN-05]

# Metrics
duration: 15min
completed: 2026-07-18
---

# Phase 14 Plan 02: CommonModule Services (VisitorLogService + CsvExportService) Summary

**VisitorLogService (D-08's sole write path into VisitorLog) and CsvExportService (fast-csv-backed RFC4180 CSV writer) added to CommonModule as globally-injectable services, plus the D-05/D-06 purpose-of-visit taxonomy constant.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments
- `VISITOR_PURPOSE_VALUES` (7-value D-05 taxonomy, verbatim strings) + `DEFAULT_VISITOR_PURPOSE` (D-06 per-source-type defaults) as the single source of truth, ready for Plan 14-04/14-05's DTO `@IsIn()` validation and default-fallback logic
- `VisitorLogService.record()` — one method, one `prisma.visitorLog.create()` call, mirrors `QrService`'s single-purpose shape, no defensive try/catch (caller's responsibility per RESEARCH.md convention)
- `CsvExportService.toCsv()` — RFC4180-correct CSV output via `fast-csv`'s `writeToString`, verified round-trip on embedded commas/quotes/newlines and correct header-only output on empty row sets
- Both services registered in `CommonModule`'s `providers` and `exports` arrays — injectable from any feature module (Events, Stays, Tour Bookings, future Ministry module) with zero explicit import, since `CommonModule` is `@Global()`
- `fast-csv@^5.0.7` installed matching RESEARCH.md's Standard Stack pin

## Task Commits

Each task was committed as a RED/GREEN TDD pair:

1. **Task 1: Purpose taxonomy constant + VisitorLogService (write path) + spec**
   - `a640d1c` test(14-02): add failing test for VisitorLogService + purpose taxonomy
   - `e17faa8` feat(14-02): implement VisitorLogService + purpose-of-visit taxonomy
2. **Task 2: fast-csv install + CsvExportService + CommonModule registration + spec**
   - `3eff87a` test(14-02): add failing test for CsvExportService + install fast-csv
   - `4ab61fb` feat(14-02): implement CsvExportService + register in CommonModule

## Files Created/Modified
- `backend/src/common/constants/visitor-purpose.constants.ts` - `VISITOR_PURPOSE_VALUES`, `VisitorPurpose` type, `DEFAULT_VISITOR_PURPOSE` (D-05/D-06)
- `backend/src/common/services/visitor-log.service.ts` - `VisitorLogService.record()`, the sole write path into `VisitorLog` (D-08)
- `backend/src/common/services/csv-export.service.ts` - `CsvExportService.toCsv()`, fast-csv-backed RFC4180 CSV writer
- `backend/src/common/services/__tests__/visitor-log.service.spec.ts` - taxonomy constant + `record()` shape/null-lgaId/unlisted-purpose coverage
- `backend/src/common/services/__tests__/csv-export.service.spec.ts` - comma/quote/newline round-trip, empty-rows header-only, column-order coverage
- `backend/src/common/common.module.ts` - registered `VisitorLogService` + `CsvExportService` in `providers`/`exports`
- `backend/package.json` / `package-lock.json` - added `fast-csv@^5.0.7`

## Decisions Made
- `CsvExportService.toCsv()` sets `alwaysWriteHeaders: true` on `fast-csv`'s `writeToString` call — verified via `node -e` that without this flag, an empty `rows` array with a `headers` array still returns `""` (not a header-only CSV string), which would have silently violated the plan's "empty rows array still returns a valid CSV string containing only the header row" acceptance criterion.

## Deviations from Plan

None beyond the one documented decision above (which is a minor implementation detail needed to satisfy the plan's own stated acceptance criteria, not a scope change).

## Issues Encountered
- The worktree had no `node_modules` and a stale/missing generated Prisma client on first run — resolved with `npm install` (root workspace install) followed by `npx prisma generate` inside `backend/`. This was infrastructure setup, not a code change, and is not tracked as a deviation. Full `npm test --workspace=backend` (44 suites, 521 tests) confirmed green after these steps, before and independent of this plan's own two new test files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 14-04 (Events+Stays wiring) and 14-05 (Tour Bookings wiring) can now inject `VisitorLogService` and import `VISITOR_PURPOSE_VALUES`/`DEFAULT_VISITOR_PURPOSE` with zero additional CommonModule changes.
- Plan 14-07 (export layer) can inject `CsvExportService` with zero additional CommonModule changes.
- No blockers identified for downstream plans.

---
*Phase: 14-ministry-dashboard*
*Completed: 2026-07-18*

## Self-Check: PASSED

All created files verified present on disk; all 5 commit hashes (a640d1c, e17faa8, 3eff87a, 4ab61fb, 0c5ccbe) verified present in git log.
