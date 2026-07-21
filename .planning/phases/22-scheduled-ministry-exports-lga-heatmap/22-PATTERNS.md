# Phase 22: Scheduled Ministry Exports & LGA Heatmap - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 13 (8 backend new/modified, 2 web new/modified, 3 test)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` (new `MinistryExportSubscription` model + `ExportCadence`/`ExportDeliveryStatus` enums) | model | CRUD | `SettlementSplitTier` model (`backend/prisma/schema.prisma:696-720`) | exact (schema-design precedent explicitly named in CONTEXT.md D-02) |
| `backend/src/modules/ministry/ministry-export-subscription.controller.ts` | controller | request-response (CRUD) | `backend/src/modules/admin/admin.controller.ts` (settlement-splits routes, lines 102-114) | exact (precedent explicitly named in CONTEXT.md D-10) |
| `backend/src/modules/ministry/ministry-export-subscription.service.ts` | service | CRUD | `backend/src/modules/admin/admin.service.ts` (`listSplitTiers`/`updateSplitTier`, lines 176-216) | role-match (CRUD shape same; audit-trail insert/deactivate NOT reused — in-place update instead, see Shared Patterns) |
| `backend/src/modules/ministry/ministry-export-scheduler.service.ts` | service | event-driven (cron) | `backend/src/modules/stays/stays.service.ts` (`releaseEscrow()`, lines 331-390) + `backend/src/modules/tour-bookings/tour-notifications.service.ts` (per-row try/catch, lines 165-375) | exact (both explicitly named in CONTEXT.md/RESEARCH.md as the idiom to replicate) |
| `backend/src/modules/ministry/dto/create-export-subscription.dto.ts` | utility (DTO) | request-response | `backend/src/modules/tour-packages/dto/create-tour-package.dto.ts` (array validation, line 91) + `backend/src/modules/admin/dto/update-split-tier.dto.ts` | role-match |
| `backend/src/modules/ministry/dto/update-export-subscription.dto.ts` | utility (DTO) | request-response | `backend/src/modules/admin/dto/update-split-tier.dto.ts` | exact (optional-field PATCH DTO shape) |
| `backend/src/modules/ministry/ministry.module.ts` | config (module wiring) | — | `backend/src/modules/admin/admin.module.ts` | exact |
| `backend/src/common/services/sendgrid.service.ts` (add `sendMinistryDigest()`) | service | request-response | Same file — `sendTicketConfirmation()`/`sendBookingConfirmation()` (dedicated-method pattern, lines 43-152) | exact (D-14: extend same file with a new dedicated method) |
| `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` | component | transform (client-side aggregation + render) | `web/src/components/admin/ministry/VisitorEntriesChart.tsx` | role-match (same data source shape; aggregation dimensionality differs — LGA×month vs LGA-only, see Pitfall 5 in RESEARCH.md) |
| `web/src/app/admin/ministry/page.tsx` (mount new panel) | component (page) | request-response | Same file — existing 3-panel structure (Visitor Entries / Purpose / Revenue panels, lines 229-360) | exact (add 4th panel copying the same panel shell, minus export buttons per D-08) |
| `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts` | test | event-driven | `backend/src/modules/stays/__tests__/stays.service.spec.ts` (`releaseEscrow` cron-lock tests, lines 504-521) | exact |
| `backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts` | test | request-response | No direct controller-spec analog found for `admin.controller.ts`; use `admin.service.ts` CRUD shape + standard NestJS controller-spec harness | role-match |
| `backend/src/common/services/__tests__/sendgrid.service.spec.ts` (extend) | test | request-response | Same file — existing `sendOtpEmail`/`sendEmail` describe blocks (full file, 58 lines) | exact |

## Pattern Assignments

### `backend/prisma/schema.prisma` (model, CRUD)

**Analog:** `SettlementSplitTier` (`backend/prisma/schema.prisma:696-720`)

