---
phase: 03-transport-module
plan: "03"
subsystem: transport
tags: [tdd, dto, validation, websocket, unit-tests, red-phase]
dependency_graph:
  requires: ["03-02"]
  provides: ["03-04", "03-05"]
  affects: ["backend/src/modules/transport/"]
tech_stack:
  added: []
  patterns:
    - class-validator decorators with @IsEnum(VehicleType) and @IsEnum(DriverStatus)
    - @Type(() => Number) coercion on all numeric DTO fields
    - @Min/@Max range guards on lat/lng coordinate fields
    - TDD RED phase — spec files import non-existent modules intentionally
key_files:
  created:
    - backend/src/modules/transport/dto/create-driver.dto.ts
    - backend/src/modules/transport/dto/create-vehicle.dto.ts
    - backend/src/modules/transport/dto/go-online.dto.ts
    - backend/src/modules/transport/dto/request-ride.dto.ts
    - backend/src/modules/transport/dto/complete-trip.dto.ts
    - backend/src/modules/transport/dto/approve-driver.dto.ts
    - backend/src/modules/transport/__tests__/transport.service.spec.ts
    - backend/src/modules/transport/__tests__/transport.gateway.spec.ts
  modified: []
decisions:
  - "Import VehicleType and DriverStatus directly from @prisma/client (verified available after Plan 02 prisma generate)"
  - "CompleteTripDto uses @IsString @IsOptional for imageUrl on CreateVehicleDto rather than @IsUrl to avoid strictness issues with placeholder CDN URLs"
  - "transport.service.spec.ts is 700 lines / 30 it() blocks to fully cover the lifecycle including arrivedAtPickup + startTrip transitions needed to make completeTrip's IN_PROGRESS guard reachable"
  - "creditWallet mock asserts 6th argument 'INTERNAL' per the gateway param plan established in PATTERNS.md"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-13"
  tasks_completed: 3
  files_created: 8
---

# Phase 03 Plan 03: Transport DTOs + RED Spec Files Summary

**One-liner:** Six class-validator DTOs for transport HTTP boundary + two failing TDD RED spec files covering all seven TRANSPORT requirements and the WebSocket gateway authentication flow.

---

## What Was Built

### Task 1: Six DTO Files

All six DTOs created with strict class-validator decorators and `@nestjs/swagger` annotations:

| File | Class | Key Fields |
|------|-------|-----------|
| `create-driver.dto.ts` | `CreateDriverDto` | `licenceNumber` (@IsString @IsNotEmpty), `licenceExpiry` (@IsDateString), `metadata?` |
| `create-vehicle.dto.ts` | `CreateVehicleDto` | `type` (@IsEnum(VehicleType)), `make/model/plateNumber/colour` (strings), `year` (@IsInt @Min(1980)), `imageUrl?` |
| `go-online.dto.ts` | `GoOnlineDto` | `lat` (@Min(-90) @Max(90) @Type), `lng` (@Min(-180) @Max(180) @Type) |
| `request-ride.dto.ts` | `RequestRideDto` | 4 coord fields with range guards, addresses optional, `vehicleType` (@IsEnum(VehicleType)) |
| `complete-trip.dto.ts` | `CompleteTripDto` | `driverRating?` (@IsInt @Min(1) @Max(5)), `cancelReason?` |
| `approve-driver.dto.ts` | `ApproveDriverDto` | `status` (@IsEnum(DriverStatus) — APPROVED|REJECTED|SUSPENDED), `notes?` |

TypeScript check: `npx tsc --noEmit -p backend/tsconfig.json` exits 0.

All enum types imported from `@prisma/client` (generated in Plan 02).

### Task 2: transport.service.spec.ts (RED)

**700 lines, 30 `it()` blocks** covering all seven TRANSPORT requirements:

| Requirement | it() Count | Test Cases |
|-------------|-----------|-----------|
| TRANSPORT-01 (driver/vehicle/KYC) | 8 | createDriver (×2), createVehicle (×3), approveDriver (×1), goOnline (×2) |
| TRANSPORT-01 cont. (goOffline) | 1 | goOffline redis.zrem + isOnline=false |
| TRANSPORT-02 (fare estimate) | 3 | return shape, PlatformConfig reads, Haversine ~10km check |
| TRANSPORT-03 (driver matching) | 4 | geosearch call, SEARCHING status, gateway notify, addTimeout |
| TRANSPORT-03/04 (acceptTrip) | 1 | MATCHED status, deleteTimeout, gateway emit |
| TRANSPORT-04 (lifecycle) | 6 | arrivedAtPickup (×3), startTrip (×3) |
| TRANSPORT-05 (surge pricing) | 3 | supply≥demand (1.0), no supply (2.0 cap), ratio>threshold (surge) |
| TRANSPORT-06 (wallet credit) | 2 | creditWallet(ISY-DRV-, fare×0.85, INTERNAL), BadRequestException |
| TRANSPORT-07 (earnings) | 2 | today aggregation, week aggregation with date filter |

