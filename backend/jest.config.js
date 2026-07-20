module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // `scripts/__tests__` holds specs for one-off standalone scripts (raw PrismaClient,
  // no NestJS DI — e.g. migrate-settlement-split-tiers.ts) that live outside `src/`
  // by design, mirroring `shadow-settlement-verify.ts`'s placement. Without this,
  // Jest's default `roots: ['<rootDir>']` never scans `scripts/` at all.
  // `apps/__tests__` (nested under each apps/<service>/src/__tests__) holds specs
  // for standalone gRPC microservice scaffolds (e.g. notifications-service) that
  // live outside `src/` by design — same rationale as `scripts/` above.
  roots: ['<rootDir>', '<rootDir>/../scripts', '<rootDir>/../apps'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^sharp$': '<rootDir>/__mocks__/sharp.js',
    // 21-06: @iseyaa/proto's package.json "main" points to "generated/index.js",
    // which is never built (the workspace ships committed .ts sources only —
    // tsc/nest build resolves the .ts directly via TS's Node-resolution .ts
    // fallback, but Jest's runtime module resolver does not). This is the first
    // jest.spec.ts in the repo to transitively require('@iseyaa/proto') (via
    // delivery-otp-grpc.controller.ts) — prior *-grpc.controller.ts files were
    // never covered by a spec, so this gap was previously unencountered. Map
    // straight to the .ts source so ts-jest transforms it like any other
    // in-repo module.
    '^@iseyaa/proto$': '<rootDir>/../../packages/proto/generated/index.ts',
  },
};
