---
phase: 03-transport-module
plan: "01"
subsystem: backend-infrastructure
tags: [websockets, prisma, redis, wallet, auth, transport]
dependency_graph:
  requires: []
  provides:
    - "@nestjs/websockets@11.1.19 installed in backend"
    - "Driver, Vehicle, Trip, TripEvent Prisma models"
    - "VehicleType, DriverStatus, TripStatus enums"
    - "RedisService.geoadd / geosearch / zrem public methods"
    - "WalletService.creditWallet optional gateway parameter"
    - "AuthModule exports JwtModule (pre-existing, confirmed)"
  affects:
    - backend/prisma/schema.prisma
    - backend/src/redis/redis.service.ts
    - backend/src/modules/wallet/wallet.service.ts
tech_stack:
  added:
    - "@nestjs/websockets@11.1.19"
    - "@nestjs/platform-socket.io@11.1.19"
    - "socket.io@4.8.3"
  patterns:
    - "ioredis geo command wrappers (GEOADD/GEOSEARCH/ZREM)"
    - "optional discriminated-union parameter for wallet gateway override"
key_files:
  created: []
  modified:
    - backend/package.json
    - package-lock.json
    - backend/prisma/schema.prisma
    - backend/src/redis/redis.service.ts
    - backend/src/modules/wallet/wallet.service.ts
    - backend/src/modules/wallet/__tests__/wallet.service.spec.ts
decisions:
  - "Pinned WebSocket packages to 11.1.19 (not 10.3.7) to match @nestjs/microservices@11.1.19 already in project — adding a third major-version variant would increase complexity"
  - "geosearch uses no WITHDIST flag to return flat string[] (avoids [string, string][] parsing per Pitfall 2 in RESEARCH.md)"
  - "creditWallet gateway override added as discriminated-union parameter (not new method) per RESEARCH.md Open Question #2 and CLAUDE.md anti-pattern guidance"
  - "AuthModule already exported JwtModule (exports: [AuthService, JwtModule]) — no change required"
  - "No prisma migrate/push performed — that is owned by plan 02-02 [BLOCKING] task"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-13"
  tasks_completed: 3
  files_modified: 6
---

# Phase 3 Plan 01: Transport Primitives (Dependencies, Schema, Redis Geo, Wallet Gateway) Summary

**One-liner:** WebSocket packages installed at 11.1.19, 4 Prisma transport models + 3 enums added, Redis geo wrappers and wallet gateway override implemented for ride-hailing foundation.

## What Was Built

This plan establishes the foundational primitives required by every other Phase 3 plan:

1. **WebSocket dependencies installed** — `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` added to backend workspace
2. **Prisma schema extended** — 4 new models (`Driver`, `Vehicle`, `Trip`, `TripEvent`) + 3 new enums (`VehicleType`, `DriverStatus`, `TripStatus`) + 2 back-relations on `User`
3. **RedisService geo wrappers** — `geoadd`, `geosearch` (FROMLONLAT BYRADIUS, no WITHDIST), `zrem` public methods
4. **WalletService.creditWallet gateway override** — optional `gateway` parameter (`'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL'`) defaulting to `'PAYSTACK'` for backward compatibility
5. **AuthModule JwtModule export confirmed** — already exports `JwtModule`; TransportGateway can inject `JwtService` by importing `AuthModule`

## Task Results

| Task | Name | Commit | Result |
|------|------|--------|--------|
| 1 | Install WebSocket dependencies | 6fa3e88 | Done — 3 packages in backend/package.json |
| 2 | Extend Prisma schema | b60a4e8 | Done — 4 models + 3 enums + 2 User back-relations; prisma validate passes |
| 3 RED | Add failing gateway-override tests | a8f32f4 | Done — 1 test confirmed failing before implementation |
| 3 GREEN | Implement geo wrappers + creditWallet gateway + confirm AuthModule export | 615f5ae | Done — all 16 wallet tests pass, tsc clean |

## Installed Package Versions

| Package | Version Installed | Reason |
|---------|------------------|--------|
| @nestjs/websockets | ^11.1.19 | Matches @nestjs/microservices@11.1.19 already in project |
| @nestjs/platform-socket.io | ^11.1.19 | socket.io adapter matching same major |
| socket.io | ^4.8.3 | Peer dependency of platform-socket.io; React Native client compatible |

**Pinning rationale:** The plan initially specified 10.3.7 to match `@nestjs/common@10.3.x`. However, `@nestjs/microservices@11.1.19` was already installed in the project, creating a pre-existing mixed-major-version situation. Installing 10.3.7 would add a third major-version cluster; installing 11.1.19 keeps WebSocket packages grouped with microservices at the 11.x major. TypeScript compilation (`npx tsc --noEmit`) passes cleanly with the 11.x packages.

## Schema Additions

### New Enums

```
VehicleType:   BIKE, TRICYCLE, CAR, MINIBUS
DriverStatus:  PENDING_REVIEW, APPROVED, SUSPENDED, REJECTED
TripStatus:    SEARCHING, MATCHED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED, EXPIRED
```

