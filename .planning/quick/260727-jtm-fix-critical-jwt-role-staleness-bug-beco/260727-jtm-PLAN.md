---
phase: quick
plan: 260727-jtm
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/modules/auth/auth.service.ts
  - backend/src/modules/auth/__tests__/auth.service.spec.ts
  - backend/src/modules/users/users.module.ts
  - backend/src/modules/users/users.service.ts
  - backend/src/modules/users/__tests__/users.service.spec.ts
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/driver-dashboard.tsx
  - mobile/app/driver-application.tsx
  - mobile/app/organiser-dashboard.tsx
  - mobile/app/event-create.tsx
  - mobile/app/event-edit/[id].tsx
  - mobile/app/vendor-orders.tsx
  - mobile/app/product-create.tsx
  - mobile/app/product-edit/[id].tsx
  - mobile/app/property-create.tsx
  - mobile/app/property-edit/[id].tsx
  - mobile/app/host.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user who calls become-host/become-driver/become-guide/become-organiser or switches role receives fresh accessToken/refreshToken tokens bearing the new role in the SAME response, and can immediately hit that role's guarded endpoints without a 403"
    - "A client whose 15-minute access token expires and calls POST /auth/refresh with a still-valid refresh token gets a new access token reflecting the user's CURRENT database role, even if the role changed since the refresh token was originally issued"
    - "A SUSPENDED or DELETED user's refresh token can no longer be used to silently mint a new valid access token"
    - "Every one of the 12 mobile call sites that grants/switches a role persists the newly returned accessToken/refreshToken to SecureStore before the caller's next API call, so that next call is never made with the stale pre-upgrade token"
  artifacts:
    - path: "backend/src/modules/auth/auth.service.ts"
      provides: "refreshTokens() re-fetches role+status from Postgres by payload.sub before minting new tokens; generateTokens() is no longer private"
      contains: "prisma.user.findUnique"
    - path: "backend/src/modules/users/users.service.ts"
      provides: "switchRole, becomeHost, becomeDriver, becomeGuide, becomeOrganiser each return { user, accessToken, refreshToken } via injected AuthService.generateTokens"
      contains: "authService.generateTokens"
    - path: "backend/src/modules/users/users.module.ts"
      provides: "imports AuthModule so AuthService is injectable into UsersService"
      contains: "AuthModule"
  key_links:
    - from: "backend/src/modules/users/users.service.ts"
      to: "backend/src/modules/auth/auth.service.ts"
      via: "UsersService constructor-injects AuthService (exported by AuthModule, imported into UsersModule) and calls this.authService.generateTokens(userId, role)"
      pattern: "authService\\.generateTokens"
    - from: "mobile ensureXRole helpers (10 call sites across 8 files)"
      to: "expo-secure-store"
      via: "capture the PATCH /users/me/role response body and persist data.accessToken/data.refreshToken via SecureStore.setItemAsync before returning"
      pattern: "SecureStore\\.setItemAsync\\('access_token'"
    - from: "mobile/app/host.tsx becomeHost mutation and mobile/app/organiser-dashboard.tsx becomeOrganiserMutation"
      to: "expo-secure-store"
      via: "onSuccess persists the returned accessToken/refreshToken before invalidating the ['me'] query"
      pattern: "SecureStore\\.setItemAsync\\('access_token'"
---

<objective>
Fix a critical JWT role-staleness bug found during a live emulator walkthrough and reproduced deterministically via curl: `become-host`/`become-driver`/`become-organiser`/`switchRole` (and `become-guide`) update the user's role in Postgres but never reissue a JWT, and `AuthService.refreshTokens()` re-signs a new access token straight from the OLD refresh token's stale `role` claim instead of a fresh database lookup. Net effect: a user who self-upgrades into a role is immediately 403'd on that role's own dashboard, with no recovery short of a full logout/login — and the mobile app's existing automatic 401→refresh→retry cycle can NEVER heal this, because refresh itself re-signs the same stale role forever.

