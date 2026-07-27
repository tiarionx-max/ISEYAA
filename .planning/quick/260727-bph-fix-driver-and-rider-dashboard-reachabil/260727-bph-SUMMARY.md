---
phase: quick
plan: 260727-bph
subsystem: mobile-onboarding
tags: [nestjs, prisma, expo-router, react-query, expo-location, react-native]

requires:
  - phase: quick-260727-6nh
    provides: existing transport module (Driver/Vehicle creation, go-online/go-offline, driver-dashboard.tsx, rider-dashboard.tsx) left unmodified and reused
provides:
  - "POST /users/me/become-driver backend endpoint (self-service DRIVER role grant, mirrors become-host)"
  - "mobile/app/driver-application.tsx — licence + vehicle onboarding form"
  - "Profile tab wired to real driver onboarding states + real online/offline toggle + driver-dashboard link"
  - "'My Rides' entry point into the previously-unreachable rider-dashboard.tsx"
affects: [mobile-profile, transport-onboarding]

tech-stack:
  added: []
  patterns:
    - "Self-service role-grant endpoints (become-host/become-guide/become-driver) stay role-only, with any real profile/capability gating enforced by the target feature module (Driver.status === 'APPROVED')"
    - "Mutually-exclusive onboarding-state rendering driven by (registeredRoles, GET .../me profile, profile.status) rather than a single boolean flag"

key-files:
  created:
    - mobile/app/driver-application.tsx
  modified:
    - backend/src/modules/users/users.service.ts
    - backend/src/modules/users/users.controller.ts
    - backend/src/modules/users/__tests__/users.service.spec.ts
    - mobile/app/(tabs)/profile.tsx
    - mobile/app/_layout.tsx

key-decisions:
  - "becomeDriver mirrors becomeHost exactly (no transaction, no profile-row creation) — Driver profile creation remains entirely in the existing, unmodified POST /transport/drivers flow"
  - "profile.tsx renders one of four mutually-exclusive driver states (not-a-driver CTA / complete-application CTA / pending-review card / real online toggle+dashboard link) instead of one boolean-gated card"
  - "Replaced local-only driverMode UI state with the live GET /transport/drivers/me response as the single source of truth for online/offline status"

patterns-established:
  - "Self-service role-grant + separately-gated capability (role grant is free; real capability requires admin-approved profile row) — same shape as become-host/become-guide"

requirements-completed: []

duration: 55min
completed: 2026-07-27
---

# Quick Task 260727-bph: Fix driver-onboarding and rider/driver-dashboard reachability

**Added a self-service `POST /users/me/become-driver` role-grant endpoint plus a new driver-application form, and rewired the Profile tab so both fully-built (but previously unreachable) `driver-dashboard.tsx` and `rider-dashboard.tsx` screens now have real navigation entry points and a real go-online/go-offline toggle.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-27T12:57:00Z
- **Completed:** 2026-07-27T13:52:19Z
- **Tasks:** 2 completed
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `POST /users/me/become-driver` grants the DRIVER role following the exact `becomeHost` shape, covered by 3 new unit tests (not-found, grants role, idempotent)
- New `mobile/app/driver-application.tsx` screen chains `POST /transport/drivers` → `POST /transport/drivers/:id/vehicles` with client-side validation and a pending-review success message
- `mobile/app/(tabs)/profile.tsx` now shows the correct one of four driver-related states based on live `registeredRoles` + `GET /transport/drivers/me` data, replacing a dead `role === 'ADMIN'` branch and a local-only, backend-disconnected toggle
- A new "My Rides" menu row makes the fully-built `rider-dashboard.tsx` reachable for the first time
- An approved driver now gets a real go-online/go-offline toggle (wired to `/transport/go-online` / `/transport/go-offline` with `expo-location` permission handling) plus a link into `driver-dashboard.tsx`, also reachable for the first time

## Task Commits

Each task was committed atomically:

1. **Task 1: Add POST /users/me/become-driver backend endpoint** - `197c770` (feat)
2. **Task 2: Build driver-application screen and wire Profile tab reachability** - `9c0fb53` (feat)

**Plan metadata:** committed separately by the orchestrator (docs commit not included in this worktree per execution constraints)

## Files Created/Modified
- `backend/src/modules/users/users.service.ts` - Added `becomeDriver(userId)` mirroring `becomeHost`'s exact structure (no transaction, no profile-row creation)
- `backend/src/modules/users/users.controller.ts` - Added `POST /users/me/become-driver` route under the existing controller-level `JwtAuthGuard`
- `backend/src/modules/users/__tests__/users.service.spec.ts` - Added `describe('becomeDriver', ...)` with not-found/grants-role/idempotent tests
- `mobile/app/driver-application.tsx` - New screen: licence number + expiry date picker, vehicle type Chip selector + make/model/year/plate/colour fields, chained submit mutation, validation, pending-review success alert
- `mobile/app/(tabs)/profile.tsx` - Removed dead `role === 'ADMIN'` branch; added `isDriver`/`driverProfile`/`driverApproved` derived state, `becomeDriverMutation`, `toggleOnlineMutation`; replaced the single driver-card conditional with four mutually-exclusive states; added "My Rides" menu row; rewired `DriverCardContent` to take a real `onToggle`/`toggling` prop pair instead of local `setDriverMode`
- `mobile/app/_layout.tsx` - Registered `driver-application` route (`title: 'Become a Driver', presentation: 'card'`)

## Decisions Made
- Followed the plan's verified-facts exactly: `becomeDriver` has no transaction and creates no profile row (unlike `becomeGuide`), since Driver profile creation is a separate, already-built flow (`POST /transport/drivers`)
- Used `getErrorMessage` (existing helper in `mobile/lib/api.ts`) for all new mutation error paths rather than re-deriving error messages inline, per the plan's explicit guidance and to avoid the known array-message native-crash bug
- `DriverCardContent`'s prop signature changed from `{ driverMode, setDriverMode }` to `{ driverMode, onToggle, toggling }` since the toggle now drives a real mutation (with a pending/loading state) instead of local boolean state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The worktree had no `node_modules` installed (fresh git worktree, dependencies not symlinked from the main checkout) — ran `npm install` at the workspace root (~5 min) and `npx prisma generate` in `backend/` before any verification command could run. Not a plan deviation — purely an environment setup step required to execute the plan's own verification commands.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `POST /users/me/become-driver`, the driver-application form, and both dashboards' reachability are complete and independently verified (backend unit tests + `tsc --noEmit` on both workspaces)
- No files under `backend/src/modules/transport/` were touched, per plan constraint
- Two other concurrent quick tasks (password-recovery, profile-edit) also touch `mobile/app/(tabs)/profile.tsx` and `mobile/app/_layout.tsx` this session — expected to be reconciled by the orchestrator at merge time, as noted in the plan's verified facts

## Self-Check: PASSED

- FOUND: backend/src/modules/users/users.service.ts (becomeDriver present)
- FOUND: backend/src/modules/users/users.controller.ts (become-driver route present)
- FOUND: backend/src/modules/users/__tests__/users.service.spec.ts (becomeDriver describe block present)
- FOUND: mobile/app/driver-application.tsx
- FOUND: mobile/app/(tabs)/profile.tsx (become-driver CTA, My Rides row present)
- FOUND: mobile/app/_layout.tsx (driver-application route registered)
- FOUND commit 197c770
- FOUND commit 9c0fb53

---
*Phase: quick*
*Completed: 2026-07-27*
