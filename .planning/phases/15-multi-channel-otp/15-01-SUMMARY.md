---
phase: 15-multi-channel-otp
plan: 01
subsystem: auth
tags: [prisma, class-validator, nestjs, cockatiel, resilience, otp, whatsapp, sendgrid]

# Dependency graph
requires: []
provides:
  - "OtpChannel Prisma enum (SMS/WHATSAPP/EMAIL) + User.otpChannel column, migrated to the live dev DB"
  - "OtpChannel TypeScript enum consumed by DTOs and (in later plans) services"
  - "OtpSendDto.channel + OtpSendDto.email (conditionally required), PhoneAuthDto.channel, RegisterDto.channel optional fields"
  - "metaWhatsapp and sendgrid resilience vendor slots with default thresholds"
  - ".env.example scaffolding for direct Meta WhatsApp Business Cloud API integration"
  - "MANUAL-ACTIONS.md Phase 15 section documenting Meta WhatsApp account setup + drafted Authentication template (iseyaa_otp_verification) for stakeholder submission"
affects: [15-03, 15-04, 15-05, 15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-enum DTO field convention (@IsEnum + @IsOptional, matching RegisterDto.role?: UserRole precedent)"
    - "@ValidateIf conditional-required-field convention for OtpSendDto.email (mirrors join-waitlist.dto.ts)"

key-files:
  created:
    - backend/src/common/enums/otp-channel.enum.ts
    - backend/prisma/migrations/20260718153450_phase15_multi_channel_otp/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/auth/dto/otp-send.dto.ts
    - backend/src/modules/auth/dto/phone-auth.dto.ts
    - backend/src/modules/auth/dto/register.dto.ts
    - backend/src/resilience/resilience.types.ts
    - .env.example
    - MANUAL-ACTIONS.md

key-decisions:
  - "Used a plain prisma migrate dev diff (no hand-authored ALTER TYPE ADD VALUE SQL) since OtpChannel is a brand-new enum type, not an extension of an existing enum already referenced by a live column"
  - "PhoneAuthDto.channel added for API-shape consistency only — no validation logic beyond the decorator pair, since channel resolution happens server-side from the value persisted during otp/send (deferred to Plan 15-03)"
  - "RegisterDto.channel added for schema consistency only — AuthService.register()'s email+password flow never calls sendOtp(), so this field is not exercised by any live code path this phase"

patterns-established:
  - "Vendor union + RESILIENCE_DEFAULTS entries for new external integrations (metaWhatsapp, sendgrid) follow the existing timeoutMs/retryCount/failureThreshold/halfOpenAfterMs shape with no other resilience-service code changes needed"

requirements-completed: [OTP-01, OTP-04]

duration: 12min
completed: 2026-07-18
---

# Phase 15 Plan 01: Multi-Channel OTP Contracts Summary

**OtpChannel enum (Prisma + TypeScript) migrated to the live dev DB, optional channel/email fields added to the three auth DTOs, metaWhatsapp/sendgrid resilience vendor slots registered, and the Meta WhatsApp Business Cloud API env scaffolding + drafted Authentication template documented in MANUAL-ACTIONS.md for stakeholder submission**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-18T15:30:00Z (approx)
- **Completed:** 2026-07-18T15:42:00Z (approx)
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- `OtpChannel` enum (`SMS`, `WHATSAPP`, `EMAIL`) exists identically in `schema.prisma` and `otp-channel.enum.ts`; `User.otpChannel` column live in the dev DB, defaulting to `SMS`
- `OtpSendDto`, `PhoneAuthDto`, `RegisterDto` all carry an optional `channel` field; `OtpSendDto` additionally carries a conditionally-required `email` field (`@ValidateIf((o) => o.channel === OtpChannel.EMAIL)`)
- `resilience.types.ts` has `metaWhatsapp` and `sendgrid` vendor slots with `{ timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 }` defaults, ready for Plan 15-03 to call `resilience.execute()` against
- `.env.example` drops `TERMII_WHATSAPP_SENDER_ID` (D-01/D-02) and adds the four `META_WHATSAPP_*` vars
- `MANUAL-ACTIONS.md` gained 4 new Environment Setup table rows plus a full "Phase 15 — Meta WhatsApp Business Cloud API Setup + Template Submission" section with the drafted `iseyaa_otp_verification` Authentication template (D-03) and an informational `15-meta-approved` Resume Signal that does not block automated work

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema — OtpChannel enum + User.otpChannel field + migration** - `d3cdc9c` (feat)
2. **Task 2: OtpChannel TS enum + DTO field additions** - `86ec73e` (feat)
3. **Task 3: Resilience vendor registration + env var scaffolding + WhatsApp template deliverable** - `29fa268` (feat)

_No TDD tasks in this plan (schema/DTO/config scaffolding, tdd="false")._

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added `OtpChannel` enum block after `KYCStatus`; added `otpChannel OtpChannel @default(SMS)` to `User` model
- `backend/prisma/migrations/20260718153450_phase15_multi_channel_otp/migration.sql` - `CREATE TYPE "OtpChannel"` + `ALTER TABLE "users" ADD COLUMN "otpChannel"`, applied to the live dev DB
- `backend/src/common/enums/otp-channel.enum.ts` - New TS enum mirroring `UserRole`'s style
- `backend/src/modules/auth/dto/otp-send.dto.ts` - Added `channel?: OtpChannel` and `email?: string` (conditionally required)
- `backend/src/modules/auth/dto/phone-auth.dto.ts` - Added `channel?: OtpChannel`
- `backend/src/modules/auth/dto/register.dto.ts` - Added `channel?: OtpChannel` after `role?: UserRole`
- `backend/src/resilience/resilience.types.ts` - Added `'metaWhatsapp' | 'sendgrid'` to `Vendor` union + `RESILIENCE_DEFAULTS` entries
- `.env.example` - Removed `TERMII_WHATSAPP_SENDER_ID`; added `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_TEMPLATE_NAME`, `META_WHATSAPP_TEMPLATE_LANG`
- `MANUAL-ACTIONS.md` - Added 4 Environment Setup rows + new "Phase 15 — Meta WhatsApp Business Cloud API Setup + Template Submission" dated section with account setup steps, drafted `iseyaa_otp_verification` template, fallback-behavior note, and `15-meta-approved` Resume Signal

## Decisions Made
- Plain `prisma migrate dev` diff used instead of hand-authored `ALTER TYPE ADD VALUE` SQL — `OtpChannel` is a brand-new enum type with no existing live column referencing it, so the auto-generated `CREATE TYPE` + `ADD COLUMN` migration is safe (unlike the `UserRole` precedent in `14-01-PLAN.md`, which required additive `ALTER TYPE ADD VALUE` because it extended an enum already in use)
- `PhoneAuthDto.channel` and `RegisterDto.channel` added for API-shape/schema consistency only, per the plan's explicit scope note — neither is exercised by a live code path in this plan; actual channel-resolution logic is deferred to Plan 15-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no installed `node_modules`, causing `npx prisma` to resolve a mismatched global-cache Prisma 7.8.0 instead of the project's pinned 5.22.0**
- **Found during:** Task 1 (running `prisma migrate dev`)
- **Issue:** The parallel-execution worktree was created without an `npm install`; `npx prisma migrate dev` silently fetched Prisma CLI 7.8.0 from the npm registry cache, which fails schema validation against this project's Prisma 5.x-style `datasource` block (`url`/`directUrl` were deprecated in Prisma 7). A root `node_modules` junction to the main repo also caused an `EPERM` file-lock race against `backend/node_modules/.prisma/client/query_engine-windows.dll.node`, which was held open by unrelated running `node.exe` processes.
- **Fix:** Created a filesystem junction from the worktree's root `node_modules` to the main repo's root `node_modules` (safe — CLI bin resolution only, no writes). For `backend/node_modules` specifically, removed the junction attempt and instead did a real `robocopy` copy of the main repo's `backend/node_modules` (pinned Prisma 5.22.0) into the worktree, giving this worktree an isolated copy so `prisma generate`'s client regeneration cannot race with the main repo's running processes or a sibling worktree agent.
- **Files modified:** None (environment/tooling only — `node_modules` is gitignored, not part of any commit)
- **Verification:** `npx prisma -v` reports `5.22.0`; `npx prisma migrate dev --name phase15_multi_channel_otp` applied cleanly; `npx prisma generate` succeeded against the isolated copy; `npx tsc --noEmit -p tsconfig.build.json` exits 0 after all three tasks
- **Committed in:** N/A (no repo files changed by this fix)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment/tooling only, no code impact)
**Impact on plan:** No scope creep; fix was purely local dev-environment setup required to execute the plan's own verification commands inside a fresh git worktree.

