# Phase 4: Delivery Module - Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/prisma/schema.prisma` | model/config | CRUD | same file (Driver/Trip/TripEvent models) | exact |
| `backend/src/modules/delivery/delivery.service.ts` | service | CRUD + event-driven | `backend/src/modules/transport/transport.service.ts` | exact |
| `backend/src/modules/delivery/delivery.gateway.ts` | WebSocket gateway | event-driven | `backend/src/modules/transport/transport.gateway.ts` | exact |
| `backend/src/modules/delivery/delivery.controller.ts` | controller | request-response | `backend/src/modules/transport/transport.controller.ts` | exact |
| `backend/src/modules/delivery/delivery.module.ts` | config | — | `backend/src/modules/transport/transport.module.ts` | exact |
| `backend/src/modules/delivery/dto/create-delivery-rider.dto.ts` | DTO | request-response | `backend/src/modules/transport/dto/create-driver.dto.ts` | exact |
| `backend/src/modules/delivery/dto/approve-delivery-rider.dto.ts` | DTO | request-response | `backend/src/modules/transport/dto/approve-driver.dto.ts` | exact |
| `backend/src/modules/delivery/dto/rider-go-online.dto.ts` | DTO | request-response | `backend/src/modules/transport/dto/go-online.dto.ts` | exact |
| `backend/src/modules/delivery/dto/request-delivery.dto.ts` | DTO | request-response | `backend/src/modules/transport/dto/request-ride.dto.ts` | role-match |
| `backend/src/modules/delivery/dto/verify-delivery-otp.dto.ts` | DTO | request-response | `backend/src/modules/auth/dto/otp-verify.dto.ts` | role-match |
| `backend/src/modules/delivery/dto/complete-delivery.dto.ts` | DTO | request-response | `backend/src/modules/transport/dto/complete-trip.dto.ts` | role-match |
| `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` | test | — | `backend/src/modules/transport/__tests__/transport.service.spec.ts` | exact |
| `backend/src/modules/delivery/__tests__/delivery.gateway.spec.ts` | test | — | `backend/src/modules/transport/__tests__/transport.gateway.spec.ts` | exact |
| `mobile/app/(tabs)/delivery.tsx` | component/screen | request-response + event-driven | `mobile/app/(tabs)/transport.tsx` | exact |
| `mobile/app/(tabs)/rider.tsx` | component/screen | request-response + event-driven | `mobile/app/(tabs)/driver.tsx` | exact |
| `mobile/app/(tabs)/_layout.tsx` | config | — | same file (Phase 3 added Transport + Driver tabs) | exact |

---

## Pattern Assignments

### `backend/prisma/schema.prisma` (model additions)

**Analog:** same file — `Driver`, `Trip`, `TripEvent` models and `DriverStatus`, `TripStatus` enums (lines 148–695)

**Reuse existing enum** — `DriverStatus` (lines 148–153):
```prisma
enum DriverStatus {
  PENDING_REVIEW
  APPROVED
  SUSPENDED
  REJECTED
}
```
`DeliveryRider.status` uses this exact enum. No new enum needed.

**New enum to add** — after `TripStatus` block:
```prisma
enum DeliveryOrderStatus {
  SEARCHING
  MATCHED
  COLLECTING
  IN_TRANSIT
  DELIVERED
  CANCELLED
  EXPIRED
}
```

**New model pattern — copy from `Driver` model** (lines 597–640), rename fields:
```prisma
model DeliveryRider {
  id             String       @id @default(uuid())
  userId         String       @unique
  user           User         @relation(fields: [userId], references: [id])
  status         DriverStatus @default(PENDING_REVIEW)
  approvedById   String?
  approvedAt     DateTime?
  isOnline       Boolean      @default(false)
  lastSeenAt     DateTime?
  avgRating      Decimal      @default(0)
  totalDeliveries Int         @default(0)
  acceptanceRate Decimal      @default(0)
  metadata       Json?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  orders DeliveryOrder[] @relation("RiderOrders")

  @@map("delivery_riders")
}
```

**New model pattern — copy from `Trip` model** (lines 644–681), adapt fields:
```prisma
model DeliveryOrder {
  id               String              @id @default(uuid())
  senderId         String
  sender           User                @relation("SenderOrders", fields: [senderId], references: [id])
  riderId          String?
  rider            DeliveryRider?      @relation("RiderOrders", fields: [riderId], references: [id])
  pickupAddress    String
  pickupLat        Decimal
  pickupLng        Decimal
  dropoffAddress   String
  dropoffLat       Decimal
  dropoffLng       Decimal
  itemDescription  String
  weightKg         Decimal
  recipientPhone   String
  fee              Decimal?
  platformFee      Decimal?
  riderEarnings    Decimal?
  status           DeliveryOrderStatus @default(SEARCHING)
  proofPhotoUrl    String?
  otpVerifiedAt    DateTime?
  requestedAt      DateTime            @default(now())
  matchedAt        DateTime?
  collectedAt      DateTime?
  completedAt      DateTime?
  cancelReason     String?
  senderRating     Int?
  metadata         Json?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  deletedAt        DateTime?

  events DeliveryEvent[]

  @@map("delivery_orders")
}
```

