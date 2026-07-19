module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // `scripts/__tests__` holds specs for one-off standalone scripts (raw PrismaClient,
  // no NestJS DI — e.g. migrate-settlement-split-tiers.ts) that live outside `src/`
  // by design, mirroring `shadow-settlement-verify.ts`'s placement. Without this,
  // Jest's default `roots: ['<rootDir>']` never scans `scripts/` at all.
  roots: ['<rootDir>', '<rootDir>/../scripts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^sharp$': '<rootDir>/__mocks__/sharp.js',
  },
};
