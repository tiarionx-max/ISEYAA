---
phase: quick
plan: 260727-bhw
type: execute
wave: 1
depends_on: []
files_modified:
  - mobile/app/profile-edit.tsx
  - mobile/app/_layout.tsx
  - mobile/app/(tabs)/profile.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "A signed-in user can open a dedicated Edit Profile screen from the Profile tab and change their first and last name, with the change reflected on the Profile tab afterward"
    - "A signed-in user can pick a photo from their device library and upload it as their avatar; once uploaded, the real photo displays (instead of text initials) on both the Profile tab and the Edit Profile screen"
    - "A signed-in user can find an account-deletion action in a visually separated 'danger zone' on the Profile tab, distinct from and below Sign Out, that cannot be triggered by a single accidental tap"
    - "Confirming account deletion anonymizes the account server-side (NDPA right-to-erasure), best-effort revokes the refresh token, clears local session tokens, and returns the user to the onboarding screen since the account is no longer usable"
  artifacts:
    - path: "mobile/app/profile-edit.tsx"
      provides: "Edit Profile screen: firstName/lastName form (PATCH /users/me) and avatar picker + upload (POST /users/me/avatar, multipart)"
      min_lines: 150
    - path: "mobile/app/_layout.tsx"
      provides: "Stack.Screen route registration for profile-edit"
      contains: "profile-edit"
    - path: "mobile/app/(tabs)/profile.tsx"
      provides: "UserProfile.avatarUrl field, AvatarRing real-image rendering with initials fallback, edit entry point navigating to /profile-edit, and a Danger Zone section with a confirmed, irreversible account-deletion action"
      contains: "avatarUrl"
  key_links:
    - from: "mobile/app/profile-edit.tsx"
      to: "backend PATCH /api/v1/users/me"
      via: "api.patch('/users/me', { firstName, lastName }) via the shared axios instance — omit avatarUrl and lgaId from this call"
      pattern: "api\\.patch\\(.\\/users\\/me"
    - from: "mobile/app/profile-edit.tsx"
      to: "backend POST /api/v1/users/me/avatar"
      via: "api.post('/users/me/avatar', formData) with a 'file' field built from an expo-image-picker asset"
      pattern: "api\\.post\\(.\\/users\\/me\\/avatar"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "mobile/app/profile-edit.tsx"
      via: "router.push('/profile-edit')"
      pattern: "profile-edit"
    - from: "mobile/app/(tabs)/profile.tsx"
      to: "backend DELETE /api/v1/users/me/data"
      via: "api.delete('/users/me/data') inside a destructive Alert.alert confirmation, followed by best-effort POST /auth/logout, SecureStore token clear, and router.replace('/onboarding')"
      pattern: "api\\.delete\\(.\\/users\\/me\\/data"
---

<objective>
Mobile has no way for a signed-in user to edit their profile (name, avatar) or to exercise NDPA right-to-erasure, despite both backend endpoints (`PATCH /users/me`, `POST /users/me/avatar`, `DELETE /users/me/data`) being complete and production-ready. This plan closes both mobile client gaps — no backend changes.

Purpose: Give ISEYAA mobile users self-service profile editing and a compliant, unambiguous account-deletion path, per the 2026-07-27 mobile completeness audit (gaps 3 and 4).
Output: New `mobile/app/profile-edit.tsx` screen (name edit + avatar upload); route registered in `mobile/app/_layout.tsx`; `mobile/app/(tabs)/profile.tsx` updated with real avatar display, an edit entry point, and a separated account-deletion "Danger Zone".
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection this session, all backend facts require no backend changes:

- `PATCH /users/me` (`backend/src/modules/users/users.controller.ts:116-123`) delegates to `usersService.update(user.userId, body)`, body validated by `UpdateUserDto` (`backend/src/modules/users/dto/update-user.dto.ts`): only `firstName`, `lastName`, `avatarUrl`, `lgaId` are accepted (all `@IsOptional`), extra fields are stripped by the global `ValidationPipe`'s `whitelist: true`. This plan's edit form sends only `firstName`/`lastName` — never `avatarUrl` (set exclusively by the avatar endpoint below) or `lgaId` (no LGA picker exists in mobile, out of scope).
- `POST /users/me/avatar` (`backend/src/modules/users/users.controller.ts:91-107`) uses `FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })` — the multipart field name MUST be exactly `'file'`. Server validates via `imageService.validateImage`, resizes to 512x512 webp via `imageService.resizeAvatar`, uploads to S3, calls `usersService.update(user.userId, { avatarUrl })` itself, and returns `{ avatarUrl }`. Mobile does not need to resize client-side and does not need to call `PATCH /users/me` separately to persist the URL — the avatar endpoint does that internally.
- `DELETE /users/me/data` (`backend/src/modules/users/users.controller.ts:109-114`) calls `usersService.eraseData(user.userId)` (`backend/src/modules/users/users.service.ts:130-171`): nulls email/phone/passwordHash/avatarUrl/NIN/BVN/hashes/KYC timestamps, replaces firstName/lastName with `deleted_{userId}`, sets `status: 'DELETED'`, `deletedAt`, writes an audit log. It does NOT revoke tokens or touch Redis — the mobile client is fully responsible for ending the local session after a successful call.
- `POST /auth/logout` (`backend/src/modules/auth/auth.controller.ts:68-75`) requires a JWT bearer (already attached by the shared `api` instance's request interceptor) and a body matching `LogoutDto` (`{ refreshToken: string }`); it blacklists that refresh token only — it does not affect the still-live access token, so calling it does not block a subsequent authenticated call in the same flow.

Mobile source of truth — read directly, full files, this session:

- `mobile/app/(tabs)/profile.tsx` (1119 lines): `UserProfile` interface (lines 72-82) has no `avatarUrl` field yet. `AvatarRing` (lines 143-169, styles 171-221) only ever renders text initials inside `photoCircle` — never reads any avatar URL. `handleLogout()` (lines 388-410) is the established `Alert.alert` destructive-confirmation pattern: title, message, Cancel + destructive-style action button, `SecureStore.deleteItemAsync('access_token'/'refresh_token')`, `router.replace('/onboarding' as any)`. The Sign Out button + version text live in `signOutSection` (JSX lines 656-667, styles 1086-1109) — the last block in the scroll content. No "Edit Profile" or "Delete account" entry point exists anywhere in the file (menuRows array, lines 435-473, or elsewhere).
- `mobile/app/stays/[id].tsx`: establishes this codebase's "real image with initials/placeholder fallback" pattern — `import { Image as ExpoImage } from 'expo-image'` and `<ExpoImage source={{ uri }} contentFit="cover" .../>`, used conditionally against a fallback when no URL is present.
- `mobile/app/kyc.tsx`: establishes the "logged-in utility screen" layout convention — `SafeAreaView` + `ScrollView`, relies on the native `Stack.Screen` header (title + back button) registered in `_layout.tsx` rather than a custom full-bleed auth-style header, since it's reached from within the authenticated area, not onboarding.
- `mobile/app/_layout.tsx` (78 lines): `Stack` has global `screenOptions` (dark header, gold tint) and screens are registered as `<Stack.Screen name="..." options={{ title, presentation }} />`, e.g. `<Stack.Screen name="kyc" options={{ title: 'Identity Verification', presentation: 'card' }} />` (line 48).
- `mobile/lib/api.ts` (81 lines): exports `api` (configured axios instance with auth + refresh interceptors already attached — do not duplicate auth header logic) and `getErrorMessage(err, fallback)` (always route API errors through this before `Alert.alert`, since `class-validator` 400s return `message` as a string array that crashes the native alert bridge if passed raw).
- `mobile/lib/tokens.ts`: exports `SURFACE_DEEP, SURFACE_RAISED, SURFACE_ELEV, GOLD, GOLD_BRIGHT, GOLD_DIM, GOLD_LINE, CREAM, INK, INK_MID, INK_FAINT, BORDER, ERROR, DESTRUCTIVE, DESTRUCTIVE_DIM, RADIUS_SM, RADIUS_LG, SPACE_3/4/5, FONT_DISPLAY, FONT_MONO` — reuse these, do not invent new color literals.
- `expo-image-picker` (`~15.1.0`) and `expo-image` (`~1.13.0`) are both already installed dependencies with zero (`expo-image-picker`) or one existing (`expo-image`, in `stays/[id].tsx`) call site — confirmed via grep. No new npm install needed.
- No multipart/FormData upload helper exists anywhere in `mobile/` (confirmed via grep across `mobile/` for `multipart|FormData|append\(.*file`) — this plan is the first call site; build it inline in `profile-edit.tsx`, do not add a new shared helper to `lib/api.ts` for a single call site.
- `lucide-react-native` (`^0.378.0`) is already imported throughout `mobile/` for icons; no existing call site uses `Pencil`, `Camera`, `Trash2`, or `AlertTriangle` yet, but all four are standard icons in this version and safe to import directly.
</verified_facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the Edit Profile screen (name + avatar upload), register its route, and wire real avatar display into the Profile tab</name>
  <files>mobile/app/profile-edit.tsx, mobile/app/_layout.tsx, mobile/app/(tabs)/profile.tsx</files>
  <action>
    Create `mobile/app/profile-edit.tsx` following the `kyc.tsx` "logged-in utility screen" layout convention (`SafeAreaView` + `ScrollView`, relies on the native `Stack.Screen` header for title/back — no custom auth-style header or `AdireOrnament`), but import design tokens from `mobile/lib/tokens.ts` (per this session's established convention) rather than local hex constants. Use `useQuery(['me'], () => fetcher('/users/me'))` (import `fetcher` from `../lib/api`) to load the current profile; on first successful load (guard with a `useState` "initialized" flag plus `useEffect`, so a background refetch never clobbers in-progress edits) seed local `firstName`/`lastName` string state from the response and local `avatarUrl` state from `user.avatarUrl`.

    Avatar section: render a large circular preview (reuse the `AvatarRing` visual proportions or a simplified equivalent sized ~96-100px) showing an `expo-image` `Image` (`import { Image as ExpoImage } from 'expo-image'`) with `contentFit="cover"` when `avatarUrl` is set, falling back to initials text derived the same way `profile.tsx`'s `getInitials` helper does (either import/reuse that helper by extracting it to a shared location, or duplicate the same logic locally — duplicating is acceptable here since it is a small pure function and this codebase's convention already duplicates `AdireOrnament` per-screen). Overlay a small circular button using the `Camera` icon from `lucide-react-native` that triggers avatar selection.

    Avatar selection/upload flow: request permission via `ImagePicker.requestMediaLibraryPermissionsAsync()` (`import * as ImagePicker from 'expo-image-picker'`); if not granted, show `Alert.alert` explaining photo access is needed and stop. On grant, call `ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })`. If not canceled, take the first asset, derive a filename from its `uri` (fallback to `avatar.jpg` if the URI has no extension) and a MIME type (prefer `asset.mimeType` if present, else infer from the extension, mapping `jpg`→`image/jpeg`), build a `FormData` instance and `append('file', { uri: asset.uri, name: filename, type: mimeType } as any)`, then call `api.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } })` (import `api`, `getErrorMessage` from `../lib/api`) wrapped in a `useMutation`. On success, set local `avatarUrl` state from the response's `avatarUrl` and call `queryClient.invalidateQueries({ queryKey: ['me'] })` so `profile.tsx` picks up the change on next focus. On error, `Alert.alert('Upload failed', getErrorMessage(err, 'Could not upload photo. Please try again.'))`. Show an `ActivityIndicator` overlay on the avatar while the upload mutation is pending.

    Name form: two `TextInput` rows for `firstName` (`autoCapitalize="words"`) and `lastName` (`autoCapitalize="words"`), styled consistently with existing form screens (bordered input using `BORDER`/`SURFACE_RAISED`/`INK` tokens). A "Save changes" button (disabled when both fields are unchanged from the loaded values, or empty, or a save mutation is pending) calls a `useMutation` that does `api.patch('/users/me', { firstName: firstName.trim(), lastName: lastName.trim() })`. On success, invalidate `['me']` and call `router.back()` (`import { router } from 'expo-router'`). On error, `Alert.alert('Save failed', getErrorMessage(err, 'Could not update profile. Please try again.'))`.

    In `mobile/app/_layout.tsx`, add `<Stack.Screen name="profile-edit" options={{ title: 'Edit Profile', presentation: 'card' }} />` immediately after the existing `<Stack.Screen name="kyc" .../>` line, matching that registration's shape.

    In `mobile/app/(tabs)/profile.tsx`: add `avatarUrl?: string | null;` to the `UserProfile` interface (near the existing `phone`/`role` fields). Update the `AvatarRing` function to accept an additional `avatarUrl?: string | null` prop; when present, render an `expo-image` `Image` (`import { Image as ExpoImage } from 'expo-image'`, same import convention as `stays/[id].tsx`) filling `avatarStyles.photoCircle`'s dimensions with `contentFit="cover"` and matching `borderRadius`, instead of the initials `Text` — keep the initials `Text` as the fallback branch when `avatarUrl` is absent. Update the call site (`<AvatarRing initials={initials} />`, currently ~line 485) to pass `avatarUrl={user?.avatarUrl}`. Add a small `Pencil`-icon (`lucide-react-native`) edit affordance positioned near the `nameBlock`/`nameRow` (e.g. a small `Pressable` icon button beside or below the display name, accessibilityLabel "Edit profile") that calls `router.push('/profile-edit' as any)`.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>mobile/app/profile-edit.tsx exists, loads the current profile, lets the user pick a library photo and upload it via POST /users/me/avatar (multipart, field name "file"), and lets the user edit firstName/lastName via PATCH /users/me (no other fields sent). mobile/app/_layout.tsx registers the profile-edit route. mobile/app/(tabs)/profile.tsx's UserProfile interface includes avatarUrl, AvatarRing renders a real photo when avatarUrl is present (falling back to initials otherwise), and a reachable edit entry point navigates to /profile-edit. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Add a separated, confirmed account-deletion "Danger Zone" to the Profile tab</name>
  <files>mobile/app/(tabs)/profile.tsx</files>
  <action>
    In `mobile/app/(tabs)/profile.tsx`, add a `handleDeleteAccount()` async function, structured after `handleLogout()`'s `Alert.alert` pattern but strengthened for irreversibility: title something like "Delete your account?", message explicitly stating the action is permanent, that all personal data (name, contact info, verification records) will be anonymized per Nigerian data protection law, and that the user will be signed out immediately with no way to undo it. Two buttons: `{ text: 'Cancel', style: 'cancel' }` and a destructive-style confirm button labeled "Delete my account" (`style: 'destructive'`). On confirm: call `api.delete('/users/me/data')` (import `api` alongside the existing `getErrorMessage`/`fetcher` imports from `../../lib/api`); on success, best-effort call `api.post('/auth/logout', { refreshToken })` where `refreshToken` is read via `SecureStore.getItemAsync('refresh_token')` immediately beforehand, wrapped in its own `try/catch` that swallows any failure (logout failing must not block the rest of the flow — mirror the "call /auth/logout best-effort" pattern independently, do not import from or depend on any other quick task's files); then unconditionally `await SecureStore.deleteItemAsync('access_token')` and `await SecureStore.deleteItemAsync('refresh_token')`; then `router.replace('/onboarding' as any)`. If the `DELETE /users/me/data` call itself fails, show `Alert.alert('Deletion failed', getErrorMessage(err, 'Could not delete your account. Please try again.'))` and do not clear tokens or navigate.

    Render a new "Danger Zone" section directly below the existing `signOutSection` (after the `versionText`, still inside the `ScrollView`), visually distinct: a low-emphasis heading (e.g. small uppercase kicker-style label using `INK_FAINT`/`FONT_MONO`, reading "DANGER ZONE"), a short one-line explanatory caption, and a button styled with `DESTRUCTIVE`/`DESTRUCTIVE_DIM` tokens (border/text in destructive red, similar structural shape to `signOutBtn` but visually distinguishable, e.g. filled `DESTRUCTIVE_DIM` background instead of transparent) labeled "Delete account", wired to `handleDeleteAccount`. Give it `accessibilityRole="button"` and `accessibilityLabel="Delete account permanently"`. Keep adequate vertical spacing/margin from `signOutSection` so it cannot be mistaken for or mis-tapped as part of the Sign Out action.
  </action>
  <verify>
    <automated>cd mobile && npx tsc --noEmit</automated>
  </verify>
  <done>mobile/app/(tabs)/profile.tsx has a visually separated Danger Zone section below Sign Out with a "Delete account" button. Tapping it shows an unambiguous, irreversibility-explicit Alert.alert confirmation. Confirming calls DELETE /users/me/data, then best-effort POST /auth/logout, then clears both SecureStore tokens, then navigates to /onboarding. A failed deletion call shows an error and does not clear tokens or navigate. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Mobile app → backend `PATCH /users/me` | User-supplied name fields cross into an already-hardened, mass-assignment-safe DTO (`UpdateUserDto`, whitelist-stripped) |
