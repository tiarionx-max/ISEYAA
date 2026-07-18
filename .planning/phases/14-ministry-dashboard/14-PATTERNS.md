# Phase 14: Ministry Dashboard - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 20
**Analogs found:** 18 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/prisma/schema.prisma` (add `MINISTRY_VIEWER` to `UserRole`; add `VisitorLog` model + `VisitorSourceType` enum) | model | CRUD | `backend/prisma/schema.prisma` — `TourGuide`/`TourPackageCategory` additive enum block, Phase 9 | exact |
| `backend/prisma/migrations/<ts>_phase14_ministry_dashboard/migration.sql` | migration | batch | `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` | exact |
| `backend/src/common/enums/user-role.enum.ts` (add `MINISTRY_VIEWER`) | config | CRUD | same file, existing `TOUR_GUIDE` member | exact |
| `shared/src/types/index.ts` (add `MINISTRY_VIEWER` to `UserRole`) | config | CRUD | same file, existing enum block | exact |
| `backend/src/common/services/visitor-log.service.ts` | service | event-driven (in-process write) | `backend/src/common/services/qr.service.ts` (CommonModule direct-injection shape) | role-match |
| `backend/src/common/common.module.ts` (register `VisitorLogService`) | config | — | same file, existing `providers`/`exports` arrays | exact |
| `backend/src/modules/ministry/ministry.module.ts` | config | — | `backend/src/modules/admin/admin.module.ts` | exact |
| `backend/src/modules/ministry/ministry.controller.ts` | controller | request-response | `backend/src/modules/admin/admin.controller.ts` (read-only routes only — do NOT copy the `@Patch` routes) | role-match |
| `backend/src/modules/ministry/ministry.service.ts` | service | CRUD / aggregate | `backend/src/modules/admin/admin.service.ts` (`getRevenue()` monthly-bucket + LGA-join pattern) | exact |
| `backend/src/modules/ministry/dto/ministry-query.dto.ts` | model (DTO) | request-response | `backend/src/modules/events/dto/create-event.dto.ts` (class-validator decorator shape) | role-match |
| `backend/src/common/services/ministry-pdf.service.ts` | service | streaming/file-I/O | `backend/src/common/services/itinerary-pdf.service.ts` | exact (shell) / no-analog (table body) |
| `backend/src/common/services/csv-export.service.ts` | service | streaming/file-I/O | none found (net-new to repo) | no analog |
| `backend/src/modules/ministry/__tests__/ministry.service.spec.ts` | test | — | `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` | role-match |
| `backend/src/modules/ministry/__tests__/ministry.controller.spec.ts` | test | — | `backend/src/common/guards/roles.guard.spec.ts` | role-match |
| `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` | test | — | none found (net-new pattern, MIN-07) | no analog |
| `backend/src/common/services/__tests__/visitor-log.service.spec.ts` | test | — | `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts` | role-match |
| `backend/src/modules/events/events.service.ts` (modify `checkin()` — add `VisitorLogService.record()` call) | service | event-driven | same file, existing `checkin()` method (lines 319-351) | exact |
| `backend/src/modules/stays/stays.service.ts` (modify `handleStayPayment()` — add `VisitorLogService.record()` call) | service | event-driven | same file, existing `@OnEvent('payment.stay_booking')` handler (lines 255-309) | exact |
| `backend/src/modules/tour-bookings/tour-settlement.service.ts` (modify `handleTourBookingPayment()` — add `VisitorLogService.record()` call) | service | event-driven | same file, existing `@OnEvent('payment.tour_booking')` handler (lines 102-260) | exact |
| `web/src/app/admin/ministry/page.tsx` (or `web/src/app/ministry/page.tsx`) | component | request-response | `web/src/app/admin/tours/revenue/page.tsx` | exact |
| `web/src/components/admin/ministry/*Chart.tsx` (visitor entries / purpose / revenue charts) | component | request-response | `web/src/components/admin/tours/RevenueBreakdownChart.tsx` | exact |

## Pattern Assignments

### `backend/prisma/schema.prisma` (model, CRUD)

**Analog:** `backend/prisma/schema.prisma` lines 13-25 (`UserRole` enum) + `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql`

**Current enum (lines 13-25) — add `MINISTRY_VIEWER` as the new last member, following the `TOUR_GUIDE` precedent's own inline comment style:**
```prisma
enum UserRole {
  CITIZEN
  TOURIST
  VENDOR
  ORGANISER
  HOST
  DRIVER
  CREATIVE
  LGA_ADMIN
  STATE_ADMIN
  SUPER_ADMIN
  TOUR_GUIDE // Phase 9 — additively appended via PG ALTER TYPE ADD VALUE
  MINISTRY_VIEWER // Phase 14 — additively appended via PG ALTER TYPE ADD VALUE
}
```

**New `VisitorLog` model — column list is locked by CONTEXT.md D-07 (no PII columns), FK-free `sourceType`/`sourceId` pair (mirrors `ShadowSettlementComparison`'s `module`/`sourceId` string-pair pattern at schema.prisma:663-671, not a real FK, since `sourceId` polymorphically points at `Ticket`, `Booking`, or `TourBooking`):**
```prisma
enum VisitorSourceType {
  EVENT
  STAY
  TOUR
}

model VisitorLog {
  id         String            @id @default(uuid())
  lgaId      String?
  lga        LGA?              @relation(fields: [lgaId], references: [id])
  purpose    String            // free-text taxonomy value (D-05) — not an enum, per "not hardcoded" decision
  sourceType VisitorSourceType
  sourceId   String            // Ticket.id | Booking.id | TourBooking.id — polymorphic, no FK enforced (mirrors ShadowSettlementComparison.sourceId)
  visitedAt  DateTime
  userRole   UserRole
  createdAt  DateTime          @default(now())

  @@index([lgaId])
  @@index([visitedAt])
  @@index([sourceType, sourceId])
  @@map("visitor_logs")
}
```
Add `visitorLogs VisitorLog[]` to the `LGA` model's relation block (mirrors how `LGA` already lists `events`, `properties`, `tourPackages` at schema.prisma:288-293).

### `backend/prisma/migrations/<ts>_phase14_ministry_dashboard/migration.sql` (migration, batch)

**Analog:** `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` lines 1-30

**Header + ordering pattern to copy verbatim (hand-authored, NOT `prisma migrate dev` auto-diff):**
```sql
-- ============================================================================
-- Phase 14 — Ministry Dashboard (additive migration)
-- ----------------------------------------------------------------------------
-- This migration is hand-authored to use ALTER TYPE ... ADD VALUE for the
-- UserRole enum extension (Prisma's diff would otherwise drop & recreate the
-- enum, breaking every FK referencing users.role).
--
-- Ordering matters: ALTER TYPE cannot run in the same transaction block as
-- DDL that uses the new value — ALTER TYPE must be step 1, before
-- CREATE TABLE "visitor_logs" (which has a column typed UserRole).
-- ============================================================================

-- 1. Extend UserRole enum additively (PG requires ALTER TYPE ADD VALUE).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MINISTRY_VIEWER';

-- 2. Create new enum.
CREATE TYPE "VisitorSourceType" AS ENUM ('EVENT', 'STAY', 'TOUR');

-- 3. Create visitor_logs (references UserRole enum from step 1, must come after it).
CREATE TABLE "visitor_logs" ( ... );
```
**Critical constraint (copy this exactly):** the `ALTER TYPE ADD VALUE` statement must be its own step before any `CREATE TABLE` that types a column as `UserRole` — this is the exact ordering rule documented in the Phase 9 migration's header comment and enforced by Postgres.

### `backend/src/common/enums/user-role.enum.ts` (config, CRUD)

**Analog:** same file (verbatim read above)

**Current content — add `MINISTRY_VIEWER` as a new member (this is the TypeScript enum `@Roles()`/`RolesGuard` actually consume — must be updated in lockstep with the Prisma schema enum, per RESEARCH.md Pitfall 4):**
```typescript
export enum UserRole {
  CITIZEN = 'CITIZEN',
  TOURIST = 'TOURIST',
  VENDOR = 'VENDOR',
  ORGANISER = 'ORGANISER',
  HOST = 'HOST',
  DRIVER = 'DRIVER',
  CREATIVE = 'CREATIVE',
  TOUR_GUIDE = 'TOUR_GUIDE',
  LGA_ADMIN = 'LGA_ADMIN',
  STATE_ADMIN = 'STATE_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  MINISTRY_VIEWER = 'MINISTRY_VIEWER',
}
```
Do **not** add `MINISTRY_VIEWER` to `REGISTERABLE_ROLES` (lines 15-21) — Ministry accounts are provisioned by an admin, not self-registered, matching how `LGA_ADMIN`/`STATE_ADMIN`/`SUPER_ADMIN`/`TOUR_GUIDE` are already excluded from that array.

### `backend/src/common/services/visitor-log.service.ts` (service, event-driven write)

**Analog:** `backend/src/common/services/qr.service.ts` (CommonModule direct-injection shape — full file read above, 9 lines)

**Imports + class shape pattern to copy:**
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
```

**Core pattern — RESEARCH.md's already-drafted `VisitorLogService.record()` (Code Examples section), confirmed consistent with `qr.service.ts`'s single-purpose-class, constructor-injected-`PrismaService` shape used throughout `common/services/`:**
```typescript
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
**Error handling:** wrap the `create()` call site-side (at each of the three call sites) in a try/catch that logs and swallows — mirrors `handleStayPayment()`'s own `catch (err) { this.logger.error(...) }` pattern (stays.service.ts:306-308) so a `VisitorLog` write failure never blocks the underlying check-in/payment-confirmation flow it's attached to.

### `backend/src/common/common.module.ts` (config)

**Analog:** same file (verbatim read above, 52 lines)

**Registration pattern — add `VisitorLogService` to both `providers` and `exports` arrays (both required, `@Global()` means no per-consumer-module import needed afterward, exactly how `QrService`/`ImageService` are already consumed by `EventsModule`/`StaysModule`):**
```typescript
import { VisitorLogService } from './services/visitor-log.service';

@Global()
@Module({
  controllers: [SettlementController, UploadController],
  providers: [
    // ...existing...
    VisitorLogService,
  ],
  exports: [
    // ...existing...
    VisitorLogService,
  ],
})
export class CommonModule {}
```

---

### `backend/src/modules/ministry/ministry.module.ts` (config)

**Analog:** `backend/src/modules/admin/admin.module.ts` (not read verbatim — mirror the standard `@Module({ controllers, providers })` shape every feature module uses per CLAUDE.md's "Module files" convention; `MinistryService` needs no `exports` since nothing else calls it)

### `backend/src/modules/ministry/ministry.controller.ts` (controller, request-response)

**Analog:** `backend/src/modules/admin/admin.controller.ts` lines 1-32 (imports + class-level guard decorators) — **do NOT** mirror lines 43-98 (the `@Patch` mutation routes); only the `@Get('dashboard')`/`@Get('revenue')` GET-route shape (lines 20-31) is the template.

**Imports pattern (lines 1-11):**
```typescript
import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MinistryService } from './ministry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
```

**Auth/guard pattern (lines 12-16) — class-level `@Roles()`, MIN-01-compliant (own controller, GET-only, never shared with `@Patch`):**
```typescript
@ApiTags('ministry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('ministry')
export class MinistryController {
  constructor(private readonly ministryService: MinistryService) {}

  @Get('visitor-entries')
  @ApiOperation({ summary: 'Visitor entries by LGA + month, secondary split by role' })
  getVisitorEntries(@Query() query: MinistryQueryDto) {
    return this.ministryService.getVisitorEntriesByLgaAndMonth(query.from, query.to);
  }
  // repeat @Get for purpose-breakdown, revenue — same shape as AdminController's getDashboard()/getRevenue()
}
```
**Export routes** need `@Res()` streaming (see `ministry-pdf.service.ts`/`csv-export.service.ts` entries below for the `ai.controller.ts`-style raw-response pattern, per RESEARCH.md's Standard Stack "Alternatives Considered" — `@Res() res: Response` + `res.setHeader('Content-Disposition', 'attachment; filename=...')`, mirroring `ai.controller.ts`'s `res.setHeader(...)` calls (lines 21-26/41-45) even though the content-type there is SSE, not a file download — the `@Res()` raw-response-manipulation mechanism is the reusable part, not the specific headers).

### `backend/src/modules/ministry/ministry.service.ts` (service, CRUD/aggregate)

**Analog:** `backend/src/modules/admin/admin.service.ts` full file (172 lines read above)

**Imports pattern (lines 1-2):**
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SettlementService } from '../../common/services/settlement.service';
```

**Core monthly-bucket + LGA-join `$queryRaw` pattern (mirrors `getRevenue()`, lines 50-98) — this is THE template for all three MIN-02/03/04 breakdown queries:**
```typescript
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
**Result-mapping convention (mirrors `getRevenue()`'s return block, lines 92-97) — Prisma `$queryRaw` returns `Decimal`/`bigint`-shaped values for aggregates that must be coerced to `Number()` before JSON serialization:**
```typescript
return {
  by_month: byMonth.map(r => ({ ...r, total: Number(r.total) })),
};
```
**Revenue-to-government query (MIN-04) — resolve Ministry wallet first, mirrors `resolveMinistryWallet()`'s own consumer pattern:**
```typescript
async getRevenueToGovernment(from?: string, to?: string) {
  const ministryWallet = await this.settlementService.resolveMinistryWallet();
  if (!ministryWallet) return { byModule: [], byMonth: [] };
  // WHERE t."walletId" = ${ministryWallet.id} AND t.type = 'CREDIT' AND t.status = 'SUCCESS'
  // GROUP BY t.metadata->>'module' — verified module string values: 'events', 'marketplace',
  // 'stays', 'studio', 'transport', 'delivery', 'tour_booking' (NOT 'tour' — see Shared Patterns below)
}
```

**Error handling:** `AdminService` has no try/catch anywhere — Prisma errors propagate to NestJS's default exception filter, which returns 500. `MinistryService` should follow the same convention (no defensive try/catch in read-only aggregate methods); only `VisitorLogService.record()` call sites (write-side, embedded in other services' flows) need swallow-and-log.

### `backend/src/modules/ministry/dto/ministry-query.dto.ts` (model/DTO, request-response)

**Analog:** `backend/src/modules/events/dto/create-event.dto.ts` lines 1-18 (decorator shape, `@IsOptional()` + `?` pairing)

**Pattern to copy — query-param DTO for `from`/`to`/`lgaId`/`format`:**
```typescript
import { IsOptional, IsDateString, IsUUID, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MinistryQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'LGA UUID' })
  @IsOptional()
  @IsUUID()
  lgaId?: string;

  @ApiPropertyOptional({ enum: ['csv', 'pdf'] })
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';
}
```
This mirrors `create-event.dto.ts`'s `@IsDateString()` usage (lines 31, 35) and `create-booking.dto.ts`'s inline `@ApiProperty({ example: '2026-08-20' }) @IsDateString()` shorthand — either decorator-stacking style is consistent with existing project convention.

### `backend/src/common/services/ministry-pdf.service.ts` (service, streaming/file-I/O)

**Analog:** `backend/src/common/services/itinerary-pdf.service.ts` full file (206 lines read above)

**Reusable verbatim (per D-13 and RESEARCH.md Pattern 3):**
- `PDFDocument` constructor options block (lines 73-81) — swap `info.Title`/`info.Subject` for report-specific values
- Buffer-collection `Promise` wrapper (lines 83-88) — copy exactly, no changes needed
- Color hex constants used inline: `#1A6B3C` (forest, headings), `#1C2B2B` (jungle, body text), `#C8962A` (gold, divider rule at lines 107-112), `#888` (footer gray)
- Footer text/style block (lines 146-151) — copy `'Powered by Iseyaa — Ogun State Digital Platform'` verbatim
- `formatDate()` private helper (lines 157-169) — copy verbatim if any date columns need `en-NG` locale formatting

**NOT reusable — new code required:** the itinerary body-rendering loop (lines 116-144) is hardcoded to a single-booking narrative list; `MinistryPdfService` needs a new tabular row-rendering method. Per RESEARCH.md Pattern 3, hand-rolled `doc.text(value, x, y, { width })` column positioning is proportionate here (2-4 columns per report) — this is explicitly NOT a "don't hand-roll" violation.

**Error handling pattern to mirror (lines 51-58):**
```typescript
try {
  const buffer = await this.renderPdf(/* report data */);
  return buffer; // streamed directly, no S3 upload — see csv-export.service.ts note below
} catch (err: any) {
  this.logger.error(`MinistryPdfService.render failed: ${err.message}`);
  throw new ServiceUnavailableException('Failed to generate report PDF');
}
```
**Deviation from analog:** `ItineraryPdfService.generateAndUpload()` uploads to S3 and returns a URL (lines 41-59). Per RESEARCH.md's Standard Stack "Alternatives Considered," Ministry exports should be **direct streamed responses** (`@Res()` + `Content-Disposition: attachment`), not S3-upload-then-URL — these are on-demand ad-hoc downloads of live filtered data, not persisted-per-booking artifacts. Only the `renderPdf()`-style pure-generation method (returns `Buffer`, no S3 call) should be mirrored, not `generateAndUpload()`.

### `backend/src/common/services/csv-export.service.ts` (service, streaming/file-I/O)

**No analog found in this repo** — first CSV export anywhere in the codebase. Per RESEARCH.md's Standard Stack, use `fast-csv`'s `format()`/`writeToString()` API (new dependency, `npm install fast-csv --workspace=backend`). Structural shape should still mirror the CommonModule single-purpose-service convention (`qr.service.ts`'s brevity):
```typescript
import { Injectable } from '@nestjs/common';
import { writeToString } from '@fast-csv/format';

