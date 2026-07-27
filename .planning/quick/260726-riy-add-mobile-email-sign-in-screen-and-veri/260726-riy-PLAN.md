---
phase: quick
plan: 260726-riy
type: execute
wave: 1
depends_on: []
files_modified:
  - web/src/lib/auth.ts
  - web/src/app/login/page.tsx
  - mobile/app/auth/email.tsx
  - mobile/app/onboarding.tsx
  - mobile/app/_layout.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user can sign in on the web app with email+password and land on /dashboard with a real NextAuth session containing a backend accessToken"
    - "A user can sign in on the mobile app with email+password (not just phone OTP) and land on the authenticated tab area"
    - "The mobile email sign-in screen is reachable from the app's existing entry flow (onboarding), not just by manual deep link"
    - "On successful mobile email sign-in, access/refresh tokens are persisted via expo-secure-store the same way the phone-OTP flow persists them, so the axios interceptor's refresh logic keeps working"
  artifacts:
    - path: "mobile/app/auth/email.tsx"
      provides: "Email+password sign-in screen: form, POST /auth/login call, token storage, navigation to /(tabs)"
      min_lines: 100
    - path: "mobile/app/onboarding.tsx"
      provides: "Navigation entry point linking to the new email sign-in screen"
      contains: "auth/email"
    - path: "mobile/app/_layout.tsx"
      provides: "Stack.Screen route registration for auth/email"
      contains: "auth/email"
  key_links:
    - from: "mobile/app/auth/email.tsx"
      to: "backend POST /api/v1/auth/login"
      via: "api.post('/auth/login', { identifier, password }) using the shared axios instance in mobile/lib/api.ts"
      pattern: "api\\.post\\(.\\/auth\\/login"
    - from: "mobile/app/onboarding.tsx"
      to: "mobile/app/auth/email.tsx"
      via: "router.push('/auth/email')"
      pattern: "auth/email"
    - from: "mobile/app/auth/email.tsx"
      to: "expo-secure-store"
      via: "SecureStore.setItemAsync('access_token', ...) / ('refresh_token', ...) mirroring otp.tsx's post-login pattern"
      pattern: "SecureStore\\.setItemAsync"
    - from: "web/src/app/login/page.tsx"
      to: "web/src/lib/auth.ts CredentialsProvider.authorize()"
      via: "signIn('credentials', { email, password, redirect: false })"
      pattern: "signIn\\('credentials'"
---

<objective>
Backend email+password login (`POST /auth/login` with `{identifier, password}`) is already implemented, correct, and tested — no backend changes in this plan. Two gaps remain: (1) the web app's NextAuth credentials flow is wired on paper but has never been exercised end-to-end against a live backend, and (2) the mobile app has no email+password sign-in screen at all — only phone+OTP.

This plan (a) proves the web email login path actually works end-to-end and fixes it if broken, and (b) adds a mobile email+password sign-in screen, wires it to the backend, and adds a navigation entry point so users can reach it.

Purpose: Give ISEYAA users a working email+password login path on both web and mobile, matching what already exists for phone+OTP on mobile.
Output: Verified (and if needed, fixed) `web/src/lib/auth.ts` / `web/src/app/login/page.tsx`; new `mobile/app/auth/email.tsx` screen; updated `mobile/app/onboarding.tsx` and `mobile/app/_layout.tsx` for navigation and routing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection (2026-07-26, branch `microservices-redesign`):

