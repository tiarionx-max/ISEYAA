---
phase: quick
plan: 260722-qdl
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/modules/auth/dto/phone-auth.dto.ts
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - mobile/app/auth/otp.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "A new user who completes phone-OTP signup via mobile without checking the NDPA consent box cannot have an account created — the backend rejects with a clear error instead of fabricating consent"
    - "A new user who checks the NDPA consent box and completes phone-OTP signup gets a User record with ndpaConsent=true and a real ndpaConsentAt timestamp captured at that moment"
    - "The mobile OTP screen visibly presents NDPA consent copy and blocks code entry/submission until the box is checked"
    - "An already-registered user logging back in via phone-OTP is not blocked or forced to re-consent (no regression to the existing login path)"
  artifacts:
    - path: "backend/src/modules/auth/dto/phone-auth.dto.ts"
      provides: "ndpaConsent: boolean field on PhoneAuthDto, validated via @IsBoolean(), matching RegisterDto's convention"
      contains: "IsBoolean"
    - path: "backend/src/modules/auth/auth.service.ts"
      provides: "phoneAuth() rejects new-user creation when dto.ndpaConsent is falsy, and only writes ndpaConsentAt when consent is true"
      contains: "NDPA consent is required"
    - path: "mobile/app/auth/otp.tsx"
      provides: "Consent checkbox UI wired to the ndpaConsent field on the /auth/phone-auth POST body"
      contains: "ndpaConsent"
  key_links:
    - from: "mobile/app/auth/otp.tsx"
      to: "POST /auth/phone-auth"
      via: "api.post('/auth/phone-auth', { phone, otp, ndpaConsent })"
      pattern: "ndpaConsent:\\s*consent"
    - from: "backend/src/modules/auth/auth.service.ts phoneAuth()"
      to: "prisma.user.create (new-user branch)"
      via: "conditional ndpaConsentAt write gated on dto.ndpaConsent"
      pattern: "ndpaConsentAt:\\s*dto\\.ndpaConsent"
---

<objective>
Close an NDPA (Nigerian Data Protection Act) compliance gap in the primary mobile signup path. `AuthService.phoneAuth()` (the endpoint backing OTP-only mobile signup) currently auto-registers new users and hardcodes `ndpaConsent: true` / `ndpaConsentAt: new Date()` without ever collecting real consent — `PhoneAuthDto` has no consent field at all, and the mobile OTP screen has no consent UI. This is a legal compliance requirement (NDPA) per project CLAUDE.md, and every mobile-signed-up user's consent record today is fabricated.

The web `register()` flow already does this correctly (`RegisterDto.ndpaConsent: boolean` via `@IsBoolean()`, service throws `BadRequestException` when falsy). This plan brings `phoneAuth()` to parity for **new-user creation only** — existing users logging back in via phone-OTP are not required to re-consent (they already have a real consent record from whenever they first registered), avoiding a login regression while closing the actual gap (fabricated consent at first-time signup).

Purpose: Legal compliance (NDPA) — stop fabricating consent records for mobile users.
Output: `PhoneAuthDto` with a real `ndpaConsent` field, `phoneAuth()` service logic that rejects fabrication and only persists real consent, updated/added backend tests, and a mobile consent checkbox wired into the OTP screen's API call.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
These facts were confirmed by direct inspection of the current codebase (2026-07-22, branch `microservices-redesign`). Use them directly — re-Read the cited files before editing to catch any drift and get exact current line numbers for Edit.

**`backend/src/modules/auth/dto/register.dto.ts` (the established pattern to mirror):**
```typescript
import { IsEmail, IsString, MinLength, IsOptional, IsMobilePhone, IsEnum, IsBoolean } from 'class-validator';
// ...
@IsBoolean()
ndpaConsent: boolean;
```
No `@IsOptional()` — the field is required. class-validator's `@IsBoolean()` fails validation when the value is `undefined` (missing), so a missing field is rejected by the global `ValidationPipe` with a 400 before the controller/service is even reached in production. It accepts `true` or `false` as valid booleans — the "must be true" business rule is enforced separately, in the service.

