# Phase 20: gRPC Blue-Green Healthcheck Retrofit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 20-gRPC Blue-Green Healthcheck Retrofit
**Areas discussed:** Blue-green mechanism depth, Fold in NotificationsClientModule e2e fix?, Bake window & rollback trigger, Cron lock fail-safe policy

---

## Blue-green mechanism depth

### Q1: How much should we build to satisfy GRPC-06c's "manual pointer-flip" wording?

| Option | Description | Selected |
|--------|-------------|----------|
| Railway-native only (light) | Add health check + railway.toml wiring; Railway auto-manages cutover, no separate pointer | |
| Health check + app-level canary flag | Reuse the SETTLE-09 PlatformConfig flag pattern as the pointer | ✓ |
| Full parallel-environment canary | Two live Railway environments + proxy/DNS-weight layer | |

**User's choice:** Health check + app-level canary flag (recommended)
**Notes:** Rejected the full parallel-environment build as tension with the ~$11/mo MVP cost target and more than the research recommends building speculatively. Rejected Railway-native-only as insufficient — no literal "pointer" for an operator to flip.

### Q2: How should the shadow-verify step avoid double-sending real SMS/email/push to citizens?

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic-payload verification | Operator sends test/synthetic RPCs to the new instance before flipping the flag | ✓ |
| Dry-run mirrored traffic | New instance receives mirrored real traffic but runs in dry-run mode | |
| Small live percentage split | ~5% of real traffic routed to new instance during bake | |

**User's choice:** Synthetic-payload verification (recommended)
**Notes:** Percentage split explicitly ruled out as carrying real duplicate-send risk for a citizen-facing government platform.

### Q3: How should the documented rollback path be delivered?

| Option | Description | Selected |
|--------|-------------|----------|
| Written runbook | Markdown doc describing manual flag flip-back | ✓ |
| Runbook + a rollback script | Same runbook plus an npm/CLI script | |

**User's choice:** Written runbook (recommended)
**Notes:** Matches Phase 18/19's precedent of backend-only, no new admin tooling.

---

## Fold in NotificationsClientModule e2e fix?

### Q1: Fold the circular-dependency e2e fix into Phase 20, or leave it separate?

| Option | Description | Selected |
|--------|-------------|----------|
| Fold it in | Fix forwardRef() bug as part of Phase 20, wire test:e2e:tours into CI | ✓ |
| Leave it separate | Keep Phase 20 strictly scoped to health/blue-green/cron-lock work | |

**User's choice:** Fold it in (recommended)
**Notes:** Phase 20 already touches NotificationsClientModule directly for the canary flag; fixing it here is cheap and gives Phase 20's own changes real e2e coverage.

---

## Bake window & rollback trigger

### Q1: How long should the old instance stay up as a rollback target?

| Option | Description | Selected |
|--------|-------------|----------|
| 15 minutes, actively watched | Short window, operator stays at the dashboard | ✓ |
| 1 hour | Longer window for slower-burning issues | |
| Operator's judgment, no fixed timer | Flexible, undocumented duration | |

**User's choice:** 15 minutes, actively watched (recommended)
**Notes:** Fits notifications-service's short-lived-RPC shape; no known slow-burn failure mode requiring a longer window.

### Q2: What signal should trigger rollback during the bake window?

| Option | Description | Selected |
|--------|-------------|----------|
| Grafana error-rate + circuit breaker state | Reuse existing Phase 2/16/17 observability | ✓ |
| Manual test notifications only | Judge only by synthetic test sends succeeding | |
| Defined numeric threshold | e.g. >5% error rate over 1 minute, new alert rule | |

**User's choice:** Grafana error-rate + circuit breaker state (recommended)
**Notes:** No new Grafana alert rule built this phase — reuses what's already wired.

---

## Cron lock fail-safe policy

### Q1: Keep setNx()'s fail-open behavior for all guarded crons, or make it stricter for money-moving ones?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-open everywhere | Keep existing optimistic setNx() behavior unchanged, including escrow release | ✓ |
| Fail-closed for escrow release only | Escrow release skips its tick if Redis is unreachable | |
| Fail-closed everywhere | Every guarded cron skips its tick if Redis is unreachable | |

**User's choice:** Fail-open everywhere (recommended)
**Notes:** A Redis outage during a cutover window degrades to today's status quo (no lock), not a new failure mode. Fail-closed would require setNx() to distinguish "lock acquired" from "Redis unavailable," which it currently cannot.

### Q2: Which @Cron jobs get the setNx() lock this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| All 6 named jobs only | Escrow release, 2 heartbeat cleanups, 3 tour-reminder crons — exactly GRPC-06b's list | ✓ |
| All 7, including db-metrics | Also lock the local-gauge-only connection poll for consistency | |

**User's choice:** All 6 named jobs only (recommended)
**Notes:** db-metrics.pollOpenConnections has no shared side effect — double-polling is harmless and outside GRPC-06b's explicit scope.

---

## Claude's Discretion

- Exact shape of the `grpc.health.v1.Health` implementation (hand-rolled proto vs. npm package)
- Whether Railway's `healthcheckPath` can target gRPC directly or needs an HTTP `/healthz` sidecar
- Exact `PlatformConfig` key name/shape for the canary flag and its call-site wiring
- `ResilienceService` circuit-breaker tuning confirmation for the cutover window

## Deferred Ideas

- Full parallel-Railway-environment/proxy-based traffic-split canary — next tier if the app-level flag ever proves insufficient
- Automated rollback script/CLI — deferred in favor of a manual runbook
- Numeric rollback threshold + new Grafana alert rule — worth revisiting if bake windows are ever extended or unattended
- Fail-closed cron locking for financial crons — legitimate future hardening if a Redis-outage double-release incident is ever observed

**Reviewed but not folded:** "Wire ResilienceModule into gRPC service scaffolds (INT-01)" — already resolved in all 8 scaffolds; no action needed.
