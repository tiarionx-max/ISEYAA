<!-- generated-by: gsd-doc-writer -->
# API Reference

The ISEYAA backend exposes a single REST API consumed by the mobile app (Expo/React
Native) and the web admin dashboard (Next.js). All routes are served by the NestJS
monolith in `backend/src/modules/*` and prefixed with `/api/v1` (`app.setGlobalPrefix('api/v1')`
in `backend/src/main.ts`).

- **Base URL (local):** `http://localhost:3001/api/v1`
- **Interactive docs:** `GET /api/docs` (Swagger UI, generated from `@nestjs/swagger`
  decorators). Only mounted when `NODE_ENV !== 'production'` (`backend/src/main.ts`).
- **Production base URL:** <!-- VERIFY: production API base URL / custom domain --> — not
  defined in the repository; set on the hosting platform.

Five domains (**notifications, news, waitlist, reviews, delivery-otp**) are internally
served by extracted gRPC microservices behind thin facade services in the monolith
(see `docs/ARCHITECTURE.md`), but this is an internal implementation detail — the REST
contract documented below is unchanged for API consumers. If an extracted service is
unreachable, its facade fails closed with `503 Service Unavailable` instead of the usual
error shape for that endpoint.

## Authentication

ISEYAA uses **JWT bearer tokens** issued by `AuthModule` (`backend/src/modules/auth/`).

- **Access token** — HS256 JWT signed with `JWT_SECRET`, 15-minute expiry
  (`signOptions: { expiresIn: '15m' }` in `backend/src/modules/auth/auth.module.ts`).
  Payload: `{ sub: userId, role, jti }`.
- **Refresh token** — HS256 JWT signed with `JWT_REFRESH_SECRET`, 30-day expiry
  (`REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60` in `auth.service.ts`). Rotated on every
  `POST /auth/refresh` call; the previous token is blacklisted in Redis on rotation and
  on logout (`RedisService`, key pattern `blacklist:{jti}`).
- Protected routes are guarded with `@UseGuards(JwtAuthGuard)`
  (`backend/src/modules/auth/guards/jwt-auth.guard.ts`), which validates the token via
  Passport's JWT strategy (`backend/src/modules/auth/strategies/jwt.strategy.ts`) using
  `Authorization: Bearer <accessToken>`.
- Role-restricted routes additionally use `@UseGuards(JwtAuthGuard, RolesGuard)` with
  `@Roles(UserRole.X, ...)` (`backend/src/common/guards/roles.guard.ts`,
  `backend/src/common/decorators/roles.decorator.ts`). `RolesGuard` compares the JWT
  payload's `role` claim against the required list — a 403 is returned if it does not
  match.

### Roles (`UserRole` enum, `backend/src/common/enums/user-role.enum.ts`)

| Role | Self-registerable | Notes |
|---|---|---|
| `CITIZEN` | Yes | Default role on register if none supplied |
| `TOURIST` | Yes | |
| `VENDOR` | Yes | Marketplace seller |
| `ORGANISER` | Yes | Event creator |
| `HOST` | Yes | Stays property host |
| `DRIVER` | No | Granted via driver/rider onboarding flow, not self-registerable |
| `CREATIVE` | No | Studio content creator |
| `TOUR_GUIDE` | No | Tour guide onboarding |
| `LGA_ADMIN` | No | Local government admin |
| `STATE_ADMIN` | No | State-level admin |
| `SUPER_ADMIN` | No | Platform super-admin |
| `MINISTRY_VIEWER` | No | Read-only ministry analytics access |

Roles not in `REGISTERABLE_ROLES` cannot be set via `POST /auth/register`'s `role` field —
`AuthService.register` throws `400 Bad Request` if attempted (`auth.service.ts`, marked
`L-01`).

### Auth endpoints (`/auth`, `backend/src/modules/auth/auth.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Create account. Requires `ndpaConsent: true` (NDPA compliance). Returns `user` + `accessToken` + `refreshToken`. |
| POST | `/auth/login` | None | Login with `identifier` (email or phone) + `password`. |
| POST | `/auth/otp/send` | None | Send a 6-digit OTP to a phone number (5-minute TTL, 3-attempt lockout for 15 minutes). |
| POST | `/auth/otp/verify` | None | Verify a previously sent OTP. |
| POST | `/auth/phone-auth` | None | Verify OTP and sign in, auto-registering a `CITIZEN` account if the phone number is new. |
| POST | `/auth/refresh` | None (body: `refreshToken`) | Rotate refresh token; returns a new access + refresh token pair. |
| POST | `/auth/logout` | Bearer | Blacklists the supplied refresh token. |

