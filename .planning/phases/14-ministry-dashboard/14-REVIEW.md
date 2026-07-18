---
phase: 14-ministry-dashboard
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - backend/src/modules/ministry/ministry.service.ts
  - backend/src/modules/ministry/__tests__/ministry.service.spec.ts
  - backend/src/common/services/ministry-pdf.service.ts
  - backend/src/modules/ministry/ministry.controller.ts
  - backend/src/common/services/__tests__/ministry-pdf.service.spec.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is a scoped re-review of the 14-09 and 14-10 gap-closure commits that fix the two BLOCKER findings from the prior full review (CR-01: UTC date-boundary truncation of the final day of every Ministry query range; CR-02: PDF row overlap when a cell wraps to a second line). Both fixes were traced against the pre-fix diffs (`57f3cf8`, `405253e`) and the new regression tests.

**CR-01 (date boundary) is correctly and completely fixed for the reported scenario.** `toExclusiveEndOfDayBoundary()` computes `to`'s UTC-midnight + 24h, and both call sites (`buildFilters()` for visitor-entries/purpose-breakdown, and the inline filter in `getRevenueToGovernment()`) now use `<` against that boundary instead of `<=` against `to` itself. For a date-only `to` string (e.g. `"2026-07-18"`), the boundary correctly resolves to `2026-07-19T00:00:00.000Z`, including every timestamp on the `to` date. This is verified by new regression tests covering all three query methods. One residual gap remains (WR-01 below) because the fix's correctness relies on an assumption the DTO does not actually enforce.

**CR-02 (PDF row overlap) is correctly fixed for the reported scenario and is well tested**, but the fix is not complete for every overlap-causing case the underlying PDF layout can hit. `renderTable()` now measures each row's height via `doc.heightOfString()` per cell, floors it at `MIN_ROW_HEIGHT`, advances `doc.y` by the measured height, and inserts a page break + header re-print whenever the *next data row* would overflow the page — this closes the originally reported UUID-wrapping-into-next-row defect, and the new tests (UUID-cell height measurement, 80-row single-section overflow with header re-print) demonstrate it. However, the **table header itself** has no equivalent overflow guard — see WR-02, which is the same defect class recurring at section boundaries in the multi-section Revenue PDF export.

No new crashes, security issues, or data-correctness regressions were introduced by either fix. The findings below are incomplete-fix / robustness gaps worth closing given the specific mandate to verify completeness.

## Warnings

### WR-01: CR-01 fix silently mis-computes the range boundary if `to`/`from` is a full ISO datetime rather than a date-only string

**File:** `backend/src/modules/ministry/ministry.service.ts:67-74`
**Issue:** `toExclusiveEndOfDayBoundary()`'s own comment states the fix's precondition: *"`to` is a date-only string (e.g. `'2026-07-18'`) that `new Date()` parses to UTC midnight."* That precondition is not enforced anywhere in the request pipeline. `MinistryQueryDto.to`/`.from` (`backend/src/modules/ministry/dto/ministry-query.dto.ts:7,12`) are validated with plain `@IsDateString()`, which — per `class-validator`'s default ISO-8601 rule — accepts full timestamps such as `"2026-07-18T15:00:00Z"`, not only `"YYYY-MM-DD"`.

If a caller supplies a full timestamp for `to`, `toExclusiveEndOfDayBoundary()` adds 24h to that exact instant rather than to UTC midnight of that date, e.g. `"2026-07-18T15:00:00Z"` → boundary `"2026-07-19T15:00:00Z"`. The filter then silently **includes** roughly a third of the next day's data while **excluding** the tail of the specified day after 15:00 — the same class of defect (silent truncation/inflation of a government revenue/visitor report) CR-01 was opened to fix, just triggered by a different (still DTO-valid) input shape. The `from` side has the mirrored issue: `>=` against the exact supplied instant rather than the day's start.

