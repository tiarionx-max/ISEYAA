<!-- generated-by: gsd-doc-writer -->
# Development Guide

This guide covers day-to-day development workflow for the ISEYAA monorepo: local setup,
build/lint/test commands per workspace, code style, and branch/PR conventions. For first-run
instructions and prerequisites, see the [README](../README.md). For environment variable
reference, see [docs/CONFIGURATION.md](CONFIGURATION.md).

## Local Setup

ISEYAA is an npm-workspaces monorepo with five workspaces declared in the root `package.json`:
`backend`, `web`, `mobile`, `shared`, `packages/proto`.

```bash
git clone <repo>
cd ISEYAA
npm install
cp .env.example .env
```

A single `npm install` from the repo root installs every workspace. To install a single
workspace only, use `npm install --workspace=<name>` (e.g. `npm install --workspace=backend`).

The backend (and Docker Compose) reads env vars from a single root-level `.env` file —
`ConfigModule` in `backend/src/app.module.ts` resolves `envFilePath` to the repo root, and
every service in `docker-compose.yml` uses `env_file: .env` from the repo root.

Generate the Prisma client and apply the schema before starting the backend for the first time:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Then start the workspaces you need for development:

```bash
npm run dev:backend   # NestJS monolith, nest start --watch, port 3001
npm run dev:web       # Next.js dev server, port 3000
npx expo start        # from mobile/ — Expo dev server (not exposed as a root script)
```

Docker Compose (`docker-compose.yml`) is the recommended way to boot the full local stack —
Postgres 16, Redis 7, `backend`, `web`, and the five gRPC microservices that are currently
live-wired into the monolith (`notifications-service`, `news-service`, `waitlist-service`,
`reviews-service`, `delivery-otp-service`):

```bash
docker compose up
```

## Build Commands

Root-level scripts (from `package.json`) operate across all workspaces using npm's
`--workspaces --if-present` flag:

| Command | Description |
|---------|--------------|
| `npm run dev:backend` | Starts the NestJS backend in watch mode (`start:dev` in `backend/`) |
| `npm run dev:web` | Starts the Next.js dev server (`dev` in `web/`) |
| `npm run build:all` | Runs `build` in every workspace that defines it |
| `npm run lint:all` | Runs `lint` in every workspace that defines it |
| `npm run test:all` | Runs `test` in every workspace that defines it |
| `npm run prisma:migrate` | Runs `prisma migrate dev` in `backend/` |
| `npm run prisma:generate` | Runs `prisma generate` in `backend/` |
| `npm run prisma:studio` | Opens Prisma Studio against `backend/prisma/schema.prisma` |

Per-workspace scripts you will use most often:

| Workspace | Command | Description |
|-----------|---------|--------------|
| `backend` | `npm run start:dev --workspace=backend` | NestJS watch mode |
| `backend` | `npm run build --workspace=backend` | `prisma generate && nest build` |
| `backend` | `npm run lint --workspace=backend` | ESLint with `--fix` |
| `backend` | `npm run test --workspace=backend` | Jest unit tests |
| `backend` | `npm run test:coverage --workspace=backend` | Jest with coverage report |
| `backend` | `npm run build:services --workspace=backend` | Builds all 12 gRPC microservice apps under `backend/apps/` (`nest build <service>` per app) |
| `web` | `npm run dev --workspace=web` | Next.js dev server |
| `web` | `npm run build --workspace=web` | Next.js production build |
| `web` | `npm run lint --workspace=web` | `next lint` |
| `web` | `npm run test --workspace=web` | Jest + Testing Library |
| `mobile` | `npm start --workspace=mobile` | Expo dev server |
| `mobile` | `npm run lint --workspace=mobile` | ESLint over `app/` |
| `mobile` | `npm run typecheck --workspace=mobile` | `tsc --noEmit` |
| `mobile` | `npm run test --workspace=mobile` | Jest via `jest-expo` preset |
| `shared` | `npm run build --workspace=shared` | `tsc` compile of shared types/DTOs |
| `shared` | `npm run lint --workspace=shared` | `tsc --noEmit` type check |
| `packages/proto` | `npm run generate --workspace=packages/proto` | Regenerates TypeScript types from `.proto` files (`generate.sh`) |
| `packages/proto` | `npm run build --workspace=packages/proto` | Compiles generated proto types |

