# Stack Research

**Domain:** Live gRPC extraction (Delivery + core modules + news/waitlist/reviews), Railway blue-green/canary deploys, scheduled Ministry export delivery, settlement dispute/adjustment + tiered splits (v2.1 milestone additions on top of the v2.0 gRPC/settlement/resilience foundation)
**Researched:** 2026-07-19
**Confidence:** HIGH (gRPC/health, Railway deploy behavior, Kafka/BullMQ/QStash tradeoffs — verified against official docs, live registry, and direct codebase inspection) / MEDIUM (exact dispute-workflow schema — inferred from the existing `SettlementService` implementation, not an external standard)

## Headline Finding

**None of the four v2.1 features require a new *mandatory* runtime dependency.** The stack already installed (`@nestjs/microservices` 11.1.19, `@grpc/grpc-js` 1.14.3, `@nestjs/terminus` 11.1.1, `@nestjs/schedule` 6.1.3, `@sendgrid/mail` 8.1.6, `fast-csv` 5.0.7, `pdfkit` 0.19.1, Prisma 5.22, `cockatiel` 3.2.1) already covers every mechanism needed. What's missing is **usage patterns**, not packages — confirmed by reading `backend/package.json`, `backend/apps/notifications-service/`, `backend/src/common/services/settlement.service.ts`, and `backend/prisma/schema.prisma` directly rather than assuming:

