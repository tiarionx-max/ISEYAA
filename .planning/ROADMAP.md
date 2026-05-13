# ISEYAA Roadmap

## Overview

Sprint 1 is shipped. This roadmap covers the six remaining sprints: infrastructure migration to a free-first cloud stack, two new commercial modules (Transport and Delivery), a full AI concierge with real KYC integrations, a hardening sprint, and production launch. Every phase delivers a coherent, independently verifiable capability.

## Milestones

- [x] **Sprint 1 (Phase 1)** — Auth, Users, LGAs, Tourism, Events, Stays, Marketplace, Wallet, Admin, Webhooks, AI (basic), Web, Mobile — SHIPPED 2026-05-11
- [ ] **Sprint 2–7 (Phases 2–7)** — Infrastructure → Transport → Delivery → AI/KYC → QA → Launch

## Phases

- [x] **Phase 1: Sprint 1 Foundation** - All core commercial modules shipped and tested (153 tests passing)
- [ ] **Phase 2: Infrastructure Migration** - Free-first cloud stack, microservices, search, and event bus
- [ ] **Phase 3: Transport Module** - Ride-hailing with real-time GPS, fare engine, and driver earnings
- [ ] **Phase 4: Delivery Module** - Parcel delivery with OTP proof-of-delivery and live tracking
- [ ] **Phase 5: AI Concierge + KYC** - GPT-4o concierge with tool calls, vector recommendations, and real identity verification
- [ ] **Phase 6: QA, Security & Performance** - Load testing, security audit, query optimisation, and mobile performance
- [ ] **Phase 7: Deployment & Launch** - Production go-live, app store submissions, and soft launch

## Phase Details

### Phase 1: Sprint 1 Foundation
**Goal**: All Sprint 1 modules are live and tested
**Depends on**: Nothing
**Requirements**: Auth, Users, LGAs, Tourism, Events, Stays, Marketplace, Wallet, Admin, Webhooks, AI (basic), Web, Mobile — all validated Sprint 1 scope
**Success Criteria** (what must be TRUE):
  1. 153 unit tests pass across all 11 test suites
  2. All Sprint 1 modules (auth through AI) respond correctly on the running server
  3. Web dashboard and mobile app are functional end-to-end
**Plans**: Complete

### Phase 2: Infrastructure Migration
**Goal**: All services run on the free-first cloud stack (Neon + Upstash + Cloudflare R2 + Railway + Infisical + Grafana) as independent microservices communicating via gRPC, with Typesense powering unified search
**Depends on**: Phase 1
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10, SEARCH-01, SEARCH-02, SEARCH-03
**Success Criteria** (what must be TRUE):
  1. `prisma migrate deploy` runs cleanly against Neon serverless PostgreSQL 16 in both dev and production branches with no data loss
  2. Every microservice (auth, wallet, transport, events, stays, marketplace, delivery, ai, admin) deploys as a separate Railway service and auto-deploys on push to main
  3. A unified search query returns attractions, events, properties, and products with typo tolerance and geo-ranking within 100ms against a 100,000-document Typesense index
  4. Kafka consumers process charge.success, escrow.released, order.delivered events — EventEmitter2 @OnEvent handlers removed from all feature services (stays.service.ts, marketplace.service.ts, events.service.ts, webhooks.service.ts); EventEmitterModule registration kept as no-op until Phase 6 cleanup
  5. Grafana Cloud shows live traces, metrics, and logs from all services; zero secrets exist in any `.env` file committed to the repo
**Plans**: 13 plans
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Neon PostgreSQL baseline migration + Upstash Redis TLS config
- [x] 02-02-PLAN.md — Cloudflare R2 migration (S3Service constructor + .env.example update)
- [x] 02-03-PLAN.md — Typesense setup + SearchService + SearchIndexerService + GET /api/v1/search endpoint

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-04-PLAN.md — OpenTelemetry + Grafana Cloud + Sentry instrumentation + Swagger gate + GET /api/v1/health
- [x] 02-05-PLAN.md — Production Dockerfile + Railway deployment + Infisical secrets + CI .env gate
- [ ] 02-06-PLAN.md — Human verification checkpoint: Railway deployment health check *(pending: commit + push + Railway verify)*

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-07-PLAN.md — gRPC proto definitions (all 8 services) + ts-proto TypeScript generation
- [x] 02-08-PLAN.md — auth-service + wallet-service gRPC microservice extraction
- [x] 02-09-PLAN.md — events-service gRPC extraction
- [x] 02-09b-PLAN.md — stays-service + marketplace-service gRPC extraction
- [x] 02-10-PLAN.md — admin-service + ai-service gRPC extraction
- [x] 02-10b-PLAN.md — notifications-service gRPC extraction (completes INFRA-07 + INFRA-08)
- [x] 02-11-PLAN.md — Upstash Kafka event bus (dual-write + @OnEvent handler removal)

