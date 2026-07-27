---
phase: quick
plan: 260727-eca
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/onboarding.tsx
  - mobile/app/driver-dashboard.tsx
  - mobile/app/driver-application.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A user who has already become a host (registeredRoles includes HOST) sees a permanent 'Go to my host dashboard' link on the Profile tab in place of the 'Become a host' CTA, and tapping it navigates directly to /host-dashboard"
    - "A user who has already become an active vendor (registeredRoles includes VENDOR — only granted on admin approval) sees a permanent 'Go to my vendor dashboard' link on the Profile tab in place of the 'Become a vendor' CTA, and tapping it navigates directly to /vendor-dashboard"
    - "A user whose active `role` has drifted away from DRIVER (e.g. after later becoming HOST/VENDOR/ORGANISER, each of which flips the single active role field) can still go online/offline from the Profile tab toggle and from driver-dashboard.tsx, and can still submit a driver application, without receiving a 403 from RolesGuard"
    - "onboarding.tsx's phone/email/register buttons call router.push directly — no unreachable try/catch/Alert.alert('Coming soon', ...) wrapper remains around any of the three navigation calls"
  artifacts:
    - path: "mobile/app/(tabs)/profile.tsx"
      provides: "Permanent host/vendor 'Go to dashboard' links (replacing the CTAs that vanished once alreadyHost/alreadyVendor flipped true) plus an ensureDriverRole guard on toggleOnlineMutation"
      contains: "ensureDriverRole"
    - path: "mobile/app/driver-dashboard.tsx"
      provides: "A 'me' query sourcing the active role, and an ensureDriverRole guard called before go-online/go-offline"
      contains: "ensureDriverRole"
    - path: "mobile/app/driver-application.tsx"
      provides: "A 'me' query sourcing the active role, and an ensureDriverRole guard called before POST /transport/drivers and /transport/drivers/:id/vehicles"
      contains: "ensureDriverRole"
    - path: "mobile/app/onboarding.tsx"
      provides: "Simplified handlePhonePress/handleEmailPress/handleRegisterPress with no dead try/catch/Alert wrapper"
      contains: "function handlePhonePress"
  key_links:
    - from: "mobile/app/(tabs)/profile.tsx alreadyHost branch"
      to: "/host-dashboard"
      via: "PressableScale onPress calls router.push('/host-dashboard' as never)"
      pattern: "router\\.push\\('/host-dashboard'"
    - from: "mobile/app/(tabs)/profile.tsx alreadyVendor branch"
      to: "/vendor-dashboard"
      via: "PressableScale onPress calls router.push('/vendor-dashboard' as never)"
      pattern: "router\\.push\\('/vendor-dashboard'"
    - from: "toggleOnlineMutation (profile.tsx) / toggleMutation (driver-dashboard.tsx) / mutation (driver-application.tsx)"
      to: "PATCH /users/me/role"
      via: "await ensureDriverRole(currentRole) invoked as the first line of each mutationFn, before any /transport/* call"
      pattern: "await ensureDriverRole\\("
---

<objective>
Fix three mobile reachability/defensive-guard gaps found during the post-session completeness re-audit:

1. Existing hosts and vendors currently lose all navigation to their own dashboards once `alreadyHost`/`alreadyVendor` flips true, because the only "Go to dashboard" CTAs live inside `host.tsx`/`vendor.tsx`, which are themselves only reachable from the very CTA that just disappeared. Add permanent dashboard links to `profile.tsx` for both roles, mirroring the DRIVER section's existing "conditional-become OR permanent-link" pattern.
2. `ensureDriverRole` (the role-drift guard already established this session in `organiser-dashboard.tsx`, `property-create.tsx`, etc.) is missing from the three DRIVER-gated mutation call sites that predate that pattern: `profile.tsx`'s `toggleOnlineMutation`, `driver-dashboard.tsx`'s go-online/go-offline toggle, and `driver-application.tsx`'s driver+vehicle creation. Without it, a DRIVER who later becomes HOST/VENDOR/ORGANISER (each of which overwrites the single active `role` field) gets a 403 the next time they try any of these actions.
3. `onboarding.tsx` has three dead `try { router.push(...) } catch { Alert.alert('Coming soon', ...) }` blocks wrapping pushes to routes that are already registered and valid — the catch can never fire. Simplify to direct `router.push(...)` calls.

Purpose: Close real reachability regressions (hosts/vendors trapped with no way back to their own dashboard) and a real cross-role 403 risk, and remove dead placeholder code that reads like an unfinished screen.
Output: `profile.tsx` shows a permanent dashboard link once a user is an onboarded host/vendor; the DRIVER role is defensively re-asserted before all three previously-unguarded driver mutations; `onboarding.tsx`'s three handlers are direct one-liners.

