# Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

`notifications-service` becomes the platform's first genuinely-separate deployable process — called from the monolith exclusively via `ClientGrpc` (zero remaining in-process direct injections of `NotificationsService`), running as its own Railway service and local docker-compose block, with zero REST-visible behavior change to web/mobile clients. A documented caller-graph audit precedes the cutover commit. Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, and all Tour Packages/Guides/Bookings modules explicitly stay in-process this milestone (GRPC-05) — not touched by this phase.

**In scope:**
- Caller-graph audit of every direct injection of `NotificationsService` across the monolith (GRPC-04) — 2 call sites confirmed by discussion-time scouting: `NotificationsController` (REST) and `TourNotificationsService` (tour-booking cron/event pushes)
- A thin `NotificationsClientService` facade (in a new `NotificationsClientModule`) backed by `ClientGrpc`, replacing both call sites' direct injection of the in-process `NotificationsService`
- Adding a `data` field to the `.proto` contract's `SendPushRequest` (currently missing — see D-08) so no behavior regresses on cutover
- Wrapping the new gRPC client calls in the existing `ResilienceModule`/cockatiel pattern (retry/circuit-breaker/timeout/fallback), matching Phase 11's external-vendor pattern
- `notifications-service`'s own Railway service + local docker-compose block, reachable via a new `NOTIFICATIONS_GRPC_URL` env var
- Fixing the still-open Docker build gap: declaring `@iseyaa/proto` as a `backend` dependency (folded todo, see Folded Todos)
- A straight one-shot cutover (no feature flag), with a git-revert rollback plan
- A committed markdown caller-graph audit artifact in the phase directory

**Out of scope (belongs to other phases or explicitly deferred):**
- Any extraction of Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, or Tour Packages/Guides/Bookings — their `SELECT FOR UPDATE` wallet transactions can't safely span a gRPC boundary without an out-of-scope outbox/saga redesign (GRPC-05)
- A feature-flag-gated dual in-process/gRPC path (rejected — see D-09)
- Adding a real `ListForUser` gRPC RPC — `listForUser()` stays a local no-op stub (see D-03)
- Wiring `ResilienceModule` into the other 7 `backend/apps/*-service` scaffolds beyond `notifications-service` — user chose to fold this todo anyway (see Folded Todos), so it's actually now in scope despite not being required by GRPC-03/04/05
- Blue-green/canary deploys per extracted service (GRPC-06, deferred to v2 per REQUIREMENTS.md)
- Live extraction of Delivery + remaining modules beyond notifications-service (GRPC-07, deferred to v2)

</domain>

<decisions>
## Implementation Decisions

