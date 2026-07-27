---
phase: quick
plan: 260727-bph
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/modules/users/users.service.ts
  - backend/src/modules/users/users.controller.ts
  - backend/src/modules/users/__tests__/users.service.spec.ts
  - mobile/app/driver-application.tsx
  - mobile/app/(tabs)/profile.tsx
  - mobile/app/_layout.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A signed-in user who does not yet have the DRIVER role sees a real 'Become a driver' CTA on the Profile tab (not hidden behind an already-DRIVER gate), and tapping it grants the DRIVER role server-side then opens a driver-application form"
    - "A user can submit licence and vehicle details on the driver-application form, which creates a Driver profile (PENDING_REVIEW) via the existing transport endpoints and attaches a vehicle to it"
    - "A user who already holds the DRIVER role and has an APPROVED Driver profile sees a real online/offline toggle wired to the existing go-online/go-offline endpoints (not a local-only UI flip), plus a link into the full driver dashboard"
    - "Any signed-in user can reach the rider dashboard (their active/past trips) from a new 'My Rides' entry in the Profile tab menu — no reachable entry point exists today"
  artifacts:
    - path: "backend/src/modules/users/users.service.ts"
      provides: "becomeDriver(userId) method mirroring becomeHost's exact structure — grants DRIVER role + registeredRoles, no PENDING gate on the role itself"
      contains: "becomeDriver"
    - path: "backend/src/modules/users/users.controller.ts"
      provides: "POST /users/me/become-driver route delegating to usersService.becomeDriver"
      contains: "become-driver"
    - path: "backend/src/modules/users/__tests__/users.service.spec.ts"
      provides: "Unit tests for becomeDriver (not-found, grants role, idempotent when already DRIVER)"
      contains: "becomeDriver"
    - path: "mobile/app/driver-application.tsx"
      provides: "New screen collecting licenceNumber/licenceExpiry then vehicle fields, POSTing to /transport/drivers then /transport/drivers/:id/vehicles"
      min_lines: 120
    - path: "mobile/app/(tabs)/profile.tsx"
      provides: "Real become-driver CTA + real go-online/go-offline toggle + driver-dashboard link + 'My Rides' menu entry; dead 'ADMIN' branch removed"
      contains: "become-driver"
    - path: "mobile/app/_layout.tsx"
      provides: "Stack.Screen route registration for driver-application"
      contains: "driver-application"
  key_links:
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "backend POST /api/v1/users/me/become-driver"
      via: "api.post('/users/me/become-driver') mutation, on success navigates to /driver-application"
      pattern: "api\\.post\\(.\\/users\\/me\\/become-driver"
    - from: "mobile/app/driver-application.tsx"
      to: "backend POST /api/v1/transport/drivers then POST /api/v1/transport/drivers/:id/vehicles"
      via: "sequential api.post calls, driver id taken from the first response"
      pattern: "api\\.post\\(.\\/transport\\/drivers"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "backend POST /api/v1/transport/go-online and /transport/go-offline"
      via: "expo-location permission + position, then api.post, mirroring driver-dashboard.tsx's toggleMutation"
      pattern: "transport\\/go-online"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "mobile/app/rider-dashboard.tsx"
      via: "router.push('/rider-dashboard') from a new 'My Rides' menuRows entry"
      pattern: "rider-dashboard"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "mobile/app/driver-dashboard.tsx"
      via: "router.push('/driver-dashboard') link shown once the user's Driver profile is APPROVED"
      pattern: "driver-dashboard"
    - from: "mobile/app/_layout.tsx"
      to: "mobile/app/driver-application.tsx"
      via: "Stack.Screen name registration"
      pattern: "driver-application"
---

<objective>
Third of five sequential quick tasks closing gaps from a mobile completeness audit. There is no self-service path to become a DRIVER (DRIVER is not in `REGISTERABLE_ROLES` and no `become-driver` endpoint exists), and `driver-dashboard.tsx` / `rider-dashboard.tsx` — both already fully built and functional — have no reachable entry point anywhere in the app. This plan adds the missing role-grant endpoint, a driver-application form, and wires the Profile tab so both dashboards become reachable.

