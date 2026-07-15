# Phase 10: Documentation Correction + gRPC Build Fix - Research

**Researched:** 2026-07-15
**Domain:** NestJS CLI monorepo build configuration (TypeScript `rootDir`), Docker build-error masking, protobuf/ts-proto codegen, documentation accuracy
**Confidence:** HIGH (all core findings verified by actually running the failing commands in this repo, not inferred)

## Summary

This is a repair + docs phase, not new feature work. Direct investigation (running `nest build <service>` for all 8 scaffolds, grepping every Dockerfile, testing the proto codegen pipeline, and diffing documentation claims against the code) found a single, uniform root cause for the build failures, a second — previously undocumented — broken pipeline in `packages/proto/generate.sh`, and precise line-level locations for the documentation corrections required by DOC-01.

**Root cause of GRPC-01 (build failures):** Every one of the 8 `backend/apps/*-service` scaffolds fails `nest build` with the exact same error — TypeScript `TS6059: File ... is not under 'rootDir'` — because `backend/tsconfig.json` sets `"rootDir": "./src"` and every service's `app.module.ts`/`*-grpc.controller.ts` imports monolith code via `../../../src/...` (e.g. `PrismaModule`, `WalletModule`), which lives outside that `rootDir`. This is **not** a NestJS/gRPC-specific problem — it is a plain TypeScript project-config mismatch, and it is 100% consistent across all 8 services (verified: each fails with exactly 3 `TS6059` errors, no other error codes). Widening `rootDir` to the `backend/` root resolves all errors with **zero further TypeScript errors** (verified via `tsc --rootDir . --noEmit`), which means this is a low-risk, mechanical fix — but it does shift each service's compiled entry point (see Pitfall 1), which will break the existing Dockerfile `CMD` paths unless corrected in the same task.

**Root cause of GRPC-02 gap (proto coverage):** 8 of 15 target modules have `.proto` files already (`packages/proto/{admin,ai,auth,events,marketplace,notifications,stays,wallet}.proto`); the 7 named in the phase goal (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews) have none. Separately — and this was not previously documented anywhere in the repo — `packages/proto/generate.sh` **does not work as written**: it invokes `npx ts-proto --plugin=... --ts_proto_out=... *.proto`, but `ts-proto`'s only executable is `protoc-gen-ts_proto`, a **protoc plugin** (expects a serialized `CodeGeneratorRequest` on stdin from a real `protoc` invocation), not a standalone CLI that can be pointed at `.proto` files directly. `protoc` itself is not installed anywhere in this repo's toolchain (no system binary, no `grpc-tools` npm package). Running the script produces garbled binary output, not TypeScript. The `.ts` files currently checked into `packages/proto/generated/` are hand-written stub interfaces (confirmed by inspection — plain interfaces, no gRPC client/service boilerplate, no `Observable`/`Metadata` imports that real `ts-proto --ts_proto_opt=nestJs=true` output always produces), not products of that script ever running successfully. GRPC-02's stated success condition ("`generate.sh` produces TypeScript types ... with zero codegen errors") cannot be met without first fixing this pipeline — this is in scope for this phase since it directly blocks the stated success criterion.

**Primary recommendation:** Treat this phase as three independent, sequenced correction tracks: (1) fix the uniform `rootDir` config + matching Dockerfile paths across all 8 services, (2) fix `packages/proto/generate.sh`'s protoc invocation (install a protoc toolchain — `grpc-tools` npm package is the zero-system-dependency option — and correct the CLI invocation) before authoring the 7 new `.proto` files, (3) correct the specific lines in `ROADMAP.md` and `.planning/PROJECT.md` that overstate gRPC completion. None of these require writing new business logic or wiring any `ClientGrpc` consumer — that is explicitly out of scope (deferred to Phase 17 / GRPC-03).

## User Constraints

No `CONTEXT.md` exists yet for this phase (`/gsd-discuss-phase` has not been run). The phase description supplied by the orchestrator is treated as the binding scope statement; there are no additional locked decisions or discretion notes to reproduce here. If `/gsd-discuss-phase` is run before planning, its `CONTEXT.md` should be re-read and this section updated.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOC-01 | ROADMAP.md and PROJECT.md accurately state the real gRPC starting state (scaffolded-but-broken-and-unconsumed, not "8 services extracted complete") | Exact line numbers for both files identified below (Documentation Drift section); `.planning/PROJECT.md` is **already substantially corrected** (see finding below) — remaining work is concentrated in `ROADMAP.md`'s Phase 2 entry |
| GRPC-01 | All 8 existing `backend/apps/*-service` scaffolds build successfully; no `2>/dev/null \|\| true` error-masking remains in any Dockerfile | Root cause isolated to a single `TS6059` rootDir misconfiguration, verified fix path with zero residual TS errors; exact `2>/dev/null \|\| true` grep matches enumerated per file below |
| GRPC-02 | `.proto` contracts exist for the 7 currently-unstubbed modules; `generate.sh` produces TS types for all 15 modules with zero codegen errors | Existing 8 `.proto` files inspected as a template; `generate.sh`'s actual (broken) invocation diagnosed; concrete fix path (protoc toolchain) identified |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| gRPC service scaffolds (`backend/apps/*-service`) | API / Backend | — | Independently-buildable Nest microservice binaries; currently dead code (unreferenced by any deploy target or client) |
| Proto contracts (`packages/proto/*.proto`) | API / Backend | — | Interface Definition Language shared between (eventually) client and server processes; currently consumed only by the (broken) codegen script |
| Codegen pipeline (`generate.sh` + `ts-proto`) | Build tooling | API / Backend | Produces the TypeScript types both the monolith and future service binaries would import; currently non-functional |
| Docker build definitions (`backend/apps/*/Dockerfile`) | CI/CD / Deploy | — | Currently mask build failures; must fail loudly once GRPC-01 is met |
| Documentation (`ROADMAP.md`, `PROJECT.md`) | Docs (non-runtime) | — | No tier ownership in the running system; corrected as a standalone deliverable |
| Monolith (`backend/src`, `NestFactory.create()`) | API / Backend | — | The only thing actually running in production; unaffected by this phase (explicitly no new wiring) |

