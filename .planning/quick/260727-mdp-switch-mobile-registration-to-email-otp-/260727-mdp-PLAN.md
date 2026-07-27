---
phase: quick
plan: 260727-mdp
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/auth/register.tsx
  - mobile/app/verify-phone.tsx
  - mobile/app/_layout.tsx
  - mobile/app/(tabs)/profile.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Registration sends its verification OTP via EMAIL, not phone SMS/WhatsApp, so signup is not blocked by production SMS delivery being broken"
    - "The account is still created with the user's real phone number, just not phone-verified at signup time — phone verification is deferred, not removed"
    - "A user can verify their phone number later from Profile, once already logged in, without re-registering"
    - "No backend changes were needed — the existing OTP infrastructure (POST /auth/otp/send, POST /auth/otp/verify, consumeValidOtp) is channel-agnostic; it already fully supported EMAIL as a delivery channel, the mobile register flow just wasn't using it"
  artifacts:
    - path: "mobile/app/auth/register.tsx"
      provides: "OTP-send calls use channel: 'EMAIL' with the collected email; channel picker UI removed; OTP-step copy references the masked email instead of the masked phone"
      contains: "channel: 'EMAIL'"
    - path: "mobile/app/verify-phone.tsx"
      provides: "New profile-reachable screen: SMS/WhatsApp channel picker, OTP send + verify against POST /auth/otp/verify, already-verified state, invalidates ['me'] on success"
      min_lines: 150
  key_links:
    - from: "mobile/app/auth/register.tsx"
      to: "backend POST /auth/otp/send"
      via: "api.post('/auth/otp/send', { phone, channel: 'EMAIL', email })"
      pattern: "channel: 'EMAIL'"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "mobile/app/verify-phone.tsx"
      via: "conditional menuRows entry, gated on user?.status === 'PENDING'"
      pattern: "verify-phone"
    - from: "mobile/app/verify-phone.tsx"
      to: "backend POST /auth/otp/verify"
      via: "api.post('/auth/otp/verify', { phone, otp: code }) — existing endpoint, flips status PENDING→ACTIVE"
      pattern: "auth/otp/verify"
---

<objective>
User was actively blocked from creating an account on the production app: registration required phone OTP verification via SMS/WhatsApp (added earlier this session, quick task 260727-dcp), and production SMS delivery is broken (Termii timing out, Twilio trial-account restriction on unverified numbers — a pre-existing, separate gap). User asked to verify email at registration instead, deferring phone verification to an optional later step from Profile.

Root-cause investigation confirmed this needs NO backend changes: `POST /auth/otp/send` already accepts `channel: 'EMAIL'` + an `email` field and will deliver the code by email instead of SMS; `consumeValidOtp(phone, otp)` (used by both `register()` and the existing `POST /auth/otp/verify` endpoint) validates the stored code purely by phone-keyed Redis lookup, completely independent of which channel originally delivered it. The gap was mobile-only: `register.tsx` always sent `channel: 'SMS'|'WHATSAPP'` (user-selected), and no UI existed anywhere to complete phone verification after the fact.

Purpose: Unblock registration in production immediately, without waiting on the pre-existing SMS-provider fix, while preserving phone verification as a real (deferred, optional) step rather than dropping it entirely.
Output: `register.tsx` now emails the OTP; a new `verify-phone.tsx` screen (reachable from Profile only while `status === 'PENDING'`) lets a logged-in user complete phone verification via the pre-existing `POST /auth/otp/verify` endpoint whenever SMS/WhatsApp works for them.
</objective>

<context>
Made directly during an active support/urgency situation (not through the full plan → worktree-executor cycle) — user was blocked from entering the app. Full investigation was done first (confirmed OTP channel-agnosticism, confirmed `USER_SELECT` exposes `status` to the mobile client, confirmed `POST /auth/otp/verify`'s exact existing behavior) before any edit.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Registration verifies via email instead of phone</name>
  <files>mobile/app/auth/register.tsx</files>
  <action>
    Removed the `OtpChannel` type, `CHANNEL_OPTIONS` array, `channel` state, and the channel-picker JSX block (previously offering SMS/WhatsApp choice) — registration now always verifies via email, no user choice needed. Both `POST /auth/otp/send` call sites (initial send in `handleSendOtp`, resend in `handleResendOtp`) now send `{ phone: formattedPhone, channel: 'EMAIL', email }` instead of `{ phone: formattedPhone, channel }`. The OTP step's subtitle now shows a masked email (`ab***@domain.com`) instead of a masked phone number. Removed now-dead `channelLabel`/`channelRow`/`channelCard`/`channelCardSelected`/`channelCardLabel`/`channelCardLabelSelected` styles and the now-unused `MessageSquare`/`MessageCircle`/`GOLD_DIM` imports. `POST /auth/register`'s body is unchanged — still sends `otp: code` alongside the other fields, still validated the same channel-agnostic way server-side.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>register.tsx sends its OTP via email only, no channel picker remains, tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Deferred phone verification screen, reachable from Profile</name>
  <files>mobile/app/verify-phone.tsx, mobile/app/_layout.tsx, mobile/app/(tabs)/profile.tsx</files>
  <action>
    Created `mobile/app/verify-phone.tsx`: fetches `GET /users/me` for the current `phone`/`status`. If `status !== 'PENDING'`, shows an "Already verified" state. Otherwise: an intro step with an SMS/WhatsApp channel picker (mirrors `mobile/app/auth/phone.tsx`'s CHANNEL_OPTIONS pattern) and a "Send code" button calling `POST /auth/otp/send({ phone, channel })`; then a 6-digit OTP step (mirrors the boxed-digit pattern from `mobile/app/auth/otp.tsx`) that calls `POST /auth/otp/verify({ phone, otp: code })` on completion — this is the pre-existing endpoint that flips the account's `status` from `PENDING` to `ACTIVE`. On success, invalidates the `['me']` query and shows a confirmation before navigating back.

    Registered the route in `mobile/app/_layout.tsx` (`<Stack.Screen name="verify-phone" options={{ headerShown: false, presentation: 'card' }} />`, alongside the existing `otp-channel-settings` entry).

    Added a `status?: string` field to `mobile/app/(tabs)/profile.tsx`'s `UserProfile` interface (already returned by the backend's `USER_SELECT` projection, just not previously typed on the mobile side), and a new conditional `menuRows` entry — `{ icon: PhoneCall, label: 'Verify Phone Number', sub: '...', onPress: () => router.push('/verify-phone') }` — spread in only `...(user?.status === 'PENDING' ? [...] : [])`, placed after the existing "Security & ID" row. The entry disappears automatically once the user completes verification and their `status` flips to `ACTIVE` (via the existing `['me']` query invalidation this screen already triggers).
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>verify-phone.tsx exists, reachable from Profile only while status is PENDING, completes verification via the existing POST /auth/otp/verify endpoint, tsc clean.</done>
</task>

</tasks>

<success_criteria>
- A brand-new user can complete registration end-to-end using only email OTP delivery — no dependency on production SMS working.
- The created account still has a real, collected phone number; it is simply unverified (status PENDING) until the user chooses to verify it.
- A logged-in user with status PENDING can complete phone verification from Profile whenever SMS/WhatsApp delivery is available to them, using the existing, unmodified backend endpoint.
- No backend files were touched — this was purely a mobile-side gap.
- `cd mobile && npx tsc --noEmit` passes clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-mdp-switch-mobile-registration-to-email-otp-/260727-mdp-SUMMARY.md`
</output>
