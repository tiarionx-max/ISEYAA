---
phase: quick
plan: 260727-mdp
status: complete
subsystem: mobile
tags: [auth, registration, otp, email, urgent-fix]
---

# Summary: Email-first registration verification, deferred phone verification

User was actively blocked from registering on production — the earlier session-wide auth redesign (260727-dcp) made phone SMS/WhatsApp OTP mandatory before account creation, and production SMS delivery is broken (Termii timing out, Twilio trial-account restriction — a pre-existing, unrelated gap). User asked to verify email at registration instead, and defer phone verification to later from Profile.

## Root cause and design

Investigated first, found this needed zero backend changes: `POST /auth/otp/send` already accepted `channel: 'EMAIL'` + an `email` field; `consumeValidOtp(phone, otp)` (used by both `register()` and the pre-existing `POST /auth/otp/verify`) validates the stored code purely by phone-keyed Redis lookup — completely independent of which channel delivered it. The only gap was mobile: `register.tsx` always sent SMS/WhatsApp, and there was no screen anywhere to complete phone verification after the fact.

## Changes

1. **`mobile/app/auth/register.tsx`** — OTP send/resend now always use `channel: 'EMAIL'` with the collected email; removed the SMS/WhatsApp channel-picker UI entirely (registration no longer offers a choice); OTP-step copy now shows a masked email instead of masked phone. `POST /auth/register`'s body is otherwise unchanged.
2. **`mobile/app/verify-phone.tsx`** (new) — reachable from Profile, lets an already-logged-in user with an unverified phone (`status === 'PENDING'`) choose SMS or WhatsApp and complete verification via the existing `POST /auth/otp/verify` endpoint, which flips `status` to `ACTIVE`.
3. **`mobile/app/(tabs)/profile.tsx`** — added `status` to the `UserProfile` type (already returned by the backend, just untyped on mobile) and a conditional "Verify Phone Number" menu row, visible only while `status === 'PENDING'`.
4. **`mobile/app/_layout.tsx`** — registered the new route.

## Verification

`cd mobile && npx tsc --noEmit` — clean, no new errors.

Not yet tested end-to-end on a live device against real email delivery (production `RESEND_API_KEY` provisioning status wasn't independently confirmed — no "Resend not configured" error observed in recent production logs, which is a positive signal but not a full send-and-receive test). User should confirm on their own registration attempt.

## Deviations

Made directly during an active support situation (user blocked from entering their own app) rather than through the full plan → worktree-executor cycle — investigation was done first and thoroughly (confirmed OTP channel-agnosticism, confirmed the `status` field is already exposed, confirmed the exact pre-existing verify-endpoint behavior) before any edit, to keep the fix correct despite the compressed process.