Two backend changes fix this together: (1) `refreshTokens()` re-fetches the current role (and account status) from the database by `payload.sub` instead of trusting `payload.role`, so ANY role change eventually self-heals via the mobile app's existing 401/refresh cycle with zero other code changes; (2) `becomeHost`/`becomeDriver`/`becomeGuide`/`becomeOrganiser`/`switchRole` immediately return fresh tokens (matching the exact `{ user, accessToken, refreshToken }` shape already used by `register()`/`login()`/`phoneAuth()`/`resetPassword()`), so a client doesn't have to wait for a 401 round-trip before using its newly-granted role. The response-shape change requires updating all 12 mobile call sites (10 `ensureXRole` guard helpers + 2 direct become-X mutations) to persist the new tokens to `expo-secure-store`, mirroring the existing post-login/register/otp-verify pattern.

Purpose: A user who taps "become a host" (or driver/organiser/vendor-role-switch) must be able to use that role's screens immediately, and any future role change (including admin-approved vendor) must self-heal on the next natural token refresh without requiring a fresh login.
Output: `AuthService.refreshTokens()` does a fresh DB role/status lookup; `AuthService.generateTokens()` is callable from `UsersService`; `UsersService`'s five role-mutating methods return fresh tokens; all 12 mobile call sites persist those tokens.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session (do not re-investigate; act on these facts). All line numbers current as of this read.

**`backend/src/modules/auth/auth.service.ts`** (538 lines):
- `refreshTokens(refreshToken: string)` (lines 393-413): verifies the JWT, checks `blacklist:{jti}` in Redis, blacklists the old jti, then calls `this.generateTokens(payload.sub, payload.role as UserRole)` at line 412 — **there is NO `prisma.user.findUnique` call anywhere in this method today.** It purely decodes-and-resigns from the OLD token's own claims.
- `generateTokens(userId: string, role: UserRole)` (line 431): declared `private async generateTokens(...)`. Used identically by `register()` (line 99), `login()` (line 124), `resetPassword()` (line 313), `phoneAuth()` (line 389) — each of those returns `{ user, ...tokens }` where `tokens = { accessToken, refreshToken }`. Must become non-private (drop `private`) so `UsersService` can call it via an injected `AuthService` instance.
- `login()`'s C-10 status check (lines 112-115): `if (user.status === 'SUSPENDED' || user.status === 'DELETED') throw new UnauthorizedException('Account is not accessible');` — mirror this exact check inside the new `refreshTokens()` DB lookup.
- `USER_SELECT` (lines 33-47) is a full profile projection — do NOT reuse it for the refresh lookup; select only `{ role: true, status: true }`, the minimum needed.

**`backend/src/modules/auth/__tests__/auth.service.spec.ts`** (full mock setup at top): `mockPrisma.user` already has `findFirst`, `findUnique`, `create`, `update`, `updateMany` jest mocks (lines 18-25) — reuse directly, no new mock object needed. Existing `refreshTokens` describe block (lines 553-575):
  - `'throws when JWT verification fails'` — no DB interaction, unaffected.
  - `'throws when JTI is blacklisted'` — throws before any DB lookup would occur, unaffected.
  - `'blacklists old JTI and returns new tokens'` (lines 565-575) — currently does NOT mock `mockPrisma.user.findUnique`; once the DB lookup is added this test will call `findUnique` and get `undefined` (since `jest.clearAllMocks()` in `beforeEach` clears prior mock return values), which fails the "user not found" branch. This test must be updated to mock `mockPrisma.user.findUnique.mockResolvedValue({ role: 'CITIZEN', status: 'ACTIVE' })` before calling `refreshTokens`.

**`backend/src/modules/users/users.service.ts`** (271 lines) — five methods to change, ALL currently return the bare Prisma-updated user (no tokens):
  - `switchRole(userId, role)` (lines 51-67): after the existing `registeredRoles` check, currently `return this.prisma.user.update({ where: { id: userId }, data: { role }, select: USER_SELECT });` directly. Must capture the update result in a variable, generate tokens from it, and return `{ user, accessToken, refreshToken }`.
  - `becomeHost(userId)` (lines 78-96): `const updated = await this.prisma.user.update(...); return updated;` — same pattern.
  - `becomeDriver(userId)` (lines 103-121): identical shape to `becomeHost`.
  - `becomeGuide(userId)` (lines 129-155): the ONLY transactional one — `const updated = await this.prisma.$transaction(async (tx) => { ...; return tx.user.update({...}); }); return updated;` — the transaction itself does not need to change, only what happens with `updated` after it resolves.
  - `becomeOrganiser(userId)` (lines 158-176): identical shape to `becomeHost`.
  - Constructor (line 40): currently `constructor(private prisma: PrismaService) {}` — add `private authService: AuthService` as a second injected param.
  - Top-of-file imports (lines 1-13): add `import { AuthService } from '../auth/auth.service';`.
  - `getMe`, `updateOtpChannel`, `eraseData`, `getBookmarks`, `findById`, `update`, `changePassword` are UNAFFECTED — do not touch them.