**Full analog model:**
```prisma
model SettlementSplitTier {
  id            String    @id @default(uuid())
  module        String
  tierName      String    @default("default")
  minAmountNgn  Decimal?
  maxAmountNgn  Decimal?
  earnerPct     Decimal
  ministryPct   Decimal
  platformPct   Decimal?
  isActive      Boolean   @default(true)
  effectiveFrom DateTime  @default(now())
  metadata      Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([module, tierName])
  @@index([module, isActive])
  @@map("settlement_split_tiers")
}
```

**Adaptation for this phase** (typed columns per D-02, but in-place field updates — NOT the insert-new-row/deactivate-old audit trail, per CONTEXT.md's own code_context note and RESEARCH.md's "Alternatives Considered"):
```prisma
enum ExportCadence {
  WEEKLY
  MONTHLY
  QUARTERLY
}

enum ExportDeliveryStatus {
  PENDING
  SUCCESS
  FAILED
}

model MinistryExportSubscription {
  id          String                @id @default(uuid())
  recipients  String[]              // D-11: free-text emails, not FK to User
  cadence     ExportCadence
  isActive    Boolean               @default(true)
  lastSentAt  DateTime?             // D-04: rolling-window anchor; null until first successful send
  lastStatus  ExportDeliveryStatus  @default(PENDING)
  lastError   String?               // D-12; truncate before persisting (see Shared Patterns)
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  @@index([isActive])
  @@map("ministry_export_subscriptions")
}
```
Note: array field convention (`recipients String[]`) already used elsewhere in the schema for `imageUrls`/`amenities`-style fields — no new Prisma pattern introduced.

---

### `backend/src/modules/ministry/ministry-export-subscription.controller.ts` (controller, request-response)

**Analog:** `backend/src/modules/admin/admin.controller.ts` lines 1-20, 102-115

**Imports pattern:**
```typescript
import {
  Controller, Get, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateSplitTierDto } from './dto/update-split-tier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
```

**Auth/guard pattern:**
```typescript
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)   // class-level default
@Controller('admin')
export class AdminController {
```
This phase's new controller must gate at `@Roles(UserRole.SUPER_ADMIN)` ONLY (no `LGA_ADMIN`/`MINISTRY_VIEWER`/`STATE_ADMIN` — D-10 is strictly SUPER_ADMIN, stricter than the class-level default above). Apply `@Roles(UserRole.SUPER_ADMIN)` at both class level (or repeat per-route like the settlement-splits routes below do for extra clarity within a shared controller).

**Core CRUD pattern** (settlement-splits routes, the direct precedent):
```typescript
@Get('settlement-splits')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'List settlement split tiers, optionally filtered by module' })
listSplitTiers(@Query('module') module?: string) {
  return this.adminService.listSplitTiers(module);
}

@Patch('settlement-splits/:id')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: 'Update a settlement split tier (creates new active row, deactivates prior — D-05 audit trail)' })
updateSplitTier(@Param('id') id: string, @Body() dto: UpdateSplitTierDto) {
  return this.adminService.updateSplitTier(id, dto);
}
```
New controller needs full CRUD (GET list, POST create, PATCH :id, DELETE :id) per D-10 — settlement-splits only has GET+PATCH since tiers are seeded, not created via API. Add `@Post()` and `@Delete(':id')` handlers following the identical `@Roles(UserRole.SUPER_ADMIN)` + `@ApiOperation` shape.

---

### `backend/src/modules/ministry/ministry-export-subscription.service.ts` (service, CRUD)

**Analog:** `backend/src/modules/admin/admin.service.ts` lines 174-217

