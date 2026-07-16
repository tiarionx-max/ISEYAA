---
phase: quick
plan: 260716-lbl
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/tsconfig.json
  - backend/src/app.module.ts
  - backend/src/main.ts
  - .gitignore
autonomous: true
requirements: []
must_haves:
  truths:
    - "npm run dev:backend boots cleanly from a cold start (dist/ and tsbuildinfo deleted) with no manually-exported env vars"
    - "A second consecutive cold start of npm run dev:backend also boots cleanly (proves the deleteOutDir/tsbuildinfo race is fixed, not masked by first-run luck)"
    - "Docker Compose backend startup is unaffected (env_file: .env injection still takes precedence)"
  artifacts:
    - path: "backend/tsconfig.json"
      provides: "incremental cache colocated inside dist/ via tsBuildInfoFile"
      contains: "tsBuildInfoFile"
    - path: "backend/src/app.module.ts"
      provides: "ConfigModule explicitly loads repo-root .env"
      contains: "envFilePath"
    - path: "backend/src/main.ts"
      provides: "required-env-var check runs after ConfigModule has loaded .env"
      contains: "config.get"
  key_links:
    - from: "backend/src/main.ts"
      to: "backend/src/app.module.ts ConfigModule"
      via: "ConfigService.get() called after NestFactory.create()"
      pattern: "config\\.get\\(k\\)|config\\.get\\('DATABASE_URL'\\)"
---

<objective>
Fix two bugs found during Phase 11 UAT Test 1 cold-start smoke test:

1. **deleteOutDir + stale incremental TS cache** — `backend/nest-cli.json` wipes `backend/dist/` on every `nest start --watch` launch, but TypeScript's incremental cache (`tsconfig.json` `"incremental": true`, no explicit `tsBuildInfoFile`) is written outside `dist/` and survives the wipe. On the next compile, `tsc` sees "no source changed", skips emitting, and Nest crashes trying to `require dist/main`. 100% reproducible on second cold start.
2. **`npm run dev:backend` doesn't load the root `.env`** — `main.ts` checks required env vars at the very top of `bootstrap()`, before `NestFactory.create(AppModule)` has run `ConfigModule.forRoot()`. `ConfigModule` also has no explicit `envFilePath`, so it looks for `.env` relative to `process.cwd()` (which is `backend/` under the npm workspace, and `backend/.env` does not exist — the real file is at the repo root).

Purpose: Make local (non-Docker) backend dev boot reliably on repeated cold starts without manual env exports, without breaking the existing Docker Compose path (which already injects env vars via `env_file: .env`).

Output: `backend/tsconfig.json` gets an explicit `tsBuildInfoFile` inside `dist/`; `backend/src/app.module.ts` gets an explicit `envFilePath` pointing at the repo-root `.env`; `backend/src/main.ts`'s fatal env check moves after `ConfigService` is available; tracked `*.tsbuildinfo` files are untracked from git.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<diagnosis>
Confirmed by direct inspection of the current codebase (2026-07-16):

