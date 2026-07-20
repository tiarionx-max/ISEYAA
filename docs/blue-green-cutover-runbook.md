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

## Phase 21 Extractions — News, Waitlist, Reviews, Delivery OTP

**D-05 risk-ascending rollout order:** the 4 services below MUST be cut over one at a
time, in this exact order — News, then Waitlist, then Reviews, then Delivery OTP last.
Each service's full 15-minute bake window (Step 5 below, per service) must complete
with no regression before the next service's Step 1 begins. Do not start a second
service's cutover while an earlier one is still baking or has an open rollback
question. This mirrors D-04: each service ships with its own flag flip and bake
period, never all four in one wave.

Each section below follows the exact same 6-step Procedure + Bake window + Rollback
structure as the `notifications-service` section above, substituted per service with
its own canary flag key, gRPC port, and resilience vendor key.

### News Service Cutover

**Canary flag key:** `grpc.news_service.canary_enabled`
**gRPC port:** 5009
**Resilience vendor key:** `newsGrpc`

**Procedure:**

1. **Flip the canary flag OFF** — `PATCH /api/v1/admin/config/grpc.news_service.canary_enabled` with body `{ "value": false }`. The monolith immediately stops depending on `news-service`.
2. **Railway performs its own healthcheck-gated container swap** — deploy the new `news-service` build; Railway's `healthcheckPath = /healthz` blocks promotion until the new container reports healthy.
3. **Run synthetic verification DIRECTLY against the new container** — a raw `grpc.health.v1.Health` check against port 5009 confirming `SERVING`, plus a small number of known-safe test calls, bypassing the canary flag and circuit breaker entirely.
4. **Flip the canary flag back ON** — same endpoint, body `{ "value": true }`. The monolith resumes real citizen traffic through `news-service`.
5. **Actively watch the bake window** for exactly 15 minutes: (a) the Grafana Cloud gRPC error-rate panel for `news-service`, (b) `ResilienceService`'s `newsGrpc` circuit-breaker state (open = trouble). Per Pitfall 2, a quiet dashboard before Step 4 proves nothing — only observation from Step 4 forward is meaningful.
6. **Rollback path** — if Step 5 shows trouble: traffic-level rollback first (flip `grpc.news_service.canary_enabled` back to `false` via the same endpoint); code-level rollback only if the underlying code itself needs reverting (standard Railway rollback to the previous known-good deployment).

**Bake window:** fixed 15-minute, actively-watched window starting immediately after Step 4 — not open-ended or unattended. An operator keeps the Grafana Cloud dashboard open for the full window, ready to execute Step 6 the moment the gRPC error rate or the `newsGrpc` breaker indicates trouble.

**Rollback:** flip `grpc.news_service.canary_enabled` to `false` immediately to pause traffic without a deploy or code change; trigger a Railway rollback separately only if the container build itself needs reverting.

### Waitlist Service Cutover

**Canary flag key:** `grpc.waitlist_service.canary_enabled`
**gRPC port:** 5010
**Resilience vendor key:** `waitlistGrpc`

**Procedure:**

1. **Flip the canary flag OFF** — `PATCH /api/v1/admin/config/grpc.waitlist_service.canary_enabled` with body `{ "value": false }`. The monolith immediately stops depending on `waitlist-service`.
2. **Railway performs its own healthcheck-gated container swap** — deploy the new `waitlist-service` build; Railway's `healthcheckPath = /healthz` blocks promotion until the new container reports healthy.
3. **Run synthetic verification DIRECTLY against the new container** — a raw `grpc.health.v1.Health` check against port 5010 confirming `SERVING`, plus a small number of known-safe test calls, bypassing the canary flag and circuit breaker entirely.
4. **Flip the canary flag back ON** — same endpoint, body `{ "value": true }`. The monolith resumes real citizen traffic through `waitlist-service`.
5. **Actively watch the bake window** for exactly 15 minutes: (a) the Grafana Cloud gRPC error-rate panel for `waitlist-service`, (b) `ResilienceService`'s `waitlistGrpc` circuit-breaker state (open = trouble). Per Pitfall 2, a quiet dashboard before Step 4 proves nothing — only observation from Step 4 forward is meaningful.
6. **Rollback path** — if Step 5 shows trouble: traffic-level rollback first (flip `grpc.waitlist_service.canary_enabled` back to `false` via the same endpoint); code-level rollback only if the underlying code itself needs reverting (standard Railway rollback to the previous known-good deployment).

