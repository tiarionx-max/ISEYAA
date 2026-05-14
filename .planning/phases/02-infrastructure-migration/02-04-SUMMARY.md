# Plan 02-04 Summary: OTel + Sentry + Health Endpoint

**Status:** COMPLETE  
**Date:** 2026-05-12  
**Tests:** 173/173 passing  
**TypeScript:** 0 errors

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/src/instrumentation.ts` | Created — OTel NodeSDK, OTLP HTTP exporter for Grafana Cloud, SIGTERM shutdown |
| `backend/src/main.ts` | Modified — Sentry.init() before bootstrap, Swagger gated behind APP_ENV !== production |
| `backend/src/health/health.controller.ts` | Created — GET /api/v1/health via @nestjs/terminus |
| `backend/src/health/health.module.ts` | Created — TerminusModule + HealthController |
| `backend/src/app.module.ts` | Modified — HealthModule added to imports |
| `backend/railway.toml` | Created — healthcheckPath = "/api/v1/health", startCommand = "npm run start:prod" |
| `backend/package.json` | Modified — start:prod with --require ./dist/instrumentation.js; added @nestjs/microservices, @nestjs/terminus, OTel packages, @sentry/nestjs |
| `.env.example` | Modified — SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT, GRAFANA_CLOUD_OTLP_TOKEN, OTEL_SERVICE_NAME added |

## Key Design Decisions

- **OTel loaded via --require**: `instrumentation.ts` must be required BEFORE main.ts so OTel auto-patches Node HTTP/Express before NestJS bootstraps — this is the only correct ordering
- **No NestJS imports in instrumentation.ts**: ConfigService, Prisma, etc. cannot be used here — reads directly from `process.env`
- **Swagger gated behind APP_ENV !== production**: Fixes CONCERNS.md T-06 security issue — Swagger UI never exposed in prod
- **Empty health check array**: `/api/v1/health` returns `{ status: 'ok' }` with no DB/Redis checks — Railway only needs HTTP 200 to confirm startup; deeper checks added in Phase 6
- **@nestjs/microservices installed**: Added for Wave 3 gRPC imports in main.ts; connectMicroservice() itself deferred to Plan 02-08

## Security Fixes

- T-02-17 RESOLVED: Swagger UI now gated behind `APP_ENV !== 'production'`

## User Setup Required

Before production deploy:
1. Create Grafana Cloud stack → get OTLP endpoint + token
2. Create Sentry project (Node.js) → get DSN
3. Set env vars in Railway/Infisical: `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_CLOUD_OTLP_TOKEN`, `OTEL_SERVICE_NAME=iseyaa-api`
