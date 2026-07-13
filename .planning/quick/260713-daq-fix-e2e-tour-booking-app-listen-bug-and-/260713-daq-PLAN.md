---
phase: quick
plan: 260713-daq
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/test/setup-e2e-tours.ts
  - web/package.json
  - web/jest.config.js
  - web/jest.setup.js
  - web/src/lib/__tests__/cart.test.ts
  - web/src/components/ui/__tests__/PageTransition.test.tsx
  - mobile/jest.config.js
  - mobile/lib/__tests__/cart-store.test.ts
  - mobile/lib/__tests__/category-config.test.ts
autonomous: true
requirements: [BUGFIX-e2e-app-listen, TEST-web-smoke, TEST-mobile-smoke]
must_haves:
  truths:
    - "backend e2e-tour-booking.e2e-spec.ts passes all 17 tests (wallet-invariant + kyc-encryption + e2e-tour-booking suites) against a real bound HTTP server, not by accidentally hitting a stray port-3001 process"
    - "web/ has a working jest test runner (`npm test` inside web/) that passes, where none existed before"
    - "mobile/ `npm test` actually discovers and runs tests instead of reporting 'No tests found'"
    - "cart math (add/remove/total) is regression-tested on both web and mobile since it is the shared, business-critical pure-logic module"
  artifacts:
    - path: "backend/test/setup-e2e-tours.ts"
      provides: "bootstrapE2EApp() now calls app.listen(0) so server.address() returns a real bound port"
    - path: "web/jest.config.js"
      provides: "next/jest-based Jest config with jsdom test environment"
    - path: "web/jest.setup.js"
      provides: "@testing-library/jest-dom matcher setup, wired via setupFilesAfterEnv"
    - path: "web/src/lib/__tests__/cart.test.ts"
      provides: "smoke tests for useCartStore add/remove/total"
    - path: "web/src/components/ui/__tests__/PageTransition.test.tsx"
      provides: "smoke render test for a low-risk client component"
    - path: "mobile/jest.config.js"
      provides: "jest-expo preset config so `npm test` discovers mobile tests"
    - path: "mobile/lib/__tests__/cart-store.test.ts"
      provides: "smoke tests for the mobile zustand cart store (mirrors web cart tests)"
    - path: "mobile/lib/__tests__/category-config.test.ts"
      provides: "smoke tests for the pure-logic query-string builders"
  key_links:
    - from: "backend/test/setup-e2e-tours.ts"
      to: "backend/test/e2e-tour-booking.e2e-spec.ts"
      via: "bootstrapE2EApp() returns app whose getHttpServer() is bound via app.listen(0)"
      pattern: "app\\.listen\\(0\\)"
    - from: "web/jest.config.js"
      to: "web/package.json"
      via: "\"test\": \"jest\" script invokes this config"
      pattern: "\"test\":\\s*\"jest\""
    - from: "mobile/jest.config.js"
      to: "mobile/package.json"
      via: "existing \"test\": \"jest\" script picks up preset: 'jest-expo'"
      pattern: "jest-expo"
---

<objective>
Fix a real bug in the Phase 9 tour-booking E2E suite where the hand-rolled HTTP client silently falls back to a hardcoded `http://127.0.0.1:3001` because the NestJS test app is never actually bound to a socket (`app.init()` is called but `app.listen()` never is) — meaning the suite only ever passed by accident if something else happened to be listening on port 3001. Confirmed live: 11/17 tests fail with `ECONNREFUSED` when no external server is running.

Then close the test-coverage gap flagged in STATE.md: `web/` and `mobile/` currently have **zero** working test coverage (web has no test tooling at all; mobile has `jest`/`jest-expo` installed but no jest config, so `npm test` reports "No tests found" against 340 files). Add smoke-level (not comprehensive) test coverage to both, focused on the highest-value regression risk: cart math, since `mobile/lib/cart-store.ts` is an intentional line-for-line mirror of `web/src/lib/cart.ts` (per Phase 8 ROADMAP notes) and is the most business-critical pure-logic code shared across both clients.

Purpose: Make the E2E suite trustworthy (it was giving false confidence), and give both frontend clients a real, working `npm test` command with at least one regression guard on their riskiest shared logic — closing the "zero test files" gap called out in `.planning/STATE.md` Blockers/Concerns.

