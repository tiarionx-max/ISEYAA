# Blue-Green Cutover Runbook

This runbook covers `notifications-service` today — the platform's first genuinely
separate deployed gRPC process (own Railway service, `ClientGrpc`, port 5008) — and
applies going forward to any service extracted in Phase 21 and beyond, following the
same canary-flag-gated cutover pattern.

The runbook is the only guardrail between an operator and a real citizen-facing
outage during a cutover. Follow the steps in order. Do not reorder them — the
ordering itself is the load-bearing content (see Pitfall 2, referenced in Step 5
below).

## Prerequisites

Before starting a cutover, confirm the operator has:

- **Railway dashboard access** to the project's `notifications-service` deployment
  (to observe the health-gated container swap and, if needed, trigger a rollback to
  a previous known-good deployment).
- **A `SUPER_ADMIN` or `LGA_ADMIN` JWT** for the backend's admin config endpoint
  (`PATCH /api/v1/admin/config/:key` is already `JwtAuthGuard`-gated with those two
  roles — no new auth work was needed for this runbook).
- **Grafana Cloud dashboard access** for the existing gRPC error-rate panel covering
  `notifications-service`.

## Procedure

Follow these 6 steps in exact order. Each step names the exact endpoint, command, or
dashboard involved — do not paraphrase the PATCH body or the config key name.

### Step 1 — Flip the canary flag OFF

```
PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled
Body: { "value": false }
```

This is the existing config endpoint at `backend/src/modules/admin/admin.controller.ts:96-100`,
already `SUPER_ADMIN`/`LGA_ADMIN` + `JwtAuthGuard`-gated. Setting `value: false` makes
the monolith immediately stop depending on `notifications-service` — every call into
`NotificationsClientService.registerToken()` / `sendPush()` now throws
`ServiceUnavailableException` immediately, without attempting a gRPC call, independent
of whatever Railway does next.

### Step 2 — Railway performs its own healthcheck-gated container swap

Deploy the new `notifications-service` build. Railway's `healthcheckPath = /healthz`
(wired in `backend/apps/notifications-service/railway.toml`) blocks promotion of the
new container if its `/healthz` HTTP check fails — Railway keeps serving the previous
instance until the new one reports healthy. No operator action is required here beyond
triggering the deploy and watching the Railway dashboard.

### Step 3 — Run synthetic verification DIRECTLY against the new container

With the canary flag off, run D-03's synthetic verification directly against the new
`notifications-service` container — bypassing the monolith and the canary flag
entirely:

- A raw `grpc.health.v1.Health` check call against the new container's gRPC port
  (5008), confirming it responds `SERVING`.
- A small number of known-safe test notification sends (push/registration RPCs) to an
  ops-owned test number/email — not real citizen traffic.

This step must NOT rely on the canary flag or the circuit breaker. With the flag off,
nothing is calling through those paths yet, so they cannot be used to validate the new
container — this verification talks to the new container directly.

### Step 4 — Flip the canary flag back ON

```
PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled
Body: { "value": true }
```

The monolith resumes real citizen traffic through `notifications-service`.

### Step 5 — Actively watch the bake window (see "Bake window" below)

Immediately after Step 4, actively watch, for exactly 15 minutes:

- (a) The existing Grafana Cloud dashboard's gRPC error rate for
  `notifications-service`.
- (b) `ResilienceService`'s `notificationsGrpc` circuit-breaker state (open = trouble).

**Pitfall 2 — read this before starting a cutover:** both signals (a) and (b) are only
meaningful from Step 4 forward. Step 1 made the monolith stop calling
`notifications-service` entirely, so a flat or idle graph observed before Step 4 proves
nothing about the new container's health — it only proves nothing was calling it. Do
not treat a quiet dashboard between Step 1 and Step 4 as a good sign; it is not a
signal at all.

### Step 6 — Rollback path

If Step 5 shows trouble (elevated gRPC error rate, or the `notificationsGrpc` breaker
opens):

- **Traffic-level rollback (first action, always):** flip the canary flag back to
  `{ "value": false }` via the same `PATCH /api/v1/admin/config/grpc.notifications_service.canary_enabled`
  endpoint used in Steps 1 and 4. This is the entire rollback mechanism (D-04) — no new
  tooling was built for this phase; flipping the flag is the rollback.
- **Code-level rollback (only if the underlying code itself needs reverting, not just
  a traffic pause):** separately trigger a standard Railway rollback to the previous
  known-good deployment from the Railway dashboard. This is an existing Railway
  platform capability, not something built by this phase.

## Rollback

See Step 6 above. Restated for quick reference during an incident:

1. Flip `grpc.notifications_service.canary_enabled` to `false` immediately — this
   pauses traffic to `notifications-service` without requiring any deploy or code
   change.
2. If the previous container build itself needs reverting (not just a traffic pause),
   trigger a Railway rollback to the last known-good deployment.

## Bake window

The bake window is a **fixed 15-minute, actively-watched** window starting immediately
after Step 4 (the flag flips back on) — not an open-ended or unattended timer.

"Actively watched" means operationally: a human operator keeps the Grafana Cloud
dashboard open and refreshing for the full 15 minutes, and is prepared to execute Step
6's rollback the moment either signal (gRPC error rate or the `notificationsGrpc`
breaker state) indicates trouble. This is not a background job, a scheduled check, or
a "come back in 15 minutes" timer — the operator is present and watching for the
entire window.

## Known manual-only checks

The following three items are known manual-only verifications, recorded here rather
than silently dropped, per `20-VALIDATION.md`'s Manual-Only Verifications table. None
of these are re-tested by this phase's automated test suite — each requires either a
real Railway deployment or a real multi-replica environment that is out of scope for
this phase's automation.

1. **Railway `healthcheckPath` actually blocks promotion on a deliberately-failing
   health response.** Confirming this requires a real Railway deploy with the health
   endpoint forced to return `NOT_SERVING`, observing that Railway blocks promotion and
   keeps serving the previous instance — not reproducible in CI or locally.

2. **Two replicas of the same guarded cron actually coexist and only one fires.**
   `docker-compose.yml`'s fixed `container_name` and fixed host port mapping
   (`5008:5008`) block a trivial `docker compose up --scale notifications-service=2`
   without first removing both. Per `20-VALIDATION.md`'s Wave 0 resolution, this phase
   documents the check as manual rather than building a scale-friendly compose
   override — a deliberate, recorded decision. To run it manually: temporarily remove
   the fixed `container_name`/port mapping, run
   `docker compose up --scale notifications-service=2`, and observe logs/DB state to
   confirm only one instance executes each `cron-lock:*`-guarded tick.

3. **`ResilienceService`'s `notificationsGrpc` breaker tuning is live-tunable.** The
   default tuning (`failureThreshold: 8`, `halfOpenAfterMs: 20000`) is adjustable at
   runtime via the `PlatformConfig` key
   `resilience.notificationsGrpc.breaker_failure_threshold` with no redeploy required.
   This is not tested automatically — it is documented here as an available lever if
   an operator judges the default threshold too sensitive or too loose for a specific
   cutover. No code change was made this phase to alter the default; this is purely an
   operational escape hatch already wired by the resilience layer.
