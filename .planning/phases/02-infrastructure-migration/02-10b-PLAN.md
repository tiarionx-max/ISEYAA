---
phase: 02-infrastructure-migration
plan: "10b"
type: execute
wave: 3
depends_on: ["02-10"]
files_modified:
  - backend/apps/notifications-service/src/main.ts
  - backend/apps/notifications-service/src/app.module.ts
  - backend/apps/notifications-service/src/notifications-grpc.controller.ts
  - backend/apps/notifications-service/Dockerfile
  - backend/apps/notifications-service/railway.toml
  - backend/src/app.module.ts
  - .env.example
autonomous: true
requirements:
  - INFRA-07
  - INFRA-08

must_haves:
  truths:
    - "notifications-service runs as a standalone gRPC server on port 5008"
    - "API gateway ClientsModule registers NOTIFICATIONS_PACKAGE"
    - "All 153 existing tests still pass"
    - "All 8 microservices are defined and deployable — INFRA-07 complete"
  artifacts:
    - path: "backend/apps/notifications-service/src/notifications-grpc.controller.ts"
      provides: "gRPC server for NotificationsService (SendPush, RegisterToken)"
      contains: "GrpcMethod"
    - path: "backend/apps/notifications-service/Dockerfile"
      provides: "Standalone Docker image for notifications-service"
    - path: "backend/apps/notifications-service/railway.toml"
      provides: "Railway deployment config with watchPaths for notifications module"
  key_links:
    - from: "backend/src/app.module.ts (API gateway)"
      to: "all 8 microservices"
      via: "ClientsModule.register with 8 package registrations"
      pattern: "NOTIFICATIONS_PACKAGE"
---

<objective>
Extract notifications-service as the final standalone gRPC microservice. After this plan, all 8 services from INFRA-07 are decomposed and the entire microservices architecture is in place. API gateway ClientsModule holds all 8 registrations.

Purpose: Complete INFRA-07 by ensuring every service (auth, wallet, events, stays, marketplace, admin, ai, notifications) has a standalone gRPC deployment. This is the last service extraction before the Kafka event bus work in Plan 02-11.
Output: notifications-service gRPC app in backend/apps/; complete ClientsModule registration in API gateway with all 8 services.
</objective>

<execution_context>
@C:/Users/Admin/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Admin/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Projects/ISEYAA/.planning/PROJECT.md
@C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-RESEARCH.md
@C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-10-SUMMARY.md
</context>

<interfaces>
<!-- Port and package assignment -->

- notifications-service: port 5008, package: 'notifications', proto: packages/proto/notifications.proto

Railway internal URL:
- notifications-service.railway.internal:5008

