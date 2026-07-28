---
phase: quick
plan: 260728-fms
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/resilience/resilience.types.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
  - .env.example
  - .github/workflows/ci.yml
  - mobile/app/verify-phone.tsx
  - mobile/app/auth/phone.tsx
  - mobile/app/otp-channel-settings.tsx
  - mobile/app/auth/register.tsx
  - CLAUDE.md
  - README.md
  - MANUAL-ACTIONS.md
  - docs/CONFIGURATION.md
  - .planning/codebase/STACK.md
  - .planning/codebase/ARCHITECTURE.md
  - .planning/codebase/INTEGRATIONS.md
  - .planning/codebase/CONVENTIONS.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "No code path in the repo calls Termii, Twilio, or Meta's WhatsApp Business Cloud API — all three had their account applications rejected/blocked"
    - "SMS/OTP delivery (auth registration/login/reset OTPs, and delivery recipient OTPs) works via Sendchamp instead, using the same graceful-degrade-to-console-stub pattern the old providers used"
    - "The WHATSAPP OtpChannel option still exists in the DB/DTO enum (for backward compatibility with existing user records) but now delivers via the same Sendchamp SMS path rather than failing or attempting Meta — no code path still calls Meta"
    - "Mobile screens that offered a WhatsApp channel picker (verify-phone.tsx, auth/phone.tsx, otp-channel-settings.tsx) no longer offer it, since Sendchamp's WhatsApp channel needs a separately-approved template not yet set up — offering a channel that silently delivers via a different one would be dishonest UX"
  artifacts:
    - path: "backend/src/modules/auth/auth.service.ts"
      provides: "sendSendchampSms private method replacing sendTermii/sendTwilio/sendMetaWhatsapp"
      contains: "sendSendchampSms"
    - path: "backend/src/modules/delivery/delivery.service.ts"
      provides: "sendDeliveryOtp private method replacing sendTermiiDeliveryOtp"
      contains: "sendDeliveryOtp"
---

<objective>
User explicitly instructed: "let us not use termii, twillo and sendgrid and meta whatsapp they have blocked all lets use another api" (clarified via AskUserQuestion that Resend/email is fine and working — only SMS/WhatsApp providers needed replacing), followed by a direct follow-up: "remove termii, twillio and meta". Termii and Twilio (SMS) and Meta WhatsApp Business Cloud API had all had their account applications rejected or blocked, leaving OTP delivery non-functional in production. Researched alternatives via WebSearch (Africa's Talking, Sendchamp, Vonage Verify/Plivo) and the user selected Sendchamp via AskUserQuestion — a Nigerian-born provider with self-serve signup (email verification only, no telco-letterhead paperwork like Africa's Talking, no lengthy KYC like Termii/Twilio required) covering SMS, WhatsApp, and Voice OTP under one API.

