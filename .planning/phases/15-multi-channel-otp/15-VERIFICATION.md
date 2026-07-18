---
phase: 15-multi-channel-otp
verified: 2026-07-18T16:24:57Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live WhatsApp OTP delivery via an approved Meta WABA template"
    expected: "A registration/login flow with WHATSAPP selected delivers a real Meta Graph API template message to a test device once iseyaa_otp_verification is APPROVED and META_WHATSAPP_* secrets are set"
    why_human: "Meta template approval and live WABA credentials are a stakeholder/ops action outside the codebase (documented in MANUAL-ACTIONS.md's Phase 15 section, D-03/D-04) — cannot be exercised in CI; until then every WhatsApp send legitimately falls back to SMS by design"
  - test: "On-device visual/UX check of the 3-card channel picker (phone.tsx), Fallback Notice Banner (otp.tsx), and Verification Channel settings screen (otp-channel-settings.tsx)"
    expected: "Cards render with correct gold-selected styling, the fallback banner appears with the exact locked copy after a forced non-SMS failure, and the settings screen's instant-apply/revert-on-failure behavior looks correct on a real device/simulator"
    why_human: "Visual rendering and touch-interaction feel are not verifiable from source code or tsc/jest alone; 15-VALIDATION.md itself flags this as a Manual-Only Verification"
---

# Phase 15: Multi-Channel OTP Verification Report

