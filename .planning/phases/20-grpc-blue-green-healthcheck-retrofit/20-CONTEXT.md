# Phase 20: gRPC Blue-Green Healthcheck Retrofit - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Every extracted gRPC service — today that means `notifications-service`, the only live one (Phase 17) — gets a real `grpc.health.v1.Health` endpoint wired to Railway's `healthcheckPath`, so a failing health check blocks rollout instead of Railway doing a blunt recreate. Every existing `@Cron` job that has a shared side effect gets a `RedisService.setNx()` distributed lock so two replicas briefly coexisting during a cutover can't double-fire it. An operator proves a real shadow-verify + manual-pointer-flip blue-green cutover end-to-end on `notifications-service`, with a documented, actively-watched bake window and rollback path. This phase does NOT extract any new service to gRPC (that's GRPC-07/GRPC-08, Phase 21) and does NOT build a true parallel-Railway-environment/traffic-splitting proxy — see D-01.

</domain>

<decisions>
## Implementation Decisions

### Blue-green mechanism — app-level canary flag, not a Railway-native or full-parallel-environment build
- **D-01:** The "pointer" an operator flips is a `PlatformConfig`-style flag, reusing the exact pattern already proven by SETTLE-09 for Transport/Delivery's settlement-engine cutover (a boolean/percentage config row a `ClientGrpc`-calling code path checks before routing to the new vs. old instance). This satisfies GRPC-06c's literal "manual pointer-flip" wording without building a full parallel-Railway-environment/proxy/DNS-weight-shifting canary (rejected — real new infra, tension with the ~$11/mo MVP cost target, more than the milestone research recommends building speculatively) and without relying solely on Railway's built-in health-gated rollout (rejected as insufficient alone — it auto-manages the cutover with no separate thing for the operator to manually flip or flip back).
- **D-02:** Adding `grpc.health.v1.Health` (GRPC-06a) is still required regardless of D-01 — it's what makes Railway's own rollout behave like blue-green instead of recreate, and it's the immediate trigger for the whole phase per the milestone research. It is necessary but not sufficient for GRPC-06c's operator-driven cutover proof.

### Shadow-verify — synthetic traffic only, never live citizen traffic pre-flip
- **D-03:** `notifications-service` sends real SMS/email/push to citizens, so a literal live dual-run (both instances handling the same real traffic) would double-send real notifications — unacceptable for a citizen-facing government platform. The shadow-verify step is **synthetic-payload verification**: before flipping the canary flag, the operator sends test/synthetic RPCs directly to the new instance (health check calls + a small number of known-safe test notifications to an ops-owned test number/email) to confirm it works correctly. No live citizen traffic touches the new instance until the flag flips; the flip itself is instant/atomic — there is no gradual live-percentage-split window (rejected: real duplicate-send risk, not appropriate for this milestone's risk tolerance). This is a materially different design than the `ShadowSettlementComparison` dry-run-mirrored-traffic pattern used for settlement math (which was also rejected as an option here — more invasive, requires threading a dry-run flag through the whole notifications pipeline for no clear benefit over synthetic verification).

### Rollback — written runbook, no new tooling
- **D-04:** The "documented rollback path" GRPC-06c requires is a markdown runbook (e.g. `docs/blue-green-cutover-runbook.md`) describing how to flip the canary flag on, what to verify, how to flip it back, and what signals mean "roll back now." No new CLI/script is built for this phase — rollback is "flip the same config flag back," consistent with the project's existing manual-admin-action pattern (Phase 18/19 both chose backend-only, no new tooling, for their admin surfaces).

### Bake window — 15 minutes, actively watched, existing observability
- **D-05:** The bake window is **15 minutes, actively watched** by the operator (not a passive/unattended timer, not a longer 1-hour window — `notifications-service`'s request shape is short-lived RPCs with no long-running state to drain, and there's no known slow-burn failure mode that needs a longer observation period). The runbook documents this duration explicitly (an undocumented "operator's judgment, no fixed timer" was considered and rejected — doesn't satisfy GRPC-06c's "documented" requirement concretely enough).
- **D-06:** The rollback trigger signal is the existing Grafana Cloud dashboard's gRPC error rate for `notifications-service` plus the `ResilienceService` circuit-breaker state (open = trouble) — reuses observability already wired in Phase 2/16/17, no new dashboard or alert rule built this phase. A defined numeric threshold (e.g. ">5% error rate over 1 minute") was considered and rejected as unnecessary new Grafana alert-rule work for a 15-minute, actively-watched window where a human is already looking at the same dashboard.

### Cron lock scope and fail-safe policy
- **D-07:** Exactly the 6 `@Cron` jobs GRPC-06b names get the `RedisService.setNx()` distributed lock: `stays.service.ts` `releaseEscrow` (EVERY_HOUR), `delivery.service.ts` `cleanStaleRiderHeartbeats` (EVERY_30_SECONDS), `transport.service.ts` `cleanStaleDriverHeartbeats` (EVERY_30_SECONDS), and `tour-notifications.service.ts`'s three crons — `pushTMinus24h` (EVERY_HOUR), `pushTMinus2h` (`*/15 * * * *`), `pushPostTourRating` (`*/15 * * * *`). `db-metrics.service.ts`'s `pollOpenConnections` (EVERY_30_SECONDS) is explicitly left unlocked — it only writes to a local in-memory gauge with no shared side effect, double-polling it is harmless, and it's outside GRPC-06b's explicit list.
- **D-08:** `setNx()` keeps its existing fail-open behavior unchanged for every guarded cron, including `releaseEscrow` — if Redis is unreachable, the lock optimistically returns "acquired" and the job still runs, exactly like the codebase's one existing precedent (`wallet.service.ts`'s idempotency lock). A stricter fail-closed policy for money-moving crons specifically was considered and rejected: a Redis outage is rarer and shorter than a blue-green cutover window, an unguarded tick during an outage only degrades to today's status quo (no lock at all — not a new failure mode), and fail-closed would require `setNx()` to distinguish "lock acquired" from "Redis unavailable" in its return value, which it currently cannot (both cases return `true`) — a larger change than this phase's risk actually calls for.

