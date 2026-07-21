---
phase: 22-scheduled-ministry-exports-lga-heatmap
plan: 03
subsystem: backend
tags: [nestjs, cron, sendgrid, resilience, redis-lock, ministry-export]

# Dependency graph
requires:
  - phase: 22-scheduled-ministry-exports-lga-heatmap
    provides: MinistryExportSubscription Prisma model + SendgridService.sendMinistryDigest() (plan 22-01), CRUD + ministry.module.ts registration (plan 22-02)
provides:
  - MinistryExportSchedulerService with @Cron checkSubscriptionsDue() (once-daily, setNx-guarded)
  - processSubscription() end-to-end digest gather/render/send + status persistence
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron lock guard: setNx('cron-lock:<jobName>', '1', <ttl>) copied verbatim from stays.service.ts's releaseEscrow()/tour-notifications.service.ts's pushTMinus24h() shape (Phase 20 distributed-lock pattern, applied per CONTEXT.md's discretion note)"
    - "Per-row try/catch cron loop isolation: one subscription's failure updates only that row's lastStatus=FAILED and never aborts the loop for the remaining due subscriptions"
    - "Local column-const duplication over cross-file import/export: this plan defines its own copies of ministry.controller.ts's PDF column shapes rather than exporting them from that file, keeping MIN-01's GET-only controller untouched"

key-files:
  created:
    - backend/src/modules/ministry/ministry-export-scheduler.service.ts
    - backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts
  modified:
    - backend/src/modules/ministry/ministry.module.ts

key-decisions:
  - "processSubscription()'s size-guard fallback (D-15) treats an oversized attachment as a degraded-but-successful send, not a delivery failure — the subscription still advances lastSentAt/lastStatus=SUCCESS, only the attachments key is omitted from the SendGrid payload"
  - "truncateError() persists only err.message truncated to 500 chars, mirroring resilience.service.ts's non-exported summarizeVendorError() intent (T-22-05) — never err.response.body/headers"
  - "Combined CSV uses one MINISTRY_DIGEST_CSV_COLUMNS union (9 columns) across all 3 report types, each row tagged by a `report` discriminator and populated only with its applicable columns, empty string elsewhere — mirrors ministry.controller.ts's exportRevenue breakdown-column technique"

requirements-completed: [MIN-08a, MIN-08c]

# Metrics
duration: ~40min
completed: 2026-07-21
---

# Phase 22 Plan 03: Scheduled Ministry Export Digest Summary

**`MinistryExportSchedulerService` ships the once-daily `@Cron` tick (MIN-08a) that finds every due `MinistryExportSubscription` by its own rolling `lastSentAt ?? createdAt` window, bundles all 3 Phase 14 Ministry reports into one branded PDF + one combined CSV, and delivers them via `SendgridService.sendMinistryDigest()` wrapped in the existing `resilience.execute('sendgrid', ...)` vendor policy — guarded by Phase 20's `setNx()` distributed lock so a second replica never double-sends (MIN-08c).**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-21T13:46:00Z (approx, continuing from 22-02's worktree base)
- **Completed:** 2026-07-21T14:26:00Z
- **Tasks:** 2 completed (both TDD: RED + GREEN each)
- **Files modified:** 3 (2 created source/spec files, 1 modified module file)