**Fix:** Enforce date-only input at the DTO boundary (defense in depth — don't rely solely on the service-layer comment/assumption):
```typescript
// ministry-query.dto.ts
import { Matches } from 'class-validator';

@ApiPropertyOptional({ description: 'Inclusive start of the visitedAt date range (YYYY-MM-DD)', example: '2026-01-01' })
@IsOptional()
@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be a date-only string (YYYY-MM-DD)' })
from?: string;

// same pattern for `to`
```
Or, if arbitrary ISO datetimes must remain valid input, normalize inside `toExclusiveEndOfDayBoundary()` by truncating to the date component before adding 24h:
```typescript
private toExclusiveEndOfDayBoundary(to: string): Date {
  const dateOnly = to.slice(0, 10); // "YYYY-MM-DD"
  return new Date(new Date(dateOnly).getTime() + 24 * 60 * 60 * 1000);
}
```

### WR-02: CR-02 fix does not page-break-guard the table header itself — only mid-table row transitions

**File:** `backend/src/common/services/ministry-pdf.service.ts:137-182`
**Issue:** `renderTable()`'s per-row loop correctly checks `if (doc.y + rowHeight > pageBottom)` before rendering each data row, and re-prints the header on the new page (`ministry-pdf.service.ts:170-174`). But the **initial** `printHeader()` call (line 154, before the loop) has no such check. `printHeader()` renders its column labels at explicit `(x, y)` coordinates (line 149), which in pdfkit bypasses the library's own automatic-pagination behaviour — unlike the flowing, no-coordinate `.text()` calls used for the document title (`render():85`) and section heading (`render():98`), which pdfkit will auto-paginate on its own.

Concretely, in the 3-section Revenue PDF export (`ministry.controller.ts:161-172`), if an earlier section — e.g. `byMonth`, which per D-10 covers *all historical data* when no `from`/`to` filter is supplied and can therefore grow to many dozens of rows as the platform accumulates years of operation — fills a page down to just above `pageBottom`, the next section's heading text may itself be protected by pdfkit's own flow logic, but the immediately-following `printHeader()` call for that section's table is not: it can render at or past the bottom margin, overlapping the page's bottom margin or subsequent content. This is the same defect class (overlapping/cut-off PDF content) CR-02 was raised to close, recurring at section boundaries instead of mid-table row boundaries. It is currently untested — the new tests in `ministry-pdf.service.spec.ts` only exercise a single-section 80-row overflow (which never reaches this code path, since the very first `printHeader()` call always has a fresh, empty page under it in that fixture).

**Fix:** Apply the same overflow guard used for data rows before the *first* `printHeader()` call too, not only the ones re-printed inside the loop after `addPage()`:
```typescript
private renderTable(doc: PDFKit.PDFDocument, section: MinistryPdfSection): void {
  if (section.rows.length === 0) {
    doc.fontSize(11).fillColor('#666').text('No data for this period.');
    return;
  }

  const colWidth = PAGE_WIDTH / section.columns.length;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const printHeader = (): void => { /* unchanged */ };

  // Guard the FIRST header print too — not just the ones already
  // re-printed after a mid-table addPage().
  if (doc.y + MIN_ROW_HEIGHT > pageBottom) {
    doc.addPage();
  }
  printHeader();
  // ...
}
```
Add a regression test asserting no header overlap when a multi-section document's earlier section leaves the cursor near the bottom margin before the next section's heading/table header is rendered (e.g. seed the first section with enough rows to land `doc.y` within one row-height of `pageBottom`, then assert `doc.addPage()` fires before the second section's header, not after it).

## Info

### IN-01: Duplicated from/to boundary-filter construction between `buildFilters()` and `getRevenueToGovernment()`

**File:** `backend/src/modules/ministry/ministry.service.ts:58-65` and `:150-153`
**Issue:** `getRevenueToGovernment()` re-implements the same `fromFilter`/`toFilter` construction pattern already factored into `buildFilters()`, differing only in the filtered column (`t."createdAt"` vs `v."visitedAt"`) and the absence of an `lgaFilter`. Both correctly reuse `toExclusiveEndOfDayBoundary()`, so this is not currently a correctness risk, but it is a maintenance hazard — a future date-boundary change applied to one location could easily be missed in the other (this nearly happened here: 14-09 had to patch both call sites by hand rather than through a single shared helper).
**Fix:** Extract a shared helper parameterized by column name, e.g. `private buildDateRangeFilter(column: Prisma.Sql, from?: string, to?: string)`, and call it from both `buildFilters()` and `getRevenueToGovernment()`.

---

_Reviewed: 2026-07-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
