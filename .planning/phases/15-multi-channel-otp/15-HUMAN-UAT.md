---
status: partial
phase: 15-multi-channel-otp
source: [15-VERIFICATION.md]
started: 2026-07-18T16:24:57Z
updated: 2026-07-18T16:24:57Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live WhatsApp OTP delivery via an approved Meta WABA template
expected: A WhatsApp message containing the OTP code, styled per the Authentication-category template, arrives within seconds once the `iseyaa_otp_verification` template is APPROVED in Meta Business Manager and `META_WHATSAPP_ACCESS_TOKEN`/`META_WHATSAPP_PHONE_NUMBER_ID`/`META_WHATSAPP_TEMPLATE_NAME` are set in the live environment; no fallback to SMS occurs.
result: [pending]

### 2. On-device visual/UX check of the three new mobile screens/components
expected: Cards in `phone.tsx`'s 3-card picker render with the specified gold-selected styling and correct spacing; `otp.tsx`'s Fallback Notice Banner appears with D-10's exact locked copy after a forced non-SMS failure and is accessible to screen readers; `otp-channel-settings.tsx` updates immediately on selection and reverts visibly on a forced failure.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
