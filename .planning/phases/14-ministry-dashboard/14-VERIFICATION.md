---
phase: 14-ministry-dashboard
verified: 2026-07-18T02:20:00Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Ministry dashboard shows visitor entry counts, purpose-of-visit breakdown, and revenue-to-government-share by LGA/time period (Roadmap SC2, SC3, SC4)"
    status: failed
    reason: "CR-01 (confirmed unfixed in code): the `to` date-range filter is implemented as a plain `<=` comparison against a date-only string parsed to UTC midnight in all 3 MinistryService query methods (buildFilters() used by getVisitorEntriesByLgaAndMonth/getPurposeBreakdown, and the independent fromFilter/toFilter pair in getRevenueToGovernment). This silently excludes almost the entire final day of every requested range. The web dashboard's own defaultDateRange() sets `to = today`, so this is not an edge case — it is the DEFAULT behavior on every page load: today's visitor entries, purpose breakdown, and revenue are always missing from the numbers a Ministry viewer sees, and the same truncation applies to the last day of any custom range and to every CSV/PDF export built from these queries."
    artifacts:
      - path: "backend/src/modules/ministry/ministry.service.ts"
        issue: "buildFilters() line 60 (`AND v.\"visitedAt\" <= ${new Date(to)}`) and getRevenueToGovernment() line 140 (`AND t.\"createdAt\" <= ${new Date(to)}`) both truncate the final day instead of treating `to` as inclusive of the whole day"
      - path: "web/src/app/admin/ministry/page.tsx"
        issue: "defaultDateRange() (lines 24-32) sets `to` to today's date-only string, so the bug fires on every default page load, not just custom ranges"
    missing:
      - "Change toFilter to an exclusive next-day boundary (`v.\"visitedAt\" < to + 1 day`) or otherwise make `to` genuinely inclusive of the full day, in buildFilters() and in getRevenueToGovernment()'s independent from/to fragment"
      - "Add a regression test seeding a row with a timestamp late on the `to` date (e.g. 23:59:00) and asserting it is included, for all 3 query methods"
  - truth: "Every Ministry dashboard report can be exported as CSV and as a formatted, Forest Green/Tropical Gold branded PDF (Roadmap SC5)"
    status: failed
    reason: "CR-02 (confirmed unfixed in code): MinistryPdfService.renderTable divides page width evenly across columns and captures rowY once before the per-column loop, then advances the next row by a fixed doc.moveDown(0.4) — with no height-aware layout or page-break logic. VISITOR_ENTRIES_COLUMNS (shared by both the CSV and PDF visitor-entries export) includes a raw `lgaId` column holding a full UUID (~36 chars, 200pt+ at 10pt Helvetica) in a table where 5 columns divide 495pt evenly (~99pt each) — more than double the column's width. PDFKit will word-wrap that cell onto a second line with no reserved vertical space, so the next row's content renders on top of (overlapping) the wrapped LGA-ID text. This reproduces for any real (non-fixture) dataset; the unit test suite only uses short placeholder IDs ('lga-1') and never exercises this path. There is also no page-break/header-reprint logic for reports large enough to span multiple pages."
    artifacts:
      - path: "backend/src/common/services/ministry-pdf.service.ts"
        issue: "renderTable() (lines 125-150) has no doc.heightOfString()-based row-height measurement, no doc.y advance proportional to wrapped-cell height, and no doc.addPage() logic"
      - path: "backend/src/modules/ministry/ministry.controller.ts"
        issue: "VISITOR_ENTRIES_COLUMNS (lines 21-27) includes a raw `lgaId` UUID column in the PDF export path, not just the CSV path"
    missing:
      - "At minimum, drop the raw lgaId column from the PDF section only (keep it in CSV where width doesn't matter) — lgaName already carries the human-readable identity"
      - "More robustly: measure each cell via doc.heightOfString(value, { width: colWidth }), advance doc.y by the row's max cell height, and call doc.addPage() (re-emitting the header row) when content would exceed the page — add a MinistryPdfService test with a UUID-length value in a narrow multi-column section and a test forcing a page break"
