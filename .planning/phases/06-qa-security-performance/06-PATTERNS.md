# Phase 6: QA, Security & Performance - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 14 new/modified files
**Analogs found:** 12 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `load-tests/k6/main.js` | utility (load script) | request-response | — (no analog) | none |
| `load-tests/k6/scenarios/wallet-flow.js` | utility (load script) | request-response | `load-tests/k6/main.js` (self-sibling) | none |
| `load-tests/artillery/socketio-gps.yml` | config (load config) | event-driven | — (no analog) | none |
| `load-tests/artillery/processor.js` | utility | request-response | `backend/smoke-test.js` | partial |
| `load-tests/db-audit/explain-analyze.ts` | utility (script) | CRUD | `backend/seed-demo.js` | partial |
| `backend/src/modules/wallet/__tests__/wallet-isolation.spec.ts` | test | request-response | `backend/src/modules/wallet/__tests__/wallet.service.spec.ts` | exact |
| `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` | test | request-response | `backend/src/modules/stays/__tests__/stays.service.spec.ts` | exact |
| `backend/src/modules/marketplace/__tests__/marketplace-isolation.spec.ts` | test | request-response | `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` | exact |
| `backend/prisma/schema.prisma` (modify — add @@index) | model | CRUD | `backend/prisma/schema.prisma` (self) | exact |
| `backend/src/modules/admin/admin.service.ts` (modify — fix byCategory SQL) | service | CRUD | `backend/src/modules/admin/admin.service.ts` (self) | exact |
| `backend/src/modules/stays/stays.service.ts` (modify — fix escrow cutoff) | service | CRUD | `backend/src/modules/stays/stays.service.ts` (self) | exact |
| `backend/src/modules/marketplace/marketplace.service.ts` (modify — add stock decrement) | service | CRUD | `backend/src/modules/marketplace/marketplace.service.ts` (self) | exact |
| `backend/src/modules/webhooks/webhooks.service.ts` (verify signature audit) | service | event-driven | `backend/src/modules/webhooks/webhooks.service.ts` (self) | exact |
| `backend/src/common/services/image.service.ts` (modify — WebP conversion) | service | file-I/O | `backend/src/common/services/image.service.ts` (self) | exact |

---

## Pattern Assignments

### `load-tests/k6/main.js` (utility, request-response)

**Analog:** None in codebase. Use RESEARCH.md Pattern 1 directly.

**Structure pattern from RESEARCH.md:**
```javascript
// load-tests/k6/main.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 500 },    // warm up
    { duration: '3m', target: 10000 },  // ramp to 10K
    { duration: '5m', target: 10000 },  // hold
    { duration: '2m', target: 0 },      // ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // QA-01
    'http_req_failed':   ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://iseyaa-api.railway.app';

export default function () {
  // orchestrate scenario imports here
  sleep(1);
}
```

**Key conventions:**
- `__ENV.BASE_URL` for environment injection (matches project .env pattern)
- Tag each request with `{ tags: { endpoint: 'name' } }` for per-endpoint thresholds
- API prefix is `/api/v1` (per CLAUDE.md)

---

### `load-tests/k6/scenarios/wallet-flow.js` (utility, request-response)

**Analog:** None in codebase. Mirror k6/main.js structure.

**Auth helper pattern** (copy from `backend/smoke-test.js` credential pattern):
```javascript
// load-tests/k6/common/auth.js
import http from 'k6/http';

export function getToken(baseUrl, phone, password) {
  const res = http.post(`${baseUrl}/api/v1/auth/login`, JSON.stringify({ phone, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json('data.accessToken');
}
```

**Authenticated request pattern** (API prefix `/api/v1`, Bearer token):
```javascript
export default function () {
  const token = getToken(BASE_URL, __ENV.TEST_PHONE, __ENV.TEST_PASSWORD);
  const res = http.get(`${BASE_URL}/api/v1/wallet/balance`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'wallet' },
  });
  check(res, { 'wallet 200': (r) => r.status === 200 });
}
```

---

### `load-tests/artillery/socketio-gps.yml` (config, event-driven)

**Analog:** None in codebase. Use RESEARCH.md Pattern 2.