Purpose: Remove every Termii/Twilio/Meta WhatsApp code path and replace SMS/OTP delivery (both the auth module's registration/login/reset OTP and the delivery module's recipient handoff OTP) with Sendchamp, while being honest in the mobile UI about which channels actually work today.
Output: Two new private methods (`sendSendchampSms` in auth.service.ts, `sendDeliveryOtp` in delivery.service.ts) call `POST https://api.sendchamp.com/api/v1/sms/send` with a Bearer-token `SENDCHAMP_API_KEY`, `{to, message, sender_name, route}` body (`route` defaults to `dnd` for +234 numbers, `international` otherwise — Sendchamp's DND-bypass classification for transactional messages). The WHATSAPP OtpChannel now delivers via this same SMS path (Sendchamp's own WhatsApp channel needs a separately-approved message template, mirroring the exact friction that sank the Meta integration — not yet set up). Three mobile screens that offered a WhatsApp option in a channel picker had that option removed, since offering a channel that silently degrades to SMS is misleading. Resilience vendor keys renamed (`termiiAuth`→`sendchampAuth`, `termiiDelivery`→`sendchampDelivery`, `metaWhatsapp` removed). Full documentation sweep (CLAUDE.md, README.md, MANUAL-ACTIONS.md, docs/CONFIGURATION.md, .planning/codebase/*.md) updated to reference Sendchamp; MANUAL-ACTIONS.md's Meta WhatsApp setup phase marked RETIRED with its original instructions kept as a historical record (matching the doc's own convention for completed/superseded phases) rather than deleted.
</objective>

<context>
Made directly (not through the full plan → worktree-executor cycle), consistent with this session's established pattern for user-directed infrastructure changes. Sendchamp's exact API shape (endpoint, auth header, request body fields) was confirmed via WebFetch against `sendchamp.readme.io`/`developers.sendchamp.com` before implementation, not guessed. Verified via `cd backend && npx tsc --noEmit` (clean), the full backend Jest suite (916/916 passing), and `cd mobile && npx tsc --noEmit` (clean).

No `SENDCHAMP_API_KEY` has been provisioned yet — the backend runs in the pre-existing "stub mode" pattern (OTP logged to console, `sendSendchampSms`/`sendDeliveryOtp` return early) until the user signs up for a Sendchamp account and supplies the key for Railway.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename resilience vendor keys and remove metaWhatsapp</name>
  <files>backend/src/resilience/resilience.types.ts</files>
  <action>
    `Vendor` union: `termiiAuth`→`sendchampAuth`, `termiiDelivery`→`sendchampDelivery`, `metaWhatsapp` removed entirely. `RESILIENCE_DEFAULTS` updated to match (same threshold values carried over unchanged — timeoutMs 5000, retryCount 1, failureThreshold 5, halfOpenAfterMs 30000 for both sendchamp* keys). Confirmed no other code references these keys as literal strings outside auth.service.ts/delivery.service.ts and their spec files (grep-verified) — `resilience.service.ts` derives its vendor list dynamically from `RESILIENCE_DEFAULTS`, and per-vendor threshold overrides are read from `platformConfig` rows keyed by `resilience.${vendor}.*`, which are lazily looked up (no DB migration needed for a rename).
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit</automated>
  </verify>
  <done>Vendor type has no termii*/metaWhatsapp members; sendchampAuth/sendchampDelivery present with the same threshold values.</done>
</task>

<task type="auto">
  <name>Task 2: Replace auth.service.ts's SMS/WhatsApp dispatch with Sendchamp</name>
  <files>backend/src/modules/auth/auth.service.ts</files>
  <action>
    Deleted `sendMetaWhatsapp`, `sendTermii`, `sendTwilio`. Added `sendSendchampSms(phone, otp): Promise<boolean>` — checks `SENDCHAMP_API_KEY`, logs a `[SMS STUB]` warning and returns `true` if absent (dev convenience, unchanged from the old pattern); otherwise POSTs to `https://api.sendchamp.com/api/v1/sms/send` with `Authorization: Bearer <key>` and body `{to: [phone], message, sender_name: SENDCHAMP_SENDER_NAME ?? 'Sendchamp', route: phone.startsWith('+234') ? 'dnd' : 'international'}` wrapped in `resilience.execute('sendchampAuth', ...)`; returns `true`/`false` reflecting actual delivery, matching the existing `Promise<boolean>` contract `dispatchOtp` relies on for the D-04/D-08 fallback-failure-detection logic from quick task 260727-p7u.

    `dispatchOtp` simplified: SMS and WHATSAPP channels both now call `sendSendchampSms` directly (WhatsApp-specific delivery needs a Sendchamp-approved template not yet set up — documented in a code comment referencing this quick task). EMAIL channel unchanged (still Resend via `sendgrid` vendor policy). The EMAIL-failure fallback path now falls back to `sendSendchampSms` instead of `sendTermii`.
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit</automated>
  </verify>
  <done>No reference to Termii/Twilio/Meta remains in auth.service.ts except one explanatory code comment; sendOtp() for SMS/WHATSAPP channels routes through sendSendchampSms.</done>
</task>

<task type="auto">
  <name>Task 3: Replace delivery.service.ts's Termii delivery OTP with Sendchamp</name>
  <files>backend/src/modules/delivery/delivery.service.ts</files>
  <action>
    Renamed `sendTermiiDeliveryOtp` → `sendDeliveryOtp`, same signature and both call sites (order-creation and `resendOtp()`) updated. Body now targets Sendchamp's SMS endpoint with the same `{to, message, sender_name, route}` shape as auth.service.ts's `sendSendchampSms`, reading `SENDCHAMP_API_KEY`/`SENDCHAMP_SENDER_NAME`, wrapped in `resilience.execute('sendchampDelivery', ...)`. Preserved the original log-and-swallow behavior on failure (delivery OTP send failures don't block order creation — unchanged from the Termii version).
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit</automated>
  </verify>
  <done>No reference to Termii remains in delivery.service.ts; both call sites use sendDeliveryOtp.</done>
</task>

<task type="auto">
  <name>Task 4: Rewrite auth.service.spec.ts and delivery.service.spec.ts for Sendchamp</name>
  <files>backend/src/modules/auth/__tests__/auth.service.spec.ts, backend/src/modules/delivery/__tests__/delivery.service.spec.ts</files>
  <action>
    `mockConfig` in both files updated to supply `SENDCHAMP_API_KEY` instead of `TERMII_API_KEY`/`META_WHATSAPP_*`. Every test asserting a `termiiAuth`/`termiiDelivery`/`metaWhatsapp` vendor key or a `v3.api.termii.com`/`graph.facebook.com` fetch URL rewritten to assert `sendchampAuth`/`sendchampDelivery` and `api.sendchamp.com/api/v1/sms/send`. The WhatsApp-specific test (asserting Meta's template/button JSON shape) replaced with a test asserting WHATSAPP-channel sendOtp calls route through the same Sendchamp SMS path with `fallbackUsed: false`. Added one new test asserting the Sendchamp request body shape (`to`/`message`/`sender_name`/`route`, `route: 'dnd'` for a `+234` number). All other tests (lockout, attempts, EMAIL channel, resetPassword, phoneAuth) were unaffected by this migration and left as-is.
  </action>
  <verify>
    <automated>cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts src/modules/delivery/__tests__/delivery.service.spec.ts</automated>
  </verify>
  <done>Both spec files pass with zero references to Termii/Twilio/Meta remaining (grep-verified).</done>
</task>

<task type="auto">
  <name>Task 5: Update .env.example and CI workflow env vars</name>
  <files>.env.example, .github/workflows/ci.yml</files>
  <action>
    `.env.example`: removed `TERMII_API_KEY`/`TERMII_SENDER_ID` and the entire "Messaging — WhatsApp (Meta Business Cloud API...)" block (`META_WHATSAPP_*`, 4 vars); added a "Messaging — SMS/OTP (Sendchamp...)" block with `SENDCHAMP_API_KEY`/`SENDCHAMP_SENDER_NAME`. `.github/workflows/ci.yml`: `TERMII_API_KEY: stub` / `TERMII_SENDER_ID: stub` → `SENDCHAMP_API_KEY: stub` / `SENDCHAMP_SENDER_NAME: stub` (no TWILIO_*/META_WHATSAPP_* stubs existed in CI to begin with — those providers already degraded gracefully when unconfigured, same pattern preserved for Sendchamp).
  </action>
  <verify>
    <manual>Confirmed no TERMII/TWILIO/META_WHATSAPP references remain in either file via grep.</manual>
  </verify>
  <done>Both files reference only SENDCHAMP_API_KEY/SENDCHAMP_SENDER_NAME for SMS/OTP.</done>
</task>

<task type="auto">
  <name>Task 6: Remove the non-functional WhatsApp channel option from 3 mobile screens</name>
  <files>mobile/app/verify-phone.tsx, mobile/app/auth/phone.tsx, mobile/app/otp-channel-settings.tsx, mobile/app/auth/register.tsx</files>
  <action>
    `verify-phone.tsx` and `auth/phone.tsx`: removed the SMS/WhatsApp channel-picker UI, `Channel`/`OtpChannel` type, `CHANNEL_OPTIONS` array, `channel` state, and now-dead `channel*` styles — both screens now always send `channel: 'SMS'`. `otp-channel-settings.tsx` (the persistent default-channel-preference settings screen): removed the WHATSAPP entry from `CHANNEL_OPTIONS` and narrowed the `OtpChannel` type to `'SMS' | 'EMAIL'` — existing users with `WHATSAPP` already persisted as their preference are unaffected server-side (still resolves through the Sendchamp SMS path), they just can no longer newly select it. `register.tsx`: updated a stale explanatory comment referencing "Termii/Twilio" to reference the Sendchamp migration instead (no functional change — registration was already EMAIL-only per quick task 260727-mdp).
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>No mobile screen offers a WhatsApp option that doesn't actually deliver via WhatsApp; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 7: Documentation sweep</name>
  <files>CLAUDE.md, README.md, MANUAL-ACTIONS.md, docs/CONFIGURATION.md, .planning/codebase/STACK.md, .planning/codebase/ARCHITECTURE.md, .planning/codebase/INTEGRATIONS.md, .planning/codebase/CONVENTIONS.md</files>
  <action>
    Every `TERMII_*`/`META_WHATSAPP_*` env var reference and prose mention of Termii/Twilio/Meta WhatsApp across these 8 files replaced with the Sendchamp equivalent. MANUAL-ACTIONS.md's "Phase 15 — Meta WhatsApp Business Cloud API Setup" section marked `— RETIRED (260728)` with a note explaining the retirement and pointing at the env var table, but its original step-by-step instructions kept intact below as a historical record (mirrors how "Phase 16" in the same doc is marked COMPLETE rather than deleted after its underlying `.planning/phases/` directory was removed) — do not delete retired phases from this doc, mark and preserve them. `.planning/STATE.md` and the old `260720-qth` quick-task PLAN.md were deliberately left untouched (append-only historical record convention).
  </action>
  <verify>
    <manual>grep -rn "TERMII|META_WHATSAPP" across the repo (excluding node_modules) returns only MANUAL-ACTIONS.md's intentionally-preserved retired-phase text and .planning/STATE.md/old quick-task history.</manual>
  </verify>
  <done>All actionable documentation reflects Sendchamp; historical records are marked retired, not silently deleted or left stale without explanation.</done>
</task>

</tasks>

<success_criteria>
- No functional code path calls Termii, Twilio, or Meta's Graph API.
- `cd backend && npx tsc --noEmit` and the full Jest suite (916 tests) pass clean.
- `cd mobile && npx tsc --noEmit` passes clean.
- No mobile UI offers a channel that doesn't actually deliver via that channel.
- Documentation accurately describes Sendchamp as the SMS/OTP provider, with the retired Meta WhatsApp phase clearly marked (not silently deleted).
</success_criteria>

<output>
After completion, create `.planning/quick/260728-fms-replace-termii-twilio-meta-whatsapp-with/260728-fms-SUMMARY.md`
</output>
