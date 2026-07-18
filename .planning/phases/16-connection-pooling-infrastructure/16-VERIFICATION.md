# Phase 16: Connection Pooling Infrastructure — Human Verification Record

**Recorded:** 2026-07-18
**Recorded by:** Executor agent (16-04), transcribing operator confirmations collected by the orchestrator via AskUserQuestion. The operator performed all dashboard/CLI actions outside this session — this executor has no Neon/Grafana/Railway credentials and did not log into any of the three dashboards itself.

This file satisfies plan `16-04`'s `must_haves.artifacts` requirement: operator sign-off recorded for all three `checkpoint:human-verify` tasks (Neon ceiling, combined-topology load test + Grafana alert, production Railway `DATABASE_URL` change).

---

## Task 1 — Neon Console plan/CU ceiling confirmation

**Resume signal received:** `16-neon-confirmed`

**Operator attestation:** "104 baseline confirmed unchanged" — the operator logged into the Neon Console for this project's database, navigated to Project → Settings → Compute (and/or Billing), and confirmed the real provisioned plan/CU ceiling is **at or above 104 max_connections** — the conservative baseline documented in `.env.example` (16-RESEARCH.md Assumptions Log A1/A2) was not too high.

**Reconciliation outcome (per plan Task 1 step 4, "if real ceiling >= 104" branch):**
- No changes needed to `.env.example`'s documented `connection_limit=20` (monolith) or `connection_limit=5` (notifications-service).
- No changes needed to the 83-connection Grafana alert threshold (80% of 104, per D-07).
- These values stand as-is — now **confirmed** against the live Neon Console rather than assumed from Neon's published smallest-tier table.

**Exact plan tier / CU autoscale range:** Not itemized by the operator beyond the pass/fail confirmation that the ceiling is >= 104. No specific plan name (Free/Launch/Scale) or CU range number was provided — recorded here as operator-attested, not fabricated.

---

## Task 2 — Combined-topology k6 load test + Grafana gauge/alert confirmation

**Resume signal received:** `16-load-confirmed`

**Operator attestation:** "Yes — confirmed under ceiling, alert saved."

**What was run (per plan Task 2 step 1):** The operator ran the combined-topology k6 scenario with the monolith and `notifications-service` both running locally, driving HTTP load against the monolith and gRPC load against `notifications-service` simultaneously:

```bash
cd load-tests/k6 && k6 run --vus 50 --duration 60s \
  --env BASE_URL=http://localhost:3001 \
  --env NOTIFICATIONS_GRPC_URL=localhost:5008 \
  main.js
```

**Confirmations obtained:**
- **pg_stat_activity cross-check (step 2):** The operator confirmed the live open-connection count stayed **under the ceiling confirmed in Task 1** during the run.
- **Grafana Cloud gauge (step 3):** The operator logged into Grafana Cloud and confirmed the `postgres_open_connections` panel showed **live, moving values** during the k6 run — proving Plan 16-02's OTel metric export pipeline is actually delivering data end-to-end, not just wired in code.
- **Grafana alert rule (step 4):** The operator created/confirmed a Grafana alert rule on `postgres_open_connections` firing at **83 connections (80% of the confirmed 104-connection ceiling)**, per D-07. The alert rule is saved.

**k6 run numeric detail (VUs, http_req_duration p95, grpc_req_duration p95, error rate):** Not itemized by the operator beyond overall pass/fail. The operator confirmed the run passed and stayed under the ceiling; specific p95/error-rate numbers were not reported to this recording step and are not fabricated here.

---

## Task 3 — Production Railway `DATABASE_URL` change (monolith)

**Resume signal received:** `16-approved`

**Operator attestation:** "Yes — changed, redeployed, confirmed."

**Change applied (per plan Task 3 steps 1-5):**
- Service: the monolith service on Railway (running `backend/src/main.ts`) — **not** `notifications-service`, which has no production Railway deployment yet (its live extraction is Phase 17 scope).
- `DATABASE_URL` updated to the pooled `-pooler` format documented in `.env.example` (Plan 16-01 Task 3), with query params `connection_limit=20&pool_timeout=10` — the same value confirmed unchanged by Task 1's reconciliation (no downward revision was needed since the real Neon ceiling was confirmed >= 104).
- **No `?pgbouncer=true`** included (Neon's managed pooler does not use it — 16-RESEARCH.md Pitfall 3).
- `DIRECT_URL` left unchanged — still the existing unpooled Neon connection string, used only by `prisma migrate`.
- Variable saved; Railway redeployed the monolith service.

**Post-redeploy confirmation (step 6):** The operator confirmed the new `connection_limit` is in effect. Per the plan's three acceptable confirmation methods (pg_stat_activity count / Railway deploy logs / Grafana gauge), the operator confirmed the change took effect but did not itemize which specific method was used, nor an exact redeploy timestamp.

**Redeploy timestamp:** operator-confirmed, method not itemized.
**Confirmation method used (of the three offered):** operator-confirmed, method not itemized.

This is recorded as an operator-attested pass without fabricating a specific timestamp or method, per the plan's own step 7 instruction to record "the connection_limit value applied, the redeploy timestamp, and which of the three confirmation methods... was used" — the latter two fields were not itemized by the operator beyond the overall confirmation, and are represented honestly here rather than invented.

---

## Summary

| Task | Resume Signal | Outcome |
|------|---------------|---------|
| 1. Neon Console ceiling | `16-neon-confirmed` | 104-connection baseline confirmed unchanged; no `.env.example` or alert-threshold changes needed |
| 2. Combined-topology load test + Grafana alert | `16-load-confirmed` | Confirmed under ceiling; Grafana alert rule saved at 83 connections (80% of 104) |
| 3. Production Railway DATABASE_URL | `16-approved` | Monolith's live `DATABASE_URL` changed to pooled `-pooler` format (`connection_limit=20&pool_timeout=10`), redeployed, confirmed in effect (method not itemized) |

All three `checkpoint:human-verify` gates for Phase 16 are closed. Phase 16 (POOL-01, POOL-02) is complete.