| Mobile app → backend `POST /users/me/avatar` | User-supplied binary image data crosses into an already-validated (type/size), server-resized upload pipeline |
| Mobile app → backend `DELETE /users/me/data` | An irreversible, destructive, PII-anonymizing action triggered entirely from client-side user intent |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering (mass assignment) | `mobile/app/profile-edit.tsx` PATCH call | mitigate | Request body is hardcoded to exactly `{ firstName, lastName }` — never spreads arbitrary form state — and the backend's `UpdateUserDto` + global `whitelist: true` ValidationPipe independently strip anything else, so this is defense in depth, not the sole control |
| T-quick-02 | Repudiation (accidental irreversible deletion) | `mobile/app/(tabs)/profile.tsx` Danger Zone | mitigate | Destructive action requires an explicit `Alert.alert` confirmation with irreversibility spelled out in plain language, is visually separated from Sign Out with distinct destructive styling, and has no path to trigger without a second, deliberate tap |
| T-quick-03 | Denial of Service (large/malicious avatar upload) | `POST /users/me/avatar` | accept | Server already enforces a 5MB `multer` limit and `imageService.validateImage` type checking — this plan sends the raw picked asset and relies entirely on those existing server-side controls, introducing no new client-side validation gap beyond what the server already closes |
| T-quick-04 | Information Disclosure (stale session after erasure) | `DELETE /users/me/data` response handling | mitigate | Backend does not revoke tokens on erasure, so the client proactively calls best-effort `/auth/logout` (blacklists the refresh token) and unconditionally clears both `expo-secure-store` tokens client-side regardless of the logout call's outcome, minimizing the window where a stale access token could still authenticate against the now-anonymized account |

