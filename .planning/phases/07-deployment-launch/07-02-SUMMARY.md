---
phase: 07-deployment-launch
plan: "02"
subsystem: backend
tags: [cors, security, swagger, production, railway, deployment]
dependency_graph:
  requires: [07-01]
  provides: [production-cors-config, swagger-gate, railway-env-checklist]
  affects: [backend/src/main.ts, .env.example, MANUAL-ACTIONS.md]
tech_stack:
  added: []
  patterns: [ENV-driven CORS origin allowlist, NODE_ENV feature gate, production hardening]
key_files:
  created: []
  modified: [backend/src/main.ts, .env.example, MANUAL-ACTIONS.md]
key_decisions:
  - "Use process.env.ALLOWED_ORIGINS directly (not ConfigService) for CORS so the check runs before NestJS app context is fully initialized"
  - "Gate Swagger on NODE_ENV !== 'production' (not APP_ENV) to align with standard Node.js convention and Railway's automatic NODE_ENV=production in prod deployments"
  - "Fallback CORS origins are localhost:3000 and localhost:19006 (web + Expo) — not wildcard — eliminating the previous dev-mode wildcard risk"
  - "ENCRYPTION_KEY rotation warning documented prominently: rotating breaks existing AES-256-GCM ciphertext for BVN/NIN data"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-20"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 3
---

# Phase 7 Plan 02: Production Hardening — CORS, Swagger Gate, Railway Checklist

**One-liner:** Production CORS restricted to explicit origin allowlist via ALLOWED_ORIGINS env var, Swagger UI gated behind NODE_ENV !== 'production', and Railway operator checklist documented in MANUAL-ACTIONS.md.

## What Was Built

### Task 1: backend/src/main.ts — CORS + Swagger hardening

Two security-critical changes to the NestJS bootstrap:

**CORS origin allowlist (was: wildcard fallback):**
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:19006'];

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
});
```

Previously the code fell back to `'*'` (wildcard) when `ALLOWED_ORIGINS` was absent. The new fallback is a localhost-only list, so CORS is never open to the world even in misconfigured environments.

In production (Railway), `ALLOWED_ORIGINS=https://iseyaa.ng,https://www.iseyaa.ng,https://admin.iseyaa.ng` restricts credentialed cross-origin requests to the official domain only.

**Swagger UI gate (was: APP_ENV check; now: NODE_ENV check):**
```typescript
if (process.env.NODE_ENV !== 'production') {
  // Swagger setup — only in development/staging
}
```

Railway automatically sets `NODE_ENV=production` for production deployments. This ensures `/api/docs` (and `/api-json`) returns 404 in production — preventing API schema disclosure to unauthorized parties.

### Task 2: .env.example — production deployment section

Appended a `# Production Deployment` section documenting:
- `NODE_ENV=production` — required Railway env var
- `ALLOWED_ORIGINS` with production domain list
- Commented-out Paystack LIVE key names (values never committed)
- Commented-out production Neon DATABASE_URL template

### Task 3: MANUAL-ACTIONS.md — Phase 7 Railway checklist

Appended a complete "Phase 7: Production Deployment (LAUNCH-01 → LAUNCH-03)" section including:
- 10-row Railway environment variable checklist (what to switch for go-live)
- `ENCRYPTION_KEY` rotation danger warning (breaks BVN/NIN ciphertext if rotated without migration)
- 3 verification curl commands (health check, Swagger 404, CORS rejection test)
- Cloudflare WAF setup steps (managed ruleset, DDoS protection, Full strict SSL)
- `07-approved` resume signal

## Deviations from Plan

**[Rule 1 - Enhancement] Used process.env instead of ConfigService for CORS**

The plan specified `process.env.ALLOWED_ORIGINS` directly (not `config.get('ALLOWED_ORIGINS')`). The existing code was using `config.get<string>('ALLOWED_ORIGINS', '*')`. Updated to `process.env.ALLOWED_ORIGINS` as specified in the plan — this is more appropriate for bootstrap-time config that runs before NestJS DI is fully operational, and removes the wildcard default.

**[Observation] APP_ENV vs NODE_ENV**

The existing code used `APP_ENV` for the Swagger gate; the plan correctly specifies `NODE_ENV`. Railway uses the standard `NODE_ENV=production` convention, not a custom `APP_ENV`. Changed both the Swagger gate and the log line to use `process.env.NODE_ENV`. The Sentry init still reads `APP_ENV` for environment labeling (correct — it's a different purpose).

## Threat Surface Scan

Mitigations from plan's threat model applied:

| Threat | Disposition | Applied |
|--------|-------------|---------|
| T-07-03: Swagger UI exposed in production | mitigate | NODE_ENV gate closes /api/docs in production |
| T-07-04: CORS wildcard allows any origin | mitigate | Explicit allowlist via ALLOWED_ORIGINS; localhost fallback replaces wildcard |
| T-07-05: ENCRYPTION_KEY rotation risk | accept | Documented in MANUAL-ACTIONS.md with explicit warning |

No new threat surface introduced.

## Self-Check: PASSED

- `backend/src/main.ts` contains `ALLOWED_ORIGINS`: VERIFIED (line 30-32)
- `backend/src/main.ts` contains `NODE_ENV !== 'production'` for Swagger gate: VERIFIED (line 45)
- `.env.example` contains `ALLOWED_ORIGINS=https://iseyaa.ng,...`: VERIFIED (appended section)
- `.env.example` contains `NODE_ENV=production`: VERIFIED (appended section)
- `MANUAL-ACTIONS.md` contains "Phase 7" section: VERIFIED (appended)
- `MANUAL-ACTIONS.md` contains "LAUNCH-01": VERIFIED (appended section header)
- `npx tsc --noEmit -p backend/tsconfig.json` exits 0: VERIFIED (no output = no errors)
