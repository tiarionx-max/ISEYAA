---
status: partial
phase: 20-grpc-blue-green-healthcheck-retrofit
source: [20-VERIFICATION.md]
started: 2026-07-20T20:12:14Z
updated: 2026-07-20T20:12:14Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Railway healthcheck-blocks-promotion test
expected: Deploy `notifications-service` to Railway with a deliberately-failing `/healthz` response (e.g. force `HealthImplementation.setStatus('', 'NOT_SERVING')` or crash the Prisma connection). Railway refuses to route traffic to the new container and keeps serving the last known-good deployment until `/healthz` returns 200.
result: [pending]

### 2. Concurrent cron-replica dedup test
expected: Run two replicas of the monolith (or notifications-service) concurrently against shared Redis (e.g. temporarily remove docker-compose.yml's fixed container_name/port mapping and `docker compose up --scale notifications-service=2`). Exactly one replica's tick wins the lock and runs each `cron-lock:*`-guarded body (releaseEscrow, cleanStaleDriverHeartbeats, cleanStaleRiderHeartbeats, pushTMinus24h, pushTMinus2h, pushPostTourRating) per interval; the other observes `setNx()` return false and skips (logged via `logger.debug`).
result: [pending]

### 3. Full live blue-green cutover execution
expected: Execute the full 6-step blue-green cutover procedure in `docs/blue-green-cutover-runbook.md` against a real Railway deployment of `notifications-service`: flip canary flag off, deploy new build, run synthetic verification directly against the new container, flip canary flag back on, actively watch the 15-minute bake window, confirm the rollback path (flag flip back to false) actually restores the pre-cutover behavior. The operator can follow the runbook verbatim and successfully completes a real cutover with the documented rollback available and working if bake-window signals show trouble.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
