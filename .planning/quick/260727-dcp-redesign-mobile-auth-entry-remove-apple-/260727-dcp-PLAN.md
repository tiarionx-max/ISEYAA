---
phase: quick
plan: 260727-dcp
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/modules/auth/dto/register.dto.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - mobile/app/onboarding.tsx
  - mobile/app/auth/phone.tsx
  - mobile/app/auth/register.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user landing on onboarding.tsx sees email as the primary/first sign-in path, with phone as a clearly secondary alternate link — no Apple or Google buttons appear anywhere on the screen"
    - "A user registering via email+password cannot create an account without first proving possession of their phone number via a 6-digit SMS or WhatsApp OTP code"
    - "The phone-first OTP flow (phone.tsx) only ever offers SMS or WhatsApp as delivery channels — Email is no longer a selectable option"
    - "POST /auth/register rejects any request missing a valid, unconsumed 6-digit otp matching the one most recently sent to that phone"
    - "The raw password never leaves mobile/app/auth/register.tsx's local component state (never passed through expo-router navigation params)"
  artifacts:
    - path: "backend/src/modules/auth/dto/register.dto.ts"
      provides: "Required otp: string field (6-digit, @IsString @Length(6,6)) mirroring reset-password.dto.ts's pattern"
      contains: "Length(6, 6)"
    - path: "backend/src/modules/auth/auth.service.ts"
      provides: "register() calls this.consumeValidOtp(dto.phone, dto.otp) after the duplicate-user check, before user creation"
      contains: "consumeValidOtp(dto.phone, dto.otp)"
    - path: "mobile/app/onboarding.tsx"
      provides: "Primary CTA routes to /auth/email; secondary link routes to /auth/phone; no AppleIcon/GoogleColorIcon components or social row remain"
      contains: "Continue with email"
    - path: "mobile/app/auth/phone.tsx"
      provides: "CHANNEL_OPTIONS limited to SMS and WHATSAPP only, no email TextInput or email state"
      contains: "WHATSAPP"
    - path: "mobile/app/auth/register.tsx"
      provides: "Two-step form->otp flow; form step sends OTP via /auth/otp/send, otp step verifies + calls /auth/register with the otp field"
      contains: "otp/send"
  key_links:
    - from: "mobile/app/auth/register.tsx"
      to: "backend POST /auth/otp/send"
      via: "handleSendOtp() posts { phone: formattedPhone, channel } when the form step is submitted"
      pattern: "otp/send"
    - from: "mobile/app/auth/register.tsx"
      to: "backend POST /auth/register"
      via: "handleVerifyAndRegister() posts { email, phone, password, firstName, lastName, ndpaConsent, otp: code }"
      pattern: "otp:\\s*code"
    - from: "backend/src/modules/auth/auth.service.ts register()"
      to: "backend/src/modules/auth/auth.service.ts consumeValidOtp()"
      via: "Direct method call on the same class — no duplicated OTP-consumption logic"
      pattern: "await this\\.consumeValidOtp"
---

<objective>
Redesign the mobile auth entry point per explicit user direction: remove the non-functional Apple/Google "coming soon" sign-in stubs from onboarding.tsx entirely, make email the default/primary sign-in and sign-up path (phone becomes secondary, not removed), and close the real security gap the user pointed at — email/password registration today creates an account with zero phone verification. Add a mandatory SMS/WhatsApp OTP-verification step between the registration form and account creation.

Purpose: Eliminate dead-end "coming soon" UI, establish a single consistent identity-verification bar (every account, whether created via phone-first or email-first, now proves phone possession before activation), and put email forward as the primary flow per user request.
Output: Backend `RegisterDto` + `AuthService.register()` require and consume a phone OTP before creating a user. Mobile `onboarding.tsx` leads with email, drops Apple/Google. Mobile `phone.tsx` drops the Email OTP-channel option (SMS/WhatsApp only). Mobile `register.tsx` gains a two-step form→OTP flow with no new route file.

This plan has 3 independent tasks with zero `files_modified` overlap between any pair — Task 1 (backend) and Tasks 2-3 (mobile) can execute in any order or in parallel.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session (do not re-investigate; act on these facts):

