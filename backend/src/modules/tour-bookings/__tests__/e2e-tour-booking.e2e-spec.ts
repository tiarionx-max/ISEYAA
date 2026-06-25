/**
 * 09-12 — E2E Happy Path: Tour Booking (11 steps)
 *
 * This file is an entry-point stub that re-exports the full E2E suite from
 * `backend/test/e2e-tour-booking.e2e-spec.ts` so that IDE navigation from the
 * module directory works naturally. The actual runnable spec lives under
 * `backend/test/` where the jest-e2e.json picks it up via `testRegex`.
 *
 * IMPORTANT: This stub contains NO imports from outside `src/` so that the
 * main `tsconfig.json` (rootDir: ./src) compiles cleanly. Run E2E via:
 *
 *   npm run test:e2e:tours
 *
 * which uses `test/jest-e2e.json` + `tsconfig.e2e.json` (rootDir: '.').
 *
 * Walks the complete booking lifecycle end-to-end using a real NestJS application
 * instance and real Prisma against a test PostgreSQL database.
 *
 * Skip condition:
 *   - DATABASE_URL is not set, OR
 *   - DATABASE_URL points to localhost:54321 (CI placeholder / no DB available)
 *
 * The 11 steps mirror the sequence proven by the TOUR-10 plan:
 *   Step 1  — Guide registers as TOUR_GUIDE role
 *   Step 2  — Guide upserts profile (bio, languages, yearsExperience)
 *   Step 3  — Admin approves the guide (PENDING → APPROVED)
 *   Step 4  — Guide creates a DRAFT tour package
 *   Step 5  — Guide submits the package for review (DRAFT → PENDING)
 *   Step 6  — Admin approves the package (PENDING → APPROVED)
 *   Step 7  — Tourist creates a solo tour booking (→ PENDING + Paystack ref)
 *   Step 8  — Paystack webhook fires `charge.success` for the booking
 *   Step 9  — Booking transitions to CONFIRMED (settlement ran)
 *   Step 10 — Wallet ledger contains vendor + platform CREDIT rows summing to charge
 *   Step 11 — Wallet invariant (TOUR-10): sum of credits == chargeAmountNgn
 *
 * NOTE: E2E tests with a real DB should be run by the operator in the deployed
 * Railway environment with DATABASE_URL pointing to a dedicated test schema.
 * See backend/test/e2e-tour-booking.e2e-spec.ts for the runnable implementation.
 */

// This file intentionally exports no symbols — it serves as a documentation
// pointer and ensures the e2e spec path appears in IDE module maps.
export {};