**`backend/src/modules/auth/auth.service.ts` `register()` (lines 60-63), the established service-level pattern to mirror:**
```typescript
async register(dto: RegisterDto, ip?: string, ua?: string) {
  if (!dto.ndpaConsent) {
    throw new BadRequestException('NDPA consent is required to create an account');
  }
  // ...
  const user = await this.prisma.user.create({
    data: {
      // ...
      ndpaConsent: true,
      ndpaConsentAt: new Date(),
      // ...
```

**`backend/src/modules/auth/dto/phone-auth.dto.ts` (current, full file):**
```typescript
import { IsEnum, IsMobilePhone, IsOptional, IsString, Length } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class PhoneAuthDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel;
}
```

**`backend/src/modules/auth/auth.service.ts` `phoneAuth()` (current, lines 276-339) — the method to fix:**
The method: checks OTP lockout → validates the stored OTP → on success, `await this.redis.del(...)` → looks up an existing user by phone (`this.prisma.user.findFirst(...)`) → **if no user exists** (`isNewUser = true`), checks for duplicate email (EMAIL channel only), then calls `this.prisma.user.create({ data: { ..., ndpaConsent: true, ndpaConsentAt: new Date(), ... } })` (lines 324-325, hardcoded) → **else** (existing user), just updates `status: 'ACTIVE'` and logs `LOGIN_SUCCESS`. Both branches then call `generateTokens()` and return `{ user, isNewUser, ...tokens }`.

**Design decision for this fix — scope the consent check to new-user creation only, NOT every phoneAuth call:** `phoneAuth()` serves both signup (new user) AND login (existing user) through the same endpoint/screen. Placing the `if (!dto.ndpaConsent) throw ...` check inside the `if (!user) { isNewUser = true; ... }` branch (not at the top of the method) means: (a) new-user creation is blocked without real consent — closing the actual compliance gap; (b) an already-registered user logging back in is never re-challenged for consent — no regression to existing login UX. The mobile UI will still gate every OTP submission behind the checkbox per Task 2 (harmless duplication for returning users, and required for the DTO's `@IsBoolean()` to have a value to validate), but the backend only *enforces truthiness* at account-creation time.

**Existing test file `backend/src/modules/auth/__tests__/auth.service.spec.ts`** — `describe('phoneAuth', ...)` (lines 365-423) has 4 existing tests, 3 of which currently call `service.phoneAuth({ phone: '+2348012345678', otp: '654321' })` (no `ndpaConsent` field) through the new-user creation branch (`mockPrisma.user.findFirst.mockResolvedValue(null)` or `.mockResolvedValueOnce(null)` first). These 3 will need `ndpaConsent: true` added to their call args or they will now fail with the new `BadRequestException`. The 4th test (`'does not bypass an active lockout...'`) hits the lockout check before ever reaching the new consent check, so it needs no change. `mockPrisma.user.create` mock return values in these tests do not currently include `ndpaConsent`/`ndpaConsentAt` fields — no change needed there since the tests assert on other `data` fields via `expect.objectContaining`.

**`mobile/app/auth/otp.tsx` (current, full file, 318 lines)** — Expo/React Native OTP verification screen. Key facts:
- No consent UI exists anywhere in this file.
- `handleChange(text)` (line 90) strips non-digits, sets `code` state, and when `digits.length === OTP_LENGTH` (6), immediately calls `verify(digits)` — there is no separate "Submit" button; entry IS submission (auto-submit on 6th digit).
- `verify(value)` (line 55) posts `api.post('/auth/phone-auth', { phone, otp: value })` and on success stores tokens via `expo-secure-store` and navigates to `/(tabs)`.
- The OTP boxes are rendered via a `TouchableOpacity` wrapper (`styles.otpRow`, line ~142) around a row of `View`s (`styles.otpBox`), with a **hidden real `TextInput`** (`styles.hiddenInput`, line ~171) that actually captures keyboard input and is focused via `inputRef`.
- Design tokens imported from `../../lib/tokens`: `SURFACE_DEEP, SURFACE_MID, GOLD, GOLD_LINE, CREAM, INK, INK_MID, INK_FAINT, INK_DIM, BORDER, SUCCESS_DIM, SUCCESS_TEXT, FONT_DISPLAY, FONT_MONO` — no dedicated checkbox token exists; the app's checkbox-like patterns are ad-hoc `TouchableOpacity` + styled `View` (see `mobile/app/auth/phone.tsx`'s channel-selection cards, which toggle `styles.channelCardSelected`/`channelCardLabelSelected` using `GOLD`/`GOLD_DIM`/`GOLD_LINE` on selection).
- `lucide-react-native` icons are already used in this same file (`Info`) and in `phone.tsx` (`MessageSquare`, `MessageCircle`, `Mail`) — the icon set includes a standard `Check` icon, safe to import the same way.

