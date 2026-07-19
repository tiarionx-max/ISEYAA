# Architecture Research: v2.1 Extraction Backlog Clearance & Settlement Flexibility

**Domain:** Integrating Delivery/news/waitlist/reviews gRPC extraction, blue-green deploys, scheduled exports, heatmap visualization, and settlement disputes/split tiers into ISEYAA's existing NestJS modular monolith + one live gRPC service (`notifications-service`)
**Researched:** 2026-07-19
**Confidence:** HIGH — all findings verified directly against source files (`backend/src/modules/delivery/*`, `backend/src/common/services/settlement.service.ts`, `backend/prisma/schema.prisma`, `docker-compose.yml`, `railway.toml` files, `packages/proto/*.proto`), not training-data assumptions.

This file supersedes the prior (2026-07-15, v2.0-scoped) version of this document — that milestone's findings (broken `rootDir` build, Dockerfile error-masking, zero client wiring, missing `MinistryModule`, no `SettlementService`) have all since shipped per `.planning/PROJECT.md` (Phases 10-17). This research does not re-litigate v2.0's settled decisions (real gRPC split over resilience-only, three-way settlement split reusing Phase 9's engine, `SettlementService` as the single atomic N-way fan-out primitive, `notifications-service` as the extraction proof-of-pattern). It focuses on how the 7 new v2.1 features attach to that now-shipped foundation.

---

## Q1 — Delivery + news/waitlist/reviews gRPC extraction

### Finding: Delivery is NOT one coupling problem, it's three, and they're independently sized

`packages/proto/delivery.proto` already defines 4 RPCs: `RequestDelivery`, `AcceptDelivery`, `VerifyDeliveryOtp`, `CompleteDelivery`. Reading `backend/src/modules/delivery/delivery.service.ts` line-by-line against that contract shows the coupling is uneven across the four:

| RPC | Wallet-adjacent? | Socket.IO-coupled? | Verdict |
|---|---|---|---|
| `VerifyDeliveryOtp` (`verifyOtp()`, line 489) | No — Redis OTP check + `deliveryOrder.update({ otpVerifiedAt })` only | No — zero `this.gateway.*` calls in this method | **Clean. Extract now.** |
| `RequestDelivery` (`requestDelivery()`, line 260) | No — order creation, fee estimate, Redis GEOSEARCH | Yes — line 313 `this.gateway.server.to('rider:'+nearestRiderId).emit('delivery:request', order)` | Wallet-clean but socket-coupled |
| `AcceptDelivery` (`acceptOrder()`, line 357) | No | Yes — line 387 `this.gateway.server.to('delivery:'+orderId).emit('rider:assigned', ...)` | Wallet-clean but socket-coupled |
| `CompleteDelivery` (`completeDelivery()`, line 525) | **Yes** — calls `SettlementService.settle()` (line 623) behind the `delivery.settlement_engine_enabled` flag (SETTLE-04 cutover) | Yes — line 770 `emit('delivery:completed', ...)` | **Do not extract.** |

`DeliveryGateway` (`backend/src/modules/delivery/delivery.gateway.ts`) is a plain `@WebSocketGateway()` with no explicit port — it attaches to the same HTTP server as the REST API (port 3001), i.e. the same process as `DeliveryService`. Every lifecycle transition in `DeliveryService` reaches into that same in-process `Server` instance directly (`this.gateway.server.to(room).emit(...)`) — there is no message bus between them today. Moving any of `RequestDelivery`/`AcceptDelivery`/`CompleteDelivery` into `delivery-service` as a separate Railway process breaks these `emit()` calls outright unless something bridges the two processes' Socket.IO servers.

**Recommendation for GRPC-07 (Delivery):**

1. **Extract `VerifyDeliveryOtp` only, this milestone.** It is the single RPC in the existing proto contract with zero wallet and zero socket coupling — same extraction shape as `notifications-service` (stateless, side-effect-free beyond Redis + one DB row). This gives GRPC-07 a real, safe increment without inventing new infrastructure.
2. **Keep `RequestDelivery`, `AcceptDelivery`, and `CompleteDelivery` (and `DeliveryGateway` itself) in the monolith this milestone.** `CompleteDelivery` is blocked on the same outbox/saga gap that already keeps Transport/Wallet/Tour* in-process (GRPC-05) — extracting it now would put a `SELECT FOR UPDATE` wallet transaction behind a network hop with no compensating-transaction safety net, which is exactly the risk profile the codebase has explicitly deferred everywhere else.
3. **If a fuller Delivery extraction is wanted in a future milestone, the actual prerequisite is a Socket.IO Redis adapter** (`@socket.io/redis-adapter`, backed by the existing Upstash Redis instance — no new infra cost), so `delivery-service` can `emit()` into rooms hosted by the monolith's `DeliveryGateway` (or vice versa) across processes. This is the standard fix for horizontally-scaled Socket.IO and is a smaller, better-scoped piece of work than a full outbox/saga — but it is still new infrastructure, so treat it as a separate future GRPC-0x item, not bundled into this milestone's Delivery slice.
4. Do **not** move `DeliveryGateway` itself this milestone. Mobile clients are already connected to it on the monolith's port 3001; moving it means a new public WS endpoint, a Redis-adapter dependency, and touching every lifecycle call site simultaneously — disproportionate to what GRPC-07 needs to deliver.

**"remaining core modules" (GRPC-07 second half):** Re-run the same wallet/gateway coupling check per module before claiming a clean extraction. From the existing caller-graph audit (Phase 17, GRPC-05) Wallet/Transport/Delivery/Auth/Tour* are wallet-adjacent and stay in-process. Among what's left unextracted (`events-service`, `stays-service`, `marketplace-service`, `admin-service`, `ai-service` scaffolds already exist per `backend/apps/`), Events/Stays/Marketplace/Studio all call `SettlementService.settle()` directly in their booking/purchase completion paths (confirmed: `marketplace.service.ts:285`, `events.service.ts:263`, `stays.service.ts:361`) — same blocker as Delivery's `CompleteDelivery`. Treat those as **not clean** either; `admin-service`/`ai-service` scaffolds are read-mostly (admin) or externally-vendored (ai, already resilience-wrapped) and are better GRPC-07 candidates than the settlement-triggering modules if "remaining core modules" needs a second target this milestone.

### Finding: news/waitlist/reviews are genuinely clean — but Reviews has one caveat

Grepped `backend/src/modules/news/news.service.ts`, `backend/src/modules/waitlist/waitlist.service.ts`, `backend/src/modules/reviews/reviews.service.ts` for `WalletService`/`SettlementService`/`wallet.` — **zero matches across all three.** None of them touch a wallet, a `PlatformConfig` split key, or `SettlementService`. They are the same extraction shape as `notifications-service`: CRUD + read endpoints, no atomic multi-recipient money movement.

**One caveat for Reviews (`reviews.service.ts`):** the aggregate-rating recompute (`recomputeTargetRating`, debounced via `scheduleRecompute`) uses an **in-memory `Map<string, NodeJS.Timeout>`** (`pendingRecomputes`) to coalesce bursts of reviews on the same target into one DB write. This is already documented in the code as "NOT cluster-safe" for horizontal scale-out. Extracting `reviews-service` to its own single Railway instance doesn't break this (the caveat is about *multiple instances of the same service*, not about being in a different process from the monolith) — but if `reviews-service` is ever scaled to 2+ replicas, this debounce needs to move to Redis (`SETEX` + leader-elect, or drop the debounce and always write immediately). Flag this as a known follow-up, not a blocker for GRPC-08.

**Recommendation for GRPC-08 (news/waitlist/reviews):** All three are clean, `notifications-service`-shaped extractions. Build order within GRPC-08: **waitlist → news → reviews** (waitlist is the simplest — no relations beyond its own table; news likely has zero or thin FK relations; reviews touches `TourBooking`/`TourGuide`/`TourPackage`/`Property` cross-module reads for eligibility checks and the rating-recompute writes, so it's the most work to wire into a separate Prisma-backed process even though it has no wallet dependency).

### New components needed for GRPC-07 (VerifyDeliveryOtp slice) and GRPC-08

- `backend/apps/delivery-service/` — new gRPC microservice scaffold (own `main.ts`, `app.module.ts`, `tsconfig.app.json`, `Dockerfile`, `railway.toml`), mirroring `backend/apps/notifications-service/` exactly. Only wires the `VerifyDeliveryOtp` RPC this milestone; the proto's other 3 RPCs stay unimplemented server-side in this service (or the whole delivery.proto could be split into a smaller `delivery-otp.proto` if you want the contract boundary to visibly match the extraction boundary — recommended, since a proto that advertises 4 RPCs but only implements 1 is misleading).
- `backend/apps/news-service/`, `backend/apps/waitlist-service/`, `backend/apps/reviews-service/` — same scaffold shape, one per module.
- `backend/src/modules/delivery-otp-client/` (or fold into existing `delivery` module) — new `ClientGrpc` registration + facade service, mirroring `backend/src/modules/notifications-client/notifications-client.module.ts` + `notifications-client.service.ts` exactly: `ClientsModule.registerAsync` with `NOTIFICATIONS_SERVICE_URL`-style env var (`DELIVERY_OTP_SERVICE_URL`, etc.), wrapped in `ResilienceService.execute('deliveryOtpGrpc', ...)` with a new `Vendor` entry added to `backend/src/resilience/resilience.types.ts`'s `RESILIENCE_DEFAULTS`.
- Equivalent `*-client` modules for news/waitlist/reviews, each adding a new `Vendor` key to `resilience.types.ts`.
- `docker-compose.yml` — add one service block per new gRPC service (copy the `notifications-service` block, new container name/port), and add each as a `depends_on: { condition: service_started }` for `backend`.
- `backend/nest-cli.json` — register each new `apps/*-service` as a build project (same as the 8 existing scaffolds already are).

---

## Q2 — Blue-green/canary deploys on Railway for 2+ gRPC services

### Finding: `notifications-service` currently has NO Railway healthcheck, and gRPC has no native HTTP healthcheck path

`backend/apps/notifications-service/railway.toml` has no `healthcheckPath` (unlike the monolith's `railway.toml`/`backend/railway.toml`, which both set `healthcheckPath = "/api/v1/health"`). This isn't an oversight to "fix later" — Railway's healthcheck mechanism expects an HTTP `GET`, and `notifications-service` only exposes port 5008 as raw gRPC. Without a healthcheck, Railway can only detect "process crashed" (via `restartPolicyType = "on_failure"`), not "process is up but broken" (e.g. DB connection exhausted, a bad deploy that boots but 500s every RPC). This gap matters more once GRPC-06 wants blue-green/canary, because canary promotion needs a real readiness signal, not just "the container didn't exit."

**What's needed for GRPC-06, concretely:**

1. **Add gRPC Health Checking Protocol (`grpc.health.v1.Health`) to every extracted service.** `@nestjs/microservices` supports registering additional services alongside the primary one in the same `Transport.GRPC` microservice — add a small `HealthController` implementing `Check`/`Watch` per the standard `grpc_health_v1` proto (widely available as an npm package or hand-rolled 2-message proto), served on the same port. This is the idiomatic gRPC-world equivalent of the monolith's `/api/v1/health` REST endpoint and is what load balancers/orchestrators (including Railway's own proxy and any future k8s-style tooling) expect to probe.
2. **Railway-specific canary mechanics:** Railway doesn't have a first-class "canary %" primitive like a service mesh does. The practical pattern on Railway for 2+ independently-deployed gRPC services is:
   - Each extracted service keeps its **own Railway service + own `railway.toml`** (already the established pattern — `backend/apps/notifications-service/railway.toml` sets `watchPaths` scoped to just that service's source, so unrelated monolith commits don't trigger a redeploy of it). Extend this per new service (`delivery-otp-service/railway.toml`, etc.) with matching `watchPaths` scoping.
   - Railway's built-in "deploy triggers on push, previous deploy stays live until the new one passes healthcheck" behavior **is** the blue-green primitive here — it already does not cut traffic to the new instance until `healthcheckPath` succeeds. This means step 1 (adding a real gRPC healthcheck) is the actual unlock for "blue-green," not a new Railway feature to configure. Today, with no healthcheck at all, Railway's rollout is closer to "recreate" than "blue-green" (new container starts, old one may already be torn down before the new one is confirmed serving traffic correctly).
   - True canary (X% of traffic to the new version before full cutover) is not natively supported by Railway's proxy for a raw TCP/gRPC port the way it is for HTTP services with weighted routing. If a genuine percentage-based canary is required (vs. Railway's default "health-gated full cutover"), the realistic v2.1-scoped option is an **application-level canary flag** — reuse the exact pattern already proven for the settlement engine cutover (`platformConfig` key `delivery.settlement_engine_enabled`, gated in `DeliveryService`): a `platformConfig` boolean/percentage key per gRPC client (e.g. `grpc.delivery_otp_service.enabled`) that `ClientGrpc`-calling code checks before routing to the extracted service vs. falling back to the still-present in-process implementation. **This only works if the in-process fallback code path still exists** — i.e. don't delete the monolith's original in-process `verifyOtp()` logic when extracting; keep both, flag-gated, exactly like Transport/Delivery's settlement cutover. This is more effort than Railway-native rollout but gives you the actual canary percentage control the question is asking about, using a pattern the team has already built and shadow-verified once (SETTLE-09's Stage 1 batch shadow-verify / Stage 2 live dual-run).
