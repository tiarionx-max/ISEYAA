# Pitfalls Research

**Domain:** Extending a live government fintech-adjacent super-app (ISEYAA v2.1) with (1) live gRPC extraction of a wallet-adjacent, WebSocket-stateful module (Delivery) beyond the one proven stateless extraction (notifications-service), (2) blue-green/canary deploy infrastructure per extracted service, (3) scheduled/recurring Ministry exports, (4) a dispute/adjustment workflow on an already-idempotent N-way settlement ledger, and (5) a flat-to-tiered migration of the platform fee config that must never violate the "always from DB, never hardcoded" constraint.
**Researched:** 2026-07-19
**Confidence:** HIGH — every pitfall below is derived directly from reading the live implementation (`settlement.service.ts`, `refund.service.ts`, `delivery.service.ts`, `delivery.gateway.ts`, `ministry.service.ts`, `ministry.controller.ts`, `sendgrid.service.ts`, `redis.service.ts`, `schema.prisma`, `notifications-grpc.controller.ts`, `railway.toml`, `docker-compose.yml`) and the explicit prior-milestone decision log in `STATE.md`/`PROJECT.md`, not generic gRPC/microservices advice. One external fact (Railway's lack of native canary support) is MEDIUM confidence, cross-referenced against Railway's own docs/help-station threads.

## Critical Pitfalls

### Pitfall 1: Delivery's In-Memory Match-Timeout and Socket.io Room State Are Not Portable Across a Process Boundary

**What goes wrong:**
`DeliveryService.scheduleMatchTimeout()` uses `SchedulerRegistry.addTimeout()` — a plain Node.js `setTimeout` held in the process's own memory, not persisted to Redis or the DB. `DeliveryGateway` holds a bare `socket.io` `Server` with rooms (`delivery:{orderId}`, `rider:{riderId}`, `user:{userId}`) that only exist in that process's memory, and `DeliveryService` is wired to it via `forwardRef(() => DeliveryGateway)` — a tight, same-process coupling. The one proven extraction (`notifications-service`) is deliberately stateless: no WebSocket, no in-memory timers, request/response only. Delivery is the opposite: it is the first extraction target with both a wallet-touching settlement path AND live per-request in-memory state. If Delivery moves to its own `apps/delivery-service` process (mirroring the `notifications-grpc.controller.ts` pattern of importing the existing service class directly), every `SEARCHING` order's 60-second timeout and every open rider/sender socket connection is scoped to whichever single process instance currently owns it. A restart, redeploy, or the "old" side of any rolling/blue-green cutover silently drops those timers and sockets — orders get stuck in `SEARCHING` forever (never reaching `expireUnmatchedOrder()`), and connected clients see WebSocket drops with no automatic re-subscription to server-side state that no longer exists anywhere.

**Why it happens:**
The team's only successful precedent (`notifications-service`) never had to solve this problem — it has zero durable, in-memory, per-request state. Extracting Delivery by following the same "import the existing service class into a new `main.ts`" recipe copies the code faithfully but does not address that `scheduleMatchTimeout`/`SchedulerRegistry` and `socket.io` rooms were written assuming exactly one long-lived process.

**How to avoid:**
- Before extracting Delivery, replace `SchedulerRegistry.addTimeout()` with a durable mechanism: a Redis key with TTL (`delivery:match:{orderId}`, TTL 60s) plus a `@Cron`-driven sweep that finds `SEARCHING` orders older than 60s and expires them — this survives process restarts and works correctly even with multiple replicas (unlike an in-memory timer).
- Decide explicitly whether `DeliveryGateway` moves with `DeliveryService` into the new process or stays in the monolith and communicates with the extracted service via gRPC/event bus. Either choice needs a design doc; neither is free (see Pitfall 3).
- If keeping Socket.io in the extracted process, add the Socket.io Redis adapter (`@socket.io/redis-adapter`) so rooms/broadcasts work correctly the moment there is more than one replica of that process (required for GRPC-06's blue-green/canary regardless of extraction — see Pitfall 4).
- Write an explicit test: kill the process holding a `SEARCHING` order's timeout mid-flight and confirm the order still expires (via the Redis-TTL/cron sweep, not the dead in-memory timer).

**Warning signs:**
- Any code review of the delivery-service extraction that ports `SchedulerRegistry.addTimeout` verbatim without discussing durability.
- Orders visibly stuck in `SEARCHING` status in production after any deploy of the delivery-service process.
- Load/chaos test that never actually restarts the delivery-service process mid-order-lifecycle (the notifications-service extraction's test suite had no equivalent scenario to reuse).

**Phase to address:**
The GRPC-07 phase, as a prerequisite design step before any code is physically moved — the durable-timeout replacement should ship and be proven (unit + restart test) before Delivery is cut over to its own process, not discovered after go-live.

---

### Pitfall 2: Extracting a Wallet-Touching Module Reopens the GRPC-05 Landmine That Was Explicitly Deferred — Now Against Live Money

**What goes wrong:**
`STATE.md` records the exact reasoning for why Delivery (and Transport, Wallet, Events, Stays, Marketplace, Auth, Tour) stayed in-process during v2.0: *"their `SELECT FOR UPDATE` wallet transactions can't safely span a gRPC boundary without an out-of-scope outbox/saga redesign."* GRPC-07 now asks to extract exactly this module. There are two ways to do it, and only one is safe without the deferred redesign: (a) the extracted `delivery-service` process embeds its own copy of `SettlementService` + `PrismaService`, talking directly to the same Neon Postgres over its own connection — this actually preserves `SELECT FOR UPDATE` correctness because Postgres enforces the row lock at the database level regardless of which OS process holds the connection; or (b) `delivery-service` calls a separately-extracted `wallet-service` over gRPC for the debit/credit — this is the actual distributed-transaction problem the GRPC-05 decision was protecting against (a network hop between "order marked DELIVERED" and "rider actually paid," with no shared transaction spanning both). Because "GRPC-07: Delivery + remaining core modules" and the existing `backend/apps/{admin,ai,auth,events,marketplace,stays,wallet}-service` scaffolds already exist (built but never wired live), there is a real risk that this milestone extracts Wallet as its own live gRPC service in the same pass as Delivery — at which point option (b) becomes unavoidable and the exact failure mode flagged (and deliberately avoided) last milestone is now live against Transport/Delivery settlement traffic that has since gone through shadow-verification and may be past its D-08 bake-period gate.

**Why it happens:**
"Remaining core modules" reads as one uniform backlog item, but Wallet is qualitatively different from every other module — it is the one dependency everything else in the settlement graph needs synchronously. Treating gRPC extraction order as "whatever's left, in whatever order" rather than explicitly sequencing Wallet last (or never as a network-called leaf dependency) is how this regresses.

**How to avoid:**
- Explicitly re-affirm, as a milestone-scoping decision (not an implicit default), that Delivery's extraction uses option (a) — its own embedded `SettlementService`/`PrismaService` talking directly to Postgres — and that Wallet itself is NOT extracted into a network-called service this milestone, exactly mirroring the GRPC-05 reasoning.
- If any "remaining core module" extraction requires calling Wallet's debit/credit synchronously over gRPC, build and prove the outbox/idempotent-event pattern first, scoped to that one call path, before shipping it — do not let it slip in as a side effect of "extracting the rest."
- Audit every extracted service's `app.module.ts` for whether it imports `WalletModule`/`WalletService` directly (safe — same-process, same-DB) vs. a generated `wallet.proto` gRPC client (unsafe without the outbox redesign).
- Re-run the existing Stage-1/Stage-2 shadow-verification scripts (`ShadowSettlementComparison`, already built in Phase 13) against the extracted topology before flipping any cutover flag that wasn't already live pre-extraction — extraction itself is a new risk surface even for settlement paths already shadow-verified in the monolith.

**Warning signs:**
- Any new `.proto` file exposing `Debit`/`Credit`/`Settle` RPCs intended to be called synchronously from another extracted service's request handler.
- `delivery-service`'s `app.module.ts` importing a generated gRPC wallet client instead of `CommonModule`/`SettlementModule` directly.
- No re-verification step for Transport/Delivery settlement correctness specifically in the *extracted* topology (as opposed to the monolith topology it was originally shadow-verified in).

**Phase to address:**
GRPC-07 scoping, before any extraction code is written — this is a sequencing/architecture decision, not something to discover mid-implementation. Should be the first thing documented in the phase plan.

---

### Pitfall 3: No Client-Facing Routing Layer Exists for Split REST + WebSocket Traffic Once Delivery Leaves the Monolith

**What goes wrong:**
Today, mobile and web clients hit one base URL (`EXPO_PUBLIC_API_URL`/`NEXT_PUBLIC_API_URL`) for both REST (`/api/v1/delivery/*`) and WebSocket (`socket.io` on the same port 3001, no explicit port arg per `delivery.gateway.ts`'s own comment). `notifications-service` never had to solve client routing because it is called *internally* via `ClientGrpc` from the monolith — no citizen-facing client ever talks to it directly. Delivery is different: its REST endpoints and its WebSocket gateway are both directly client-facing. Once `delivery-service` is a separate deployed process (its own Railway service, its own URL), either (a) clients need code changes to route delivery-specific traffic to a new base URL — a mobile app release, not just a backend deploy — or (b) an API gateway/reverse proxy needs to sit in front of both processes and route by path, which does not exist in this stack today (Railway's per-service public domains are separate URLs by default).

**Why it happens:**
"Extract the service" is scoped as backend work, but Delivery's WebSocket surface makes it a full-stack change the moment it's client-facing and no longer sharing a port with the REST API clients already know about — this is easy to miss because the *code* extraction can be done and tested (backend integration tests) without ever noticing the mobile/web app still points at the old monolith URL for delivery traffic.

**How to avoid:**
- Decide and document the routing strategy before extraction starts: either a shared gateway/proxy in front of Railway services that routes `/api/v1/delivery/*` and delivery's `socket.io` namespace to the new process (preferred — no client release needed), or an explicit mobile/web release that adds a second base URL for delivery traffic.
- If using a gateway, confirm it supports WebSocket upgrade passthrough (`Upgrade: websocket` header forwarding) — not all simple path-based reverse proxies do this by default.
- Sequence any client-facing URL change behind a feature flag or staged rollout so a routing misconfiguration doesn't immediately break live delivery tracking for in-flight orders.
- Test the WebSocket connection path end-to-end against the actual extracted topology (not just REST) before considering the extraction complete — the "looks done but isn't" risk here is a REST integration test suite passing while WebSocket connectivity silently breaks.

**Warning signs:**
- Extraction plan/checklist that only lists REST endpoint verification, no explicit WebSocket connectivity test against the new topology.
- Mobile/web `EXPO_PUBLIC_API_URL`/`NEXT_PUBLIC_API_URL` unchanged and undiscussed in the extraction plan.
- No gateway/proxy component in the phase's architecture diagram — traffic routing assumed to "just work."

**Phase to address:**
GRPC-07, as an explicit cross-cutting sub-task alongside the backend extraction — must be resolved before Delivery is cut over, since it is a prerequisite for the extraction being usable by real clients at all.

---

### Pitfall 4: Railway Has No Native Canary/Blue-Green — a DIY Traffic-Shift Double-Fires Every Un-Locked `@Cron` Job and Orphans In-Flight State

**What goes wrong:**
Railway's deployment model is rolling-by-default with healthcheck gating — it does not offer percentage-based canary traffic shifting or first-class blue-green out of the box (confirmed against Railway's own docs/help-station discussion, 2026). Any GRPC-06 implementation that wants real blue-green/canary behavior for extracted services will need to build it (e.g., two parallel Railway services + a feature-flag/proxy layer, or two environments with manual DNS/weight shifting). During the window where both the old and new replica are simultaneously live and receiving traffic (which any homegrown blue-green necessarily creates, even briefly), every `@Cron` job in that service fires independently per-process — this codebase has no Redis-based leader election or lock guarding any of its existing crons (`DeliveryService.cleanStaleRiderHeartbeats`, `TransportService`'s equivalent, `StaysService`'s hourly escrow release, `TourNotificationsService`'s T-24h/T-2h reminder crons, `DbMetricsService`'s gauge push, and the new MIN-08 scheduled export cron this milestone adds). A blue-green cutover window therefore means: heartbeat cleanup runs twice (harmless), but escrow release and the new Ministry export email could each fire twice — the former risks a double-processing race on the same unbatched loop, the latter sends the Ministry a duplicate report email. Separately, any in-flight WebSocket connections or in-memory timers (Pitfall 1) held by the "old" replica being torn down are lost the moment that replica exits, regardless of how graceful the cutover is, because nothing durable backs them.

**Why it happens:**
"Blue-green/canary deploy" is scoped as an infrastructure/DevOps task, but on a platform (Railway) without native support for it, any workable implementation necessarily creates a window of dual-liveness that this codebase's existing crons and in-memory state were never designed to tolerate — this is invisible in a single-replica deploy model (today's reality) and only surfaces once GRPC-06 actually introduces concurrent replicas.

**How to avoid:**
- Before building blue-green/canary infrastructure, add a Redis-based cron lock to every existing `@Cron` job using the already-present `RedisService.setNx()` primitive (`redis.service.ts`, currently only used in `wallet.service.ts` — never in a cron) so only one replica's cron tick actually executes per interval, everywhere, project-wide — this is cheap, already has the right primitive in the codebase, and protects every cron this milestone touches or leaves untouched.
- Treat "blue-green/canary deploy" as requiring, not optional alongside, the durable-state work in Pitfall 1 — do not ship GRPC-06 for Delivery specifically until its match-timeout and WebSocket state are Redis/cron-backed rather than in-memory.
- Explicitly document the chosen traffic-shift mechanism (proxy weights, DNS, feature flag) and its actual guarantees — do not assume "Railway will handle it" since it structurally cannot provide percentage-based canary without an added layer.
- Load-test the actual dual-liveness window (both replicas live, real traffic split) specifically for cron double-fire and WebSocket session loss, not just steady-state throughput.

**Warning signs:**
- Any `@Cron` handler with no `setNx`/distributed-lock guard, reviewed as part of a phase that also ships multi-replica deploy infrastructure.
- A "blue-green implemented" claim with no test that actually runs two replicas simultaneously and observes cron/job behavior during the overlap window.
- Ministry stakeholders reporting duplicate scheduled-export emails after a deploy.

**Phase to address:**
GRPC-06, with the cron-lock hardening as an explicit prerequisite sub-task (cheap, mechanical, should ship first) before the traffic-shifting mechanism itself is built — sequence it ahead of, or bundled with, whichever extracted service (Delivery, per GRPC-07) is the first to get blue-green treatment.

---

### Pitfall 5: The Existing Ministry PII-Allowlist Safety Net Does Not Automatically Cover MIN-08/MIN-09's New Endpoints

**What goes wrong:**
`ministry-pii-allowlist.spec.ts` (built in Phase 14 to satisfy MIN-07) is a real, working dual-scanner (key-denylist + value-canary) — but it explicitly only exercises the 3 existing query methods (`getVisitorEntriesByLgaAndMonth`, `getPurposeBreakdown`, `getRevenueToGovernment`). It is not a global interceptor or a generic contract test that automatically applies to every future `MinistryController`/`MinistryService` method. MIN-08 (scheduled export) and MIN-09 (heatmap) both add new query surfaces and, in MIN-08's case, an entirely new delivery path (email) — if either is built by extending `MinistryService` with a new method that isn't explicitly added to the scanner's test cases, the automated protection that was built specifically to prevent a Ministry PII leak (previous milestone's Pitfall 7) silently does not apply to the new code, even though a developer reasonably assumes "the Ministry PII test suite" already covers it.