human_verification:
  - test: "Open a Visitor Entries PDF export generated against real (non-seed) production-shaped data (real LGA UUIDs, more than a handful of rows) and visually confirm no row overlap once CR-02 is fixed"
    expected: "Every row renders as a clean, non-overlapping table row; multi-page reports repeat the header row"
    why_human: "Visual PDF layout correctness cannot be fully proven by a unit test asserting the pdfkit call sequence — requires opening the rendered binary"
  - test: "Load /admin/ministry as a seeded MINISTRY_VIEWER user against a live backend with data dated 'today', using the default 30-day filter, once CR-01 is fixed"
    expected: "Visitor entries, purpose breakdown, and revenue figures include today's activity, not just activity through yesterday"
    why_human: "Requires a running server + seeded live data with real-time timestamps; not verifiable via static code/unit-test inspection alone"
  - test: "Confirm Forest Green (#1A6B3C) / Gold (#C8962A) branding renders correctly across all 6 PDF section headers, dividers, and footer text when opened in an actual PDF viewer"
    expected: "Visual consistency with itinerary-pdf.service.ts's existing branded output"
    why_human: "Color/visual fidelity in a rendered binary is not assertable from source code alone"
---

# Phase 14: Ministry Dashboard Verification Report

**Phase Goal:** A `MINISTRY_VIEWER` role can view aggregate visitor, revenue, and purpose-of-visit analytics and export them as CSV/PDF, with zero row-level citizen PII ever reachable
**Verified:** 2026-07-18T02:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A `MINISTRY_VIEWER` role exists, gated by its own `@Roles()` decorator on every route it can reach — never via a controller shared with any mutation endpoint | VERIFIED | `MINISTRY_VIEWER` present identically in `schema.prisma:25`, `backend/src/common/enums/user-role.enum.ts:13`, `shared/src/types/index.ts:9`. `MinistryController` (`backend/src/modules/ministry/ministry.controller.ts`) is a standalone class with 9 `@Get()` routes only (3 read + 6 export), zero `@Patch`/`@Post`/`@Delete`, class-level `@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)`. `ministry.controller.spec.ts` (part of 51 passing ministry tests) proves RBAC denies non-Ministry roles and allows the 3 permitted roles. |
| 2 | Ministry dashboard shows visitor entry counts broken down by LGA and time period | **FAILED** | Query (`getVisitorEntriesByLgaAndMonth`) and UI wiring exist and are functionally correct in shape (LGA + month + role grouping, LEFT JOIN status filtering per D-02), but CR-01's date-range bug (see Gaps) means the counts shown are systematically wrong — the entire final day of any range, including "today" in the dashboard's own default view, is silently dropped. |
| 3 | Ministry dashboard shows a purpose-of-visit breakdown, sourced from a new `VisitorLog` capture point added to the booking/check-in flow | **FAILED** (data-correctness half only) | `VisitorLog` capture point and all 3 write sites (Events `checkin()`, Stays `handleStayPayment()`, Tour `recordVisitorEntry()`) are verified correct, tested, and wired (see Required Artifacts / Key Links below) — MIN-03's "new capture point" clause is fully satisfied. However `getPurposeBreakdown()` shares the same buggy `buildFilters()` as visitor-entries, so the same CR-01 defect (final-day/"today" truncation) applies to this report's numbers too. |
| 4 | Ministry dashboard shows revenue-to-government-share, sourced from the standing Ministry wallet's transaction ledger | **FAILED** (data-correctness half only) | `getRevenueToGovernment()` correctly resolves the standing Ministry wallet via `resolveMinistryWallet()`, groups by module/month with a documented LGA sub-breakdown (Stays/Marketplace/Tour) and the documented Tour split-bill undercount caveat — the sourcing and shape are correct. But its own independent `fromFilter`/`toFilter` pair (ministry.service.ts:139-140) has the identical CR-01 off-by-one bug, so revenue figures shown for the default/most-recent period are also undercounted. |
| 5 | Every Ministry dashboard report can be exported as CSV and as a formatted, Forest Green/Tropical Gold branded PDF | **FAILED** (PDF half, Visitor Entries report) | CSV export is fully verified: `CsvExportService` uses `fast-csv` with `alwaysWriteHeaders: true`, RFC4180-correct escaping tested against embedded commas/quotes/newlines. All 6 export routes exist, correctly guarded, respecting the active filter (D-14), and revenue export carries all 3 dimensions (byModule/byMonth/byModuleLga) in both CSV and PDF per the code-review-driven blocker fix. However CR-02 (confirmed unfixed) means the Visitor Entries PDF export will render overlapping/corrupted rows for any real (non-fixture) LGA UUID data — the "formatted, presentable PDF" bar is not met for that report on production data. |
| 6 | A `MINISTRY_VIEWER` query response never contains row-level PII (BVN, NIN, phone, name) — verified by an automated field-allowlist/schema-shape test, not by ad hoc review | VERIFIED | `VisitorLog` table has zero PII columns by construction (structural isolation, D-07). `ministry-pii-allowlist.spec.ts` implements a genuine dual scanner: `assertNoPiiKeys()` (recursive key-name denylist) AND `assertNoPiiValues()` (recursive value-canary scan using seeded `PII_CANARY_*` values) — both run against the real output of all 3 live query methods, plus independent negative-control tests proving each scanner is not a no-op (including the aliased-field-leak regression class the key-scanner alone would miss). All 51 ministry tests pass, including this spec. |

