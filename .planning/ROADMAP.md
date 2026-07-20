# ISEYAA Roadmap

## Overview

Sprint 1 is shipped. This roadmap covers the six remaining sprints: infrastructure migration to a free-first cloud stack, two new commercial modules (Transport and Delivery), a full AI concierge with real KYC integrations, a hardening sprint, and production launch. Every phase delivers a coherent, independently verifiable capability.

**v2.0 (Phases 10-17)** converts the monolith into a real, independently-deployable gRPC service (proven via `notifications-service`), wraps every external vendor call in circuit-breaker/retry/fallback resilience, generalizes the settlement engine to a three-way vendor/Ministry/platform split (fixing two pre-existing revenue bugs along the way), adds a read-only Ministry dashboard with CSV/PDF export, and lets users choose WhatsApp/Email/SMS for OTP verification — while correcting the documentation record that previously overstated Phase 2's gRPC extraction as complete.

**v2.1 (Phases 18-22)** clears the extraction backlog v2.0 deliberately deferred: centralizes settlement split configuration into one validated resolver before adding a dispute/adjustment workflow on top of it, retrofits health-check-gated blue-green deploys onto the gRPC extraction pattern before extracting four more low-risk services (news/waitlist/reviews + scoped Delivery OTP), and ships recurring Ministry export delivery plus an LGA/season visitor heatmap as an independent parallel track.

## Milestones

- [x] **Sprint 1 (Phase 1)** — Auth, Users, LGAs, Tourism, Events, Stays, Marketplace, Wallet, Admin, Webhooks, AI (basic), Web, Mobile — SHIPPED 2026-05-11
- [ ] **Sprint 2–7 (Phases 2–7)** — Infrastructure → Transport → Delivery → AI/KYC → QA → Launch
- [x] **Phase 8-9** — Mobile Redesign, Tour Packages & Tour Guides
- [x] **v2.0 (Phases 10–17)** — Microservices, Multi-Channel Auth & Government Partnership — SHIPPED 2026-07-19 (full detail: `milestones/v2.0-ROADMAP.md`)
- [ ] **v2.1 (Phases 18–22)** — Extraction Backlog Clearance & Settlement Flexibility — IN PROGRESS (started 2026-07-19)

## Phases

- [x] **Phase 1: Sprint 1 Foundation** - All core commercial modules shipped and tested (153 tests passing)
- [ ] **Phase 2: Infrastructure Migration** - Free-first cloud stack, microservices, search, and event bus
- [ ] **Phase 3: Transport Module** - Ride-hailing with real-time GPS, fare engine, and driver earnings
- [ ] **Phase 4: Delivery Module** - Parcel delivery with OTP proof-of-delivery and live tracking
- [ ] **Phase 5: AI Concierge + KYC** - GPT-4o concierge with tool calls, vector recommendations, and real identity verification
- [ ] **Phase 6: QA, Security & Performance** - Load testing, security audit, query optimisation, and mobile performance
- [ ] **Phase 7: Deployment & Launch** - Production go-live, app store submissions, and soft launch
- [x] **Phase 8: Mobile Redesign** - Bring mobile app in line with the redesigned web (Airbnb-style stays, Temu-style marketplace, host onboarding, news ticker), complete the 5-tab migration, and ship a fresh EAS preview build
- [x] **Phase 9: Tour Packages & Tour Guides** - Sell complete Ogun State experiences (curated multi-vendor packages) and onboard certified Tour Guides as a first-class role, with multi-vendor commission splitting on a single buyer payment
- [x] **Phase 10: Documentation Correction + gRPC Build Fix** - Correct the false "8 services extracted" claim, make all 8 service scaffolds actually build, and author `.proto` contracts for the 7 never-stubbed modules (completed 2026-07-15)
- [x] **Phase 11: Resilience Wrapping** - Circuit-breaker + retry + timeout + fallback around every external vendor call (Paystack, Termii, Anthropic, R2/S3, FCM), visible in observability
 (completed 2026-07-16)
- [x] **Phase 12: Settlement Engine Foundation** - Generalized `SettlementService` + standing Ministry wallet, plus fixing two pre-existing revenue bugs (Stays escrow fee leak, missing Marketplace/Events/Studio webhook consumers) (completed 2026-07-17)
- [x] **Phase 13: Settlement Cutover — Transport & Delivery** - Transport and Delivery's live payouts move onto the three-way settlement engine, shadow-mode verified before cutover (completed 2026-07-17)
- [x] **Phase 14: Ministry Dashboard** - `MINISTRY_VIEWER` role + read-only dashboard: visitor counts, purpose-of-visit, revenue-to-government-share, CSV/PDF export, zero PII leakage (8 plans complete 2026-07-18; gap closure 14-09/14-10 pending for CR-01/CR-02 blockers found in verification) (completed 2026-07-18)
- [x] **Phase 15: Multi-Channel OTP** - Users choose WhatsApp/Email/SMS for OTP verification at registration, with bounded-timeout SMS fallback and identity-scoped brute-force protection
 (completed 2026-07-18)
