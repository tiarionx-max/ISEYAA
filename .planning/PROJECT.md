# ISEYAA Super Platform

## What This Is

ISEYAA is Ogun State Government's unified digital super-platform for ~7 million citizens, tourists, and vendors across Nigeria. It consolidates transport, tourism, events, accommodation, commerce, delivery, tour packages, and government services into a single app — iOS + Android (React Native) + Web Admin (Next.js) — powered by an in-app wallet and real-time government analytics dashboard.

Operated by LJ Entertainment under contract with Ogun State. Confidential government project.

## Core Value

A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

## Current Milestone: v2.0 Microservices, Multi-Channel Auth & Government Partnership

**Goal:** Convert the monolith into real independently-deployable gRPC services, let users pick WhatsApp/Email/SMS for verification, add a read-only Ministry dashboard with export, and generalize the settlement engine to a three-way vendor/Ministry/platform split.

**Target features:**

- Real gRPC extraction for all backend modules (including transport, delivery, tour-packages, tour-guides, news, waitlist, reviews — never extracted or even proto-stubbed) with resilience patterns (circuit breaker/retry/fallback) around every external vendor call (Paystack, Termii, Anthropic, S3/R2, Firebase FCM)
- Channel-choice OTP: WhatsApp Business API (net new) + existing SendGrid email + existing Termii SMS, selectable at registration
- `MINISTRY_VIEWER` read-only role + dedicated dashboard: visitor entry counts, purpose-of-visit tracking (net new), CSV/PDF export
- Three-way `PlatformConfig`-driven settlement split (vendor/rider wallet, standing Ministry wallet, platform cut) generalized from Phase 9's Tour Packages multi-vendor settlement engine, replacing today's hardcoded two-way splits (Transport 85/15, Delivery 80/20, etc.)

**Key context:** Surfaced from a stakeholder call. `ROADMAP.md` Phase 2 currently marks gRPC extraction `[x]` complete for 8 services with `.proto` contracts committed under `packages/proto/`, but a code audit confirmed zero `@GrpcMethod`/`ClientGrpc` usage anywhere and a single `NestFactory.create()` in `main.ts` — the platform is actually a single-process monolith today. That claim needs correcting as part of this milestone, not just new work bolted on top.

## Requirements

### Validated

Sprint 1 — Shipped and tested (153 unit tests, 11 suites, all passing as of 2026-05-11):

- ✓ Phone OTP auth with JWT (15-min access + 30-day refresh), Redis blacklist — Sprint 1
- ✓ Email + password login (bcrypt, 12 salt rounds) alongside phone OTP — Sprint 1 (confirmed in code; not reflected in original Sprint 1 notes)
- ✓ Multi-role accounts (TOURIST, HOST, VENDOR, ORGANISER, DRIVER, LGA_ADMIN, SUPER_ADMIN) with role switch without logout — Sprint 1
- ✓ NDPA-compliant user data erase — Sprint 1
- ✓ In-app wallet with CBN KYC tiers, PIN, escrow balance — Sprint 1
- ✓ 20 Ogun State LGAs + 61 attractions seeded, tourism module with Haversine geo-filter, bookmarks, nearby events/stays — Sprint 1
- ✓ Events module — organiser CRUD, Paystack ticket purchase, QR generation → S3 → SendGrid, offline QR check-in, analytics — Sprint 1
- ✓ Stays module — host property listings, SELECT FOR UPDATE booking, escrow @Cron, reviews — Sprint 1
- ✓ Marketplace module — vendor onboarding, products, cart/checkout, orders, platform fee from DB config — Sprint 1
- ✓ Wallet module — Paystack topup, credit/debit ledger, escrow lock/release, withdrawal — Sprint 1
- ✓ Admin module — live KPIs, revenue by LGA+category+month, user/vendor/property CRUD — Sprint 1
- ✓ Webhooks module — HMAC-SHA512 verification (Paystack), EventEmitter2 payment routing — Sprint 1
- ✓ Web frontend (Next.js 14) + Mobile (Expo SDK 51) — Sprint 1

Phases 2-9 — Substantially shipped (per ROADMAP.md; several phases have plans complete but their human-verification checkpoint was never formally recorded — treat those as functionally done but unconfirmed in production until checkpoints are filed):

