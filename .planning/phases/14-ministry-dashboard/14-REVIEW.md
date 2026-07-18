---
phase: 14-ministry-dashboard
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - backend/package.json
  - backend/prisma/migrations/20260718000000_phase14_ministry_dashboard/migration.sql
  - backend/prisma/schema.prisma
  - backend/src/app.module.ts
  - backend/src/common/common.module.ts
  - backend/src/common/constants/visitor-purpose.constants.ts
  - backend/src/common/enums/user-role.enum.ts
  - backend/src/common/services/__tests__/csv-export.service.spec.ts
  - backend/src/common/services/__tests__/ministry-pdf.service.spec.ts
  - backend/src/common/services/__tests__/visitor-log.service.spec.ts
  - backend/src/common/services/csv-export.service.ts
  - backend/src/common/services/ministry-pdf.service.ts
  - backend/src/common/services/visitor-log.service.ts
  - backend/src/modules/events/__tests__/events.service.spec.ts
  - backend/src/modules/events/dto/purchase-ticket.dto.ts
  - backend/src/modules/events/events.service.ts
  - backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts
  - backend/src/modules/ministry/__tests__/ministry.controller.spec.ts
  - backend/src/modules/ministry/__tests__/ministry.service.spec.ts
  - backend/src/modules/ministry/dto/ministry-query.dto.ts
  - backend/src/modules/ministry/ministry.controller.ts
  - backend/src/modules/ministry/ministry.module.ts
  - backend/src/modules/ministry/ministry.service.ts
  - backend/src/modules/stays/__tests__/stays-isolation.spec.ts
  - backend/src/modules/stays/__tests__/stays.service.spec.ts
  - backend/src/modules/stays/dto/create-booking.dto.ts
  - backend/src/modules/stays/stays.service.ts
  - backend/src/modules/tour-bookings/__tests__/tour-bookings.service.spec.ts
  - backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts
  - backend/src/modules/tour-bookings/dto/create-tour-booking.dto.ts
  - backend/src/modules/tour-bookings/tour-bookings.service.ts
  - backend/src/modules/tour-bookings/tour-settlement.service.ts
  - shared/src/types/index.ts
  - web/src/app/admin/ministry/page.tsx
  - web/src/components/admin/ministry/PurposeBreakdownChart.tsx
  - web/src/components/admin/ministry/RevenueChart.tsx
  - web/src/components/admin/ministry/VisitorEntriesChart.tsx
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 14 adds the Ministry Dashboard: a new `VisitorLog` table + write path fed
from Events/Stays/Tour confirmation points, a read-only `MinistryController`
(3 aggregate query routes + 6 CSV/PDF export routes), CSV/PDF export services,
and a Next.js dashboard page with 3 recharts panels. Test coverage across the
new module is unusually thorough (RBAC negative tests, a dual PII-allowlist
scanner, wallet-invariant regression tests inherited from the write sites,
SQL-fragment assertions for the conditional filters). RBAC (`@Roles`), the
`MinistryController`'s GET-only surface, and PII exclusion (`VisitorLog` has
no PII columns, confirmed by an automated scanner) are all solid.

However, two correctness bugs were found that affect the accuracy of every
report the dashboard produces, plus several smaller robustness/consistency
gaps:

1. The `to` date filter used by all 3 Ministry query methods (and all 6
   export routes) is documented as "inclusive" but is implemented as a
   plain `<=` comparison against a date-only string parsed to UTC midnight —
   which excludes almost the entire final day of every requested range,
   including "today" in the dashboard's own default view.
2. `MinistryPdfService`'s hand-rolled table renderer allocates a fixed
   column width with no wrapped-content height tracking or page-break
   logic; the Visitor Entries PDF export renders a raw LGA UUID in a column
   far too narrow for it, which will wrap and then overlap the following
   row's content for any real (non-fixture) dataset.

## Critical Issues

### CR-01: Ministry date-range `to` filter silently excludes the entire final day (including "today" in the default view)

**File:** `backend/src/modules/ministry/ministry.service.ts:60, 140`
**Also affects:** `backend/src/modules/ministry/dto/ministry-query.dto.ts:10-13`, `web/src/app/admin/ministry/page.tsx:24-32`

**Issue:** `MinistryQueryDto.to` is documented as "Inclusive end of the
visitedAt date range (ISO 8601)" and the service's own comment for
`getRevenueToGovernment` states "from/to, when supplied, bound
`Transaction.createdAt` **inclusively**". The implementation is:

```ts
const toFilter = to ? Prisma.sql`AND v."visitedAt" <= ${new Date(to)}` : Prisma.empty;
// getRevenueToGovernment:
const toFilter = to ? Prisma.sql`AND t."createdAt" <= ${new Date(to)}` : Prisma.empty;
```