**Structure from RESEARCH.md:**
```yaml
# load-tests/artillery/socketio-gps.yml
config:
  target: "https://iseyaa-api.railway.app"
  engines:
    socketio: {}
  phases:
    - duration: 60
      arrivalRate: 5
    - duration: 540
      arrivalRate: 2
  processor: "./processor.js"   # JWT injection

scenarios:
  - name: "GPS Driver Tracking"
    engine: "socketio"
    flow:
      - emit:
          channel: "join:driver"
      - loop:
          - emit:
              channel: "driver:location"
              data:
                tripId: "{{ tripId }}"
                lat: 6.889
                lng: 3.721
          - think: 2
        count: 300
```

---

### `load-tests/artillery/processor.js` (utility, request-response)

**Analog:** `backend/smoke-test.js` (JavaScript login flow against `/api/v1/auth/login`)

**Pattern — pre-login and inject JWT for Artillery:**
```javascript
// load-tests/artillery/processor.js
const axios = require('axios');

module.exports = { injectToken };

async function injectToken(context, events, done) {
  const BASE_URL = process.env.BASE_URL || 'https://iseyaa-api.railway.app';
  const res = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    phone: process.env.TEST_DRIVER_PHONE,
    password: process.env.TEST_DRIVER_PASSWORD,
  });
  context.vars.token = res.data.data.accessToken;
  context.vars.tripId = process.env.TEST_TRIP_ID || 'test-trip-001';
  return done();
}
```

**Key note:** Artillery processor receives `(context, events, done)`. Token goes into `context.vars.token`. Socket.IO handshake auth: the YAML `connect` step passes `{ auth: { token: "{{ token }}" } }`.

---

### `load-tests/db-audit/explain-analyze.ts` (utility/script, CRUD)

**Analog:** `backend/seed-demo.js` (standalone Node.js script using PrismaClient directly)

**Imports pattern** (from RESEARCH.md Pattern 5 + project PrismaClient pattern):
```typescript
// load-tests/db-audit/explain-analyze.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: ['query'] });
```

**Core pattern:**
```typescript
async function audit() {
  const queries = [
    `EXPLAIN ANALYZE SELECT * FROM transactions WHERE "walletId" = 'test-id' ORDER BY "createdAt" DESC LIMIT 20`,
    // ... (see RESEARCH.md Pattern 5 for full list)
  ];
  for (const q of queries) {
    const result = await prisma.$queryRawUnsafe(q);
    console.log(q.split('\n')[0]);
    console.log(result);
    console.log('---');
  }
  await prisma.$disconnect();
}
audit().catch(console.error);
```

**Run with:** `ts-node load-tests/db-audit/explain-analyze.ts` (ts-node already available as backend dev dep)

---

### `backend/src/modules/wallet/__tests__/wallet-isolation.spec.ts` (test, request-response)

**Analog:** `backend/src/modules/wallet/__tests__/wallet.service.spec.ts` — exact same module, exact same mock structure.