**`backend/src/modules/users/users.module.ts`** (11 lines, full file): currently `@Module({ controllers: [UsersController], providers: [UsersService, KycService], exports: [UsersService, KycService] })` with NO `imports` array at all. Add `import { AuthModule } from '../auth/auth.module';` and an `imports: [AuthModule]` key. **Confirmed no circular import risk**: `AuthModule` (`backend/src/modules/auth/auth.module.ts`) only imports `PassportModule`/`JwtModule`/`ConfigModule` and exports `[AuthService, JwtModule]` — it does not import `UsersModule`, and a repo-wide grep confirms `UsersModule` is only ever imported by `AppModule`. Safe, no `forwardRef()` needed.

**`backend/src/modules/users/users.controller.ts`**: `switchRole`, `becomeHost`, `becomeDriver`, `becomeGuide` (via `usersController`, not shown but same pattern), `becomeOrganiser` controller methods all currently `return this.usersService.X(user.userId);` directly with no shaping — **NO controller changes are needed**, the new `{ user, accessToken, refreshToken }` shape flows through automatically as the HTTP response body.

**`backend/src/modules/users/__tests__/users.service.spec.ts`** (245 lines, full file read): `mockPrisma` (lines 9-16) has `user.findUnique`, `user.update`, `user.updateMany`, `auditLog.create`. Existing describe blocks that assert the OLD bare-user return shape and must be updated:
  - `switchRole` (lines 46-68): the `'updates role when it is in registeredRoles'` test (lines 57-67) currently asserts `result.role` — must become `result.user.role`, plus assert `result.accessToken`/`result.refreshToken` are present (from a mocked `AuthService.generateTokens`).
  - `becomeDriver` (lines 70-108): both the happy-path (line 76-91) and idempotent (line 93-107) tests currently assert `result.role` — must become `result.user.role`.
  - `becomeOrganiser` (lines 110-148): same shape change as `becomeDriver`.
  - `getMe`, `updateOtpChannel`, `eraseData`, `changePassword` tests (lines 32-44, 150-244) are UNAFFECTED.
  - No existing test coverage for `becomeHost` or `becomeGuide` in this file — none needs updating, but the new `AuthService` mock provider must still be added to the `TestingModule` (`becomeHost`/`becomeGuide` will otherwise throw "Nest can't resolve dependencies" at module-compile time for EVERY test in this file, not just the ones exercising those two methods).

