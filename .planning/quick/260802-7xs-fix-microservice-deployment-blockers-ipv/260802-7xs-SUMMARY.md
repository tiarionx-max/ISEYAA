---
phase: quick
plan: 260802-7xs
subsystem: backend-microservices
tags: [grpc, railway, ipv6, deployment, swagger, dependency-injection]
dependency-graph:
  requires: []
  provides:
    - "IPv6-capable gRPC binds on news/waitlist/reviews/notifications/delivery-otp services"
    - "Swagger /docs UI on all 5 gRPC microservices"
    - "NotificationsClientService DI stub in delivery-otp-service"
  affects:
    - "backend/apps/news-service/src/main.ts"
    - "backend/apps/waitlist-service/src/main.ts"
    - "backend/apps/reviews-service/src/main.ts"
    - "backend/apps/notifications-service/src/main.ts"
    - "backend/apps/delivery-otp-service/src/main.ts"
    - "backend/apps/delivery-otp-service/src/app.module.ts"
tech-stack:
  added: []
  patterns:
    - "IPv6 literal bind syntax '[::]:<port>' for gRPC Transport.GRPC url option"
    - "useValue token-override stub provider for DI dependencies unreachable by a scoped-down microservice's exposed RPCs (mirrors existing DeliveryGateway stub)"
key-files:
  created: []
  modified:
    - "backend/apps/news-service/src/main.ts"
    - "backend/apps/waitlist-service/src/main.ts"
    - "backend/apps/reviews-service/src/main.ts"
    - "backend/apps/notifications-service/src/main.ts"
    - "backend/apps/delivery-otp-service/src/main.ts"
    - "backend/apps/delivery-otp-service/src/app.module.ts"
decisions: []
metrics:
  duration: "~15 minutes"
  completed: "2026-08-02"
---

# Phase quick Plan 260802-7xs: Fix microservice deployment blockers (IPv6 gRPC bind + DI stub) + Swagger docs Summary

Fixed two deploy-blocking defects (IPv4-only gRPC binds unreachable on Railway's IPv6-only private network; a guaranteed `UnknownDependenciesException` boot crash in delivery-otp-service) and added Swagger `/docs` to all 5 already-extracted gRPC microservices.

## What Was Built

**Task 1 — IPv6 gRPC bind + Swagger docs (5 files):**
In each of `news-service`, `waitlist-service`, `reviews-service`, `notifications-service`, `delivery-otp-service`'s `main.ts`:
- Changed `url: '0.0.0.0:<port>'` to `url: '[::]:<port>'` in the `connectMicroservice` gRPC transport options, with an inline comment explaining Railway's private network (`<name>.railway.internal`) is IPv6-only.
- Added `import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';` and a Swagger setup block (`DocumentBuilder().setTitle(...).setDescription(...).setVersion('1.0').build()` → `SwaggerModule.createDocument` → `SwaggerModule.setup('docs', app, document)`) inserted after `await app.startAllMicroservices();` and before `await app.listen(...)`. Each description documents that the HTTP surface is health-only and the real contract is the service's gRPC package/proto file.
- Nothing else changed: `package`, `protoPath`, the health-check `onLoadPackageDefinition` closure, the `console.log` line, and `bootstrap()` invocation are all untouched.

**Task 2 — NotificationsClientService DI stub (delivery-otp-service):**
`backend/apps/delivery-otp-service/src/app.module.ts` now imports `NotificationsClientService` from `../../../src/modules/notifications-client/notifications-client.service` and provides it via a `useValue` stub (`{ sendPush: async () => ({ sent: false }) }`) in the `providers` array, alongside the pre-existing `DeliveryGateway` stub. This closes `DeliveryService`'s constructor param index 7, which was previously unprovided and would have thrown `UnknownDependenciesException` on boot. `verifyOtp` (the only RPC this process exposes via `DeliveryOtpGrpcController`) never calls `this.notifications`, so the stub is a safe no-op — the real dependency is only reached by other `DeliveryService` methods (e.g. near `delivery.service.ts:906`) this scoped-down process never invokes. `NotificationsClientModule` was deliberately NOT imported wholesale, for the same reason the file already documents for `WalletModule`/`CommonModule`/`AuthModule`.

## Verification

- `grep -rn "url: '\[::\]"` across all 5 `main.ts` files: 5/5 matches, correct port each (5009/5010/5011/5008/5012).
- `grep -l "SwaggerModule.setup('docs'"` across all 5 `main.ts` files: 5/5 present.
- `grep -n "NotificationsClientService"` in `delivery-otp-service/src/app.module.ts`: import + provider entry both present.
- Confirmed `NotificationsClientService` is exported from `backend/src/modules/notifications-client/notifications-client.service.ts` and its `sendPush(userId, title, body, data?)` signature matches the stub's async no-arg-compatible shape (stub is cast `as unknown as NotificationsClientService`, matching the existing `DeliveryGateway` stub's cast pattern).
- `git status` confirms only the 6 files listed in the plan's frontmatter changed; `git branch --show-current` confirms still on `claude/upbeat-montalcini-d49312` (not `main`). No merge, no push to `main`, no Railway CLI or redeploy command was run.
- Post-commit deletion check: `git diff --diff-filter=D --name-only HEAD~2 HEAD` returned empty — no files were deleted by either commit.