**Why it happens:**
Test suites named generically ("Ministry PII allowlist") create a false sense of blanket coverage; in reality this one is enumerated per-method, and nothing fails loudly when a new method is added without a corresponding scanner invocation — it's an opt-in pattern, not an opt-out one.

**How to avoid:**
- Add every new `MinistryService` method introduced by MIN-08/MIN-09 to the existing scanner's test cases before the corresponding controller route ships — treat this as a hard checklist item in the phase plan, not implied by "the PII test suite already exists."
- Consider refactoring the scanner into a helper (`assertMinistryResponseIsPiiSafe(fn)`) that phase plans can trivially invoke for any new query method, reducing the chance of an omission.
- If MIN-08's scheduled export reuses the same underlying query methods that MIN-01 through MIN-07 already cover (i.e., it just automates delivery of an already-scanned response), explicitly confirm and document that — don't assume without checking, since a "scheduled" variant might reasonably pull a wider/raw dataset for efficiency (see Pitfall 6) that the original scanner never saw.
- For MIN-09's heatmap, if it requires any new join or aggregate not already covered (e.g., a different visitor-log projection), it needs its own new scanner test case, not reuse of an existing one.

**Warning signs:**
- A new `MinistryService` method with no corresponding entry in `ministry-pii-allowlist.spec.ts`.
- Code review approving a new Ministry export/heatmap endpoint citing "the PII test suite passes" without confirming the new method is actually exercised by it.