This plan has 2 tasks. Task 1 and Task 2 both touch `mobile/app/(tabs)/profile.tsx` but at disjoint line ranges (CTA/JSX block vs. `toggleOnlineMutation`'s `mutationFn`) — run sequentially, not in parallel.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session (do not re-investigate; act on these facts). All line numbers below are current as of this read.

**`mobile/app/(tabs)/profile.tsx`** (1461 lines):
- `LayoutDashboard` icon already imported (line 50) — this is the established "go to dashboard" icon used everywhere else in the app (`host.tsx` line 290, `vendor.tsx` line 238, and this same file's driver dashboard link at line 835). Reuse it for host/vendor — do not import a different icon.
- `user` query (`GET /users/me`, queryKey `['me']`) at lines 381-384; `UserProfile.role: string` (line 90) is the active role field.
- `alreadyHost` (line 536): `(user?.registeredRoles ?? []).includes('HOST')`. `alreadyVendor` (line 538): `(user?.registeredRoles ?? []).includes('VENDOR')`.
- **Confirmed via backend read**: `becomeHost` (`backend/src/modules/users/users.service.ts` lines 78-96) adds `HOST` to `registeredRoles` immediately, no approval gate exists for HOST at all — so `alreadyHost === true` never coexists with any "pending" state. Direct navigation to `/host-dashboard` is safe (matches `host.tsx` line 286's own footer CTA, which also routes straight to `/host-dashboard` once `alreadyHost` is true, no intermediate check).
- **Confirmed via backend read**: `registeredRoles` only gains `VENDOR` inside `MarketplaceService.approveVendor()` (`backend/src/modules/marketplace/marketplace.service.ts` lines 76-102), i.e. only once a vendor's status is set to `ACTIVE` by an admin. So `alreadyVendor === true` always implies `ACTIVE` status — direct navigation to `/vendor-dashboard` is safe (matches `vendor.tsx` line 234's own footer CTA behavior for the `ACTIVE` state).
- Host CTA block, currently lines 842-864 — the entire block is wrapped in `{!alreadyHost && (...)}` with no `else` branch, so it renders nothing once `alreadyHost` is true:
  ```
  {!alreadyHost && (
    <View style={styles.hostCtaWrap}>
      <PressableScale onPress={() => router.push('/host' as never)} hapticStyle="light" style={styles.hostCtaCard}>
        <View style={styles.hostCtaInner}>
          <View style={styles.hostCtaIconBox}><Home size={20} color={GOLD} /></View>
          <View style={styles.hostCtaTextBlock}>
            <Text style={styles.hostCtaTitle}>Become a host</Text>
            <Text style={styles.hostCtaSub}>List your stay, club, or experience</Text>
          </View>
          <ChevronRight size={16} color={INK_FAINT} />
        </View>
      </PressableScale>
    </View>
  )}
  ```
- Vendor CTA block, currently lines 866-888 — same structure, wrapped in `{!alreadyVendor && (...)}`, `Store` icon (already imported line 44), routes to `/vendor`.
- `hostCtaWrap`/`hostCtaCard`/`hostCtaInner`/`hostCtaIconBox`/`hostCtaTextBlock`/`hostCtaTitle`/`hostCtaSub` styles (lines 1326-1367) are the single card idiom already reused for driver-become, host-become, and vendor-become CTAs on this screen — reuse them unchanged for the new "go to dashboard" state rather than inventing a new style block.
- `toggleOnlineMutation` (lines 407-421) has no `ensureDriverRole` guard. `mutationFn` (408-414) currently starts directly with `if (driverIsOnline) return api.post('/transport/go-offline'); ...`. `user?.role` (from the existing `me` query, line 381) is the value to pass.
- No `ensureDriverRole` helper currently exists in this file. `organiser-dashboard.tsx` lines 59-68 has the exact pattern to mirror (`ensureOrganiserRole`), including its explanatory comment style.

**`mobile/app/onboarding.tsx`** (315 lines): `handlePhonePress`/`handleEmailPress`/`handleRegisterPress` (lines 74-96) each wrap a single `router.push(...)` in a `try { } catch { Alert.alert('Coming soon', ...) }`. All three target routes (`/auth/phone`, `/auth/email`, `/auth/register`) are registered, valid screens (confirmed present and reachable via `email.tsx`/`register.tsx`/`phone.tsx` shipped in quick tasks 260726-riy/260727-aym and existing `phone.tsx`) — the catch can never fire. `Alert` is imported at line 6 and used ONLY inside these three catch blocks (confirmed — no other `Alert` usage anywhere in this file) — remove it from the import list once the catch blocks are deleted.

**`mobile/app/driver-dashboard.tsx`** (263 lines): imports `fetcher, api, getErrorMessage` from `'../lib/api'` (line 11) — `fetcher` and `api` already available, no new API import needed. Currently fetches only `driver-me` (lines 32-35), no `['me']` query exists in this file. `toggleMutation` (lines 54-68) `mutationFn` (55-61) starts directly with `if (isOnline) return api.post('/transport/go-offline'); ...` — no guard. Add a `['me']` query (mirrors `profile.tsx`'s exact queryKey/queryFn shape so both share the same cache entry) and an `ensureDriverRole` helper (module-scope, same shape as `organiser-dashboard.tsx`'s `ensureOrganiserRole`).

**`mobile/app/driver-application.tsx`** (349 lines): imports only `useMutation` from `'@tanstack/react-query'` (line 25) and `api, getErrorMessage` from `'../lib/api'` (line 29) — needs `useQuery` and `fetcher` added to these two import lines. `mutation` (lines 78-104) `mutationFn` (79-93) currently starts directly with `const driverRes = await api.post('/transport/drivers', {...})` — no guard, and no `['me']` query exists yet in this file.

**Backend — confirmed guards on the affected endpoints** (`backend/src/modules/transport/transport.controller.ts`): `POST /transport/drivers` (line 62, `@Roles(UserRole.DRIVER)` line 64), `POST /transport/drivers/:id/vehicles` (line 71, `@Roles(UserRole.DRIVER)` line 73), `POST /transport/go-online` (line 99, `@Roles(UserRole.DRIVER)` line 101), `POST /transport/go-offline` (line 109, `@Roles(UserRole.DRIVER)` line 111). `RolesGuard.canActivate` (`backend/src/common/guards/roles.guard.ts` line 18) checks `requiredRoles.includes(user?.role)` — the single active role, not `registeredRoles[]` — confirming the exact failure mode described in the audit.

**Backend — confirmed safety of the role-switch endpoint used by `ensureDriverRole`**: `PATCH /users/me/role` → `UsersService.switchRole()` (`backend/src/modules/users/users.service.ts` lines 51-60) throws `ForbiddenException` if the target role is not already present in the caller's own `registeredRoles` — a user can never escalate to a role they don't already hold via this call, so `ensureDriverRole` introduces no new privilege-escalation surface (identical guarantee already relied on by `ensureOrganiserRole`/`ensureHostRole` elsewhere).

**`organiser-dashboard.tsx` reference pattern** (lines 59-68), to mirror verbatim (renamed to `ensureDriverRole`, target role `'DRIVER'`):
```ts
async function ensureOrganiserRole(currentRole: string | undefined): Promise<void> {
  if (currentRole !== 'ORGANISER') {
    await api.patch('/users/me/role', { role: 'ORGANISER' });
  }
}
```
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Permanent host/vendor dashboard links in profile.tsx + dead catch-block cleanup in onboarding.tsx</name>
  <files>mobile/app/(tabs)/profile.tsx, mobile/app/onboarding.tsx</files>
  <action>
    In `profile.tsx`, replace the Host CTA block (currently lines 842-864, wrapped in `{!alreadyHost && (...)}` with no else) with an if/else that renders EITHER the existing "Become a host" card (unchanged, `Home` icon, routes to `/host`) OR — when `alreadyHost` is true — a new card using the exact same `hostCtaWrap`/`hostCtaCard`/`hostCtaInner`/`hostCtaIconBox`/`hostCtaTextBlock`/`hostCtaTitle`/`hostCtaSub` styles, swapping in the `LayoutDashboard` icon, title "Go to my host dashboard", sub "Manage listings, bookings, and payouts", and `onPress={() => router.push('/host-dashboard' as never)}`. Never render neither branch.

    Do the same for the Vendor CTA block (currently lines 866-888, `{!alreadyVendor && (...)}`): keep the existing "Become a vendor" card (unchanged, `Store` icon, routes to `/vendor`) as the else-branch, and add an `alreadyVendor` if-branch using the same card styles with the `LayoutDashboard` icon, title "Go to my vendor dashboard", sub "Manage products and fulfil orders", `onPress={() => router.push('/vendor-dashboard' as never)}`.

    In `onboarding.tsx`, simplify `handlePhonePress`, `handleEmailPress`, and `handleRegisterPress` (currently lines 74-96) to a single direct `router.push(...)` call each — remove the `try`/`catch`/`Alert.alert('Coming soon', ...)` wrapper entirely from all three. Remove the now-unused `Alert` import from the `react-native` import list at the top of the file (confirmed nowhere else in this file uses `Alert`).
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>profile.tsx's host and vendor CTA sections each render exactly one card at all times: the "Become a..." card when the role has not yet been onboarded, or a "Go to my .../dashboard" card (LayoutDashboard icon, routing directly to /host-dashboard or /vendor-dashboard) once alreadyHost/alreadyVendor is true — never neither. onboarding.tsx's three handlers are one-line router.push calls with no try/catch/Alert remaining, and the Alert import is removed. tsc --noEmit passes clean.</done>
</task>

<task type="auto">
  <name>Task 2: Add ensureDriverRole role-drift guard to the three unguarded DRIVER-gated mutations</name>
  <files>mobile/app/(tabs)/profile.tsx, mobile/app/driver-dashboard.tsx, mobile/app/driver-application.tsx</files>
  <action>
    In `profile.tsx`: add a module-scope `ensureDriverRole(currentRole: string | undefined): Promise<void>` helper (mirror `organiser-dashboard.tsx`'s `ensureOrganiserRole` shape exactly, target role `'DRIVER'`, same explanatory comment style referencing `RolesGuard` checking the single active `role` not `registeredRoles[]`). Place it near the top of the file after the imports, before the `// ── Types ──` section. In `toggleOnlineMutation`'s `mutationFn` (currently lines 408-414), add `await ensureDriverRole(user?.role);` as the first line, before the existing `if (driverIsOnline) ...` branch (reuse the already-declared `user` query from `GET /users/me`, no new query needed).

    In `driver-dashboard.tsx`: add the same `ensureDriverRole` helper at module scope (after imports). Add a `['me']` query (`useQuery<{ role?: string }>({ queryKey: ['me'], queryFn: () => fetcher('/users/me') })`, matching `profile.tsx`'s exact queryKey so the TanStack Query cache entry is shared) near the existing `driver-me` query. In `toggleMutation`'s `mutationFn` (currently lines 55-61), add `await ensureDriverRole(me?.role);` as the first line, before the existing `if (isOnline) ...` branch.

    In `driver-application.tsx`: add `useQuery` to the existing `'@tanstack/react-query'` import (currently only `useMutation`) and `fetcher` to the existing `'../lib/api'` import (currently `api, getErrorMessage`). Add the same `ensureDriverRole` helper at module scope. Add a `['me']` query (same shape as above) inside the component, before the `mutation` declaration. In `mutation`'s `mutationFn` (currently lines 79-93), add `await ensureDriverRole(me?.role);` as the first line, before the existing `const driverRes = await api.post('/transport/drivers', {...})` call.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>All three mutationFns (profile.tsx's toggleOnlineMutation, driver-dashboard.tsx's toggleMutation, driver-application.tsx's mutation) call ensureDriverRole(currentRole) as their first statement, sourcing currentRole from a GET /users/me query, before any /transport/* call. tsc --noEmit passes clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile client → `PATCH /users/me/role` | `ensureDriverRole` (and the pre-existing `ensureOrganiserRole`/`ensureHostRole` siblings) call this endpoint client-side before a driver-gated mutation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Elevation of Privilege | `PATCH /users/me/role` via `ensureDriverRole` | accept | `UsersService.switchRole()` throws `ForbiddenException` unless the target role is already present in the caller's own `registeredRoles` (`users.service.ts` line 58) — a caller cannot use this new call site to gain DRIVER unless they already legitimately hold it; identical guarantee already relied upon by the existing `ensureOrganiserRole`/`ensureHostRole` call sites |
| T-quick-02 | Tampering (navigation only, no data) | `mobile/app/(tabs)/profile.tsx` host/vendor dashboard links | accept | Purely client-side `router.push` to routes (`/host-dashboard`, `/vendor-dashboard`) that themselves query server data scoped to the authenticated JWT subject — no new server trust boundary introduced by adding a navigation shortcut |

</threat_model>

<verification>
1. `cd mobile && npx tsc --noEmit` — no new type errors across profile.tsx, onboarding.tsx, driver-dashboard.tsx, driver-application.tsx.
2. Manual read-through: profile.tsx's host and vendor CTA sections each have an if/else with no code path that renders neither the "Become a..." card nor the "Go to my .../dashboard" card.
3. Manual read-through: all three DRIVER-gated mutationFns (`toggleOnlineMutation` in profile.tsx, `toggleMutation` in driver-dashboard.tsx, `mutation` in driver-application.tsx) call `await ensureDriverRole(...)` as their first line.
4. Manual read-through: onboarding.tsx has no remaining `Alert.alert('Coming soon'` or `try`/`catch` wrapper around any of the three `router.push` calls, and no unused `Alert` import.
</verification>

<success_criteria>
- An already-onboarded host or vendor always has a permanent, correctly-routed path back to their own dashboard from the Profile tab.
- A DRIVER who later switches their active role to HOST/VENDOR/ORGANISER can still go online/offline, use driver-dashboard.tsx, and submit a driver application without a 403.
- onboarding.tsx no longer contains dead/unreachable placeholder code.
- `cd mobile && npx tsc --noEmit` passes clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-eca-fix-mobile-reachability-add-permanent-go/260727-eca-SUMMARY.md`
</output>
