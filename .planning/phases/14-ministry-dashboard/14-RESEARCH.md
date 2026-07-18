# Phase 14: Ministry Dashboard - Research

**Researched:** 2026-07-18
**Domain:** NestJS read-only analytics module, PII-isolation-by-construction, pdfkit tabular export, Prisma additive enum migration
**Confidence:** HIGH (all core findings verified directly against this repo's source — not training-data guesses)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visitor entry capture (MIN-02)**
- D-01: Three flows count as a "visitor entry": Events (QR check-in scan, `Ticket.usedAt`), Stays (booking check-in date), Tour Packages (scheduled tour date). Marketplace, Transport, Delivery excluded — commercial transactions, not tourism visits.
- D-02: For Stays and Tour Packages (no physical scan moment), the entry counts once the booking's scheduled date is reached AND status is not cancelled/refunded — `status != CANCELLED AND (checkIn date OR tour date) <= now`. No new status machinery.
- D-03: All time-period breakdowns use monthly buckets, matching `AdminService.getRevenue()`'s `TO_CHAR(createdAt, 'YYYY-MM')` pattern, with optional `from`/`to` date-range filter. No day/week granularity selector.
- D-04: Visitor entry counts get a secondary breakdown by `User.role` (TOURIST vs CITIZEN vs other) alongside LGA + time dimensions.

**Purpose-of-visit taxonomy (MIN-03)**
- D-05: Explicit taxonomy: Tourism/Leisure, Business, Religious/Pilgrimage, Family/Personal, Event Attendance, Education, Other. Not hardcoded into report/query logic.
- D-06: Field is optional at checkout on all three booking flows, pre-filled with a per-booking-type default (Event ticket → "Event Attendance", Tour → "Tourism/Leisure", Stays → "Tourism/Leisure" unless overridden).
- D-07: New `VisitorLog` table — one row per counted entry, columns: `lgaId`, `purpose`, `sourceType`, `sourceId`, `visitedAt`, `userRole`. No BVN/NIN/phone/name columns at all — structural PII isolation.
- D-08: `VisitorLog` rows written via inline direct calls to a new global `VisitorLogService` (CommonModule-style, directly injected) from the three confirmation points — NOT `@OnEvent`. `EventEmitter2` stays reserved for third-party webhook decoupling.

**Revenue-to-government-share (MIN-04)**
- D-09: Guaranteed breakdown dimensions: by settled module + by month (`Transaction.metadata.sourceType`/module, from Ministry wallet ledger). LGA breakdown added only where the source record naturally carries one (Stays via `Property.lgaId`, Marketplace via `Vendor.lgaId`, Tour via package LGA) — not forced onto Transport/Delivery.
- D-10: MIN-04 includes all historical Ministry wallet transactions back to Phase 12/13 go-live — not scoped to post-Phase-14. Transport/Delivery will show near-zero revenue until their `*.settlement_engine_enabled` flags flip (pre-existing condition, not a Phase 14 defect).
- D-11: Visitor-entry counts (`VisitorLog`) and revenue (`Transaction` ledger) are separate, independent panels — no derived "revenue-per-visitor" metric.

**Export scope & report structure (MIN-05, MIN-06)**
- D-12: All three reports independently exportable as both CSV and PDF.
- D-13: PDF exports reuse `itinerary-pdf.service.ts`'s branded shell (pdfkit, Forest Green/Gold). Report body (tabular, not narrative) needs new rendering logic.
- D-14: CSV/PDF exports respect whatever LGA/date-range filter is active on the dashboard at export time.

### Claude's Discretion
Category names in D-05's taxonomy, the exact default-purpose mapping in D-06, and the precise CSV column ordering are open to refinement during planning/implementation as long as they stay consistent with D-01 through D-14.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. MIN-08 (scheduled/recurring export delivery) and MIN-09 (seasonal/LGA heatmap) were already flagged deferred-to-v2 in REQUIREMENTS.md and were not re-litigated.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIN-01 | `MINISTRY_VIEWER` role, gated by `@Roles()` individually on every route it can reach — never via a controller shared with any mutation endpoint | See "Pitfall: AdminController mixes read + mutation routes" and "Architecture Patterns — New MinistryModule" below. `RolesGuard`/`@Roles()` pattern confirmed at `backend/src/common/guards/roles.guard.ts` |
| MIN-02 | Visitor entry counts by LGA + time period | `AdminService.getRevenue()` query pattern mirrored exactly in "Code Examples"; `VisitorLog.lgaId` is direct (no join needed) |
| MIN-03 | Purpose-of-visit breakdown, sourced from new capture point | `VisitorLog.purpose` column (D-07); write sites identified exactly in "Data-Capture Touchpoints" |
| MIN-04 | Revenue-to-government-share from Ministry wallet transaction ledger | `SettlementService.resolveMinistryWallet()` + `Transaction.metadata.module` values enumerated exactly in "Revenue Query Shape" |
| MIN-05 | CSV export for every report | No existing CSV library in repo — `fast-csv` recommended, see "Standard Stack" |
| MIN-06 | Branded PDF export (Forest Green/Gold) | `itinerary-pdf.service.ts` full shell reviewed; reusable vs. new-code split documented in "PDF Export Pattern" |
| MIN-07 | Zero row-level PII reachable, verified by automated test | Full concrete test pattern in "PII Isolation — Field-Allowlist Test Pattern" (the phase's hardest constraint) |
</phase_requirements>

## Summary

Phase 14 is a pure read/export addition on top of Phase 12/13's settlement foundation — no new payment plumbing, no new wallet mutations. The codebase already contains two directly-mirrorable templates: `AdminService.getRevenue()`'s `$queryRaw` monthly-bucket + LGA-join pattern (`backend/src/modules/admin/admin.service.ts`) for the aggregate queries, and `ItineraryPdfService`'s pdfkit branded shell (`backend/src/common/services/itinerary-pdf.service.ts`) for the PDF export header/footer/colors. Neither existing pattern covers CSV export or PII-isolation testing — both are net-new to this phase.

The single highest-risk implementation detail is **not** the query logic — it's that `AdminController` today mixes read-only KPI routes with mutation routes (`PATCH /admin/users/:id/status`, `PATCH /admin/config/:key`) in the same controller class. MIN-01's literal wording ("never via a controller shared with any mutation endpoint") means Ministry Dashboard **cannot** be added as new methods on `AdminController` — it needs its own `MinistryController` in a new `MinistryModule`, guarded independently. This is a structural decision the planner must make explicit, not an incidental detail.

The second highest-risk detail is that `UserRole` is defined in **three places** that must all gain `MINISTRY_VIEWER` in the same PR: the Prisma schema enum (via `ALTER TYPE ADD VALUE`, following the exact Phase 9 `TOUR_GUIDE` precedent), `backend/src/common/enums/user-role.enum.ts` (the TypeScript enum actually used by `@Roles()` decorators), and potentially `shared/src/types/index.ts` if any client-side role-based UI gating needs it (the phase has a UI hint = yes).

Third, `VisitorLog`'s write-time mechanics for Stays and Tour Packages are less obvious than D-08's wording ("written inline... at check-in") suggests: neither module has a literal check-in scan. Both write at **payment confirmation time** (`StaysService.handleStayPayment()`, `TourSettlementService.handleTourBookingPaymentEvent()`) with a **future-dated** `visitedAt` (the booking's scheduled `checkIn`/`tourDate`), and D-02's "entry counts once the date is reached AND not cancelled" becomes a query-time filter (`WHERE visitedAt <= now()`) — which creates a real edge case (a booking cancelled *after* confirmation but *before* the scheduled date would still show as a future/past visitor entry unless the cancellation path also deletes/voids the row). This needs an explicit plan decision, documented under Pitfalls below.

**Primary recommendation:** Build a standalone `MinistryModule` (new controller, new service, new `VisitorLogService` in `CommonModule`) that reuses `AdminService.getRevenue()`'s raw-SQL monthly-bucket pattern for all three reports, reuses `ItineraryPdfService`'s branded shell for PDF headers/footers only (new tabular body renderer), adds `fast-csv` for CSV, and enforces PII isolation structurally (VisitorLog has no PII columns at all) plus a Prisma `select`-allowlist + recursive-key-denylist Jest test on every Ministry endpoint.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `MINISTRY_VIEWER` role + RBAC gate | API / Backend | — | `@Roles()` + `RolesGuard` is a backend-only guarantee; any client-side role check (as seen in `web/src/app/admin/tours/revenue/page.tsx`'s `ALLOWED_ROLES` array) is UX convenience only, never the enforcement point |
| `VisitorLog` write (capture) | API / Backend | Database | Written inline from `EventsService.checkin()`, `StaysService.handleStayPayment()`, `TourSettlementService.handleTourBookingPaymentEvent()` — all backend service methods; persisted to Postgres via Prisma |
| Visitor/revenue aggregation queries | API / Backend | Database | `$queryRaw` monthly-bucket + LGA-join logic lives in a new `MinistryService`, mirroring `AdminService.getRevenue()`; Postgres does the actual GROUP BY/aggregation work |
| PII isolation guarantee | API / Backend | Database (schema) | Structural: `VisitorLog` table has no PII columns (D-07) at the DB tier; the API tier's `select` clauses on `Transaction`/`User` joins are the second line of defense — both tiers must cooperate |
| CSV/PDF rendering | API / Backend | — | `fast-csv` (new) and `pdfkit` (existing) both run server-side; response streamed to client, no client-side rendering |
| Ministry dashboard UI (charts, filters, export buttons) | Frontend Server (SSR)/Client | API / Backend | Next.js `'use client'` page (mirroring `web/src/app/admin/tours/revenue/page.tsx`) fetches from the new Ministry API via TanStack Query; recharts renders client-side |

## Standard Stack

### Core (already installed — verified against `backend/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pdfkit` | ^0.19.1 [VERIFIED: backend/package.json:62] | PDF generation, no headless Chrome | Already the project's sole PDF library (`itinerary-pdf.service.ts`); npm registry confirms 0.19.1 exists [VERIFIED: npm view pdfkit] |
| `@prisma/client` / `prisma` | 5.11.x [VERIFIED: backend/package.json] | ORM, raw SQL escape hatch (`$queryRaw`) for GROUP BY aggregates | Existing project ORM; `AdminService.getRevenue()` already proves the `$queryRaw` monthly-bucket pattern works at this Prisma version |
| `class-validator` / `class-transformer` | 0.14.x / 0.5.x [VERIFIED: backend/package.json] | DTO validation for the `from`/`to`/`lgaId` query-param filters | Existing project-wide validation pipeline |

### Supporting (net-new to this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fast-csv` | 5.0.7 [VERIFIED: npm view fast-csv version, published 2026-05-06] | CSV writer with RFC4180-correct escaping (commas/quotes/newlines in values) | All three MIN-05 CSV exports — `fast-csv`'s `format()` API takes an array of flat objects and streams/returns a CSV string; simpler API than `json2csv` for this repo's needs and actively maintained (last publish ~2 months before research date) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fast-csv` | Hand-rolled `.join(',')` CSV writer | Rejected — CSV field escaping (embedded commas, quotes, newlines in e.g. LGA names or purpose labels) is exactly the kind of "looks trivial, silently corrupts data" problem `CLAUDE.md`'s spirit and this project's Don't-Hand-Roll pattern warns against |
| `fast-csv` | `json2csv` / `@json2csv/plainjs` | `json2csv` (root package) is in de-facto maintenance mode, split into `@json2csv/*` scoped packages [VERIFIED: npm view @json2csv/plainjs version = 7.0.7]; `fast-csv` has a simpler single-purpose API and no scoped-package migration confusion |
| New tabular PDF renderer | Reuse `itinerary-pdf.service.ts` unmodified | Rejected per D-13 — the existing service is hardcoded to a single-booking narrative layout (title block + itinerary list), not a multi-row table; only the branded shell (colors, header, footer, `PDFDocument` options) is reusable, not the body-rendering methods |
| S3-upload-then-return-URL (itinerary PDF's pattern) | Direct streamed response (`@Res()` + `Content-Disposition: attachment`) | Ministry exports are on-demand ad-hoc downloads of live filtered data (not persisted-per-booking artifacts like itineraries) — streaming avoids unnecessary S3 storage cost and staleness; no existing direct-download precedent in this repo, but `ai.controller.ts` proves `@Res()` raw response manipulation is an established pattern for non-standard response types |

**Installation:**
```bash
npm install fast-csv --workspace=backend
```

**Version verification:** `npm view fast-csv version` → `5.0.7`, `npm view fast-csv time.modified` → `2026-05-06T18:40:58.181Z` (fresh, actively maintained). `npm view pdfkit version` → `0.19.1`, matches `backend/package.json`'s `^0.19.1` — no upgrade needed.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │  Three existing confirmation points          │
                     │  (unchanged control flow, one new call each) │
                     │                                               │
  Event QR scan ────▶│  EventsService.checkin()          (line 319) │──┐
  Stays payment ok ─▶│  StaysService.handleStayPayment() (line 256) │──┤
  Tour payment ok ──▶│  TourSettlementService                       │──┤
                     │    .handleTourBookingPaymentEvent()(line 102)│  │
                     └─────────────────────────────────────────────┘  │
                                                                        ▼
                                                          ┌──────────────────────┐
                                                          │ VisitorLogService     │
                                                          │ (new, CommonModule,   │
                                                          │  direct injection)    │
                                                          └──────────┬───────────┘
                                                                     ▼
                                                          ┌──────────────────────┐
                                                          │ VisitorLog table      │
                                                          │ (new — NO PII cols)   │
                                                          └──────────┬───────────┘
                                                                     │
  MINISTRY_VIEWER ──▶ GET /ministry/visitor-entries ─────┐          │
  (JWT + RolesGuard)  GET /ministry/purpose-breakdown ───┤          │
                       GET /ministry/revenue ────────────┤          │
                       GET /ministry/*/export?format=csv ┤          │
                       GET /ministry/*/export?format=pdf ┘          │
                                    │                                │
                                    ▼                                ▼
                       ┌─────────────────────────┐    ┌─────────────────────────┐
                       │ MinistryController        │    │ MinistryService          │
                       │ (own controller — NEVER    │───▶│ - $queryRaw monthly-     │
                       │  shares class w/ mutation  │    │   bucket + LGA-join      │
                       │  endpoints, MIN-01)        │    │   (mirrors AdminService  │
                       └─────────────────────────┘    │   .getRevenue())         │
                                                          │ - reads VisitorLog       │
                                                          │ - reads Transaction via  │
                                                          │   resolveMinistryWallet()│
                                                          └──────────┬───────────┘
                                                                     │
                                          ┌──────────────────────────┴───────────────────────┐
                                          ▼                                                     ▼
                             ┌────────────────────────┐                        ┌─────────────────────────┐
                             │ CsvExportService (new)   │                        │ MinistryPdfService (new) │
                             │ fast-csv format()         │                        │ reuses branded shell of  │
                             │                            │                        │ ItineraryPdfService;     │
                             │                            │                        │ new tabular body render  │
                             └────────────────────────┘                        └─────────────────────────┘
                                          │                                                     │
                                          └──────────────────────┬──────────────────────────────┘
                                                                  ▼
                                                    Streamed HTTP response
                                                    (Content-Disposition: attachment)
```

### Recommended Project Structure
```
backend/src/
├── common/
│   └── services/
│       ├── visitor-log.service.ts       # new — write-side, CommonModule
│       └── ministry-pdf.service.ts      # new — tabular PDF body renderer (reuses ItineraryPdfService's shell constants)
├── modules/
│   └── ministry/                        # new module — MIN-01's "own controller" requirement
│       ├── ministry.module.ts
│       ├── ministry.controller.ts       # ONLY GET routes, MINISTRY_VIEWER-gated
│       ├── ministry.service.ts          # $queryRaw aggregates, mirrors AdminService.getRevenue()
│       ├── dto/
│       │   └── ministry-query.dto.ts    # from/to/lgaId/format query params
│       └── __tests__/
│           ├── ministry.service.spec.ts
│           └── ministry-pii-allowlist.spec.ts   # MIN-07's automated proof
```

### Pattern 1: Monthly-bucket + LGA-join raw SQL (mirror of `AdminService.getRevenue()`)
**What:** `$queryRaw` with `TO_CHAR(createdAt, 'YYYY-MM')` grouping, joined to the LGA table via the module's natural FK path.
**When to use:** All three MIN-02/MIN-04 breakdown queries.
**Example (visitor entries by LGA + month — VisitorLog has `lgaId` directly, no join needed, simpler than revenue):**
```typescript
// Source: mirrors backend/src/modules/admin/admin.service.ts:59-89 (AdminService.getRevenue byLga/byMonth pattern)
async getVisitorEntriesByLgaAndMonth(from?: string, to?: string) {
  return this.prisma.$queryRaw<{ lgaId: string; lgaName: string; month: string; count: number }[]>`
    SELECT v."lgaId", l.name AS "lgaName",
           TO_CHAR(v."visitedAt", 'YYYY-MM') AS month,
           COUNT(*)::int AS count
    FROM visitor_logs v
    JOIN lgas l ON v."lgaId" = l.id
    WHERE v."visitedAt" <= NOW()
      ${from ? Prisma.sql`AND v."visitedAt" >= ${new Date(from)}` : Prisma.empty}
      ${to ? Prisma.sql`AND v."visitedAt" <= ${new Date(to)}` : Prisma.empty}
    GROUP BY v."lgaId", l.name, month
    ORDER BY month ASC, count DESC
  `;
}
```

### Pattern 2: Revenue-to-government-share — Ministry wallet ledger, grouped by `metadata.module`
**What:** Read `Transaction` rows where `walletId = <ministry wallet id>` (from `SettlementService.resolveMinistryWallet()`), `type = 'CREDIT'`, `status = 'SUCCESS'`, grouped by `metadata->>'module'` and month.
**When to use:** MIN-04.
**Verified module string values actually written to `Transaction.metadata.module` today** [VERIFIED: grep across backend/src/modules, see Data-Capture Touchpoints below for file:line]:
`'events'`, `'marketplace'`, `'stays'`, `'studio'`, `'transport'`, `'delivery'`, `'tour_booking'` (note: NOT `'tour'` — `'tour'` is a different field on `TourBooking.metadata`/`TourBooking` record's own metadata, unrelated to the settlement `Transaction.metadata.module` value written by `SettlementService.settle({ module: 'tour_booking', ... })` at `tour-settlement.service.ts:241`).
```typescript
// Source: mirrors AdminService.getRevenue() shape; wallet resolution from
// backend/src/common/services/settlement.service.ts:321 resolveMinistryWallet()
async getRevenueToGovernment(from?: string, to?: string) {
  const ministryWallet = await this.settlementService.resolveMinistryWallet();
  if (!ministryWallet) return { byModule: [], byMonth: [] };

  const byModule = await this.prisma.$queryRaw<{ module: string; total: number }[]>`
    SELECT t.metadata->>'module' AS module, COALESCE(SUM(t.amount), 0) AS total
    FROM transactions t
    WHERE t."walletId" = ${ministryWallet.id}
      AND t.type = 'CREDIT' AND t.status = 'SUCCESS'
    GROUP BY module
    ORDER BY total DESC
  `;
  // byMonth: identical shape to AdminService.getRevenue()'s byMonth query,
  // swap `orders o` for `transactions t` and filter by walletId instead of vendor join.
  return { byModule: byModule.map(r => ({ ...r, total: Number(r.total) })), /* byMonth */ };
}
```
**LGA breakdown caveat (D-09):** `Transaction.metadata` does NOT carry `lgaId` directly for any module — it carries module-specific IDs (`bookingId` for Stays/Tour, `orderId`-equivalent for Marketplace via `Vendor`). Getting LGA for revenue rows requires a second join back through the source table per module (e.g. `metadata->>'bookingId'` → `bookings.propertyId` → `properties.lgaId` for Stays). This is materially more complex than the visitor-entries LGA query and should be scoped per-module explicitly in the plan, not assumed to be a single generic join.

### Pattern 3: PDF export — reuse the branded shell, write new tabular body
**What:** `PDFDocument({ size: 'A4', margin: 50 })`, Forest Green `#1A6B3C` / Jungle `#1C2B2B` text, Gold `#C8962A` divider rule, footer `'Powered by Iseyaa — Ogun State Digital Platform'`.
**Reusable verbatim from `itinerary-pdf.service.ts`:** the `PDFDocument` constructor options, the buffer-collection `Promise` wrapper (lines 83-88), the color hex constants, the footer text/style (lines 146-151), `formatDate()` helper.
**NOT reusable — needs new code:** the entire body-rendering loop (lines 116-144) is hardcoded to a single-booking itinerary list (`hour — title` + description + location). A tabular report (rows of LGA/month/count or module/month/₦-amount) needs a new table-rendering method — pdfkit has no built-in table primitive; either hand-roll simple row/column `doc.text()` positioning (feasible for these report shapes — at most a handful of columns) or add a small pdfkit-table helper. Given the low column count (2-4 columns per report), hand-rolled `doc.text(value, x, y, { width })` positioning is proportionate here — this is NOT a "don't hand-roll" violation because it's simple column layout, not CSV-style escaping/parsing correctness.

### Anti-Patterns to Avoid
- **Adding Ministry routes to `AdminController`:** Violates MIN-01's literal wording. `AdminController` already mixes `@Get('dashboard')`/`@Get('revenue')` (read) with `@Patch('users/:id/status')`/`@Patch('config/:key')` (mutation) in one class [VERIFIED: backend/src/modules/admin/admin.controller.ts:43-47,95-98]. Ministry needs its own controller class, full stop.
- **Trusting `Transaction.metadata.module === 'tour'` for tour revenue grouping:** The settlement-ledger value is `'tour_booking'`, not `'tour'` (see Pattern 2). Confusing these will silently drop Tour Package revenue from the MIN-04 breakdown.
- **Client-side-only role gating as the PII/access boundary:** `web/src/app/admin/tours/revenue/page.tsx`'s `ALLOWED_ROLES` array + `redirect()` is a UX nicety, not a security boundary — the actual enforcement is `RolesGuard` + `@Roles()` server-side. A Ministry dashboard page copying only the client pattern without a properly `@Roles(UserRole.MINISTRY_VIEWER)`-gated backend route would be a real vulnerability, not just a style nit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV field escaping (commas/quotes/newlines in LGA names, purpose labels) | Manual `.join(',')` string builder | `fast-csv` | RFC4180 escaping has real edge cases (embedded commas in "Abeokuta North" style names are fine, but purpose labels or vendor names could contain commas/quotes); a hand-rolled joiner silently corrupts CSV structure with no error |
| Additive enum migration on a FK-referenced Postgres enum | Letting `prisma migrate dev` auto-generate the migration | Hand-authored `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MINISTRY_VIEWER';` SQL, following Phase 9's exact precedent | Prisma's default diff algorithm drops and recreates the enum type when it changes, which breaks every FK column typed as `UserRole` (the `users.role` column and any others) — this is explicitly documented in the Phase 9 migration's own header comment |
| PII-leak detection | Manual code review / "we checked the DTO" | Automated recursive key-denylist test run in CI (see next section) | MIN-07 explicitly requires "verified by an automated field-allowlist/schema-shape test, not by ad hoc review" — this is a literal requirement, not a suggestion |

**Key insight:** This phase's two hand-roll temptations (CSV writing, PII-safety review) are exactly the kind of "looks like 20 minutes of code" problems that produce silent, hard-to-detect defects — a broken CSV export corrupts silently (wrong column alignment on one row with an embedded comma), and an ad-hoc PII review can pass today and regress the next time someone adds a `include: { user: true }` to a query six months from now with no test to catch it.

## PII Isolation — Field-Allowlist Test Pattern (MIN-07, the hardest constraint)

**No existing pattern in this codebase for this** [VERIFIED: grep for `ClassSerializerInterceptor`, `@Exclude`, `plainToInstance` across `backend/src` returns zero matches]. This must be built net-new. Recommended approach, layered:

**Layer 1 — Structural (schema-level), already locked by D-07:** `VisitorLog` has no PII columns at all (`lgaId`, `purpose`, `sourceType`, `sourceId`, `visitedAt`, `userRole`). There is nothing to leak from this table by construction — no query-time discipline can undo a column that doesn't exist.

**Layer 2 — Query-level:** Every `MinistryService` method must use explicit Prisma `select` (never `include`, never a bare model return) when touching any table that DOES have PII (`User`, `Ticket`→`Ticket.user`, `Booking`→`Booking.user`). For MIN-02/03/04 as scoped, the only PII-adjacent table touched is `User.role` for the D-04 secondary breakdown — `select: { role: true }` only, never a bare `user.findMany()`.

**Layer 3 — Automated test (the literal MIN-07 requirement):** A denylist-based recursive key/value scanner run against the actual JSON response shape of every Ministry endpoint, seeded with a test user carrying real-looking PII, asserting neither the field names nor plausible-PII-shaped values ever appear:

```typescript
// Source: new pattern for this repo — no existing precedent, designed to satisfy
// MIN-07's literal "automated field-allowlist/schema-shape test" requirement.
// backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts

const PII_FIELD_DENYLIST = ['bvn', 'nin', 'bvnHash', 'ninHash', 'phone', 'firstName', 'lastName', 'email'];
// Field names verified against backend/prisma/schema.prisma User model (lines 224-264):
// nin, bvn, bvnHash, ninHash, phone, firstName, lastName, email are the exact
// column names MIN-07 must guarantee are never reachable.

function assertNoPiiKeys(obj: unknown, path = ''): void {
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => assertNoPiiKeys(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (PII_FIELD_DENYLIST.some((f) => lowerKey === f.toLowerCase())) {
      throw new Error(`PII field "${key}" found at response path "${path}.${key}" — MIN-07 violation`);
    }
    assertNoPiiKeys(value, `${path}.${key}`);
  }
}

describe('MinistryService PII isolation (MIN-07)', () => {
  it('visitor-entries response never contains PII field names', async () => {
    const result = await ministryService.getVisitorEntriesByLgaAndMonth();
    assertNoPiiKeys(result);
  });
  // Repeat for purpose-breakdown and revenue endpoints. Also assert against a
  // seeded fixture user whose firstName === a value that would trivially leak
  // (e.g. 'PII_CANARY_FIRSTNAME') to catch cases where a value leaks under an
  // unexpected key name that the denylist-by-key-name check alone would miss.
});
```

This dual approach (key-name denylist + value-canary) catches both "we accidentally selected the `user` relation" (key-name catch) and "we selected `user.firstName` but aliased it to something unexpected like `guestName`" (value-canary catch) — the second failure mode is exactly why "not by ad hoc review" matters, since a human reviewer scanning for the literal string `firstName` in a `select` clause would miss an aliased leak.

## Prisma Additive-Enum Migration Mechanics (verified against Phase 9's exact precedent)

**Confirmed pattern** [VERIFIED: backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql:14-15]:
```sql
-- Hand-authored migration.sql, NOT `prisma migrate dev`'s auto-generated diff.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MINISTRY_VIEWER';
```
The migration file's own header comment explains why: *"This migration is hand-authored to use ALTER TYPE ... ADD VALUE for the UserRole enum extension (Prisma's diff would otherwise drop & recreate the enum, breaking every FK referencing users.role)."*

**Three places `MINISTRY_VIEWER` must be added in the same change** (schema drift between these has already happened once historically and would silently break `@Roles()` checks):
1. `backend/prisma/schema.prisma` — `enum UserRole { ... MINISTRY_VIEWER // Phase 14 }` (Prisma-generated types, used by `PrismaClient`)
2. `backend/src/common/enums/user-role.enum.ts` — the hand-maintained TypeScript enum actually consumed by `@Roles()` decorators and `RolesGuard` [VERIFIED: backend/src/common/enums/user-role.enum.ts, confirmed `TOUR_GUIDE` exists in BOTH this file and the Prisma schema, added together in Phase 9]
3. `shared/src/types/index.ts` (only if the web admin UI needs `MINISTRY_VIEWER` in client-side role-gating logic, per the Phase 9 precedent's use in `web/src/app/admin/tours/revenue/page.tsx`'s `ALLOWED_ROLES` array pattern) — [ASSUMED: not verified whether Phase 9 also updated shared/src's UserRole; grep confirmed shared/src/types/index.ts DOES reference `UserRole` but exact enum members were not diffed against Phase 9's migration date]

**Migration ordering:** `ALTER TYPE ADD VALUE` cannot run inside the same transaction block as other DDL that uses the new enum value, per Postgres rules — Phase 9's migration puts the `ALTER TYPE` as step 1, before any table using it. If `VisitorLog` or any new Ministry table has a column typed against `UserRole` (e.g., `VisitorLog.userRole`), the migration must follow the same ordering: `ALTER TYPE` first, `CREATE TABLE` referencing it second.

## Data-Capture Touchpoints (VisitorLog write sites — exact locations)

| Module | Exact write-site function | File:Line | What triggers it | `visitedAt` value to write |
|--------|---------------------------|-----------|-------------------|------------------------------|
| Events | `EventsService.checkin(qrHash, organizerId)` | `backend/src/modules/events/events.service.ts:319-351` | Organizer scans a ticket's QR at the door; sets `Ticket.status = 'USED'`, `Ticket.usedAt = new Date()` | `new Date()` (real-time, matches the scan) — this is the ONE module with a true physical scan moment |
| Stays | `StaysService.handleStayPayment(payload)` — `@OnEvent('payment.stay_booking')` handler | `backend/src/modules/stays/stays.service.ts:255-309` | Paystack webhook confirms payment; `Booking.status: 'PENDING' → 'CONFIRMED'` | `booking.checkIn` (future-dated at write time — see Pitfall below re: query-time filtering) |
| Tour Packages | `TourSettlementService.handleTourBookingPaymentEvent(payload)` — `@OnEvent('payment.tour_booking')` handler | `backend/src/modules/tour-bookings/tour-settlement.service.ts:102-103` (dispatcher), status write at lines 253 (solo/group) and 311 (split-bill close) | Paystack webhook confirms payment; `TourBooking.status → 'CONFIRMED'` | `booking.tourDate` (future-dated at write time, same caveat as Stays) |

**LGA resolution per write site:**
- Events: `Event.lgaId` is direct [VERIFIED: schema.prisma:324] — no join needed at write time, `ticket.ticketType.event.lgaId` (requires including `event` in the `checkin()` query, which it already does at line 322-328, just needs `lgaId` added to the `select`).
- Stays: `Property.lgaId` is direct [VERIFIED: schema.prisma:391] — `booking.property.lgaId`, already loaded in `handleStayPayment()`'s `include: { property: ... } }` at line 261 (needs `lgaId` added to the select).
- Tour Packages: `TourPackage.lgaId` is **nullable** [VERIFIED: schema.prisma:950, comment explicitly notes "NOTE: lgaId + tourGuideId are NULLABLE to support AI-suggestion DRAFT shape"]. A tour package that somehow reaches CONFIRMED with a null `lgaId` would need explicit null-handling in `VisitorLogService` (e.g., write with `lgaId: null` and exclude from LGA-grouped queries, or throw/log a warning — service-layer guards elsewhere in Phase 9 enforce `lgaId` is populated before a package can leave DRAFT status, so this should be rare but not impossible pre-Phase-14 data).

## Common Pitfalls

### Pitfall 1: `AdminController` mixes read and mutation routes — do not extend it
**What goes wrong:** Adding `@Get('ministry/...')` methods onto the existing `AdminController` class (or reusing its `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)` class-level decorator) technically works but violates MIN-01's literal wording.
**Why it happens:** `AdminController` already has the exact shape of what Ministry needs (dashboard-style GET routes with role guards) — reusing it is the path of least resistance.
**How to avoid:** New `MinistryController` in a new `MinistryModule`, registered in `AppModule`, guarded independently with `@Roles(UserRole.MINISTRY_VIEWER)` at minimum on every route.
**Warning signs:** A plan task that says "add Ministry endpoints to admin.controller.ts."

### Pitfall 2: `VisitorLog.visitedAt` written in the future creates a stale-cancellation gap
**What goes wrong:** Stays/Tour write `VisitorLog` at payment-confirmation time with a future `visitedAt`. If the booking is subsequently cancelled (Tour: `TourBookingService.cancel()` at `tour-bookings.service.ts:480-495`, transitions to `CANCELLED`; Stays: no explicit user-facing cancel found in `stays.service.ts` in this research pass — worth the planner double-checking) before the scheduled date arrives, the `VisitorLog` row still exists and will be counted once `visitedAt <= now()` unless something reconciles it.
**Why it happens:** D-08 chose write-at-confirmation (not write-at-actual-date, which would need a new cron), which is the cheaper implementation but creates this gap.
**How to avoid:** Either (a) add a cancellation-triggered delete/void of the matching `VisitorLog` row (requires a lookup by `sourceType`+`sourceId`), or (b) explicitly accept the gap as a known, documented limitation (D-02's "no new status machinery" phrasing suggests the user may already be fine with this — but it should be a stated plan decision, not a silent gap). [ASSUMED: neither option was explicitly chosen in CONTEXT.md's D-01 through D-14 — flagged as Open Question below.]

### Pitfall 3: `Transaction.metadata.module` value inconsistency (`'tour_booking'` vs `'tour'`)
**What goes wrong:** A query grouping by `metadata->>'module'` that assumes `'tour'` (seen in several other, non-settlement contexts in the same codebase) will silently show zero or missing Tour revenue.
**Why it happens:** `SettlementService.settle({ module: 'tour_booking', ... })` [VERIFIED: tour-settlement.service.ts:241] is the value that lands in `Transaction.metadata.module`, while the *booking record's own* `metadata.module` field (a completely different field on a different model) uses `'tour'` [VERIFIED: tour-bookings.service.ts:217, 240, 316, 398]. These are easy to conflate because they're both literally `metadata.module` on adjacent-sounding models.
**How to avoid:** Confirm the exact string set empirically (query `SELECT DISTINCT metadata->>'module' FROM transactions WHERE "walletId" = <ministry wallet id>` against real or seeded data) rather than trusting either the settlement call sites or this research's static-grep list as exhaustive — this research found 7 module strings across 7 settle() call sites (`events`, `marketplace`, `stays`, `studio`, `transport`, `delivery`, `tour_booking`) but a live data check is cheap insurance.

### Pitfall 4: Enum sync drift across three `UserRole` definitions
**What goes wrong:** Adding `MINISTRY_VIEWER` only to `schema.prisma` (or only to `common/enums/user-role.enum.ts`) makes `@Roles(UserRole.MINISTRY_VIEWER)` either fail to compile (TS enum missing the member) or compile but never actually match a real user's `role` column value (Prisma enum missing the member, so no user can ever be assigned that role in the DB).
**Why it happens:** Two independent enum definitions for the same concept, with no single source of truth enforced by tooling.
**How to avoid:** Grep for every `enum UserRole` declaration in the repo (`schema.prisma`, `common/enums/user-role.enum.ts`, and check `shared/src/types/index.ts`) as an explicit plan verification step before considering MIN-01 done.

### Pitfall 5: LGA breakdown for MIN-04 revenue is per-module-shaped, not generic
**What goes wrong:** Assuming one generic join pattern (like the Stays `Property.lgaId` case) will work for all modules that get an LGA breakdown leads to either broken queries (Marketplace's LGA lives on `Vendor`, not on `Order` directly) or a rushed generic-but-wrong join.
**Why it happens:** `Transaction.metadata` doesn't carry `lgaId`; every module's path back to an LGA differs (Stays: `bookingId → Booking.propertyId → Property.lgaId`; Marketplace: needs the order→vendor path per `AdminService.getRevenue()`'s existing `JOIN vendors v ON o."vendorId" = v.id JOIN lgas l ON v."lgaId" = l.id` pattern at admin.service.ts:62-63; Tour: `bookingId → TourBooking.tourPackageId → TourPackage.lgaId`, nullable).
**How to avoid:** Scope the LGA-breakdown query per module explicitly in the plan (three or four distinct `$queryRaw` cases, or a `UNION ALL` across module-specific sub-selects), not a single generalized join.

## Code Examples

### `VisitorLogService` — CommonModule direct-injection pattern (D-08)
```typescript
// Source: mirrors backend/src/common/services/qr.service.ts / image.service.ts's
// direct-injection shape, registered in backend/src/common/common.module.ts
// (providers + exports arrays, both required — see common.module.ts:21-50)
@Injectable()
export class VisitorLogService {
  constructor(private prisma: PrismaService) {}

  async record(input: {
    lgaId: string | null;
    purpose: string;
    sourceType: 'EVENT' | 'STAY' | 'TOUR';
    sourceId: string;
    visitedAt: Date;
    userRole: UserRole;
  }): Promise<void> {
    await this.prisma.visitorLog.create({ data: input });
  }
}
```
Registration: add `VisitorLogService` to both `providers` and `exports` arrays in `backend/src/common/common.module.ts` (the module is `@Global()`, so no per-consumer-module import is needed — exactly how `QrService`/`ImageService` are already consumed by `EventsModule`/`StaysModule`).

### Existing `RolesGuard` / `@Roles()` — zero new guard infrastructure needed
```typescript
// Source: backend/src/common/guards/roles.guard.ts (verbatim, unchanged)
// backend/src/common/decorators/roles.decorator.ts (verbatim, unchanged)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MINISTRY_VIEWER)
@Controller('ministry')
export class MinistryController { /* ... */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — no prior Ministry-facing analytics existed | New `MinistryModule` | This phase | First government-facing read surface in the platform |

**Note on tech-stack accuracy:** `CLAUDE.md`'s "Technology Stack" section states NestJS 10.3.x, but `backend/package.json` actually pins `"@nestjs/core": "^11.1.20"` and `"@nestjs/common": "^11.1.20"` [VERIFIED: backend/package.json]. This is a documentation-vs-reality drift unrelated to this phase's scope, but the planner should use the verified `package.json` version (NestJS 11.x), not the stale `CLAUDE.md` claim, when checking API compatibility for anything version-sensitive (unlikely to matter for this phase's simple CRUD/query additions, but worth knowing).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `shared/src/types/index.ts`'s `UserRole` needs `MINISTRY_VIEWER` added (in addition to the two backend enum locations) | Prisma Additive-Enum Migration Mechanics | If the web admin UI needs client-side role checks for the Ministry dashboard page (mirroring the `ALLOWED_ROLES` pattern seen in `web/src/app/admin/tours/revenue/page.tsx`) and this enum isn't updated, TypeScript compilation in `web/` would fail or silently fall back to a loose string type — low risk (compile-time catch), but should be verified during planning, not assumed |
| A2 | No explicit user-facing "cancel a stay booking" flow was found in `stays.service.ts` during this research pass (only Tour Package bookings have a confirmed `cancel()` method) | Pitfall 2 | If Stays bookings CAN be cancelled elsewhere in the codebase (not found by this research's grep), the stale-VisitorLog-on-cancellation gap applies to Stays too and needs the same mitigation decision; if Stays genuinely cannot be cancelled post-confirmation, the gap only applies to Tour Packages |
| A3 | Direct-streamed HTTP response (`@Res()` + `Content-Disposition: attachment`) is the right export delivery mechanism, rather than reusing the S3-upload-then-return-URL pattern from `ItineraryPdfService` | Standard Stack — Alternatives Considered | Low risk either way — both are valid NestJS patterns; if the planner prefers S3-upload for consistency with the one existing PDF precedent, that's a reasonable, low-cost alternative choice, not a defect |

**None of these assumptions block planning** — they're small scoping decisions the planner (or a quick codebase double-check) can resolve in minutes, not open research gaps.

## Open Questions

1. **(RESOLVED) What happens to a `VisitorLog` row when its source booking is cancelled after confirmation but before the scheduled visit date?**
   - What we know: D-08 writes the row at confirmation time with a future `visitedAt`; D-02 says entries only count once `visitedAt <= now AND status != CANCELLED`, implying a query-time status check — but `VisitorLog` (per D-07) deliberately has no `status` column to check against.
   - What's unclear: Whether the intended query-time filter re-joins back to `Booking`/`TourBooking`.status via `sourceId` at read time (adds complexity + defeats some of the "isolated table" simplicity), or whether cancellation should trigger a `VisitorLogService.void()`/delete call as a fourth write site, or whether this edge case is accepted as out of scope for v1.
   - **Resolution (Plan 14-03, implemented):** The query-time re-join alternative was chosen, not the `void()`/delete write-site alternative. `getVisitorEntriesByLgaAndMonth()` and `getPurposeBreakdown()` LEFT JOIN back to `bookings`/`tour_bookings` by `sourceId` at read time and filter `status NOT IN ('CANCELLED', 'REFUNDED')` (see 14-03-PLAN.md's `<interfaces>` SQL block: `LEFT JOIN bookings b ON v."sourceType" = 'STAY' AND v."sourceId" = b.id`, same pattern for `tour_bookings`). `VisitorLog` itself stays status-column-free (D-07 intact) — a cancelled booking's row is excluded from every read-time aggregate, never physically removed or voided.
   - Recommendation (superseded by the Resolution above — kept for history): Planner should make this an explicit task-level decision (documented in the plan, not left implicit) — likely cheapest fix is a `VisitorLogService.void(sourceType, sourceId)` call added to `TourBookingService.cancel()` (and Stays' cancellation path, once located) as a small addition alongside the three write sites already scoped.

2. **Does a Stays cancellation path exist post-confirmation, and where?**
   - What we know: `stays.service.ts` has `createBooking()`, `handleStayPayment()`, and `releaseEscrow()` — no `cancel()` method was found in this research pass.
   - What's unclear: Whether Stays bookings can be cancelled by a user/host after `CONFIRMED` at all (the `BookingStatus` enum has `CANCELLED`/`REFUNDED` values, so the states exist even if no service method transitions to them in the code reviewed).
   - Recommendation: Quick grep for `status: 'CANCELLED'` writes across `stays.service.ts` and any Stays-related webhook/refund handler before finalizing the Open Question 1 mitigation — five-minute check, not a blocking research gap.
</open_questions>

## Environment Availability

Skipped — this phase has no new external service/tool dependencies. `pdfkit` is already installed; `fast-csv` is a pure-JS npm package with no native bindings, no runtime service, no version-compatibility risk against Node 20 LTS.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x [VERIFIED: backend/package.json] |
| Config file | `backend/package.json` `"jest"` block is referenced by `npm test`; a separate `test/jest-e2e.json` exists for e2e specs [VERIFIED: backend/package.json scripts `"test:e2e:tours"`] |
| Quick run command | `npm test --workspace=backend -- ministry` |
| Full suite command | `npm test --workspace=backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIN-01 | `MINISTRY_VIEWER` route access denied to other roles | unit | `npm test --workspace=backend -- ministry.controller` | ❌ Wave 0 |
| MIN-02 | Visitor entries grouped correctly by LGA + month | unit | `npm test --workspace=backend -- ministry.service` | ❌ Wave 0 |
| MIN-03 | Purpose-of-visit breakdown reflects `VisitorLog.purpose` values | unit | `npm test --workspace=backend -- ministry.service` | ❌ Wave 0 |
| MIN-04 | Revenue-to-government-share matches Ministry wallet ledger | unit | `npm test --workspace=backend -- ministry.service` | ❌ Wave 0 |
| MIN-05 | CSV export produces correctly-escaped, parseable output | unit | `npm test --workspace=backend -- csv-export` | ❌ Wave 0 |
| MIN-06 | PDF export renders without throwing, uses branded colors | unit | `npm test --workspace=backend -- ministry-pdf` | ❌ Wave 0 |
| MIN-07 | No PII field/value ever appears in any Ministry response | unit | `npm test --workspace=backend -- ministry-pii-allowlist` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test --workspace=backend -- ministry`
- **Per wave merge:** `npm test --workspace=backend`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` — covers MIN-02, MIN-03, MIN-04
- [ ] `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` — covers MIN-07 (the concrete pattern is fully specified above)
- [ ] `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` (or an e2e RBAC spec, mirroring `roles.guard.spec.ts`'s conventions) — covers MIN-01
- [ ] `backend/src/common/services/__tests__/visitor-log.service.spec.ts` — covers D-07/D-08 write-path correctness
- [ ] No new test framework/config needed — reuses existing Jest setup verbatim

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (inherited) | Existing JWT `JwtAuthGuard` — `MINISTRY_VIEWER` users authenticate through the same flow as every other role, no new auth mechanism |
| V3 Session Management | Yes (inherited) | Existing 15-min access / 30-day refresh token scheme, unchanged |
| V4 Access Control | Yes — core to this phase | `RolesGuard` + `@Roles(UserRole.MINISTRY_VIEWER)` on every Ministry route; MIN-01's "never share a controller with a mutation endpoint" is itself an ASVS V4-aligned defense-in-depth control (reduces blast radius of any guard bug to read-only surface) |
| V5 Input Validation | Yes | `class-validator` DTO for `from`/`to`/`lgaId`/`format` query params — reject malformed dates, reject `format` values outside `['csv','pdf']` allowlist |
| V6 Cryptography | No new surface | This phase reads already-encrypted-at-rest data (BVN/NIN AES-256-GCM per CLAUDE.md); it does not itself encrypt/decrypt anything, and per D-07 never touches PII columns at all |
| V8 Data Protection (not in the default V1-V6 short list above, but directly the phase's core requirement) | Yes — MIN-07 | Structural PII isolation via schema design (`VisitorLog` has no PII columns) + automated allowlist test, as detailed above |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Privilege escalation via role-check bypass on a shared controller | Elevation of Privilege | MIN-01's dedicated-controller requirement; verified by a route-enumeration test asserting every `MinistryController` method carries `@Roles(UserRole.MINISTRY_VIEWER)` (or a superset explicitly including it) |
| Information disclosure via response-shape drift (a future code change adds `include: { user: true }` to a Ministry query) | Information Disclosure | The MIN-07 automated allowlist test (runs on every CI build, not just at phase-ship time) — this is precisely the regression class the test is designed to catch |
| SQL injection via unparameterized `$queryRaw` date/LGA filters | Tampering | Follow `AdminService.getRevenue()`'s existing pattern of using Prisma tagged-template `$queryRaw` (auto-parameterized) — never string-concatenate `from`/`to`/`lgaId` into raw SQL |
| CSV injection (formula injection via `=`, `+`, `-`, `@` prefixed cell values opened in Excel) | Tampering (client-side, via the Ministry's own spreadsheet tool) | Low relevance here — Ministry Dashboard's CSV columns are all system-generated (LGA names, module names, counts, currency amounts), not user-free-text fields reachable at export time; still, `fast-csv`'s default quoting behavior should be verified to not require additional escaping for this specific low-risk case |

## Sources

### Primary (HIGH confidence — direct repo verification)
- `backend/src/modules/admin/admin.service.ts` — `getRevenue()`, `getDashboard()` full source read
- `backend/src/common/services/itinerary-pdf.service.ts` — full source read, branded shell details
- `backend/prisma/schema.prisma` — `UserRole`, `User`, `Event`, `Ticket`, `Property`, `Booking`, `TourBooking`, `TourPackage`, `Transaction`, `Wallet`, `PlatformConfig`, `LGA` models
- `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` — additive-enum migration precedent
- `backend/src/common/services/settlement.service.ts` — `resolveMinistryWallet()`, `settle()`, `Transaction.metadata` shape
- `backend/src/modules/events/events.service.ts:319-351` — `checkin()`
- `backend/src/modules/stays/stays.service.ts:174-370` — `createBooking()`, `handleStayPayment()`, `releaseEscrow()`
- `backend/src/modules/tour-bookings/tour-bookings.service.ts` (full read), `tour-settlement.service.ts` (partial, confirmation write site)
- `backend/src/common/common.module.ts`, `backend/src/common/guards/roles.guard.ts`, `backend/src/common/decorators/roles.decorator.ts`, `backend/src/common/enums/user-role.enum.ts`
- `backend/src/app.module.ts` — module registration pattern
- `backend/src/modules/admin/admin.controller.ts` — confirmed mixed read/mutation routes
- `web/src/app/admin/tours/revenue/page.tsx`, `web/src/components/admin/tours/RevenueBreakdownChart.tsx` — existing frontend dashboard/chart precedent
- `backend/package.json` — dependency versions (NestJS 11.1.20, pdfkit 0.19.1, Prisma 5.11.x, Jest 29.7.x)
- `npm view fast-csv version` / `time.modified` — 5.0.7, published 2026-05-06
- `npm view pdfkit version` — 0.19.1 (matches installed)
- `npm view @json2csv/plainjs version` — 7.0.7 (alternative considered)

### Secondary (MEDIUM confidence)
- None required — all critical claims were directly verifiable against this repository's own source, which is the authoritative source for a codebase-internal integration phase like this one.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library/version claim verified against `package.json` or live `npm view`
- Architecture: HIGH — every pattern (query shape, PDF shell, module registration, enum migration) verified against actual repo source, not inferred
- Pitfalls: HIGH for structural/enum/controller-mixing findings (directly observed in code); MEDIUM for the VisitorLog-cancellation-gap pitfall (correctly identified as a real gap in D-01–D-14's decisions, but the "right" mitigation is a planning judgment call, not a verifiable fact)

**Research date:** 2026-07-18
**Valid until:** 30 days (stable, internal-codebase-dependent research; the one external dependency, `fast-csv`, is a mature/stable package unlikely to have breaking changes in that window)
