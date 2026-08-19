---
phase: quick
plan: 260819-ji6
status: complete
subsystem: backend, docs
tags: [payment-gateway-migration, flutterwave, paystack-retirement, webhooks, resilience, refunds]
---

# Summary: Paystack fully retired, Flutterwave is now ISEYAA's sole live payment gateway

Full backend migration off Paystack onto Flutterwave (v3 API) — not a primary/fallback role
swap. `PaystackService` is deleted, `POST /webhooks/paystack` no longer exists, and every
payment-initiating/BVN-resolving/refunding call site now goes through the new
`FlutterwaveService`.

## WebFetch Verification Outcome (required by plan `<output>` point 1)

No `WebFetch` tool was available in this execution environment. As a substitute, live HTTP
probing was done directly against both Flutterwave's public docs site and its API gateway via
`curl` (through the Bash tool):

- **Public docs (`developer.flutterwave.com`)**: the specific v3 doc URLs from the plan's
  `research_findings` (`/docs/collecting-payments/standard-payments`, `/reference/create-charge`)
  both returned HTTP 404. Fetching `https://developer.flutterwave.com/llms.txt` (a full doc
  sitemap) succeeded (200) and confirmed the entire public doc tree is now v4-shaped
  (`customers` / `payment-methods` / `charges` / `orders` resource model) — zero surviving "v3"
  or "standard payment" references anywhere in the sitemap. This corroborates the plan's
  planning-time finding: v3 docs have been removed from the public site, not just restructured.
