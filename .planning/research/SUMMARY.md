# Project Research Summary

**Project:** ISEYAA Super Platform — v2.0 Milestone (Microservices, Multi-Channel Auth & Government Partnership)
**Domain:** Government super-app platform evolution — real gRPC microservice extraction, multi-channel OTP identity verification, government-partner analytics dashboard, N-way payment settlement
**Researched:** 2026-07-15
**Confidence:** MEDIUM-HIGH overall (architecture and pitfalls findings are HIGH confidence, verified by direct source inspection and a real `nest build` run, not assumption; stack recommendations are HIGH except WhatsApp cost data which is MEDIUM; feature patterns are MEDIUM-HIGH, general industry practice cross-referenced with this codebase's actual code)

## Executive Summary

ISEYAA v2.0 bundles four largely independent capability areas onto an already-live, money-handling NestJS 11 monolith: real gRPC microservice extraction, WhatsApp OTP as a third auth channel, a read-only Ministry analytics dashboard with CSV/PDF export, and a generalized N-way (vendor/Ministry/platform) settlement split. The single most important correction from this research round is that **the gRPC extraction is not starting from zero** — `backend/apps/` already contains 8 fully scaffolded microservices (auth, wallet, events, stays, marketplace, admin, ai, notifications) with real `@GrpcMethod` controllers wrapping the existing feature services, their own Dockerfiles, `railway.toml` files, and `nest-cli.json` project entries. However, the build is genuinely broken (`npx nest build wallet-service` fails with `TS6059` due to an unset per-app `rootDir`), and every service's Dockerfile masks that failure with `2>/dev/null || true`, so nothing has ever actually run. Zero `ClientGrpc`/`ClientProxyFactory` call-sites exist anywhere, meaning even if the build were fixed, nothing would consume these services. The correct framing for the roadmap is **"fix the broken build, then finish the missing client/deploy/pooling layers of an existing scaffold, plus greenfield proto+wiring for 7 never-stubbed modules"** — not "build 8 microservices from scratch." This changes both scope and estimated effort materially versus treating it as net-new work.

The recommended approach across all four areas is deliberately conservative and reuse-first: extend Termii's existing WhatsApp Token API rather than integrate Meta's Cloud API directly (avoids a multi-week Business verification process and likely-higher per-message cost); generalize `TourSettlementService`'s already-proven `SELECT FOR UPDATE` + idempotency + drift-assertion pattern into a shared `SettlementService` rather than rewriting settlement logic; keep gRPC extraction to low-blast-radius, non-transactional modules first (`notifications-service` → `ai-service` → `admin-service`) and explicitly defer `wallet-service` extraction to a future milestone, because the wallet's multi-row `SELECT FOR UPDATE` transaction cannot safely span a gRPC network boundary without a full outbox/saga redesign that is out of scope here; and build the Ministry dashboard as a brand-new, narrowly-scoped `MinistryModule` rather than extending `AdminController` (which has unguarded mutation endpoints at the class level that would otherwise leak write access to a role explicitly required to be read-only).

The key risks are financial-correctness risks, not feature risks, and two of them are pre-existing bugs this milestone's work will directly expose or worsen if not addressed: Marketplace/Events/Studio's webhook-driven payment events (`payment.order_payment`, `payment.ticket_purchase`, `payment.studio_booking`) currently have **no `@OnEvent` consumer anywhere in the codebase** — only `TourSettlementService` listens for `payment.tour_booking` — so building the N-way settlement engine on top of "the existing webhook path" for these three modules means building a consumer from nothing, not extending live code. Separately, Stays' `releaseEscrow()` cron currently credits the host **100% of the booking price with zero platform or government fee capture** (the `Booking.govtLevyPct` schema column exists but is never read) — this is an existing revenue leak, not new-feature scope, but it is directly in the path of the settlement-split work and must be fixed as part of (or immediately before) generalizing the engine, or the "Ministry share" being reported on the new dashboard will be silently wrong for every Stays booking. Beyond these, the other major risks are well-documented and mitigable: connection-pool exhaustion once multiple Prisma clients hit the same Neon instance, N-way rounding-remainder drift if the two-way-split code shape is copied naively, and WhatsApp template-approval lead time blocking launch if not front-loaded in week 1.

## Key Findings

### Recommended Stack

The backend is already on NestJS 11.1.20 (not 10.3.x as `CLAUDE.md`/`PROJECT.md` state — stale documentation, repo is mid-upgrade on `microservices-redesign`). Critically, `@grpc/grpc-js`, `@grpc/proto-loader`, `@nestjs/microservices`, and `ts-proto` are **already installed** and `packages/proto/generate.sh` already codegens from 8 `.proto` files — gRPC is not a "new library" decision, it's a "wire up and version-align what's installed" decision. Only two genuinely new dependencies are needed for the whole milestone: `cockatiel` (composable retry/circuit-breaker/timeout/fallback policies, one dependency covering all four resilience patterns needed across Paystack/Termii/Anthropic/S3/FCM — chosen over Opossum, which only covers circuit-breaking and would require two more libraries) and `@json2csv/node` (streaming CSV export for Ministry dashboard). WhatsApp OTP and settlement generalization need **zero new npm packages** — both extend already-integrated vendor APIs (Termii) and existing service-layer patterns (`TourSettlementService`'s `$transaction` shape) respectively. PDF export reuses the existing `pdfkit`-based `ItineraryPdfService` pattern; do not introduce `puppeteer` or `pdf-lib` (same container-size rationale already documented in that file). Inter-service gRPC auth should use a shared-secret metadata guard, not mTLS — Railway's private network is already WireGuard-encrypted end-to-end, making certificate rotation infrastructure disproportionate for this milestone's actual threat model.

**Core technologies:**
- `@nestjs/microservices` + `@grpc/grpc-js` + `@grpc/proto-loader` + `ts-proto` (all already installed, version-align to `@nestjs/core`) — gRPC transporter, already the toolchain `packages/proto/generate.sh` targets
- `cockatiel` (net new) — single composable resilience policy library covering retry/circuit-breaker/timeout/fallback across all 5 external vendor integrations
- `@json2csv/node` (net new) — streaming CSV export for Ministry dashboard, avoids materializing large result sets in memory
- Existing `pdfkit`, `axios`, `@nestjs/schedule`, `kafkajs`, `@nestjs/terminus` — all reused as-is for PDF export, WhatsApp channel requests, scheduled exports, async cross-service events, and gRPC readiness probes respectively

### Expected Features

This milestone spans four capability areas with a clear P1/P2/P3 prioritization. The single highest-leverage correction to make before roadmapping: any status document claiming gRPC extraction is "done" because proto files exist must be corrected first — the true state (scaffolded-but-broken-and-unconsumed) needs to be the shared understanding before phase planning proceeds.

**Must have (table stakes):**
- Corrected roadmap/status documentation reflecting the true (broken-scaffold) starting state
- Circuit breaker + retry + fallback wrapping around all 5 vendor integrations (delivers the core "blast-radius isolation" goal independent of the gRPC extraction timeline)
- gRPC extraction of `notifications-service` first (lowest blast radius, no wallet coupling), proving the pattern before repeating it — NOT `wallet-service` first, despite its scaffold looking "most complete"
- `.proto` contract authoring (not necessarily live extraction) for the 7 unstubbed modules (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews)
- WhatsApp OTP channel, selectable at registration, falling back to SMS on delivery failure, sharing the existing Redis OTP TTL/lockout scheme (identity-scoped, not channel-scoped — a channel-scoped lock key is a brute-force bypass vector)
- `MINISTRY_VIEWER` role, read-only-audited per-route (never via `AdminController`'s class-level `@Roles`, which has unguarded mutation endpoints)
- Ministry dashboard: visitor entry counts, purpose-of-visit breakdown (net-new data capture — no existing check-in mechanism for Tourism attractions to piggyback on), revenue-to-government-share reporting
- CSV + PDF export for all Ministry dashboard reports
- Three-way `PlatformConfig`-driven settlement split generalized from `TourSettlementService`, replacing Transport's hardcoded-looking-but-actually-config-driven 85/15 and Delivery's 80/20, AND fixing Stays' zero-fee-capture gap and building the missing webhook consumers for Marketplace/Events/Studio
- Standing Ministry wallet + per-recipient settlement statements, audit trail discipline (append-only, original-preserved)

**Should have (competitive/differentiator):**
- Independent per-service scaling for Transport's live GPS WebSocket load (strongest gRPC-split candidate architecturally, but sequenced after settlement work due to wallet-transaction coupling — see Architecture section)
- Event-driven (Kafka) decoupling reusing the already-proven dual-path (Kafka + EventEmitter2) pattern from `TourSettlementService`
- Scheduled/recurring Ministry export delivery (cheap add-on once PDF export exists, reuses `SendgridService`)
- Seasonal/LGA heatmap visualization (Recharts already a dependency)

**Defer (v2+):**
- Database-per-service split (invalidates the wallet `SELECT FOR UPDATE` invariant; would force a Saga-pattern rewrite — explicitly out of scope)
- Live BI/Power BI connector for Ministry (CSV/PDF satisfies the stated need; a live connector implies a new auth surface and ongoing schema-stability contract)
- Dispute/adjustment workflow for settlement corrections (genuinely new capability with no existing pattern to lean on; trigger on first real-world dispute, not built speculatively)
- Extraction of low-traffic modules (news, waitlist, reviews) as live separate services (proto contracts only for now)

### Architecture Approach

The target end-state keeps REST as the sole external-facing contract (web/mobile clients unchanged) while internal calls to extracted modules become gRPC; not-yet-extracted modules stay in-process exactly as today. Each extracted service gets its own `PrismaClient` against the same `DATABASE_URL` (the `@Global()` module pattern does not cross process boundaries — already correctly anticipated in the existing `wallet-service` scaffold, which independently re-imports `PrismaModule`/`CommonModule`/`RedisModule`). This introduces a genuinely new capacity risk not present with 1 process: up to 9 independent Postgres connection pools hitting the same Neon instance, which needs a pooled connection string (`-pooler` suffix) or PgBouncer before more than 1-2 services run concurrently.

**Major components (new/modified for v2.0):**
1. `backend/apps/<name>-service/` (×8, existing) — fix `rootDir` in each `tsconfig.app.json`, remove Dockerfile's `|| true` error-masking, add real Railway service provisioning and local dev orchestration
2. gRPC client proxies (net new, zero prior art in this repo) — thin wrappers implementing the same method signatures as in-process services, so REST controllers don't change when a module is extracted
3. `OtpChannelService` (new, in `CommonModule`) — unifies SMS/WhatsApp/Email dispatch behind one `send(phone, otp, channel)` method; keep OTP dispatch in-process regardless of `notifications-service` extraction status, since it's on the most latency-sensitive critical path in the app
4. `MinistryModule` (new, standalone) — `MinistryController`/`MinistryService` with per-route `@Roles(MINISTRY_VIEWER, SUPER_ADMIN)`, deliberately not sharing a controller class with any mutation endpoint
5. `VisitorLog` (new Prisma model) — no existing table can host "someone visited" + "purpose of visit" signal; correlatable to Event check-ins / Stay bookings via `sourceType`/`sourceRefId`, but also supports standalone manual/kiosk entries
6. `SettlementService` (new, in `CommonModule`, parallel to existing `RefundService`) — generalized N-way atomic wallet fan-out lifted out of `TourSettlementService`'s vendor-type-specific resolution logic; accepts already-resolved `walletId`s so it stays domain-agnostic

### Critical Pitfalls

1. **Wallet's `SELECT FOR UPDATE` guarantee cannot span a gRPC network boundary** — calling Wallet synchronously from an extracted service reintroduces classic distributed-transaction failure modes (local write succeeds, network call times out, no single lock spans both). Avoid by using a transactional outbox pattern for any money-moving cross-service call, and treat Wallet as staying in-process for this milestone — do not extract it.
2. **Partial extraction breaks in-process callers that haven't migrated** — NestJS DI doesn't distinguish "local class" from "should now be a network client." Before extracting any module, grep every direct injection of its service across the whole monolith and build the full caller graph; never mark a service "extracted" based on proto-contract existence alone (exactly the mistake already made once, per PROJECT.md's prior status claim).
3. **Independent Prisma clients per extracted service exhaust Neon's connection ceiling** — 8+ services each applying Prisma's default pool-sizing formula against the same database multiplies connections without anyone deciding to. Set up PgBouncer/pooled connection strings as its own phase before extracting more than 1-2 services, and load-test the full combined topology, not each service in isolation.
4. **N-way settlement rounding/remainder errors silently leak or lose money** — naive independent `Math.floor(total * pct)` per recipient won't sum back to `total`. Compute N-1 shares by percentage, the last by subtraction (`total - sum(others)`), and add an automated test asserting exact sum-equals-total across a wide range of non-round amounts.
5. **Ministry export leaks BVN/NIN/phone PII** — the natural implementation path (extend an existing `AdminService` query) risks pulling plaintext national-ID fields into a CSV handed to a non-technical government stakeholder, given NIN/BVN are already stored in plaintext with no `SELECT *` exclusion. Build the Ministry export as an explicit field-allowlist query from day one, with an automated schema-shape test, never by extending `AdminService`.

Additional pitfalls surfaced that are directly relevant to phase sequencing but not in the top 5: WhatsApp template approval is a Meta review process outside engineering's control (start Business verification + template submission in week 1, parallel to code, not after); channel-scoped OTP rate-limit keys are a brute-force bypass (must share the identity-scoped lock across all channels); big-bang cutover of Transport/Delivery onto the new settlement engine risks silently changing live driver/rider payouts (require shadow-mode verification with byte-identical regression tests against the old hardcoded percentages before cutover); and Ministry export needs bounded/paginated queries plus verified production migration state (direct precedent: Phase 9's silent migration rollback, which produced plausible-looking-but-wrong data for weeks).

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Documentation Correction + gRPC Build Fix
**Rationale:** Near-zero risk, pure bug fix with no design decisions pending, and unblocks everything else in the gRPC track. Must happen before any other gRPC work is planned, since it changes what "done" means for every subsequent phase.
**Delivers:** Corrected `ROADMAP.md`/`PROJECT.md` framing (scaffolded-but-broken, not "8 services extracted"); fixed `rootDir` in all 8 `backend/apps/*/tsconfig.app.json`; removed `|| true` Dockerfile error-masking; a real, passing `nest build <service>` for at least `wallet-service` verified as the template fix, applied to the remaining 7.
**Addresses:** Corrects the false "done" claim (Feature Research table stakes item #1)
**Avoids:** Pitfall — trusting a green Dockerfile build as proof a service works (Anti-Pattern 3, Architecture Research)

### Phase 2: Resilience Wrapping (Circuit Breaker / Retry / Fallback)
**Rationale:** Fully independent of the gRPC extraction timeline — delivers the core "blast-radius isolation from vendor outages" goal on its own and should not be gated behind the service split finishing.
**Delivers:** `cockatiel`-based policy factories in `backend/src/common/resilience/`, one per vendor (Paystack, Termii, Anthropic, S3/R2, FCM), wired into existing services via the `@Global() CommonModule` pattern; Cockatiel events emitted into existing Logger/OpenTelemetry spans.
**Uses:** `cockatiel` (Stack Research)
**Implements:** No new component — extends `CommonModule`

### Phase 3: Ministry Dashboard (MinistryModule + MINISTRY_VIEWER + VisitorLog)
**Rationale:** Fully independent of the other three tracks — no shared code paths, no sequencing risk. Safe to parallelize with anything else. Should NOT wait for gRPC or settlement work to start, though its revenue-to-government-share metric will be incomplete until Phase 4 lands.
**Delivers:** New `MinistryModule` (controller+service+DTOs, per-route `@Roles`), `UserRole.MINISTRY_VIEWER` enum member (excluded from self-registration), `VisitorLog` Prisma model, CSV export (`@json2csv/node`) and PDF export (reusing `ItineraryPdfService`'s pattern) for all reports.
**Addresses:** Ministry Area 3 table stakes — visitor counts, purpose-of-visit breakdown, CSV/PDF export, read-only-audited role (Feature Research)
**Avoids:** PII leak via reused `AdminService` queries (Pitfall 7); unbounded/unpaginated export causing production load spikes (Pitfall 8); reporting on a silently-unpopulated table (Pitfall 9) — include a `prisma migrate status`-against-production go-live check

### Phase 4: Settlement Generalization (SettlementService) — Including Fixing the Stays/Marketplace/Events/Studio Gaps
**Rationale:** Must land before or alongside the gRPC proof-of-pattern work, because it determines which modules can't be extracted soon (Wallet must stay in-process once `SettlementService`'s multi-wallet lock is generalized). Also unblocks real revenue capture that is currently **zero** for Stays and **non-existent** for Marketplace/Events/Studio's webhook path — likely higher business value than the gRPC work itself. This phase must explicitly include: (a) building the previously-missing `@OnEvent('payment.order_payment'|'payment.ticket_purchase'|'payment.studio_booking')` consumers (currently dead-lettered events, per Architecture Research), and (b) fixing Stays' `releaseEscrow()` to actually read `Booking.govtLevyPct` instead of crediting the host 100%. Both are pre-existing bugs, not new scope, but the Ministry dashboard's revenue-share numbers will be wrong until they're fixed.
**Delivers:** Shared `SettlementService` in `CommonModule` generalized from `TourSettlementService`'s proven `$transaction`/`SELECT FOR UPDATE`/idempotency/drift-assertion skeleton; standing Ministry wallet; per-recipient settlement statements; real webhook consumers for Marketplace/Events/Studio; corrected Stays escrow release with actual fee capture.
**Addresses:** Settlement Area 4 table stakes (Feature Research); Architecture Research's Integration Point 4 finding (per-module wallet-crediting reality check)
**Avoids:** N-way rounding drift (Pitfall 10); silent live-payout changes from big-bang Transport/Delivery cutover (Pitfall 11) — migrate Transport/Delivery in a SEPARATE later phase with shadow-mode verification, not in this phase; idempotency key collision across booking types (Pitfall 12)

### Phase 5: WhatsApp OTP Channel
**Rationale:** Independent of gRPC/settlement; can run in parallel with Phases 2-4. The Meta/BSP template-approval process (if going the direct-Meta route) or Termii-activation spike (if reusing Termii's existing WhatsApp pass-through) is on an external timeline, not engineering's — must be kicked off in week 1 of this phase, front-loaded and parallel-tracked with backend code, not sequenced after it.
**Delivers:** `channel` field on `OtpSendDto` (SMS/WHATSAPP/EMAIL, default SMS); `OtpChannelService` in `CommonModule` unifying dispatch; shared identity-scoped Redis lock key across all channels; sequential fallback (chosen channel → SMS) reusing the existing `sendTermii()`→Twilio try/catch shape; fixed `ThrottlerGuard` gap on auth endpoints (pre-existing, but this phase's new attack surface makes it urgent).
**Addresses:** Multi-Channel OTP Area 2 table stakes (Feature Research)
**Avoids:** Channel-hopping brute-force bypass (Pitfall 4); template approval blocking launch (Pitfall 5); WhatsApp cost budget surprise (Pitfall 6) — confirm exact BSP/Termii Nigeria pricing before committing a launch date

### Phase 6: Connection Pooling Infrastructure
**Rationale:** Cheap to do early, expensive to diagnose later. Must land before more than 1-2 gRPC services run concurrently against Neon — this is a pure infrastructure phase with no feature-visible output, easy to skip accidentally if not made explicit.
**Delivers:** Neon pooled connection string (`-pooler` suffix) or PgBouncer in front of Postgres; explicit `connection_limit` per service's `DATABASE_URL`; combined-topology load test confirming total connections stay under Neon's ceiling; Grafana-tracked open-connection metric with alert threshold.
**Avoids:** Pitfall 3 (connection pool exhaustion) — this phase exists specifically because per-service testing will never catch this; only a full-topology load test will

### Phase 7: gRPC Proof-of-Pattern Extraction (notifications-service → ai-service → admin-service)
**Rationale:** Sequenced last of the "core" phases because it depends on Phase 1 (build fixed) and Phase 4 (settlement generalization has clarified that Wallet/payment-path modules are out of scope for extraction this milestone). Extract in order of increasing risk: `notifications-service` first (fire-and-forget FCM push, no transactional coupling, lowest blast radius if the client-proxy wiring has bugs), then `ai-service` (stateless streaming, isolates the Anthropic vendor blast radius — the originally stated resilience goal), then `admin-service` (read-mostly, one mutation endpoint). Stop there for v2.0 — do not extract `wallet-service`, `transport`, `delivery`, `events`, `stays`, `marketplace`, or `auth-service` in this milestone.
**Delivers:** `ClientGrpc` proxies for the 3 extracted modules (genuinely zero prior art in this repo, built from scratch per module); provisioned Railway services per extraction; `docker-compose.yml` service blocks for local dev; full caller-graph grep + integration test per service before its extraction checkpoint is marked complete.
**Addresses:** gRPC extraction table stakes minus the anti-feature of extracting everything at once (Feature Research, Area 1)
**Avoids:** Distributed wallet inconsistency (Pitfall 1) — by explicitly NOT extracting Wallet; partial-extraction breaking unmigrated callers (Pitfall 2)

### Phase Ordering Rationale

- **Settlement generalization (Phase 4) is sequenced ahead of gRPC extraction (Phase 7)** because it determines a hard constraint (Wallet and payment-path modules must stay in-process) that the extraction order must respect — discovering this constraint after extraction has started would force costly rework.
- **Ministry dashboard (Phase 3) and WhatsApp OTP (Phase 5) can run fully in parallel** with the gRPC/settlement track — research confirms zero shared code paths or sequencing dependencies between them and the other two tracks, aside from the dashboard's revenue-share metric depending on Phase 4's Ministry wallet existing.
- **Connection pooling (Phase 6) is deliberately its own phase**, not folded into Phase 7, because it's infrastructure work with no directly attributable feature — research flags this exact pattern ("cheap now, expensive to diagnose later, retrofitted after all 8 are live") as a common failure mode to avoid.
- **Transport/Delivery migration onto the new settlement engine is explicitly NOT in Phase 4** — Pitfall 11 requires it to be a separate, later phase with shadow-mode verification, since it changes live driver/rider payout amounts and must never be combined with building the engine itself.
- **Two pre-existing bugs (missing webhook consumers, Stays' zero-fee escrow release) are folded into Phase 4** rather than treated as separate "tech debt" cleanup, because both directly determine whether the Ministry dashboard's revenue-share numbers (Phase 3) will be correct — fixing them elsewhere/later would let a compliance-sensitive, government-facing metric ship silently wrong.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (WhatsApp OTP):** Nigeria-specific WhatsApp/Termii pricing was not independently verified (MEDIUM confidence, single third-party aggregator figure found) — needs a direct BSP/Termii support-ticket spike before budget/timeline commitment. Also needs a product decision on Termii pass-through vs. direct Meta Cloud API integration (PROJECT.md language leans toward "net new" = direct Meta, but Termii reuse is architecturally and operationally cheaper — flag for explicit stakeholder confirmation before phase planning locks this in).
- **Phase 4 (Settlement generalization):** The exact mechanism by which Marketplace/Events/Studio currently settle payments (if not via the dead-lettered webhook events) needs a follow-up code audit before this phase is planned in detail — Architecture Research explicitly could not locate a synchronous alternative path in this research pass and flagged it as needing confirmation.
- **Phase 7 (gRPC extraction):** The exact shape of the outbox/idempotent-event pattern needed for any future money-touching extraction (explicitly deferred past this milestone, but the pattern should be designed conceptually now so Phase 4's `SettlementService` doesn't need a breaking rework later) may warrant a short research-phase spike even though no money-touching module is extracted in v2.0.

Phases with standard patterns (skip research-phase):
- **Phase 1 (build fix):** Root cause and fix are already fully diagnosed in Architecture Research (verified via an actual `nest build` run) — implementation is mechanical.
- **Phase 2 (resilience wrapping):** Cockatiel's API and the `CommonModule` integration pattern are well-documented and directly analogous to existing services in the codebase.
- **Phase 3 (Ministry dashboard):** `AdminService.getRevenue()` provides a direct, already-working query-shape template; role/guard wiring is a pure extension of the existing generic `RolesGuard`.
- **Phase 6 (connection pooling):** Neon's pooled-connection-string feature is a documented, standard configuration change, not a novel implementation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against `backend/package.json` and live npm registry queries; only the exact Nigeria WhatsApp pricing figure is MEDIUM (single third-party source) |
| Features | MEDIUM-HIGH | Patterns are well-established industry practice (Strangler Fig, gRPC-internal/REST-external, WhatsApp fallback UX) cross-referenced with multiple independent sources; Nigeria/government-dashboard specifics are MEDIUM (synthesized from general public-sector BI practice, not Ogun-State-specific) |
| Architecture | HIGH | All findings verified against actual source files and a real `nest build` attempt — not assumptions. This is the research file that materially corrected the milestone's starting-state framing (scaffolded-but-broken, not "zero gRPC wiring") |
| Pitfalls | MEDIUM-HIGH | gRPC/distributed-transaction and connection-pool findings verified against Prisma docs and established patterns; settlement-split and export pitfalls are HIGH confidence (derived directly from this codebase's verified existing behavior, e.g. Stays' escrow release code, `webhooks.service.ts`'s `@OnEvent` grep); WhatsApp Business API findings verified against multiple current vendor sources but Nigeria-specific pricing/activation details are MEDIUM |

**Overall confidence:** HIGH on architecture/scoping decisions (what to build and in what order), MEDIUM-HIGH on feature/pitfall detail, MEDIUM on two specific external-vendor facts (WhatsApp Nigeria pricing, Termii WhatsApp Token API activation status) that require a direct vendor spike before commitment.

### Gaps to Address

- **Termii WhatsApp Token API activation status is unconfirmed** — public docs say "not enabled by default, contact support to activate." A support-ticket spike must happen before Phase 5 is scoped in detail, since it determines whether the WhatsApp channel is a lightweight Termii extension or a full Meta Cloud API integration with its own template-approval timeline.
- **Marketplace/Events/Studio's real settlement mechanism is unconfirmed** — Architecture Research found the webhook-driven path (`payment.order_payment` etc.) has zero consumers, but could not determine within this research pass whether these modules settle synchronously through some other undiscovered path. This must be resolved via a targeted code audit before Phase 4 is planned in implementation detail, not assumed to be "dead code with no consequence."
- **Ministry vs. tourism-attraction wallet identity is a product decision, not an engineering one** — whether the Ministry's settlement-split wallet is the same entity as the existing `tour.government_wallet_user_id` PlatformConfig key, or a distinct standing wallet, needs explicit stakeholder confirmation before Phase 4's schema/config work begins.
- **NDPA legal interpretation of WhatsApp channel-selection consent is LOW confidence** — sourced from legal-adjacent summaries, not NDPC's own guidance directly. Flag for legal review before Phase 5 ships, not just an engineering assumption.
- **Purpose-of-visit taxonomy is undefined** — the `VisitorLog.purpose` field is scoped as a `String` pending confirmation of the actual categories the Ministry wants (tourism/business/relocation/other, or something else); this is a product/stakeholder conversation to have during Phase 3 planning, not an engineering default to invent.

## Sources

### Primary (HIGH confidence)
- Direct source inspection: `backend/package.json`, `backend/apps/wallet-service/**`, `backend/apps/notifications-service/**`, `backend/nest-cli.json`, `backend/tsconfig.json`, `packages/proto/*.proto` and `generate.sh`, `backend/src/modules/tour-bookings/tour-settlement.service.ts`, `backend/src/modules/transport/transport.service.ts`, `backend/src/modules/delivery/delivery.service.ts`, `backend/src/modules/stays/stays.service.ts`, `backend/src/modules/webhooks/webhooks.service.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/common/guards/roles.guard.ts`, `backend/src/modules/admin/admin.controller.ts`/`.service.ts`, `backend/src/kafka/kafka.service.ts`, `backend/src/common/services/itinerary-pdf.service.ts`, `backend/src/common/services/paystack.service.ts`, `docker-compose.yml`, root and `backend/railway.toml`
- Verification actions: an actual `npx nest build wallet-service` run confirming `TS6059`; `grep` for `@OnEvent(` across `backend/src` confirming only 3 handlers exist codebase-wide; `grep` for `ClientGrpc|ClientProxyFactory|@Client(` confirming zero gRPC client usage anywhere
- npm registry live queries (2026-07-15) for current package versions
- [NestJS gRPC microservices docs](https://docs.nestjs.com/microservices/grpc), [Railway private networking docs](https://docs.railway.com/networking/private-networking/how-it-works), [Railway monorepo deploy docs](https://docs.railway.com/guides/monorepo), [Prisma connection docs](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [Meta for Developers — Authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates)

### Secondary (MEDIUM confidence)
- Strangler Fig / extraction-ordering pattern: [Confluent](https://developer.confluent.io/patterns/compositional-patterns/strangler-fig/), [OneUptime](https://oneuptime.com/blog/post/2026-02-17-how-to-implement-the-strangler-fig-pattern-to-migrate-monoliths-to-microservices-on-gke/view), [microservices.io](https://microservices.io/patterns/refactoring/strangler-application.html)
- gRPC vs REST for internal/external boundary: [Zuplo](https://zuplo.com/learning-center/rest-or-grpc-guide), [freeCodeCamp](https://www.freecodecamp.org/news/service-to-service-communication-when-to-use-rest-grpc-and-event-driven-messaging/)
- Cockatiel vs Opossum comparison: [cockatiel GitHub](https://github.com/connor4312/cockatiel), [opossum GitHub](https://github.com/nodeshift/opossum)
- Termii WhatsApp Token API: [Termii developer docs](https://developer.termii.com/send-whatsapp-token) — activation gating not independently verified
- WhatsApp template rejection/approval patterns: [WUSeller](https://www.wuseller.com/blog/whatsapp-template-approval-checklist-27-reasons-meta-rejects-messages/), [YCloud](https://www.ycloud.com/blog/common-whatsapp-api-template-message-rejection-reasons-with-fixes)
- Government/tourism dashboard reference patterns: [India Ministry of Tourism data portal](https://data.tourism.gov.in/), [Hawaii DBEDT Tourism Dashboard](https://dbedt.hawaii.gov/visitor/tourism-dashboard/)
- Marketplace multi-party reconciliation/audit trail: [Optimus.tech](https://optimus.tech/blog/payment-reconciliation-for-marketplaces), [Rexi Finance](https://rexi.finance/blog/payment-reconciliation-software/payment-reconciliation-audit-trails.html)

### Tertiary (LOW confidence)
- Termii WhatsApp OTP per-message pricing figure ($0.0566/msg) — single third-party aggregator (VerifyWay), flagged explicitly for direct verification with Termii before budgeting
- Nigeria NDPA consent interpretation for channel selection — [Clym](https://www.clym.io/regulations/nigeria-data-protection-act-ndpa), [GEPLAW](https://geplaw.com/the-cost-of-consent-a-turning-point-for-privacy-in-nigeria/) — legal-adjacent summaries, not NDPC's own guidance directly reviewed, flagged for legal review

---
*Research completed: 2026-07-15*
*Ready for roadmap: yes*
