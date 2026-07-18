# Phase 16: Connection Pooling Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 16-connection-pooling-infrastructure
**Areas discussed:** Pooler mechanism, Connection budget, Pool exhaustion behavior, Load test & alert design

---

## Pooler mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Neon built-in pooler | Append `-pooler` to the Neon host in DATABASE_URL. Zero extra infra, zero extra cost, transparent PgBouncer-as-a-service — fits the free-first cost target. | ✓ |
| Self-hosted PgBouncer container | Add a PgBouncer service to docker-compose.yml and Railway. More tuning control, but a new ops component. | |
| You decide | Researcher confirms Neon's pooler is available and defaults to it unless blocked. | |

**User's choice:** Neon built-in pooler.

| Option | Description | Selected |
|--------|-------------|----------|
| Both use pooled URL | Every runtime Prisma client uses the `-pooler` DATABASE_URL; only `prisma migrate` uses DIRECT_URL, unchanged. | ✓ |
| You decide | Researcher confirms whether pooled-connection caveats require query-engine flag changes. | |

**User's choice:** Both the monolith and notifications-service use the pooled URL at runtime.
**Notes:** No further questions on pooler mechanism; moved directly to next area.

---

## Connection budget

| Option | Description | Selected |
|--------|-------------|----------|
| Research it | Researcher checks the Neon dashboard/docs for the actual plan and ceiling before planning. | ✓ |
| I know the tier — let me specify | User types the plan name/ceiling as free text. | |

**User's choice:** Research it — actual Neon plan/tier and ceiling unknown at discussion time.

| Option | Description | Selected |
|--------|-------------|----------|
| Asymmetric, proportional to load | Monolith gets the bulk of the budget, notifications-service gets a small fixed slice, sized during planning. | ✓ |
| Equal split | Both services get the same connection_limit regardless of load. | |
| You decide | Planner sizes both based on researched ceiling and realistic concurrency. | |

**User's choice:** Asymmetric split, proportional to load.
**Notes:** Exact numbers deferred to planning once the Neon ceiling is researched.

---

## Pool exhaustion behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Prisma default queueing | Requests wait on Prisma's pool_timeout (default 10s), then throw a timeout error. Zero new code. | ✓ |
| Fail-fast via ResilienceModule | Wrap DB-heavy paths in the existing cockatiel circuit-breaker pattern (RESIL-01) for a clear 503 instead of queueing. | |
| You decide | Planner picks based on what the load test reveals. | |

**User's choice:** Prisma default queueing (pool_timeout).
**Notes:** This is a deliberate scope-narrowing choice — fail-fast wrapping is deferred, not rejected outright, and can be revisited if the load test shows queueing causes cascading timeouts.

---

## Load test & alert design

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing k6 script | Add notifications-service traffic into the existing k6 run (load-tests/k6/main.js) so both processes are under load simultaneously. | ✓ |
| New dedicated connection-ceiling script | A separate, purpose-built script hammering both processes with DB-touching requests. | |
| You decide | Planner picks based on notifications-service's actual trigger surface (gRPC, not public HTTP). | |

**User's choice:** Extend existing k6 script.

| Option | Description | Selected |
|--------|-------------|----------|
| 80% of the researched ceiling | Standard early-warning threshold for the Grafana alert. | ✓ |
| You decide | Planner/researcher picks a sensible threshold once the ceiling and connection_limit split are known. | |

**User's choice:** 80% of the researched ceiling.
**Notes:** Discussion wrapped up here — all four selected areas covered, user confirmed ready for context.

---

## Claude's Discretion

- Exact `connection_limit` numbers for the monolith vs. notifications-service split — sized during planning once the Neon ceiling is researched (D-03/D-04).
- Exact Grafana alert threshold in absolute connection count — computed as 80% of the researched ceiling (D-07).
- Precise mechanics of extending `load-tests/k6/main.js` to drive notifications-service's gRPC surface (D-06).

## Deferred Ideas

- Fail-fast pool-exhaustion handling via `ResilienceModule`/cockatiel — deferred in favor of Prisma's default queueing; revisit if the load test shows unacceptable cascading timeouts.
- Self-hosted PgBouncer — deferred indefinitely unless Neon's built-in pooler proves insufficient.

## Todo Cross-Reference (before discussion)

- **INT-02** (Add compile step to packages/proto) — folded into scope; POOL-02's load test needs notifications-service to actually boot and run.
- **INT-01** (Wire ResilienceModule into gRPC scaffolds) — reviewed, not folded as a discussed decision, but flagged in CONTEXT.md canonical_refs as a possible hidden blocker for notifications-service booting cleanly during the load test.
