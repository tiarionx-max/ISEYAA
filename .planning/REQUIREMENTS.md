# ISEYAA — Requirements

**Core Value:** A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

---

# Milestone v2.0 — Microservices, Multi-Channel Auth & Government Partnership

**Defined:** 2026-07-15

## v1 Requirements

Requirements for milestone v2.0. Each maps to roadmap phases (Phase 10+, continuing numbering from v1.0's Phase 9).

### Documentation Correction

- [x] **DOC-01**: ROADMAP.md and PROJECT.md accurately state the real gRPC starting state (scaffolded-but-broken-and-unconsumed in `backend/apps/`, not "8 services extracted complete")

### Resilience

- [x] **RESIL-01**: Every call to Paystack, Termii, Anthropic, Cloudflare R2/S3, and Firebase FCM is wrapped in a circuit-breaker + retry + timeout + fallback policy, so a single vendor outage degrades only the dependent feature, not the whole API
- [ ] **RESIL-02**: Vendor-call failures and circuit-breaker state transitions are visible in the existing Grafana/Sentry/OpenTelemetry observability stack — code-side wiring and sanitization verified; live Grafana/Sentry dashboard delivery still requires human confirmation (see v2.0-MILESTONE-AUDIT.md)

### gRPC Microservice Extraction

- [x] **GRPC-01**: All 8 existing `backend/apps/*-service` scaffolds build successfully (`nest build <service>` passes; no `2>/dev/null || true` error-masking remains in any Dockerfile)
- [x] **GRPC-02**: `.proto` contracts exist for the 7 currently-unstubbed modules (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews)
- [ ] **GRPC-03**: `notifications-service` runs as a genuinely separate deployable process, called via `ClientGrpc` from the monolith, with zero behavior change to REST responses for web/mobile clients
- [ ] **GRPC-04**: A documented caller-graph audit (every direct injection of the extracted service's class, grepped across the whole monolith) precedes and gates each module's extraction
- [ ] **GRPC-05**: Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, and all Tour Packages/Guides/Bookings modules remain in-process this milestone — explicitly not extracted, because their `SELECT FOR UPDATE` wallet transactions cannot safely span a gRPC network boundary without an outbox/saga redesign that is out of scope

### Connection Pooling

- [ ] **POOL-01**: Every Prisma client (monolith + `notifications-service`) connects through a pooled connection string (Neon `-pooler` suffix or PgBouncer) with an explicit, documented `connection_limit`
- [ ] **POOL-02**: A combined-topology load test confirms total open Postgres connections stay under Neon's ceiling with the monolith and `notifications-service` running concurrently

### Multi-Channel OTP

- [x] **OTP-01**: User can select WhatsApp, Email, or SMS as their OTP verification channel at registration, defaulting to SMS if unselected
- [x] **OTP-02**: OTP delivery automatically falls back to SMS if the selected channel fails to deliver within a bounded timeout, reusing the same code and expiry across the fallback attempt
- [x] **OTP-03**: OTP rate-limiting and lockout (3 attempts / 15-minute lock) is scoped per-identity (phone/user), not per-channel, so switching channels cannot bypass the existing brute-force protection
- [x] **OTP-04**: WhatsApp OTP messages use a Meta-approved Authentication-category template (verification code + expiry only, no marketing content)

### Ministry Dashboard

- [ ] **MIN-01**: A `MINISTRY_VIEWER` role exists, gated by `@Roles()` individually on every route it can reach — never via a controller shared with any mutation endpoint
- [ ] **MIN-02**: Ministry dashboard shows visitor entry counts, broken down by LGA and time period
- [x] **MIN-03**: Ministry dashboard shows a purpose-of-visit breakdown, sourced from a new data-capture point added to the booking/check-in flow
- [ ] **MIN-04**: Ministry dashboard shows revenue-to-government-share, sourced from the standing Ministry wallet's transaction ledger (depends on SETTLE-02)
- [x] **MIN-05**: Every Ministry dashboard report can be exported as CSV
- [ ] **MIN-06**: Every Ministry dashboard report can be exported as a formatted, presentable PDF (Forest Green/Tropical Gold branded)
- [ ] **MIN-07**: Ministry dashboard queries return aggregate data only — no row-level citizen PII (BVN, NIN, phone, name) is ever reachable by `MINISTRY_VIEWER`, enforced at the query layer

### Settlement Split

- [x] **SETTLE-01**: A shared `SettlementService` in `CommonModule` generalizes `TourSettlementService`'s proven pattern (single `$transaction`, `SELECT FOR UPDATE` per recipient wallet, idempotency keys, drift-tolerance assertion, append-only audit) for reuse across modules
- [x] **SETTLE-02**: A standing Ministry wallet is provisioned, reusing the existing `tour.government_wallet_user_id` `PlatformConfig` entity as the Ministry's recipient wallet
- [x] **SETTLE-03**: Transport's settlement is generalized to a three-way, `PlatformConfig`-driven split (driver/rider, Ministry, platform), replacing the hardcoded 85/15
- [x] **SETTLE-04**: Delivery's settlement is generalized to a three-way, `PlatformConfig`-driven split, replacing the hardcoded 80/20
- [x] **SETTLE-05**: Stays' `releaseEscrow()` cron is fixed to actually read and apply `Booking.govtLevyPct` instead of crediting the host 100% of the booking price (pre-existing revenue-leak bug)
- [x] **SETTLE-06**: Marketplace, Events, and Studio payment webhooks have working settlement consumers — currently no `@OnEvent` handler exists for `payment.order_payment`, `payment.ticket_purchase`, or `payment.studio_booking` anywhere in the codebase
- [x] **SETTLE-07**: Each settlement recipient (vendor/rider, Ministry, platform) can retrieve a per-recipient, itemized settlement statement
- [x] **SETTLE-08**: N-way split calculations sum exactly to the buyer's paid amount across a wide range of non-round amounts, verified by an automated test (no silent rounding/remainder drift)
- [x] **SETTLE-09**: Transport and Delivery's cutover to the generalized settlement engine is verified in shadow mode against their existing hardcoded-percentage output before going live, so no live driver/rider payout amount changes silently

## v2 Requirements (Deferred beyond v2.0)

### Deferred Scaling & Ops

- **GRPC-06**: Blue-green/canary deploys per extracted service
- **GRPC-07**: Extend live gRPC extraction to Delivery, then remaining modules, in priority order
- **GRPC-08**: Live extraction of news/waitlist/reviews as separate deployed services (proto contracts only for now, per GRPC-02)

### Deferred Ministry Features

- **MIN-08**: Scheduled/recurring export delivery (auto-email monthly Ministry PDF)
- **MIN-09**: Seasonal/LGA heatmap visualization

### Deferred Settlement Features

- **SETTLE-10**: Dispute/adjustment workflow (manual correction with reason + reviewer) for settled amounts — build on first real-world dispute, not speculatively
- **SETTLE-11**: Configurable per-module Ministry split tiers (different percentage for tourism vs. transport vs. delivery) — build if the Ministry explicitly requests differentiated rates

## Out of Scope (v2.0)

| Feature | Reason |
|---------|--------|
| Database-per-service split | Would invalidate the wallet `SELECT FOR UPDATE` invariant and force a Saga-pattern rewrite of core payment logic — a fundamentally larger, riskier project than what this milestone requires |
| Live BI/Power BI connector for Ministry | CSV/PDF export satisfies the stated "present this to government" need; a live connector implies a new auth surface and an ongoing schema-stability contract with an external party |
| Real-time/WebSocket push Ministry dashboard | Ministry stakeholders check monthly/quarterly numbers for presentations, not sub-second freshness — disproportionate effort for a low-frequency-access external role |
| Simultaneous multi-channel OTP send (all 3 channels at once) | 3x cost per OTP, confusing multi-code UX, complicates rate-limit/audit semantics — sequential fallback is the correct pattern |
| Per-login OTP channel re-selection | Adds friction to every login for a decision users make once; select at registration, allow changing from account settings instead |
| Real-time settlement push notifications to Ministry (per-transaction webhook) | Noise at government-partnership scale; periodic statements + on-demand dashboard access (MIN-04/05/06) is the correct granularity |
| Extracting Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, or Tour Packages/Guides/Bookings to gRPC this milestone | Each has wallet-adjacent transactional coupling; extracting any of them requires an outbox/saga pattern this milestone doesn't build (see GRPC-05) |
| Direct Meta WhatsApp Cloud API integration | Deferred pending the Termii WhatsApp Token API spike (OTP-01/02); revisit only if Termii's channel proves unavailable for this account |

## Traceability (v2.0)

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-01 | Phase 10 | Complete |
| RESIL-01 | Phase 11 | Complete |
| RESIL-02 | Phase 11 | Partial (live Grafana/Sentry dashboard confirmation pending — see v2.0-MILESTONE-AUDIT.md) |
| GRPC-01 | Phase 10 | Complete |
| GRPC-02 | Phase 10 | Complete |
| GRPC-03 | Phase 17 | Pending |
| GRPC-04 | Phase 17 | Pending |
| GRPC-05 | Phase 17 | Pending |
| POOL-01 | Phase 16 | Pending |
| POOL-02 | Phase 16 | Pending |
| OTP-01 | Phase 15 | Complete |
| OTP-02 | Phase 15 | Complete |
| OTP-03 | Phase 15 | Complete |
| OTP-04 | Phase 15 | Complete |
| MIN-01 | Phase 14 | Pending |
| MIN-02 | Phase 14 | Pending |
| MIN-03 | Phase 14 | Complete |
| MIN-04 | Phase 14 | Pending |
| MIN-05 | Phase 14 | Complete |
| MIN-06 | Phase 14 | Pending |
| MIN-07 | Phase 14 | Pending |
| SETTLE-01 | Phase 12 | Complete |
| SETTLE-02 | Phase 12 | Complete |
| SETTLE-03 | Phase 13 | Complete |
| SETTLE-04 | Phase 13 | Complete |
| SETTLE-05 | Phase 12 | Complete |
| SETTLE-06 | Phase 12 | Complete |
| SETTLE-07 | Phase 12 | Complete |
| SETTLE-08 | Phase 12 | Complete |
| SETTLE-09 | Phase 13 | Complete |

**Coverage:**
- v2.0 requirements: 30 total
- Mapped to phases: 30 (Phases 10-17)
- Unmapped: 0 ✓

---

# Shipped — Milestone v1.0 (Historical)

Sprint 1 shipped 2026-05-11. Sprints 2-9 (Phases 2-9) substantially shipped per `.planning/ROADMAP.md` — see `PROJECT.md`'s Validated section for the accurate, reconciled status (several phases still have unfiled human-verification checkpoints; treat as functionally complete but unconfirmed in production).

## Validated (Sprint 1 — Shipped)

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

## Sprint 2-7 Requirements (Phases 2-7 — substantially shipped, some checkpoints unfiled)

Full requirement text preserved from the v1.0 definition. See `ROADMAP.md` Phases 2-7 for current per-plan completion status; treat `[x]` here as "shipped per code, checkpoint verification not formally recorded" rather than "100% confirmed."

<details>
<summary>Infrastructure Migration (INFRA), Transport (TRANSPORT), Delivery (DELIVERY), AI Concierge (AI), KYC (KYC), Search (SEARCH), QA (QA), Launch (LAUNCH)</summary>

### Infrastructure Migration (INFRA)
- [x] **INFRA-01**: Developer can run `prisma migrate` against Neon serverless PostgreSQL 16 in both dev and production branches
- [x] **INFRA-02**: All Redis operations (cache, sessions, rate limiting, queues) run against Upstash Redis with zero idle cost
- [x] **INFRA-03**: All file uploads (images, QR codes, documents) write to Cloudflare R2 with zero egress fees; existing S3 SDK calls require no logic change
- [x] **INFRA-04**: All microservices deploy as Docker containers on Railway with auto-deploy from GitHub main branch
- [x] **INFRA-05**: All secrets (DB URLs, API keys, JWT keys) are stored in Infisical and injected at runtime; no .env files in repo
- [x] **INFRA-06**: Grafana Cloud receives OpenTelemetry traces, metrics, and logs from all services; Sentry captures all unhandled errors
- [ ] **INFRA-07**: NestJS monolith is decomposed into independent microservices — **CORRECTED 2026-07-15: scaffolded in `backend/apps/` but broken build + zero live consumers; superseded by GRPC-01/03 above**
- [ ] **INFRA-08**: Microservices communicate via gRPC — **CORRECTED 2026-07-15: same as INFRA-07, see GRPC requirements in v2.0 above**
- [x] **INFRA-09**: Upstash Kafka replaces EventEmitter2 as the event bus for cross-service payment events
- [x] **INFRA-10**: Typesense (self-hosted) indexes attractions, events, properties, and products

### Transport Module (TRANSPORT)
- [x] TRANSPORT-01 through TRANSPORT-07 — driver onboarding, ride request, matching, live GPS, surge pricing, earnings, dashboard
- [ ] **TRANSPORT-08**: Mobile Transport + Driver tabs — shipped per Phase 3/8, final human checkpoint (03-08) unfiled

### Delivery Module (DELIVERY)
- [x] DELIVERY-01 through DELIVERY-06 — parcel request, rider assignment, live tracking, OTP+photo confirmation, earnings split, mobile tabs (Phase 4 checkpoint 04-08 unfiled)

### AI Concierge Upgrade (AI)
- [x] AI-01 through AI-05 — streaming Claude concierge (not GPT-4o as originally drafted — built on Anthropic Claude per actual stack), tool calls, Upstash Vector recommendations, mobile AI Chat (Phase 5 checkpoint 05-07 unfiled)

### KYC Integrations (KYC)
- [x] KYC-01 through KYC-04 — BVN/NIN/liveness tiers, AES-256-GCM encryption, driver approval flow

### Search (SEARCH)
- [x] SEARCH-01 through SEARCH-03 — unified search, geo-ranking, sub-100ms performance

### Quality Assurance (QA)
- [x] QA-01 through QA-07 — load testing, WebSocket stress, RLS isolation, ZAP scan, query optimization, WebP images, mobile performance (Phase 6 checkpoint 06-06 unfiled)

### Deployment & Launch (LAUNCH)
- [x] LAUNCH-01, 04, 06, 07 shipped; LAUNCH-02 (WAF), LAUNCH-03 (real-money E2E), LAUNCH-05 (TestFlight), LAUNCH-08 (soft launch) — Phase 7 checkpoint 07-05 unfiled, production go-live still outstanding

</details>

### Phase 8-9 Requirements (Mobile Redesign, Tour Packages — not originally tracked in this file)

Phases 8 (MOB-RD-01 through MOB-RD-08) and 9 (TOUR-01 through TOUR-10) were defined and tracked directly in `ROADMAP.md` rather than this file — a prior documentation gap. See `ROADMAP.md` Phase 8/9 sections for their full requirement text and success criteria; both are substantially shipped (10/11 and 12/13 plans respectively) with final human-verification checkpoints (08-10, 09-13) unfiled.

## Out of Scope (v1.0, still valid)

- **Studio module** — experimental Sprint 1 addition; removed; not in PRD/TRD
- **Banking licence** — regulatory requirement not in Phase 1 scope
- **AWS infrastructure** (RDS, ElastiCache, S3, CloudFront, ALB, WAF, Secrets Manager) — replaced by free-first stack
- **MongoDB Atlas** — replaced by PostgreSQL JSONB on Neon
- **Pinecone** — replaced by Upstash Vector
- **Elasticsearch** — replaced by Typesense
- **Datadog** — replaced by Grafana Cloud + OpenTelemetry
- Tourist passes, choropleth heatmap, PDF/Excel export, Daily.co video, Flutterwave-active, Kafka DLQ, Yoruba i18n, referrals, driver insurance, international payments, flights/vehicles/health/sports/utilities/news — all still deferred/excluded per original v1.0 scope

---
*Requirements defined: 2025-05-12 (v1.0) · 2026-07-15 (v2.0)*
*Last updated: 2026-07-15 — v2.0 traceability populated (30/30 requirements mapped to Phases 10-17); ROADMAP.md and STATE.md written*
</content>
