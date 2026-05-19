# ISEYAA — v1 Requirements

Sprint 1 is validated and shipped. Requirements below cover Sprint 2 through Sprint 7 (infrastructure migration → transport → delivery → AI/KYC → QA → launch).

---

## Validated (Sprint 1 — Shipped)

These requirements are locked. They shipped and are confirmed working.

- ✓ Phone OTP auth with RS256 JWT (15-min access + 30-day refresh + Redis blacklist)
- ✓ Multi-role accounts with role switch without logout
- ✓ NDPA-compliant PII erase (right to erasure)
- ✓ In-app wallet with escrow, PIN, CBN KYC Tier1/Tier2 daily limits
- ✓ Paystack integration (topup + ticket purchase + escrow webhooks)
- ✓ 20 LGAs + 61 attractions seeded, tourism geo-filter (Haversine), bookmarks
- ✓ Events module — CRUD, ticket tiers, QR generation, offline check-in, analytics
- ✓ Stays module — property listings, calendar availability, escrow booking, reviews
- ✓ Marketplace module — vendor onboarding, products, cart/checkout, orders, emails
- ✓ Wallet module — fund, debit (SELECT FOR UPDATE), escrow, withdrawal, cursor pagination
- ✓ Admin module — live KPIs, revenue analytics, approval queue, user management
- ✓ Webhooks module — HMAC-SHA512 verified, EventEmitter2 routing
- ✓ AI module — itinerary SSE, chat, lga-intel (basic Claude API)
- ✓ Web frontend (Next.js 14 App Router) — Home, Events, Stays, Marketplace, Auth, Dashboard, Admin
- ✓ Mobile (Expo SDK 51) — Explore, Events, Stays, Profile, QR check-in, offline cache

---

## v1 Requirements — Sprint 2+

### Infrastructure Migration (INFRA)

- [ ] **INFRA-01**: Developer can run `prisma migrate` against Neon serverless PostgreSQL 16 in both dev and production branches
- [ ] **INFRA-02**: All Redis operations (cache, sessions, rate limiting, queues) run against Upstash Redis with zero idle cost
- [ ] **INFRA-03**: All file uploads (images, QR codes, documents) write to Cloudflare R2 with zero egress fees; existing S3 SDK calls require no logic change
- [ ] **INFRA-04**: All microservices deploy as Docker containers on Railway with auto-deploy from GitHub main branch
- [ ] **INFRA-05**: All secrets (DB URLs, API keys, JWT keys) are stored in Infisical and injected at runtime; no .env files in repo
- [ ] **INFRA-06**: Grafana Cloud receives OpenTelemetry traces, metrics, and logs from all services; Sentry captures all unhandled errors
- [ ] **INFRA-07**: NestJS monolith is decomposed into independent microservices (auth, wallet, transport, events, stays, marketplace, delivery, ai, admin) each with its own Dockerfile and Railway service
- [ ] **INFRA-08**: Microservices communicate with each other via gRPC (proto definitions in `packages/proto`); REST remains the external client API
- [ ] **INFRA-09**: Upstash Kafka replaces EventEmitter2 as the event bus for cross-service payment events (charge.success, escrow.released, order.delivered)
- [ ] **INFRA-10**: Typesense (self-hosted) indexes attractions, events, properties, and products; search endpoint returns results with typo tolerance and geo-ranking within 100ms

### Transport Module (TRANSPORT)

- [x] **TRANSPORT-01**: User (with DRIVER role) can create a driver profile, submit vehicle info and license, and await admin KYC approval before going online
- [x] **TRANSPORT-02**: User can request a ride by specifying pickup/dropoff coordinates, vehicle type (bike/tricycle/car/minibus), and receive a fare estimate before confirming
- [x] **TRANSPORT-03**: System matches the nearest online, available driver within 60 seconds using Upstash Redis GEORADIUS; user sees driver name, photo, rating, and ETA
- [x] **TRANSPORT-04**: Driver and rider can see each other's live GPS position updated every 2 seconds via WebSocket for the duration of the trip
- [x] **TRANSPORT-05**: Fare is calculated with surge pricing applied when demand > 1.5× supply in a given zone; surge multiplier is displayed before confirmation
- [x] **TRANSPORT-06**: On trip completion, driver earnings (fare × 0.85) are credited to driver wallet immediately; platform fee (15%) is retained
- [x] **TRANSPORT-07**: Driver can see earnings dashboard showing daily/weekly earnings, trip history, acceptance rate, and average rating
- [ ] **TRANSPORT-08**: Mobile app displays a Transport tab (ride request flow) and a Driver tab (go online, accept/reject rides, navigate, earnings)