## Standard Stack

### Core (already installed, verified against `node_modules`)
| Library | Installed Version | Purpose | Source |
|---------|---------|---------|--------------|
| `@nestjs/cli` | 11.0.21 | `nest build <project>` command used by all Dockerfiles and success criteria | [VERIFIED: backend/node_modules/@nestjs/cli/package.json] |
| `@nestjs/core` / `@nestjs/microservices` | 11.1.20 | gRPC transport (`Transport.GRPC`), `@GrpcMethod` decorator | [VERIFIED: backend/node_modules/@nestjs/microservices/package.json] |
| `@grpc/grpc-js` | 1.14.3 | Pure-JS gRPC runtime used by every service's `main.ts` | [VERIFIED: node_modules/@grpc/grpc-js/package.json] |
| `@grpc/proto-loader` | 0.8.1 | Dynamic `.proto` loading at runtime (alternative to static codegen — not currently used, `ts-proto` static codegen is the chosen path per `generate.sh`) | [VERIFIED: node_modules/@grpc/proto-loader/package.json] |
| `ts-proto` | 2.11.8 | Static TypeScript codegen from `.proto` files | [VERIFIED: node_modules/ts-proto/package.json] |
| TypeScript | 5.3.3 (`^5.3.3` in backend/package.json) | Compiler producing the `TS6059` errors | [VERIFIED: backend/package.json] |

**Important discrepancy for the planner:** `CLAUDE.md`'s Constraints section states "Node.js 20 LTS + NestJS + TypeScript strict across all services — no runtime changes," but `backend/package.json` pins `@nestjs/core`/`@nestjs/common` at `^11.1.20`, not the `NestJS 10.3.x` figure also recorded elsewhere in this same `CLAUDE.md` file, and `backend/tsconfig.json` explicitly sets `"strictNullChecks": false, "noImplicitAny": false` (not strict mode). This is a second, separate documentation-drift surface from the one this phase targets (gRPC extraction claims). It is **out of scope for DOC-01** as scoped (DOC-01 names only the gRPC claim) but is flagged here as an `[ASSUMED-OUT-OF-SCOPE]` item the user may want addressed in a future doc-accuracy pass — do not silently "fix" it as part of this phase's tasks without an explicit decision.

### Missing / broken (needs a decision from the planner)
| Item | Status | Fix Options |
|------|--------|--------------|
| System `protoc` binary | **Not installed** — no system binary, no `grpc-tools` npm package present [VERIFIED: `which protoc` → not found; `node_modules/.bin` has no `grpc_tools_node_protoc`] | (a) Add `grpc-tools` as a devDependency (npm-installable, bundles a `protoc` binary + Node protoc plugin runner — zero system-install requirement, cross-platform); (b) require a system `protoc` install (e.g. via `apt-get install protobuf-compiler` in CI/Docker, `choco`/`brew` locally) — more fragile across contributor machines and CI images |
| `generate.sh` CLI invocation | **Broken** — treats `ts-proto`'s protoc-plugin binary as a standalone CLI [VERIFIED: ran the exact command from `generate.sh` against `wallet.proto`; produced raw binary garbage, not TS] | Rewrite to invoke a real `protoc` (or `grpc-tools`' bundled equivalent) with `--plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out=... --ts_proto_opt=nestJs=true,outputServices=grpc-js,esModuleInterop=true` |

**Version verification note:** All versions above were read directly from installed `package.json` files in this repo (not `npm view`/registry lookups), so they reflect the exact versions this project will build against — no additional registry check needed for this phase.

## Architecture Patterns

### System Architecture Diagram (current, broken state)

```
                    ┌─────────────────────────────────────────┐
                    │   backend/src (monolith)                 │
                    │   main.ts → NestFactory.create()          │
                    │   (single Express process, port 3001)     │
                    │   ALL business logic lives here            │
                    └───────────────┬────────────────────────┘
                                    │
                    (relative imports, e.g. `../../../src/modules/wallet/wallet.service`)
                                    │
                    ┌───────────────▼────────────────────────┐
                    │  backend/apps/*-service (8 scaffolds)     │
                    │  main.ts → NestFactory.createMicroservice │
                    │  (Transport.GRPC, own port per service)   │
                    │  @GrpcMethod controllers reach BACK into  │
                    │  the monolith's PrismaService/WalletService│
                    │  — never invoked by anything at runtime    │
                    └───────────────┬────────────────────────┘
                                    │  npx nest build <service>
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  TS6059: file outside rootDir './src'     │
                    │  → build FAILS                             │
                    └───────────────┬────────────────────────┘
                                    │  masked by
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │  Dockerfile: `nest build X 2>/dev/null    │
                    │  || true` → image builds "successfully"   │
                    │  with a partially-emitted/empty dist/      │
                    └─────────────────────────────────────────┘

  packages/proto/*.proto (8 exist, 7 missing)
                    │  packages/proto/generate.sh
                    │  (invokes ts-proto's protoc PLUGIN as if
                    │   it were a standalone CLI — no real protoc
                    │   present) → produces garbage, not TS
                    ▼
  packages/proto/generated/*.ts — HAND-WRITTEN stub interfaces,
  NOT the product of a working codegen run
```