- ✓ Free-first infra migration — Neon PostgreSQL, Upstash Redis, Cloudflare R2, Railway deploy, Typesense search, OpenTelemetry/Grafana/Sentry — Phase 2 (12/13 plans; Railway deploy confirmed live)
- ⚠ gRPC "microservice extraction" — `.proto` contracts exist for 8 services but were never wired into `@GrpcMethod`/`ClientGrpc` handlers; runtime is a single monolith — Phase 2 (claim corrected 2026-07, see v2.0 above)
- ✓ Transport module — driver KYC/approval, fare + surge, Redis-geo matching, live WebSocket GPS, 85/15 driver/platform wallet split — Phase 3 (7/8 plans)
- ✓ Delivery module — nearest-rider matching, live WebSocket tracking, OTP + photo proof, 80/20 rider/platform split — Phase 4 (8/8 plans)
- ✓ AI Concierge + KYC — Claude streaming SSE + tool calls, Upstash Vector recommendations, NIBSS BVN / NIMC NIN / Smile Identity liveness tiers, AES-256-GCM encryption — Phase 5 (6/7 plans)
- ✓ QA/Security/Performance hardening — bug fixes, FK indexes, WebP pipeline, cross-user isolation tests, k6/Artillery load scripts — Phase 6 (5/6 plans)
- ✓ Deployment prep — EAS build config, CORS/Swagger hardening, monitoring runbooks, app-store submission prep — Phase 7 (4/5 plans; production go-live + real-money E2E + soft launch still outstanding)
- ✓ Mobile Redesign — 5-tab nav, Airbnb-style stays, Temu-style marketplace, host onboarding, news ticker — Phase 8 (10/11 plans)
- ✓ Tour Packages & Tour Guides — TOUR_GUIDE role, curated multi-vendor packages, atomic multi-vendor settlement engine, group/split-bill bookings, ratings, web + mobile surfaces — Phase 9 (12/13 plans). **Caveat:** a subquery-in-CHECK-constraint bug silently rolled back the Phase 9 migration in every environment where it ran until fixed 2026-07-13 (commit `fe75adc`) — confirm this reached production before trusting live Phase 9 data.

v2.0 — Microservices, Multi-Channel Auth & Government Partnership (current milestone):

- ✓ Documentation Correction + gRPC Build Fix — corrected the false "8 services extracted" ROADMAP claim (DOC-01); made all 8 `apps/*-service` gRPC scaffolds build cleanly (`nest build` exit 0, Dockerfile error-masking removed); authored `.proto` contracts for the 7 never-stubbed modules so `generate.sh` produces working TypeScript for all 15 modules (GRPC-01, GRPC-02) — Phase 10 (3/3 plans). **Follow-up:** `docker build` still fails (`@iseyaa/proto` undeclared in `backend/package.json`) — address before Phase 17 live extraction (see STATE.md pending todos).
- ✓ Resilience Wrapping — circuit-breaker + retry + timeout + fallback (cockatiel) around every external vendor call (Paystack, Termii, Anthropic, R2/S3, FCM) (RESIL-01) — Phase 11. RESIL-02 (Grafana/Sentry visibility) partial: code-side wiring/sanitization verified, live dashboard confirmation still pending — see `v2.0-MILESTONE-AUDIT.md`.
- ✓ Settlement Engine Foundation — generalized `SettlementService` in `CommonModule` (single `$transaction`, `SELECT FOR UPDATE`, idempotency keys, drift-tolerance assertion) + standing Ministry wallet (SETTLE-01, SETTLE-02); fixed two pre-existing revenue bugs — Stays' `releaseEscrow()` govtLevyPct leak and missing Marketplace/Events/Studio webhook settlement consumers (SETTLE-05, SETTLE-06); per-recipient itemized statements + N-way split rounding tests (SETTLE-07, SETTLE-08) — Phase 12 (completed 2026-07-17).
- ✓ Settlement Cutover — Transport & Delivery — `completeTrip()`/`completeDelivery()` cutover-flag-gated onto `SettlementService.settle()` for a three-way driver-or-rider/Ministry/platform split, replacing the hardcoded 85/15 and 80/20 (SETTLE-03, SETTLE-04); legacy paths preserved byte-for-byte; Stage 1 batch shadow-verify script + Stage 2 live dual-run comparison prove zero discrepancy before either cutover flag flips live (SETTLE-09) — Phase 13 (4/4 plans, completed 2026-07-17). Both `*.settlement_engine_enabled` flags seeded `false` — live cutover awaits the manual D-08 bake-period gate (3 days or 100 completions, zero discrepancies), not code-enforced by this phase.
- ✓ Multi-Channel OTP — WhatsApp (direct Meta Graph API)/Email (SendGrid)/SMS (Termii) selectable at registration, returning-user channel preference persisted and honored, bounded-timeout automatic SMS fallback on delivery failure using the same code/expiry, per-identity lockout proven unbypassable by channel switching, post-registration settings screen to change channel (OTP-01, OTP-02, OTP-03, OTP-04) — Phase 15 (6/6 plans, completed 2026-07-18). Verified: 13/13 must-haves, 604 backend + 6 mobile tests passing. **Human verification pending:** live Meta WhatsApp template delivery (blocked on stakeholder template approval, not code) and on-device visual/UX check of the three new mobile screens — see `15-HUMAN-UAT.md`.

