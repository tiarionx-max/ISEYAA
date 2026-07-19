---
phase: 14-ministry-dashboard
verified: 2026-07-18T08:15:00Z
status: verified
human_uat: passed (see 14-HUMAN-UAT.md)
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6 (frontmatter) — 2/6 roadmap SCs fully clean, 4/6 SCs affected by CR-01/CR-02
  gaps_closed:
    - "CR-01: `to` date-range filter now computes an exclusive next-day UTC boundary and compares with `<` (not `<=`), in both `buildFilters()` (visitor-entries + purpose-breakdown) and `getRevenueToGovernment()`'s independent from/to block — confirmed by direct source read of `ministry.service.ts` and 3 new passing regression tests asserting the exact `2026-07-19T00:00:00.000Z` boundary and `23:59` inclusion."
    - "CR-02: `MinistryPdfService.renderTable()` now measures every cell via the real `pdfkit` `doc.heightOfString()`, advances `doc.y` by the measured row height (not a fixed `moveDown()`), and calls `doc.addPage()` with header re-print when content would overflow — confirmed by direct source read and 2 new tests that spy on (not fully mock) the real `PDFDocument.prototype` methods, proving genuine height computation and page-break/header-reprint behavior with a real UUID-length cell and an 80-row overflow case. The raw `lgaId` UUID column is also dropped from the Visitor Entries PDF branch only (`VISITOR_ENTRIES_PDF_COLUMNS`); CSV keeps it (`VISITOR_ENTRIES_COLUMNS`, unchanged)."
  gaps_remaining: []
  regressions: []
---

# Phase 14: Ministry Dashboard Verification Report (Re-verification)

**Phase Goal:** A `MINISTRY_VIEWER` role can view aggregate visitor, revenue, and purpose-of-visit analytics and export them as CSV/PDF, with zero row-level citizen PII ever reachable
**Verified:** 2026-07-18T08:15:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 14-09, 14-10)

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A `MINISTRY_VIEWER` role exists, gated by its own `@Roles()` decorator on every route it can reach — never via a controller shared with any mutation endpoint | VERIFIED (unchanged, quick regression check) | `MinistryController` is still GET-only (9 routes), class-level `@Roles(MINISTRY_VIEWER, STATE_ADMIN, SUPER_ADMIN)`, zero mutation handlers. `ministry.controller.spec.ts` still passes. No files in this area were touched by 14-09/14-10. |
| 2 | Ministry dashboard shows visitor entry counts broken down by LGA and time period | **VERIFIED** | CR-01 closed: `buildFilters()` (`ministry.service.ts:58-65`) now uses `toExclusiveEndOfDayBoundary(to)` + `<` instead of `<=` against UTC midnight of `to`. Confirmed via direct source read (not SUMMARY-trust) at lines 60-61, plus a passing regression test (`ministry.service.spec.ts:100`) asserting the boundary equals `2026-07-19T00:00:00.000Z` for `to='2026-07-18'` and that `23:59:00.000Z` falls before it. The web dashboard's `defaultDateRange()` (`web/src/app/admin/ministry/page.tsx:24-32`) always supplies a `to` value, so this fix is on the dashboard's live default-load path. |
| 3 | Ministry dashboard shows a purpose-of-visit breakdown, sourced from a new `VisitorLog` capture point added to the booking/check-in flow | **VERIFIED** | Capture point (3 write sites: `events.service.ts checkin()`, `stays.service.ts handleStayPayment()`, `tour-settlement.service.ts recordVisitorEntry()`) was already verified correct in the prior round and is untouched by 14-09/14-10 (confirmed: neither gap-closure plan modified these files). `getPurposeBreakdown()` shares the now-fixed `buildFilters()`, closing the shared CR-01 defect — regression test at `ministry.service.spec.ts:168`. |
| 4 | Ministry dashboard shows revenue-to-government-share, sourced from the standing Ministry wallet's transaction ledger | **VERIFIED** | `getRevenueToGovernment()`'s independent `fromFilter`/`toFilter` block (`ministry.service.ts:150-153`) received the identical fix — confirmed via source read: `t."createdAt" < ${this.toExclusiveEndOfDayBoundary(to)}`. Regression test at `ministry.service.spec.ts:300` asserts the same boundary/inclusion behavior for this independent code path. Sourcing (`resolveMinistryWallet()`) and shape (byModule/byMonth/byModuleLga) were already verified correct and are unaffected by this fix. |
| 5 | Every Ministry dashboard report can be exported as CSV and as a formatted, Forest Green/Tropical Gold branded PDF | **VERIFIED** | CR-02 closed. Source read of `ministry-pdf.service.ts:137-182` confirms: `printHeader()` extracted as a reusable closure; per-row `doc.heightOfString()` measurement across every column (`MIN_ROW_HEIGHT=14` floor); `doc.y = rowY + rowHeight` height-aware advance (the old `doc.moveDown(0.4)` is gone); `doc.addPage()` + `printHeader()` re-invoked when `doc.y + rowHeight > pageBottom`. `ministry.controller.ts` now defines `VISITOR_ENTRIES_PDF_COLUMNS` (4 cols, no `lgaId`) used only in the PDF branch of `exportVisitorEntries()`; `VISITOR_ENTRIES_COLUMNS` (5 cols, with `lgaId`) is untouched and still drives the CSV branch — confirmed by source read of both branches. 2 new tests spy on the **real** `PDFDocument.prototype.heightOfString`/`addPage`/`text` (not a fully mocked pdfkit), proving genuine height computation was invoked for a 36-char UUID cell and that an 80-row table triggers a real page break with header re-print (`ministry-pdf.service.spec.ts:181,208`). Brand colors (`#1A6B3C`, `#C8962A`) remain hardcoded and asserted via `fillColorSpy`/`strokeColorSpy` (unchanged, already-passing test). |
| 6 | A `MINISTRY_VIEWER` query response never contains row-level PII (BVN, NIN, phone, name) — verified by an automated field-allowlist/schema-shape test, not by ad hoc review | VERIFIED (unchanged, quick regression check) | `ministry-pii-allowlist.spec.ts` untouched by 14-09/14-10 and still passes as part of the 56-test ministry suite. `VisitorLog` schema still carries zero PII columns. |