- `backend/nest-cli.json` — `compilerOptions.deleteOutDir: true` (top-level, applies to the default backend project).
- `backend/tsconfig.json` — `"incremental": true`, `"outDir": "./dist"`, no `tsBuildInfoFile` key. TypeScript's default incremental cache location when unset is the project root (e.g. `backend/tsconfig.build.tsbuildinfo`), NOT inside `dist/`.
- `git ls-files | grep tsbuildinfo` confirms `backend/tsconfig.tsbuildinfo` and `web/tsconfig.tsbuildinfo` are tracked in git despite `.gitignore` line 47 (`*.tsbuildinfo`) already covering them. `git status` shows `backend/tsconfig.tsbuildinfo` already deleted from the working tree (needs `git rm --cached` to also drop it from the index); `web/tsconfig.tsbuildinfo` still exists on disk and should stay on disk, just get untracked.
- `backend/src/main.ts` lines 17-24: the `missing = [...].filter(k => !process.env[k])` fatal check runs as the FIRST statement inside `bootstrap()`, before `NestFactory.create()` on line 24 (which is what actually triggers `ConfigModule.forRoot()` to load `.env` via dotenv).
- `backend/src/app.module.ts` line 37: `ConfigModule.forRoot({ isGlobal: true })` — no `envFilePath` set, so it resolves `.env` relative to `process.cwd()`.
- `package.json` (root) line 14: `"dev:backend": "npm run start:dev --workspace=backend"` → `backend/package.json` `"start:dev": "nest start --watch"`. Under npm workspaces, this runs with `cwd = backend/`. Confirmed `backend/.env` does not exist; confirmed root `.env` exists at `C:\Developer\work\ISEYAA\.env`.
- `docker-compose.yml` lines 43-44 (backend service) and lines 64+ (web service): `env_file: .env` already injects the root `.env` directly into the container's `process.env` — this path is unaffected by anything in this plan since Docker never relies on `ConfigModule`'s file discovery for these vars.
- `node_modules/@nestjs/config`'s `ConfigModule` `loadEnvFile`/`assignVariablesToProcess` behavior (verified in a prior session): silently no-ops via `fs.existsSync` if the resolved `envFilePath` doesn't exist (safe for the Docker image, which doesn't copy the repo-root `.env` into its build context), and only assigns keys NOT already present in `process.env` — so Docker-injected vars always win over anything `.env` would set. Adding an explicit `envFilePath` is safe for both paths.
</diagnosis>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix deleteOutDir/tsbuildinfo stale-cache race and untrack tsbuildinfo files</name>
  <files>backend/tsconfig.json, .gitignore (verify only, no change expected)</files>
  <action>
    In backend/tsconfig.json, add "tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo" inside compilerOptions (place it near the existing "incremental": true line for readability). This colocates TypeScript's incremental compile cache inside dist/, so nest-cli.json's deleteOutDir: true wipes both the compiled output and the incremental cache together on every restart — eliminating the "tsc sees no changes, skips emit, dist/ stays empty" race.

    Then untrack the already-gitignored tsbuildinfo files that slipped into git history before .gitignore's `*.tsbuildinfo` rule existed: run `git rm --cached backend/tsconfig.tsbuildinfo web/tsconfig.tsbuildinfo` (backend's is already gone from the working tree per git status — `--cached` only touches the index; web's file must remain on disk untouched, `git rm --cached` does not delete working-tree files). Do not modify .gitignore — line 47 (`*.tsbuildinfo`) already covers this correctly; this task is purely fixing files that were tracked before that rule was effective.
  </action>
  <verify>
    <automated>cd "C:\Developer\work\ISEYAA" && git status --porcelain | grep -i tsbuildinfo</automated>
  </verify>
  <done>backend/tsconfig.json contains "tsBuildInfoFile": "./dist/tsconfig.build.tsbuildinfo"; `git status --porcelain` shows both tsbuildinfo files staged for deletion from the index (backend/tsconfig.tsbuildinfo as deleted, web/tsconfig.tsbuildinfo as deleted-from-index-but-present-on-disk); web/tsconfig.tsbuildinfo still exists on disk (`ls web/tsconfig.tsbuildinfo` succeeds).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Load repo-root .env via ConfigModule and move the fatal env-check after ConfigService is available</name>
  <files>backend/src/app.module.ts, backend/src/main.ts</files>
  <action>
    In backend/src/app.module.ts: import `path` from Node's `path` module at the top. Change `ConfigModule.forRoot({ isGlobal: true })` to `ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '..', '.env') })`. At runtime `__dirname` resolves to `backend/dist` (both `nest start --watch` and `nest build && node dist/main` compile into `backend/dist`), so two levels up (`../..`) is the repo root, where the real `.env` lives. This is safe for Docker too — `@nestjs/config`'s `loadEnvFile` no-ops via `fs.existsSync` if the resolved path doesn't exist inside the container, and `assignVariablesToProcess` only fills in keys not already present in `process.env`, so Docker Compose's `env_file: .env` injection (which sets `process.env` directly, before Node even starts) always takes precedence.

    In backend/src/main.ts: remove the `missing = [...]` fatal-check block from the top of `bootstrap()` (current lines 18-22, before `NestFactory.create`). Re-add the identical check immediately after `const config = app.get(ConfigService);` (current line 25), but read values via `config.get<string>(k)` instead of `process.env[k]` — e.g. `const missing = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'].filter(k => !config.get<string>(k));` followed by the same `console.error` + `process.exit(1)` logic. This guarantees ConfigModule has already loaded `.env` (from Docker's injected process.env or the repo-root file) by the time the check runs, eliminating the bootstrap-ordering race. Leave the Sentry.init() block (lines 11-15, reads raw process.env before Nest even starts) untouched — it runs before any DI container exists by necessity and is out of scope for this fix.
  </action>
  <verify>
    <automated>cd "C:\Developer\work\ISEYAA\backend" && grep -n "envFilePath" src/app.module.ts && grep -n "config.get" src/main.ts | grep -v "PORT" && ! grep -n "process.env\[k\]" src/main.ts</automated>
  </verify>
  <done>backend/src/app.module.ts's ConfigModule.forRoot() call includes envFilePath pointing at the repo-root .env; backend/src/main.ts's required-env-var fatal check reads via config.get() and runs after `const config = app.get(ConfigService);`, not before NestFactory.create().</done>
</task>

<task type="auto">
  <name>Task 3: Verify both bugs are fixed with a real double cold-start</name>
  <files>none (verification only)</files>
  <action>
    From the repo root, kill any running backend process. Delete backend/dist and backend/tsconfig.build.tsbuildinfo (and backend/tsconfig.tsbuildinfo if it still exists on disk) to simulate a true cold start. Without manually exporting any env vars, run `npm run dev:backend` from the repo root and confirm it boots cleanly: look for "Nest application successfully started" (or equivalent successful-listen log) plus all 7 resilience policies logged ready, with NO "FATAL: missing required environment variables" message and NO "Cannot find module dist/main" crash. Kill the process, then immediately run `npm run dev:backend` a second time (second cold start — dist/tsconfig.build.tsbuildinfo now exists from the first run inside dist/, which deleteOutDir will wipe alongside dist/) and confirm it boots cleanly again with the same success signals. This second run is the actual regression test for Bug 1 — the first run alone would pass even with the old broken tsBuildInfoFile location.
  </action>
  <verify>
    <automated>cd "C:\Developer\work\ISEYAA" && (rm -rf backend/dist backend/tsconfig.build.tsbuildinfo backend/tsconfig.tsbuildinfo 2>/dev/null; true)</automated>
  </verify>
  <done>Two consecutive cold starts of `npm run dev:backend` (kill process between them) both boot successfully with no FATAL env-var message and no dist/main module-not-found crash.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local dev process → repo-root .env | Reading a local file path resolved via `path.resolve(__dirname, '..', '..', '.env')` |
| Docker container → env_file injection | Existing, unaffected trust boundary — container env vars set before Node starts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | backend/src/app.module.ts envFilePath | accept | Path is a relative filesystem resolution (`../../.env`) from a fixed, non-attacker-controlled `__dirname` — no external input reaches this path; identical secrets already loaded via Docker's `env_file` today, so this changes loading mechanism, not exposure surface |
| T-quick-02 | Tampering | backend/tsconfig.tsbuildinfo / web/tsconfig.tsbuildinfo untracking | accept | Untracking a build-cache artifact from git reduces (not increases) risk of stale/tampered cache being committed and reused across machines |
</threat_model>

<verification>
1. `backend/tsconfig.json` contains `tsBuildInfoFile` pointing inside `./dist/`.
2. `git status --porcelain` no longer lists tracked tsbuildinfo files as clean/tracked (both removed from index).
3. `backend/src/app.module.ts` passes `envFilePath` to `ConfigModule.forRoot()`.
4. `backend/src/main.ts`'s fatal env-var check runs after `app.get(ConfigService)`, reading via `config.get()`.
5. Two consecutive `npm run dev:backend` cold starts (dist/ + tsbuildinfo deleted before the first) both succeed with no FATAL message and no dist/main crash, with zero manually exported env vars.
6. `docker-compose up backend` path is unaffected (not required to be re-run in this plan, but the ConfigModule change is verified safe by code inspection: `assignVariablesToProcess` never overwrites existing `process.env` keys, and Docker's `env_file: .env` sets `process.env` before Node starts).
</verification>

<success_criteria>
- `npm run dev:backend` boots successfully from cold start twice in a row without any manually exported environment variables.
- No FATAL missing-env-vars message occurs when `.env` exists at the repo root and Nest's ConfigModule has a chance to load it before the check runs.
- No "Cannot find module dist/main" crash occurs on the second (or any subsequent) cold start.
- Docker Compose's existing `env_file: .env` backend startup path is unaffected (verified via code-level precedence: Docker-injected vars always win).
- Both stray tracked `*.tsbuildinfo` files are removed from git's index; `.gitignore`'s existing `*.tsbuildinfo` rule prevents recurrence.
</success_criteria>

<output>
After completion, create `.planning/quick/260716-lbl-fix-deleteoutdir-tsbuildinfo-stale-cache/260716-lbl-SUMMARY.md`
</output>
