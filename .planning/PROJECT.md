# ISEYAA Super Platform

## What This Is

ISEYAA is Ogun State Government's unified digital super-platform for ~7 million citizens, tourists, and vendors across Nigeria. It consolidates transport, tourism, events, accommodation, commerce, delivery, tour packages, and government services into a single app — iOS + Android (React Native) + Web Admin (Next.js) — powered by an in-app wallet and real-time government analytics dashboard.

Operated by LJ Entertainment under contract with Ogun State. Confidential government project.

## Core Value

A tourist in Abeokuta can discover an attraction, book a guesthouse, buy an event ticket, and request a ride — all paid through one wallet — and the government analyst sees the revenue in real time.

## Shipped: v2.0 Microservices, Multi-Channel Auth & Government Partnership (2026-07-19)

**Goal:** Convert the monolith into real independently-deployable gRPC services, let users pick WhatsApp/Email/SMS for verification, add a read-only Ministry dashboard with export, and generalize the settlement engine to a three-way vendor/Ministry/platform split.

**Delivered:**

- Live gRPC extraction proof-of-pattern (`notifications-service`, called via `ClientGrpc`, zero REST behavior change) with resilience patterns (circuit breaker/retry/fallback) around every external vendor call (Paystack, Termii, Anthropic, S3/R2, Firebase FCM); remaining modules stay in-process this milestone by design (GRPC-05)
- Channel-choice OTP: WhatsApp (direct Meta Graph API) + existing SendGrid email + existing Termii SMS, selectable at registration, with bounded-timeout SMS fallback
- `MINISTRY_VIEWER` read-only role + dedicated dashboard: visitor entry counts by LGA/time, purpose-of-visit breakdown, revenue-to-government-share, CSV/PDF export, zero PII leakage
- Three-way `PlatformConfig`-driven settlement split (vendor/rider wallet, standing Ministry wallet, platform cut) generalized from Phase 9's Tour Packages multi-vendor settlement engine, replacing the hardcoded two-way splits (Transport 85/15, Delivery 80/20); Transport/Delivery cutover shadow-verified with zero discrepancy

**Key context:** Surfaced from a stakeholder call. `ROADMAP.md` Phase 2 previously marked gRPC extraction `[x]` complete for 8 services, but a code audit confirmed zero `@GrpcMethod`/`ClientGrpc` usage anywhere — the platform was actually a single-process monolith. Phase 10 corrected that documentation claim before any new work was bolted on top.

## Current Milestone: v2.1 Extraction Backlog Clearance & Settlement Flexibility

**Goal:** Extend v2.0's proven patterns — more services onto real gRPC, safer deploys for them, automated Ministry exports, and settlement disputes/flexible splits.

**Target features:**
- Live gRPC extraction: Delivery + remaining core modules (GRPC-07)
- Live gRPC extraction: news/waitlist/reviews (GRPC-08)
- Blue-green/canary deploys per extracted gRPC service (GRPC-06)
- Scheduled/recurring Ministry export delivery (MIN-08)
- Seasonal/LGA heatmap visualization on Ministry dashboard (MIN-09)
- Settlement dispute/adjustment workflow (SETTLE-10)
- Configurable per-module Ministry split tiers (SETTLE-11)

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

v2.0 — Microservices, Multi-Channel Auth & Government Partnership (shipped 2026-07-19):

