# Codebase Structure

**Analysis Date:** 2026-05-12

## Directory Layout

```
ISEYAA/                          # Monorepo root (npm workspaces)
├── package.json                 # Root workspace config; scripts: dev:backend, dev:web, prisma:*
├── docker-compose.yml           # Local infra (Postgres + Redis)
├── backend/                     # NestJS modular monolith
│   ├── prisma/
│   │   ├── schema.prisma        # Single source of truth for DB schema + enums
│   │   ├── migrations/          # Prisma migration history
│   │   └── seed.ts              # Development seed data
│   ├── src/
│   │   ├── main.ts              # NestJS bootstrap (helmet, CORS, ValidationPipe, Swagger)
│   │   ├── app.module.ts        # Root module; imports all feature modules
│   │   ├── prisma/              # Global PrismaService
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── redis/               # ioredis wrapper service
│   │   │   ├── redis.module.ts
│   │   │   └── redis.service.ts
│   │   ├── common/              # @Global() shared infrastructure
│   │   │   ├── common.module.ts
│   │   │   ├── decorators/
│   │   │   │   ├── current-user.decorator.ts   # @CurrentUser() param decorator
│   │   │   │   └── roles.decorator.ts          # @Roles(...) metadata decorator
│   │   │   ├── enums/
│   │   │   │   └── user-role.enum.ts           # UserRole enum + REGISTERABLE_ROLES
│   │   │   ├── guards/
│   │   │   │   └── roles.guard.ts              # RolesGuard (checks @Roles metadata)
│   │   │   └── services/
│   │   │       ├── paystack.service.ts         # Paystack payment initiation
│   │   │       ├── s3.service.ts               # AWS S3 upload (af-south-1 / CloudFront)
│   │   │       ├── sendgrid.service.ts         # Email via SendGrid
│   │   │       ├── qr.service.ts               # QR code generation
│   │   │       └── image.service.ts            # Image processing
│   │   └── modules/             # Feature modules
│   │       ├── auth/            # JWT auth, OTP phone verification, refresh/logout
│   │       │   ├── auth.module.ts
│   │       │   ├── auth.controller.ts
│   │       │   ├── auth.service.ts
│   │       │   ├── dto/         # register, login, otp-send, otp-verify, refresh, logout
│   │       │   ├── guards/
│   │       │   │   └── jwt-auth.guard.ts
│   │       │   ├── strategies/
│   │       │   │   └── jwt.strategy.ts
│   │       │   └── __tests__/
│   │       ├── users/           # User profiles, KYC (NIN/BVN), role management
│   │       ├── lgas/            # 20 Ogun State LGAs + attractions reference data
│   │       ├── tourism/         # Tourism attractions CRUD
│   │       ├── events/          # Events lifecycle + ticket purchase/QR checkin
│   │       │   ├── events.controller.ts
│   │       │   ├── tickets.controller.ts   # Separate controller for /tickets routes
│   │       │   └── events.service.ts       # @OnEvent('payment.ticket_purchase')
│   │       ├── stays/           # Property listings + bookings (escrow lifecycle)
│   │       │   ├── stays.controller.ts     # Property CRUD
│   │       │   └── stays.service.ts        # @OnEvent('payment.stay_booking')
│   │       ├── marketplace/     # Vendor onboarding, products, orders
│   │       │   └── marketplace.service.ts  # @OnEvent('payment.order_payment')
│   │       ├── studio/          # Recording studio bookings
│   │       │   └── studio.service.ts       # @OnEvent('payment.studio_booking')
│   │       ├── wallet/          # Balance, KYC tiers, Paystack top-up, ledger
│   │       ├── admin/           # Dashboard KPIs, revenue, approval queues
│   │       ├── notifications/   # FCM push notifications (Firebase)
│   │       ├── ai/              # Claude AI: chat stream, itinerary generator, LGA intel
│   │       └── webhooks/        # Paystack + Flutterwave webhook ingestion
├── web/                         # Next.js 14 App Router
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx           # Root layout (Providers wrapper)
│       │   ├── page.tsx             # Landing page (public)
│       │   ├── providers.tsx        # SessionProvider + QueryClientProvider + Toaster
│       │   ├── globals.css
│       │   ├── not-found.tsx
│       │   ├── global-error.tsx
│       │   ├── (auth)/              # Route group — unauthenticated pages
│       │   │   └── login/
│       │   ├── dashboard/           # Citizen dashboard (wallet, tickets, stays, orders)
│       │   ├── events/              # Events listing + detail
│       │   │   └── [id]/
│       │   ├── stays/               # Stays listing + detail
│       │   ├── marketplace/         # Marketplace listing
│       │   ├── studio/              # Studio booking
│       │   ├── admin/               # Admin panel (role-gated: SUPER_ADMIN / LGA_ADMIN)
│       │   └── api/
│       │       └── auth/            # NextAuth [...nextauth] route handler
│       ├── components/
│       │   ├── layout/
│       │   │   └── Navbar.tsx       # Site navigation bar
│       │   └── ui/
│       │       ├── OgunMap.tsx      # Animated SVG map of Ogun State LGAs
│       │       ├── PageTransition.tsx
│       │       └── RevenueChart.tsx # Recharts revenue chart (admin)
│       └── lib/
│           ├── api.ts               # axios instance + Bearer interceptor + fetcher()
│           └── auth.ts              # NextAuthOptions (CredentialsProvider config)
├── mobile/                      # Expo SDK 51
│   ├── app.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── app/
│   │   ├── _layout.tsx              # Root Stack navigator + QueryClientProvider
│   │   ├── (tabs)/                  # Bottom tab navigator
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx            # Explore tab (attractions + offline cache)
│   │   │   ├── events.tsx           # Events tab
│   │   │   ├── stays.tsx            # Stays tab
│   │   │   ├── studio.tsx           # Studio tab
│   │   │   └── profile.tsx          # Profile / auth tab
│   │   └── qr-checkin.tsx           # QR scanner modal (ticket check-in)
│   └── lib/
│       ├── api.ts                   # axios instance + expo-secure-store Bearer interceptor
│       └── storage.ts               # AsyncStorage: cache (1-hr TTL) + bookmarks
└── shared/                      # npm workspace: shared types/constants/DTOs
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts             # Re-exports types + constants + dtos
        ├── types/
        │   └── index.ts         # IUser, IEvent, IWallet, ITransaction, ILGA + enums
        ├── constants/
        │   └── index.ts         # APP_NAME, OGUN_LGA_NAMES, API_PREFIX, JWT constants
        └── dtos/
            └── index.ts         # Shared DTO definitions
```