Output: One-line fix in `backend/test/setup-e2e-tours.ts`; new Jest tooling + 2 smoke test files in `web/`; new Jest config + 2 smoke test files in `mobile/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@backend/test/setup-e2e-tours.ts
@backend/test/e2e-tour-booking.e2e-spec.ts
@web/src/lib/cart.ts
@mobile/lib/cart-store.ts
@mobile/lib/category-config.ts
@web/package.json
@mobile/package.json
</context>

<interfaces>
<!-- web/src/lib/cart.ts exports (Task 2 tests against this exact API — do not guess signatures) -->

```typescript
export type CartItem = {
  productId: string; name: string; price: number;
  imageUrl: string | null; vendorName: string; quantity: number;
};
export const useCartStore: UseBoundStore<...>; // zustand store, persisted key 'iseyaa-cart-v1'
// state shape: { items: CartItem[], addItem(product, qty?), removeItem(productId),
//                updateQty(productId, qty), clear(), totalCount(): number, totalPrice(): number }
export const useCartDrawerStore: UseBoundStore<...>; // { open, openDrawer, closeDrawer, toggleDrawer }
```
`addItem` accepts a `MinimalProduct` shape: `{ id, name, price, imageUrls?, vendor?: { businessName? } | null }`.
Calling `addItem` twice with the same `product.id` increments `quantity` on the existing row rather than duplicating it.

<!-- mobile/lib/cart-store.ts is an intentional exact mirror of the above (same field/method names,
     same persistence key 'iseyaa-cart-v1'), swapping only the storage backend for AsyncStorage. -->

<!-- mobile/lib/category-config.ts pure-logic exports (Task 3, second test file) -->
```typescript
export function buildStayQuery(c: StayCategory): string;        // always sets limit=48
export function buildMarketplaceQuery(c: MarketplaceCategory): string;
export function buildTourQuery(c: TourCategory): string;
export const STAY_CATEGORIES: StayCategory[];         // includes {id:'stays', types:'HOTEL,GUESTHOUSE,...'}
export const MARKETPLACE_CATEGORIES: MarketplaceCategory[]; // includes {id:'featured', featured:true}
export const TOUR_CATEGORIES: TourCategory[];          // includes {id:'heritage', category:'HERITAGE'}
```

<!-- web/src/components/ui/PageTransition.tsx — full source, chosen as the Task 2 render-smoke target
     because it has no next/image, no next/link, no data fetching, no zustand store: just framer-motion
     wrapping children. -->
```typescript
'use client';
import { motion } from 'framer-motion';
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}
```

<!-- Confirmed versions available (repo root node_modules, already hoisted via mobile/backend deps —
     use matching majors to avoid conflicts): jest 29.7.0, jest-environment-jsdom 29.7.0, jest-expo 51.0.4.
     jest config option to load @testing-library/jest-dom matchers is `setupFilesAfterEnv`
     (verified against node_modules/jest-config — NOT `setupFilesAfterEach`, which does not exist). -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Fix E2E app.listen bug in setup-e2e-tours.ts</name>
  <files>backend/test/setup-e2e-tours.ts</files>
  <action>
In `bootstrapE2EApp()`, immediately after the existing `await app.init();` line (currently line 38), add `await app.listen(0);`. Port `0` tells Node to bind an OS-assigned ephemeral port, avoiding any clash with a real dev server that might already be running on 3001. Do not change anything else in the function — `server = app.getHttpServer() as http.Server` in `e2e-tour-booking.e2e-spec.ts` will now return a socket where `server.address()` is a real bound `AddressInfo` object, so the existing `makeHttpClient(server).baseUrl()` logic (which already branches on `addr && typeof addr === 'object'` and reads `addr.port`) will work correctly with zero changes needed to the spec file itself. Do not touch the hardcoded `'http://127.0.0.1:3001'` fallback in the spec file — it becomes dead code for a correctly-bound server and removing it is out of scope for this fix.

This is the root cause of the failure: `app.init()` initializes the Nest application context but does not bind an HTTP listener; only `app.listen()` does. `getHttpServer()` still returns the underlying `http.Server` instance either way, but it stays unbound (`address()` returns `null`) until `listen()` is called — which is why the test only ever passed by accident when something else was already listening on port 3001.
  </action>
  <verify>
    <automated>cd backend && npx jest --config test/jest-e2e.json --testPathPattern="wallet-invariant|kyc-encryption|e2e-tour-booking" 2>&1 | tail -30</automated>
  </verify>
  <done>Local Postgres+Redis are running (`docker-compose up -d postgres redis` is a safe no-op if `iseyaa_postgres`/`iseyaa_redis` are already healthy). All 17 tests across the wallet-invariant, kyc-encryption, and e2e-tour-booking E2E specs pass with no `ECONNREFUSED` errors. `cd backend && npx jest` (full unit suite, no e2e config) still exits 0 with all ~412 tests passing, confirming this bootstrap-helper change caused no regression in the unit test path (unit tests don't use `bootstrapE2EApp`).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Add Jest smoke-test tooling to web/</name>
  <files>web/package.json, web/jest.config.js, web/jest.setup.js, web/src/lib/__tests__/cart.test.ts, web/src/components/ui/__tests__/PageTransition.test.tsx</files>
  <behavior>
    cart.test.ts (against the real `useCartStore` API shown in `<interfaces>`; reset store state in a `beforeEach` via `useCartStore.setState({ items: [] })` since it's a module-level singleton):
    - Test 1: `addItem({ id: 'p1', name: 'Adire Fabric', price: 5000 })` then `addItem({ id: 'p2', ... price: 2000 })` -> `useCartStore.getState().items` has length 2, `totalCount()` returns 2, `totalPrice()` returns 7000.
    - Test 2: calling `addItem` twice with the same `id` -> `items` still has length 1, `quantity` is 2 (no duplicate row) — this is the "riskiest flow" per the task brief (accidental double-row bugs on repeat add-to-cart clicks).
    - Test 3: `addItem` then `removeItem(id)` -> `items` is empty, `totalPrice()` is 0.
    PageTransition.test.tsx:
    - Test 1: `render(<PageTransition><div>hello world</div></PageTransition>)` does not throw and `screen.getByText('hello world')` is in the document — proves the component tree (framer-motion + Next client component) mounts cleanly under jsdom.
  </behavior>
  <action>
Set up Jest for `web/` from scratch, matching versions already resolved at the repo root to avoid conflicts (root `node_modules` already has `jest@29.7.0` and `jest-environment-jsdom@29.7.0` hoisted from other workspaces):

1. Add to `web/package.json` `devDependencies`: `"jest": "^29.7.0"`, `"jest-environment-jsdom": "^29.7.0"`, `"@testing-library/react": "^14.2.1"`, `"@testing-library/jest-dom": "^6.4.2"`, `"@types/jest": "^29.5.12"`. Add `"test": "jest"` to `scripts`. Run `npm install` from the repo root afterward (npm workspaces) so the lockfile updates.
2. Create `web/jest.config.js` using Next's built-in `next/jest` wrapper (no separate Babel config needed — it reads `next.config.js` and `web/tsconfig.json` automatically, including the `@/*` path alias): call `nextJest({ dir: './' })` to get `createJestConfig`, pass a config object with `testEnvironment: 'jest-environment-jsdom'` and `setupFilesAfterEnv: ['<rootDir>/jest.setup.js']`, then `module.exports = createJestConfig(customJestConfig)`.
3. Create `web/jest.setup.js` containing a single line: `import '@testing-library/jest-dom'`.
4. Write `web/src/lib/__tests__/cart.test.ts` implementing the three cases in `<behavior>` above, importing `{ useCartStore }` from `'../cart'`.
5. Write `web/src/components/ui/__tests__/PageTransition.test.tsx` implementing the render case in `<behavior>` above, importing `{ render, screen }` from `'@testing-library/react'` and `{ PageTransition }` from `'../PageTransition'`.

Keep both test files short — 3-5 `it()` blocks total across the two files, true smoke coverage, not exhaustive.
  </action>
  <verify>
    <automated>cd web && npm test -- --ci 2>&1 | tail -40</automated>
  </verify>
  <done>`cd web && npm test` passes with 0 failures across both new test files (4 total test cases). `cd web && npm run build` still completes successfully afterward (30 routes, same as before) — confirms adding Jest devDependencies and config did not break the Next.js production build.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add Jest smoke-test config + tests to mobile/</name>
  <files>mobile/jest.config.js, mobile/lib/__tests__/cart-store.test.ts, mobile/lib/__tests__/category-config.test.ts</files>
  <behavior>
    cart-store.test.ts (mirrors the web cart tests exactly, per the header comment in `mobile/lib/cart-store.ts` stating it mirrors `web/src/lib/cart.ts` EXACTLY — same assertions, same shape, only the import path and an explicit AsyncStorage mock differ):
    - Test 1: add two distinct items -> `items.length === 2`, `totalCount() === 2`, `totalPrice()` sums correctly.
    - Test 2: add the same product id twice -> `items.length === 1`, `quantity === 2`.
    - Test 3: add then `removeItem` -> `items` is empty.
    category-config.test.ts (pure functions, no mocking needed):
    - Test 1: `buildStayQuery({ id: 'stays', label: 'Stays', icon: ..., types: 'HOTEL,GUESTHOUSE,APARTMENT,VILLA,RESORT' })` produces a query string containing both `limit=48` and the `types` param.
    - Test 2: `buildMarketplaceQuery({ id: 'featured', label: 'Featured', icon: ..., featured: true })` produces a string containing `featured=true`.
    - Test 3: `buildTourQuery({ id: 'heritage', label: 'Heritage', icon: ..., category: 'HERITAGE' })` produces a string containing `category=HERITAGE`.
    (`icon` fields can be any placeholder value, e.g. `Object` or the actually-imported Lucide icon from `STAY_CATEGORIES`/`MARKETPLACE_CATEGORIES`/`TOUR_CATEGORIES` array entries — prefer reusing the real exported category constants directly, e.g. `STAY_CATEGORIES.find(c => c.id === 'stays')`, over hand-building fixture objects, to avoid type mismatches.)
  </behavior>
  <action>
`mobile/package.json` already declares `jest` (`^29.7.0`) and `jest-expo` (`~51.0.0`) as devDependencies and has a `"test": "jest"` script — the only missing piece is a Jest config, which is why `npm test` currently reports "No tests found".

1. Create `mobile/jest.config.js`: `module.exports = { preset: 'jest-expo' };` — this is the standard Expo SDK 51 setup (confirmed `jest-expo@51.0.4` is installed) and handles the RN/Expo Babel transform and `transformIgnorePatterns` automatically; no further customization needed for these pure-logic tests.
2. Write `mobile/lib/__tests__/cart-store.test.ts` implementing the three cases in `<behavior>` above, importing `{ useCartStore }` from `'../cart-store'`. Because `cart-store.ts` imports `@react-native-async-storage/async-storage` directly (not mockable via jest-expo's default preset alone), add this line before the imports: `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));` — this official mock module already exists at `node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js` (confirmed present). Reset state in `beforeEach` via `useCartStore.setState({ items: [] })`, same as the web test.
3. Write `mobile/lib/__tests__/category-config.test.ts` implementing the three cases in `<behavior>` above, importing `{ buildStayQuery, buildMarketplaceQuery, buildTourQuery, STAY_CATEGORIES, MARKETPLACE_CATEGORIES, TOUR_CATEGORIES }` from `'../category-config'`.

Keep both files short — this is smoke coverage. Skip any further mobile lib files; `category-config.ts` is the only other clean pure-logic candidate found in `mobile/lib/` (the rest — `api.ts`, `storage.ts`, `tokens.ts` — either need network/AsyncStorage mocking beyond smoke scope or are simple constants not worth a dedicated test).
  </action>
  <verify>
    <automated>cd mobile && npm test -- --ci 2>&1 | tail -40</automated>
  </verify>
  <done>`cd mobile && npm test` output no longer contains "No tests found" — it reports 2 test suites, 6 total test cases, all passing, 0 failures.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| E2E test harness -> real HTTP socket | The bootstrap helper now binds a real ephemeral port; test traffic stays entirely loopback/local, no external exposure |
| New Jest tooling -> production build | Adding devDependencies and config files to `web/` and `mobile/` must not leak into or break the production Next.js build or Expo bundle |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-------------------|
| T-quick-01 | Tampering | `backend/test/setup-e2e-tours.ts` (`app.listen(0)`) | accept | Test-only code path, never runs in production `main.ts`; binds to an OS-assigned ephemeral port, not a fixed/predictable one, and only for the lifetime of the test process |
| T-quick-02 | Information Disclosure | New `web/jest.config.js` / `mobile/jest.config.js` | accept | Config and test files contain no secrets; test fixtures use synthetic product/category data only, matching the pattern already used in `backend/test/setup-e2e-tours.ts`'s seeded test users |
| T-quick-03 | Denial of Service (build breakage) | `web/package.json` devDependency additions | mitigate | Task 2's `<done>` explicitly re-runs `npm run build` after adding Jest tooling to confirm the 30-route production build still succeeds unchanged |
</threat_model>

<verification>
1. `cd backend && npx jest --config test/jest-e2e.json --testPathPattern="wallet-invariant|kyc-encryption|e2e-tour-booking"` — 17/17 tests pass.
2. `cd backend && npx jest` — full unit suite still passes (no regression from the bootstrap helper change).
3. `cd web && npm test` — passes, 0 failures, 2 new test files discovered.
4. `cd web && npm run build` — still succeeds (30 routes) after adding Jest devDependencies.
5. `cd mobile && npm test` — passes, 0 failures, output no longer says "No tests found".
</verification>

<success_criteria>
- The E2E tour-booking suite is no longer accidentally-passing — it fails loudly if the app isn't actually bound to a socket, and passes deterministically (17/17) when run standalone with no external server on port 3001.
- `web/` has real, working Jest tooling and at least 4 passing smoke tests covering cart math and one component render, where zero test files existed before.
- `mobile/` `npm test` actually discovers and runs tests (currently reports "No tests found" against 340 files) — at least 6 passing smoke tests covering cart math and category query-string builders.
- No unrelated files touched; the deferred `@sentry/react-native` mobile typecheck issue is untouched.
- STATE.md's "Web and Mobile have zero test files" blocker is resolved (smoke-level, not comprehensive, per explicit user scoping).
</success_criteria>

<output>
After completion, create `.planning/quick/260713-daq-fix-e2e-tour-booking-app-listen-bug-and-/260713-daq-SUMMARY.md`
</output>
