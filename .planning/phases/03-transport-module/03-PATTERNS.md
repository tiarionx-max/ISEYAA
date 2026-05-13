# Phase 3: Transport Module - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 14
**Analogs found:** 13 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/prisma/schema.prisma` | model | CRUD | `backend/prisma/schema.prisma` (existing models) | exact |
| `backend/src/modules/transport/transport.module.ts` | module | — | `backend/src/modules/stays/stays.module.ts` | exact |
| `backend/src/modules/transport/transport.controller.ts` | controller | request-response | `backend/src/modules/stays/stays.controller.ts` | exact |
| `backend/src/modules/transport/transport.service.ts` | service | CRUD + event-driven | `backend/src/modules/stays/stays.service.ts` | exact |
| `backend/src/modules/transport/transport.gateway.ts` | gateway | event-driven (WebSocket) | No analog — first gateway in codebase | none |
| `backend/src/modules/transport/dto/create-driver.dto.ts` | utility | — | `backend/src/modules/stays/dto/create-property.dto.ts` | exact |
| `backend/src/modules/transport/dto/go-online.dto.ts` | utility | — | `backend/src/modules/stays/dto/create-booking.dto.ts` | exact |
| `backend/src/modules/transport/dto/request-ride.dto.ts` | utility | — | `backend/src/modules/stays/dto/create-booking.dto.ts` | exact |
| `backend/src/modules/transport/dto/complete-trip.dto.ts` | utility | — | `backend/src/modules/stays/dto/create-review.dto.ts` | role-match |
| `backend/src/modules/transport/__tests__/transport.service.spec.ts` | test | — | `backend/src/modules/stays/__tests__/stays.service.spec.ts` | exact |
| `backend/src/redis/redis.service.ts` | service | CRUD (geo methods added) | `backend/src/redis/redis.service.ts` (existing) | exact |
| `backend/src/app.module.ts` | config | — | `backend/src/app.module.ts` (existing) | exact |
| `mobile/app/(tabs)/transport.tsx` | component | request-response + event-driven | `mobile/app/(tabs)/events.tsx` | exact |
| `mobile/app/(tabs)/driver.tsx` | component | event-driven | `mobile/app/(tabs)/stays.tsx` | role-match |
| `mobile/app/(tabs)/_layout.tsx` | config | — | `mobile/app/(tabs)/_layout.tsx` (existing) | exact |

---

## Pattern Assignments

### `backend/prisma/schema.prisma` (model additions)

**Analog:** `backend/prisma/schema.prisma` (existing `Wallet`, `Transaction`, `Booking`, `User` models)

**Enum declaration pattern** (lines 11–140 — `// ─── Enums` block):
```prisma
// ─── Enums ────────────────────────────────────────────────────────────────────

enum UserRole {
  CITIZEN
  TOURIST
  VENDOR
  // ...
  DRIVER    // already present — DO NOT add again
}
```
New enums (`VehicleType`, `DriverStatus`, `TripStatus`) follow the same ALL_CAPS-members pattern with no trailing commas and a blank line between enums.

**Model declaration pattern** (lines 143–175 — `model User`):
```prisma
model User {
  id        String     @id @default(uuid())
  // scalar fields
  // optional relations
  deletedAt DateTime?

  wallet    Wallet?
  tickets   Ticket[]
  // new relations to add:
  driverProfile Driver?
  riderTrips    Trip[]   @relation("RiderTrips")

  @@map("users")
}
```
Rules observed: `@id @default(uuid())`, soft-delete via `deletedAt DateTime?`, `@@map("snake_case_plural")`, relation fields declared without `@relation` when they are the non-FK side. FK side declares `fields` and `references`.

**`Wallet` / `Transaction` pattern** (lines 488–525) shows that financial models use `Decimal` for money, `gateway PaymentGateway` enum, `balanceBefore`/`balanceAfter` Decimal columns, and `reference String @unique`. The new `Trip` model must use `Decimal` for `fare`, `platformFee`, `driverEarnings`, and `surgeMultiplier`.