3. **`ClientGrpc` connection handling during cutover:** `@nestjs/microservices`' gRPC client (`ClientsModule.registerAsync`, as configured in `notifications-client.module.ts`) resolves its target via a static `url` from `ConfigService` at module init (`NOTIFICATIONS_SERVICE_URL`) and relies on gRPC's own channel-level reconnection (grpc-js retries/backoff at the connection level, independent of the `ResilienceService` cockatiel policies layered on top). During a Railway blue-green cutover, the DNS/URL for a service does **not** change — Railway services get a stable internal hostname, so the new container comes up behind the same `notifications-service:5008`-style address the client already targets. This means `ClientGrpc` does not need any reconfiguration during a cutover: the underlying gRPC channel will simply reconnect to whichever container Railway is currently routing that hostname to, once the healthcheck (item 1) gates the switch. The one thing to verify per new service: `ResilienceService`'s circuit breaker (`RESILIENCE_DEFAULTS[vendor].failureThreshold`) must be loose enough (or `halfOpenAfterMs` short enough) that a brief blue-green cutover window doesn't trip the breaker open and cause a cascade of `ServiceUnavailableException`s to end users — the existing `notificationsGrpc` entry (`timeoutMs: 5000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20000`) is a reasonable template to copy for new gRPC vendor entries, but confirm 8 consecutive failures won't realistically occur within one healthcheck-gated cutover window given the extracted service's actual request volume.

