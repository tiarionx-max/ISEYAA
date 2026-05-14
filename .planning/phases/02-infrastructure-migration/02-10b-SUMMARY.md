---
plan: 02-10b
phase: 02-infrastructure-migration
status: complete
wave: 3
requirements: [INFRA-07, INFRA-08]
completed: 2026-05-12
---

# Plan 02-10b — notifications-service gRPC Extraction Summary

## What Was Built

Extracted notifications-service as the final (8th) standalone gRPC microservice on port 5008. All 8 services from INFRA-07 are now decomposed. The API gateway ClientsModule holds all 8 package registrations. The Firebase FCM legacy API issue (CONCERNS.md) is intentionally left for Phase 6 — gRPC controller delegates to existing NotificationsService unchanged.

## Key Changes

### backend/apps/notifications-service/ (NEW)
- `main.ts`: Transport.GRPC, package `notifications`, port 5008
- `app.module.ts`: ConfigModule, PrismaModule, RedisModule, NotificationsModule
- `notifications-grpc.controller.ts`: 2 gRPC methods:
  - `SendPush` — delegates to `notificationsService.sendPush(userId, title, body)`
  - `RegisterToken` — delegates to `notificationsService.registerToken(userId, fcmToken)`
- `Dockerfile` + `railway.toml` (watchPaths for notifications module)

### backend/src/app.module.ts
NOTIFICATIONS_PACKAGE registration completing all 8 ClientsModule entries (already present)

## Verification

| Check | Result |
|-------|--------|
| notifications-service port 5008 | ✅ |
| 2 @GrpcMethod decorators (SendPush, RegisterToken) | ✅ |
| All 8 services in backend/apps/ | ✅ |
| All 8 _PACKAGE entries in app.module.ts ClientsModule | ✅ |
| INFRA-07 + INFRA-08 complete | ✅ |
| Test suite | ✅ 179 tests, 0 failures |

## Self-Check: PASSED
