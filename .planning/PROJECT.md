# ISEYAA Super Platform

## What This Is

ISEYAA is Ogun State Government's unified digital super-platform for ~7 million citizens, tourists, and vendors across Nigeria. It consolidates transport, tourism, events, accommodation, commerce, delivery, and government services into a single app — iOS + Android (React Native) + Web Admin (Next.js) — powered by an in-app wallet and real-time government analytics dashboard.

Operated by LJ Entertainment under contract with Ogun State. Confidential government project.

## Core Value

A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

## Requirements

### Validated

Sprint 1 — Shipped and tested (153 unit tests, 11 suites, all passing as of 2026-05-11):

- ✓ Phone OTP auth with JWT (RS256, 15-min access + 30-day refresh), Redis blacklist — Sprint 1
- ✓ Multi-role accounts (TOURIST, HOST, VENDOR, ORGANISER, DRIVER, LGA_ADMIN, SUPER_ADMIN) with role switch without logout — Sprint 1
- ✓ NDPA-compliant user data erase — Sprint 1
- ✓ In-app wallet with CBN KYC Tier1 (phone=₦50K/day) and Tier2 (BVN+NIN=₦500K/day), PIN, escrow balance — Sprint 1
- ✓ 20 Ogun State LGAs + 61 attractions seeded, tourism module with Haversine geo-filter, bookmarks, nearby events/stays — Sprint 1
- ✓ Events module — organiser CRUD, Paystack ticket purchase, QR generation → S3 → SendGrid, offline QR check-in (VALID/ALREADY_USED/NOT_FOUND), analytics — Sprint 1
- ✓ Stays module — host property listings, SELECT FOR UPDATE booking, escrow @Cron EVERY_HOUR, reviews (24h after checkout) — Sprint 1
- ✓ Marketplace module — vendor onboarding (PENDING → ACTIVE), products, cart/checkout, orders with platform fee split from DB config (never hardcoded), lifecycle emails — Sprint 1
- ✓ Wallet module — Paystack topup, creditWallet, escrow lock/release, cursor pagination, withdrawal — Sprint 1
- ✓ Admin module — live KPIs (DAU, total_users, revenue, active_events, pending_approvals, wallet_GTV), revenue by LGA+category+month, user/vendor/property CRUD — Sprint 1
- ✓ Webhooks module — HMAC-SHA512 verification, EventEmitter2 payment routing by metadata.type — Sprint 1
- ✓ AI module — itinerary SSE, chat, lga-intel (basic Claude integration) — Sprint 1
- ✓ Web frontend (Next.js 14 App Router) — Home, Events, Stays, Marketplace, Login (NextAuth), Dashboard (wallet/tickets/bookings/orders), Admin panel — Sprint 1
- ✓ Mobile (Expo SDK 51) — Explore, Events, Stays, Profile tabs; QR check-in (expo-camera), offline cache (AsyncStorage, 1hr TTL) — Sprint 1

### Active

Sprint 2 — Infrastructure Migration (current sprint):

- [ ] Migrate PostgreSQL to Neon (serverless PostgreSQL 16) — replaces local PostgreSQL
- [ ] Migrate Redis to Upstash Redis (serverless, pay-per-request) — replaces managed Redis
- [ ] Migrate file storage to Cloudflare R2 (zero egress fees) — replaces AWS S3
- [ ] Deploy all services on Railway (container platform, auto-deploy from GitHub)
- [ ] Migrate secrets management to Infisical (open source)
- [ ] Set up Grafana Cloud + OpenTelemetry monitoring (free tier)
- [ ] Decompose NestJS monolith into microservices with gRPC inter-service communication
- [ ] Integrate Typesense (self-hosted, open source) for full-text + geo search
- [ ] CI/CD pipeline via GitHub Actions → Railway auto-deploy
- [ ] Set up Upstash Kafka as event bus (replaces EventEmitter2 for cross-service events)

Sprint 3 — Transport Module:

- [ ] Ride request flow (bike, tricycle, car, minibus) with fare estimation
- [ ] Driver profile creation, KYC approval workflow, vehicle registration
- [ ] Driver matching algorithm via Upstash Redis GEORADIUS (< 60s match SLA)
- [ ] WebSocket real-time GPS tracking (rider sees driver position live)
- [ ] Surge pricing engine (demand × supply multiplier)
- [ ] Driver earnings dashboard + wallet credit on trip complete
- [ ] Driver status management (offline/online/on_trip)
- [ ] Mobile: Transport tab (ride request + live tracking), Driver dashboard tab

Sprint 4 — Delivery Module:

- [ ] Parcel delivery request with pickup/dropoff coordinates
- [ ] Nearest available rider assignment
- [ ] WebSocket live tracking for sender
- [ ] OTP + photo proof of delivery
- [ ] Delivery fee split (rider 80% + platform 20%)
- [ ] Mobile: Delivery request + tracking screens

Sprint 5 — AI Concierge + Real KYC:

- [ ] Full AI concierge (GPT-4o streaming SSE with Ogun State system prompt + tool calls)
- [ ] Upstash Vector embeddings for recommendation engine
- [ ] NIBSS BVN verification (real API integration, Tier 1 unlock)
- [ ] NIMC NIN verification (real API integration, Tier 2 unlock)
- [ ] Smile Identity liveness check (Tier 3 unlock)
- [ ] KYC tier upgrade → automatic wallet limit elevation
- [ ] Mobile: AI Chat full-screen (/ai-chat)

Sprint 6 — QA, Security & Performance:

