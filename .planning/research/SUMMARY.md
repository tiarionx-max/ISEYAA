# Project Research Summary

**Project:** ISEYAA Super Platform — v2.1 Milestone (gRPC Extraction Backlog Clearance & Settlement Flexibility)
**Domain:** Government logistics/commerce super-app — extending a live NestJS modular monolith + one proven gRPC extraction (`notifications-service`) with wallet-adjacent service extraction, deploy-safety infrastructure, recurring reporting, and financial dispute/config flexibility
**Researched:** 2026-07-19
**Confidence:** HIGH

## Executive Summary

This milestone (GRPC-06/07/08, MIN-08/09, SETTLE-10/11) extends a system that is already live and carrying real government money — every recommendation is grounded in direct reads of the existing codebase (`SettlementService`, `DeliveryService`/`DeliveryGateway`, `MinistryService`, `notifications-service`) rather than generic microservices theory. No new mandatory runtime dependency is needed: `@nestjs/microservices`, `@grpc/grpc-js`, `@nestjs/terminus`, `@nestjs/schedule`, `@sendgrid/mail`, `fast-csv`/`pdfkit`, Prisma, and `cockatiel` already cover every mechanism required. What's missing is disciplined *usage* of what's already installed — health endpoints, durable state, a reversal primitive, a bounded export query — not new packages, brokers, or SaaS.

The single biggest risk this research surfaces is treating "extract Delivery" and "add blue-green/canary" as pure infrastructure tasks. Delivery is the first extraction candidate that is simultaneously wallet-adjacent (`SELECT FOR UPDATE` settlement calls) AND stateful (in-memory `SchedulerRegistry` match-timeouts, in-process Socket.IO rooms) — extracting it naively (as `notifications-service`, which is neither, was extracted) drops in-flight orders and live GPS tracking on every restart or cutover. Compounding this, Railway has no native canary/blue-green: any homegrown traffic-shift mechanism creates a dual-liveness window where every un-locked `@Cron` job (escrow release, the new Ministry export job, match-timeout sweeps) double-fires, because nothing in the codebase today guards a cron with a distributed lock. The recommended approach scopes GRPC-07 down to the one RPC (`VerifyDeliveryOtp`) that is genuinely stateless and wallet-clean this milestone, keeps `CompleteDelivery`/`RequestDelivery`/`AcceptDelivery` and `DeliveryGateway` in the monolith, retrofits `notifications-service` with a real health endpoint before any new service takes live traffic, and adds `RedisService.setNx()` cron locks as a cheap universal prerequisite before GRPC-06 is exercised with 2+ replicas.

On the settlement side, the codebase already has proven primitives (`SettlementService.settle()`, `RefundService.refund()`, the shadow-verify pattern from SETTLE-09) but none of them handle "reverse a multi-recipient payout" — `settle()` explicitly rejects negative amounts by design, and `refund()` only ever touches the buyer's wallet. SETTLE-10 requires a genuinely new `adjust()`/reversal primitive with its own idempotency namespace (never reusing the original settlement's reference prefix, which would silently collide with the existing `startsWith` idempotency scan and produce a "resolved" dispute with no actual wallet movement). SETTLE-11's flat-to-tiered `PlatformConfig` migration carries a parallel risk: the untyped `Json` column plus `Number(cfg.value)` read pattern can silently produce `NaN` — which defeats both of `settle()`'s existing safety nets (`NaN < 0` and `Math.abs(NaN) > 0.02` both evaluate `false`) — so this must ship with a namespaced config key, runtime shape validation, and a `Number.isFinite()` guard added directly to `settle()`, before any module's config shape actually changes. Both financial changes should build the shared `SettlementService.resolveSplit()` centralization (SETTLE-11) before the dispute engine (SETTLE-10), since a dispute resolver needs a single source of truth for "what split should have applied" to compute a correct reversal.

## Key Findings

### Recommended Stack

No new mandatory dependency for any of the seven features — the stack already installed covers every mechanism needed. New work is schema additions (Prisma models: `OutboxEvent`, `SettlementDispute`, `SettlementSplitTier`, `MinistryExportSubscription`/`DeliveryLog`) and usage patterns (hybrid gRPC+HTTP app bootstrap, `@nestjs/schedule` cron jobs, `SendgridService` attachment support) layered on already-pinned packages.

