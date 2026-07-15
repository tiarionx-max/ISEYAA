---
phase: 10
slug: documentation-correction-grpc-build-fix
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-15
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None needed for this phase's own deliverables — jest 29.7.0 exists in `backend/` but this phase adds no application code jest would exercise. Validation is deterministic shell-command checks (build/grep/codegen), not unit tests. |
| **Config file** | `backend/jest.config.js` (unaffected by this phase) |
| **Quick run command** | `cd backend && npx nest build <service>` — must exit 0 with zero TS errors |
| **Full suite command** | 8-service build loop (`npm run build:services`) + Dockerfile error-masking grep + `packages/proto/generate.sh` content check (see Per-Task Verification Map — no single command covers all three requirement types) |
| **Estimated runtime** | ~90 seconds (8 sequential `nest build` calls dominate) |

---

## Sampling Rate

- **After every task commit:** Run the specific command relevant to that task's changed files (e.g., after fixing one service's `tsconfig.app.json`, run that service's `nest build` alone)
- **After every plan wave:** Run the full 8-service build loop + Dockerfile grep + `generate.sh` content check
- **Before `/gsd-verify-work`:** All four rows in the Per-Task Verification Map below must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-02-T1 | 10-02 | 1 | GRPC-01 (criterion 2) | T-10-02b | Every one of the 8 services builds with zero TS errors | build/smoke | `cd backend && for s in auth-service wallet-service events-service stays-service marketplace-service admin-service ai-service notifications-service; do npx nest build $s \|\| exit 1; done` (wrapped as `npm run build:services`, added by 10-02-T1) | ✅ 10-02-T1 creates `build:services` script | ⬜ pending |
| 10-02-T2 | 10-02 | 1 | GRPC-01 (criterion 3) | T-10-02 | No Dockerfile masks a build failure | grep/smoke | `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` — must return zero matches | ✅ inline in 10-02-T2 verify | ⬜ pending |
| 10-03-T3 | 10-03 | 1 | GRPC-02 | T-10-03 | `.proto` files exist for all 7 new modules; `generate.sh` produces real TS types for all 15 with zero codegen errors | build/smoke | `bash packages/proto/generate.sh` then `grep -l "GrpcMethod\|Observable" packages/proto/generated/*.ts` matching all 15 expected files | ✅ 10-03-T1 fixes `generate.sh`; 10-03-T3 runs full codegen | ⬜ pending |
| 10-01-T1 | 10-01 | 1 | DOC-01 | T-10-01 | ROADMAP.md/PROJECT.md no longer claim "8 services extracted complete" | manual/grep | `grep -n "extracted\|deploys as a separate Railway service" .planning/ROADMAP.md .planning/PROJECT.md` — manually review each match against corrected language | ✅ inline in 10-01-T1/T2 verify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task ID convention: `<plan>-T<task-number>` (e.g. `10-02-T1` = Plan 10-02, Task 1). All four requirement rows map to real, authored tasks across the three Wave 1 plans.*

---

## Wave 0 Requirements

*All Wave 0 gaps below are folded into the Wave 1 plans directly (this repair phase has no separate scaffolding wave — each reusable-command gap is created by the same task that first depends on it):*

- [x] `backend/package.json` script `build:services` — created by **Plan 10-02, Task 1**; wraps the 8-service build loop as one reusable command
- [x] Dockerfile error-masking grep verification — inlined as the automated verify of **Plan 10-02, Task 2** (`grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` must return zero matches); no persistent repo file needed
- [x] `grpc-tools` devDependency — added by **Plan 10-03, Task 1** so `packages/proto/generate.sh` has a real `protoc` front end (`grpc_tools_node_protoc`) to feed `ts-proto`'s plugin binary

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| ROADMAP.md/PROJECT.md prose no longer overstates gRPC completion | DOC-01 | Prose-accuracy check, not a boolean pass/fail — a grep narrows the search surface but a human/LLM must judge whether the replacement wording is actually accurate | Run `grep -n "extracted\|deploys as a separate Railway service" .planning/ROADMAP.md .planning/PROJECT.md`, then read each match in context and confirm it states "proto contracts existed, but zero live `@GrpcMethod`/`ClientGrpc` wiring, single monolithic `NestFactory.create()`" rather than a completion claim |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-07-15 — real plan/task IDs mapped after 10-01/02/03 authored; nyquist compliance confirmed)