- ✓ Documentation Correction + gRPC Build Fix — corrected the false "8 services extracted" ROADMAP claim (DOC-01); made all 8 `apps/*-service` gRPC scaffolds build cleanly (`nest build` exit 0, Dockerfile error-masking removed); authored `.proto` contracts for the 7 never-stubbed modules so `generate.sh` produces working TypeScript for all 15 modules (GRPC-01, GRPC-02) — Phase 10 (3/3 plans)
- ✓ Resilience Wrapping — circuit-breaker + retry + timeout + fallback (cockatiel) around every external vendor call (Paystack, Termii, Anthropic, R2/S3, FCM) (RESIL-01) — Phase 11 (completed 2026-07-16). RESIL-02 (Grafana/Sentry visibility) — code-side wiring/sanitization verified and independently confirmed loaded in the production boot path; live dashboard confirmation of a real vendor outage remains an open human-verification item (see STATE.md Deferred Items)
- ✓ Settlement Engine Foundation — generalized `SettlementService` in `CommonModule` (single `$transaction`, `SELECT FOR UPDATE`, idempotency keys, drift-tolerance assertion) + standing Ministry wallet (SETTLE-01, SETTLE-02); fixed two pre-existing revenue bugs — Stays' `releaseEscrow()` govtLevyPct leak and missing Marketplace/Events/Studio webhook settlement consumers (SETTLE-05, SETTLE-06); per-recipient itemized statements + N-way split rounding tests (SETTLE-07, SETTLE-08) — Phase 12 (completed 2026-07-17)
- ✓ Settlement Cutover — Transport & Delivery — `completeTrip()`/`completeDelivery()` cutover-flag-gated onto `SettlementService.settle()` for a three-way driver-or-rider/Ministry/platform split, replacing the hardcoded 85/15 and 80/20 (SETTLE-03, SETTLE-04); legacy paths preserved byte-for-byte; Stage 1 batch shadow-verify script + Stage 2 live dual-run comparison prove zero discrepancy before either cutover flag flips live (SETTLE-09) — Phase 13 (4/4 plans, completed 2026-07-17). Both `*.settlement_engine_enabled` flags seeded `false` — live cutover awaits the manual D-08 bake-period gate (3 days or 100 completions, zero discrepancies), not code-enforced by this milestone
- ✓ Ministry Dashboard — `MINISTRY_VIEWER` role gated by its own `@Roles()` on every route, visitor entry counts by LGA/time, purpose-of-visit breakdown, revenue-to-government-share sourced from the Ministry wallet ledger, CSV + branded PDF export, zero row-level PII reachable (automated allowlist test) (MIN-01 through MIN-07) — Phase 14 (10/10 plans, completed 2026-07-18). Re-verified 6/6 roadmap success criteria after CR-01 (date-range off-by-one) and CR-02 (PDF row overlap) gap closure; human UAT approved both PDF visual checks
- ✓ Multi-Channel OTP — WhatsApp (direct Meta Graph API)/Email (SendGrid)/SMS (Termii) selectable at registration, returning-user channel preference persisted and honored, bounded-timeout automatic SMS fallback on delivery failure using the same code/expiry, per-identity lockout proven unbypassable by channel switching, post-registration settings screen to change channel (OTP-01, OTP-02, OTP-03, OTP-04) — Phase 15 (6/6 plans, completed 2026-07-18). Verified: 13/13 must-haves, 604 backend + 6 mobile tests passing. **Human verification pending:** live Meta WhatsApp template delivery (blocked on stakeholder template approval, not code) and on-device visual/UX check of the three new mobile screens — see `15-HUMAN-UAT.md`
- ✓ Connection Pooling Infrastructure — notifications-service boots cleanly (fixed the `packages/proto` compile-step gap and a `ResilienceModule` DI resolution gap), Neon pooled `-pooler` connection string pattern documented and config-tested (POOL-01), `postgres_open_connections` OTel gauge wired into the existing Grafana Cloud OTLP pipeline for both processes, combined-topology k6 scenario proves total connections stay under the confirmed Neon ceiling (POOL-02) — Phase 16 (4/4 plans, completed 2026-07-18). Verified: 15/15 must-haves, 610 backend tests passing. Operator confirmed the 104-connection baseline stands, the combined-topology load test + Grafana alert are live, and the production Railway monolith's `DATABASE_URL` has been changed to the pooled format and redeployed
- ✓ gRPC Proof-of-Pattern Extraction — `notifications-service` runs as a genuinely separate deployable process (own Railway service + docker-compose block), called exclusively via `ClientGrpc`, with zero client-visible REST behavior change confirmed end-to-end after a gap-closure round fixed a silent `success: true` hardcode on real send failures; documented caller-graph audit gated the extraction; Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour* confirmed still in-process (GRPC-03, GRPC-04, GRPC-05) — Phase 17 (7/7 plans, completed 2026-07-19). 619 backend tests passing