@Injectable()
export class CsvExportService {
  async toCsv(rows: Record<string, unknown>[], headers: string[]): Promise<string> {
    return writeToString(rows, { headers });
  }
}
```
Register in `CommonModule` providers/exports alongside `VisitorLogService`.

### `backend/src/modules/events/events.service.ts` (service, event-driven — modify existing `checkin()`)

**Analog:** same file, existing `checkin()` method (lines 319-351, full method read above)

**Modification point — after the `ticket.update()` call (line 345-348), before `return { result: 'VALID' }` (line 350):**
```typescript
await this.prisma.ticket.update({
  where: { id: ticket.id },
  data: { status: 'USED', usedAt: new Date() },
});

// Phase 14 — Ministry Dashboard visitor-entry capture (D-01, D-08)
await this.visitorLogService.record({
  lgaId: ticket.ticketType.event.lgaId, // requires adding `lgaId: true` to the event select at line 325
  purpose: ticket.purpose ?? 'Event Attendance', // default per D-06
  sourceType: 'EVENT',
  sourceId: ticket.id,
  visitedAt: new Date(),
  userRole: ticket.user.role, // requires adding `user: { select: { role: true } }` to the include at line 322-328
}).catch((err) => this.logger.error(`VisitorLog write failed for ticket ${ticket.id}`, err.message));