**`PlatformConfig` pattern** (lines 527–538):
```prisma
model PlatformConfig {
  id        String    @id @default(uuid())
  key       String    @unique
  value     Json
  isPublic  Boolean   @default(false)
  // ...
  @@map("platform_configs")
}
```
New seed keys (`transport_platform_fee_pct`, `transport_base_fare_*`, `transport_per_km_*`, etc.) follow `key String @unique` + `value Json` — the `value` is a JSON number, not a raw SQL integer.

---

### `backend/src/modules/transport/transport.module.ts` (module)

**Analog:** `backend/src/modules/stays/stays.module.ts` (lines 1–10)

**Module pattern** (stays.module.ts lines 1–10):
```typescript
import { Module } from '@nestjs/common';
import { StaysController, BookingsController } from './stays.controller';
import { StaysService } from './stays.service';

@Module({
  controllers: [StaysController, BookingsController],
  providers: [StaysService],
  exports: [StaysService],
})
export class StaysModule {}
```
Copy this exactly. For transport, add `TransportGateway` to `providers` and import `WalletModule` (same pattern as `WebhooksModule` importing `WalletModule`):
```typescript
@Module({
  imports: [WalletModule],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService],
})
export class TransportModule {}
```

**AppModule registration** (`backend/src/app.module.ts` lines 17, 116):
```typescript
import { TransportModule } from './modules/transport/transport.module';
// Add inside @Module({ imports: [...] })
TransportModule,
```

---

### `backend/src/modules/transport/transport.controller.ts` (controller, request-response)

**Analog:** `backend/src/modules/stays/stays.controller.ts`

**Imports pattern** (lines 1–19):
```typescript
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TransportService } from './transport.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { GoOnlineDto } from './dto/go-online.dto';
import { RequestRideDto } from './dto/request-ride.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
```

**Auth/guard pattern** (stays.controller.ts lines 43–48):
```typescript
@Post()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.HOST)
@ApiBearerAuth()
@ApiOperation({ summary: 'Create property listing (HOST)' })
create(@CurrentUser() user: any, @Body() dto: CreatePropertyDto) {
  return this.staysService.createProperty(user.userId, dto);
}
```
Transport routes follow same pattern. DRIVER-only routes use `@Roles(UserRole.DRIVER)`. CITIZEN/TOURIST ride-request routes use `@Roles(UserRole.CITIZEN, UserRole.TOURIST)`. LGA_ADMIN approval uses `@Roles(UserRole.LGA_ADMIN)`.

**Controller class skeleton** (stays.controller.ts lines 20–94):
```typescript
@ApiTags('transport')
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  // Public / unauthenticated
  @Get('fare-estimate')
  @ApiOperation({ summary: 'Fare estimate with surge multiplier' })
  fareEstimate(@Query('vehicleType') vehicleType: string, @Query('pickupLat') pickupLat: string, ...) {
    return this.transportService.getFareEstimate({ vehicleType, ... });
  }

  // Driver-only
  @Post('drivers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create driver profile (DRIVER)' })
  createDriver(@CurrentUser() user: any, @Body() dto: CreateDriverDto) {
    return this.transportService.createDriver(user.userId, dto);
  }

  @Post('go-online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  goOnline(@CurrentUser() user: any, @Body() dto: GoOnlineDto) {
    return this.transportService.goOnline(user.userId, dto);
  }

  // Rider
  @Post('trips')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.TOURIST)
  @ApiBearerAuth()
  requestRide(@CurrentUser() user: any, @Body() dto: RequestRideDto) {
    return this.transportService.requestRide(user.userId, dto);
  }

  @Patch('trips/:id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  acceptTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.acceptTrip(id, user.userId);
  }

  @Patch('trips/:id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  completeTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.completeTrip(id, user.userId);
  }

  @Get('drivers/earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  getEarnings(@CurrentUser() user: any, @Query('period') period?: 'today' | 'week') {
    return this.transportService.getDriverEarnings(user.userId, period);
  }
}
```

---

### `backend/src/modules/transport/transport.service.ts` (service, CRUD + event-driven)

**Analog:** `backend/src/modules/stays/stays.service.ts`