**Phase to address:**
Both MIN-08 and MIN-09 phases, as an explicit per-method checklist item — verify with a grep-style check ("does every public `MinistryService` method appear in the allowlist spec?") as a lightweight regression guard.

---

### Pitfall 6: Scheduled Export Delivery Has No Attachment Support, No Cron-Level Dedup, and Inherits the Unbounded-Query Risk for Recurring "All History" Runs

**What goes wrong:**
`SendgridService.sendEmail(to, subject, html)` has no attachment parameter anywhere in the current implementation — every existing email (OTP, ticket confirmation, booking confirmation, studio booking) is HTML-body-only, some embedding an image URL, never a file attachment. MIN-08 ("scheduled/recurring Ministry export delivery") most naturally reads as "email the Ministry a CSV/PDF on a schedule," which requires new SendGrid attachment plumbing (base64-encoded content, correct MIME type, SendGrid's ~30MB total-message-size cap) that doesn't exist today. Compounding this: `MinistryService.getRevenueToGovernment()` and the visitor-entry queries already run unbounded when `from`/`to` are omitted (by design, per the D-10 comment: "no phase-14-ship-date floor... covers all historical data"). A *recurring* job that runs this same unbounded query on every tick (e.g., weekly "full history to date") will keep growing in row count and PDF/CSV size indefinitely, eventually exceeding SendGrid's attachment size limit and failing silently or loudly depending on how errors are handled — and because `SendgridService.sendEmail()` already swallows errors internally (`catch` + `logger.error`, no rethrow), a failed scheduled export could fail every week with nothing surfaced to an operator unless a dedicated check is added.
Separately, without a Redis-based lock on the new export cron (see Pitfall 4), any dual-liveness window sends the Ministry the same report twice.

**Why it happens:**
"Scheduled export delivery" sounds like it's reusing an already-built export path (MIN-05/MIN-06's CSV/PDF generation), but that path was designed for synchronous, on-demand, browser-download use — not for unattended recurring delivery, which has different requirements (attachment plumbing, bounded/incremental date ranges, failure alerting, dedup) that aren't a natural extension of the existing code.