**Imports pattern** (lines 1-7 of analog):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WalletService } from '../wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { RedisService } from '../../../redis/redis.service';
```

**Test fixture constants pattern** (lines 8-15 of analog):
```typescript
// SCREAMING_SNAKE_CASE fixture IDs per CLAUDE.md conventions
const USER_A = 'user-a-uuid-001';
const USER_B = 'user-b-uuid-002';
const WALLET_A = 'wallet-a-uuid-001';
const WALLET_B = 'wallet-b-uuid-002';
```

**Mock Prisma pattern** (lines 48-55 of analog — the mockPrisma shape):
```typescript
const mockPrisma = {
  wallet: { findUnique: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  booking: { aggregate: jest.fn() },
  transaction: { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
  platformConfig: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
```

**Module compile pattern** (lines 82-91 of analog):
```typescript
beforeEach(async () => {
  jest.clearAllMocks();
  mockPrisma.platformConfig.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockImplementation(async (fn) => {
    if (typeof fn === 'function') return fn(mockTx);
    return fn;
  });
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WalletService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: PaystackService, useValue: mockPaystack },
      { provide: RedisService, useValue: mockRedis },
    ],
  }).compile();
  service = module.get<WalletService>(WalletService);
});
```

**Isolation test pattern** (the new assertion to add — QA-03):
```typescript
describe('Wallet isolation', () => {
  it('getBalance — user A cannot read user B wallet', async () => {
    // walletB belongs to USER_B
    mockPrisma.wallet.findUnique.mockImplementation(({ where }) => {
      if (where.userId === USER_B) return mockWalletB;
      return null;  // USER_A has no wallet
    });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null, nin: null, bvn: null });
    // Calling getBalance with USER_A returns null wallet → NotFoundException
    await expect(service.getBalance(USER_A)).rejects.toThrow(NotFoundException);
  });

  it('getBalance — user A gets own wallet only (not user B data)', async () => {
    mockPrisma.wallet.findUnique.mockImplementation(({ where }) => {
      if (where.userId === USER_A) return { ...mockWalletA };
      return null;
    });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+2341234', nin: null, bvn: null });
    mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });
    const result = await service.getBalance(USER_A);
    // Result is scoped to USER_A's wallet
    expect(result.balance_ngn).toBeDefined();
  });
});
```

**Key isolation principle:** `WalletService.getBalance(userId)` queries `wallet.findUnique({ where: { userId } })` — isolation is guaranteed by the `userId` scope. The mock must return `null` for USER_A when only USER_B's wallet exists, triggering `NotFoundException`. Do NOT mock `findUnique` to return USER_B's wallet when called with USER_A's id — that would be a false negative.

---

### `backend/src/modules/stays/__tests__/stays-isolation.spec.ts` (test, request-response)

**Analog:** `backend/src/modules/stays/__tests__/stays.service.spec.ts` — exact analog.

**Imports pattern** (lines 1-13 of analog):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaysService } from '../stays.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { S3Service } from '../../../common/services/s3.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { ImageService } from '../../../common/services/image.service';
import { KafkaService } from '../../../kafka/kafka.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };
```

**Mock shape** (lines 58-69 of analog):
```typescript
const mockPrisma = {
  property: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  booking: {
    findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    create: jest.fn(), update: jest.fn(), count: jest.fn(),
  },
  wallet: { findUnique: jest.fn() },
  transaction: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
```

**Isolation assertion pattern** for stays:
```typescript
describe('Booking isolation — createReview', () => {
  it('throws ForbiddenException when user A tries to review user B booking', async () => {
    // bookingB.userId = USER_B, not USER_A
    mockPrisma.booking.findFirst.mockResolvedValue({
      ...mockBooking,
      userId: USER_B,        // owned by B
      status: 'CONFIRMED',
      reviewedAt: null,
      checkOut: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    // caller is USER_A but booking belongs to USER_B
    await expect(service.createReview(BOOKING_ID, USER_A, { rating: 5, comment: 'Great' } as any))
      .rejects.toThrow(ForbiddenException);
  });
});

describe('Property isolation — updateProperty', () => {
  it('throws ForbiddenException when user A tries to update user B property', async () => {
    mockPrisma.property.findFirst.mockResolvedValue({ ...mockProperty, hostId: USER_B });
    await expect(service.updateProperty(PROP_ID, USER_A, {} as any)).rejects.toThrow(ForbiddenException);
  });
});
```

**Source for ForbiddenException throws:**
- `stays.service.ts` line 103: `if (property.hostId !== hostId) throw new ForbiddenException('Not your property')`
- `stays.service.ts` line 345: `if (booking.userId !== userId) throw new ForbiddenException('Not your booking')`

---

### `backend/src/modules/marketplace/__tests__/marketplace-isolation.spec.ts` (test, request-response)

**Analog:** `backend/src/modules/marketplace/__tests__/marketplace.service.spec.ts` — exact analog.

**Imports pattern** (lines 1-9 of analog):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from '../marketplace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../common/services/paystack.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { KafkaService } from '../../../kafka/kafka.service';