**Phase Goal:** Users can choose WhatsApp, Email, or SMS as their OTP verification channel at registration, with automatic SMS fallback on delivery failure and brute-force protection that can't be bypassed by switching channels
**Verified:** 2026-07-18T16:24:57Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | At registration, a user can select WhatsApp, Email, or SMS as their OTP channel; SMS is used automatically if no channel is selected (ROADMAP SC1 / OTP-01) | VERIFIED | `mobile/app/auth/phone.tsx:33-37,57` renders 3-card picker defaulting to `'SMS'`; `backend/src/modules/auth/auth.service.ts:147` resolves `channel = existingUser?.otpChannel ?? dto.channel ?? OtpChannel.SMS`; tests `"defaults to SMS via the termiiAuth vendor..."` and `"resolves the WHATSAPP channel from an existing user's persisted otpChannel..."` pass (33/33 auth.service.spec green, run directly) |
| 2 | If the selected channel fails within a bounded timeout, the same code/expiry is resent via SMS automatically (ROADMAP SC2 / OTP-02) | VERIFIED | `auth.service.ts:175-201` `dispatchOtp()` catches any WhatsApp/Email failure and calls `sendTermii(phone, otp)` with the SAME already-generated `otp`; `resilience.types.ts` gives `metaWhatsapp`/`sendgrid` an 8s `timeoutMs`, enforced by `resilience.service.ts`'s cockatiel `timeout()` policy applied identically to every vendor; tests `"falls back to SMS and reports fallbackUsed:true when the metaWhatsapp/sendgrid dispatch rejects"` pass |
| 3 | OTP lockout (3/15min) is scoped per-identity, proven by a test that switching channels does not bypass an active lock (ROADMAP SC3 / OTP-03) | VERIFIED | `sendOtp()`/`phoneAuth()` check `otp_lock:<phone>` before any channel resolution (`auth.service.ts:136-140,277-279`); test `"does not bypass an active lockout when a different channel is requested (lockout)"` asserts zero `resilience.execute` and zero `mockSendgrid.sendOtpEmail` calls while locked — passes |
| 4 | WhatsApp OTP messages use a Meta-approved Authentication-category template, code+expiry only (ROADMAP SC4 / OTP-04) | VERIFIED (code) / see human item | `sendMetaWhatsapp()` (`auth.service.ts:203-240`) posts the correct Graph API template shape (`messaging_product`, `template.name/language.code`, body+button components, `sub_type: 'url'` not `copy_code`); `MANUAL-ACTIONS.md:698-733` documents the drafted `iseyaa_otp_verification` Authentication template for stakeholder submission. Live Meta approval/delivery is a stakeholder action outside the codebase (see Human Verification) |
| 5 | Returning user's persisted `otpChannel` wins over the request's channel; new/unselected defaults to SMS | VERIFIED | Same resolution line as #1; test `"resolves the WHATSAPP channel from an existing user's persisted otpChannel even when the request channel is SMS or absent"` passes |
| 6 | A duplicate email during EMAIL-channel registration is rejected with `ConflictException`, not a raw Prisma error | VERIFIED | `phoneAuth()` (`auth.service.ts:305-310`) pre-checks `findFirst({ email })` before `create()`; test `"rejects with ConflictException on a duplicate email during registration"` passes |
| 7 | Channel/email survive failed-attempt Redis round-trips instead of being dropped | VERIFIED | `encodeOtpValue`/`decodeOtpValue` (`auth.service.ts:161-173`) used in both the wrong-OTP rewrite paths of `verifyOtp()` and `phoneAuth()`; test `"preserves the channel across a failed-attempt rewrite (attempts)"` passes |
| 8 | A newly created phone-only user persists the channel actually used to deliver their OTP, not a hardcoded SMS default | VERIFIED | `auth.service.ts:323` `otpChannel: channel` in `create()`'s data; test `"persists the resolved otpChannel on a newly created user (channel)"` passes |
| 9 | D-07: a signed-in user can change their OTP channel post-registration and see it take effect immediately | VERIFIED | `PATCH /users/me/otp-channel` (`users.controller.ts:67-71`) → `UsersService.updateOtpChannel` (`users.service.ts:66-71`), IDOR-safe (`@CurrentUser()`-derived); mobile `otp-channel-settings.tsx` calls it with optimistic update + `invalidateQueries(['me'])` + revert-on-failure; `users.service.spec.ts` `updateOtpChannel` test passes |
| 10 | D-01/D-02: WhatsApp is fully off Termii — no `'whatsapp'` Termii channel value remains | VERIFIED | `grep` confirms `sendTermii()`'s channel selection collapsed to `smsSender ? 'generic' : 'dnd'`; no `TERMII_WHATSAPP_SENDER_ID` string remains in `auth.service.ts` or `.env.example` |
| 11 | D-09: Email dispatch is always routed through `resilience.execute('sendgrid', ...)`, never called unwrapped | VERIFIED | `auth.service.ts:191-193`; test `"dispatches the Email OTP through the sendgrid vendor policy (sendgrid)"` asserts `resilience.execute` called with `'sendgrid'` — passes |
| 12 | D-10: fallback-to-SMS is visibly communicated with the exact locked copy on the verification screen | VERIFIED | `mobile/app/auth/otp.tsx:135-136` contains the literal strings `"We sent your code via SMS instead"` and `"Your original channel didn't respond in time."`, rendered only when `fallbackUsed` is true, seeded from the route param and re-derived after `resend()` |
| 13 | D-04: the WhatsApp option is always selectable, never hidden behind a feature flag or approval-status check | VERIFIED | `mobile/app/auth/phone.tsx:146-166` renders all 3 `CHANNEL_OPTIONS` unconditionally, no config-gated conditional around the WhatsApp card |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | `OtpChannel` enum + `User.otpChannel @default(SMS)` | VERIFIED | Lines 42, 242 confirmed present |
| `backend/src/common/enums/otp-channel.enum.ts` | TS `OtpChannel` enum | VERIFIED | Matches Prisma enum exactly |
| `backend/src/modules/auth/dto/otp-send.dto.ts` | `channel?`/`email?` (conditionally required) | VERIFIED | `@IsEnum`+`@IsOptional`, `@ValidateIf` present |
| `backend/src/modules/auth/dto/phone-auth.dto.ts` | `channel?: OtpChannel` | VERIFIED | Present, decorator pair only, no `email` field (per plan scope) |
| `backend/src/modules/auth/dto/register.dto.ts` | `channel?: OtpChannel` | VERIFIED | Present after `role?`, schema-consistency only per D-05 |
| `backend/src/resilience/resilience.types.ts` | `metaWhatsapp`/`sendgrid` vendor slots | VERIFIED | `Vendor` union + `RESILIENCE_DEFAULTS` entries present with 8s timeout |
| `backend/src/common/services/sendgrid.service.ts` | `sendOtpEmail()` throws (no swallow) | VERIFIED | Calls `sgMail.send()` directly, no try/catch around it |
| `backend/src/modules/auth/auth.service.ts` | Channel resolution, `sendMetaWhatsapp()`, dispatch-with-fallback, phoneAuth persistence, duplicate-email guard | VERIFIED | All present and exercised by 33 passing tests |
| `backend/src/modules/users/dto/change-otp-channel.dto.ts` | Required `channel: OtpChannel` | VERIFIED | Present |
| `backend/src/modules/users/users.controller.ts` | `PATCH /users/me/otp-channel` | VERIFIED | Present, `@CurrentUser()`-derived target |
| `backend/src/modules/users/users.service.ts` | `updateOtpChannel()` + `USER_SELECT.otpChannel` | VERIFIED | Present |
| `.env.example` | `META_WHATSAPP_*` vars, `TERMII_WHATSAPP_SENDER_ID` removed | VERIFIED | Confirmed via grep |
| `MANUAL-ACTIONS.md` | Meta WhatsApp setup + `iseyaa_otp_verification` template deliverable | VERIFIED | Section present at line 698+ |
| `mobile/app/auth/phone.tsx` | 3-card channel picker + conditional email input | VERIFIED | Full implementation, `tsc --noEmit` clean |
| `mobile/app/auth/otp.tsx` | Fallback Notice Banner | VERIFIED | Full implementation, exact locked copy present |
| `mobile/app/otp-channel-settings.tsx` | Instant-apply 3-row settings screen | VERIFIED | Full implementation, optimistic update + revert |
| `mobile/app/(tabs)/profile.tsx` | Verification Channel menu row, live-data sub-label | VERIFIED | `otpChannelLabel(user?.otpChannel)` — not hardcoded |
| `mobile/app/_layout.tsx` | `otp-channel-settings` Stack.Screen registration | VERIFIED | Confirmed present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `otp-send.dto.ts` | `otp-channel.enum.ts` | `@IsEnum(OtpChannel)` | WIRED | Import + decorator confirmed |
| `auth.service.ts` | `sendgrid.service.ts` | `resilience.execute('sendgrid', () => sendgrid.sendOtpEmail(...))` | WIRED | Confirmed line 191-193, test asserts wrap not bypassed |
| `auth.service.ts` | `resilience.service.ts` | `resilience.execute('metaWhatsapp'\|'sendgrid'\|'termiiAuth', ...)` | WIRED | All three vendor calls confirmed routed through `resilience.execute` |
| `mobile/app/auth/phone.tsx` | `POST /auth/otp/send` | `api.post(..., { phone, channel, email? })` | WIRED | Confirmed; response unwrapped, `fallbackUsed` forwarded as route param |
| `mobile/app/auth/phone.tsx` | `mobile/app/auth/otp.tsx` | `router.push` params `{ phone, fallbackUsed }` | WIRED | Confirmed |
| `mobile/app/(tabs)/profile.tsx` | `mobile/app/otp-channel-settings.tsx` | `router.push('/otp-channel-settings')` | WIRED | Confirmed |
| `mobile/app/otp-channel-settings.tsx` | `PATCH /users/me/otp-channel` | `api.patch(...)` | WIRED | Confirmed, with `invalidateQueries(['me'])` on success |

