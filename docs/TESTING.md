<!-- generated-by: gsd-doc-writer -->
# Testing

ISEYAA is a monorepo with four workspaces (`backend`, `web`, `mobile`, `shared`) plus
`packages/proto`. Each client/service workspace owns its own test suite; there is no
shared cross-workspace test runner beyond the root convenience script below.

## Test framework and setup

| Workspace | Framework | Config | Notes |
|-----------|-----------|--------|-------|
| `backend` | Jest 29.7.x + `ts-jest` 29.1.x | `backend/jest.config.js` | Unit specs run against `rootDir: 'src'` (plus `scripts/__tests__` and `apps/__tests__`, added explicitly to Jest's `roots` since they live outside `src/`). `sharp` and `@iseyaa/proto` are mapped via `moduleNameMapper` to avoid native/build resolution issues in the test runtime. |
| `backend` (E2E) | Jest 29.7.x + `ts-jest`, real NestJS app bootstrap | `backend/test/jest-e2e.json` | Boots the full `AppModule` against a real PostgreSQL + Redis instance. Requires `DATABASE_URL` and `REDIS_URL`/`REDIS_HOST`/`REDIS_PORT` to point at a running Postgres 16 + Redis 7 instance (see [`docker-compose.yml`](../docker-compose.yml) or the CI service containers below). |
| `web` | Jest 29.7.x + `@testing-library/react` + `jest-environment-jsdom`, wrapped by `next/jest` | `web/jest.config.js`, `web/jest.setup.js` | `jest.setup.js` imports `@testing-library/jest-dom` matchers. No coverage script defined. |
| `mobile` | Jest 29.7.x + `jest-expo` (~51.0.0 preset) | `mobile/jest.config.js` | Uses the Expo-aware Jest preset so React Native/Expo modules transform correctly. No coverage script defined. |
| `shared`, `packages/proto` | — | — | No test scripts or spec files currently exist in these workspaces. |

Before running backend tests locally, ensure dependencies are installed (`npm install` at
the repo root — this is an npm workspaces monorepo) and, for E2E specs only, that
PostgreSQL 16 and Redis 7 are running (`docker-compose up -d postgres redis`, or the
values in your local `.env`).

## Running tests

Run all workspace test scripts from the repo root:

```bash
npm run test:all
```

This runs `npm run test --workspaces --if-present`, so it invokes each workspace's `test`
script where one exists (`backend`, `web`, `mobile`).

Per-workspace commands:

```bash
# Backend — unit/integration specs (*.spec.ts)
npm run test --workspace=backend

# Backend — unit specs with coverage report
npm run test:coverage --workspace=backend

# Backend — E2E: settlement split tier audit trail
npm run test:e2e:settlement-splits --workspace=backend

# Backend — E2E: tour booking + wallet invariant + KYC encryption
npm run test:e2e:tours --workspace=backend

# Backend — E2E: settlement disputes
npm run test:e2e:settlement-disputes --workspace=backend

# Web — component/unit specs
npm run test --workspace=web

# Mobile — unit specs
npm run test --workspace=mobile
```

To run a single backend spec file directly with Jest, pass a path or pattern:

```bash
cd backend
npx jest src/modules/wallet/__tests__/wallet.service.spec.ts
npx jest --testPathPattern=wallet
```

No `test:watch` script is currently defined in any workspace; use `npx jest --watch`
directly inside the relevant workspace directory if watch mode is needed.

## Writing new tests

**Backend** — unit/integration specs live in a `__tests__/` subdirectory next to the code
they cover, named `<subject>.spec.ts` (e.g.
`backend/src/modules/wallet/__tests__/wallet.service.spec.ts`,
`backend/src/common/guards/roles.guard.spec.ts` for guards co-located directly next to
the guard file). Specs typically build a `TestingModule` via `@nestjs/testing` and stub
out `PrismaService`, `ConfigService`, and other injected dependencies rather than hitting
a real database — see `backend/src/common/services/__tests__/encryption.service.spec.ts`
for the pattern.

**Backend E2E** — full-stack specs boot the real `AppModule` against a live PostgreSQL +
Redis instance and are named `<subject>.e2e-spec.ts`. Some live under
`backend/test/` (e.g. `e2e-tour-booking.e2e-spec.ts`,
`e2e-settlement-split-tier-audit-trail.e2e-spec.ts`) with a shared bootstrap helper in
`backend/test/setup-e2e-tours.ts` (seeds baseline users by role — tourist, guide, host,
admin, govt wallet — and resets tour-related tables between suites). Others are
co-located with their module, e.g.
`backend/src/modules/settlement-disputes/__tests__/settlement-disputes.e2e-spec.ts`. New
E2E suites are wired up as a dedicated `test:e2e:<name>` script in
`backend/package.json` using `jest --config test/jest-e2e.json --testPathPattern="<pattern>"`,
and should be added as an explicit CI step (see CI integration below) — the default
`npm test` (unit Jest config) does not pick up `*.e2e-spec.ts` files.

**Web** — specs live in a `__tests__/` subdirectory next to the component/module they
cover, named `<subject>.test.ts` or `<subject>.test.tsx` (e.g.
`web/src/lib/__tests__/cart.test.ts`,
`web/src/components/ui/__tests__/PageTransition.test.tsx`). Use
`@testing-library/react` render/query helpers and `@testing-library/jest-dom` matchers
(imported globally via `web/jest.setup.js`).

**Mobile** — specs live in a `__tests__/` subdirectory next to the module they cover,
named `<subject>.test.ts` (e.g. `mobile/lib/__tests__/cart-store.test.ts`,
`mobile/lib/__tests__/category-config.test.ts`).

## Coverage requirements

No coverage threshold is configured in any workspace's Jest config, `package.json`, or a
`.nycrc`/`c8` config file. `backend`'s `test:coverage` script (`jest --coverage`) writes a
coverage report to `backend/coverage/` but does not fail the build if coverage drops.
CI does not enforce a coverage gate.

| Type | Threshold |
|------|-----------|
| Lines | No coverage threshold configured |
| Branches | No coverage threshold configured |
| Functions | No coverage threshold configured |
| Statements | No coverage threshold configured |

## CI integration

Tests run via the [`CI`](../.github/workflows/ci.yml) GitHub Actions workflow, triggered
on `pull_request` and `push` to `main` and `development`. It has three jobs:

- **`backend`** (`Backend — Lint / Test / Build`) — spins up `postgres:16-alpine` and
  `redis:7-alpine` service containers, generates the Prisma client, pushes the schema to
  the test database (`prisma db push --force-reset`), then runs:
  1. `npm run lint`
  2. `npm test -- --forceExit --passWithNoTests` (unit specs)
  3. `npm run test:e2e:settlement-splits -- --forceExit --passWithNoTests`
  4. `npm run test:e2e:tours -- --forceExit --passWithNoTests`
  5. `npm run build`

  All external service credentials (Paystack, Resend, Termii, AWS S3, Anthropic,
  Firebase, Google Maps) are set to `stub` values in CI — services are expected to
  degrade gracefully when these are unset/stubbed rather than fail the test run. Note the
  `test:e2e:settlement-disputes` script exists in `backend/package.json` but is not
  currently invoked as a CI step.

- **`web`** (`Web — Lint / Build`) — runs `npm run lint` and `npm run build` only; the
  Jest unit test suite (`npm run test --workspace=web`) is not currently invoked in CI.

- **`mobile`** (`Mobile — Type-check`) — runs `npm run typecheck` (`tsc --noEmit`) only;
  the Jest unit test suite (`npm run test --workspace=mobile`) is not currently invoked
  in CI.

A second workflow, [`check-no-env.yml`](../.github/workflows/check-no-env.yml), guards
against committing `.env` files but does not run tests.