- Backend: `backend/src/modules/auth/auth.service.ts` `login()` accepts `LoginDto { identifier: string, password: string }` (`backend/src/modules/auth/dto/login.dto.ts`), queries `User` by `email` OR `phone` via `prisma.user.findFirst({ where: { OR: [{ email: dto.identifier }, { phone: dto.identifier }] } } })`, bcrypt-compares, issues JWT. Registration (`RegisterDto`) requires `email`, `phone` (`en-NG` mobile format, e.g. `+2348011122233`), `password` (min 8 chars), `firstName`, `lastName`, `ndpaConsent: boolean`. Do not modify any file under `backend/`.
- Web: `web/src/app/login/page.tsx` collects `email`+`password` state and calls `signIn('credentials', { email, password, redirect: false })`. `web/src/lib/auth.ts` `CredentialsProvider.authorize()` posts `{ identifier: credentials?.email || credentials?.phone, password: credentials?.password }` to `${NEXT_PUBLIC_API_URL}/auth/login` (defaults to `http://localhost:3001/api/v1` if unset), returns a user object with `accessToken`/`refreshToken`/`role` on success, `null` on any failure. `jwt()`/`session()` callbacks propagate `accessToken`, `role`, `id` onto the session. `NEXTAUTH_SECRET` defaults to `'iseyaa-dev-secret'` if unset (line 91 of `auth.ts`) — no `web/.env*` file exists, and `web/package.json`'s `dev` script is plain `next dev` with no root `.env` loading, so these defaults are what's actually active in local dev.
- Root `.env` (repo root, not committed) has `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` already set for local Postgres/Redis on default ports. `docker-compose.yml` defines `postgres` (5432) and `redis` (6379) services with healthchecks.
- Mobile: `mobile/app/auth/phone.tsx` (phone+OTP send) and `mobile/app/auth/otp.tsx` (OTP verify, ~line 61-68 does the post-login token-store/push-register/redirect sequence) are the only existing auth screens. `mobile/lib/api.ts` exports a shared `api` axios instance (baseURL from `EXPO_PUBLIC_API_URL`, default `http://localhost:3001/api/v1`), a request interceptor injecting the stored `access_token`, a response interceptor that transparently refreshes on 401, and `getErrorMessage(err, fallback)` for safely extracting NestJS `class-validator` array-shaped error messages. There is no dedicated "auth API helper" file — every existing screen calls `api.post(...)` directly inline; follow that same convention for consistency (no new `mobile/lib/auth-api.ts` needed).
- Mobile screens are explicitly registered as routes in `mobile/app/_layout.tsx`'s `<Stack>` — `auth/phone` and `auth/otp` each have their own `<Stack.Screen name="..." options={{ headerShown: false }} />` line (lines 64-65). A new `auth/email` screen needs the same treatment or expo-router will not know how to present it without a header.
- `mobile/app/onboarding.tsx` is the current entry screen (redirected to from `_layout.tsx` when no `access_token` is stored). Its only sign-in CTA today is `handlePhonePress()` → `router.push('/auth/phone')`, wrapped in try/catch with an `Alert.alert('Coming soon', ...)` fallback pattern — the Apple/Google buttons use the same "coming soon" Alert pattern since those aren't implemented.
- `mobile/lib/tokens.ts` exports the design tokens (`SURFACE_DEEP`, `GOLD`, `CREAM`, `FONT_DISPLAY`, `FONT_MONO`, etc.) reused across `phone.tsx`/`otp.tsx`/`onboarding.tsx`. `lucide-react-native` is already a dependency (`Mail`, `MessageSquare`, `MessageCircle` icons used in `phone.tsx`) and also exports `Eye`/`EyeOff` (used identically in the web login page via `lucide-react`, same icon set family).
- `mobile/package.json` has a `typecheck` script (`tsc --noEmit`) — no existing test files cover `phone.tsx`/`otp.tsx`/`onboarding.tsx` (mobile Jest tests only exist for `mobile/lib/__tests__/*.test.ts` store/config logic, not screens), so `typecheck` is the appropriate automated gate for the new/modified screens in this plan.
</verified_facts>

<mobile_screen_pattern_reference>
`otp.tsx` post-login sequence to mirror exactly in the new screen (imports: `import * as SecureStore from 'expo-secure-store';`, `import { registerForPushNotifications } from '../../lib/push-notifications';`, `import { router } from 'expo-router';`):

```typescript
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
```