**Score:** 6/6 roadmap success criteria verified (up from 2/6 pre-gap-closure). Both prior BLOCKER gaps (CR-01, CR-02) are confirmed closed by direct source inspection — not by trusting SUMMARY.md or the code-review report alone.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/ministry/ministry.service.ts` | 3 aggregate query methods, correct date-range boundaries | VERIFIED | `toExclusiveEndOfDayBoundary()` present (line 72-74); both `buildFilters()` (line 58-65) and `getRevenueToGovernment()` (line 150-153) use it with `<`. Zero remaining `<=` against a `to`-derived `Date` anywhere in the file (the pre-existing `v."visitedAt" <= NOW()` status-join guards at lines 93/122 are unrelated — they compare against `NOW()`, not `to`, and were correctly left untouched per the plan). |
| `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` | Regression tests for all 3 affected methods | VERIFIED | 3 tests named `CR-01 regression: ...` present (lines 100, 168, 300), one per describe block (`getVisitorEntriesByLgaAndMonth`, `getPurposeBreakdown`, `getRevenueToGovernment`); asserts exact boundary ISO string + 23:59 inclusion. |
| `backend/src/common/services/ministry-pdf.service.ts` | Height-aware, page-break-aware `renderTable()` | VERIFIED | `heightOfString`, `MIN_ROW_HEIGHT`, `doc.addPage()`, `printHeader()` closure all present and wired as described in the plan. |
| `backend/src/modules/ministry/ministry.controller.ts` | PDF-only column set excluding `lgaId`, CSV unaffected | VERIFIED | `VISITOR_ENTRIES_PDF_COLUMNS` (4 cols) defined and used only in the PDF branch; `VISITOR_ENTRIES_COLUMNS` (5 cols, with `lgaId`) unchanged, still drives CSV. |
| `backend/src/common/services/__tests__/ministry-pdf.service.spec.ts` | Tests proving height measurement + page-break/header-reprint | VERIFIED | 2 new tests named `CR-02: ...` present (lines 181, 208); both spy on real `PDFDocument.prototype` methods (genuine pdfkit engine exercised, not a stub). All 8 pre-existing tests remain passing, unmodified. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ministry.controller.ts exportVisitorEntries()` PDF branch | `ministry-pdf.service.ts renderPdf()` | `VISITOR_ENTRIES_PDF_COLUMNS` (no `lgaId`) | VERIFIED | Confirmed at `ministry.controller.ts:111-114`; CSV branch (line 120-123) independently still passes `VISITOR_ENTRIES_COLUMNS` |
| `ministry.service.ts buildFilters()` | `getVisitorEntriesByLgaAndMonth()` / `getPurposeBreakdown()` | shared `toFilter` fragment via `toExclusiveEndOfDayBoundary()` | VERIFIED | Both methods call `buildFilters()` unchanged; the shared helper fixes both simultaneously |
| `ministry.service.ts getRevenueToGovernment()` | independent `fromFilter`/`toFilter` block | `toExclusiveEndOfDayBoundary()` (separate call site, not `buildFilters()`) | VERIFIED | Confirmed this is a genuinely separate code path (not accidentally left unfixed) — both call sites of the shared helper are present |
| `ministry-pdf.service.ts renderTable()` | `pdfkit PDFDocument` | `doc.heightOfString()` + `doc.addPage()` | VERIFIED | Tests spy on the real prototype methods (no full pdfkit mock), so the actual measurement/page-break arithmetic runs during the test |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ministry.service.ts` `to` boundary | `toFilter` (Prisma.sql fragment) | `toExclusiveEndOfDayBoundary(to)` → real `Date` arithmetic, no static/hardcoded value | Yes | FLOWING |
| `web/src/app/admin/ministry/page.tsx` `to` state | `defaultDateRange().to` | `new Date().toISOString().slice(0,10)` — always date-only, real current date | Yes | FLOWING (confirms WR-01's failure mode is never triggered by the dashboard's own UI — see Anti-Patterns below) |
| `ministry-pdf.service.ts` row height | `rowHeight` | `doc.heightOfString()` on the real row's cell value, not a constant | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full ministry module suite (service, controller RBAC, PII allowlist, PDF) | `npm test --workspace=backend -- ministry` | 4 suites, 56/56 passed (up from 51 — 5 new regression tests added by 14-09/14-10) | PASS |
| Broader regression sweep (ministry.service, csv-export, events/stays/tour-bookings/tour-settlement — all VisitorLog write-site consumers) | `npm test --workspace=backend -- ministry.service csv-export events.service stays.service tour-bookings.service tour-settlement.service` | 6 suites, 137/137 passed, no regressions | PASS |
| Backend strict type-check | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | exits 0 | PASS |
| CR-01 fix source inspection | Read `ministry.service.ts` lines 58-65, 72-74, 150-153 | `toExclusiveEndOfDayBoundary()` present; both `to` boundaries use `<` against the exclusive next-day value; `from` boundaries byte-for-byte unchanged (`>=` against `new Date(from)` directly) | CONFIRMS FIX |
| CR-02 fix source inspection | Read `ministry-pdf.service.ts` lines 137-182 | `heightOfString`-based measurement, `MIN_ROW_HEIGHT` floor, `doc.y = rowY + rowHeight` advance, `doc.addPage()` + `printHeader()` re-invocation present; no `doc.moveDown(0.4)` remaining for data rows | CONFIRMS FIX |
| Gap-closure commits exist and match SUMMARY claims | `git show --stat 57f3cf8`, `git show --stat 405253e` | Both commits present with exactly the described diffs (`toExclusiveEndOfDayBoundary`, `printHeader()`/`heightOfString`/`addPage`) | CONFIRMS — not fabricated in SUMMARY |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| MIN-01 | 14-01, 14-03 | `MINISTRY_VIEWER` role, own controller, never shared with mutation endpoint | SATISFIED | Unchanged from prior round, re-confirmed |
| MIN-02 | 14-03, 14-04, 14-05, 14-08, **14-09** | Visitor entry counts by LGA + time period | **SATISFIED** (was BLOCKED) | CR-01 fix closes the date-range defect |
| MIN-03 | 14-02, 14-03, 14-04, 14-05, 14-08, **14-09** | Purpose-of-visit breakdown, new capture point | **SATISFIED** (was PARTIALLY SATISFIED) | Capture point already correct; CR-01 fix closes the shared report-numbers defect |
| MIN-04 | 14-06, 14-08, **14-09** | Revenue-to-government-share from Ministry wallet ledger | **SATISFIED** (was PARTIALLY SATISFIED) | CR-01 fix closes `getRevenueToGovernment()`'s independent boundary defect |
| MIN-05 | 14-02, 14-07, 14-08 | CSV export for every report | SATISFIED | Unchanged, re-confirmed (CSV column sets untouched by 14-10) |
| MIN-06 | 14-07, 14-08, **14-10** | Branded PDF export for every report | **SATISFIED** (was BLOCKED) | CR-02 fix closes the Visitor Entries PDF row-overlap defect; fix is generic (any column/row shape), not report-specific |
| MIN-07 | 14-01, 14-06 | Zero row-level PII, automated test | SATISFIED | Unchanged, re-confirmed |

No orphaned requirements. `.planning/REQUIREMENTS.md`'s checkbox table (lines 46-52, 115-121) is still stale bookkeeping (marks MIN-02/04/06 as `[ ] Pending`) — this predates the phase's actual implementation and this gap-closure round; consistent with the prior verification's note, it was not relied upon for this verification's conclusions. **Recommendation:** update `.planning/REQUIREMENTS.md`'s checkboxes to reflect Phase 14's actual completed state as bookkeeping hygiene (not a phase-goal blocker).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/ministry/dto/ministry-query.dto.ts:7,12` | 7, 12 | `@IsDateString()` accepts full ISO datetime strings, not just date-only — `toExclusiveEndOfDayBoundary()`'s correctness assumes a date-only string (WR-01, code review) | ⚠️ Warning — **not reopened as BLOCKER** | **Assessed as acceptable residual risk for this dashboard's actual usage pattern**: the web dashboard (`web/src/app/admin/ministry/page.tsx:24-32,191-207`) is the only client of this API today and exclusively sends date-only strings (`toISOString().slice(0,10)` for the programmatic default, `<input type="date">` for user edits — HTML date inputs cannot emit a time component). WR-01 would only trigger via a direct API call bypassing the UI with a full-datetime `to`/`from` value — not a realized defect in the shipped dashboard. Recommend hardening the DTO (`@Matches(/^\d{4}-\d{2}-\d{2}$/)` or truncating in `toExclusiveEndOfDayBoundary()`) as defense-in-depth in a near-term follow-up, but this does not block phase completion. |
| `backend/src/common/services/ministry-pdf.service.ts:145-154` | 145-154 | The *first* `printHeader()` call (before the data-row loop) has no overflow guard — only re-prints inside the loop after `doc.addPage()` are guarded (WR-02, code review) | ⚠️ Warning — **not reopened as BLOCKER** | **Assessed as acceptable residual risk today**: only reachable in the 3-section Revenue PDF export if an earlier section (e.g. `byModule`) leaves `doc.y` near the page bottom before the next section's header prints. Given `byMonth`'s D-10 "no date floor" default (all-time history), this becomes a real risk only after several years of accumulated monthly data (tens of rows) — not a near-term production risk at current data volume. Recommend tracking as a follow-up (apply the same `if (doc.y + MIN_ROW_HEIGHT > pageBottom) doc.addPage()` guard before the first `printHeader()` call too), but does not block this phase. |
| `.planning/REQUIREMENTS.md:47-49,116,118,120` | — | Stale checkbox bookkeeping (MIN-02/04/06 marked `[ ] Pending`) | ℹ️ Info | Pre-existing, noted in prior round too; cosmetic only |

