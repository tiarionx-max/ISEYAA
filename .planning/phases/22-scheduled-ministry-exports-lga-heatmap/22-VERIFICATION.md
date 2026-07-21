---
phase: 22-scheduled-ministry-exports-lga-heatmap
verified: 2026-07-21T14:15:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 22: Scheduled Ministry Exports & LGA Heatmap Verification Report

**Phase Goal:** Ship scheduled Ministry export digests (MIN-08a/b/c) and an LGA×month visitor-density heatmap on the Ministry dashboard (MIN-09).
**Verified:** 2026-07-21T14:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves merged)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A configurable, recurring Ministry export digest (CSV + branded PDF attachment) is generated and delivered by email with no manual trigger, on a cadence set via database configuration | ✓ VERIFIED | `backend/src/modules/ministry/ministry-export-scheduler.service.ts` — `@Cron(CronExpression.EVERY_DAY_AT_6AM) checkSubscriptionsDue()` filters subscriptions by `dueAt = (lastSentAt ?? createdAt) + CADENCE_DAYS[cadence]`, calls `processSubscription()` which renders a 5-section PDF (`MinistryPdfService.renderPdf`) + combined CSV (`CsvExportService.toCsv`) and sends via `sendMinistryDigest()`. `CADENCE_DAYS` reads the DB-persisted `cadence` enum (WEEKLY/MONTHLY/QUARTERLY) — no hardcoded schedule per subscription. Test suite (9 tests) passes, including due-filtering and rolling-window assertions. |
| 2 | An operator can change the export recipient list and delivery cadence via a database-backed REST route with no redeploy required | ✓ VERIFIED | `MinistryExportSubscriptionController` exposes `GET/POST/PATCH/DELETE /admin/ministry-export-subscriptions`, backed by `MinistryExportSubscriptionService` CRUD against `prisma.ministryExportSubscription` (in-place `update()`). 20 controller tests + 9 service tests pass. |
| 3 | Only SUPER_ADMIN can read or mutate MinistryExportSubscription rows — stricter than the read-only MinistryController's role set | ✓ VERIFIED | Controller carries `@Roles(UserRole.SUPER_ADMIN)` only; `grep -c "MINISTRY_VIEWER"` in the controller file returns 0. Dedicated RBAC test (`ministry-export-subscription.controller.spec.ts`) asserts exact role metadata `[SUPER_ADMIN]` and denies unauthenticated/other-role callers. Test passes. |
| 4 | Malformed email addresses in recipients are rejected at the DTO boundary before ever reaching a database row | ✓ VERIFIED | `CreateExportSubscriptionDto`/`UpdateExportSubscriptionDto` both apply `@IsEmail({}, { each: true })` to `recipients`. Controller spec test `'rejects a malformed email in recipients'` passes. |
| 5 | Every scheduled delivery attempt (success or failure) is logged, and a transient SendGrid outage does not silently drop a report — wrapped in the existing cockatiel resilience layer | ✓ VERIFIED | `processSubscription()` calls `this.resilience.execute('sendgrid', () => this.sendgrid.sendMinistryDigest(...))`; `'sendgrid'` is a registered vendor in `backend/src/resilience/resilience.types.ts` (existing policy, reused unchanged). Both success (`logger.log`) and failure (`logger.error` + `lastStatus/lastError` persisted) paths are logged. Confirmed via passing scheduler tests including a rejection-propagation/status-persistence test. |
| 6 | A failed send leaves lastSentAt unchanged so the subscription remains due and is retried automatically on the next scheduled tick | ✓ VERIFIED | Failure branch `catch` block updates only `{ lastStatus: 'FAILED', lastError }` — `lastSentAt` is absent from that update call's `data` object (confirmed by reading source; also asserted by a dedicated scheduler test). Success branch is the only place `lastSentAt: new Date()` appears (`grep -c` returns 1, confirmed in source). |
| 7 | A second replica running the same cron tick does not double-send the same digest (Phase 20's setNx() distributed-lock pattern applied) | ✓ VERIFIED | `checkSubscriptionsDue()` calls `redis.setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000)` and returns immediately (no query, no send) when not acquired — mirrors `stays.service.ts`'s `releaseEscrow()` pattern. Dedicated lock-guard tests (acquired vs. not-acquired) pass. |
| 8 | The Ministry dashboard shows an LGA × month visitor-density heatmap built on existing MinistryService query shapes and the existing dashboard, with no new mapping/GeoJSON dependency; reuses the already-fetched visitor-entries query; sums count across userRole while keeping month distinct; shows all 20 LGAs even at zero count | ✓ VERIFIED | `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` exports `buildGrid()` grouping by `(lgaName, month)`, summing `count` across `userRole`, pre-seeding all 20 `OGUN_LGA_NAMES` at 0. Mounted in `web/src/app/admin/ministry/page.tsx` as a 4th panel using the existing `visitorEntries`/`isVisitorLoading`/`isVisitorError` state (no new `useQuery` call — confirmed only 4 `useQuery` call sites unchanged from baseline, plus the import line). No `react-simple-maps`/`nivo`/`d3-scale` import found; `web/package.json` unchanged (no new dependency). 5 component/unit tests pass. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | `MinistryExportSubscription` model + `ExportCadence`/`ExportDeliveryStatus` enums | ✓ VERIFIED | Present at lines 722-745; migration `20260721131842_add_ministry_export_subscription` applied, `migration.sql` contains `CREATE TABLE "ministry_export_subscriptions"` |
| `backend/src/common/services/sendgrid.service.ts` | `sendMinistryDigest()` with attachments, no swallow | ✓ VERIFIED | Method present, no try/catch, omits `attachments` key when empty; `sendEmail()`/`sendOtpEmail()` signatures untouched |
| `backend/src/modules/ministry/ministry-export-subscription.controller.ts` | SUPER_ADMIN-gated CRUD, Swagger-visible | ✓ VERIFIED | `@Roles(UserRole.SUPER_ADMIN)`, 4 routes, `@ApiOperation` on each |
| `backend/src/modules/ministry/ministry-export-subscription.service.ts` | CRUD against `prisma.ministryExportSubscription`, in-place update | ✓ VERIFIED | No `$transaction`; `findOne()` reused as 404 chokepoint |
| `backend/src/modules/ministry/dto/create-export-subscription.dto.ts` | `IsEmail` validation | ✓ VERIFIED | `@IsEmail({}, { each: true })` present |
| `backend/src/modules/ministry/ministry-export-scheduler.service.ts` | `checkSubscriptionsDue` cron + `setNx` guard + digest gather/render/send | ✓ VERIFIED | Full implementation present, matches interfaces exactly |
| `web/src/components/admin/ministry/LgaMonthHeatmap.tsx` | `buildGrid()` + grid render | ✓ VERIFIED | Present, exported, tested |
| `web/src/app/admin/ministry/page.tsx` | Mounts `LgaMonthHeatmap` as 4th panel | ✓ VERIFIED | Panel present after Revenue panel, no export buttons, reuses `visitorEntries` query |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `sendgrid.service.ts` (`sendMinistryDigest`) | `@sendgrid/mail` `sgMail.send()` | `attachments: [...]` | ✓ WIRED | Confirmed in source; tests assert attachment shape and omission |
| `ministry-export-subscription.controller.ts` | `ministry-export-subscription.service.ts` | constructor injection | ✓ WIRED | Confirmed |
| `ministry.module.ts` | `MinistryExportSubscriptionController` | `controllers` array | ✓ WIRED | Confirmed |
| `ministry.module.ts` | `MinistryExportSchedulerService` | `providers` array | ✓ WIRED | Confirmed |
| `ministry-export-scheduler.service.ts` | `redis.service.ts` (`setNx`) | distributed lock guard | ✓ WIRED | `setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000)` present |
| `ministry-export-scheduler.service.ts` | `resilience.service.ts` (`execute`) | `resilience.execute('sendgrid', ...)` | ✓ WIRED | Confirmed; `'sendgrid'` vendor registered in `resilience.types.ts` |
| `ministry-export-scheduler.service.ts` | `sendgrid.service.ts` (`sendMinistryDigest`) | digest send call | ✓ WIRED | Confirmed |
| `web/src/app/admin/ministry/page.tsx` | `LgaMonthHeatmap.tsx` | `data={visitorEntries ?? []}` prop | ✓ WIRED | Confirmed, no new `useQuery` call added |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ministry-export-scheduler.service.ts` | `visitorEntries`/`purposeBreakdown`/`revenue` | `MinistryService.getVisitorEntriesByLgaAndMonth/getPurposeBreakdown/getRevenueToGovernment` (real Prisma-backed queries, unmodified from Phase 14) | Yes | ✓ FLOWING |
| `LgaMonthHeatmap.tsx` | `data` prop | `visitorEntries` from the page's existing `useQuery` against `/ministry/visitor-entries` (real backend route) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full ministry backend test suite | `cd backend && npm run test -- ministry` | 7 suites / 94 tests passed | ✓ PASS |
| SendGrid digest method tests | `cd backend && npm run test -- sendgrid.service` | 1 suite / 6 tests passed | ✓ PASS |
| Full backend regression suite | `cd backend && npm run test` | 75 suites / 800 tests passed | ✓ PASS |
| LgaMonthHeatmap web tests | `cd web && npm run test -- LgaMonthHeatmap` | 1 suite / 5 tests passed | ✓ PASS |
| No new mapping dependency introduced | `grep -i "react-simple-maps\|nivo\|d3-scale" web/package.json` | no match | ✓ PASS |
| Migration applied / Prisma Client exposes delegate | `grep -c "ministryExportSubscription" backend/node_modules/.prisma/client/index.d.ts` | 24 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MIN-08a | 22-01, 22-03 | Scheduled `@Cron` Ministry export digest, CSV+PDF, configurable cadence | ✓ SATISFIED | `checkSubscriptionsDue()`/`processSubscription()` implementation, tests passing |
| MIN-08b | 22-02 | Recipient list + cadence configurable via DB, no redeploy | ✓ SATISFIED | `MinistryExportSubscriptionController` CRUD routes, SUPER_ADMIN-gated |
| MIN-08c | 22-03 | Every attempt logged; wrapped in cockatiel resilience layer | ✓ SATISFIED | `resilience.execute('sendgrid', ...)` + `logger.log`/`logger.error` on every path |
| MIN-09 | 22-04 | LGA × month heatmap, no new mapping dependency | ✓ SATISFIED | `LgaMonthHeatmap.tsx` + page.tsx mount, no new dependency |

**Note:** `.planning/REQUIREMENTS.md` still shows these 4 requirements as unchecked `[ ]` with `Status: Pending` in the Traceability table (lines 32-35, 92-95). This is a documentation-staleness issue in REQUIREMENTS.md itself (not yet updated to reflect Phase 22 completion) — it does not reflect a code gap. All 4 requirements are demonstrably implemented and test-covered in the codebase. Recommend updating REQUIREMENTS.md checkboxes as part of phase closure.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the 8 phase-modified source files reviewed. No stub returns, no empty handlers, no hardcoded-empty data flowing to render paths.

### Human Verification Required

None. All must-haves are verifiable via source inspection, automated test execution, and grep-based structural checks. The visual/tooltip/color-intensity styling of the heatmap (exact pixel rendering) is not functionally load-bearing to the phase goal and is covered by passing component tests for the structural behaviors (20 rows always rendered, empty state, aggregation correctness).

### Gaps Summary

No gaps. All 4 requirement IDs (MIN-08a, MIN-08b, MIN-08c, MIN-09) and all 4 ROADMAP success criteria are implemented, wired, and covered by passing automated tests (94 ministry-scoped tests + 800 full backend suite + 5 web component tests, all green). The only non-blocking observation is REQUIREMENTS.md's traceability table not yet reflecting completion — a documentation bookkeeping item, not a functional gap.

---

*Verified: 2026-07-21T14:15:00Z*
*Verifier: Claude (gsd-verifier)*