- [ ] k6 load test: 10,000 users, P95 < 500ms, error rate < 0.1%, 500 concurrent WebSockets
- [ ] OWASP ZAP security audit on staging
- [ ] RLS cross-user data leak tests (user A cannot read user B's rows)
- [ ] Pen test: wallet, KYC, escrow flows
- [ ] EXPLAIN ANALYZE on all hot queries — eliminate seq scans
- [ ] Cloudflare R2 WebP image optimization for all media
- [ ] Cold start < 3s on 3G verified
- [ ] All critical paths: error rate < 0.5%, crash-free > 99.5%

Sprint 7 — Deployment & Launch:

- [ ] Railway production deploy (Neon production branch, Upstash production)
- [ ] Cloudflare WAF + DDoS active on *.iseyaa.ng
- [ ] Paystack LIVE keys — real money E2E test confirmed
- [ ] iOS App Store submission (< 40MB) + Android Play Store (< 30MB)
- [ ] TestFlight: 50+ testers
- [ ] Grafana Cloud dashboards + Sentry alerts live
- [ ] Rollback procedure tested (< 5 min)
- [ ] 48h invite-only soft launch in Abeokuta → public launch

### Out of Scope

- Studio module (government media recording studio) — removed, was experimental Sprint 1 addition
- Banking licence / insurance / international payments — not permitted at MVP
- Flight booking, vehicle ownership — not in Ogun State scope
- Health/HMO, sports, utilities, news — Phase 1 exclusions
- MongoDB Atlas — replaced by PostgreSQL JSONB on Neon
- AWS RDS, ElastiCache, S3, CloudFront, ALB, WAF, Secrets Manager — replaced by free-first stack
- Pinecone vector DB — replaced by Upstash Vector
- Elasticsearch — replaced by Typesense (open source)
- Datadog — replaced by Grafana Cloud

## Context

- **Government client**: Ogun State Government, Nigeria — ~7M citizen addressable market
- **Operated by**: LJ Entertainment
- **Current state**: Sprint 1 complete. NestJS modular monolith at `C:\Projects\ISEYAA\`. 153 unit tests passing. All core commercial modules built. No transport, no delivery, no real KYC integrations yet.
- **Stack already built on**: Node.js 20 LTS + NestJS + TypeScript, Next.js 14 App Router, Expo SDK 51, PostgreSQL 16 + Prisma ORM, Redis, Paystack + Flutterwave webhooks, AWS S3 + SendGrid, Anthropic Claude API (claude-sonnet-4-20250514)
- **Stack migration target**: Neon (PostgreSQL) + Upstash (Redis + Vector + Kafka) + Cloudflare R2 + Railway + Infisical + Grafana Cloud + Typesense
- **Architecture migration**: NestJS modular monolith → microservices with gRPC (Sprint 2)
- **Revenue model**: Platform fees — Transport 15%, Accommodation 8%, Events 10%, Marketplace 8%, Delivery 20%
- **KYC tiers**: Tier 0 phone-only (₦20K/day) → Tier 1 BVN (₦200K/day) → Tier 2 BVN+NIN (₦1M/day) → Tier 3 liveness (₦5M/day)
- **Design language**: Forest Green #1A6B3C, Tropical Gold #C8962A, Deep Jungle #1C2B2B. Playfair Display + Syne + DM Mono. Premium tropical dark aesthetic.

## Constraints

- **Tech stack**: Node.js 20 LTS + NestJS + TypeScript strict across all services — no runtime changes
- **Mobile**: React Native + Expo SDK 51 — must support iOS + Android simultaneously
- **Payments**: Paystack primary, Flutterwave fallback — CBN-compliant flows only
- **Data residency**: Nigerian citizen PII (BVN, NIN) must be encrypted AES-256-GCM at rest; bcrypt hash for lookup
- **Wallet security**: SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations
- **Platform fee source**: Always from DB (`platformConfig` table), never hardcoded
- **Performance**: P95 < 500ms under 10,000 concurrent users; driver match < 60s; WebSocket GPS < 1s latency
- **App size**: iOS < 40MB, Android < 30MB for App Store submission
- **Compliance**: NDPA (Nigerian Data Protection Act) — right to erasure implemented
- **Cost target**: ~$11/mo MVP infrastructure (free-first stack) vs $600/mo original AWS stack

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| NestJS modular monolith (Sprint 1) | Fastest path to working modules for Sprint 1 delivery | ✓ Good — 153 tests passing, all modules shipped |
| Migrate to microservices with gRPC (Sprint 2) | TRD requirement; enables independent scaling of Transport/WebSocket service | — Pending |
| EventEmitter2 → Upstash Kafka (Sprint 2) | Cross-service events need durable message bus after decomposition | — Pending |
| PostgreSQL JSONB replaces MongoDB | Eliminates separate service; Neon JSONB is production-grade for document storage | — Pending |
| Studio module removed | Not in PRD/TRD; experimental addition; scope discipline for Phase 1 | — Pending |
| Typesense over Elasticsearch | Open source, 10x simpler to operate, typo-tolerant, built-in geo-search, no JVM | — Pending |
| Cloudflare R2 over AWS S3 | Zero egress fees, S3-compatible API, free CDN — same SDK, no code change | — Pending |
| Free-first stack (98% cost reduction) | ₦16,500/mo vs ₦900,000/mo — same capability at MVP scale | — Pending |
| SELECT FOR UPDATE on wallet debits | Prevent double-spend race conditions under concurrent load | ✓ Good — battle-tested in Sprint 1 |
| Platform fees from DB platformConfig | Never hardcoded — fee changes don't require code deployments | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-12 after initialization*