return { result: 'VALID' };
```
**Constructor change required:** `EventsService` must inject `VisitorLogService` (CommonModule global export, no module import needed — same as it presumably already injects `QrService`).

### `backend/src/modules/stays/stays.service.ts` (service, event-driven — modify existing `handleStayPayment()`)

**Analog:** same file, existing `@OnEvent('payment.stay_booking')` handler (lines 255-309, full method read above)

**Modification point — after the `booking.update()` call (line 268-271):**
```typescript
await this.prisma.booking.update({
  where: { id: booking.id },
  data: { status: 'CONFIRMED' },
});

// Phase 14 — Ministry Dashboard visitor-entry capture (D-01, D-02, D-08)
// visitedAt is future-dated (booking.checkIn) — counted at read-time via `WHERE visitedAt <= NOW()`
await this.visitorLogService.record({
  lgaId: booking.property.lgaId, // requires adding `lgaId: true` to the property select at line 261
  purpose: booking.purpose ?? 'Tourism/Leisure', // default per D-06
  sourceType: 'STAY',
  sourceId: booking.id,
  visitedAt: booking.checkIn,
  userRole: booking.user.role, // requires adding `role: true` to the user select at line 262
}).catch((err) => this.logger.error(`VisitorLog write failed for booking ${booking.id}`, err.message));
```
**Error handling note:** this write must happen inside the existing outer `try { ... } catch (err) { this.logger.error(...) }` block (lines 256-308) OR have its own inner `.catch()` — the analog's existing pattern already swallows errors at the method level, so either approach is consistent, but an inner `.catch()` is safer (prevents a `VisitorLog` failure from blocking the SendGrid confirmation emails that follow it in the same method).

### `backend/src/modules/tour-bookings/tour-settlement.service.ts` (service, event-driven — modify existing `handleTourBookingPayment()`)

**Analog:** same file, existing `@OnEvent('payment.tour_booking')` handler (lines 102-260+, partial read above)

**Modification point — after the `settlementService.settle()` call's `onSettled` callback confirms the booking, or immediately after the booking status write inside that callback (status write locations noted in RESEARCH.md at lines 253/311 of this file, not directly read in this pass — planner should locate the exact `TourBooking.status = 'CONFIRMED'` write and insert the `VisitorLogService.record()` call there):**
```typescript
// Phase 14 — Ministry Dashboard visitor-entry capture (D-01, D-02, D-08)
await this.visitorLogService.record({
  lgaId: tourPackage.lgaId, // NULLABLE per schema.prisma:950 — pass through as-is, VisitorLog.lgaId is also nullable
  purpose: booking.purpose ?? 'Tourism/Leisure', // default per D-06
  sourceType: 'TOUR',
  sourceId: booking.id,
  visitedAt: booking.tourDate,
  userRole: buyer.role,
}).catch((err) => this.logger.error(`VisitorLog write failed for tour booking ${booking.id}`, err.message));
```
**Note the module-string trap (RESEARCH.md Pitfall 3):** this file's `settlementService.settle({ module: 'tour_booking', ... })` call at line 241 is what lands in `Transaction.metadata.module` — do not confuse with `'tour'`, used elsewhere on `TourBooking.metadata` itself.

---

### `web/src/app/admin/ministry/page.tsx` (component, request-response)

**Analog:** `web/src/app/admin/tours/revenue/page.tsx` full file (243 lines read above)

**Imports pattern (lines 1-9):**
```typescript
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { TrendingUp, Users, MapPin, Download, FileText, Table2 } from 'lucide-react';
import { fetcher } from '@/lib/api';
```

**Role-gate pattern (lines 11, 62-63) — per UI-SPEC.md, use the Ministry-specific allowlist:**
```typescript
const ALLOWED_ROLES = ['MINISTRY_VIEWER', 'STATE_ADMIN', 'SUPER_ADMIN'];
// ...
if (status === 'unauthenticated') redirect('/login');
if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/'); // NOT '/admin' — UI-SPEC.md explicitly calls out this deviation
```

**Date-range filter state pattern (lines 13-21, 57-60) — copy `defaultDateRange()` helper verbatim:**
```typescript
function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
```

**Data-fetch pattern (lines 74-83) — TanStack Query keyed on filter state:**
```typescript
const { data, isLoading, isFetching } = useQuery({
  queryKey: ['ministry-visitor-entries', from, to, lgaId],
  queryFn: () => fetcher(`/ministry/visitor-entries?from=${from}&to=${to}${lgaId ? `&lgaId=${lgaId}` : ''}`),
  enabled: status === 'authenticated',
});
```

**KPI summary card grid pattern (lines 166-189) — copy verbatim, swap labels/values.**

**Currency formatting helper (lines 23-27) — copy verbatim, apply to the revenue-to-government panel only (per UI-SPEC.md's gold-reserved-for-money rule):**
```typescript
function fmtNgn(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString('en-NG')}`;
}
```

