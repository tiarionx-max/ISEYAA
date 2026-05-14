---
plan: 02-09
phase: 02-infrastructure-migration
status: complete
wave: 3
requirements: [INFRA-07, INFRA-08]
completed: 2026-05-12
---

# Plan 02-09 — events-service gRPC Extraction Summary

## What Was Built

Extracted events-service as a standalone gRPC microservice on port 5003, following the strangler-fig pattern established in Plan 08. The gRPC controller delegates to Prisma directly for read operations and queries existing ticket state for reservation lookups.

## Key Changes

### backend/apps/events-service/src/main.ts (NEW)
- `NestFactory.createMicroservice` with `Transport.GRPC`, package: `events`, port 5003
- protoPath resolves to `packages/proto/events.proto`

### backend/apps/events-service/src/app.module.ts (NEW)
- Imports: ConfigModule, PrismaModule, RedisModule, EventsModule
- Controllers: [EventsGrpcController]

### backend/apps/events-service/src/events-grpc.controller.ts (NEW)
3 gRPC methods:
- `GetEvent` — queries event + ticketTypes, returns id/title/status/availableCapacity
- `CheckTicketAvailability` — checks remaining capacity on a ticket type
- `ReserveTicket` — finds pending ticket for user/ticketType, returns ticketId

### backend/apps/events-service/Dockerfile (NEW)
Identical pattern to auth-service Dockerfile; starts `events-service dist/main.js`

### backend/apps/events-service/railway.toml (NEW)
watchPaths: `backend/apps/events-service/**`, `backend/src/modules/events/**`, `packages/proto/**`

### backend/src/app.module.ts
EVENTS_PACKAGE ClientsModule registration on `events-service.railway.internal:5003` (already present from prior session work)

## Verification

| Check | Result |
|-------|--------|
| events-service port 5003 | ✅ |
| 3 @GrpcMethod decorators | ✅ |
| Dockerfile exists | ✅ |
| railway.toml with watchPaths | ✅ |
| EVENTS_PACKAGE in app.module.ts | ✅ |
| Test suite | ✅ 179 tests, 15 suites, 0 failures |
| TypeScript | ✅ |

## Self-Check: PASSED