A reader tracing "how does a gRPC call reach the monolith today" finds: it doesn't. Zero `ClientGrpc`/`ClientProxyFactory`/`ClientProxy` usages exist anywhere in `backend/`, `web/`, `mobile/`, or `shared/` [VERIFIED: repo-wide grep, zero matches]. The 8 service scaffolds are unreferenced dead code with a broken build.

### Recommended Project Structure (post-fix, still within phase scope)
No new directories are needed. The fix is entirely inside existing files:
```
backend/
├── tsconfig.json              # base — rootDir stays './src' for the monolith's own `nest build`
├── apps/
│   └── <service>/
│       ├── tsconfig.app.json  # ← FIX: widen rootDir (or restructure — see Pattern 1)
│       ├── Dockerfile         # ← FIX: remove `2>/dev/null || true`; fix output path in CMD
│       └── src/
├── ...
packages/proto/
├── generate.sh                 # ← FIX: correct protoc invocation
├── *.proto                     # ← ADD: 7 new files (transport, delivery, tour-packages,
│                                 #        tour-guides, news, waitlist, reviews)
└── generated/                  # ← regenerated output, not hand-written after fix
```

### Pattern 1: `rootDir` widening for cross-directory imports (the GRPC-01 fix)
**What:** TypeScript's `rootDir` must contain every file in the compiled program. When a per-app `tsconfig.app.json` imports files from outside its own directory tree (here: `backend/src/...` from `backend/apps/<service>/src/...`), `rootDir` must be raised to their nearest common ancestor.
**When to use:** Any Nest CLI "apps/" scaffold that reaches into a sibling directory outside its own `sourceRoot` via relative imports (this repo's pattern — importing the monolith's `PrismaModule`/`WalletModule`/etc. directly, rather than the Nest-idiomatic `libs/` shared-library pattern).
**Verified in this repo:**
```bash
# Confirmed 0 residual TypeScript errors once rootDir covers both trees:
cd backend
npx tsc -p apps/wallet-service/tsconfig.app.json --rootDir . --noEmit
# (no output — 0 errors, vs. 3x TS6059 with the current per-app tsconfig.app.json)
```
**Consequence to handle in the same task:** widening `rootDir` to `backend/` (two levels up from `apps/<service>/tsconfig.app.json`) changes the compiled output layout — `main.js` lands at `<outDir>/apps/<service>/src/main.js`, not `apps/<service>/dist/main.js` as every Dockerfile's `CMD` currently assumes (verified by an actual compile to a scratch directory: output tree was `dist/apps/wallet-service/src/main.js` + `dist/src/...` for the pulled-in monolith files). Every Dockerfile `CMD` line must be updated to match, or `outDir` must be set per-service to preserve the current path (achievable, e.g., by keeping outDir relative such that the `apps/<service>` prefix collapses — this needs to be verified per exact outDir value chosen; do not assume the current `CMD` paths keep working).