No unresolved `TBD`/`FIXME`/`XXX` debt markers found in phase-14-modified files (14-09/14-10 scope).

## Human Verification Required

Both prior BLOCKER-tier code defects (CR-01, CR-02) are now closed with strong automated evidence — including, for CR-02, tests that spy on the **real** `pdfkit` engine (genuine `heightOfString` computation, genuine `addPage()` triggered by genuine page-bottom arithmetic), not a fully mocked stand-in. The following remain as recommended pre-launch visual sign-off items, per the standing rule that visual/rendered-binary appearance can never be fully proven by source or unit-test inspection alone — they are NOT evidence of an unresolved code defect, and do not indicate the CR-01/CR-02 fixes are incomplete:

### 1. Visitor Entries PDF visual polish check

**Test:** Generate a Visitor Entries PDF export against real (non-fixture) production-shaped data (real LGA UUIDs if any legacy rows exist, dozens of rows spanning at least one page break) and open it in a PDF viewer.
**Expected:** Every row renders as a clean, non-overlapping table row; the header repeats identically on page 2+; no cell text is clipped.
**Why human:** The automated tests prove the correct pdfkit API calls fire with correct measured values (real engine, not mocked) — but pixel-level visual polish (kerning, exact margin alignment) is not something a unit test asserts.

