---
phase: 02-infrastructure-migration
plan: "09b"
type: execute
wave: 3
depends_on: ["02-09"]
files_modified:
  - backend/apps/stays-service/src/main.ts
  - backend/apps/stays-service/src/app.module.ts
  - backend/apps/stays-service/src/stays-grpc.controller.ts
  - backend/apps/stays-service/Dockerfile
  - backend/apps/stays-service/railway.toml
  - backend/apps/marketplace-service/src/main.ts
  - backend/apps/marketplace-service/src/app.module.ts
  - backend/apps/marketplace-service/src/marketplace-grpc.controller.ts
  - backend/apps/marketplace-service/Dockerfile
  - backend/apps/marketplace-service/railway.toml
  - backend/src/app.module.ts
  - .env.example
autonomous: true
requirements:
  - INFRA-07
  - INFRA-08

must_haves:
  truths:
    - "stays-service runs as a standalone gRPC server on port 5004"
    - "marketplace-service runs as a standalone gRPC server on port 5005"
    - "API gateway ClientsModule registers STAYS_PACKAGE and MARKETPLACE_PACKAGE"
    - "All 153 existing tests still pass after creating these new service apps"
  artifacts:
    - path: "backend/apps/stays-service/src/stays-grpc.controller.ts"
      provides: "gRPC server for StaysService (GetProperty, CheckAvailability, CreateBooking)"
      contains: "GrpcMethod"
    - path: "backend/apps/marketplace-service/src/marketplace-grpc.controller.ts"
      provides: "gRPC server for MarketplaceService (GetProduct, ReserveStock, ConfirmOrder)"
      contains: "GrpcMethod"
  key_links:
    - from: "backend/src/app.module.ts (API gateway)"
      to: "backend/apps/stays-service"
      via: "ClientsModule STAYS_PACKAGE on railway.internal:5004"
      pattern: "STAYS_PACKAGE"
    - from: "backend/apps/stays-service"
      to: "backend/src/modules/stays/stays.service.ts"
      via: "strangler-fig: StaysService injected into StaysGrpcController"
      pattern: "GrpcMethod.*StaysService"
---

<objective>
Extract stays-service and marketplace-service as standalone gRPC microservices, following the exact same pattern established in Plans 08 and 09. Register STAYS_PACKAGE and MARKETPLACE_PACKAGE in the API gateway.

Purpose: Complete the commerce module service decomposition. Both services reuse existing business logic via strangler-fig — only the transport layer is new. events-service was extracted in Plan 02-09.
Output: Two new gRPC service apps in backend/apps/; API gateway updated with STAYS_PACKAGE and MARKETPLACE_PACKAGE ClientsModule registrations.
</objective>

<execution_context>
@C:/Users/Admin/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Admin/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/Projects/ISEYAA/.planning/PROJECT.md
@C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-RESEARCH.md
@C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-PATTERNS.md
@C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-09-SUMMARY.md
</context>

<interfaces>
<!-- Apply the same pattern established in Plans 08-09 for stays-service and marketplace-service -->

Port assignments:
- stays-service: 5004
- marketplace-service: 5005

Package names for ClientsModule:
- STAYS_PACKAGE (package: 'stays')
- MARKETPLACE_PACKAGE (package: 'marketplace')

Railway internal URLs:
- stays-service.railway.internal:5004
- marketplace-service.railway.internal:5005