**New model pattern — copy from `TripEvent`** (lines 683–695):
```prisma
model DeliveryEvent {
  id        String        @id @default(uuid())
  orderId   String
  order     DeliveryOrder @relation(fields: [orderId], references: [id])
  event     String
  metadata  Json?
  createdAt DateTime      @default(now())

  @@map("delivery_events")
}
```

**User model additions** — add two virtual relation fields (no columns):
```prisma
// In model User — add alongside existing driverProfile and riderTrips:
deliveryRiderProfile  DeliveryRider?
senderOrders         DeliveryOrder[] @relation("SenderOrders")
```

---

### `backend/src/modules/delivery/delivery.service.ts` (service, CRUD + event-driven)

**Analog:** `backend/src/modules/transport/transport.service.ts`

**Imports pattern** (lines 1–23 of transport.service.ts):
```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { DeliveryGateway } from './delivery.gateway';
// ... import delivery DTOs
```

**Constructor pattern** (lines 44–53):
```typescript
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private walletService: WalletService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(forwardRef(() => DeliveryGateway)) private gateway: DeliveryGateway,
    private config: ConfigService,  // ADD: needed for Termii OTP dispatch
  ) {}
}
```

**haversineDistanceKm** — copy verbatim from transport.service.ts lines 57–69. Identical function; same Earth radius calculation.

**scheduleMatchTimeout / cancelMatchTimeout pattern** (lines 73–105) — copy with delivery-scoped names:
```typescript
// Key difference: timeout key uses 'delivery-match:' prefix to avoid collision
private scheduleMatchTimeout(orderId: string): void {
  const timeoutId = setTimeout(async () => {
    await this.expireUnmatchedOrder(orderId);
  }, 60_000);
  this.schedulerRegistry.addTimeout(`delivery-match:${orderId}`, timeoutId);
}

private cancelMatchTimeout(orderId: string): void {
  if (this.schedulerRegistry.doesExist('timeout', `delivery-match:${orderId}`)) {
    this.schedulerRegistry.deleteTimeout(`delivery-match:${orderId}`);
  }
}
```

**goOnline pattern** (lines 171–191) — copy with delivery-scoped Redis keys:
```typescript
// Redis key differences:
// Transport: 'drivers:online' geo-set, 'driver:heartbeat:{id}' heartbeat
// Delivery:  'riders:online'  geo-set, 'rider:heartbeat:{id}'  heartbeat
await this.redis.geoadd('riders:online', dto.lng, dto.lat, rider.id);
await this.redis.set(`rider:heartbeat:${rider.id}`, now.toISOString(), 90);
```

**goOffline pattern** (lines 193–209) — copy with delivery-scoped keys:
```typescript
await this.redis.zrem('riders:online', rider.id);
await this.redis.set(`rider:heartbeat:${rider.id}`, 'offline', 1);
```

**getFareEstimate pattern** (lines 213–243) — adapt for weight-based pricing (no surge):
```typescript
// Transport uses: transport_base_fare_{type}, transport_per_km_{type}
// Delivery uses:  delivery_base_fee, delivery_per_kg_rate
const [baseCfg, perKgCfg] = await Promise.all([
  this.prisma.platformConfig.findUnique({ where: { key: 'delivery_base_fee' } }),
  this.prisma.platformConfig.findUnique({ where: { key: 'delivery_per_kg_rate' } }),
]);
const baseFee = baseCfg ? Number(baseCfg.value) : 300;
const perKgRate = perKgCfg ? Number(perKgCfg.value) : 50;
// Weight surcharge: first 2 kg free, per-kg rate applies above
const weightSurcharge = dto.weightKg <= 2 ? 0 : Math.round((dto.weightKg - 2) * perKgRate * 100) / 100;
const totalFee = Math.round((baseFee + weightSurcharge) * 100) / 100;
```

**OTP generation + dispatch pattern** — adapt from auth.service.ts lines 129–133 and 222–241:
```typescript
const DELIVERY_OTP_TTL = 300; // 5 minutes — matches auth OTP TTL

// At order creation:
const otp = Math.floor(100000 + Math.random() * 900000).toString();
await this.redis.set(`delivery:otp:${order.id}`, otp, DELIVERY_OTP_TTL);
await this.sendTermiiDeliveryOtp(order.recipientPhone, otp);

private async sendTermiiDeliveryOtp(phone: string, otp: string): Promise<void> {
  const apiKey = this.config.get<string>('TERMII_API_KEY');
  if (!apiKey) {
    this.logger.warn(`[TERMII STUB] Delivery OTP ${otp} for ${phone}`);
    return;
  }
  // Same fetch pattern as auth.service.ts lines 230–241; different sms body
}
```