When `to` is a date-only string such as `2026-07-18` (exactly what the DTO's
own `@ApiPropertyOptional example: '2026-12-31'` shows, and what the frontend
sends — see `defaultDateRange()` in `page.tsx`, which sets `to =
new Date().toISOString().slice(0, 10)`), `new Date(to)` parses to
`2026-07-18T00:00:00.000Z`. The `<=` comparison therefore excludes every
row with a `visitedAt`/`createdAt` timestamp later than midnight UTC on the
`to` date — i.e. essentially the *entire* final day is dropped, not just
excluded-after-inclusive-end.

This is not a hypothetical edge case: it is the **default** behaviour of the
dashboard on every page load (`from = 30 days ago`, `to = today`), so
"today's" visitor entries, purpose breakdown, and revenue are always missing
from the numbers a Ministry viewer sees, and the same truncation applies to
the last day of any custom range and to every CSV/PDF export. None of the
new tests catch this — `ministry.service.spec.ts`'s filter tests only assert
that `executed.values` contains `expect.any(Date)`, never that the boundary
day is actually included.

**Fix:** Push the `to` boundary to the end of the given day (or make the
comparison exclusive of the *next* day) before interpolating it into the SQL:

```ts
private buildFilters(from?: string, to?: string, lgaId?: string) {
  const fromFilter = from ? Prisma.sql`AND v."visitedAt" >= ${new Date(from)}` : Prisma.empty;
  const toFilter = to
    ? Prisma.sql`AND v."visitedAt" < ${new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000)}`
    : Prisma.empty;
  const lgaFilter = lgaId ? Prisma.sql`AND v."lgaId" = ${lgaId}` : Prisma.empty;
  return { fromFilter, toFilter, lgaFilter };
}
```

Apply the equivalent change to the `fromFilter`/`toFilter` pair inside
`getRevenueToGovernment`. Add a regression test that seeds a row with a
timestamp late on the `to` date (e.g. `23:59:00`) and asserts it is included.

---

### CR-02: `MinistryPdfService.renderTable` overlaps rows for real (UUID-length) cell content — Visitor Entries PDF export is unreadable for production data

**File:** `backend/src/common/services/ministry-pdf.service.ts:125-150`
**Also affects:** `backend/src/modules/ministry/ministry.controller.ts:21-27` (`VISITOR_ENTRIES_COLUMNS` includes a raw `lgaId` UUID column)

**Issue:** `renderTable` divides the page width evenly across
`section.columns.length` and renders each cell with
`doc.text(value, x, rowY, { width: colWidth })`, where `rowY` is captured
**once** before the per-column `forEach` loop, and the next row's position
is advanced by a fixed `doc.moveDown(0.4)` after the loop — not by however
tall the tallest cell in that row actually rendered.

`VISITOR_ENTRIES_COLUMNS` (used for **both** the CSV and PDF `visitor-entries`
export) has 5 columns, giving each a width of `495 / 5 ≈ 99pt`. The first
column is `{ key: 'lgaId', label: 'LGA ID' }`, which in production always
holds a full UUID (36 characters, ≈ 200pt+ at 10pt Helvetica) — more than
double the allocated column width. PDFKit will word-wrap that cell onto a
second line, but `renderTable` has no logic to measure the resulting height
and account for it before computing the next row's `rowY`; the next row will
begin at a fixed offset that does not reserve space for the wrapped second
line, so its content will render on top of (overlapping) the previous row's
wrapped LGA ID text.

This is guaranteed to reproduce for any real dataset — it is not an edge
case triggered only by unusual input. All of `ministry-pdf.service.spec.ts`'s
fixtures use short placeholder IDs (`'lga-1'`), so the test suite never
exercises this path and the defect is currently invisible to CI. There is
also no page-break/height-tracking logic anywhere in `renderTable` for
row counts large enough to span multiple A4 pages (e.g. 20 LGAs × 12 months
× several role buckets for a year of visitor-entries data) — column headers
are never re-printed on a continuation page either.

