---
phase: quick
plan: 260728-fms
status: complete
subsystem: backend, mobile, docs
tags: [sms-provider-migration, otp, sendchamp, termii, twilio, meta-whatsapp]
---

# Summary: Termii, Twilio, and Meta WhatsApp replaced with Sendchamp for SMS/OTP delivery

User instructed: "let us not use termii, twillo and sendgrid and meta whatsapp they have blocked all lets use another api" (clarified: Resend/email stays, only SMS/WhatsApp providers needed replacing), then: "remove termii, twillio and meta". All three had rejected/blocked account applications, leaving live OTP delivery broken. Researched alternatives (Africa's Talking, Sendchamp, Vonage Verify/Plivo); user selected **Sendchamp** — Nigerian, self-serve signup (email verification only), one API for SMS/WhatsApp/Voice OTP.

## Change

- **auth.service.ts**: `sendTermii`/`sendTwilio`/`sendMetaWhatsapp` deleted; new `sendSendchampSms` posts to `https://api.sendchamp.com/api/v1/sms/send` (Bearer `SENDCHAMP_API_KEY`, `{to, message, sender_name, route}`, `route: 'dnd'` for +234 numbers). SMS and WHATSAPP channels both route through it — Sendchamp's own WhatsApp channel needs a separately-approved template not yet set up, so WhatsApp requests deliver via SMS instead of failing.
- **delivery.service.ts**: `sendTermiiDeliveryOtp` → `sendDeliveryOtp`, same Sendchamp endpoint.
- **resilience.types.ts**: `termiiAuth`→`sendchampAuth`, `termiiDelivery`→`sendchampDelivery`, `metaWhatsapp` removed.
- **Mobile**: removed the WhatsApp option from 3 screens (`verify-phone.tsx`, `auth/phone.tsx`, `otp-channel-settings.tsx`) — offering a channel that silently degrades to SMS would be misleading.
- **Docs**: CLAUDE.md, README.md, MANUAL-ACTIONS.md, docs/CONFIGURATION.md, and 4 `.planning/codebase/*.md` files updated. MANUAL-ACTIONS.md's Meta WhatsApp setup phase marked `RETIRED (260728)`, original instructions kept as historical record.
- **.env.example / CI**: `SENDCHAMP_API_KEY` / `SENDCHAMP_SENDER_NAME` replace all Termii/Twilio/Meta vars.

## Verification

`cd backend && npx tsc --noEmit` — clean. Full backend Jest suite — **916/916 passing**. `cd mobile && npx tsc --noEmit` — clean. Sendchamp's exact API shape (endpoint, auth header, body fields) was confirmed via WebFetch against Sendchamp's own docs before implementation.

No `SENDCHAMP_API_KEY` is provisioned yet — backend runs in the existing stub-mode pattern (OTP logged to console) until the user signs up and supplies the key.

## Deviations

Made directly (not the full plan → worktree-executor cycle), consistent with this session's pattern for user-directed infra changes. Documentation updates went beyond the minimum functional scope (8 files) to keep CLAUDE.md and the `.planning/codebase/` snapshot docs from silently drifting out of sync — this was judged worth the extra surface area given how heavily this session leans on those docs for context.