**Example — register:**

```json
POST /api/v1/auth/register
{
  "email": "amaka@example.com",
  "phone": "+2348012345678",
  "password": "StrongPass1",
  "firstName": "Amaka",
  "lastName": "Okafor",
  "role": "CITIZEN",
  "ndpaConsent": true
}
```

```json
201 Created
{
  "user": { "id": "...", "email": "amaka@example.com", "phone": "+2348012345678", "role": "CITIZEN", "...": "..." },
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi..."
}
```

## Endpoints overview

All paths are relative to `/api/v1`. "Auth" column: `-` = public, `Bearer` = any
authenticated user, or a specific `UserRole` (guarded by `RolesGuard`).

### Users & KYC (`/users`, `backend/src/modules/users/users.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | Bearer | Current user profile |
| GET | `/users/me/bookmarks` | Bearer | Bookmarked attractions |
| PATCH | `/users/me/role` | Bearer | Switch active role among the user's `registeredRoles` |
| PATCH | `/users/me/otp-channel` | Bearer | Set preferred OTP delivery channel (SMS/WhatsApp) |
| POST | `/users/me/become-host` | Bearer | Add `HOST` to `registeredRoles` |
| POST | `/users/me/become-guide` | Bearer | Add `TOUR_GUIDE` to `registeredRoles` |
| POST | `/users/me/avatar` | Bearer | Upload profile avatar (multipart) |
| DELETE | `/users/me/data` | Bearer | NDPA right-to-erasure request |
| PATCH | `/users/me` | Bearer | Update profile fields |
| POST | `/users/kyc/bvn` | Bearer | Submit BVN for KYC tier upgrade |
| POST | `/users/kyc/nin` | Bearer | Submit NIN for KYC tier upgrade |
| POST | `/users/kyc/smile/complete` | Bearer | Complete Smile ID biometric KYC step |
| GET | `/users/:id` | Bearer | Public profile lookup by ID |

### Wallet (`/wallet`, `backend/src/modules/wallet/wallet.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/wallet/balance` | Bearer | Balance, KYC tier, daily limit |
| GET | `/wallet/transactions` | Bearer | Cursor-paginated history; query: `cursor`, `limit`, `type` (`CREDIT`\|`DEBIT`\|`REFUND`\|`TRANSFER`), `module`, `date_from`, `date_to` |
| POST | `/wallet/topup` | Bearer | Initiate Paystack top-up; CBN daily limits enforced by KYC tier |
| POST | `/wallet/transfer` | Bearer | Transfer balance to another user by phone; requires client-supplied `idempotencyKey` |
| GET | `/wallet/resolve-recipient` | Bearer | Resolve a phone number to a display name before transfer |

Wallet debits use `SELECT FOR UPDATE` row locking (`WalletService`) to prevent concurrent
double-spends, and every mutating call requires an idempotency key derived either from a
client-supplied value (`transfer`) or a Paystack reference (`topup`) — see
`backend/src/modules/wallet/wallet.service.ts` (and `CLAUDE.md`) for the reference format
conventions (`ISY-FUND-...`, `ISY-TRF-...`, etc.).

**Example — top-up:**

```json
POST /api/v1/wallet/topup
{ "amount": 5000, "email": "amaka@example.com" }
```

```json
201 Created
{ "authorizationUrl": "https://checkout.paystack.com/...", "reference": "ISY-FUND-AB12CD34EF56" }
```