- [x] **Phase 16: Connection Pooling Infrastructure** - Every Prisma client on a pooled connection string, combined-topology load test under Neon's connection ceiling
 (completed 2026-07-18)
- [x] **Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service)** - `notifications-service` runs as a genuinely separate deployable process, called via `ClientGrpc`, proving the extraction pattern with zero REST behavior change (6 plans complete 2026-07-19; gap closure pending -- verification found gRPC SendPush silently reports success:true on real send failures; gap closure plan needed before phase can close; see 17-VERIFICATION.md)
- [ ] **Phase 18: Settlement Split Centralization** - Every settlement call site resolves its split percentage from one validated, effective-dated `SettlementSplitTier` resolver instead of 6 duplicated inline `PlatformConfig` reads
- [ ] **Phase 19: Settlement Dispute & Adjustment Workflow** - Admins can raise, review, and resolve disputes against completed settlements via a new append-only `adjust()` primitive, fully audited
- [ ] **Phase 20: gRPC Blue-Green Healthcheck Retrofit** - Every extracted gRPC service exposes a real health endpoint gating Railway rollout, every `@Cron` job is distributed-lock-guarded, and a real blue-green cutover is proven end-to-end
- [ ] **Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP** - News, waitlist, reviews, and Delivery's OTP verification run as independently-deployed gRPC services with zero client-visible behavior change
- [ ] **Phase 22: Scheduled Ministry Exports & LGA Heatmap** - The Ministry receives a recurring email export digest automatically and can see an LGA × season visitor heatmap on the dashboard

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
  2. Proto contracts (`packages/proto/*.proto`) existed for 8 services, but zero live `@GrpcMethod`/`ClientGrpc` wiring was ever implemented — the platform ran (and still runs, pending Phase 17) as a single monolithic `NestFactory.create()` process, not as separate Railway services (claim corrected 2026-07-15 — see Phase 10 for the build-fix work and Phase 17 for the first live extraction)
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
- [x] 02-07-PLAN.md — gRPC proto definitions authored for 8 services (`packages/proto/*.proto`); the `ts-proto` TypeScript generation pipeline (`generate.sh`) was broken and never produced real generated output — corrected 2026-07-15 in Phase 10 (10-03-PLAN.md fixed the codegen pipeline)
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
- [x] 03-01-PLAN.md — Backend deps + Prisma schema + Redis geo + Wallet gateway override + AuthModule export

**Wave 2** *(blocked on Wave 1)*
- [x] 03-02-PLAN.md — [BLOCKING] Prisma db push + transport PlatformConfig seed

**Wave 3** *(blocked on Wave 2)*
- [x] 03-03-PLAN.md — DTOs + RED test specs (TDD red step)

**Wave 4** *(blocked on Wave 3)*
- [x] 03-04-PLAN.md — TransportService implementation (TDD green step)

**Wave 5** *(blocked on Wave 4)*
- [x] 03-05-PLAN.md — TransportGateway + Controller + Module + AppModule registration

**Wave 6** *(blocked on Wave 5)*
- [x] 03-06-PLAN.md — Mobile Transport tab (rider) + npm install + app.json Google Maps

**Wave 7** *(blocked on Wave 6)*
- [x] 03-07-PLAN.md — Mobile Driver tab + tab layout

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
**Plans**: 8 plans
Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Prisma schema (DeliveryRider + DeliveryOrder + DeliveryEvent + DeliveryOrderStatus enum) + expo-image-picker mobile dep

**Wave 2** *(blocked on Wave 1)*
- [x] 04-02-PLAN.md — [BLOCKING] Prisma db push + delivery PlatformConfig seed (5 keys)

**Wave 3** *(blocked on Wave 2)*
- [x] 04-03-PLAN.md — DTOs (6 files) + RED test specs (TDD red step)

**Wave 4** *(blocked on Wave 3)*
- [x] 04-04-PLAN.md — DeliveryService implementation (TDD green step)

**Wave 5** *(blocked on Wave 4)*
- [x] 04-05-PLAN.md — DeliveryGateway + Controller + Module + AppModule registration

**Wave 6** *(blocked on Wave 5)*
- [x] 04-06-PLAN.md — Mobile Delivery tab (sender flow, D-1 through D-5) + _layout.tsx + app.json iOS permissions

**Wave 7** *(blocked on Wave 6)*
- [x] 04-07-PLAN.md — Mobile Rider tab (rider flow, R-1 through R-5) + OTP entry + photo proof

**Wave 8** *(blocked on Wave 7)*
- [ ] 04-08-PLAN.md — Human verification checkpoint (12-step end-to-end)

**Cross-cutting constraints:**
- All existing tests still pass after schema changes
- Platform fees always read from PlatformConfig table — never hardcoded
- WebSocket gateway shares port 3001 (no port arg in @WebSocketGateway)
- OTP sent to recipient's phone (not sender's) — recipientPhone field in DTO
- S3Service.upload(key, buffer, contentType) signature — not uploadBuffer
**UI hint**: yes

