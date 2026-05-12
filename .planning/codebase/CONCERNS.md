# Codebase Concerns

**Analysis Date:** 2026-05-12

---

## Tech Debt

### Access-Token JTI Not Validated on Every Request

**Area:** Auth — `backend/src/modules/auth/strategies/jwt.strategy.ts`
- Issue: The JWT strategy's `validate()` method does not check whether the token's `jti` is on the Redis blacklist. Blacklisting only happens at refresh/logout time, but access tokens issued before a forced logout remain valid for their full 15-minute lifetime.
- Files: `backend/src/modules/auth/strategies/jwt.strategy.ts`, `backend/src/modules/auth/auth.service.ts`
- Impact: A compromised access token cannot be immediately revoked. An attacker who obtains a valid 15-min access token can use it even after the user has logged out or the session has been revoked.
- Fix approach: Inject `RedisService` into `JwtStrategy.validate()` and reject the token if `redis.exists('blacklist:<jti>')` returns true. Accept the slight per-request Redis cost.

### Flutterwave Webhook Uses Plain Secret Comparison

**Area:** Payments — `backend/src/modules/webhooks/webhooks.service.ts`
- Issue: Flutterwave webhook authentication at line 67 compares the raw `verif-hash` header directly to `FLUTTERWAVE_SECRET_KEY` using `===`. This is not an HMAC — it is a static shared string comparison — and the Flutterwave payload is not verified cryptographically.
- Files: `backend/src/modules/webhooks/webhooks.service.ts:67`
- Impact: Anyone who discovers or guesses the static hash value can inject fake payment-confirmed webhooks.
- Fix approach: Replace with Flutterwave's documented HMAC-SHA256 verification against the raw body, matching the Paystack approach already implemented in `handlePaystack()`.

### Marketplace Order Does Not Decrement Product Stock

**Area:** Marketplace — `backend/src/modules/marketplace/marketplace.service.ts`
- Issue: `createOrder()` checks `product.stock < quantity` to prevent overselling, but after payment confirmation in `handleOrderPayment()` the stock is never decremented. The stock counter stays at its original value indefinitely.
- Files: `backend/src/modules/marketplace/marketplace.service.ts:216-237`
- Impact: Stock figures displayed to users are always stale. Multiple buyers can purchase the same last unit. The race-condition protection (check at order creation, no SELECT FOR UPDATE) also means concurrent orders for the same product can pass the stock check simultaneously.
- Fix approach: In `handleOrderPayment()`, inside a `$transaction`, add `prisma.product.update({ data: { stock: { decrement: item.quantity } } })` for each order item. Add a SELECT FOR UPDATE check inside `createOrder()` similar to the double-booking guard already used in `stays.service.ts`.

### `prisma db push --accept-data-loss` Is the Deploy Strategy

**Area:** Database — `backend/prisma/migrations/`
- Issue: Only 3 migration files exist (`20260511162114_init`, `20260511175026_auth_enhancements`, `20260511180339_tourism_bookmark`). Project documentation and configuration suggest `prisma db push --accept-data-loss` has been used during development, which bypasses migration history and can silently destroy data.
- Files: `backend/prisma/migrations/`, `backend/package.json` (scripts section only has `prisma:migrate` for dev, no explicit prod migration script)
- Impact: Schema drift in production is untracked. Any column drop or rename applied via `db push` can permanently delete production data without a migration record.
- Fix approach: Lock down production deployments to use `prisma migrate deploy` only. The `--accept-data-loss` flag must never be used against a production database. Add a CI gate that runs `prisma migrate status` and fails if the schema is ahead of the migration history.

### Admin Revenue Query References Non-Existent `vendors.category` Column