### Tourism & LGAs

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/attractions` | - | List attractions (filter by category/LGA) |
| GET | `/attractions/bookmarks` | Bearer | Current user's bookmarked attractions |
| GET | `/attractions/:id` | - | Attraction detail |
| POST | `/attractions/:id/bookmark` | Bearer | Bookmark/unbookmark an attraction |
| GET | `/lgas` | - | List Ogun State's 20 LGAs |
| GET | `/lgas/:slug` | - | LGA detail |
| GET | `/lgas/:slug/attractions` | - | Attractions within an LGA |

### Events & tickets (`backend/src/modules/events/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/events` | - | List events |
| GET | `/events/tickets/mine` | Bearer | Current user's purchased tickets |
| GET | `/events/:id` | - | Event detail |
| POST | `/events` | `ORGANISER` | Create event |
| PATCH | `/events/:id` | `ORGANISER` | Update event |
| DELETE | `/events/:id` | `ORGANISER` | Delete event |
| POST | `/events/:id/images` | `ORGANISER` | Upload event image (multipart, 5MB limit) |
| POST | `/events/:id/purchase` | Bearer | Purchase ticket — initiates Paystack payment, creates a `PENDING` ticket |
| GET | `/events/:id/analytics` | `ORGANISER` | Ticket sales analytics for the organiser's event |
| POST | `/tickets/:qr_hash/checkin` | `ORGANISER` | Check in a ticket by scanning its QR hash |

### Stays / accommodation (`backend/src/modules/stays/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/properties` | - | List properties |
| GET | `/properties/:id` | - | Property detail |
| POST | `/properties` | `HOST` | Create property listing |
| PATCH | `/properties/:id` | `HOST` | Update property |
| POST | `/properties/:id/images` | `HOST` | Upload property images (multipart) |
| GET | `/properties/:id/availability` | - | Available date ranges |
| POST | `/properties/:id/bookings` | Bearer | Create escrow booking — uses `SELECT FOR UPDATE` to prevent double-booking |
| POST | `/properties/:id/memberships` | Bearer | Purchase a recurring stay membership |
| GET | `/bookings/mine` | Bearer | Current user's bookings |
| POST | `/bookings/:id/review` | Bearer | Leave a review after a completed stay |
| GET | `/memberships/mine` | Bearer | Current user's memberships |
| PATCH | `/memberships/:id/cancel` | Bearer | Cancel a membership |

### Marketplace (`backend/src/modules/marketplace/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/vendors` | Bearer | Vendor onboarding request |
| GET | `/products` | - | List products |
| GET | `/products/:id` | - | Product detail |
| POST | `/products` | `VENDOR` | Create product |
| PATCH | `/products/:id` | `VENDOR` | Update product |
| DELETE | `/products/:id` | `VENDOR` | Delete product |
| GET | `/orders/mine` | Bearer | Current user's orders |
| POST | `/orders` | Bearer | Create order — initiates Paystack payment |
| PATCH | `/orders/:id/status` | `VENDOR` | Update order fulfilment status |
| PATCH | `/admin/vendors/:id/approve` | `LGA_ADMIN`, `SUPER_ADMIN` | Approve/reject vendor onboarding |

### Studio (`/studio`, `backend/src/modules/studio/studio.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/studio/slots` | - | Available studio booking slots |
| POST | `/studio/bookings` | Bearer | Book a studio slot |
| POST | `/studio/content/upload` | `CREATIVE` | Upload creative content (multipart) |
| PATCH | `/studio/content/:id/publish` | `CREATIVE` | Publish uploaded content |
| GET | `/studio/feed` | - | Public content feed |

### Transport / ride-hailing (`/transport`, `backend/src/modules/transport/transport.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/transport/fare-estimate` | - | Estimated fare for a route |
| GET | `/transport/drivers/me` | Bearer | Current driver profile |
| POST | `/transport/drivers` | `DRIVER` | Driver onboarding |
| POST | `/transport/drivers/:id/vehicles` | `DRIVER` | Register a vehicle |
| PATCH | `/transport/drivers/:id/approve` | `LGA_ADMIN` | Approve driver onboarding |
| POST | `/transport/go-online` / `/transport/go-offline` | `DRIVER` | Toggle driver availability |
| GET | `/transport/drivers/earnings` | `DRIVER` | Driver earnings summary |
| GET | `/transport/trips/me` | Bearer | Current user's trips |
| POST | `/transport/trips` | `CITIZEN`, `TOURIST` | Request a trip — matched to a driver within 60s (real-time GPS via WebSocket) |
| PATCH | `/transport/trips/:id/accept` \| `/decline` \| `/arrive` \| `/start` \| `/complete` | `DRIVER` | Trip lifecycle transitions |
| PATCH | `/transport/trips/:id/cancel` | `CITIZEN`, `TOURIST`, `DRIVER` | Cancel a trip |

Real-time driver location updates are pushed over a WebSocket gateway
(`backend/src/modules/transport/transport.gateway.ts`), not via REST polling.

### Delivery (`/delivery`, `backend/src/modules/delivery/delivery.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/delivery/fee-estimate` | - | Estimated delivery fee |
| GET | `/delivery/riders/me` | Bearer | Current rider profile |
| POST | `/delivery/riders` | `DRIVER` | Rider onboarding |
| PATCH | `/delivery/riders/:id/approve` | `LGA_ADMIN` | Approve rider onboarding |
| POST | `/delivery/go-online` / `/delivery/go-offline` | `DRIVER` | Toggle rider availability |
| GET | `/delivery/riders/earnings` | `DRIVER` | Rider earnings summary |
| POST | `/delivery/orders` | `CITIZEN`, `TOURIST` | Create a delivery order |
| PATCH | `/delivery/orders/:id/accept` \| `/decline` \| `/collect` \| `/depart` \| `/complete` | `DRIVER` | Delivery lifecycle transitions |
| POST | `/delivery/orders/:id/verify-otp` | `DRIVER` | Verify drop-off OTP with recipient |
| POST | `/delivery/orders/:id/resend-otp` | `DRIVER` | Resend drop-off OTP |
| PATCH | `/delivery/orders/:id/rate` | Bearer | Rate a completed delivery |
| PATCH | `/delivery/orders/:id/cancel` | `CITIZEN`, `TOURIST`, `DRIVER` | Cancel a delivery order |

Real-time delivery tracking uses a WebSocket gateway
(`backend/src/modules/delivery/delivery.gateway.ts`); drop-off OTP verification is served
via an extracted `delivery-otp` gRPC microservice behind a facade module.

### Tour guides, packages & bookings

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tour-guides` | - | List tour guides |
| GET | `/tour-guides/me` | `TOUR_GUIDE` | Current guide profile |
| POST | `/tour-guides/me/kyc` | `TOUR_GUIDE` | Submit guide KYC |
| PATCH | `/tour-guides/me/availability` | `TOUR_GUIDE` | Update availability calendar |
| POST | `/tour-guides` | `TOUR_GUIDE` | Create guide profile |
| GET | `/tour-guides/:id` | - | Guide detail |
| GET | `/admin/tour-guides/queue` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Pending guide approval queue |
| POST | `/admin/tour-guides/:id/approve` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Approve/reject a guide |
| GET | `/tour-packages` | - | List published tour packages |
| GET | `/tour-packages/me` | Bearer | Current guide's packages |
| GET | `/tour-packages/:slug` | - | Package detail |
| POST | `/tour-packages` | `TOUR_GUIDE` | Create package (draft) |
| POST | `/tour-packages/from-ai-suggestion` | Bearer | Create a package pre-filled from an AI itinerary suggestion |
| PATCH | `/tour-packages/:id` | `TOUR_GUIDE` | Update package |
| POST | `/tour-packages/:id/submit` | `TOUR_GUIDE` | Submit package for admin review |
| DELETE | `/tour-packages/:id` | `TOUR_GUIDE` | Delete package |
| GET | `/admin/tour-packages/queue` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Pending package review queue |
| POST | `/admin/tour-packages/:id/decide` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Approve/reject a package |
| POST | `/tour-bookings` | Bearer | Book a tour package |
| POST | `/tour-bookings/:id/join` | Bearer | Join a group tour booking |
| POST | `/tour-bookings/:id/close` | Bearer | Close a group booking to new joiners |
| GET | `/tour-bookings/me` | Bearer | Current user's tour bookings |
| GET | `/tour-bookings/quote` | Bearer | Price quote for a booking |
| GET | `/tour-bookings/:id` | Bearer | Booking detail |
| POST | `/tour-bookings/:id/cancel` | Bearer | Cancel a tour booking |
| GET | `/admin/tours/revenue` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Tour revenue report |
| GET | `/admin/tours/utilization` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Guide/package utilization report |