**CRUD pattern (read + in-place update, NOT the audit-trail insert/deactivate):**
```typescript
// ── Settlement Split Tiers ──────────────────────────────────────────────────

listSplitTiers(module?: string) {
  return this.prisma.settlementSplitTier.findMany({
    where: module ? { module } : undefined,
    orderBy: [{ module: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

async updateSplitTier(id: string, dto: UpdateSplitTierDto) {
  const prior = await this.prisma.settlementSplitTier.findUnique({ where: { id } });
  if (!prior) {
    throw new NotFoundException('Settlement split tier not found');
  }
  // ... validation ...
  return this.prisma.$transaction(async (tx) => {
    await tx.settlementSplitTier.update({ where: { id: prior.id }, data: { isActive: false } });
    return tx.settlementSplitTier.create({ data: { /* new row */ } });
  });
}
```
**Deviation for this phase:** per D-12/A4 in RESEARCH.md, `lastSentAt`/`lastStatus`/`lastError` are operational status fields, not audit-trail-versioned like split percentages — use a plain `this.prisma.ministryExportSubscription.update({ where: { id }, data: {...} })` in place, no `$transaction`/insert-new-row/deactivate-old needed for CRUD mutations. Follow `NotFoundException` pattern for missing-id (`findUnique` → throw if null) exactly as `updateSplitTier` does.

---

### `backend/src/modules/ministry/ministry-export-scheduler.service.ts` (service, event-driven/cron)

**Analog 1 — `@Cron` + `setNx()` guard:** `backend/src/modules/stays/stays.service.ts:331-337`
```typescript
@Cron(CronExpression.EVERY_HOUR)
async releaseEscrow(): Promise<void> {
  const acquired = await this.redis.setNx('cron-lock:releaseEscrow', '1', 3300);
  if (!acquired) {
    this.logger.debug('releaseEscrow: lock held by another replica — skipping this tick');
    return;
  }
  // ... query + iterate ...
}
```
For this phase's once-daily tick: `setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000)` (TTL slightly under 24h, mirroring the "slightly under one tick interval" ratio `releaseEscrow` uses for its hourly tick: 3300s under 3600s).

**Analog 2 — per-row try/catch loop (avoid one bad row blocking others):** `backend/src/modules/tour-bookings/tour-notifications.service.ts:192-243` (and repeated at 278-315, 342-375 for the other two cron methods in the same file)
```typescript
for (const b of candidates) {
  try {
    // ... gather data, render, send ...
    await this.setMetadataFlag(b.id, meta, FLAG, true);
  } catch (err: any) {
    this.logger.error(`pushTMinus2h failed for booking ${b.id}: ${err.message}`);
    // loop continues — one bad row does not abort the tick
  }
}
```
Apply this shape per due `MinistryExportSubscription` row: on success, `update({ lastSentAt: new Date(), lastStatus: 'SUCCESS', lastError: null })`; on failure (after resilience retries exhausted), `update({ lastStatus: 'FAILED', lastError: err.message.slice(0, 500) })` — **`lastSentAt` intentionally NOT touched on failure** (D-13/Pitfall 4 in RESEARCH.md — this is the exact bug class to avoid).

**Analog 3 — `ResilienceService.execute('sendgrid', ...)` (copy verbatim):** `backend/src/modules/auth/auth.service.ts:191-193`
```typescript
await this.resilience.execute('sendgrid', () =>
  this.sendgrid.sendOtpEmail(email!, firstName ?? 'there', otp),
);
```
For this phase:
```typescript
await this.resilience.execute('sendgrid', () =>
  this.sendgrid.sendMinistryDigest({ to: subscription.recipients, /* ... */, attachments }),
);
```
`'sendgrid'` vendor is already registered in `backend/src/resilience/resilience.types.ts:20,48` (`timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000`) — no new vendor registration needed. `ResilienceService` is `@Global()`-scoped, inject via constructor only.

**setNx() primitive (unchanged, reused as-is):** `backend/src/redis/redis.service.ts:131-137`
```typescript
async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!this.client || !this.enabled) return true; // optimistic fallback
  try {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch { return true; } // optimistic fallback on error
}
```