### Active

v2.0 — Microservices, Multi-Channel Auth & Government Partnership: Phases 16-17 remain (Connection Pooling, gRPC Proof-of-Pattern).

### Out of Scope

- Studio module (government media recording studio) — removed, was experimental Sprint 1 addition
- Banking licence / insurance / international payments — not permitted at MVP
- Flight booking, vehicle ownership — not in Ogun State scope (Amadeus/Duffel/Travelport flights integration tracked as a future phase candidate per Phase 9 notes)
- Health/HMO, sports, utilities — Phase 1 exclusions
- MongoDB Atlas — replaced by PostgreSQL JSONB on Neon
- AWS RDS, ElastiCache, S3, CloudFront, ALB, WAF, Secrets Manager — replaced by free-first stack
- Pinecone vector DB — replaced by Upstash Vector
- Elasticsearch — replaced by Typesense (open source)
- Datadog — replaced by Grafana Cloud

## Context

- **Government client**: Ogun State Government, Nigeria — ~7M citizen addressable market
- **Operated by**: LJ Entertainment
- **Current state (2026-07-18)**: Phases 1-15 substantially built (see Validated above). Working on branch `microservices-redesign`. Backend confirmed live on Railway as a single monolith service (not the microservices split the roadmap claims). Web and mobile now have smoke-test coverage (added 2026-07-13); prior to that both had zero tests. Settlement engine generalized and Transport/Delivery cut over behind config flags (both still seeded `false` pending the manual D-08 bake-period gate). Multi-channel OTP shipped in Phase 15; live WhatsApp delivery awaits Meta template approval (stakeholder/ops action, tracked in `MANUAL-ACTIONS.md`).
- **Stack**: Node.js 20 LTS + NestJS + TypeScript, Next.js 14 App Router, Expo SDK 51, Neon PostgreSQL 16 + Prisma ORM, Upstash Redis, Paystack + Flutterwave webhooks, Cloudflare R2 + SendGrid, Anthropic Claude API
- **Architecture reality vs. plan**: `packages/proto/*.proto` contracts exist for auth/wallet/events/marketplace/notifications/stays/admin/ai but are unwired; transport/delivery/tour-packages/tour-guides/news/waitlist/reviews have no proto stubs at all. v2.0 commits to actually building the split.
- **Revenue model (current)**: Two-way platform fees from `PlatformConfig` — Transport 15%, Accommodation 8%, Events 10%, Marketplace 8%, Delivery 20%. v2.0 generalizes this to three-way (vendor/rider, Ministry, platform) using the pattern already proven in Phase 9's tour settlement engine.
- **KYC tiers**: Tier 0 phone-only → Tier 1 BVN → Tier 2 BVN+NIN → Tier 3 liveness, each raising wallet daily limits
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
| Real gRPC microservice split (v2.0) | Stakeholder explicitly re-confirmed this requirement after learning Phase 2's extraction was proto-only; wants true blast-radius isolation from vendor API outages | — Pending |
| Resilience-over-rewrite recommended, stakeholder chose full split anyway | Architect's initial recommendation was circuit-breakers on external calls as a cheaper path to the same isolation goal; stakeholder opted for the real split instead | — Decided; proceeding with full split |
| Three-way settlement split reusing Phase 9's multi-vendor engine | Avoids building new payment plumbing; Tour Packages already proved atomic multi-recipient wallet credit in one SELECT FOR UPDATE transaction | ✓ Good — Phase 12 built `SettlementService`; Phase 13 cut Transport/Delivery over behind flags, shadow-verified with zero discrepancy |
| Channel-choice OTP (WhatsApp/Email/SMS) | Client wants users to pick their preferred verification channel rather than SMS-only | ✓ Good — Phase 15 shipped selection + persisted preference + SMS fallback + unbypassable lockout; live WhatsApp delivery pending Meta template approval |
| SELECT FOR UPDATE on wallet debits | Prevent double-spend race conditions under concurrent load | ✓ Good — battle-tested since Sprint 1 |
| Platform fees from DB platformConfig | Never hardcoded — fee changes don't require code deployments | ✓ Good |
| Typesense over Elasticsearch | Open source, 10x simpler to operate, typo-tolerant, built-in geo-search, no JVM | ✓ Good |
| Cloudflare R2 over AWS S3 | Zero egress fees, S3-compatible API, free CDN — same SDK, no code change | ✓ Good |

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
*Last updated: 2026-07-18 — Phase 15 complete (multi-channel OTP); OTP-01, OTP-02, OTP-03, OTP-04 validated*
