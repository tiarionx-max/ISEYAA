---
phase: 15-multi-channel-otp
reviewed: 2026-07-18T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .env.example
  - MANUAL-ACTIONS.md
  - backend/prisma/migrations/20260718153450_phase15_multi_channel_otp/migration.sql
  - backend/prisma/schema.prisma
  - backend/src/common/enums/otp-channel.enum.ts
  - backend/src/common/services/__tests__/sendgrid.service.spec.ts
  - backend/src/common/services/sendgrid.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/dto/otp-send.dto.ts
  - backend/src/modules/auth/dto/phone-auth.dto.ts
  - backend/src/modules/auth/dto/register.dto.ts
  - backend/src/modules/users/__tests__/users.service.spec.ts
  - backend/src/modules/users/dto/change-otp-channel.dto.ts
  - backend/src/modules/users/users.controller.ts
  - backend/src/modules/users/users.service.ts
  - backend/src/resilience/__tests__/resilience.service.spec.ts
  - backend/src/resilience/resilience.types.ts
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/_layout.tsx
  - mobile/app/auth/otp.tsx
  - mobile/app/auth/phone.tsx
  - mobile/app/otp-channel-settings.tsx
findings:
  critical: 1
  warning: 6
  info: 2
  total: 9
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Phase 15 adds a multi-channel OTP system (SMS / WhatsApp / Email) with per-user channel preference, a direct Meta WhatsApp Business Cloud API integration, a SendGrid OTP-email path, and a mobile settings surface. The core dispatch/fallback logic in `AuthService` (`sendOtp` → `dispatchOtp` → SMS fallback) is well tested and the redis-encoding backward-compatibility with the pre-phase-15 2-field OTP format is handled correctly.

Several gaps were found, ranging from a pre-existing but severe mass-assignment vulnerability discovered in a file under review, to functional gaps that silently degrade the new multi-channel feature (channel preference dropped on classic registration, channel lost on mobile OTP resend, no validation that an "EMAIL" channel selection actually has a real address behind it) and a documentation/implementation mismatch on the WhatsApp template button type.

None of the phase-15-introduced issues are crash-inducing or directly exploitable by a third party — they degrade gracefully to SMS or to defaults — but several defeat the stated purpose of the phase (letting a user reliably choose their delivery channel) without any visible error to the user.

## Critical Issues

### CR-01: `PATCH /users/me` has no request validation — mass-assignment / privilege-escalation risk (pre-existing, discovered while reviewing a file in this phase's diff)

**File:** `backend/src/modules/users/users.controller.ts:113-120` (calls into `backend/src/modules/users/users.service.ts:194-199`)

**Issue:** `updateMe()` declares its body as a bare TypeScript object-literal type, not a `class-validator` DTO class:

```ts
@Patch('me')
@ApiOperation({ summary: 'Update current user profile' })
updateMe(
  @CurrentUser() user: { userId: string },
  @Body() body: { firstName?: string; lastName?: string; avatarUrl?: string; lgaId?: string },
) {
  return this.usersService.update(user.userId, body);
}
```

TypeScript types are erased at runtime and NestJS's global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true` per this repo's CLAUDE.md conventions) only enforces whitelisting against a *class* with `emitDecoratorMetadata`-reflected type information. For an inline object-literal parameter type, `design:paramtypes` reflects as the generic `Object`, and NestJS's built-in `ValidationPipe.toValidate()` explicitly **skips validation** for `Object`/`String`/`Number`/`Boolean`/`Array` metatypes. The result: `@Body() body` is passed through completely unvalidated and unfiltered, and `usersService.update()` forwards it verbatim into `prisma.user.update({ where: { id }, data: body })`.

Any authenticated user (any role) can therefore `PATCH /users/me` with extra `User` model fields that have nothing to do with the documented `firstName/lastName/avatarUrl/lgaId` contract — e.g. `role`, `status`, `kycStatus`, `otpChannel`, `passwordHash`, `ndpaConsent`, etc. — and Prisma will happily write them, since nothing strips unknown keys before the Prisma call. This is a classic mass-assignment vulnerability that can be used for self-privilege-escalation (`role: "SUPER_ADMIN"`), account takeover (`passwordHash: "<attacker-chosen-bcrypt-hash>"`), or KYC/compliance-state tampering.

This method itself was not touched by the phase-15 diff (confirmed via `git diff` against the phase base commit), so it predates this phase — but it lives directly beside the newly added `otp-channel` endpoint in a file that phase 15 did modify, and it is severe enough to flag regardless of which phase introduced it.

**Fix:** Introduce a proper DTO class and rely on the existing global `ValidationPipe` to do the whitelisting, matching the pattern already used for `ChangeOtpChannelDto`:

```ts
// dto/update-me.dto.ts
export class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @IsUUID() lgaId?: string;
}
```
```ts
updateMe(@CurrentUser() user: { userId: string }, @Body() dto: UpdateMeDto) {
  return this.usersService.update(user.userId, dto);
}
```