gRPC methods (from Plan 07 proto definitions):
- NotificationsService: SendPush, RegisterToken
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create notifications-service gRPC app</name>
  <files>
    backend/apps/notifications-service/src/main.ts,
    backend/apps/notifications-service/src/app.module.ts,
    backend/apps/notifications-service/src/notifications-grpc.controller.ts,
    backend/apps/notifications-service/Dockerfile,
    backend/apps/notifications-service/railway.toml
  </files>
  <read_first>
    backend/apps/auth-service/src/main.ts,
    backend/apps/auth-service/src/auth-grpc.controller.ts,
    backend/src/modules/notifications/notifications.service.ts,
    packages/proto/notifications.proto
  </read_first>
  <action>
    Apply the exact same pattern as auth-service (Plan 08) to notifications-service.

    main.ts: NestFactory.createMicroservice with Transport.GRPC, package: 'notifications', port 5008, protoPath join(__dirname, '../../../../packages/proto/notifications.proto').

    app.module.ts: imports ConfigModule, PrismaModule, RedisModule, NotificationsModule. Controllers: [NotificationsGrpcController].

    notifications-grpc.controller.ts:
    - @GrpcMethod('NotificationsService', 'SendPush'): calls NotificationsService.sendNotification(userId, title, body). Returns SendPushResponse(success: bool).
    - @GrpcMethod('NotificationsService', 'RegisterToken'): calls NotificationsService.registerToken(userId, fcmToken). Returns RegisterTokenResponse(success: bool).

    Note: The Firebase legacy FCM API issue (CONCERNS.md) is known. The gRPC wrapper delegates to the existing implementation unchanged. The Firebase Admin SDK migration is a separate concern for Phase 6.

    Dockerfile: identical to auth-service Dockerfile; CMD starts notifications-service dist/main.js.

    railway.toml watchPaths: backend/apps/notifications-service/**, backend/src/modules/notifications/**, packages/proto/**.
  </action>
  <verify>
    <automated>test -f backend/apps/notifications-service/src/main.ts &amp;&amp; grep -c "5008" backend/apps/notifications-service/src/main.ts</automated>
    <automated>grep -c "GrpcMethod" backend/apps/notifications-service/src/notifications-grpc.controller.ts</automated>
    <automated>cd backend &amp;&amp; npm run test 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - notifications-service main.ts uses port 5008
    - notifications-grpc.controller.ts has 2 @GrpcMethod decorators (SendPush, RegisterToken)
    - backend/apps/notifications-service/Dockerfile exists
    - backend/apps/notifications-service/railway.toml exists with watchPaths
    - All 153 tests still pass
    - cd backend && npx tsc --noEmit exits 0
  </acceptance_criteria>
  <done>notifications-service gRPC app created; port 5008; all 8 microservice apps now exist in backend/apps/</done>
</task>

<task type="auto">
  <name>Task 2: Register NOTIFICATIONS_PACKAGE in API gateway — complete all 8 registrations</name>
  <files>
    backend/src/app.module.ts,
    .env.example
  </files>
  <read_first>
    backend/src/app.module.ts,
    .env.example
  </read_first>
  <action>
    FILE 1: backend/src/app.module.ts

    Read the current app.module.ts (which already has AUTH, WALLET, EVENTS, STAYS, MARKETPLACE, ADMIN, AI packages from Plans 08-10). Add the final ClientsModule registration:

      {
        name: 'NOTIFICATIONS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'notifications',
          protoPath: join(__dirname, '../../../packages/proto/notifications.proto'),
          url: process.env.NOTIFICATIONS_SERVICE_URL || 'notifications-service.railway.internal:5008',
        },
      },

    After this update, backend/src/app.module.ts has exactly 8 ClientsModule registrations total (AUTH through NOTIFICATIONS). This completes INFRA-08.

    FILE 2: .env.example

    Add if not already present:
      NOTIFICATIONS_SERVICE_URL=notifications-service.railway.internal:5008
  </action>
  <verify>
    <automated>grep -c "_PACKAGE" backend/src/app.module.ts</automated>
    <automated>ls backend/apps/ | wc -l</automated>
    <automated>cd backend &amp;&amp; npm run test 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - notifications-service registered; backend/src/app.module.ts has exactly 8 ClientsModule package registrations (AUTH, WALLET, EVENTS, STAYS, MARKETPLACE, ADMIN, AI, NOTIFICATIONS) — grep "_PACKAGE" shows 8 matches
    - backend/apps/ directory contains 8 service directories: auth-service, wallet-service, events-service, stays-service, marketplace-service, admin-service, ai-service, notifications-service
    - .env.example has NOTIFICATIONS_SERVICE_URL entry
    - All 153 tests still pass
    - cd backend && npx tsc --noEmit exits 0
  </acceptance_criteria>
  <done>All 8 microservices extracted as gRPC apps; API gateway wired with complete ClientsModule registration (8 packages); INFRA-07 and INFRA-08 complete</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API gateway → notifications-service | FCM server key in notifications-service context only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-39 | Information Disclosure | Firebase FCM server key in notifications-service | mitigate | Key stored in Infisical; never logged or returned in gRPC responses |
| T-02-46b | Denial of Service | FCM quota exhausted by unbounded notification calls | accept | FCM free quota (100k/day) is sufficient for MVP; add rate limiting on gRPC callers in Phase 6 |
</threat_model>

<verification>
After both tasks:

  cd backend && npm run test

Expected: 153+ tests passing.

Count all 8 services:

  ls backend/apps/ | sort

Expected: admin-service, ai-service, auth-service, events-service, marketplace-service, notifications-service, stays-service, wallet-service (8 directories)

Count ClientsModule packages:

  grep "_PACKAGE" backend/src/app.module.ts | wc -l

Expected: 8
</verification>

<success_criteria>
- All 8 microservices defined with gRPC servers in backend/apps/
- API gateway ClientsModule complete with all 8 package registrations
- INFRA-07: monolith decomposed into independent microservices each with own Dockerfile
- INFRA-08: all services communicate via gRPC; REST remains external API
- 153+ tests pass
</success_criteria>

<output>
After completion, create C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-10b-SUMMARY.md
</output>