**Digest content assembly (reuse `MinistryPdfService`/`CsvExportService` unmodified):**
```typescript
// Source: backend/src/modules/ministry/ministry.controller.ts:160-172 (existing revenue export)
const buffer = await this.ministryPdfService.renderPdf({
  title: 'Ministry Export Digest',
  sections: [
    { heading: 'Visitor Entries', columns: VISITOR_ENTRIES_PDF_COLUMNS, rows: visitorRows },
    { heading: 'Purpose of Visit', columns: PURPOSE_BREAKDOWN_COLUMNS, rows: purposeRows },
    { heading: 'Revenue — By Module', columns: REVENUE_MODULE_COLUMNS, rows: revenue.byModule },
    { heading: 'Revenue — By Month', columns: REVENUE_MONTH_COLUMNS, rows: revenue.byMonth },
    { heading: 'Revenue — By LGA', columns: REVENUE_LGA_COLUMNS, rows: revenue.byModuleLga },
  ],
});
```
`MinistryPdfService.renderPdf(input: MinistryPdfInput): Promise<Buffer>` signature confirmed at `backend/src/common/services/ministry-pdf.service.ts:33-57` — `MinistryPdfInput = { title: string; sections: MinistryPdfSection[] }`, `MinistryPdfSection = { heading?: string; columns: MinistryPdfColumn[]; rows: Record<string, unknown>[] }`. No renderer changes needed — pass all report sections in one call.

`CsvExportService.toCsv(rows, headers)` signature at `backend/src/common/services/csv-export.service.ts:12-17`:
```typescript
async toCsv(rows: Record<string, unknown>[], headers: string[]): Promise<string> {
  return writeToString(rows, { headers, alwaysWriteHeaders: true });
}
```

**Data source methods (unchanged, call exactly as-is):**
```typescript
this.ministryService.getVisitorEntriesByLgaAndMonth(from, to, lgaId)
this.ministryService.getPurposeBreakdown(from, to, lgaId)
this.ministryService.getRevenueToGovernment(from, to)
```
Window per subscription: `from = subscription.lastSentAt ?? subscription.createdAt`, `to = now` (D-04 — per-subscription rolling window, NOT a shared `MinistryQueryDto` window).

---

### `backend/src/modules/ministry/dto/create-export-subscription.dto.ts` / `update-export-subscription.dto.ts` (DTO, request-response)

**Analog 1 — array-of-string validation:** `backend/src/modules/tour-packages/dto/create-tour-package.dto.ts:91`
```typescript
@IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('all', { each: true }) attractionIds!: string[];
```
For `recipients: string[]`, swap the item validator to `@IsEmail({}, { each: true })` per RESEARCH.md's Security Domain section:
```typescript
@IsArray()
@ArrayMinSize(1)
@IsEmail({}, { each: true })
recipients!: string[];
```

**Analog 2 — optional-field PATCH DTO shape:** `backend/src/modules/admin/dto/update-split-tier.dto.ts` (full file)
```typescript
import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSplitTierDto {
  @ApiPropertyOptional({ example: 0.85 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  earnerPct?: number;
  // ...
}
```
Mirror this for `UpdateExportSubscriptionDto`: all fields `@IsOptional()`, `@ApiPropertyOptional()`.

**Cadence enum validation** — follow `MinistryQueryDto`'s `@IsIn()` pattern (`backend/src/modules/ministry/dto/ministry-query.dto.ts:20-26`) but with `@IsEnum(ExportCadence)` since this is a real Prisma enum, not a literal union:
```typescript
@IsEnum(ExportCadence, { message: 'cadence must be WEEKLY, MONTHLY, or QUARTERLY' })
cadence!: ExportCadence;
```

---

### `backend/src/modules/ministry/ministry.module.ts` (config, module wiring)

