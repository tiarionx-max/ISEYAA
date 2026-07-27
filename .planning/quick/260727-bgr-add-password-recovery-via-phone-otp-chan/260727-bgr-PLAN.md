---
phase: quick
plan: 260727-bgr
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/auth.controller.ts
  - backend/src/modules/auth/dto/reset-password.dto.ts
  - backend/src/modules/users/users.controller.ts
  - backend/src/modules/users/users.service.ts
  - backend/src/modules/users/dto/change-password.dto.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/users/__tests__/users.service.spec.ts
  - mobile/app/auth/forgot-password.tsx
  - mobile/app/auth/reset-password.tsx
  - mobile/app/change-password.tsx
  - mobile/app/auth/email.tsx
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/_layout.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user who forgot their password can request an OTP to their phone, enter it along with a new password, and is automatically signed in on success — no email delivery involved"
    - "A logged-in user can change their password by providing their current password and a new one, without being logged out"
    - "Logging out on mobile revokes the refresh token server-side via POST /auth/logout, not just a local SecureStore clear"
    - "The OTP lockout/attempt-counting logic is shared between OTP-verify-for-registration and OTP-verify-for-password-reset, with no duplicated redis logic"
    - "The existing verifyOtp behavior and its test suite are unchanged by the refactor"
  artifacts:
    - path: "backend/src/modules/auth/dto/reset-password.dto.ts"
      provides: "ResetPasswordDto: phone, otp, newPassword"
      contains: "class ResetPasswordDto"
    - path: "backend/src/modules/auth/auth.service.ts"
      provides: "consumeValidOtp shared helper + resetPassword method"
      contains: "consumeValidOtp"
    - path: "backend/src/modules/users/dto/change-password.dto.ts"
      provides: "ChangePasswordDto: currentPassword, newPassword"
      contains: "class ChangePasswordDto"
    - path: "backend/src/modules/users/users.service.ts"
      provides: "changePassword method"
      contains: "changePassword"
    - path: "mobile/app/auth/forgot-password.tsx"
      provides: "Phone-entry screen that requests an OTP via POST /auth/otp/send"
      min_lines: 100
    - path: "mobile/app/auth/reset-password.tsx"
      provides: "OTP + new-password entry screen that calls POST /auth/reset-password and auto-logs the user in"
      min_lines: 120
    - path: "mobile/app/change-password.tsx"
      provides: "Logged-in current/new password screen calling PATCH /users/me/password"
      min_lines: 100
  key_links:
    - from: "mobile/app/auth/forgot-password.tsx"
      to: "backend POST /auth/otp/send"
      via: "api.post('/auth/otp/send', { phone })"
      pattern: "api\\.post\\(.\\/auth\\/otp\\/send"
    - from: "mobile/app/auth/reset-password.tsx"
      to: "backend POST /auth/reset-password"
      via: "api.post('/auth/reset-password', { phone, otp, newPassword })"
      pattern: "api\\.post\\(.\\/auth\\/reset-password"
    - from: "backend/src/modules/auth/auth.service.ts resetPassword"
      to: "backend/src/modules/auth/auth.service.ts consumeValidOtp"
      via: "shared OTP validation/consumption helper call"
      pattern: "consumeValidOtp\\("
    - from: "mobile/app/change-password.tsx"
      to: "backend PATCH /users/me/password"
      via: "api.patch('/users/me/password', { currentPassword, newPassword }) with Bearer auth via the shared axios interceptor"
      pattern: "api\\.patch\\(.\\/users\\/me\\/password"
    - from: "mobile/app/(tabs)/profile.tsx handleLogout"
      to: "backend POST /auth/logout"
      via: "api.post('/auth/logout', { refreshToken }) called before SecureStore tokens are cleared"
      pattern: "api\\.post\\(.\\/auth\\/logout"
---

<objective>
Close three mobile-completeness gaps found in the 2026-07-27 audit (STATE.md Blockers/Concerns): (1) no password-recovery path exists anywhere for email/password accounts, (2) no change-password flow exists for logged-in users, (3) mobile logout only clears local tokens and never revokes the refresh token server-side. Password reset uses phone OTP (not email) — Resend/SendGrid email delivery is not yet production-provisioned (`RESEND_API_KEY` unset per STATE.md), while the Termii/Twilio SMS OTP pipeline used for phone login/registration is already production-proven.

Purpose: Give ISEYAA mobile users a working password-recovery and password-change path, and make logout actually revoke sessions server-side instead of silently leaving refresh tokens valid.
Output: New backend `POST /auth/reset-password` and `PATCH /users/me/password` endpoints (backed by a shared, refactored OTP-validation helper); new mobile screens `auth/forgot-password.tsx`, `auth/reset-password.tsx`, `change-password.tsx`; a logout fix and a new profile menu entry.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection (2026-07-27, branch `microservices-redesign`):