## Warnings

### WR-01: `RegisterDto.channel` is validated but never persisted — classic registration always defaults to SMS

**File:** `backend/src/modules/auth/dto/register.dto.ts:26-28`, `backend/src/modules/auth/auth.service.ts:60-97`

**Issue:** Phase 15 added a `channel?: OtpChannel` field to `RegisterDto` (validated with `@IsEnum`), but `AuthService.register()`'s `prisma.user.create({ data: {...} })` call (lines 78-92) never reads `dto.channel` — the new `otpChannel` column is left at its Prisma schema default (`SMS`) for every user created through `POST /auth/register`, regardless of what the client submitted. Compare with `phoneAuth()` (line 323), which correctly persists `otpChannel: channel` for OTP-based signups. This inconsistency means one of the two registration entry points silently drops the channel the user asked for, with no error and no test coverage proving it works.

**Fix:**
```ts
const user = await this.prisma.user.create({
  data: {
    email: dto.email,
    phone: dto.phone,
    firstName: dto.firstName,
    lastName: dto.lastName,
    passwordHash,
    role,
    registeredRoles: [role],
    otpChannel: dto.channel ?? OtpChannel.SMS,
    ndpaConsent: true,
    ndpaConsentAt: new Date(),
    wallet: { create: { balance: 0 } },
  },
  select: USER_SELECT,
});
```

### WR-02: Mobile OTP "Resend" drops the originally selected channel/email, silently downgrading new-signup resends to SMS

**File:** `mobile/app/auth/otp.tsx:79-88`, `mobile/app/auth/phone.tsx:74-92`

**Issue:** `phone.tsx` sends `{ phone, channel, email }` on the initial `/auth/otp/send` call, but `otp.tsx`'s `resend()` only sends `{ phone }`:

```ts
async function resend() {
  try {
    const res = await api.post('/auth/otp/send', { phone });
    ...
```

For a *returning* user this doesn't matter (the backend always uses the user's persisted `otpChannel`, see WR-05 below). But for a **brand-new** phone number — the primary signup path — no `User` row exists yet, so `AuthService.sendOtp()`'s `channel = existingUser?.otpChannel ?? dto.channel ?? OtpChannel.SMS` falls straight to `SMS` because `dto.channel` is missing from the resend request. A user who explicitly picked WhatsApp or Email on the previous screen, and received their first code that way, will have any "Resend code" tap silently deliver via plain SMS instead — with no `fallbackUsed` banner shown (the backend correctly reports `fallbackUsed: false` since SMS *was* the requested default, not a fallback), so the UI gives no indication anything changed.

**Fix:** Forward the originally chosen `channel` (and `email`, when applicable) from `phone.tsx` to `otp.tsx` via route params, and include them in the resend request:
```ts
// phone.tsx
router.push({ pathname: '/auth/otp', params: { phone: formattedPhone, fallbackUsed: String(fallbackUsed), channel, email } });

// otp.tsx
const { phone, channel, email } = useLocalSearchParams<{ phone: string; channel?: string; email?: string }>();
...
async function resend() {
  const res = await api.post('/auth/otp/send', { phone, channel, ...(channel === 'EMAIL' ? { email } : {}) });
  ...
}
```

### WR-03: No validation that a user has a real (non-placeholder) email before allowing `otpChannel = EMAIL`

**File:** `backend/src/modules/users/users.service.ts:66-72`, `backend/src/modules/users/dto/change-otp-channel.dto.ts`, `mobile/app/otp-channel-settings.tsx:78-102`

**Issue:** Users created through the phone-OTP flow without ever supplying an email get an auto-generated placeholder (`<phone>@iseyaa.local`, see `auth.service.ts:316`). `updateOtpChannel()` accepts `channel = EMAIL` unconditionally:

```ts
async updateOtpChannel(userId: string, channel: OtpChannel) {
  return this.prisma.user.update({ where: { id: userId }, data: { otpChannel: channel }, select: USER_SELECT });
}
```

