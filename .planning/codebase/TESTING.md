# Testing Patterns

**Analysis Date:** 2026-05-12

## Test Framework

**Runner:**
- Jest 29.7.0
- Config: `backend/jest.config.js`
- Transform: `ts-jest` for all `.ts` files
- `testEnvironment: 'node'`
- `rootDir: 'src'`, pattern: `.*\.spec\.ts$`

**Assertion Library:**
- Jest built-in (`expect`) — no separate assertion library

**Run Commands:**
```bash
npm run test                 # Run all tests (from backend/ directory)
npm run test:coverage        # Run with coverage report
npm run test:all             # Run across all workspaces (from monorepo root)
```

## Test File Organization

**Location pattern:** Tests are placed in a `__tests__/` subdirectory inside the module directory:
```
backend/src/modules/auth/__tests__/auth.service.spec.ts
backend/src/modules/wallet/__tests__/wallet.service.spec.ts
backend/src/modules/events/__tests__/events.service.spec.ts
backend/src/modules/stays/__tests__/stays.service.spec.ts
backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts
backend/src/modules/studio/__tests__/studio.service.spec.ts
backend/src/modules/tourism/__tests__/tourism.service.spec.ts
backend/src/modules/users/__tests__/users.service.spec.ts
backend/src/modules/admin/__tests__/admin.service.spec.ts
backend/src/modules/ai/__tests__/ai.service.spec.ts
```

**Exception — co-located guard spec:**
```
backend/src/common/guards/roles.guard.spec.ts   ← alongside roles.guard.ts
```

**Naming:** `<service-name>.spec.ts` — always mirrors the service file name.

**What is tested:** Only services and guards. Controllers, modules, DTOs, and strategies have no test files. The AI spec also tests SSE streaming behavior.

## Test Structure

**Suite organization:**
```typescript
describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceName,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
      ],
    }).compile();
    service = module.get<ServiceName>(ServiceName);
  });

  // ── methodName ─────────────────────────────────────────────────────────────

  describe('methodName', () => {
    it('describes the expected behavior', async () => {
      // arrange
      mockPrisma.entity.findFirst.mockResolvedValue(mockEntity);
      // act
      const result = await service.methodName(arg);
      // assert
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**
- `beforeEach` always calls `jest.clearAllMocks()` before recreating the NestJS testing module
- Module is fully rebuilt each test via `Test.createTestingModule().compile()`
- Section divider comments `// ── methodName ───────────────` separate describe blocks within a file
- Test descriptions use plain English sentences that read as: "action + expected outcome"

## Mocking

**Framework:** Jest (`jest.fn()`, `mockResolvedValue`, `mockReturnValue`, `mockImplementation`)

**Module-level mock objects pattern:**
```typescript
// Defined once at module scope, shared across all tests
const mockPrisma = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn(),
  verify: jest.fn(),
};
```

**Provider injection pattern:**
```typescript
{ provide: PrismaService, useValue: mockPrisma },
{ provide: RedisService, useValue: mockRedis },
{ provide: JwtService, useValue: mockJwt },
{ provide: ConfigService, useValue: mockConfig },
```

**ConfigService mock pattern:**
```typescript
const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, string> = {
      JWT_SECRET: 'test_secret',
      JWT_REFRESH_SECRET: 'test_refresh_secret',
    };
    return vals[key] ?? def;
  }),
};
```

**Chained mock returns for ordered calls:**
```typescript
// Use mockResolvedValueOnce chaining for sequential calls to the same mock
mockJwt.signAsync
  .mockResolvedValueOnce('access_tok')
  .mockResolvedValueOnce('refresh_tok');

mockPrisma.user.count
  .mockResolvedValueOnce(500)   // first call: total_users
  .mockResolvedValueOnce(42);   // second call: dau
```

**External SDK mocking (module-level jest.mock):**
```typescript
// Used for the Anthropic SDK in ai.service.spec.ts
jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockReturnValue(mockStream),
        create: jest.fn().mockResolvedValue({ content: [{ text: 'answer' }] }),
      },
    })),
  };
});
```

**Interactive transaction mock pattern (SELECT FOR UPDATE):**
```typescript
// For prisma.$transaction(async (tx) => {...}) — the interactive form
mockPrisma.$transaction.mockImplementation(async (fn) => {
  const txMock = {
    $queryRaw: jest.fn().mockResolvedValue([]), // no conflicts → empty array
    booking: { create: jest.fn().mockResolvedValue({ ...mockBooking, status: 'PENDING' }) },
  };
  return fn(txMock);
});

// To simulate a conflict, return a non-empty array:
mockPrisma.$transaction.mockImplementation(async (fn) => {
  const txMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: BOOKING_ID }]), // conflict!
    booking: { create: jest.fn() },
  };
  return fn(txMock);
});
```
This pattern is used in `stays.service.spec.ts` and `studio.service.spec.ts` to test the `SELECT FOR UPDATE` double-booking prevention.

**Batch transaction mock (array form):**
```typescript
// For prisma.$transaction([op1, op2]) — the batch form
mockPrisma.$transaction.mockResolvedValue([{}, {}]);
```
Used in `wallet.service.spec.ts` and `events.service.spec.ts`.

**What to mock:**
- All Prisma model methods (`findFirst`, `findUnique`, `findMany`, `create`, `update`, `aggregate`, `count`)
- `prisma.$transaction` (both interactive and batch forms)
- `prisma.$queryRaw` (for raw SQL assertions)
- All external service clients: `PaystackService`, `S3Service`, `SendgridService`, `QrService`, `ImageService`
- `JwtService.signAsync` and `JwtService.verify`
- `RedisService.get/set/del/exists`
- `ConfigService.get`