**Recommendation:** GRPC-06 (blue-green/canary) is infrastructure that benefits every future extraction, so it makes sense to build it **before** GRPC-07/GRPC-08 wire any new services into production traffic, or at minimum before flipping any new service's `ClientGrpc` client on for real users. Practically: add the gRPC health endpoint pattern to `notifications-service` first (retrofit, low risk, no new service yet), prove Railway's healthcheck-gated rollout actually behaves as expected for gRPC, *then* apply the same scaffold to the new services GRPC-07/GRPC-08 create. Don't build a bespoke percentage-canary flag system speculatively — only add it if Railway's native health-gated cutover proves insufficient once observed in practice.

### New components for GRPC-06

- Small `grpc.health.v1.Health` proto + `HealthController` per extracted service (shared boilerplate — worth a tiny `packages/proto/grpc-health.proto` + a reusable NestJS provider rather than copy-pasting per service).
- `railway.toml` per service updated with a gRPC-aware healthcheck once Railway's health-check config supports specifying a gRPC health check (verify current Railway support at build time — if Railway's `healthcheckPath` truly only supports HTTP, the fallback is a tiny sidecar HTTP `/healthz` in each gRPC service's same process, reusing `@nestjs/common`'s `HttpAdapterHost` alongside the `Transport.GRPC` microservice — NestJS supports a hybrid app that listens on both).
- No new `docker-compose.yml` structural change beyond what GRPC-07/08 already add — blue-green is a Railway-deploy-time concern, not a local-dev-compose concern.

