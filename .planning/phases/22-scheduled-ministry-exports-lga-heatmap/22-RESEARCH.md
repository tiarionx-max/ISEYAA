# Phase 22: Scheduled Ministry Exports & LGA Heatmap - Research

**Researched:** 2026-07-21
**Domain:** NestJS scheduled jobs (`@nestjs/schedule`), SendGrid transactional email attachments, Prisma schema design, `recharts`-adjacent custom grid visualization
**Confidence:** HIGH — every named reference in CONTEXT.md was located and read in the live codebase at the stated (or near-stated) location; the two genuinely new surfaces (SendGrid attachments, cron-driven digest) are backed by official docs + a direct in-repo `resilience.execute('sendgrid', ...)` precedent.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Digest scope & config**
- D-01: All 3 existing Phase 14 exports (visitor entries + purpose breakdown + revenue-to-government) are bundled into one digest email, rendered as one multi-section branded PDF (reusing `MinistryPdfService`'s existing multi-section renderer) plus CSV attachment(s).
- D-02: Recipient list + cadence are stored in a new dedicated model (not a `PlatformConfig` JSON blob) — mirrors Phase 18's `SettlementSplitTier` precedent: typed columns, not a loose JSON value, so delivery history can be queried directly rather than parsed out of a blob.
- D-03: Cadence is a fixed enum (`WEEKLY` / `MONTHLY`, possibly `QUARTERLY`) — not a free-form cron string. No precedent exists in this codebase for user-editable cron expressions, and a government reporting cadence doesn't need finer granularity.
- D-04: Each digest covers a rolling window since the subscription's own `lastSentAt` (not a fixed calendar period) — self-correcting against late/retried sends, no gaps or double-counted overlaps.

**Heatmap grouping & rendering**
- D-05: Heatmap groups by month only (not season, not a toggle) — reuses `getVisitorEntriesByLgaAndMonth()`'s existing `{lgaId, lgaName, month, count}` shape with zero new backend query work.
- D-06: Rendered as a custom color-intensity grid component (LGA rows × month columns, cell background intensity = visitor count), styled with the existing FOREST (`#1A6B3C`)/GOLD (`#C8962A`) palette — not a `recharts` primitive.
- D-07: Shows all 20 Ogun State LGAs, reusing the existing `MinistryQueryDto` `from`/`to`/`lgaId` filter already used by the other 3 Ministry charts.
- D-08: Dashboard-only — no new CSV/PDF export route for the heatmap.

**Recipient management**
- D-09: No admin UI this phase — `web/src/app/admin/ministry/page.tsx` gets no new settings panel.
- D-10: Backend-only `SUPER_ADMIN`-gated CRUD REST routes for the subscription model (mirrors Phase 18's `SettlementSplitTier` pattern exactly).
- D-11: Recipients are a free-text email array/JSON field on the subscription row, not tied to existing `MINISTRY_VIEWER` user accounts.

**Failure visibility & retry policy**
- D-12: The subscription model gets `lastSentAt` / `lastStatus` / `lastError` fields — an operator can see each subscription's last delivery outcome via the CRUD `GET` route.
- D-13: The send is wrapped in the existing `cockatiel`/`ResilienceService` pattern (per MIN-08c). After retries are exhausted: log + mark `lastStatus = FAILED`, let the next scheduled `@Cron` tick retry naturally. No new alerting channel this phase.
- D-14: `SendgridService` gets a new dedicated method (e.g. `sendMinistryDigest()`) rather than generalizing `sendEmail()`.
- D-15: A size guard exists for the combined CSV+PDF attachment: if combined size exceeds a safe threshold (planner's discretion, well under SendGrid's ~30MB hard cap), log a warning and send the digest email without attachments.

### Claude's Discretion
- Exact enum values beyond `WEEKLY`/`MONTHLY` (whether `QUARTERLY` is included)
- Exact attachment-size threshold for D-15's guard
- Exact subscription model field names/shape (beyond the required `recipients`, `cadence`, `lastSentAt`, `lastStatus`, `lastError`)
- Which `@Cron` schedule expression drives the "check subscriptions due" tick, and whether it needs the Phase 20 `setNx()` distributed lock (very likely yes)
- Exact color-intensity scale/legend design for the heatmap grid (sequential palette, bucketing vs. continuous gradient)

### Deferred Ideas (OUT OF SCOPE)
- MIN-09x: true LGA choropleth map with sourced GeoJSON boundaries — no boundary data exists in the schema; deferred until stakeholder ask.
- MIN-10: in-dashboard portal notification banner alongside the email digest.
- MIN-11: drill-down from LGA/month cell to attraction/event-level detail.
- "Add compile step to packages/proto (INT-02)" and "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — matched this phase during cross-referencing but already resolved by Phase 16/17; no action needed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIN-08a | Scheduled (`@Cron`-driven) Ministry export digest — CSV + branded PDF attachment — generated and delivered by email on a configurable cadence, reusing Phase 14 export code | Confirmed `MinistryService`/`MinistryPdfService`/`CsvExportService` reuse paths; documented `@Cron` + `setNx()` idiom from `stays.service.ts`/`tour-notifications.service.ts`; documented SendGrid attachments API shape |
| MIN-08b | Export recipient list and delivery cadence configurable via the database, no redeploy required | Confirmed `SettlementSplitTier` schema precedent and `admin.controller.ts` CRUD-route precedent to replicate for the new subscription model |
| MIN-08c | Every scheduled delivery attempt logged; send wrapped in existing `cockatiel` resilience layer so a transient SendGrid outage doesn't silently drop a report | Confirmed `'sendgrid'` is ALREADY a registered `Vendor` in `resilience.types.ts` and has a live `resilience.execute('sendgrid', ...)` call site in `auth.service.ts:191` to replicate exactly |
| MIN-09 | Ministry dashboard shows LGA × month/season visitor heatmap built on existing `recharts` dependency and `MinistryService` query shapes, no new mapping dependency | Confirmed `getVisitorEntriesByLgaAndMonth()`'s exact return shape; confirmed 20-LGA `OGUN_LGA_NAMES` constant; confirmed FOREST/GOLD Tailwind palette tokens for a custom (non-`recharts`) grid component |
</phase_requirements>

## Summary

CONTEXT.md's file/method/pattern references were cross-checked against the live codebase and are accurate. `MinistryService.getVisitorEntriesByLgaAndMonth()`, `getPurposeBreakdown()`, `getRevenueToGovernment()` exist exactly as described in `backend/src/modules/ministry/ministry.service.ts`. `MinistryPdfService.renderPdf()` already accepts a multi-section input (`{ title, sections: [{ heading?, columns, rows }] }`) — this is the exact shape needed to bundle all 3 reports into one branded PDF for the digest, no renderer changes required. `CsvExportService.toCsv(rows, headers)` is a thin `fast-csv` wrapper, reusable as-is for CSV attachments. `RedisService.setNx(key, value, ttlSeconds)` is confirmed at `backend/src/redis/redis.service.ts:131`, fail-open, with 6 existing `@Cron` + `setNx()` call sites to copy the idiom from (best precedent: `stays.service.ts:331-337`'s `releaseEscrow`).

The one surprise that changes CONTEXT.md's framing slightly: `'sendgrid'` is **already** a registered `Vendor` in `backend/src/resilience/resilience.types.ts` (added in Phase 15 for OTP email) with tuned defaults (`timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000`), and there is already a live call site — `auth.service.ts:191`, `await this.resilience.execute('sendgrid', () => this.sendgrid.sendOtpEmail(...))` — that D-13/MIN-08c's new `sendMinistryDigest()` call should copy verbatim. This is not "new resilience wiring," it's "one more call site using an already-configured vendor policy."

The genuinely new work is: (1) a new Prisma model for the subscription (recipients/cadence/lastSentAt/lastStatus/lastError, following the `SettlementSplitTier` typed-column precedent but with in-place field updates, not an audit-trail insert/deactivate pattern, since `lastSentAt`/`lastStatus` are operational status, not a financial-percentage history); (2) a new `SendgridService.sendMinistryDigest()` method that builds a base64 `attachments` array (this method genuinely does not exist today — `sendEmail()` has no attachment parameter); (3) a new `@Cron` "check subscriptions due" tick with its own `setNx()` guard, querying subscriptions where `lastSentAt` is null or is older than the cadence interval; (4) a new backend-only `SUPER_ADMIN` CRUD controller for the subscription model, following `admin.controller.ts`'s `settlement-splits` GET/PATCH route pattern; (5) a new custom heatmap grid React component (not a `recharts` chart type — `recharts` has no heatmap primitive) styled with the existing `forest`/`gold` Tailwind tokens, consuming the exact same `{lgaId, lgaName, month, count}` shape the existing `VisitorEntriesChart` already consumes.

**Primary recommendation:** Reuse `MinistryPdfService.renderPdf()` unmodified for digest PDF assembly (pass all 3 report sections in one `MinistryPdfInput.sections` array); reuse the exact `resilience.execute('sendgrid', () => ...)` idiom from `auth.service.ts:191` for the new digest send; add a `MinistryExportSubscription` Prisma model with `String[]` recipients (matching the codebase's existing `imageUrls`/`amenities` array-field convention) and a `ExportCadence` enum (`WEEKLY`/`MONTHLY`/`QUARTERLY`); drive the "check subscriptions due" tick with a once-daily `@Cron` (e.g. `CronExpression.EVERY_DAY_AT_6AM` in WAT-adjacent scheduling terms, guarded by `setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000)`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Digest cadence/recipient config storage | Database / Storage | API / Backend | New Prisma model, typed columns per D-02; API/Backend layer (new CRUD controller) is the only write path (D-10) |
| "Check subscriptions due" scheduling | API / Backend | Database / Storage | `@Cron` lives in a NestJS service (monolith process); reads/writes the subscription table each tick |
| Digest content generation (CSV+PDF) | API / Backend | Database / Storage | Reuses existing `MinistryService` query methods (DB reads) + `MinistryPdfService`/`CsvExportService` (in-process rendering) |
| Digest delivery | API / Backend | — (external: SendGrid) | New `SendgridService.sendMinistryDigest()`, wrapped in `ResilienceService.execute('sendgrid', ...)` |
| Delivery outcome visibility | API / Backend | Database / Storage | `lastSentAt`/`lastStatus`/`lastError` columns updated in-process, readable via CRUD `GET` |
| LGA × month heatmap data | API / Backend | Database / Storage | Zero new backend work — reuses `getVisitorEntriesByLgaAndMonth()` unchanged, per D-05 |
| LGA × month heatmap rendering | Browser / Client | — | New custom grid React component in `web/src/components/admin/ministry/`, client-side aggregation from the existing query response, per D-06 |
| Subscription CRUD admin surface | API / Backend | — | Backend-only REST routes (Swagger-visible), NO web admin UI this phase, per D-09 |

## Standard Stack

### Core (already installed — no new dependencies this phase)
| Library | Installed Version | Purpose | Verified |
|---------|---------|---------|--------------|
| `@nestjs/schedule` | `^6.1.3` | `@Cron` decorator for the new "check subscriptions due" tick | `npm view @nestjs/schedule version` → `6.1.3` [VERIFIED: npm registry] — installed version matches latest |
| `@sendgrid/mail` | `^8.1.6` | Email delivery, now with an `attachments` array for D-14's new method | `npm view @sendgrid/mail version` → `8.1.6` [VERIFIED: npm registry] — installed version matches latest |
| `cockatiel` | `^3.2.1` | Circuit-breaker/retry/timeout wrapper via `ResilienceService.execute('sendgrid', ...)` | `'sendgrid'` vendor entry confirmed live in `backend/src/resilience/resilience.types.ts:20,48` [VERIFIED: codebase] |
| `pdfkit` | `^0.19.1` | Underlying PDF renderer inside `MinistryPdfService` (no direct import needed by new code) | [VERIFIED: codebase — `backend/src/common/services/ministry-pdf.service.ts:2`] |
| `fast-csv` | `^5.0.7` | Underlying CSV writer inside `CsvExportService` (no direct import needed by new code) | [VERIFIED: codebase] |
| `recharts` | (web workspace) | Existing chart library — explicitly NOT used for the heatmap (no native heatmap chart type); referenced only as the "no new mapping dependency" satisfaction anchor | [VERIFIED: codebase — 3 existing chart components in `web/src/components/admin/ministry/`] |

**No `npm install` needed this phase** — every library required is already a dependency of `backend/` or `web/`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom color-intensity grid (D-06, locked) | A `recharts` `ScatterChart` faked into a grid via cell-shaped dots | Rejected by D-06 itself — no native heatmap primitive in `recharts`, and shoehorning `ScatterChart` into a grid is more fragile than a plain CSS-grid component |
| `MinistryExportSubscription` in-place field updates (recommended) | Insert-new-row/deactivate-old audit trail like `SettlementSplitTier.updateSplitTier()` | `SettlementSplitTier`'s audit-trail pattern exists because split *percentages* must be effective-dated for historical settlement correctness (SETTLE-11c). `lastSentAt`/`lastStatus`/`lastError` are operational status fields with no such correctness requirement — in-place update is simpler and matches CONTEXT.md's own "Established Patterns" note that these fields are "expected to update in place, not audit-trail-versioned" |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  @Cron tick (new, once-daily, e.g. EVERY_DAY_AT_6AM)                 │
│  MinistryExportSchedulerService.checkSubscriptionsDue()              │
└───────────────┬─────────────────────────────────────────────────────┘
                 │ 1. setNx('cron-lock:checkMinistryExportSubscriptions')
                 │    — skip tick if another replica holds the lock
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Query MinistryExportSubscription WHERE isActive=true                 │
│   AND (lastSentAt IS NULL OR lastSentAt + cadence-interval <= now)   │
└───────────────┬─────────────────────────────────────────────────────┘
                 │ 2. for each due subscription (try/catch per row)
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Gather digest data — window = [subscription.lastSentAt ?? epoch, now)│
│  MinistryService.getVisitorEntriesByLgaAndMonth(from, to)            │
│  MinistryService.getPurposeBreakdown(from, to)                       │
│  MinistryService.getRevenueToGovernment(from, to)                    │
└───────────────┬─────────────────────────────────────────────────────┘
                 │ 3. render
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MinistryPdfService.renderPdf({ title, sections: [3 sections] })      │
│ CsvExportService.toCsv(...) × up to 3 (or 1 combined, planner choice)│
└───────────────┬─────────────────────────────────────────────────────┘
                 │ 4. size guard (D-15): combined bytes > threshold?
                 │    → log warn, send WITHOUT attachments
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ResilienceService.execute('sendgrid', () =>                          │
│   SendgridService.sendMinistryDigest({ to: recipients, ...,          │
│     attachments: [{content: base64, filename, type, disposition}] }))│
└───────────────┬─────────────────────────────────────────────────────┘
                 │ 5. on success/failure (after retries exhausted)
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Update subscription row: lastSentAt (success only), lastStatus,      │
│ lastError; Logger.log/error either way (MIN-08c "every attempt")     │
└─────────────────────────────────────────────────────────────────────┘

                    ── separately, dashboard-side (D-08) ──

┌─────────────────────┐   GET /ministry/visitor-entries    ┌──────────────┐
│ Ministry Dashboard   │ ───────────────────────────────►  │ (existing,   │
│ (web/src/app/admin/  │ ◄───────────────────────────────  │ unchanged)   │
│ ministry/page.tsx)   │   {lgaId, lgaName, month,          │ MinistryService│
└──────────┬───────────┘    userRole, count}[]              └──────────────┘
           │ new: aggregate by (lgaName, month), sum count across userRole
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ New LgaMonthHeatmap component (client-side grid, FOREST/GOLD scale)  │
│  rows = 20 OGUN_LGA_NAMES, columns = distinct months in result set   │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
backend/prisma/schema.prisma
  ├── model MinistryExportSubscription   # new
  └── enum ExportCadence                 # new (WEEKLY/MONTHLY/QUARTERLY)

backend/src/modules/ministry/
  ├── ministry.module.ts                 # add new controller/service/scheduler providers
  ├── ministry.service.ts                # UNCHANGED — reused as-is
  ├── ministry.controller.ts             # UNCHANGED — existing 6 export routes untouched
  ├── ministry-export-subscription.controller.ts   # new — SUPER_ADMIN CRUD (D-10)
  ├── ministry-export-subscription.service.ts       # new — CRUD + digest-window logic
  ├── ministry-export-scheduler.service.ts          # new — @Cron tick + setNx guard
  └── dto/
      ├── ministry-query.dto.ts          # UNCHANGED
      ├── create-export-subscription.dto.ts   # new
      └── update-export-subscription.dto.ts   # new

backend/src/common/services/
  └── sendgrid.service.ts                # add sendMinistryDigest() method (D-14)

web/src/components/admin/ministry/
  ├── VisitorEntriesChart.tsx            # UNCHANGED — visual style reference
  ├── PurposeBreakdownChart.tsx          # UNCHANGED
  ├── RevenueChart.tsx                   # UNCHANGED
  └── LgaMonthHeatmap.tsx                # new — custom grid component (D-06)

web/src/app/admin/ministry/page.tsx      # mount new heatmap panel; no export buttons for it (D-08)
```

### Pattern 1: `@Cron` + `setNx()` distributed-lock guard (Phase 20 precedent)
**What:** Every shared-side-effect cron acquires a Redis `SET NX EX` lock before doing real work; if another replica already holds it, log at `debug` and return early.
**When to use:** The new `checkSubscriptionsDue()` tick — a second replica double-sending the same digest during a deploy/cutover window is exactly the failure class D-07/D-08 (Phase 20) exists to prevent, and CONTEXT.md's own "Claude's Discretion" section flags this as "very likely yes."
**Example (exact idiom from `stays.service.ts:331-337`, to replicate verbatim):**
```typescript
// Source: backend/src/modules/stays/stays.service.ts:331-337
@Cron(CronExpression.EVERY_DAY_AT_6AM) // adjust — see Open Questions
async checkSubscriptionsDue(): Promise<void> {
  const acquired = await this.redis.setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000);
  if (!acquired) {
    this.logger.debug('checkSubscriptionsDue: lock held by another replica — skipping this tick');
    return;
  }
  // ... query + iterate ...
}
```
**TTL choice rationale:** Existing hourly crons use a TTL slightly under one tick interval (`3300`s for `EVERY_HOUR`'s 3600s). A once-daily tick should mirror this ratio: `86000`s (≈23h53m) is slightly under 24h, so the lock naturally expires before the next tick even if a release path is somehow skipped.

### Pattern 2: Per-row try/catch inside a cron loop (avoids one bad row blocking all others)
**What:** Iterate matched rows; wrap each row's work in its own `try/catch`; log-and-continue on failure rather than let one throw abort the whole tick.
**When to use:** Iterating due `MinistryExportSubscription` rows — one Ministry contact's bad email address or a per-subscription rendering failure must not block digests to the other subscriptions.
**Example (idiom from `tour-notifications.service.ts:192-243`):**
```typescript
// Source: backend/src/modules/tour-bookings/tour-notifications.service.ts:192-243
for (const subscription of dueSubscriptions) {
  try {
    // gather data, render, send
    await this.prisma.ministryExportSubscription.update({
      where: { id: subscription.id },
      data: { lastSentAt: new Date(), lastStatus: 'SUCCESS', lastError: null },
    });
  } catch (err: any) {
    this.logger.error(`Ministry digest failed for subscription ${subscription.id}: ${err.message}`);
    await this.prisma.ministryExportSubscription.update({
      where: { id: subscription.id },
      data: { lastStatus: 'FAILED', lastError: err.message.slice(0, 500) },
      // lastSentAt intentionally NOT updated — subscription stays "due" for next tick (D-13)
    });
  }
}
```

### Pattern 3: `ResilienceService.execute('sendgrid', ...)` (already-live precedent — copy exactly)
**What:** Wrap the SendGrid call in the existing per-vendor cockatiel policy, not a bespoke retry loop.
**When to use:** MIN-08c's requirement, satisfied by literally the same call shape already used for OTP email.
**Example (exact idiom from `auth.service.ts:191-193`):**
```typescript
// Source: backend/src/modules/auth/auth.service.ts:191-193
await this.resilience.execute('sendgrid', () =>
  this.sendgrid.sendMinistryDigest({ to: subscription.recipients, ..., attachments }),
);
```
`'sendgrid'` is already registered in `RESILIENCE_DEFAULTS` (`backend/src/resilience/resilience.types.ts:48`) with `timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000` — no new vendor registration needed. `ResilienceService` is `@Global()`-scoped alongside `CommonModule`/`PrismaModule` (confirmed via `AppModule` imports), so injecting it into a new `ministry` module service requires no new module wiring beyond a constructor parameter.

### Pattern 4: SendGrid attachments array (`@sendgrid/mail` 8.1.6)
**What:** `sgMail.send()` accepts an optional `attachments` array; each entry needs `content` (base64 string), `filename`, `type` (MIME type), `disposition` (`'attachment'`).
**When to use:** D-14's new `sendMinistryDigest()` method — this parameter does not exist on any current `SendgridService` method.
**Example:**
```typescript
// Source: SendGrid official docs pattern (Twilio blog + sendgrid-nodejs attachments.md),
// cross-verified against @sendgrid/mail 8.1.6's Mail type shape
await sgMail.send({
  to: recipients, // string[] supported directly by @sendgrid/mail's `to` field
  from: this.from,
  subject: 'Ministry Export Digest',
  html,
  attachments: [
    {
      content: pdfBuffer.toString('base64'),
      filename: 'ministry-digest.pdf',
      type: 'application/pdf',
      disposition: 'attachment',
    },
    {
      content: Buffer.from(csvString, 'utf-8').toString('base64'),
      filename: 'ministry-digest.csv',
      type: 'text/csv',
      disposition: 'attachment',
    },
  ],
});
```
[CITED: sendgrid/sendgrid-nodejs docs/use-cases/attachments.md; Twilio blog "Sending Email with Attachments using SendGrid and Node.js"] — MEDIUM confidence (community/official blog examples agree on field names; not directly Context7-fetched, but the field shape is stable across `@sendgrid/mail` major versions and matches the underlying v3 Mail Send API's documented `attachments` object).

### Pattern 5: Custom heatmap grid (no `recharts` primitive)
**What:** A plain CSS-grid (or table) React component: rows = 20 `OGUN_LGA_NAMES`, columns = distinct months present in the filtered result set, cell background = FOREST-family color at an opacity/shade proportional to that cell's `count` relative to the max count in the current result set.
**When to use:** D-06's locked decision — this is not a `recharts` chart, it's a styled grid, matching MIN-09's "no new mapping dependency" constraint literally (no `react-heatmap-grid`/`nivo`/etc. package needed).
**Example (structure, following `VisitorEntriesChart.tsx`'s existing aggregation-then-render shape):**
```typescript
// Pattern source: web/src/components/admin/ministry/VisitorEntriesChart.tsx (D-04's
// existing client-side Map-based aggregation, same technique reused here)
import { OGUN_LGA_NAMES } from '@iseyaa/shared';

interface HeatmapCell { lgaName: string; month: string; count: number }

function buildGrid(data: VisitorEntryRow[]): { months: string[]; grid: Map<string, Map<string, number>> } {
  const months = Array.from(new Set(data.map((r) => r.month))).sort();
  const grid = new Map<string, Map<string, number>>();
  for (const lgaName of OGUN_LGA_NAMES) grid.set(lgaName, new Map(months.map((m) => [m, 0])));
  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    if (!grid.has(lgaName)) grid.set(lgaName, new Map(months.map((m) => [m, 0])));
    const monthMap = grid.get(lgaName)!;
    monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + row.count); // sum across userRole buckets
  }
  return { months, grid };
}