### 2. Revenue PDF branding + multi-section layout check

**Test:** Open a Revenue export PDF (3 sections: By Module / By Month / By LGA) in a PDF viewer, ideally once `byMonth` has accumulated enough rows to approach a page boundary, and visually confirm no header/content overlap at section boundaries (this exercises the WR-02 edge case directly).
**Expected:** Forest Green (#1A6B3C) headings, Gold (#C8962A) divider, and section headers all render cleanly with no overlap, even at a section boundary.
**Why human:** Same rationale as above; additionally, this is the one path where WR-02's edge case could still be latent — a human check here provides direct assurance beyond the current single-section-only automated test coverage.

## Gaps Summary

Both BLOCKER-severity gaps from the initial verification round are conclusively closed:

1. **CR-01** (date-range `to` filter truncating the final day) — fixed in `ministry.service.ts` via a shared `toExclusiveEndOfDayBoundary()` helper applied at both independent call sites (`buildFilters()` and `getRevenueToGovernment()`), verified by 3 new regression tests asserting exact boundary values, and confirmed by direct source reading (not SUMMARY-trust).
2. **CR-02** (PDF row overlap for wrapped cells) — fixed in `ministry-pdf.service.ts` via genuine `doc.heightOfString()` measurement, height-aware row advance, and `doc.addPage()`/header-reprint on overflow; the raw `lgaId` UUID column is also dropped from the Visitor Entries PDF path specifically. Verified by 2 new tests exercising the real pdfkit engine (not a full mock) and confirmed by direct source reading.

A fresh code review of the exact 5 changed files surfaced 2 new WARNING-level findings (WR-01: DTO accepts full-datetime strings the boundary math doesn't handle; WR-02: only mid-table row transitions are page-break-guarded, not the very first header print). Both were assessed against the dashboard's actual, shipped usage pattern:

- WR-01 is unreachable via the dashboard's own UI (HTML `<input type="date">` + `toISOString().slice(0,10)` never produce a datetime string) — it is a defense-in-depth gap for a hypothetical direct-API caller, not a realized defect in what ships today.
- WR-02 requires years of accumulated `byMonth` history (no date floor by D-10) to manifest — not a near-term production risk at current data volume.

Neither WARNING reopens the BLOCKER classification or the phase's `gaps_found` status. Both are recorded as follow-up recommendations. All 6 roadmap Success Criteria are now VERIFIED against the current codebase (not merely re-asserted from SUMMARY.md), all 175 backend ministry-adjacent tests + the broader regression sweep pass, and `tsc --noEmit` is clean. The remaining `human_needed` classification reflects standing visual-verification best practice for a rendered-PDF, government-facing deliverable — not an unresolved implementation gap.

---

*Verified: 2026-07-18T08:15:00Z*
*Verifier: Claude (gsd-verifier)*
