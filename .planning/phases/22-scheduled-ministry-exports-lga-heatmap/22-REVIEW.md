---
phase: 22-scheduled-ministry-exports-lga-heatmap
reviewed: 2026-07-21T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - backend/prisma/migrations/20260721131842_add_ministry_export_subscription/migration.sql
  - backend/prisma/schema.prisma
  - backend/src/common/services/__tests__/sendgrid.service.spec.ts
  - backend/src/common/services/sendgrid.service.ts
  - backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts
  - backend/src/modules/ministry/__tests__/ministry-export-subscription.controller.spec.ts
  - backend/src/modules/ministry/__tests__/ministry-export-subscription.service.spec.ts
  - backend/src/modules/ministry/dto/create-export-subscription.dto.ts
  - backend/src/modules/ministry/dto/update-export-subscription.dto.ts
  - backend/src/modules/ministry/ministry-export-scheduler.service.ts
  - backend/src/modules/ministry/ministry-export-subscription.controller.ts
  - backend/src/modules/ministry/ministry-export-subscription.service.ts
  - backend/src/modules/ministry/ministry.module.ts
  - web/src/app/admin/ministry/page.tsx
  - web/src/components/admin/ministry/LgaMonthHeatmap.tsx
  - web/src/components/admin/ministry/__tests__/LgaMonthHeatmap.test.tsx
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-07-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed the scheduled Ministry export subscription feature (CRUD API, `@Cron`-driven digest scheduler, `SendgridService.sendMinistryDigest`) and the LGA × Month visitor-density heatmap panel. The RBAC gating (`SUPER_ADMIN`-only on the subscription CRUD controller), DTO validation, and per-row failure isolation in the scheduler are all correctly implemented and well covered by tests. The Prisma migration matches the schema exactly.

No blocking crashes, auth bypasses, or data-loss bugs were found. Four warnings were identified: (1) the scheduler's own error-handling path is not itself protected against a secondary failure, which can undermine the documented "one bad subscription never blocks the rest" guarantee; (2) the digest CSV embeds a free-text field (`purpose`) without formula-injection sanitization and is now emailed automatically to external recipients rather than only downloaded on-demand by an admin, widening exposure to a known CSV/DDE injection class; (3) the distributed cron lock this feature depends on fails open when Redis is unavailable, which can produce duplicate digest emails to government recipients during a Redis outage; (4) the new heatmap panel silently drops "Unknown"-LGA visitor counts from the visible grid while still folding them into the color-intensity `max`, which can visibly distort the density scale for every real LGA whenever any visit record lacks an LGA.

## Warnings

### WR-01: Scheduler's own failure-path DB write is unprotected against a second failure

**File:** `backend/src/modules/ministry/ministry-export-scheduler.service.ts:278-284`
**Issue:** `processSubscription()`'s outer `catch` block logs the error and then `await`s a second `prisma.ministryExportSubscription.update(...)` call to persist `lastStatus: 'FAILED'`. That `await` is not itself wrapped in a `try/catch`. If this second write also fails (e.g. the same transient DB outage that likely caused the original failure, or the row was deleted concurrently), the exception propagates out of `processSubscription()` uncaught. Because `checkSubscriptionsDue()` calls `await this.processSubscription(subscription)` inside a plain `for` loop with no try/catch around the call (lines 119-121), that uncaught rejection aborts the loop — every subsequent due subscription in the same tick is silently skipped, contradicting the method's own documented contract ("Wrapped in a per-row try/catch so one bad subscription never aborts checkSubscriptionsDue()'s loop for the others") and the existing test `isolates one subscription failure from the next`, which only exercises a *first-attempt* failure, never a failure of the status-write itself.

Separately, if `sendMinistryDigest` succeeds but the *subsequent* `SUCCESS` update (lines 272-275) throws, the outer catch will mark the subscription `FAILED` even though the email was already delivered — and because `lastSentAt` is not advanced on the `FAILED` path, the next cron tick will re-gather largely the same window and re-send the digest to the same recipients (duplicate email).