// Intensity: 5-bucket sequential scale (0 / low / medium / high / peak) against the
// max count in the CURRENT filtered result set (not a fixed global max) — matches
// how the other 3 panels already scope their visuals to the active from/to/lgaId filter.
function intensityClass(count: number, max: number): string {
  if (count === 0) return 'bg-white/5';
  const ratio = count / max;
  if (ratio > 0.75) return 'bg-forest'; // #1A6B3C full
  if (ratio > 0.5) return 'bg-forest/70';
  if (ratio > 0.25) return 'bg-forest/40';
  return 'bg-forest/20';
}
```

### Anti-Patterns to Avoid
- **Generalizing `SendgridService.sendEmail()`'s signature to accept attachments:** Rejected by D-14 — every existing call site (`sendTicketConfirmation`, `sendBookingConfirmation`, `sendStudioBookingConfirmation`, the OTP path) must see zero risk of a new parameter breaking their call shape. Add a new dedicated method instead.
- **Insert-new-row/deactivate-old for `lastSentAt`/`lastStatus`/`lastError` updates:** `SettlementSplitTier`'s audit-trail pattern is for financial *percentages* needing effective-dating (SETTLE-11c). These are operational status fields — in-place `update()` is correct, and CONTEXT.md's own code_context section explicitly notes this distinction.
- **Fixed calendar-period digest windows (e.g. "always the last full week"):** Rejected by D-04 — a fixed calendar window plus a missed/retried tick either double-counts or gaps data. Use `lastSentAt` as the rolling window start instead.
- **A literal per-cell dynamic-value inline style computed with unbounded color math (e.g. raw `rgba()` interpolation from `count`):** Prefer a small fixed number of Tailwind opacity-suffix classes (`bg-forest/20`, `/40`, `/70`, full) bucketed by ratio-to-max, matching the existing chart components' approach of using fixed opacity tiers (`VisitorEntriesChart.tsx`'s `rgba(26,107,60,0.85|0.55|0.3)` role-bucket opacities) rather than a continuous gradient function — simpler to reason about, consistent with the existing visual language, and avoids a whole new "legend needs to explain an arbitrary continuous scale" UX problem.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| CSV escaping for digest attachment | A manual `.join(',')`/string-template CSV writer | `CsvExportService.toCsv()` (already `fast-csv`-backed) | Already RFC4180-correct in this codebase; a second hand-rolled CSV writer for the digest would silently reintroduce the exact embedded-comma/quote/newline bug class `fast-csv` was adopted to prevent in Phase 14 |
| Multi-section PDF tables | A new from-scratch `pdfkit` renderer for the digest | `MinistryPdfService.renderPdf({ sections: [...] })` | Already built for exactly this bundling use case (its own doc comment: "required because revenue's export carries all three ... dimensions ... not just one (D-14)") — passing 3 sections (one per report) needs zero new renderer code |
| Base64 attachment encoding | A custom multipart/MIME builder | `Buffer.toString('base64')` + `@sendgrid/mail`'s `attachments` array | SendGrid's v3 API expects base64-encoded content in a flat JSON field — Node's built-in `Buffer` API is sufficient, no MIME library needed |
| Distributed cron locking | A custom Postgres advisory-lock or `SELECT FOR UPDATE`-based mutex for the scheduler tick | `RedisService.setNx()` | Already the established, tested primitive for exactly this problem class (6 existing crons use it) — a second locking mechanism for one more cron would be an unjustified inconsistency |
| LGA×month heatmap rendering | A new GeoJSON/mapping npm package (`react-simple-maps`, `nivo`, `d3-scale-chromatic`, etc.) | A plain CSS-grid/Tailwind component | Explicitly rejected by both D-06 and MIN-09's own requirement text ("no new mapping dependency this milestone") — the visualization is a data grid with color intensity, not a geographic map |

**Key insight:** Every backend building block this phase needs (CSV writer, PDF renderer, distributed lock, resilience wrapper, vendor policy) was already built in Phases 14/15/20 for a near-identical problem. This phase's real net-new code is thin: one Prisma model, one scheduler method, one new SendGrid method, one CRUD controller, one React grid component. The temptation to reach for a new package (a job-queue library for the cron, a heatmap npm package for the grid, a MIME library for attachments) should be resisted — none is needed at this problem's actual scale (a handful of subscriptions, 20 LGAs × ≤12 months of cells).

## Common Pitfalls

### Pitfall 1: Treating `MinistryPdfService`'s section renderer as needing a code change for bundling
**What goes wrong:** A planner assumes `renderPdf()` needs a new "digest mode" or a new method to concatenate 3 reports.
**Why it happens:** The existing controller only ever calls `renderPdf()` with 1-3 sections *per single export route*, never explicitly across the 3 *different* report types in one call.
**How to avoid:** `renderPdf(input: MinistryPdfInput)` already accepts an arbitrary `sections: MinistryPdfSection[]` array with no coupling to which report generated each section — the digest step just needs to build one `MinistryPdfInput` whose `sections` array concatenates the shapes already used by `exportVisitorEntries`/`exportPurposeBreakdown`/`exportRevenue` (see `ministry.controller.ts:110-176` for the exact per-report section shapes to reuse: `VISITOR_ENTRIES_PDF_COLUMNS`, `PURPOSE_BREAKDOWN_COLUMNS`, and the 3 revenue sections with `heading`).
**Warning signs:** Any task description that says "extend `MinistryPdfService`" rather than "call `MinistryPdfService.renderPdf()` with an assembled multi-report sections array."

### Pitfall 2: SendGrid silently rejecting an oversized message with no useful error
**What goes wrong:** If the combined attachment payload approaches SendGrid's 30MB total-message hard cap, SendGrid's API may reject the whole send with a 4xx — and because `sendEmail()`'s existing pattern (Pitfall in `sendgrid.service.ts:26-28`'s own comment) intentionally lets rejections propagate for the OTP path but the *existing* `sendEmail()` swallows and only logs, the new `sendMinistryDigest()` must decide explicitly which behavior it wants. Given D-13 ("mark FAILED, retry next tick"), the digest method should let the error propagate to the calling scheduler's try/catch, not swallow it silently like `sendEmail()` does.
**Why it happens:** SendGrid's own docs recommend attachments not exceed 10MB even though the hard cap is 30MB total message size (headers + body + attachments), and base64 encoding itself inflates raw bytes by up to ~30% [MEDIUM confidence — WebSearch cross-verified: Twilio/SendGrid support docs].
**How to avoid:** Implement D-15's size guard by measuring the **pre-base64 raw byte length** of `pdfBuffer.length + Buffer.byteLength(csvString, 'utf-8')` before encoding, and compare against a threshold with enough margin for the ~30% base64 inflation plus the HTML body/headers. Recommended threshold: **8 MB combined raw** (≈10.4MB post-base64, well under SendGrid's own 10MB-per-attachment guidance and far under the 30MB hard cap). If exceeded: log a `warn`, send the digest email with the same HTML body but an empty/omitted `attachments` array, and still record `lastStatus = SUCCESS` (the email was delivered; the attachment omission is a a separate, logged degradation, not a delivery failure).
**Warning signs:** A digest covering a multi-month rolling window (e.g. a subscription whose `lastSentAt` update failed for several cadence cycles) accumulating an unusually large row count in `getVisitorEntriesByLgaAndMonth()`'s CSV export.

### Pitfall 3: Forgetting the digest window is per-subscription, not global
**What goes wrong:** Computing one global "since last digest" timestamp and applying it to every subscription, rather than each subscription's own `lastSentAt` (D-04).
**Why it happens:** The existing 3 Ministry export routes all take a shared `from`/`to` pair from one `MinistryQueryDto` — it's easy to default to that same "one shared window" mental model for the digest.
**How to avoid:** Each subscription row carries its own `lastSentAt`; the query window for that subscription's digest is `[subscription.lastSentAt ?? <subscription.createdAt or epoch>, now)`. Two subscriptions with different cadences (one WEEKLY, one MONTHLY) legitimately have different, independently-advancing windows.
**Warning signs:** A test asserting all subscriptions in one tick received identical `from`/`to` query parameters — that would be the bug this pitfall describes.

### Pitfall 4: `lastSentAt` being updated even on failure
**What goes wrong:** If `lastSentAt` is set unconditionally after attempting a send (success or failure), a failed digest silently "counts" as sent — the Ministry never receives that period's data and no future tick retries it, because the subscription no longer looks "due."
**Why it happens:** It's a natural (wrong) simplification to update `lastSentAt` once per tick per subscription regardless of outcome.
**How to avoid:** Per D-13, `lastSentAt` is updated ONLY on confirmed success (after `resilience.execute('sendgrid', ...)` resolves without throwing). On failure (after cockatiel's retries are exhausted and the error propagates), update only `lastStatus`/`lastError`, leaving `lastSentAt` unchanged — the subscription remains "due" and is retried on the next `@Cron` tick automatically.
**Warning signs:** A subscription's `GET` response shows `lastStatus: 'FAILED'` but `lastSentAt` has still advanced — that combination should never occur.

### Pitfall 5: Heatmap aggregation double-counting across `userRole` buckets
**What goes wrong:** `getVisitorEntriesByLgaAndMonth()` returns one row per `(lgaId, month, userRole)` triple (confirmed by its `GROUP BY` clause), not one row per `(lgaId, month)`. A naive heatmap that treats each returned row as "the count for that LGA×month cell" will render 2-3 separate/overlapping values per cell instead of one summed total.
**Why it happens:** The existing `VisitorEntriesChart.tsx` already solves this exact problem for its own bar-chart rendering (`aggregateByLgaAndRole()`, lines 39-48) by summing role buckets per LGA — but that aggregation collapses across ALL months (its x-axis is LGA only), which is NOT what the heatmap needs (its axes are LGA AND month).
**How to avoid:** The heatmap's own aggregation must sum `count` across `userRole` while KEEPING `month` as a distinct axis — i.e., group by `(lgaName, month)` and sum, not group by `lgaName` alone. See Pattern 5's `buildGrid()` example above, which sums into a `Map<lgaName, Map<month, count>>` nested structure.
**Warning signs:** A heatmap cell rendering multiple values, or a cell's total not matching the sum of the raw API response rows for that exact `(lgaName, month)` pair.

## Code Examples

Verified patterns from the live codebase (all file:line references confirmed by direct read in this research session):

### Multi-section PDF assembly (reuse, no new renderer code)
```typescript
// Source: backend/src/modules/ministry/ministry.controller.ts:160-172 (existing revenue export)
// Digest reuses the SAME shape, concatenating all 3 reports' sections in one call:
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

