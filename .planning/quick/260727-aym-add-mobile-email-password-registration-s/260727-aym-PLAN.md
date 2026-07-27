---
phase: quick
plan: 260727-aym
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/auth/register.tsx
  - mobile/app/_layout.tsx
  - mobile/app/auth/email.tsx
  - mobile/app/onboarding.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A new (not previously registered) user can create an account on mobile via email+password, providing first name, last name, email, phone, password, and explicit NDPA consent"
    - "Submitting the registration form with valid input creates the account and immediately signs the user in, landing on the authenticated tab area — mirroring what /auth/login already does"
    - "The registration screen is reachable from onboarding.tsx (new-user entry point) and from the email sign-in screen (existing-user realizing they need to sign up)"
    - "A user cannot submit the form without checking the NDPA consent box"
    - "Duplicate email/phone registration attempts surface the backend's error message rather than crashing or silently failing"
  artifacts:
    - path: "mobile/app/auth/register.tsx"
      provides: "Email+password registration screen: firstName/lastName/email/phone/password fields, NDPA consent checkbox, POST /auth/register call, token storage, navigation to /(tabs)"
      min_lines: 150
    - path: "mobile/app/_layout.tsx"
      provides: "Stack.Screen route registration for auth/register"
      contains: "auth/register"
    - path: "mobile/app/onboarding.tsx"
      provides: "Navigation entry point linking to the new registration screen"
      contains: "auth/register"
    - path: "mobile/app/auth/email.tsx"
      provides: "Navigation entry point linking to the new registration screen for users without an account"
      contains: "auth/register"
  key_links:
    - from: "mobile/app/auth/register.tsx"
      to: "backend POST /api/v1/auth/register"
      via: "api.post('/auth/register', { email, phone, password, firstName, lastName, ndpaConsent }) using the shared axios instance in mobile/lib/api.ts"
      pattern: "api\\.post\\(.\\/auth\\/register"
    - from: "mobile/app/auth/register.tsx"
      to: "expo-secure-store"
      via: "SecureStore.setItemAsync('access_token', ...) / ('refresh_token', ...) mirroring email.tsx's/otp.tsx's post-auth pattern, since /auth/register returns the same { user, accessToken, refreshToken } shape as /auth/login"
      pattern: "SecureStore\\.setItemAsync"
    - from: "mobile/app/onboarding.tsx"
      to: "mobile/app/auth/register.tsx"
      via: "router.push('/auth/register')"
      pattern: "auth/register"
    - from: "mobile/app/auth/email.tsx"
      to: "mobile/app/auth/register.tsx"
      via: "router.push('/auth/register')"
      pattern: "auth/register"
---

<objective>
Mobile's `email.tsx` (built in quick task 260726-riy) only handles sign-in for existing users via `POST /auth/login` — there is no way for a new user to create an account with email+password on mobile. The only existing mobile registration path is phone+OTP auto-registration. The backend's `POST /auth/register` endpoint (`RegisterDto`: email, phone, password, firstName, lastName, ndpaConsent) is complete and already used by the web app — this plan closes the mobile client gap only, no backend changes.