**Fix:**
```typescript
} catch (err: any) {
  this.logger.error(`processSubscription failed for subscription ${subscription.id}: ${err?.message}`);
  try {
    await this.prisma.ministryExportSubscription.update({
      where: { id: subscription.id },
      data: { lastStatus: 'FAILED', lastError: this.truncateError(err) },
    });
  } catch (updateErr: any) {
    this.logger.error(
      `processSubscription: failed to persist FAILED status for subscription ${subscription.id}: ${updateErr?.message}`,
    );
  }
}
```
Also wrap the `checkSubscriptionsDue()` loop body in a try/catch as defense-in-depth, and consider distinguishing "delivery failed" from "delivery succeeded but status write failed" so `lastSentAt` reflects an actual successful send even if the final status write later fails.

### WR-02: Ministry digest CSV is not sanitized against CSV/formula injection before automated external email delivery

**File:** `backend/src/modules/ministry/ministry-export-scheduler.service.ts:175-233`
**Issue:** `combinedRows` includes `purpose` (per `schema.prisma`'s own comment on `VisitorLog.purpose`: *"free-text taxonomy value... not an enum"*) sourced from end-user booking/ticket flows, and is passed straight into `CsvExportService.toCsv()`, which is backed by `fast-csv` and only guarantees RFC4180 quoting/escaping — it does not neutralize a leading `=`, `+`, `-`, or `@` character. If any citizen-supplied `purpose` string begins with one of those characters, the resulting `.csv` attachment becomes a classic CSV/DDE formula-injection payload. Previously this CSV was only reachable via an admin manually clicking "Export CSV" in the dashboard (`ministry.controller.ts`); this phase adds a fully automated path that emails the same unsanitized CSV directly to externally-configured `recipients` (`MinistryExportSubscription.recipients`, arbitrary free-text emails per D-11) with no human review step, meaningfully widening the exposure of the same underlying gap.
**Fix:** Sanitize any string cell that starts with `=`, `+`, `-`, or `@` (prefix with a `'` or a leading space/tab) before handing rows to `CsvExportService.toCsv()`, e.g.:
```typescript
function csvSafe(value: unknown): unknown {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}
const combinedRows = rawRows.map((row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, csvSafe(v)])),
);
```
(Ideally fix this once inside `CsvExportService.toCsv()` so every CSV export in the codebase is protected, not just this call site.)

### WR-03: Distributed cron lock fails open on Redis unavailability, undermining the documented "never double-sends" guarantee

**File:** `backend/src/modules/ministry/ministry-export-scheduler.service.ts:101-107`
**Issue:** `checkSubscriptionsDue()`'s JSDoc explicitly states it is "Guarded by Phase 20's setNx() distributed-lock pattern so a second replica running the same cron tick never double-sends the same digest." However, `RedisService.setNx()` (`backend/src/redis/redis.service.ts:131-137`) returns `true` (lock "acquired") whenever the Redis client is disabled/uninitialized **or** whenever `client.set(...)` throws for any reason — it treats every failure mode as an optimistic pass. During a Redis outage or misconfiguration, every replica's `checkSubscriptionsDue()` will independently believe it acquired the lock and each will send the full digest to every due subscription's recipients, producing duplicate government-facing emails — the exact failure this lock was introduced to prevent.
**Fix:** This is out of scope to fix inside the reviewed files (the fail-open behavior lives in the shared `RedisService`, which is not part of this phase's file set), but the scheduler's own doc comment overstates the guarantee it actually gets. At minimum, update the comment to note the fail-open caveat, and consider whether Ministry digest delivery — an externally-visible, compliance-relevant channel — should fail closed (skip the tick and alert) rather than fail open when Redis is unavailable.

### WR-04: Heatmap silently drops "Unknown"-LGA visitor counts from the grid while still using them to scale the visible color intensity

**File:** `web/src/components/admin/ministry/LgaMonthHeatmap.tsx:32-39, 84-89, 110`
**Issue:** `buildGrid()` buckets any row whose `lgaName` doesn't match a seeded key (notably rows with `lgaId: null`/`lgaName: null`, bucketed as `'Unknown'` — confirmed by the component's own test at `LgaMonthHeatmap.test.tsx:32-41`, `VisitorLog.lgaId` is nullable per `schema.prisma:316`) into the `grid` Map. `max` (lines 84-89) is then computed over **every** value in `grid`, including this `'Unknown'` bucket. But the render loop (line 110: `OGUN_LGA_NAMES.map((lgaName) => ...)`) only ever iterates the 20 canonical LGA names — the `'Unknown'` row is never displayed anywhere in the table or legend. If any visit in the selected period has no attributable LGA (a `VisitorLog` row with `lgaId: null`), its count still inflates `max`, which mutes the color intensity of every genuinely-displayed LGA cell relative to what the true per-LGA proportions would show, without any indication to the viewer that unattributed data exists or is affecting the scale.
**Fix:** Exclude the synthetic `'Unknown'` bucket (or any key not in `OGUN_LGA_NAMES`) from the `max` calculation, e.g.:
```typescript
let max = 0;
for (const lgaName of OGUN_LGA_NAMES) {
  const monthMap = grid.get(lgaName);
  if (!monthMap) continue;
  for (const count of monthMap.values()) {
    if (count > max) max = count;
  }
}
```
Optionally also surface unattributed visits (e.g. an "Unassigned" row or a footnote count) so the dashboard doesn't silently discard real data.

## Info

### IN-01: Pre-existing unescaped HTML interpolation in SendGrid templates (touched file, not introduced this phase)

**File:** `backend/src/common/services/sendgrid.service.ts:64-152`
**Issue:** `sendTicketConfirmation`, `sendStudioBookingConfirmation`, and `sendBookingConfirmation` interpolate DB-sourced strings (`firstName`, `eventTitle`, `ticketType`, `venue`, `propertyName`, `slotName`, `slotType`) directly into HTML template literals with no escaping. This predates Phase 22 (git blame shows these methods existed before `41ea154`), but the file is in this review's scope because `sendMinistryDigest` was added to it. Not a new-code defect, but worth a follow-up ticket since it's a live stored-HTML-injection surface in outbound government-branded email.
**Fix:** Add a small `escapeHtml()` helper and apply it to any interpolated value that isn't a fixed literal or a validated enum/date.

### IN-02: `recipients` array has no upper bound or dedupe validation

**File:** `backend/src/modules/ministry/dto/create-export-subscription.dto.ts:6-10`, `backend/src/modules/ministry/dto/update-export-subscription.dto.ts:6-11`
**Issue:** `@ArrayMinSize(1)` + `@IsEmail({}, { each: true })` enforce a floor but there's no `@ArrayMaxSize` or de-duplication, so a `SUPER_ADMIN` could submit an arbitrarily large or duplicate-containing `recipients` array, causing the scheduler to call `sgMail.send({ to: [...] })` with duplicate/oversized recipient lists.
**Fix:** Add `@ArrayMaxSize(50)` (or similar) and dedupe (`Array.from(new Set(recipients))`) either in the DTO (`@Transform`) or in `MinistryExportSubscriptionService.create()`/`update()`.

### IN-03: Digest email body shows raw ISO timestamps instead of a human-readable date range

**File:** `backend/src/modules/ministry/ministry-export-scheduler.service.ts:267`
**Issue:** `html: \`<p>Your scheduled Ministry Export Digest for the period ${from} to ${to} is attached.</p>\`` renders full ISO-8601 strings (e.g. `2026-07-01T00:00:00.000Z`) inline, inconsistent with the friendly `toLocaleDateString`/`toLocaleString` formatting used by every other template in the same file (`sendTicketConfirmation`, `sendBookingConfirmation`, `sendStudioBookingConfirmation`).
**Fix:**
```typescript
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
html: `<p>Your scheduled Ministry Export Digest for the period ${fmt(from)} to ${fmt(to)} is attached.</p>`,
```

---

_Reviewed: 2026-07-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
