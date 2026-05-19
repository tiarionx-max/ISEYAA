---
phase: 06-qa-security-performance
plan: 01
subsystem: api
tags: [admin, marketplace, stays, webhooks, sql, escrow, stock]

# Dependency graph
requires:
  - phase: 03-transport-module
    provides: stays module with escrow cron
  - phase: 03-transport-module
    provides: marketplace module with order payment handler
provides:
  - getRevenue() returning by_vendor_status grouping (no 500 from missing v.category)
  - releaseEscrow() using checkOut cutoff (prevents premature host payout)
  - handleOrderPayment() decrementing product stock after payment confirmation
  - Paystack webhook rawBody wiring confirmed correct
affects: [06-qa-security-performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bug fix: raw SQL queries must reference actual DB columns — validate against schema"
    - "Bug fix: escrow cron must key on checkOut not checkIn for correct payout timing"
    - "Bug fix: payment handlers must decrement inventory immediately on confirmation"

key-files:
  created: []
  modified:
    - backend/src/modules/admin/admin.service.ts
    - backend/src/modules/admin/__tests__/admin.service.spec.ts
    - backend/src/modules/stays/stays.service.ts
    - backend/src/modules/marketplace/marketplace.service.ts

key-decisions:
  - "Renamed getRevenue return key by_category → by_vendor_status (vendors table has status column, not category)"
  - "Stock decrement placed between order.update(PROCESSING) and notifyOrderUpdate — atomic in the catch block"
  - "Paystack rawBody wiring confirmed correct — no code change required"

requirements-completed:
  - QA-03
  - QA-04

# Metrics
duration: 2min
completed: 2026-05-19
---

# Phase 6 Plan 01: Bug Fixes (Admin SQL, Escrow Cutoff, Stock Decrement) Summary

**Fixed three backend bugs: broken v.category SQL in getRevenue replaced with v.status grouping, escrow cron keyed on checkOut instead of checkIn, and marketplace order payment now decrements product stock**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-19T14:48:09Z
- **Completed:** 2026-05-19T14:50:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- admin.service.ts: `getRevenue()` no longer throws 500 — replaced `SELECT v.category` (non-existent column) with `SELECT v.status`, renamed return key `by_category` → `by_vendor_status`
- stays.service.ts: `releaseEscrow()` cron now triggers 24 h after `checkOut` (was `checkIn`), preventing hosts from receiving escrow funds before guests actually check out
- marketplace.service.ts: `handleOrderPayment()` now decrements product stock for each order item immediately after status moves to PROCESSING, preventing overselling
- webhooks.controller.ts: confirmed `req.rawBody` is correctly passed to `webhooksService.handlePaystack` — HMAC-SHA512 signature verification intact (no code change needed)
- All 270 existing backend tests continue to pass — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix admin.service.ts getRevenue broken SQL** - `55ab6e8` (fix)
2. **Task 2: Fix stays escrow cutoff and marketplace stock decrement** - `a09eca6` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `backend/src/modules/admin/admin.service.ts` — Fixed getRevenue() raw SQL; renamed by_category → by_vendor_status
- `backend/src/modules/admin/__tests__/admin.service.spec.ts` — Updated test fixture to match renamed field (by_category → by_vendor_status, FOOD fixture → ACTIVE status)
- `backend/src/modules/stays/stays.service.ts` — Fixed releaseEscrow() where clause: checkIn → checkOut with explanatory comment
- `backend/src/modules/marketplace/marketplace.service.ts` — Added stock decrement for-loop in handleOrderPayment() between order status update and notification

## Decisions Made
- Renamed `by_category` to `by_vendor_status` — the vendors table has a `status` enum (PENDING | ACTIVE | SUSPENDED), not a `category` column; the new grouping is semantically correct and equally useful for government analytics
- Stock decrement loop placed after `order.update(PROCESSING)` but before `notifyOrderUpdate` — ensures inventory is decremented before any downstream notification fires
- Paystack rawBody wiring: the plan noted "verify only, no code change" — confirmed `@Req() req: RawBodyRequest<Request>` is present and `req.rawBody` is passed as the third argument; documented in summary

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated admin.service.spec.ts test to match renamed field**
- **Found during:** Task 1 (after editing admin.service.ts)
- **Issue:** Test at line 83 referenced `result.by_category[0].category` which TypeScript rejects after the rename; also mock returned `{ category: 'FOOD' }` instead of `{ status: 'ACTIVE' }`
- **Fix:** Updated mock fixture to `{ status: 'ACTIVE', total: '40000' }` and assertion to `result.by_vendor_status[0].status`
- **Files modified:** `backend/src/modules/admin/__tests__/admin.service.spec.ts`
- **Verification:** `npx jest --testPathPattern admin` → 9 passed, 0 failed
- **Committed in:** `55ab6e8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Test update is a required correctness fix — the test was testing the old broken interface. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all three fixes wire real data paths.

## Threat Flags
None - no new network endpoints, auth paths, or schema changes introduced.

## Next Phase Readiness
- Three backend bugs resolved; endpoint no longer returns 500 on revenue queries
- Escrow timing is correct; stock overselling prevented
- All 270 tests green — ready for Phase 6 Plan 02

## Self-Check: PASSED
- `backend/src/modules/admin/admin.service.ts` — verified contains `by_vendor_status` and `GROUP BY v.status`
- `backend/src/modules/stays/stays.service.ts` — verified contains `checkOut: { lt: cutoff }`
- `backend/src/modules/marketplace/marketplace.service.ts` — verified contains `stock: { decrement: item.quantity }`
- `backend/src/modules/webhooks/webhooks.controller.ts` — verified `req.rawBody` passed as third arg
- Commits `55ab6e8` and `a09eca6` exist in git log
- All 270 tests pass

---
*Phase: 06-qa-security-performance*
*Completed: 2026-05-19*