### Reviews (`backend/src/modules/reviews/reviews.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/reviews` | Bearer | Submit a review |
| GET | `/reviews` | - | List reviews (filterable) |
| GET | `/admin/reviews/queue` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Flagged review moderation queue |
| GET | `/admin/reviews/flags/:id` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Flag detail |
| POST | `/admin/reviews/flags/:id/resolve` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Resolve a flagged review |

### News (`backend/src/modules/news/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/news` | - | Public news feed |
| GET | `/admin/news` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | List news items (admin) |
| POST | `/admin/news` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Create news item |
| PATCH | `/admin/news/:id` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Update news item |
| DELETE | `/admin/news/:id` | `LGA_ADMIN`, `STATE_ADMIN`, `SUPER_ADMIN` | Delete news item |

### Notifications (`/notifications`, `backend/src/modules/notifications/notifications.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | Bearer | List current user's notifications |
| POST | `/notifications/register-token` | Bearer | Register an FCM push token |
| POST | `/notifications/send` | Bearer | Send a notification (internal/admin use) |
| PATCH | `/notifications/:id/read` | Bearer | Mark one notification read |
| PATCH | `/notifications/read-all` | Bearer | Mark all notifications read |

### AI (`/ai`, `backend/src/modules/ai/ai.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/ai/chat` | Bearer | Streaming chat completion (Claude, SSE) |
| POST | `/ai/recommend` | Bearer | Attraction/event recommendations |
| POST | `/ai/itinerary` | Bearer | Streaming AI-generated trip itinerary (SSE) |
| POST | `/ai/lga-intel` | Bearer | LGA-level insight generation |

