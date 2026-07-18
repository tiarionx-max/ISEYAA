---
phase: 15-multi-channel-otp
plan: 03
subsystem: auth
tags: [nestjs, prisma, redis, resilience, whatsapp, sendgrid, termii, otp, jest]

# Dependency graph
requires:
  - phase: 15-multi-channel-otp
    provides: "OtpChannel enum + DTO channel/email fields + metaWhatsapp/sendgrid resilience vendor slots (15-01); SendgridService.sendOtpEmail() non-swallowing capability (15-02)"
provides:
  - "AuthService.sendOtp() channel resolution (returning-user preference wins, defaults to SMS) with fallbackUsed reporting"
  - "AuthService.sendMetaWhatsapp() — direct Meta Graph API WhatsApp template send, replacing Termii's old whatsapp passthrough"
  - "Resilience-wrapped Email dispatch via resilience.execute('sendgrid', () => sendgrid.sendOtpEmail(...))"
  - "Composite Redis OTP value (otp:attempts:channel:email) surviving verifyOtp()/phoneAuth() failed-attempt round-trips"
  - "phoneAuth() persists the resolved otpChannel + real email on new-user creation; duplicate-email registration rejected with ConflictException"
affects: [15-04, 15-05, 15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite Redis value encoding (encodeOtpValue/decodeOtpValue) to thread ephemeral request-scoped state (channel, email) through a TTL-bound key across multiple request/response round-trips"
    - "Dispatch-with-fallback: try resolved non-SMS channel inside a try/catch, unconditionally fall through to the proven SMS path on any failure using the SAME already-generated OTP"

key-files:
  created: []
  modified:
    - backend/src/modules/auth/auth.service.ts
    - backend/src/modules/auth/__tests__/auth.service.spec.ts
    - backend/src/resilience/__tests__/resilience.service.spec.ts

key-decisions:
  - "encodeOtpValue/decodeOtpValue centralize the Redis composite-value format so all three call sites (sendOtp write, verifyOtp/phoneAuth read+rewrite) stay in sync — decodeOtpValue defaults channel to SMS and email to undefined when segments are absent, tolerating any in-flight 2-segment Redis keys written before this deploy (5-minute TTL makes this a narrow, self-expiring compatibility window)"
  - "dispatchOtp() returns a boolean fallbackUsed rather than throwing on non-SMS failure, so sendOtp() always resolves successfully to the caller (matches D-03's existing 'circuit open still resolves OTP sent' contract) while still surfacing fallback occurrence in the response body"
  - "Duplicate-email guard uses a findFirst pre-check before create() rather than catching Prisma's raw P2002 — keeps AuthService's existing error-handling convention (throw NestJS HTTP exceptions, not ORM-specific error codes) consistent with the rest of the file"

patterns-established:
  - "Fallback-on-throw dispatch shape (try resolved channel → catch → fall through to Termii SMS with the same OTP) established as the template any future non-SMS OTP channel should follow"

requirements-completed: [OTP-01, OTP-02, OTP-03, OTP-04]

# Metrics
duration: 15min
completed: 2026-07-18
---

# Phase 15 Plan 03: OTP Dispatch, WhatsApp Send, and SMS Fallback Summary

**AuthService.sendOtp()/verifyOtp()/phoneAuth() rewired for multi-channel dispatch — returning-user channel preference wins over request channel, WhatsApp routes through a new sendMetaWhatsapp() (Meta Graph API template message, resilience.execute('metaWhatsapp')), Email routes through resilience.execute('sendgrid', () => sendgrid.sendOtpEmail(...)), and any non-SMS failure falls back to the exact same OTP via Termii SMS with fallbackUsed reported to the caller.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-18T10:44:00-05:00 (approx)
- **Completed:** 2026-07-18T10:59:00-05:00
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `sendOtp()` resolves the effective channel as `existingUser?.otpChannel ?? dto.channel ?? SMS` — a returning user's persisted preference always wins over whatever channel the client requests, satisfying OTP-01 literally
- New `sendMetaWhatsapp()` calls Meta Graph API's `/messages` endpoint with the correct Authentication-template shape (`messaging_product`, `template.name`, `template.language.code`, a `body` component carrying the OTP, and a `button` component with `sub_type: 'url'` — never `copy_code`), wrapped in `resilience.execute('metaWhatsapp', ...)`, and MUST throw (never swallow) on a non-ok response (OTP-04)
- Termii's old `whatsapp` channel passthrough is fully removed — `sendTermii()` no longer reads `TERMII_WHATSAPP_SENDER_ID` and its channel selection collapsed to `smsSender ? 'generic' : 'dnd'` (D-01/D-02)
- Email OTP dispatch is routed through `resilience.execute('sendgrid', () => this.sendgrid.sendOtpEmail(...))` — never called unwrapped — so the `'sendgrid'` vendor policy registered in Plan 15-01 actually governs the bounded-timeout/retry/circuit-breaker behavior for this path (D-09)
- Any WhatsApp/Email dispatch failure is caught inside `dispatchOtp()`, logged, and falls through unconditionally to `sendTermii(phone, otp)` reusing the SAME already-generated OTP and expiry — `sendOtp()` returns `fallbackUsed: true` in that case (OTP-02)
- The Redis `otp:<phone>` value now encodes `otp:attempts:channel:email` via `encodeOtpValue`/`decodeOtpValue` helpers, so channel and email survive failed-attempt rewrites in both `verifyOtp()` and `phoneAuth()` instead of being silently dropped
- `phoneAuth()`'s new-user branch persists the `otpChannel` actually resolved and used at send time (not a hardcoded SMS default) and persists a real EMAIL-channel address instead of the `{phone}@iseyaa.local` placeholder when one was supplied and verified
- A duplicate email supplied during EMAIL-channel registration is pre-checked and rejected with `ConflictException('Email already in use')` instead of letting a raw Prisma `P2002` unique-constraint error propagate as an unhandled 500
- An active `otp_lock:<phone>` lockout blocks `sendOtp()` and `phoneAuth()` identically regardless of the requested channel — proven by an automated test asserting zero `resilience.execute('metaWhatsapp'|'sendgrid', ...)` calls and zero direct `sendgrid.sendOtpEmail()` calls while locked (OTP-03)
- `cd backend && npx jest --testPathPattern "auth.service.spec|resilience.service.spec" --no-coverage` passes (47/47 tests)
- `cd backend && npx tsc --noEmit -p tsconfig.build.json` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Channel resolution + resilience-wrapped dispatch-with-fallback + sendMetaWhatsapp() + Termii WA-branch removal** - `1f883ad` (feat)
2. **Task 2: phoneAuth()/verifyOtp() Redis round-trip preservation + channel persistence on user creation + duplicate-email conflict handling + lockout proof** - `ab02fa3` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles final metadata commit after merge)