### Delivery Module (DELIVERY)

- [x] **DELIVERY-01**: User can request a parcel delivery by providing pickup address, dropoff address, item description, and estimated weight
- [x] **DELIVERY-02**: System assigns the nearest available delivery rider within 60 seconds; sender sees rider name, photo, and ETA
- [x] **DELIVERY-03**: Sender can track rider's live GPS position via WebSocket from pickup through delivery
- [x] **DELIVERY-04**: Delivery is confirmed only when recipient provides OTP (sent via SMS at dispatch) and rider uploads proof-of-delivery photo
- [x] **DELIVERY-05**: Rider earnings (delivery fee × 0.80) are credited on delivery confirmation; platform fee (20%) is retained
- [x] **DELIVERY-06**: Mobile app displays a Delivery tab for parcel request and a Rider tab for delivery assignments

### AI Concierge Upgrade (AI)

- [ ] **AI-01**: User can send any query to the AI concierge and receive a streaming response (SSE) powered by GPT-4o with an Ogun State–specific system prompt
- [ ] **AI-02**: AI concierge has access to tool calls for: search attractions, check event availability, find nearby stays, request ride estimate, and get weather
- [ ] **AI-03**: Recommendation engine uses Upstash Vector to embed user preferences and surface personalized attraction, event, and stay suggestions
- [ ] **AI-04**: AI responds with first token within 2 seconds under normal load
- [ ] **AI-05**: Mobile app displays full-screen AI Chat at `/ai-chat` with message history persisted across sessions

### KYC Integrations (KYC)

- [ ] **KYC-01**: User can verify BVN via NIBSS API to unlock Tier 1 wallet limits (₦200K/day); BVN stored as AES-256-GCM ciphertext
- [ ] **KYC-02**: User can verify NIN via NIMC API to unlock Tier 2 wallet limits (₦1M/day); NIN stored as AES-256-GCM ciphertext
- [ ] **KYC-03**: User can complete Smile Identity liveness check to unlock Tier 3 wallet limits (₦5M/day)
- [ ] **KYC-04**: Driver KYC approval (by LGA_ADMIN) updates driver profile status to approved and allows driver to go online

### Search (SEARCH)

- [ ] **SEARCH-01**: User can search attractions, events, properties, and products from a unified search bar with typo tolerance
- [ ] **SEARCH-02**: Search results for attractions and properties support geo-ranking (closest first) based on user's current location
- [ ] **SEARCH-03**: Search returns results within 100ms for indexes up to 100,000 documents

### Quality Assurance (QA)

- [ ] **QA-01**: k6 load test passes with 10,000 concurrent users, P95 response time < 500ms, error rate < 0.1%
- [ ] **QA-02**: 500 concurrent WebSocket connections (transport GPS tracking) sustain for 10 minutes with zero drops
- [x] **QA-03**: RLS test suite confirms user A cannot read user B's wallet, bookings, orders, or personal data
- [x] **QA-04**: OWASP ZAP scan on staging returns zero critical findings on wallet, KYC, and auth endpoints
- [x] **QA-05**: All hot database queries have EXPLAIN ANALYZE output confirming no sequential scans; indexes added where missing
- [x] **QA-06**: All images served via Cloudflare R2 are WebP-optimized; largest-contentful-paint < 2.5s on 3G
- [ ] **QA-07**: App cold start time < 3s on a 3G connection; crash-free rate > 99.5%

### Deployment & Launch (LAUNCH)

- [ ] **LAUNCH-01**: All services are deployed to Railway production with Neon production branch and Upstash production tier
- [ ] **LAUNCH-02**: Cloudflare WAF and DDoS protection active on *.iseyaa.ng with SSL/TLS termination
- [ ] **LAUNCH-03**: Paystack LIVE keys configured; real-money end-to-end test (₦100 topup → ticket purchase → escrow → refund) passes
- [ ] **LAUNCH-04**: iOS build submitted to App Store (< 40MB); Android APK submitted to Play Store (< 30MB)
- [ ] **LAUNCH-05**: TestFlight invite sent to 50+ testers; crash-free rate > 99.5% confirmed before App Store review submission
- [ ] **LAUNCH-06**: Grafana Cloud dashboards show live KPIs; Sentry alerts configured for error rate spikes
- [ ] **LAUNCH-07**: Rollback procedure tested and confirmed < 5 minutes to previous Railway deployment
- [ ] **LAUNCH-08**: 48-hour invite-only soft launch in Abeokuta with error rate < 0.5%; public launch trigger met