**Analog:** `backend/src/modules/admin/admin.module.ts` (full file)
```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```
Current `ministry.module.ts` (full file, to be extended):
```typescript
import { Module } from '@nestjs/common';
import { MinistryController } from './ministry.controller';
import { MinistryService } from './ministry.service';

@Module({
  controllers: [MinistryController],
  providers: [MinistryService],
})
export class MinistryModule {}
```
Add `MinistryExportSubscriptionController` to `controllers`, and `MinistryExportSubscriptionService`/`MinistryExportSchedulerService` to `providers`. `PrismaModule`, `CommonModule` (incl. `SendgridService`, `CsvExportService`, `MinistryPdfService`), `RedisModule`, and `ResilienceModule` are all `@Global()` — no new imports array entries needed beyond the new local providers/controller.

---

### `backend/src/common/services/sendgrid.service.ts` (service, request-response — add `sendMinistryDigest()`)

**Analog — dedicated-method pattern (same file), full existing structure:**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.from = config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng');
    const key = config.get<string>('SENDGRID_API_KEY', '');
    if (key && key !== 'SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
      sgMail.setApiKey(key);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await sgMail.send({ to, from: this.from, subject, html });
    } catch (err) {
      this.logger.error(`SendGrid failed for ${to}: ${err?.response?.body ?? err.message}`);
    }
  }
```
`sendEmail()` swallows errors (fire-and-forget). `sendOtpEmail()` (lines 26-41) deliberately does NOT swallow — it lets `sgMail.send()` rejections propagate, because its caller (`resilience.execute('sendgrid', ...)`) needs the real rejection to trigger retry/fallback logic:
```typescript
// Deliberately does NOT call this.sendEmail() and has NO try/catch — the caller
// (resilience.execute('sendgrid', ...) in Plan 15-03) depends on a real rejection
// propagating here to trigger the SMS fallback (OTP-02). See RESEARCH.md Pitfall 1.
async sendOtpEmail(to: string, firstName: string, otp: string): Promise<void> {
  const html = `...`;
  await sgMail.send({ to, from: this.from, subject: 'Your Iṣẹ́yáá verification code', html });
}
```
**`sendMinistryDigest()` must follow `sendOtpEmail()`'s NO-swallow shape** (not `sendEmail()`'s swallow shape) — per D-13/Pitfall 2 in RESEARCH.md, the calling scheduler's try/catch needs the real error to mark `lastStatus = FAILED`.

**Dedicated-method params shape precedent:** `sendBookingConfirmation()` (lines 122-152) takes a single `params: {...}` object — follow this shape:
```typescript
async sendMinistryDigest(params: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ content: string; filename: string; type: string; disposition: string }>;
}): Promise<void> {
  const { to, subject, html, attachments } = params;
  await sgMail.send({ to, from: this.from, subject, html, ...(attachments?.length ? { attachments } : {}) });
}
```
`@sendgrid/mail`'s `attachments` field shape (base64 `content`, `filename`, `type` MIME string, `disposition: 'attachment'`) — genuinely new, no existing call site to copy verbatim (confirmed gap per CONTEXT.md's "Attachment support gap" section).

---

### `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` (component, transform)

**Analog:** `web/src/components/admin/ministry/VisitorEntriesChart.tsx` (full file, 121 lines)

**Data row type + aggregation shape to copy (imports/interface):**
```typescript
'use client';

export interface VisitorEntryRow {
  lgaId: string | null;
  lgaName: string | null;
  month: string;
  userRole: string;
  count: number;
}
```
Reuse this exact `VisitorEntryRow` type — the heatmap consumes the same `/ministry/visitor-entries` response shape, no new backend type needed.

**Aggregation pattern (same technique, DIFFERENT dimensionality — critical distinction, see RESEARCH.md Pitfall 5):**
```typescript
// Source: VisitorEntriesChart.tsx:39-48 — sums userRole buckets, COLLAPSING month
// (its x-axis is LGA only). The heatmap must sum userRole buckets while KEEPING
// month as a distinct axis — group by (lgaName, month), not lgaName alone:
function aggregateByLgaAndRole(data: VisitorEntryRow[]): AggregatedLgaRow[] {
  const byLga = new Map<string, AggregatedLgaRow>();
  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    const entry = byLga.get(lgaName) ?? { lgaName, TOURIST: 0, CITIZEN: 0, OTHER: 0 };
    entry[bucketRole(row.userRole)] += row.count;
    byLga.set(lgaName, entry);
  }
  return Array.from(byLga.values());
}
```
**Heatmap's own aggregation** (per Pattern 5 in RESEARCH.md — group by `(lgaName, month)`, sum across `userRole`):
```typescript
import { OGUN_LGA_NAMES } from '@iseyaa/shared';