**Imports pattern** (stays.service.ts lines 1–22):
```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerRegistry } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { TransportGateway } from './transport.gateway';
import { CreateDriverDto } from './dto/create-driver.dto';
import { GoOnlineDto } from './dto/go-online.dto';
import { RequestRideDto } from './dto/request-ride.dto';
```

**Service class constructor** (stays.service.ts lines 28–39):
```typescript
@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private walletService: WalletService,
    private schedulerRegistry: SchedulerRegistry,
    private gateway: TransportGateway,
  ) {}
```

**Section divider comment style** (stays.service.ts line 96 pattern):
```typescript
// ── createDriver ────────────────────────────────────────────────────────────
```

**Prisma guard + ForbiddenException pattern** (stays.service.ts lines 100–103):
```typescript
const driver = await this.prisma.driver.findFirst({ where: { userId, deletedAt: null } });
if (!driver) throw new NotFoundException('Driver profile not found');
if (driver.status !== 'APPROVED') throw new ForbiddenException('Driver not approved for transport');
```

**Prisma $transaction pattern** (stays.service.ts lines 175–206 — interactive transaction):
```typescript
await this.prisma.$transaction(async (tx) => {
  // reads with locking go here
  return tx.trip.create({ data: { ... } });
});
```
For trip completion, use batch `$transaction([...])` (array form, stays.service.ts lines 307–331):
```typescript
await this.prisma.$transaction([
  this.prisma.trip.update({ where: { id: tripId }, data: { status: 'COMPLETED', completedAt: new Date() } }),
  this.prisma.tripEvent.create({ data: { tripId, event: 'TRIP_COMPLETED' } }),
]);
```

**Wallet credit pattern** (wallet.service.ts lines 146–171 — `creditWallet` signature):
```typescript
// WalletService.creditWallet signature:
async creditWallet(walletId: string, amount: number, reference: string, description: string, module = 'wallet')

// Transport call:
const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
await this.walletService.creditWallet(
  driverWallet.id,
  driverEarnings,
  ref,
  `Trip earnings — ${tripId}`,
  'transport',
);
```
Note: `creditWallet` currently hardcodes `gateway: 'PAYSTACK'` (wallet.service.ts line 163). The plan must add an optional `gateway` parameter defaulting to `'PAYSTACK'`; transport calls it with `'INTERNAL'`.

**Match timeout pattern** (from RESEARCH.md Pattern 3 — uses `SchedulerRegistry` already in `AppModule`):
```typescript
scheduleMatchTimeout(tripId: string): void {
  const timeoutId = setTimeout(async () => {
    await this.expireUnmatchedTrip(tripId);
    this.gateway.server.to(`trip:${tripId}`).emit('trip:expired');
  }, 60_000);
  this.schedulerRegistry.addTimeout(`match:${tripId}`, timeoutId);
}

cancelMatchTimeout(tripId: string): void {
  if (this.schedulerRegistry.doesExist('timeout', `match:${tripId}`)) {
    this.schedulerRegistry.deleteTimeout(`match:${tripId}`);
  }
}
```

**Cron pattern** (stays.service.ts lines 279–283):
```typescript
@Cron(CronExpression.EVERY_30_SECONDS)
async cleanStaleDriverHeartbeats(): Promise<void> {
  // Remove drivers from geo-set whose heartbeat key has expired
}
```

**Error handling pattern** (stays.service.ts lines 273–276):
```typescript
} catch (err) {
  this.logger.error(`handleStayPayment failed for ref ${payload.reference}`, err.message);
}
```
Swallow errors in background jobs; rethrow business-logic errors as NestJS HTTP exceptions.

---

### `backend/src/modules/transport/transport.gateway.ts` (gateway, event-driven)

**Analog:** No existing analog — first WebSocket gateway in the codebase. Use RESEARCH.md Pattern 1 as the authoritative reference.

**No analog found.** Use the research pattern verbatim:

```typescript
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // No port arg — attaches to same HTTP server as REST API (port 3001)
})
@Injectable()
export class TransportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TransportGateway.name);

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) { client.disconnect(); return; }
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:trip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    client.join(`trip:${tripId}`);
    return { joined: tripId };
  }

  @SubscribeMessage('driver:location')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string; lat: number; lng: number },
  ) {
    this.server.to(`trip:${data.tripId}`).emit('driver:location', { lat: data.lat, lng: data.lng });
  }
}
```

**Module wiring:** `JwtModule` must be imported in `TransportModule` or `JwtService` provided directly. Check that `AuthModule` exports `JwtService` — if not, add `JwtModule.register({ secret: configService.get('JWT_SECRET') })` to `TransportModule.imports`.

---

### `backend/src/redis/redis.service.ts` (service — geo method additions)

**Analog:** `backend/src/redis/redis.service.ts` (existing — modify in place)

**Existing method pattern** (redis.service.ts lines 33–64):
```typescript
async get(key: string): Promise<string | null> {
  return this.client.get(key);
}

async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds) {
    await this.client.set(key, value, 'EX', ttlSeconds);
  } else {
    await this.client.set(key, value);
  }
}

async expire(key: string, ttlSeconds: number): Promise<void> {
  await this.client.expire(key, ttlSeconds);
}
```
Add these three geo methods following the same `async/await` wrapper style after line 64 (before the closing `}`):

```typescript
async geoadd(key: string, lng: number, lat: number, member: string): Promise<void> {
  await this.client.geoadd(key, lng, lat, member);
}

async geosearch(key: string, lng: number, lat: number, radiusKm: number): Promise<string[]> {
  // Returns flat string[] (no WITHDIST) to avoid [string, string][] parsing
  const results = await this.client.geosearch(
    key,
    'FROMLONLAT', lng, lat,
    'BYRADIUS', radiusKm, 'km',
    'ASC', 'COUNT', 999,
  ) as string[];
  return results;
}

async zrem(key: string, member: string): Promise<void> {
  await this.client.zrem(key, member);
}
```
Note: `this.client` is `private` — the transport service injects `RedisService` and calls these new public methods, never accessing `client` directly.

---

### `backend/src/modules/transport/dto/create-driver.dto.ts` (DTO)

**Analog:** `backend/src/modules/stays/dto/create-property.dto.ts`

**DTO imports and decorator pattern** (create-property.dto.ts lines 1–8):
```typescript
import {
  IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
```

**DTO field pattern** (create-property.dto.ts lines 16–38):
```typescript
export class CreateDriverDto {
  @ApiProperty({ example: 'ABC-123-XY' })
  @IsString() @IsNotEmpty() licenceNumber: string;

  @ApiProperty({ example: '2028-06-30' })
  @IsDateString() licenceExpiry: string;

  @ApiPropertyOptional() @IsString() @IsOptional() metadata?: string;
}
```
Enum fields use `@IsEnum(VehicleType, { message: 'vehicleType must be BIKE|TRICYCLE|CAR|MINIBUS' })`.

---

### `backend/src/modules/transport/dto/go-online.dto.ts` (DTO)

**Analog:** `backend/src/modules/stays/dto/create-booking.dto.ts`

**Numeric field pattern** (create-booking.dto.ts lines 1–12):
```typescript
import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GoOnlineDto {
  @ApiProperty({ example: 3.3792 }) @IsNumber() @Min(-90) @Max(90) @Type(() => Number) lat: number;
  @ApiProperty({ example: 7.3986 }) @IsNumber() @Min(-180) @Max(180) @Type(() => Number) lng: number;
}
```
`@Type(() => Number)` is always present on numeric fields (transformer must coerce query-string values).

---

### `backend/src/modules/transport/dto/request-ride.dto.ts` (DTO)

**Analog:** `backend/src/modules/stays/dto/create-booking.dto.ts` + `create-property.dto.ts`

```typescript
import { IsNumber, IsString, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RequestRideDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) @Type(() => Number) pickupLat: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) @Type(() => Number) pickupLng: number;
  @ApiPropertyOptional() @IsString() @IsOptional() pickupAddress?: string;

  @ApiProperty() @IsNumber() @Min(-90) @Max(90) @Type(() => Number) dropoffLat: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) @Type(() => Number) dropoffLng: number;
  @ApiPropertyOptional() @IsString() @IsOptional() dropoffAddress?: string;

  @ApiProperty({ enum: VehicleType }) @IsEnum(VehicleType) vehicleType: VehicleType;
}
```