**Mobile — the two response-consumption shapes needed, verified per call site**: `expo-secure-store` keys are `'access_token'` / `'refresh_token'` (matching `mobile/lib/api.ts` exactly — same keys used by `refreshAccessToken()` there). All 10 `ensureXRole` helpers below share this identical current shape (only the target role string and function name differ):
```
async function ensureXRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'X') {
    await api.patch('/users/me/role', { role: 'X' });
  }
}
```
This must become (capturing the response, persisting tokens only if present — defensive, in case the backend response ever changes shape again):
```
async function ensureXRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'X') {
    const { data } = await api.patch('/users/me/role', { role: 'X' });
    if (data?.accessToken && data?.refreshToken) {
      await SecureStore.setItemAsync('access_token', data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    }
  }
}
```
Exact locations (function line, target role):
- `mobile/app/(tabs)/profile.tsx:89` — `ensureDriverRole`, role `'DRIVER'`. `SecureStore` already imported (line 17) — no new import needed here.
- `mobile/app/driver-dashboard.tsx:31` — `ensureDriverRole`, role `'DRIVER'`. `api` imported line 11 (`import { fetcher, api, getErrorMessage } from '../lib/api';`) — no `SecureStore` import yet, add `import * as SecureStore from 'expo-secure-store';` immediately after that import line.
- `mobile/app/driver-application.tsx:71` — `ensureDriverRole`, role `'DRIVER'`. `api` imported line 29 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/organiser-dashboard.tsx:64` — `ensureOrganiserRole`, role `'ORGANISER'`. `api` imported line 27 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/event-create.tsx:68` — `ensureOrganiserRole`, role `'ORGANISER'`. `api` imported line 30 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/event-edit/[id].tsx:74` — `ensureOrganiserRole`, role `'ORGANISER'`. `api` imported line 29 (`import { api, fetcher, getErrorMessage } from '../../lib/api';`, note two-level relative path since this file is nested under `event-edit/`) — add `SecureStore` import after it.
- `mobile/app/vendor-orders.tsx:71` — `ensureVendorRole`, role `'VENDOR'`. `api` imported line 16 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/product-create.tsx:75` — `ensureVendorRole`, role `'VENDOR'`. `api` imported line 27 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/product-edit/[id].tsx:70` — `ensureVendorRole`, role `'VENDOR'`. `api` imported line 26 (`import { api, fetcher, getErrorMessage } from '../../lib/api';`, nested path) — add `SecureStore` import after it.
- `mobile/app/property-create.tsx:80` — `ensureHostRole`, role `'HOST'`. `api` imported line 27 (`import { api, fetcher, getErrorMessage } from '../lib/api';`) — add `SecureStore` import after it.
- `mobile/app/property-edit/[id].tsx:73` — `ensureHostRole`, role `'HOST'`. `api` imported line 26 (`import { api, fetcher, getErrorMessage } from '../../lib/api';`, nested path) — add `SecureStore` import after it.

**Mobile — the two DIRECT become-X mutation call sites (not behind an `ensureXRole` guard)**, verified per file:
- `mobile/app/host.tsx` (imports `api, fetcher` from `'../lib/api'` at line 28 — no `SecureStore` import yet): `becomeHost` mutation (lines 131-141) is `useMutation({ mutationFn: () => api.post('/users/me/become-host').then((r) => r.data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); Alert.alert('Welcome aboard!', ...); }, onError: ... })`. Since `mutationFn` already unwraps `.then((r) => r.data)`, `onSuccess` receives the parsed body directly as its first argument — change `onSuccess: () => {` to `onSuccess: async (data) => {` and persist `data.accessToken`/`data.refreshToken` via `SecureStore.setItemAsync` (guarded by the same `if (data?.accessToken && data?.refreshToken)` check) as the FIRST lines inside the handler, before the existing `queryClient.invalidateQueries`/`Alert.alert` calls. Add `import * as SecureStore from 'expo-secure-store';` after the existing `api, fetcher` import line.
- `mobile/app/organiser-dashboard.tsx` `becomeOrganiserMutation` (lines 214-222): `useMutation({ mutationFn: () => api.post('/users/me/become-organiser'), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); }, onError: ... })`. Here `mutationFn` does NOT unwrap `.then((r) => r.data)`, so `onSuccess` receives the raw axios response — change `onSuccess: () => {` to `onSuccess: async (response) => { const data = response?.data;` and persist tokens the same guarded way before the existing `queryClient.invalidateQueries` call. (`SecureStore` import already being added to this same file for its `ensureOrganiserRole` helper above — do not add it twice.)

**Test conventions confirmed**: this codebase's existing jest specs mock injected services as plain object literals in the `TestingModule` `providers` array (`{ provide: AuthService, useValue: mockAuthService }`) — follow that exact convention, do not use `@golevelup/ts-jest` or auto-mocking.
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — refreshTokens() DB role lookup + role-mutating methods return fresh tokens</name>
  <files>backend/src/modules/auth/auth.service.ts, backend/src/modules/auth/__tests__/auth.service.spec.ts, backend/src/modules/users/users.module.ts, backend/src/modules/users/users.service.ts, backend/src/modules/users/__tests__/users.service.spec.ts</files>
  <action>
    In `auth.service.ts`: (1) in `refreshTokens()`, immediately after the existing blacklist check (`if (isBlacklisted) throw ...`) and before the `remaining`/blacklisting-the-old-jti block, insert a fresh `this.prisma.user.findUnique({ where: { id: payload.sub, deletedAt: null }, select: { role: true, status: true } })` lookup; throw `UnauthorizedException('Account no longer exists')` if it resolves null, and throw `UnauthorizedException('Account is not accessible')` if `status` is `'SUSPENDED'` or `'DELETED'` (mirroring `login()`'s C-10 check at lines 112-115). Change the final `return this.generateTokens(payload.sub, payload.role as UserRole)` to use the freshly-fetched `user.role` instead of `payload.role`. (2) Remove the `private` modifier from `generateTokens` so it becomes `async generateTokens(userId: string, role: UserRole)` — an externally-callable method other services can inject and use.

    In `users.module.ts`: add `import { AuthModule } from '../auth/auth.module';` and add `imports: [AuthModule]` to the `@Module({...})` decorator (currently has no `imports` key at all).

    In `users.service.ts`: add `import { AuthService } from '../auth/auth.service';` near the top with the other relative imports. Add `private authService: AuthService` as a second constructor parameter alongside the existing `private prisma: PrismaService`. In each of `switchRole`, `becomeHost`, `becomeDriver`, `becomeOrganiser`: capture the final `prisma.user.update(...)` result into a local `updated`/named variable if not already (switchRole currently returns the update call directly — introduce a variable), then call `const tokens = await this.authService.generateTokens(updated.id, updated.role as UserRole);` and `return { user: updated, ...tokens };` instead of returning the bare user. In `becomeGuide`, apply the same treatment to the variable already named `updated` that the `$transaction(...)` call resolves to — generate tokens and return `{ user: updated, ...tokens }` AFTER the transaction resolves, not inside it.

    In `auth.service.spec.ts`'s `refreshTokens` describe block: update the `'blacklists old JTI and returns new tokens'` test to add `mockPrisma.user.findUnique.mockResolvedValue({ role: 'CITIZEN', status: 'ACTIVE' });` before calling `service.refreshTokens(...)`. Add three new tests: (a) throws `UnauthorizedException` when `mockPrisma.user.findUnique` resolves `null`; (b) throws `UnauthorizedException` when it resolves `{ role: 'CITIZEN', status: 'SUSPENDED' }`; (c) a test asserting the fresh DB role — not the stale payload role — is what gets used: mock `mockJwt.verify` to return `{ sub: 'u1', role: 'CITIZEN', jti: 'jti-x', exp: ... }` (stale CITIZEN claim) but `mockPrisma.user.findUnique` to resolve `{ role: 'HOST', status: 'ACTIVE' }` (current DB role), then assert `mockJwt.signAsync` was called with a payload `expect.objectContaining({ role: 'HOST' })`.

    In `users.service.spec.ts`: add `import { AuthService } from '../../auth/auth.service';` and a `const mockAuthService = { generateTokens: jest.fn() };` alongside the existing `mockPrisma`. Add `{ provide: AuthService, useValue: mockAuthService }` to the `TestingModule` providers array. In `beforeEach`, after `jest.clearAllMocks()`, add `mockAuthService.generateTokens.mockResolvedValue({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });`. Update the `switchRole` test `'updates role when it is in registeredRoles'` to assert `result.user.role` (not `result.role`) and that `result.accessToken`/`result.refreshToken` equal the mocked values. Update both `becomeDriver` tests and both `becomeOrganiser` tests to assert `result.user.role` instead of `result.role` (the rest of each assertion — the `mockPrisma.user.update` call shape — is unaffected and stays as-is).
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit && npx jest</automated>
  </verify>
  <done>refreshTokens() performs a fresh prisma.user.findUnique lookup by payload.sub, rejects missing/SUSPENDED/DELETED accounts, and mints new tokens from the CURRENT database role. generateTokens() is no longer private. UsersModule imports AuthModule. switchRole/becomeHost/becomeDriver/becomeGuide/becomeOrganiser each return { user, accessToken, refreshToken }. Full backend jest suite passes (913+ tests, zero regressions) and tsc --noEmit is clean.</done>
</task>

<task type="auto">
  <name>Task 2: Mobile — persist fresh tokens after DRIVER role grant/switch (profile.tsx, driver-dashboard.tsx, driver-application.tsx)</name>
  <files>mobile/app/(tabs)/profile.tsx, mobile/app/driver-dashboard.tsx, mobile/app/driver-application.tsx</files>
  <action>
    In `mobile/app/(tabs)/profile.tsx`: update `ensureDriverRole` (line 89) to capture the `PATCH /users/me/role` response and persist `data.accessToken`/`data.refreshToken` to `SecureStore` (keys `'access_token'`/`'refresh_token'`) when present, per the shared pattern in this plan's verified_facts — `SecureStore` is already imported (line 17), no new import needed. Separately, update the `becomeDriverMutation` (lines 408-417): its `mutationFn` already unwraps to `r.data` via `.then((r) => r.data)`, so change `onSuccess: () => {` to `onSuccess: async (data) => {` and, as the first statement inside, persist `data.accessToken`/`data.refreshToken` to `SecureStore` the same guarded way, before the existing `queryClient.invalidateQueries({ queryKey: ['me'] })` and `router.push('/driver-application' as never)` calls.

    In `mobile/app/driver-dashboard.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { fetcher, api, getErrorMessage } from '../lib/api';` line (line 11). Update `ensureDriverRole` (line 31) with the same response-capture-and-persist pattern.

    In `mobile/app/driver-application.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 29). Update `ensureDriverRole` (line 71) with the same pattern.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>All three DRIVER-role call sites (ensureDriverRole in profile.tsx/driver-dashboard.tsx/driver-application.tsx, plus profile.tsx's becomeDriverMutation) persist any accessToken/refreshToken returned by the backend to SecureStore before their caller proceeds. tsc --noEmit passes clean.</done>
</task>

<task type="auto">
  <name>Task 3: Mobile — persist fresh tokens after ORGANISER role grant/switch (organiser-dashboard.tsx, event-create.tsx, event-edit/[id].tsx)</name>
  <files>mobile/app/organiser-dashboard.tsx, mobile/app/event-create.tsx, mobile/app/event-edit/[id].tsx</files>
  <action>
    In `mobile/app/organiser-dashboard.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 27). Update `ensureOrganiserRole` (line 64) with the shared response-capture-and-persist pattern from this plan's verified_facts. Separately, update `becomeOrganiserMutation` (lines 214-222): its `mutationFn` does NOT unwrap `.data`, so change `onSuccess: () => {` to `onSuccess: async (response) => { const data = response?.data;` and, as the first statement, persist `data.accessToken`/`data.refreshToken` to `SecureStore` the same guarded way, before the existing `queryClient.invalidateQueries({ queryKey: ['me'] })` call.

    In `mobile/app/event-create.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 30). Update `ensureOrganiserRole` (line 68) with the shared pattern.

    In `mobile/app/event-edit/[id].tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../../lib/api';` line (line 29 — note the two-level relative path since this file lives under `event-edit/`). Update `ensureOrganiserRole` (line 74) with the shared pattern.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>All four ORGANISER-role call sites (ensureOrganiserRole in organiser-dashboard.tsx/event-create.tsx/event-edit/[id].tsx, plus organiser-dashboard.tsx's becomeOrganiserMutation) persist any accessToken/refreshToken returned by the backend to SecureStore before their caller proceeds. tsc --noEmit passes clean.</done>
</task>

<task type="auto">
  <name>Task 4: Mobile — persist fresh tokens after VENDOR role switch (vendor-orders.tsx, product-create.tsx, product-edit/[id].tsx)</name>
  <files>mobile/app/vendor-orders.tsx, mobile/app/product-create.tsx, mobile/app/product-edit/[id].tsx</files>
  <action>
    In `mobile/app/vendor-orders.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 16). Update `ensureVendorRole` (line 71) with the shared response-capture-and-persist pattern from this plan's verified_facts.

    In `mobile/app/product-create.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 27). Update `ensureVendorRole` (line 75) with the shared pattern.

    In `mobile/app/product-edit/[id].tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../../lib/api';` line (line 26 — two-level relative path, this file lives under `product-edit/`). Update `ensureVendorRole` (line 70) with the shared pattern.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>All three VENDOR-role call sites (ensureVendorRole in vendor-orders.tsx/product-create.tsx/product-edit/[id].tsx) persist any accessToken/refreshToken returned by the backend to SecureStore before their caller proceeds. tsc --noEmit passes clean.</done>
</task>

<task type="auto">
  <name>Task 5: Mobile — persist fresh tokens after HOST role grant/switch (property-create.tsx, property-edit/[id].tsx, host.tsx)</name>
  <files>mobile/app/property-create.tsx, mobile/app/property-edit/[id].tsx, mobile/app/host.tsx</files>
  <action>
    In `mobile/app/property-create.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../lib/api';` line (line 27). Update `ensureHostRole` (line 80) with the shared response-capture-and-persist pattern from this plan's verified_facts.

    In `mobile/app/property-edit/[id].tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher, getErrorMessage } from '../../lib/api';` line (line 26 — two-level relative path, this file lives under `property-edit/`). Update `ensureHostRole` (line 73) with the shared pattern.

    In `mobile/app/host.tsx`: add `import * as SecureStore from 'expo-secure-store';` immediately after the existing `import { api, fetcher } from '../lib/api';` line (line 28). Update the `becomeHost` mutation (lines 131-141): its `mutationFn` already unwraps `.then((r) => r.data)`, so change `onSuccess: () => {` to `onSuccess: async (data) => {` and, as the first statement, persist `data.accessToken`/`data.refreshToken` to `SecureStore` the same guarded way, before the existing `queryClient.invalidateQueries({ queryKey: ['me'] })` and `Alert.alert('Welcome aboard!', ...)` calls.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>All three HOST-role call sites (ensureHostRole in property-create.tsx/property-edit/[id].tsx, plus host.tsx's becomeHost mutation) persist any accessToken/refreshToken returned by the backend to SecureStore before their caller proceeds. tsc --noEmit passes clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile client → `POST /auth/refresh` | Client-supplied refresh token crosses into a DB-backed role/status re-validation before a new access token is minted |
| Mobile client → `become-host`/`become-driver`/`become-guide`/`become-organiser`/`PATCH /users/me/role` | Self-service role mutation now also mints and returns fresh, immediately-usable tokens in the same response |
| Mobile SecureStore ← backend token response | New access/refresh tokens received over the app's existing TLS-only axios instance are written to the OS-level secure enclave |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Elevation of Privilege | `refreshTokens()`'s new DB lookup | mitigate | Fixes an existing latent risk rather than introducing one: the fresh lookup means a role DOWNGRADE (e.g. admin demotes a user) now also takes effect on next refresh, closing a gap where a demoted user's old refresh token could previously keep minting tokens carrying their former, higher-privileged role indefinitely |
| T-quick-02 | Denial of Service (account lockout via status check) | `refreshTokens()`'s new SUSPENDED/DELETED check | accept | Intentional — mirrors `login()`'s existing C-10 behavior exactly; a suspended/deleted account should not be able to silently keep refreshing valid tokens |
| T-quick-03 | Information Disclosure (token exposure via response body) | `becomeHost`/`becomeDriver`/`becomeGuide`/`becomeOrganiser`/`switchRole` responses now carry `accessToken`/`refreshToken` | accept | Same trust boundary already accepted for `register()`/`login()`/`phoneAuth()`/`resetPassword()`, which return tokens in their response bodies today over the same TLS-only channel — no new exposure surface, just a fifth/sixth/seventh call site using the identical, already-reviewed pattern |
| T-quick-04 | Tampering (mobile persists tokens from an unexpected shape) | 12 mobile call sites | mitigate | Every persistence site is defensively guarded with `if (data?.accessToken && data?.refreshToken)` before writing to SecureStore — a malformed or unexpected response body is a no-op, never a crash or a write of `undefined` |

</threat_model>

<verification>
1. `cd backend && npx tsc --noEmit && npx jest` — full suite passes, zero regressions, new refreshTokens/role-mutation test cases included.
2. `cd mobile && npx tsc --noEmit` — no new type errors across all 8 touched mobile files.
3. Manual read-through: `refreshTokens()` throws before `generateTokens()` is reached for a nonexistent, SUSPENDED, or DELETED account, and passes the DB-fetched `role` (not `payload.role`) into `generateTokens()`.
4. Manual read-through: none of `switchRole`/`becomeHost`/`becomeDriver`/`becomeGuide`/`becomeOrganiser` were changed in any way beyond their final token-generation-and-return step — no unrelated logic touched.
5. Manual read-through: all 12 mobile call sites guard their SecureStore writes with a presence check on `accessToken`/`refreshToken` and write both before their caller's next statement executes.
</verification>

<success_criteria>
- Reproducing the original curl repro (register → become-host → GET /properties/mine with the SAME original access token) now returns 403 as before with the STALE token (expected — that token still carries CITIZEN and was never reissued to the caller in isolation), but the NEW accessToken returned by the become-host call itself succeeds against GET /properties/mine immediately.
- A manually-expired-then-refreshed access token reflects a role change made after the original login, without requiring a fresh login.
- A SUSPENDED or DELETED account's refresh token no longer mints a usable access token.
- `cd backend && npx jest` (full suite) and `cd backend && npx tsc --noEmit` both pass.
- `cd mobile && npx tsc --noEmit` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-jtm-fix-critical-jwt-role-staleness-bug-beco/260727-jtm-SUMMARY.md`
</output>