### Client wrapper design
- **D-01:** Thin facade — `NotificationsClientService` with today's exact method signatures (`sendPush`, `registerToken`, `listForUser`) backed by `ClientGrpc` internally. Both call sites (`NotificationsController`, `TourNotificationsService`) swap their import with a minimal diff, rather than each injecting a raw `ClientGrpc` directly. This sets the copy-paste template for future extractions (GRPC-07, deferred).
- **D-02:** The gRPC client registration lives in a new `NotificationsClientModule` — a small dedicated module exporting the facade/client token, imported wherever the old `NotificationsModule` was imported (mirrors `CommonModule`'s shared-infra pattern).
- **D-03:** `listForUser()` stays a local no-op stub in the new facade — no proto RPC added, no network call. It has no persistence behind it today (`// TODO: persistence not yet wired`), so there's nothing to fetch from the extracted service.
- **D-04:** gRPC target URL is configured via a `NOTIFICATIONS_GRPC_URL` env var, following the existing per-service env var convention (`DATABASE_URL`, `REDIS_URL`). Document dev (`localhost:5008`) and Railway (private network hostname) examples in `.env.example`, same approach Phase 16 (POOL-01) used for `DATABASE_URL`.
  - **Addendum (superseded during planning):** RESEARCH.md's Open Question 1 flagged a naming collision with the pre-existing, unused `.env.example` placeholder `NOTIFICATIONS_SERVICE_URL` (added Phase 10, same host:port target). Plans 17-03/17-05 resolved this by reusing `NOTIFICATIONS_SERVICE_URL` instead of introducing `NOTIFICATIONS_GRPC_URL` — zero `.env.example` churn, matches the convention already set for the other 7 not-yet-live `*_SERVICE_URL` vars. D-04's env-var *name* is superseded by this resolution; D-04's other requirements (ConfigService-driven URL, documented dev/Railway examples) stand unchanged.

### gRPC call resilience
- **D-05:** Calls from the new facade to `notifications-service` are wrapped in the existing `ResilienceModule`/cockatiel policy (retry+circuit-breaker+timeout+fallback) — matching Phase 11's pattern for Paystack/Termii/Anthropic/FCM. `notifications-service` is now a real external network dependency from the monolith's point of view.
- **D-06:** On failure, `NotificationsController`'s REST-facing paths (`registerToken`, `send`) propagate a clear error to the caller (e.g. 503) rather than silently pretending success — these are synchronous requests the client is waiting on.
- **D-07:** `TourNotificationsService`'s 3 cron jobs and 1 event handler get the *same* resilience wrapping as the REST paths (one `ResilienceService` policy applied uniformly, regardless of caller) — consistent with how `PaystackService`/`SendgridService` are wrapped today. Note: these callers already catch-and-log every error without rethrowing (by design, so a cron tick never crashes the scheduler) — the resilience wrapping governs the gRPC call's own retry/circuit-breaker behavior underneath that existing catch, it doesn't change the catch's non-rethrow contract.

### Push payload regression (proto fix)
- **D-08:** `packages/proto/notifications.proto`'s `SendPushRequest` gains a `map<string, string> data = 4;` field before cutover. Today's in-process `NotificationsService.sendPush(userId, title, body, data)` accepts a 4th `data` param that `TourNotificationsService` uses for push deep-link payloads (`{type, bookingId}`) on all 3 tour-reminder pushes — the existing (unused-in-production) gRPC controller silently drops this param since the proto never had it. Fixing it now is required for true zero-behavior-change (ROADMAP.md success criterion 3). Confirmed additive-only: no other consumer of `notifications.proto` exists yet (this is the first live extraction), so widening the message is safe.

### Cutover strategy
- **D-09:** Straight one-shot cutover — no feature flag, no dual in-process/gRPC path. Matches the stated rationale for choosing `notifications-service` first (lowest blast radius, no wallet coupling, no financial data at risk). A Settlement-style (`*_engine_enabled`) dual-path flag was explicitly considered and rejected as unnecessary complexity for a non-financial, best-effort notification path.
- **D-10:** Rollback plan on production failure is a standard git revert of the cutover commit + Railway redeploy (restoring in-process `NotificationsService` injection) — no runtime toggle needed, consistent with D-09's straight-cutover choice.
- **D-11:** The GRPC-04 caller-graph audit is delivered as a committed markdown document in the phase directory (a grep-based table of every `NotificationsService` injection site — file, line, caller) produced *before* the cutover commit, not just inline notes in PLAN.md/VERIFICATION.md. This makes it a permanent, reviewable artifact.

### Folded Todos
- **Docker dependency fix** (no dedicated todo file — tracked inline in `.planning/STATE.md` Pending Todos, overlapping `.planning/todos/pending/2026-07-17-add-compile-step-to-packages-proto.md`'s "Solution" note): `backend/package.json` still does not declare `@iseyaa/proto` as a dependency (confirmed via grep at discussion time — Phase 16 fixed the `packages/proto` *compile step* but not this piece), so `docker build` for `apps/*-service` images fails with `TS2307: Cannot find module '@iseyaa/proto'`. This directly blocks ROADMAP.md success criterion 2 ("its own Railway service") — fix: declare `@iseyaa/proto` as a `backend` dependency and widen the Docker `npm ci` workspace scope.
- **INT-01 — Wire ResilienceModule into gRPC service scaffolds** (`.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md`): user chose to fold the *full* scope (all 8 `backend/apps/*-service` scaffolds), not just `notifications-service` (which Phase 16 already fixed). Note for planner: this pulls in 7 scaffolds beyond this phase's stated notifications-only extraction — confirm with user during planning if the broader fix should be a separate plan/wave rather than blocking the notifications-service cutover itself.

### Claude's Discretion
- Exact 503/error response shape for D-06's REST-facing failure path.
- Exact cockatiel policy parameters (timeout duration, retry count, circuit-breaker thresholds) for D-05 — planner's call, likely mirroring Phase 11's existing per-vendor policy shape.
- Exact format/columns of the D-11 caller-graph audit markdown doc — mechanical, not a vision call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"gRPC" — GRPC-03, GRPC-04, GRPC-05 full requirement text; also documents the explicit rationale for GRPC-05 (wallet-adjacent transactional coupling requiring an out-of-scope outbox/saga pattern).
- `.planning/ROADMAP.md` §"Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service)" — goal, 4 success criteria, depends on Phases 10 (build fix), 13 (settlement module boundaries confirmed), 16 (connection pooling in place).
- `.planning/STATE.md` §Pending Todos — flags the Docker build dependency gap explicitly as a Phase 17 prerequisite.

### notifications-service (existing scaffold, being wired live)
- `backend/apps/notifications-service/src/main.ts` — `NestFactory.createMicroservice`, gRPC transport, listens on `:5008` (this port becomes the target of `NOTIFICATIONS_GRPC_URL` per D-04).
- `backend/apps/notifications-service/src/app.module.ts` — imports `PrismaModule`, `RedisModule`, `ResilienceModule`, `DbMetricsModule`, `NotificationsModule` — already fixed in Phase 16 (boots cleanly, no DI errors).
- `backend/apps/notifications-service/src/notifications-grpc.controller.ts` — existing `@GrpcMethod` handlers for `SendPush`/`RegisterToken`; needs updating for D-08's new `data` field.
- `backend/apps/notifications-service/Dockerfile` — existing image build; needs the D-folded Docker dependency fix to actually produce a working image.
- `packages/proto/notifications.proto` — the contract D-08 modifies (add `data` field to `SendPushRequest`).

### Call sites being rewired (the caller-graph audit's confirmed subjects)
- `backend/src/modules/notifications/notifications.controller.ts` — REST endpoints `GET /notifications`, `POST /notifications/register-token`, `POST /notifications/send`; today injects `NotificationsService` directly.
- `backend/src/modules/notifications/notifications.service.ts` — the in-process class being replaced by the gRPC facade for these 2 callers; implements `listForUser` (stub), `registerToken`, `sendPush` (FCM v1 HTTP API via `ResilienceService`).
- `backend/src/modules/tour-bookings/tour-notifications.service.ts` — injects `NotificationsService` directly; calls `sendPush(userId, title, body, data)` with the `data` param in 3 places (T-24h, T-2h, T+1h post-tour cron jobs), all via `@Cron`/`@OnEvent` handlers that catch-and-log without rethrowing.

### Resilience pattern being reused
- `backend/src/resilience/resilience.module.ts` — `ResilienceModule` (`@Global()`), the pattern D-05/D-07 extend to the new gRPC client calls.
- `.planning/phases/11-resilience-wrapping/11-CONTEXT.md` (if present) — original resilience-wrapping decisions for external vendor calls; same shape being applied here.

### Phase 16 prerequisites (already resolved, confirms this phase is unblocked)
- `.planning/phases/16-connection-pooling-infrastructure/16-CONTEXT.md` — confirms `notifications-service`'s two hard boot blockers (proto compile step, `ResilienceModule` DI gap) were fixed, and pooled DB connections support both processes running concurrently.
- `.planning/phases/16-connection-pooling-infrastructure/16-RESEARCH.md` — documents the `ResilienceModule` DI-blocker root cause (`@Global()` doesn't cross separate `NestFactory` bootstrap trees) in detail; directly relevant background for D-05/D-07 and the folded INT-01 todo.

### Folded todos
- `.planning/todos/pending/2026-07-17-add-compile-step-to-packages-proto.md` — full problem detail for the Docker dependency gap (its "Solution" section explicitly calls out the still-open `backend/package.json` dependency-declaration piece).
- `.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md` (INT-01) — full scope of wiring `ResilienceModule` into all 8 scaffolds, folded in full per user choice.

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — Node 20/NestJS/TypeScript strict; `@nestjs/microservices` gRPC transport already a listed dependency; performance constraint "P95 < 500ms under 10,000 concurrent users" relevant to the new network hop's latency budget.
- `.planning/PROJECT.md` §Key Decisions — "Real gRPC microservice split (v2.0)" and "notifications-service as first live extraction target" rationale (lowest blast radius, no wallet coupling, proves the pattern before repeating it).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/apps/notifications-service/` — the entire gRPC scaffold (bootstrap, module, controller) already exists and boots cleanly as of Phase 16; this phase wires it into live traffic, it doesn't build it from scratch.
- `backend/src/resilience/resilience.module.ts` / `ResilienceService` — direct reuse for D-05/D-07's cockatiel wrapping around the new gRPC client calls.
- `packages/proto/generate.sh` + its now-working `tsc` build step (fixed Phase 16) — regenerates TypeScript types after D-08's proto change.

### Established Patterns
- Env-var-driven config via `@nestjs/config` — `NOTIFICATIONS_GRPC_URL` (D-04) follows the same `.env`/`.env.example` convention as every other connection string in the codebase.
- `ResilienceService.execute('vendorName', ...)` wrapping pattern already used by `PaystackService`, `SendgridService`, `NotificationsService.sendPush` itself (for the FCM HTTP call) — the same call shape extends to wrapping the new gRPC client.
- Zero existing `ClientGrpc`/`ClientsModule` usage anywhere in the codebase — this phase establishes the very first instance of this pattern; there is no internal precedent to copy beyond NestJS's own microservices documentation.

### Integration Points
- `backend/src/modules/notifications/notifications.module.ts` — currently exports the in-process `NotificationsService`; after cutover, its 2 consumers (`NotificationsController`, `tour-bookings.module.ts`) import the new `NotificationsClientModule` instead.
- `docker-compose.yml` — currently has zero `notifications-service`/gRPC blocks; needs a new service block for local dev parity with the Railway deployment.

</code_context>

<specifics>
## Specific Ideas

- No UI/UX discussion — this phase is backend/infra-only (`UI hint: no` per ROADMAP.md).
- The user was precise about wanting the proto data-field regression fixed rather than accepted (D-08) — this is treated as a correctness issue, not a style preference.
- The user confirmed a straight cutover is the right level of ceremony for this specific module (D-09) — explicitly contrasted against the heavier Settlement-style dual-path pattern used in Phase 13, on the grounds that notifications aren't financial data.

</specifics>

<deferred>
## Deferred Ideas

- Feature-flag-gated dual in-process/gRPC path (D-09's rejected alternative) — deferred indefinitely for this module; revisit only if a future extraction involves financial/wallet-adjacent data where a straight cutover's risk profile is unacceptable.
- Adding a real `ListForUser` gRPC RPC (D-03's rejected alternative) — deferred until `listForUser()` actually gets real persistence (currently a stub with `// TODO: persistence not yet wired`, out of this phase's scope).
- Live extraction of Delivery + remaining modules beyond notifications-service (GRPC-07) and news/waitlist/reviews (GRPC-08) — both already deferred to v2 per REQUIREMENTS.md, unaffected by this discussion.

### Reviewed Todos (not folded)
None — both todos matched to Phase 17 were folded (Docker dependency fix, and INT-01's full 8-scaffold scope per user choice).

</deferred>

---

*Phase: 17-grpc-proof-of-pattern-extraction-notifications-service*
*Context gathered: 2026-07-18*
