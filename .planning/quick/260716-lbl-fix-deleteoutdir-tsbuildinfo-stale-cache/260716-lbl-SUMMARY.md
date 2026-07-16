---
status: complete
quick_id: 260716-lbl
slug: fix-deleteoutdir-tsbuildinfo-stale-cache
date: 2026-07-16
---

# Quick Task 260716-lbl: Fix deleteOutDir/tsbuildinfo stale-cache race and root .env not loading in backend dev bootstrap

## Context

Two blocking bugs were found during Phase 11 (resilience-wrapping) UAT Test 1 (Cold Start Smoke Test), diagnosed in a prior session and logged in `.planning/phases/11-resilience-wrapping/11-UAT.md`. This quick task fixes both.

## Commits

- `178d1fd`: fix(260716-lbl): colocate tsc incremental cache inside dist and untrack stray tsbuildinfo files
- `5bd04f4`: fix(260716-lbl): load repo-root .env via ConfigModule and gate env check on ConfigService

## Changes

- `backend/tsconfig.json` — added `"tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo"` so nest-cli's `deleteOutDir: true` wipes the incremental cache together with `dist/` on every restart, instead of leaving a stale cache outside `dist/` that made TypeScript skip re-emitting into an empty `dist/`.
- `backend/src/app.module.ts` — `ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '..', '.env') })`, so local `npm run dev:backend` (cwd = `backend/`) picks up the repo-root `.env`. Confirmed safe for Docker: `@nestjs/config`'s `loadEnvFile` no-ops via `fs.existsSync` when the path doesn't exist (root `.env` isn't copied into the Docker build context), and `assignVariablesToProcess` only fills keys not already in `process.env`, so Docker-injected vars always win.
- `backend/src/main.ts` — the fatal required-env-var check (`DATABASE_URL`/`JWT_SECRET`/`JWT_REFRESH_SECRET`) now runs after `app.get(ConfigService)` instead of before `NestFactory.create()`, reading via `config.get<string>(k)` instead of raw `process.env[k]`. This removes the ordering race against `ConfigModule`'s own `.env` load.
- `backend/tsconfig.tsbuildinfo`, `web/tsconfig.tsbuildinfo` — untracked via `git rm --cached` (already covered by the existing `*.tsbuildinfo` gitignore rule; backend's was already gone from the working tree, web's file left on disk).

Root `.env` was not modified, per the plan's explicit constraint (it separately contains live-looking secrets and a malformed `PAYSTACK_WEBHOOK_SECRET`, flagged elsewhere and out of scope here).

## Verification

Ran a genuine double cold-start of `npm run dev:backend` in an isolated, freshly-provisioned copy of the executor's worktree (clean `npm ci`, copied `.env`, regenerated Prisma client — none of these are committed, all gitignored):

- **Run 1** (dist/tsbuildinfo absent): booted cleanly — `Nest application successfully started`, all 7 resilience policies logged ready, zero manually exported env vars, zero FATAL missing-env message.
- **Run 2** (dist/tsbuildinfo now present from run 1, before nest-cli's own restart wipes `dist/` again): booted cleanly again — confirms the actual regression fix, since `dist/tsconfig.build.tsbuildinfo` was wiped by `deleteOutDir` alongside `dist/`, forcing TypeScript to recompile fully (0 errors) instead of skipping emit into an empty `dist/`.

Both bugs are confirmed fixed.

## Deviations

1. **[Rule 3 - Blocking]** Ran `npx prisma generate` in the freshly-installed verification worktree — pre-existing environment gap (`dev:backend` doesn't run `prisma generate` itself, only `build` does), unrelated to this plan's source changes, no commit needed.
2. Initially ran `gsd-sdk query state.advance-plan`, which incorrectly advanced Phase 11's own "Plan: X of N" position counter (this is a quick task, unrelated to Phase 11's plan sequence). Caught and reverted `.planning/STATE.md` via `git checkout -- .planning/STATE.md` inside the worktree before it was lost with the worktree's uncommitted state; the orchestrator's own STATE.md update (Step 7) does not touch "Current Position".

## Note on this SUMMARY.md

This file was reconstructed by the orchestrator from the executor's final report after the executor's worktree was removed with its uncommitted `SUMMARY.md` and a `state.add-decision` call still pending (the orchestrator's cleanup script did not run the SUMMARY-rescue step before removal). Content is faithful to the executor's verbatim return message; no new claims were added.