### Phase 5: AI Concierge + KYC
**Goal**: The AI concierge streams Claude responses with live Ogun State tool calls and vector-powered recommendations; users can unlock real wallet tiers via NIBSS BVN, NIMC NIN, and Smile Identity liveness checks
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, KYC-01, KYC-02, KYC-03, KYC-04
**Success Criteria** (what must be TRUE):
  1. A user query to the AI concierge returns a streaming SSE response (first token within 2 seconds) powered by Claude with the Ogun State system prompt and access to tool calls for attractions, events, stays, ride estimates, and weather
  2. The recommendation engine surfaces personalised suggestions based on Upstash Vector embeddings of the user's interaction history
  3. A user who completes NIBSS BVN verification sees their wallet daily limit raised to ₦200K; NIN verification raises it to ₦1M; Smile Identity liveness raises it to ₦5M — each stored AES-256-GCM encrypted at rest
  4. A driver whose LGA_ADMIN approves their KYC is immediately able to go online (APPROVED status reflected in real time)
  5. The mobile AI Chat screen at `/ai-chat` renders a full-screen conversation with message history that persists across sessions
**Plans**: 7 plans
Plans:
**Wave 1**
- [x] 05-01-PLAN.md — Prisma schema (5 KYC fields) + PlatformConfig seed + @upstash/vector + react-native-sse + .env.example

**Wave 2** *(blocked on Wave 1)*
- [x] 05-02-PLAN.md — EncryptionService (AES-256-GCM) + VectorService (Upstash) + DojahService (NIN) + PaystackService.resolveBvn + KycService skeleton

**Wave 3** *(blocked on Wave 2)*
- [x] 05-03-PLAN.md — KycService full impl (BVN/NIN/Smile) + WalletService PlatformConfig tier limits (TDD)

**Wave 4** *(blocked on Wave 2)*
- [x] 05-04-PLAN.md — AI streamChatWithTools (3-turn agentic loop, 5 tools) + /ai/recommend + ChatDto (TDD)

**Wave 5** *(blocked on Wave 4)*
- [x] 05-05-PLAN.md — Mobile ai-chat.tsx (SSE streaming, tool cards, AsyncStorage) + driver.tsx APPROVED polling

**Wave 6** *(blocked on Wave 3 + Wave 5)*
- [x] 05-06-PLAN.md — Mobile kyc.tsx (3-tier BVN/NIN/Smile, locked→verified, driver banner, polling)

**Wave 7** *(blocked on Wave 6)*
- [ ] 05-07-PLAN.md — Human verification checkpoint (7-step end-to-end)

**Cross-cutting constraints:**
- BVN/NIN stored AES-256-GCM encrypted — plaintext never persisted or logged
- Wallet tier limits always read from PlatformConfig — never hardcoded
- react-native-sse for mobile SSE (React Native has no native EventSource)
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
**Plans**: 6 plans
Plans:
**Wave 1** *(no dependencies — runs immediately)*
- [x] 06-01-PLAN.md — Bug fixes: admin v.category SQL, escrow checkOut cutoff, marketplace stock decrement, webhook rawBody verification
- [x] 06-02-PLAN.md — FK index migration (9 indexes) + WebP image pipeline (ImageService + 2 callers)

**Wave 2** *(blocked on Wave 1)*
- [x] 06-03-PLAN.md — Cross-user isolation test suites (wallet, stays, marketplace) + EXPLAIN ANALYZE audit script
- [x] 06-04-PLAN.md — k6 HTTP load test scripts (QA-01) + Artillery Socket.IO GPS stress scripts (QA-02)
- [x] 06-05-PLAN.md — Mobile: Hermes jsEngine + Sentry React Native SDK + Atlas bundle script

**Wave 6** *(blocked on all preceding waves)*
- [ ] 06-06-PLAN.md — Human verification checkpoint: QA-01 through QA-07 all confirmed PASS

**Cross-cutting constraints:**
- All 270+ existing tests continue to pass after every plan
- ZAP scan runs only against staging (never production)
- k6 and Artillery target staging URL by default (__ENV.BASE_URL)
- Neon PgBouncer pooling must be enabled before 10K VU k6 run
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
**Plans**: 5 plans
Plans:
**Wave 1** *(no dependencies — runs immediately)*
- [x] 07-01-PLAN.md — EAS build config (eas.json, expo-dev-client, build scripts, app.json projectId)

**Wave 2** *(blocked on Wave 1)*
- [x] 07-02-PLAN.md — Production backend: CORS hardening, Swagger gate, Railway env var checklist

**Wave 3** *(blocked on Wave 2)*
- [x] 07-03-PLAN.md — Monitoring: Grafana dashboard JSON + Sentry alert runbook + Railway rollback procedure
- [x] 07-04-PLAN.md — App store prep: buildNumber, versionCode, privacyManifests, submission checklist

**Wave 4** *(blocked on all preceding waves)*
- [ ] 07-05-PLAN.md — Human verification checkpoint: 10-step production launch gate (LAUNCH-01 through LAUNCH-08)

**Cross-cutting constraints:**
- Development build (07-01) is the fastest path for the operator to test on their mobile device
- All backend changes must pass the existing test suite before merging
- Real-money E2E test (LAUNCH-03) requires Paystack LIVE keys — document clearly in MANUAL-ACTIONS.md
**UI hint**: no

