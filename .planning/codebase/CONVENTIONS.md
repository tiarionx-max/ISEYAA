# Coding Conventions

**Analysis Date:** 2026-05-12

## Naming Patterns

**Files:**
- NestJS service files: `<module>.service.ts` (e.g., `auth.service.ts`, `wallet.service.ts`)
- NestJS controller files: `<module>.controller.ts`
- NestJS module files: `<module>.module.ts`
- DTO files: `<action>-<entity>.dto.ts` (e.g., `create-event.dto.ts`, `purchase-ticket.dto.ts`)
- Test files: `<service>.spec.ts` in a `__tests__/` subdirectory (e.g., `backend/src/modules/auth/__tests__/auth.service.spec.ts`)
- Guard spec files: co-located as `<guard>.spec.ts` alongside the guard (e.g., `backend/src/common/guards/roles.guard.spec.ts`)
- Next.js pages: `page.tsx` inside App Router directories (e.g., `web/src/app/events/page.tsx`)
- Expo screens: PascalCase default export in `app/(tabs)/<name>.tsx` (e.g., `mobile/app/(tabs)/events.tsx`)

**TypeScript identifiers:**
- Classes and decorators: `PascalCase` (e.g., `AuthService`, `JwtAuthGuard`, `RegisterDto`)
- Functions and methods: `camelCase` (e.g., `createBooking`, `handleTicketPayment`, `slugify`)
- Module-level constants: `SCREAMING_SNAKE_CASE` (e.g., `OTP_TTL`, `KYC_TIER_1_LIMIT`, `REFRESH_TTL_SECONDS`)
- Prisma select projections reused across methods: `SCREAMING_SNAKE_CASE` object literal (e.g., `USER_SELECT` in `auth.service.ts`)
- Test fixture IDs: `SCREAMING_SNAKE_CASE` (e.g., `USER_ID`, `BOOKING_ID`, `PAYSTACK_REF`)
- Enums: `PascalCase` name, `SCREAMING_SNAKE_CASE` members (e.g., `UserRole.CITIZEN`, `UserRole.SUPER_ADMIN`)

**React/Next.js identifiers:**
- Page components: `PascalCase` default export named after the route (e.g., `EventsPage`, `DashboardPage`)
- Sub-components defined in the same file: `PascalCase` (e.g., `EventCard`, `EventSkeleton`, `EmptyState`)
- Hooks: `camelCase` starting with `use` (standard React convention)

**Paystack reference strings:**
- Wallet top-up: `ISY-FUND-<12-char-uppercase>`
- Ticket purchase: `ISY-TKT-<12-char-uppercase>`
- Stay booking: `ISY-STY-<12-char-uppercase>`
- Order payment: `ISY-ORD-<12-char-uppercase>`
- Escrow release: `ISY-ESC-<8-char-uppercase>`
- Studio booking: `ISY-SBO-<12-char-uppercase>`

## Code Style

**Formatting:**
- ESLint with `@typescript-eslint/recommended` (`backend/.eslintrc.js`)
- No Prettier config detected — indentation follows 2-space convention throughout

**Key ESLint rules (backend):**
- `@typescript-eslint/explicit-function-return-type`: off (return types omitted on most methods)
- `@typescript-eslint/no-explicit-any`: off (`any` used freely in Prisma filter spreads and DTO casts)
- `@typescript-eslint/interface-name-prefix`: off

**TypeScript config:**
- `strict` mode implied by `@typescript-eslint/recommended`
- Decorators enabled (NestJS requires `experimentalDecorators`)

## Import Organization

**Backend (NestJS) order observed:**
1. NestJS core (`@nestjs/common`, `@nestjs/jwt`, etc.)
2. Third-party libraries (`bcrypt`, `uuid`, `Prisma`, `axios`)
3. Internal services from other modules (relative `../../prisma/`, `../../redis/`, `../../common/`)
4. DTOs from the same module (`./dto/<name>.dto`)
5. Enums and shared types (`../../common/enums/`)

**Web (Next.js) order observed:**
1. `'use client'` directive (when required)
2. Framework imports (`next/...`, `react`, `framer-motion`)
3. Internal path-alias imports (`@/components/...`, `@/lib/...`)
4. Lucide icons (`lucide-react`)

**Path aliases:**
- Backend: relative paths only (no `@/` alias configured)
- Web: `@/` maps to `web/src/` (`tsconfig.json` `paths`)
- Mobile: relative paths (e.g., `../../lib/api`)

## Error Handling

**NestJS services — three-tier pattern:**
1. **Guard with NestJS HTTP exceptions:** throw `NotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException`, or `UnauthorizedException` from `@nestjs/common`. The global `ValidationPipe` handles DTO validation errors automatically.
2. **Soft swallow for non-critical side effects:** catch blocks in `@OnEvent` handlers and the `audit()` helper swallow errors and log via `Logger.error()`. This prevents payment handler failures from crashing the event loop.
3. **Auth edge case:** `logout()` explicitly swallows an invalid-token error because logout should always succeed (`auth.service.ts:192–206`).

**Pattern:**
```typescript
// Primary guard: throw NestJS exception
if (!entity) throw new NotFoundException('Entity not found');
if (entity.ownerId !== callerId) throw new ForbiddenException('Not your entity');

// Side-effect handler: catch and log, never re-throw
@OnEvent('payment.ticket_purchase')
async handleTicketPayment(payload) {
  try {
    // ...
  } catch (err) {
    this.logger.error(`handler failed for ref ${payload.reference}`, err.message);
  }
}
```