Purpose: Give ISEYAA mobile users a self-service email+password account-creation path with proper NDPA consent collection, matching what already exists on web.
Output: New `mobile/app/auth/register.tsx` screen; route registration in `mobile/app/_layout.tsx`; new "sign up" links added to `mobile/app/onboarding.tsx` and `mobile/app/auth/email.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection (2026-07-27, branch `microservices-redesign`), all backend facts require no backend changes:

- `RegisterDto` (`backend/src/modules/auth/dto/register.dto.ts`): `email` (`@IsEmail`), `phone` (`@IsMobilePhone('en-NG')`), `password` (`@IsString @MinLength(8)`), `firstName`/`lastName` (`@IsString`), `role`/`channel` (optional, omit both — defaults to CITIZEN), `ndpaConsent` (`@IsBoolean`, required).
- `AuthService.register()` (`backend/src/modules/auth/auth.service.ts:60-97`): throws 400 if `!ndpaConsent`; throws 409 `ConflictException('Email or phone already registered')` (single generic message) on duplicate; otherwise creates user + wallet and returns `{ user, accessToken, refreshToken }` — auto-issues JWTs exactly like `/auth/login`, no email verification/OTP step.
- `POST /auth/register` (`backend/src/modules/auth/auth.controller.ts:27-31`) is public, unguarded, default 201, body maps 1:1 to `RegisterDto`.
- Web reference (`web/src/app/register/page.tsx`, field/validation parity only — do NOT mirror its NextAuth-specific post-register `signIn()` call): collects firstName/lastName/email/phone/password(8+)/ndpaConsent checkbox (submit disabled until checked); no client-side phone regex, relies on backend's `IsMobilePhone('en-NG')`.

Mobile source of truth — read directly, full files, this session:

- `mobile/app/auth/email.tsx` (255 lines, built in quick task 260726-riy): sign-in-only screen. Its `handleSignIn()` is the exact token-extraction/SecureStore/push/router.replace pattern to mirror for registration (see `<register_screen_reference>` below). Currently has only two secondary links: `altLink` ("Prefer a phone number? →" → `/auth/phone`) and `backLink` ("← Back to welcome" → `router.back()`) — no sign-up link exists yet.
- `mobile/app/auth/phone.tsx` (336 lines): has the working Nigerian phone-input pattern to reuse — `formattedPhone` derivation (`0801...` → `+2348011...`, already-`+`-prefixed passthrough, bare digits → `+234` prefix) plus the `countryPill`/`phoneInput` styled input row.
- `mobile/app/auth/otp.tsx` (375 lines): has the exact NDPA consent checkbox pattern to reuse verbatim — `consentRow`/`consentBox`/`consentBoxChecked`/`consentText`/`consentTextHighlight` styles (lines 289-318) plus the `TouchableOpacity` markup (lines 144-161) using `Check` from `lucide-react-native` and `BORDER` from `mobile/lib/tokens.ts`.
- `mobile/app/_layout.tsx` (77 lines): `<Stack.Screen name="auth/phone" .../>`, `<Stack.Screen name="auth/otp" .../>`, `<Stack.Screen name="auth/email" .../>` are registered consecutively (lines 64-66) with `options={{ headerShown: false }}`.
- `mobile/app/onboarding.tsx` (393 lines): `handleEmailPress()` (lines 114-120) is the established try/catch + `Alert.alert('Coming soon', ...)` fallback pattern wired to `router.push('/auth/email')`; its rendered link is `emailLink`/`emailLinkText` styled (lines 226-234, 372-380). No "create account"/"sign up" entry point exists yet.
- `mobile/lib/tokens.ts`: exports `SURFACE_DEEP, SURFACE_MID, GOLD, GOLD_LINE, GOLD_DIM, CREAM, INK_MID, BORDER, FONT_DISPLAY, FONT_MONO` used throughout these screens.
- `mobile/lib/api.ts` exports the shared `api` axios instance and `getErrorMessage(err, fallback)` helper (already handles NestJS `class-validator` array-shaped messages) — same import convention every existing auth screen uses (`import { api, getErrorMessage } from '../../lib/api'`).
- `mobile/lib/push-notifications.ts` exports `registerForPushNotifications()`, called post-auth in both `email.tsx` and `otp.tsx`.
</verified_facts>

<register_screen_reference>
`email.tsx`'s `handleSignIn()` — the exact pattern to mirror for `handleRegister()`, swapping the endpoint/body:

```typescript
async function handleSignIn() {
  if (!isReady || loading) return;
  setLoading(true);
  try {
    const res = await api.post('/auth/login', { identifier: email, password });
    const payload = res.data?.data ?? res.data ?? {};
    const { accessToken, refreshToken } = payload;
    if (accessToken) {
      await SecureStore.setItemAsync('access_token', accessToken);
      if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken);
      registerForPushNotifications();
      router.replace('/(tabs)' as any);
    } else {
      Alert.alert('Error', 'Unexpected response from server. Please try again.');
    }
  } catch (err: any) {
    const msg = getErrorMessage(err, 'Invalid email or password.');
    Alert.alert('Sign in failed', msg);
  } finally {
    setLoading(false);
  }
}
```

For registration: `api.post('/auth/register', { email, phone: formattedPhone, password, firstName, lastName, ndpaConsent })` — identical token-extraction/SecureStore/push/router.replace body; error fallback message `'Registration failed. Please try again.'`; alert title `'Registration failed'`.

`otp.tsx`'s NDPA consent block (copy verbatim, including styles):

```tsx
<TouchableOpacity
  style={styles.consentRow}
  activeOpacity={0.7}
  onPress={() => setConsent((c) => !c)}
  accessibilityRole="checkbox"
  accessibilityState={{ checked: consent }}
  accessibilityLabel="Consent to NDPA data processing"