**Score:** 2/6 roadmap success criteria fully verified (SC1, SC6); 4/6 have confirmed, code-level defects (SC2, SC3, SC4 share the same date-filter bug; SC5 has a PDF-rendering defect for one of the three reports).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | `MINISTRY_VIEWER` enum value + `VisitorLog` model, zero PII columns | VERIFIED | Confirmed present; `VisitorLog` fields limited to `id, lgaId, lga, purpose, sourceType, sourceId, visitedAt, userRole, createdAt` — exactly D-07's spec |
| `backend/prisma/migrations/20260718000000_phase14_ministry_dashboard/migration.sql` | Hand-authored additive migration, `ALTER TYPE` before `CREATE TABLE` | VERIFIED | Correct ordering, no `DROP TYPE`, FK to `lgas` with `ON DELETE SET NULL` |
| `backend/src/common/enums/user-role.enum.ts` + `shared/src/types/index.ts` | `MINISTRY_VIEWER` synced in both | VERIFIED | Identical string value in both files plus schema.prisma (3-way sync, Pitfall 4 avoided) |
| `backend/src/common/services/visitor-log.service.ts` | Sole write path into `VisitorLog` | VERIFIED | Single `record()` method, no defensive try/catch inside (callers wrap it) |
| `backend/src/common/services/csv-export.service.ts` | RFC4180-correct CSV writer | VERIFIED | `fast-csv` `writeToString` with `alwaysWriteHeaders: true`; round-trip test with embedded comma/quote passes |
| `backend/src/modules/ministry/ministry.controller.ts` | GET-only Ministry routes, own controller | VERIFIED | 9 GET routes, zero mutation routes, class-level RBAC |
| `backend/src/modules/ministry/ministry.service.ts` | 3 aggregate query methods | PARTIAL (STUB-adjacent bug) | Methods exist, are correctly shaped and tested for structure, but contain the CR-01 date-boundary defect |
| `backend/src/common/services/ministry-pdf.service.ts` | Tabular branded PDF renderer, section-aware | PARTIAL (rendering defect) | Renders correctly for well-fitted content; CR-02 causes row overlap for UUID-length cells in narrow columns (Visitor Entries export specifically) |
| `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` | Dual key + value PII scanner | VERIFIED | Both scanners implemented, both exercised against live query output, both have negative controls |
| `web/src/app/admin/ministry/page.tsx` | Role-gated dashboard, 3 panels, 6 export buttons | VERIFIED (wiring) | Role gate correct (unauthenticated→`/login`, disallowed→`/`); 3 `useQuery` calls against correct routes; 6 export buttons wired to blob-download `handleExport()`; empty/error states match Copywriting Contract verbatim. Inherits CR-01's data-correctness defect via its default 30-day-to-today filter. |
| `web/src/components/admin/ministry/{VisitorEntriesChart,PurposeBreakdownChart,RevenueChart}.tsx` | Client-side aggregation, correct color rules, all backend dimensions reachable | VERIFIED | Forest-only fills on non-revenue charts, gold-only fills on RevenueChart; `VisitorEntriesChart` renders 3 stacked role-bucket series; `RevenueChart` renders all 3 of `byModule`/`byMonth`/`byModuleLga` as 3 sub-panels |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `events.service.ts` `checkin()` | `visitor-log.service.ts` | `.record().catch(...)` on VALID path only | VERIFIED | Confirmed at line 354-363; never called on NOT_FOUND/ALREADY_USED paths; failure swallowed via `.catch` |
| `stays.service.ts` `handleStayPayment()` | `visitor-log.service.ts` | `.record().catch(...)` after CONFIRMED, before emails | VERIFIED | Confirmed at line 276-285; `visitedAt: booking.checkIn` (future-dated, per D-02) |
| `tour-settlement.service.ts` `recordVisitorEntry()` | `visitor-log.service.ts` | called from both solo/group and split-bill-final branches only | VERIFIED | Confirmed at line 345-377; wrapped in try/catch, never throws; `lgaId: tourPackage?.lgaId ?? null` handles nullable LGA |
| `ministry.controller.ts` | `roles.guard.ts` | class-level `@UseGuards`+`@Roles` | VERIFIED | All 9 routes inherit the same guard; `ministry.controller.spec.ts` asserts `false` for non-Ministry roles, `true` for the 3 allowed |
| `ministry.controller.ts` | `csv-export.service.ts` / `ministry-pdf.service.ts` | injected, CommonModule-global | VERIFIED | Both services registered in `common.module.ts` providers+exports; controller constructor-injects both |
| `ministry.service.ts` | `settlement.service.ts` `resolveMinistryWallet()` | fresh resolution per call, no cache | VERIFIED | Called at top of `getRevenueToGovernment()`; null-wallet early-returns the empty shape without throwing |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Ministry module test suite (51 tests: service, controller RBAC, PII allowlist, PDF) | `npm test --workspace=backend -- ministry` | 4 suites, 51/51 passed | PASS |
| VisitorLog write-site + CSV + related regression tests (124 tests: visitor-log, csv-export, events, stays, tour-bookings, tour-settlement) | `npm test --workspace=backend -- visitor-log csv-export events.service stays.service tour-bookings.service tour-settlement.service` | 6 suites, 124/124 passed | PASS |
| Backend strict type-check | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | exits 0 | PASS |
| CR-01 code inspection (date filter) | Read `ministry.service.ts` lines 58-63, 139-140 | `toFilter` uses `<=` against `new Date(to)` (UTC midnight) in all 3 methods | CONFIRMS REVIEW FINDING — unfixed |
| CR-02 code inspection (PDF row overlap) | Read `ministry-pdf.service.ts` lines 125-150 + `ministry.controller.ts` `VISITOR_ENTRIES_COLUMNS` | `rowY` captured once per row, fixed `moveDown(0.4)` advance, no `heightOfString`/page-break logic; `lgaId` raw UUID column present in the PDF section | CONFIRMS REVIEW FINDING — unfixed |
| Dashboard default filter reproduces CR-01 | Read `web/src/app/admin/ministry/page.tsx` lines 24-32 | `defaultDateRange()` sets `to` = today's date-only string | CONFIRMS bug fires on every default page load |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| MIN-01 | 14-01, 14-03 | `MINISTRY_VIEWER` role, own controller, never shared with mutation endpoint | SATISFIED | Verified above (Truth 1) |
| MIN-02 | 14-03, 14-04, 14-05, 14-08 | Visitor entry counts by LGA + time period | BLOCKED (data-correctness) | CR-01 causes systematic undercounting |
| MIN-03 | 14-02, 14-03, 14-04, 14-05, 14-08 | Purpose-of-visit breakdown, new capture point | PARTIALLY SATISFIED | Capture point fully correct; report numbers affected by CR-01 |
| MIN-04 | 14-06, 14-08 | Revenue-to-government-share from Ministry wallet ledger | PARTIALLY SATISFIED | Sourcing/shape correct; numbers affected by CR-01 |
| MIN-05 | 14-02, 14-07, 14-08 | CSV export for every report | SATISFIED | CSV fully verified for all 3 reports |
| MIN-06 | 14-07, 14-08 | Branded PDF export for every report | BLOCKED (Visitor Entries report) | CR-02 corrupts the Visitor Entries PDF for real data |
| MIN-07 | 14-01, 14-06 | Zero row-level PII, automated test | SATISFIED | Verified above (Truth 6) |