### Phase 8: Mobile Redesign
**Goal**: Mobile app matches the redesigned web experience — Airbnb-style category-tabbed stays browse, mode-aware stay detail (NIGHTLY/HOURLY/TIMED_EVENT/MEMBERSHIP), Temu-style marketplace with cart + checkout, host onboarding screen, and a news ticker on Discover — with the 5-tab navigation migration (Discover/Book/Wallet/Concierge/You) fully completed and a fresh EAS preview build delivered
**Depends on**: Phase 1 (no infra dependency on 2–7)
**Requirements**: MOB-RD-01, MOB-RD-02, MOB-RD-03, MOB-RD-04, MOB-RD-05, MOB-RD-06, MOB-RD-07, MOB-RD-08
**Success Criteria** (what must be TRUE):
  1. `mobile/app/(tabs)/` contains exactly 5 tabs (index/book/wallet/concierge/profile) — all legacy tabs (events, stays, studio, transport, delivery, driver, rider) removed from the tabs directory and migrated into the new tab structure or modal/stack screens per `mobile-redesign-UI-SPEC.md`
  2. Discover tab (`(tabs)/index.tsx`) renders a hero with a working news ticker component (sourced from `GET /api/v1/news?limit=20`) and a curated content feed using the design tokens from `mobile/lib/tokens.ts`
  3. Book tab → Stays sub-section renders a category-tabbed horizontal scroll matching the 10 web categories (All/Stays/Lounges/Clubs/Beach/Tours/Experiences/Memberships/Attractions/Featured), with a photo-first grid hitting `GET /api/v1/properties` filtered by selected category
  4. Stay detail screen (`mobile/app/stays/[id].tsx`) renders a 4-image gallery, highlights with check icons, amenity chips, and a sticky booking sheet with 4 distinct UIs that switch on `property.bookingMode` — matching `web/src/app/stays/[id]/page.tsx`
  5. Book tab → Marketplace sub-section renders 8 category tabs, product grid with discount badges and wishlist, and a working `CartDrawer` equivalent (zustand cart persisted to AsyncStorage as `iseyaa-cart-v1`) that flows into a checkout screen that hands off to Paystack via the existing `POST /api/v1/cart/checkout`
  6. A new Host onboarding screen reachable from the You tab matches `web/src/app/host/page.tsx` (hero, 3 benefit cards, Q&A, gold CTA) and fires `POST /api/v1/users/me/become-host` on confirm — the success response navigates to a host dashboard stub or existing screen
  7. A fresh Android EAS preview build (`eas build --platform android --profile preview --non-interactive`) completes successfully and the install URL is captured in the phase verification record
  8. All existing 282+ tests still pass after mobile changes; no breaking changes to backend endpoints; web app unchanged
**Plans**: 11 plans
Plans:
**Wave 1** *(no dependencies — runs immediately, parallel)*
- [x] 08-01-PLAN.md — Install expo-image + expo-web-browser + @react-native-community/datetimepicker + create lib/category-config.ts + lib/cart-store.ts (mirrors web/src/lib/cart.ts exactly) + extend tokens.ts with CARD_GRADIENTS.goldHero
- [x] 08-02-PLAN.md — NewsTicker component (uses item.link) + shared UI primitives (PressableScale, CategoryStrip with 44pt min, Chip)

**Wave 2** *(blocked on Wave 1)*
- [x] 08-03-PLAN.md — Discover tab: insert NewsTicker at top of (tabs)/index.tsx (full Discover hero redesign deferred)
- [x] 08-04-PLAN.md — Delete 7 legacy tabs + strip hidden Tabs.Screen registrations from (tabs)/_layout.tsx
- [x] 08-04b-PLAN.md — Pre-register 4 new Stack routes (marketplace/[id], cart, checkout, host) in app/_layout.tsx so Wave 3 plans have disjoint file ownership

**Wave 3** *(blocked on Wave 2)*
- [x] 08-05-PLAN.md — Book hub rewrite: 4 sub-sections (Events / Stays / Studio / Marketplace), Stays (10 categories, /properties grid), Marketplace (8 categories, /products grid with wishlist + 44pt Add button), Events (migrated EventsFeed + QR FAB), Studio (legacy look preserved)
- [x] 08-06-PLAN.md — Marketplace product detail + cart drawer modal + checkout screen POSTing to /api/v1/orders with { items, email } (no delivery address — backend forbids extras); does NOT touch _layout.tsx
- [x] 08-07-PLAN.md — Host onboarding screen using CARD_GRADIENTS.goldHero + profile-tab "Become a host" card; does NOT touch _layout.tsx

**Wave 4** *(blocked on Wave 3)*
- [x] 08-08-PLAN.md — Stay detail redesign: 4-image gallery + highlights + amenity chips + 4 mode-aware booking sheets (NIGHTLY/HOURLY/TIMED_EVENT/MEMBERSHIP) POSTing to /api/v1/properties/:id/bookings with { checkIn, checkOut, guests, email } — TIMED_EVENT uses pricePerHour × slot length