`phone.tsx` visual scaffold to mirror (background gradients, `AdireOrnament`, `KeyboardAvoidingView`, kicker/title/sub text block, `styles.inputWrapper`/`styles.cta`/`styles.backLink` style objects) — copy the structural pattern, swap phone-number input for email + password inputs.
</mobile_screen_pattern_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify (and fix if broken) web email login end-to-end</name>
  <files>web/src/lib/auth.ts, web/src/app/login/page.tsx</files>
  <action>
    Prove the full NextAuth credentials sign-in path actually works against a live backend — do not shortcut by calling `/auth/login` directly, exercise the real `/api/auth/csrf` → `/api/auth/callback/credentials` → `/api/auth/session` chain that `signIn('credentials', ...)` triggers from `web/src/app/login/page.tsx`.

    1. Start Postgres+Redis: `docker compose up -d postgres redis` (repo root), wait for `docker compose ps` to show both healthy.
    2. `npm run prisma:generate` (safe no-op if already current).
    3. Start the backend in the background: `npm run dev:backend`. Poll `curl -s http://localhost:3001/api/v1/lgas` until it returns HTTP 200 (allow up to ~30s for NestJS boot).
    4. Start the web app in the background: `npm run dev:web`. Poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login` until it returns HTTP 200.
    5. Register a throwaway test user directly against the backend for known-good credentials: `curl -s -X POST http://localhost:3001/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"quicktest-260726@iseyaa.local","phone":"+2348011122233","password":"TestPass123!","firstName":"Quick","lastName":"Test","ndpaConsent":true}'`. If email/phone collide from a prior run, vary the local-part/last digit and retry.
    6. Exercise the real NextAuth flow:
       a. `curl -s -c cookies.txt http://localhost:3000/api/auth/csrf` — parse `csrfToken` from the JSON response.
       b. `curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "email=quicktest-260726@iseyaa.local" --data-urlencode "password=TestPass123!" --data-urlencode "csrfToken=<token from 6a>" --data-urlencode "json=true"`.
       c. `curl -s -b cookies.txt http://localhost:3000/api/auth/session` — must return JSON containing a non-null `user.email` matching the test user and a populated `accessToken` field.
    7. If step 6c fails (empty session, missing `accessToken`, or an `error` field): read backend and Next.js dev-server console output to diagnose. Check first: `NEXT_PUBLIC_API_URL` resolution, `NEXTAUTH_SECRET` resolution, the `identifier: credentials?.email || credentials?.phone` mapping in `web/src/lib/auth.ts`, and that `web/src/app/login/page.tsx` calls `signIn('credentials', { email, password, redirect: false })` with matching field names. Apply the minimal fix in one or both of the two files listed above, restart the web dev server, and re-run step 6 until it passes. Do not modify any other file, and do not touch `backend/`.
    8. Stop the background backend/web processes when verification passes (`docker compose stop postgres redis` optional — leaving local dev DB/Redis running is fine).
  </action>
  <verify>
    <automated>curl -s -b cookies.txt http://localhost:3000/api/auth/session | grep -q '"accessToken"' && echo PASS || echo FAIL</automated>
  </verify>
  <done>GET /api/auth/session (after the real csrf → callback/credentials flow) returns a JSON session containing `accessToken` and a `user.email` matching the registered test user. Any bug found in web/src/lib/auth.ts or web/src/app/login/page.tsx is fixed and the flow re-verified passing end-to-end.</done>
</task>

<task type="auto">
  <name>Task 2: Add mobile email+password sign-in screen, wire it to the backend, and add a navigation entry point</name>
  <files>mobile/app/auth/email.tsx, mobile/app/onboarding.tsx, mobile/app/_layout.tsx</files>
  <action>
    Create `mobile/app/auth/email.tsx` as a new sign-in screen, structurally mirroring `mobile/app/auth/phone.tsx`'s visual scaffold (same `AdireOrnament`, gradient backgrounds, `KeyboardAvoidingView`, kicker/title/sub text pattern, `styles.inputWrapper`/`styles.cta`/`styles.backLink` conventions from `mobile/lib/tokens.ts`) but collecting email+password instead of a phone number:
    - Email `TextInput`: `keyboardType="email-address"`, `autoCapitalize="none"`, placeholder `you@example.com`.
    - Password `TextInput`: `secureTextEntry` toggled by an `Eye`/`EyeOff` icon button from `lucide-react-native` (mirrors the show/hide toggle pattern in `web/src/app/login/page.tsx`), placeholder `••••••••••`.
    - Readiness gate: `isReady = /\S+@\S+\.\S+/.test(email) && password.length >= 8`.
    - `handleSignIn()`: `setLoading(true)`; call `api.post('/auth/login', { identifier: email, password })` (imported from `../../lib/api`, same convention as `phone.tsx`/`otp.tsx` — no new API helper file); on success extract `accessToken`/`refreshToken` from `res.data?.data ?? res.data ?? {}`, store both via `SecureStore.setItemAsync` (import `* as SecureStore from 'expo-secure-store'`), call `registerForPushNotifications()` (import from `../../lib/push-notifications`), then `router.replace('/(tabs)' as any)` — exactly mirroring `otp.tsx`'s post-verify sequence (see `<mobile_screen_pattern_reference>` in context). On error, use `getErrorMessage(err, 'Invalid email or password.')` from `../../lib/api` and `Alert.alert('Sign in failed', msg)`. Always `setLoading(false)` in a `finally` block.
    - Include a `← Back to welcome` link (`router.back()`, same as `phone.tsx`) and a secondary link `Prefer a phone number? →` that does `router.push('/auth/phone' as any)`.

    In `mobile/app/onboarding.tsx`, add a new secondary CTA below the existing social-sign-in row (near the `Terms`/`termsText` block) — e.g. a `TouchableOpacity` with text `Sign in with email instead` that does `router.push('/auth/email' as any)`, wrapped in the same try/catch + `Alert.alert('Coming soon', ...)` fallback pattern `handlePhonePress()` already uses (for consistency, even though this route now exists and the catch branch should never fire). Add a corresponding style entry following the existing `termsText`/`termsLink` style conventions.

    In `mobile/app/_layout.tsx`, add `<Stack.Screen name="auth/email" options={{ headerShown: false }} />` immediately after the existing `<Stack.Screen name="auth/otp" options={{ headerShown: false }} />` line (line 65), so expo-router presents it correctly (matching the `auth/phone`/`auth/otp` registration pattern).
  </action>
  <verify>
    <automated>cd mobile && npm run typecheck</automated>
  </verify>
  <done>mobile/app/auth/email.tsx exists, collects email+password, calls POST /auth/login via the shared api instance, stores accessToken/refreshToken via expo-secure-store on success, and navigates to /(tabs). mobile/app/onboarding.tsx has a working link to /auth/email. mobile/app/_layout.tsx registers the auth/email route. `npm run typecheck --workspace=mobile` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile app → backend `/auth/login` | User-supplied email+password crosses from the mobile client into the existing, already-hardened backend login endpoint |