1. Every new `apps/*-service` gRPC scaffold needs an HTTP health endpoint it doesn't have today. Railway's healthcheck system is **HTTP-only, verified no TCP/gRPC support** — and `notifications-service`'s own `railway.toml` currently has **no `healthcheckPath`** at all, so it doesn't even get Railway's automatic zero-downtime swap today. Fix this before treating it as the extraction template for GRPC-07/08.
2. Delivery is wallet-adjacent (`SELECT FOR UPDATE` inside `completeDelivery()` → `SettlementService.settle()`); v2.0 explicitly deferred extracting it because a live gRPC boundary can't safely wrap that transaction without an outbox/saga. GRPC-07 pulls Delivery back into scope, so that outbox now has to actually be built — it needs a **Postgres-backed transactional outbox**, not a new message broker.
3. Railway has **no native canary or traffic-splitting** — confirmed directly against Railway's own docs and a staff-answered community thread. Railway's "blue-green" is *automatic, per-service* zero-downtime swap (new deployment must pass an HTTP healthcheck before the old one is retired); it does **not** coordinate two independently-versioned instances of the same service or shift a percentage of traffic between them.
4. `KafkaService`/`KAFKA_BROKER_URL` already exists in the repo (used today to decouple `WebhooksService` from Events/Marketplace/Stays/Studio settlement consumers) but is **dormant** — absent from `.env.example`, disabled unless the env var is set — and **Upstash Kafka was fully discontinued 11 March 2025**, so there is no drop-in free-tier provider to actually point it at anymore. Don't build the new Delivery outbox on top of it.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@nestjs/microservices` + `@grpc/grpc-js` (hybrid app pattern) | 11.1.19 / 1.14.3 (already pinned; 1.14.4 patch available for grpc-js, non-blocking) | Every new extracted service becomes a **hybrid application** — `NestFactory.create(AppModule)` → `app.connectMicroservice({transport: Transport.GRPC, ...})` → `app.startAllMicroservices()` → `app.listen(httpPort)` — instead of the gRPC-only `createMicroservice()` bootstrap `notifications-service` uses today | Confirmed current NestJS pattern (`docs.nestjs.com/faq/hybrid-application`, unchanged since Nest 6, verified against 2026 sources). Gives each new service both its gRPC port *and* an HTTP port purely for `/healthz` — required because Railway can only healthcheck HTTP endpoints |
| `@nestjs/terminus` | ^11.1.1 (already pinned, powers the monolith's `/api/v1/health`) | Reuse the exact `HealthController`/`HealthCheckService` pattern from `backend/src/health/` for every new service's `/healthz` | Zero new dependency; keeps healthcheck implementation identical across the monolith and every extracted service, no drift |
| Prisma schema additions (no version change) | ^5.22.0 (already pinned) | New models: `OutboxEvent` (wallet-adjacent extraction reliability), `SettlementDispute` + `SettlementAdjustment` (dispute workflow); widen `PlatformConfig.value` JSON shape for tiered splits | Reuses the single ORM already governing every other domain table (Wallet, Transaction, PlatformConfig, AuditLog) — no second data-access layer, no migration-tooling change |
| `@nestjs/schedule` | ^6.1.3 (already pinned, already used for the Stays escrow-release cron) | Cron trigger for (a) scheduled Ministry export delivery (MIN-08) and (b) the outbox-relay poller for Delivery's gRPC extraction (GRPC-07) | Railway runs ISEYAA as a **persistent container**, not a serverless/edge function — in-process cron has no cold-start problem to solve, so a full queue system is unjustified (see "What NOT to Use") |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `grpc-js-health-check` | 1.2.2 | Implements the standard gRPC Health Checking Protocol (`grpc.health.v1.Health`) server-side, layered on the same grpc-js server `@nestjs/microservices` already creates | Optional, additive to the mandatory HTTP `/healthz`. Gives the monolith's `ClientGrpc` callers — and a future canary router — a protocol-native way to ask "is this specific gRPC instance healthy," distinct from Railway's own HTTP probe. Most useful once two live instances of the same service (canary + stable) exist and the caller must pick one |
| `@sendgrid/mail` | ^8.1.6 (already pinned) | Extend `SendgridService` with an `attachments: [{content: base64, filename, type, disposition: 'attachment'}]` array | MIN-08: attach the CSV/PDF the cron job generates directly to the recurring Ministry export email. Native SDK feature — no version bump, no new package, no new vendor |
| `fast-csv` / `pdfkit` | ^5.0.7 / ^0.19.1 (already pinned) | Reuse `CsvExportService` / `MinistryPdfService` (already built in `CommonModule` for the on-demand `MinistryModule` export endpoints) as the payload generator the cron job calls | The scheduled job is a thin wrapper: cron fires → call the existing export service methods → email the result as an attachment. No new generation library, no duplicate PDF/CSV code path |
| `class-validator` / `class-transformer` | ^0.14.1 / ^0.5.1 (already pinned) | DTOs for the new dispute-submission/resolution endpoints (`RaiseSettlementDisputeDto`, `ResolveSettlementDisputeDto`) and for validating the new tiered `PlatformConfig.value` JSON shape before an admin write persists it | Matches the codebase's existing DTO-at-every-boundary convention; catches a malformed tier-array JSON blob at config-write time instead of at settlement time, where it would silently corrupt a real payout |
| `@railway/cli` | 5.27.0 | Scripted blue-green cutover: create/verify a canary service, poll `/healthz`, flip the monolith's `*_SERVICE_URL` variable, remove the retired instance | Add as a root devDependency **only if** the team wants a repeatable CI/ops script rather than clicking through the Railway dashboard per cutover. Railway's GraphQL Public API (plain `fetch` — Node 20 has it natively, no client library needed) is the alternative if this logic should live inside a NestJS ops command instead of a shell script |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Per-service `railway.toml` (`healthcheckPath`, `healthcheckTimeout`, `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`) | Turns on Railway's native automatic zero-downtime swap for each extracted service | Copy the root `backend/railway.toml`'s `[deploy] healthcheckPath = "/api/v1/health"` pattern into every `backend/apps/<service>/railway.toml` — currently only the monolith has this; `notifications-service/railway.toml` has neither `healthcheckPath` nor an HTTP listener to point it at. Set `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` generously (30-60s) so in-flight long-lived gRPC/HTTP2 streams drain before the old deployment is killed |
| Railway GraphQL Public API (`https://backboard.railway.app/graphql/v2`) | Programmatic service create/deploy/variable-set/remove for a scripted blue-green or config-driven canary cutover | No SDK needed — Node 20's built-in `fetch`. Use this (or `@railway/cli`) to script the "two named services + env-var swap" pattern below, since Railway itself won't orchestrate a multi-service coordinated swap |
| k6 / Artillery (already used per PROJECT.md Phase 6 load-test scripts) | Load-test a canary instance before promoting it to 100% traffic | Reuse existing scripts against the canary service's private-network address before flipping the routing weight/flag to full traffic |

## Installation

```bash
# Optional gRPC-native health protocol (per new extracted service, backend workspace)
npm install grpc-js-health-check --workspace=backend

# Optional: scripted Railway cutover tooling (root devDependency)
npm install -D @railway/cli
```

No other installs are required. Extraction, scheduling, and dispute/adjustment work is schema + code-pattern work layered on already-pinned packages — do not add a queue, a message broker, a feature-flag SaaS, or a second money-precision library for this milestone (see "What NOT to Use").

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Postgres transactional outbox (`OutboxEvent` table + `@nestjs/schedule` poller + `cockatiel` retry) for the Delivery wallet-adjacent extraction | `KafkaService` (already in repo, dormant) | Only if the team provisions a real Kafka broker (Confluent Cloud free tier, Aiven, Redpanda serverless — **not** Upstash Kafka, discontinued 11 March 2025) for reasons beyond this one extraction, e.g. genuine multi-consumer fan-out. For a single Delivery→wallet delivery-confirmation path, a polled outbox table needs no new infra and matches the free-first cost target |
| Config-driven canary routing (extend the existing `platformConfig` boolean-flag cutover pattern proven in SETTLE-09 into a weighted/percentage flag consumed by the monolith's `ClientGrpc` factory) | Dedicated feature-flag service (Unleash self-hosted, LaunchDarkly) | Only if rollout decisions need to be made by non-engineers through a UI, or need audience targeting beyond simple percentage/hash-based splits across many features at once — disproportionate for gating ~10 gRPC service cutovers |
| `SettlementService` extended with a peer `adjust()`/`reverse()` method (same `$transaction` + `SELECT FOR UPDATE` + reference-prefix idempotency architecture, new reference namespace) | A new dedicated ledger/accounting library (e.g. `medici`) | Only if ISEYAA needed full double-entry bookkeeping across an arbitrary chart of accounts — the existing `Transaction`/`Wallet` model with reference-suffix idempotency already functions as a working single-entry ledger; a second ledger abstraction for just disputes would fragment the audit trail `AuditLog` already covers |
| `@nestjs/schedule` cron for MIN-08 | BullMQ + `@nestjs/bullmq` (11.0.4) against a dedicated Upstash Redis DB | Only if Ministry export delivery grows into high-fan-out (many recipients, each needing independent retry/backoff/dead-letter visibility) — at that point BullMQ's job-level retry and observability earn their cost. Not justified for one recurring job |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Istio / Envoy / Linkerd (service mesh) for canary routing | Railway is a PaaS container platform, not Kubernetes — there's no pod to sidecar-inject into, and self-hosting a mesh control plane for ~10 gRPC services blows the ~$11/mo cost target by orders of magnitude | Config-driven weighted routing in the monolith's `ClientGrpc` factory (see Alternatives above) |
| LaunchDarkly / Unleash SaaS for the canary flag | New paid/self-hosted infra for a capability the codebase already has proven in-house (SETTLE-09's `*.settlement_engine_enabled` `platformConfig` flags) | Extend the existing `platformConfig` flag pattern to carry a percentage/weight, not just a boolean |
| BullMQ + a dedicated Redis queue for MIN-08 | BullMQ requires `maxmemory-policy: noeviction` on its Redis instance (hard requirement, verified against BullMQ's own "going to production" docs and a maintained GitHub issue) — conflicts with the existing shared Upstash Redis' `allkeys-lru` cache policy, would need a second Upstash database, and Upstash's own docs warn BullMQ polls continuously even when idle, incurring extra pay-as-you-go command cost for a job that only needs to fire weekly/monthly | `@nestjs/schedule` `@Cron()` in-process, same mechanism as the existing Stays escrow-release cron |
| Upstash QStash for scheduled exports | QStash is an HTTP-callback scheduler purpose-built for serverless/edge functions that don't stay warm between invocations — ISEYAA's backend is a long-running Railway container that never needs waking up. Adopting it adds a new SaaS dependency, a new publicly-reachable signed webhook endpoint (`@upstash/qstash`'s `Receiver` signature verification becomes new attack surface), and new cost to solve a cold-start problem this stack doesn't have | `@nestjs/schedule` `@Cron()` |
| Provisioning `KAFKA_BROKER_URL` against Upstash Kafka | Upstash fully discontinued Kafka 11 March 2025 (deprecation window started Sept 2024) — not a currently-viable free-first option | Postgres outbox table (below) for the Delivery extraction; leave `KafkaService` dormant unless a real broker (Confluent Cloud, Aiven, Redpanda serverless) is separately justified for other reasons |
| Debezium / CDC-based outbox relay | Requires a Kafka Connect cluster to tail the Postgres WAL — heavy operational surface for relaying one event type (delivery-completion) at low volume | A polled `OutboxEvent` table via `@nestjs/schedule` (poll every 1-2s, mark `PROCESSED`/`FAILED`, `cockatiel`-wrapped retry on the outbound gRPC call) |
| Temporal.io or another saga/workflow orchestration engine | The wallet-adjacent extraction only needs "commit the local `SELECT FOR UPDATE` wallet write, then reliably deliver one gRPC call at-least-once with retry" — not multi-step long-running workflow orchestration | Outbox table + `cockatiel` retry (already pinned) is sufficient for this single hop |
| `decimal.js` / `big.js` for dispute/adjustment amounts | `SettlementService` already does all money math in JS `Number` with kobo-rounding (`Math.round(x*100)/100`) and a documented ±₦0.02 drift tolerance. Introducing arbitrary-precision decimals for just the new dispute/adjustment rows creates two divergent money-math systems writing to the same `Transaction` table | Reuse the existing `Number` + rounding convention verbatim in the new `adjust()`/`reverse()` method |
| Mutating or deleting existing `Transaction`/`Wallet` rows to "fix" a disputed settlement | Breaks the idempotency precheck (`Transaction.reference` prefix `startsWith` match) other `SettlementService.settle()` callers rely on, and destroys the audit trail `AuditLog` is meant to preserve | Always append a new, distinctly-referenced compensating entry (see Stack Patterns below); never edit settlement history |

## Stack Patterns by Variant

**If extracting a read-mostly module (news, waitlist, reviews):**
- Follow the `notifications-service` pattern almost verbatim, but bootstrap as a **hybrid app** (HTTP `/healthz` + gRPC), not gRPC-only — these three modules have no wallet writes, so no outbox is needed
- Wire `railway.toml` with `healthcheckPath = "/healthz"` from day one — the gap `notifications-service` currently has

**If extracting Delivery (wallet-adjacent):**
- Add an `OutboxEvent` Prisma model (`id`, `eventType`, `payload Json`, `status ENUM(PENDING|PROCESSING|PROCESSED|FAILED)`, `attempts`, `createdAt`, `processedAt`) and write to it **inside the same `$transaction`** as the `SELECT FOR UPDATE` wallet mutation — e.g. via `SettlementInput.onSettled` in `SettlementService.settle()` — so the DB commit is atomic with the wallet write, and the cross-process gRPC call becomes an independent, retryable, at-least-once side effect driven by a `@nestjs/schedule` poller wrapped in `cockatiel`
- This is the piece v2.0 explicitly called "out of scope" for wallet-adjacent modules. GRPC-07 makes it in-scope, so it must land *before* Delivery's gRPC cutover flips live — mirroring how SETTLE-09's shadow-verify gate preceded the Transport/Delivery settlement cutover

**If doing the Railway blue-green swap for a single already-healthy service:**
- Just add `healthcheckPath`/`healthcheckTimeout`/`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` — Railway's automatic per-service swap (new deployment healthy → traffic moves → old deployment retired after the overlap window) already gives you this for free, no extra tooling

**If doing a true percentage-based canary across two coexisting versions:**
- Deploy the canary as a **second, distinctly-named Railway service** in the same project/environment (e.g. `delivery-service-canary` alongside `delivery-service`)
- Route from the monolith's `ClientGrpc` factory using a `platformConfig`-driven weight (reusing the SETTLE-09 flag pattern) — deterministic hash-based selection (e.g. `hash(orderId) % 100 < canaryWeight`) keeps a given in-flight order pinned to one instance for its whole lifecycle instead of round-robining mid-flow
- Promote by raising the weight to 100, then deleting the canary service; roll back by dropping the weight to 0 — both are `platformConfig` writes, no redeploy required, matching the "platform fee source always from DB, never hardcoded" constraint

**For the dispute/adjustment workflow:**
- Add `SettlementDispute` (status, module, originalReference, raisedByUserId, reason, evidence `Json?`, resolvedByUserId, resolution, resolvedAt) as the case record
- Resolve a dispute by calling a **new** `SettlementService.adjust()` method — same `$transaction` + `SELECT FOR UPDATE` + idempotency architecture as `settle()`, but supporting both directions. Credit corrections can reuse `settle()`'s existing CREDIT-only path; debit corrections need a separate guarded path since `settle()` currently throws on negative recipient amounts by design (WR-02) — this is intentional CREDIT-only semantics, not a bug, so don't loosen `settle()` itself
- Reference scheme: `ADJ-${disputeId}` as the new settlement root — never reuse the original `${reference}` namespace, since that string is owned by the original settlement's idempotency precheck (`startsWith` match). Platform/system wallet still absorbs drift, same tolerance
- Every adjustment writes an `AuditLog` row (`action: 'SETTLEMENT_ADJUSTMENT'`, `oldValue`/`newValue` = the transaction deltas) — reuses the existing model, no new audit infra

**For configurable per-module Ministry split tiers:**
- Keep `PlatformConfig` as the source of truth (constraint: platform fee source always from DB, never hardcoded) but change the **shape** of the JSON `value` for split-related keys from a flat number (e.g. Delivery's current `govtLevyPct = 5`) to a tier array: `{"tiers":[{"upToNgn": 5000, "ministryPct": 5, "platformPct": 15}, {"upToNgn": null, "ministryPct": 7, "platformPct": 13}]}`
- Validate that shape with a `class-validator` DTO on the admin write path (`AdminModule`'s config-update endpoint) so a malformed tier list fails fast at config-write time, not at settlement time
- The existing `Number(cfg.value)` reads in `delivery.service.ts`/`transport.service.ts` become a small tier-resolution helper (`resolveTierPct(tiers, orderAmountNgn)`) — no schema migration needed since `PlatformConfig.value` is already `Json`

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@nestjs/microservices@11.1.19` | `@nestjs/core@11.1.20`, `@grpc/grpc-js@1.14.3`, `@grpc/proto-loader@0.8.1` | Already proven together in `notifications-service`. The hybrid-app addition (`connectMicroservice()`) runs on the same `INestApplication` instance — no version changes required |
| `grpc-js-health-check@1.2.2` | `@grpc/grpc-js@1.14.x` | Peer-compatible; registers against the same grpc-js server instance `@nestjs/microservices`' gRPC transport already creates |
| `@nestjs/terminus@11.1.1` | `@nestjs/common@11.1.20`, `@nestjs/core@11.1.20` | Already pinned and running in the monolith's `/api/v1/health` — identical major version across the monolith and every new service app, no drift risk |
| `@nestjs/schedule@6.1.3` | Current single-instance Railway deployment topology | `@Cron()` handlers are **not distributed-lock-safe**. Fine at today's single-replica scale for both the outbox poller and the Ministry export job. If the monolith or an extracted service is ever horizontally scaled to >1 replica, add a Redis `SET NX` lock (using the already-present `ioredis` client) around the cron body before that happens — not before |
| Upstash Redis (existing, `allkeys-lru`) | BullMQ (`noeviction` requirement) | Explicitly NOT recommended for MIN-08 (see What NOT to Use) — flagged here so a future researcher doesn't re-propose it without re-reading this constraint |
| `@iseyaa/proto` (`packages/proto`, `ts-proto@2.11.8`, `grpc-tools@1.13.0`) | All 15 `.proto` contracts already exist (auth, wallet, events, marketplace, notifications, stays, admin, ai, transport, delivery, tour-packages, tour-guides, news, waitlist, reviews) | No proto-authoring work needed for GRPC-07/08 — `generate.sh`'s glob (`./packages/proto/*.proto`) already picks up every module. Only the `apps/<service>` NestJS scaffold + wiring is new work |

## Sources

- `docs.nestjs.com/faq/hybrid-application` and `docs.nestjs.com/microservices/grpc` — hybrid application + gRPC transport pattern, confirmed current via 2026-dated third-party guides referencing the same API (HIGH confidence)
- Railway docs: `docs.railway.com/deployments/healthchecks`, `docs.railway.com/deployments/deployment-actions`, `docs.railway.com/overview/production-readiness-checklist` — healthcheck is HTTP-only, no native cross-service blue-green/canary, rollback/redeploy/cancel/remove actions documented (HIGH confidence, fetched directly)
- Railway Station (community, staff-participated): `station.railway.com/questions/how-to-blue-green-deploy-d83c8864` — confirms Railway's automatic swap is per-service only, no cross-service coordination; workaround patterns (nginx routing, unified containers) discussed but not endorsed (MEDIUM-HIGH confidence)
- Railway Station: `station.railway.com/feedback/add-support-for-tcp-or-grpc-healthchecks-c6768f58` and a related "how to support both grpc and http for a railway service" thread — confirms no TCP/gRPC healthcheck support as of this research date; private-network same-environment gRPC has no protocol restriction (HIGH confidence)
- `upstash.com/docs/redis/integrations/bullmq`, `docs.bullmq.io/guide/going-to-production`, GitHub `taskforcesh/bullmq#2737` — BullMQ `noeviction` hard requirement and Upstash pay-as-you-go continuous-polling cost caveat (HIGH confidence, official docs + maintained issue)
- `upstash.com/blog/workflow-kafka`, `upstash.com/docs/kafka/connect/deprecation` — Upstash Kafka discontinued 11 March 2025 (HIGH confidence, official announcement)
- `upstash.com/docs/qstash/features/schedules`, `github.com/upstash/qstash-js` — QStash HTTP-callback/cron design, serverless-first positioning (MEDIUM-HIGH confidence)
- npm registry (`npm view <pkg> version`, checked live 2026-07-19) — `bullmq@5.80.9`, `@upstash/qstash@2.11.2`, `grpc-js-health-check@1.2.2`, `@grpc/grpc-js@1.14.4`, `@nestjs/bullmq@11.0.4`, `@railway/cli@5.27.0` (HIGH confidence, live registry read)
- Direct codebase inspection: `backend/package.json`, `backend/src/common/services/settlement.service.ts` (full read — idempotency, locking order, drift tolerance, CREDIT-only guard), `backend/src/kafka/kafka.service.ts` + all 9 call sites (grepped), `backend/src/health/health.controller.ts`, `backend/apps/notifications-service/{main.ts,railway.toml}`, `backend/railway.toml`, `docker-compose.yml`, `backend/prisma/schema.prisma` (Wallet, Transaction, PlatformConfig, AuditLog, ShadowSettlementComparison models), `packages/proto/*.proto` + `generate.sh` + `package.json` (all 15 modules already have contracts), `backend/src/modules/delivery/delivery.service.ts` (current flat-percentage split reads), `backend/src/modules/ministry/ministry.controller.ts` + `common/services/{csv-export,ministry-pdf}.service.ts` (existing on-demand export to extend), `backend/src/common/services/sendgrid.service.ts` (no attachment support yet), `.env.example` (Kafka undocumented/dormant) — every recommendation grounded in what actually exists today, not assumed

---
*Stack research for: live gRPC extraction, Railway blue-green/canary, scheduled Ministry exports, settlement dispute/adjustment + tiered splits — ISEYAA v2.1*
*Researched: 2026-07-19*
