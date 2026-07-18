# Phase 16: Connection Pooling Infrastructure - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Prisma client — the monolith and `notifications-service` (now two separate processes, each with its own Prisma connection pool, both hitting the same Neon database) — connects through a pooled connection string with an explicit, documented `connection_limit`. A combined-topology load test proves total open Postgres connections stay under Neon's ceiling with both processes running concurrently, and a Grafana alert tracks the open-connection metric.

**In scope:**
- Switch `DATABASE_URL` (runtime queries, both the monolith and `notifications-service`) to Neon's built-in `-pooler` connection string
- Explicit, documented `connection_limit` query param on the pooled URL for each process, sized asymmetrically (monolith gets the bulk of the budget, `notifications-service` a small fixed slice)
- `packages/proto` compile step (folded todo INT-02 — see Folded Todos) so `notifications-service` can actually `require('@iseyaa/proto')` at runtime and be a real second process for the load test
- Combined-topology load test extending the existing `load-tests/k6/main.js` script to drive both the monolith and `notifications-service` concurrently
- Grafana alert on open Postgres connections at 80% of the researched Neon ceiling

**Out of scope (belongs to other phases or explicitly deferred):**
- Self-hosted PgBouncer — Neon's built-in pooler is used instead (see D-01)
- Wiring `ResilienceModule`/cockatiel fail-fast behavior around pool exhaustion — Prisma's default `pool_timeout` queueing is used instead this phase (see D-05); todo INT-01 (wire `ResilienceModule` into gRPC scaffolds) stays unfolded, reviewed but deferred toward Phase 17
- `notifications-service`'s actual live gRPC extraction and cutover (`ClientGrpc` wiring, caller-graph audit) — that's Phase 17's GRPC-03/04/05 scope; this phase only needs the service running for the load test, not extracted into production traffic
- Any change to `prisma migrate`'s use of `DIRECT_URL` — unchanged, still unpooled, used only for migrations

</domain>

<decisions>
## Implementation Decisions

### Pooler mechanism (POOL-01)
- **D-01:** Use Neon's built-in `-pooler` endpoint (append `-pooler` to the Neon host in the connection string) rather than a self-hosted PgBouncer container. Zero new infrastructure, zero new cost, fits the project's free-first cost target — no docker-compose or Railway changes needed beyond the connection string itself.
- **D-02:** Both the monolith and `notifications-service` use the pooled `-pooler` URL as their runtime `DATABASE_URL`. `DIRECT_URL` (already present in `schema.prisma`) stays unpooled and is used only by `prisma migrate`, unchanged from today.

### Connection budget (POOL-01, POOL-02)
- **D-03:** The actual Neon plan/tier and its connection ceiling is unknown at discussion time — **researcher must confirm** the real number from the Neon dashboard/docs before planning sizes anything. Do not assume a specific tier's numbers.
- **D-04:** `connection_limit` is split asymmetrically between the two processes, proportional to load: the monolith (13+ modules, high query volume) gets the bulk of the researched ceiling; `notifications-service` (1 module, low volume) gets a small fixed slice. Exact numbers are the planner's call once D-03's research lands.

### Pool exhaustion behavior
- **D-05:** When the pool maxes out under load, requests queue on Prisma's default `pool_timeout` (10s) and then throw a timeout error if still unserved — this is already today's behavior, just now bounded by an explicit `connection_limit` instead of Prisma's silent default of 10. No new circuit-breaker/fail-fast wrapping via `ResilienceModule` this phase — that's a deliberately deferred idea (see Deferred).

### Load test & alert design (POOL-02, ROADMAP SC3)
- **D-06:** The combined-topology load test extends the existing `load-tests/k6/main.js` script rather than a new dedicated connection-ceiling-only script — add `notifications-service` traffic (via its gRPC trigger path from the monolith, since it has no public HTTP endpoint) into the same k6 run so both processes are under load simultaneously, reusing proven tooling.
- **D-07:** The new Grafana alert on open Postgres connections fires at **80% of the researched ceiling** (from D-03) — standard early-warning threshold, giving time to react before the hard limit. Exact number depends on D-03's research output.

### Folded Todos
- **INT-02 — Add compile step to `packages/proto`** (`.planning/todos/pending/2026-07-17-add-compile-step-to-packages-proto.md`): `packages/proto/package.json` declares compiled `main`/`types` entry points but `generate.sh` only emits `.ts` source, and there's no build script — `require('@iseyaa/proto')` fails at real Node.js runtime even though `nest build` passes (tsc's lenient resolver masks it). Folded into this phase's scope because POOL-02's combined-topology load test needs `notifications-service` to actually boot and run as a second real process — without this fix there's nothing to load-test.

