---
phase: 10-documentation-correction-grpc-build-fix
reviewed: 2026-07-15T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - backend/apps/auth-service/src/auth-grpc.controller.ts
  - backend/apps/wallet-service/src/wallet-grpc.controller.ts
  - backend/apps/events-service/src/events-grpc.controller.ts
  - backend/apps/stays-service/src/stays-grpc.controller.ts
  - backend/apps/marketplace-service/src/marketplace-grpc.controller.ts
  - backend/apps/admin-service/src/admin-grpc.controller.ts
  - backend/apps/ai-service/src/ai-grpc.controller.ts
  - backend/apps/notifications-service/src/notifications-grpc.controller.ts
  - backend/apps/auth-service/tsconfig.app.json
  - backend/apps/wallet-service/tsconfig.app.json
  - backend/apps/events-service/tsconfig.app.json
  - backend/apps/stays-service/tsconfig.app.json
  - backend/apps/marketplace-service/tsconfig.app.json
  - backend/apps/admin-service/tsconfig.app.json
  - backend/apps/ai-service/tsconfig.app.json
  - backend/apps/notifications-service/tsconfig.app.json
  - backend/apps/auth-service/Dockerfile
  - backend/apps/wallet-service/Dockerfile
  - backend/apps/events-service/Dockerfile
  - backend/apps/stays-service/Dockerfile
  - backend/apps/marketplace-service/Dockerfile
  - backend/apps/admin-service/Dockerfile
  - backend/apps/ai-service/Dockerfile
  - backend/apps/notifications-service/Dockerfile
  - backend/package.json
  - packages/proto/package.json
  - packages/proto/generate.sh
  - .gitignore
  - packages/proto/delivery.proto
  - packages/proto/news.proto
  - packages/proto/reviews.proto
  - packages/proto/tour-guides.proto
  - packages/proto/tour-packages.proto
  - packages/proto/transport.proto
  - packages/proto/waitlist.proto
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 33 (8 gRPC controllers, 8 tsconfig.app.json, 8 Dockerfiles, 7 proto contracts, 2 package.json, generate.sh, .gitignore)
**Status:** issues_found

## Summary

Reviewed the Phase 10 gRPC scaffolds, per-service build config, and the 7 newly authored proto contracts. Findings are judged against the stated scaffold intent, but two genuine defects survive that judgment:

1. **Five of the eight Dockerfiles will not `docker build`** — they chain multiple `COPY` instructions with shell `&&` on a single line, which is invalid Dockerfile syntax. Only `auth-service` and `events-service` (and `wallet-service`) use correct one-`COPY`-per-line form. This is a latent BLOCKER: `nest build` passing does not mean the container image builds.
2. **The wallet `Debit` gRPC handler reimplements debit logic inline without `SELECT FOR UPDATE` or an idempotency guard**, directly violating the wallet-security invariant in CLAUDE.md ("SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations"). Even as a scaffold it touches money and encodes a double-spend race.

The 7 proto contracts are syntactically clean proto3 and internally consistent. Remaining warnings concern stub methods whose names imply mutations they never perform (ReserveTicket, CreateBooking), a marketplace oversell race, unvalidated date parsing, and a namespace-shadowing smell in the wallet controller.

## Critical Issues

### CR-01: Five Dockerfiles chain `COPY` instructions with `&&` — image build fails

**File:** `backend/apps/stays-service/Dockerfile:5`, `backend/apps/marketplace-service/Dockerfile:5`, `backend/apps/admin-service/Dockerfile:5`, `backend/apps/ai-service/Dockerfile:5`, `backend/apps/notifications-service/Dockerfile:5`
**Issue:** The line
```dockerfile
COPY package*.json ./ && COPY backend/package*.json ./backend/ && COPY shared/ ./shared/ && COPY packages/proto/ ./packages/proto/
```
is not valid. `COPY` is a Dockerfile instruction, not a shell command, and cannot be joined with `&&`. Docker parses this as a single `COPY` whose destination is `./packages/proto/` and whose sources are `package*.json`, `./`, `&&`, `COPY`, `backend/package*.json`, ... — the literal tokens `&&` and `COPY` are treated as source paths that do not exist, so the build fails with a "no such file or directory" COPY error. The `auth-service`, `wallet-service`, and `events-service` Dockerfiles do this correctly with one `COPY` per line.
**Fix:** Split into separate instructions (matching `events-service/Dockerfile:5-8`):
```dockerfile
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
COPY packages/proto/ ./packages/proto/
```

