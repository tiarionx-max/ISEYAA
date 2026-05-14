# Plan 02-05 Summary: Dockerfile + Railway + Infisical + CI Gate

**Status:** COMPLETE  
**Date:** 2026-05-12  
**Tests:** 173/173 (unchanged — no TypeScript business logic modified)  
**TypeScript:** 0 errors

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/Dockerfile` | Created — production multi-stage image with Infisical CLI, builds from monorepo root |
| `backend/railway.toml` | Updated — buildContext=".", healthcheckPath="/api/v1/health", monorepo-aware |
| `.github/workflows/check-no-env.yml` | Created — CI gate rejects committed .env files |
| `.dockerignore` | Created — excludes node_modules, .env*, mobile/, web/, .planning/ from Docker context |
| `.gitignore` | Updated — `.env.*` coverage added; `!.env.example` exception preserved; `backend/dist/` added |

## Key Design Decisions

- **Monorepo build context**: `buildContext = "."` in railway.toml so the Docker build has access to `shared/` workspace (required for Wave 3 proto files)
- **Infisical injection at runtime**: No secrets in Docker image — only `INFISICAL_TOKEN` + `INFISICAL_PROJECT_ID` go in Railway UI; all other secrets pulled from Infisical at container start
- **`packages/` → `shared/`**: RESEARCH.md referenced `packages/` but actual monorepo uses `shared/` — Dockerfile adjusted accordingly
- **dist/ compiled in Docker**: `RUN cd backend && npm run build` compiles TypeScript inside the image so `dist/instrumentation.js` and `dist/main.js` are present at CMD time
- **CI gate uses `git ls-files`**: Only checks committed files (not working directory), prevents false positives on dev machines with local `.env`

## User Setup Required

Before first Railway deploy:
1. Sign up at app.infisical.com, create project `iseyaa`
2. Create environments: development, staging, production
3. Add all secrets from `.env.example` to Infisical production environment
4. Create Machine Identity → copy token
5. In Railway service variables: set `INFISICAL_TOKEN` and `INFISICAL_PROJECT_ID`

## Security

- T-02-20 MITIGATED: No secrets baked into Docker image layers
- T-02-21 MITIGATED: CI gate blocks .env file commits; .gitignore prevents accidental staging