**Export button pattern (net-new, per UI-SPEC.md Copywriting Contract) — no direct analog for file-download buttons anywhere in `web/src`; use `.btn-gold` for "Export PDF" (primary) and `.btn-ghost` for "Export CSV" (secondary), with a `useState` loading flag toggling button text to "Preparing…" while the fetch is in flight, and `sonner`'s `toast.error(...)` (see below) on failure:**
```typescript
const handleExport = async (format: 'csv' | 'pdf') => {
  setExporting(format);
  try {
    const res = await api.get(`/ministry/visitor-entries/export?format=${format}&from=${from}&to=${to}`, { responseType: 'blob' });
    // trigger browser download from blob — window.URL.createObjectURL + <a download>
  } catch {
    toast.error('Export failed — try again');
  } finally {
    setExporting(null);
  }
};
```

**Empty-state pattern (mirrors `admin/tours/revenue/page.tsx` lines 155-162, upgraded to heading+body pair per UI-SPEC.md's Copywriting Contract):**
```typescript
<div className="flex flex-col items-center justify-center py-20 text-center">
  <div className="w-14 h-14 rounded-2xl bg-forest/10 border border-forest/15 flex items-center justify-center mb-3">
    <Users size={22} className="text-forest-light/40" />
  </div>
  <p className="text-white font-bold mb-1">No entries for this period</p>
  <p className="text-white/35 text-sm">Try a wider date range or clear the LGA filter to see more results.</p>
</div>
```

### `web/src/components/admin/ministry/*Chart.tsx` (component, request-response)

**Analog:** `web/src/components/admin/tours/RevenueBreakdownChart.tsx` full file (131 lines read above)

**Copy verbatim:** `recharts` imports (lines 3-12), `CustomTooltip` component shape (lines 42-66, dark `bg-jungle` tooltip card), `ResponsiveContainer`/`BarChart`/`CartesianGrid`/`XAxis`/`YAxis` configuration (lines 102-118, including the exact `tick`/`axisLine`/`tickLine` styling values), empty-data guard (lines 93-99).

**Color-mapping pattern to adapt (lines 119-126) — for the revenue-to-government chart specifically, mirror the `isPlatform` gold/forest cell-fill split exactly (per UI-SPEC.md's explicit callout: "gold marks the government's cut specifically, forest marks everything else"); for the visitor-entries and purpose-of-visit charts (non-revenue data), use forest (`rgba(26,107,60,0.85)`) for all bars — no gold, since UI-SPEC.md reserves gold exclusively for money figures:**
```typescript
<Cell fill={entry.isPlatform ? 'rgba(200,150,42,0.85)' : 'rgba(26,107,60,0.85)'} />
```

## Shared Patterns

### RBAC — `RolesGuard` / `@Roles()` / `JwtAuthGuard`
**Source:** `backend/src/common/guards/roles.guard.ts` (verbatim, unchanged) + `backend/src/common/decorators/roles.decorator.ts` (verbatim, unchanged)
**Apply to:** `MinistryController` — every route, class-level `@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)` (zero new guard infrastructure needed)
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MINISTRY_VIEWER)
@Controller('ministry')
export class MinistryController { /* ... */ }
```

### Monthly-bucket + LGA-join `$queryRaw` aggregation
**Source:** `backend/src/modules/admin/admin.service.ts` lines 59-89 (`getRevenue()`'s `byLga`/`byMonth` queries)
**Apply to:** `MinistryService.getVisitorEntriesByLgaAndMonth()`, `.getPurposeBreakdown()`, `.getRevenueToGovernment()` — all three MIN-02/03/04 aggregate queries. Always use Prisma tagged-template `$queryRaw` (auto-parameterized) for `from`/`to`/`lgaId` filters — never string-concatenate raw SQL (RESEARCH.md's SQL-injection mitigation, ASVS V5).

### PDF branded shell (Forest/Jungle/Gold + buffer-Promise + footer)
**Source:** `backend/src/common/services/itinerary-pdf.service.ts` lines 73-88 (constructor + buffer wrapper), 107-112 (gold divider), 146-151 (footer), 157-169 (`formatDate()`)
**Apply to:** `MinistryPdfService` — all three report PDF exports (D-13). Colors: `#1A6B3C` forest headings, `#1C2B2B` jungle body, `#C8962A` gold accents/dividers.

### CommonModule direct-injection registration
**Source:** `backend/src/common/common.module.ts` (verbatim, `providers`/`exports` array pattern)
**Apply to:** `VisitorLogService` and `CsvExportService` — both added to both arrays; `@Global()` means `EventsModule`/`StaysModule`/`TourBookingsModule` need no explicit import to inject them.

### Additive Postgres enum migration (`ALTER TYPE ADD VALUE`)
**Source:** `backend/prisma/migrations/20260623120000_phase9_tour_packages/migration.sql` lines 1-15
**Apply to:** `MINISTRY_VIEWER` addition to `UserRole` — hand-authored SQL, never `prisma migrate dev` auto-diff, `ALTER TYPE` must precede any DDL using the new value in the same migration file.

### Toast error feedback (`sonner`)
**Source:** `web/src/app/admin/reviews/queue/page.tsx` line 114 (`onError: () => toast.error('Failed to update flag')`)
**Apply to:** Ministry export-button failure path — `toast.error('Export failed — try again')` per UI-SPEC.md's Copywriting Contract. No `toast.success` needed on export completion (browser's native download indicator suffices, per UI-SPEC.md).

