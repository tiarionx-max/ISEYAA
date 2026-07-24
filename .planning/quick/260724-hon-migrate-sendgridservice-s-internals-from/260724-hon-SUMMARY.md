---
phase: quick
plan: 260724-hon
subsystem: infra
tags: [resend, sendgrid, email, nestjs, jest, transactional-email]

requires: []
provides:
  - "SendgridService rewritten against the Resend Node SDK — class name and all five public method signatures unchanged"
  - "resend@^6.18.0 backend dependency; @sendgrid/mail removed"
  - "RESEND_API_KEY documented across .env.example, README.md, MANUAL-ACTIONS.md, CLAUDE.md, .github/workflows/ci.yml"
affects: [auth, events, stays, marketplace, studio, tour-notifications, delivery, ministry]

tech-stack:
  added: [resend@^6.18.0]
  patterns:
    - "Lazy-guarded third-party client construction in NestJS DI singletons (avoid constructor-time throw crashing app bootstrap when an API key is absent)"
    - "Explicit if (error) throw reconstruction of a throw-on-failure contract when migrating off an SDK that throws to one that resolves {data,error}"

key-files:
  created: []
  modified:
    - backend/src/common/services/sendgrid.service.ts
    - backend/src/common/services/__tests__/sendgrid.service.spec.ts
    - backend/package.json
    - .env.example
    - README.md
    - MANUAL-ACTIONS.md
    - CLAUDE.md
    - .github/workflows/ci.yml

key-decisions:
  - "Kept the class name SendgridService and the 'sendgrid' resilience vendor key unchanged — renaming either would require touching every consumer and DB-stored resilience.sendgrid.* PlatformConfig rows for zero functional benefit"
  - "Kept SENDGRID_FROM_EMAIL as the from-address env var name (did not rename to RESEND_FROM_EMAIL) — provider-agnostic value, renaming was explicitly out of scope per plan constraints"
  - "sendOtpEmail() and sendMinistryDigest() gained an explicit if (error) throw new Error(...) guard since Resend's SDK never rejects — this reconstructs the throw contract @sendgrid/mail used to provide natively, which auth.service.ts's SMS fallback and ministry-export-scheduler.service.ts's FAILED-status tracking depend on"

requirements-completed: []

duration: 55min
completed: 2026-07-24
---

# Quick Task 260724-hon: Migrate SendgridService to Resend SDK Summary

**SendgridService's internals swapped from the dead `@sendgrid/mail` SDK to `resend@^6.18.0`, preserving byte-for-byte public method signatures and the exact throw-vs-swallow contract each of the ~10 consumer call sites depends on.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-24T18:19:29Z (record_start_time; actual work began earlier in-session)
- **Completed:** 2026-07-24
- **Tasks:** 3/3 completed
- **Files modified:** 8

## Accomplishments
- `SendgridService` now sends transactional email via Resend's official Node SDK instead of the permanently-unactivatable SendGrid account
- Preserved the throw/swallow behavioral contract exactly: `sendOtpEmail()` and `sendMinistryDigest()` throw a real `Error` on send failure (SMS fallback / FAILED-status tracking still fire correctly), `sendEmail()` still swallows failures into a logged error for fire-and-forget confirmation emails
- `sendMinistryDigest()`'s attachment mapping (`type`→`contentType`, `disposition` dropped) implemented inline so `ministry-export-scheduler.service.ts` needed zero changes
- Full backend test suite (76 suites, 862 tests) passes after the migration — zero regressions in any of the ~10 consumer modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate SendgridService to the Resend SDK and swap the package dependency** - `9bcd9b4` (feat)
2. **Task 2: Update sendgrid.service.spec.ts mocks to Resend's shape and verify full test coverage** - `b1ff834` (test)
3. **Task 3: Document the new RESEND_API_KEY environment variable** - `c4605f7` (docs)

_Note: this SUMMARY.md and STATE.md updates are committed separately by the orchestrator, not part of the task commits above._