---

## Q3 — Scheduled Ministry exports (MIN-08)

### Finding: this is a `@Cron` job, not a queue — the codebase already has 6 precedents and zero queue infrastructure

No BullMQ/Bull/Agenda/node-cron in `backend/package.json` — `@nestjs/schedule` (`^6.1.3`) is the only scheduling primitive in the codebase, and it's already used for exactly this shape of problem: `DeliveryService` (`@Cron(CronExpression.EVERY_30_SECONDS)`, match-timeout sweep), `TransportService` (same), `StaysService` (`@Cron(CronExpression.EVERY_HOUR)`, escrow release), and — most relevant — `TourNotificationsService` (`backend/src/modules/tour-bookings/tour-notifications.service.ts`), which already runs **three** `@Cron` jobs (`EVERY_HOUR`, two `'*/15 * * * *'`) to scan bookings and fire time-windowed SendGrid emails + push notifications, using idempotency flags stored in `metadata` JSON on the target row so a cron tick doesn't double-send.

This is a strong, proven precedent to copy directly for MIN-08. A queue (BullMQ etc.) would be new infrastructure this codebase has deliberately avoided everywhere else scheduling was needed — introducing one just for Ministry exports (a low-volume, infrequent job — daily/weekly recipient emails, not a high-throughput job stream) would be disproportionate and inconsistent with the existing pattern.

**Recommendation:** New `@Cron` job living in a **new dedicated service inside the existing `MinistryModule`** (`backend/src/modules/ministry/`), not `AdminModule` — the codebase already deliberately separated `MinistryController`/`MinistryService` from `AdminController`/`AdminService` specifically to keep the Ministry's read-only surface isolated (see the comment at the top of `ministry.controller.ts`: *"This controller MUST NEVER gain a @Patch/@Post/@Delete handler... isolated from every mutation endpoint"*). A scheduled export IS a mutation-adjacent concern (writing a delivery log row, sending email) — but it belongs architecturally with Ministry's domain (its data, its recipients, its export format code), not Admin's. Put the cron trigger in a new `MinistryExportSchedulerService` inside `MinistryModule`, separate class from `MinistryService` (which stays pure read-query) and separate from `MinistryController` (which stays GET-only) — this preserves both existing isolation invariants while adding the new capability.

**Reuse, don't rebuild:** `MinistryExportSchedulerService` should call the **exact same** `MinistryService.getVisitorEntriesByLgaAndMonth()` / `getPurposeBreakdown()` / `getRevenueToGovernment()` query methods and the **exact same** `CsvExportService.toCsv()` / `MinistryPdfService.renderPdf()` rendering methods the on-demand export routes already use (`MinistryController`'s `/export` endpoints, `ministry.controller.ts` lines 103-202) — zero duplication of query or rendering logic, only a new orchestration layer that runs on a timer instead of an HTTP request, writes the resulting buffer to an email attachment instead of an HTTP response, and records a delivery-log row instead of just streaming bytes back.

**Gap: `SendgridService` has no attachment support today.** Every existing method (`sendEmail`, `sendOtpEmail`, `sendTicketConfirmation`, etc. in `backend/src/common/services/sendgrid.service.ts`) calls `sgMail.send({ to, from, subject, html })` with no `attachments` field. `@sendgrid/mail` (already a dependency, v8.1.6) supports a base64-encoded `attachments` array natively — this needs a **new method**, e.g. `sendEmailWithAttachment(to, subject, html, attachments: { filename, content /* base64 */, type }[])`, added to `SendgridService`. Small, additive change; no existing call site needs to change.

### New components for MIN-08