No orphaned requirements — all 7 phase requirement IDs (MIN-01 through MIN-07) are declared across the 8 plans' frontmatter and cross-reference cleanly against `.planning/REQUIREMENTS.md`'s "Ministry Dashboard" section.

Note: `.planning/REQUIREMENTS.md`'s checkbox/traceability table (lines 46-52, 115-121) marks MIN-01/02/04/06/07 as `[ ] Pending` and MIN-03/05 as `[x] Complete` — this predates/was not updated alongside the phase's actual implementation and code review; it is stale bookkeeping, not independent evidence, and was not relied upon for this verification's conclusions.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/ministry/ministry.service.ts` | 60, 140 | Off-by-one date-range boundary (CR-01) | 🛑 Blocker | Silently undercounts every report by default |
| `backend/src/common/services/ministry-pdf.service.ts` | 125-150 | No height-aware table layout / page-break (CR-02) | 🛑 Blocker | Visitor Entries PDF export corrupts for real data |
| `backend/src/common/services/visitor-log.service.ts:25`, 3 call sites | — | `as any` cast bypasses Prisma compile-time verification (WR-01, review) | ⚠️ Warning | Future enum rename could fail silently at runtime instead of compile time |
| `backend/src/modules/tour-bookings/tour-settlement.service.ts:358-371` | — | `recordVisitorEntry()` silently no-ops if buyer lookup returns null (WR-02, review) | ⚠️ Warning | Under-counts Ministry data with no distinguishable operator signal |
| `backend/src/modules/ministry/dto/ministry-query.dto.ts`, `ministry.controller.ts` (revenue routes), `web/src/app/admin/ministry/page.tsx` | — | `lgaId` accepted on `/ministry/revenue*` but silently ignored; UI presents LGA as a shared filter above all 3 panels (WR-03, review) | ⚠️ Warning | A Ministry viewer filtering by LGA gets no indication the Revenue panel ignores it — not a roadmap SC violation (MIN-04's guaranteed dims are module+month only) but a UX-honesty gap |
| `web/src/app/admin/ministry/page.tsx:134` | — | Export `Blob` created without explicit MIME type (IN-01, review) | ℹ️ Info | Harmless today (download attribute forces save-as) |

No unresolved `TBD`/`FIXME`/`XXX` debt markers found in phase-14-modified files.

## Human Verification Required

See `human_verification` in frontmatter — 3 items requiring a running server + real/seeded data and a PDF/browser viewer, primarily to confirm the CR-01/CR-02 fixes (once applied) resolve the underlying defects visually/behaviorally, and to confirm branded PDF color fidelity.

## Gaps Summary

Phase 14 is architecturally and structurally complete: the `MINISTRY_VIEWER` role, its isolated controller, the `VisitorLog` capture pipeline (3 write sites, all correctly wired and tested), the PII-isolation guarantee (both structural and via a genuinely dual-scanner automated test), and the full read+export+UI surface all exist, are wired end-to-end, and pass 175 backend unit tests plus a clean `tsc --noEmit`. This is a strong implementation.

However, two confirmed, unfixed code-level defects (independently verified by direct source inspection, not by trusting SUMMARY.md or the prior code review alone) directly undermine the phase goal's literal wording:

1. **CR-01** — the date-range `to` filter drops nearly the entire final day of every query across all 3 report types, and does so on the dashboard's own default view (`to = today`). A government analytics dashboard whose numbers are silently wrong by default does not "show" accurate visitor/purpose/revenue analytics as the goal requires.
2. **CR-02** — the Visitor Entries PDF export will render overlapping, unreadable rows for any real (non-fixture) LGA UUID dataset. "Every report can be exported... as a formatted, presentable... branded PDF" is not true for this report on real data.

Both defects were already correctly identified in `.planning/phases/14-ministry-dashboard/14-REVIEW.md` as BLOCKER-severity findings; this verification independently confirms via direct code reading (not review-report trust) that neither has been fixed in the current codebase, and traces their downstream impact to the specific roadmap Success Criteria they invalidate (SC2, SC3, SC4, SC5). Everything else — RBAC isolation, PII isolation, CSV export, the write-side capture pipeline, and the web dashboard's wiring/UX — is genuinely solid and verified working.

---

*Verified: 2026-07-18T02:20:00Z*
*Verifier: Claude (gsd-verifier)*
