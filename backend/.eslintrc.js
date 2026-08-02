module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // Lint globs over {src,test}/**/*.ts, so ESLint's typed-linting needs a
    // project that includes test/. tsconfig.json is src-only; tsconfig.e2e.json
    // includes both src/** and test/**. Listing both lets each file resolve to
    // a project that includes it (the 3 files under test/ were otherwise
    // unparseable — "TSConfig does not include this file").
    project: ['tsconfig.json', 'tsconfig.e2e.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended'],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
};