### Behavioral Spot-Checks (executed live, not from SUMMARY claims)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend auth/OTP test suite | `cd backend && npx jest --testPathPattern auth.service.spec --no-coverage` | 33/33 passed | PASS |
| SendGrid/Users/Resilience test suites | `cd backend && npx jest --testPathPattern "sendgrid.service.spec\|users.service.spec\|resilience.service.spec" --no-coverage` | 25/25 passed (3 suites) | PASS |
| Backend type-check | `cd backend && npx tsc --noEmit -p tsconfig.build.json` | exit 0 | PASS |
| Mobile type-check | `cd mobile && npx tsc --noEmit` | exit 0, no errors | PASS |

All commands were re-run independently by the verifier in this session (not taken from SUMMARY.md's reported numbers), and matched the SUMMARY claims exactly.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| OTP-01 | 15-01, 15-03, 15-04, 15-05, 15-06 | User selects WhatsApp/Email/SMS at registration, SMS default | SATISFIED | Channel resolution + mobile picker + settings screen all verified above |
| OTP-02 | 15-02, 15-03, 15-05 | Bounded-timeout automatic SMS fallback, same code/expiry | SATISFIED | `dispatchOtp()` + 8s resilience timeout + fallback banner, all verified above |
| OTP-03 | 15-03 | Lockout scoped per-identity, not bypassable by channel switch | SATISFIED | Lockout check precedes channel resolution; automated test proves zero dispatch while locked |
| OTP-04 | 15-01, 15-03 | Meta-approved Authentication-category WhatsApp template | SATISFIED (code) | Correct Graph API template shape implemented; live Meta approval is a documented, non-blocking stakeholder action (D-03/D-04) |

No orphaned requirements — REQUIREMENTS.md's Phase 15 traceability table lists exactly OTP-01 through OTP-04, and all four appear in at least one plan's `requirements:` frontmatter.

**Documentation discrepancy (not a code gap):** `.planning/REQUIREMENTS.md` lines 39-42 and 111-114 still show OTP-02 and OTP-03 as unchecked `[ ]` / "Pending" in the traceability table, even though the actual codebase (verified above with passing tests) satisfies both. This is stale bookkeeping — none of the 6 plans in this phase declared `REQUIREMENTS.md` in their `files_modified`, so the checkbox update was never part of this phase's automated scope. Recommend updating REQUIREMENTS.md's OTP-02/OTP-03 rows to `[x]`/"Complete" as a follow-up documentation task; this does not block phase completion since the underlying functionality is verified working.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | Scanned all 12 phase-modified files for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/stub-comment patterns and hardcoded-empty-data patterns; zero matches (the only `placeholder` hits were legitimate `TextInput placeholder=` props) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `mobile/app/otp-channel-settings.tsx` | `channel` (selected row) | `useQuery(['me'], fetcher('/users/me'))` → `GET /users/me` → `USER_SELECT` Prisma projection (now includes `otpChannel`) | Yes — live DB-backed field, not hardcoded | FLOWING |
| `mobile/app/(tabs)/profile.tsx` | `otpChannelLabel(user?.otpChannel)` sub-label | Same `['me']` query, shared cache key, invalidated by the settings screen on save | Yes | FLOWING |
| `mobile/app/auth/otp.tsx` | `fallbackUsed` banner | Route param seeded from `POST /auth/otp/send`'s real `dispatchOtp()` return value, re-derived after `resend()` | Yes — server-computed, not a static true/false | FLOWING |

### Human Verification Required

### 1. Live WhatsApp OTP delivery via an approved Meta WABA template

**Test:** Once the `iseyaa_otp_verification` template is APPROVED in Meta Business Manager and `META_WHATSAPP_ACCESS_TOKEN`/`META_WHATSAPP_PHONE_NUMBER_ID`/`META_WHATSAPP_TEMPLATE_NAME` are set in the live environment, register/login with WHATSAPP selected as the channel and confirm the real message arrives on a test device.
**Expected:** A WhatsApp message containing the OTP code, styled per the Authentication-category template, arrives within seconds; no fallback to SMS occurs.
**Why human:** Meta template approval and live WABA credentials are a stakeholder/ops action outside the codebase (documented, non-blocking, per D-03/D-04 in `MANUAL-ACTIONS.md`). Until then, every WhatsApp send correctly and automatically falls back to SMS — this is expected behavior per the phase's own design, not a defect.

### 2. On-device visual/UX check of the three new mobile screens/components

**Test:** Run the mobile app on a simulator or device; walk through registration (`phone.tsx`'s 3-card picker + conditional email input), force a non-SMS delivery failure and confirm `otp.tsx`'s Fallback Notice Banner appears with the exact locked copy, then navigate Profile → Verification Channel and change the channel, confirming the instant-apply/revert-on-failure behavior feels correct.
**Expected:** Cards render with the specified gold-selected styling and correct spacing; banner text matches D-10's locked copy exactly and is accessible to screen readers; settings screen updates immediately and reverts visibly on a forced failure.
**Why human:** Visual rendering, touch-interaction feel, and screen-reader behavior are not verifiable from source code, `tsc`, or `jest` alone. `15-VALIDATION.md` itself flags this as a Manual-Only Verification item, confirming this was anticipated and intentionally deferred to human testing rather than skipped.

### Gaps Summary

No code-level gaps found. All 13 derived observable truths (combining the 4 ROADMAP.md Success Criteria with plan-declared must-haves and the 10 CONTEXT.md design decisions D-01 through D-10) are verified present, substantive, and wired — confirmed by independently re-running the full relevant test suites (58 tests across 4 spec files, all passing) and both `tsc --noEmit` checks (backend + mobile, both exit 0) directly in this session, not by trusting SUMMARY.md's reported numbers.

Two items require human verification before full sign-off: (1) live Meta WhatsApp template delivery, which is explicitly a stakeholder/ops action outside this phase's code scope and does not block phase completion per the phase's own design decisions (D-03/D-04); and (2) on-device visual/UX confirmation of the three new/modified mobile screens, which 15-VALIDATION.md itself pre-identified as manual-only.

One documentation-only discrepancy was found: `.planning/REQUIREMENTS.md`'s traceability table still marks OTP-02 and OTP-03 as "Pending" despite both being fully implemented and test-verified. This should be corrected as a follow-up but does not represent a functional gap.

---

*Verified: 2026-07-18T16:24:57Z*
*Verifier: Claude (gsd-verifier)*
