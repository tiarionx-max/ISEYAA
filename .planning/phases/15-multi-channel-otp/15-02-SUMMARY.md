---
phase: 15-multi-channel-otp
plan: 02
subsystem: notifications
tags: [sendgrid, email, otp, resilience, testing]

# Dependency graph
requires: []
provides:
  - "SendgridService.sendOtpEmail(to, firstName, otp) — new OTP email send capability that rejects on failure instead of swallowing"
  - "Spec proving rejection-propagation behavior and sendEmail() non-regression"
affects: [15-03-otp-dispatch-wallet-fallback]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-swallowing vendor call: call sgMail.send() directly (no try/catch) so callers wrapping in resilience.execute() observe real rejections — contrasts with sendEmail()'s deliberate fire-and-forget swallow for post-purchase confirmations"

key-files:
  created:
    - backend/src/common/services/__tests__/sendgrid.service.spec.ts
  modified:
    - backend/src/common/services/sendgrid.service.ts

key-decisions:
  - "sendOtpEmail() calls sgMail.send() directly (bypassing this.sendEmail()) with no try/catch, per RESEARCH.md Pitfall 1, so Plan 15-03's resilience.execute('sendgrid', ...) SMS fallback can observe a real rejection"

patterns-established:
  - "sendOtpEmail() inline-HTML template matches the existing <div style=\"font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;\"> shape used by sendTicketConfirmation()/sendBookingConfirmation()"

requirements-completed: [OTP-02]

# Metrics
duration: 6min
completed: 2026-07-18
---

# Phase 15 Plan 02: SendGrid OTP Email (Non-Swallowing) Summary

**Added `SendgridService.sendOtpEmail()` as a deliberately non-swallowing send method — the one new SendGrid capability this phase needs — proven by a new spec asserting rejection propagation while `sendEmail()`'s existing fire-and-forget behavior stays intact.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-18T10:27:00-05:00
- **Completed:** 2026-07-18T10:33:36-05:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `SendgridService.sendOtpEmail(to, firstName, otp)` calls `sgMail.send()` directly with no `try`/`catch`, so a delivery failure propagates as a real promise rejection to the caller
- New spec file (`sendgrid.service.spec.ts`, previously absent) proves both the new rejection behavior and that the pre-existing `sendEmail()` method's swallow-and-log behavior is unchanged (non-regression guard for ticket/booking/studio confirmation emails)
- `cd backend && npx tsc --noEmit -p tsconfig.build.json` exits 0
- `cd backend && npx jest --testPathPattern sendgrid.service.spec --no-coverage` passes (3/3 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SendgridService.sendOtpEmail()** - `00bf831` (feat)
2. **Task 2: Prove rejection propagation + sendEmail() non-regression** - `c3651aa` (test)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

## Files Created/Modified
- `backend/src/common/services/sendgrid.service.ts` - Added `sendOtpEmail(to, firstName, otp)`, placed directly after `sendEmail()`; calls `sgMail.send()` directly with no try/catch so failures propagate
- `backend/src/common/services/__tests__/sendgrid.service.spec.ts` - New spec file (none existed before): Test 1 (resolves + HTML contains exact OTP), Test 2 (`.rejects.toThrow()` on `sendOtpEmail()` when `sgMail.send()` rejects), Test 3 (`sendEmail()` non-regression — still resolves when `sgMail.send()` rejects)

## Decisions Made
- Followed RESEARCH.md Pattern 3 / Pitfall 1 exactly: `sendOtpEmail()` must not call `this.sendEmail()` and must not wrap `sgMail.send()` in `try`/`catch`, since Plan 15-03's `resilience.execute('sendgrid', () => this.sendgrid.sendOtpEmail(...))` needs to observe a real rejection to trigger the SMS fallback (OTP-02).

## Deviations from Plan

None - plan executed exactly as written.

**Environment note (not a plan deviation):** This worktree had no `node_modules` installed for any workspace (root, backend, shared, web, mobile). Created directory junctions to the main repo's `node_modules` at each workspace root (`New-Item -ItemType Junction`) to unblock `tsc`/`jest` execution. These junctions are outside the repo's tracked file set (`node_modules` is git-ignored) and do not appear in `git status`; no repo files were affected.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. `sendOtpEmail()` reuses `SendgridService`'s existing `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` config already wired for other email sends.

## Next Phase Readiness
- `SendgridService.sendOtpEmail(to, firstName, otp): Promise<void>` is ready for Plan 15-03 to call as `resilience.execute('sendgrid', () => this.sendgrid.sendOtpEmail(...))` — its rejection behavior is proven, satisfying the interface contract declared in 15-02-PLAN.md.
- No blockers for Plan 15-03.

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: backend/src/common/services/sendgrid.service.ts
- FOUND: backend/src/common/services/__tests__/sendgrid.service.spec.ts
- FOUND: .planning/phases/15-multi-channel-otp/15-02-SUMMARY.md
- FOUND: commit 00bf831 (feat: sendOtpEmail)
- FOUND: commit c3651aa (test: sendOtpEmail spec)
- FOUND: commit 8768bae (docs: SUMMARY)