---

### `backend/src/modules/transport/dto/complete-trip.dto.ts` (DTO)

**Analog:** `backend/src/modules/stays/dto/create-review.dto.ts`

```typescript
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CompleteTripDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5) @IsOptional() @Type(() => Number) driverRating?: number;

  @ApiPropertyOptional()
  @IsString() @IsOptional() cancelReason?: string;
}
```

---

### `backend/src/modules/transport/__tests__/transport.service.spec.ts` (test)

**Analog:** `backend/src/modules/stays/__tests__/stays.service.spec.ts`

**Test file structure** (stays.service.spec.ts lines 1–95):
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { TransportService } from '../transport.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { WalletService } from '../../wallet/wallet.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TransportGateway } from '../transport.gateway';
```

**Mock object pattern** (stays.service.spec.ts lines 14–74):
```typescript
// SCREAMING_SNAKE_CASE fixture IDs
const DRIVER_ID = 'driver-uuid-001';
const USER_ID   = 'user-uuid-001';
const TRIP_ID   = 'trip-uuid-001';

const mockPrisma = {
  driver: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  trip: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  tripEvent: { create: jest.fn() },
  wallet: { findFirst: jest.fn(), findUnique: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockRedis = {
  geoadd: jest.fn().mockResolvedValue(undefined),
  geosearch: jest.fn().mockResolvedValue([]),
  zrem: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
};

const mockWallet = { creditWallet: jest.fn().mockResolvedValue(undefined) };
const mockScheduler = {
  addTimeout: jest.fn(),
  deleteTimeout: jest.fn(),
  doesExist: jest.fn().mockReturnValue(false),
};
const mockGateway = { server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } };
```

**`beforeEach` + `Test.createTestingModule` pattern** (stays.service.spec.ts lines 76–94):
```typescript
describe('TransportService', () => {
  let service: TransportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: WalletService, useValue: mockWallet },
        { provide: SchedulerRegistry, useValue: mockScheduler },
        { provide: TransportGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
  });
```

**Section divider + describe block pattern** (stays.service.spec.ts lines 96–115):
```typescript
  // ── createDriver ──────────────────────────────────────────────────────────

  describe('createDriver', () => {
    it('creates driver profile when user is valid', async () => { ... });
    it('throws ConflictException when driver profile already exists', async () => { ... });
  });
```

---

### `mobile/app/(tabs)/transport.tsx` (component, request-response + event-driven)

**Analog:** `mobile/app/(tabs)/events.tsx`

**Imports pattern** (events.tsx lines 1–9):
```typescript
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { router } from 'expo-router';
import { MapPin, Car, Bike } from 'lucide-react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
```

**Color constants** (events.tsx lines 10–13):
```typescript
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
```

**Screen skeleton** (events.tsx lines 14–81):
```typescript
export default function TransportScreen() {
  // state: vehicleType, pickupLat/Lng, dropoffLat/Lng, screen ('home'|'estimate'|'matching'|'active'|'complete')
  // socket ref: useRef<Socket | null>(null)
  // countdown: useEffect with setInterval decrementing from 60

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Transport</Text>
      </View>
      {/* Conditional screen render based on `screen` state */}
    </SafeAreaView>
  );
}
```

**StyleSheet pattern** (events.tsx lines 83–130):
```typescript
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: JUNGLE },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  heading: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  // Gold CTA button:
  ctaButton: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { fontSize: 14, fontWeight: 'bold', color: JUNGLE },
  // Destructive button:
  cancelButton: {
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderRadius: 10,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  cancelText: { fontSize: 14, fontWeight: 'bold', color: '#DC2626' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
```

**MapView platform provider pattern** (from UI-SPEC.md Interaction Contract):
```typescript
<MapView
  style={{ flex: 1 }}
  provider={Platform.OS === 'android' ? 'google' : undefined}
  // ... region, onRegionChange
>
  <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} pinColor={FOREST} />
  <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng }} pinColor={GOLD} />
