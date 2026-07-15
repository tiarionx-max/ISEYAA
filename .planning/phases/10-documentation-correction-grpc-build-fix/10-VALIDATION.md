---
phase: 10
slug: documentation-correction-grpc-build-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Full suite command** | 8-service build loop + Dockerfile error-masking grep + `packages/proto/generate.sh` content check (see Per-Task Verification Map — no single command covers all three requirement types) |
| **Estimated runtime** | ~90 seconds (8 sequential `nest build` calls dominate) |

---

## Sampling Rate

- **After every task commit:** Run the specific command relevant to that task's changed files (e.g., after fixing one service's `tsconfig.app.json`, run that service's `nest build` alone)
- **After every plan wave:** Run the full 8-service build loop + Dockerfile grep + `generate.sh` content check
- **Before `/gsd-verify-work`:** All four rows in the Requirements → Test Map below must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-TBD | TBD | TBD | GRPC-01 (criterion 2) | T-10-01 | Every one of the 8 services builds with zero TS errors | build/smoke | `cd backend && for s in auth-service wallet-service events-service stays-service marketplace-service admin-service ai-service notifications-service; do npx nest build $s || exit 1; done` | ❌ W0 — no existing script wraps this | ⬜ pending |
| 10-01-TBD | TBD | TBD | GRPC-01 (criterion 3) | T-10-01 | No Dockerfile masks a build failure | grep/smoke | `grep -rn "2>/dev/null\|dev/null" backend/apps/*/Dockerfile` — must return zero matches | ❌ W0 — trivial one-liner, can be inlined in plan verification | ⬜ pending |
| 10-02-TBD | TBD | TBD | GRPC-02 | — | `.proto` files exist for all 7 new modules; `generate.sh` produces real TS types for all 15 with zero codegen errors | build/smoke | `bash packages/proto/generate.sh` (after pipeline fix) then `grep -l "GrpcMethod\|Observable" packages/proto/generated/*.ts` matching all 15 expected files | ❌ W0 — script exists but is broken (invokes `ts-proto` plugin binary without a real `protoc` front end) | ⬜ pending |
| 10-03-TBD | TBD | TBD | DOC-01 | — | ROADMAP.md/PROJECT.md no longer claim "8 services extracted complete" | manual/grep | `grep -n "extracted\|deploys as a separate Railway service" .planning/ROADMAP.md .planning/PROJECT.md` — manually review each match against corrected language | ❌ W0 — inherently a human/LLM prose-accuracy review, not a boolean pass/fail | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders (TBD) — the planner assigns real plan/task IDs; this table's rows map 1:1 to the four requirement rows the researcher already verified.*

---

## Wave 0 Requirements

- [ ] `backend/package.json` script `build:services` (or equivalent) — wraps the 8-service build loop as one reusable command, referenced by both task-level verification and any future CI step
- [ ] A small verification script (bash or Node) that greps all 8 Dockerfiles for error-masking patterns and fails loudly if any match — can live as a one-off command in the plan rather than a permanent repo file, planner's discretion
- [ ] `grpc-tools` (or equivalent) added as a devDependency so `packages/proto/generate.sh` has a real `protoc` front end to feed `ts-proto`'s plugin binary

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| ROADMAP.md/PROJECT.md prose no longer overstates gRPC completion | DOC-01 | Prose-accuracy check, not a boolean pass/fail — a grep narrows the search surface but a human/LLM must judge whether the replacement wording is actually accurate | Run `grep -n "extracted\|deploys as a separate Railway service" .planning/ROADMAP.md .planning/PROJECT.md`, then read each match in context and confirm it states "proto contracts existed, but zero live `@GrpcMethod`/`ClientGrpc` wiring, single monolithic `NestFactory.create()`" rather than a completion claim |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
