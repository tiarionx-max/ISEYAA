---
phase: 10-documentation-correction-grpc-build-fix
verified: 2026-07-15T18:00:00Z
status: passed
score: 4/4 must-haves verified (roadmap success criteria); 14/14 plan-level truths verified
overrides_applied: 0
---

# Phase 10: Documentation Correction + gRPC Build Fix Verification Report

**Phase Goal:** Correct the false "8 services extracted" documentation claim, make all 8 backend/apps/*-service gRPC scaffolds actually build (`nest build <service>` exit 0), and author `.proto` contracts for the 7 never-stubbed modules so `packages/proto/generate.sh` produces working TypeScript for all 15 target modules.
**Verified:** 2026-07-15T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP.md's Phase 2 entry and PROJECT.md no longer claim "8 services extracted complete" | ✓ VERIFIED | `grep -n "deploys as a separate Railway service\|8 services extracted complete" .planning/ROADMAP.md .planning/PROJECT.md` returns zero matches. ROADMAP.md line 54 now reads "Proto contracts...existed for 8 services, but zero live `@GrpcMethod`/`ClientGrpc` wiring was ever implemented..." Line 71 corrected re: broken ts-proto pipeline. PROJECT.md's 4 candidate lines already stated the corrected reality (confirmed by direct read). |
| 2 | `nest build <service>` completes with zero TypeScript errors for all 8 `backend/apps/*-service` scaffolds, run individually | ✓ VERIFIED | Ran `cd backend && npx nest build <service>` individually for auth, wallet, events, stays, marketplace, admin, ai, notifications-service — all 8 exit 0, zero TS errors. Also confirmed monolith `npx nest build` (no project arg) exits 0. |
| 3 | No Dockerfile under `backend/apps/*-service/` masks a build failure with `2>/dev/null \|\| true` or equivalent | ✓ VERIFIED | `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` returns zero matches. Manual read of all 8 Dockerfiles confirms bare `RUN cd backend && npx nest build <service>` with no fallback/masking clause. |
| 4 | `.proto` contracts exist for transport, delivery, tour-packages, tour-guides, news, waitlist, reviews; `generate.sh` produces TypeScript for all 15 modules with zero codegen errors | ✓ VERIFIED | All 7 files exist, each with exactly one `service <X>Service` block (`grep -c "^service "` = 1 for each). Ran `bash packages/proto/generate.sh` from repo root — exits 0, produces 16 files in `packages/proto/generated/` (15 modules + index.ts). `grep -l "GrpcMethod\|Observable" packages/proto/generated/*.ts \| wc -l` = 15. `index.ts` exports all 15 modules (namespaced barrel, see note below). |

**Score:** 4/4 roadmap success criteria verified

### Plan-Level Must-Haves (all 3 plans)

| Plan | Truth | Status | Evidence |
|------|-------|--------|----------|
| 10-01 (DOC-01) | ROADMAP.md success criterion 2 corrected, states "zero live" wiring | ✓ VERIFIED | Confirmed exact text present at line 54 |
| 10-01 (DOC-01) | ROADMAP.md 02-07-PLAN.md line states codegen pipeline was broken | ✓ VERIFIED | Line 71: "ts-proto TypeScript generation pipeline (generate.sh) was broken and never produced real generated output" |
| 10-01 (DOC-01) | PROJECT.md contains no overstated gRPC claims | ✓ VERIFIED | grep returns zero matches; direct read confirms accurate phrasing |
| 10-01 (DOC-01) | ROADMAP.md lines 72-77 (02-08 through 02-11) untouched | ✓ VERIFIED | Those lines unchanged, confirmed by reading current file content vs plan's quoted "do not touch" scope |
| 10-02 (GRPC-01) | All 8 services build individually, exit 0 | ✓ VERIFIED | Directly re-ran; all exit 0 |
| 10-02 (GRPC-01) | No Dockerfile masking pattern | ✓ VERIFIED | grep zero matches |
| 10-02 (GRPC-01) | CMD points at real compiled main.js path | ✓ VERIFIED | All 8 CMD lines reference `./backend/dist/apps/<service>/src/main.js`, matching actual `nest build` output path (`backend/dist/apps/wallet-service/src/main.js` confirmed to exist post-build) |
| 10-02 (GRPC-01) | No stray compiled .js/.js.map in wallet-service/src | ✓ VERIFIED | `ls backend/apps/wallet-service/src/` shows only .ts files; `git status --porcelain` clean; `.gitignore` contains both new rules |
| 10-02 (GRPC-01) | Monolith's own build untouched | ✓ VERIFIED | `git log -- backend/tsconfig.json` shows no Phase 10 commit touched it; monolith `nest build` (no arg) exits 0 |
| 10-03 (GRPC-02) | 7 new .proto files exist for the 7 unstubbed modules | ✓ VERIFIED | All present at exact paths with correct service blocks |
| 10-03 (GRPC-02) | generate.sh produces real ts-proto TS (Observable/Metadata), not hand-written stubs | ✓ VERIFIED | `grep -l "GrpcMethod\|Observable"` matches all 15 generated files |
| 10-03 (GRPC-02) | `bash packages/proto/generate.sh` exits 0 with zero codegen errors | ✓ VERIFIED | Re-ran directly, exit 0, no error output |
| 10-03 (GRPC-02) | generated/index.ts exports all 15 modules | ✓ VERIFIED | 15 `export * as <mod> from` lines present (namespaced form — see note) |

**Score:** 14/14 plan-level must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/ROADMAP.md` | Corrected Phase 2 SC2 + 02-07 line | ✓ VERIFIED | Contains "zero live" and corrected 02-07 text |
| `.planning/PROJECT.md` | Accurate gRPC state description | ✓ VERIFIED | Contains "never wired into" phrasing (confirmed accurate, unedited per plan's expected outcome) |
| `backend/apps/wallet-service/tsconfig.app.json` (and 7 siblings) | `"rootDir": "../.."` | ✓ VERIFIED | Present in all 8, extends `../../tsconfig.json` |
| `backend/package.json` | `build:services` script | ✓ VERIFIED | Present, POSIX for-loop over 8 services |
| `backend/apps/wallet-service/Dockerfile` (and 7 siblings) | Unmasked build + corrected CMD | ✓ VERIFIED | All 8 confirmed |
| `.gitignore` | Prevents recurrence of stray build artifacts | ✓ VERIFIED | Lines 12-13 present |
| `packages/proto/{transport,delivery,tour-packages,tour-guides,news,waitlist,reviews}.proto` | New gRPC contracts | ✓ VERIFIED | All 7 exist with correct service definitions |
| `packages/proto/generate.sh` | Working `grpc_tools_node_protoc` invocation | ✓ VERIFIED | Contains `grpc_tools_node_protoc`, runs successfully |
| `packages/proto/package.json` | `grpc-tools` devDependency | ✓ VERIFIED | Present (`^1.13.0`) plus runtime `dependencies` block (post-merge fix, commit 59aa331) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tsconfig.app.json` (all 8) | `../../tsconfig.json` | `extends` | ✓ WIRED | Confirmed literal `"extends": "../../tsconfig.json"` in all 8 files |
| Dockerfile CMD (all 8) | `backend/dist/apps/<service>/src/main.js` | node entrypoint | ✓ WIRED | Path matches actual `nest build` output (verified `dist/apps/wallet-service/src/main.js` exists after build) |
| `generate.sh` | `node_modules/.bin/protoc-gen-ts_proto` | `--plugin` flag | ✓ WIRED | Present with Windows-safe `.cmd` resolution added post-merge; POSIX path preserved for CI/Linux |
| `generated/index.ts` | `generated/transport.ts` (and 14 others) | namespaced re-export | ✓ WIRED (deviation, functionally equivalent) | Plan specified flat `export * from './transport'`; actual implementation uses `export * as transport from './transport'`. This is a documented post-merge integration fix (commit f79ed0e) resolving a real TS2308 symbol collision (`MessageFns`/`protobufPackage` helpers emitted per-file by ts-proto). All 8 gRPC controllers were updated to use namespaced imports (`import { wallet } from '@iseyaa/proto'`, confirmed in `wallet-grpc.controller.ts`) and all 8 services build successfully with this pattern. Functionally satisfies the plan's underlying intent ("export all 15 modules from index.ts") even though the literal export syntax changed. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOC-01 | 10-01-PLAN.md | ROADMAP.md/PROJECT.md accurately state real gRPC starting state | ✓ SATISFIED | Verified above |
| GRPC-01 | 10-02-PLAN.md | All 8 scaffolds build; no Dockerfile masking | ✓ SATISFIED | Verified above |
| GRPC-02 | 10-03-PLAN.md | Proto contracts for 7 unstubbed modules; generate.sh works for 15 modules | ✓ SATISFIED | Verified above |

No orphaned requirements: REQUIREMENTS.md maps exactly DOC-01, GRPC-01, GRPC-02 to "Phase 10" (lines 101, 104, 105, all marked "Complete"), and all three appear in the `requirements:` frontmatter of plans 10-01/10-02/10-03 respectively. GRPC-03/04/05 are explicitly scoped to Phase 17, not Phase 10.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/apps/wallet-service/src/wallet-grpc.controller.ts` | 23-53 | `Debit` handler reads balance via `findUnique` (no `SELECT FOR UPDATE`), no idempotency check on `reference` — TOCTOU double-spend race | ⚠️ Warning (pre-existing, documented in 10-REVIEW.md as CR-02, not fixed post-merge) | Violates CLAUDE.md wallet-security invariant. This is a scaffold — zero live `ClientGrpc`/`@GrpcMethod` wiring exists anywhere in the monolith per phase scope, so no live traffic can hit this path yet. Flagged for Phase 17 (first live extraction) to fix before wiring. |
| `backend/apps/marketplace-service/src/marketplace-grpc.controller.ts` | 25-36 | `ReserveStock` check-then-decrement oversell race (WR-01) | ⚠️ Warning (pre-existing, not fixed post-merge) | Same disposition as above — scaffold only, not live-wired. |
| Various (WR-02 through WR-06, IN-01 through IN-03) | — | Namespace shadowing, unvalidated date parsing, stub-verb/no-op mismatches, empty-string sentinels | ℹ️ Info/Warning (pre-existing, documented in 10-REVIEW.md, not fixed post-merge) | None block the phase's declared "build" goal; all are scaffold-quality issues appropriate to flag before Phase 17 wiring. |

No `TBD`/`FIXME`/`XXX` debt markers found in any gRPC controller file modified by this phase.

### Additional Finding — Docker image build (beyond declared phase scope)

The phase goal and all ROADMAP/plan success criteria define "build" specifically as `nest build <service>` exiting 0 (confirmed true for all 8 services) — Docker image build success was never a declared must-have of this phase. However, since the orchestrator's integration-fix note claimed commit f5a837d "split chained COPY instructions in 5 service Dockerfiles that would fail `docker build`" (referencing code-review finding CR-01), this verifier independently re-ran `docker build` for two representative services to test that claim's full implication.

**Result:** `docker build -f backend/apps/stays-service/Dockerfile .` and `docker build -f backend/apps/wallet-service/Dockerfile .` both still fail — but at a *different, later* step than CR-01 identified. The COPY-instruction fix (CR-01) is real and correct, but the Docker build now fails during `RUN cd backend && npx nest build <service>` with:

```
error TS2307: Cannot find module '@iseyaa/proto' or its corresponding type declarations.
```

Root cause: `backend/package.json` does not declare `@iseyaa/proto` as a dependency, and the Dockerfile's `RUN npm ci --workspace=backend --include=workspace=shared` only installs/links the `backend` and `shared` workspaces — never `packages/proto`. Locally, `nest build` succeeds only because the repo-root unscoped `npm install` already symlinked `node_modules/@iseyaa/proto` for every workspace; that symlink does not exist inside the Docker build's isolated, scoped `npm ci`. This reproduces identically on `wallet-service` and `events-service` (the two Dockerfiles CR-01 said were "already correct"), confirming it is a universal, pre-existing defect unrelated to the CR-01 COPY-syntax bug and not introduced or fixed by any Phase 10 commit.

**Disposition:** Not a phase-goal blocker — the roadmap's SC2/SC3 and all three plans' must-haves scope "build" strictly to `nest build`, which passes. This finding is surfaced because it directly bears on the accuracy of the "docker build fixed" implication in the orchestrator's post-merge summary and on real deployability, which the next dependent phase (17, first live extraction) will need.

**This looks like an out-of-declared-scope gap, not an unmet must-have.** Recommend a fast follow-up (add `"@iseyaa/proto": "*"` to `backend/package.json` dependencies and extend the Docker `npm ci` invocation to include the `packages/proto` workspace, e.g. `--workspace=backend --workspace=packages/proto --include=workspace=shared`) before Phase 17 attempts a live extraction that depends on these Dockerfiles actually producing runnable images.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 8 services build individually | `cd backend && npx nest build <service>` × 8 | Exit 0 for all 8, zero TS errors | ✓ PASS |
| Monolith build unaffected | `cd backend && npx nest build` (no project arg) | Exit 0 | ✓ PASS |
| `build:services` npm script works (sh) | `npm_config_script_shell=<git-bash> npm run build:services` | Exit 0 | ✓ PASS (native Windows `cmd.exe` invocation fails as documented/expected in 10-02-SUMMARY.md; script is correct POSIX sh, runs natively in Docker/CI) |
| Dockerfile masking removed | `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` | Zero matches | ✓ PASS |
| Full backend test suite | `cd backend && npx jest --silent` | 35/35 suites, 412/412 tests passed | ✓ PASS |
| `generate.sh` produces real codegen | `bash packages/proto/generate.sh` | Exit 0, 15 modules with `Observable`/`GrpcMethod` output | ✓ PASS |
| Docker image build (out-of-scope probe) | `docker build -f backend/apps/{stays,wallet}-service/Dockerfile .` | Fails at `nest build` step: `TS2307: Cannot find module '@iseyaa/proto'` | ✗ FAIL (see Additional Finding above; not a declared must-have) |

### Human Verification Required

None. All declared truths for this phase are objectively, programmatically verifiable and were independently re-executed (not taken from SUMMARY.md claims).

### Gaps Summary

No gaps against the phase's declared success criteria. All 4 ROADMAP.md success criteria and all 14 plan-level must-haves across the 3 plans (10-01/DOC-01, 10-02/GRPC-01, 10-03/GRPC-02) are independently verified true by direct command execution, not by trusting SUMMARY.md narration:

- Documentation (ROADMAP.md, PROJECT.md) accurately states the proto-only, zero-live-wiring, monolithic-runtime reality.
- All 8 `backend/apps/*-service` scaffolds build with `nest build <service>` exiting 0, zero TS errors, individually and via the `build:services` loop (under a POSIX shell).
- No Dockerfile masks a build failure.
- 7 new `.proto` contracts exist and are well-formed; `generate.sh` produces genuine ts-proto TypeScript (not hand-written stubs) for all 15 target modules with zero codegen errors.
- The full backend Jest suite (35 suites / 412 tests) passes, and the monolith's own build is unaffected.

One finding outside the phase's declared scope is documented above (Docker image build still fails for all 8 services due to a pre-existing missing workspace dependency declaration, unrelated to and not fixed by the CR-01 COPY-syntax correction) — recommended as a fast follow-up before Phase 17, not a blocker to this phase's stated goal.

---

_Verified: 2026-07-15T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
