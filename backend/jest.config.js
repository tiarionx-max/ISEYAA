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
  },
};