and the mobile settings screen (`otp-channel-settings.tsx`) lets a user tap "Email" with no client-side check either. The next `sendOtp()` call will then always attempt to email the unreachable placeholder address, fail, and silently fall back to SMS (`dispatchOtp`'s catch block) — the user's chosen setting becomes a permanent no-op with no warning anywhere that it can't work.

**Fix:** In `updateOtpChannel`, reject (`BadRequestException`) when `channel === OtpChannel.EMAIL` and the user's stored `email` is null or matches the `@iseyaa.local` placeholder pattern, prompting the user to add a real email first (or add a dedicated "add/verify email" step before this endpoint accepts EMAIL).

### WR-04: WhatsApp template button `sub_type` may not match the template registered per MANUAL-ACTIONS.md instructions

**File:** `backend/src/modules/auth/auth.service.ts:213-233`, `MANUAL-ACTIONS.md` (Phase 15 section, "Step 2 — Submit the Authentication template")

**Issue:** `MANUAL-ACTIONS.md` instructs the human operator to register the Meta Authentication template with `Buttons: One-tap copy-code button enabled (otp_type: copy_code)`. The code, however, hardcodes the button component as a `url` sub-type with a plain `text` parameter:

```ts
{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
```

This is asserted as deliberate in `auth.service.spec.ts` ("sends the WhatsApp template message shape via Meta Graph API with a url-type button, not copy_code"), but Meta's Cloud API validates the button component shape in the send request against the button type configured on the *approved template*. If the template is actually registered as `copy_code` (per the documented instructions), Meta's API is expected to reject a `sub_type: 'url'` component (or vice-versa), meaning every WhatsApp OTP send would fail post-setup and permanently fall back to SMS — silently defeating a core deliverable of this phase (D-01/D-02) even after the human completes all manual setup steps in MANUAL-ACTIONS.md.

**Fix:** Verify against Meta's current WhatsApp Authentication Templates API reference which `sub_type`/parameter shape actually corresponds to a `copy_code`-configured template, and make the code and the MANUAL-ACTIONS.md instructions consistent (either the template must be registered with a URL/one-tap-autofill button to match the code, or the code's button payload must be changed to `sub_type: 'copy_code'` with a `coupon_code` parameter to match the documented template setup).

### WR-05: Login-time channel picker has no effect for returning users, with no indication to the user

**File:** `backend/src/modules/auth/auth.service.ts:147`, `mobile/app/auth/phone.tsx:145-166`

**Issue:** `sendOtp()` always prefers an existing user's persisted `otpChannel` over whatever the client requested:

```ts
const channel = (existingUser?.otpChannel as OtpChannel) ?? dto.channel ?? OtpChannel.SMS;
```

This is intentional and explicitly covered by a unit test, but `phone.tsx` presents a "How should we reach you?" channel picker to every user on every login attempt, implying the choice always takes effect. For a returning user whose saved preference differs from what they tap, the request is silently honored using their saved preference instead — with no error, no `fallbackUsed` signal (this isn't technically a "fallback"), and no messaging explaining why the code arrived somewhere else than requested.

**Fix:** Either hide/disable the channel picker once a phone number is known to belong to an existing account (would require a lightweight "does this number exist" pre-check), or surface a note such as "We'll use your saved verification channel for existing accounts" so the mismatch isn't a silent surprise.

### WR-06: Unescaped user-controlled `firstName` interpolated into OTP email HTML

**File:** `backend/src/common/services/sendgrid.service.ts:29-41`

**Issue:** The newly added `sendOtpEmail()` interpolates `firstName` directly into the HTML body with no escaping:

```ts
<p>Hello ${firstName},</p>
```

`firstName` originates from the `users.firstName` column, which is free-form user input (set at registration with only `@IsString()` validation, no character restrictions) and echoed back into an HTML email sent via SendGrid. While the practical exploit surface is narrow in the OTP-send path specifically (the recipient is the account owner themselves, using their own `firstName`), it is still unescaped interpolation of user-controlled data into HTML, and this pattern already exists in a "Powered by Iṣẹ́yáá" branded transactional email that could be forwarded or previewed elsewhere.

**Fix:** HTML-escape `firstName` (and other user-controlled interpolations in this file) before insertion, e.g.:
```ts
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
...
<p>Hello ${escapeHtml(firstName)},</p>
```

## Info

### IN-01: `PhoneAuthDto.channel` is validated but never read

**File:** `backend/src/modules/auth/dto/phone-auth.dto.ts:12-14`, `backend/src/modules/auth/auth.service.ts:276-339`

**Issue:** `PhoneAuthDto` gained an optional `channel` field validated with `@IsEnum(OtpChannel)`, but `AuthService.phoneAuth()` never reads `dto.channel` — it derives `channel` exclusively from the value that was stored in Redis when the OTP was originally sent (`this.decodeOtpValue(stored).channel`). This is arguably the *correct* security posture (trusting server-recorded state over client-supplied claims at verification time), but the field is dead weight on the DTO and may mislead API consumers into thinking they can influence verification-time behavior with it.

**Fix:** Remove the unused `channel` field from `PhoneAuthDto`, or add a code comment explaining it is intentionally ignored and where the real value comes from.

### IN-02: Colon-delimited OTP Redis value encoding is fragile

**File:** `backend/src/modules/auth/auth.service.ts:161-173`

**Issue:** `encodeOtpValue`/`decodeOtpValue` use a hand-rolled `otp:attempts:channel:email` colon-delimited string format. `decodeOtpValue` uses positional array destructuring (`stored.split(':')`), which would silently truncate or misparse the `email` field if it ever contained a colon (unusual for standard emails, but not something the format defends against), and offers no forward-compatible way to add another field without repeating this pattern.

**Fix:** Consider `JSON.stringify`/`JSON.parse` for the Redis value instead of manual colon-delimited encoding, which is more robust and self-documenting; retain a fallback parse path for the legacy `otp:attempts` 2-field format already handled today.

---

_Reviewed: 2026-07-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