v2.1 — Extraction Backlog Clearance & Settlement Flexibility (in progress, started 2026-07-19):

- ✓ Settlement Split Centralization — new `SettlementSplitTier` model (typed Decimal columns, partial-unique-index-enforced single-active-row-per-module) replaces 6 duplicated inline `PlatformConfig` reads; `SettlementService.resolveSplit()` is the sole resolver for Transport/Delivery/Marketplace/Events/Stays/Studio; `Number.isFinite()` guard added to `settle()` rejects NaN-corrupted config before any wallet mutation; backend-only `SUPER_ADMIN`-gated CRUD with insert-new-row/deactivate-old audit trail (SETTLE-11a, SETTLE-11b, SETTLE-11c, SETTLE-11d) — Phase 18 (4/4 plans, completed 2026-07-19). Verified 7/7 must-haves; a code-review blocker (unique-constraint violation in the audit-trail update path) was found and fixed pre-verification, with a real-Postgres e2e regression test wired into CI. 644 backend tests passing
- ✓ Settlement Dispute & Adjustment Workflow — SUPER_ADMIN-only dispute lifecycle (`OPEN → IN_REVIEW → RESOLVED/DISMISSED`, `BLOCKED` retry) over a new `SettlementDispute` model; `SettlementService.adjust()` compensating-transaction primitive posts append-only, non-destructive corrections; DB-level partial-unique-index backstop + module cross-check on `raise()`; every action audited (SETTLE-10a, SETTLE-10b, SETTLE-10c, SETTLE-10d, SETTLE-10e) — Phase 19 (6/6 plans, completed 2026-07-20). Verified 5/5 must-haves after two gap-closure rounds (19-05, 19-06) fixed a recurring money-conservation bug class in `computeAdjustmentLines()`. **Human verification pending:** CR-02 migration deployment to staging/production unconfirmed; a residual (currently code-unreachable) platform-row variant of the same bug class was risk-accepted rather than gap-closed — see `19-HUMAN-UAT.md`

### Active

v2.1 — Extraction Backlog Clearance & Settlement Flexibility (scoping started 2026-07-19):

- GRPC-07: Live gRPC extraction of Delivery + remaining core modules
- GRPC-08: Live gRPC extraction of news/waitlist/reviews
- GRPC-06: Blue-green/canary deploys per extracted gRPC service
- MIN-08: Scheduled/recurring Ministry export delivery
- MIN-09: Seasonal/LGA heatmap visualization on Ministry dashboard

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
- **Current state (2026-07-19)**: v2.0 shipped — all 8 phases (10-17) complete, 29/30 requirements fully satisfied (RESIL-02 partial: code verified, live-dashboard human confirmation pending). Working on branch `microservices-redesign`. Backend confirmed live on Railway; `notifications-service` now runs as the first genuinely separate deployed gRPC process, proving the extraction pattern — remaining modules stay in-process by design (GRPC-05) pending an out-of-scope outbox/saga redesign for wallet-adjacent transactions. Web and mobile have smoke-test coverage (added 2026-07-13). Settlement engine generalized and Transport/Delivery cut over behind config flags (both still seeded `false` pending the manual D-08 bake-period gate). Multi-channel OTP shipped in Phase 15; live WhatsApp delivery awaits Meta template approval (stakeholder/ops action, tracked in `MANUAL-ACTIONS.md`).
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
| Real gRPC microservice split (v2.0) | Stakeholder explicitly re-confirmed this requirement after learning Phase 2's extraction was proto-only; wants true blast-radius isolation from vendor API outages | ✓ Good — Phase 17 proved the pattern live with `notifications-service` (own Railway process, `ClientGrpc`, zero REST behavior change); remaining modules deliberately deferred (GRPC-05) |
| Resilience-over-rewrite recommended, stakeholder chose full split anyway | Architect's initial recommendation was circuit-breakers on external calls as a cheaper path to the same isolation goal; stakeholder opted for the real split instead | ✓ Good — both delivered: Phase 11 shipped the resilience layer regardless, Phase 17 shipped the first live split on top of it |
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
*Last updated: 2026-07-20 — Phase 19 (Settlement Dispute & Adjustment Workflow) complete*