---

## v2 Requirements (Deferred — Post Phase 1)

These are explicitly deferred. Not in Sprint 2–7 scope.

- Tourist passes (bundles across multiple attractions) — complex pricing, Phase 2
- Choropleth LGA revenue heatmap in admin (D3.js) — Phase 2 analytics upgrade
- PDF + Excel export from admin — Phase 2
- Daily.co video calls — telemedicine/tours Phase 2
- Flutterwave as active payment fallback — Phase 2 (Paystack covers Phase 1)
- Upstash Kafka dead-letter queue handling — Phase 2 stability
- Multi-language support (Yoruba) — Phase 2
- Referral programme — Phase 2 growth
- Driver insurance integration — requires separate licence
- International payments — beyond Paystack/Flutterwave remit
- Flight booking, vehicle ownership, health/HMO, sports, utilities, news — explicit PRD exclusions

---

## Out of Scope

- **Studio module** — experimental Sprint 1 addition; removed; not in PRD/TRD
- **Banking licence** — regulatory requirement not in Phase 1 scope
- **AWS infrastructure** (RDS, ElastiCache, S3, CloudFront, ALB, WAF, Secrets Manager) — replaced by free-first stack
- **MongoDB Atlas** — replaced by PostgreSQL JSONB on Neon
- **Pinecone** — replaced by Upstash Vector
- **Elasticsearch** — replaced by Typesense
- **Datadog** — replaced by Grafana Cloud + OpenTelemetry

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 2 | Not started |
| INFRA-02 | Phase 2 | Not started |
| INFRA-03 | Phase 2 | Not started |
| INFRA-04 | Phase 2 | Not started |
| INFRA-05 | Phase 2 | Not started |
| INFRA-06 | Phase 2 | Not started |
| INFRA-07 | Phase 2 | Not started |
| INFRA-08 | Phase 2 | Not started |
| INFRA-09 | Phase 2 | Not started |
| INFRA-10 | Phase 2 | Not started |
| SEARCH-01 | Phase 2 | Not started |
| SEARCH-02 | Phase 2 | Not started |
| SEARCH-03 | Phase 2 | Not started |
| TRANSPORT-01 | Phase 3 | Not started |
| TRANSPORT-02 | Phase 3 | Not started |
| TRANSPORT-03 | Phase 3 | Not started |
| TRANSPORT-04 | Phase 3 | Not started |
| TRANSPORT-05 | Phase 3 | Not started |
| TRANSPORT-06 | Phase 3 | Not started |
| TRANSPORT-07 | Phase 3 | Not started |
| TRANSPORT-08 | Phase 3 | Not started |
| DELIVERY-01 | Phase 4 | Not started |
| DELIVERY-02 | Phase 4 | Not started |
| DELIVERY-03 | Phase 4 | Not started |
| DELIVERY-04 | Phase 4 | Not started |
| DELIVERY-05 | Phase 4 | Not started |
| DELIVERY-06 | Phase 4 | Not started |
| AI-01 | Phase 5 | Not started |
| AI-02 | Phase 5 | Not started |
| AI-03 | Phase 5 | Not started |
| AI-04 | Phase 5 | Not started |
| AI-05 | Phase 5 | Not started |
| KYC-01 | Phase 5 | Not started |
| KYC-02 | Phase 5 | Not started |
| KYC-03 | Phase 5 | Not started |
| KYC-04 | Phase 5 | Not started |
| QA-01 | Phase 6 | Not started |
| QA-02 | Phase 6 | Not started |
| QA-03 | Phase 6 | Not started |
| QA-04 | Phase 6 | Not started |
| QA-05 | Phase 6 | Not started |
| QA-06 | Phase 6 | Not started |
| QA-07 | Phase 6 | Not started |
| LAUNCH-01 | Phase 7 | Not started |
| LAUNCH-02 | Phase 7 | Not started |
| LAUNCH-03 | Phase 7 | Not started |
| LAUNCH-04 | Phase 7 | Not started |
| LAUNCH-05 | Phase 7 | Not started |
| LAUNCH-06 | Phase 7 | Not started |
| LAUNCH-07 | Phase 7 | Not started |
| LAUNCH-08 | Phase 7 | Not started |

*Traceability is updated by the roadmapper agent and after each phase transition.*
