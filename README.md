# Iṣẹ́yáá — Ogun State Digital Super-Platform

> The unified digital platform for all 20 LGAs of Ogun State. Tourism, events, stays, marketplace, studio booking, wallet, and government services in a single system.

## Architecture

```
ISEYAA/
├── backend/          NestJS API (TypeScript, Prisma, PostgreSQL 16, Redis)
├── web/              Next.js 14 frontend (App Router, Tailwind, Framer Motion)
└── mobile/           Expo SDK 51 React Native app
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7
- AWS S3 (or compatible)
- Paystack account
- SendGrid account

## Local Setup

### 1. Clone and install

```bash
git clone <repo>
cd ISEYAA
npm install -g pnpm   # optional

# Backend
cd backend && npm install

# Web
cd ../web && npm install

# Mobile
cd ../mobile && npm install
```

### 2. Environment variables

Copy and fill in each `.env`:

**`backend/.env`**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/iseyaa"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN="7d"
PAYSTACK_SECRET_KEY="sk_test_..."
PAYSTACK_WEBHOOK_SECRET="whsec_..."
AWS_REGION="eu-west-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
S3_BUCKET_NAME="iseyaa-media"
CDN_BASE_URL="https://cdn.iseyaa.gov.ng"
SENDGRID_API_KEY="SG...."
SENDGRID_FROM_EMAIL="noreply@iseyaa.gov.ng"
APP_URL="http://localhost:3001"
PORT=3001
NODE_ENV="development"
```

**`web/.env.local`**
```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api/v1"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-in-production"
NEXT_PUBLIC_GOOGLE_MAPS_KEY="AIza..."
```

**`mobile/.env`**
```env
EXPO_PUBLIC_API_URL="http://localhost:3001/api/v1"
```

### 3. Database setup

```bash
cd backend
npx prisma db push          # creates all tables (idempotent)
npx prisma db seed          # optional: seed LGAs + test data
```

### 4. Start services

```bash
# Terminal 1 — Backend API
cd backend && npm run start:dev

# Terminal 2 — Web frontend
cd web && npm run dev

# Terminal 3 — Mobile (needs Expo Go on phone or emulator)
cd mobile && npm start
```

- Backend: http://localhost:3001
- Swagger UI: http://localhost:3001/api/docs
- Web: http://localhost:3000
- Mobile: scan QR with Expo Go

## API Overview

All routes are prefixed with `/api/v1`.

| Module | Key Routes |
|--------|-----------|
| Auth | `POST /auth/register` `POST /auth/login` |
| Tourism | `GET /tourism/lgas` `GET /tourism/attractions` |
| Events | `GET /events` `POST /events` `POST /events/:id/tickets` |
| Tickets | `POST /tickets/:qr_hash/checkin` |
| Stays | `GET /stays/properties` `POST /stays/properties/:id/bookings` |
| Marketplace | `GET /marketplace/products` `POST /marketplace/orders` |
| Studio | `GET /studio/slots` `POST /studio/bookings` `GET /studio/feed` |
| Wallet | `GET /wallet/balance` `GET /wallet/transactions` `POST /wallet/topup` |
| Admin | `GET /admin/dashboard` `GET /admin/revenue` |
| Webhooks | `POST /webhooks/paystack` |

Full OpenAPI spec: http://localhost:3001/api/docs (Swagger UI)

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `SELECT FOR UPDATE` via `prisma.$transaction + $queryRaw` | Prevents concurrent double-bookings in stays and studio modules |
| `EventEmitter2` for payment events | Decouples WebhooksService from feature modules — no circular imports |
| `rawBody: true` in NestFactory | Required for Paystack HMAC-SHA512 webhook signature verification |
| `prisma db push` over `migrate dev` | Non-interactive Windows environment; `migrate dev` requires a TTY |
| CBN KYC tiers in wallet | Regulatory compliance: Tier 1 (phone) = ₦50K/day, Tier 2 (NIN/BVN) = ₦500K/day |
| Platform fee from `platform_config` table | Fee % is never hardcoded — ops team can update via admin panel without deployment |
| `@Global()` CommonModule | PaystackService, S3Service, SendgridService, QrService, ImageService provided once |
| Framer Motion page transitions | Consistent animated entry for all Next.js pages |
| AsyncStorage for offline cache | Attractions and bookmarks survive network loss on mobile |

## Running Tests

```bash
cd backend && npm test              # 153 tests, 11 suites
cd backend && npm run test:cov      # coverage report
```

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set all secrets (JWT_SECRET, PAYSTACK_*, AWS_*, SENDGRID_*) in environment
- [ ] Set `NEXTAUTH_SECRET` to a 32+ char random string
- [ ] Run `npx prisma db push` against production DB
- [ ] Configure Paystack webhook URL: `https://api.iseyaa.gov.ng/api/v1/webhooks/paystack`
- [ ] Set Paystack `PAYSTACK_WEBHOOK_SECRET` to match your Paystack dashboard secret
- [ ] Configure S3 bucket CORS policy for frontend uploads
- [ ] Set `CDN_BASE_URL` to CloudFront distribution domain
- [ ] Enable Redis persistence (`appendonly yes`) for cron job state
- [ ] Set up DB backups (pg_dump daily minimum)
- [ ] Configure rate limiting on `/auth` routes in nginx/API gateway

## Module Reference

### EventsModule
- `ORGANISER` role creates and manages events
- Ticket purchase → Paystack → `charge.success` webhook → QR PNG → S3 → SendGrid email
- HMAC-SHA512 webhook verification before any processing
- Check-in: `POST /tickets/:qr_hash/checkin` → `VALID` | `ALREADY_USED` | `NOT_FOUND`
- Event cover images resized to 1200×630 JPEG 85% via Sharp

### StaysModule
- `HOST` role CRUD for properties
- 90-day availability calendar via `SELECT FOR UPDATE` transaction
- Escrow: host payout held until 24h after check-in (`@Cron(EVERY_HOUR)`)
- Reviews: unlocked 24h after check-out, rating 1–5

### MarketplaceModule
- Vendors apply → `LGA_ADMIN`/`SUPER_ADMIN` approve
- Fee split read from `platform_config` key `PLATFORM_FEE_PCT` (never hardcoded)
- Order lifecycle: `PENDING → PROCESSING → SHIPPED → DELIVERED`
- Email notifications to buyer + vendor on every status transition

### StudioModule
- Government priority slots: visible to `LGA_ADMIN`/`SUPER_ADMIN` only
- Booking uses `SELECT FOR UPDATE` row lock to prevent double-booking
- Confirmed booking triggers prep checklist email (5 items) via SendGrid
- Creative uploads: audio (mp3/wav/aac/flac) + video (mp4/mov/avi/webm) up to 500MB
- Published content feeds back via `GET /studio/feed`

### WalletModule
- CBN KYC Tier 1 (phone): ₦50,000/day; Tier 2 (NIN/BVN): ₦500,000/day
- Topup via Paystack; webhook credits wallet + creates Transaction record
- Cursor-paginated transaction history with type/module/date filters
- Escrow balance = sum of CONFIRMED stays not yet released

### AdminModule
- Dashboard: total_users, DAU, total_revenue, active_events, pending_approvals, wallet_GTV
- Revenue breakdown: govt_levy by LGA, by vendor category, by month
- User/vendor/property/studio-slot management
- Platform config CRUD (including PLATFORM_FEE_PCT)