**Alternative (larger, out of scope for this phase):** restructure shared monolith code the official NestJS way — extract `PrismaModule`, `CommonModule`, `WalletModule`, etc. into a `backend/libs/` folder with `@app/*` path aliases (the pattern NestJS's own CLI monorepo tooling generates and expects — see Source below), so each app's `rootDir` never needs to cross into another app's tree. This is architecturally cleaner but is a genuine refactor (moving ~20 module directories), not a "build fix," and would materially increase this phase's blast radius. Recommend the `rootDir`-widening fix for this repair phase; leave the `libs/` refactor as a candidate for a future phase if the team pursues real extraction (Phase 17+).
```
// Source: https://github.com/nestjs/docs.nestjs.com/blob/master/content/cli/libraries.md (Context7: /nestjs/docs.nestjs.com)
"paths": {
    "@app/my-library": ["libs/my-library/src"],
    "@app/my-library/*": ["libs/my-library/src/*"]
}
```

### Pattern 2: Dockerfile build steps must fail the build, not swallow errors
**What:** A Docker `RUN` step whose only job is compiling code must propagate a non-zero exit code so `docker build` fails when the compile fails.
**When to use:** Every `backend/apps/*/Dockerfile`.
**Example (current, broken):**
```dockerfile
# Source: backend/apps/wallet-service/Dockerfile:18 (this repo)
RUN cd backend && npx nest build wallet-service 2>/dev/null || true
```
**Fix pattern:**
```dockerfile
RUN cd backend && npx nest build wallet-service
```
No `2>/dev/null`, no `|| true`, no fallback command. If a follow-on `CMD`/`ENTRYPOINT` step depends on `dist/` existing, an absent or stale `dist/` will now correctly fail the container at build time instead of at first invocation.

### Anti-Patterns to Avoid
- **`cmd1 || cmd2 || true` fallback chains:** `backend/apps/auth-service/Dockerfile:18` layers a *second* masked failure on top of the first — `npx nest build auth-service 2>/dev/null || npx tsc -p apps/auth-service/tsconfig.json 2>/dev/null || true`. The fallback path (`apps/auth-service/tsconfig.json`) **does not exist** (only `tsconfig.app.json` exists in that directory) [VERIFIED: `ls backend/apps/auth-service/*.json` → only `tsconfig.app.json`], so the fallback itself always fails too, silently, before hitting `|| true`. Any Dockerfile "fix" must remove the entire `||` chain, not just the first clause.
- **Treating a protoc *plugin* as a standalone CLI:** `ts-proto`'s package only exposes `protoc-gen-ts_proto` (a plugin binary that reads a serialized `CodeGeneratorRequest` from stdin — it cannot parse `.proto` files itself). `generate.sh` calls `npx ts-proto --plugin=...` directly against `.proto` file paths, which is not how protoc plugins work. A real `protoc` (or `grpc-tools`' bundled equivalent) must invoke the plugin, not the other way around.
- **Hand-writing "generated" files:** `packages/proto/generated/*.ts` are hand-maintained stub interfaces masquerading as codegen output (no `Observable`, no `Metadata`, no gRPC client/service surface that `ts-proto --ts_proto_opt=nestJs=true` always emits). Once the pipeline is fixed, these files should be fully regenerated and treated as build output, not hand-edited.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| protoc + plugin orchestration | A custom shell wrapper resolving stdin/stdout plugin IPC | `grpc-tools` npm package (bundles a real `protoc` binary + `grpc_tools_node_protoc` runner) | Avoids a system-level `protoc` install dependency across contributor machines, CI runners, and Docker build stages; `ts-proto`'s own docs assume a real `protoc` (or `grpc-tools`) invokes it |
| TS project-reference layout for a monorepo with shared code | Ad-hoc `rootDir` widening on every future service (works but doesn't scale past ~10 apps) | NestJS CLI's built-in `libs/` monorepo pattern (`nest g library`) | This is what the Nest CLI's own monorepo mode generates and expects; `rootDir` widening is the correct minimal-risk fix for *this* repair phase but is not how new services should be scaffolded going forward |

**Key insight:** Both failures in this phase (build + codegen) are configuration/tooling mismatches, not application logic bugs — the fix in each case is "stop fighting the tool's expected invocation," not new code.

## Runtime State Inventory

This phase touches build configuration and documentation, not stored/live runtime state (no database, no external service config, no OS registration, no secrets). The one item worth flagging under this lens:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — this phase touches no database, cache, or persisted records | None |
| Live service config | None — no Railway/Infisical/Grafana config is touched by this phase (each service's `railway.toml` exists but no service is actually deployed there yet; confirmed via PROJECT.md: "Backend confirmed live on Railway as a single monolith service") | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts (uncommitted, found in working tree) | `backend/apps/wallet-service/src/{app.module,main,wallet-grpc.controller}.js` + matching `.js.map` files are **currently present and untracked** in the working tree (pre-existing before this research session — flagged by the orchestrator's task brief). These are stray compiled output from a prior local `nest build`/`tsc` investigation, not source files, and are **not covered by any `.gitignore` rule** — `.gitignore` only excludes `dist/`, `backend/dist/`, and `*.tsbuildinfo`, not `apps/*/src/*.js` [VERIFIED: read `.gitignore` in full]. Additionally, `backend/apps/wallet-service/tsconfig.app.tsbuildinfo` exists on disk but *is* gitignored (`*.tsbuildinfo` pattern), so it won't be accidentally committed. | Recommend the plan include a task to (a) delete the stray `.js`/`.js.map` files from `apps/wallet-service/src/`, and (b) add a `.gitignore` rule such as `backend/apps/*/src/**/*.js` and `backend/apps/*/src/**/*.js.map` so this cannot recur once builds are actually working (every future successful `nest build` under the current per-service `outDir: "../../dist"` config — or its corrected replacement — should never write into `src/`, but a stray `tsc` invocation without `--outDir` easily will, as this research session's own investigation demonstrated). **Do not delete these without explicit user sign-off** — a prior attempt in this research session to clean up *newly self-generated* copies of these same artifacts (created only by this session's own `nest build` investigation runs, across 7 *other* services) was flagged by the environment's safety classifier as an unauthorized destructive action outside a read-only research task's scope, even though those particular copies were confirmed to not exist before this session. Treat any deletion of files under `backend/apps/*/src/` as needing to happen inside an actual execution/plan task, not silently during research. |

## Common Pitfalls

### Pitfall 1: Fixing `rootDir` without fixing the resulting output path
**What goes wrong:** A naive fix (just widen `rootDir` in each `tsconfig.app.json`) makes `nest build <service>` succeed, but the compiled `main.js` lands at a different path than the Dockerfile's `CMD` expects, so the container starts and immediately crashes with `Cannot find module`.
**Why it happens:** TypeScript preserves the directory structure under `rootDir` when emitting to `outDir`. Widening `rootDir` from `./src` to the `backend/` root adds an `apps/<service>/src/` prefix to the emitted path that wasn't there before.
**How to avoid:** Verify each Dockerfile's `CMD`/`ENTRYPOINT` path against the actual emitted `main.js` location after the `rootDir` change — do this via a real `nest build <service>` + `find dist -name main.js` check, not by assumption. This research verified the shifted path pattern (`dist/apps/<service>/src/main.js`) for `wallet-service`; the identical `rootDir`/`outDir` config is shared by all 8 services, so the same shift applies uniformly.
**Warning signs:** `docker build` succeeds but `docker run` fails with `Error: Cannot find module '/app/backend/apps/<service>/dist/main.js'`.

### Pitfall 2: Verifying `nest build` success without also verifying the Dockerfile no longer masks failure
**What goes wrong:** A plan might fix the `rootDir` issue (satisfying success criterion 2 — `nest build` passes locally) but leave the `2>/dev/null || true` in the Dockerfile untouched, technically leaving criterion 3 unmet and the class of bug that caused this phase to exist unresolved (a *future* regression would again build a broken image silently).
**How to avoid:** Treat "remove all `2>/dev/null || true` (and the auth-service's broken secondary fallback) from all 8 Dockerfiles" as a mandatory, separately-verified task — not an automatic side effect of fixing the TypeScript config. Grep-verify with `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` returning zero matches as the literal gate for GRPC-01's criterion 3.

### Pitfall 3: Assuming `.proto` file existence means the service has real gRPC wiring
**What goes wrong:** Documentation (before this phase) treated "`.proto` contracts exist under `packages/proto/`" as equivalent to "gRPC extraction complete." A future contributor could make the same mistake with the 7 newly-added `.proto` files for transport/delivery/etc., concluding those modules are "extracted" once the `.proto` file exists.
**How to avoid:** The corrected `ROADMAP.md`/`PROJECT.md` language must explicitly distinguish three states: (1) proto contract authored, (2) service scaffold builds, (3) live `ClientGrpc`/`@GrpcMethod` wiring consumed by a real caller. This phase only delivers (1) and (2) for all 15 modules — GRPC-05 explicitly keeps Wallet/Transport/Delivery/Events/Stays/Marketplace/Auth/Tour modules in-process this whole milestone, and even `notifications-service` (the one service slated for real (3)-level extraction) is deferred to Phase 17.
**Warning signs:** Any future doc or plan that says a module is "extracted" or "ready" based solely on a `.proto` file's existence.

### Pitfall 4: The `generate.sh` failure is silent, not loud
**What goes wrong:** Running `bash packages/proto/generate.sh` does not obviously crash — it produces stdout output (garbled binary bytes from the plugin misinterpreting its input) rather than a clean error message, and the script has `set -e` but the failing command may still exit 0 in some shells/environments depending on how the plugin binary handles malformed input, making this easy to miss in a quick smoke test.
**How to avoid:** Verify success by checking the *content* of freshly-generated files (do they contain `Observable`/`Metadata`/gRPC client-service boilerplate typical of `ts-proto --ts_proto_opt=nestJs=true` output?), not just the script's exit code or that files exist in `packages/proto/generated/`.
**Warning signs:** Generated `.ts` files that look like plain hand-written interfaces (matching the pattern already present in this repo) rather than ts-proto's characteristic verbose generated-code style.

## Code Examples

### Confirmed current build failure (baseline, before fix)
```
# Command: cd backend && npx nest build wallet-service
error TS6059: File 'C:/.../backend/apps/wallet-service/src/main.ts' is not under
'rootDir' 'C:/.../backend/src'. 'rootDir' is expected to contain all source files.
  The file is in the program because:
    Matched by include pattern 'src/**/*' in 'apps/wallet-service/tsconfig.app.json'
[... 2 more TS6059 errors for app.module.ts and wallet-grpc.controller.ts ...]
Found 3 error(s).
```
This exact 3-error pattern (main.ts, app.module.ts, and the service's own `*-grpc.controller.ts`, each flagged for importing/being imported across the `rootDir` boundary) was independently confirmed for all 8 services: auth-service, wallet-service, events-service, stays-service, marketplace-service, admin-service, ai-service, notifications-service.

### Confirmed fix validity (zero residual errors)
```bash
# Source: this repo, verified this session
cd backend
npx tsc -p apps/wallet-service/tsconfig.app.json --rootDir . --noEmit
# → exits 0, zero errors
```

### Exact Dockerfile masking patterns found (for the grep-verification gate)
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
Note `auth-service`'s Dockerfile additionally references `apps/auth-service/tsconfig.json`, which does not exist (only `tsconfig.app.json` does) — its fallback path is dead code, always falling through to `|| true`.

### Broken `generate.sh` invocation (root cause of the codegen gap)
```bash
# Source: packages/proto/generate.sh (this repo, current/broken)
npx ts-proto \
  --plugin=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=./packages/proto/generated \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=esModuleInterop=true \
  ./packages/proto/*.proto
```
`ts-proto`'s `package.json` declares only one bin: `"protoc-gen-ts_proto": "./protoc-gen-ts_proto"` [VERIFIED: `node_modules/ts-proto/package.json`]. There is no `ts-proto` executable — `npx ts-proto` resolves (in this environment) to running `protoc-gen-ts_proto` directly as if it were a CLI, but that binary is a protoc *plugin* expecting a binary `CodeGeneratorRequest` on stdin. Confirmed by direct invocation: piping a `.proto` file path as a CLI arg produces raw garbled bytes on stdout, not TypeScript.

### Existing `.proto` file as the template for the 7 new files
```protobuf
// Source: packages/proto/wallet.proto (this repo — use as the exact style template)
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
// ... (snake_case field names; ts-proto's esModuleInterop/nestJs options
//      camelCase these automatically in generated TS, matching the existing
//      hand-written stubs' camelCase field names)
```
The 7 new proto files (transport, delivery, tour-packages, tour-guides, news, waitlist, reviews) should follow this same minimal-surface pattern: a handful of RPCs matching read/critical-path operations of the existing monolith module, not a full CRUD mirror — this matches the existing 8 files' scope (e.g. `wallet.proto` exposes 4 RPCs, not every `WalletService` method). All 7 target modules already exist as monolith feature modules with real Prisma models [VERIFIED: `backend/src/modules/{transport,delivery,tour-packages,tour-guides,news,waitlist,reviews}` all exist; Prisma models `DeliveryRider`, `DeliveryOrder`, `DeliveryEvent`, `WaitlistEntry`, `NewsItem`, `TourGuide`, `TourPackage`, `Review` confirmed in `backend/prisma/schema.prisma`], so field shapes can be derived directly from those models/DTOs rather than invented.

## State of the Art

| Old Approach (claimed in ROADMAP.md) | Current Reality (verified) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Every microservice (auth, wallet, transport, events, stays, marketplace, delivery, ai, admin) deploys as a separate Railway service" (ROADMAP.md Phase 2, success criterion 2) | Single monolithic `NestFactory.create()` process; the 8 `*-service` scaffolds have never successfully built, let alone deployed | Never actually true — this is being corrected now, 2026-07 | Any planning/estimation built on "extraction is done" was working from false premises; corrected now before v2.0 work proceeds |
| "gRPC proto definitions (all 8 services) + ts-proto TypeScript generation" marked `[x]` complete (ROADMAP.md line 71, plan `02-07`) | `.proto` files exist for 8 services, but `ts-proto TypeScript generation` (the codegen script) has never worked; checked-in "generated" files are hand-written stubs | Same | The `[x]` on plan `02-07` specifically overstates the "TypeScript generation" half of that plan's own title |

**Deprecated/outdated:** None — no library APIs are deprecated here; this is a self-inflicted documentation/config drift, not an upstream ecosystem change.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended fix (widen `rootDir` to the `backend/` root, per-service) is the intended minimal-risk approach for this repair phase, rather than a full `libs/`-based restructure | Architecture Patterns, Pattern 1 | If the team actually wants the Nest-idiomatic `libs/` restructure now (bigger scope), the plan would need a different, larger task breakdown. Flagged as a discretion point for the planner/user, not a locked decision. |
| A2 | `grpc-tools` (npm-installable, bundles a `protoc` binary) is the recommended fix for the missing `protoc` dependency, over requiring a system-level `protoc` install | Standard Stack — Missing/broken table | If the team prefers a system-level `protoc` (e.g. because it's already pinned in a base CI image), the task would install differently (Dockerfile `apk add protobuf` vs. `npm install -D grpc-tools`). Low risk either way — both are standard, well-documented paths; this is a tooling-choice recommendation, not a verified requirement. |
| A3 | The 7 new `.proto` files should follow the existing 8 files' "narrow RPC surface" pattern (a handful of RPCs per service) rather than a full CRUD mirror of each module's REST API | Code Examples | If the user wants broader RPC coverage per new proto file, task scope/line-count estimates would need adjustment. This does not block GRPC-02's literal success criterion ("`.proto` contracts exist ... and generate.sh produces TypeScript types ... with zero codegen errors") which is satisfied regardless of RPC count. |

## Open Questions (RESOLVED)

*Both questions below were resolved during Phase 10 planning (2026-07-15). Resolution markers reference the deciding plan/task.*


1. **Should the Dockerfile `CMD` paths be fixed by adjusting `outDir`/output layout to preserve the current `apps/<service>/dist/main.js` path, or by updating `CMD` to match the new `apps/<service>/src/main.js`-nested output?**
   - What we know: Widening `rootDir` to `backend/` shifts the compiled output to include an `apps/<service>/src/` prefix under whatever `outDir` is configured (verified: `dist/apps/wallet-service/src/main.js` when `outDir` stays at the shared `backend/dist`).
   - What's unclear: Whether per-service `outDir` should instead be set to something like `../../dist/<service>` with a path-stripping trick, keeping `CMD` paths unchanged, versus simply updating all 8 `CMD` lines to the new nested path. Both are mechanically valid; this is an implementation-detail choice for the planner, not a research gap that blocks planning.
   - Recommendation: Plan a single task that (a) picks one approach, (b) applies it uniformly across all 8 services (they share an identical `tsconfig.app.json`/Dockerfile shape), (c) verifies with an actual `nest build` + `find dist -name main.js` check per service, not just a `tsc --noEmit` dry run.
   - **RESOLVED (Plan 10-02, Task 2):** Chose the *update-the-CMD* approach over the outDir-path-stripping trick. All 8 Dockerfile `CMD` lines are updated to the nested output path `./backend/dist/apps/<service>/src/main.js` (empirically confirmed: with per-service `"rootDir": "../.."`, `npx nest build wallet-service` emits `dist/apps/wallet-service/src/main.js`). `outDir` stays at the shared `../../dist` — no path-stripping trick introduced.

2. **Does the user want `grpc-tools` added as a dependency in this phase, or is a documented manual `protoc` install (with a note in a README) acceptable for now?**
   - What we know: Without a working `protoc` toolchain, GRPC-02's literal success criterion ("generate.sh produces TypeScript types for all 15 modules ... with zero codegen errors") cannot be met.
   - What's unclear: Whether the team wants this dependency baked into `package.json`/CI, or whether a manual, documented one-time setup step is acceptable given this repo has never run this script successfully anyway.
   - Recommendation: Default to adding `grpc-tools` as a devDependency (zero-friction, works identically on every contributor machine and in Docker/CI without an `apk add`/`apt-get` step) unless the user's `/gsd-discuss-phase` session surfaces a reason to prefer a system-level install.
   - **RESOLVED (Plan 10-03, Task 1):** Adopted the recommendation — `grpc-tools` is added as a devDependency to `packages/proto/package.json`, and `generate.sh` is rewritten to invoke its bundled `grpc_tools_node_protoc` as the real protoc front end (no system `protoc` install required). No `/gsd-discuss-phase` session was run for this phase, so the default recommendation stands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running `nest build`/`tsc` locally | ✓ | v24.15.0 | Project's stated runtime target is Node 20 LTS (per `CLAUDE.md` and `node:20-alpine` in every service Dockerfile) — this research's local builds ran on Node 24. The `TS6059` root cause is a pure TypeScript compiler config issue, independent of Node runtime version, so this discrepancy does not affect the diagnosis's validity, but the plan's actual verification/build tasks should run inside the `node:20-alpine` Docker context (or an explicit Node 20 local install) to match production, not rely solely on this research session's Node 24 results. |
| npm | Workspace installs, `npx nest build` | ✓ | 11.12.1 | — |
| Docker | Verifying the fixed Dockerfiles actually build images (beyond the plain `nest build` success criterion) | ✓ | 29.6.1 | — |
| System `protoc` binary | `packages/proto/generate.sh` (GRPC-02) | ✗ | — | Add `grpc-tools` npm package (bundles a `protoc`-equivalent) — see Standard Stack "Missing/broken" table; this is the recommended fallback, not a blocker |
| `grpc-tools` (npm) | Same as above | ✗ | — | Not yet added; this phase's plan should add it as a devDependency |

**Missing dependencies with no fallback:** None — the one missing dependency (`protoc`) has a clean, standard npm-installable fallback (`grpc-tools`).

**Missing dependencies with fallback:** `protoc` → `grpc-tools` npm package (recommended; see Standard Stack table and Open Question 2).

## Validation Architecture

`.planning/config.json` has `workflow.nyquist_validation: true`, so this section is included. This phase's success criteria are structural/build-level, not application-behavior-level — there is no new business logic to unit test. Validation here means deterministic shell-command checks, run per task and per wave, not `jest` unit tests.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None needed for this phase's own deliverables — jest 29.7.0 exists in `backend/` [VERIFIED: `backend/jest.config.js` present, `backend/package.json` devDependency] but this phase adds no application code that jest would exercise |
| Config file | `backend/jest.config.js` (unaffected by this phase) |
| Quick run command (per-service build check) | `cd backend && npx nest build <service>` — must exit 0 with zero `TS` errors |
| Full suite command (all 8 services + doc grep + proto codegen) | See Phase Requirements → Test Map below; no single command covers all three requirement types (build/grep/docs), so the "full suite" for this phase is the concatenation of the commands below |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRPC-01 (criterion 2) | Every one of the 8 services builds with zero TS errors | build/smoke | `cd backend && for s in auth-service wallet-service events-service stays-service marketplace-service admin-service ai-service notifications-service; do npx nest build $s || exit 1; done` | ❌ Wave 0 — no existing script wraps this; recommend adding one (e.g. `backend/package.json` script `build:services`) so it's a single reusable command rather than ad-hoc shell |
| GRPC-01 (criterion 3) | No Dockerfile masks a build failure | grep/smoke | `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` — must return **zero** matches | ❌ Wave 0 — no existing script; trivial one-liner, can be inlined in the plan's verification step rather than a persisted test file |
| GRPC-02 | `.proto` files exist for all 7 new modules; `generate.sh` produces real TS types for all 15 with zero codegen errors | build/smoke | `bash packages/proto/generate.sh` (after the pipeline fix) followed by a content check that generated files contain gRPC client/service boilerplate (e.g. `grep -l "GrpcMethod\|Observable" packages/proto/generated/*.ts` matching all 15 expected files) | ❌ Wave 0 — script exists but is broken; no content-verification check exists today |
| DOC-01 | ROADMAP.md/PROJECT.md no longer claim "8 services extracted complete" | manual/grep | `grep -n "extracted\|deploys as a separate Railway service" .planning/ROADMAP.md .planning/PROJECT.md` — manually review each match against the corrected language, since this is a prose-accuracy check, not a boolean pass/fail | ❌ Wave 0 — inherently a human/LLM review step, not automatable to a pass/fail command, but the grep narrows the search surface |

### Sampling Rate
- **Per task commit:** the specific command(s) from the table above relevant to that task's changed files (e.g. after fixing one service's `tsconfig.app.json`, run that service's `nest build` alone)
- **Per wave merge:** the full 8-service build loop + Dockerfile grep + `generate.sh` content check
- **Phase gate:** all four rows in the Requirements → Test Map green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/package.json` script `build:services` (or equivalent) — wraps the 8-service build loop as one reusable command, referenced by both the plan's task-level verification and any future CI step
- [ ] A small verification script (bash or Node) that greps all 8 Dockerfiles for error-masking patterns and fails loudly if any match — can live as a one-off command in the plan rather than a permanent repo file, planner's discretion
- [ ] No `conftest`/shared-fixture equivalent needed — this phase has no jest tests

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section is included per policy. Given this phase's actual scope (build config + documentation, zero new endpoints, zero new data flows, zero new auth surfaces), the ASVS review is necessarily thin — flagging that explicitly rather than padding.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no new auth surface — the 8 gRPC scaffolds remain unwired to any client after this phase (per explicit scope: build fix only, no live wiring) |
| V3 Session Management | No | Same reasoning |
| V4 Access Control | No | Same reasoning |
| V5 Input Validation | No | No new request/response surface is exposed to any external caller by this phase |
| V6 Cryptography | No | No secrets, keys, or crypto operations touched |
| V14 Configuration | Marginally yes | Removing `2>/dev/null || true` from Dockerfiles is itself a security-adjacent hygiene fix — masked build failures in production deploy pipelines are a known anti-pattern (a broken/stale image can silently ship to production, potentially running old/vulnerable code without anyone noticing the build never actually updated). No standard control library applies here; the fix is procedural (fail loudly), already covered under GRPC-01/Pitfall 2 above. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Silent build failure shipping a stale/broken image to a deploy target | Denial of Service / Repudiation (no record that the build actually failed) | Remove `2>/dev/null || true`; let `docker build` fail the pipeline (already the core deliverable of GRPC-01, criterion 3) |

No injection/auth/crypto threat patterns apply — this phase touches zero request-handling code paths.

## Sources

### Primary (HIGH confidence — directly verified in this repo/session)
- `nest build <service>` run for all 8 services in `backend/` — exact `TS6059` error captured for each
- `npx tsc -p apps/wallet-service/tsconfig.app.json --rootDir . --noEmit` — confirmed zero residual errors after the rootDir fix
- `npx tsc -p apps/wallet-service/tsconfig.app.json --rootDir . --outDir <scratch>` — confirmed the shifted output path (`dist/apps/wallet-service/src/main.js`)
- `grep -rn "2>/dev/null\|dev/null\|--force" backend/apps` — exact file:line matches for all 8 Dockerfiles
- Direct invocation of `generate.sh`'s exact `npx ts-proto ...` command against `wallet.proto` — confirmed broken (garbled binary output, not TypeScript)
- `node_modules/ts-proto/package.json`, `node_modules/@grpc/grpc-js/package.json`, `node_modules/@grpc/proto-loader/package.json`, `backend/node_modules/@nestjs/cli/package.json`, `backend/node_modules/@nestjs/microservices/package.json` — installed version confirmation
- Repo-wide grep for `ClientGrpc|ClientProxyFactory|ClientProxy` across `backend/`, `web/`, `mobile/`, `shared/` — zero matches confirmed
- `backend/prisma/schema.prisma` — confirmed `DeliveryRider`, `DeliveryOrder`, `DeliveryEvent`, `WaitlistEntry`, `NewsItem`, `TourGuide`, `TourPackage`, `Review` models exist for the 7 target proto modules
- `.gitignore` (full file read) — confirmed no rule covers `backend/apps/*/src/*.js`
- `.planning/ROADMAP.md` (Phase 2 section, lines 48-81) and `.planning/PROJECT.md` (full file) — exact line-level documentation drift located
- `.planning/config.json` — confirmed `nyquist_validation: true`, no `security_enforcement: false`

### Secondary (MEDIUM confidence)
- Context7 `/nestjs/docs.nestjs.com` — `content/cli/libraries.md` and `content/cli/workspaces.md` — confirms the official Nest CLI monorepo pattern uses a `libs/` folder with `@app/*` path aliases for shared code, which is the architecturally "correct" but larger alternative to the rootDir-widening fix recommended here

### Tertiary (LOW confidence)
- None — no unverified claims were included in the final findings; where confidence was genuinely uncertain (Open Questions 1 and 2), it is presented as an open question rather than an assertion

## Metadata

**Confidence breakdown:**
- Root cause (GRPC-01): HIGH — reproduced directly via `nest build` for all 8 services, fix verified via `tsc --noEmit`
- Proto codegen gap (GRPC-02): HIGH — reproduced directly via running the exact `generate.sh` command
- Documentation drift locations (DOC-01): HIGH — exact line numbers read directly from both files this session
- Recommended fix approach (rootDir widening vs. `libs/` restructure): MEDIUM — mechanically verified to work, but the choice between the two approaches is a scope/risk judgment call flagged as Assumption A1, not a verified "only correct answer"
- `grpc-tools` as the protoc fix: MEDIUM — standard, well-known approach for Node projects without system protoc, but not verified by actually installing and running it in this session (Assumption A2)

**Research date:** 2026-07-15
**Valid until:** This research is tied to exact file contents/line numbers in a fast-moving branch (`microservices-redesign`) — treat as valid for ~7 days or until any of the referenced files (`backend/tsconfig.json`, any `backend/apps/*/Dockerfile`, `packages/proto/generate.sh`, `.planning/ROADMAP.md` Phase 2 section, `.planning/PROJECT.md`) are modified by unrelated work, whichever comes first.