### Folded scope — NotificationsClientModule e2e fix
- **D-09:** The open todo "Fix NotificationsClientModule circular dependency breaking e2e:tours suite" is folded into Phase 20. Rationale: Phase 20's health-check and canary-flag work already touches `NotificationsClientModule` directly, so fixing the pre-existing `forwardRef()` circular-dependency bug here is cheap (same file, same session) and gives Phase 20's own changes real e2e coverage that doesn't exist today. Scope: add the missing `forwardRef()`, get `npm run test:e2e:tours` green locally, then wire it into `.github/workflows/ci.yml` alongside the existing `test:e2e:settlement-splits` step.

### Canary flag semantics — kill switch confirmed (addendum, added during planning revision)
- **D-10:** D-01's wording ("routing to the new vs. old instance") is confirmed to mean an availability kill switch, not a literal route-to-old-vs-new-instance flip. `notifications-service` is a single-hostname Railway service (Phase 17) with no second live instance to route to, and no in-process fallback path exists post-Phase-17 — there is only "call notifications-service" or "don't." This resolves 20-RESEARCH.md's "Critical Design Clarification" as the accepted, locked reading of D-01: when the canary flag is `false`, `NotificationsClientService` immediately throws `ServiceUnavailableException` without attempting the gRPC call (the same degrade path it already uses on a real gRPC failure); when `true` or absent, behavior is completely unchanged. This is the design 20-03-PLAN.md implements. No parallel-instance routing is built or implied by D-01 — that remains explicitly out of scope per D-01's own rejection of a full parallel-Railway-environment canary.

