# Deferred Items — Phase 8 Mobile Redesign

Out-of-scope issues discovered during plan execution. Each item logged with the plan that found it. NOT to be fixed by the finder — escalate to a future plan.

## From Plan 08-02

- **Pre-existing typecheck error (unchanged by 08-02):** `mobile/app/_layout.tsx(1,25): error TS2307: Cannot find module '@sentry/react-native' or its corresponding type declarations.` The package is declared in `mobile/package.json` (`@sentry/react-native: ~5.24.3`) but the worktree's `node_modules` does not contain its type definitions. Likely cause: `npm install` not run after dependency addition. Action: run `npm install` from repo root, OR adjust `tsconfig.json` `types` if it's intentional. Out of scope for 08-02 (touches no `mobile/components/**`).