>
  <View style={[styles.consentBox, consent && styles.consentBoxChecked]}>
    {consent && <Check size={14} color={SURFACE_DEEP} />}
  </View>
  <Text style={styles.consentText}>
    I consent to processing of my personal data under the{' '}
    <Text style={styles.consentTextHighlight}>Nigerian Data Protection Act (NDPA)</Text> as part of the
    Iṣẹ́yáá platform.
  </Text>
</TouchableOpacity>
```

`phone.tsx`'s phone-formatting logic (copy verbatim):

```typescript
const digitsOnly = phone.replace(/[^\d+]/g, '');
const formattedPhone = digitsOnly.startsWith('0')
  ? `+234${digitsOnly.slice(1)}`
  : digitsOnly.startsWith('+')
  ? digitsOnly
  : digitsOnly.length > 0
  ? `+234${digitsOnly}`
  : '';
```
</register_screen_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create mobile registration screen and register its route</name>
  <files>mobile/app/auth/register.tsx, mobile/app/_layout.tsx</files>
  <action>
    Create `mobile/app/auth/register.tsx` as a new screen, structurally mirroring `email.tsx`'s scaffold exactly (same imports, same locally-duplicated `AdireOrnament` component copy-pasted per this codebase's existing convention, same `LinearGradient` background layers, `KeyboardAvoidingView` root, kicker/title/sub text block, `inputWrapper`/`cta`/`backLink` style conventions from `mobile/lib/tokens.ts`), but wrap the field block in a `ScrollView` (`keyboardShouldPersistTaps="handled"`, `contentContainerStyle={{ paddingBottom: ... }}`) since this form has more fields than email.tsx's two and must not clip on small screens.

    Fields (each its own `inputWrapper` row, in this order): `firstName` (placeholder "First name", `autoCapitalize="words"`), `lastName` (placeholder "Last name", `autoCapitalize="words"`), `email` (placeholder "you@example.com", `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"`), `phone` (reuse `phone.tsx`'s `countryPill` + `phoneInput` row exactly, including the `formattedPhone` derivation logic from `<register_screen_reference>`), `password` (placeholder "••••••••••", `secureTextEntry` toggled by `Eye`/`EyeOff` from `lucide-react-native` exactly as in `email.tsx`).

    Below the password field, insert the NDPA consent checkbox block verbatim from `otp.tsx` (component markup + all `consentRow`/`consentBox`/`consentBoxChecked`/`consentText`/`consentTextHighlight` styles), backed by a local `consent` boolean state (`useState(false)`).

    Readiness gate: `isReady = firstName.trim().length > 0 && lastName.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && formattedPhone.length >= 13 && password.length >= 8 && consent`. The CTA (`cta`/`ctaDisabled`/`ctaText` styles, text "Create account →") is `disabled={!isReady || loading}`.

    `handleRegister()`: mirror `email.tsx`'s `handleSignIn()` shape exactly (see `<register_screen_reference>`) — `setLoading(true)`; `api.post('/auth/register', { email, phone: formattedPhone, password, firstName, lastName, ndpaConsent: consent })` (imported from `../../lib/api`, no new API helper file); on success extract `accessToken`/`refreshToken` from `res.data?.data ?? res.data ?? {}`, store both via `SecureStore.setItemAsync` (`import * as SecureStore from 'expo-secure-store'`), call `registerForPushNotifications()` (`import { registerForPushNotifications } from '../../lib/push-notifications'`), then `router.replace('/(tabs)' as any)`. Do NOT omit any of `email`/`phone`/`password`/`firstName`/`lastName`/`ndpaConsent` from the request body, and do NOT include `role` or `channel` (let backend default to CITIZEN — this screen is general citizen self-registration, not vendor/organiser/host onboarding). On error, `getErrorMessage(err, 'Registration failed. Please try again.')` from `../../lib/api`, `Alert.alert('Registration failed', msg)`. Always `setLoading(false)` in `finally`.

    Secondary links: `altLink`-styled "Already have an account? Sign in →" → `router.push('/auth/email' as any)`, and `backLink`-styled "← Back to welcome" → `router.back()`.

    Kicker: "CREATE ACCOUNT". Title: "Your account{'\n'}{italic}details" (mirroring email.tsx's two-line serif title pattern). Sub: a short line about joining Iṣẹ́yáá to book stays, buy tickets, and pay with the wallet.

    In `mobile/app/_layout.tsx`, add `<Stack.Screen name="auth/register" options={{ headerShown: false }} />` immediately after the existing `<Stack.Screen name="auth/email" options={{ headerShown: false }} />` line (line 66), matching the `auth/phone`/`auth/otp`/`auth/email` registration pattern exactly.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>mobile/app/auth/register.tsx exists, collects firstName/lastName/email/phone/password plus a gated NDPA consent checkbox, calls POST /auth/register via the shared api instance with the exact 6-field body (no role/channel), stores accessToken/refreshToken via expo-secure-store on success, and navigates to /(tabs). mobile/app/_layout.tsx registers the auth/register route. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Link the new registration screen from onboarding and email sign-in</name>
  <files>mobile/app/onboarding.tsx, mobile/app/auth/email.tsx</files>
  <action>
    In `mobile/app/onboarding.tsx`, add a `handleRegisterPress()` function mirroring `handleEmailPress()`'s exact try/catch + `Alert.alert('Coming soon', ...)` fallback pattern (lines 114-120), wired to `router.push('/auth/register' as any)`. Render a new `TouchableOpacity` link directly below the existing `emailLink` block (after line 234, before the `termsText` block) reading "New to Iṣẹ́yáá? Create an account", using the same `emailLink`/`emailLinkText` style objects (or a duplicate pair with identical values if visual separation from the sign-in link is preferred) — give it `accessibilityRole="button"` and `accessibilityLabel="Create a new account"`.

    In `mobile/app/auth/email.tsx`, add a new secondary link between the existing `altLink` and `backLink` `TouchableOpacity` blocks (between lines 161 and 163): "Don't have an account? Sign up" styled consistently with `altLink`/`altLinkText` (reuse those styles or add an identical `signupLink`/`signupLinkText` pair), wired to `router.push('/auth/register' as any)`.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>mobile/app/onboarding.tsx has a working "Create an account" link to /auth/register. mobile/app/auth/email.tsx has a working "Sign up" link to /auth/register. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile app → backend `/auth/register` | User-supplied PII (name, email, phone, password) and an explicit consent flag cross from the mobile client into the existing, already-hardened backend registration endpoint |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | `mobile/app/auth/register.tsx` password field | mitigate | `secureTextEntry` on by default with an explicit user-triggered toggle only (same pattern as `email.tsx`); password value never logged, never persisted to AsyncStorage — only the resulting JWT is written to `expo-secure-store` on successful registration |
| T-quick-02 | Repudiation (NDPA consent) | `mobile/app/auth/register.tsx` consent checkbox | mitigate | Submit is client-side gated on `consent === true` (CTA `disabled` until checked) AND the backend independently rejects (`400`) any request with `ndpaConsent: false`/missing — client-side gating is a UX convenience, not the security boundary |
| T-quick-03 | Spoofing (automated account creation / credential stuffing) | Backend `/auth/register` | accept | Rate limiting is already enforced globally by `@nestjs/throttler` (100 req/60s) on all backend endpoints, including `/auth/register`; no new endpoint is introduced by this plan, so no new attack surface |
| T-quick-04 | Information Disclosure (duplicate-account enumeration) | Backend `/auth/register` 409 response | accept | Backend already returns a single generic `'Email or phone already registered'` message with no per-field distinction — this plan surfaces that message as-is via `getErrorMessage`, introducing no new enumeration surface beyond what web already exposes |

</threat_model>

<verification>
1. `cd mobile && npx tsc --noEmit` passes with no new type errors after both tasks.
2. Manual read-through: `mobile/app/auth/register.tsx` calls `api.post('/auth/register', { email, phone, password, firstName, lastName, ndpaConsent })` with no `role`/`channel` fields, stores tokens via `SecureStore.setItemAsync`, and navigates to `/(tabs)` on success.
3. Manual read-through: the CTA in `register.tsx` is disabled whenever `consent` is `false`, regardless of other field validity.
4. Manual read-through: `mobile/app/onboarding.tsx` and `mobile/app/auth/email.tsx` each contain a reachable link to `/auth/register`, and `mobile/app/_layout.tsx` registers `auth/register` as a `Stack.Screen`.
</verification>

<success_criteria>
- A new mobile user can create an account with email+password, providing name/email/phone/password and explicit NDPA consent, and lands on `/(tabs)` immediately after successful registration — using the same backend `POST /auth/register` endpoint the web app uses.
- The registration screen is reachable from both `mobile/app/onboarding.tsx` (new-user path) and `mobile/app/auth/email.tsx` (existing-user-realizes-they-need-to-sign-up path).
- The NDPA consent checkbox gates submission client-side, backed by the backend's own independent enforcement.
- No backend files are modified.
- `cd mobile && npx tsc --noEmit` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-aym-add-mobile-email-password-registration-s/260727-aym-SUMMARY.md`
</output>
</content>