## Directory Purposes

**`backend/src/modules/`:**
- Purpose: One directory per domain feature; fully self-contained
- Contains: `[name].module.ts`, `[name].controller.ts`, `[name].service.ts`, `dto/`, `__tests__/`
- Key files: Each module follows identical structure; no variation

**`backend/src/common/`:**
- Purpose: Cross-cutting infrastructure shared by all modules
- Contains: Guards, decorators, enums, shared services
- Key files: `common.module.ts` (global export), `services/paystack.service.ts`, `guards/roles.guard.ts`

**`backend/src/prisma/`:**
- Purpose: Database client singleton
- Contains: `PrismaService extends PrismaClient`
- Key files: `prisma.service.ts`, `../prisma/schema.prisma`

**`backend/src/redis/`:**
- Purpose: Cache/ephemeral store for auth state
- Contains: ioredis wrapper with typed `get/set/del/exists/ttl/incr/expire` methods
- Key files: `redis.service.ts`

**`web/src/app/`:**
- Purpose: Next.js 14 App Router file-system routes
- Contains: Route segments as directories; all pages are `'use client'` components
- Key files: `layout.tsx`, `providers.tsx`, `page.tsx` (landing), `dashboard/page.tsx`

**`web/src/lib/`:**
- Purpose: Client-side infrastructure helpers
- Contains: `api.ts` (axios + interceptor), `auth.ts` (NextAuth options)

**`mobile/app/(tabs)/`:**
- Purpose: Bottom tab screens for main app navigation
- Contains: `index.tsx` (Explore), `events.tsx`, `stays.tsx`, `studio.tsx`, `profile.tsx`

**`mobile/lib/`:**
- Purpose: Mobile infrastructure helpers
- Contains: `api.ts` (axios + SecureStore interceptor), `storage.ts` (AsyncStorage cache)

**`shared/src/`:**
- Purpose: Type-safe contract between backend and clients
- Contains: TypeScript interfaces, enums, and constants
- Key files: `types/index.ts`, `constants/index.ts`

## Key File Locations

**Entry Points:**
- `backend/src/main.ts`: NestJS server bootstrap
- `web/src/app/layout.tsx`: Next.js root layout
- `web/src/app/page.tsx`: Landing page
- `mobile/app/_layout.tsx`: Expo root navigator

**Configuration:**
- `backend/prisma/schema.prisma`: Database schema and enums
- `web/next.config.js`: Next.js build config
- `web/tailwind.config.ts`: Tailwind CSS customisation
- `mobile/app.json`: Expo app config