**verifyOtp pattern** — compare stored Redis key, set `otpVerifiedAt`:
```typescript
// Key difference from auth OTP: no brute-force counter (delivery context)
const stored = await this.redis.get(`delivery:otp:${orderId}`);
if (!stored) throw new BadRequestException('OTP expired. Request a new delivery to get a fresh code.');
if (stored !== otp) throw new BadRequestException('Incorrect OTP. Ask the recipient to check their SMS.');
await this.prisma.deliveryOrder.update({
  where: { id: orderId },
  data: { otpVerifiedAt: new Date() },
});
// DO NOT delete the key — completeDelivery checks otpVerifiedAt, not the key
return { verified: true };
```

**requestDelivery pattern** — copy from `requestRide` (lines 279–331) with delivery geo-set:
```typescript
// Use 'riders:online' geo-set (NOT 'drivers:online')
const nearbyRiders = await this.redis.geosearch('riders:online', dto.pickupLng, dto.pickupLat, radiusKm);
if (nearbyRiders.length > 0) {
  const nearestRiderId = nearbyRiders[0];
  this.gateway.server.to(`rider:${nearestRiderId}`).emit('delivery:request', order);
}
this.scheduleMatchTimeout(order.id);
```

**completeDelivery pattern** — adapt from `completeTrip` (lines 476–541) with dual-gate:
```typescript
// CRITICAL: dual-gate check before processing
if (!order.otpVerifiedAt) throw new BadRequestException('OTP must be verified before completing delivery');
if (!dto.proofPhotoBase64) throw new BadRequestException('Proof-of-delivery photo is required');

// Photo upload — S3Service.upload() signature: (key, buffer, contentType) → Promise<string>
const photoBuffer = Buffer.from(dto.proofPhotoBase64, 'base64');
const proofPhotoUrl = await this.s3Service.upload(
  `delivery-proof/${orderId}-${Date.now()}.jpg`,
  photoBuffer,
  'image/jpeg',
);

// Platform fee — NEVER hardcode (CLAUDE.md rule)
const feeCfg = await this.prisma.platformConfig.findUnique({ where: { key: 'delivery_platform_fee_pct' } });
const feePct = feeCfg ? Number(feeCfg.value) : 20; // 20% platform (vs 15% in transport)

// Reference prefix: ISY-RDR- (not ISY-DRV-)
const ref = `ISY-RDR-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

// WalletService.creditWallet signature (from transport.service.ts line 525):
// creditWallet(walletId, amount, reference, description, source, gateway)
await this.walletService.creditWallet(
  riderWallet.id, riderEarnings, ref,
  `Delivery earnings — ${orderId}`, 'delivery', 'INTERNAL',
);

// Emit to delivery room (not trip room)
this.gateway.server.to(`delivery:${orderId}`).emit('delivery:completed', { orderId, riderEarnings });
```

**getEarnings pattern** — copy from `getDriverEarnings` (lines 584–619), adapt for delivery:
```typescript
// Use deliveryOrder model (not trip); sum riderEarnings (not driverEarnings)
const aggregation = await this.prisma.deliveryOrder.aggregate({
  where: { riderId: rider.id, status: 'DELIVERED', completedAt: { gte: startDate } },
  _sum: { riderEarnings: true },
  _count: { id: true },
});
```

**cleanStaleHeartbeats cron** — copy from lines 623–644, use delivery geo-set:
```typescript
@Cron(CronExpression.EVERY_30_SECONDS)
async cleanStaleRiderHeartbeats(): Promise<void> {
  const allRiderIds = await this.redis.geosearch('riders:online', 0, 0, 20000);
  for (const riderId of allRiderIds) {
    const heartbeat = await this.redis.get(`rider:heartbeat:${riderId}`);
    if (heartbeat === null) {
      await this.redis.zrem('riders:online', riderId);
      await this.prisma.deliveryRider.update({ where: { id: riderId }, data: { isOnline: false } });
    }
  }
}
```

**S3Service injection** — `S3Service` is in `CommonModule` which is `@Global()`. Inject directly in constructor — no need to import `CommonModule` in `DeliveryModule`:
```typescript
import { S3Service } from '../../common/services/s3.service';
// In constructor:
private s3Service: S3Service,
```

---

### `backend/src/modules/delivery/delivery.gateway.ts` (WebSocket gateway, event-driven)

**Analog:** `backend/src/modules/transport/transport.gateway.ts` (entire file, 103 lines)

**Full file pattern** — copy verbatim, change all `transport`/`trip`/`driver` references to `delivery`/`delivery`/`rider`:

**Imports + class declaration** (lines 1–28):
```typescript
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';

// CRITICAL: No port arg — shares port 3001 with REST API and TransportGateway
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
})
@Injectable()
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(DeliveryGateway.name);
  constructor(private jwtService: JwtService) {}
}
```

**handleConnection** (lines 34–50) — copy verbatim. JWT verification logic is identical.

**Room name pattern** — all rooms use `delivery:` prefix (not `trip:`):
```typescript
@SubscribeMessage('join:delivery')
handleJoinDelivery(@ConnectedSocket() client: Socket, @MessageBody() deliveryId: string) {
  client.join(`delivery:${deliveryId}`);
  return { joined: deliveryId };
}