**What NOT to mock:**
- The service under test itself
- NestJS framework internals (use `Test.createTestingModule`)
- `bcrypt.hash`/`bcrypt.compare` — these are tested with real calls (e.g., `auth.service.spec.ts` creates real hashes to test login)

## Fixtures and Factories

**Test data pattern:** Named constants at module scope. No factory functions — objects are inlined or spread:

```typescript
const USER_ID = 'user-uuid-001';
const BOOKING_ID = 'booking-uuid-001';
const PAYSTACK_REF = 'ISY-STY-ABCDEF123456';

const mockProperty = {
  id: PROP_ID,
  hostId: HOST_ID,
  name: 'Abeokuta Villa',
  isActive: true,
  pricePerNight: 15000,
  maxGuests: 4,
  deletedAt: null,
  // ...
};

// Variations via spread
const updatedProperty = { ...mockProperty, maxGuests: 6 };
```

**Date fixtures:** Use `Date.now()` with offsets for time-sensitive tests:
```typescript
const futureCheckIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureCheckOut = new Date(futureCheckIn.getTime() + 3 * 24 * 60 * 60 * 1000);
const pastCheckOut = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
```

**Location:** All fixtures are defined at the top of the spec file, before the `describe` block.

**KYC tier fixtures (`wallet.service.spec.ts`):**
```typescript
const mockUserTier2 = { phone: '+2348012345678', nin: '12345678901', bvn: null };
const mockUserTier1 = { phone: '+2348012345678', nin: null, bvn: null };
const mockUserTier0 = { phone: null, nin: null, bvn: null };
```

## Coverage

**Requirements:** No minimum enforced — `collectCoverageFrom` is configured but thresholds are absent from `jest.config.js`.

**Current state:** 153 tests across 11 suites, all passing (as of 2026-05-12).

**View Coverage:**
```bash
cd backend && npm run test:coverage
# Report written to backend/coverage/
```

## Test Types

**Unit Tests:**
- Scope: individual service methods in isolation
- All dependencies replaced with `jest.fn()` objects
- NestJS `TestingModule` used to wire DI — no manual instantiation
- Each test resets mock state via `jest.clearAllMocks()` in `beforeEach`

**Integration Tests:** Not present in this codebase.

**E2E Tests:** Not present in this codebase. The `smoke-test.js` file in `backend/` is a manual HTTP smoke test, not an automated e2e suite.

**Guard unit tests:** `roles.guard.spec.ts` tests the guard synchronously without `TestingModule` — uses a factory function `createContext()` that constructs a mock `ExecutionContext` inline:
```typescript
const createContext = (userRole: string | null, requiredRoles: UserRole[] | null) => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles as any);
  const guard = new RolesGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: userRole ? { role: userRole } : null }) }),
  } as unknown as ExecutionContext;
  return { guard, ctx };
};
```

## Common Patterns

**Async testing:**
```typescript
// Resolved values (happy path)
mockPrisma.entity.findFirst.mockResolvedValue(mockEntity);
const result = await service.methodName(args);
expect(result.field).toBe(expectedValue);

// Rejected values (error paths)
await expect(service.methodName(args)).rejects.toThrow(NotFoundException);
await expect(service.methodName(args)).rejects.toThrow(ForbiddenException);
await expect(service.methodName(args)).rejects.toThrow(BadRequestException);
await expect(service.methodName(args)).rejects.toThrow(ConflictException);
await expect(service.methodName(args)).rejects.toThrow(UnauthorizedException);
```

**Call assertion with partial matching:**
```typescript
// Use expect.objectContaining to assert on a subset of arguments
expect(mockPrisma.user.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ ndpaConsent: true, ndpaConsentAt: expect.any(Date) }),
  }),
);

// Regex matching for generated values
expect(mockPrisma.event.create).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ slug: expect.stringMatching(/^ogun-festival-/) }),
  }),
);

// NOT contains assertion (for exclusion tests)
expect(mockPrisma.studioSlot.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.not.objectContaining({ isGovernmentPriority: false }),
  }),
);
```

**Negative assertion (side effect did not occur):**
```typescript
it('returns early when ticket already ISSUED', async () => {
  mockPrisma.ticket.findUnique.mockResolvedValue({ ...mockTicket, status: 'ISSUED' });
  await service.handleTicketPayment({ reference: PAYSTACK_REF });
  expect(mockQr.generatePng).not.toHaveBeenCalled();
});
```

**SSE streaming test pattern (ai.service.spec.ts):**
```typescript
const mockRes = () => {
  const events: Array<{ event: string; data: unknown }> = [];
  return {
    write: jest.fn((chunk: string) => {
      const eventMatch = chunk.match(/event: (\w+)/);
      const dataMatch = chunk.match(/data: (.+)/);
      if (eventMatch && dataMatch) {
        try { events.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) }); } catch {}
      }
    }),
    end: jest.fn(),
    events,
  };
};

// Assert on emitted event names
const eventNames = res.events.map((e) => e.event);
expect(eventNames).toContain('status');
expect(eventNames).toContain('itinerary');
expect(eventNames).toContain('done');
expect(res.end).toHaveBeenCalled();
```

**Pagination boundary test pattern:**
```typescript
// +1 trick: fetch limit+1 to detect next page
const items = Array.from({ length: 21 }, (_, i) => ({ id: `tx-${i}` }));
mockPrisma.transaction.findMany.mockResolvedValue(items);
const result = await service.getTransactions(USER_ID, { limit: 20 });
expect(result.data).toHaveLength(20);
expect(result.meta.hasNext).toBe(true);
expect(result.meta.cursor).toBe('tx-19');
```

---

*Testing analysis: 2026-05-12*