**Wave 5** *(blocked on Wave 4)*
- [x] 08-09-PLAN.md — EAS preview build: bump android.versionCode + commit + submit `eas build --platform android --profile preview --non-interactive` + capture install URL

**Wave 6** *(blocked on Wave 5)*
- [ ] 08-10-PLAN.md — Human verification checkpoint: walk all 8 MOB-RD success criteria on installed APK + record in 08-VERIFICATION.md + finalize 08-VALIDATION.md

**Cross-cutting constraints:**
- Use design tokens from `mobile-redesign-UI-SPEC.md` — no inline hex strings in component files (define once in `mobile/lib/tokens.ts`)
- Use existing backend endpoints only — no new backend work in this phase
- expo-router file-based navigation — no React Navigation Stack imports
- `react-native-reanimated` for press animations (scale 0.97 spring) — not `Animated.spring` alone
- `expo-image` (not `Image` from react-native) for all photo loads — better caching
- News ticker uses `Animated.loop` + `translateX` — no `react-native-marquee` dep unless we already pulled it
- All touch targets ≥ 44pt (iOS HIG); minimum tab/button heights enforced
- Bundle ID unchanged: `ng.gov.ogun.iseyaa`
**UI hint**: yes

### Phase 9: Tour Packages & Tour Guides
**Goal**: Tourists, diaspora, corporate groups, families, schools, and churches can browse curated Ogun State tour packages (Abeokuta Heritage / Ijebu Cultural / Adire Experience / Festival / Food & Lifestyle), pick a date, select a certified tour guide, pay ONE price on ISEYAA, and receive a structured itinerary — with each downstream vendor (guide, hotel, transport, attractions, events) automatically credited their share from the single payment via the existing wallet ledger
**Depends on**: Phase 1 (no infra dependency on 2–8 beyond what Sprint 1 already shipped)
**Requirements**: TOUR-01, TOUR-02, TOUR-03, TOUR-04, TOUR-05, TOUR-06, TOUR-07, TOUR-08, TOUR-09, TOUR-10
**Success Criteria** (what must be TRUE):
  1. A new `TOUR_GUIDE` role exists with onboarding flow: profile (name, photo, bio, years of experience), languages spoken (multi-select), certifications (file upload), Tier-2 KYC (NIN encrypted AES-256-GCM), and availability calendar (block out unavailable days). LGA_ADMIN approval gates first listing.
  2. Hosts can create `TourPackage` listings that reference 1+ attractions + optional `PropertyId`s (stays) + optional `EventId`s + optional transport leg + 1 `TourGuideId`, with a single tourist-facing `price` and a structured `itinerary[]` template (timeline of activities by hour). Per-package settlement-split table declares each vendor's cut percentage; total must sum to ≤ 100% (the remainder is platform commission).
  3. A tourist can search packages by category (Heritage / Cultural / Adire / Festival / Food / Family / Faith / School / Corporate), select a date that satisfies guide availability + attraction opening hours + event date constraints, optionally specify group size (1–50), and book.
  4. On payment success via existing Paystack flow, the wallet ledger writes ONE credit transaction per downstream vendor (guide, hotel, transport, attraction, event) plus ONE platform commission entry — atomically in a single SELECT FOR UPDATE transaction. Failure of any leg rolls back the entire booking and refunds the buyer.
  5. The booked itinerary is delivered as: (a) in-app structured view in the mobile You tab → Trips section, (b) email PDF via SendGrid, (c) push notification 24h before tour starts. The structured itinerary is distinct from the AI-suggested itinerary in the existing AI module — both can co-exist (AI suggests; tourist converts an AI suggestion into a bookable Package via a "Save as bookable" CTA).
  6. Group bookings (≥ 10 passengers) support a `groupLeader` user who pays the lump sum AND optional split-bill mode where N passengers each pay their share via a shared booking link; group bookings unlock a configurable bulk-discount tier from `PlatformConfig`.
  7. After tour completion, the tourist can rate the guide (1–5 stars + photo + text), the package overall (separate rating), and individual venues touched. Guide aggregate rating drives discovery sort. Disputed ratings (≤ 2 stars) trigger an admin review queue.
  8. Web admin sees: tour package approval queue, tour guide KYC queue, per-package revenue breakdown by downstream vendor, group-booking utilization heatmap.
  9. Mobile UI: new Book hub sub-section "Tours" (becomes the 5th sub-section alongside Events / Stays / Studio / Marketplace) with category-tabbed grid; tour detail screen with itinerary preview, guide profile card, date picker; trips list on profile tab; rating modal after tour end.
  10. All existing 282+ tests still pass; wallet ledger invariant test extended to verify multi-vendor split sums match buyer payment exactly (no drift); new TourGuide KYC encryption test verifies NIN never persisted plaintext.

**Plans**: 13 plans
Plans:
**Wave 1** *(no dependencies — runs immediately, parallel)*
- [x] 09-01-PLAN.md — Schema + migration (TOUR_GUIDE enum + 6 models + CHECK constraint) + 6 PlatformConfig seeds
- [x] 09-02-PLAN.md — Shared infra: ReferenceService (ISY-TOUR-<12char>) + RefundService (Paystack chargeback)