_TDD note: both tasks were written test-alongside (behavior + tests added in the same commit per task) rather than strict separate RED/GREEN commits — the plan's `tdd="true"` frontmatter governs per-task test coverage, not a mandated 3-commit RED/GREEN/REFACTOR split for this execute-type plan._

## Files Created/Modified
- `backend/src/modules/auth/auth.service.ts` — Added `SendgridService` constructor dependency, `OtpChannel` import; rewrote `sendOtp()` for channel resolution + composite Redis encoding; added `encodeOtpValue()`/`decodeOtpValue()`/`dispatchOtp()`/`sendMetaWhatsapp()` private methods; `verifyOtp()`/`phoneAuth()` now decode/re-encode the composite Redis value; `phoneAuth()`'s new-user branch persists `otpChannel` + resolved email and pre-checks for a duplicate email; `sendTermii()`'s WhatsApp branch removed
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` — Added `mockSendgrid` provider to the shared `TestingModule`; extended `mockConfig` with `META_WHATSAPP_*` test values; fixed two pre-existing assertions for the new 4-segment Redis value format; added 12 new tests covering channel resolution, fallback-on-throw (WhatsApp + Email), WhatsApp template shape, sendgrid vendor wrapping, Redis channel-preservation across failed attempts, otpChannel/email persistence on new-user creation, duplicate-email rejection, and lockout-not-bypassed-by-channel-switch
- `backend/src/resilience/__tests__/resilience.service.spec.ts` — Updated the vendor-count assertion title from "7" to "9" (title-only change; the test body already iterates `Object.keys(RESILIENCE_DEFAULTS)` dynamically)

## Decisions Made
- Split the single logical change (Redis composite-value format + channel dispatch) across the two task commits exactly as the plan's `<action>` blocks specified: Task 1 owns `sendOtp()`/`sendMetaWhatsapp()`/`dispatchOtp()`/the `encodeOtpValue`/`decodeOtpValue` helper definitions and Termii cleanup; Task 2 owns `verifyOtp()`/`phoneAuth()`'s consumption of those helpers plus the duplicate-email guard and otpChannel/email persistence — this required committing Task 1's file state before applying Task 2's edits (both edits were drafted together for correctness/test-running purposes, then Task 2's portion was set aside, Task 1 was committed and re-verified in isolation, then Task 2 was reapplied and verified before its own commit)
- Kept `USER_SELECT`'s projection unchanged (does not add `otpChannel`) — that projection is owned by `backend/src/modules/users/users.service.ts`'s `GET /users/me`/`PATCH /users/me/otp-channel` work, which is out of this plan's `files_modified` scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no installed `node_modules` for any workspace**
- **Found during:** Pre-Task-1 environment setup (before running any jest/tsc verification)
- **Issue:** The parallel-execution worktree was created without an `npm install`; root and `backend/` `node_modules` directories did not exist, so `npx jest`/`npx tsc` could not resolve dependencies (Prisma client, NestJS, jest, etc.)
- **Fix:** Created a filesystem junction from the worktree's root `node_modules` to the main repo's root `node_modules` (safe — read-only CLI/dependency resolution, no writes back to the main repo). For `backend/node_modules` specifically, used `robocopy` to copy the main repo's `backend/node_modules` (already includes the generated Prisma client with `OtpChannel`/`otpChannel` from Plan 15-01's migration) into the worktree, giving this worktree an isolated copy so test/build runs cannot race with the main repo or a sibling worktree agent's own `npm`/`prisma` processes
- **Files modified:** None (environment/tooling only — `node_modules` is gitignored, not part of any commit)
- **Verification:** `npx jest --testPathPattern auth.service.spec --no-coverage` ran and passed against the pre-Task-1 baseline (21/21 tests) before any code changes were made, confirming the environment was correctly wired
- **Committed in:** N/A (no repo files changed by this fix)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment/tooling only, no code impact)
**Impact on plan:** No scope creep; fix was purely local dev-environment setup required to execute the plan's own verification commands inside a fresh git worktree (same pattern as Plan 15-01/15-02's worktree setup).

## Issues Encountered
- A `mockResilience.execute.mockImplementation(...)` set in one `sendOtp` fallback test was persisting into later tests (Jest's `clearAllMocks()` clears call history but not a previously-set `mockImplementation`). Fixed by restoring the shared default `mockResilience.execute` implementation at the top of every `beforeEach`, so per-test overrides never leak across tests (Rule 1 — test-scoping bug introduced during this plan's own test authoring, fixed immediately, not a defect in the shipped service code).

## User Setup Required

None - no new external service configuration required. This plan wires up dispatch logic against the `META_WHATSAPP_*` env vars and Meta WhatsApp template already documented in Plan 15-01's `MANUAL-ACTIONS.md` section; WhatsApp sends continue to fall back to SMS automatically until the template is approved and those secrets are set in the live environment (informational, non-blocking, per Plan 15-01's D-03 Resume Signal).

## Next Phase Readiness
- `AuthService.sendOtp()` returns `{ message, fallbackUsed }` — Plans 15-04/15-05/15-06 (mobile channel picker, settings-screen channel switch, and any remaining UI wiring) can now rely on the backend fully implementing OTP-01 through OTP-04
- `phoneAuth()`'s response shape (`{ user, isNewUser, accessToken, refreshToken }`) is unchanged, so no client-side breaking change is introduced by this plan
- No blockers for downstream Wave 2 plans in this phase

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*

## Self-Check: PASSED

- FOUND: backend/src/modules/auth/auth.service.ts
- FOUND: backend/src/modules/auth/__tests__/auth.service.spec.ts
- FOUND: backend/src/resilience/__tests__/resilience.service.spec.ts
- FOUND: commit 1f883ad (feat: channel resolution + dispatch-with-fallback + sendMetaWhatsapp)
- FOUND: commit ab02fa3 (feat: Redis round-trip preservation + channel persistence + duplicate-email handling)
- FOUND: commit 602989b (docs: SUMMARY)