Required gRPC methods per proto (from packages/proto/*.proto created in Plan 07):
- StaysService: GetProperty, CheckAvailability, CreateBooking
- MarketplaceService: GetProduct, ReserveStock, ConfirmOrder
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Create stays-service gRPC app</name>
  <files>
    backend/apps/stays-service/src/main.ts,
    backend/apps/stays-service/src/app.module.ts,
    backend/apps/stays-service/src/stays-grpc.controller.ts,
    backend/apps/stays-service/Dockerfile,
    backend/apps/stays-service/railway.toml
  </files>
  <read_first>
    backend/apps/auth-service/src/main.ts,
    backend/apps/auth-service/src/auth-grpc.controller.ts,
    backend/src/modules/stays/stays.service.ts,
    packages/proto/stays.proto
  </read_first>
  <action>
    Apply the exact same pattern as auth-service (Plan 08 Task 1) to stays-service.

    main.ts: NestFactory.createMicroservice with Transport.GRPC, package: 'stays', port 5004, protoPath join(__dirname, '../../../../packages/proto/stays.proto').

    app.module.ts: imports ConfigModule, PrismaModule, RedisModule, StaysModule (from monolith). Controllers: [StaysGrpcController].

    stays-grpc.controller.ts implements:
    - @GrpcMethod('StaysService', 'GetProperty'): find property by ID
    - @GrpcMethod('StaysService', 'CheckAvailability'): checks booking availability for date range
    - @GrpcMethod('StaysService', 'CreateBooking'): calls StaysService.createBooking(), returns booking ID

    The stays-service gRPC controller delegates to StaysService which already has the SELECT FOR UPDATE booking logic — do not re-implement it.

    Dockerfile: identical to auth-service Dockerfile; CMD starts stays-service dist/main.js.

    railway.toml watchPaths: backend/apps/stays-service/**, backend/src/modules/stays/**, packages/proto/**.
  </action>
  <verify>
    <automated>test -f backend/apps/stays-service/src/main.ts &amp;&amp; grep -c "5004" backend/apps/stays-service/src/main.ts</automated>
    <automated>grep -c "GrpcMethod" backend/apps/stays-service/src/stays-grpc.controller.ts</automated>
    <automated>cd backend &amp;&amp; npm run test 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - stays-service main.ts uses port 5004
    - stays-grpc.controller.ts has 3 @GrpcMethod decorators (GetProperty, CheckAvailability, CreateBooking)
    - backend/apps/stays-service/Dockerfile exists
    - backend/apps/stays-service/railway.toml exists with watchPaths
    - All 153 existing tests still pass
    - cd backend && npx tsc --noEmit exits 0
  </acceptance_criteria>
  <done>stays-service gRPC app created following Plan 08 strangler-fig pattern; port 5004</done>
</task>

<task type="auto">
  <name>Task 2: Create marketplace-service + register STAYS_PACKAGE + MARKETPLACE_PACKAGE in API gateway</name>
  <files>
    backend/apps/marketplace-service/src/main.ts,
    backend/apps/marketplace-service/src/app.module.ts,
    backend/apps/marketplace-service/src/marketplace-grpc.controller.ts,
    backend/apps/marketplace-service/Dockerfile,
    backend/apps/marketplace-service/railway.toml,
    backend/src/app.module.ts,
    .env.example
  </files>
  <read_first>
    backend/apps/auth-service/src/app.module.ts,
    backend/src/modules/marketplace/marketplace.service.ts,
    packages/proto/marketplace.proto,
    backend/src/app.module.ts
  </read_first>
  <action>
    FILE GROUP 1: backend/apps/marketplace-service/ — same pattern as events-service and stays-service.

    main.ts: port 5005, package: 'marketplace', protoPath to marketplace.proto.

    app.module.ts: imports ConfigModule, PrismaModule, RedisModule, MarketplaceModule.

    marketplace-grpc.controller.ts:
    - @GrpcMethod('MarketplaceService', 'GetProduct'): find product by ID
    - @GrpcMethod('MarketplaceService', 'ReserveStock'): decrease stock with SELECT FOR UPDATE (delegate to MarketplaceService which already implements stock check)
    - @GrpcMethod('MarketplaceService', 'ConfirmOrder'): triggers order confirmation flow

    Dockerfile: identical to auth-service Dockerfile; CMD starts marketplace-service dist/main.js.

    railway.toml watchPaths: backend/apps/marketplace-service/**, backend/src/modules/marketplace/**, packages/proto/**.

    FILE GROUP 2: Update backend/src/app.module.ts

    Read the current app.module.ts (which already has AUTH_PACKAGE, WALLET_PACKAGE, and EVENTS_PACKAGE from Plans 08-09). Add 2 more ClientsModule registrations to the same ClientsModule.register([...]) array:

      {
        name: 'STAYS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'stays',
          protoPath: join(__dirname, '../../../packages/proto/stays.proto'),
          url: process.env.STAYS_SERVICE_URL || 'stays-service.railway.internal:5004',
        },
      },
      {
        name: 'MARKETPLACE_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'marketplace',
          protoPath: join(__dirname, '../../../packages/proto/marketplace.proto'),
          url: process.env.MARKETPLACE_SERVICE_URL || 'marketplace-service.railway.internal:5005',
        },
      },

    FILE GROUP 3: .env.example

    Add if not already present:
      STAYS_SERVICE_URL=stays-service.railway.internal:5004
      MARKETPLACE_SERVICE_URL=marketplace-service.railway.internal:5005
  </action>
  <verify>
    <automated>test -f backend/apps/marketplace-service/src/main.ts &amp;&amp; grep -c "5005" backend/apps/marketplace-service/src/main.ts</automated>
    <automated>grep -c "STAYS_PACKAGE\|MARKETPLACE_PACKAGE" backend/src/app.module.ts</automated>
    <automated>cd backend &amp;&amp; npm run test 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - marketplace-service main.ts uses port 5005
    - marketplace-grpc.controller.ts has 3 @GrpcMethod decorators (GetProduct, ReserveStock, ConfirmOrder)
    - backend/src/app.module.ts has STAYS_PACKAGE and MARKETPLACE_PACKAGE registered (grep shows 2+ matches)
    - .env.example has STAYS_SERVICE_URL and MARKETPLACE_SERVICE_URL
    - All 153 existing tests still pass
    - Total ClientsModule registrations in app.module.ts: 5 (AUTH, WALLET, EVENTS, STAYS, MARKETPLACE)
    - cd backend && npx tsc --noEmit exits 0
  </acceptance_criteria>
  <done>marketplace-service created; stays-service and marketplace-service registered in API gateway; 5 commerce domain services now in ClientsModule</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API gateway → domain services | gRPC calls on Railway private network for business operations |
| stays-service CreateBooking | Money flow: booking creation triggers escrow; SELECT FOR UPDATE must be preserved |
| marketplace-service ReserveStock | Concurrent stock decrement must use atomic update |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-34b | Tampering | stays-service CreateBooking race condition | mitigate | StaysService.createBooking() already uses prisma.$transaction + SELECT FOR UPDATE; gRPC controller delegates to the same method |
| T-02-35 | Tampering | marketplace-service ReserveStock oversell | mitigate | MarketplaceService handles stock check; gRPC controller delegates entirely to existing service (no new stock logic) |
| T-02-36b | Information Disclosure | Stay/product details exposed via gRPC without auth check | mitigate | GetProperty and GetProduct are read-only and return only public fields; gRPC metadata carries userId for methods that mutate state |
</threat_model>

<verification>
After both tasks:

  cd backend && npm run test

Expected: 153+ tests passing, 0 failures.

Verify new service apps:

  ls backend/apps/

Expected: auth-service, wallet-service, events-service, stays-service, marketplace-service (5 services after this plan)

Verify gateway registrations:

  grep "_PACKAGE" backend/src/app.module.ts | wc -l

Expected: 5 (AUTH, WALLET, EVENTS, STAYS, MARKETPLACE)
</verification>

<success_criteria>
- stays-service gRPC microservice app created on port 5004
- marketplace-service gRPC microservice app created on port 5005
- API gateway registers STAYS_PACKAGE and MARKETPLACE_PACKAGE in ClientsModule
- Strangler-fig: all gRPC controllers delegate to existing service business logic
- 153+ tests pass
</success_criteria>

<output>
After completion, create C:/Projects/ISEYAA/.planning/phases/02-infrastructure-migration/02-09b-SUMMARY.md
</output>