**Wave 2** *(blocked on Wave 1, parallel)*
- [x] 09-03-PLAN.md — TourGuide module: become-guide, profile CRUD, KYC (AES-256-GCM + bcrypt), availability, LGA_ADMIN approval
- [x] 09-04-PLAN.md — TourPackage module: CRUD with 8 service-side guards (guide-approved, attractions, split sum, etc.) + admin approval queue

**Wave 3** *(blocked on Wave 2)*
- [x] 09-05-PLAN.md — TourBooking lifecycle: date constraint, bulk discount tiers, split-bill orchestration, snapshot, itinerary materialization (NO wallet writes)

**Wave 4** *(blocked on Wave 3)*
- [x] 09-06-PLAN.md — Multi-vendor settlement engine + webhooks dispatch: atomic $transaction, SELECT FOR UPDATE per vendor wallet, idempotency, refund-on-failure, split-bill accumulator

**Wave 5** *(blocked on Wave 4, parallel)*
- [x] 09-07-PLAN.md — Itinerary PDF + 3-channel delivery: SendGrid email on confirm, 3 cron jobs (T-24h / T-2h / T+1h), pdfkit, configurable offsets
- [x] 09-08-PLAN.md — Review + auto-flag (<=2 stars) + admin review queue + debounced aggregate rating recompute

**Wave 6** *(blocked on Wave 5, parallel)*
- [x] 09-09-PLAN.md — Web public surface: /tours browse + /tours/[slug] detail + /become-a-guide + /host/tours/new multi-step creator
- [x] 09-10-PLAN.md — Web admin surface: 4 queue pages + revenue chart + utilization heatmap + 2 new backend admin GET endpoints

**Wave 7** *(blocked on Wave 5)*
- [x] 09-11-PLAN.md — Mobile: Tours sub-section in Book hub + tours/[id] + trips/index + TourBookingSheet + RatingModal + SplitBillShareSheet

**Wave 8** *(blocked on all preceding waves)*
- [x] 09-12-PLAN.md — TOUR-10 regression tests: wallet invariant e2e + KYC encryption e2e + end-to-end happy path
- [ ] 09-13-PLAN.md — Human verification checkpoint: walk all 10 ROADMAP SCs against live environment + record evidence in 09-VERIFICATION.md

**Cross-cutting constraints:**
- Multi-vendor split MUST use the existing wallet `SELECT FOR UPDATE` pattern + idempotency key — no new payment plumbing.
- Tour guide KYC reuses Phase 5's `EncryptionService` + Dojah NIN verifier — no new KYC vendor.
- Itinerary delivery (push 24h before tour) reuses existing `NotificationsService` + scheduled cron — no new scheduler.
- Per-package settlement-split table declares cuts; total must sum to ≤ 100% with the remainder going to platform (enforced by DB constraint + service-layer guard).
- The existing AI itinerary endpoint is preserved as-is; new structured `Itinerary` model lives alongside it. Reconciliation rule: AI itineraries are *suggestions* (free text + tool-call enriched); structured itineraries are *contracts* (bookings attached, vendors paid).
- Currency: NGN only for v1 (diaspora pay via Paystack international cards in NGN equivalent). Multi-currency display is deferred.
- Group booking max: 50 passengers (above that → corporate sales contract handled outside the app).
- Flights inventory integration is OUT of scope (Tourism module diagram includes "Flights" but that requires a separate Amadeus/Duffel/Travelport phase — track as Phase 10 candidate).

**UI hint**: yes

---

## v2.0 — Microservices, Multi-Channel Auth & Government Partnership (Phases 10-17)

<details>
<summary>✅ v2.0 (Phases 10-17) — SHIPPED 2026-07-19 — full detail: <code>milestones/v2.0-ROADMAP.md</code></summary>

**Milestone Goal:** Convert the monolith into real independently-deployable gRPC services (proven via `notifications-service`), let users pick WhatsApp/Email/SMS for verification, add a read-only Ministry dashboard with export, and generalize the settlement engine to a three-way vendor/Ministry/platform split — while first correcting the documentation record that overstated Phase 2's gRPC extraction as complete.

- [x] Phase 10: Documentation Correction + gRPC Build Fix (3/3 plans) — completed 2026-07-15
- [x] Phase 11: Resilience Wrapping (11/11 plans) — completed 2026-07-16
- [x] Phase 12: Settlement Engine Foundation (9/9 plans) — completed 2026-07-17
- [x] Phase 13: Settlement Cutover — Transport & Delivery (4/4 plans) — completed 2026-07-17
- [x] Phase 14: Ministry Dashboard (10/10 plans) — completed 2026-07-18
- [x] Phase 15: Multi-Channel OTP (6/6 plans) — completed 2026-07-18
- [x] Phase 16: Connection Pooling Infrastructure (4/4 plans) — completed 2026-07-18
- [x] Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) (7/7 plans) — completed 2026-07-19

29/30 requirements fully satisfied; RESIL-02 partial (code verified, live Grafana/Sentry dashboard confirmation deferred — see STATE.md Deferred Items). Full phase-by-phase goals, success criteria, plan lists, and cross-cutting constraints preserved in `milestones/v2.0-ROADMAP.md`.