**Area:** Admin — `backend/src/modules/admin/admin.service.ts`
- Issue: The `getRevenue()` method at lines 70-77 executes a raw SQL query `SELECT v.category ...FROM orders o JOIN vendors v ...GROUP BY v.category`. The `Vendor` model in `backend/prisma/schema.prisma` has no `category` column; `AttractionCategory` exists only on `Attraction`. This query will throw a Postgres error at runtime.
- Files: `backend/src/modules/admin/admin.service.ts:70-77`, `backend/prisma/schema.prisma` (Vendor model)
- Impact: The `/admin/revenue` endpoint will return a 500 error for any admin user. The `by_category` breakdown in revenue reporting is completely broken.
- Fix approach: Remove the `by_category` raw query until a `category` field is added to the `Vendor` model, or replace it with a meaningful breakdown that uses existing columns (e.g., group by `VendorStatus` or `LGA`).

### Notifications FCM Token Stored Inside JSON `metadata` Field

**Area:** Notifications — `backend/src/modules/notifications/notifications.service.ts`
- Issue: `registerToken()` stores the FCM push token as `{ fcmToken: token }` inside the `User.metadata: Json?` column. Reading it back requires an unsafe `(user?.metadata as any)?.fcmToken` cast. There is no unique index, no TTL management, and no multi-device support.
- Files: `backend/src/modules/notifications/notifications.service.ts:17-26`
- Impact: Only one device per user can receive push notifications. Schema validation is bypassed. Any update to `metadata` from elsewhere (e.g., KYC data) overwrites the FCM token.
- Fix approach: Add a `fcmTokens` `String[]` column to `User` (or a separate `DeviceToken` model) so tokens are typed, indexed, and support multiple devices. Remove the `as any` cast.

### `NEXTAUTH_SECRET` Defaults to Hardcoded `iseyaa-dev-secret`

**Area:** Web auth — `web/src/lib/auth.ts`
- Issue: Line 59 falls back to `'iseyaa-dev-secret'` when `NEXTAUTH_SECRET` is not set. If the production environment variable is accidentally absent, sessions are signed with a known secret.
- Files: `web/src/lib/auth.ts:59`
- Impact: Forged NextAuth session cookies would be accepted as valid, granting arbitrary role access to the web dashboard.
- Fix approach: Remove the fallback default. Throw an error at startup if `NEXTAUTH_SECRET` is missing: `secret: process.env.NEXTAUTH_SECRET ?? (() => { throw new Error('NEXTAUTH_SECRET required') })()`.

### `SENDGRID_FROM_EMAIL` Is Missing from `.env.example`

**Area:** Environment — `.env.example`, `backend/src/common/services/sendgrid.service.ts`
- Issue: `sendgrid.service.ts` uses `config.get('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng')`, but this variable is absent from `.env.example`. New developers will send email with the default `noreply@iseyaa.gov.ng` sender without realising it can (and should) be configured.
- Files: `backend/src/common/services/sendgrid.service.ts:12`, `.env.example`
- Impact: Minor — emails will work but may not pass SPF/DKIM if the production SendGrid account uses a different sender domain.
- Fix approach: Add `SENDGRID_FROM_EMAIL=noreply@iseyaa.gov.ng` to `.env.example`.

### Global Rate Limit Applied But No Per-Endpoint Throttling for Auth

**Area:** Security — `backend/src/app.module.ts`, `backend/src/modules/auth/auth.controller.ts`
- Issue: `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` is configured globally, but `ThrottlerGuard` is never added to the global providers and no `@Throttle()` decorator is applied to auth endpoints. The rate limit is effectively inactive.
- Files: `backend/src/app.module.ts:6`, `backend/src/modules/auth/auth.controller.ts`
- Impact: Login (`POST /auth/login`) and OTP send (`POST /auth/otp/send`) endpoints have no HTTP-level rate limiting. OTP brute-force protection is in Redis only and only at the phone level — an attacker can hammer the login endpoint with no restriction.
- Fix approach: Add `ThrottlerGuard` to the global providers array in `AppModule` (or apply `@UseGuards(ThrottlerGuard)` to `AuthController`). Apply `@Throttle({ default: { ttl: 60_000, limit: 5 } })` to login and OTP send endpoints.