**Backend — `backend/src/modules/auth/auth.service.ts` (496 lines, full file read):**
- Constants: `OTP_TTL = 300` (5 min), `OTP_LOCK_TTL = 900` (15 min), `OTP_MAX_ATTEMPTS = 3`, `USER_SELECT` (lines 31-45, a safe projection excluding `passwordHash`).
- `sendOtp(dto: OtpSendDto)` (lines 135-159) is already generic/reusable as-is — keyed only on `dto.phone`, resolves channel from the user's persisted `otpChannel` or defaults to SMS. **Reuse unchanged** for the "request a reset code" step — no new send endpoint needed.
- `verifyOtp(dto: OtpVerifyDto)` (lines 242-274, exact current code):
  ```typescript
  async verifyOtp(dto: OtpVerifyDto) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');

    const stored = await this.redis.get(`otp:${dto.phone}`);
    if (!stored) throw new BadRequestException('OTP expired or not found');

    const { otp: storedOtp, attempts, channel, email } = this.decodeOtpValue(stored);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && dto.otp !== storedOtp) {
      await this.redis.del(`otp:${dto.phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (dto.otp !== storedOtp) {
      await this.redis.set(`otp:${dto.phone}`, this.encodeOtpValue(storedOtp, attempts + 1, channel, email), OTP_TTL);
      throw new BadRequestException(`Invalid OTP. ${OTP_MAX_ATTEMPTS - attempts - 1} attempt(s) remaining`);
    }

    await this.redis.del(`otp:${dto.phone}`);
    await this.prisma.user.update({ where: { phone: dto.phone }, data: { status: 'ACTIVE' } });
    return { message: 'OTP verified successfully' };
  }
  ```
  DO NOT reuse directly — it has a registration-specific side effect (`status: 'ACTIVE'`) and no password handling. Its redis validate/consume logic is the exact pattern to extract.
- `encodeOtpValue`/`decodeOtpValue` (lines 161-173) and `generateTokens(userId, role)` (lines 390-402) are existing private helpers, reusable by any method on this class.
- No `resetToken`/`resetTokenExpiry` field exists on `User` and none is needed — the Redis OTP TTL is the only expiry mechanism, identical to the existing phone-auth/registration flow.
- Constructor injects `prisma`, `redis`, `jwt`, `config`, `resilience`, `sendgrid` (all already available to any new method).

**Backend — `backend/src/modules/auth/auth.controller.ts` (76 lines, full file read):** routes are register/login/otp-send/otp-verify/phone-auth/refresh/logout, all public except `logout` (`@UseGuards(JwtAuthGuard)`). Pattern per route: `@Post(path)`, `@HttpCode(HttpStatus.OK)` (except register, which defaults 201), `@ApiOperation({ summary })`, delegate straight to `authService`.

**Backend — `backend/src/modules/auth/dto/register.dto.ts` and `dto/otp-verify.dto.ts` (both read in full):** decorator conventions confirmed — `@IsMobilePhone('en-NG')` for phone, `@IsString @Length(6,6)` for a 6-digit OTP string, `@IsString @MinLength(8)` for password.

**Backend — `backend/src/modules/users/users.controller.ts` (156 lines, full file) and `users.service.ts` (198 lines, full file):**
- `UsersController` is `@UseGuards(JwtAuthGuard)` at the class level, `@Controller('users')`. `updateMe` (`PATCH /users/me`) is the pattern to mirror for a new `PATCH /users/me/password` route — same `@CurrentUser() user: { userId: string }` decorator, same guard inheritance (no extra `@UseGuards` needed at the method level).
- `UsersService` has its own separate `USER_SELECT` (lines 13-32) that does **not** include `passwordHash` — any new method needing the hash must use a dedicated minimal `select: { id: true, passwordHash: true }` or an unselected `findUnique`, not the module's `USER_SELECT`.
- No `changePassword`/`change-password` exists anywhere in the backend today (confirmed via full-file reads of `users.controller.ts`, `users.service.ts`, `auth.controller.ts`).
- `UsersModule` (`backend/src/modules/users/users.module.ts`, full file, 11 lines): `controllers: [UsersController]`, `providers: [UsersService, KycService]` — no new provider needed, `bcrypt` is a plain import, not a DI token.

**Backend — existing test conventions confirmed by full reads:**
- `backend/src/modules/auth/__tests__/auth.service.spec.ts` (528 lines): mocks `PrismaService` (`findFirst`/`findUnique`/`create`/`update`/`updateMany`), `RedisService` (`get`/`set`/`del`/`exists`), `JwtService`, `ConfigService`, `ResilienceService`, `SendgridService`. `describe('verifyOtp', ...)` block (lines 321-363) has 5 passing tests asserting exact redis call args and thrown exception types — **must keep passing unmodified** after the refactor (the refactor must not change `verifyOtp`'s observable redis/exception behavior).
- `backend/src/modules/users/__tests__/users.service.spec.ts`: mocks `PrismaService` only (`findUnique`/`update`/`updateMany`, `auditLog.create`), `describe('methodName', ...)` block-per-method pattern.

**Mobile — `mobile/app/auth/email.tsx` (255 lines, full file), `mobile/app/auth/otp.tsx` (374 lines, full file), `mobile/app/auth/phone.tsx` (confirmed via targeted reads):**
- `email.tsx`'s `handleSignIn()` is the exact token-extraction/SecureStore/router.replace pattern for any post-auth screen: `const payload = res.data?.data ?? res.data ?? {}; const { accessToken, refreshToken } = payload; if (accessToken) { await SecureStore.setItemAsync('access_token', accessToken); if (refreshToken) await SecureStore.setItemAsync('refresh_token', refreshToken); registerForPushNotifications(); router.replace('/(tabs)' as any); }`.
- `email.tsx` currently has two secondary links after the password field/CTA: `altLink` ("Prefer a phone number? →"), a sign-up link (added by the immediately-prior quick task), and `backLink`. No "Forgot password?" link exists yet.
- `phone.tsx`'s phone-formatting + navigation pattern (exact code, reused verbatim):
  ```typescript
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  const formattedPhone = digitsOnly.startsWith('0')
    ? `+234${digitsOnly.slice(1)}`
    : digitsOnly.startsWith('+')
    ? digitsOnly
    : digitsOnly.length > 0
    ? `+234${digitsOnly}`
    : '';
  // ... on submit:
  const res = await api.post('/auth/otp/send', { phone: formattedPhone, channel, ...(channel === 'EMAIL' ? { email } : {}) });
  const payload = res.data?.data ?? res.data ?? {};
  const fallbackUsed = payload.fallbackUsed === true;
  router.push({ pathname: '/auth/otp', params: { phone: formattedPhone, fallbackUsed: String(fallbackUsed) } } as any);
  ```
  `phone.tsx` also has a channel picker (SMS/WhatsApp/Email `channelCard` row) — the new forgot-password screen does NOT need this picker; it should just call `POST /auth/otp/send` with `{ phone }` only, letting the backend resolve the existing user's persisted `otpChannel` automatically (exactly what `sendOtp` already does when `channel` is omitted).
  Reusable style/markup blocks: `inputWrapper` + `countryPill` (🇳🇬 +234 flag pill) + `phoneInput` row.
- `otp.tsx`'s reusable patterns: 60s countdown (`useEffect`+`setInterval`, `cooldown` state), resend (`api.post('/auth/otp/send', { phone })` resets `cooldown` to 60), 6-box tap-to-focus OTP input bound to a visually-hidden `TextInput` (lines 163-204: `otpRow`/`otpBox`/`otpBoxFocused`/`otpBoxFilled`/`hiddenInput` styles, `handleChange` digit-only slicing), resend row UI (`resendCooldown` vs `resendLink`), "← Change number"-style back link. Do NOT copy the NDPA consent checkbox (registration-specific, irrelevant here).

**Mobile — `mobile/lib/api.ts` (82 lines, full file):** exports `api` (axios instance with request interceptor injecting `Authorization: Bearer <access_token>` from SecureStore automatically, and a response interceptor that auto-refreshes on 401) and `getErrorMessage(err, fallback)` (flattens NestJS `class-validator` array-shaped `message` into a string — always route API errors through this before `Alert.alert`).

**Mobile — `mobile/lib/tokens.ts` (150 lines, full file):** exports `SURFACE_DEEP, SURFACE_MID, GOLD, GOLD_LINE, GOLD_DIM, CREAM, INK, INK_MID, INK_DIM, INK_FAINT, BORDER, SUCCESS_DIM, SUCCESS_TEXT, FONT_DISPLAY, FONT_MONO` used throughout auth screens.

**Mobile — `mobile/app/(tabs)/profile.tsx` (confirmed via targeted grep + read of lines 1-44 and 385-473):**
- Imports at top: `fetcher` only from `../../lib/api` (line 13) — no `api` import yet, must be added: `import { api, fetcher } from '../../lib/api'`.
- `lucide-react-native` import list (lines 30-43): `Check, CheckCircle, ChevronRight, Car, Shield, Ticket, ShoppingBag, Heart, Clock, Home, MessageSquare, type LucideProps` — no lock/key icon imported yet, must add `KeyRound`.
- `handleLogout` (lines 388-410, exact current code):
  ```typescript
  async function handleLogout() {
    Alert.alert('Sign out?', "You'll need to log in again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (Haptics) {
            try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) { /* silently skip */ }
          }
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
          router.replace('/onboarding' as any);
        },
      },
    ]);
  }
  ```
- `menuRows: MenuRowItem[]` array (lines 435-473) — 6 entries ending with `Security & ID` (`isLast: true`). New "Change Password" row must be appended, with `isLast: true` moved to it.

**Mobile — `mobile/app/_layout.tsx` (78 lines, full file):** `auth/phone`, `auth/otp`, `auth/email`, `auth/register` are registered consecutively (lines 64-67) as `<Stack.Screen name="auth/X" options={{ headerShown: false }} />`. Logged-in-only flat (non-nested) screens use `presentation: 'card'` with a real `title`, e.g. `<Stack.Screen name="kyc" options={{ title: 'Identity Verification', presentation: 'card' }} />` (line 48) — this is the pattern for the new `change-password` route (a logged-in profile action, not part of the `auth/*` flow).
</verified_facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — shared OTP-consume helper, password-reset endpoint, change-password endpoint</name>
  <files>backend/src/modules/auth/auth.service.ts, backend/src/modules/auth/auth.controller.ts, backend/src/modules/auth/dto/reset-password.dto.ts, backend/src/modules/users/users.controller.ts, backend/src/modules/users/users.service.ts, backend/src/modules/users/dto/change-password.dto.ts, backend/src/modules/auth/__tests__/auth.service.spec.ts, backend/src/modules/users/__tests__/users.service.spec.ts</files>
  <behavior>
    - `consumeValidOtp(phone, otp)`: throws `ForbiddenException` when locked (redis `otp_lock:{phone}` exists); throws `BadRequestException` when no OTP stored; on max-attempts-exceeded + wrong OTP, deletes the OTP key, sets the lock key (900s TTL), and throws `ForbiddenException`; on wrong OTP (not yet at max), increments the stored attempt count (preserving channel/email) and throws `BadRequestException` with a remaining-attempts message; on correct OTP, deletes the OTP key and resolves with no error.
    - `verifyOtp` (existing method): after refactor, behaves byte-for-byte identically to today — same redis calls, same exception types/messages, same final `user.update({ status: 'ACTIVE' })` + success message. The 5 existing tests in the `describe('verifyOtp', ...)` block must pass unmodified.
    - `resetPassword(dto)`: given a valid, unexpired OTP for `dto.phone` and an existing non-deleted user with that phone, hashes `dto.newPassword` with `bcrypt` (cost 12), updates the user's `passwordHash`, writes an audit log entry (`'PASSWORD_RESET'`), and returns `{ user, accessToken, refreshToken }` (tokens auto-issued via `generateTokens`). Given an invalid/expired/locked OTP, throws the same exception `consumeValidOtp` throws (via delegation) without touching the user record. Given a valid OTP but no matching user for that phone, throws `NotFoundException` without hashing/issuing tokens.
    - `changePassword(userId, currentPassword, newPassword)` (on `UsersService`): given a user with a `passwordHash` and a correct `currentPassword`, hashes `newPassword` (bcrypt cost 12), updates `passwordHash`, writes an audit log entry (`'PASSWORD_CHANGED'`), returns a success message — does NOT re-issue tokens (this is a logged-in action; existing session stays valid). Given an incorrect `currentPassword`, throws `UnauthorizedException('Current password is incorrect')` without updating anything. Given a user with no `passwordHash` (e.g. a phone-auto-registered account with a throwaway random hash), `bcrypt.compare` naturally fails and the same `UnauthorizedException` is thrown — this is correct behavior, not a bug, and needs no special-case code. Given an unknown `userId`, throws `NotFoundException`.
  </behavior>
  <action>
    In `backend/src/modules/auth/auth.service.ts`: add `import { NotFoundException } from '@nestjs/common';` to the existing `@nestjs/common` import list (alongside `Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException, Logger`). Add a new private method `consumeValidOtp(phone: string, otp: string): Promise<void>` by extracting the redis lock-check → get → decode → max-attempts-check → wrong-otp-check → delete-on-success logic straight out of the current `verifyOtp` body (see `<verified_facts>` for the exact current code to extract from) — use `phone`/`otp` parameters in place of `dto.phone`/`dto.otp`. Then rewrite `verifyOtp(dto: OtpVerifyDto)` to: `await this.consumeValidOtp(dto.phone, dto.otp);` followed by the existing `await this.prisma.user.update({ where: { phone: dto.phone }, data: { status: 'ACTIVE' } });` and `return { message: 'OTP verified successfully' };` — do not alter any other line of `verifyOtp`.

    Add `resetPassword(dto: ResetPasswordDto, ip?: string, ua?: string)`: call `await this.consumeValidOtp(dto.phone, dto.otp);` first (any thrown exception propagates untouched); then `const user = await this.prisma.user.findFirst({ where: { phone: dto.phone, deletedAt: null } });` and `if (!user) throw new NotFoundException('No account found for this phone number');`; then `const passwordHash = await bcrypt.hash(dto.newPassword, 12);` (matching `register()`'s exact cost factor); `const updated = await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: USER_SELECT });`; `await this.audit(user.id, 'PASSWORD_RESET', 'User', user.id, ip, ua);`; `const tokens = await this.generateTokens(updated.id, updated.role as UserRole);`; `return { user: updated, ...tokens };` — mirroring `register()`'s auto-login-after-creation pattern so mobile can sign the user straight in after a successful reset.

    Create `backend/src/modules/auth/dto/reset-password.dto.ts`: `ResetPasswordDto` with `phone` (`@IsMobilePhone('en-NG')`), `otp` (`@IsString @Length(6, 6)`, matching `OtpVerifyDto`'s exact decorator), `newPassword` (`@IsString @MinLength(8)`, matching `RegisterDto`'s password decorator).

    In `backend/src/modules/auth/auth.controller.ts`: import `ResetPasswordDto` from `./dto/reset-password.dto'`; add `@Post('reset-password') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Verify OTP and set a new password, then sign in' }) resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) { return this.authService.resetPassword(dto, req.ip, req.headers['user-agent']); }` — public, unguarded, placed after the existing `otpVerify` route, matching the `login`/`phoneAuth` `@HttpCode(HttpStatus.OK)` convention exactly (this is not a resource-creation POST).

    Create `backend/src/modules/users/dto/change-password.dto.ts`: `ChangePasswordDto` with `currentPassword` (`@IsString`), `newPassword` (`@IsString @MinLength(8)`).

    In `backend/src/modules/users/users.service.ts`: add `import * as bcrypt from 'bcrypt';` and add `UnauthorizedException` to the existing `@nestjs/common` import list. Add `changePassword(userId: string, currentPassword: string, newPassword: string)`: `const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true, passwordHash: true } });` (deliberately not the module's `USER_SELECT`, which omits `passwordHash`); `if (!user) throw new NotFoundException('User not found');`; `if (!user.passwordHash) throw new UnauthorizedException('Current password is incorrect');`; `const valid = await bcrypt.compare(currentPassword, user.passwordHash);`; `if (!valid) throw new UnauthorizedException('Current password is incorrect');`; `const passwordHash = await bcrypt.hash(newPassword, 12);`; `await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });`; `await this.prisma.auditLog.create({ data: { userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId } });`; `return { message: 'Password changed successfully' };`.

    In `backend/src/modules/users/users.controller.ts`: import `ChangePasswordDto` from `./dto/change-password.dto'`; add `@Patch('me/password') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Change password for the current logged-in user' }) changePassword(@CurrentUser() user: { userId: string }, @Body() dto: ChangePasswordDto) { return this.usersService.changePassword(user.userId, dto.currentPassword, dto.newPassword); }` — place it directly after `updateMe` (before the `// ── KYC endpoints` divider); no extra `@UseGuards` needed (the controller-level `@UseGuards(JwtAuthGuard)` already applies).

    In `backend/src/modules/auth/__tests__/auth.service.spec.ts`: add a `describe('resetPassword', ...)` block with tests covering: (a) propagates `ForbiddenException` when locked (mock `mockRedis.exists` true), (b) propagates `BadRequestException` when no OTP stored (mock `mockRedis.get` null), (c) throws `NotFoundException` when `consumeValidOtp` succeeds but `mockPrisma.user.findFirst` resolves null, (d) on full success (`mockRedis.get` returns a matching OTP string, `mockPrisma.user.findFirst` resolves a user, `mockPrisma.user.update` resolves the updated user, `mockJwt.signAsync` resolves tokens) asserts the returned shape includes `accessToken`/`refreshToken` and that `mockPrisma.user.update` was called with a bcrypt-hashed `passwordHash` (`expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.any(String) }) })`) and that `mockPrisma.auditLog.create` was called with `action: 'PASSWORD_RESET'`. Do NOT modify the existing `describe('verifyOtp', ...)` block.

    In `backend/src/modules/users/__tests__/users.service.spec.ts`: add a `describe('changePassword', ...)` block with tests covering: (a) throws `NotFoundException` when `mockPrisma.user.findUnique` resolves null, (b) throws `UnauthorizedException` when the resolved user has `passwordHash: null`, (c) throws `UnauthorizedException` when `bcrypt.compare` fails against a wrong `currentPassword` (use a real `bcrypt.hash` in the test fixture, mirroring `auth.service.spec.ts`'s `login` describe block pattern), (d) succeeds and calls `mockPrisma.user.update` with a new bcrypt hash plus `mockPrisma.auditLog.create` with `action: 'PASSWORD_CHANGED'` when `currentPassword` is correct.
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit && npm test</automated>
  </verify>
  <done>consumeValidOtp exists as a private AuthService helper; verifyOtp delegates to it and its 5 existing tests pass unmodified; POST /auth/reset-password and PATCH /users/me/password both exist, are wired to the new service methods, and are covered by new passing tests; the full backend jest suite passes; `npx tsc --noEmit` is clean.</done>
</task>

<task type="auto">
  <name>Task 2: Mobile — forgot-password, reset-password, change-password screens; logout fix; entry points</name>
  <files>mobile/app/auth/forgot-password.tsx, mobile/app/auth/reset-password.tsx, mobile/app/change-password.tsx, mobile/app/auth/email.tsx, mobile/app/(tabs)/profile.tsx, mobile/app/_layout.tsx</files>
  <action>
    Create `mobile/app/auth/forgot-password.tsx`, structurally mirroring `phone.tsx`'s scaffold (same imports, locally-duplicated `AdireOrnament` SVG component copy-pasted per this codebase's per-screen convention, `LinearGradient` background layers, `KeyboardAvoidingView` root, kicker/title/sub text block) but WITHOUT the channel picker — just the `inputWrapper` + `countryPill` (🇳🇬 +234) + `phoneInput` row using the exact `formattedPhone` derivation from `<verified_facts>`. Kicker: "RESET PASSWORD". Title: "Forgot your{'\n'}{italic}password?". Sub: a short line explaining a code will be sent to reset it. CTA "Send code →" (disabled until `formattedPhone.length >= 13` or while loading) calls `api.post('/auth/otp/send', { phone: formattedPhone })` (no `channel` field — let the backend resolve the existing user's persisted channel); on success, `router.push({ pathname: '/auth/reset-password', params: { phone: formattedPhone, fallbackUsed: String(payload.fallbackUsed === true) } } as any)`; on error, `getErrorMessage(err, 'Could not send code. Please try again.')` + `Alert.alert('Error', msg)`. Include a `backLink`-styled "← Back to sign in" → `router.back()`.

    Create `mobile/app/auth/reset-password.tsx`, reading `phone`/`fallbackUsed` via `useLocalSearchParams<{ phone: string; fallbackUsed?: string }>()` (mirroring `otp.tsx`). Mirror `otp.tsx`'s 60s cooldown state/effect, 6-box tap-to-focus hidden-input OTP entry (`otpRow`/`otpBox`/`otpBoxFocused`/`otpBoxFilled`/`hiddenInput` styles + `handleChange` digit-only slicing to 6 chars), resend row (`resend()` re-calls `api.post('/auth/otp/send', { phone })`, resets cooldown to 60), and the optional fallback banner block (reuse `otp.tsx`'s `fallbackBanner` markup/styles verbatim) driven by local `fallbackUsed` state seeded from the `fallbackUsedParam` search param. Below the OTP boxes, add a `newPassword` input (`inputWrapper` row, `secureTextEntry` toggled by `Eye`/`EyeOff` from `lucide-react-native` exactly as `email.tsx` does) and a `confirmPassword` input (same style, `secureTextEntry` fixed to match `newPassword`'s current toggle state). Do NOT auto-submit on the 6th OTP digit like `otp.tsx` does — this screen needs the password fields too, so use an explicit CTA button "Reset password →" gated on `code.length === 6 && newPassword.length >= 8 && newPassword === confirmPassword && !loading`. On press, call `api.post('/auth/reset-password', { phone, otp: code, newPassword })`; on success, extract `accessToken`/`refreshToken` from `res.data?.data ?? res.data ?? {}` exactly like `email.tsx`'s `handleSignIn()`, store both via `SecureStore.setItemAsync`, call `registerForPushNotifications()`, then `router.replace('/(tabs)' as any)`; on error, `getErrorMessage(err, 'Could not reset password. Please try again.')` + `Alert.alert('Reset failed', msg)`, and clear `code` (mirroring `otp.tsx`'s error-path `setCode('')`). If `newPassword !== confirmPassword` and the user attempts submit, show an inline validation message (do not silently block with no feedback — mirror the disabled-CTA pattern but also handle the case where a user taps a disabled button expecting feedback by rendering a small helper text below the confirm field when both fields are non-empty and mismatched).

    Create `mobile/app/change-password.tsx` (a logged-in, non-`auth/`-namespaced screen). Structurally mirror `email.tsx`'s scaffold minus the `AdireOrnament`/gradient hero treatment (this is a utilitarian settings screen reached from a Stack push with a real header, per `_layout.tsx`'s `kyc`-style registration — no need for the full auth-flow visual treatment; a simpler `SURFACE_DEEP` background with the same `inputWrapper`/`cta` styles is sufficient). Fields: `currentPassword`, `newPassword`, `confirmPassword` (all `inputWrapper` rows with `Eye`/`EyeOff` toggle exactly as `email.tsx`'s password field). CTA "Update password" gated on `currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !loading`. On press, `api.patch('/users/me/password', { currentPassword, newPassword })` (the shared `api` instance already injects the Bearer access token via its request interceptor — no manual header needed); on success, `Alert.alert('Success', 'Your password has been updated.', [{ text: 'OK', onPress: () => router.back() }])`; on error, `getErrorMessage(err, 'Could not update password. Please try again.')` + `Alert.alert('Update failed', msg)`. Always reset `loading` in `finally`.

    In `mobile/app/auth/email.tsx`: add a new `TouchableOpacity` between the password `inputWrapper` (ends at the current line ~141) and the CTA button, styled `forgotLink` (`alignSelf: 'flex-end', marginBottom: 8`) / `forgotLinkText` (`fontSize: 13, color: GOLD, fontWeight: '600'`), reading "Forgot password? →", wired to `router.push('/auth/forgot-password' as any)`.

    In `mobile/app/(tabs)/profile.tsx`: add `KeyRound` to the existing `lucide-react-native` import list (alongside `Check, CheckCircle, ChevronRight, Car, Shield, Ticket, ShoppingBag, Heart, Clock, Home, MessageSquare`). Change the `../../lib/api` import from `{ fetcher }` to `{ api, fetcher }`. Append a new entry to the `menuRows` array after the existing `Security & ID` entry: `{ icon: KeyRound, label: 'Change Password', sub: 'Update your account password', onPress: () => router.push('/change-password' as any), isLast: true }` — and remove `isLast: true` from the now-preceding `Security & ID` entry so only the new last row carries it. Fix `handleLogout`: inside the `'Sign Out'` button's `onPress`, before the two `SecureStore.deleteItemAsync` calls, add: read `const refreshToken = await SecureStore.getItemAsync('refresh_token');` then, in a try/catch that does NOT block or fail the logout on error (best-effort — the user must still be logged out locally even if offline), `if (refreshToken) { try { await api.post('/auth/logout', { refreshToken }); } catch (_) { /* best-effort — proceed with local logout regardless */ } }`.

    In `mobile/app/_layout.tsx`: add `<Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />` and `<Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />` immediately after the existing `<Stack.Screen name="auth/register" options={{ headerShown: false }} />` line, matching the `auth/*` registration pattern exactly. Add `<Stack.Screen name="change-password" options={{ title: 'Change Password', presentation: 'card' }} />` as a flat top-level entry, placed near the other logged-in-only flat entries (e.g. immediately after the `kyc` entry), matching that entry's exact `title`/`presentation` convention.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>mobile/app/auth/forgot-password.tsx sends an OTP via POST /auth/otp/send and navigates to reset-password with the phone number. mobile/app/auth/reset-password.tsx accepts a 6-digit OTP plus a new/confirm password pair, calls POST /auth/reset-password, and auto-logs the user in via SecureStore + router.replace('/(tabs)') on success. mobile/app/change-password.tsx accepts current/new/confirm password fields and calls PATCH /users/me/password while logged in. mobile/app/auth/email.tsx has a working "Forgot password?" link. mobile/app/(tabs)/profile.tsx has a "Change Password" menu row and its handleLogout now calls POST /auth/logout with the stored refresh token (best-effort) before clearing SecureStore. mobile/app/_layout.tsx registers all three new routes. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile app → backend `/auth/reset-password` | Unauthenticated endpoint accepting phone + OTP + new password — an attacker who can intercept/guess an OTP could take over an account |
| Mobile app → backend `/users/me/password` | Authenticated endpoint accepting current + new password — protects against session-hijack-only attackers lacking the current password |
| Mobile app → backend `/auth/logout` | Authenticated endpoint that revokes a refresh token server-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Spoofing (OTP brute-force on password reset) | `AuthService.consumeValidOtp` via `resetPassword` | mitigate | Reuses the exact same 3-attempt/15-minute-lockout logic already enforced for registration/login OTP verification — no new brute-force surface introduced |
| T-quick-02 | Elevation of Privilege (account takeover via reset) | `AuthService.resetPassword` | mitigate | Requires possession of the phone's OTP delivery channel (SMS/WhatsApp/Email, already gated by Termii/Meta/Resend deliverability) before any password change is accepted; on success, old sessions are not proactively revoked (accepted risk below) |
| T-quick-03 | Repudiation (no audit trail for password changes) | `resetPassword` / `changePassword` | mitigate | Both write an `AuditLog` entry (`PASSWORD_RESET` / `PASSWORD_CHANGED`) via the existing `prisma.auditLog.create` pattern, matching every other sensitive action in `auth.service.ts` |
| T-quick-04 | Tampering (current-password bypass on change-password) | `UsersService.changePassword` | mitigate | `bcrypt.compare` against the stored hash is mandatory before any update; a null `passwordHash` (phone-auto-registered accounts) fails closed via the same `UnauthorizedException`, not an open bypass |
| T-quick-05 | Information Disclosure (phone-number enumeration via reset-password 404) | `AuthService.resetPassword` `NotFoundException` path | accept | This path is only reachable after a valid OTP for that phone was already consumed — in practice an attacker without control of the phone's OTP channel can never reach it, so it adds no enumeration surface beyond what `sendOtp` already exposes |
| T-quick-06 | Elevation of Privilege (stale sessions surviving a password reset) | `AuthService.resetPassword` | accept | Existing refresh tokens issued before the reset remain valid until their own expiry/blacklist — this mirrors the current `login()`/`phoneAuth()` behavior (neither invalidates other sessions either) and is out of scope for this fix; flagged here as a known gap, not silently ignored |
| T-quick-07 | Repudiation (logout not revoking server-side) | `mobile/app/(tabs)/profile.tsx` `handleLogout` | mitigate | This plan's core fix — `POST /auth/logout` with the stored `refreshToken` is now called (best-effort) before local tokens are cleared, using the already-implemented server-side blacklist in `AuthService.logout` |

</threat_model>

<verification>
1. `cd backend && npx tsc --noEmit && npm test` passes, including new `resetPassword`/`changePassword` tests and the unmodified `verifyOtp` tests.
2. `cd mobile && npx tsc --noEmit` passes with no new type errors.
3. Manual read-through: `AuthService.verifyOtp` and the new `AuthService.resetPassword` both delegate to the same `consumeValidOtp` private helper — no duplicated redis lock/attempt logic exists in the file.
4. Manual read-through: `mobile/app/auth/reset-password.tsx` extracts `accessToken`/`refreshToken` from the `/auth/reset-password` response and stores them via `SecureStore.setItemAsync` before navigating to `/(tabs)`.
5. Manual read-through: `mobile/app/(tabs)/profile.tsx`'s `handleLogout` calls `api.post('/auth/logout', { refreshToken })` inside a try/catch, before (not instead of) clearing SecureStore tokens.
6. Manual read-through: `mobile/app/_layout.tsx` registers `auth/forgot-password`, `auth/reset-password`, and `change-password` as `Stack.Screen` entries.
</verification>

<success_criteria>
- A mobile user who forgot their password can request an OTP by phone, enter it with a new password, and land signed-in on `/(tabs)` — using the phone OTP channel already proven for login/registration, not email.
- A logged-in mobile user can change their password given their current password, without being signed out.
- Logging out on mobile now revokes the refresh token server-side via `POST /auth/logout`, in addition to clearing local SecureStore tokens.
- The OTP validate-and-consume logic (redis lockout/attempt-counting) is defined exactly once in `AuthService` and shared by `verifyOtp` and `resetPassword`.
- The existing `verifyOtp` test suite passes unmodified, proving the refactor is behavior-preserving.
- No backend files outside `backend/src/modules/auth` and `backend/src/modules/users` are touched; no web (`web/`) files are touched.
- `cd backend && npx tsc --noEmit && npm test` and `cd mobile && npx tsc --noEmit` both pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-bgr-add-password-recovery-via-phone-otp-chan/260727-bgr-SUMMARY.md`
</output>