### CR-02: Wallet `Debit` gRPC handler has no row lock or idempotency guard — double-spend race

**File:** `backend/apps/wallet-service/src/wallet-grpc.controller.ts:23-53`
**Issue:** `debit()` reads the wallet balance (`findUnique`), checks `balance < amount`, then writes the new balance inside a `$transaction`. The read and the check happen outside any lock. Two concurrent debits both read `balance = 100`, both pass the check for `amount = 100`, and both write `balanceAfter = 0` — a classic TOCTOU that permits overdraft/double-spend and can drive the balance negative. There is also no idempotency check on `data.reference`: replaying the same request debits twice. This directly violates the CLAUDE.md constraint "SELECT FOR UPDATE on every debit; idempotency key required on all wallet mutations." The safe path already exists in `WalletService` (the controller injects `walletService` for `Credit` but bypasses it here by hand-rolling the debit).
**Fix:** Delegate to the existing locked service method rather than reimplementing, e.g. `await this.walletService.debitWallet(data.walletId, data.amount, data.reference, data.description)`, and let it perform the `SELECT ... FOR UPDATE` + idempotency-key check inside a single transaction. If an inline path is truly required, wrap the read in `prisma.$transaction` using a `SELECT FOR UPDATE` (raw) and enforce a unique constraint on `reference` so replays are rejected.

## Warnings

### WR-01: Marketplace `ReserveStock` check-then-decrement can oversell

**File:** `backend/apps/marketplace-service/src/marketplace-grpc.controller.ts:25-36`
**Issue:** Same race class as CR-02: `findUnique` reads `stock`, checks `stock < quantity`, then issues a separate `update ... { decrement }`. The decrement is atomic, but the guard is not, so two concurrent reservations both pass the check and both decrement, driving `stock` negative (oversell).
**Fix:** Use a single conditional update and check the affected count:
```ts
const { count } = await this.prisma.product.updateMany({
  where: { id: data.productId, stock: { gte: data.quantity } },
  data: { stock: { decrement: data.quantity } },
});
if (count === 0) return { success: false, reservedQuantity: 0 };
return { success: true, reservedQuantity: data.quantity };
```

### WR-02: Local `const wallet` shadows the imported `wallet` proto namespace

**File:** `backend/apps/wallet-service/src/wallet-grpc.controller.ts:19, 25, 57, 76`
**Issue:** Line 5 imports the namespace `wallet` from `@iseyaa/proto`, then every method declares `const wallet = await this.prisma.wallet.findUnique(...)`, shadowing the module binding within the method body. It compiles today only because the `wallet.*` type references live in the method signatures (evaluated in the outer scope). It is a maintenance trap: any in-body reference to a `wallet.*` type/value would silently resolve to the local Prisma record.
**Fix:** Rename the locals (e.g. `walletRecord` / `w`) so the proto namespace is never shadowed.

### WR-03: Unvalidated `new Date()` on untrusted gRPC string input

**File:** `backend/apps/stays-service/src/stays-grpc.controller.ts:33`
**Issue:** `checkAvailability` builds `new Date(data.checkOut)` / `new Date(data.checkIn)` directly from request strings with no validation. A malformed value yields `Invalid Date`, and Prisma comparisons against `Invalid Date` behave unpredictably (silently wrong availability rather than a clear error). Proto `string` fields carry no format guarantee.
**Fix:** Parse and validate before querying — reject when `Number.isNaN(date.getTime())` with an `RpcException`/`INVALID_ARGUMENT`, or define the proto fields as a typed timestamp and validate at the boundary.