**`nest build` could NOT be run:** `backend/node_modules` does not exist in this working tree (`ls node_modules` → No such file or directory, `node_modules/.bin/nest` absent). Per the task constraints, `npm ci`/`npm install` was NOT run to force it. All changes were verified via direct grep/read inspection instead: syntax was written to mechanically match the plan's exact interface example (already-working code for `HealthImplementation`/`onLoadPackageDefinition` untouched), `@nestjs/swagger` is already a declared backend dependency (confirmed in `CLAUDE.md`'s Key Dependencies list — `@nestjs/swagger` 11.4.x), and the `DocumentBuilder`/`SwaggerModule` API calls follow the exact standard usage pattern already used at `backend/src/main.ts`'s `/api/docs` setup for the monolith. **Recommend running `cd backend && npx nest build news-service && npx nest build waitlist-service && npx nest build reviews-service && npx nest build notifications-service && npx nest build delivery-otp-service` in an environment with `node_modules` installed before merging/deploying**, to catch any TypeScript error this inspection-only pass could miss.

## Deviations from Plan

None — plan executed exactly as written. The only departure from the plan's literal `<verify>` automated step (`npx nest build <service>` x5) is the missing `node_modules` toolchain, which is explicitly anticipated and permitted by this task's constraints ("If the local toolchain/node_modules is unavailable and build cannot run, note that in the SUMMARY instead of failing — do NOT run npm ci / install to force it").

## Known Stubs

- `backend/apps/delivery-otp-service/src/app.module.ts`: `NotificationsClientService` provider is a `useValue` stub (`sendPush` always returns `{ sent: false }`, never actually dispatches). This is intentional and documented in-line — the sole RPC this process exposes (`verifyOtp`) never calls this dependency; the real `NotificationsClientService` remains fully wired in the monolith and in `notifications-service`. Not a gap requiring future resolution unless a future RPC is added to this scoped-down service that does need real push-notification dispatch.

## Self-Check: PASSED

- FOUND: backend/apps/news-service/src/main.ts (url `[::]:5009`, SwaggerModule.setup present)
- FOUND: backend/apps/waitlist-service/src/main.ts (url `[::]:5010`, SwaggerModule.setup present)
- FOUND: backend/apps/reviews-service/src/main.ts (url `[::]:5011`, SwaggerModule.setup present)
- FOUND: backend/apps/notifications-service/src/main.ts (url `[::]:5008`, SwaggerModule.setup present)
- FOUND: backend/apps/delivery-otp-service/src/main.ts (url `[::]:5012`, SwaggerModule.setup present)
- FOUND: backend/apps/delivery-otp-service/src/app.module.ts (NotificationsClientService import + provider present)
- FOUND commit bda6e16: fix(260802-7xs): bind gRPC microservices to IPv6 and add Swagger docs
- FOUND commit 8404b81: fix(260802-7xs): provide NotificationsClientService stub in delivery-otp-service