**How to avoid:**
- Extend `SendgridService` with an explicit attachment-capable method (or a link-based delivery pattern instead — e.g., upload the export to R2/S3 and email a signed link, sidestepping SendGrid's size cap entirely and reusing the existing `S3Service` already in `CommonModule`).
- Design the recurring job's date range as an explicit rolling window (e.g., "since last successful run" or "last calendar month"), never "all history," both to bound size and to make each scheduled export meaningfully different from the last rather than a growing superset.
- Guard the new cron with `RedisService.setNx()` (see Pitfall 4) from day one — do not add it as an afterthought once double-delivery is observed in production.
- Make export-delivery failure loud: if the recurring job's send fails, it should not just log-and-swallow (the existing `sendEmail` convention) — add an explicit alert path (Sentry/Grafana, already in the stack) so a silently-failing weekly Ministry report is actually noticed.

**Warning signs:**
- A cron handler that calls `getRevenueToGovernment()`/`getVisitorEntriesByLgaAndMonth()` with no `from`/`to` bound on every scheduled tick.
- New export-delivery code calling `SendgridService.sendEmail()` with a base64 CSV/PDF stuffed into the `html` parameter (the only way to "attach" content with the current signature) rather than a proper attachment or a link.
- No test simulating a large/multi-year dataset against the scheduled export path.

**Phase to address:**
MIN-08, as the phase's core design decision (rolling window + attachment/link strategy + cron lock) before any scheduling code is written.

---

### Pitfall 7: LGA Heatmap Visualization Assumes Geographic Boundary Data That Doesn't Exist in the Schema

**What goes wrong:**
The `LGA` model (`schema.prisma`) stores exactly one `latitude`/`longitude` pair per LGA (a centroid point) — there is no polygon/boundary geometry field, and `web/package.json` has no mapping library (`leaflet`, `mapbox`, or similar) installed anywhere in the current dependency tree. "Seasonal/LGA heatmap visualization" (MIN-09) most naturally suggests a choropleth (LGA boundaries shaded by intensity) — which is not buildable from the current data model without sourcing external Ogun State LGA GeoJSON boundaries, an unbudgeted dependency this milestone hasn't scoped. The fallback (a point-density heatmap using only 20 LGA centroids, e.g., `leaflet.heat`) is technically buildable today but visually reads as "20 fuzzy dots," not a convincing heatmap, and stakeholders expecting a proper choropleth (a very plausible expectation for a government dashboard) will see the gap only at demo time.

**Why it happens:**
"Heatmap" is used loosely in product requirements to mean "a visual intensity map," but the two common implementations (point-density vs. boundary choropleth) have very different data requirements, and nobody has yet confirmed which one is expected or whether boundary data is in scope to source.

**How to avoid:**
- Clarify with the stakeholder, before implementation, whether a point-density visualization (fast, no new data needed) or a true LGA-boundary choropleth (requires sourcing/import of Ogun State LGA GeoJSON, plus a new `boundary`/`geoJson` field on the `LGA` model) is expected — this is a scope decision, not an implementation detail, and changes the phase's effort significantly.
- If a choropleth is required, source the boundary data (Nigeria has publicly available LGA-level shapefiles/GeoJSON from OCHA/HDX or similar) as an explicit data-import sub-task, and add a migration for the new geometry field — don't discover the missing data mid-implementation.
- Pick and add a mapping library (`react-leaflet` + `leaflet.heat`, or `mapbox-gl` if a token/budget is available) explicitly in this phase's dependency list — it is not already present.
- If point-density is acceptable, set expectations that only 20 discrete points exist (all of Ogun State's LGAs) — weight/radius tuning can make this look reasonable, but it is fundamentally different from a choropleth and should be presented as such, not silently substituted.

**Warning signs:**
- Phase plan for MIN-09 with no explicit mention of GeoJSON/boundary data sourcing or a stated decision to use point-density instead.
- No new mapping library added to `web/package.json` during implementation despite a "heatmap" being delivered (suggests a non-map visual substitute, e.g., a bar/table "heatmap," which may not match stakeholder expectations for a *map*).
- Human-verification checkpoint for MIN-09 that doesn't include a specific visual review against what "heatmap" was assumed to mean.

**Phase to address:**
MIN-09 scoping, as the very first step — the boundary-vs-centroid decision determines the phase's actual size and should be resolved before implementation estimate/plan is finalized.

---

### Pitfall 8: The Dispute/Adjustment Workflow Has No Existing Primitive to Reverse a Multi-Recipient Settlement — `RefundService` Only Unwinds the Buyer Side

**What goes wrong:**
`RefundService.refund()` only ever touches ONE wallet: the buyer's (`input.walletId`), either crediting it back (WALLET gateway) or calling Paystack's refund API (card gateway) — it has no concept of, and never touches, the recipient-side credits `SettlementService.settle()` already paid out (e.g., a Delivery rider's `RIDER` credit, the `MINISTRY` levy credit, the platform commission credit). SETTLE-10 ("settlement dispute/adjustment workflow") implies the ability to correct or reverse a *completed* settlement after the fact — e.g., a delivery dispute where the rider is later found to have never delivered the parcel, requiring the rider's earnings to be clawed back and the buyer made whole. There is no existing service method that does this: `SettlementService.settle()` has an explicit defensive check (*"a negative recipient amount... must never silently debit a wallet under CREDIT transaction semantics"*) that REJECTS negative amounts outright — meaning `settle()` cannot be reused, even conceptually, to "settle a reversal." Building dispute reversal by improvising a new debit path also surfaces a real fintech problem this codebase has never had to solve: what happens when the rider/vendor being clawed back has already withdrawn or spent the disputed funds and their wallet balance is now insufficient to cover the debit — every existing debit path (`WalletService.debit`) assumes sufficient balance and throws otherwise; a dispute-driven debit needs an explicit policy (allow negative balance / IOU tracking, block until resolved, or partial recovery) that doesn't exist anywhere in the codebase today.

**Why it happens:**
"Dispute/adjustment workflow" sounds like it should compose naturally out of `RefundService` + `SettlementService`, since both already exist and are well-tested — but they were built for two different, narrower problems (single-sided buyer refund; forward N-way payout) and neither was designed with reversal-of-an-already-paid-recipient in mind. The gap only becomes visible once someone traces exactly which wallets a real dispute needs to touch.

**How to avoid:**
- Design SETTLE-10 as a genuinely new primitive — e.g., `SettlementReversalService.reverse(originalReference, adjustments[])` — that explicitly debits each affected recipient wallet (with its own `SELECT FOR UPDATE`, its own idempotency key, and its own insufficient-balance policy) and separately credits the buyer/platform as appropriate, rather than trying to force-fit it through `settle()`'s existing negative-amount guard or `refund()`'s single-wallet scope.
- Explicitly decide and document the insufficient-balance policy for a clawback debit before implementation (block the debit and flag for manual/offline recovery vs. allow a negative wallet balance as a tracked receivable) — this is a product/compliance decision (government platform, real gig-worker money), not just an engineering default.
- Preserve the full audit trail requirement already implicit in every other wallet mutation in this codebase: every dispute-driven wallet change must produce its own `Transaction` row (type could be a new `ADJUSTMENT`/`CLAWBACK` enum value, not overloaded onto existing `CREDIT`/`DEBIT`/`REFUND` semantics) referencing the original settlement's reference for traceability.
- Add an explicit test proving a dispute reversal correctly debits ALL affected recipients (not just the most obvious one) for a multi-recipient settlement (rider + Ministry + platform), since it is easy to build and test only the "obvious" single-recipient reversal case.

**Warning signs:**
- Any SETTLE-10 implementation that calls `settle()` with negative `amountNgn` values expecting it to "just work" (it will throw, by design).
- A dispute workflow that only touches the buyer's wallet, leaving the rider/vendor's already-paid earnings untouched even when the dispute finding is "rider did not deliver."
- No explicit decision documented on what happens when a clawback debit would take a wallet negative.

**Phase to address:**
SETTLE-10, as the foundational design task before any dispute UI/endpoint is built — this is the same class of "build the engine, prove it, then wire it up" discipline the project already applied successfully to the forward settlement engine (Phase 12 before Phase 13's cutover); the reversal primitive deserves the same sequencing.

---

### Pitfall 9: Dispute Adjustments Re-Entering `settle()`/`refund()` Collide With Existing Reference-Prefix Idempotency Scans and Silently No-Op

**What goes wrong:**
`SettlementService.settle()`'s idempotency precheck is a `startsWith` scan: *any* existing `Transaction` row whose `reference` begins with `${input.reference}-` is treated as proof the settlement already ran, and the call returns a silent `REPLAYED` no-op. `RefundService.refund()` similarly keys off a fully deterministic `${paystackReference}-RFND` — calling it twice for the *same* original reference, even with a different amount or reason the second time (e.g., a first partial refund followed by a later, separate dispute-driven full reversal), returns the *first* call's cached result and does nothing new, because the uniqueness check is purely reference-based, not content-aware. If SETTLE-10 implements "issue a dispute adjustment" as "re-run settlement/refund logic using the original booking's reference," it will collide with these existing idempotency guards exactly as designed — except "designed" here meant "prevent accidental duplicate webhook delivery," not "block a legitimate second, distinct adjustment on the same order." The dispute would appear to succeed (no error thrown — a `REPLAYED`/cached response looks identical to a normal success) while actually changing nothing, which is a dangerous silent-failure mode for a government audit trail specifically, since the underlying wallet balances are unaffected while the dispute record says "resolved."

**Why it happens:**
The idempotency design was correctly built to solve a narrower problem (webhook redelivery / concurrent duplicate settlement calls for the SAME event) and was never designed to distinguish "this is a retry of the same event" from "this is a deliberately new, second event referencing the same order." Reusing the same reference namespace for both is the natural-looking but incorrect implementation path.

**How to avoid:**
- Give every dispute/adjustment its own reference namespace, distinct from the original settlement's prefix — e.g., `ISY-DLV-{orderId}-ADJ-{adjustmentId}` rather than reusing `ISY-DLV-{orderId}` or `ISY-DLV-{orderId}-RFND` — so it neither collides with nor is silently absorbed by the original settlement's `startsWith` idempotency scan.
- If reusing `RefundService` for the buyer-side portion of a dispute, generate a distinct `paystackReference` input per adjustment (not the original charge reference) so its own `${...}-RFND` key doesn't collide with a prior legitimate refund on the same order.
- Add an explicit test: issue two distinct adjustments against the same original settlement reference and confirm BOTH are applied (not the second silently absorbed as a replay of the first).
- Surface a loud signal (not just a debug log) whenever a dispute/adjustment call resolves to a `REPLAYED`/no-op outcome, since for this workflow specifically that outcome is far more likely to indicate a bug (reference collision) than a benign duplicate delivery.

**Warning signs:**
- Dispute/adjustment code paths that construct their idempotency key by directly reusing `booking.paymentReference`/`order.id` with no adjustment-specific suffix.
- A dispute marked "resolved" in the application's dispute-tracking table with no corresponding new `Transaction` row in the wallet ledger.
- QA test plan for SETTLE-10 that only exercises a single adjustment per order, never two adjustments on the same order in sequence.

**Phase to address:**
SETTLE-10, as part of the same reversal-primitive design work as Pitfall 8 — the reference-namespacing decision should be made and tested alongside the multi-recipient reversal logic, not treated as a separate later concern.

---

### Pitfall 10: Migrating the Flat `PlatformConfig` Percentage to Per-Module Tiers on an Untyped `Json` Column Risks NaN-Corrupted Wallet Balances or a Silent Fallback to Hardcoded Defaults

**What goes wrong:**
`PlatformConfig.value` is a bare `Json` column (`schema.prisma`) with no schema/type enforcement at the database level. Every existing call site reads it the same way: `cfg ? Number(cfg.value) : <hardcoded fallback>` — e.g., Delivery's own code today: `const govtLevyPct = levyCfg ? Number(levyCfg.value) : 5;`. This pattern already has one documented near-miss in the codebase (the `WR-01` comment on the cutover-flag read: *"strict equality avoids Boolean('false') === true footgun on the untyped Json PlatformConfig column"*) — proof this Json column has already caused a subtle bug once. SETTLE-11 ("configurable per-module Ministry split tiers") requires changing SOME modules' config value from a flat number (`20`) to a structured tier shape (e.g., `[{minVolume: 0, pct: 20}, {minVolume: 1000, pct: 15}]`). Two concrete failure modes follow directly from the existing code pattern: (1) if the read-side helper isn't updated in lockstep with the write-side migration, `Number(cfg.value)` on a tiered array/object silently produces `NaN` — and `NaN` fails BOTH the `r.amountNgn < 0` defensive check AND the `Math.abs(drift) > 0.02` drift-tolerance assertion in `SettlementService.settle()` (JavaScript's `NaN` comparisons are always `false`, a language quirk that defeats both existing safety nets at once), meaning a `NaN` amount could reach `wallet.balance = before + NaN` uncaught; (2) even without a hard crash, the existing `cfg ? Number(cfg.value) : <hardcoded fallback>` pattern means a malformed/wrongly-shaped tiered config doesn't error loudly — it just silently falls through to the hardcoded default on every single call (`Number(cfg.value)` returning `NaN` is truthy for the `cfg ?` check since `cfg` itself is non-null, so the fallback is NOT triggered — the `NaN` is what actually gets used), which is a direct, silent violation of the explicit "platform fee source must always come from DB, never hardcoded" constraint: the code still nominally "reads from DB," it just reads something meaningless and either corrupts money or (if some downstream `Math.round`/percentage math coincidentally produces `0`) silently zeroes out a real fee.

**Why it happens:**
The Json column was never given a runtime schema/validator (e.g., zod) at the config-read boundary, so "the shape changed" is not something any existing code path can detect — it was implicitly safe only because every module's config value happened to be a plain number until now. Generalizing to tiers is exactly the kind of change that breaks an implicit, unenforced assumption silently rather than loudly.

**How to avoid:**
- Add explicit runtime validation (zod, already a dependency in `web`/`mobile` — consider adding to `backend` for this purpose, or a hand-written type guard) at every config-read call site that SETTLE-11 touches, so a malformed/wrong-shaped value throws immediately rather than silently producing `NaN` or falling through unnoticed.
- Version or namespace the config key when changing its shape — e.g., keep `delivery.govt_levy_pct` (flat, for modules not yet migrated) fully separate from a new key like `delivery.govt_levy_tiers` (structured) rather than overloading the same key with two possible shapes; this makes "which modules are on tiers vs. flat" explicit and greppable, and prevents a shared/generalized helper from misreading one module's flat value as another's tier array.
- Add an explicit `isNaN()`/`Number.isFinite()` guard directly inside `SettlementService.settle()`'s existing negative-amount check (defense in depth) so a `NaN` amount is rejected with a loud, named error — regardless of what upstream config-reading mistake produced it — closing the exact gap where `NaN < 0` and `Math.abs(NaN) > 0.02` both silently evaluate `false`.
- Write a regression test that feeds a deliberately malformed/wrong-shape `PlatformConfig.value` (array where a number was expected, `null`, missing keys) through every migrated call site and asserts a loud failure, not a silent `NaN`/fallback.
- Do not migrate Transport's or Delivery's ALREADY-LIVE flat config keys to the tiered shape in the same change that introduces tiering for new/other modules — keep the live cutover-flagged modules on their proven flat-key format unless and until tiering is explicitly, separately proven safe for them (mirrors the project's own "never combine engine-generalization and live-module-cutover in one phase" lesson from the original settlement generalization).

**Warning signs:**
- Any `Number(cfg.value)` call site left unmodified after SETTLE-11 introduces a tiered shape for that same config key.
- No `isNaN`/`Number.isFinite` guard anywhere in the settlement/fee-calculation path despite the config value's type now being union-shaped (number OR tier array) rather than guaranteed-number.
- A wallet balance investigation turning up a transaction row with an `amount` that doesn't parse as a normal Decimal, or a driver/rider payout of exactly `0` or a suspiciously round/wrong number after a config migration.
- `PlatformConfig` key reused across a shape change (same key, old rows still flat-number, new rows now tiered) rather than versioned/namespaced.

**Phase to address:**
SETTLE-11, as the phase's core design decision — the key-namespacing and validation-guard work must ship BEFORE any module's config is actually migrated to a tiered shape, and Transport/Delivery's live flat keys should be explicitly excluded from the first pass of this migration.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Porting `DeliveryService`/`DeliveryGateway` into `delivery-service` verbatim, keeping `SchedulerRegistry`/in-memory Socket.io state | Fastest path to "Delivery is extracted" | Stuck `SEARCHING` orders and dropped live-tracking sockets on every restart/redeploy/cutover | Never once GRPC-06 (multi-replica) is in play; borderline acceptable only for a single-replica, no-blue-green interim state, and even then risks data loss on every plain restart |
| Reusing `RefundService`/`settle()` unmodified as the implementation of dispute reversal | No new service to build | Reversals silently no-op (idempotency collision) or fail outright (negative-amount guard) — a government audit trail showing "resolved" disputes with no matching wallet movement | Never — build a dedicated reversal primitive |
| Overloading an existing `PlatformConfig` key with two possible shapes (flat number OR tier array) instead of a new namespaced key | Fewer new config rows/less migration ceremony | `NaN`-corrupted or silently-defaulted fee calculations, indistinguishable from correct output until an audit or balance investigation | Never — namespace/version the key |
| Shipping GRPC-06 blue-green/canary without first adding `RedisService.setNx()` locks to existing crons | Faster infra delivery | Duplicate escrow releases, duplicate Ministry export emails, and other double-fired jobs the moment two replicas briefly coexist | Never — lock the crons first, it's a small, mechanical, already-primitive-backed change |
| Building MIN-08's scheduled export as "email a base64 attachment via the existing HTML-only `sendEmail`" | No `SendgridService` changes needed | Hits SendGrid's message-size cap on any moderately large export, fails silently per the existing swallow-and-log convention | Only for a genuinely tiny, hard-capped export (e.g., a single summary table); never for the general case |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|--------------------|
| `SchedulerRegistry`/in-memory timers in an extracted, multi-replica service | Treating `setTimeout`-based match-timeout as portable because the code compiles and runs in the new process | Replace with Redis TTL key + `@Cron` sweep before extraction; in-memory timers do not survive restarts or replica boundaries |
| Socket.io across multiple replicas (extraction and/or blue-green) | Assuming `server.to(room).emit(...)` reaches all relevant clients once more than one replica of the gateway's process exists | Add the Socket.io Redis adapter the moment more than one replica can be live simultaneously — required by GRPC-06 regardless of which service it's applied to |
| Railway deploy strategy vs. "blue-green/canary" terminology | Assuming Railway has a platform-native percentage-based canary/blue-green toggle | Railway is rolling-deploy + healthcheck-gated by default; real canary/blue-green requires an added proxy/feature-flag layer, explicitly built and tested |
| `SendgridService` + scheduled/unattended delivery | Stuffing a base64 file into the existing `html`-only `sendEmail` signature | Add a real attachment-capable method, or prefer uploading to R2/S3 (`S3Service` already exists) and emailing a signed link |
| `SettlementService.settle()` reused for reversals | Calling `settle()` with negative recipient amounts expecting it to perform a clawback | `settle()` explicitly rejects negative amounts by design (WR-02) — build a separate reversal/adjustment primitive with its own debit-with-lock logic |
| `PlatformConfig` (untyped `Json`) shape changes | Changing an existing key's value shape (number → tier array) without changing the key name or adding a runtime type guard | Namespace/version the key (`X.tiers` vs `X.pct`) and validate shape at every read site; never silently reinterpret an existing key's contents |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Recurring MIN-08 export query with no bounded/rolling date window | Export job runtime and attachment size grow every cycle; eventually exceeds SendGrid's attachment cap or times out | Rolling window (since-last-run or fixed lookback), never "all history," on every scheduled tick | Once cumulative visitor-entry/revenue data crosses a few export cycles' worth of growth |
| Un-locked `@Cron` jobs during any multi-replica window (blue-green cutover or accidental horizontal scale) | Escrow released twice, Ministry export emailed twice, heartbeat cleanup doubled (harmless but wasteful) | `RedisService.setNx()`-guarded leader-lock on every cron, not just new ones added this milestone | The moment GRPC-06 introduces any window with 2+ live replicas of the same service |
| Each further extracted "core module" (per GRPC-07's "+ remaining core modules") opening its own Prisma connection pool against the same Neon instance | Intermittent connection-pool exhaustion errors correlated with total platform traffic, not any one service | Reuse the already-validated Neon pooled (`-pooler`) connection string + explicit `connection_limit` pattern from Phase 16's `POOL-01`/`POOL-02` work for every newly extracted service, and re-run the combined-topology load test with the larger service count | Once 3+ money-touching services are extracted and live simultaneously, beyond the 2-process (monolith + notifications-service) topology already validated |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ministry PII-allowlist scanner not extended to MIN-08/MIN-09's new methods | BVN/NIN/phone-adjacent PII leak to a government stakeholder via a code path the existing safety net doesn't cover | Add every new `MinistryService` method to the scanner's test cases before shipping the corresponding route |
| Dispute/adjustment workflow producing wallet mutations with no distinct, auditable `Transaction` row per affected recipient | Incomplete/misleading audit trail on a government financial platform — exactly the kind of gap a state audit will flag | Every clawback/adjustment must write its own ledger row (new `ADJUSTMENT`/`CLAWBACK` type), referencing the original settlement, for every wallet it touches |
| `NaN`/malformed `PlatformConfig` value reaching a wallet balance write uncaught | Corrupted wallet balances (a `NaN` or wrongly-computed amount persisted as a real Decimal transaction) on a real-money government platform | Explicit `Number.isFinite()` guard inside `SettlementService.settle()`'s amount validation, independent of whatever upstream config bug produced it |
| Extracted `delivery-service` exposing its WebSocket/REST surface directly to the internet with a different auth/CORS posture than the monolith | A routing/proxy misconfiguration during GRPC-07 could expose delivery endpoints with weaker guard coverage than they have today | Explicitly re-verify `JwtAuthGuard`/CORS config is applied identically in the new process's `main.ts`, not just copy-pasted and assumed correct |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Delivery orders silently stuck in `SEARCHING` after a deploy/cutover (Pitfall 1) | Sender never told their delivery request effectively vanished; no rider ever gets notified either | Durable (Redis/cron-backed) match-timeout that survives process changes, so the existing 60s "no rider found" UX still fires correctly |
| Ministry receiving a duplicate scheduled export email after a blue-green cutover | Non-technical stakeholder confusion, erodes trust in the dashboard's reliability | Redis-locked cron (Pitfall 4/6) — dedup at the source, not by asking the Ministry to ignore duplicates |
| "Heatmap" delivered as 20 fuzzy centroid dots when a boundary choropleth was expected | Stakeholder perceives the feature as low-effort/incomplete at demo time | Resolve the point-vs-boundary scope question with the stakeholder before building (Pitfall 7), so expectations match what ships |
| A dispute marked "resolved" in an admin UI while the underlying wallet reversal silently no-op'd (Pitfall 9) | Whoever filed the dispute (rider, vendor, or citizen) sees no actual money movement despite being told it was handled | Loud failure/mismatch detection on any dispute resolution that resolves to a no-op replay, surfaced to the admin before they can mark it resolved |

## "Looks Done But Isn't" Checklist

- [ ] **Delivery gRPC extraction "complete":** Often means the REST endpoints pass integration tests against the new process — verify the WebSocket connectivity path (Pitfall 3) and the 60-second match-timeout (Pitfall 1) both work end-to-end against the actual extracted topology, including a process-restart test.
- [ ] **Blue-green/canary deploy "implemented" for a service:** Often means a second Railway service/environment exists and a deploy script runs — verify it actually achieves gradual/controlled traffic shift (Railway has no native support, per Pitfall 4) and that every `@Cron` job in that service is lock-guarded before the dual-liveness window is ever exercised in production.
- [ ] **Scheduled Ministry export "working":** Often means it worked once against a small dev dataset — verify (a) attachment/link delivery handles production-scale data size, (b) the query uses a bounded rolling window not "all history" on every tick, (c) a Redis lock prevents double-send during any multi-replica window, and (d) the new method(s) are covered by the PII-allowlist scanner (Pitfall 5).
- [ ] **LGA heatmap "built":** Often means a visual renders on the dashboard — verify with the actual stakeholder whether centroid-point density or true LGA-boundary choropleth was expected (Pitfall 7), and confirm the underlying data (boundary GeoJSON, if required) actually exists and was reviewed, not just plausible-looking.
- [ ] **Dispute/adjustment workflow "resolves" a dispute:** Often means an admin can mark a dispute record as resolved — verify every affected recipient wallet (not just the buyer) received an actual, auditable ledger-row reversal, and that a second distinct adjustment on the same order is not silently absorbed as an idempotent replay of the first (Pitfall 8/9).
- [ ] **Configurable per-module split tiers "migrated":** Often means the new tiered config reads correctly for the one module it was tested against — verify every OTHER module's still-flat config key still parses correctly through the same (or an explicitly separate) read path, and that a malformed/wrong-shape config value fails loudly rather than silently producing `NaN` or a hardcoded fallback (Pitfall 10).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Delivery orders stuck in `SEARCHING` after a lost in-memory timeout (Pitfall 1) | LOW-MEDIUM | Add a reconciliation sweep (`@Cron`) that finds `SEARCHING` orders older than the match window and force-expires them; backfill-expire any currently stuck orders manually once identified |
| Duplicate cron execution during a blue-green window (Pitfall 4) | LOW | Retroactively add `RedisService.setNx()` locks to the affected cron(s); for financial crons (escrow release), reconcile any double-processed records against the ledger and correct |
| PII leaked via a new Ministry endpoint the allowlist scanner didn't cover (Pitfall 5) | HIGH | Treat as an NDPA/compliance incident per the same playbook already established for this risk class; add the missing scanner coverage; audit all exports already delivered via that endpoint |
| Dispute reversal silently no-op'd due to idempotency collision (Pitfall 9) | MEDIUM-HIGH | Audit all dispute records marked "resolved" against actual `Transaction` rows referencing them; identify and manually correct any with no matching wallet movement; fix the reference-namespacing bug before processing further disputes |
| `NaN`/malformed config value corrupting a wallet balance (Pitfall 10) | HIGH | Run a reconciliation query for any `Transaction.amount` that doesn't parse as a normal Decimal or any wallet balance inconsistent with its ledger sum; manually correct via an audited adjustment transaction; add the `Number.isFinite()` guard before re-enabling the affected config path |
| WebSocket sessions dropped during a Delivery extraction/cutover (Pitfall 1/3) | LOW | Client-side reconnect logic (already standard practice) recovers the connection; confirm no server-side state (match-timeout) was lost in the process, using the reconciliation sweep above |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Delivery's in-memory match-timeout/Socket.io state not portable (P1) | GRPC-07, before any code is physically moved | Kill-the-process test confirms a `SEARCHING` order still expires via a durable (Redis/cron) mechanism, not a dead in-memory timer |
| Extracting Delivery reopens the GRPC-05 wallet-across-network-boundary problem (P2) | GRPC-07 scoping, as the first documented decision | Confirm `delivery-service`'s `app.module.ts` embeds `SettlementService`/`PrismaService` directly (same-DB) rather than calling a network-exposed wallet RPC; re-run shadow-verification against the extracted topology |
| No client routing layer for split REST+WebSocket traffic (P3) | GRPC-07, cross-cutting sub-task | End-to-end WebSocket connectivity test against the real extracted topology, not just REST integration tests |
| Railway has no native canary; un-locked crons double-fire during dual-liveness (P4) | GRPC-06, with cron-lock hardening as a prerequisite | Dual-replica test observes zero duplicate cron executions across every existing `@Cron` job |
| Ministry PII-allowlist doesn't auto-cover new endpoints (P5) | MIN-08 and MIN-09, per-method checklist item | Every new `MinistryService` method has a corresponding allowlist scanner test case |
| Scheduled export lacks attachment support/dedup/bounded query (P6) | MIN-08, core design decision | Production-scale-size test of the export delivery path; confirmed rolling date window; confirmed Redis-locked cron |
| Heatmap assumes nonexistent boundary geometry (P7) | MIN-09, scoping (before implementation estimate) | Explicit stakeholder confirmation of point-density vs. choropleth expectation, resolved before the phase plan is finalized |
| Dispute reversal has no multi-recipient primitive (P8) | SETTLE-10, foundational design task | Test proving a dispute reversal debits ALL affected recipients (not just the buyer) for a multi-recipient settlement |
| Dispute adjustments collide with existing idempotency scans (P9) | SETTLE-10, same design task as P8 | Test proving two distinct adjustments against the same original settlement reference are both applied, not the second silently absorbed |
| Flat-to-tiered `PlatformConfig` migration risks NaN/silent-hardcoded-fallback (P10) | SETTLE-11, core design decision | Regression test feeding malformed/wrong-shape config values through every migrated call site asserts loud failure, not silent `NaN`/fallback; live Transport/Delivery flat keys explicitly excluded from first-pass migration |

## Sources

- `backend/src/common/services/settlement.service.ts` — `SettlementService.settle()` implementation: idempotency precheck (`startsWith` reference scan), negative-amount defensive floor, drift-tolerance assertion, `resolveMinistryWallet()` — HIGH confidence, direct code read
- `backend/src/common/services/refund.service.ts` — `RefundService.refund()`: single-wallet scope, deterministic `${reference}-RFND` idempotency key — HIGH confidence, direct code read
- `backend/src/modules/delivery/delivery.service.ts` — `scheduleMatchTimeout`/`SchedulerRegistry`, `completeDelivery()`'s cutover-flag-gated `SettlementService.settle()` call, existing `WR-01` untyped-Json-column footgun comment — HIGH confidence, direct code read
- `backend/src/modules/delivery/delivery.gateway.ts` — in-memory Socket.io rooms, no Redis adapter, shared-port assumption — HIGH confidence, direct code read
- `backend/apps/notifications-service/src/{main.ts,notifications-grpc.controller.ts}` — the one proven live extraction pattern (stateless, internal-only `ClientGrpc` caller, no WebSocket) — HIGH confidence, direct code read
- `backend/src/modules/notifications-client/notifications-client.service.ts` — resilience-wrapped gRPC client facade pattern used for the one live extraction — HIGH confidence, direct code read
- `backend/src/modules/ministry/{ministry.service.ts,ministry.controller.ts}` — existing query/export methods, unbounded-by-default date range (D-10), CSV/PDF export plumbing — HIGH confidence, direct code read
- `backend/src/modules/ministry/__tests__/ministry-pii-allowlist.spec.ts` — scope of the existing PII scanner (3 methods only) — HIGH confidence, direct code read
- `backend/src/common/services/sendgrid.service.ts` — confirmed no attachment support in `sendEmail()` — HIGH confidence, direct code read
- `backend/src/redis/redis.service.ts` — `setNx()` distributed-lock primitive, currently unused by any `@Cron` job — HIGH confidence, direct code read
- `backend/prisma/schema.prisma` — `PlatformConfig.value: Json` (untyped), `LGA` model's centroid-only `latitude`/`longitude` (no boundary geometry) — HIGH confidence, direct schema read
- `railway.toml` / `docker-compose.yml` / `backend/apps/*/railway.toml` — current single-process-per-service deploy model, confirms `transport-service`/`delivery-service` app scaffolds do not yet exist (only `admin/ai/auth/events/marketplace/notifications/stays/wallet`-service) — HIGH confidence, direct repo read
- `.planning/STATE.md` — explicit GRPC-05 decision log: *"Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, Tour modules stay in-process this milestone — their SELECT FOR UPDATE wallet transactions can't safely span a gRPC boundary without an out-of-scope outbox/saga redesign"* — HIGH confidence, direct project record
- `.planning/PROJECT.md` — v2.1 milestone scope (GRPC-06/07/08, MIN-08/09, SETTLE-10/11), confirmed proto contracts for transport/delivery/tour-packages/tour-guides/news/waitlist/reviews do not exist yet — HIGH confidence, direct project record
- `.planning/research/PITFALLS.md` (prior milestone, 2026-07-15) — original GRPC-05 distributed-transaction and N-way rounding/idempotency-key-collision findings this research builds on and re-applies to the now-concrete GRPC-07/SETTLE-10/SETTLE-11 scope — HIGH confidence, prior verified research in this same codebase
- [Railway Docs: Deployments Reference](https://docs.railway.com/deployments/reference) — rolling-deploy-by-default, healthcheck-gated model — MEDIUM confidence, official docs
- [Railway Help Station: "How to blue/green deploy?"](https://station.railway.com/questions/how-to-blue-green-deploy-d83c8864) and [Railway Help Station: "Blue/Green Deployment - Traffic To New Deployments Delayed"](https://station.railway.com/questions/blue-green-deployment-traffic-to-new-d-9c161721) — confirms no native percentage-based canary/blue-green primitive as of 2026, community-reported — MEDIUM confidence, cross-referenced across multiple Railway-hosted discussion threads
- [Railway blog: "The Best Continuous Deployment Tools in 2026"](https://blog.railway.com/p/best-continuous-deployment-tools-2026) — Railway's own positioning confirming rolling-only deploys vs. dedicated CD platforms for percentage-based traffic shifting — MEDIUM confidence, vendor source but self-disclosing a limitation (credible)

---
*Pitfalls research for: ISEYAA v2.1 — Delivery gRPC extraction (wallet-adjacent, WebSocket-stateful), blue-green/canary deploys, scheduled Ministry exports, LGA heatmap, settlement disputes, configurable fee tiers*
*Researched: 2026-07-19*