## Files Created/Modified
- `backend/src/common/services/sendgrid.service.ts` - Rewritten against Resend: named `import { Resend } from 'resend'`, lazily-constructed `private readonly client?: Resend` guarded by a non-placeholder `RESEND_API_KEY` check, `sendOtpEmail`/`sendMinistryDigest` throw on `{error}`, `sendEmail` swallows-and-logs, attachment field mapping inline in `sendMinistryDigest`
- `backend/src/common/services/__tests__/sendgrid.service.spec.ts` - Mocks the `Resend` class constructor (`{ emails: { send: mockSend } }`), all 6 tests updated to resolve `{data,error}` shapes instead of `mockRejectedValue`, assertions updated for the new error message format and mapped attachment shape
- `backend/package.json` - Removed `@sendgrid/mail`, added `resend: ^6.18.0`
- `.env.example`, `README.md`, `MANUAL-ACTIONS.md`, `CLAUDE.md`, `.github/workflows/ci.yml` - Added `RESEND_API_KEY` documentation alongside existing (unchanged) `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` references

## Decisions Made
- Kept `SendgridService` class name and the `'sendgrid'` resilience vendor key (`resilience.execute('sendgrid', ...)`) unchanged — these are internal lookup keys decoupled from the actual provider, and renaming would require a DB migration for `platform_configs` rows with zero functional benefit
- Kept `SENDGRID_FROM_EMAIL` env var name unrenamed per plan constraints — only additive `RESEND_API_KEY` documentation was added, no existing SendGrid references were removed or renamed
- Added a defensive `try/catch` around `sendEmail()`'s `resend.emails.send()` call even though Resend's SDK is documented to always resolve rather than reject — kept for parity in case a future SDK version changes this contract (matches RESEARCH.md's target implementation exactly)

## Deviations from Plan

None - plan executed exactly as written. The target implementation in the plan's `<context>` block was followed verbatim for `sendgrid.service.ts`, and the test mock reference was followed verbatim for the spec file.

## Issues Encountered

**Worktree cwd-drift incident (self-corrected, no lasting impact):** During Task 1, an `npm install`/`npm uninstall` command was mistakenly run with `cd` targeting the main repository checkout (`C:\Developer\work\ISEYAA`) instead of this task's worktree (`C:\Developer\work\ISEYAA\.claude\worktrees\agent-adbedf6e54f394718`). This modified the main repo's `backend/package.json` and regenerated its root `package-lock.json`. A subsequent `git checkout -- package-lock.json` (intended to undo the mistake) also discarded a legitimate pre-existing uncommitted change in the main repo (an `expo-notifications` dependency addition to `mobile/package.json` that hadn't yet been reflected in the lockfile). This was detected immediately via `git status`/`git diff` inspection, and fully repaired by reverting `backend/package.json` to its original state and re-running `npm install` at the main repo root — which regenerated `package-lock.json` to correctly include only the pre-existing `expo-notifications` addition, with no `resend`/`@sendgrid/mail` contamination. Verified via `git diff` grep that no trace of this task's dependency changes leaked into the main repo, and that the main repo's `git status --short` output after repair exactly matched the snapshot from the start of this session. All subsequent work for this task was then correctly performed inside the worktree. No main-repo work was lost; no worktree files were affected at any point.

## User Setup Required

**External service action needed before this reaches production:** A Resend account must be created and `RESEND_API_KEY` set in the production environment (Railway) for transactional email (OTP, ticket/booking/studio confirmations, ministry digests) to actually send — until then, `SendgridService` degrades gracefully (logs an error and returns/throws per method, per the existing guarded-construction pattern) rather than crashing. Per RESEARCH.md's open question, Resend also requires a verified sending domain (SPF/DKIM) for `noreply@iseyaa.gov.ng` — this is an infra/ops action outside this codebase, already flagged in `MANUAL-ACTIONS.md`.

No USER-SETUP.md was generated for this quick task; the above is the full scope of manual action required.

## Next Phase Readiness
`SendgridService`'s public API is unchanged, so no consumer (auth, events, stays, marketplace, studio, tour-notifications, delivery, ministry-export-scheduler) requires any follow-up code changes. The only remaining action is operational: provisioning a real `RESEND_API_KEY` and verifying the sending domain with Resend.

---
*Quick task: 260724-hon*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commit hashes (9bcd9b4, b1ff834, c4605f7) verified present in git log.
