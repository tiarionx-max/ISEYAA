# Phase 3: Transport Module — Validation Plan

**Derived from:** `03-RESEARCH.md` § Validation Architecture
**Phase requirements:** TRANSPORT-01 .. TRANSPORT-08

---

## 1. Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Backend test config | `backend/jest.config.js` |
| Mobile test config | `mobile/jest.config.js` (jest-expo preset) |
| Quick run command | `npx jest --testPathPattern=transport --no-coverage` |
| Full backend suite | `npm run test --workspace=backend` |
| Full mobile suite | `npm run test --workspace=mobile` |
| Type-check (backend) | `npx tsc --noEmit -p backend/tsconfig.json` |
| Type-check (mobile) | `npx tsc --noEmit -p mobile/tsconfig.json` |

**Default invocation per phase:** `npm run test --workspace=backend && npx tsc --noEmit -p mobile/tsconfig.json`

---

## 2. Phase Requirements → Test Map

Every TRANSPORT-* requirement is exercised by at least one automated test, except TRANSPORT-08 (mobile UI surface) which is partially covered by type-check + grep gates and finally validated in Plan 08 (human checkpoint). The "File" column points to the spec or build artefact that owns the assertion.

| Req ID | Behavior | Test Type | File | Automated Command | Owning Plan |
|--------|----------|-----------|------|-------------------|-------------|
| TRANSPORT-01 | Driver profile create + status transitions (PENDING_REVIEW → APPROVED → SUSPENDED) | unit | `backend/src/modules/transport/__tests__/transport.service.spec.ts` (describe `createDriver`, `approveDriver`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-01 | Vehicle attachment — `createVehicle` links Vehicle row to owning Driver; rejects mismatched caller | unit | `backend/src/modules/transport/__tests__/transport.service.spec.ts` (describe `createVehicle`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-01 | POST `/transport/drivers/:id/vehicles` route exists with `@Roles(DRIVER)` | structural | `backend/src/modules/transport/transport.controller.ts` | `grep -c "drivers/:id/vehicles" backend/src/modules/transport/transport.controller.ts` returns ≥1 AND `npx tsc --noEmit -p backend/tsconfig.json` exits 0 | 03-05 |
| TRANSPORT-02 | Fare estimate formula `(baseFare + distanceKm × perKmFare) × surgeMultiplier`; rates from PlatformConfig | unit | `transport.service.spec.ts` (describe `getFareEstimate`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-02 | GET `/transport/fare-estimate` route exists; returns surge multiplier | structural | `backend/src/modules/transport/transport.controller.ts` | `npm run build --workspace=backend` exits 0; Swagger docs JSON contains `/transport/fare-estimate` | 03-05 |
| TRANSPORT-03 | Nearest driver matched via mocked `redis.geosearch`; 60s `SchedulerRegistry.addTimeout` registered | unit | `transport.service.spec.ts` (describe `requestRide`, `acceptTrip`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-04 | Gateway emits `driver:location` to `trip:{tripId}` room (not global broadcast) | unit | `backend/src/modules/transport/__tests__/transport.gateway.spec.ts` | `npx jest --testPathPattern=transport.gateway --no-coverage --workspace=backend` | 03-03 (RED) → 03-05 (GREEN) |
| TRANSPORT-04 | Trip lifecycle MATCHED → ARRIVED → IN_PROGRESS via `arrivedAtPickup`, `startTrip` | unit | `transport.service.spec.ts` (describe `arrivedAtPickup`, `startTrip`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-04 | PATCH `/transport/trips/:id/arrive` and `/start` routes exist with `@Roles(DRIVER)` | structural | `backend/src/modules/transport/transport.controller.ts` | `grep -c "trips/:id/arrive" …` ≥1 AND `grep -c "trips/:id/start" …` ≥1 | 03-05 |
| TRANSPORT-04 | Mobile driver tab calls PATCH `/arrive` and `/start` from D-3 | structural | `mobile/app/(tabs)/driver.tsx` | `grep -c "/arrive" mobile/app/(tabs)/driver.tsx` ≥1 AND `grep -c "/start" mobile/app/(tabs)/driver.tsx` ≥1 | 03-07 |
| TRANSPORT-05 | Surge multiplier = 2.0 when supply=0; = 1.0 when ratio ≤ threshold; capped at 2.0 | unit | `transport.service.spec.ts` (describe `getSurgeMultiplier`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-06 | `WalletService.creditWallet` called with 85% of fare on `completeTrip`; gateway='INTERNAL' | unit | `transport.service.spec.ts` (describe `completeTrip`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-06 | Platform fee read from PlatformConfig key `transport_platform_fee_pct`; no hardcoded 0.85/0.15 in production code | structural | `backend/src/modules/transport/transport.service.ts` | `grep -v '^[[:space:]]*//' backend/src/modules/transport/transport.service.ts | grep -c " 0.85 "` returns 0 AND `grep -c "transport_platform_fee_pct" …` ≥1 | 03-04 |
| TRANSPORT-06 | `completeTrip` IN_PROGRESS guard reachable end-to-end (full lifecycle path covered) | unit | `transport.service.spec.ts` (lifecycle integration `it()` chaining requestRide → accept → arrive → start → complete) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-07 | Earnings dashboard aggregates `Trip.driverEarnings` for `today` / `week`; returns totalEarnings, tripCount, acceptanceRate, avgRating | unit | `transport.service.spec.ts` (describe `getDriverEarnings`) | `npx jest --testPathPattern=transport.service --no-coverage --workspace=backend` | 03-03 (RED) → 03-04 (GREEN) |
| TRANSPORT-08 | Mobile Transport tab + Driver tab compile and render expected screens | type-check + structural | `mobile/app/(tabs)/transport.tsx`, `mobile/app/(tabs)/driver.tsx`, `mobile/app/(tabs)/_layout.tsx` | `npx tsc --noEmit -p mobile/tsconfig.json` exits 0; grep gates per Plan 06 + Plan 07 acceptance criteria | 03-06 + 03-07 |
| TRANSPORT-08 | End-to-end manual flow: rider requests ride, driver receives it, accepts, arrives, starts, completes; driver wallet credited | manual | Physical or simulator device | Plan 08 human checkpoint script in `03-08-PLAN.md` | 03-08 |

**Coverage check:** Every requirement ID (TRANSPORT-01 through TRANSPORT-08) appears at least once in the table above and has at least one automated assertion (TRANSPORT-08 also has the explicit manual checkpoint in Plan 08).

---

## 3. Sampling Continuity

Validation runs at three sampling rates that compose without gaps. Each task's `<verify>` block already invokes the appropriate command; this section is the contract that no commit, wave, or phase boundary is allowed to skip its assigned sample.

### 3.1 Per-task sample (RED/GREEN cycle)

| Trigger | Command | Required Exit |
|---------|---------|---------------|
| Task in `type: tdd` plan, RED step | `npx jest --testPathPattern=transport --no-coverage --workspace=backend` | non-zero with "Cannot find module" (intentional RED) |
| Task in `type: tdd` plan, GREEN step | `npx jest --testPathPattern=transport --no-coverage --workspace=backend` | 0 |
| Task touching DTOs only | `npx tsc --noEmit -p backend/tsconfig.json` | 0 |
| Task touching mobile UI | `npx tsc --noEmit -p mobile/tsconfig.json` | 0 |

### 3.2 Per-wave sample (merge gate)

After every wave completes, before merging the worktree(s) into the integration branch:

```bash
# Backend gate
npx tsc --noEmit -p backend/tsconfig.json
npm run test --workspace=backend
npm run build --workspace=backend

# Mobile gate (waves 6 + 7 only)
npx tsc --noEmit -p mobile/tsconfig.json
```

All four commands must exit 0. Any failure blocks the wave merge — fix in the failing plan's worktree, not the integration branch.

### 3.3 Phase gate (before `/gsd-verify-work`)

```bash
npm run test --workspace=backend
npx tsc --noEmit -p backend/tsconfig.json
npx tsc --noEmit -p mobile/tsconfig.json
npm run build --workspace=backend
curl -s http://localhost:3001/api/docs-json | grep -c '"/transport/'
# Must return ≥ 8 (the 8+ /transport/* routes registered in Plan 05)
```

Plus Plan 08 human-verification checkpoint signed off.

### 3.4 Sampling continuity assertion

The sampling rates above form a strict superset chain:

```
per-task tests  ⊆  per-wave tests  ⊆  phase-gate tests
```

In other words: every assertion exercised by a per-task sample is re-exercised at the wave boundary, and every assertion at the wave boundary is re-exercised at the phase gate. There is no command in the per-task sample that is NOT in the per-wave sample. There is no command in the per-wave sample that is NOT in the phase gate sample. This guarantees a regression introduced by Plan N cannot slip through to Plan N+1's wave gate.

---

## 4. Wave 0 Pre-conditions (must exist before any TRANSPORT-* test can run)

These items are scaffolded by Plan 03 (RED tests + DTOs) and Plan 04 (service stub). They are listed here so a reviewer can confirm the harness is in place before grading downstream plans.

- [ ] `backend/src/modules/transport/__tests__/transport.service.spec.ts` exists
- [ ] `backend/src/modules/transport/__tests__/transport.gateway.spec.ts` exists
- [ ] Mocks for `RedisService` geo methods (`geosearch`, `geoadd`, `zrem`)
- [ ] Mock for `WalletService.creditWallet`
- [ ] Mock for `SchedulerRegistry`
- [ ] Mock for `prisma.vehicle.{ create, findFirst }` (TRANSPORT-01 vehicle attachment)
- [ ] Backend deps installed: `npm install @nestjs/websockets @nestjs/platform-socket.io socket.io --workspace=backend` (Plan 01)
- [ ] Mobile deps installed: `npx expo install react-native-maps expo-location socket.io-client` in mobile workspace (Plan 06)

---

## 5. Validation Failure Modes

The most likely places this validation plan can fail to catch a real defect, and how each is hardened:

| Failure Mode | Hardening |
|--------------|-----------|
| Spec uses mocks that drift from real Prisma schema | Plans 03/04 reference Plan 02 schema directly; CI runs `npm run test --workspace=backend` after every wave |
| `completeTrip` IN_PROGRESS guard never exercised by any test | Explicit lifecycle integration test added in Plan 03 (`requestRide → accept → arrive → start → complete`) |
| Hardcoded platform fee literal slips into service | Grep gate in Plan 04 acceptance criteria: `grep -v '^[[:space:]]*//' transport.service.ts | grep -c " 0.85 "` returns 0 |
| WebSocket gateway broadcasts globally instead of room-scoped | Grep gate in Plan 05 acceptance: `grep -v '^//' transport.gateway.ts | grep -c "this.server.emit("` returns 0 |
| Mobile UI calls a route that doesn't exist on the backend | Per-wave gate runs `npm run build --workspace=backend` AND `npx tsc --noEmit -p mobile/tsconfig.json` after both Plan 05 and Plan 07 land |
| Vehicle attachment route guarded by wrong role | Plan 05 acceptance asserts `@Roles(UserRole.DRIVER)` count ≥ 8 (covers all DRIVER-scoped routes including `/drivers/:id/vehicles`) |