- **Prisma model: `MinistryExportSubscription`** (or `MinistryExportRecipient`) — new table: `id`, `email` (or `userId` FK to a `MINISTRY_VIEWER`/`STATE_ADMIN` user), `reportType` (enum-like string: `'visitor-entries' | 'purpose-breakdown' | 'revenue'`, matching the existing `ExportSlug` union already used in the web dashboard), `frequency` (`'DAILY' | 'WEEKLY' | 'MONTHLY'`), `format` (`'csv' | 'pdf'`), `lgaId` (nullable, optional recipient-specific filter), `isActive`, `createdAt`/`updatedAt`. This is new — no existing table models "who wants a recurring report."
- **Prisma model: `MinistryExportDeliveryLog`** — `id`, `subscriptionId` FK, `sentAt`, `status` (`'SENT' | 'FAILED'`), `errorMessage` (nullable), `recipientEmail` (denormalized snapshot, so a later change to the subscription's email doesn't rewrite history). This is the audit trail the question asks for ("delivery log").
- **`MinistryExportSchedulerService`** (new, in `MinistryModule`) — one or a small number of `@Cron` jobs (daily tick is enough; weekly/monthly subscriptions are just "due today" checks against `frequency` + `lastSentAt`, same idempotency-flag-on-the-row pattern as `TourNotificationsService`) that: queries active subscriptions due today → calls the relevant `MinistryService` query method → renders via `CsvExportService`/`MinistryPdfService` → sends via the new `SendgridService.sendEmailWithAttachment()` → writes a `MinistryExportDeliveryLog` row.
- **New CRUD endpoints** on `MinistryController` (or a small new `MinistryExportSubscriptionController` if you want to keep `MinistryController` GET-only per its documented invariant — recommended, given the comment explicitly says that controller must never gain a mutating verb) for `MINISTRY_VIEWER`/`STATE_ADMIN` to create/list/deactivate their own subscription rows.
- **Web:** a small settings panel on `web/src/app/admin/ministry/page.tsx` (or a new sub-route) to manage subscriptions — reuses the existing `fetcher`/`api` client pattern already used throughout that page.

---

## Q4 — Settlement dispute/adjustment workflow (SETTLE-10)

### Finding: `SettlementService` has a proven compensating-transaction precedent (`RefundService`) — disputes should follow the same shape, not reverse rows in place

`SettlementService.settle()`'s idempotency and drift invariants (`backend/src/common/services/settlement.service.ts`) are locked (per its own header comment: *"Architectural commitments (LOCKED — carried over from Tour, do not deviate)"*) — one `$transaction`, `SELECT FOR UPDATE` on every wallet touched, idempotency via `reference`-prefix precheck + `P2002` fallback, reference scheme `${reference}-${refSuffix}`. A dispute workflow must not touch or rewrite existing `Transaction` rows (that would break the immutable audit ledger the whole system is built on) — it must **create new rows**, exactly like `RefundService.refund()` already does for buyer-side refunds (`backend/src/common/services/refund.service.ts`): the original charge `Transaction` is never mutated; a new `REFUND` transaction is written with reference `${paystackReference}-RFND`, balance-neutral where the money didn't actually move through the wallet (`gateway: 'PAYSTACK'`) or a real wallet debit/credit where it did (`gateway: 'WALLET'`).