</MapView>
```

**socket.io-client connection pattern** (from RESEARCH.md Pattern 5):
```typescript
// Called once on screen mount, stored in a useRef:
const socketRef = useRef<Socket | null>(null);

useEffect(() => {
  (async () => {
    const token = await SecureStore.getItemAsync('access_token');
    socketRef.current = io(process.env.EXPO_PUBLIC_API_URL!, {
      transports: ['websocket'],   // Required for React Native
      auth: { token },
    });
    socketRef.current.on('driver:matched', (data) => { /* navigate to active trip */ });
    socketRef.current.on('driver:location', (data) => { /* update driver marker */ });
    socketRef.current.on('trip:expired', () => { /* show expired state */ });
  })();
  return () => { socketRef.current?.disconnect(); };
}, []);
```
Note: `SecureStore.getItemAsync` key in existing `mobile/lib/api.ts` is `'access_token'` (line 10) — use the same key name.

---

### `mobile/app/(tabs)/driver.tsx` (component, event-driven)

**Analog:** `mobile/app/(tabs)/stays.tsx`

**Imports pattern** (stays.tsx lines 1–8):
```typescript
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { MapPin, Car, Star, Clock } from 'lucide-react-native';
import MapView, { Marker } from 'react-native-maps';
import { io, Socket } from 'socket.io-client';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
```

**Color constants:** Same as all other tabs — declare `FOREST`, `GOLD`, `JUNGLE` at top.

**Screen skeleton** (stays.tsx lines 13–70):
```typescript
export default function DriverScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [screen, setScreen] = useState<'home'|'incoming'|'pickup'|'active'|'earnings'>('home');
  const socketRef = useRef<Socket | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  // ...

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Driver</Text>
      </View>
      {/* Conditional screen render */}
    </SafeAreaView>
  );
}
```

**expo-location GPS watch pattern** (from RESEARCH.md TRANSPORT-04):
```typescript
// Started when driver goes online; stopped on go-offline or unmount
const startLocationWatch = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') { /* show permission error */ return; }

  locationWatchRef.current = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 },
    (location) => {
      socketRef.current?.emit('driver:location', {
        tripId: activeTripId,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
      // Also PATCH /transport/go-online to refresh heartbeat
    },
  );
};

// Cleanup on go-offline:
locationWatchRef.current?.remove();
```

**StyleSheet pattern** — follows stays.tsx lines 72–100. Go-online toggle button spec:
```typescript
goOnlineButton: {
  width: 120,
  height: 120,
  borderRadius: 60,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 3,
  // Online: backgroundColor: FOREST, borderColor: '#22C55E'
  // Offline: backgroundColor: 'rgba(255,255,255,0.07)', borderColor: '#6B7280'
},
statusDot: {
  width: 10,
  height: 10,
  borderRadius: 5,
  // Online: backgroundColor: '#22C55E'
  // Offline: backgroundColor: '#6B7280'
},
```

---

### `mobile/app/(tabs)/_layout.tsx` (config — add two new tabs)

**Analog:** `mobile/app/(tabs)/_layout.tsx` (modify in place)

**Existing Tabs.Screen pattern** (lines 28–63):
```typescript
<Tabs.Screen
  name="events"
  options={{
    title: 'Events',
    tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />,
  }}
/>
```
Add two new `Tabs.Screen` entries in the same pattern. Import `Truck` (for Transport) and `Steering` or `Car` (for Driver) from `lucide-react-native`. Insert before the `profile` screen:
```typescript
<Tabs.Screen
  name="transport"
  options={{
    title: 'Transport',
    tabBarIcon: ({ color, size }) => <Car color={color} size={size} />,
  }}
/>
<Tabs.Screen
  name="driver"
  options={{
    title: 'Driver',
    tabBarIcon: ({ color, size }) => <Truck color={color} size={size} />,
  }}