**Cross-cutting constraints:**
- All 153 existing tests still pass
**UI hint**: no

### Phase 3: Transport Module
**Goal**: Citizens can request a ride and see their driver live on a map; drivers can go online, accept rides, navigate, and receive earnings in their wallet automatically on trip completion
**Depends on**: Phase 2
**Requirements**: TRANSPORT-01, TRANSPORT-02, TRANSPORT-03, TRANSPORT-04, TRANSPORT-05, TRANSPORT-06, TRANSPORT-07, TRANSPORT-08
**Success Criteria** (what must be TRUE):
  1. A driver with DRIVER role can create a profile, submit vehicle and licence details, and the LGA_ADMIN approval flow transitions the driver to APPROVED and allows them to go online
  2. A rider can select vehicle type, enter pickup/dropoff, view a fare estimate including any active surge multiplier, confirm, and be matched to the nearest online driver within 60 seconds
  3. Both rider and driver see each other's GPS position update live on the map every 2 seconds via WebSocket for the entire trip duration
  4. On trip completion, 85% of the fare is credited to the driver's wallet immediately and the platform retains 15%, with both amounts visible in the earnings dashboard
  5. The mobile app's Transport tab (ride request) and Driver tab (go online, accept/reject, navigate, earnings) are fully functional on both iOS and Android
**Plans**: 8 plans
Plans:
**Wave 1**
- [ ] 03-01-PLAN.md — Backend deps + Prisma schema + Redis geo + Wallet gateway override + AuthModule export

**Wave 2** *(blocked on Wave 1)*
- [ ] 03-02-PLAN.md — [BLOCKING] Prisma db push + transport PlatformConfig seed

**Wave 3** *(blocked on Wave 2)*
- [ ] 03-03-PLAN.md — DTOs + RED test specs (TDD red step)

**Wave 4** *(blocked on Wave 3)*
- [ ] 03-04-PLAN.md — TransportService implementation (TDD green step)

**Wave 5** *(blocked on Wave 4)*
- [ ] 03-05-PLAN.md — TransportGateway + Controller + Module + AppModule registration

**Wave 6** *(blocked on Wave 5)*
- [ ] 03-06-PLAN.md — Mobile Transport tab (rider) + npm install + app.json Google Maps

**Wave 7** *(blocked on Wave 6)*
- [ ] 03-07-PLAN.md — Mobile Driver tab + tab layout

**Wave 8** *(blocked on Wave 7)*
- [ ] 03-08-PLAN.md — Human verification checkpoint (8-step end-to-end)

**Cross-cutting constraints:**
- All 179 existing tests still pass after schema changes
- Platform fees always read from PlatformConfig table — never hardcoded
- WebSocket gateway shares port 3001 (no port arg in @WebSocketGateway)
**UI hint**: yes

### Phase 4: Delivery Module
**Goal**: Users can request parcel delivery, senders can track their rider live, and delivery is confirmed only by OTP plus photo proof — with rider earnings credited automatically
**Depends on**: Phase 3
**Requirements**: DELIVERY-01, DELIVERY-02, DELIVERY-03, DELIVERY-04, DELIVERY-05, DELIVERY-06
**Success Criteria** (what must be TRUE):
  1. A user can submit a delivery request with pickup address, dropoff address, item description, and weight, and be matched to the nearest available rider within 60 seconds
  2. The sender sees the rider's live GPS position via WebSocket from pickup through final delivery
  3. Delivery is only marked complete when the recipient enters the OTP sent at dispatch AND the rider uploads a proof-of-delivery photo — no other path closes the order
  4. On successful delivery, 80% of the delivery fee is credited to the rider's wallet and 20% is retained by the platform, confirmed in the wallet ledger
  5. The mobile Delivery tab (parcel request + tracking) and Rider tab (delivery assignments) are accessible and functional