**Backend — `backend/src/modules/auth/dto/reset-password.dto.ts`** (full file, 15 lines) — the exact pattern to copy for the new `otp` field:
```ts
@IsString()
@Length(6, 6)
otp: string;
```
`Length` must be added to `register.dto.ts`'s existing `class-validator` import line (currently: `IsEmail, IsString, MinLength, IsOptional, IsMobilePhone, IsEnum, IsBoolean`).

**Backend — `backend/src/modules/auth/dto/register.dto.ts`** (full file, 32 lines) — current field order: `email, phone, password, firstName, lastName, role?, channel?, ndpaConsent`. The existing `channel?: OtpChannel` field (line 26-28) is optional and currently unused/dead in `AuthService.register()` — leave it completely untouched, do not remove or wire it. Insert the new required `otp` field immediately after `phone` (mirrors `reset-password.dto.ts`'s `phone` → `otp` ordering).

**Backend — `backend/src/modules/auth/auth.service.ts`**:
- `register(dto, ip, ua)` starts at line 62. Current order: ndpaConsent check (63-65) → role check (68-70) → duplicate email/phone check via `findFirst` + `ConflictException` (72-75) → `bcrypt.hash` (78) → `prisma.user.create` (80-94) → audit (96) → `generateTokens` (97).
- `private async consumeValidOtp(phone: string, otp: string): Promise<void>` at line 252-276 is the exact reusable helper (already extracted from `verifyOtp`, already used by `verifyOtp` line 279 and `resetPassword` line 298). Confirmed exception types: throws `ForbiddenException` when `otp_lock:{phone}` exists (line 256) or when this attempt trips the lock (line 267); throws `BadRequestException` when no OTP is stored at `otp:{phone}` (line 260) or when the submitted code doesn't match (line 272). Deletes the Redis key on success (line 275).
- REQUIRED CHANGE: insert `await this.consumeValidOtp(dto.phone, dto.otp);` immediately after the duplicate-check block (after line 75, before line 77's `const role = ...`) — this order means a duplicate email/phone attempt fails fast without burning/consuming a valid OTP.
- `AuthController.register()` (`backend/src/modules/auth/auth.controller.ts` line 28-32) needs NO changes — it already just forwards the DTO through the global `ValidationPipe`; the new required `otp` field is enforced automatically.

**Backend — `backend/src/modules/auth/__tests__/auth.service.spec.ts`**: `describe('register', ...)` block at line 95-138. Shared `dto` object (lines 96-103) currently has no `otp` field — needs one added so all three existing sub-tests keep constructing a structurally-valid DTO. The "creates user and returns tokens" test (lines 114-137) is the only one that reaches `consumeValidOtp` (the ndpaConsent-false test at 105-107 and the ConflictException test at 109-112 both throw before reaching it) — it needs Redis mocks added. Exact stored-OTP wire format (from `encodeOtpValue`/`decodeOtpValue`, lines 163-175): `` `${otp}:${attempts}:${channel}:${email ?? ''}` ``. The existing `resetPassword`/`verifyOtp` tests (lines 327-421) already demonstrate the exact mock shape to copy: `mockRedis.exists.mockResolvedValue(false)`, `mockRedis.get.mockResolvedValue('654321:0:SMS:')`, `mockRedis.del.mockResolvedValue(undefined)`. Full suite is currently 912 tests (per STATE.md quick task 260727-c41 entry) — expect ~914 after this plan's Task 1 (one new register test added).

**Mobile — `mobile/app/onboarding.tsx`** (full file, 412 lines): `AppleIcon` (73-89) and `GoogleColorIcon` (91-101) function components; `handleApplePress`/`handleGooglePress` (130-136) both just `Alert.alert(...'coming soon')`; the "Social buttons row" `<View style={styles.socialRow}>` block (200-231) renders both. Current primary CTA (189-198, `primaryCta`/`primaryCtaText` styles) calls `handlePhonePress` → `/auth/phone`. Current secondary link (234-242, `emailLink`/`emailLinkText` styles) calls `handleEmailPress` → `/auth/email`, labeled "Sign in with email instead". Separate "New to Iṣẹ́yáá? Create an account" link (245-253) calls `handleRegisterPress` → `/auth/register` — leave this one fully unchanged. Styles `socialRow`/`socialBtn`/`socialBtnText` (366-388) become dead once the JSX block is removed — delete them too.

**Mobile — `mobile/app/auth/phone.tsx`** (full file, 336 lines): `type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL'` (line 31). `CHANNEL_OPTIONS` array (33-37) has 3 entries including `{ value: 'EMAIL', label: 'Email', Icon: Mail }` — `Mail` is imported from `lucide-react-native` (line 17) alongside `MessageSquare`/`MessageCircle`, used only for this entry. `email` state (line 58) and the conditional block `{channel === 'EMAIL' && (<View style={styles.inputWrapper}>...<TextInput .../></View>)}` (169-181) exist solely to collect the email for the EMAIL channel. `handleContinue` (69-93) spreads `...(channel === 'EMAIL' ? { email } : {})` into the `POST /auth/otp/send` body (line 79). `isReady` (95-97) includes `(channel !== 'EMAIL' || /\S+@\S+\.\S+/.test(email))`.

**Mobile — `mobile/app/auth/register.tsx`** (full file, 397 lines): Currently single-step. `isReady` (68-74) already validates `firstName`, `lastName`, `email` regex, `formattedPhone.length >= 13`, `password.length >= 8`, `consent`. `handleRegister` (76-104) currently calls `POST /auth/register` directly with `{ email, phone: formattedPhone, password, firstName, lastName, ndpaConsent: consent }`, and on success does `SecureStore.setItemAsync('access_token', ...)` + `SecureStore.setItemAsync('refresh_token', ...)` + `registerForPushNotifications()` + `router.replace('/(tabs)')` — this exact success-path sequence MUST be preserved, just triggered from the new OTP-verification step instead of directly from the form submit.

**Mobile — `mobile/app/auth/otp.tsx`** (full file, 375 lines) — reference-only, do not modify. Exact patterns to mirror for the new in-register OTP step: `OTP_LENGTH = 6` (line 37); boxed digit UI via `otpRow`/`otpBox`/`otpBoxFocused`/`otpBoxFilled`/`otpDigit` styles (319-349) rendered by mapping `code.padEnd(OTP_LENGTH, ' ').split('')`; a visually-hidden `TextInput` (`hiddenInput` style, 350-356) that actually captures keyboard input via `ref`, with the boxes as a `TouchableOpacity` wrapper that calls `inputRef.current?.focus()`; `handleChange` strips non-digits and auto-submits at `OTP_LENGTH`; resend-with-cooldown via a `cooldown` state ticked down by a `setInterval` in a `useEffect` (51-55), rendering either `"Resend in {cooldown}s"` or a tappable `"Resend code"` link (206-215). `maskedPhone` pattern (100-102): `` `${phone.slice(0, 6)}•••${phone.slice(-3)}` ``.

**Mobile — `mobile/app/_layout.tsx`**: NOT modified by this plan — the OTP step lives inside `register.tsx`'s existing component (two internal steps via local `step` state), not a new route file, so no `Stack.Screen` registration is needed. This deliberately avoids `_layout.tsx`, a known merge-conflict hotspot with concurrent sibling quick tasks this session (per STATE.md), and avoids ever needing to pass the raw password through `expo-router` navigation params between screens.
</verified_facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — require and consume a phone OTP in email/password registration</name>
  <files>backend/src/modules/auth/dto/register.dto.ts, backend/src/modules/auth/auth.service.ts, backend/src/modules/auth/__tests__/auth.service.spec.ts</files>
  <behavior>
    - Test 1 (existing, updated): `register()` with a valid, matching stored OTP creates the user and returns tokens (mirrors current "creates user and returns tokens" test, now with Redis OTP mocks added).
    - Test 2 (new): `register()` throws `BadRequestException` when no OTP is stored for the phone (mirrors the equivalent `resetPassword`/`verifyOtp` no-OTP-stored tests).
    - Existing tests unaffected: ndpaConsent-false and duplicate-email/phone tests both throw before `consumeValidOtp` is ever reached — no OTP mocking needed for those two.
  </behavior>
  <action>
    In `register.dto.ts`: add `Length` to the existing `class-validator` import line. Insert a new required field immediately after `phone`:
    `@IsString() @Length(6, 6) otp: string;` — copy `reset-password.dto.ts`'s exact decorator style. Leave the existing optional `channel` field completely untouched (stays unused, harmless, unchanged).

    In `auth.service.ts`'s `register()` method: insert `await this.consumeValidOtp(dto.phone, dto.otp);` immediately after the duplicate-user `ConflictException` check and before `const role = dto.role ?? UserRole.CITIZEN;`. This reuses the existing private `consumeValidOtp` helper verbatim — no new Redis calls, no duplicated lockout/attempt logic.

    In `auth.service.spec.ts`: add `otp: '123456'` to the shared `dto` object in `describe('register', ...)`. In the "creates user and returns tokens" test, add `mockRedis.exists.mockResolvedValue(false); mockRedis.get.mockResolvedValue('123456:0:SMS:'); mockRedis.del.mockResolvedValue(undefined);` before calling `service.register(dto)`. Add a new test after it: `it('throws BadRequestException when otp is invalid or expired', async () => { mockRedis.exists.mockResolvedValue(false); mockRedis.get.mockResolvedValue(null); await expect(service.register(dto)).rejects.toThrow(BadRequestException); });`.
  </action>
  <verify>
    <automated>cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts && npx jest</automated>
  </verify>
  <done>RegisterDto requires a 6-digit otp field. register() calls consumeValidOtp(dto.phone, dto.otp) after the duplicate check and before user creation. Updated and new register() tests pass. Full backend suite (912+ tests, no regressions) passes.</done>
</task>

<task type="auto">
  <name>Task 2: Mobile — onboarding CTA swap to email-first, remove Apple/Google stubs, drop Email OTP channel from phone.tsx</name>
  <files>mobile/app/onboarding.tsx, mobile/app/auth/phone.tsx</files>
  <action>
    In `onboarding.tsx`: delete the `AppleIcon` and `GoogleColorIcon` function components entirely, delete `handleApplePress` and `handleGooglePress`, delete the entire "Social buttons row" `<View style={styles.socialRow}>...</View>` JSX block, and delete the now-unused `socialRow`, `socialBtn`, `socialBtnText` entries from the `StyleSheet.create` call. Change the `primaryCta` TouchableOpacity: `onPress={handleEmailPress}`, `accessibilityLabel="Continue with email"`, button text "Continue with email". Change what is currently the "Sign in with email instead" `emailLink` TouchableOpacity into the phone alternate: `onPress={handlePhonePress}`, `accessibilityLabel="Continue with phone number instead"`, text "Continue with phone number instead". Keep `handlePhonePress`/`handleEmailPress`/`handleRegisterPress` function bodies unchanged (only reassign which JSX element invokes which), and leave the "New to Iṣẹ́yáá? Create an account" link untouched.

    In `phone.tsx`: change `type OtpChannel = 'SMS' | 'WHATSAPP' | 'EMAIL'` to `type OtpChannel = 'SMS' | 'WHATSAPP'`. Remove the `{ value: 'EMAIL', label: 'Email', Icon: Mail }` entry from `CHANNEL_OPTIONS`, and remove the now-unused `Mail` import from the `lucide-react-native` import line (keep `MessageSquare`, `MessageCircle`). Remove the `email` state declaration and the conditional `{channel === 'EMAIL' && (...)}` TextInput block entirely. In `handleContinue`, remove the `...(channel === 'EMAIL' ? { email } : {})` spread from the `api.post('/auth/otp/send', ...)` call body — send only `{ phone: formattedPhone, channel }`. Simplify `isReady` to `phone.replace(/\s/g, '').length >= 10` (drop the email-conditional clause).
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>onboarding.tsx has no Apple/Google icons, handlers, or social row/styles remaining; primary CTA routes to /auth/email with "Continue with email" copy; secondary link routes to /auth/phone with "Continue with phone number instead" copy. phone.tsx CHANNEL_OPTIONS has exactly 2 entries (SMS, WhatsApp); no email state, input, or channel branch remains. tsc --noEmit passes clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Mobile — mandatory phone-OTP verification step in register.tsx</name>
  <files>mobile/app/auth/register.tsx</files>
  <behavior>
    - Manual/type-check verification only (no test runner in this workspace for screen components) — behavior confirmed via `tsc --noEmit` plus the acceptance criteria in <done>.
    - Form step: submitting valid fields (unchanged `isReady` validation) triggers `POST /auth/otp/send` with `{ phone: formattedPhone, channel }`, NOT `POST /auth/register`.
    - OTP step: entering the correct 6-digit code triggers `POST /auth/register` with the original fields plus `otp: code`; on success, tokens are stored and the user is routed to `/(tabs)` exactly as today.
    - Password never crosses an `expo-router` navigation boundary — both steps are rendered by this same component from local state.
  </behavior>
  <action>
    Convert `RegisterScreen` into a two-step flow entirely within this file (no new route file, no `_layout.tsx` change):

    Add state: `step: 'form' | 'otp'` (default `'form'`), `channel: 'SMS' | 'WHATSAPP'` (default `'SMS'`), `otpCode: string`, `sendingOtp: boolean`, `verifying: boolean`, `cooldown: number` (default 0). Import `useEffect`, `useRef` from `react`; import `MessageSquare`, `MessageCircle` from `lucide-react-native` for the channel chips.

    Add a channel-picker chip row (mirror `mobile/app/auth/phone.tsx`'s `CHANNEL_OPTIONS`/`channelRow`/`channelCard`/`channelCardSelected` pattern, but hardcode just two options: SMS and WhatsApp, no Email) rendered in the form step above the submit CTA.

    Rename `handleRegister` to `handleSendOtp`: guarded by the existing `isReady` check; calls `POST /auth/otp/send` with `{ phone: formattedPhone, channel }` (reuse the existing `api`/`getErrorMessage` imports); on success sets `step = 'otp'` and `cooldown = 60`; on failure shows `Alert.alert('Registration failed', getErrorMessage(err, ...))` exactly like today's catch block. Set/clear `sendingOtp` around the call.

    Add `handleVerifyAndRegister(code: string)`: when `code.length === 6` and not already `verifying`, call `POST /auth/register` with `{ email, phone: formattedPhone, password, firstName, lastName, ndpaConsent: consent, otp: code }`. On success, run the EXACT existing success sequence from the current `handleRegister` (SecureStore access_token + refresh_token, `registerForPushNotifications()`, `router.replace('/(tabs)')`). On failure, `Alert.alert('Wrong code', getErrorMessage(err, 'Incorrect or expired code.'))` and clear `otpCode`. Set/clear `verifying` around the call.

    Add `handleResendOtp()`: re-calls `/auth/otp/send` with `{ phone: formattedPhone, channel }`, resets `cooldown` to 60 on success, shows an Alert on failure. Add a `useEffect` cooldown countdown (mirror `mobile/app/auth/otp.tsx` lines 51-55: `setInterval` decrementing `cooldown` every second while `cooldown > 0`, cleared on unmount).

    JSX: when `step === 'form'`, keep all existing fields/consent checkbox unchanged, insert the channel-picker row before the CTA, change the CTA's `onPress` to `handleSendOtp`, loading state to `sendingOtp`, label "Send verification code →". When `step === 'otp'`, render (mirroring `otp.tsx`'s structure): a masked-phone subtitle using the same `` `${formattedPhone.slice(0, 6)}•••${formattedPhone.slice(-3)}` `` pattern, a 6-box digit row (`otpRow`/`otpBox`/`otpBoxFocused`/`otpBoxFilled`/`otpDigit` styles, `OTP_LENGTH = 6` constant) backed by a visually-hidden `TextInput` capturing keyboard input via `ref`, auto-calling `handleVerifyAndRegister` at 6 digits, a resend link/cooldown row calling `handleResendOtp`, and a "← Edit details" link that calls `setStep('form')` (does NOT call `router.back()` — that would leave the registration screen entirely). Append the new styles (`channelRow`, `channelCard`, `channelCardSelected`, `channelCardLabel`, `channelCardLabelSelected`, `otpRow`, `otpBox`, `otpBoxFocused`, `otpBoxFilled`, `otpDigit`, `hiddenInput`, `resendRow`, `resendCooldown`, `resendLink`) to the existing `StyleSheet.create` call, copied from `phone.tsx`/`otp.tsx`'s equivalents.

    Do not pass `password` or any other form field through `expo-router` — both steps read/write this same component's local state.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>register.tsx has a two-step form→otp flow in a single component. Submitting the form calls POST /auth/otp/send (SMS or WhatsApp, user-selected) instead of /auth/register. Entering a correct 6-digit code calls POST /auth/register with the otp field and completes registration exactly as before (tokens stored, push registered, navigated to /(tabs)). No new route file or _layout.tsx change. tsc --noEmit passes clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile client → `POST /auth/register` | Untrusted client now must additionally prove phone possession via a server-issued OTP before an account is created |
| Mobile client → `POST /auth/otp/send` | Untrusted client requests OTP dispatch to an arbitrary phone number (pre-existing endpoint, unchanged in this plan) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Spoofing | `POST /auth/register` | mitigate | `register()` now requires a valid, unconsumed 6-digit `otp` consumed via the existing `consumeValidOtp()` helper — an attacker cannot create an account against a phone number they do not control, since the code is only delivered via SMS/WhatsApp to that number |
| T-quick-02 | Denial of Service (brute-force OTP guessing) | `POST /auth/register` otp field | accept | Reuses the exact same `OTP_MAX_ATTEMPTS`/`OTP_LOCK_TTL` lockout already enforced by `consumeValidOtp()` for `verifyOtp`/`resetPassword`/`phoneAuth` — no new lockout logic needed, same risk posture already accepted for those flows |
| T-quick-03 | Information Disclosure | `mobile/app/auth/register.tsx` | mitigate | Raw password is kept exclusively in this component's local React state across both the form and OTP steps — never serialized into `expo-router` navigation params, deep links, or persisted storage |
| T-quick-04 | (n/a — dead field) | `backend/src/modules/auth/dto/register.dto.ts` `channel` field | accept | Left untouched, remains optional and unused by `AuthService.register()` exactly as before this plan — no new attack surface introduced |

</threat_model>

<verification>
1. `cd backend && npx jest src/modules/auth/__tests__/auth.service.spec.ts` — register() describe block passes, including the new otp-gate tests.
2. `cd backend && npx jest` — full suite passes with no regressions (912+ tests).
3. `cd mobile && npx tsc --noEmit` — no new type errors across onboarding.tsx, phone.tsx, register.tsx.
4. Manual read-through: onboarding.tsx contains no `AppleIcon`, `GoogleColorIcon`, `handleApplePress`, `handleGooglePress`, or `socialRow` references.
5. Manual read-through: phone.tsx's `CHANNEL_OPTIONS` array has exactly 2 entries (SMS, WhatsApp), no `Mail` import, no `email` state.
6. Manual read-through: register.tsx never interpolates `password` into any `router.push`/`router.replace` params object.
</verification>

<success_criteria>
- Backend: `RegisterDto` requires a 6-digit `otp`; `AuthService.register()` rejects registration without a valid, matching OTP for the given phone; full backend test suite passes.
- Mobile: onboarding.tsx has no Apple/Google sign-in UI; email is the primary CTA, phone the secondary link.
- Mobile: phone.tsx offers only SMS/WhatsApp OTP channels (Email removed).
- Mobile: register.tsx requires a verified phone OTP before completing account creation, using a two-step in-component flow with no password ever passed via navigation params.
- `cd backend && npx jest` and `cd mobile && npx tsc --noEmit` both pass clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-dcp-redesign-mobile-auth-entry-remove-apple-/260727-dcp-SUMMARY.md`
</output>