`backend/apps/` contains 12 independently-buildable gRPC microservice scaffolds
(`admin-service`, `ai-service`, `auth-service`, `delivery-otp-service`, `events-service`,
`marketplace-service`, `news-service`, `notifications-service`, `reviews-service`,
`stays-service`, `waitlist-service`, `wallet-service`). Only five are currently live-wired
into local dev via `docker-compose.yml`; the rest are Railway-deployable scaffolds for future
extraction. See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the full migration model.

## Code Style

- **Backend (`backend/`)** — ESLint with `@typescript-eslint/recommended`, configured in
  `backend/.eslintrc.js`. Run with `npm run lint --workspace=backend` (auto-fixes with
  `--fix`). Notable rule overrides: `explicit-function-return-type`, `no-explicit-any`, and
  `no-unused-vars` are all turned off, and `interface-name-prefix` is off.
- **Web (`web/`)** — Next.js's built-in ESLint config (`eslint-config-next`), configured in
  `web/.eslintrc.json` (`{ "extends": "next/core-web-vitals" } `), run via
  `npm run lint --workspace=web` (`next lint`).
- **Mobile (`mobile/`)** — `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`,
  run via `npm run lint --workspace=mobile` (`eslint app --ext .ts,.tsx`). No standalone
  `.eslintrc.*` file was found in `mobile/`; TypeScript strictness is also checked separately
  via `npm run typecheck --workspace=mobile`.
- **Shared (`shared/`)** — no ESLint; `npm run lint --workspace=shared` runs `tsc --noEmit`
  as a type-check gate.
- No Prettier configuration or `.editorconfig` file is present in the repository. Formatting
  follows the existing 2-space indentation convention used throughout the codebase — match
  surrounding code style rather than relying on an auto-formatter.
- CI enforces backend and web linting on every push/PR to `main` and `development` (see
  `.github/workflows/ci.yml`); mobile CI runs a type-check step only, not lint.

## Branch Conventions

No branch naming convention is formally documented in the repository. Observed long-lived
branches are `main` (default/production), `development` (integration), and topical feature
branches (e.g., `microservices-redesign`). CI (`.github/workflows/ci.yml`) triggers on push
and pull request to `main` and `development`.

Commit messages in this repository follow **Conventional Commits** format:
`type(scope): description` — for example `fix(web): ...`, `feat(wallet): ...`,
`chore: ...`, `docs(...): ...`, `test(...): ...`, `perf(...): ...`. Keep the description in the
imperative mood and scoped to the affected module or workspace where possible.

## PR Process

There is no `.github/PULL_REQUEST_TEMPLATE.md` or `CONTRIBUTING.md` in this repository, so the
process below is inferred from CI configuration and observed practice:

- Open pull requests against `main` or `development` — these are the only branches CI
  (`.github/workflows/ci.yml`) runs against.
- CI must pass before merge: backend lint, backend Jest unit tests, two backend E2E suites
  (`test:e2e:settlement-splits`, `test:e2e:tours`), backend build, web lint, web build, and a
  mobile type-check job.
- A separate workflow (`.github/workflows/check-no-env.yml`) fails the build if any `.env`
  file (other than `.env.example`) is committed — never commit real secrets.
- Keep commit messages in Conventional Commits format (see Branch Conventions above) so the
  history stays scannable.
- If your change touches environment variables, update `.env.example` and
  [docs/CONFIGURATION.md](CONFIGURATION.md) in the same PR.

## Working with the Shared Package

`shared/` and `packages/proto/` are npm workspaces consumed by other workspaces via
`@iseyaa/shared` and `@iseyaa/proto`. If you change a type, DTO, or constant in `shared/src/`,
run `npm run build --workspace=shared` (or `npm run lint --workspace=shared` to type-check
without emitting) so `web/` and `mobile/` pick up the change. If you change a `.proto` file in
`packages/proto/`, run `npm run generate --workspace=packages/proto` followed by
`npm run build --workspace=packages/proto` to regenerate the TypeScript bindings consumed by
`backend/`.