function buildGrid(data: VisitorEntryRow[]): { months: string[]; grid: Map<string, Map<string, number>> } {
  const months = Array.from(new Set(data.map((r) => r.month))).sort();
  const grid = new Map<string, Map<string, number>>();
  for (const lgaName of OGUN_LGA_NAMES) grid.set(lgaName, new Map(months.map((m) => [m, 0])));
  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    if (!grid.has(lgaName)) grid.set(lgaName, new Map(months.map((m) => [m, 0])));
    const monthMap = grid.get(lgaName)!;
    monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + row.count);
  }
  return { months, grid };
}
```

**Color-intensity styling precedent (fixed opacity tiers, not continuous gradient):** `VisitorEntriesChart.tsx:114-116`
```typescript
<Bar dataKey="TOURIST" stackId="role" fill="rgba(26,107,60,0.85)" ... />
<Bar dataKey="CITIZEN" stackId="role" fill="rgba(26,107,60,0.55)" ... />
<Bar dataKey="OTHER" stackId="role" fill="rgba(26,107,60,0.3)" ... />
```
Follow the same "fixed opacity tiers, not a continuous gradient function" approach for the heatmap's own cell intensity classes:
```typescript
function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-white/5';
  const ratio = count / max;
  if (ratio > 0.75) return 'bg-forest';
  if (ratio > 0.5) return 'bg-forest/70';
  if (ratio > 0.25) return 'bg-forest/40';
  return 'bg-forest/20';
}
```
Tailwind tokens confirmed at `web/tailwind.config.ts:12-13`: `forest: '#1A6B3C'`, `gold: '#C8962A'` (plus `forest-light`/`forest-bright`/`forest-dark`, `gold-light`/`gold-dark` variants).

**Empty-state pattern (copy from same file, lines 88-94):**
```typescript
if (chartData.length === 0 || chartData.every((d) => d.TOURIST + d.CITIZEN + d.OTHER === 0)) {
  return (
    <div className="flex items-center justify-center h-48 text-white/30 text-sm">
      No entries for this selection
    </div>
  );
}
```

**20-LGA constant:** `shared/src/constants/index.ts:8-14` — `OGUN_LGA_NAMES` (confirmed 20 entries: Abeokuta North/South, Ado-Odo/Ota, Egbado North/South, Ewekoro, Ifo, Ijebu East/North/North East/Ode, Ikenne, Imeko Afon, Ipokia, Obafemi Owode, Odeda, Odogbolu, Ogun Waterside, Remo North, Shagamu). Import via `@iseyaa/shared` — already the established cross-workspace import path.

---

### `web/src/app/admin/ministry/page.tsx` (page component, request-response — mount new panel)

**Analog:** same file — 3 existing panels follow one shared shell shape (lines 229-360). Copy the **Visitor Entries panel's shell** (lines 229-270) most closely since the heatmap consumes the same query response:
```typescript
{/* Visitor Entries panel */}
<div className="glass rounded-2xl border border-white/6 overflow-hidden mb-6">
  <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/6">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-forest/20 border border-forest/30 flex items-center justify-center">
        <Users size={14} className="text-forest-light" />
      </div>
      <h2 className="font-bold text-white text-sm">Visitor Entries</h2>
    </div>
    <div className="flex items-center gap-2">
      {/* export buttons — OMIT for the heatmap panel per D-08 */}
    </div>
  </div>
  <div className="px-4 py-5">
    {isVisitorLoading ? (
      <div className="h-64 skeleton rounded-xl" />
    ) : isVisitorError ? (
      <ErrorPanelState />
    ) : (visitorEntries ?? []).length === 0 ? (
      <EmptyPanelState />
    ) : (
      <VisitorEntriesChart data={visitorEntries ?? []} />
    )}
  </div>