</details>

## v2.1 — Extraction Backlog Clearance & Settlement Flexibility (Phases 18-22)

**Milestone Goal:** Extend v2.0's proven patterns — more services onto real gRPC, safer deploys for them, automated Ministry exports, and settlement disputes/flexible splits.

### Phase 18: Settlement Split Centralization
**Goal**: Every settlement call site resolves its split percentage from one validated, effective-dated source instead of duplicated inline reads
**Depends on**: Nothing (first phase of v2.1; builds on v2.0 Phase 12/13's `SettlementService`)
**Requirements**: SETTLE-11a, SETTLE-11b, SETTLE-11c, SETTLE-11d
**Success Criteria** (what must be TRUE):
  1. An operator can view and update per-module split percentages via the new `SettlementSplitTier` config table without a code deploy, and the change takes effect for settlements from that point forward
  2. A settlement completed under an old percentage retains that percentage on its historical record even after the config later changes (effective-dated, not retroactively recalculated)
  3. All 6 existing settlement call sites (Transport, Delivery, Marketplace, Events, Stays, Studio) resolve their split exclusively via `SettlementService.resolveSplit()` — no module computes a split percentage inline anymore
  4. Malformed or NaN-corrupted split configuration is rejected by `SettlementService.settle()` before it can reach a wallet mutation, rather than silently producing a garbage credit/debit
**Plans**: 4 plans
Plans:
**Wave 1**
- [x] 18-01-PLAN.md — SettlementSplitTier Prisma model + migration, SettlementService.resolveSplit() resolver + settle() Number.isFinite() NaN guard, one-off backfill script from live PlatformConfig

**Wave 2** *(blocked on Wave 1)*
- [x] 18-02-PLAN.md — Migrate Transport + Delivery + Events call sites onto resolveSplit()
- [x] 18-03-PLAN.md — Migrate Marketplace + Stays + Studio call sites onto resolveSplit() (D-02 vendor override, D-05 Stays snapshot timing, D-01 Studio null platformPct all preserved)
- [x] 18-04-PLAN.md — Admin CRUD endpoints for SettlementSplitTier (SUPER_ADMIN-only, insert-new-row/deactivate-old per D-05)

### Phase 19: Settlement Dispute & Adjustment Workflow
**Goal**: Admins can dispute a completed settlement and have it corrected through an auditable, non-destructive adjustment
**Depends on**: Phase 18 (`resolveSplit()` is the dispute resolver's source of truth for what split should have applied)
**Requirements**: SETTLE-10a, SETTLE-10b, SETTLE-10c, SETTLE-10d, SETTLE-10e
**Success Criteria** (what must be TRUE):
  1. A `SUPER_ADMIN` (or authorized admin) can raise a dispute against a completed settlement transaction, capturing a reason and the disputed amount
  2. A dispute visibly moves through `OPEN` → `IN_REVIEW` → `RESOLVED`/`DISMISSED`, with a reviewer recorded at the point it enters review
  3. Resolving a dispute produces a new append-only adjustment transaction via `SettlementService.adjust()` (its own idempotency namespace, its own `SELECT FOR UPDATE` lock order) — the original historical `Transaction` rows are never mutated
  4. An adjustment that would drive a recipient's wallet balance negative is blocked (not applied) and flagged for manual ops resolution instead of silently posting
  5. Every dispute action — raise, review, resolve, dismiss — appears in `AuditLog` with who, when, why, and amount
**Plans**: 4 plans
Plans:
**Wave 1**
- [x] 19-01-PLAN.md — SettlementDispute Prisma model + migration (5-status state machine incl. BLOCKED)
- [x] 19-02-PLAN.md — SettlementService.adjust() compensating-transaction primitive (SETTLE-10c/10d)

**Wave 2** *(blocked on Wave 1)*
- [x] 19-03-PLAN.md — SettlementDisputesService: raise/queue/review/computeAdjustmentLines/resolve/dismiss (D-01/D-04/D-05, SETTLE-10a/b/c/d/e)

**Wave 3** *(blocked on Wave 2)*
- [x] 19-04-PLAN.md — SettlementDisputesController + module wiring + end-to-end regression

### Phase 20: gRPC Blue-Green Healthcheck Retrofit
**Goal**: Extracted gRPC services can be deployed and cut over safely, health-gated, with zero risk of a cron job double-firing during a dual-liveness window
**Depends on**: Nothing technically, but sequenced before Phase 21 so no new service takes live traffic without health-gated rollout
**Requirements**: GRPC-06a, GRPC-06b, GRPC-06c
**Success Criteria** (what must be TRUE):
  1. `notifications-service` (and every service extracted in Phase 21) exposes a `grpc.health.v1.Health` endpoint wired to Railway's `healthcheckPath`, and a failing health check blocks rollout
  2. Every existing `@Cron` job (escrow release, heartbeat cleanup, tour reminders) is provably guarded by a `RedisService.setNx()` distributed lock — running two replicas simultaneously does not double-fire any job
  3. An operator can execute a shadow-verify dual-run + manual pointer-flip blue-green cutover on a real extracted service end-to-end, with a documented rollback path available during the bake window
**Plans**: TBD

### Phase 21: Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP
**Goal**: News, waitlist, reviews, and Delivery's OTP verification run as independently-deployed gRPC services with zero client-visible behavior change
**Depends on**: Phase 20 (no new service goes live without the health-check-gated rollout it provides)
**Requirements**: GRPC-07, GRPC-08
**Success Criteria** (what must be TRUE):
  1. News, waitlist, and reviews each run as their own Railway process, called exclusively via `ClientGrpc`, with zero REST response-shape change observed by web/mobile clients
  2. Delivery's `VerifyDeliveryOtp` RPC is served by a live, independently-deployed gRPC service, while `RequestDelivery`, `AcceptDelivery`, `CompleteDelivery`, and `DeliveryGateway` remain in-process — OTP verification behavior is unchanged end-to-end
  3. Every service extracted in this phase passes Phase 20's health-check-gated rollout (real `/healthz`, real Railway `healthcheckPath`) before being considered live
**Plans**: TBD

### Phase 22: Scheduled Ministry Exports & LGA Heatmap
**Goal**: The Ministry receives recurring export digests automatically and can see visitor patterns across LGA and season on the dashboard
**Depends on**: Phase 20 (reuses the distributed-lock cron pattern for its own new scheduled export job)
**Requirements**: MIN-08a, MIN-08b, MIN-08c, MIN-09
**Success Criteria** (what must be TRUE):
  1. A configurable, recurring Ministry export digest (CSV + branded PDF attachment) is generated and delivered by email with no manual trigger, on a cadence set via database configuration
  2. An operator can change the export recipient list and delivery cadence via the database with no redeploy required
  3. Every scheduled delivery attempt (success or failure) is logged, and a transient SendGrid outage does not silently drop a report (send wrapped in the existing `cockatiel` resilience layer)
  4. The Ministry dashboard shows an LGA × month/season visitor heatmap built on existing `MinistryService` query shapes and the existing `recharts` dependency, with no new mapping dependency introduced
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22

Phases 11, 12 (Settlement Foundation), and 15 (WhatsApp OTP) are independent of the Phase 10 documentation/build-fix track and of each other — safe to execute in parallel. Phase 13 (Settlement Cutover) requires Phase 12. Phase 14 (Ministry Dashboard) requires Phase 12 for its revenue-share metric. Phase 16 (Connection Pooling) requires Phase 10's fixed build. Phase 17 (gRPC Extraction) is the final gate, requiring Phases 10, 13, and 16 all complete.

For v2.1: Phase 19 requires Phase 18 (needs the centralized split resolver as the dispute-adjustment source of truth). Phase 21 requires Phase 20 (no new gRPC service takes live traffic without health-gated rollout). Phase 22 requires Phase 20 (reuses the distributed-lock cron pattern for its new scheduled job). Phase 22 has no dependency on Phases 18/19/21 beyond that and can run as a parallel track once Phase 20 lands.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sprint 1 Foundation | - | Complete | 2026-05-11 |
| 2. Infrastructure Migration | 12/13 | In progress (02-06 human checkpoint pending) | - |
| 3. Transport Module | 7/8 | In Progress (03-08 human checkpoint pending) |  |
| 4. Delivery Module | 8/8 | In progress (04-08 human checkpoint deferred) | - |
| 5. AI Concierge + KYC | 6/7 | In progress (05-07 human checkpoint deferred) | - |
| 6. QA, Security & Performance | 5/6 | In Progress|  |
| 7. Deployment & Launch | 4/5 | In Progress|  |
| 8. Mobile Redesign | 10/11 | In Progress (08-09 EAS build queued, 08-10 human verification pending) | - |
| 9. Tour Packages & Tour Guides | 12/13 | In Progress (09-13 human checkpoint pending) | - |
| 10. Documentation Correction + gRPC Build Fix | 3/3 | Complete    | 2026-07-15 |
| 11. Resilience Wrapping | 11/11 | Complete   | 2026-07-16 |
| 12. Settlement Engine Foundation | 9/9 | Complete   | 2026-07-17 |
| 13. Settlement Cutover — Transport & Delivery | 4/4 | Complete    | 2026-07-18 |
| 14. Ministry Dashboard | 10/10 | Complete   | 2026-07-18 |
| 15. Multi-Channel OTP | 6/6 | Complete    | 2026-07-18 |
| 16. Connection Pooling Infrastructure | 4/4 | Complete    | 2026-07-18 |
| 17. gRPC Proof-of-Pattern Extraction (notifications-service) | 7/7 | Complete    | 2026-07-19 |
| 18. Settlement Split Centralization | 4/4 | Complete    | 2026-07-19 |
| 19. Settlement Dispute & Adjustment Workflow | 4/4 | Complete   | 2026-07-20 |
| 20. gRPC Blue-Green Healthcheck Retrofit | 0/TBD | Not started | - |
| 21. Low-Risk gRPC Extraction — News/Waitlist/Reviews + Scoped Delivery OTP | 0/TBD | Not started | - |
| 22. Scheduled Ministry Exports & LGA Heatmap | 0/TBD | Not started | - |