| Web browser → NextAuth → backend `/auth/login` | Same credentials crossing from browser form submission through NextAuth's server-side `authorize()` proxy call |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | `mobile/app/auth/email.tsx` password field | mitigate | `secureTextEntry` on by default with an explicit user-triggered toggle only (mirrors the existing web pattern); password value never logged, never persisted to AsyncStorage — only the resulting JWT is written to `expo-secure-store` (hardware-backed secure enclave), matching the existing phone-OTP flow's token-storage pattern |
| T-quick-02 | Spoofing (credential stuffing) | Backend `/auth/login` | accept | Rate limiting is already enforced globally by `@nestjs/throttler` (100 req/60s) on all backend endpoints, including `/auth/login`; no new endpoint is introduced by this plan, so no new attack surface — out of scope to add endpoint-specific throttling here |
| T-quick-03 | Tampering (test artifact) | Throwaway test user created in Task 1 verification | accept | Registered against local/dev Postgres only, with an `@iseyaa.local` email that cannot receive real mail and a random password; no production data touched, no cleanup script needed for local dev DB |

</threat_model>

<verification>
1. Web: `curl -s -b cookies.txt http://localhost:3000/api/auth/session` returns JSON containing `accessToken` and a matching `user.email`, produced via the real csrf → callback/credentials → session NextAuth chain against a live backend.
2. Mobile: `cd mobile && npm run typecheck` passes with the new `mobile/app/auth/email.tsx` and modified `onboarding.tsx`/`_layout.tsx`.
3. Manual read-through: `mobile/app/auth/email.tsx` calls `api.post('/auth/login', { identifier, password })`, stores tokens via `SecureStore.setItemAsync`, and navigates to `/(tabs)` on success — matching `otp.tsx`'s existing pattern.
4. Manual read-through: `mobile/app/onboarding.tsx` has a reachable link to `/auth/email`, and `mobile/app/_layout.tsx` registers `auth/email` as a `Stack.Screen`.
</verification>

<success_criteria>
- Web email+password login is proven to work end-to-end against a live backend (or was broken and is now fixed), verified via the real NextAuth csrf/callback/session flow.
- Mobile users can sign in with email+password via a new `mobile/app/auth/email.tsx` screen, reachable from `mobile/app/onboarding.tsx`, using the same POST /auth/login backend endpoint the web app uses.
- On successful mobile email sign-in, tokens are stored via expo-secure-store and the user lands on `/(tabs)`, matching the existing phone-OTP flow's behavior.
- No backend files are modified.
- `npm run typecheck --workspace=mobile` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260726-riy-add-mobile-email-sign-in-screen-and-veri/260726-riy-SUMMARY.md`
</output>