**Answering "does a dispute reverse or compensate":** **Compensate, always.** Reversing a settlement `Transaction` row in place is exactly the anti-pattern the codebase has already engineered around (`RefundService`'s own doc comment: *"Balance neutrality... the row exists purely as a ledger marker for audit and idempotency"*). A dispute resolution should produce one or more new `Transaction` rows, keyed off the original settlement's reference, that net out to the corrected split.

**Key architectural gap this creates:** `SettlementService.settle()` currently has a **defensive floor check that rejects negative recipient amounts outright** (`settlement.service.ts` lines 108-116: *"a negative recipient amount... must never silently debit a wallet under CREDIT transaction semantics"*) — every credit in `settle()` is written as `type: 'CREDIT'`. A dispute that needs to **claw back** an over-paid recipient (e.g. Ministry was over-credited due to a wrong split tier, or a vendor was credited for a delivery later ruled fraudulent) cannot reuse `settle()` as-is, because `settle()` has no debit path. This needs a **new method** on `SettlementService`, not a bent version of `settle()` — e.g. `adjust(input: SettlementAdjustmentInput)` that:
- Takes an `originalReference` (must already exist as a settled `Transaction`, else reject — disputes can't be raised against non-existent settlements),
- Takes one or more `{ walletId, deltaNgn }` lines (positive = credit / negative = debit, both allowed here since this is a controlled internal correction path, not the general-purpose `settle()` entrypoint),
- Runs its own `$transaction` with `SELECT FOR UPDATE` on every wallet touched, in the **same canonical sorted-by-walletId lock order** `settle()` already uses (line 159 — must be reused verbatim to avoid the exact deadlock class `settle()`'s own comment describes for two settlements sharing wallets in different array order),
- Writes `Transaction` rows with reference `${originalReference}-ADJ-${n}` (parallel to `-RFND`), `type: 'DEBIT'` or `'CREDIT'` as appropriate, `metadata: { disputeId, module, adjustmentReason }`,
- Is itself idempotency-checked the same way (`reference`-prefix precheck before entering the transaction) so a dispute can't be double-applied.
- For a debit against a recipient (vendor/rider) wallet: **must check sufficient balance before debiting** (unlike `settle()`'s credit-only path, a debit can legitimately fail if the wallet has since been drained — e.g. vendor already withdrew). This needs an explicit insufficient-funds error path feeding into the dispute's state machine (see below) rather than a silent negative balance.

**New Prisma models (state machine):** Modeled directly on the existing `AdminReviewFlag` precedent (`backend/prisma/schema.prisma` line 1089 — `status: String @default("OPEN")`, `OPEN | IN_REVIEW | RESOLVED | DISMISSED`, `assignedTo`, `resolution`, `resolvedAt`) — same shape, same string-based status field (not a Prisma enum, matching the codebase's stated preference for flexibility here), extended with settlement-specific fields:

```prisma
model SettlementDispute {
  id                String    @id @default(uuid())
  settlementReference String  // the original Transaction.reference prefix this dispute targets
  module            String    // 'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio' | 'tour'
  raisedByUserId    String
  raisedBy          User      @relation(fields: [raisedByUserId], references: [id])
  reason            String
  status            String    @default("OPEN") // OPEN | IN_REVIEW | RESOLVED | DISMISSED
  requestedAdjustmentNgn Decimal? // what the raiser believes the correction should be, nullable (reviewer determines final)
  assignedTo        String?   // STATE_ADMIN/SUPER_ADMIN userId
  resolution        String?
  resolvedAt        DateTime?
  adjustmentReference String? // set once resolved+applied — the `${originalReference}-ADJ-*` prefix actually written
  metadata          Json?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([status])
  @@index([settlementReference])
  @@map("settlement_disputes")
}
```

State machine: `OPEN` (raised) → `IN_REVIEW` (assigned to a `STATE_ADMIN`/`SUPER_ADMIN` reviewer) → `RESOLVED` (adjustment computed and applied via `SettlementService.adjust()`, `adjustmentReference` recorded) or `DISMISSED` (no adjustment). This mirrors `AdminReviewFlag`'s transitions exactly, so the review-queue UI/controller patterns already built for review flags (`ReviewsService.findFlagQueue()`/`findFlagById()`/`resolveFlag()`) can be near-verbatim copied for a `SettlementDisputeService`.

**New components:**
- `backend/src/modules/settlement-disputes/` — new module: `settlement-disputes.controller.ts` (raise, list/queue, get, resolve — role-gated `STATE_ADMIN`/`SUPER_ADMIN` for review/resolve, any authenticated party who was a recipient in the original settlement for raise), `settlement-disputes.service.ts`, DTOs (`raise-dispute.dto.ts`, `resolve-dispute.dto.ts`).
- `SettlementService.adjust()` — new method, additive, does not change `settle()`'s signature or behavior (existing 6 call sites — transport/delivery/events/marketplace/stays/studio — are untouched by this change).
- `SettlementDisputeService.resolve()` calls `SettlementService.adjust()` inside its own resolution flow, catching the insufficient-funds case and surfacing it back as a `409`-style error so a reviewer knows the "obvious" resolution isn't mechanically applicable (e.g. vendor already withdrew) and needs a different remediation (platform wallet absorbs the shortfall, logged for manual reconciliation — decide this policy explicitly, don't leave it implicit).

---

## Q5 — Configurable per-module Ministry split tiers (SETTLE-11)

### Finding: the "flat model" is actually 6 call sites independently duplicating the same two-key read pattern — the real fix is centralizing the read, not just adding tiers

Grep across `transport.service.ts`, `delivery.service.ts`, `marketplace.service.ts`, `events.service.ts`, `stays.service.ts`, `studio.service.ts` shows **all six** independently do:
```ts
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<module>.platform_fee_pct' } });
const levyCfg = await this.prisma.platformConfig.findUnique({ where: { key: '<module>.govt_levy_pct' } });
```
...then compute the split inline before calling `settlementService.settle()`. This is a real per-module keying scheme already (each module has its own `PlatformConfig` rows), but it's flat (exactly 2 percentage keys per module, no concept of tiers — e.g. volume-based, date-effective, or category-based splits) **and duplicated 6 times** rather than owned by one resolver.

**Recommendation: replace the scattered flat keys with a structured `SettlementSplitTier` table, and centralize resolution inside `SettlementService` itself** (not `PlatformConfig` generic key-value rows, which can't cleanly express "more than 2 named percentages" or "multiple tiers per module" without inventing a JSON sub-schema inside `PlatformConfig.value` — a dedicated table is cleaner and matches how `ShadowSettlementComparison` and `AdminReviewFlag` are already modeled as dedicated tables rather than jammed into the generic config table).

```prisma
model SettlementSplitTier {
  id            String    @id @default(uuid())
  module        String    // 'transport' | 'delivery' | 'events' | 'marketplace' | 'stays' | 'studio' | 'tour'
  tierName      String    @default("default") // supports future volume/category tiering without a schema change
  minAmountNgn  Decimal?  // nullable — null means "no lower bound" (applies to 'default' tier)
  maxAmountNgn  Decimal?  // nullable — null means "no upper bound"
  earnerPct     Decimal   // vendor/rider/host share
  ministryPct   Decimal   // government levy share
  platformPct   Decimal?  // optional explicit platform cut; if null, platform absorbs the remainder (matches SettlementService's existing drift-absorption behavior)
  isActive      Boolean   @default(true)
  effectiveFrom DateTime  @default(now())
  metadata      Json?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([module, tierName])
  @@index([module, isActive])
  @@map("settlement_split_tiers")
}
```

- **`tierName` defaulting to `'default'`** means a straight migration of the existing 6 modules' current two-key values into one `SettlementSplitTier` row each (`tierName: 'default'`) is a zero-behavior-change migration — no call site's computed split changes on day one.
- **`minAmountNgn`/`maxAmountNgn`** give "tiers" real meaning (e.g. a `'high_value'` tier for Delivery orders above ₦50,000 with a different Ministry cut) without a schema change later — this is speculative but cheap to include now given the model's already being created; if the actual v2.1 requirement is only "per-module" (not "per-module-per-volume-tier"), these columns just stay unused (`null`/`null`, one row per module), no harm.
- **New method: `SettlementService.resolveSplit(module: string, amountNgn: number): Promise<{ earnerPct, ministryPct, platformPct }>`** — centralizes the lookup (queries `SettlementSplitTier` for the module, picks the tier whose `[minAmountNgn, maxAmountNgn]` range contains `amountNgn`, falls back to `'default'` if no range matches), replacing all 6 duplicated `platformConfig.findUnique` pairs. Mirrors the existing `resolveMinistryWallet()` method's "always fresh, never cached" discipline (line 319-328) — same freshness guarantee, same place on the class.

**Call sites that change:** `transport.service.ts`, `delivery.service.ts`, `marketplace.service.ts`, `events.service.ts`, `stays.service.ts`, `studio.service.ts` — each replaces its inline two-`findUnique` block with one `await this.settlementService.resolveSplit(module, amountNgn)` call before building the `SettlementRecipient[]` array passed to `settle()`. This is a mechanical, low-risk change per call site (same shape as the SETTLE-04 cutover already done for Transport/Delivery — swap the computation, keep the `settle()` call identical) and can be shadow-verified the same way SETTLE-09 already proved Transport/Delivery's cutover: compute both the old flat-key result and the new tiered result, log a `ShadowSettlementComparison`-style row, confirm zero discrepancy before switching any call site over for real.

**Migration/seed note:** `prisma/seed.ts` currently seeds the flat `<module>.platform_fee_pct`/`<module>.govt_levy_pct` `PlatformConfig` rows (referenced by `transport.service.ts`/`delivery.service.ts` comments citing seed line numbers). The migration needs a one-time data migration script that reads each module's existing two `PlatformConfig` rows and writes the corresponding `SettlementSplitTier` `'default'` row — do this as a Prisma migration + a one-off script, not a `seed.ts` edit alone, since production already has these `PlatformConfig` rows with real (possibly stakeholder-tuned) values that must carry over, not be reset to seed defaults.

---

## Bonus finding relevant to MIN-09 (heatmap) — no mapping library present today

Not one of the 5 core questions, but discovered while researching the Ministry dashboard: `web/package.json` has `recharts` (`^3.8.0`) but **no** `react-leaflet`/`mapbox-gl`/`@react-google-maps` — despite `GOOGLE_MAPS_API_KEY` existing as a documented env var, grepping `web/src` and `mobile/` for `google.maps`/`GoogleMap` usage returns nothing (the key is only referenced in mobile's native `AndroidManifest.xml`/`build.gradle`/`app.json` for the native Maps SDK, not the web dashboard). `LGA` already has nullable `latitude`/`longitude` columns, and `VisitorLog` already has `lgaId` + `visitedAt`, so the query side (`MinistryService.getVisitorEntriesByLgaAndMonth()`, already grouped by LGA+month) needs no new schema for a heatmap — only a rendering choice:
- **Cheapest, zero-new-dependency option:** an LGA-by-month **matrix/grid heatmap** (color-intensity cells, GitHub-contributions-graph style) built as a small custom SVG/React component or with `recharts`' existing primitives — no new library, no API key/cost, ships fastest.
- **True geo heatmap option:** `react-leaflet` + free OpenStreetMap tiles (no API key, no cost) plotting intensity at each LGA's `latitude`/`longitude` — more visually "map-like" but is a new dependency and a small new skill surface for the team; avoid Google Maps JS API specifically given it's unused today and has a real per-load cost that cuts against the project's stated ~$11/mo free-first cost target.
Recommend starting with the grid heatmap (reuses existing `recharts`/chart component patterns already in `web/src/components/admin/ministry/`) and only reaching for `react-leaflet` if the Ministry stakeholder specifically wants a literal map, not a data-density grid.

---

## Build Order Across All 7 Features

Ordering driven by three dependency chains found during this research, not by ticket number order:

1. **SETTLE-11 (split tiers) before SETTLE-10 (disputes).** A dispute's resolution needs to reference "what the correct split *should have been*" — if that's still 6 duplicated flat-key reads scattered across modules, the dispute resolver has no single source of truth to diff against. Once `SettlementService.resolveSplit()` exists, `SettlementDisputeService.resolve()` can call it directly to compute the corrected split, then feed the delta into the new `SettlementService.adjust()`. Building disputes first would mean either duplicating split-resolution logic inside the dispute service (throwaway work) or building `adjust()` against the old flat-key shape and refactoring it right after.

2. **GRPC-06 (blue-green health-check infra) before any new `ClientGrpc` client is flipped on for real users — i.e. before GRPC-07/GRPC-08's extracted services go live, even if their scaffolds are built in parallel.** The scaffolding work (new `apps/*-service` directories, proto contracts, `*-client` modules) has no ordering dependency on GRPC-06 and can proceed independently. But cutting real traffic to `VerifyDeliveryOtp` extraction (or news/waitlist/reviews) without a working healthcheck means Railway's rollout behaves like a blunt recreate, not the blue-green safety net the milestone is explicitly trying to add — do the healthcheck retrofit on the existing `notifications-service` first (cheap, no new service needed, immediately provable), then apply the same pattern when GRPC-07/GRPC-08's new services are ready to take live traffic.

3. **MIN-09 (heatmap) and MIN-08 (scheduled exports) are independent of each other and of everything else** — MIN-09 reads the same `MinistryService.getVisitorEntriesByLgaAndMonth()` query (or a close variant) the dashboard already has; MIN-08 wraps existing export rendering in a cron. Neither touches gRPC extraction or settlement. They can be built in either order or in parallel with the gRPC/settlement work; MIN-08 is slightly better done after MIN-09 only if both land in the same web dashboard update cycle (avoids two separate `/admin/ministry` page revisions in quick succession), but there's no technical dependency.

4. **Within GRPC-07, `VerifyDeliveryOtp` extraction has no dependency on GRPC-08's modules and vice versa** — parallelizable. Within GRPC-08, waitlist → news → reviews is the recommended internal order (increasing complexity, not a hard dependency).

**Recommended overall sequence:**

```
Phase A: SETTLE-11 (split tiers, centralize resolveSplit(), shadow-verify against existing 6 call sites)
Phase B: SETTLE-10 (disputes, built on resolveSplit() + new adjust() method)
Phase C: GRPC-06 healthcheck retrofit on notifications-service (small, independent, unblocks D/E going live)
Phase D: GRPC-07 (VerifyDeliveryOtp extraction) + GRPC-08 (waitlist/news/reviews extraction) — parallelizable, both gated on Phase C before real cutover
Phase E: MIN-08 + MIN-09 — parallelizable with everything above, no shared dependency
```

A and B together de-risk the highest-consequence code (money movement + a new state machine touching wallets) before touching deploy infrastructure or adding more independently-deployed processes to reason about. C before D avoids shipping new gRPC services into a deploy pipeline that still can't tell a "healthy but broken" cutover from a healthy one — repeating that exact gap for 3-4 new services compounds the operational risk each time. E has no reason to block on any of the above and is good filler/parallel work for a second workstream.

---

## Sources

All findings sourced directly from the ISEYAA repository at commit state as of 2026-07-19 (branch `microservices-redesign`):
- `backend/prisma/schema.prisma` (models: `PlatformConfig`, `VisitorLog`, `LGA`, `DeliveryOrder`/`DeliveryRider`/`DeliveryEvent`, `Transaction`, `AdminReviewFlag`, `ShadowSettlementComparison`)
- `backend/src/common/services/settlement.service.ts`, `refund.service.ts`, `sendgrid.service.ts`, `ministry-pdf.service.ts`
- `backend/src/modules/delivery/delivery.service.ts`, `delivery.gateway.ts`
- `backend/src/modules/ministry/ministry.controller.ts`, `ministry.module.ts`
- `backend/src/modules/reviews/reviews.service.ts`, `news/`, `waitlist/` (grepped, no wallet coupling found)
- `backend/src/modules/notifications-client/notifications-client.module.ts`, `notifications-client.service.ts` (extraction pattern template)
- `backend/apps/notifications-service/main.ts`, `Dockerfile`, `railway.toml` (live gRPC service template)
- `backend/src/resilience/resilience.service.ts`, `resilience.types.ts`
- `docker-compose.yml`, `railway.toml`, `backend/railway.toml`
- `packages/proto/delivery.proto`
- `.planning/PROJECT.md` (v2.0 shipped state, v2.1 active requirements)
- `backend/src/modules/tour-bookings/tour-notifications.service.ts` (`@Cron` precedent for MIN-08)
- `backend/src/modules/marketplace/marketplace.service.ts`, `events/events.service.ts`, `stays/stays.service.ts`, `studio/studio.service.ts` (flat split-key duplication, SETTLE-11 evidence)
- `web/package.json`, `web/src/app/admin/ministry/page.tsx` (heatmap library check)

No external/Context7/WebSearch sources were needed — this research is entirely a codebase-integration analysis for an existing internal system, not a survey of external ecosystem options.

---
*Architecture research for: ISEYAA v2.1 milestone integration*
*Researched: 2026-07-19*