## Logging

**Framework:** NestJS built-in `Logger` from `@nestjs/common`

**Instantiation pattern:**
```typescript
private readonly logger = new Logger(AuthService.name);
```
Every service that has side effects or external calls creates an instance. Pure data-access services (e.g., `LgasService`) omit it.

**When to log:**
- `logger.warn()` — missing optional config (e.g., `TERMII_API_KEY` not set, stub mode active)
- `logger.error()` — caught exceptions in side-effect handlers, external API failures
- `logger.log()` — successful important business events (e.g., escrow release, wallet credit)

**Do NOT log:**
- Normal request/response flow (handled by NestJS interceptors)
- Successful DTO validation

## Comments

**When to comment:**
- Module-level section dividers using `// ── Section Name ──────────────────────` (seen in `admin.service.ts`, `marketplace.service.ts`, `ai.service.ts`)
- Inline constants explaining magic numbers (e.g., `const OTP_TTL = 300; // 5 minutes`)
- Critical business rules that are non-obvious (e.g., `// SELECT FOR UPDATE prevents concurrent double-bookings` in `stays.service.ts:166`)
- Stub detection comments (e.g., `// Token already invalid — logout is still successful`)
- `// NEVER hardcode` warnings on platform fee configs

**JSDoc/TSDoc:** Not used in this codebase. Type safety is handled entirely through TypeScript types and class-validator decorators.

## DTO Design

**Pattern:** Class-based DTOs with `class-validator` decorators, consumed by the global `ValidationPipe` (`whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`).

```typescript
// backend/src/modules/auth/dto/register.dto.ts
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(REGISTERABLE_ROLES, { message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` })
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  ndpaConsent: boolean;
}
```

**Rules:**
- All request bodies have a corresponding DTO class
- Optional fields use `@IsOptional()` + `?` type modifier
- Enum fields use `@IsEnum` with a human-readable error message
- Phone validation uses `@IsMobilePhone('en-NG')` for Nigerian numbers

## Service Design

**Constructor injection:** All dependencies are injected via constructor using NestJS DI. Services never instantiate collaborators directly.

```typescript
constructor(
  private prisma: PrismaService,
  private paystack: PaystackService,
  private config: ConfigService,
) {}
```

**Method parameters:** Service public methods accept typed scalar parameters (`userId: string`, `dto: CreateBookingDto`) rather than HTTP request objects.

**Prisma select objects:** When the same field subset is reused across multiple queries, define it as a module-level constant:
```typescript
const USER_SELECT = { id: true, email: true, phone: true, ... };
```

**Partial update pattern:** Use spread with conditional keys for patch operations:
```typescript
data: {
  ...(dto.title && { title: dto.title }),
  ...(dto.description !== undefined && { description: dto.description }),
}
```

**Soft delete:** Never use `prisma.entity.delete()`. Always set `deletedAt: new Date()`:
```typescript
await this.prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
return { deleted: true };
```

**Slug generation:** Duplicate `slugify()` utility function is defined locally in each service file that creates sluggable entities (`events.service.ts`, `stays.service.ts`, `marketplace.service.ts`). Append UUID prefix for uniqueness:
```typescript
const slug = `${slugify(dto.title)}-${uuidv4().slice(0, 8)}`;
```

## Controller Design

**Guards pattern:** Always apply `JwtAuthGuard` first, then `RolesGuard`:
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORGANISER, UserRole.STATE_ADMIN)
```

**Swagger decorators:** Every controller has `@ApiTags('<module>')`. Every endpoint has `@ApiOperation({ summary: '...' })`. Authenticated endpoints have `@ApiBearerAuth()`.

**Current user extraction:** Use `@CurrentUser()` param decorator from `backend/src/common/decorators/current-user.decorator.ts`, not `@Req()`.

**HTTP codes:** Non-GET mutating endpoints that don't create resources use `@HttpCode(HttpStatus.OK)` (e.g., login, logout, otp/send).

## Frontend (Web) Component Design

**Client components:** Pages that use hooks (`useState`, `useQuery`) declare `'use client'` at the top.

**Data fetching:** `@tanstack/react-query` with the `fetcher` wrapper from `web/src/lib/api.ts`. Query keys are string arrays matching the API path (e.g., `['events']`).

**Animation:** `framer-motion` with consistent entrance animation `{ opacity: 0, y: 24 }` → `{ opacity: 1, y: 0 }`, `transition: { duration: 0.38 }`. List items stagger with `delay: index * 0.06`.

**Design tokens (inline):**
- `FOREST = '#1A6B3C'` / `#1a472a`
- `GOLD = '#C8962A'`
- `JUNGLE = '#1C2B2B'`
Used directly as Tailwind arbitrary values (`text-gold`, `bg-jungle`) or inline styles.

**Skeleton loading:** Dedicated `*Skeleton` components using `className="skeleton"` CSS class.

**Empty states:** Dedicated `EmptyState` components, not inline ternaries.

## Mobile (Expo) Component Design

**StyleSheet pattern:** All styles are defined in a `const styles = StyleSheet.create({...})` object at the bottom of the file.

**Colors:** Same token values as web (`FOREST`, `GOLD`, `JUNGLE`) defined as module-level constants at the top of each screen file.

**Navigation:** `expo-router` with `router.push(path)` for imperative navigation.

**Data fetching:** Same `@tanstack/react-query` + `fetcher` pattern as web (`mobile/lib/api.ts`).

---

*Convention analysis: 2026-05-12*
