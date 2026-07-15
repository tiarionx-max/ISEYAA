# Phase 10: Documentation Correction + gRPC Build Fix - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 20 (1 tsconfig + 8 Dockerfiles + 8 tsconfig.app.json + 1 package.json script target + 1 generate.sh + 7 new .proto files [batched as one pattern] + 2 doc files)
**Analogs found:** 20 / 20 (this is a uniform-repair phase — every broken file has an already-correct sibling in the same directory pattern to copy from; the 7 new `.proto` files have 8 existing `.proto` files as direct analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `backend/tsconfig.json` | config | build-config | itself (single file, widen `rootDir`) | exact — only one base tsconfig exists |
| `backend/apps/*/tsconfig.app.json` (8 files) | config | build-config | each other (byte-identical today) | exact — all 8 share one shape |
| `backend/apps/wallet-service/Dockerfile` | config | build/deploy | `backend/apps/events-service/Dockerfile` (already single-clause, no broken fallback) | exact |
| `backend/apps/events-service/Dockerfile` | config | build/deploy | itself — cleanest existing pattern (single `RUN`, no `&&` chain, no fallback) | exact — **use this file as the template for all 8** |
| `backend/apps/auth-service/Dockerfile` | config | build/deploy | `backend/apps/events-service/Dockerfile` (strip the dead `\|\| npx tsc -p apps/auth-service/tsconfig.json` fallback — that file doesn't exist) | role-match, needs extra cleanup |
| `backend/apps/admin-service/Dockerfile` | config | build/deploy | `backend/apps/events-service/Dockerfile` (keep the `npx prisma generate &&` prefix, drop the `2>/dev/null \|\| true` wrapper parens) | exact |
| `backend/apps/ai-service/Dockerfile`, `stays-service/Dockerfile`, `marketplace-service/Dockerfile`, `notifications-service/Dockerfile` | config | build/deploy | `backend/apps/admin-service/Dockerfile` (same `prisma generate &&` shape) | exact |
| `backend/package.json` (`build:services` script) | config | batch | existing `scripts` block, e.g. `"build": "prisma generate && nest build"` | role-match (same file, new script key) |
| `packages/proto/generate.sh` | utility | batch/transform | itself — rewrite the `protoc` invocation only; `mkdir -p` / echo scaffolding stays | exact (structure) |
| `packages/proto/package.json` | config | — | itself — add `grpc-tools` devDependency | exact |
| `packages/proto/transport.proto` | config (IDL contract) | request-response | `packages/proto/wallet.proto` (state-mutating action-verb RPCs) + `backend/src/modules/transport/transport.controller.ts` (source of truth for field/action names) | exact — same narrow-RPC-surface style |
| `packages/proto/delivery.proto` | config (IDL contract) | request-response | `packages/proto/wallet.proto` + `backend/src/modules/delivery/delivery.controller.ts` | exact — near-identical shape to transport (rider/order vs driver/trip) |
| `packages/proto/tour-packages.proto` | config (IDL contract) | request-response | `packages/proto/events.proto` (entity lookup + availability-style RPCs) + `backend/src/modules/tour-packages/tour-packages.controller.ts` | exact |
| `packages/proto/tour-guides.proto` | config (IDL contract) | request-response | `packages/proto/events.proto` + `backend/src/modules/tour-guides/tour-guides.controller.ts` | exact |
| `packages/proto/news.proto` | config (IDL contract) | request-response (read-only) | `packages/proto/events.proto` (simplified — single read RPC, mirrors `news.controller.ts`'s single `@Get()`) | role-match — thinnest of the 7 |
| `packages/proto/waitlist.proto` | config (IDL contract) | request-response | `packages/proto/wallet.proto` (single create + single read RPC pattern) | role-match — thinnest write surface |
| `packages/proto/reviews.proto` | config (IDL contract) | request-response | `packages/proto/events.proto` + `backend/src/modules/reviews/reviews.controller.ts` | exact |
| `.planning/ROADMAP.md` (Phase 2 section) | docs | — | `.planning/PROJECT.md` (already-corrected gRPC-claim language — lines 15-49) | exact — copy the corrected phrasing pattern from PROJECT.md into ROADMAP.md |

## Pattern Assignments

### `backend/tsconfig.json` (config, build-config)

**Analog:** itself — the fix is a one-line value change, verified working by research.

**Current (broken for the 8 apps/* builds)** (`backend/tsconfig.json` lines 1-27):
```json
{
  "compilerOptions": {
    ...
    "rootDir": "./src",
    "outDir": "./dist",
    ...
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Fix pattern (verified in research via `npx tsc -p apps/wallet-service/tsconfig.app.json --rootDir . --noEmit` → 0 errors):**
Widen `"rootDir": "./src"` to `"rootDir": "."` at the base `backend/tsconfig.json` level (each `apps/*/tsconfig.app.json` inherits it via `"extends": "../../tsconfig.json"`). Do NOT change `"include"`/`"exclude"` in the base file — those stay scoped to `src/**/*` for the monolith's own `npm run build`; each `tsconfig.app.json`'s own `"include": ["src/**/*"]` (relative to `apps/<service>/`) already governs what that service's build actually compiles once `rootDir` no longer rejects the cross-directory imports.

**Consequence to handle in the same change** (Pitfall 1 from research — not optional): widening `rootDir` shifts every service's compiled `main.js` to `dist/apps/<service>/src/main.js` instead of the currently-assumed `apps/<service>/dist/main.js`. Every Dockerfile `CMD` must be updated to match, verified per-service with an actual `nest build` + `find dist -name main.js`, not by assumption.

---

### `backend/apps/*/tsconfig.app.json` (8 files) (config, build-config)

**Analog:** each other — byte-identical today, confirmed via direct read of all 8:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "outDir": "../../dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```
No per-service edit is required here if the `rootDir` fix is applied at the base `backend/tsconfig.json` level (these files inherit via `extends`). If the planner instead chooses to fix `rootDir` per-service (alternative to the base-file fix above), apply the identical `"rootDir": ".."` (two levels up, i.e. `backend/`) override to all 8 files uniformly — they must never diverge from each other.

---

### `backend/apps/*/Dockerfile` (8 files) (config, build/deploy)

**Analog:** `backend/apps/events-service/Dockerfile` — the cleanest existing shape (single `RUN` line, no `&&`/`||` chain masking):
```dockerfile
# Source: backend/apps/events-service/Dockerfile (this repo, current — use as the template)
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl
RUN curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh && apk add infisical
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/
RUN npm ci --workspace=backend --include=workspace=shared
COPY backend/ ./backend/
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build events-service 2>/dev/null || true
EXPOSE 5003
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node ./backend/apps/events-service/dist/main.js"]
```

**Exact masking patterns to remove (grep-verified, all 8 files):**
```
backend/apps/wallet-service/Dockerfile:18:        RUN cd backend && npx nest build wallet-service 2>/dev/null || true
backend/apps/events-service/Dockerfile:12:        RUN cd backend && npx nest build events-service 2>/dev/null || true
backend/apps/auth-service/Dockerfile:18:           RUN cd backend && npx nest build auth-service 2>/dev/null || npx tsc -p apps/auth-service/tsconfig.json 2>/dev/null || true
backend/apps/admin-service/Dockerfile:8:           RUN cd backend && npx prisma generate && (npx nest build admin-service 2>/dev/null || true)
backend/apps/notifications-service/Dockerfile:8:   RUN cd backend && npx prisma generate && (npx nest build notifications-service 2>/dev/null || true)
backend/apps/ai-service/Dockerfile:8:              RUN cd backend && npx prisma generate && (npx nest build ai-service 2>/dev/null || true)
backend/apps/stays-service/Dockerfile:8:           RUN cd backend && npx prisma generate && (npx nest build stays-service 2>/dev/null || true)
backend/apps/marketplace-service/Dockerfile:8:     RUN cd backend && npx prisma generate && (npx nest build marketplace-service 2>/dev/null || true)
```

**Fix pattern (two-line-style, matching events-service's already-clean shape):**
```dockerfile
RUN cd backend && npx prisma generate
RUN cd backend && npx nest build <service-name>
```
For `auth-service`, remove the entire `|| npx tsc -p apps/auth-service/tsconfig.json 2>/dev/null || true` chain — `apps/auth-service/tsconfig.json` does not exist (only `tsconfig.app.json` does), so that fallback is dead code today.

**CMD path — must be re-verified against the actual post-`rootDir`-fix build output** (Pitfall 1). Current pattern (per service, `<service>` and `<port>` vary):
```dockerfile
# Source: backend/apps/wallet-service/Dockerfile:22
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node ./backend/apps/wallet-service/dist/main.js"]
```
```dockerfile
# Source: backend/apps/auth-service/Dockerfile:22 (note: uses --require, not a plain path arg — an existing inconsistency to preserve or normalize, planner's call)
CMD ["sh", "-c", "infisical run --projectId $INFISICAL_PROJECT_ID --env ${APP_ENV:-production} -- node --require ./backend/apps/auth-service/dist/main.js"]
```
Do not hand-guess the corrected path — the plan's verification task must run `nest build <service>` + `find dist -name main.js` per service (per research Pitfall 1) and set `CMD`/`outDir` to match whatever that produces.

**Per-service `EXPOSE` ports (unchanged, for reference):** wallet=5002, auth=5001, events=5003, admin=5006. Confirm remaining 4 (`ai`, `stays`, `marketplace`, `notifications`) from their own Dockerfiles before editing — do not assume sequential numbering.

---

### `backend/package.json` (`build:services` script) (config, batch)

**Analog:** existing `scripts` block in the same file — `backend/package.json`:
```json
"build": "prisma generate && nest build",
"start:prod": "node --require ./dist/instrumentation.js dist/main.js",
"test:e2e:tours": "jest --config test/jest-e2e.json --testPathPattern=\"wallet-invariant|kyc-encryption|e2e-tour-booking\""
```

**Pattern to add** (mirrors the multi-target loop style research recommends — a single reusable command wrapping the 8-service build loop):
```json
"build:services": "for s in auth-service wallet-service events-service stays-service marketplace-service admin-service ai-service notifications-service; do npx nest build $s || exit 1; done"
```
Note: this is a POSIX `for` loop — confirm the target shell (this repo's dev environment is Windows/Git Bash per env info; `sh`/bash-style scripts are used elsewhere, e.g. `seed-demo.js`/Dockerfile `RUN` lines already assume `sh`), so this is consistent with existing script conventions. If cross-platform (Windows `cmd.exe`) execution of `npm run build:services` outside Docker/CI is required, consider a small Node script instead — but no existing precedent for that pattern exists in this repo's `backend/package.json`, so the shell-loop form matches current conventions most closely.

---

### `packages/proto/generate.sh` (utility, batch/transform)

**Analog:** itself — only the `npx ts-proto ...` invocation block is broken; the `mkdir -p` / `ls` scaffolding around it is correct and should be kept.

**Current (broken)** (`packages/proto/generate.sh` lines 1-19):
```bash
#!/bin/bash
# Generate TypeScript types from all proto files using ts-proto
# Run from monorepo root: bash packages/proto/generate.sh

set -e

mkdir -p packages/proto/generated

# ts-proto generates NestJS-compatible gRPC service interfaces
npx ts-proto \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=esModuleInterop=true \
  ./packages/proto/*.proto

echo "Proto generation complete. Generated files:"
ls ./packages/proto/generated/
```

**Root cause:** `npx ts-proto` resolves to `protoc-gen-ts_proto` — a protoc *plugin* (expects a serialized `CodeGeneratorRequest` on stdin from a real `protoc`), not a standalone CLI that parses `.proto` files. No real `protoc` binary is installed anywhere in the toolchain.

**Fix pattern (per research recommendation — `grpc-tools`, zero system-install dependency):**
```bash
npx grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=esModuleInterop=true \
  --proto_path=./packages/proto \
  ./packages/proto/*.proto
```
(`grpc_tools_node_protoc` is the Node-installed protoc-equivalent binary shipped by the `grpc-tools` npm package — it accepts `.proto` file args directly and internally drives the plugin binary correctly, unlike `ts-proto`'s own bin.) Keep the `mkdir -p`/`echo`/`ls` lines around this block unchanged.

**Verification per Pitfall 4 (silent failure):** do not trust exit code alone — grep generated output for real ts-proto boilerplate:
```bash
grep -l "GrpcMethod\|Observable" packages/proto/generated/*.ts
```
must match all 15 expected files, not just "files exist."

---

### `packages/proto/package.json` (config)

**Analog:** itself — add one devDependency line.

**Current:**
```json
{
  "name": "@iseyaa/proto",
  "version": "0.1.0",
  "description": "gRPC proto types for ISEYAA microservices",
  "main": "generated/index.js",
  "types": "generated/index.d.ts",
  "scripts": {
    "generate": "bash generate.sh"
  }
}
```
**Fix:** add `"devDependencies": { "grpc-tools": "^1.x" }` (or, if the planner decides workspace-root placement is cleaner, add to `backend/package.json` devDependencies instead — either works since `generate.sh` is invoked via `npx` from the monorepo root per its own header comment `Run from monorepo root: bash packages/proto/generate.sh`; place it wherever `npm ci` for the invoking context will install it).

---

### `packages/proto/transport.proto`, `delivery.proto`, `tour-packages.proto`, `tour-guides.proto`, `news.proto`, `waitlist.proto`, `reviews.proto` (config/IDL contract, request-response)

**Analog:** `packages/proto/wallet.proto` (mutating action-verb RPC style) and `packages/proto/events.proto` (entity-lookup + availability-check RPC style) — both read in full:

```protobuf
// Source: packages/proto/wallet.proto (this repo — style template for state-mutating services)
syntax = "proto3";
package wallet;

service WalletService {
  rpc Credit (CreditRequest) returns (CreditResponse);
  rpc Debit (DebitRequest) returns (DebitResponse);
  rpc GetBalance (BalanceRequest) returns (BalanceResponse);
  rpc GetTransactions (GetTransactionsRequest) returns (GetTransactionsResponse);
}

message CreditRequest {
  string wallet_id = 1;
  double amount = 2;
  string reference = 3;
  string description = 4;
}

message CreditResponse {
  bool success = 1;
  double new_balance = 2;
}
```

```protobuf
// Source: packages/proto/events.proto (this repo — style template for read/availability services)
syntax = "proto3";
package events;

service EventsService {
  rpc GetEvent (GetEventRequest) returns (GetEventResponse);
  rpc CheckTicketAvailability (TicketAvailabilityRequest) returns (TicketAvailabilityResponse);
  rpc ReserveTicket (ReserveTicketRequest) returns (ReserveTicketResponse);
}

message GetEventRequest {
  string event_id = 1;
}

message GetEventResponse {
  string id = 1;
  string title = 2;
  string status = 3;
  int32 available_capacity = 4;
}
```

**Shared conventions across all 8 existing `.proto` files (apply to all 7 new files):**
- `syntax = "proto3";` + `package <module>;` header
- One `service <PascalCaseModule>Service { ... }` block per file
- snake_case field names in messages (ts-proto's `esModuleInterop=true`/`nestJs=true` options camelCase them automatically in generated TS — matches the existing hand-written stub interfaces' camelCase)
- Narrow RPC surface: 3-4 RPCs per file covering the module's critical-path read/write operations, NOT a full CRUD mirror of the REST controller (wallet.proto exposes 4 RPCs; events.proto exposes 3)
- `Request`/`Response` message suffix convention per RPC (e.g. `CreditRequest`/`CreditResponse`)
- IDs are always `string` (UUIDs), money fields are always `double`, timestamps are `string` (ISO), enums/status fields are `string` (not proto `enum` types — matches existing files' choice to keep status as free-text string, mirroring Prisma's own status enum serialization)

**Field-shape source of truth for each new file** — derive from the Prisma models and REST controller action verbs (not invented):

| New `.proto` file | Prisma model(s) | Controller action verbs to mirror (narrow subset — pick 3-4) | Source |
|---|---|---|---|
| `transport.proto` | `Driver`, `Trip` (`backend/prisma/schema.prisma:695-793`) | `go-online`/`go-offline`, `trips` (request), `trips/:id/accept`, `trips/:id/complete` | `backend/src/modules/transport/transport.controller.ts:34-198` |
| `delivery.proto` | `DeliveryRider`, `DeliveryOrder` (`schema.prisma:795-865`) | `orders` (request), `orders/:id/accept`, `orders/:id/verify-otp`, `orders/:id/complete` | `backend/src/modules/delivery/delivery.controller.ts:35-202` |
| `tour-packages.proto` | `TourPackage` (`schema.prisma:929-968`) | `GET :slug` (lookup), `POST` (create), `POST :id/submit` (approval-adjacent) | `backend/src/modules/tour-packages/tour-packages.controller.ts:47-166` |
| `tour-guides.proto` | `TourGuide` (`schema.prisma:903-927`) | `GET :id` (lookup), `POST me/kyc`, `POST :id/approve` | `backend/src/modules/tour-guides/tour-guides.controller.ts:34-128` |
| `news.proto` | `NewsItem` (`schema.prisma:882-899`) | `GET` (list, read-only — this module has exactly one REST endpoint) | `backend/src/modules/news/news.controller.ts:10` |
| `waitlist.proto` | `WaitlistEntry` (`schema.prisma:867-880`) | `POST` (create entry), `GET stats` | `backend/src/modules/waitlist/waitlist.controller.ts:15-22` |
| `reviews.proto` | `Review` (`schema.prisma:1017-1040`) | `POST` (create), `GET` (list by target), `POST flags/:id/resolve` (moderation) | `backend/src/modules/reviews/reviews.controller.ts:42-127` |

Each Prisma model's field list (read via `backend/prisma/schema.prisma` lines noted above) is the literal source for message field names/types — e.g. `Trip.pickupLat`/`pickupLng`/`dropoffLat`/`dropoffLng`/`fare`/`status` map directly to `double pickup_lat = N`, etc., matching wallet.proto's snake_case + scalar-type convention.

---

## Shared Patterns

### Dockerfile build-failure propagation
**Source:** `backend/apps/events-service/Dockerfile` (the one file already free of masking)
**Apply to:** All 8 `backend/apps/*/Dockerfile`
```dockerfile
RUN cd backend && npx nest build <service>
```
No `2>/dev/null`, no `|| true`, no fallback command chain. A failed compile must fail `docker build`.

### `rootDir` inheritance via `extends`
**Source:** `backend/apps/wallet-service/tsconfig.app.json` (`"extends": "../../tsconfig.json"`)
**Apply to:** Fixing `backend/tsconfig.json` once fixes all 8 `tsconfig.app.json` files simultaneously — no per-service edit needed for the `rootDir` value itself, only for verifying each service's resulting `outDir` path against its Dockerfile `CMD`.

### Proto narrow-RPC-surface convention
**Source:** `packages/proto/wallet.proto` (4 RPCs) and `packages/proto/events.proto` (3 RPCs) — both far narrower than their REST controllers' full endpoint list
**Apply to:** All 7 new `.proto` files — pick the 3-4 highest-value critical-path RPCs per module (matching the "read + primary write + status-transition" shape both templates share), not a full CRUD mirror of `backend/src/modules/<module>/<module>.controller.ts`.

### Documentation correction phrasing
**Source:** `.planning/PROJECT.md` lines 15-49 (already corrected in this repo — use verbatim as the phrasing template)
```
⚠ gRPC "microservice extraction" — `.proto` contracts exist for 8 services but were
never wired into `@GrpcMethod`/`ClientGrpc` handlers; runtime is a single monolith —
Phase 2 (claim corrected 2026-07, see v2.0 above)
```
**Apply to:** `.planning/ROADMAP.md` line 54 (Phase 2 success criterion 2 — currently states "Every microservice ... deploys as a separate Railway service") and line 71 (plan `02-07` `[x]` checkbox — currently "gRPC proto definitions (all 8 services) + ts-proto TypeScript generation" marked complete, overstating the "TypeScript generation" half specifically since `generate.sh` has never worked). Do not touch lines 72-77 (`02-08` through `02-11` `[x]` items) beyond what DOC-01 explicitly scopes — research confirms `.planning/PROJECT.md` is already substantially corrected; ROADMAP.md's Phase 2 entry is the concentrated remaining drift surface.

## No Analog Found

None. Every file in this phase's scope has a direct, already-correct sibling in the same directory/pattern family to copy from (uniform-repair phase, not new-feature phase).

## Metadata

**Analog search scope:** `backend/tsconfig.json`, `backend/apps/*/Dockerfile` (8), `backend/apps/*/tsconfig.app.json` (8), `backend/package.json`, `packages/proto/*.proto` (8 existing), `packages/proto/generate.sh`, `packages/proto/package.json`, `backend/prisma/schema.prisma` (models for the 7 target modules), `backend/src/modules/{transport,delivery,tour-packages,tour-guides,news,waitlist,reviews}/*.controller.ts`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`
**Files scanned:** 20 read directly + 6 controllers grepped for endpoint inventory + 1 Prisma schema section (lines 695-1040)
**Pattern extraction date:** 2026-07-15