@SubscribeMessage('rider:location')
handleRiderLocation(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { deliveryId: string; lat: number; lng: number },
): void {
  // Relay only to this delivery room — NEVER server.emit() globally
  this.server.to(`delivery:${data.deliveryId}`).emit('rider:location', { lat: data.lat, lng: data.lng });
}

@SubscribeMessage('join:rider')
handleJoinRider(@ConnectedSocket() client: Socket) {
  // Delivery riders use DRIVER role — room scoped as rider:{userId} (not driver:{userId})
  if (client.data.role !== 'DRIVER') return { error: 'forbidden' };
  client.join(`rider:${client.data.userId}`);
  return { joined: `rider:${client.data.userId}` };
}
```

---

### `backend/src/modules/delivery/delivery.controller.ts` (controller, request-response)

**Analog:** `backend/src/modules/transport/transport.controller.ts` (entire file, 199 lines)

**Imports + class pattern** (lines 1–29):
```typescript
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}
}
```

**Auth guard pattern** — copy from transport.controller.ts; same guard stack:
```typescript
// Delivery rider endpoints (create profile, go online, go offline):
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)

// Sender endpoints (request delivery, cancel):
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CITIZEN, UserRole.TOURIST)

// LGA_ADMIN approval:
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LGA_ADMIN)

// Fee estimate endpoint (D-1 → D-2 flow) — PUBLIC, no auth guard
@Get('fee-estimate')
feeEstimate(@Query(...) ...) { ... }
```

**HttpCode pattern** — mutating endpoints use `@HttpCode(HttpStatus.OK)` for PATCH/POST:
```typescript
// All PATCH endpoints and go-online/go-offline POSTs:
@HttpCode(HttpStatus.OK)
```

**Route structure** — mirrors transport.controller.ts structure but for delivery endpoints:
```typescript
// Profile
POST   /delivery/riders              → createDeliveryRider    (DRIVER)
PATCH  /delivery/riders/:id/approve  → approveDeliveryRider   (LGA_ADMIN)
// Online state
POST   /delivery/go-online           → goOnline               (DRIVER)
POST   /delivery/go-offline          → goOffline              (DRIVER)
// Fee estimate
GET    /delivery/fee-estimate        → getFeeEstimate         (public)
// Order lifecycle
POST   /delivery/orders              → requestDelivery        (CITIZEN, TOURIST)
PATCH  /delivery/orders/:id/accept   → acceptOrder            (DRIVER)
PATCH  /delivery/orders/:id/decline  → declineOrder           (DRIVER)
PATCH  /delivery/orders/:id/collect  → collectParcel          (DRIVER)
POST   /delivery/orders/:id/verify-otp → verifyOtp            (DRIVER)
PATCH  /delivery/orders/:id/complete → completeDelivery       (DRIVER)
PATCH  /delivery/orders/:id/cancel   → cancelOrder            (CITIZEN, TOURIST, DRIVER)
// Earnings
GET    /delivery/riders/earnings     → getRiderEarnings       (DRIVER)
```

---

### `backend/src/modules/delivery/delivery.module.ts` (config)

**Analog:** `backend/src/modules/transport/transport.module.ts` (entire file, 17 lines)

**Full pattern** — copy verbatim, replace Transport references:
```typescript
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryGateway } from './delivery.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';  // re-exports JwtModule for DeliveryGateway