## Accomplishments
- `checkSubscriptionsDue()` acquires `cron-lock:checkMinistryExportSubscriptions` via `setNx('...', '1', 86000)`, returning immediately (no query, no send) when another replica holds the lock — proven by dedicated tests for both acquired and not-acquired paths
- Due-subscription filtering computes each subscription's own `dueAt = (lastSentAt ?? createdAt) + CADENCE_DAYS[cadence]` and only calls `processSubscription()` for rows past that threshold — a not-yet-due subscription is skipped entirely with zero calls to `MinistryService`/SendGrid
- `processSubscription()` gathers all 3 Phase 14 reports scoped to that subscription's own `[lastSentAt ?? createdAt, now)` window (proven with two simultaneously-due subscriptions receiving two distinct from/to windows), renders one 5-section branded PDF via `MinistryPdfService.renderPdf()`, and builds one combined 9-column CSV via `CsvExportService.toCsv()` with a `report` discriminator column
- D-15 size guard: when `pdfBuffer.length + Buffer.byteLength(csv, 'utf-8')` exceeds 8MB, the digest still sends (email itself, without attachments) and a `logger.warn` fires — proven the subscription still advances to `lastStatus: 'SUCCESS'`
- Delivery goes through `resilience.execute('sendgrid', () => sendgrid.sendMinistryDigest(...))` — the exact already-live vendor policy used by OTP email, no new resilience wiring
- On success: `lastSentAt`/`lastStatus: 'SUCCESS'`/`lastError: null` persisted. On failure (after cockatiel's retries exhaust): `lastStatus: 'FAILED'` and a `truncateError()`-shortened (`<=500` chars, message-only) `lastError` persisted, with `lastSentAt` explicitly absent from that update call's `data` object — proving a failed subscription stays "due" and retries automatically next tick (D-13)
- Per-row `try/catch` isolation proven: one subscription throwing during gather/render/send does not prevent the next due subscription in the same tick from being processed and updated
- Full backend suite: 75 suites / 800 tests passing after this plan's changes

## Task Commits

Each task was committed atomically:

1. **Task 1: MinistryExportSchedulerService — @Cron tick, setNx() lock guard, due-subscription filtering** - `163fe54` (test, RED) + `b9fc520` (feat, GREEN)
2. **Task 2: processSubscription() — per-subscription digest gather/render/send + status persistence** - `fa68e39` (test, RED) + `041812b` (feat, GREEN)

_Note: Both tasks were TDD — each has a RED (failing test) then GREEN (implementation) commit pair, per the plan's `tdd="true"` marker. Task 1's RED commit intentionally left the target service file absent so the test suite failed on module resolution (`Cannot find module`), matching this codebase's existing 22-01/22-02 RED-commit convention (test-only, no source scaffold). Task 2's RED commit ran against Task 1's already-implemented `checkSubscriptionsDue()` with `processSubscription()` still a one-line stub, so its 6 new assertions failed for the correct behavioral reasons (verified before committing)._

## Files Created/Modified
- `backend/src/modules/ministry/ministry-export-scheduler.service.ts` - `MinistryExportSchedulerService`: `@Cron` tick + lock guard + due-filtering (Task 1), `processSubscription()` full gather/render/send/status-update body + `truncateError()` (Task 2)
- `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts` - 9 tests: 3 for the cron tick/lock guard/due-filtering, 6 for `processSubscription()`'s rolling window, size guard, success/failure status persistence, error truncation, and per-row isolation
- `backend/src/modules/ministry/ministry.module.ts` - Registers `MinistryExportSchedulerService` in `providers` (no new `imports` — `RedisModule`/`ResilienceModule`/`CommonModule` are all `@Global()`)

## Decisions Made
- Followed the plan's `<interfaces>` block verbatim for every existing signature called (`MinistryService.*`, `MinistryPdfService.renderPdf`, `CsvExportService.toCsv`, `SendgridService.sendMinistryDigest`, `ResilienceService.execute`, `RedisService.setNx`) — no interface deviations
- Switched the spec file's clock control from a manual `Date.now` monkeypatch (sufficient for Task 1, which only calls `Date.now()`) to `jest.useFakeTimers()` + `jest.setSystemTime()` once Task 2 introduced `new Date()` calls (`to` window boundary, `lastSentAt: new Date()`) — confirmed via a standalone Node check that mocking `Date.now` alone does NOT affect `new Date()`'s no-arg constructor in this V8/Node runtime, so fake timers were required for deterministic assertions on both call sites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing worktree dependencies (node_modules) and regenerated Prisma Client**
- **Found during:** Task 1 (running `npm run test`)
- **Issue:** Fresh git worktree had no `node_modules` in `backend/` or repo root (same pre-existing condition documented in 22-01's and 22-02's own SUMMARYs, since worktrees don't inherit `node_modules`), and the generated Prisma Client did not expose `MinistryExportSubscription` until regenerated
- **Fix:** Ran `npm ci --workspace=backend --include-workspace-root` to materialize `node_modules` per the committed `package-lock.json`, then `npx prisma generate` against the already-migrated schema (schema/migration themselves come from 22-01, not modified by this plan)
- **Files modified:** None (node_modules and generated client are gitignored, not committed)
- **Verification:** `npm run test -- ministry-export-scheduler.service` and the full `npm run test` (75 suites / 800 tests) both pass
- **Committed in:** N/A (no source changes; environment setup only)

**2. [Rule 3 - Blocking] Created local `backend/.env` for Prisma CLI**
- **Found during:** Task 1 (running `npx prisma generate`)
- **Issue:** Same as 22-01/22-02 — the Prisma CLI needs `backend/.env` (not just the NestJS-resolved root `.env`) to load `DATABASE_URL`/`DIRECT_URL`
- **Fix:** Copied the main checkout's root `.env` to `backend/.env` in this worktree
- **Files modified:** `backend/.env` (gitignored, not committed — confirmed via `git check-ignore -v`)
- **Verification:** `npx prisma generate` succeeds against the local Docker Postgres instance
- **Committed in:** N/A (gitignored local environment file, not committed)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking environment setup issues specific to this fresh worktree checkout, identical in nature to 22-01's and 22-02's own documented deviations; no source-code or behavioral deviations from the plan)
**Impact on plan:** Zero impact on scope or deliverables — both fixes were prerequisite tooling/environment setup. No scope creep.

## Issues Encountered

None beyond the two environment-setup deviations documented above. All acceptance-criteria grep checks from the plan (`async checkSubscriptionsDue` count 1, lock-key grep count 1, `processSubscription` count >=2, module registration count 1, `resilience.execute('sendgrid'` count 1, `lastSentAt: new Date()` count exactly 1 and only on the success path, `truncateError` count >=2) all matched on first run — no plan-authoring imprecision discovered this time.

## User Setup Required

None - no external service configuration required. `SendgridService.sendMinistryDigest()`'s stub-mode behavior (when `SENDGRID_API_KEY` is absent/placeholder) is unchanged from the existing `SendgridService` conventions established in 22-01.

## Next Phase Readiness

- MIN-08a (scheduled digest delivery) and MIN-08c (logged, resilient delivery with retry-on-failure) are fully shipped end-to-end: `MinistryExportSchedulerService` ties together 22-01's schema/SendGrid foundation, 22-02's subscription CRUD, and the pre-existing Phase 14 `MinistryService`/`MinistryPdfService`/`CsvExportService`
- This was the last plan in the "Scheduled Ministry Exports" half of Phase 22 (MIN-08). MIN-09 (Seasonal/LGA heatmap visualization) is a separate, later plan in this phase per `22-CONTEXT.md`
- No blockers identified

---
*Phase: 22-scheduled-ministry-exports-lga-heatmap*
*Completed: 2026-07-21*

## Self-Check: PASSED

All claimed files verified present on disk:
- `backend/src/modules/ministry/ministry-export-scheduler.service.ts`
- `backend/src/modules/ministry/__tests__/ministry-export-scheduler.service.spec.ts`
- `backend/src/modules/ministry/ministry.module.ts`
- `.planning/phases/22-scheduled-ministry-exports-lga-heatmap/22-03-SUMMARY.md`

All claimed commit hashes verified present in git history:
- `163fe54`, `b9fc520`, `fa68e39`, `041812b`, `b893539`