**Core Logic:**
- `backend/src/app.module.ts`: Root module composition
- `backend/src/modules/auth/auth.service.ts`: Auth business logic
- `backend/src/modules/wallet/wallet.service.ts`: Wallet + KYC tiers
- `backend/src/modules/webhooks/webhooks.service.ts`: Payment webhook router
- `backend/src/modules/ai/ai.service.ts`: Claude AI integration
- `web/src/lib/api.ts`: Web API client
- `mobile/lib/api.ts`: Mobile API client
- `mobile/lib/storage.ts`: Offline cache + bookmarks

**Testing:**
- `backend/src/modules/*/  __tests__/`: Unit tests co-located per module
- `backend/jest.config.js`: Jest configuration

## Naming Conventions

**Backend files:**
- Modules: `[domain].module.ts` (e.g., `wallet.module.ts`)
- Controllers: `[domain].controller.ts`; when a module has two controllers: `[domain].controller.ts` + `[resource].controller.ts` (e.g., `tickets.controller.ts` inside events, `stays.controller.ts` + secondary in stays)
- Services: `[domain].service.ts`
- DTOs: `[verb]-[domain].dto.ts` (e.g., `create-event.dto.ts`, `purchase-ticket.dto.ts`)

**Frontend files:**
- Next.js pages: `page.tsx` (App Router convention)
- Next.js layouts: `layout.tsx`
- React components: PascalCase (e.g., `Navbar.tsx`, `OgunMap.tsx`)
- Utility modules: camelCase (e.g., `api.ts`, `auth.ts`, `storage.ts`)

**Directories:**
- Backend modules: lowercase domain name (e.g., `auth/`, `marketplace/`)
- Next.js route groups: parentheses notation (e.g., `(auth)/`)
- Next.js dynamic routes: `[id]/` bracket notation
- Mobile tab group: `(tabs)/`

## Where to Add New Code

**New Backend Feature Module:**
1. Create directory: `backend/src/modules/[feature]/`
2. Add `[feature].module.ts`, `[feature].controller.ts`, `[feature].service.ts`
3. Add `dto/` subdirectory for request/response DTOs
4. Add `__tests__/` for unit tests
5. Import and add module to `backend/src/app.module.ts` imports array
6. Services can inject `PrismaService` and `CommonModule` services directly (global)

**New API Endpoint:**
- Add handler in `backend/src/modules/[feature]/[feature].controller.ts`
- Add business logic in `backend/src/modules/[feature]/[feature].service.ts`
- Create DTO in `backend/src/modules/[feature]/dto/`
- Guard with `@UseGuards(JwtAuthGuard)` and `@Roles(UserRole.X)` as needed

**New Web Page:**
- Create directory: `web/src/app/[route]/`
- Add `page.tsx` with `'use client'` directive
- Fetch data via `useQuery({ queryFn: () => fetcher('/endpoint') })`
- Use `useSession()` for auth state; redirect to `/login` if unauthenticated

**New Web Component:**
- Shared UI elements: `web/src/components/ui/[ComponentName].tsx`
- Layout elements: `web/src/components/layout/[ComponentName].tsx`

**New Mobile Screen:**
- Tab screen: `mobile/app/(tabs)/[name].tsx`
- Detail/modal screen: `mobile/app/[domain]/[id].tsx`
- Register in `mobile/app/_layout.tsx` Stack screens if needed

**New Shared Type:**
- Add interface to `shared/src/types/index.ts`
- Add constant to `shared/src/constants/index.ts`
- Import in web/mobile via the `shared` package

**New Payment Flow:**
1. Add Paystack initiation in the feature service (follow `WalletService.initiateTopup()` pattern)
2. Add `metadata.type: '[new_type]'` to Paystack metadata
3. Add `case '[new_type]':` in `backend/src/modules/webhooks/webhooks.service.ts:30-57`
4. Add `this.eventEmitter.emit('payment.[new_type]', payload)`
5. Add `@OnEvent('payment.[new_type]')` handler in the target feature service

## Special Directories

**`backend/prisma/migrations/`:**
- Purpose: Prisma migration SQL files
- Generated: Yes (by `prisma migrate dev`)
- Committed: Yes (migration history must be committed)

**`backend/dist/`:**
- Purpose: Compiled NestJS output
- Generated: Yes (by `nest build`)
- Committed: No

**`backend/node_modules/`, `web/node_modules/`, `mobile/node_modules/`:**
- Purpose: npm dependencies per workspace
- Generated: Yes
- Committed: No

**`web/.next/`:**
- Purpose: Next.js build cache and output
- Generated: Yes
- Committed: No

**`web/src/app/api/auth/`:**
- Purpose: NextAuth API route handler (`[...nextauth]`)
- Generated: No (manually created)
- Note: Uses `authOptions` from `web/src/lib/auth.ts`

---

*Structure analysis: 2026-05-12*