@Module({
  imports: [
    WalletModule,
    AuthModule,  // AuthModule re-exports JwtModule (provides JwtService for DeliveryGateway)
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryGateway],
  exports: [DeliveryService],
})
export class DeliveryModule {}
```

**AppModule registration** — add `DeliveryModule` import alongside `TransportModule` in `backend/src/app.module.ts`.

---

### `backend/src/modules/delivery/dto/*.ts` (DTOs, request-response)

**Analog files:**

**`create-delivery-rider.dto.ts`** — adapt from `create-driver.dto.ts` (lines 1–18). No `licenceNumber`/`licenceExpiry` — delivery riders register with metadata only:
```typescript
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeliveryRiderDto {
  @ApiPropertyOptional({ example: '{"vehicleNumber":"ABC-123","vehicleType":"BIKE"}' })
  @IsString()
  @IsOptional()
  metadata?: string;
}
```

**`approve-delivery-rider.dto.ts`** — copy verbatim from `approve-driver.dto.ts` (lines 1–17), rename class only.

**`rider-go-online.dto.ts`** — copy verbatim from `go-online.dto.ts` (lines 1–19), rename class only.

**`request-delivery.dto.ts`** — adapt from `request-ride.dto.ts` (lines 1–48). Replace `vehicleType` with `itemDescription`, `weightKg`, `recipientPhone`:
```typescript
import { IsNumber, IsString, IsNotEmpty, Min, Max } from 'class-validator';
import { IsMobilePhone } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RequestDeliveryDto {
  // Coordinates — same pattern as request-ride.dto.ts lines 7–44
  @IsNumber() @Min(-90) @Max(90) @Type(() => Number)
  pickupLat: number;
  @IsNumber() @Min(-180) @Max(180) @Type(() => Number)
  pickupLng: number;
  @IsString() @IsNotEmpty()
  pickupAddress: string;
  @IsNumber() @Min(-90) @Max(90) @Type(() => Number)
  dropoffLat: number;
  @IsNumber() @Min(-180) @Max(180) @Type(() => Number)
  dropoffLng: number;
  @IsString() @IsNotEmpty()
  dropoffAddress: string;
  // Delivery-specific fields (not in transport DTO):
  @IsString() @IsNotEmpty()
  itemDescription: string;
  @IsNumber() @Min(0.1) @Max(500) @Type(() => Number)
  weightKg: number;
  // CRITICAL: OTP sent to recipient phone, not sender's phone
  @IsMobilePhone('en-NG', {}, { message: 'recipientPhone must be a valid Nigerian phone number' })
  recipientPhone: string;
}
```

**`verify-delivery-otp.dto.ts`** — new DTO (no direct analog; adapt from auth OTP verify pattern):
```typescript
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDeliveryOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
```

**`complete-delivery.dto.ts`** — adapt from `complete-trip.dto.ts` (lines 1–18). Replace `driverRating` with `senderRating`, add `proofPhotoBase64`:
```typescript
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CompleteDeliveryDto {
  @IsString()
  @IsOptional()
  proofPhotoBase64?: string;  // base64 JPEG; if absent → completeDelivery throws 400

  @IsInt() @Min(1) @Max(5) @IsOptional() @Type(() => Number)
  senderRating?: number;
}
```

---

### `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (test)

**Analog:** `backend/src/modules/transport/__tests__/transport.service.spec.ts` (entire file)

**Full mock structure pattern** (lines 86–143) — copy verbatim, rename `driver`/`trip`/`tripEvent` to `deliveryRider`/`deliveryOrder`/`deliveryEvent`:
```typescript
const mockPrisma = {
  deliveryRider: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  deliveryOrder: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
  deliveryEvent: { create: jest.fn() },
  wallet: { findFirst: jest.fn() },
  platformConfig: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

// mockRedis — copy verbatim from lines 121–127; same geo method names
// mockWallet — copy verbatim from lines 129–131
// mockScheduler — copy verbatim from lines 133–137
// mockGateway — copy verbatim from lines 139–143
```

**Module setup pattern** (lines 150–169) — copy verbatim, add `ConfigService` mock:
```typescript
{ provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
{ provide: S3Service, useValue: { upload: jest.fn().mockResolvedValue('https://cdn.example.com/proof.jpg') } },
```

**Test coverage targets** — copy test describe block structure from transport.service.spec.ts, adapt for:
- `requestDelivery` → geosearch on `riders:online`
- `verifyOtp` → Redis get/compare; `otpVerifiedAt` set
- `completeDelivery` → dual-gate (otpVerifiedAt + proofPhotoBase64); S3 upload; walletService.creditWallet with `ISY-RDR-` prefix
- `getEarnings` → aggregate on `deliveryOrder`

---

### `mobile/app/(tabs)/delivery.tsx` (component/screen, request-response + event-driven)

**Analog:** `mobile/app/(tabs)/transport.tsx` (entire file, 674 lines)

**Imports pattern** (lines 1–36 of transport.tsx) — replace `Car/Bike/Truck/Bus/Star` with `Package/MapPin/Navigation/CheckCircle/AlertCircle/ChevronLeft/Clock/Star/Upload`:
```typescript
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, ScrollView, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import MapView, { Marker } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import { Package, MapPin, Navigation, CheckCircle, AlertCircle, ChevronLeft, Star } from 'lucide-react-native';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE = API_BASE.replace('/api/v1', '');
```

**Screen type** — adapt from transport.tsx line 38:
```typescript
type Screen = 'home' | 'quote' | 'matching' | 'active' | 'complete';
```

**State variables** — copy from transport.tsx lines 71–89; replace fare/vehicle state with delivery-specific state:
```typescript
const [screen, setScreen] = useState<Screen>('home');
const [pickupAddress, setPickupAddress] = useState('');
const [pickupLat, setPickupLat] = useState<number | null>(null);
const [pickupLng, setPickupLng] = useState<number | null>(null);
const [dropoffAddress, setDropoffAddress] = useState('');
const [dropoffLat, setDropoffLat] = useState<number | null>(null);
const [dropoffLng, setDropoffLng] = useState<number | null>(null);
const [itemDescription, setItemDescription] = useState('');
const [weightKg, setWeightKg] = useState('');
const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
const [order, setOrder] = useState<DeliveryOrder | null>(null);
const [riderLocation, setRiderLocation] = useState<{lat:number;lng:number}|null>(null);
const [countdown, setCountdown] = useState(60);
const [orderExpired, setOrderExpired] = useState(false);
const [rating, setRating] = useState(0);
const [loading, setLoading] = useState(false);
const socketRef = useRef<Socket | null>(null);
const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

**WebSocket setup** (lines 92–127) — copy pattern; change event names:
```typescript
// Change socket events:
// 'driver:matched'   → 'rider:assigned'
// 'driver:location'  → 'rider:location'
// 'trip:expired'     → 'delivery:expired'
// 'trip:completed'   → 'delivery:completed'
// After order created, join delivery room:
socketRef.current?.emit('join:delivery', data.id);
```

**startCountdown / stopCountdown** (lines 129–154) — copy verbatim. Countdown logic is identical.

**Matching screen** (lines 404–429) — copy from transport.tsx `screen === 'matching'` block:
```typescript
// Change copy from: 'Finding your driver...' / 'No drivers nearby'
// Change copy to:   'Finding a rider...'     / 'No riders available'
// Timer display: fontSize 48 in countdownText style — identical
```

**Active delivery screen** (lines 432–493) — copy from transport.tsx `screen === 'active'` block:
```typescript
// Changes:
// 1. Show OTP display box below rider info card (no analog in transport — new addition)
// 2. Room join: 'join:delivery' (not 'join:trip')
// 3. Marker for rider position uses riderLocation (not driverLocation)
// OTP display box style (new):
<View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Share this code with recipient</Text>
  <Text style={{ fontSize: 24, fontWeight: 'bold', color: GOLD, letterSpacing: 8 }}>
    {order?.recipientOtp ?? '------'}
  </Text>
</View>
```

**StyleSheet** (lines 552–673) — copy entire StyleSheet verbatim from transport.tsx. All color tokens, spacing, and component dimensions are identical. The delivery tab shares the same design language.

---

### `mobile/app/(tabs)/rider.tsx` (component/screen, request-response + event-driven)

**Analog:** `mobile/app/(tabs)/driver.tsx` (entire file, 800 lines)

**Imports pattern** (lines 1–29 of driver.tsx) — add `Image` from react-native, add `* as ImagePicker from 'expo-image-picker'`:
```typescript
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, ScrollView, FlatList, Alert, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker } from 'react-native-maps';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';  // NEW — not in driver.tsx
import { io, Socket } from 'socket.io-client';
import { api } from '../../lib/api';
import { MapPin, AlertCircle, Navigation, CheckCircle, Package, Camera, Upload } from 'lucide-react-native';
```

**haversineKm function** (lines 61–69 of driver.tsx) — copy verbatim. Same implementation needed for 200m proximity gate.

**Screen type** — adapt from driver.tsx line 35:
```typescript
type Screen = 'home' | 'incoming' | 'pickup' | 'active' | 'earnings';
```

**State variables** (lines 72–88) — copy driver.tsx pattern; add OTP and photo state:
```typescript
// Copy all driver.tsx state; add:
const [otpCells, setOtpCells] = useState<string[]>(['','','','','','']);
const [otpVerified, setOtpVerified] = useState(false);
const [otpError, setOtpError] = useState(false);
const [photoUri, setPhotoUri] = useState<string | null>(null);
// Rename: currentTrip → currentOrder (type DeliveryOrder)
// Rename: arrived → collected (marks parcel collection, not driver arrival)
const otpInputRefs = useRef<Array<any>>([]);  // 6 refs for OTP digit cells
```

**WebSocket setup** (lines 104–133) — copy driver.tsx pattern; change event/room names:
```typescript
socket.on('connect', () => { socket.emit('join:rider'); });  // not 'join:driver'
socket.on('delivery:request', (req: DeliveryOrder) => {     // not 'ride:request'
  setCurrentOrder(req);
  startRespondCountdown();
  setScreen('incoming');
});
```

**startRespondCountdown / stopRespondCountdown** (lines 141–167) — copy verbatim. Timer logic is identical.

**startLocationWatch** (lines 171–191) — copy driver.tsx pattern; change emit event:
```typescript
socketRef.current.emit('rider:location', {
  deliveryId: currentOrder.id,  // not tripId
  lat: latitude, lng: longitude,
});
```

**Go online/offline handlers** (lines 201–229) — copy driver.tsx; change API endpoints:
```typescript
await api.post('/delivery/go-online', { lat, lng });   // not /transport/go-online
await api.post('/delivery/go-offline');                // not /transport/go-offline
```

**handleAccept** (lines 233–246) — copy driver.tsx; change endpoint:
```typescript
await api.patch(`/delivery/orders/${currentOrder.id}/accept`);  // not /transport/trips/:id/accept
```

**Proximity gate pattern** (lines 432–492 of driver.tsx) — copy with delivery-specific CTA text:
```typescript
// R-3 Pickup screen: same distanceToPickup <= 200 gate
// CTA text: "I've Collected" (not "I've Arrived")  |  disabled: "Approach pickup point"
// API: PATCH /delivery/orders/:id/collect (not /trips/:id/arrive)
```

**OTP entry + verification pattern** (R-4 Sub-state B — new, no transport analog):
```typescript
// 6-cell OTP input — auto-advance focus on digit entry
const handleOtpChange = (index: number, value: string) => {
  const newCells = [...otpCells];
  newCells[index] = value;
  setOtpCells(newCells);
  if (value && index < 5) {
    otpInputRefs.current[index + 1]?.focus();
  }
  // Auto-verify when all 6 cells filled
  if (newCells.every(c => c !== '') && !otpVerified) {
    verifyOtp(newCells.join(''));
  }
};

const verifyOtp = async (otp: string) => {
  try {
    await api.post(`/delivery/orders/${currentOrder!.id}/verify-otp`, { otp });
    setOtpVerified(true);
    setOtpError(false);
  } catch {
    setOtpError(true);
    setOtpCells(['','','','','','']);
    otpInputRefs.current[0]?.focus();
  }
};
```

**Photo picker pattern** (R-4 Sub-state B — new, uses expo-image-picker):
```typescript
// SDK 51 API: use MediaTypeOptions.Images (not array syntax which is v16+)
const handlePickPhoto = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Media library access is required to upload proof of delivery.');
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true, aspect: [4, 3], quality: 0.7,
  });
  if (!result.canceled && result.assets.length > 0) {
    setPhotoUri(result.assets[0].uri);
  }
};
```

**handleCompleteDelivery** — adapt from `handleCompleteTrip` (lines 289–307 of driver.tsx):
```typescript
// Additional pre-flight checks:
if (!otpVerified) return;   // UI gate — backend also enforces
if (!photoUri) return;      // UI gate — backend also enforces

// Convert URI to base64 before sending
// Use fetch(photoUri) + arrayBuffer → Buffer.from → base64
const response = await fetch(photoUri);
const arrayBuffer = await response.arrayBuffer();
const base64 = Buffer.from(arrayBuffer).toString('base64');

const { data } = await api.patch(`/delivery/orders/${currentOrder!.id}/complete`, {
  proofPhotoBase64: base64,
  senderRating: rating,
});
setCreditBanner(`₦${data?.riderEarnings?.toFixed(0) ?? '0'} credited to your wallet.`);
// 2-second delay then navigate to earnings (same as driver.tsx lines 295–301)
setTimeout(() => {
  setCreditBanner('');
  setCurrentOrder(null);
  setScreen('earnings');
  queryClient.invalidateQueries({ queryKey: ['rider-earnings'] });
}, 2000);
```

**Earnings screen** (lines 562–647 of driver.tsx) — copy verbatim; change API endpoint and labels:
```typescript
queryFn: () => api.get(`/delivery/riders/earnings?period=${earningsPeriod}`).then(r => r.data),
// History rows: show "Your share: ₦{riderEarnings}" below route
// (transport shows fare total; delivery shows rider's 80% share)
```

**renderStatusBanner** (lines 310–324) — copy verbatim. Same KYC status messages.

**StyleSheet** (lines 652–800 of driver.tsx) — copy entire StyleSheet verbatim. Add new styles for OTP cells and photo upload button. All base styles are identical.

---

### `mobile/app/(tabs)/_layout.tsx` (config modification)

**Analog:** same file (lines 1–110), Phase 3 added Transport + Driver tabs using same pattern

**Import change** (line 3) — add `Package` and `Bike` icons:
```typescript
// Current line 3:
import { Map, Calendar, Home, Music, User, Car, Truck } from 'lucide-react-native';
// Replace with:
import { Map, Calendar, Home, Music, User, Car, Truck, Package, Bike } from 'lucide-react-native';
```

**Two new Tabs.Screen entries** — insert between the `driver` and `profile` entries (after line 87, before line 88):
```typescript
<Tabs.Screen
  name="delivery"
  options={{
    title: 'Delivery',
    tabBarIcon: ({ focused }) => <TabIcon icon={Package} focused={focused} label="Delivery" />,
  }}
/>
<Tabs.Screen
  name="rider"
  options={{
    title: 'Rider',
    tabBarIcon: ({ focused }) => <TabIcon icon={Bike} focused={focused} label="Rider" />,
  }}
/>
```

All other `_layout.tsx` content remains unchanged. `fontSize: 10` label style and tab bar height (iOS 80 / Android 68) accommodate 9 tabs without modification.

---

## Shared Patterns

### JWT Auth Guard Stack
**Source:** `backend/src/modules/transport/transport.controller.ts` lines 54–57
**Apply to:** All `DeliveryController` endpoints requiring authentication
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)          // or CITIZEN/TOURIST or LGA_ADMIN
@ApiBearerAuth()
```

### WebSocket JWT Verification
**Source:** `backend/src/modules/transport/transport.gateway.ts` lines 34–50
**Apply to:** `DeliveryGateway.handleConnection()`
```typescript
handleConnection(client: Socket): void {
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

### Error Throwing Pattern
**Source:** `backend/src/modules/transport/transport.service.ts` (throughout)
**Apply to:** All `DeliveryService` methods
```typescript
// Services throw NestJS exceptions — HTTP layer handles status codes
throw new NotFoundException('...');
throw new ForbiddenException('...');
throw new BadRequestException('...');
throw new ConflictException('...');
```

### PlatformConfig Fee Reading
**Source:** `backend/src/modules/transport/transport.service.ts` lines 493–497
**Apply to:** `DeliveryService.completeDelivery()` — NEVER hardcode 20%
```typescript
const feeCfg = await this.prisma.platformConfig.findUnique({
  where: { key: 'delivery_platform_fee_pct' },
});
const feePct = feeCfg ? Number(feeCfg.value) : 20; // 20% fallback only
```

### Prisma Transaction for State + Event
**Source:** `backend/src/modules/transport/transport.service.ts` lines 349–364
**Apply to:** All `DeliveryService` state-change operations (accept, collect, complete)
```typescript
await this.prisma.$transaction([
  this.prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: '...', ... } }),
  this.prisma.deliveryEvent.create({ data: { orderId, event: 'EVENT_NAME' } }),
]);
```

### S3Service Upload
**Source:** `backend/src/common/services/s3.service.ts` lines 27–45
**Apply to:** `DeliveryService.completeDelivery()` photo upload
```typescript
// Correct signature: upload(key: string, body: Buffer, contentType: string): Promise<string>
const proofPhotoUrl = await this.s3Service.upload(
  `delivery-proof/${orderId}-${Date.now()}.jpg`,
  photoBuffer,
  'image/jpeg',
);
// Note: method is upload() not uploadBuffer() — RESEARCH.md assumption A4 confirmed resolved
```

### Mobile Color Tokens
**Source:** `mobile/app/(tabs)/transport.tsx` lines 33–35 and `mobile/app/(tabs)/driver.tsx` lines 31–33
**Apply to:** Both `delivery.tsx` and `rider.tsx`
```typescript
const FOREST = '#1A6B3C';
const GOLD   = '#C8962A';
const JUNGLE = '#1C2B2B';
```

### Mobile API Base
**Source:** `mobile/app/(tabs)/transport.tsx` lines 35–36
**Apply to:** `delivery.tsx`
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const WS_BASE  = API_BASE.replace('/api/v1', '');
```

### Mobile WebSocket Setup Pattern
**Source:** `mobile/app/(tabs)/driver.tsx` lines 104–133
**Apply to:** Both `delivery.tsx` and `rider.tsx`
```typescript
// Pattern: async IIFE inside useEffect; SecureStore token; cleanup returns cancel flag
useEffect(() => {
  let cancelled = false;
  (async () => {
    const token = await SecureStore.getItemAsync('access_token');
    if (cancelled) return;
    const socket = io(WS_BASE, { transports: ['websocket'], auth: { token } });
    socketRef.current = socket;
    // ... attach event handlers
  })();
  return () => {
    cancelled = true;
    socketRef.current?.disconnect();
  };
}, []);
```

### Mobile Proximity Gate
**Source:** `mobile/app/(tabs)/driver.tsx` lines 61–69 (haversineKm) and lines 432–437 (gate logic)
**Apply to:** `rider.tsx` R-3 Pickup screen and R-4 Active Delivery screen
```typescript
// haversineKm: copy verbatim from driver.tsx lines 61–69
const distanceToTarget =
  myLat && myLng && targetLat && targetLng
    ? haversineKm(myLat, myLng, targetLat, targetLng) * 1000
    : Infinity;
const closeEnough = distanceToTarget <= 200;
// CTA: disabled={!closeEnough} style={[styles.ctaButton, !closeEnough && styles.ctaDisabled]}
```

### Mobile Credit Banner + Auto-Navigate
**Source:** `mobile/app/(tabs)/driver.tsx` lines 530–536, 295–301
**Apply to:** `rider.tsx` after successful `completeDelivery` call
```typescript
// Show banner → 2s delay → navigate to earnings
setCreditBanner(`₦${riderEarnings} credited to your wallet.`);
setTimeout(() => {
  setCreditBanner('');
  setCurrentOrder(null);
  setScreen('earnings');
}, 2000);
// Banner JSX (copy verbatim from driver.tsx lines 530–536):
<View style={styles.creditBanner}>
  <CheckCircle size={14} color="#22C55E" />
  <Text style={styles.creditBannerText}>{creditBanner}</Text>
</View>
```

---

## No Analog Found

All Phase 4 files have strong analogs. Two patterns are genuinely new but have partial analogs:

| Pattern | Partial Analog | What's New |
|---|---|---|
| OTP digit cell input (R-4) | No existing 6-cell OTP input in mobile | Ref array for auto-focus, verified/error cell states |
| Photo upload button (R-4) | S3 upload in backend is established | `expo-image-picker` + base64 conversion on mobile is new |

---

## Key Resolution: S3Service Method

**Open Question 1 from RESEARCH.md resolved:** `S3Service.upload()` signature at `backend/src/common/services/s3.service.ts` line 27 is:
```typescript
async upload(key: string, body: Buffer, contentType: string): Promise<string>
```
The method is `upload()`, not `uploadBuffer()`. RESEARCH.md Pattern 4 used `s3Service.uploadBuffer()` which does not exist. Use `s3Service.upload()` with `(key, buffer, contentType)` argument order.

---

## Metadata

**Analog search scope:** `backend/src/modules/transport/`, `backend/src/modules/auth/`, `backend/src/common/services/`, `backend/src/redis/`, `mobile/app/(tabs)/`, `backend/prisma/schema.prisma`
**Files scanned:** 16
**Pattern extraction date:** 2026-05-16