</div>
```
New heatmap panel: same shell, no export button pair (D-08 — dashboard-only), reuses the **same** `visitorEntries` query result already fetched for the existing panel (`useQuery<VisitorEntryRow[]>({ queryKey: ['ministry-visitor-entries', from, to, lgaId], queryFn: () => fetcher(...) })`, lines 96-104) — no new API call, `<LgaMonthHeatmap data={visitorEntries ?? []} />` consumes the same already-fetched array. `ALLOWED_ROLES` gating (line 22) and `EmptyPanelState`/`ErrorPanelState` (lines 48-66) are reused verbatim, no changes.

---

### `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts` (test, event-driven)

**Analog:** `backend/src/modules/stays/__tests__/stays.service.spec.ts` lines 27, 504-521

**Mock + assertion pattern:**
```typescript
const mockRedis = { setNx: jest.fn().mockResolvedValue(true) };

it('acquires cron-lock:releaseEscrow (TTL 3300) and proceeds with existing behavior when the lock is granted', async () => {
  mockPrisma.booking.findMany.mockResolvedValue([dueBooking]);
  mockPrisma.wallet.findUnique.mockResolvedValue(hostWallet);

  await service.releaseEscrow();

  expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:releaseEscrow', '1', 3300);
  expect(mockPrisma.booking.findMany).toHaveBeenCalled();
});