/>
```
Header `screenOptions` are inherited from parent — do not duplicate them on individual screens.

---

## Shared Patterns

### Authentication (REST)
**Source:** `backend/src/modules/stays/stays.controller.ts` lines 43–48
**Apply to:** All transport controller routes that require auth
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)   // or CITIZEN, TOURIST, LGA_ADMIN as appropriate
@ApiBearerAuth()
```

### Authentication (WebSocket)
**Source:** RESEARCH.md Pattern 1 (no codebase analog exists yet)
**Apply to:** `transport.gateway.ts` `handleConnection()`
```typescript
handleConnection(client: Socket) {
  const token = client.handshake.auth?.token;
  if (!token) { client.disconnect(); return; }
  try {
    const payload = this.jwtService.verify(token);
    client.data.userId = payload.sub;
    client.data.role = payload.role;
  } catch {
    client.disconnect();
  }
}
```

### Error Handling (Service)
**Source:** `backend/src/modules/stays/stays.service.ts` lines 273–276
**Apply to:** All `TransportService` background job methods (`cleanStaleHeartbeats`, `expireUnmatchedTrip`)
```typescript
} catch (err) {
  this.logger.error(`[description] failed for [entity] ${id}`, err.message);
}
```
Business-logic errors throw NestJS HTTP exceptions (`NotFoundException`, `ForbiddenException`, `BadRequestException`) — they are never caught in service methods.

### Error Handling (Test)
**Source:** `backend/src/modules/stays/__tests__/stays.service.spec.ts` lines 138–142
**Apply to:** All transport service spec `it()` blocks testing errors
```typescript
it('throws NotFoundException when [entity] not found', async () => {
  mockPrisma.[model].findFirst.mockResolvedValue(null);
  await expect(service.[method](...))).rejects.toThrow(NotFoundException);
});
```

### Logger Pattern
**Source:** `backend/src/modules/stays/stays.service.ts` lines 30, 332–333
**Apply to:** `TransportService`, `TransportGateway`
```typescript
private readonly logger = new Logger(TransportService.name);
// Usage:
this.logger.log(`Trip ${tripId} completed — ₦${driverEarnings} credited to driver ${driverId}`);
this.logger.error(`Match timeout failed for trip ${tripId}`, err.message);
```

### Wallet Credit
**Source:** `backend/src/modules/wallet/wallet.service.ts` lines 146–171
**Apply to:** `TransportService.completeTrip()`
```typescript
// Existing signature:
async creditWallet(walletId: string, amount: number, reference: string, description: string, module = 'wallet')
// Note: plan must add optional gateway param — see Open Questions in RESEARCH.md
```

### Reference Prefix Format
**Source:** `backend/src/modules/stays/stays.service.ts` line 173 (ISY-STY pattern)
**Apply to:** `TransportService.completeTrip()`
```typescript
const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
```

### Mobile API Client
**Source:** `mobile/lib/api.ts` lines 1–14
**Apply to:** All REST calls from `transport.tsx` and `driver.tsx`
```typescript
import { api } from '../../lib/api';
// GET:
const { data } = await api.get('/transport/fare-estimate?...');
// POST:
await api.post('/transport/go-online', { lat, lng });
// PATCH:
await api.patch(`/transport/trips/${tripId}/accept`);
```

### Mobile SecureStore Token Key
**Source:** `mobile/lib/api.ts` line 10
**Apply to:** Socket connection setup in both transport and driver tabs
```typescript
const token = await SecureStore.getItemAsync('access_token');
// Key name is 'access_token' — must match api.ts interceptor
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/modules/transport/transport.gateway.ts` | gateway | event-driven (WebSocket) | No WebSocket gateway exists in the codebase. Use RESEARCH.md Pattern 1 as the authoritative template. `@nestjs/websockets` and `@nestjs/platform-socket.io` must be installed before this file can be compiled. |

---

## Metadata

**Analog search scope:** `backend/src/modules/stays/`, `backend/src/modules/wallet/`, `backend/src/redis/`, `backend/prisma/`, `mobile/app/(tabs)/`, `mobile/lib/`
**Files scanned:** 18
**Pattern extraction date:** 2026-05-12