**RED state confirmed:**
```
FAIL src/modules/transport/__tests__/transport.service.spec.ts
  ● Test suite failed to run
    Cannot find module '../transport.service' or its corresponding type declarations.
```

### Task 3: transport.gateway.spec.ts (RED)

**136 lines, 6 `it()` blocks** covering WebSocket gateway behavior:

| Test Case | Behavior |
|-----------|----------|
| handleConnection — missing token | calls client.disconnect() |
| handleConnection — invalid JWT | JwtService.verify throws → client.disconnect() |
| handleConnection — valid JWT | sets client.data.userId and client.data.role |
| handleJoinTrip | client.join('trip:{tripId}'), returns { joined: tripId } |
| handleDriverLocation | server.to('trip:{tripId}').emit('driver:location', { lat, lng }) |
| handleDisconnect | does not throw |

**RED state confirmed:**
```
FAIL src/modules/transport/__tests__/transport.gateway.spec.ts
  ● Test suite failed to run
    Cannot find module '../transport.gateway' or its corresponding type declarations.
```

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — no stubs introduced in this plan. DTOs are pure validation contracts; spec files are intentionally failing (RED state).

---

## Threat Flags

No new security-relevant surface introduced in this plan. Threat mitigations T-03-08 through T-03-10 and T-03-33 are now encoded in the DTO validators:

- T-03-08: `@Min(-90)/@Max(90)` and `@Min(-180)/@Max(180)` on all coordinate fields
- T-03-09: `ApproveDriverDto` limits status to APPROVED|REJECTED|SUSPENDED (not PENDING_REVIEW)
- T-03-10: `@IsEnum(VehicleType)` on both `CreateVehicleDto.type` and `RequestRideDto.vehicleType`
- T-03-33: `createVehicle` spec asserts ForbiddenException when driver.userId !== caller userId

---

## TDD Gate Compliance

- RED gate: `test(03-03)` commit `5978717` — spec files created that fail with "Cannot find module"
- GREEN gate: Plans 04 and 05 will create the implementation files and turn these specs green
- REFACTOR gate: Optional after GREEN

---

## What Plans 04 and 05 Will Do

- **Plan 04 (GREEN — service):** Create `transport.service.ts` implementing all methods tested in `transport.service.spec.ts`; running the spec suite must show all 30 tests passing
- **Plan 05 (GREEN — gateway + controller):** Create `transport.gateway.ts` and `transport.controller.ts`; running `transport.gateway.spec.ts` must show all 6 tests passing

---

## Self-Check

### Created files exist:
- [x] `backend/src/modules/transport/dto/create-driver.dto.ts` — FOUND
- [x] `backend/src/modules/transport/dto/create-vehicle.dto.ts` — FOUND
- [x] `backend/src/modules/transport/dto/go-online.dto.ts` — FOUND
- [x] `backend/src/modules/transport/dto/request-ride.dto.ts` — FOUND
- [x] `backend/src/modules/transport/dto/complete-trip.dto.ts` — FOUND
- [x] `backend/src/modules/transport/dto/approve-driver.dto.ts` — FOUND
- [x] `backend/src/modules/transport/__tests__/transport.service.spec.ts` — FOUND (700 lines, 30 it() blocks)
- [x] `backend/src/modules/transport/__tests__/transport.gateway.spec.ts` — FOUND (136 lines, 6 it() blocks)

### Commits exist:
- [x] `19da44a` — feat(03-03): transport DTOs
- [x] `5978717` — test(03-03): RED specs for TransportService + TransportGateway

### TypeScript check:
- [x] `npx tsc --noEmit -p backend/tsconfig.json` exits 0

### RED state verified:
- [x] `transport.service.spec.ts` fails with "Cannot find module '../transport.service'"
- [x] `transport.gateway.spec.ts` fails with "Cannot find module '../transport.gateway'"

## Self-Check: PASSED