### CRUD controller precedent to replicate for the subscription model (D-10)
```typescript
// Source: backend/src/modules/admin/admin.controller.ts:102-113 (settlement-splits routes)
@Get('settlement-splits')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: '...' })
listSplitTiers(@Query('module') module?: string) {
  return this.adminService.listSplitTiers(module);
}

@Patch('settlement-splits/:id')
@Roles(UserRole.SUPER_ADMIN)
@ApiOperation({ summary: '...' })
updateSplitTier(@Param('id') id: string, @Body() dto: UpdateSplitTierDto) {
  return this.adminService.updateSplitTier(id, dto);
}
// New subscription controller follows the identical @Roles(UserRole.SUPER_ADMIN) + Swagger
// shape, adding GET (list), POST (create), PATCH (:id), DELETE (:id) — full CRUD per D-10,
// vs. split-tiers' GET+PATCH-only (no create/delete needed there since tiers are seeded).
```

### Prisma model precedent (`SettlementSplitTier`, D-02's direct schema-design reference)
```prisma
// Source: backend/prisma/schema.prisma:696-720
model SettlementSplitTier {
  id            String    @id @default(uuid())
  module        String
  tierName      String    @default("default")
  isActive      Boolean   @default(true)
  effectiveFrom DateTime  @default(now())
  metadata      Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@index([module, tierName])
  @@index([module, isActive])
  @@map("settlement_split_tiers")
}

// Recommended new model, adapted (typed columns per D-02, but in-place updates for
// lastSentAt/lastStatus/lastError — no audit-trail insert/deactivate needed, see
// "Alternatives Considered" above):
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
  recipients  String[]              // D-11: free-text emails, not tied to MINISTRY_VIEWER accounts
  cadence     ExportCadence
  isActive    Boolean               @default(true)
  lastSentAt  DateTime?             // D-04: rolling-window anchor; null until first successful send
  lastStatus  ExportDeliveryStatus  @default(PENDING)
  lastError   String?               // D-12
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
  @@index([isActive])
  @@map("ministry_export_subscriptions")
}
```