Purpose: Let a citizen actually onboard as a driver (grant role → submit licence/vehicle → await approval → go online) and let any user find their ride history, closing a chicken-and-egg gap where fully-built dashboards were unreachable.
Output: `POST /users/me/become-driver` backend endpoint; new `mobile/app/driver-application.tsx` screen; `mobile/app/(tabs)/profile.tsx` rewired with a real become-driver CTA, a real online/offline toggle, a driver-dashboard link, and a "My Rides" menu entry; route registered in `mobile/app/_layout.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session:

**Backend — becomeHost pattern to mirror exactly** (`backend/src/modules/users/users.service.ts` lines 75-94):
`becomeHost(userId)` looks up the user (`findUnique({ where: { id: userId, deletedAt: null }, select: { registeredRoles: true } })`), throws `NotFoundException` if missing, then does a single `prisma.user.update` setting `role: 'HOST' as UserRole` and `registeredRoles` to either the unchanged array (if it already includes `'HOST'`) or `{ set: [...user.registeredRoles, 'HOST' as UserRole] }` — selecting `USER_SELECT` (defined at the top of the file, lines 13-32) on return. No transaction, no profile-row creation, no PENDING gate on the role grant itself. `becomeDriver` must follow this *exact* shape substituting `'DRIVER'` for `'HOST'` — do NOT follow `becomeGuide`'s pattern (lines 102-128), which additionally upserts a `TourGuide` profile row inside a `$transaction`; that is deliberately NOT wanted here because the Driver profile row is created separately via the already-existing `POST /transport/drivers`.

**Backend — controller route to mirror** (`backend/src/modules/users/users.controller.ts` lines 77-82): `becomeHost` is `@Post('me/become-host') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: '...' }) becomeHost(@CurrentUser() user: { userId: string }) { return this.usersService.becomeHost(user.userId); }` under the controller-level `@UseGuards(JwtAuthGuard)` (no additional `@Roles` — any authenticated user may call it, since it is the self-service entry point). Add `becomeDriver` immediately after the existing `becomeGuide` route (line 89) using the identical shape.

**Backend — `UserRole` enum** (`backend/src/common/enums/user-role.enum.ts`): `DRIVER` is a valid enum member (line 7). `REGISTERABLE_ROLES` (lines 16-22) intentionally excludes `DRIVER` — this plan does not change that; the become-driver endpoint is the correct self-service path, exactly parallel to `become-host`/`become-guide`, both of which also grant roles outside `REGISTERABLE_ROLES`.

**Backend — existing test file conventions** (`backend/src/modules/users/__tests__/users.service.spec.ts`): `mockPrisma.user` mock has `findUnique`, `update`, `updateMany` jest mocks; tests for `switchRole` show the pattern for asserting `mockPrisma.user.update` was called with expected `data`. No existing `describe('becomeHost', ...)` block exists in this file yet (it was added to the service without tests) — this plan's new `describe('becomeDriver', ...)` block should follow the `switchRole`/`eraseData` test shape: (1) `NotFoundException` when `findUnique` resolves `null`, (2) adds `'DRIVER'` to `registeredRoles` and sets `role: 'DRIVER'` when not already present, (3) idempotent short-circuit path when `registeredRoles` already includes `'DRIVER'` (update still runs, but `registeredRoles` data passed through unchanged rather than a new `{ set: [...] }` array).

**Backend — transport endpoints this plan does NOT modify, confirmed already working** (`backend/src/modules/transport/transport.controller.ts`, full file read):
- `POST /transport/drivers` (line 62, `@Roles(DRIVER)`) — creates the `Driver` row, `status: PENDING_REVIEW` default. Body is `CreateDriverDto` (`backend/src/modules/transport/dto/create-driver.dto.ts`): `licenceNumber: string` (required, `@IsString @IsNotEmpty`), `licenceExpiry: string` (required, `@IsDateString`, e.g. `'2028-06-30'`), `metadata?: string` (optional).
- `POST /transport/drivers/:id/vehicles` (line 71, `@Roles(DRIVER)`, ownership-checked server-side) — body is `CreateVehicleDto` (`backend/src/modules/transport/dto/create-vehicle.dto.ts`): `type: VehicleType` (`@IsEnum`, one of `BIKE|TRICYCLE|CAR|MINIBUS`), `make: string`, `model: string`, `year: number` (`@IsInt @Min(1980) @Max(currentYear+1)`, `@Type(() => Number)` so a string from a TextInput coerces fine), `plateNumber: string`, `colour: string`, `imageUrl?: string` (optional, omit).
- `GET /transport/drivers/me` (line 54) — **no `@Roles` decorator**, callable by any authenticated user; returns the caller's Driver profile or `null`. Safe to query unconditionally from `profile.tsx` regardless of current role.
- `POST /transport/go-online` / `POST /transport/go-offline` (lines 99/109, `@Roles(DRIVER)`) — `go-online` body is `{ lat, lng }`; server throws `ForbiddenException` unless the caller's `driver.status === 'APPROVED'`.
- `PATCH /transport/drivers/:id/approve` (line 84, `@Roles(LGA_ADMIN)`) — admin approval, already built, out of scope.

**Mobile — `driver-dashboard.tsx` real go-online/go-offline pattern to mirror** (`mobile/app/driver-dashboard.tsx`, full file, 262 lines): imports `import * as Location from 'expo-location'` and `{ fetcher, api, getErrorMessage } from '../lib/api'`. Its `toggleMutation` (lines 54-68): if currently online, `api.post('/transport/go-offline')`; else `Location.requestForegroundPermissionsAsync()` → throw if not granted → `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` → `api.post('/transport/go-online', { lat: pos.coords.latitude, lng: pos.coords.longitude })`. `onError` uses `Alert.alert('Error', getErrorMessage(e, e?.message ?? 'Please try again.'))`. It queries `driverProfile` via `fetcher('/transport/drivers/me')` and derives `isOnline` from `(driverProfile?.data ?? driverProfile)?.isOnline`. This screen itself needs NO changes — it is the navigation target once reachable.

**Mobile — `rider-dashboard.tsx`** (full file, 187 lines): fully functional (`GET /transport/trips/me`, active-trip detection, CTAs into `/transport-flow`). No changes needed — only needs a reachable entry point pointing TO it.

**Mobile — `host.tsx` become-X mutation + navigate pattern to mirror** (`mobile/app/host.tsx` lines 118-151): `useMutation({ mutationFn: () => api.post('/users/me/become-host').then(r => r.data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['me'] }); Alert.alert(...); }, onError: (err) => { const e = err as any; const msg = e?.response?.data?.message; Alert.alert('Error', Array.isArray(msg) ? msg.join(', ') : msg ?? 'Something went wrong...'); } })`. This plan's become-driver mutation should use `getErrorMessage` (from `mobile/lib/api.ts`, already used elsewhere in this codebase) instead of re-deriving the message inline, since that helper already exists and is the established convention (see `driver-dashboard.tsx` above) — prefer it over duplicating `host.tsx`'s inline message-extraction.

**Mobile — `mobile/app/(tabs)/profile.tsx` current bug** (full file, 1119 lines): `driverMode` local state (line 343) is never synced to any API. `isDriverOrAdmin` (lines 418-419) is `role === 'DRIVER' || role === 'ADMIN'` — `'ADMIN'` cannot ever match a real `UserRole` (valid admin roles are `LGA_ADMIN`/`STATE_ADMIN`/`SUPER_ADMIN`/`MINISTRY_VIEWER`), dead branch, remove it. The driver card (JSX lines 596-614) is entirely hidden unless `isDriverOrAdmin` — so a CITIZEN wanting to become a driver sees nothing. `DriverCardContent` (lines 677-700) renders a title flipping between `'Driver mode is ON'`/`'Become a driver'` bound to a `ToggleSwitch` (`toggleStyles`, lines 225-265) whose `onValueChange` only flips local state — zero API call, zero navigation. The existing `UserProfile` interface (lines 72-82) already has `registeredRoles?: string[]`. Current imports: `Check, CheckCircle, ChevronRight, Car, Shield, Ticket, ShoppingBag, Heart, Clock, Home, MessageSquare` from `lucide-react-native` (lines 30-43); `Car` is already used for the driver card icon — use a *different* icon (e.g. `Navigation`) for the new "My Rides" menu row to avoid visual confusion between the driver card and the rider menu entry. `menuRows` array (lines 435-473) is the established pattern for reachable account-area entry points (`{ icon, label, sub, onPress, isLast? }`), currently ending with "Security & ID" (`isLast: true`) — append a new row before it (adjusting which row carries `isLast: true`).

**Mobile — `mobile/lib/api.ts`**: exports `api` (configured axios instance, auth+refresh interceptors already attached) and `getErrorMessage(err, fallback)` — route all new API error messages through this before `Alert.alert`, since `class-validator` 400s return `message` as a string array that crashes the native alert bridge if passed raw.

**Mobile — date picker + selectable-chip components already available, no new npm install needed**: `@react-native-community/datetimepicker` (`8.0.1`) is already an installed dependency, already used in `mobile/components/stays/HourlyBookingSheet.tsx` (pattern: `<DateTimePicker value={date} mode="date" minimumDate={...} onChange={(_: unknown, d?: Date) => { if (Platform.OS !== 'ios') setShowDate(false); if (d) setDate(d); }} />`, rendered conditionally behind a `showDate` boolean toggled by a `Pressable`). `mobile/components/ui/Chip.tsx` exports a `Chip` component with `{ label, active, onPress, icon, style }` props (active/inactive pill styling already built) — reuse this for the 4-way `VehicleType` selector (`BIKE|TRICYCLE|CAR|MINIBUS`) instead of building a new picker component.

**Mobile — `mobile/app/_layout.tsx`** (78 lines): screens registered as flat `<Stack.Screen name="..." options={{ title, presentation }} />` entries, e.g. `<Stack.Screen name="kyc" options={{ title: 'Identity Verification', presentation: 'card' }} />` (line 48). `driver-dashboard` and `rider-dashboard` are already registered (lines 61-62, `presentation: 'fullScreenModal', headerShown: false`) — these do NOT need changes. Only `driver-application` needs a new registration, following the `kyc`/`card`-presentation convention (title + back button via the native header, not a custom full-bleed header).

Note: two other quick tasks running concurrently this session also touch `mobile/app/(tabs)/profile.tsx` and `mobile/app/_layout.tsx` (password-recovery adds a menu row + logout fix + route registrations; profile-edit adds avatarUrl/AvatarRing changes + a Danger Zone + one route registration) — this is expected and reconciled by the orchestrator at merge time. Plan and implement this task's edits as if working from a clean current-main baseline.
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add POST /users/me/become-driver backend endpoint</name>
  <files>backend/src/modules/users/users.service.ts, backend/src/modules/users/users.controller.ts, backend/src/modules/users/__tests__/users.service.spec.ts</files>
  <action>
    In `backend/src/modules/users/users.service.ts`, add a `becomeDriver(userId: string)` method immediately after `becomeHost` (before `becomeGuide`), mirroring `becomeHost`'s exact structure: look up the user via `findUnique({ where: { id: userId, deletedAt: null }, select: { registeredRoles: true } })`, throw `NotFoundException('User not found')` if not found, then `prisma.user.update` with `data: { registeredRoles: user.registeredRoles.includes('DRIVER' as UserRole) ? user.registeredRoles : { set: [...user.registeredRoles, 'DRIVER' as UserRole] }, role: 'DRIVER' as UserRole }`, `select: USER_SELECT`, and return the updated user. Add a one-line JSDoc comment above it analogous to `becomeHost`'s (e.g. "Become a driver — adds DRIVER to registeredRoles and switches active role. Driver *profile* creation (licence/vehicle, PENDING_REVIEW) happens separately via POST /transport/drivers."). Do NOT wrap in a transaction and do NOT create any Driver/profile row here — that responsibility stays entirely in the existing `transport.service.ts` flow, per the chicken-and-egg fix design already decided (role grant is immediate/self-service; the driver *capability* to actually go online remains gated by the separate, already-built `Driver.status === 'APPROVED'` check in `TransportService.goOnline`).

    In `backend/src/modules/users/users.controller.ts`, add a route immediately after the existing `becomeGuide` route: `@Post('me/become-driver') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Promote current user to DRIVER and add DRIVER to registeredRoles' }) becomeDriver(@CurrentUser() user: { userId: string }) { return this.usersService.becomeDriver(user.userId); }` — same `@CurrentUser()` and `HttpStatus.OK` pattern as `becomeHost`/`becomeGuide`, inheriting the controller-level `@UseGuards(JwtAuthGuard)` (no additional `@Roles` guard — this is the self-service grant endpoint, exactly like `become-host`).

    In `backend/src/modules/users/__tests__/users.service.spec.ts`, add a `describe('becomeDriver', ...)` block (after the `switchRole` block) with three tests following the existing `switchRole`/`eraseData` mocking style: (1) throws `NotFoundException` when `mockPrisma.user.findUnique` resolves `null`; (2) when `findUnique` resolves `{ registeredRoles: ['CITIZEN'] }` and `update` resolves an updated user, calling `service.becomeDriver('u1')` results in `mockPrisma.user.update` being called with `data: expect.objectContaining({ role: 'DRIVER' })` and `registeredRoles` containing `'DRIVER'`; (3) when `findUnique` resolves `{ registeredRoles: ['CITIZEN', 'DRIVER'] }` (already a driver), the update call's `registeredRoles` data is the same unchanged array (not a new `{ set: [...] }` with a duplicate), asserting idempotency.
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit && npx jest src/modules/users/__tests__/users.service.spec.ts</automated>
  </verify>
  <done>`UsersService.becomeDriver` exists mirroring `becomeHost`'s exact structure (no transaction, no profile-row creation, no PENDING gate on the role grant). `POST /users/me/become-driver` route exists on `UsersController`, guarded only by the controller-level `JwtAuthGuard`. New `describe('becomeDriver', ...)` tests pass. `npx tsc --noEmit` and the targeted jest run both succeed.</done>