### New Models

| Model | Key Fields | Table |
|-------|-----------|-------|
| Driver | userId (unique FK), licenceNumber, licenceExpiry, status (DriverStatus), isOnline, avgRating, acceptanceRate | drivers |
| Vehicle | driverId (FK), type (VehicleType), plateNumber (unique), make, model, year, colour | vehicles |
| Trip | riderId (FK, RiderTrips relation), driverId? (FK, DriverTrips relation), vehicleType, pickupLat/Lng, dropoffLat/Lng, fare (Decimal), surgeMultiplier, status (TripStatus) | trips |
| TripEvent | tripId (FK), event (String), metadata (Json?) | trip_events |

### User Model Additions

```prisma
driverProfile  Driver?
riderTrips     Trip[]   @relation("RiderTrips")
```

### No DB Push Performed

`prisma migrate dev` and `prisma db push` were **not run**. The plan explicitly defers database migration to plan 02-02 which owns the `[BLOCKING]` push task.

## WalletService.creditWallet New Signature

```typescript
// Before (hardcoded gateway):
async creditWallet(walletId: string, amount: number, reference: string, description: string, module = 'wallet')
// gateway: 'PAYSTACK' hardcoded in transaction.create

// After (optional gateway override):
async creditWallet(walletId: string, amount: number, reference: string, description: string, module = 'wallet', gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL' = 'PAYSTACK')
// gateway parameter used in transaction.create — backward compatible, all existing callers unaffected
```

**Transport usage (future):** `creditWallet(driverWalletId, earnings, ref, 'Trip earnings', 'transport', 'INTERNAL')`

## RedisService Geo Methods

```typescript
async geoadd(key: string, lng: number, lat: number, member: string): Promise<void>
async geosearch(key: string, lng: number, lat: number, radiusKm: number): Promise<string[]>
async zrem(key: string, member: string): Promise<void>
```

`geosearch` uses `FROMLONLAT ... BYRADIUS ... ASC COUNT 999` without `WITHDIST` to return a flat `string[]` (avoids `[string, string][]` parsing issue from Pitfall 2 in RESEARCH.md).

## AuthModule JwtModule Export

`auth.module.ts` already had `exports: [AuthService, JwtModule]` — no change required. This means any module importing `AuthModule` can inject `JwtService`, which is required by `TransportGateway` for WebSocket JWT verification.

## Verification Results

| Check | Result |
|-------|--------|
| `prisma validate` | PASS — schema valid |
| `jest wallet.service` | PASS — 16 tests (14 existing + 2 new gateway-override tests) |
| `tsc --noEmit` | PASS — no TypeScript errors |
| `npm ls @nestjs/websockets` | Installed at 11.1.19 |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one intentional adjustment:

**[Adjustment - Version Pinning] WebSocket packages at 11.x not 10.3.x**
- **Found during:** Task 1
- **Issue:** Installing `@nestjs/websockets@10.3.7` conflicted with pre-existing `@nestjs/microservices@11.1.19` (which requires `@nestjs/common@^11.0.0`). npm ERESOLVE error without `--legacy-peer-deps`.
- **Fix:** Installed 11.1.19 instead, matching the microservices major version already in the project. TypeScript compiles cleanly.
- **Files modified:** backend/package.json, package-lock.json
- **Commit:** 6fa3e88
- **Documented:** Per plan instruction: "Document this choice in SUMMARY"

### TDD Gate Compliance

- RED commit: a8f32f4 (`test(03-01): add failing tests for creditWallet gateway override`)
- GREEN commit: 615f5ae (`feat(03-01): add geo wrappers to RedisService + gateway override to creditWallet`)
- 1 test confirmed failing before implementation; 16 tests passing after implementation

## Known Stubs

None — all three implementation changes are complete with no placeholder values.

## Threat Flags

No new security surface introduced beyond what the plan's threat model covers. The `gateway` parameter is typed as a discriminated union (`'PAYSTACK' | 'FLUTTERWAVE' | 'INTERNAL'`) enforcing T-03-01 at compile time. The method is only callable within the NestJS process (not exposed via REST).

## Self-Check: PASSED

Files created/modified:

| File | Status |
|------|--------|
| backend/package.json | FOUND |
| package-lock.json | FOUND |
| backend/prisma/schema.prisma | FOUND |
| backend/src/redis/redis.service.ts | FOUND |
| backend/src/modules/wallet/wallet.service.ts | FOUND |
| backend/src/modules/wallet/__tests__/wallet.service.spec.ts | FOUND |
| .planning/phases/03-transport-module/03-01-SUMMARY.md | FOUND |

Commits:

| Hash | Message |
|------|---------|
| 6fa3e88 | feat(03-01): install WebSocket dependencies for transport module |
| b60a4e8 | feat(03-01): extend Prisma schema with Driver, Vehicle, Trip, TripEvent models |
| a8f32f4 | test(03-01): add failing tests for creditWallet gateway override (RED) |
| 615f5ae | feat(03-01): add geo wrappers to RedisService + gateway override to creditWallet (GREEN) |