**Plans**: TBD
**UI hint**: yes

### Phase 5: AI Concierge + KYC
**Goal**: The AI concierge streams GPT-4o responses with live Ogun State tool calls and vector-powered recommendations; users can unlock real wallet tiers via NIBSS BVN, NIMC NIN, and Smile Identity liveness checks
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, KYC-01, KYC-02, KYC-03, KYC-04
**Success Criteria** (what must be TRUE):
  1. A user query to the AI concierge returns a streaming SSE response (first token within 2 seconds) powered by GPT-4o with the Ogun State system prompt and access to tool calls for attractions, events, stays, ride estimates, and weather
  2. The recommendation engine surfaces personalised suggestions based on Upstash Vector embeddings of the user's interaction history
  3. A user who completes NIBSS BVN verification sees their wallet daily limit raised to ₦200K; NIN verification raises it to ₦1M; Smile Identity liveness raises it to ₦5M — each stored AES-256-GCM encrypted at rest
  4. A driver whose LGA_ADMIN approves their KYC is immediately able to go online (APPROVED status reflected in real time)
  5. The mobile AI Chat screen at `/ai-chat` renders a full-screen conversation with message history that persists across sessions
**Plans**: TBD
**UI hint**: yes

### Phase 6: QA, Security & Performance
**Goal**: The platform passes load tests at 10,000 concurrent users, clears OWASP ZAP with zero critical findings, eliminates all sequential scans on hot queries, and the mobile app starts cold in under 3 seconds on 3G
**Depends on**: Phase 5
**Requirements**: QA-01, QA-02, QA-03, QA-04, QA-05, QA-06, QA-07
**Success Criteria** (what must be TRUE):
  1. k6 load test with 10,000 concurrent users records P95 response time below 500ms and an error rate below 0.1%
  2. 500 concurrent WebSocket connections (transport GPS tracking) sustain for 10 minutes with zero drops
  3. OWASP ZAP scan on staging returns zero critical findings on wallet, KYC, and auth endpoints; RLS test suite confirms user A cannot access user B's data
  4. EXPLAIN ANALYZE output for all hot queries shows index scans only — no sequential scans remain; all images served as WebP via Cloudflare R2 with LCP below 2.5s on 3G
  5. Mobile cold start on 3G is confirmed below 3 seconds; crash-free rate exceeds 99.5% over a 48-hour test period
**Plans**: TBD
**UI hint**: no

### Phase 7: Deployment & Launch
**Goal**: The platform is live in Railway production with Paystack LIVE keys active, both app stores have submitted builds, Grafana and Sentry are monitoring, and a 48-hour Abeokuta soft launch completes without exceeding the error threshold
**Depends on**: Phase 6
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-05, LAUNCH-06, LAUNCH-07, LAUNCH-08
**Success Criteria** (what must be TRUE):
  1. All microservices are deployed to Railway production using the Neon production branch and Upstash production tier; Cloudflare WAF and DDoS protection are active on *.iseyaa.ng
  2. A real-money end-to-end test (₦100 topup → ticket purchase → escrow → refund) completes successfully using Paystack LIVE keys
  3. iOS build is submitted to App Store under 40MB and Android APK to Play Store under 30MB; TestFlight has 50+ active testers with crash-free rate above 99.5%
  4. Grafana Cloud dashboards show all live KPIs; Sentry alerts fire correctly for error rate spikes; rollback to the previous Railway deployment completes in under 5 minutes
  5. 48-hour invite-only soft launch in Abeokuta runs with error rate below 0.5%, confirming the public launch trigger is met
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:** 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sprint 1 Foundation | - | Complete | 2026-05-11 |
| 2. Infrastructure Migration | 12/13 | In progress (02-06 human checkpoint pending) | - |
| 3. Transport Module | 0/TBD | Not started | - |
| 4. Delivery Module | 0/TBD | Not started | - |
| 5. AI Concierge + KYC | 0/TBD | Not started | - |
| 6. QA, Security & Performance | 0/TBD | Not started | - |
| 7. Deployment & Launch | 0/TBD | Not started | - |