</task>

<task type="auto">
  <name>Task 2: Build driver-application screen and wire Profile tab reachability (become-driver CTA, real online toggle, driver-dashboard link, My Rides entry)</name>
  <files>mobile/app/driver-application.tsx, mobile/app/(tabs)/profile.tsx, mobile/app/_layout.tsx</files>
  <action>
    Create `mobile/app/driver-application.tsx` following `host.tsx`'s "logged-in utility screen" conventions (import design tokens from `../lib/tokens`, `api`/`getErrorMessage` from `../lib/api`, `router` from `expo-router`). Local form state: `licenceNumber` (string), `licenceExpiry` (Date, default e.g. one year from today), `showDatePicker` (boolean), `vehicleType` (one of `'BIKE'|'TRICYCLE'|'CAR'|'MINIBUS'`, default `'CAR'`), `make`/`model`/`plateNumber`/`colour` (strings), `year` (string, numeric TextInput, `keyboardType="number-pad"`).

    Licence section: a `TextInput` for `licenceNumber`, and a `Pressable` showing the formatted `licenceExpiry` date that toggles `showDatePicker`; render `<DateTimePicker value={licenceExpiry} mode="date" minimumDate={new Date()} onChange={(_: unknown, d?: Date) => { if (Platform.OS !== 'ios') setShowDatePicker(false); if (d) setLicenceExpiry(d); }} />` conditionally behind `showDatePicker`, mirroring `HourlyBookingSheet.tsx`'s exact pattern (import `DateTimePicker from '@react-native-community/datetimepicker'`).

    Vehicle section: a row of four `Chip` components (`import { Chip } from '../components/ui/Chip'`) labeled Bike/Tricycle/Car/Minibus, each `active={vehicleType === 'BIKE'|...}` and `onPress={() => setVehicleType('BIKE'|...)}`; then `TextInput`s for `make`, `model`, `year`, `plateNumber`, `colour`, styled consistently with existing form inputs elsewhere in the app (bordered, using `BORDER`/`SURFACE_RAISED`/`INK` tokens).

    Submit: a `useMutation` whose `mutationFn` first calls `api.post('/transport/drivers', { licenceNumber, licenceExpiry: licenceExpiry.toISOString().slice(0, 10) })`, extracts the created driver's `id` from the response (`r.data?.data?.id ?? r.data?.id`), then calls `api.post(`/transport/drivers/${driverId}/vehicles`, { type: vehicleType, make, model, year: Number(year), plateNumber, colour })`. Validate before submitting that `licenceNumber`, `make`, `model`, `year` (valid number, 1980..currentYear+1), `plateNumber`, and `colour` are all non-empty — show an inline validation `Alert.alert` and stop if not, rather than submitting an invalid request. On mutation success: `Alert.alert('Application submitted', 'Your driver application is under review. We will notify you once approved — this can take up to 48 hours.', [{ text: 'Done', onPress: () => router.replace('/(tabs)/profile' as never) }])` — this message must explicitly convey pending approval (unlike `host.tsx`'s no-approval-gate "Welcome aboard!" copy, do not reuse that wording, since Driver has a real `PENDING_REVIEW` status the user must know about). On error, `Alert.alert('Error', getErrorMessage(err, 'Could not submit your application. Please try again.'))` — this covers failure at either the drivers or vehicles call since both are chained inside one `mutationFn`. Disable the submit button while `mutation.isPending`, showing an `ActivityIndicator`.

    In `mobile/app/_layout.tsx`, add `<Stack.Screen name="driver-application" options={{ title: 'Become a Driver', presentation: 'card' }} />` immediately after the existing `<Stack.Screen name="kyc" .../>` line, matching that registration's shape (title + native back button, no `headerShown: false`).

    In `mobile/app/(tabs)/profile.tsx`: remove the dead `role === 'ADMIN'` branch. Replace the single `isDriverOrAdmin` boolean with two derived flags: `isDriver = (user?.registeredRoles ?? []).includes('DRIVER')` and query the caller's own Driver profile unconditionally via `useQuery({ queryKey: ['driver-me'], queryFn: () => fetcher('/transport/drivers/me') })` (safe for any user — this endpoint has no `@Roles` guard), deriving `driverProfile = driverMeQuery.data?.data ?? driverMeQuery.data ?? null` and `driverApproved = driverProfile?.status === 'APPROVED'`. Replace the single `driverCardWrap` conditional block (lines ~596-614) with three mutually-exclusive states in its place: (1) `!isDriver` — render a "Become a driver" CTA card (same visual structure as the existing "Become a Host CTA" block below it: `PressableScale` + icon box + title/sub + chevron) whose `onPress` triggers a `useMutation` calling `api.post('/users/me/become-driver')`, and on success `queryClient.invalidateQueries({ queryKey: ['me'] })` then `router.push('/driver-application' as never)`; on error, `Alert.alert('Error', getErrorMessage(err, 'Could not start your driver application. Please try again.'))`; (2) `isDriver && !driverProfile` — render a "Complete your driver application" CTA (same visual shape) that just navigates straight to `/driver-application` (role is already granted, only the profile/vehicle submission remains); (3) `isDriver && driverProfile && !driverApproved` — render a static, non-interactive card stating the application is under review (no toggle, since `go-online` will always 403 until approved); (4) `isDriver && driverApproved` — render the existing `DriverCardContent` toggle card, but rewire its `ToggleSwitch` to a real `useMutation` mirroring `driver-dashboard.tsx`'s `toggleMutation` exactly (`import * as Location from 'expo-location'`; if turning off call `api.post('/transport/go-offline')`, if turning on request `Location.requestForegroundPermissionsAsync()` → throw if not granted → `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` → `api.post('/transport/go-online', { lat, lng })`), driving `driverMode` from the real `driverProfile.isOnline` field instead of local-only state, invalidating `['driver-me']` on success and showing `Alert.alert('Error', getErrorMessage(err, ...))` on failure; additionally render a "Go to driver dashboard" link/button beneath the toggle that calls `router.push('/driver-dashboard' as never)`.

    Update the necessary imports at the top of `profile.tsx`: change `import { fetcher } from '../../lib/api';` to `import { fetcher, api, getErrorMessage } from '../../lib/api';`; add `import * as Location from 'expo-location';`; add `useMutation, useQueryClient` to the existing `@tanstack/react-query` import; add `Navigation` to the `lucide-react-native` import list (for the new menu row icon, kept distinct from `Car` which the driver card already uses); add `PressableScale` is already imported.

    Finally, append a new entry to the `menuRows` array (before the current last entry "Security & ID", moving `isLast: true` to the new final entry as needed): `{ icon: Navigation, label: 'My Rides', sub: 'Active and past trips', onPress: () => router.push('/rider-dashboard' as never) }`.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>`mobile/app/driver-application.tsx` exists, collects licence + vehicle fields, and on submit calls `POST /transport/drivers` then `POST /transport/drivers/:id/vehicles`, showing a pending-review success message and navigating back to the Profile tab. `mobile/app/_layout.tsx` registers the `driver-application` route. `mobile/app/(tabs)/profile.tsx` no longer hides all driver UI behind a dead `role === 'ADMIN'` check: non-drivers see a real "Become a driver" CTA that calls `POST /users/me/become-driver` and navigates to the application screen; drivers with an unapproved profile see a pending-review message; approved drivers see a real go-online/go-offline toggle wired to `/transport/go-online`/`/transport/go-offline` plus a link to `/driver-dashboard`. A new "My Rides" menu row navigates to `/rider-dashboard`. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile app → backend `POST /users/me/become-driver` | Authenticated user self-grants the DRIVER role (no admin approval on the role grant itself) |