**Bake window:** fixed 15-minute, actively-watched window starting immediately after Step 4 — not open-ended or unattended. An operator keeps the Grafana Cloud dashboard open for the full window, ready to execute Step 6 the moment the gRPC error rate or the `waitlistGrpc` breaker indicates trouble.

**Rollback:** flip `grpc.waitlist_service.canary_enabled` to `false` immediately to pause traffic without a deploy or code change; trigger a Railway rollback separately only if the container build itself needs reverting.

### Reviews Service Cutover

**Canary flag key:** `grpc.reviews_service.canary_enabled`
**gRPC port:** 5011
**Resilience vendor key:** `reviewsGrpc`

**Procedure:**

1. **Flip the canary flag OFF** — `PATCH /api/v1/admin/config/grpc.reviews_service.canary_enabled` with body `{ "value": false }`. The monolith immediately stops depending on `reviews-service`.
2. **Railway performs its own healthcheck-gated container swap** — deploy the new `reviews-service` build; Railway's `healthcheckPath = /healthz` blocks promotion until the new container reports healthy.
3. **Run synthetic verification DIRECTLY against the new container** — a raw `grpc.health.v1.Health` check against port 5011 confirming `SERVING`, plus a small number of known-safe test calls, bypassing the canary flag and circuit breaker entirely.
4. **Flip the canary flag back ON** — same endpoint, body `{ "value": true }`. The monolith resumes real citizen traffic through `reviews-service`.
5. **Actively watch the bake window** for exactly 15 minutes: (a) the Grafana Cloud gRPC error-rate panel for `reviews-service`, (b) `ResilienceService`'s `reviewsGrpc` circuit-breaker state (open = trouble). Per Pitfall 2, a quiet dashboard before Step 4 proves nothing — only observation from Step 4 forward is meaningful.
6. **Rollback path** — if Step 5 shows trouble: traffic-level rollback first (flip `grpc.reviews_service.canary_enabled` back to `false` via the same endpoint); code-level rollback only if the underlying code itself needs reverting (standard Railway rollback to the previous known-good deployment).

**Bake window:** fixed 15-minute, actively-watched window starting immediately after Step 4 — not open-ended or unattended. An operator keeps the Grafana Cloud dashboard open for the full window, ready to execute Step 6 the moment the gRPC error rate or the `reviewsGrpc` breaker indicates trouble.

**Rollback:** flip `grpc.reviews_service.canary_enabled` to `false` immediately to pause traffic without a deploy or code change; trigger a Railway rollback separately only if the container build itself needs reverting.

### Delivery OTP Service Cutover

**Canary flag key:** `grpc.delivery_otp_service.canary_enabled`
**gRPC port:** 5012
**Resilience vendor key:** `deliveryOtpGrpc`

**Procedure:**

1. **Flip the canary flag OFF** — `PATCH /api/v1/admin/config/grpc.delivery_otp_service.canary_enabled` with body `{ "value": false }`. The monolith immediately stops depending on `delivery-otp-service`.
2. **Railway performs its own healthcheck-gated container swap** — deploy the new `delivery-otp-service` build; Railway's `healthcheckPath = /healthz` blocks promotion until the new container reports healthy.
3. **Run synthetic verification DIRECTLY against the new container** — a raw `grpc.health.v1.Health` check against port 5012 confirming `SERVING`, plus a small number of known-safe test calls, bypassing the canary flag and circuit breaker entirely.
4. **Flip the canary flag back ON** — same endpoint, body `{ "value": true }`. The monolith resumes real citizen traffic through `delivery-otp-service`.
5. **Actively watch the bake window** for exactly 15 minutes: (a) the Grafana Cloud gRPC error-rate panel for `delivery-otp-service`, (b) `ResilienceService`'s `deliveryOtpGrpc` circuit-breaker state (open = trouble). Per Pitfall 2, a quiet dashboard before Step 4 proves nothing — only observation from Step 4 forward is meaningful.
6. **Rollback path** — if Step 5 shows trouble: traffic-level rollback first (flip `grpc.delivery_otp_service.canary_enabled` back to `false` via the same endpoint); code-level rollback only if the underlying code itself needs reverting (standard Railway rollback to the previous known-good deployment).

**Bake window:** fixed 15-minute, actively-watched window starting immediately after Step 4 — not open-ended or unattended. An operator keeps the Grafana Cloud dashboard open for the full window, ready to execute Step 6 the moment the gRPC error rate or the `deliveryOtpGrpc` breaker indicates trouble.

**Rollback:** flip `grpc.delivery_otp_service.canary_enabled` to `false` immediately to pause traffic without a deploy or code change; trigger a Railway rollback separately only if the container build itself needs reverting.