**Established consent copy — `web/src/app/register/page.tsx` (lines 177-188), the web register form's checkbox, use this exact wording for cross-platform consistency:**
```
I consent to processing of my personal data under the Nigerian Data Protection Act (NDPA) as part of the Iṣẹ́yáá platform.
```
(rendered with "Nigerian Data Protection Act (NDPA)" in a highlighted inline span). The web checkbox disables its submit button via `disabled={loading || !ndpaConsent}` — the mobile equivalent (since there is no separate submit button, only auto-submit-on-6th-digit) is to disable the OTP entry itself (the hidden `TextInput`'s `editable` prop and the `TouchableOpacity` wrapper's `disabled` prop) until the consent checkbox is checked, so the auto-submit path can never fire without real consent.

No existing checkbox component was found anywhere under `mobile/` (`grep -ri checkbox mobile/` returned no matches) — build a small inline custom checkbox in `otp.tsx` using existing tokens, do not introduce a new shared component or dependency for this quick fix.
</verified_facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add real NDPA consent to PhoneAuthDto and phoneAuth() (backend)</name>
  <files>backend/src/modules/auth/dto/phone-auth.dto.ts, backend/src/modules/auth/auth.service.ts, backend/src/modules/auth/__tests__/auth.service.spec.ts</files>
  <behavior>
    - Test: `phoneAuth()` throws `BadRequestException` when creating a NEW user (no existing user found by phone) and `dto.ndpaConsent` is `false`.
    - Test: `phoneAuth()` throws `BadRequestException` when creating a NEW user and `dto.ndpaConsent` is missing/`undefined` (i.e. omitted from the call args entirely).
    - Test: `phoneAuth()` succeeds for a NEW user when `dto.ndpaConsent` is `true`, and `mockPrisma.user.create` is called with `data.ndpaConsent === true` and `data.ndpaConsentAt` as `expect.any(Date)`.
    - Test: `phoneAuth()` succeeds for an EXISTING user (found by phone) even when `ndpaConsent` is omitted from the call args — confirms no login regression.
    - Existing tests: the 3 pre-existing `phoneAuth` tests that create a new user via `mockPrisma.user.findFirst.mockResolvedValue(null)` (or `.mockResolvedValueOnce(null)` for the duplicate-email test) must be updated to pass `ndpaConsent: true` in their `service.phoneAuth({...})` call args, or they will now fail against the new guard.
  </behavior>
  <action>
    1. In `phone-auth.dto.ts`: add `IsBoolean` to the `class-validator` import list, and add a required `ndpaConsent: boolean` field decorated with `@IsBoolean()` (no `@IsOptional()`) — mirroring `RegisterDto`'s exact pattern (per verified_facts). Place it after the `channel` field.

    2. In `auth.service.ts` `phoneAuth()`: inside the `if (!user) { isNewUser = true; ... }` branch, immediately after the `isNewUser = true;` line and before the duplicate-email check, add: `if (!dto.ndpaConsent) { throw new BadRequestException('NDPA consent is required to create an account'); }` — reusing the exact message string `register()` already uses, for consistency. Do NOT place this check at the top of `phoneAuth()` (per the "Design decision" in verified_facts) — it must only gate the new-user-creation branch, not existing-user login.

    3. In the same branch's `this.prisma.user.create({ data: { ... } })` call, replace the hardcoded `ndpaConsent: true, ndpaConsentAt: new Date(),` with `ndpaConsent: dto.ndpaConsent, ndpaConsentAt: dto.ndpaConsent ? new Date() : undefined,` — using the real caller-supplied value (by this point in the code path `dto.ndpaConsent` is guaranteed `true` due to the guard added in step 2, but writing it this way avoids ever re-introducing a hardcoded literal and keeps the intent explicit).

    4. In `auth.service.spec.ts`: add the 4 new tests described in `<behavior>` above (following the existing `describe('phoneAuth', ...)` block's style — reuse the existing `mockRedis`/`mockPrisma`/`mockJwt` setup patterns already present in the file, e.g. `mockRedis.exists.mockResolvedValue(false); mockRedis.get.mockResolvedValue('654321:0:SMS:'); mockRedis.del.mockResolvedValue(undefined);` for a valid-OTP setup). Update the 3 pre-existing tests that create a new user to add `ndpaConsent: true` to their `phoneAuth()` call args (`'persists the resolved otpChannel...'`, `'persists the resolved email...'`, `'rejects with ConflictException on a duplicate email...'`). Leave the `'does not bypass an active lockout...'` test unchanged.
  </action>
  <verify>
    <automated>cd backend && npx jest src/modules/auth</automated>
  </verify>
  <done>PhoneAuthDto has a required `ndpaConsent: boolean` field validated via `@IsBoolean()`. `phoneAuth()` rejects new-user creation with a `BadRequestException` when `ndpaConsent` is falsy, persists the real value + a real `ndpaConsentAt` timestamp when true, and does not affect existing-user login. All tests in `backend/src/modules/auth/__tests__/auth.service.spec.ts` pass.</done>
</task>

<task type="auto">
  <name>Task 2: Add NDPA consent checkbox to the mobile OTP screen and wire it to the API call</name>
  <files>mobile/app/auth/otp.tsx</files>
  <action>
    **Verification limitation (state this explicitly, do not attempt to fake it):** There is no emulator or Expo dev server available in this environment. Verification for this task is static only — TypeScript compilation (`npx tsc --noEmit`) plus a careful manual read-through confirming the JSX/state/prop wiring is internally consistent (state variable used in both the `disabled`/`editable` props and the API call body, no dangling references, no default-true anywhere). Do not claim a visual/runtime check was performed.

    1. Import `Check` from `lucide-react-native` alongside the existing `Info` import.

    2. Add `const [consent, setConsent] = useState(false);` alongside the other `useState` declarations at the top of `OtpScreen()`. Default must be `false` — never default or auto-set to `true` anywhere.

    3. Add a consent row above the OTP boxes (`styles.otpRow`), after the `fallbackUsed` banner block and before the `TouchableOpacity` wrapping the OTP digit boxes. Use a `TouchableOpacity` (`onPress={() => setConsent((c) => !c)}`, `accessibilityRole="checkbox"`, `accessibilityState={{ checked: consent }}`, `accessibilityLabel="Consent to NDPA data processing"`) containing: (a) a small square `View` styled as a checkbox (unchecked: `BORDER` border color, transparent background; checked: `GOLD` border + a subtle `GOLD`-tinted background) rendering a `Check` icon (size 14, color `SURFACE_DEEP`) only when `consent` is `true`; (b) adjacent `Text` using this exact copy (matching `web/src/app/register/page.tsx`'s wording per verified_facts, for cross-platform consistency): "I consent to processing of my personal data under the Nigerian Data Protection Act (NDPA) as part of the Iṣẹ́yáá platform." — style the "Nigerian Data Protection Act (NDPA)" substring in `GOLD` via a nested `Text`, matching the web version's highlighted-span treatment, and the rest in a muted tone consistent with `styles.sub`'s color (`rgba(255,255,255,0.50)`).

    4. Gate OTP entry on consent: add `disabled={!consent}` to the `TouchableOpacity` wrapping the OTP boxes, and lower its `style` opacity when disabled (add a `styles.otpRowDisabled` with `opacity: 0.4` applied conditionally). Add `editable={consent}` to the hidden `TextInput`. This ensures the auto-submit-on-6th-digit path (`handleChange` → `verify`) can never fire before the box is checked, since the input that drives `handleChange` cannot receive keystrokes while `editable={false}`.

    5. As defense in depth (in case `editable` doesn't fully block programmatic input on some platform), keep `handleChange`'s existing logic but add a guard: only call `verify(digits)` when `digits.length === OTP_LENGTH && consent` is true; if the length hits 6 while `consent` is `false` (should not normally be reachable given step 4), do not call `verify` and leave the code as-is without clearing it.

    6. Update the `verify()` function's `api.post` call from `api.post('/auth/phone-auth', { phone, otp: value })` to `api.post('/auth/phone-auth', { phone, otp: value, ndpaConsent: consent })` — wiring the real checkbox state directly into the request body. Do not hardcode `true`.

    Do not touch `mobile/app/auth/phone.tsx` or any other screen — this task is scoped to `otp.tsx` only.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>otp.tsx renders a consent checkbox above the OTP entry defaulting to unchecked, with copy matching the web register flow's NDPA wording. The OTP entry (both the touchable wrapper and the underlying hidden TextInput) is disabled until the checkbox is checked. The `/auth/phone-auth` API call sends the real `consent` state as `ndpaConsent`, never a hardcoded value. `npx tsc --noEmit` passes with no new type errors. No emulator/runtime verification was performed or claimed — static code review only.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Mobile client → `POST /auth/phone-auth` | Untrusted client-supplied `ndpaConsent` boolean crosses into account-creation logic |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Repudiation | `phoneAuth()` new-user creation | mitigate | `ndpaConsentAt` is only ever set to a server-generated `new Date()` at the moment of account creation, never client-supplied — provides a server-side timestamp for the consent record, matching `register()`'s existing pattern |
| T-quick-02 | Tampering | Mobile client sending `ndpaConsent: true` without the user actually checking the box (e.g. a modified client build) | accept | This is an inherent limitation of any client-side consent gate — the backend enforces "a boolean value must be explicitly provided and truthy" but cannot cryptographically prove the human actually read/clicked it. This matches the existing accepted risk profile of the web `register()` flow, which has the identical limitation and is the established, already-shipped precedent for this exact trust boundary. |

</threat_model>

<verification>
1. `cd backend && npx jest src/modules/auth` — all tests pass, including the 4 new `phoneAuth` consent tests and the 3 updated pre-existing tests.
2. `cd backend && npx tsc --noEmit` — no new type errors.
3. `cd mobile && npx tsc --noEmit` — no new type errors.
4. `cd backend && npx jest` — full suite passes (regression check, no unrelated breakage).
5. Manual read-through of `phone-auth.dto.ts` confirms `ndpaConsent: boolean` is present and validated via `@IsBoolean()`, matching `RegisterDto`.
6. Manual read-through of `auth.service.ts`'s `phoneAuth()` confirms the consent guard is scoped to the new-user branch only (existing-user login path is untouched).
7. Manual read-through of `otp.tsx` confirms: checkbox defaults to unchecked, OTP entry is disabled until checked, and the real `consent` state (not a literal `true`) is sent as `ndpaConsent` in the API call.
</verification>

<success_criteria>
- `PhoneAuthDto` has a required, validated `ndpaConsent: boolean` field.
- `AuthService.phoneAuth()` never creates a new user with fabricated consent — it throws `BadRequestException` when `ndpaConsent` is falsy at account-creation time, and persists the real value + a real server-generated `ndpaConsentAt` when true.
- Existing users logging back in via phone-OTP are unaffected — no forced re-consent regression.
- `mobile/app/auth/otp.tsx` presents real NDPA consent UI (matching the web flow's established copy) and cannot submit the OTP without the box being checked.
- `cd backend && npx jest`, `cd backend && npx tsc --noEmit`, and `cd mobile && npx tsc --noEmit` all pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260722-qdl-fix-ndpa-consent-compliance-gap-in-phone/260722-qdl-SUMMARY.md`
</output>