### WR-04: `ReserveTicket` and `CreateBooking` never reserve or create — name/behavior mismatch

**File:** `backend/apps/events-service/src/events-grpc.controller.ts:38-45`, `backend/apps/stays-service/src/stays-grpc.controller.ts:40-47`
**Issue:** `reserveTicket` returns `success: true` only when a `PENDING` ticket *already* exists and otherwise returns `success: false` — it never creates a reservation. `createBooking` behaves identically for bookings. The methods report success for work they did not do and failure precisely when they should act. If wired into a caller before being filled in, this produces inverted, hard-to-diagnose behavior.
**Fix:** Acceptable as an explicitly-marked stub, but add a `// STUB: does not yet reserve/create` comment and, ideally, return an `UNIMPLEMENTED` gRPC status so callers cannot mistake the no-op for success. Implement the real reserve/create (inside a transaction) before wiring.

### WR-05: Wallet `GetBalance` derives KYC tier heuristically and hardcodes escrow

**File:** `backend/apps/wallet-service/src/wallet-grpc.controller.ts:55-72`
**Issue:** `kycTier` is inferred as `nin || bvn ? '2' : phone ? '1' : '0'` and `escrowBalance` is hardcoded to `0`. This diverges from the platform's authoritative KYC-tier source; a wallet with an escrow balance or a tier assigned by real KYC logic will be misreported. KYC tier gates transaction limits, so a wrong value has correctness consequences once wired.
**Fix:** Read the authoritative tier/escrow from the wallet/KYC service (e.g. `walletService.getBalance(...)`) instead of reconstructing it from PII presence.

### WR-06: Marketplace `ConfirmOrder` has no status or idempotency guard

**File:** `backend/apps/marketplace-service/src/marketplace-grpc.controller.ts:38-47`
**Issue:** `confirmOrder` sets any existing order to `PROCESSING` and overwrites `paystackRef` regardless of the order's current status. A replay or a call on an already-cancelled/refunded order silently moves it back to `PROCESSING`.
**Fix:** Guard the transition with a conditional update (e.g. `updateMany where: { id, status: 'PENDING' }`) and treat `count === 0` as a no-op/failure so confirmation is idempotent and state-safe.

## Info

### IN-01: gRPC handlers return empty-string sentinels instead of proper status codes

**File:** `backend/apps/auth-service/src/auth-grpc.controller.ts:28, 38`
**Issue:** `validateToken` returns `{ valid: false, userId: '', role: '' }` on failure and `getUser` returns all-empty fields when the user is not found. Callers cannot distinguish "not found" from a legitimately empty field, and an empty `role` could be mishandled by a naive authorization consumer.
**Fix:** For not-found, throw an `RpcException` with `NOT_FOUND`; keep `valid: false` for token failures but avoid empty-string identity fields doubling as a control signal.

### IN-02: `admin.ApproveItem` is a no-op returning `success: true`

**File:** `backend/apps/admin-service/src/admin-grpc.controller.ts:21-24`
**Issue:** The handler ignores `_data` and always returns success without performing an approval. Fine as a documented placeholder, but returning `success: true` from a method that does nothing is misleading if called.
**Fix:** Return `UNIMPLEMENTED`, or add a `// STUB` comment, until the approval is wired to `AdminService`.

### IN-03: Compiled `.js`/`.js.map` artifacts present in `wallet-service/src`

**File:** `backend/apps/wallet-service/src/*.js`, `.gitignore:12-13`
**Issue:** `app.module.js`, `main.js`, `wallet-grpc.controller.js` and their `.map` files exist inside the source tree (build output leaked into `src/`, only for wallet-service). The new `.gitignore:12-13` rules (`backend/apps/*/src/**/*.js`) correctly ignore them — verified via `git check-ignore` — so this is not a commit risk, but the stray artifacts indicate a compile-into-source step that the other services did not run.
**Fix:** Remove the stray `.js`/`.js.map` files from `wallet-service/src` and ensure builds emit only to `dist/`. No change needed to `.gitignore`, which already handles the pattern.

---

_Reviewed: 2026-07-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