</threat_model>

<verification>
1. `cd mobile && npx tsc --noEmit` passes with no new type errors after both tasks.
2. Manual read-through: `profile-edit.tsx` sends only `firstName`/`lastName` to `PATCH /users/me` and uploads via `POST /users/me/avatar` with multipart field name `file`.
3. Manual read-through: `profile.tsx`'s `AvatarRing` renders a real image when `avatarUrl` is present and falls back to initials otherwise, on both the Profile tab and (via the new screen) Edit Profile.
4. Manual read-through: the Danger Zone delete-account flow calls `DELETE /users/me/data` first, then best-effort `POST /auth/logout`, then clears both SecureStore tokens unconditionally, then navigates to `/onboarding` — and a failed erase call does not clear tokens or navigate.
5. Manual read-through: the delete-account confirmation `Alert.alert` explicitly states irreversibility and data anonymization, and the button is visually separated from Sign Out.
</verification>

<success_criteria>
- A signed-in user can edit their first/last name and upload/change their avatar via a new `mobile/app/profile-edit.tsx` screen, reachable from the Profile tab.
- The real avatar photo displays (with initials fallback) on the Profile tab after upload.
- A signed-in user can permanently delete (anonymize) their account from a clearly separated, explicitly-confirmed Danger Zone action, with local session tokens cleared and navigation to onboarding afterward.
- No backend files are modified.
- `cd mobile && npx tsc --noEmit` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260727-bhw-add-mobile-profile-edit-screen-with-avat/260727-bhw-SUMMARY.md`
</output>
</content>
