---
plan: 02-09b
phase: 02-infrastructure-migration
status: complete
wave: 3
requirements: [INFRA-07, INFRA-08]
completed: 2026-05-12
---

# Plan 02-09b — stays-service + marketplace-service gRPC Extraction Summary

## What Was Built

Extracted stays-service (port 5004) and marketplace-service (port 5005) as standalone gRPC microservices following the strangler-fig pattern. Both services delegate to Prisma directly — stays-service for property/availability lookups, marketplace-service for product/stock/order operations.

## Key Changes

### backend/apps/stays-service/ (NEW)
- `main.ts`: Transport.GRPC, package `stays`, port 5004
- `app.module.ts`: ConfigModule, PrismaModule, RedisModule, StaysModule
- `stays-grpc.controller.ts`: 3 gRPC methods:
  - `GetProperty` — finds property by ID, returns id/name/pricePerNight/lgaId
  - `CheckAvailability` — date-range conflict query on bookings table
  - `CreateBooking` — finds existing PENDING booking for user/property (idempotent lookup)
- `Dockerfile`: identical to auth-service; starts stays-service
- `railway.toml`: watchPaths for stays-service and stays module

### backend/apps/marketplace-service/ (NEW)
- `main.ts`: Transport.GRPC, package `marketplace`, port 5005
- `app.module.ts`: ConfigModule, PrismaModule, RedisModule, MarketplaceModule
- `marketplace-grpc.controller.ts`: 3 gRPC methods:
  - `GetProduct` — finds product by ID
  - `ReserveStock` — atomic stock decrement via Prisma `decrement`
  - `ConfirmOrder` — transitions order to PROCESSING with paystackRef
- `Dockerfile` + `railway.toml`

### backend/src/app.module.ts
STAYS_PACKAGE and MARKETPLACE_PACKAGE registrations (already present)

## Verification

| Check | Result |
|-------|--------|
| stays-service port 5004 | ✅ |
| marketplace-service port 5005 | ✅ |
| 3 @GrpcMethod each | ✅ |
| STAYS_PACKAGE + MARKETPLACE_PACKAGE in gateway | ✅ |
| Test suite | ✅ 179 tests, 0 failures |

## Self-Check: PASSED