---

## Known Bugs

### Escrow Release Uses Incorrect Cutoff Logic (24h After `checkIn`, Not `checkOut`)

**Area:** Stays / Escrow — `backend/src/modules/stays/stays.service.ts`
- Symptoms: Escrow funds are released to the host 24 hours after the guest's **check-in** date, not after checkout. A 7-night stay releases funds on day 2.
- Files: `backend/src/modules/stays/stays.service.ts:272`
- Trigger: Any booking that has been `CONFIRMED` and whose `checkIn` was more than 24 hours ago will trigger premature release during the hourly cron.
- Workaround: None currently in production.
- Fix: Change the cron query from `checkIn: { lt: cutoff }` to `checkOut: { lt: cutoff }`.

### `APPROVED` Is Not a Valid `EventStatus` Enum Value but Is Referenced in Code

**Area:** Events / Tourism — `backend/prisma/schema.prisma`, multiple service files
- Symptoms: Prisma queries filtering `status: { in: ['APPROVED', 'PUBLISHED'] as any }` use a status value (`APPROVED`) that does not exist in the `EventStatus` enum (valid values: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PUBLISHED`, `CANCELLED`, `COMPLETED`). The `as any` cast is what hides the type error.
- Files: `backend/src/modules/tourism/tourism.service.ts:93`, `backend/src/modules/ai/ai.service.ts:87`, `backend/prisma/schema.prisma:48-54`
- Trigger: Checking the schema confirms `APPROVED` IS in the enum (line 52). The `as any` casts are unnecessary noise but not bugs in this specific case. However, if the enum were ever cleaned up and `APPROVED` removed, these casts would mask the breakage.
- Impact: Low — currently functional, but the `as any` suppresses type safety.
- Fix: Remove the `as any` casts; Prisma types fully support the enum values.

---

## Security Considerations

### NIN and BVN Stored in Plaintext

**Area:** KYC — `backend/prisma/schema.prisma`
- Risk: `User.nin` and `User.bvn` are stored as plaintext `String?` columns. These are sensitive government identity numbers regulated by NDPA.
- Files: `backend/prisma/schema.prisma:157-158`, `backend/src/modules/wallet/wallet.service.ts:14` (reads them to compute KYC tier)
- Current mitigation: None — they are stored and queried in the clear.
- Recommendations: Hash NIN/BVN with a keyed HMAC (not bcrypt — they need to be searchable for tier lookups) or store them encrypted with AES-256 and decrypt only in the KYC tier computation path. At minimum, ensure the columns are excluded from all `SELECT *` queries and Swagger API responses.

### Swagger UI Exposed Without Authentication in Production

**Area:** API documentation — `backend/src/main.ts`
- Risk: `SwaggerModule.setup('api/docs', ...)` is registered unconditionally. In production, the full API schema including all endpoint signatures, request bodies, and security requirements is publicly visible.
- Files: `backend/src/main.ts:33`
- Current mitigation: None.
- Recommendations: Gate Swagger behind `APP_ENV !== 'production'` or add HTTP Basic Auth middleware for the `/api/docs` route.

### Firebase Legacy API Used (`/fcm/send`) with Server Key in Environment

**Area:** Push Notifications — `backend/src/modules/notifications/notifications.service.ts`
- Risk: Uses the deprecated Firebase legacy FCM API (`https://fcm.googleapis.com/fcm/send`) with `Authorization: key=<FIREBASE_SERVER_KEY>`. This API was discontinued by Google in July 2024. Any server key exposed via logs or errors grants full access to send push messages to all app tokens.
- Files: `backend/src/modules/notifications/notifications.service.ts:33-38`
- Current mitigation: None.
- Recommendations: Migrate to the Firebase Admin SDK v9+ using a service account (not a server key). This also enables per-token error handling and token refresh.

### `PAYSTACK_SECRET_KEY` Defaults to Empty String on Missing Config

**Area:** Payments — `backend/src/common/services/paystack.service.ts`
- Risk: `config.get<string>('PAYSTACK_SECRET_KEY', '')` silently uses an empty bearer token if the env var is not set. A misconfigured deployment would send payment initialisation requests with `Authorization: Bearer ` (empty), which Paystack would reject but not before potentially leaking the request structure.
- Files: `backend/src/common/services/paystack.service.ts:28`
- Current mitigation: Paystack API will reject calls.
- Recommendations: Throw a `ConfigurationException` at startup if `PAYSTACK_SECRET_KEY` is absent.

### Docker Compose Hardcodes Database Credentials in Plain Text

**Area:** Infrastructure — `docker-compose.yml`
- Risk: `POSTGRES_PASSWORD: iseyaa_dev_password` is committed to version control. While labelled dev, these defaults are often reused carelessly in staging environments.
- Files: `docker-compose.yml:10`
- Current mitigation: Intended for dev only.
- Recommendations: Replace with `${POSTGRES_PASSWORD}` referencing the root `.env` file so the password is never hardcoded in source.

---

## Performance Bottlenecks

### Geo-Proximity Search Does Bounding-Box Filter in DB Then Haversine in Memory

**Area:** Tourism / AI — `backend/src/modules/tourism/tourism.service.ts`
- Problem: All proximity searches fetch a bounding-box-filtered result set from Postgres, then load all matching rows into Node.js memory to compute Haversine distances and re-filter.
- Files: `backend/src/modules/tourism/tourism.service.ts:56-65`, `backend/src/modules/ai/ai.service.ts:70-127`
- Cause: No PostGIS extension, no `earthdistance` extension. The bounding box approximation can return O(n) rows for dense urban areas.
- Improvement path: Enable `postgis` or the `earthdistance + cube` Postgres extensions and move the distance calculation into SQL. Alternatively, index `latitude` and `longitude` columns (currently unindexed) at minimum.

### `releaseEscrow` Cron Processes Bookings With No Pagination Guard in a Single Loop

**Area:** Stays — `backend/src/modules/stays/stays.service.ts`
- Problem: `releaseEscrow()` uses `take: 100` but processes each booking sequentially with individual wallet updates in a `for` loop (not batched). Under load, 100 serialised database round-trips run inside a single cron tick.
- Files: `backend/src/modules/stays/stays.service.ts:271-327`
- Cause: Sequential `for...of` loop with `await` inside, and separate queries for wallet lookup + update per booking.
- Improvement path: Batch escrow releases using `Promise.allSettled()` or process the 100 bookings with a concurrency-limited pool (`p-limit`). Long-term: a dedicated background job queue (BullMQ) would be more robust.

### Admin `listUsers` Has No Upper Bound on `limit` Parameter

**Area:** Admin — `backend/src/modules/admin/admin.service.ts`
- Problem: `listUsers(page, limit, role)` passes the `limit` value directly to Prisma without capping it. The default in `admin.controller.ts` is 50, but a caller can pass `?limit=100000`.
- Files: `backend/src/modules/admin/admin.service.ts:102-114`, `backend/src/modules/admin/admin.controller.ts:37`
- Cause: No `Math.min(limit, MAX)` guard in the service, unlike `WalletService.getTransactions()` which does cap at 100.
- Improvement path: Add `const safeLimited = Math.min(limit, 100)` in `listUsers`, `listVendors`, and `listProperties`.

---

## Fragile Areas

### Webhook Event Routing Relies Entirely on Unvalidated `metadata.type`

**Area:** Payments — `backend/src/modules/webhooks/webhooks.service.ts`
- Files: `backend/src/modules/webhooks/webhooks.service.ts:28-59`
- Why fragile: The entire payment routing switch-case (`ticket_purchase`, `stay_booking`, `order_payment`, `studio_booking`) relies on the `metadata.type` field that was set when the payment was initiated by the client. If a Paystack transaction is initialised outside the platform (e.g., via direct API call) or if `metadata` is missing, the payment falls through to the wallet top-up path or is silently logged as unhandled.
- Safe modification: Add an explicit `default` branch that logs a `warn` and emits a `payment.unhandled` event rather than silently applying wallet credit. Consider a Paystack transaction verification call (`GET /transaction/verify/:reference`) before processing to confirm the amount matches internal records.
- Test coverage: No test exists for `webhooks.service.ts`. The `handleFlutterwave` path has zero test coverage.

### Ticket Oversell Race Condition

**Area:** Events — `backend/src/modules/events/events.service.ts`
- Files: `backend/src/modules/events/events.service.ts:144-186`
- Why fragile: `purchaseTicket()` checks `ticketType.sold >= ticketType.quantity` before creating the ticket, but does not wrap the check + create in a `SELECT FOR UPDATE` transaction like the stay and studio booking guards do. Concurrent ticket purchases can both pass the sold/quantity check and both succeed, overselling the event.
- Safe modification: Wrap the capacity check and `ticket.create` + `ticketType.update({ sold: { increment: 1 } })` in a `prisma.$transaction(async tx => { ... })` block with a `FOR UPDATE` raw query on `ticket_types`, identical to the pattern used in `createBooking()` in `stays.service.ts`.
- Test coverage: The spec (`events.service.spec.ts`) does not test the race condition.

### `AiService.getLgaIntelligence` Has No Null-Guard on Missing LGA

**Area:** AI — `backend/src/modules/ai/ai.service.ts`
- Files: `backend/src/modules/ai/ai.service.ts:210-225`
- Why fragile: `getLgaIntelligence()` calls `prisma.lGA.findUnique({ where: { id: lgaId } })` and then passes `lga?.name ?? lgaId` to Claude without throwing if the LGA is not found. The `(response.content[0] as any).text` cast will throw a runtime TypeError if the response structure changes.
- Safe modification: Add `if (!lga) throw new NotFoundException('LGA not found')` before the Anthropic call. Replace `(response.content[0] as any).text` with proper type handling using the SDK's `TextBlock` type.

---

## Scaling Limits

### Redis Holds All Session Blacklist, OTP State Without Eviction Policy Alignment

**Area:** Auth — Redis configuration, `docker-compose.yml`
- Current capacity: Redis configured with `--maxmemory 256mb --maxmemory-policy allkeys-lru` in docker-compose. This policy evicts any key when memory is full — including active OTP codes and blacklisted JTI entries.
- Limit: Under `allkeys-lru`, a memory spike from cache data could evict security-critical keys (OTP locks, JTI blacklist entries) before their TTL expires.
- Scaling path: Use a dedicated Redis instance for security keys (OTP, blacklist) with `noeviction` policy and a separate instance with `allkeys-lru` for general application caching. At minimum, prefix security keys and use a `volatile-lru` policy so only keys with TTLs are evicted.

### No Database Connection Pooling Configured

**Area:** Infrastructure — `backend/src/prisma/prisma.service.ts`
- Current capacity: PrismaService extends `PrismaClient` directly with no pool configuration. Prisma's default connection pool is 10 connections for PostgreSQL.
- Limit: With 13 NestJS modules each potentially making concurrent queries, connection contention will appear under moderate load.
- Scaling path: Add `datasources: { db: { url: DATABASE_URL } }` with `connection_limit` in the Prisma schema, or pass a `?connection_limit=<N>&pool_timeout=<S>` query parameter to `DATABASE_URL`. Consider PgBouncer for production.

---

## Dependencies at Risk

### Firebase Legacy FCM REST API (`/fcm/send`)

**Area:** Notifications — `backend/src/modules/notifications/notifications.service.ts`
- Risk: Google deprecated the legacy FCM HTTP API in July 2024 and scheduled it for shutdown. Any notification sent via `https://fcm.googleapis.com/fcm/send` will eventually stop working.
- Impact: All push notifications to mobile users will silently fail.
- Migration plan: Switch to the Firebase Admin SDK (`firebase-admin` npm package) using a service account JSON file stored as an environment variable. The new API is `messaging.send(message)`.

---

## Missing Critical Features

### No Paystack Payment Verification Before Crediting Wallet/Confirming Booking

**Area:** Payments — all `@OnEvent('payment.*')` handlers
- Problem: When a Paystack webhook fires `charge.success`, the platform immediately confirms bookings and credits wallets based solely on the webhook payload. There is no call to `GET https://api.paystack.co/transaction/verify/:reference` to confirm the amount and status server-side.
- Blocks: Production readiness — a forged or replayed webhook with a manipulated `amount` field would result in under-payment for a booking or under-credited wallet.
- Affected files: `backend/src/modules/webhooks/webhooks.service.ts`, `backend/src/modules/stays/stays.service.ts:214-268`, `backend/src/modules/events/events.service.ts:188-235`, `backend/src/modules/studio/studio.service.ts:134-166`, `backend/src/modules/marketplace/marketplace.service.ts:216-237`

### No Refund / Cancellation Flow Implemented

**Area:** Payments / Bookings
- Problem: `BookingStatus` and `TicketStatus` include `REFUNDED` and `CANCELLED` states in the schema, but no service method or endpoint triggers a Paystack refund API call or transitions records to these states through any user-facing path.
- Blocks: User-facing cancellation and refund operations for stays, events, orders, and studio bookings.
- Affected files: `backend/prisma/schema.prisma` (enum values exist), all booking/ticket service files

---

## Test Coverage Gaps

### Webhooks Service Has Zero Test Coverage

**Area:** `backend/src/modules/webhooks/`
- What's not tested: HMAC signature verification, routing of all five payment types, the Flutterwave stub path, the wallet fallback path, and idempotency (duplicate webhook delivery).
- Files: `backend/src/modules/webhooks/webhooks.service.ts` (no `__tests__` directory)
- Risk: The most critical financial entry point in the system has no automated regression protection. A logic change to routing or signature verification could go undetected.
- Priority: High

### Escrow Release Cron Is Not Tested

**Area:** `backend/src/modules/stays/stays.service.ts`
- What's not tested: `releaseEscrow()` cron logic — correct cutoff date, wallet credit amount, transaction creation, `escrowReleasedAt` timestamp update, and handling of bookings with no host wallet.
- Files: `backend/src/modules/stays/__tests__/stays.service.spec.ts` (the cron method is absent from the test file)
- Risk: A regression in escrow logic could cause incorrect or missed payouts to hosts without any test catching it.
- Priority: High

### Notifications, Admin, and Users Services Have Thin or Absent Coverage

**Area:** Multiple modules
- What's not tested:
  - `backend/src/modules/notifications/notifications.service.ts` — no spec file at all
  - `backend/src/modules/admin/admin.service.ts` — spec file exists but does not test `getRevenue()` (the broken raw SQL path) or `getDashboard()`
  - `backend/src/modules/users/users.service.ts` — spec file exists but NDPA erasure path is not confirmed to null all PII fields
- Files: `backend/src/modules/notifications/`, `backend/src/modules/admin/__tests__/admin.service.spec.ts`, `backend/src/modules/users/__tests__/users.service.spec.ts`
- Risk: The broken `vendors.category` raw SQL bug in admin revenue would be caught immediately by a test. NDPA erasure untested means a regression could leak PII.
- Priority: Medium

### Mobile App Has No Tests

**Area:** `mobile/`
- What's not tested: All Expo screens (`app/(tabs)/*.tsx`), API client (`mobile/lib/api.ts`), QR check-in flow (`mobile/app/qr-checkin.tsx`).
- Files: `mobile/` (no test files present)
- Risk: The QR check-in and payment flows — the highest-stakes mobile paths — have no automated validation.
- Priority: Medium

---

*Concerns audit: 2026-05-12*