- **Live API endpoint probing (`api.flutterwave.com/v3/...`)**: unauthenticated requests against
  all 5 v3 endpoints named in the plan's fallback shapes returned HTTP 401 `"Authorization
  required"` — **not** 404 — for every one of them, including the previously lowest-confidence
  BVN resolve endpoint:
  - `POST /v3/payments` → 401
  - `GET /v3/transactions/verify_by_reference` → 401
  - `POST /v3/transactions/{id}/refund` → 401
  - `POST /v3/tokenized-charges` → 401
  - `GET /v3/kyc/bvns/{bvn}` → 401, body `{"status":"error","message":"Authorization required","data":null}`

  A 401 (route exists, rejects missing auth) vs a 404 (route doesn't exist) is a materially
  stronger signal than reading marketing docs — it confirms all 5 paths, including BVN resolve,
  are live and routed on Flutterwave's API gateway today. **Path taken: the fallback v3 shapes
  from `research_findings` point 3 were implemented as-is**, since they are now corroborated by
  both (a) this repo's pre-existing `handleFlutterwave` webhook implementation and (b) live
  endpoint-routing confirmation. No fields were guessed beyond what's documented in the plan —
  response *body* shapes (as opposed to route existence) could not be confirmed without a live
  secret key, since a bare 401 has no response body payload for authenticated fields.

## Change

- **`FlutterwaveService`** (new, `backend/src/common/services/flutterwave.service.ts`): mirrors
  `PaystackService`'s full method surface — `initiatePayment`, `resolveBvn`, `refundCharge` — plus
  two genuinely new methods: `verifyTransaction` (Flutterwave's own webhook docs recommend
  re-querying, unlike Paystack) and `chargeToken` (replaces `chargeAuthorization`, keyed by
  Flutterwave's reusable card token instead of Paystack's `authorization_code`). Amounts are
  naira (major unit), not kobo — every method divides `amountKobo` by 100 before calling
  Flutterwave. `refundCharge` first resolves Flutterwave's numeric transaction id via
  verify-by-reference (Flutterwave's refund endpoint needs the numeric id, not the tx_ref string
  Paystack accepted), then posts the refund.
- **Resilience**: `resilience.types.ts` vendor keys renamed `paystack`→`flutterwave`,
  `paystackRefund`→`flutterwaveRefund` (identical threshold values); `resilience.service.ts`'s 3
  inline comments updated to match; all 3 resilience spec files mechanically renamed
  (string-literal vendor keys, `RESILIENCE_DEFAULTS.*` references, and the hardcoded fixture URL
  now `https://api.flutterwave.com/v3/payments`).
- **Webhooks**: `POST /webhooks/paystack` route + `WebhooksService.handlePaystack()` deleted
  entirely (dead code once nothing initiates a Paystack charge). **Security fix (T-260819-01,
  threat-registered `mitigate`)**: `handleFlutterwave`'s secret-hash comparison previously read
  `FLUTTERWAVE_SECRET_KEY` (the API auth key) — now reads a dedicated
  `FLUTTERWAVE_WEBHOOK_SECRET_HASH` env var, matching how `PAYSTACK_WEBHOOK_SECRET` was always
  distinct from `PAYSTACK_SECRET_KEY`. `handleFlutterwave`'s dispatch/normalization logic itself
  was already correct and is unchanged.
- **Call-site rewiring**: `wallet`, `events`, `marketplace`, `stays`, `studio`, `tour-bookings`,
  `kyc`, `refund` services all now inject `FlutterwaveService` instead of `PaystackService`.
  Default gateway values (`wallet.service.ts`'s `debitWallet`/`creditWallet`, `refund.service.ts`)
  changed from `'PAYSTACK'` to `'FLUTTERWAVE'` — the `PaymentGateway`/`SettlementGateway` union
  types still list `'PAYSTACK'` as a legal value for historical rows.
- **`refund.service.ts`**: `RefundInput.paystackReference`→`gatewayReference`,
  `RefundResult.paystackRefundId`→`gatewayRefundId`. Also fixed the success-status check —
  Flutterwave's refund status is `'completed'`, not Paystack's `'processed'`.
- **`stays.service.ts`**: membership renewal now calls `chargeToken({ token, ... })` instead of
  `chargeAuthorization({ authorizationCode, ... })`; the webhook payload type changed from
  `{ authorization?: { authorization_code? } }` to `{ authorization?: { token? } }`; and the
  renewal success check fixed from `charge.status !== 'success'` to `!== 'successful'`
  (Flutterwave's tokenized-charge status string differs from Paystack's).
- **`schema.prisma`**: comment-only annotations on all 7 legacy `paystack*`-named columns found
  by direct grep (`Ticket.paystackRef`, `Booking.paystackRef`, `Membership.paystackRef` /
  `paystackAuthCode` / `paystackEmail`, `Order.paystackRef`, `StudioBooking.paystackRef`) — the
  plan's research estimated 6; a 7th (`Order.paystackRef`) was found during execution. No rename,
  no migration, `PaymentGateway` enum untouched (`PAYSTACK` stays a legal historical value).
- **Deleted** `paystack.service.ts` + its spec file. `grep -ri "PaystackService" backend/src`
  returns zero matches (including comment-only mentions in 5 unrelated gRPC-client services that
  referenced it as a wording-convention precedent — updated to reference `FlutterwaveService`
  instead for a genuinely clean grep).
- **`.env.example` / `CLAUDE.md`**: Paystack env vars removed/marked retired, Flutterwave
  promoted to primary with `FLUTTERWAVE_WEBHOOK_SECRET_HASH` added; CLAUDE.md's
  constraints/dependencies/component-responsibilities/pattern-overview/layers/error-handling
  sections updated to describe Flutterwave as the sole live gateway; Deploy Reminder extended
  with the Railway provisioning flag (see below).

## Railway Provisioning Flag (required by plan `<output>` point 2)

**`FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET_HASH` are NOT yet provisioned on
Railway.** No live Flutterwave key exists in this environment — this was a code-only migration.
Before this migration is live in production: get `FLUTTERWAVE_SECRET_KEY` from Flutterwave
Dashboard → Settings → API Keys, set `FLUTTERWAVE_WEBHOOK_SECRET_HASH` to an arbitrary string at
Flutterwave Dashboard → Settings → Webhooks, add both to `@iseyaa/backend`'s Railway environment
variables, and configure the Flutterwave webhook URL to
`https://<railway-backend-domain>/api/v1/webhooks/flutterwave` with that same Secret Hash value.
Until both vars are set, `initiatePayment`/`resolveBvn`/`refundCharge`/`chargeToken` throw in
production (or run in stub mode outside production), and the Flutterwave webhook will reject
every inbound signature. This mirrors the `SENDCHAMP_API_KEY` follow-up pattern from quick task
260728-fms. Flagged in CLAUDE.md's Deploy Reminder section and recorded as a STATE.md blocker.

## Verification (required by plan `<output>` point 3)

- `cd backend && npx tsc --noEmit` — **clean, zero errors.**
- `cd backend && npx jest --silent` — **77 test suites passed, 944 tests passed, 0 failed**
  (baseline before this task was 916 passing per 260728-fms's SUMMARY; the increase reflects both
  new FlutterwaveService coverage and net growth from unrelated work merged since then).
- `grep -ri "PaystackService" backend/src` — zero matches.
- `grep -rn "PAYSTACK_SECRET_KEY\|PAYSTACK_WEBHOOK_SECRET" backend/src` — zero matches.
- `POST /webhooks/paystack` route confirmed removed from `webhooks.controller.ts`.
- `PaymentGateway` enum in `schema.prisma` confirmed unchanged (`PAYSTACK` + `FLUTTERWAVE` both
  still present).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree had no `node_modules` / stale generated Prisma Client**
- **Found during:** Task 1 verify, then again at the start of Task 2's full-suite run
- **Issue:** The worktree had zero `node_modules` (git worktrees don't carry installed
  dependencies), and after `npm install` the generated Prisma Client was stale/never-generated,
  causing 24 test suites to fail with `Property 'Decimal' does not exist on type 'typeof Prisma'`
  / `Property 'PrismaClientKnownRequestError' does not exist` / missing `TourPackage` exports —
  none of which are related to this task's changes.
- **Fix:** Ran `npm install --prefer-offline --no-audit --no-fund` at the worktree root, then
  `npx prisma generate` in `backend/`.
- **Files modified:** none (environment-only; no tracked files changed)
- **Verification:** Full suite re-run went from 24 failed / 53 passed to 0 failed / 77 passed.

**2. [Rule 3 - Blocking] `tour-settlement.service.ts`'s `refundInvalidSplit()` call site was
missed by the plan's stated file list**
- **Found during:** Task 2, while renaming `RefundInput.paystackReference`→`gatewayReference`
- **Issue:** `backend/src/modules/tour-bookings/tour-settlement.service.ts` (NOT listed in the
  plan's `files_modified`) calls `refundService.refund({ paystackReference: ... })` — renaming
  the interface field without updating this call site would have broken compilation.
- **Fix:** Updated the call site to `gatewayReference`, and (Rule 1, same file, same edit
  session) also fixed its hardcoded `gateway: 'PAYSTACK'` settle() literal to `'FLUTTERWAVE'` —
  same correctness class already being fixed across every other module in this task. Updated the
  matching assertions in `tour-settlement.service.spec.ts` (which WAS in the file list).
- **Files modified:** `backend/src/modules/tour-bookings/tour-settlement.service.ts`,
  `backend/src/modules/tour-bookings/__tests__/tour-settlement.service.spec.ts`
- **Verification:** `tour-settlement.service.spec.ts` passes; full suite green.
- **Committed in:** 806de65 (Task 2 commit)

**3. [Rule 1 - Bug] Stale live-describing Swagger docs on `wallet.controller.ts` and
`tour-bookings.controller.ts` (outside the plan's file list)**
- **Found during:** Task 2, final grep sweep for remaining "Paystack" strings
- **Issue:** The plan explicitly fixed Paystack-naming Swagger `@ApiOperation` summaries on
  `events.controller.ts` / `marketplace.controller.ts` / `studio.controller.ts`, but two more
  controllers with the identical issue (`wallet.controller.ts`'s topup endpoint,
  `tour-bookings.controller.ts`'s create/join/close endpoints — 4 strings total) were not in the
  plan's file list. Left uncorrected, `/api/docs` would still advertise Paystack on two
  user-facing payment endpoints post-migration.
- **Fix:** Updated all 5 Swagger summary/description strings to say Flutterwave.
- **Files modified:** `backend/src/modules/wallet/wallet.controller.ts`,
  `backend/src/modules/tour-bookings/tour-bookings.controller.ts`
- **Verification:** `tsc --noEmit` clean; no test assertions reference these strings.
- **Committed in:** 806de65 (Task 2 commit)

**4. [Rule 1 - Bug] Stale "PaystackService" comment references in 5 unrelated gRPC-client
services + 4 AbortSignal-forwarding test comments**
- **Found during:** Task 2, final grep sweep to satisfy the plan's literal
  `grep -ri "PaystackService" backend/src` done-criteria
- **Issue:** `delivery-otp-client.service.ts`, `news-client.service.ts`,
  `notifications-client.service.ts`, `reviews-client.service.ts`, `waitlist-client.service.ts`
  each had a comment citing `PaystackService`'s wording convention as precedent; 4 spec files
  (`s3.service.spec.ts`, `auth.service.spec.ts`, `delivery.service.spec.ts`,
  `notifications.service.spec.ts`) had a test description citing `paystack.service.spec.ts Test
  7` as a precedent for an AbortSignal-forwarding assertion pattern — both now point to a deleted
  file/class.
- **Fix:** Updated all 9 comment references to `FlutterwaveService` /
  `flutterwave.service.spec.ts`'s equivalent test.
- **Files modified:** 5 `*-client.service.ts` files + 4 `*.spec.ts` files (listed in git history)
- **Verification:** `grep -ri "PaystackService" backend/src` now returns zero matches; full
  suite green.
- **Committed in:** 806de65 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug/correctness). All directly necessitated by
or exposed during this task's own changes — no scope creep beyond fixing what the migration
itself broke or left inconsistent.

## Known Out-of-Scope Follow-up (not fixed — flagged for a future task)

`web/src/app/**` and `mobile/app/**` contain user-facing UI copy mentioning "Paystack" (e.g.
checkout/topup screens, host/vendor onboarding pages). This plan's `files_modified` list is
backend + `.env.example` + `CLAUDE.md` only — no web/mobile files were touched, per the plan's
explicit "code migration only" / backend-scoped framing. These are live user-facing strings that
should be updated in a follow-up task once the Flutterwave migration goes live, so citizens
aren't shown a retired gateway's name in the checkout flow.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

**External service requires manual configuration before production go-live.** See "Railway
Provisioning Flag" above:
- `FLUTTERWAVE_SECRET_KEY` (Flutterwave Dashboard → Settings → API Keys)
- `FLUTTERWAVE_WEBHOOK_SECRET_HASH` (Flutterwave Dashboard → Settings → Webhooks)
- Both added to `@iseyaa/backend`'s Railway environment variables
- Flutterwave webhook URL configured to `https://<railway-backend-domain>/api/v1/webhooks/flutterwave`

## Next Phase Readiness

Backend is fully code-complete and green (tsc clean, 944/944 tests). Nothing blocks merging this
work — the only blocker is the Railway env var provisioning above, which is a deployment step,
not a code gap. Web/mobile UI copy referencing "Paystack" (see Known Out-of-Scope Follow-up)
should be addressed before this migration is user-visible in production.

---
*Task: quick-260819-ji6*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: `backend/src/common/services/flutterwave.service.ts`
- CONFIRMED DELETED: `backend/src/common/services/paystack.service.ts`
- FOUND: `.planning/quick/260819-ji6-migrate-iseyaa-payment-gateway-from-pays/260819-ji6-SUMMARY.md`
- FOUND commit `0b00405` (Task 1)
- FOUND commit `806de65` (Task 2)
- FOUND commit `b394395` (Task 3)