### Claude's Discretion
- Exact shape of the `grpc.health.v1.Health` implementation (hand-rolled 2-message proto + `HealthController` vs. an npm `grpc-health-check`-style package) — research recommends a small reusable `packages/proto/grpc-health.proto` + shared NestJS provider rather than copy-paste per service; planner should follow this.
- Whether Railway's `healthcheckPath` config can target a gRPC health check directly, or requires a small HTTP `/healthz` sidecar on the same NestJS hybrid app (`HttpAdapterHost` alongside `Transport.GRPC`) — research flags this as needing verification at build time; either resolution stays within this phase's scope.
- Exact `PlatformConfig` key name and shape for the canary flag (e.g. `grpc.notifications_service.canary_enabled`) and where the `ClientGrpc`-calling code checks it — should mirror the existing `delivery.settlement_engine_enabled`-style flag-gated call site pattern.
- `ResilienceService` circuit-breaker tuning for the cutover window (research suggests confirming the existing `notificationsGrpc` entry's `failureThreshold: 8` / `halfOpenAfterMs: 20000` won't trip during a normal 15-minute bake window given actual request volume, rather than assuming it's fine).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` (Phase 20 section, lines ~459-467) — goal, success criteria, requirements list
- `.planning/REQUIREMENTS.md` (GRPC-06a, GRPC-06b, GRPC-06c, lines ~12-14) — locked requirements for this phase

### Research (already completed for this milestone — read in full before planning)
- `.planning/research/ARCHITECTURE.md` §"Q2 — Blue-green/canary deploys on Railway for 2+ gRPC services" (lines ~54-77) — the concrete "what's needed for GRPC-06" breakdown: gRPC Health Checking Protocol addition, Railway's health-gated rollout as the underlying primitive, `ClientGrpc` reconnection behavior during cutover, circuit-breaker tuning caveat
- `.planning/research/PITFALLS.md` Pitfall 4 "Railway Has No Native Canary/Blue-Green — a DIY Traffic-Shift Double-Fires Every Un-Locked `@Cron` Job and Orphans In-Flight State" (lines ~81-101) — the exact rationale behind D-07/D-08; names all 6 cron jobs (this phase's guard list came directly from this pitfall's finding, cross-checked against REQUIREMENTS.md's explicit wording)
- `.planning/research/FEATURES.md` line 19 — precedent citation for reusing the SETTLE-09 shadow-verify/dual-run pattern for cutover safety generally (informed D-01/D-03, though this phase's actual shadow-verify design diverges from the settlement-math dry-run shape — see D-03's rationale)

### Existing live extraction (the "real extracted service" GRPC-06c targets)
- `backend/apps/notifications-service/src/main.ts` — current `NestFactory.createMicroservice()` bootstrap, pure `Transport.GRPC` on port 5008, no HTTP listener today
- `backend/apps/notifications-service/railway.toml` — no `healthcheckPath` set today (unlike the monolith's `railway.toml`, which sets `healthcheckPath = "/api/v1/health"`) — this is the gap GRPC-06a closes
- `backend/apps/notifications-service/src/app.module.ts` — confirms `ResilienceModule` is already wired here (the "Wire ResilienceModule into gRPC scaffolds" INT-01 todo this surfaced during cross-referencing is already resolved in all 8 scaffolds — no action needed)
- `backend/src/modules/notifications-client/notifications-client.module.ts` — the `ClientGrpc`-calling module on the monolith side; this is where the canary flag check (D-01) gets added, and where the folded e2e fix (D-09) applies its `forwardRef()`

### Distributed lock primitive
- `backend/src/redis/redis.service.ts` (lines ~125-138) — `setNx()`, the existing fail-open distributed-lock primitive this phase applies to 6 crons (D-07/D-08); currently only used by `backend/src/modules/wallet/wallet.service.ts:227`

### Existing app-level canary-flag precedent (for D-01)
- `backend/src/modules/transport/transport.service.ts` (~lines 703-730) and `backend/src/modules/delivery/delivery.service.ts` (~lines 738-764) — the `*_settlement_engine_enabled` `PlatformConfig`-flag-gated cutover pattern from SETTLE-09, the direct precedent D-01 reuses
- `.planning/phases/18-settlement-split-centralization/18-CONTEXT.md` and `.planning/phases/19-settlement-dispute-adjustment-workflow/19-CONTEXT.md` — precedent for "backend-only, no new admin UI/tooling" scope decisions (informed D-04's "runbook only, no script" call)

### Folded todo (D-09)
- `.planning/todos/2026-07-19-fix-circular-dependency-breaking-e2e-tour-tests.md` — full problem description and proposed fix for the `NotificationsClientModule` circular-dependency bug folded into this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- SETTLE-09's `PlatformConfig`-flag-gated cutover pattern (`transport.service.ts`, `delivery.service.ts`) — direct template for the new gRPC canary flag (D-01)
- `RedisService.setNx()` (`redis.service.ts:131`) — distributed lock primitive, ready to use as-is (D-08 keeps its current fail-open semantics, no changes needed to the method itself)
- Existing Grafana Cloud OTLP pipeline (wired Phase 2/16) and `ResilienceService` circuit-breaker state — reused as the rollback-trigger signal (D-06), no new observability build needed

### Established Patterns
- Every gRPC service scaffold (`backend/apps/*-service/`) follows the same shape: `main.ts` bootstraps `NestFactory.createMicroservice()`, `app.module.ts` imports `PrismaModule`/`RedisModule`/`ResilienceModule`/the feature module, one `*-grpc.controller.ts`. The health-check addition (GRPC-06a) should follow this same shape — a small additional controller/provider registered alongside the existing `*-grpc.controller.ts`, not a structural change.
- `@Cron` jobs in this codebase already use idempotency-flag-on-the-row patterns (e.g., `tour-notifications.service.ts`'s `metadata` JSON flags) to avoid double-sending within a single replica's own repeated ticks — the new `setNx()` guard is an additive, orthogonal protection against a *second replica's* tick, not a replacement for the existing per-row idempotency checks.
- `notifications-client.module.ts` is the sole `ClientGrpc`-calling entry point on the monolith side for notifications — the canary flag check and the folded e2e fix both land here, in the same file, in the same phase.

### Integration Points
- New: `packages/proto/grpc-health.proto` (or equivalent) + a shared `HealthController`/provider pattern, applied first to `notifications-service`
- New: `railway.toml` update on `notifications-service` (and an HTTP `/healthz` sidecar if Railway's healthcheck can't target gRPC directly — see Claude's Discretion)
- New: one `PlatformConfig` row (or equivalent) for the canary flag, checked in `notifications-client.module.ts`
- New: `setNx()` guard added to 6 existing `@Cron` methods across `stays.service.ts`, `delivery.service.ts`, `transport.service.ts`, `tour-notifications.service.ts`
- New: `docs/blue-green-cutover-runbook.md` (or similar path — planner's discretion on exact location)
- Fix: `forwardRef()` in `notifications-client.module.ts`'s circular dependency; CI wiring in `.github/workflows/ci.yml`

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references — this is a backend/infra reliability phase with no user-facing surface. The one artifact with a specific delivery expectation is the written runbook (D-04) — a markdown document an operator reads and follows step-by-step during a real cutover, not just an internal engineering note.

</specifics>

<deferred>
## Deferred Ideas

- **Full parallel-Railway-environment/proxy-based traffic-split canary** (D-01) — a genuine percentage-based canary (not just a binary flag flip) was explicitly rejected as more infrastructure than this milestone's budget/risk tolerance calls for. If Railway's native health-gated rollout or the app-level flag ever proves insufficient in practice, this is the next tier to reach for.
- **Automated rollback script/CLI** (D-04) — a `npm run grpc:rollback` -style command was considered; deferred in favor of a manual runbook, consistent with the project's existing pattern of not building new tooling for admin/ops actions the whole milestone.
- **Numeric rollback threshold + new Grafana alert rule** (D-06) — deferred; the 15-minute actively-watched window doesn't need an automated alert on top of a human already watching the dashboard, but this is worth revisiting if bake windows are ever extended or unattended.
- **Fail-closed cron locking for financial crons** (D-08) — would require `setNx()` to distinguish "lock acquired" from "Redis unavailable," which it currently cannot. Noted as a legitimate future hardening if Redis outages during cutover windows are ever observed to actually cause a double-release incident.

### Reviewed Todos (not folded)
- "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — matched Phase 20 during cross-referencing (score 0.6) but is already resolved: all 8 `backend/apps/*-service` scaffolds, including `notifications-service`, already import `ResilienceModule` in their `app.module.ts`. No action needed; noted here so it isn't re-surfaced as open work.

</deferred>

---

*Phase: 20-gRPC Blue-Green Healthcheck Retrofit*
*Context gathered: 2026-07-20*
*Revised: 2026-07-20 (added D-10 addendum confirming canary kill-switch semantics per checker feedback)*