### `setNx()` primitive (unchanged, reused as-is)
```typescript
// Source: backend/src/redis/redis.service.ts:126-137
async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!this.client || !this.enabled) return true; // optimistic fallback
  try {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch { return true; } // optimistic fallback on error
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A once-daily `@Cron` tick (rather than hourly/every-15-min) is sufficient granularity to catch WEEKLY/MONTHLY/QUARTERLY cadences without meaningful delivery-time drift | Architecture Patterns, Pattern 1 | Low — if a more precise delivery time-of-day matters to the Ministry, a daily tick could deliver up to ~24h later than a theoretical exact-cadence boundary; easy to tighten later (e.g. to every 6h) without a schema change, since the "due" check is timestamp-arithmetic, not tick-frequency-dependent |
| A2 | 8 MB combined raw (pre-base64) CSV+PDF is a reasonable D-15 size-guard threshold | Common Pitfalls, Pitfall 2 | Low-Medium — this is explicitly flagged in CONTEXT.md as "planner's discretion"; if the Ministry's actual multi-month digest data volume is much smaller (likely, given ~7M-citizen-platform but Ministry-scoped visitor-log rows), a higher threshold (e.g. 15MB) would rarely trigger the guard either way. If materially wrong, the only consequence is the digest occasionally sends without attachments (degraded, not broken — D-15's own explicit fallback) |
| A3 | `QUARTERLY` should be included in the cadence enum (not just `WEEKLY`/`MONTHLY`) | Standard Stack, Alternatives Considered | Low — CONTEXT.md itself says "possibly QUARTERLY"; adding an unused enum value has zero cost, and omitting a value the Ministry later wants requires a migration. Low risk either way |
| A4 | In-place field updates (not `SettlementSplitTier`'s insert-new-row/deactivate-old audit-trail pattern) are correct for `lastSentAt`/`lastStatus`/`lastError` | Standard Stack, Alternatives Considered | Low — CONTEXT.md's own `code_context` section explicitly states this expectation ("though a subscription's mutable fields ... are expected to update in place, not audit-trail-versioned like split percentages"), so this is corroborated by the locked context, not a bare assumption |
| A5 | `@sendgrid/mail` 8.1.6's `attachments` field shape (`content`/`filename`/`type`/`disposition`) matches current SendGrid v3 Mail Send API expectations | Architecture Patterns, Pattern 4 | Low — cross-verified via 2 independent sources (Twilio blog + sendgrid-nodejs official docs use-case) that agree on field names; this is a stable, long-unchanged part of the SendGrid API surface |

**If this table is empty:** N/A — see rows above. All CONTEXT.md-sourced claims (file paths, method signatures, model precedent) were independently re-verified by direct file reads in this research session and are NOT included in this table (they are `[VERIFIED: codebase]`, not `[ASSUMED]`).

## Open Questions

1. **Exact `@Cron` schedule expression for the "check subscriptions due" tick**
   - What we know: `@nestjs/schedule` 6.1.3's `CronExpression` enum includes daily presets (e.g. `EVERY_DAY_AT_6AM`); the codebase's existing crons range from `EVERY_30_SECONDS` (heartbeat cleanup) to `EVERY_HOUR` (escrow release) to raw `*/15 * * * *` strings (tour reminders) — no existing cron runs at daily-or-coarser granularity.
   - What's unclear: Whether the Ministry has an expected delivery time-of-day (e.g. "digest should land in inboxes by 8am WAT on the due day") that should drive the exact hour chosen, or whether "sometime during the day it becomes due" is acceptable.
   - Recommendation: Default to a single fixed daily time (e.g. 6am server time) unless the planner/user has a specific delivery-time preference; this is a config-value choice, not an architecture choice, and can be changed with a one-line edit later with no migration.

2. **Whether one combined CSV attachment (3 reports concatenated with a `breakdown` discriminator, like the existing `revenue/export` CSV route) or 3 separate CSV attachments better satisfies MIN-08a's "CSV + branded PDF attachment" wording**
   - What we know: The existing 3 export routes each produce their own single-report CSV; only `revenue/export`'s CSV already unions multiple sub-breakdowns into one file (via a `breakdown` column, per its own D-14 precedent at `ministry.controller.ts:178-194`).
   - What's unclear: MIN-08a's singular "CSV" (not "CSVs") could support either reading, and CONTEXT.md's D-01 says "CSV attachment(s)" — the parenthetical plural leaves this genuinely open.
   - Recommendation: Follow the PDF's own precedent (D-01: "one multi-section branded PDF") and produce ONE combined CSV per digest email (visitor entries + purpose breakdown + revenue rows unioned with a `report` discriminator column, mirroring the existing `revenue/export`'s `breakdown` column technique) — keeps the digest's attachment count small (2 files: 1 PDF + 1 CSV) and avoids the D-15 size-guard needing to reason about partial-attachment-omission across 4 separate files.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| SendGrid API key (`SENDGRID_API_KEY`) | MIN-08a/MIN-08c digest delivery | ✓ (existing, used by 4 other `SendgridService` methods already in production) | — | `SendgridService`'s constructor already handles an unset/placeholder key by simply not calling `sgMail.setApiKey()` — sends will fail gracefully (existing behavior, unchanged) |
| Redis (`REDIS_HOST`/`REDIS_PORT`) | `setNx()` distributed lock for the new cron | ✓ (existing, used by 6 other crons + wallet idempotency) | — | `setNx()` itself has a built-in fail-open fallback if Redis is unreachable (existing behavior, unchanged, per Phase 20's D-08 precedent) |
| PostgreSQL / Prisma | New `MinistryExportSubscription` model, migration | ✓ (existing) | — | — |
| `@iseyaa/shared` `OGUN_LGA_NAMES` | Heatmap's 20-row axis | ✓ (existing, confirmed 20 entries at `shared/src/constants/index.ts:8-14`) | — | — |

**Missing dependencies with no fallback:** None — every dependency this phase needs is already live in the codebase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + ts-jest 29.1.2 (unit/integration); a separate `jest-e2e.json` config for e2e suites |
| Config file | `backend/package.json` (`jest` unit config, implicit default); `backend/test/jest-e2e.json` (e2e config) |
| Quick run command | `npm run test -- ministry` (from `backend/`, runs matching `__tests__/*.spec.ts` files) |
| Full suite command | `npm run test` (from `backend/`); `npm run test:e2e:settlement-splits` is the closest existing e2e precedent pattern for a new `test:e2e:ministry-digest` script |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIN-08a | Digest cron generates CSV+PDF and calls SendGrid on a due tick | unit | `npm run test -- ministry-export-scheduler.service.spec` | ❌ Wave 0 |
| MIN-08a | `MinistryPdfService.renderPdf()` correctly assembles all 3 reports into one multi-section PDF | unit | `npm run test -- ministry-pdf.service.spec` (extend existing) | Existing test file at `backend/src/common/services/__tests__/` — needs check, likely ❌ new cases needed |
| MIN-08b | Subscription CRUD routes are `SUPER_ADMIN`-gated and persist recipients/cadence | unit + e2e | `npm run test -- ministry-export-subscription.controller.spec`; new e2e mirroring `backend/test/e2e-settlement-split-tier-audit-trail.e2e-spec.ts`'s shape | ❌ Wave 0 |
| MIN-08c | A SendGrid failure (after cockatiel retries exhausted) marks `lastStatus=FAILED`, leaves `lastSentAt` unchanged, and logs | unit | `npm run test -- ministry-export-scheduler.service.spec` (specific case) | ❌ Wave 0 |
| MIN-08c | Scheduler tick is guarded by `setNx('cron-lock:checkMinistryExportSubscriptions', ...)`, skips when lock is held | unit | Same file — mirrors the exact assertion style at `stays.service.spec.ts:510-520` (`expect(mockRedis.setNx).toHaveBeenCalledWith(...)`) | ❌ Wave 0 |
| MIN-09 | `getVisitorEntriesByLgaAndMonth()` unchanged/still returns the exact shape the heatmap consumes | unit | `npm run test -- ministry.service.spec` (EXISTING, already covers this — no new backend test needed per D-05's "zero new backend query work") | ✅ existing |
| MIN-09 | Heatmap component aggregates rows by `(lgaName, month)`, summing across `userRole`, without double-counting | unit (React Testing Library, if configured) | New `web` test file — check `web/` jest config for RTL setup | ❌ Wave 0 — verify web-side test tooling exists |

### Sampling Rate
- **Per task commit:** `npm run test -- ministry` (backend, from `backend/` workspace)
- **Per wave merge:** `npm run test` (backend full unit suite); add a new `test:e2e:ministry-digest` script if an e2e digest-delivery test is written, run via `npm run test:e2e:ministry-digest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts` — covers MIN-08a, MIN-08c (cron guard, digest window computation, resilience wrapping, success/failure status updates)
- [ ] `backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts` — covers MIN-08b (CRUD, `SUPER_ADMIN` gating)
- [ ] `backend/src/common/services/__tests__/sendgrid.service.spec.ts` — extend with `sendMinistryDigest()` attachment-shape assertions (does this file exist today? not confirmed in this research session — verify at planning time)
- [ ] Web-side: confirm whether `web/` has React Testing Library or any component-test tooling configured before committing to an automated test for the heatmap aggregation logic; if absent, the aggregation function (`buildGrid()` in Pattern 5) should at minimum be extracted as a pure, independently-unit-testable function even if no RTL harness exists yet
- [ ] Optional e2e: `backend/test/e2e-ministry-digest.e2e-spec.ts` mirroring `e2e-settlement-split-tier-audit-trail.e2e-spec.ts`'s shape, if the planner wants end-to-end coverage of subscription-CRUD → cron-tick → mocked-SendGrid-call

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | New CRUD routes sit behind the existing `JwtAuthGuard` (already applied at the `ministry`/`admin` controller class level in this codebase's pattern) |
| V3 Session Management | no | No new session surface introduced |
| V4 Access Control | yes | New CRUD routes MUST be `@Roles(UserRole.SUPER_ADMIN)`-gated per D-10 — mirrors `admin.controller.ts`'s `settlement-splits` routes exactly (`@Roles(UserRole.SUPER_ADMIN)` at the route level, on top of the class-level `RolesGuard`) |
| V5 Input Validation | yes | `class-validator` DTOs for `create`/`update` subscription routes — `@IsEmail({}, { each: true })` on the `recipients` array, `@IsEnum(ExportCadence)` on `cadence`, matching the codebase's existing DTO convention (e.g. `UpdateSplitTierDto`'s `@IsNumber()`/`@Min()`/`@Max()` pattern) |
| V6 Cryptography | no | No new secrets/crypto — `SENDGRID_API_KEY` is existing config, unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A non-`SUPER_ADMIN` role reading/mutating another Ministry's recipient list or cadence | Elevation of Privilege | `@Roles(UserRole.SUPER_ADMIN)` at the route level (D-10) — no `MINISTRY_VIEWER`/`STATE_ADMIN` access to the new CRUD routes, unlike the existing read-only Ministry dashboard routes which DO allow those roles |
| Arbitrary/malformed email addresses in `recipients` causing SendGrid to reject the whole send or being used for injection via crafted header-like strings | Tampering | `@IsEmail({ }, { each: true })` on the DTO's `recipients: string[]` field — reject malformed entries at the validation boundary (global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`, already configured in `main.ts`) before any value reaches `sgMail.send()` |
| `lastError` string persisting an unbounded/sensitive vendor error message (e.g. leaking SendGrid response internals) into a `SUPER_ADMIN`-readable field | Information Disclosure | Truncate + sanitize before persisting — mirror `ResilienceService.summarizeVendorError()`'s existing pattern (`resilience.service.ts:191-197`: status code + error code/message only, never raw response bodies/headers) rather than storing `err.response.body` verbatim |
| A crafted/huge `recipients` array or repeated subscription creation used to trigger excessive SendGrid sends (cost/abuse vector) | Denial of Service | Out of scope for this phase per D-10 (backend-only, `SUPER_ADMIN`-only — the attack surface is already restricted to a trusted internal role); no additional rate-limiting beyond the existing global `ThrottlerModule` (100 req/60s) is called for at this access level |

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/ministry/ministry.service.ts` — full read, confirms all 3 query methods' exact shapes
- `backend/src/modules/ministry/ministry.controller.ts` — full read, confirms existing 6 export routes and section-building patterns
- `backend/src/common/services/ministry-pdf.service.ts` — full read, confirms `renderPdf()` multi-section input shape
- `backend/src/common/services/csv-export.service.ts` — full read
- `backend/src/common/services/sendgrid.service.ts` — full read, confirms NO existing attachment support
- `backend/src/redis/redis.service.ts` — full read, confirms `setNx()` exact implementation
- `backend/src/resilience/resilience.service.ts` and `resilience.types.ts` — full read, confirms `'sendgrid'` is already a registered vendor
- `backend/src/modules/auth/auth.service.ts:175-201` — confirms the exact `resilience.execute('sendgrid', ...)` call-site idiom to replicate
- `backend/src/modules/stays/stays.service.ts:331-337`, `backend/src/modules/tour-bookings/tour-notifications.service.ts:165-245` — confirms `@Cron` + `setNx()` + per-row try/catch idioms
- `backend/prisma/schema.prisma:696-720` (`SettlementSplitTier`) — confirms exact schema-design precedent
- `backend/src/modules/admin/admin.controller.ts:102-113`, `admin.service.ts:176-208` — confirms CRUD-route + service-method precedent
- `web/src/components/admin/ministry/VisitorEntriesChart.tsx`, `web/src/app/admin/ministry/page.tsx` — full read, confirms existing chart/dashboard patterns and Tailwind class usage
- `web/tailwind.config.*` — confirms `forest`/`gold`/`jungle` color token names
- `shared/src/constants/index.ts:8-14` — confirms `OGUN_LGA_NAMES` (20 entries)
- `npm view @sendgrid/mail version` → `8.1.6` [VERIFIED: npm registry, matches installed]
- `npm view @nestjs/schedule version` → `6.1.3` [VERIFIED: npm registry, matches installed]
- `.planning/phases/20-grpc-blue-green-healthcheck-retrofit/20-CONTEXT.md` — full read, confirms Phase 20's `setNx()` cron-lock pattern and rationale

### Secondary (MEDIUM confidence)
- [Sending Email with Attachments using SendGrid and Node.js — Twilio Blog](https://www.twilio.com/en-us/blog/sending-email-attachments-with-sendgrid) — attachments array field shape
- [sendgrid-nodejs docs/use-cases/attachments.md — GitHub](https://github.com/sendgrid/sendgrid-nodejs/blob/main/docs/use-cases/attachments.md) — attachments array field shape, cross-verified against the Twilio blog
- SendGrid total message size limit (30MB) / recommended per-attachment cap (10MB) / base64 inflation (~30%) — cross-verified across multiple WebSearch results (SendGrid support docs, community reports) referencing the same figures CONTEXT.md itself independently cited ("well under SendGrid's ~30MB hard cap")

### Tertiary (LOW confidence)
- None — every claim in this research was either directly verified against the live codebase or cross-checked against at least 2 independent external sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every library version independently confirmed against npm registry
- Architecture: HIGH — every reused component (PDF renderer, CSV writer, resilience wrapper, distributed lock, CRUD-route precedent) confirmed by direct file read; new components (subscription model, scheduler, digest method, heatmap component) are small, well-precedented extensions of existing patterns
- Pitfalls: HIGH — all 5 pitfalls derived from direct inspection of existing code's own edge-case handling (e.g. `VisitorEntriesChart`'s role-bucket aggregation, `sendEmail()`'s intentional non-swallowing comment) rather than speculation
- SendGrid attachments specifics: MEDIUM — field shape confirmed via 2 independent external sources rather than Context7 (no Context7 fetch performed for `@sendgrid/mail` in this session; the field names/shape are stable and long-unchanged in the SendGrid ecosystem)

**Research date:** 2026-07-21
**Valid until:** 2026-08-20 (30 days — stable, low-churn domain: internal codebase patterns + a long-stable third-party API surface)