### Claude's Discretion
- Exact `connection_limit` numbers for each process (D-04) — sized during planning once D-03's research confirms the real Neon ceiling.
- Exact Grafana alert threshold value in absolute connection count (D-07) — computed as 80% of whatever D-03's research reveals.
- Precise mechanics of extending `load-tests/k6/main.js` to also drive `notifications-service` (D-06) — implementation detail for planning, given `notifications-service` has no public HTTP surface (only a gRPC controller today).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Connection Pooling" — POOL-01, POOL-02 full requirement text.
- `.planning/ROADMAP.md` §"Phase 16: Connection Pooling Infrastructure" — goal, 3 success criteria (pooled connection string + documented `connection_limit`; combined-topology load test under Neon's ceiling; Grafana alert on open-connections metric), depends on Phase 10 (fixed gRPC build).
- `.planning/STATE.md` §Pending Todos — flags INT-02 as an explicit Phase 16 blocker ("Blocks Phase 16 and Phase 17"); D-mentioned above, now folded.

### Existing Prisma / connection config (being changed)
- `backend/prisma/schema.prisma:1-9` — `datasource db` block, already has `directUrl = env("DIRECT_URL")` for migrations; `url = env("DATABASE_URL")` is the value D-01/D-02 point at the pooled `-pooler` string.
- `backend/src/prisma/prisma.service.ts` — `PrismaService extends PrismaClient` with zero pool configuration today (confirmed no `connection_limit` anywhere in the codebase).
- `.env.example:7,107` — current `DATABASE_URL` examples (local Postgres + commented Neon example), needs updating with the pooled format and `connection_limit` param.
- `docker-compose.yml:45` — monolith's `DATABASE_URL` env var for local dev.

### notifications-service (the second Prisma client)
- `backend/apps/notifications-service/src/app.module.ts` — imports the same `PrismaModule` as the monolith, confirming it runs its own independent `PrismaClient` instance/connection pool as a genuinely separate process — this is the "second real Prisma client" POOL-01/02 are about.
- `backend/apps/notifications-service/src/notifications-grpc.controller.ts` — the service's only entry point (gRPC, no public HTTP), relevant to D-06's load-test design.

### Folded todo (INT-02)
- `.planning/todos/pending/2026-07-17-add-compile-step-to-packages-proto.md` — full problem/solution detail for the `packages/proto` compile-step fix folded into this phase.
- `packages/proto/package.json`, `packages/proto/generate.sh` — files needing the new build script.

### Existing load-test infrastructure (D-06)
- `load-tests/k6/main.js` — the script D-06 extends for the combined-topology test.
- `load-tests/artillery/`, `load-tests/db-audit/explain-analyze.ts` — other existing load/DB-audit tooling in the repo, for context (not directly reused this phase per D-06, but worth the planner/researcher knowing they exist).

### Reviewed but not folded
- `.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md` (INT-01) — `ResilienceModule` is never imported by any of the 8 `backend/apps/*-service` scaffolds (including `notifications-service`), so `CommonModule`'s `PaystackService` (which constructor-injects `ResilienceService`) will fail DI resolution when the service actually boots. **Flag to planner/researcher:** this may still need fixing within Phase 16 for `notifications-service` to boot cleanly for the load test, even though the user chose not to fold it as a discussed decision area — verify during research whether `notifications-service` can actually start without it.

### Project conventions
- `c:/Developer/work/ISEYAA/CLAUDE.md` — Node 20/NestJS/TypeScript strict; performance constraint "P95 < 500ms under 10,000 concurrent users" relevant to load-test design; cost target "~$11/mo MVP infrastructure (free-first stack)" is the direct rationale for D-01 (Neon's built-in pooler over self-hosted PgBouncer).
- `.planning/codebase/CONCERNS.md` §"No Database Connection Pooling Configured" — pre-existing audit finding confirming `PrismaService` has zero pool config today and Prisma's silent default is 10 connections; this phase directly resolves that finding.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `load-tests/k6/main.js` — existing k6 load test script, direct base for D-06's combined-topology extension.
- `backend/prisma/schema.prisma`'s existing `directUrl`/`url` split — the pattern already anticipates a pooled-vs-direct distinction; this phase just populates `DATABASE_URL` with the actual pooled value instead of a plain connection string.

### Established Patterns
- Env-var-driven config via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) — the connection string and `connection_limit` values flow through the same existing `.env`/`.env.example` convention used everywhere else in the codebase.
- `PlatformConfig`-from-DB pattern for tunable values elsewhere in the codebase (fees, split percentages) — NOT used here; `connection_limit` and pool sizing are deploy-time infrastructure config (env vars), not runtime business config, so this precedent doesn't apply.

### Integration Points
- `backend/src/prisma/prisma.service.ts` (monolith) and the equivalent Prisma usage inside `notifications-service` (via the shared `PrismaModule`) are the two places the pooled connection string takes effect — no code change needed beyond the connection string itself, since `PrismaClient` reads `connection_limit` from the URL query param.
- `packages/proto/package.json` + `generate.sh` — where the folded INT-02 fix lands (new build script emitting `.js`/`.d.ts` from generated `.ts`).

</code_context>

<specifics>
## Specific Ideas

- No specific UI/UX was discussed — this phase is backend/infra-only (`UI hint: no` per ROADMAP.md).
- The user explicitly wants the researcher to confirm the real Neon plan/connection ceiling rather than guess (D-03) — this is a hard prerequisite before any connection_limit number can be finalized in planning.

</specifics>

<deferred>
## Deferred Ideas

- **Fail-fast pool-exhaustion handling via `ResilienceModule`/cockatiel** (D-05's rejected alternative) — deferred; Prisma's default `pool_timeout` queueing is used this phase. Revisit if the load test reveals queueing causes unacceptable cascading timeouts.
- **Self-hosted PgBouncer** (D-01's rejected alternative) — deferred indefinitely unless Neon's built-in pooler proves insufficient (e.g. transaction-mode limitations blocking a specific query pattern).

### Reviewed Todos (not folded)
- **Wire ResilienceModule into gRPC service scaffolds (INT-01)** (`.planning/todos/pending/2026-07-17-wire-resiliencemodule-into-grpc-service-scaffolds.md`) — reviewed; not folded into this phase's discussed decisions, but flagged in canonical_refs above as a possible hidden blocker for `notifications-service` actually booting during the load test. Researcher should verify; if it blocks the load test, it may need to be pulled into this phase's plan anyway despite not being explicitly folded here.

</deferred>

---

*Phase: 16-connection-pooling-infrastructure*
*Context gathered: 2026-07-18*