**Core technologies:**
- `@nestjs/microservices` + `@grpc/grpc-js` (hybrid app pattern) — every newly extracted service becomes `NestFactory.create()` -> `connectMicroservice({transport: GRPC})` -> `listen(httpPort)`, giving it both a gRPC port and an HTTP `/healthz` — required because Railway's healthcheck system is HTTP-only, verified with no TCP/gRPC support
- `@nestjs/terminus` (already powers the monolith's `/api/v1/health`) — reuse verbatim for every new service's `/healthz`, zero drift across services
- Prisma schema additions only (no version change, `^5.22.0`) — `OutboxEvent`, `SettlementDispute`, `SettlementSplitTier` models; no second ORM or data-access layer
- `@nestjs/schedule` (`^6.1.3`, already used for Stays escrow-release cron) — the correct primitive for both MIN-08's scheduled export and any outbox-relay poller; Railway runs ISEYAA as a persistent container, so a queue system (BullMQ, QStash) is explicitly unjustified for this milestone
- Postgres-backed transactional outbox (new pattern, no new infra) for any wallet-adjacent extraction reliability — `KafkaService` exists in-repo but is dormant and Upstash Kafka was discontinued March 2025; do not build on it

**Explicitly avoid this milestone:** service mesh (Istio/Envoy/Linkerd) for canary routing, LaunchDarkly/Unleash for the canary flag, BullMQ or Upstash QStash for scheduled exports, Debezium/CDC outbox relay, Temporal/saga orchestration, `decimal.js`/`big.js` for money math (the existing `Number` + kobo-rounding convention is intentional and should not fragment).

### Expected Features

**Must have (table stakes) — v2.1 scope:**
- GRPC-08: news/waitlist/reviews extracted to real gRPC services — lowest-risk, `notifications-service`-shaped, no wallet/WebSocket coupling
- GRPC-07 (scoped down): only `VerifyDeliveryOtp` extracted; settlement/payout logic and `DeliveryGateway` stay in the monolith this milestone
- GRPC-06 (scoped down): shadow-verify dual-run + manual pointer-flip blue-green — no weighted/percentage canary (Railway doesn't support it natively)
- MIN-08: weekly/monthly email digest (CSV/PDF attachment) to a configurable, DB-driven Ministry recipient list, wrapped in the existing `cockatiel` resilience layer
- MIN-09: LGA x month/season grid heatmap using existing `recharts` dependency over already-shaped `MinistryService` queries — no new mapping library or GeoJSON dependency
- SETTLE-10 (scoped): admin/SUPER_ADMIN-initiated dispute -> review -> resolve/reject workflow producing append-only offsetting adjustment transactions, full `AuditLog` trail
- SETTLE-11 (scoped): structured, validated, effective-dated per-module split configuration (flat percentage per module, not yet tiered by category/amount/promo)

**Should have (differentiators, sequence after MVP):** seasonal dry/rainy derived grouping (cheap, pure aggregation), drill-down from LGA/month cell to attraction-level detail, in-dashboard portal notification banner alongside the email digest, tiered splits by transaction-amount bracket.

**Defer (v2+):** true LGA choropleth map with GeoJSON boundaries (no boundary data exists in the schema today — only centroid lat/lng), self-service dispute filing by vendors/riders (needs new role-permission surface + abuse controls), weighted/percentage canary via feature-flag layer or service mesh, full outbox/saga async settlement for fully-independent wallet-adjacent deployability (explicitly out of scope per the prior GRPC-05 decision).

**Anti-features to actively reject:** full saga/outbox rewrite "for correctness" (disproportionate, already deferred by the team's own decision log), direct Prisma access to `Wallet`/`Transaction` from a newly-extracted service (reintroduces the double-spend race `SELECT FOR UPDATE` exists to prevent), mutating historical `Transaction` rows to "fix" a dispute (breaks the append-only ledger and idempotency), full formal case-management dispute system with SLA timers (wildly disproportionate for current volume), per-individual-vendor negotiated splits (turns config into a contract-management system).

### Architecture Approach

The system stays a NestJS modular monolith with a small, growing set of independently-deployed gRPC leaf services (`notifications-service` proven; `delivery-otp-service`, `news-service`, `waitlist-service`, `reviews-service` added this milestone). The controlling architectural rule, reaffirmed by this research: **wallet-touching logic never crosses a network hop this milestone.** Any extracted service that needs `SettlementService` embeds its own copy talking directly to the same Postgres (Postgres enforces `SELECT FOR UPDATE` correctness regardless of which OS process holds the connection) — it never calls a separately-extracted `wallet-service` over gRPC, which would reopen the distributed-transaction problem the GRPC-05 decision explicitly deferred.

**Major components (new/changed this milestone):**
1. `backend/apps/{delivery-otp,news,waitlist,reviews}-service/` — new gRPC microservice scaffolds mirroring `notifications-service`, each a hybrid app (gRPC + HTTP `/healthz`)
2. `SettlementService.resolveSplit()` + `SettlementSplitTier` table — centralizes 6 currently-duplicated flat-key `PlatformConfig` reads (transport/delivery/marketplace/events/stays/studio) into one resolver, replacing scattered inline computation
3. `SettlementService.adjust()` + `SettlementDispute` model + `settlement-disputes` module — new compensating-transaction primitive (own `$transaction`, own `SELECT FOR UPDATE` lock order, own idempotency namespace `${originalReference}-ADJ-${n}`) distinct from both `settle()` (credit-only) and `refund()` (buyer-only, single wallet)
4. `MinistryExportSchedulerService` (new, inside `MinistryModule`, not `AdminModule`) + `MinistryExportSubscription`/`MinistryExportDeliveryLog` models — reuses existing `MinistryService` query methods and `CsvExportService`/`MinistryPdfService` renderers verbatim, only new orchestration is the cron trigger and delivery log
5. `grpc.health.v1.Health` protocol server + `railway.toml` `healthcheckPath` on every extracted service — the actual unlock for Railway's automatic zero-downtime swap, currently missing even from `notifications-service`

### Critical Pitfalls

1. **Delivery's in-memory match-timeout and Socket.IO room state are not portable across a process boundary** — extracting `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` verbatim drops `SEARCHING` orders and live tracking sockets on every restart/cutover. Avoid by scoping GRPC-07 to only `VerifyDeliveryOtp` this milestone, and if a fuller extraction is ever attempted, replace `SchedulerRegistry.addTimeout()` with a Redis-TTL + cron-sweep pattern first.
2. **Extracting a wallet-touching module reopens the deferred GRPC-05 distributed-transaction problem, now against live money** — avoid by explicitly re-affirming that any wallet-adjacent extraction embeds `SettlementService`/`PrismaService` directly against the same DB, and that Wallet itself is never extracted into a network-called leaf service this milestone.
3. **Railway has no native canary/blue-green; any DIY traffic-shift creates a dual-liveness window that double-fires every un-locked `@Cron` job** — avoid by adding `RedisService.setNx()` leader locks to every existing cron (escrow release, heartbeat cleanup, tour reminders, and the new Ministry export job) as a prerequisite before GRPC-06's traffic-shifting mechanism is ever exercised with 2+ replicas.
4. **The dispute/adjustment workflow has no existing primitive to reverse a multi-recipient settlement, and naive reuse collides with existing idempotency scans and silently no-ops** — `settle()` rejects negative amounts by design; `refund()` only touches the buyer's wallet; reusing either without a distinct reference namespace produces a dispute marked "resolved" with zero actual wallet movement. Avoid by building a dedicated `adjust()` primitive with its own `${originalReference}-ADJ-${n}` namespace and an explicit insufficient-balance policy for clawback debits.
5. **Migrating flat `PlatformConfig` percentages to tiers on an untyped `Json` column risks NaN-corrupted wallet balances or a silent fallback that still violates "never hardcoded"** — `Number(cfg.value)` on a wrongly-shaped value produces `NaN`, which defeats both of `settle()`'s existing safety checks. Avoid by namespacing the config key (`X.tiers` vs `X.pct`, never overloading one key with two shapes), adding runtime shape validation at every read site, and adding a `Number.isFinite()` guard directly inside `settle()` as defense in depth.

## Implications for Roadmap

Based on combined research (architecture's explicit "Build Order Across All 7 Features" section, cross-checked against pitfalls' phase-mapping), suggested phase structure:

### Phase 1: Settlement Split Centralization (SETTLE-11, flat scope)
**Rationale:** De-risks the highest-consequence code (money movement) first, before touching deploy infrastructure or adding more independently-deployed processes to reason about. Every other financial phase (disputes) depends on this existing as a single source of truth.
**Delivers:** `SettlementSplitTier` model (namespaced, versioned key shape — never overloading existing flat `PlatformConfig` keys), `SettlementService.resolveSplit()` replacing 6 duplicated inline reads, runtime shape validation + `Number.isFinite()` guard in `settle()`, shadow-verified against all 6 existing call sites before cutover.
**Addresses:** SETTLE-11 (flat per-module configurable splits, P1 priority)
**Avoids:** Pitfall 10 (NaN-corrupted balances / silent hardcoded fallback on untyped Json migration)

### Phase 2: Settlement Dispute & Adjustment Workflow (SETTLE-10)
**Rationale:** Builds directly on Phase 1's `resolveSplit()` as the source of truth for "what the correct split should have been." Building disputes first would mean duplicating split-resolution logic or refactoring immediately after.
**Delivers:** `SettlementDispute` model (state machine mirroring the existing `AdminReviewFlag` precedent: OPEN -> IN_REVIEW -> RESOLVED/DISMISSED), new `SettlementService.adjust()` compensating-transaction primitive (own lock order, own idempotency namespace, explicit insufficient-balance policy), `settlement-disputes` module with role-gated raise/review/resolve endpoints, full `AuditLog` trail per adjustment.
**Addresses:** SETTLE-10 (admin dispute/adjustment workflow, P1 priority)
**Avoids:** Pitfall 8 (no multi-recipient reversal primitive), Pitfall 9 (idempotency-collision silent no-op)

### Phase 3: gRPC Blue-Green Healthcheck Retrofit (GRPC-06, infrastructure)
**Rationale:** Independent of the financial phases; must land before any new gRPC service (Phase 4) takes live traffic, since cutting traffic without a working healthcheck means Railway's rollout behaves as a blunt recreate, not blue-green. Low risk, provable against the already-live `notifications-service` with no new service required.
**Delivers:** `grpc.health.v1.Health` protocol server per gRPC service (shared boilerplate via a small reusable proto/provider), `railway.toml` `healthcheckPath` retrofit on `notifications-service` (currently missing entirely), `RedisService.setNx()` leader-lock added to every existing `@Cron` job project-wide (escrow release, heartbeat cleanup, tour reminders) as a mechanical prerequisite.
**Uses:** `@nestjs/terminus`, hybrid NestJS app bootstrap pattern
**Implements:** health-check-gated rollout, shadow-verify dual-run pattern (reused from SETTLE-09)
**Avoids:** Pitfall 4 (Railway has no native canary; un-locked crons double-fire during dual-liveness)

### Phase 4: Low-Risk gRPC Extraction — News/Waitlist/Reviews (GRPC-08) + Scoped Delivery OTP (GRPC-07)
**Rationale:** Both are stateless, wallet-clean, `notifications-service`-shaped extractions, parallelizable with each other and gated only on Phase 3's healthcheck infrastructure being in place before real cutover.
**Delivers:** `backend/apps/{waitlist,news,reviews,delivery-otp}-service/` scaffolds; `*-client` facade modules mirroring `notifications-client` (resilience-wrapped `ClientGrpc`); new `Vendor` entries in `resilience.types.ts`; `docker-compose.yml`/`nest-cli.json` registration. Internal build order within GRPC-08: waitlist -> news -> reviews (increasing complexity, not a hard dependency).
**Addresses:** GRPC-08 (P1), GRPC-07 scoped to `VerifyDeliveryOtp` only (P1) — `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` and `DeliveryGateway` explicitly stay in the monolith this milestone
**Avoids:** Pitfall 1 (in-memory match-timeout/Socket.IO state not portable), Pitfall 2 (wallet-across-network-boundary), Pitfall 3 (no client routing layer for split REST+WebSocket traffic)

### Phase 5: Scheduled Ministry Exports & LGA Heatmap (MIN-08, MIN-09)
**Rationale:** Fully independent of the gRPC/settlement work above — no shared dependency, good parallel-track filler work. Both reuse already-shipped Ministry query/export code with no new backend aggregation needed.
**Delivers:** `MinistryExportSchedulerService` (new, inside `MinistryModule` — not `AdminModule`, to preserve the existing GET-only `MinistryController` invariant) with `@Cron`-driven digest using a bounded rolling date window (never "all history"); `MinistryExportSubscription`/`MinistryExportDeliveryLog` models; `SendgridService` extended with a real attachment method (or S3-link delivery to sidestep SendGrid's size cap); LGA x month/season grid heatmap component using existing `recharts` dependency and `MinistryService.getVisitorEntriesByLgaAndMonth()` — no new mapping library.
**Addresses:** MIN-08 (P1), MIN-09 (P1)
**Avoids:** Pitfall 5 (PII-allowlist scanner doesn't auto-cover new methods — must add every new `MinistryService` method to the existing test cases), Pitfall 6 (unbounded recurring query, no attachment plumbing, no cron dedup), Pitfall 7 (heatmap assumes nonexistent boundary geometry — resolve point-density vs. choropleth scope with stakeholder before implementation)

### Phase Ordering Rationale

- Financial correctness (Phases 1-2) is sequenced before deploy infrastructure and further extraction (Phases 3-4) because it is the highest-consequence code and because Phase 2 has a hard data dependency on Phase 1's centralized split resolver.
- Phase 3 (healthcheck retrofit) is sequenced before Phase 4 (new services going live) because cutting real traffic to any new gRPC client without a working healthcheck defeats the entire purpose of "blue-green" this milestone is trying to add — this is a hard architectural dependency, not a preference.
- Phase 4 deliberately scopes GRPC-07 down to one RPC (`VerifyDeliveryOtp`) rather than the full Delivery module, because the other three RPCs are either wallet-adjacent (`CompleteDelivery`) or Socket.IO-coupled (`RequestDelivery`, `AcceptDelivery`) and extracting them requires new infrastructure (durable match-timeout, Socket.IO Redis adapter, client routing layer) explicitly out of scope for this milestone per the pitfalls research.
- Phase 5 has no technical dependency on any other phase and can run as a parallel workstream throughout.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (SETTLE-10 dispute/adjustment):** the exact dispute-workflow schema and insufficient-balance clawback policy is a product/compliance decision, not a pattern — STACK/PITFALLS research flagged this as MEDIUM confidence (inferred from `SettlementService`, not an external standard). Needs explicit design-doc sign-off before implementation, not just a phase plan.
- **Phase 4 (GRPC-07/08 extraction):** the "remaining core modules" second half of GRPC-07 needs a fresh wallet/gateway coupling audit per module before claiming any of Events/Stays/Marketplace/Studio is a clean extraction candidate — all four call `SettlementService.settle()` directly and are not automatically safe to extract.
- **Phase 5 (MIN-09 heatmap):** requires an explicit stakeholder conversation (point-density grid vs. true LGA-boundary choropleth) before implementation estimate is finalized — this is a scope decision that changes phase size significantly, not something research alone can resolve.

Phases with standard, well-documented patterns (skip deep research-phase):
- **Phase 1 (SETTLE-11 flat scope):** centralizing an already-existing read pattern into one resolver method — mechanical, low-risk, precedent (`resolveMinistryWallet()`) already exists in the same file.
- **Phase 3 (GRPC-06 healthcheck retrofit):** standard gRPC Health Checking Protocol + NestJS hybrid-app pattern, confirmed current against official NestJS docs; Railway's healthcheck-gated rollout behavior is already directly verified.
- **Phase 5 (MIN-08 scheduled export):** direct copy of the already-proven `TourNotificationsService` `@Cron` + idempotency-flag-on-row pattern used three times elsewhere in this codebase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | gRPC/health, Railway deploy behavior, Kafka/BullMQ/QStash tradeoffs verified against official docs, live npm registry, and direct codebase inspection; MEDIUM only on the exact dispute-workflow schema, which is inferred from `SettlementService`, not an external standard |
| Features | MEDIUM-HIGH | Verified against existing ISEYAA code where a pattern exists (`SettlementService`, `MinistryService`, `PlatformConfig`, `AuditLog`, `notifications-service`); external ecosystem sources (Railway deploy patterns, dispute/ledger references, dashboard libraries) are MEDIUM confidence, cross-referenced across multiple sources |
| Architecture | HIGH | All findings verified directly against source files (`delivery.service.ts`, `settlement.service.ts`, `schema.prisma`, `docker-compose.yml`, `railway.toml` files, `packages/proto/*.proto`) — no external/WebSearch sources needed, this is a pure codebase-integration analysis |
| Pitfalls | HIGH | Every pitfall derived directly from reading the live implementation and the explicit prior-milestone decision log (`STATE.md`); one external fact (Railway's lack of native canary) is MEDIUM confidence, cross-referenced against Railway's own docs and staff-participated community threads |

**Overall confidence:** HIGH

### Gaps to Address

- **Dispute insufficient-balance policy (SETTLE-10):** whether a clawback debit that would take a wallet negative should block-and-flag, allow a tracked negative balance, or trigger platform-wallet absorption is a compliance/product decision that must be made explicitly during Phase 2 planning — not inferable from existing code, since no debit path in the codebase handles this today.
- **MIN-09 heatmap fidelity (point-density vs. choropleth):** no LGA boundary GeoJSON exists in the schema or has been sourced; this must be resolved with the actual Ministry stakeholder before Phase 5's implementation estimate is finalized, or the team risks shipping "20 fuzzy dots" against an expectation of a proper map.
- **"Remaining core modules" scope for GRPC-07's second half:** the milestone description implies more than just Delivery, but architecture research found Events/Stays/Marketplace/Studio are all wallet-adjacent (not clean extraction candidates) — this needs explicit re-scoping during Phase 4 planning to confirm which module(s), if any, fill that slot (candidates: `admin-service`/`ai-service` scaffolds, which are read-mostly or externally-vendored).
- **Client-facing routing for any future fuller Delivery extraction:** deferred out of this milestone's scope, but the lack of an API gateway/reverse-proxy layer in the current stack means any future WebSocket-touching extraction will need this solved first — flag for a future milestone's architecture research, not this one.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection (all four research files): `backend/src/common/services/settlement.service.ts`, `refund.service.ts`, `sendgrid.service.ts`; `backend/src/modules/delivery/delivery.service.ts`, `delivery.gateway.ts`; `backend/src/modules/ministry/ministry.service.ts`, `ministry.controller.ts`; `backend/prisma/schema.prisma`; `backend/apps/notifications-service/{main.ts,railway.toml}`; `backend/redis/redis.service.ts`; `packages/proto/*.proto`; `.planning/STATE.md`, `.planning/PROJECT.md`
- `docs.nestjs.com/faq/hybrid-application`, `docs.nestjs.com/microservices/grpc` — hybrid application + gRPC transport pattern
- `docs.railway.com/deployments/healthchecks`, `docs.railway.com/deployments/deployment-actions` — HTTP-only healthcheck confirmed, fetched directly

### Secondary (MEDIUM confidence)
- Railway Station community threads (staff-participated) — confirms no native cross-service blue-green/canary or TCP/gRPC healthcheck support
- `upstash.com/docs/redis/integrations/bullmq`, `docs.bullmq.io/guide/going-to-production` — BullMQ `noeviction` requirement conflicts with existing `allkeys-lru` Redis policy
- Government tourism dashboard references (Hawaii DBEDT, UN Tourism) — corroborate grid/time-series over choropleth as the dominant pattern for this data shape
- Wallet ledger / dispute pattern references (Bamboodt, Formance, Rexi) — consistent append-only-ledger + case-workflow pattern across sources

### Tertiary (LOW confidence)
- None flagged — all findings in this milestone's research were either direct codebase reads (HIGH) or cross-referenced against 2+ external sources (MEDIUM)

---
*Research completed: 2026-07-19*
*Ready for roadmap: yes*
