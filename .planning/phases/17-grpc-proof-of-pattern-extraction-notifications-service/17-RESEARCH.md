# Phase 17: gRPC Proof-of-Pattern Extraction (notifications-service) - Research

**Researched:** 2026-07-18
**Domain:** NestJS `ClientGrpc`/`ClientsModule` (first-ever use in this codebase), cockatiel resilience wrapping around a gRPC call instead of an HTTP call, Docker/npm-workspace dependency resolution for `@iseyaa/proto`, Railway per-service deployment, docker-compose local dev parity
**Confidence:** HIGH for everything directly verified against this repo's own code (facade call sites, existing scaffold, resilience module, Docker/npm workspace gap); HIGH for NestJS/grpc-js official documentation (Context7-verified); MEDIUM for exact cockatiel policy numbers and Railway multi-service dashboard mechanics (no live Railway dashboard access this session)

## Summary

This phase's core mechanical risk is narrow and well-scoped: wire a thin facade (`NotificationsClientService`) around NestJS's `ClientGrpc`, replacing the 2 confirmed in-process injection sites of `NotificationsService` (`NotificationsController`, `TourNotificationsService`). The scaffold (`backend/apps/notifications-service/`) already boots cleanly as of Phase 16 — this phase does not build gRPC infrastructure from scratch, it wires existing infrastructure into live traffic for the first time anywhere in this codebase.

Three things this research found that are **not** in CONTEXT.md and materially affect planning:

1. **The `@iseyaa/proto` Docker dependency gap is bigger than CONTEXT.md scopes it.** CONTEXT.md's folded todo only names `backend/apps/notifications-service/Dockerfile`. This research confirms the **monolith's own production `backend/Dockerfile`** (the one Railway's root `railway.toml` builds) has the *identical* gap — and this phase is the first time the monolith's own source (the new `NotificationsClientModule` facade) will `import { notifications } from '@iseyaa/proto'` for typed `ClientGrpc.getService<T>()` calls. Fixing only the scaffold's Dockerfile leaves the **live production monolith deploy broken** by this phase's own new code. Both Dockerfiles need the fix: declare `@iseyaa/proto` as a `backend` dependency, regenerate the lockfile, and correct the `npm ci` invocation (see Common Pitfalls).
2. **`ResilienceService.isTransientError()` cannot currently classify a single gRPC failure as transient.** It was written entirely against axios's error shape (`err.response.status`) and Node network error codes (`ECONNREFUSED` etc. as **strings**). `@grpc/grpc-js` client errors carry a **numeric** `.code` (the `Status` enum: `UNAVAILABLE=14`, `DEADLINE_EXCEEDED=4`, `RESOURCE_EXHAUSTED=8`, ...) that matches none of the existing branches. Without a fix, D-05/D-07's resilience wrapping would compile and run but the circuit breaker would **never open** and retries would **never fire** for real gRPC outages — a silent correctness gap, not a crash. This must be a task in the plan, not an afterthought.
3. **A naming collision exists between D-04's `NOTIFICATIONS_GRPC_URL` and an already-committed `.env.example` var `NOTIFICATIONS_SERVICE_URL`.** Both point at the same target (`notifications-service.railway.internal:5008` / `localhost:5008`); the existing var was scaffolded in Phase 10 (Wave 3 placeholder, `AUTH_SERVICE_URL`...`NOTIFICATIONS_SERVICE_URL`, one per service) and is unused by any code today. Flagged as an Open Question — planner/user should decide whether to consolidate on the existing `*_SERVICE_URL` convention or keep D-04's name and let the old placeholder go dead.

**Primary recommendation:** Build `NotificationsClientModule`/`NotificationsClientService` in `backend/src/modules/notifications-client/` (monolith source tree, NOT `backend/apps/`) using `ClientsModule.registerAsync` + `ConfigService` for the URL, `getService<notifications.NotificationsServiceClient>('NotificationsService')`, and `firstValueFrom()` to convert the Observable-returning gRPC calls into the Promise-returning shape the two call sites already expect. Wrap every call through `ResilienceService.execute('notificationsGrpc', ...)` after first patching `isTransientError()` to recognize gRPC's numeric status codes. Fix both Dockerfiles' `@iseyaa/proto` dependency gap as an early, blocking task — not an optional cleanup.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| gRPC client registration + facade | API / Backend (monolith, `backend/src/modules/notifications-client/`) | — | The facade is consumed by monolith callers (`NotificationsController`, `TourNotificationsService`); it must live in the monolith's own DI tree, not the extracted service's tree |
| Push-send business logic (FCM v1 call, token lookup) | API / Backend (extracted process, `notifications-service`) | Database / Storage (Prisma `User.metadata.fcmToken`) | Unchanged — `NotificationsService` itself is not touched, only its callers are rerouted |
| `.proto` contract (`SendPushRequest.data`) | Contract / Schema boundary (`packages/proto/`) | API / Backend (both processes consume the generated types) | Proto is the shared schema between two now-independent processes — must be additive-only per D-08 |
| Resilience policy (retry/breaker/timeout) around the new network hop | API / Backend (monolith's `ResilienceService`) | — | The monolith is now a *client* of a real network dependency; policy lives with the caller, matching the existing Paystack/Termii/FCM pattern |
| Deployment topology (Railway service, docker-compose block) | Infra / Deploy (Railway, docker-compose) | — | Two independent deployable units now exist; each needs its own build/deploy config, mirroring the pattern already established for the other 7 scaffolds' `railway.toml` files |
| Caller-graph audit artifact | Documentation / Process gate | — | Not runtime code — a committed markdown file that gates the cutover commit per D-11 |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| GRPC-03 | `notifications-service` runs as a genuinely separate deployable process, called via `ClientGrpc`, zero behavior change to REST responses | `ClientsModule.registerAsync` + `getService<T>()` pattern confirmed [CITED: NestJS official docs via Context7]; existing scaffold confirmed booting cleanly post-Phase-16 [VERIFIED: `backend/apps/notifications-service/src/app.module.ts`]; Docker gap (both Dockerfiles) confirmed as the actual blocker to "genuinely separate deployable" [VERIFIED: grep + Phase 10 verification report] |
| GRPC-04 | Documented caller-graph audit precedes cutover | 2 call sites confirmed exhaustively via grep: `NotificationsController` (REST), `TourNotificationsService` (cron/event) [VERIFIED: `grep -rn "NotificationsService" backend/src`]; zero existing `ClientGrpc` usage anywhere confirms this is a clean, first-of-its-kind cutover [VERIFIED: grep] |
| GRPC-05 | Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour modules stay in-process | No code changes touch any of these modules in this research's findings; prior-milestone research (`.planning/research/PITFALLS.md` Pitfall 1) already documents *why* — `SELECT FOR UPDATE` wallet transactions cannot safely span a gRPC boundary without an outbox pattern this phase doesn't build [CITED: existing project research, re-confirmed still applicable] |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Thin facade — `NotificationsClientService` with today's exact method signatures (`sendPush`, `registerToken`, `listForUser`) backed by `ClientGrpc` internally. Both call sites (`NotificationsController`, `TourNotificationsService`) swap their import with a minimal diff, rather than each injecting a raw `ClientGrpc` directly. This sets the copy-paste template for future extractions (GRPC-07, deferred).
- **D-02:** The gRPC client registration lives in a new `NotificationsClientModule` — a small dedicated module exporting the facade/client token, imported wherever the old `NotificationsModule` was imported (mirrors `CommonModule`'s shared-infra pattern).
- **D-03:** `listForUser()` stays a local no-op stub in the new facade — no proto RPC added, no network call. It has no persistence behind it today (`// TODO: persistence not yet wired`), so there's nothing to fetch from the extracted service.
- **D-04:** gRPC target URL is configured via a `NOTIFICATIONS_GRPC_URL` env var, following the existing per-service env var convention (`DATABASE_URL`, `REDIS_URL`). Document dev (`localhost:5008`) and Railway (private network hostname) examples in `.env.example`, same approach Phase 16 (POOL-01) used for `DATABASE_URL`.
- **D-05:** Calls from the new facade to `notifications-service` are wrapped in the existing `ResilienceModule`/cockatiel policy (retry+circuit-breaker+timeout+fallback) — matching Phase 11's pattern for Paystack/Termii/Anthropic/FCM. `notifications-service` is now a real external network dependency from the monolith's point of view.
- **D-06:** On failure, `NotificationsController`'s REST-facing paths (`registerToken`, `send`) propagate a clear error to the caller (e.g. 503) rather than silently pretending success — these are synchronous requests the client is waiting on.
- **D-07:** `TourNotificationsService`'s 3 cron jobs and 1 event handler get the *same* resilience wrapping as the REST paths (one `ResilienceService` policy applied uniformly, regardless of caller) — consistent with how `PaystackService`/`SendgridService` are wrapped today. Note: these callers already catch-and-log every error without rethrowing (by design, so a cron tick never crashes the scheduler) — the resilience wrapping governs the gRPC call's own retry/circuit-breaker behavior underneath that existing catch, it doesn't change the catch's non-rethrow contract.
- **D-08:** `packages/proto/notifications.proto`'s `SendPushRequest` gains a `map<string, string> data = 4;` field before cutover. Today's in-process `NotificationsService.sendPush(userId, title, body, data)` accepts a 4th `data` param that `TourNotificationsService` uses for push deep-link payloads (`{type, bookingId}`) on all 3 tour-reminder pushes — the existing (unused-in-production) gRPC controller silently drops this param since the proto never had it. Fixing it now is required for true zero-behavior-change (ROADMAP.md success criterion 3). Confirmed additive-only: no other consumer of `notifications.proto` exists yet (this is the first live extraction), so widening the message is safe.
- **D-09:** Straight one-shot cutover — no feature flag, no dual in-process/gRPC path. Matches the stated rationale for choosing `notifications-service` first (lowest blast radius, no wallet coupling, no financial data at risk). A Settlement-style (`*_engine_enabled`) dual-path flag was explicitly considered and rejected as unnecessary complexity for a non-financial, best-effort notification path.
- **D-10:** Rollback plan on production failure is a standard git revert of the cutover commit + Railway redeploy (restoring in-process `NotificationsService` injection) — no runtime toggle needed, consistent with D-09's straight-cutover choice.
- **D-11:** The GRPC-04 caller-graph audit is delivered as a committed markdown document in the phase directory (a grep-based table of every `NotificationsService` injection site — file, line, caller) produced *before* the cutover commit, not just inline notes in PLAN.md/VERIFICATION.md. This makes it a permanent, reviewable artifact.

### Folded Todos

- **Docker dependency fix:** `backend/package.json` does not declare `@iseyaa/proto` as a dependency, so `docker build` for `apps/*-service` images fails with `TS2307: Cannot find module '@iseyaa/proto'`. Directly blocks ROADMAP.md success criterion 2 ("its own Railway service"). Fix: declare `@iseyaa/proto` as a `backend` dependency and widen the Docker `npm ci` workspace scope. **Research finding: this also affects the monolith's own `backend/Dockerfile`, not just `notifications-service`'s — see Common Pitfalls.**
- **INT-01 — Wire ResilienceModule into gRPC service scaffolds:** user chose to fold the *full* scope (all 8 `backend/apps/*-service` scaffolds), not just `notifications-service` (which Phase 16 already fixed). Note for planner: this pulls in 7 scaffolds beyond this phase's stated notifications-only extraction — confirm with user during planning if the broader fix should be a separate plan/wave rather than blocking the notifications-service cutover itself.

### Claude's Discretion

- Exact 503/error response shape for D-06's REST-facing failure path. **Research finding: the codebase already has a strong, consistent convention — `throw new ServiceUnavailableException('<Vendor> is temporarily unavailable, please try again shortly')` — used identically by `PaystackService`, `S3Service`, `AiService`, `events.service.ts`, `marketplace.service.ts`. Match this exact pattern for consistency.**
- Exact cockatiel policy parameters (timeout duration, retry count, circuit-breaker thresholds) for D-05 — planner's call, likely mirroring Phase 11's existing per-vendor policy shape. **Research finding: `fcm` (the closest existing analog — also push-notification-related, best-effort) uses `{ timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 }` — a reasonable starting point given gRPC calls to a same-region Railway-internal service should be faster than the FCM HTTP round-trip it wraps.**
- Exact format/columns of the D-11 caller-graph audit markdown doc — mechanical, not a vision call.

### Deferred Ideas (OUT OF SCOPE)

- Feature-flag-gated dual in-process/gRPC path (D-09's rejected alternative).
- Adding a real `ListForUser` gRPC RPC (D-03's rejected alternative).
- Live extraction of Delivery + remaining modules beyond notifications-service (GRPC-07) and news/waitlist/reviews (GRPC-08).
- Any extraction of Wallet, Transport, Delivery, Events, Stays, Marketplace, Auth, or Tour Packages/Guides/Bookings (GRPC-05).
- Blue-green/canary deploys per extracted service (GRPC-06).
- **Fixing the pre-existing `wallet-grpc.controller.ts` TOCTOU race (no `SELECT FOR UPDATE`) or `marketplace-grpc.controller.ts` oversell race** — both documented in `10-VERIFICATION.md` as scaffold-quality issues, explicitly NOT live-wired by this phase (only `notifications-service` is). Do not touch these files this phase; they are dead code paths until their own future extraction phase.

</user_constraints>

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/microservices` | 11.1.28 (root `node_modules`, satisfies `backend/package.json`'s `^11.1.19`) [VERIFIED: `node_modules/@nestjs/microservices/package.json`] | `ClientsModule`, `ClientGrpc`, `@GrpcMethod`, `Transport.GRPC` | Already a declared dependency; this phase is simply the first to actually construct a `ClientsModule.registerAsync` client — no new package needed |
| `@grpc/grpc-js` | 1.14.3 [VERIFIED: `node_modules/@grpc/grpc-js/package.json`] | Underlying gRPC transport implementation NestJS's gRPC transporter uses | Already declared (`^1.14.3`); already used server-side by all 8 scaffolds' `main.ts` |
| `cockatiel` | 3.2.1 [VERIFIED: `node_modules/cockatiel/package.json`, matches `^3.2.1` pin] | Retry + circuit-breaker + timeout composition, reused via `ResilienceService.execute()` | Already the project's chosen resilience library (Phase 11); no new dependency, only a new `Vendor` key + a fix to `isTransientError()` |
| `rxjs` | 7.8.1 (declared) | `firstValueFrom()` to convert the gRPC client's `Observable`-returning proxy methods into the `Promise`-returning shape the facade needs | Already a dependency of `@nestjs/microservices` itself; `firstValueFrom` has been stable since rxjs 7.0 |
| `@iseyaa/proto` | 0.1.0 (workspace-local) | Generated TypeScript types (`notifications.SendPushRequest`, `notifications.NotificationsServiceClient`, etc.) | Already generated and checked in (`packages/proto/generated/notifications.ts`); needs regeneration after D-08's proto edit, and needs the dependency-declaration fix (see Common Pitfalls) before it resolves in a Docker build |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/config` | ^4.0.4 (declared) | `ConfigService` injection into `ClientsModule.registerAsync`'s `useFactory` for `NOTIFICATIONS_GRPC_URL` | Standard async-config pattern already used elsewhere in the codebase (`HttpModule.registerAsync`-style factories) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ClientsModule.registerAsync` (module-level registration) | `@Client()` property decorator (inline, per-class) | `@Client()` is simpler for a single call site but doesn't support `useFactory`/`ConfigService` injection as cleanly, and D-02 explicitly locks in a dedicated module — `registerAsync` is the only option consistent with that decision [CITED: NestJS microservices/grpc.md via Context7] |
| `firstValueFrom()` for Observable→Promise conversion | `lastValueFrom()` | Both exist in rxjs 7.8.1; `firstValueFrom` is correct here because unary gRPC calls emit exactly one value then complete — `lastValueFrom` is semantically for multi-emission streams and would produce identical behavior but is the wrong semantic signal for a unary RPC |
| Cockatiel resilience wrapping (locked, D-05) | gRPC's own built-in retry policy (`grpc.service_config` with `retryPolicy`) | Rejected implicitly by D-05 — gRPC's native retry config is transport-level and wouldn't share the circuit-breaker state/observability (OTel spans, Sentry breadcrumbs) already built into `ResilienceService`; would also create two independent, uncoordinated retry layers if both were active [CITED: grpc-node retry example via Context7] |

**Installation:** No new packages required — every library above is already an installed dependency of `backend/package.json`. This phase only requires:
```bash
# One-time root lockfile refresh after adding @iseyaa/proto to backend/package.json's dependencies
npm install
```

**Version verification:** [VERIFIED: `npm view`, checked 2026-07-18]
- `@nestjs/microservices`: registry latest is `11.1.28`; project's installed copy already matches (`^11.1.19` pin resolves to `11.1.28` today) — no bump needed.
- `cockatiel`: registry latest is `4.0.0`; project is pinned to `3.2.1` and already deeply embedded (9 vendor policies, `RESILIENCE_DEFAULTS`, `resilience.service.spec.ts`). **Do not bump to 4.x this phase** — out of scope, no functional need, and a major-version bump of the resilience layer this late in the milestone is an unnecessary risk for a phase whose stated goal is a proof-of-pattern, not a resilience-library upgrade.
- `@grpc/grpc-js`: registry latest is `1.14.3`, matching the installed/pinned version exactly — current.

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Web / Mobile clients       │        │  TourNotificationsService     │
│  (REST, unchanged shape)    │        │  (3 @Cron + 1 @OnEvent,        │
└──────────────┬──────────────┘        │   catch-and-log, no rethrow)  │
               │ GET/POST /api/v1/     └───────────────┬────────────────┘
               │ notifications                          │
               ▼                                        ▼
   ┌─────────────────────────┐            ┌─────────────────────────┐
   │ NotificationsController  │            │  (same facade injected)  │
   │ (REST — D-06: 503 on      │            │  (D-07: same resilience  │
   │  facade failure)          │            │   policy, catch already   │
   └──────────────┬────────────┘            │   swallows the 503-ish    │
                  │                          │   error post-wrapping)    │
                  └──────────────┬───────────┘
                                 ▼
                  ┌───────────────────────────────────┐
                  │   NotificationsClientService          │
                  │   (backend/src/modules/               │
                  │    notifications-client/) — D-01/D-02  │
                  │                                        │
                  │  sendPush()/registerToken() wrap:       │
                  │   ResilienceService.execute(             │
                  │     'notificationsGrpc',                 │
                  │     () => firstValueFrom(client.sendPush(…)))
                  │  listForUser() — D-03: local no-op stub  │
                  └───────────────────┬────────────────────┘
                                      │ ClientGrpc.getService<NotificationsServiceClient>()
                                      │ Transport.GRPC, url = NOTIFICATIONS_GRPC_URL
                                      ▼  (network hop — new failure domain)
                  ┌───────────────────────────────────┐
                  │   notifications-service (separate    │
                  │   Railway service / docker-compose    │
                  │   block) — apps/notifications-service │
                  │                                        │
                  │  NotificationsGrpcController            │
                  │  (@GrpcMethod SendPush/RegisterToken)   │
                  │        ▼                                │
                  │  NotificationsService (UNCHANGED)        │
                  │  - Prisma: User.metadata.fcmToken        │
                  │  - FCM v1 HTTP call via its OWN            │
                  │    ResilienceService.execute('fcm', …)    │
                  └───────────────────┬────────────────────┘
                                      ▼
                       ┌───────────────────────┐
                       │  Firebase Cloud         │
                       │  Messaging v1 API        │
                       └───────────────────────┘
```

A reader tracing the primary use case: a web/mobile client calls `POST /api/v1/notifications/send` (or the tour-reminder cron ticks) → the REST controller (or cron service) calls the SAME facade method it always did, just now backed by `NotificationsClientService` instead of the in-process `NotificationsService` → the facade wraps the call in the existing resilience policy → the gRPC call crosses a real network boundary to `notifications-service`, which runs the exact same business logic it always did (unchanged file) → the response shape returned to the REST caller is byte-for-byte identical to before extraction (GRPC-03 success criterion 3).

### Recommended Project Structure

```
backend/
├── src/
│   ├── modules/
│   │   ├── notifications/                  # UNCHANGED — server-side impl, still lives
│   │   │   ├── notifications.service.ts    # here (consumed by apps/notifications-service)
│   │   │   ├── notifications.controller.ts # DELETED or gutted — REST moves to notifications-client's controller (see below)
│   │   │   └── notifications.module.ts     # UNCHANGED — still exports NotificationsService for the extracted process
│   │   ├── notifications-client/           # NEW — D-01/D-02
│   │   │   ├── notifications-client.module.ts
│   │   │   ├── notifications-client.service.ts
│   │   │   ├── notifications.controller.ts # MOVED here (or stays in notifications/, importing from notifications-client) — REST endpoints now call the facade
│   │   │   └── __tests__/
│   │   │       └── notifications-client.service.spec.ts   # NEW — Wave 0 gap
│   │   └── tour-bookings/
│   │       ├── tour-notifications.service.ts       # MODIFIED — inject NotificationsClientService instead of NotificationsService
│   │       └── __tests__/
│   │           └── tour-notifications.service.spec.ts     # MODIFIED — mock swaps from NotificationsService to NotificationsClientService
│   └── resilience/
│       ├── resilience.types.ts             # MODIFIED — add 'notificationsGrpc' Vendor + RESILIENCE_DEFAULTS entry
│       └── resilience.service.ts           # MODIFIED — isTransientError() gains a gRPC status-code branch
├── package.json                            # MODIFIED — add "@iseyaa/proto" to dependencies
├── Dockerfile                              # MODIFIED — fix npm ci workspace scope (monolith image)
├── apps/notifications-service/
│   ├── src/notifications-grpc.controller.ts  # MODIFIED — pass through the new `data` field (D-08)
│   ├── Dockerfile                          # MODIFIED — same npm ci fix
│   └── railway.toml                        # UNCHANGED — already exists, points at the right Dockerfile
packages/proto/
└── notifications.proto                     # MODIFIED — add `map<string, string> data = 4;`
docker-compose.yml                           # MODIFIED — add notifications-service block (D-04's NOTIFICATIONS_GRPC_URL wired for local dev)
.env.example                                 # MODIFIED — add NOTIFICATIONS_GRPC_URL (or consolidate with existing NOTIFICATIONS_SERVICE_URL, see Open Questions)
```

**Note on file placement:** `backend/jest.config.js` sets `rootDir: 'src'` — any spec file placed under `backend/apps/**` is **not** picked up by `npm test` (confirmed: zero `.spec.ts` files exist anywhere under `backend/apps/` today). The new facade and its tests **must** live under `backend/src/**` to be part of the existing test suite; this is naturally where D-01/D-02 already place them, but it's worth calling out explicitly since a plan that (incorrectly) puts the facade in `backend/apps/notifications-service/src/` would silently produce an untested facade.

### Pattern 1: `ClientsModule.registerAsync` with `ConfigService`-driven URL (D-02, D-04)

**What:** Register the gRPC client dynamically so the target host:port comes from `ConfigService` (env var), not a hardcoded string.

**When to use:** `NotificationsClientModule`'s `imports` array.

**Example:**
```typescript
// backend/src/modules/notifications-client/notifications-client.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { NotificationsClientService } from './notifications-client.service';

export const NOTIFICATIONS_PACKAGE = 'NOTIFICATIONS_PACKAGE';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_PACKAGE,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'notifications',
            protoPath: join(__dirname, '../../../../packages/proto/notifications.proto'),
            url: config.get<string>('NOTIFICATIONS_GRPC_URL', 'localhost:5008'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [NotificationsClientService],
  exports: [NotificationsClientService],
})
export class NotificationsClientModule {}
```
Source: [CITED: NestJS `microservices/grpc.md` + `microservices/basics.md` registerAsync pattern, via Context7 `/nestjs/docs.nestjs.com`; `protoPath` join pattern verified against `backend/apps/notifications-service/src/main.ts`'s existing relative path]

### Pattern 2: Facade converting Observable→Promise, wrapped in resilience (D-01, D-05, D-06)

**What:** `NotificationsClientService` exposes the exact same method signatures `NotificationsService` had, internally calling the gRPC proxy and converting its `Observable` return to a `Promise`.

**When to use:** Both call sites (`NotificationsController`, `TourNotificationsService`) import this instead of the old service.

**Example:**
```typescript
// backend/src/modules/notifications-client/notifications-client.service.ts
import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { notifications } from '@iseyaa/proto';
import { ResilienceService } from '../../resilience/resilience.service';
import { NOTIFICATIONS_PACKAGE } from './notifications-client.module';

@Injectable()
export class NotificationsClientService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsClientService.name);
  private grpcService!: notifications.NotificationsServiceClient;

  constructor(
    @Inject(NOTIFICATIONS_PACKAGE) private readonly client: ClientGrpc,
    private readonly resilience: ResilienceService,
  ) {}

  onModuleInit() {
    this.grpcService = this.client.getService<notifications.NotificationsServiceClient>('NotificationsService');
  }

  // D-03: local no-op stub — no proto RPC, no network call.
  async listForUser(_userId: string): Promise<any[]> {
    return [];
  }

  async registerToken(userId: string, token: string): Promise<{ registered: boolean }> {
    try {
      const res = await this.resilience.execute('notificationsGrpc', () =>
        firstValueFrom(this.grpcService.registerToken({ userId, fcmToken: token })),
      );
      return { registered: res.success };
    } catch (err: any) {
      this.logger.error(`gRPC registerToken failed: ${err?.message ?? err}`);
      // D-06: REST callers get a clear 503, never a silent success.
      throw new ServiceUnavailableException('Notifications service is temporarily unavailable, please try again shortly');
    }
  }

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ sent: boolean; reason?: string }> {
    try {
      const res = await this.resilience.execute('notificationsGrpc', () =>
        firstValueFrom(
          this.grpcService.sendPush({ userId, title, body, data: data ?? {} }),
        ),
      );
      return { sent: res.success };
    } catch (err: any) {
      this.logger.error(`gRPC sendPush failed: ${err?.message ?? err}`);
      // D-06/D-07: same 503 for both REST and cron/event callers — TourNotificationsService's
      // existing try/catch (does NOT rethrow) absorbs this without crashing the scheduler.
      throw new ServiceUnavailableException('Notifications service is temporarily unavailable, please try again shortly');
    }
  }
}
```
Source: [VERIFIED: method signatures matched against `backend/src/modules/notifications/notifications.service.ts`; `ServiceUnavailableException` pattern matched against `backend/src/common/services/paystack.service.ts`; `getService<T>()`/`OnModuleInit` pattern CITED: NestJS `microservices/grpc.md` via Context7; `notifications.NotificationsServiceClient` interface VERIFIED against `packages/proto/generated/notifications.ts`]

**Important divergence from today's behavior to flag for the plan:** the in-process `NotificationsService.sendPush()`/`registerToken()` never throw — they return `{ sent: false, reason: ... }` on failure (e.g., no FCM token, FCM not configured). The facade above only throws on the **gRPC transport call itself failing** (network/circuit-breaker); a normal business-logic "no token" response from the server still returns `{ sent: false, reason: 'no_token' }` through the gRPC response unchanged — that response shape needs to survive through the proto (already does, `SendPushResponse.success: boolean` — the `reason` string is NOT currently in the proto's `SendPushResponse`, only `success: boolean`). **This is a proto response-shape gap distinct from D-08's request-shape gap**: `TourNotificationsService.pushTMinus24h()` (etc.) only reads `pushResult` for logging (`void pushResult`), so losing the `reason` string is not behavior-visible today — but `NotificationsController.send()`'s REST response currently returns the full `{ sent, reason }` object to its caller (`return this.notificationsService.sendPush(...)` — whatever the service returns is the HTTP response body). If `SendPushResponse` only has `success: boolean`, the REST `POST /notifications/send` response body's shape changes from `{ sent: true }` to `{ sent: true }` (fine when true) but from `{ sent: false, reason: 'no_token' }` to `{ sent: false }` (reason field silently dropped) — a real, if minor, "zero behavior change" violation for the failure-reason field. Decide during planning whether to also add a `reason` field to `SendPushResponse` in the same D-08 proto edit, or accept the caller-graph audit will note this as an explicitly-accepted minor gap.

### Pattern 3: gRPC-aware `isTransientError()` (blocking fix for D-05/D-07)

**What:** `ResilienceService.isTransientError()` (in `backend/src/resilience/resilience.service.ts`) must recognize `@grpc/grpc-js` `ServiceError` objects, which carry a **numeric** `.code` from the gRPC `Status` enum — distinct from both the axios `err.response.status` branch and the string-code (`ECONNREFUSED` etc.) branch already present.

**When to use:** Required before D-05/D-07's resilience wrapping actually protects anything — without this fix, the circuit breaker and retry logic silently never activate for gRPC failures (they fall through to the final `return false`).

**Example:**
```typescript
// backend/src/resilience/resilience.service.ts — isTransientError(), ADD a branch
import { status as GrpcStatus } from '@grpc/grpc-js';

function isTransientError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;

  if ((err as any)?.isTaskCancelledError === true) return true;

  // NEW: @grpc/grpc-js ServiceError — err.code is a NUMBER from the Status enum,
  // never confused with the string-code branch below (typeof check already guards this).
  const grpcCode = (err as any)?.code;
  if (typeof grpcCode === 'number') {
    return (
      grpcCode === GrpcStatus.UNAVAILABLE ||       // 14 — server unreachable/overloaded
      grpcCode === GrpcStatus.DEADLINE_EXCEEDED ||  // 4  — per-call deadline hit
      grpcCode === GrpcStatus.RESOURCE_EXHAUSTED     // 8  — server-side rate limit/backpressure
    );
  }

  const code = (err as any)?.code;
  if (
    typeof code === 'string' &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR', 'ERR_CANCELED'].includes(code)
  ) {
    return true;
  }

  if ((err as any)?.name === 'AbortError') return true;

  return false;
}
```
Source: [VERIFIED: `Status` enum values (`UNAVAILABLE=14`, `DEADLINE_EXCEEDED=4`, `RESOURCE_EXHAUSTED=8`) via Context7 `/grpc/grpc-node` `packages/grpc-js/src/constants.ts`; existing function structure read directly from `backend/src/resilience/resilience.service.ts`]

**Do NOT** add `INTERNAL`, `UNKNOWN`, or `INVALID_ARGUMENT` to the transient list — those indicate the server processed the request and hit a real bug/bad-input, not a transient outage; retrying them would waste attempts on a deterministic failure (same logic already applied to axios's 4xx exclusion).

### Pattern 4: `.proto` additive field + regeneration (D-08)

**What:** Add `map<string, string> data = 4;` to `SendPushRequest`, then regenerate.

**Example:**
```protobuf
// packages/proto/notifications.proto
message SendPushRequest {
  string user_id = 1;
  string title = 2;
  string body = 3;
  map<string, string> data = 4;   // NEW — D-08
}
```
```bash
bash packages/proto/generate.sh   # regenerates packages/proto/generated/notifications.ts
```
ts-proto's default codegen (`useMapType` not set, so it defaults to `false`) generates `map<string,string>` as a plain TypeScript index-signature object — **not** a JS `Map` — matching the shape `NotificationsService.sendPush()`'s existing `data?: Record<string, string>` parameter already uses today. No transformation code is needed at the boundary; the generated `SendPushRequest.data` field's type will be structurally compatible with `Record<string, string>`.

Source: [CITED: ts-proto README `useMapType` option, default `false` generates object-literal maps, via Context7 `/stephenh/ts-proto`; existing `generate.sh` invocation confirmed to NOT pass `useMapType=true` — VERIFIED: `packages/proto/generate.sh`]

### Pattern 5: Server-side controller passes the new field through (D-08, other half)

**What:** `notifications-grpc.controller.ts`'s existing `SendPush` handler currently drops the 4th argument — must be updated to pass it through once the proto/generated types include it.

**Example:**
```typescript
// backend/apps/notifications-service/src/notifications-grpc.controller.ts
@GrpcMethod('NotificationsService', 'SendPush')
async sendPush(data: notifications.SendPushRequest): Promise<notifications.SendPushResponse> {
  await this.notificationsService.sendPush(data.userId, data.title, data.body, data.data);
  return { success: true };
}
```
Source: [VERIFIED: current file at `backend/apps/notifications-service/src/notifications-grpc.controller.ts` confirmed missing the 4th arg today; `NotificationsService.sendPush()`'s signature already accepts an optional 4th `data` param — VERIFIED]

### Anti-Patterns to Avoid

- **Injecting `ClientGrpc` directly into `NotificationsController`/`TourNotificationsService`:** D-01 explicitly rejects this — always go through the facade so future extractions (GRPC-07) have a template to copy.
- **Skipping the `isTransientError()` gRPC fix and shipping D-05/D-07 anyway:** the resilience wrapping will compile, run, and appear to work in the happy path — the gap only shows up under a real `notifications-service` outage, exactly when it matters most. Treat this as a blocking task, not an optional hardening pass.
- **Building the facade under `backend/apps/notifications-service/`:** wrong process tree entirely — the facade is a monolith-side client, and (separately) any spec placed there would silently not run under `npm test` (see `jest.config.js`'s `rootDir: 'src'`).
- **Fixing only `backend/apps/notifications-service/Dockerfile`'s `@iseyaa/proto` gap:** the monolith's own `backend/Dockerfile` has the identical gap and will now actually be exercised (the new facade imports `@iseyaa/proto`) — fixing one without the other leaves production deploys broken.
- **Adding retry to gRPC's own `service_config` in addition to cockatiel's retry:** would create two independent, uncoordinated retry layers (the same anti-pattern already documented for Anthropic in `resilience.types.ts`'s comment about `retryCount: 0` to avoid compounding retries).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| gRPC client construction/connection management | Custom `@grpc/grpc-js` client wrapper | `ClientsModule.registerAsync` + `ClientGrpc.getService<T>()` | NestJS's transporter already manages channel lifecycle, load balancing config, and proto loading — hand-rolling would duplicate framework code for zero benefit |
| Retry/circuit-breaker for the new network call | A new bespoke retry loop for gRPC | Extend the existing `ResilienceService`/cockatiel policy with a new `Vendor` key | One policy engine, one place to observe (OTel spans, Sentry breadcrumbs) already wired — a second bespoke mechanism would fragment observability |
| Observable→Promise conversion | Manual `.subscribe()`/callback wrapping | `firstValueFrom()` (rxjs, already a transitive dependency) | Standard, well-tested, handles both success and error paths correctly for a single-emission Observable |
| Caller-graph audit tooling | A custom AST-walking script | `grep -rn "NotificationsService" backend/src` (already sufficient — confirmed only 3 files, 2 real injection sites) | The codebase is small enough that grep is exhaustive and verifiable; no need for a heavier static-analysis tool for a 2-call-site audit |

**Key insight:** Every piece of infrastructure this phase needs (gRPC client, resilience policy, proto codegen, Docker/Railway deployment pattern) already exists in this codebase in some form — the actual work is *wiring gaps* (DI, Docker dependency declaration, error-code classification), not missing tooling.

## Common Pitfalls

### Pitfall 1: The `@iseyaa/proto` Docker Gap Affects the Monolith's OWN Dockerfile, Not Just `notifications-service`'s

**What goes wrong:** Fixing only `backend/apps/notifications-service/Dockerfile` (as CONTEXT.md's folded todo literally names) leaves `backend/Dockerfile` — the monolith's production image, built by root `railway.toml` — broken the moment this phase's new `NotificationsClientModule` facade adds `import { notifications } from '@iseyaa/proto'` to monolith source code.

**Why it happens:** `backend/package.json` has never declared `@iseyaa/proto` as a dependency (confirmed: zero matches for `@iseyaa/proto` or `@iseyaa/shared` in its `dependencies`). Both `backend/Dockerfile` (line 20: `RUN npm ci --workspace=backend --include=workspace=shared`) and `backend/apps/notifications-service/Dockerfile` (line 9, identical pattern) scope `npm ci` to only the `backend` workspace, so npm never links the `packages/proto` workspace into `node_modules` inside the image — even though `COPY packages/ ./packages/` (monolith Dockerfile) or `COPY packages/proto/ ./packages/proto/` (service Dockerfile) already copies the *source* files. Today this only breaks the 8 scaffold `apps/*-service` builds because only their controllers import `@iseyaa/proto`; this phase is the first time monolith `src/` code does too.

**How to avoid:** Add `"@iseyaa/proto": "0.1.0"` (or a `file:`/workspace-range specifier matching the existing internal convention) to `backend/package.json`'s `dependencies`, run `npm install` once at the repo root to regenerate `package-lock.json` (required — `npm ci` needs an in-sync lockfile and will fail if only `package.json` is edited), commit the updated lockfile, and fix **both** Dockerfiles' `npm ci` invocation (see Pitfall 2 for the exact flag correction).

**Warning signs:** `docker build -f backend/Dockerfile .` (monolith) failing with `TS2307: Cannot find module '@iseyaa/proto'` at the `RUN cd backend && npm run build` step, right after this phase's facade code is added — this would be a production-blocking regression if caught late (e.g., first Railway auto-deploy after merge), not just a `notifications-service`-specific gap.

**Confidence:** HIGH — [VERIFIED: read `backend/Dockerfile` line-by-line, confirms identical `npm ci --workspace=backend --include=workspace=shared` pattern to the already-documented `notifications-service` gap; confirmed via `10-VERIFICATION.md`'s prior finding that this exact command fails at `TS2307` for `apps/*-service` builds]

### Pitfall 2: The Existing `--include=workspace=shared` Docker Flag Is Not a Valid npm CLI Flag

**What goes wrong:** Both Dockerfiles' `npm ci --workspace=backend --include=workspace=shared` line contains a flag value npm does not recognize — `npm ci --help` confirms `--include` only accepts `<prod|dev|optional|peer>`, not `workspace=<name>`. It appears to be silently tolerated (Phase 10's verification build got past this line and failed later at the `nest build` step), but it is not doing what its name implies, and `backend/src`/`backend/apps` code doesn't even import anything from `@iseyaa/shared` today (grep confirms zero usages) — so the flag is currently dead weight either way.

**Why it happens:** Likely a misremembered/hand-written flag combination from an earlier phase, never caught because the build failed later at the `@iseyaa/proto` step regardless.

**How to avoid:** Replace with the documented, repeatable `--workspace=<name>` flag: `npm ci --workspace=backend --workspace=packages/proto`. Drop `--include=workspace=shared` entirely (both because it's not a real flag and because nothing in `backend/` currently imports `@iseyaa/shared`) — if a future phase needs it, add `--workspace=shared` at that time, using the same correct syntax.

**Warning signs:** Any future workspace added to a Docker `npm ci` line using `--include=workspace=X` syntax will have the same silent-no-op problem — grep for this pattern across all 9 Dockerfiles (`backend/Dockerfile` + 8 `apps/*/Dockerfile`) if extending this fix.

**Confidence:** HIGH — [VERIFIED: `npm ci --help` output directly confirms `--include` only accepts `prod|dev|optional|peer`; `-w|--workspace <workspace-name> [-w|--workspace <workspace-name> ...]` confirmed as the correct repeatable flag; grep confirmed zero `@iseyaa/shared` imports in `backend/src`/`backend/apps`]

### Pitfall 3: `isTransientError()` Cannot Classify Any gRPC Failure as Transient (Silent Resilience Gap)

**What goes wrong:** D-05/D-07's resilience wrapping compiles and runs, appears correct in code review, and works fine in the happy path — but under a real `notifications-service` outage or slowdown, `ResilienceService`'s circuit breaker never opens and retries never fire, because `isTransientError()` returns `false` for every gRPC error shape it's ever given.

**Why it happens:** The function's three branches check `err.response.status` (axios shape — gRPC errors have no `.response`), `err.isTaskCancelledError` (cockatiel's own timeout marker — unrelated to gRPC), and `typeof err.code === 'string'` matching a fixed list of Node network error codes. `@grpc/grpc-js` `ServiceError` objects carry `.code` as a **number** (the `Status` enum), which fails the `typeof === 'string'` guard and falls through to the final `return false`.

**How to avoid:** Add the numeric-code branch shown in Pattern 3 above, checking specifically for `UNAVAILABLE` (14), `DEADLINE_EXCEEDED` (4), and `RESOURCE_EXHAUSTED` (8) — the gRPC-native equivalents of HTTP 503/408/429. This must land in the same task/commit that adds the `notificationsGrpc` vendor policy, or the policy is inert from day one.

**Warning signs:** A manual test — stop the local `notifications-service` process and call `sendPush()` through the facade a `failureThreshold` number of times — should show the circuit breaker opening (Sentry `circuit_open` message, per `resilience.service.ts`'s `onBreak()`). If the breaker never opens no matter how many consecutive failures occur, this fix is missing or incorrect.

**Confidence:** HIGH — [VERIFIED: read `isTransientError()` in full from `backend/src/resilience/resilience.service.ts`; `Status` enum values confirmed via Context7 `/grpc/grpc-node` constants.ts]

### Pitfall 4: `TourNotificationsService`'s Existing Test Mocks `NotificationsService` Directly — Must Be Updated, Not Just the Constructor

**What goes wrong:** `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` currently provides a mock via `{ provide: NotificationsService, useValue: mockNotifications }` (or equivalent). After D-01 changes `TourNotificationsService`'s constructor to inject `NotificationsClientService` instead, this spec's DI token no longer matches anything the service actually asks for — the test would either fail to compile/resolve, or (worse, if NestJS's testing module silently constructs the real provider) attempt to build a real gRPC client during a unit test run.

**Why it happens:** Constructor-injection changes in `TourNotificationsService` require the corresponding test double's `provide` token to change in lockstep — an easy one-line miss when the main code change is the focus.

**How to avoid:** Update `tour-notifications.service.spec.ts`'s test module providers to `{ provide: NotificationsClientService, useValue: mockNotifications }`. Confirm no `NotificationsService`-shaped mock (with `listForUser`/`registerToken`/`sendPush`) survives unreferenced in the test file after the swap.

**Warning signs:** Running `npx jest tour-notifications.service.spec.ts` after the facade swap and seeing DI resolution errors, or (more subtly) the test suite hanging/timing out because a real `ClientGrpc` tried to dial a nonexistent gRPC server during test execution.

**Confidence:** HIGH — [VERIFIED: read `tour-notifications.service.spec.ts`, confirms it currently mocks `NotificationsService`'s `sendPush` directly]

### Pitfall 5: `SendPushResponse`'s Missing `reason` Field Is a Second, Separate Proto Gap From D-08

**What goes wrong:** D-08 only widens the *request* (`SendPushRequest.data`). The *response* (`SendPushResponse`) only has `success: boolean` — the in-process `NotificationsService.sendPush()`'s richer `{ sent: false, reason: 'no_token' | 'not_configured' | 'auth_failed' | 'send_failed' }` shape cannot survive the gRPC round-trip as-is, meaning `POST /api/v1/notifications/send`'s REST response body loses the `reason` field on the failure path after cutover — a genuine (if minor) "zero behavior change" violation.

**Why it happens:** The original scaffold's proto only ever modeled the happy path (`success: boolean`); nobody has looked at the failure-reason shape until this phase's zero-regression requirement forces the comparison.

**How to avoid:** Decide during planning whether to widen `SendPushResponse` with an optional `string reason = 2;` field (mirroring D-08's additive-only widening of the request), or explicitly document this as an accepted, minor, non-financial behavior delta in the caller-graph audit artifact (D-11). Either is defensible given `notifications` is a best-effort, non-financial path — but it should be a deliberate decision, not an oversight discovered post-cutover.

**Warning signs:** A REST client (or a future test) asserting on `response.body.reason` for a failed push-send would silently start receiving `undefined` after cutover.

**Confidence:** HIGH — [VERIFIED: read `packages/proto/notifications.proto` and `notifications.service.ts`'s return shapes side-by-side]

### Pitfall 6: `resilience.service.spec.ts`'s "9 vendor policies" Comment Goes Stale

**What goes wrong:** Not a functional bug — `resilience.service.spec.ts`'s test iterates `Object.keys(RESILIENCE_DEFAULTS)` dynamically, so adding a 10th vendor (`notificationsGrpc`) doesn't break the test logic. But the test's descriptive comment/title ("builds all 9 vendor policies...") becomes inaccurate after this phase.

**How to avoid:** Update the comment/test description string when adding the new vendor entry — purely a documentation-accuracy nit, but worth a one-line fix in the same commit for a codebase this careful about comment accuracy elsewhere (per CLAUDE.md's comment conventions).

**Confidence:** HIGH — [VERIFIED: read `resilience.service.spec.ts` line 40's comment text]

### Pitfall 7: INT-01's Fold Touches `auth-service`, Which Doesn't Even Import `CommonModule` Today

**What goes wrong:** A mechanical "add `ResilienceModule` next to `CommonModule`" fix pattern (as used for `notifications-service` in Phase 16) doesn't directly generalize to `auth-service` — its `app.module.ts` never imports `CommonModule` at all (confirmed: only `ConfigModule`, `PrismaModule`, `RedisModule`, `AuthModule`). `AuthService` itself directly constructor-injects `ResilienceService` (confirmed via grep — likely from Phase 15's Termii/WhatsApp OTP resilience wrapping), so `auth-service`'s fix is "add `ResilienceModule` to imports" with no `CommonModule` co-requisite, while the other 6 (`admin`, `ai`, `events`, `marketplace`, `stays`, `wallet`-service) all need it alongside their existing `CommonModule` import.

**How to avoid:** When executing INT-01's folded scope, verify each of the 7 remaining scaffolds' actual DI failure mode individually (the todo file itself notes "7 fail through CommonModule's PaystackService; 1 — auth-service — fails independently through AuthModule's AuthService") rather than assuming one mechanical diff applies uniformly to all 7.

**Confidence:** HIGH — [VERIFIED: read all 7 remaining `app.module.ts` files directly; grepped `ResilienceService` usage across `backend/src/modules/`, confirms `auth.service.ts`, `ai.service.ts`, `delivery.service.ts` (delivery has no scaffold), and `notifications.service.ts` are the direct injectors]

## Code Examples

### Full `.proto` diff (D-08)

```protobuf
// packages/proto/notifications.proto
syntax = "proto3";
package notifications;

service NotificationsService {
  rpc SendPush (SendPushRequest) returns (SendPushResponse);
  rpc RegisterToken (RegisterTokenRequest) returns (RegisterTokenResponse);
}

message SendPushRequest {
  string user_id = 1;
  string title = 2;
  string body = 3;
  map<string, string> data = 4;   // NEW
}

message SendPushResponse {
  bool success = 1;
  // Consider adding: string reason = 2;  — see Common Pitfalls Pitfall 5
}
```

### Caller-graph audit artifact shape (D-11 — mechanical, Claude's Discretion)

```markdown
# Phase 17 — NotificationsService Caller-Graph Audit

| # | File | Line | Injection type | Disposition |
|---|------|------|-----------------|-------------|
| 1 | backend/src/modules/notifications/notifications.controller.ts | 11 | constructor injection | REWIRED → NotificationsClientService |
| 2 | backend/src/modules/tour-bookings/tour-notifications.service.ts | 54 | constructor injection | REWIRED → NotificationsClientService |
| 3 | backend/apps/notifications-service/src/notifications-grpc.controller.ts | 8 | constructor injection | UNCHANGED (this IS the extracted process's own server-side implementation, not a caller to migrate) |

**Confirmed via:** `grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" | grep -v ".spec.ts"` — zero other injection sites found.
**Confirmed zero pre-existing `ClientGrpc`/`ClientsModule` usage anywhere in the codebase** — this is the first cutover of its kind.
```

### docker-compose.yml new service block

```yaml
# docker-compose.yml — ADD alongside existing postgres/redis/backend/web
notifications-service:
  build:
    context: .
    dockerfile: backend/apps/notifications-service/Dockerfile
  container_name: iseyaa_notifications_service
  restart: unless-stopped
  env_file: .env
  environment:
    DATABASE_URL: postgresql://iseyaa:iseyaa_dev_password@postgres:5432/iseyaa_dev
    REDIS_URL: redis://redis:6379
  ports:
    - '5008:5008'
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy

# backend service — ADD so the monolith's facade can reach it inside the compose network
backend:
  environment:
    # ...existing DATABASE_URL/REDIS_URL...
    NOTIFICATIONS_GRPC_URL: notifications-service:5008   # compose DNS name, not localhost
  depends_on:
    # ...existing postgres/redis...
    notifications-service:
      condition: service_started
```
Source: [ASSUMED — no prior docker-compose gRPC service block exists in this repo to pattern-match against; structure follows the existing `postgres`/`redis`/`backend`/`web` blocks' conventions (env_file, restart policy, depends_on with healthcheck conditions) directly, adapted for the one service that has no HTTP healthcheck endpoint today]

## State of the Art

This phase is establishing new state of the art for this codebase, not following an existing one:

| Old Approach | Current Approach (this phase) | Impact |
|--------------|-------------------------------|--------|
| Zero `ClientGrpc`/`ClientsModule` usage anywhere; 8 gRPC scaffolds exist as unconsumed proto-contract-only stubs | First live `ClientGrpc` facade wiring, using `notifications-service` as the template | Sets the copy-paste pattern for GRPC-07 (Delivery + remaining modules, deferred to v2) |
| `ResilienceService.isTransientError()` classifies only HTTP/axios-shaped and Node-network-string-coded errors | Gains gRPC numeric-status-code classification | Any FUTURE extracted service wrapped in `ResilienceService` benefits from this fix automatically — it's a one-time, reusable addition to the shared classifier, not a notifications-specific hack |
| `backend/package.json` silently missing `@iseyaa/proto` as a declared dependency (latent since Phase 10) | Declared dependency, Docker builds actually produce runnable images for the first time | Directly unblocks GRPC-03's "genuinely separate deployable process" success criterion — without this fix, no Docker image (monolith OR notifications-service) can be built from this repo today |

**Deprecated/outdated:** None — no library version changes in this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Exact cockatiel policy parameters for the new `notificationsGrpc` vendor (timeout/retry/breaker thresholds) — recommended mirroring `fcm`'s existing `{5000ms, 1 retry, 8 failures, 20s half-open}` | Standard Stack, Claude's Discretion note | Low risk — explicitly framed as a starting point; `ResilienceService.readConfig()` already reads from `PlatformConfig` with per-key fallback, so these numbers can be tuned post-launch without a code change |
| A2 | docker-compose's new `notifications-service` block structure (ports, env, depends_on) — no existing gRPC service block in this repo to pattern-match | Code Examples | Low-medium risk — if Docker networking DNS resolution behaves differently than assumed (e.g., compose service name not resolving from the `backend` container), local dev parity would fail even though Railway's separate private-network hostname convention (already documented in `.env.example`) is unaffected |
| A3 | `SendPushResponse` widening (adding `reason`) is presented as optional/discretionary rather than mandatory — treating this as acceptable scope for the planner to decide, not a hard requirement | Common Pitfalls Pitfall 5 | If the user/planner decides zero-behavior-change must be byte-exact including the failure-reason field, this becomes a mandatory task rather than an accepted gap — low risk either way since `notifications` is non-financial, but should be an explicit decision |
| A4 | `NOTIFICATIONS_GRPC_URL` (D-04, locked) vs. the pre-existing, unused `NOTIFICATIONS_SERVICE_URL` in `.env.example` — assumed the planner will decide during planning rather than research overriding a locked decision | Open Questions | If left un-reconciled, `.env.example` ends up with two vars pointing at the same host:port, one live and one permanently dead — confusing for future operators, not functionally broken |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **`NOTIFICATIONS_GRPC_URL` (D-04, locked) vs. the already-committed `NOTIFICATIONS_SERVICE_URL`**
   - What we know: `.env.example` already has a full block of `<SERVICE>_SERVICE_URL` vars for all 8 gRPC scaffolds (`AUTH_SERVICE_URL`, `WALLET_SERVICE_URL`, ..., `NOTIFICATIONS_SERVICE_URL=notifications-service.railway.internal:5008`), added in Phase 10 as Wave-3 placeholders. None are consumed by any code today (grep confirms zero references in `backend/src`).
   - What's unclear: Whether D-04's new `NOTIFICATIONS_GRPC_URL` name was chosen deliberately (distinct from the placeholder convention) or simply because CONTEXT.md's author didn't cross-reference `.env.example` at discussion time.
   - Recommendation: Surface this to the user/planner explicitly — either (a) rename D-04's var to reuse the existing `NOTIFICATIONS_SERVICE_URL` (zero `.env.example` churn, matches the convention already set for the other 7 not-yet-live services), or (b) keep `NOTIFICATIONS_GRPC_URL` per D-04 and remove/comment-out the now-permanently-dead `NOTIFICATIONS_SERVICE_URL` placeholder to avoid two vars describing the same endpoint. This is a naming decision, not a technical blocker — either works.

2. **Does `SendPushResponse` need a `reason` field for true zero-behavior-change (Pitfall 5)?**
   - What we know: The in-process service returns a richer failure shape than the current proto's `SendPushResponse` can carry.
   - What's unclear: Whether the REST `POST /notifications/send` endpoint's `reason` field is actually consumed by any web/mobile client code (not investigated in this backend-only research pass — would require a `web/`/`mobile/` grep).
   - Recommendation: A quick `grep -rn "reason" web/src mobile/app` (or equivalent) during planning would settle this in under a minute; if unused by any client, document the gap as accepted in the D-11 audit and skip the proto change.

3. **Railway multi-service dashboard setup mechanics**
   - What we know: `backend/apps/notifications-service/railway.toml` already exists (build/deploy config, `dockerfilePath`, `watchPaths`), following the exact same shape as the other 7 scaffolds' `railway.toml` files. Root `railway.toml` builds the monolith.
   - What's unclear: Whether a Railway *service* (in the dashboard sense — a distinct deployable unit within the Railway project) has actually been created and linked to `backend/apps/notifications-service/railway.toml` yet, or whether the `.toml` file existing in the repo is purely a config-as-code artifact awaiting a human to create the corresponding Railway dashboard service and point it at this file.
   - Recommendation: This is a human action outside repo/tool access this session (no Railway CLI/dashboard access available) — the plan should include a `checkpoint:human-verify` task for "Railway service for notifications-service exists in the dashboard, linked to `backend/apps/notifications-service/railway.toml`, `NOTIFICATIONS_GRPC_URL` (or its resolved name per Open Question 1) is set as an env var on the monolith's Railway service pointing at the private network hostname."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker / docker-compose | Local dev parity (new service block) | Not directly verified this session (no shell probe run against Docker daemon) — `docker-compose.yml` and 9 Dockerfiles already exist and are actively used by this project | — | If Docker unavailable locally, `nest start notifications-service` + `nest start:dev` (monolith) can both run bare-metal against the same local Postgres/Redis, bypassing Docker entirely for dev-loop iteration |
| Railway CLI/dashboard access | GRPC-03 success criterion 2 ("its own Railway service") | Not available in this research session (no credentials/CLI configured in this environment) | — | None for the actual dashboard service creation — genuine human-action prerequisite (see Open Question 3) |
| `packages/proto/generate.sh` (grpc_tools_node_protoc + ts-proto) | D-08's proto regeneration | ✓ confirmed working as of Phase 10 (verification report: "Ran `bash packages/proto/generate.sh` from repo root — exits 0, produces 16 files") | ts-proto 2.11.8 (per generated file headers), protoc 3.19.1 | — |
| npm workspaces (root `npm install`) | Pitfall 1/2's Docker dependency fix | ✓ npm 10+ already required by `engines` in root `package.json` | — | — |

**Missing dependencies with no fallback:**
- Railway dashboard access to actually create/verify the second deployable service — must be a human-verification checkpoint task in the plan.

**Missing dependencies with fallback:**
- Docker/docker-compose for local topology testing — bare-metal `nest start`/`nest start:dev` against shared local Postgres/Redis is a viable fallback for the dev loop, though it doesn't exercise the actual Docker image the Railway deploy will use.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x (existing, `backend/jest.config.js`) |
| Config file | `backend/jest.config.js` (`rootDir: 'src'` — see Common Pitfalls re: file placement) |
| Quick run command | `cd backend && npx jest notifications-client.service.spec.ts tour-notifications.service.spec.ts resilience.service.spec.ts` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| GRPC-03 | `NotificationsClientService.sendPush`/`registerToken` correctly convert Observable→Promise, wrap in resilience, throw `ServiceUnavailableException` on failure | unit (mock `ClientGrpc`/`ResilienceService`) | `cd backend && npx jest notifications-client.service.spec.ts -x` | ❌ Wave 0 — new file |
| GRPC-03 | `isTransientError()` correctly classifies gRPC numeric status codes as transient | unit | `cd backend && npx jest resilience.service.spec.ts -x` | ⚠️ Wave 0 gap — existing file needs new test cases added for the gRPC branch |
| GRPC-03 | `TourNotificationsService`'s 3 crons + 1 event handler still work with the facade substituted, still don't rethrow on failure | unit | `cd backend && npx jest tour-notifications.service.spec.ts -x` | ⚠️ Wave 0 gap — existing file's mock `provide` token needs updating (Pitfall 4) |
| GRPC-03 | Web/mobile REST response shape for `/notifications/*` is unchanged pre/post cutover | integration (manual boot check: local monolith + local notifications-service via docker-compose or bare-metal, hit the 3 REST endpoints, diff response shapes against pre-cutover) | manual — no automated e2e harness exists for gRPC-backed REST endpoints today | manual-only — no prior precedent in this codebase for this style of before/after diff test |
| GRPC-04 | Caller-graph audit is accurate and complete | manual (grep-verified, committed markdown artifact) | `grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" \| grep -v ".spec.ts"` (already run in this research — 3 results, 2 real call sites) | N/A — documentation artifact, not a test |
| GRPC-05 | Zero `ClientGrpc`/`ClientProxyFactory` usage for Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour modules | manual (grep gate, can be scripted) | `grep -rln "ClientGrpc\|ClientsModule" backend/src/modules/{wallet,delivery,events,stays,marketplace,auth,tour-bookings,tour-packages,tour-guides}` — expect zero matches post-phase | ❌ Wave 0 — not currently run as an automated CI gate, could be added as a one-line assertion test if desired (optional polish) |

### Sampling Rate

- **Per task commit:** `cd backend && npx jest notifications-client.service.spec.ts` (or whichever spec the task touched) — fast, scoped
- **Per wave merge:** `cd backend && npm test` (full backend unit suite — currently 35 suites / 412+ tests per Phase 10's verification run)
- **Phase gate:** Full `npm test` green + the manual REST-response-shape diff (GRPC-03 criterion 3) + the caller-graph audit artifact committed (GRPC-04) + the GRPC-05 grep gate showing zero matches, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts` — new, covers GRPC-03's facade behavior (success, gRPC failure → 503, `listForUser` stub)
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — needs new test cases for the gRPC numeric-status-code branch of `isTransientError()` (Pitfall 3)
- [ ] `backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts` — needs its `NotificationsService` mock `provide` token swapped to `NotificationsClientService` (Pitfall 4)
- [ ] A new `notifications.controller.spec.ts` does not exist today (confirmed via glob) — consider adding one to directly assert the 503 propagation path (D-06), though not strictly required if `notifications-client.service.spec.ts` covers the throw behavior and the controller is a thin pass-through

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | This phase doesn't touch auth flows; the gRPC channel itself runs unauthenticated/plaintext (matching every other scaffold's `main.ts` today — no TLS/mTLS configured for any of the 8 gRPC services) |
| V3 Session Management | No | N/A |
| V4 Access Control | No | The REST-facing endpoints keep their existing `@UseGuards(JwtAuthGuard)` — unchanged by this phase |
| V5 Input Validation | No | No new user-facing input surface — the `data` map field is server-generated (tour booking metadata), not directly user-supplied |
| V6 Cryptography | Yes (gap, pre-existing) | The gRPC channel between monolith and `notifications-service` is plaintext (`grpc.credentials.createInsecure()`-equivalent, default for `Transport.GRPC` with no `credentials` option set) — same as all 8 existing scaffolds. Acceptable for a same-region Railway private-network hop per this project's existing pattern, but worth flagging: this is the FIRST live gRPC traffic in production, so it's the first time this plaintext-channel decision actually matters in practice rather than being theoretical |
| V7 Error Handling / Logging | Yes | `NotificationsClientService`'s catch blocks must log the gRPC error's `.code`/`.details` (safe) but never leak any request payload (FCM tokens, user IDs are low-sensitivity here but still shouldn't be logged verbatim per the existing `summarizeVendorError()` pattern in `resilience.service.ts`) |
| V14 Configuration | Yes | `NOTIFICATIONS_GRPC_URL` (or its resolved name, see Open Question 1) is a new deploy-time config value — must be documented in `.env.example`, never hardcoded (matches D-04's own framing) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Plaintext gRPC channel between monolith and `notifications-service` on Railway's private network | Information Disclosure (low severity — FCM tokens/user IDs, not financial data) | Accepted risk for this phase per D-09's own rationale ("no financial data at risk"); Railway's private networking (`*.railway.internal`) is not internet-routable, providing network-level isolation even without TLS. Revisit if a future money-touching extraction (GRPC-07) reuses this same plaintext pattern — that phase MUST NOT accept the same risk. |
| `notifications-service` becoming unavailable causing cascading failures in `TourNotificationsService`'s cron jobs | Denial of Service (self-inflicted) | Already mitigated by D-07's resilience wrapping (once Pitfall 3's fix lands) + the pre-existing catch-and-log-no-rethrow contract in every cron handler — a `notifications-service` outage degrades to "no push notifications sent this tick," not a crashed scheduler |

## Sources

### Primary (HIGH confidence)
- `backend/apps/notifications-service/src/{main.ts,app.module.ts,notifications-grpc.controller.ts}` — existing scaffold, confirmed booting cleanly post-Phase-16 [VERIFIED: read directly]
- `backend/src/modules/notifications/{notifications.service.ts,notifications.controller.ts,notifications.module.ts}` — in-process implementation and both REST/business-logic shapes [VERIFIED: read directly]
- `backend/src/modules/tour-bookings/{tour-notifications.service.ts,tour-bookings.module.ts,__tests__/tour-notifications.service.spec.ts}` — second call site, cron/event patterns, existing test mock shape [VERIFIED: read directly]
- `backend/src/resilience/{resilience.module.ts,resilience.service.ts,resilience.types.ts,__tests__/resilience.service.spec.ts}` — existing cockatiel pattern, `isTransientError()` gap [VERIFIED: read directly]
- `backend/src/common/services/paystack.service.ts` — `ServiceUnavailableException` convention model [VERIFIED: read directly]
- `packages/proto/{notifications.proto,generate.sh,package.json,generated/notifications.ts}` — current proto contract, codegen pipeline, generated type shapes [VERIFIED: read directly]
- `backend/package.json`, `backend/Dockerfile`, `backend/apps/notifications-service/Dockerfile`, `backend/apps/*/src/app.module.ts` (all 8), root `package.json`, `docker-compose.yml`, `railway.toml`, `.env.example` — Docker/workspace/deployment topology audit [VERIFIED: read directly]
- `.planning/phases/10-documentation-correction-grpc-build-fix/10-VERIFICATION.md` — prior confirmed Docker-build failure mode and recommended fix syntax [VERIFIED: read directly]
- `.planning/phases/16-connection-pooling-infrastructure/16-RESEARCH.md` — `ResilienceModule` DI-gap root cause and fix pattern for `notifications-service`, directly informs INT-01's generalization [VERIFIED: read directly]
- `.planning/todos/pending/2026-07-17-{add-compile-step-to-packages-proto,wire-resiliencemodule-into-grpc-service-scaffolds}.md` — folded todo detail [VERIFIED: read directly]
- `.planning/research/PITFALLS.md` — prior-milestone gRPC extraction-order rationale (non-money-first sequencing), directly corroborates GRPC-05's constraint [VERIFIED: read directly]
- `npm ci --help`, `npm view @nestjs/microservices version`, `npm view cockatiel version`, direct `node_modules/*/package.json` reads — version verification [VERIFIED: command output]
- [NestJS microservices/grpc.md](https://github.com/nestjs/docs.nestjs.com/blob/master/content/microservices/grpc.md) — `ClientsModule.register`/`registerAsync`, `ClientGrpc.getService<T>()`, `@Client()` decorator [CITED via Context7 `/nestjs/docs.nestjs.com`]
- [NestJS microservices/exception-filters.md](https://github.com/nestjs/docs.nestjs.com/blob/master/content/microservices/exception-filters.md) — `RpcException`, `BaseRpcExceptionFilter` (server-side error shape confirmation) [CITED via Context7]
- [grpc-node constants.ts](https://github.com/grpc/grpc-node/blob/master/packages/grpc-js/src/constants.ts) — `Status` enum numeric values [CITED via Context7 `/grpc/grpc-node`]
- [ts-proto README](https://github.com/stephenh/ts-proto/blob/main/README.markdown) — `useMapType` option, default object-literal map codegen [CITED via Context7 `/stephenh/ts-proto`]

### Secondary (MEDIUM confidence)
- gRPC status code semantics (`UNAVAILABLE`/`DEADLINE_EXCEEDED` as transient) cross-referenced against grpc.io's public status-codes guide via WebSearch, corroborating the Context7-sourced enum values [MEDIUM: WebSearch summary, corroborated by primary source above]

### Tertiary (LOW confidence)
- docker-compose new service block structure (Code Examples) — no existing gRPC service block in this repo to pattern-match; assembled from this repo's own existing `postgres`/`redis`/`backend` block conventions, not independently verified by running `docker-compose up` in this session

## Metadata

**Confidence breakdown:**
- Standard stack (NestJS ClientGrpc, cockatiel, rxjs, proto codegen): HIGH — every library already installed and version-verified; official docs confirmed via Context7
- Architecture (facade pattern, resilience wrapping, Docker/Railway topology): HIGH for everything directly read from this repo's own files (scaffold, resilience module, Dockerfiles, jest config); MEDIUM for the docker-compose new-service-block specifics (no prior pattern to copy) and Railway dashboard mechanics (no live access this session)
- Pitfalls: HIGH for all 7 — every one is grounded in a direct code read or a direct tool-verified command (`npm ci --help`, grep, Context7 enum lookup), not inferred

**Research date:** 2026-07-18
**Valid until:** 30 days for the codebase-specific findings (Docker gap, `isTransientError()` gap, test-mock update) unless fixed by this phase; NestJS/grpc-js/ts-proto documentation findings valid until the next major version change in any of those three (unlikely within 90 days given the project's current pinned versions)