| Mobile app → backend `POST /transport/drivers` / `POST /transport/drivers/:id/vehicles` | User-supplied licence number and vehicle details cross into an already-validated (`class-validator`), already-ownership-checked, already-`PENDING_REVIEW`-gated pipeline |
| Mobile app → backend `POST /transport/go-online` / `go-offline` | User-supplied GPS coordinates cross into a driver-only, approval-gated endpoint |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Elevation of Privilege (self-service role grant) | `POST /users/me/become-driver` | accept | Mirrors the already-accepted `become-host`/`become-guide` design: granting the `DRIVER` role alone confers no real capability — `TransportService.goOnline` independently requires `Driver.status === 'APPROVED'`, which only an `LGA_ADMIN` can set via the existing, unmodified `PATCH /transport/drivers/:id/approve`. No new attack surface beyond the existing pattern. |
| T-quick-02 | Tampering (submitting vehicle data against another user's driver id) | `mobile/app/driver-application.tsx` → `POST /transport/drivers/:id/vehicles` | mitigate | Mobile only ever uses the driver id returned from its own immediately-preceding `POST /transport/drivers` call in the same flow — never a user-suppliable id — and the server independently enforces ownership on that route (pre-existing, unmodified control). |
| T-quick-03 | Information Disclosure (licence number in transit) | `mobile/app/driver-application.tsx` → `POST /transport/drivers` | accept | Transits over the app's existing TLS-only axios `api` instance (`mobile/lib/api.ts`), no new plaintext channel introduced; consistent with existing NIN/BVN submission flows already accepted elsewhere in the app. |
| T-quick-04 | Denial of Service (repeated become-driver calls) | `POST /users/me/become-driver` | accept | Idempotent short-circuit identical to `becomeHost`'s existing behavior — repeated calls simply re-set the same role/array, negligible cost, no new resource exhaustion vector. |

</threat_model>

<verification>
1. `cd backend && npx tsc --noEmit && npx jest src/modules/users/__tests__/users.service.spec.ts` passes.
2. `cd mobile && npx tsc --noEmit` passes.
3. Manual read-through: `becomeDriver` mirrors `becomeHost` exactly (no transaction, no profile creation) and the controller route has no `@Roles` guard beyond the controller-level `JwtAuthGuard`.
4. Manual read-through: `driver-application.tsx` chains `POST /transport/drivers` → `POST /transport/drivers/:id/vehicles` using the id from the first response, and its success message explicitly mentions pending review (not host's "Welcome aboard!" copy).
5. Manual read-through: `profile.tsx` shows the correct one of four driver-related states (not-a-driver CTA / complete-application CTA / pending-review card / real online toggle + dashboard link) based on `registeredRoles` and the live `GET /transport/drivers/me` response, and the "My Rides" menu row navigates to `/rider-dashboard`.
</verification>

<success_criteria>
- `POST /users/me/become-driver` exists, grants the DRIVER role following the exact `becomeHost` pattern, and is covered by passing unit tests.
- A user with no DRIVER role sees a real "Become a driver" CTA on the Profile tab that grants the role and opens a new driver-application form.
- The driver-application form successfully creates a Driver profile and attaches a vehicle via the existing, unmodified transport endpoints.
- A user with an APPROVED Driver profile sees a real, working online/offline toggle and a link to the full driver dashboard.
- Any signed-in user can reach the rider dashboard via a new "My Rides" entry in the Profile tab.
- No files under `backend/src/modules/transport/` are modified.
- `cd backend && npx tsc --noEmit && npx jest src/modules/users/__tests__/users.service.spec.ts` and `cd mobile && npx tsc --noEmit` both pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-bph-fix-driver-and-rider-dashboard-reachabil/260727-bph-SUMMARY.md`
</output>