## Issues Encountered
- See Deviations above — the fresh worktree lacked `node_modules`, which blocked `prisma migrate dev`/`prisma generate`/`tsc` until resolved via an isolated local copy of `backend/node_modules`.

## User Setup Required

**External service configuration is documented, not automated.** See the new "Phase 15 — Meta WhatsApp Business Cloud API Setup + Template Submission" section in `MANUAL-ACTIONS.md` for:
- Meta Business Account / WABA setup and permanent system-user access token generation
- The drafted `iseyaa_otp_verification` Authentication-category template to submit verbatim in Meta Business Manager
- Confirmation that WhatsApp-channel OTP sends fall back to SMS automatically until the template is approved and `META_WHATSAPP_*` secrets are set (expected, not blocking)
- Informational `15-meta-approved` Resume Signal (does not block this phase's automated plans)

## Next Phase Readiness
- Plans 15-03 through 15-06 can now import `OtpChannel` from both `schema.prisma`/generated Prisma Client and `backend/src/common/enums/otp-channel.enum.ts`, read `dto.channel`/`dto.email` off `OtpSendDto`/`PhoneAuthDto`, and call `resilience.execute('metaWhatsapp' | 'sendgrid', ...)` against pre-registered vendor policies
- No blockers for downstream Wave 1 plans; Meta template approval (stakeholder-side, tracked via `15-meta-approved`) is explicitly non-blocking per D-03

---
*Phase: 15-multi-channel-otp*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 10 claimed files verified present on disk; all 4 claimed commit hashes (d3cdc9c, 86ec73e, 29fa268, 2706ed5) verified present in git log.