const mockKafka = { emit: jest.fn().mockResolvedValue(undefined), consume: jest.fn().mockResolvedValue(undefined) };
```

**Mock shape** (lines 59-69 of analog):
```typescript
const mockPrisma = {
  vendor: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  product: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  order: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
```

**Isolation assertion pattern** for marketplace:
```typescript
describe('Product isolation — updateProduct', () => {
  it('throws ForbiddenException when user A tries to update user B product', async () => {
    // product belongs to vendor B, user A owns vendor A
    mockPrisma.product.findFirst.mockResolvedValue({ ...mockProduct, vendorId: VENDOR_B_ID });
    mockPrisma.vendor.findUnique.mockImplementation(({ where }) => {
      if (where.userId === USER_A) return { id: VENDOR_A_ID, userId: USER_A, status: 'ACTIVE' };
      return null;
    });
    await expect(service.updateProduct(PRODUCT_ID, USER_A, { name: 'Hack' } as any))
      .rejects.toThrow(ForbiddenException);
  });
});
```

**Source for ForbiddenException:** `marketplace.service.ts` line 120:
`if (!vendor || product.vendorId !== vendor.id) throw new ForbiddenException('Not your product')`

**Stock decrement fix location:** `marketplace.service.ts` `handleOrderPayment` (line 225-246). After `order.update({ status: 'PROCESSING' })`, add:
```typescript
// Add stock decrement for each order item
for (const item of order.orderItems) {
  await this.prisma.product.update({
    where: { id: item.productId },
    data: { stock: { decrement: item.quantity } },
  });
}
```
The `handleOrderPayment` function already has `include: { orderItems: { include: { product: { select: { name: true } } } } }` on the order fetch — add `productId` and `quantity` to that select.

---

### `backend/prisma/schema.prisma` (modify — add @@index directives)

**Analog:** Self — the existing `@@index` declarations in schema.prisma at lines 218-219, 386, 700-701, 772-773.

**Existing index pattern** (line 386):
```prisma
model Booking {
  // ... fields ...
  @@index([propertyId, status, escrowReleasedAt])
  @@map("bookings")
}
```

**Pattern to replicate** — add these 9 missing indexes, each after existing fields and before `@@map`:

```prisma
model Ticket {
  // ... existing fields ...
  @@index([userId])          // hot: user's ticket history
  @@index([ticketTypeId])    // hot: availability check
  @@map("tickets")
}

model Booking {
  // ... existing fields + existing @@index ...
  @@index([propertyId, status, escrowReleasedAt])  // already exists
  @@index([userId])          // hot: user's booking history — MISSING
  @@map("bookings")
}

model Order {
  // ... existing fields ...
  @@index([userId])          // hot: user's order history — MISSING
  @@index([vendorId])        // hot: vendor's order list — MISSING
  @@map("orders")
}

model OrderItem {
  // ... existing fields ...
  @@index([orderId])         // hot: order line items — MISSING
  @@index([productId])       // hot: product sales — MISSING
  @@map("order_items")
}

model Transaction {
  // ... existing fields ...
  @@index([walletId])        // CRITICAL: every wallet history query — MISSING
  @@map("transactions")
}

model AuditLog {
  // ... existing fields ...
  @@index([userId])          // hot: user audit trail — MISSING
  @@index([createdAt])       // hot: time-range queries — MISSING
  @@map("audit_logs")
}

model Trip {
  // ... existing fields + existing @@index ...
  @@index([status, requestedAt])    // already exists
  @@index([driverId, status])       // already exists
  @@index([riderId])                // hot: rider's trip history — MISSING
  @@map("trips")
}
```

**Migration command after editing schema:**
```bash
cd backend && npx prisma migrate dev --name add_fk_indexes
```

---

### `backend/src/modules/admin/admin.service.ts` (modify — fix byCategory SQL)

**Analog:** Self — `admin.service.ts` lines 70-77 contain the broken `v.category` query.

**Bug location:** `admin.service.ts` lines 70-77 (confirmed by reading the file):
```typescript
// BEFORE — BROKEN: vendors has no 'category' column
this.prisma.$queryRaw<{ category: string; total: number }[]>`
  SELECT v.category, COALESCE(SUM(o."govtLevy"), 0) AS total
  FROM orders o
  JOIN vendors v ON o."vendorId" = v.id
  WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
  GROUP BY v.category
  ORDER BY total DESC
`
```

**Fix pattern** (from RESEARCH.md Code Examples — replace `byCategory` with `byLga` grouping style already at lines 59-66):
```typescript
// AFTER — group by vendor status (Vendor model has: status VendorStatus)
this.prisma.$queryRaw<{ status: string; total: number }[]>`
  SELECT v.status, COALESCE(SUM(o."govtLevy"), 0) AS total
  FROM orders o
  JOIN vendors v ON o."vendorId" = v.id
  WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
  GROUP BY v.status
  ORDER BY total DESC
`
```

**Return shape update** — change `by_category` field name to `by_vendor_status` in the returned object, and update the TypeScript type: `{ status: string; total: number }[]`.

**Existing working pattern to copy from** (lines 59-66 of admin.service.ts — the byLga query that works):
```typescript
this.prisma.$queryRaw<{ lgaId: string; lgaName: string; total: number }[]>`
  SELECT l.id AS "lgaId", l.name AS "lgaName", COALESCE(SUM(o."govtLevy"), 0) AS total
  FROM orders o
  JOIN vendors v ON o."vendorId" = v.id
  JOIN lgas l ON v."lgaId" = l.id
  WHERE o."deletedAt" IS NULL AND o.status != 'CANCELLED'
  GROUP BY l.id, l.name
  ORDER BY total DESC
`,
```

---

### `backend/src/modules/stays/stays.service.ts` (modify — fix escrow cutoff)

**Analog:** Self — `stays.service.ts` lines 279-295 contain the `releaseEscrow` cron method.

**Bug location:** `stays.service.ts` line 283 — `checkIn` used as cutoff but should be `checkOut`:
```typescript
// BEFORE — WRONG: releases after checkIn+24h, not checkOut+24h
const dueBookings = await this.prisma.booking.findMany({
  where: {
    checkIn: { lt: cutoff },   // BUG: should be checkOut
    status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as any },
    escrowReleasedAt: null,
    deletedAt: null,
  },
```

**Fix pattern** (change one field — keep all other where clauses identical):
```typescript
// AFTER — correct: releases 24h after checkOut
const dueBookings = await this.prisma.booking.findMany({
  where: {
    checkOut: { lt: cutoff },  // FIX: checkOut not checkIn
    status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as any },
    escrowReleasedAt: null,
    deletedAt: null,
  },
```

**Comment convention** (project uses critical business rule comments per CLAUDE.md):
```typescript
// Escrow releases 24 h after checkOut — not checkIn — to give host time to report issues
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
```

---

### `backend/src/modules/marketplace/marketplace.service.ts` (modify — stock decrement)

**Analog:** Self — `marketplace.service.ts` lines 225-246 contain `handleOrderPayment`.

**Bug location:** `handleOrderPayment` updates order to 'PROCESSING' but never decrements stock.

**Fix pattern** (add stock decrement after status update — copy Prisma update pattern from `updateProduct` at line 121):
```typescript
async handleOrderPayment(payload: { reference: string }) {
  try {
    const order = await this.prisma.order.findUnique({
      where: { paystackRef: payload.reference },
      include: {
        user: { select: { email: true, firstName: true } },
        orderItems: {
          include: {
            product: { select: { name: true, id: true } },  // add id
          },
        },
      },
    });

    if (!order || order.status !== 'PENDING') return;

    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: 'PROCESSING' },
    });

    // Decrement stock for each purchased product
    for (const item of order.orderItems) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    await this.notifyOrderUpdate(order.id, 'PROCESSING');
  } catch (err) {
    this.logger.error(`handleOrderPayment failed for ref ${payload.reference}`, err.message);
  }
}
```

**OrderItem include fix:** The existing include at line 230 uses `product: { select: { name: true } }` — add `id: true` so `item.productId` (or `item.product.id`) is available. Note: `item.productId` is always on the `OrderItem` model directly (Prisma always returns FK fields), so `id` on the nested product select is actually optional — `item.productId` works without it.

---

### `backend/src/modules/webhooks/webhooks.service.ts` (verify — signature audit)

**Analog:** Self — `webhooks.service.ts` lines 20-31 contain HMAC-SHA512 Paystack verification.

**Current state (CONFIRMED CORRECT):** The webhook signature verification is already implemented in lines 20-31:
```typescript
async handlePaystack(signature: string, body: any, rawBody?: Buffer) {
  if (!rawBody) {
    throw new BadRequestException('Missing raw body — rawBody middleware not configured');
  }
  const secret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET', '');
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  if (signature !== expected) {
    throw new UnauthorizedException('Invalid Paystack signature');
  }
  // ...
}
```

**Action required:** Verify that the webhook controller passes `rawBody` correctly from the NestJS request. Check `backend/src/modules/webhooks/webhooks.controller.ts` — the `@Req()` or `rawBody` extraction. The `main.ts` already uses `rawBody: true` on NestJS app creation (per CLAUDE.md). No code change needed if controller passes `req.rawBody`. If not, add `@Req() req: Request` and pass `req.rawBody`.

**Timing-safe pattern** (already present for Flutterwave at line 101 — copy for reference):
```typescript
const hashBuf = Buffer.from(hash);
const secretBuf = Buffer.from(secret);
if (hashBuf.length !== secretBuf.length || !timingSafeEqual(hashBuf, secretBuf)) {
  throw new UnauthorizedException('Invalid signature');
}
```

---

### `backend/src/common/services/image.service.ts` (modify — WebP conversion)

**Analog:** Self — `image.service.ts` lines 18-23 contain `resizeEventCover`.

**Current state** (lines 18-23 of image.service.ts):
```typescript
async resizeEventCover(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();
}
```

**Fix pattern** — change return type to carry contentType, change `.jpeg()` to `.webp()`:
```typescript
async resizeEventCover(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  const optimized = await sharp(buffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })   // was .jpeg({ quality: 85 })
    .toBuffer();
  return { buffer: optimized, contentType: 'image/webp' };
}
```

**Caller update required** — `stays.service.ts` line 127-129 uses the old single-Buffer return:
```typescript
// BEFORE (stays.service.ts lines 127-129)
const resized = await this.imageService.resizeEventCover(file.buffer);
const key = `properties/${id}/${uuidv4()}.jpg`;
const url = await this.s3.upload(key, resized, 'image/jpeg');