**Fix:** At minimum, drop the raw `lgaId` column from the **PDF** section
(keep it in the CSV export, where column width doesn't matter) — `lgaName`
already carries the human-readable identity. More robustly, replace the
manual `x/y` bookkeeping with height-aware layout: measure each cell via
`doc.heightOfString(value, { width: colWidth })`, take the row's max height,
advance `doc.y` by that amount, and call `doc.addPage()` (re-emitting the
header row) whenever the next row would exceed `doc.page.height -
doc.page.margins.bottom`. Add a `MinistryPdfService` test with a
UUID-length value in a narrow multi-column section, and a test with enough
rows to force a page break.

## Warnings

### WR-01: `VisitorLogService.record()` and all 3 call sites bypass Prisma's compile-time type checking via `as any`

**File:** `backend/src/common/services/visitor-log.service.ts:25`
**Also affects:** `backend/src/modules/events/events.service.ts:361`, `backend/src/modules/stays/stays.service.ts:283`, `backend/src/modules/tour-bookings/tour-settlement.service.ts:370`

**Issue:** `VisitorLogService.record()` writes with
`this.prisma.visitorLog.create({ data: input as any })`. The `input` shape
already matches Prisma's generated `VisitorLogCreateInput` (all fields are
direct scalars — `lgaId`, `purpose`, `sourceType`, `sourceId`, `visitedAt`,
`userRole`; there is no relation-connect syntax needed), so the `as any`
cast is unnecessary and throws away Prisma's compile-time verification that
the object actually satisfies the required-field/enum-shape contract. Every
call site compounds this by also casting the role value with
`... .role as any` (using the local `common/enums/user-role.enum.ts`
`UserRole`, not Prisma's generated enum type). Today the string values
happen to line up, but a future rename/refactor of either enum would fail
silently at runtime (a Prisma validation error swallowed by each caller's
catch block) instead of at compile time.

**Fix:** Remove the `as any` on the `create()` call and type `record()`'s
`userRole` parameter as `PrismaUserRole` (`import { UserRole as
PrismaUserRole } from '@prisma/client'`) so a real mismatch surfaces as a
TypeScript error instead of a silently-caught runtime failure.

### WR-02: `TourSettlementService.recordVisitorEntry` silently drops the VisitorLog write if the buyer lookup returns null

**File:** `backend/src/modules/tour-bookings/tour-settlement.service.ts:352-371`

**Issue:** `recordVisitorEntry` does a fresh `prisma.user.findUnique({ where:
{ id: booking.buyerUserId }, select: { role: true } })` and passes
`buyer?.role as any` straight into `VisitorLogService.record()`. `userRole`
is a required (`NOT NULL`) column on `VisitorLog` with no default. If the
lookup ever returns `null` — e.g. after a future hard-delete implementation
of the NDPA "right to erasure" requirement called out in `CLAUDE.md`, or any
other referential-integrity gap — `userRole` becomes `undefined`, the
`prisma.visitorLog.create()` call throws, and the surrounding `try/catch`
swallows it with a single generic `logger.error` line indistinguishable
from a transient DB outage. The result is a silently under-counted Ministry
dashboard with no operator-facing signal that a specific booking's visit was
never recorded. (Contrast with `events.service.ts` / `stays.service.ts`,
where the role is already selected as part of the same query that resolves
the confirmation record, so it can't independently be missing.)

**Fix:** Guard explicitly and log distinctly when `buyer` is null (e.g.
`if (!buyer) { this.logger.warn(...); return; }`) so a missing-user
condition is diagnosable separately from a database failure, rather than
attempting — and predictably failing — the `create()` call.

### WR-03: `lgaId` filter is silently ignored by the Revenue panel/routes despite being presented as a global filter

**File:** `backend/src/modules/ministry/dto/ministry-query.dto.ts:15-18`, `backend/src/modules/ministry/ministry.controller.ts:84-88, 142-145`
**Also affects:** `web/src/app/admin/ministry/page.tsx:116-124, 130`

**Issue:** `MinistryQueryDto.lgaId` is documented generically as "LGA UUID to
filter results to a single LGA" and is accepted (whitelisted, not rejected)
on every Ministry route including `GET /ministry/revenue` and `GET
/ministry/revenue/export`. Neither `MinistryController.getRevenue` nor
`exportRevenue` passes `query.lgaId` through to
`ministryService.getRevenueToGovernment(query.from, query.to)` — it is
silently dropped. The frontend mirrors this: the "LGA" `<select>` in
`page.tsx` sits above all three report panels as one shared filter, but the
Revenue panel's `useQuery`/`handleExport` calls never include `lgaParam`.
A Ministry viewer who picks an LGA and only looks at the Revenue panel has
no indication that the figures shown are state-wide, not LGA-scoped —
which is exactly the kind of silent-scope mismatch a financial/government
report should never have.

**Fix:** Either surface the limitation in the UI (disable/grey out the LGA
selector's effect on the Revenue panel with a short caption, e.g. "Revenue
is not LGA-filterable — see By LGA breakdown below"), or narrow
`MinistryQueryDto` per-route (a `RevenueQueryDto` without `lgaId`) so
Swagger correctly reflects that `GET /ministry/revenue*` never accepts it.

## Info

### IN-01: Export `Blob` created without a MIME type

**File:** `web/src/app/admin/ministry/page.tsx:134`
**Issue:** `handleExport` builds `new Blob([response.data])` without passing
a `type` (e.g. `'text/csv'` / `'application/pdf'`), relying entirely on the
`download` attribute + hardcoded filename extension for correct save
behaviour. Harmless today since the anchor's `download` attribute forces a
save-as, but any future change that opens the blob URL directly (e.g. an
in-tab PDF preview) would need this fixed first.
**Fix:** Pass the content type explicitly, e.g. `new Blob([response.data],
{ type: format === 'pdf' ? 'application/pdf' : 'text/csv' })`.

---

_Reviewed: 2026-07-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
