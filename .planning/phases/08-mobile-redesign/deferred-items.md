# Deferred Items — Phase 8 Mobile Redesign

Out-of-scope issues discovered during plan execution. Each item logged with the plan that found it. NOT to be fixed by the finder — escalate to a future plan.

## From Plan 08-02

- **Pre-existing typecheck error (unchanged by 08-02):** `mobile/app/_layout.tsx(1,25): error TS2307: Cannot find module '@sentry/react-native' or its corresponding type declarations.` The package is declared in `mobile/package.json` (`@sentry/react-native: ~5.24.3`) but the worktree's `node_modules` does not contain its type definitions. Likely cause: `npm install` not run after dependency addition. Action: run `npm install` from repo root, OR adjust `tsconfig.json` `types` if it's intentional. Out of scope for 08-02 (touches no `mobile/components/**`).

## From Plan 08-05

- **Worktree `node_modules` not installed — typecheck flags `expo-image` import in `book.tsx`:** `mobile/app/(tabs)/book.tsx(32,36): error TS2307: Cannot find module 'expo-image' or its corresponding type declarations.` Same root cause as the Sentry baseline item above — the worktree has no installed `node_modules`. `expo-image` is declared in `mobile/package.json` (`expo-image: ~1.13.0`) and the import is required by the plan (CONTEXT cross-cutting: `expo-image` for all photo loads). The error WILL resolve once `npm install` runs from repo root. No code change needed. Out of scope for 08-05.