// AFTER
const { buffer: resized, contentType } = await this.imageService.resizeEventCover(file.buffer);
const key = `properties/${id}/${uuidv4()}.webp`;   // extension updated
const url = await this.s3.upload(key, resized, contentType);
```

**Search all callers** before applying — grep for `resizeEventCover` to find all call sites:
```
backend/src/modules/stays/stays.service.ts line 127
backend/src/modules/events/events.service.ts (likely)
```

**Validation constant** — `ALLOWED_MIME` at line 4 already includes `'image/webp'` so incoming WebP uploads are accepted without change.

---

## Shared Patterns

### Jest Test Module Compile Pattern
**Source:** `backend/src/modules/wallet/__tests__/wallet.service.spec.ts` lines 73-91
**Apply to:** All three new `*-isolation.spec.ts` files

```typescript
// Standard NestJS Testing Module compile pattern used across ALL backend spec files
beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServiceUnderTest,
      { provide: PrismaService, useValue: mockPrisma },
      // ... other mocks
    ],
  }).compile();
  service = module.get<ServiceUnderTest>(ServiceUnderTest);
});
```

### ForbiddenException Ownership Check Pattern
**Source:** `backend/src/modules/stays/stays.service.ts` line 103 and line 345; `backend/src/modules/marketplace/marketplace.service.ts` line 120
**Apply to:** All isolation test assertion blocks

The pattern for ownership checks is: `if (resource.ownerId !== callerUserId) throw new ForbiddenException(...)`. Tests assert this by passing a resource with a different owner and calling `rejects.toThrow(ForbiddenException)`.

### Logger Error in Async Event Handlers
**Source:** `backend/src/modules/stays/stays.service.ts` lines 274-276; `backend/src/modules/marketplace/marketplace.service.ts` lines 243-245
**Apply to:** Any new `handleXxx` event handler

```typescript
} catch (err) {
  this.logger.error(`handleXxx failed for ref ${payload.reference}`, err.message);
}
```

### Section Divider Comments
**Source:** `backend/src/modules/admin/admin.service.ts` lines 8, 48, 100 (pattern used across all service files)
**Apply to:** All service file modifications

```typescript
// ── Section Name ──────────────────────────────────────────────────────────────
```

### Prisma $transaction Array vs. Callback Pattern
**Source:** `backend/src/modules/stays/stays.service.ts` lines 307-329 (array form for atomic batch); lines 175-206 (callback form for conditional logic)
**Apply to:** Stock decrement (simple update — no transaction needed; single Prisma call is atomic for single record update)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `load-tests/k6/main.js` | load script | request-response | No k6 scripts exist in codebase |
| `load-tests/artillery/socketio-gps.yml` | load config | event-driven | No Artillery configs exist; no YAML load test files |

---

## Metadata

**Analog search scope:** `backend/src/modules/`, `backend/src/common/services/`, `backend/prisma/schema.prisma`, `backend/smoke-test.js`
**Files read:** 12 source files
**Pattern extraction date:** 2026-05-19