it('skips the tick without querying bookings when the lock is held by another replica', async () => {
  mockRedis.setNx.mockResolvedValueOnce(false);

  await service.releaseEscrow();

  expect(mockRedis.setNx).toHaveBeenCalledWith('cron-lock:releaseEscrow', '1', 3300);
  expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
});
```
Mirror both tests for `checkSubscriptionsDue()` — asserting `setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000)` and that `prisma.ministryExportSubscription.findMany` is/isn't called. Add dedicated cases for D-13 (failure leaves `lastSentAt` unchanged) and D-4 (per-subscription rolling window, distinct `from`/`to` per subscription) per RESEARCH.md's Phase Requirements → Test Map.

---

### `backend/src/common/services/__tests__/sendgrid.service.spec.ts` (test, request-response — extend)

**Analog:** same file (full file, 58 lines) — `sgMail` module mock + `sendOtpEmail` propagation-vs-swallow test pair is the exact shape to replicate for `sendMinistryDigest()`:
```typescript
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('sendOtpEmail', () => {
  it('Test 1: resolves when sgMail.send() resolves, and includes the exact otp string in the HTML body', async () => {
    (sgMail.send as jest.Mock).mockResolvedValue([{}, {}]);
    await expect(service.sendOtpEmail(...)).resolves.toBeUndefined();
    expect(sgMail.send).toHaveBeenCalledTimes(1);
    const sentArgs = (sgMail.send as jest.Mock).mock.calls[0][0];
    expect(sentArgs.html).toContain('482913');
  });

  it('Test 2: REJECTS (propagates the sgMail.send() error) when sgMail.send() rejects', async () => {
    (sgMail.send as jest.Mock).mockRejectedValue(new Error('SendGrid API error'));
    await expect(service.sendOtpEmail(...)).rejects.toThrow('SendGrid API error');
  });
});
```
New `describe('sendMinistryDigest', ...)` block: assert (1) `attachments` array is correctly shaped (base64 `content`, `filename`, `type`, `disposition`) when passed, (2) rejection propagates (same NO-swallow contract as `sendOtpEmail`, not `sendEmail`'s swallow contract), (3) omitted/empty `attachments` when the D-15 size guard trips (send still happens, without the `attachments` key).

## Shared Patterns

### `@Cron` + `setNx()` distributed-lock guard
**Source:** `backend/src/modules/stays/stays.service.ts:331-337`, `backend/src/redis/redis.service.ts:131-137`
**Apply to:** `ministry-export-scheduler.service.ts`'s `checkSubscriptionsDue()` tick — copy the guard verbatim, substitute lock key/TTL only.
```typescript
const acquired = await this.redis.setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000);
if (!acquired) {
  this.logger.debug('checkSubscriptionsDue: lock held by another replica — skipping this tick');
  return;
}
```

### `SUPER_ADMIN`-gated CRUD controller
**Source:** `backend/src/modules/admin/admin.controller.ts:102-114`
**Apply to:** `ministry-export-subscription.controller.ts` — `@Roles(UserRole.SUPER_ADMIN)` at every route, `JwtAuthGuard` + `RolesGuard` at class level, `@ApiTags`/`@ApiBearerAuth`/`@ApiOperation` on every route for Swagger visibility (D-10 explicitly requires Swagger-visible routes).

### `ResilienceService.execute('sendgrid', ...)` wrapper
**Source:** `backend/src/modules/auth/auth.service.ts:191-193`; vendor registered at `backend/src/resilience/resilience.types.ts:20,48`
**Apply to:** the digest send call site in `ministry-export-scheduler.service.ts` — no new vendor registration, `ResilienceService` is `@Global()`.

### Per-row try/catch inside a cron loop, with error-state persisted, `lastSentAt` untouched on failure
**Source:** `backend/src/modules/tour-bookings/tour-notifications.service.ts:192-243`
**Apply to:** `ministry-export-scheduler.service.ts`'s subscription iteration — one subscription's failure must not abort the tick for the others; failed subscriptions remain "due" for the next tick (D-13).

### Error message truncation before persisting to a `SUPER_ADMIN`-readable field
**Source:** RESEARCH.md's Security Domain section references `ResilienceService.summarizeVendorError()` (`backend/src/resilience/resilience.service.ts:191-197`) as the pattern to mirror — status code + error code/message only, never raw response bodies/headers.
**Apply to:** `lastError` field writes in `ministry-export-scheduler.service.ts` — `err.message.slice(0, 500)`, not `err.response.body`.

### FOREST/GOLD Tailwind token usage, fixed-opacity-tier color scale (not continuous gradient)
**Source:** `web/src/components/admin/ministry/VisitorEntriesChart.tsx:114-116`; tokens at `web/tailwind.config.ts:12-13,17-21`
**Apply to:** `LgaMonthHeatmap.tsx`'s cell intensity classes — `bg-forest`, `bg-forest/70`, `bg-forest/40`, `bg-forest/20`, `bg-white/5` for zero, matching the existing chart's `rgba(26,107,60, 0.85|0.55|0.3)` tiered-opacity approach rather than a computed continuous gradient.

## No Analog Found

None — every file in this phase has a direct or role-matched analog in the existing codebase (RESEARCH.md's own conclusion: "Every backend building block this phase needs ... was already built in Phases 14/15/20 for a near-identical problem").

## Metadata

**Analog search scope:** `backend/src/modules/admin/`, `backend/src/modules/ministry/`, `backend/src/modules/stays/`, `backend/src/modules/tour-bookings/`, `backend/src/modules/auth/`, `backend/src/common/services/`, `backend/src/redis/`, `backend/src/resilience/`, `backend/prisma/schema.prisma`, `web/src/components/admin/ministry/`, `web/src/app/admin/ministry/`, DTO directories across several backend modules (for array-validation precedent)
**Files scanned:** 18 read directly (full or targeted sections); CONTEXT.md/RESEARCH.md's own file:line citations were independently re-verified rather than trusted blind
**Pattern extraction date:** 2026-07-21