### Waitlist (`/waitlist`, `backend/src/modules/waitlist/waitlist.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/waitlist` | - | Join the public pre-launch waitlist |
| GET | `/waitlist/stats` | `SUPER_ADMIN`, `STATE_ADMIN` | Waitlist signup statistics |

### Admin (`/admin`, `backend/src/modules/admin/admin.controller.ts`)

All routes require `SUPER_ADMIN` or `LGA_ADMIN` at minimum (class-level guard); individual
routes may further restrict to `SUPER_ADMIN` only.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/dashboard` | `LGA_ADMIN`, `SUPER_ADMIN` | Aggregate KPI dashboard |
| GET | `/admin/revenue` | `SUPER_ADMIN` | Platform-wide revenue analytics |
| GET | `/admin/users` | `LGA_ADMIN`, `SUPER_ADMIN` | List/filter users |
| PATCH | `/admin/users/:id/status` | `LGA_ADMIN`, `SUPER_ADMIN` | Suspend/reactivate a user |
| GET | `/admin/vendors` | `LGA_ADMIN`, `SUPER_ADMIN` | List vendors |
| PATCH | `/admin/vendors/:id/status` | `LGA_ADMIN`, `SUPER_ADMIN` | Update vendor status |
| GET | `/admin/properties` | `LGA_ADMIN`, `SUPER_ADMIN` | List stays properties |
| GET | `/admin/studio/slots` | `LGA_ADMIN`, `SUPER_ADMIN` | List studio slots |
| PATCH | `/admin/studio/slots/:id` | `LGA_ADMIN`, `SUPER_ADMIN` | Update a studio slot |
| GET | `/admin/config` | `LGA_ADMIN`, `SUPER_ADMIN` | Read platform config (`platformConfig` table) |
| PATCH | `/admin/config/:key` | `LGA_ADMIN`, `SUPER_ADMIN` | Update a platform config value (e.g. platform fee — never hardcoded) |
| GET | `/admin/settlement-splits` | `SUPER_ADMIN` | List vendor/host settlement split rules |
| POST | `/admin/settlement-splits` | `SUPER_ADMIN` | Create a settlement split rule |
| PATCH | `/admin/settlement-splits/:id` | `SUPER_ADMIN` | Update a settlement split rule |
| GET \| POST \| PATCH \| DELETE | `/admin/ministry-export-subscriptions` | `SUPER_ADMIN` | Manage scheduled ministry data-export subscriptions |
| POST | `/admin/settlement-disputes` | `SUPER_ADMIN` | File a settlement dispute |
| GET | `/admin/settlement-disputes/queue` | `SUPER_ADMIN` | Dispute review queue |
| GET | `/admin/settlement-disputes/:id` | `SUPER_ADMIN` | Dispute detail |
| POST | `/admin/settlement-disputes/:id/review` \| `/resolve` \| `/dismiss` | `SUPER_ADMIN` | Dispute lifecycle actions |

### Ministry analytics (`/ministry`, `backend/src/modules/ministry/ministry.controller.ts`)

Class-level guard requires `MINISTRY_VIEWER`, `STATE_ADMIN`, or `SUPER_ADMIN`.

| Method | Path | Description |
|---|---|---|
| GET | `/ministry/visitor-entries` | Visitor entry counts by LGA/attraction |
| GET | `/ministry/purpose-breakdown` | Visit-purpose breakdown |
| GET | `/ministry/revenue` | Government revenue analytics |
| GET | `/ministry/visitor-entries/export` | CSV/Excel export of visitor entries |
| GET | `/ministry/purpose-breakdown/export` | CSV/Excel export of purpose breakdown |
| GET | `/ministry/revenue/export` | CSV/Excel export of revenue data |

### Webhooks (`/webhooks`, `backend/src/modules/webhooks/webhooks.controller.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/paystack` | HMAC-SHA512 signature (`x-paystack-signature` header, verified against `PAYSTACK_WEBHOOK_SECRET`) | Paystack payment event ingestion |
| POST | `/webhooks/flutterwave` | Shared-secret header (`verif-hash`, compared against `FLUTTERWAVE_SECRET_KEY`) | Flutterwave payment event ingestion |

Webhook events are dispatched internally via `EventEmitter2` to `@OnEvent('payment.{type}')`
handlers in the relevant feature service (e.g. `payment.ticket_purchase`,
`payment.stay_booking`, `payment.order_payment`, `payment.studio_booking`). Both webhook
endpoints always return `200 { "received": true }` regardless of internal processing
outcome, per standard webhook conventions — check server logs / admin dashboards for
processing failures, not the HTTP response.

## Request/response formats

- All request bodies are validated with `class-validator` DTOs through a global
  `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`
  (`backend/src/main.ts`) — unknown fields are stripped, and requests with invalid or
  unknown fields are rejected with `400 Bad Request`.
- Successful responses return the created/updated resource (or a domain-specific payload,
  e.g. `{ authorizationUrl, reference }` for payment-initiating endpoints) as JSON, with no
  common envelope wrapper.
- Paginated list endpoints (e.g. `GET /wallet/transactions`) use cursor-based pagination
  via `cursor` and `limit` query parameters rather than page numbers.
- File uploads (`POST /events/:id/images`, `/properties/:id/images`,
  `/studio/content/upload`, `/users/me/avatar`) use `multipart/form-data` with Multer's
  `FileInterceptor('file')`; images are stored via `S3Service` to AWS S3 / CloudFront.

## Error handling

The API relies on NestJS's default exception-to-HTTP mapping. Services throw typed
exceptions (`NotFoundException`, `BadRequestException`, `ConflictException`,
`ForbiddenException`, `UnauthorizedException`) which NestJS serializes as:

```json
{
  "statusCode": 400,
  "message": "Insufficient wallet balance",
  "error": "Bad Request"
}
```

`class-validator` failures return an array of messages in the `message` field instead of a
single string.

| Status | Meaning | Example |
|---|---|---|
| `400 Bad Request` | Validation failure or business-rule violation (e.g. insufficient wallet balance, self-transfer attempt) | `wallet.service.ts` |
| `401 Unauthorized` | Missing/invalid/expired JWT, or invalid login credentials | `JwtAuthGuard`, `AuthService.login` |
| `403 Forbidden` | Authenticated but role does not match `@Roles(...)`, or OTP attempts locked | `RolesGuard`, `AuthService.sendOtp` |
| `404 Not Found` | Resource does not exist (user, wallet, property, etc.) | throughout feature services |
| `409 Conflict` | Duplicate registration (email/phone already exists) | `AuthService.register` |
| `429 Too Many Requests` | Global rate limit exceeded (see below) | `ThrottlerModule` |
| `503 Service Unavailable` | An extracted gRPC microservice (notifications, news, waitlist, reviews, delivery-otp) is unreachable and its circuit breaker is open | `ResilienceService` |

## Rate limits

A global rate limit is applied to every route via `ThrottlerModule.forRoot([{ ttl: 60_000,
limit: 100 }])` (`backend/src/app.module.ts`): **100 requests per 60 seconds** per client,
enforced by `@nestjs/throttler`'s default guard. No per-route overrides
(`@Throttle`/`@SkipThrottle`) were found in the codebase, so this limit applies uniformly
across all endpoints, including public ones.

OTP endpoints have an additional application-level limit independent of the global
throttler: **3 verification attempts** per phone number before a **15-minute lockout**
(`OTP_MAX_ATTEMPTS`, `OTP_LOCK_TTL` in `backend/src/modules/auth/auth.service.ts`).

<!-- VERIFY: whether a CDN/API gateway (e.g. Cloudflare) applies additional rate limiting in front of the deployed API -->
