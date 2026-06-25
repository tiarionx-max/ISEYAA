# 09-12 SUMMARY — Regression Specs

## What was built

Three spec files and one E2E setup helper were created to lock in the TOUR-10
invariants and prevent regression across the full Phase 9 implementation.

### Files created

| File | Purpose |
|------|---------|
| `backend/test/setup-e2e-tours.ts` | E2E bootstrap helper — NestJS app init, table reset, user seed, JWT mint, webhook signer |
| `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts` | 6 wallet invariant unit tests (mocked Prisma, no DB required) |
| `backend/src/modules/tour-guides/__tests__/kyc-encryption.spec.ts` | 3 KYC encryption unit tests (real EncryptionService, mocked Prisma) |
| `backend/test/e2e-tour-booking.e2e-spec.ts` | E2E happy path — 11 steps, skipped when DATABASE_URL is absent or placeholder |
| `backend/src/modules/tour-bookings/__tests__/e2e-tour-booking.e2e-spec.ts` | IDE navigation stub — no imports outside src/, compiles cleanly |
| `backend/test/jest-e2e.json` | Jest config for E2E test runner (testRegex: `.e2e-spec.ts$`, timeout: 60s) |
| `backend/tsconfig.e2e.json` | TypeScript config extending base, rootDir: `.`, includes `test/**/*` |

## Wallet invariant tests (6) — `wallet-invariant.e2e-spec.ts`

All six tests exercise `TourSettlementService.handleTourBookingPayment` with a
fully mocked Prisma layer. They prove the TOUR-10 invariant:

  `sum(vendor credits) + platform commission == chargeAmount (NGN)`

| # | Test name |
|---|-----------|
| INV-1 | 100% split (GUIDE 70 + HOST 30) — all credits sum to chargeAmount, platform = 0 |
| INV-2 | partial split (GUIDE 50 + HOST 30) — platform absorbs remaining 20% |
| INV-3 | ATTRACTION with unset gov wallet — share rolls to platform, sum still exact |
| INV-4 | idempotency — replay with existing -V-0 row is a strict no-op |
| INV-5 | wallet update failure triggers RefundService.refund and REFUNDED status |
| INV-6 | invariant holds across 1000 NGN / 50000 NGN / 1000000 NGN charge amounts |

## KYC encryption tests (3) — `kyc-encryption.spec.ts`

Unit tests using a real `EncryptionService` (AES-256-GCM with test key) and
mocked Prisma. Prove the NDPA constraint that plaintext NIN is never persisted.

| # | Test name |
|---|-----------|
| ENC-1 | NIN is never persisted as plaintext — only AES-256-GCM ciphertext; decrypt round-trips correctly; no log contains the plaintext NIN |
| ENC-2 | stored hash starts with "$2" and is exactly 60 characters (bcrypt canonical form) |
| ENC-3 | duplicate NIN detected via bcrypt before any DB write — ConflictException, Dojah not called |

## E2E happy path (11 steps) — `backend/test/e2e-tour-booking.e2e-spec.ts`

Requires a live NestJS app + PostgreSQL. Skipped automatically when:
- `DATABASE_URL` is empty, or
- `DATABASE_URL` contains `localhost:54321` (CI placeholder), or
- `DATABASE_URL` contains `placeholder`

| # | Step |
|---|------|
| 1 | Guide calls become-guide → TourGuide row in PENDING |
| 2 | Guide upserts profile (bio, languages, yearsExperience) |
| 3 | Admin approves guide → APPROVED |
| 4 | Guide creates DRAFT tour package with 80% GUIDE settlementSplit |
| 5 | Guide submits package → PENDING |
| 6 | Admin approves package → APPROVED |
| 7 | Tourist creates solo booking → PENDING + ISY-TOUR-* reference |
| 8 | Paystack webhook `charge.success` sent with correct HMAC-SHA512 signature |
| 9 | Booking is CONFIRMED (EventEmitter2 settlement is synchronous) |
| 10 | Wallet ledger contains vendor -V-* rows + -PLAT row, all type=CREDIT with module=tour metadata |
| 11 | TOUR-10 invariant: sum of CREDIT amounts == ₦5,000 (within ₦0.02 rounding tolerance) |

## npm script added

```json
"test:e2e:tours": "jest --config test/jest-e2e.json --testPathPattern='wallet-invariant|kyc-encryption|e2e-tour-booking'"
```

Runs all three specs via the E2E Jest config. Unit tests (INV-* and ENC-*)
run without a database. The E2E happy path skips automatically unless
`DATABASE_URL` points to an accessible test schema.

## Operator note

E2E tests with a real database should be run by the operator in the deployed
Railway environment. Set `DATABASE_URL` to a dedicated test schema (not the
production database), then run:

```bash
cd backend && npm run test:e2e:tours
```

Steps 9–11 will validate that the TourSettlementService correctly fans out
wallet credits in a live Prisma + PostgreSQL transaction.
