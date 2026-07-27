---
phase: quick
plan: 260727-p7u
status: complete
subsystem: backend
tags: [auth, otp, reliability, incident-fix]
---

# Summary: Surface real OTP-delivery failures instead of silently swallowing them

Found while diagnosing a live production incident: a user's registration OTP never arrived by email, with zero error shown anywhere in the app. Traced to `sendOtp()`'s fallback chain (EMAIL → SMS/Termii → Twilio) silently swallowing every failure — `sendTwilio` only logged errors, `sendTermii` fell through to a stub-log on total failure, and `dispatchOtp`'s catch-and-fallback-to-SMS path never checked whether the fallback itself also failed. The endpoint returned `200 "OTP sent successfully"` even when every real channel had failed.

## Change

`sendTermii`/`sendTwilio` in `backend/src/modules/auth/auth.service.ts` now return `Promise<boolean>` reflecting actual delivery status, instead of only logging. `dispatchOtp` now throws `ServiceUnavailableException` when every channel it attempted (with real provider credentials configured) genuinely failed. The local-dev no-credentials-configured stub path (logs the OTP to console) is unchanged and still reports soft success — that's intentional dev convenience, not a failure worth surfacing.

## Verification

- `cd backend && npx tsc --noEmit` — clean.
- `cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts` — 45/45 pass. One test ('still resolves sendOtp... D-03 fallback chain preserved') explicitly asserted the old silent-swallow behavior; updated to assert the new throw instead, renamed to document why.
- `cd backend && npx jest` (full suite) — 916/916 pass, zero regressions.

## Deviations

Made directly during an active production incident (found mid-investigation of a real user complaint) rather than through the full plan → worktree-executor cycle — investigation, fix, and test updates were completed and independently verified before this doc was written, to keep the fix trustworthy despite the compressed process.