### Web admin role-gate + date-range filter shell
**Source:** `web/src/app/admin/tours/revenue/page.tsx` lines 11, 13-21, 62-63
**Apply to:** `web/src/app/admin/ministry/page.tsx` — `ALLOWED_ROLES` array (Ministry-specific values), `defaultDateRange()` helper, unauthenticated/unauthorized redirect pattern (with the noted `/` vs `/admin` deviation for Ministry viewers).

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/common/services/csv-export.service.ts` | service | streaming/file-I/O | No CSV library or CSV export exists anywhere in the repo today (RESEARCH.md confirmed via grep) — first use of `fast-csv`, net-new dependency and net-new pattern. Structural shape should still follow the single-purpose CommonModule service convention (`qr.service.ts`). |
| `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` | test | — | No `ClassSerializerInterceptor`/`@Exclude`/`plainToInstance`/field-allowlist test pattern exists anywhere in this codebase (RESEARCH.md confirmed via grep, zero matches). Full concrete pattern already drafted in RESEARCH.md's "PII Isolation — Field-Allowlist Test Pattern" section — copy that recursive-key-denylist + value-canary scanner directly, it is the authoritative source for this file, not a repo analog. |
| Web `Export` button / blob-download trigger logic | component | file-I/O | No existing file-download-triggering button exists in `web/src` (`RevenueBreakdownChart`/`tours/revenue` pages only render data, they don't export it). Use standard `axios` `responseType: 'blob'` + `window.URL.createObjectURL` + synthetic `<a download>` click — no project precedent, but a well-established browser-API pattern, not something to hand-roll unusually. |

## Metadata

**Analog search scope:** `backend/src/modules/admin/`, `backend/src/common/services/`, `backend/src/common/guards/`, `backend/src/common/decorators/`, `backend/src/common/enums/`, `backend/src/common/common.module.ts`, `backend/src/modules/events/events.service.ts`, `backend/src/modules/stays/stays.service.ts`, `backend/src/modules/tour-bookings/`, `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260623120000_phase9_tour_packages/`, `web/src/app/admin/tours/`, `web/src/app/admin/reviews/`, `web/src/components/admin/tours/`, `web/src/lib/api.ts`, `shared/src/types/index.ts`
**Files scanned:** ~25 (read in full or targeted ranges)
**Pattern extraction date:** 2026-07-18
