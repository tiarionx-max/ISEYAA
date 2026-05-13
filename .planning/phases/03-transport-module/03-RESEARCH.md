# Phase 3: Transport Module - Research

**Researched:** 2026-05-12
**Domain:** Real-time ride-hailing — NestJS WebSocket gateways, Redis geo-matching, Prisma schema extensions, mobile GPS tracking, surge pricing
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRANSPORT-01 | Driver profile creation, vehicle/licence submission, LGA_ADMIN KYC approval, go-online state | Prisma Driver + Vehicle models; DriverStatus enum; GEOADD on go-online |
| TRANSPORT-02 | Rider selects vehicle type, pickup/dropoff, sees fare estimate with surge multiplier, confirms | FareEngine service; VehicleType rate table in PlatformConfig; surge ratio query |
| TRANSPORT-03 | Nearest online driver matched within 60s using Redis GEORADIUS/GEOSEARCH | ioredis GEOSEARCH FROMLONLAT BYRADIUS; SchedulerRegistry.addTimeout per trip |
| TRANSPORT-04 | Live GPS position updates every 2s via WebSocket for trip duration | @WebSocketGateway + @nestjs/platform-socket.io; socket.io-client on mobile |
| TRANSPORT-05 | Surge pricing when demand > 1.5× supply in zone; multiplier shown pre-confirmation | Redis ZCARD of online drivers vs active Trip count in zone; multiplier in fare estimate |
| TRANSPORT-06 | Trip completion → driver wallet credited fare × 0.85 immediately; platform retains 15% | WalletService.creditWallet() direct call; ISY-DRV-* reference prefix |
| TRANSPORT-07 | Driver earnings dashboard — daily/weekly earnings, trip history, acceptance rate, avg rating | Prisma aggregations on Trip table; acceptance rate = accepted/(accepted+rejected) |
| TRANSPORT-08 | Mobile Transport tab (ride request) + Driver tab (go online, accept/reject, navigate, earnings) | expo-router tabs; react-native-maps MapView + Marker; socket.io-client |
</phase_requirements>

---

## Summary

Phase 3 adds a complete ride-hailing module to the ISEYAA super-platform. The backend extends the existing NestJS monolith with a `TransportModule` containing a REST controller, a business-logic service, and a WebSocket gateway — the same structural pattern used by `StaysModule` and `MarketplaceModule`. Geo-matching uses Upstash Redis's `GEOSEARCH` command (fully supported, verified against official Upstash compatibility docs) via the existing `ioredis` client already wired through `RedisService`. The 60-second match timeout is handled by `SchedulerRegistry.addTimeout()` registered per trip request, which is already available because `ScheduleModule` is imported in `AppModule`. Trip-completion earnings credit reuses `WalletService.creditWallet()` directly — a synchronous in-transaction call that is appropriate here because the trip-completion event originates in the same service (not a cross-service Kafka event).

The mobile side requires adding two new tabs (`transport` and `driver`) to the existing expo-router tab layout, plus installing `react-native-maps` (~1.14.0 — Old Architecture compatible with RN 0.74), `expo-location` (~17.0.0 — SDK 51 peer), and `socket.io-client` (4.8.3 — already the runtime version used by the backend's socket.io peer). No new backend infrastructure is needed: the WebSocket gateway attaches to the same HTTP server port (3001) as the REST API.

**Primary recommendation:** Build `TransportModule` as a standard NestJS module alongside existing modules; extend Prisma schema with `Driver`, `Vehicle`, `Trip`, and `TripEvent` models; use `RedisService` raw client for `GEOADD`/`GEOSEARCH`/`ZREM`; attach `TransportGateway` to the existing HTTP server; wire wallet credit directly on trip completion via `WalletService.creditWallet()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Driver profile CRUD + KYC approval | API / Backend | — | Server-authoritative; LGA_ADMIN approval mutates DB status |
| Fare estimation + surge calculation | API / Backend | — | Multiplier computed from Redis geo counts; must not be client-computed |
| Driver geo-matching (GEOSEARCH) | API / Backend | Redis | Redis holds driver positions; backend queries them on each ride request |
| Driver online/offline state | Redis (primary) + PostgreSQL (secondary) | — | Redis for low-latency geo-set membership; DB for audit |
| Live GPS position streaming | WebSocket Gateway (backend) | — | Broker between driver and rider sockets via trip-room pattern |
| GPS position collection (driver) | Mobile — Driver tab | expo-location | `watchPositionAsync` in foreground; emits to gateway every 2s |
| Map display (rider + driver) | Mobile — both tabs | react-native-maps | `MapView` + `Marker` for live positions |
| Trip-completion wallet credit | API / Backend | WalletService | Synchronous Prisma transaction — no Kafka needed for same-service event |
| Earnings dashboard data | API / Backend | PostgreSQL | Prisma aggregate queries on `trips` table |
| Mobile UI — Transport + Driver tabs | Mobile / Client | expo-router | New tabs in existing tab layout |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/websockets | 11.1.19 | WebSocket gateway decorators | NestJS official; same major as rest of backend |
| @nestjs/platform-socket.io | 11.1.19 | socket.io adapter for NestJS | Official adapter; enables room-based messaging |
| socket.io | 4.8.3 | WebSocket server (peer of platform-socket.io) | Industry standard; React Native client-compatible |
| ioredis (existing) | 5.3.2 | GEOADD / GEOSEARCH / ZREM for driver geo-set | Already in project; Upstash-compatible |
| @nestjs/schedule (existing) | 4.0.1 | SchedulerRegistry.addTimeout for match timeout | Already in AppModule; no new install |
| prisma (existing) | 5.11.0 | Schema migrations for new models | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| socket.io-client | 4.8.3 | WebSocket client for mobile | Transport + Driver tabs only |
| react-native-maps | ~1.14.0 | MapView + Marker for driver/rider position | Both Transport and Driver tabs |
| expo-location | ~17.0.0 | watchPositionAsync for driver GPS | Driver tab only (foreground tracking) |
| expo-task-manager | — | Background location (future) | Not required for Phase 3; foreground tracking sufficient for MVP |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| socket.io / @nestjs/platform-socket.io | @nestjs/platform-ws (native WebSocket) | ws is lighter but lacks rooms, namespaces, auto-reconnect; socket.io client is better supported on React Native |
| Redis GEOSEARCH | PostGIS geography queries | PostGIS requires extension install on Neon — not confirmed available; Redis already in stack and Upstash confirmed to support GEOSEARCH |
| Direct WalletService.creditWallet() | Kafka event (trip.completed topic) | Kafka adds latency and failure modes for an in-process event; same-service direct call is simpler and safe |
| react-native-maps | expo-maps (new) | expo-maps requires Expo SDK 53+; not compatible with SDK 51 |

**Installation (backend):**
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io --workspace=backend
```

**Installation (mobile):**
```bash
npx expo install react-native-maps expo-location socket.io-client --workspace=mobile
# react-native-maps: pin to ~1.14.0 for SDK 51 Old Architecture compatibility
```

**Version verification:** [VERIFIED: npm registry 2026-05-12]
- `@nestjs/websockets`: 11.1.19
- `@nestjs/platform-socket.io`: 11.1.19
- `socket.io`: 4.8.3
- `socket.io-client`: 4.8.3
- `react-native-maps`: 1.27.2 latest; use ~1.14.0 for SDK 51 [ASSUMED — SDK 51 peer compatibility not confirmed via official Expo versioning docs for this specific version; see Assumptions Log]
- `expo-location`: ~17.0.0 [VERIFIED: npm registry — 17.0.0 and 17.0.1 published against SDK 51 peer range]

---

## Architecture Patterns

### System Architecture Diagram

```
Mobile (Driver)                  Backend (Port 3001)              Redis (Upstash)
─────────────────               ─────────────────────────         ──────────────────
expo-location                   TransportGateway (WS)            drivers:online (Geo Set)
  watchPositionAsync()           ├─ handleConnection()             GEOADD / GEOSEARCH
  every 2s ─────────────────►   │    verifyJWT(handshake.auth.token)    / ZREM
                                 ├─ @SubscribeMessage('driver:location')
                                 │    → GEOADD drivers:online
                                 │    → server.to(tripId).emit('driver:location')
                                 │
Mobile (Rider)                   ├─ @SubscribeMessage('rider:request')
─────────────────               │    → TransportService.requestRide()
TransportScreen                  │         GEOSEARCH for nearest driver
  socket.emit('rider:request')─► │         SchedulerRegistry.addTimeout(60s)
  socket.on('driver:matched')◄── │         notify driver via socket
  socket.on('driver:location')◄──┘
                                 │
                                 TransportService (REST + business logic)
                                 ├─ POST /transport/drivers      (TRANSPORT-01)
                                 ├─ POST /transport/go-online    (GEOADD)
                                 ├─ POST /transport/go-offline   (ZREM)
                                 ├─ GET  /transport/fare-estimate (TRANSPORT-02)
                                 ├─ POST /transport/trips        (request ride)
                                 ├─ PATCH /transport/trips/:id/accept
                                 ├─ PATCH /transport/trips/:id/complete → WalletService.creditWallet()
                                 └─ GET  /transport/drivers/earnings    (TRANSPORT-07)
                                 │
                                 PostgreSQL (Neon)
                                 ├─ Driver, Vehicle, Trip, TripEvent models
                                 └─ Transaction audit via WalletService
```

### Recommended Project Structure
```
backend/src/modules/transport/
├── __tests__/
│   └── transport.service.spec.ts
├── dto/
│   ├── create-driver.dto.ts
│   ├── go-online.dto.ts
│   ├── request-ride.dto.ts
│   └── complete-trip.dto.ts
├── transport.controller.ts
├── transport.gateway.ts          ← WebSocket gateway
├── transport.module.ts
└── transport.service.ts

mobile/app/(tabs)/
├── transport.tsx                 ← Rider: request ride, map, live tracking
└── driver.tsx                   ← Driver: go online, accept/reject, earnings
```

### Pattern 1: NestJS WebSocket Gateway with JWT Auth and Trip Rooms

**What:** A `@WebSocketGateway()` decorator on a class that implements `OnGatewayConnection`/`OnGatewayDisconnect`. On connection, the JWT is extracted from `socket.handshake.auth.token` and verified. Clients join a trip-specific room (`tripId`) so the gateway can relay GPS updates between rider and driver without broadcasting to all sockets.

**When to use:** Any real-time bidirectional event where participants need scoped grouping (rider ↔ driver per trip).

```typescript
// Source: verified from docs.nestjs.com/websockets/gateways + oneuptime.com/blog
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect,
  ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // No port arg → attaches to same HTTP server as REST API (port 3001)
})
@Injectable()
export class TransportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

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
    // If driver disconnects mid-trip, mark driver as unavailable
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
    // Relay to rider in same trip room
    this.server.to(`trip:${data.tripId}`).emit('driver:location', {
      lat: data.lat, lng: data.lng,
    });
    // Also update Redis geo-set for ongoing matching
  }
}
```

### Pattern 2: Redis GEOADD / GEOSEARCH / ZREM for Driver Geo-Set

**What:** Drivers are stored in a Redis sorted set (`drivers:online`) as geo-encoded members. On go-online, the backend calls `GEOADD`. On ride request, it calls `GEOSEARCH FROMLONLAT BYRADIUS ASC COUNT 1`. On go-offline, it calls `ZREM`.

**When to use:** Any time the 60-second nearest-driver match runs.

```typescript
// Source: VERIFIED — Upstash docs confirm GEOSEARCH supported;
//         ioredis raw command verified from redis.io/docs/latest/commands/geosearch/
//         and medium.com/mkdir-awesome ioredis + Upstash example

// RedisService needs two new methods — OR use client directly:
async addDriverOnline(driverId: string, lng: number, lat: number): Promise<void> {
  await this.client.geoadd('drivers:online', lng, lat, driverId);
  // TTL: EXPIRE to auto-expire stale drivers if server crash
  await this.client.expire('drivers:online', 3600); // 1-hour TTL on key
}

async findNearestDriver(lng: number, lat: number, radiusKm = 5): Promise<string[]> {
  // GEOSEARCH key FROMLONLAT lng lat BYRADIUS r km ASC COUNT 1 WITHDIST
  const results = await this.client.geosearch(
    'drivers:online',
    'FROMLONLAT', lng, lat,
    'BYRADIUS', radiusKm, 'km',
    'ASC', 'COUNT', 1, 'WITHDIST',
  ) as [string, string][];
  return results.map(([memberId]) => memberId);
}

async removeDriverOnline(driverId: string): Promise<void> {
  await this.client.zrem('drivers:online', driverId);
}
```

> **Note:** `RedisService` currently exposes only `get/set/del/exists/ttl/incr/expire`. For geo commands, the transport service must accept `RedisService` and call the underlying `ioredis` client via a new `getClient()` accessor — or add dedicated geo methods to `RedisService`. The latter is preferred for testability.

### Pattern 3: 60-Second Match Timeout via SchedulerRegistry

**What:** On every ride request, register a named Node.js timeout with `SchedulerRegistry.addTimeout()`. If no driver accepts within 60s, the timeout fires and marks the trip `EXPIRED`, notifying the rider.

**When to use:** Per-ride-request timeout; must be cancellable on driver acceptance.

```typescript
// Source: VERIFIED — nestjs.com docs + deepwiki.com/nestjs/schedule/5-usage-examples
import { SchedulerRegistry } from '@nestjs/schedule';

constructor(private schedulerRegistry: SchedulerRegistry) {}

scheduleMatchTimeout(tripId: string): void {
  const timeoutId = setTimeout(async () => {
    await this.expireUnmatchedTrip(tripId);
    // Emit 'trip:expired' to rider's socket room
    this.gateway.server.to(`trip:${tripId}`).emit('trip:expired');
  }, 60_000); // 60 seconds

  this.schedulerRegistry.addTimeout(`match:${tripId}`, timeoutId);
}

cancelMatchTimeout(tripId: string): void {
  if (this.schedulerRegistry.doesExist('timeout', `match:${tripId}`)) {
    this.schedulerRegistry.deleteTimeout(`match:${tripId}`);
  }
}
```

### Pattern 4: Wallet Credit on Trip Completion (Direct Call)

**What:** On `PATCH /transport/trips/:id/complete`, `TransportService` calls `WalletService.creditWallet()` directly — the same synchronous Prisma transaction pattern used by `StaysService` for escrow release. No Kafka needed because trip completion originates in the same process.

**When to use:** Same-service wallet credit; trip completion is always backend-initiated.

```typescript
// Source: VERIFIED — wallet.service.ts in codebase (creditWallet signature confirmed)
async completeTrip(tripId: string, driverId: string): Promise<void> {
  const trip = await this.prisma.trip.findFirst({ where: { id: tripId } });
  if (!trip || trip.status !== 'IN_PROGRESS') throw new BadRequestException('Invalid trip state');

  const driverEarnings = Number(trip.fare) * 0.85; // 85% to driver
  const ref = `ISY-DRV-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const driverWallet = await this.prisma.wallet.findFirst({ where: { userId: driverId } });

  await this.prisma.$transaction([
    this.prisma.trip.update({ where: { id: tripId }, data: { status: 'COMPLETED', completedAt: new Date() } }),
  ]);

  // Direct call — same module, synchronous, safe
  await this.walletService.creditWallet(
    driverWallet!.id,
    driverEarnings,
    ref,
    `Trip earnings — ${trip.id}`,
    'transport',
  );
}
```

### Pattern 5: Mobile socket.io-client Connection with JWT

**What:** In the mobile app, create a socket connection at module load with `auth: { token }` in the options object. The token is retrieved from `expo-secure-store`. Use `transports: ['websocket']` to skip HTTP polling (required for React Native).

```typescript
// Source: VERIFIED — socket.io/how-to/use-with-react-native confirms transports config
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL!;

export async function createTransportSocket() {
  const token = await SecureStore.getItemAsync('accessToken');
  return io(`${API_BASE}`, {
    transports: ['websocket'],   // Required for React Native
    auth: { token },
  });
}
```

### Anti-Patterns to Avoid

- **Storing driver positions only in PostgreSQL:** Database writes every 2s from 100s of concurrent drivers will saturate I/O; use Redis geo-set as the primary online-driver store.
- **Broadcasting GPS to all sockets:** `server.emit('driver:location')` leaks positions to all connected users; always use `server.to('trip:{tripId}').emit(...)` for scoped delivery.
- **Hardcoding the 15% platform fee:** CLAUDE.md explicitly forbids hardcoding platform fees. Always read from `PlatformConfig` table with key `transport_platform_fee_pct`.
- **Using `@OnEvent()` for trip completion wallet credit:** Phase 2 (02-11) removed all `@OnEvent()` handlers. Do not reintroduce EventEmitter2 coupling. Use direct service calls within the same module.
- **Single Redis geo-set without TTL:** If the backend crashes, stale driver entries persist forever. Set a TTL on the key and refresh it on each `GEOADD`.
- **HTTP polling in socket.io from React Native:** Default socket.io-client starts with HTTP long-polling, which fails behind some mobile networks. Always set `transports: ['websocket']`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geo-radius driver search | Custom Haversine query loop in JS | Redis GEOSEARCH | Redis GEOSEARCH is O(N+log(M)) indexed; JS loop over all drivers is O(N) per request with no indexing |
| WebSocket room management | Manual Map<tripId, Set<socketId>> | socket.io rooms | socket.io rooms handle join/leave/disconnect cleanup automatically |
| JWT verification on WebSocket | Custom base64 decode + HMAC check | `JwtService.verify()` | Same service already used by HTTP guards; reuse avoids key management divergence |
| Match timeout with setTimeout only | `global[tripId] = setTimeout(...)` | `SchedulerRegistry.addTimeout()` | Registry allows named deletion; raw global references leak and can't be introspected |
| Fare calculation per vehicle type | Inline magic numbers in controller | PlatformConfig table rows | Config table is the mandated source per CLAUDE.md; enables runtime adjustments without redeploy |

**Key insight:** The geo-matching, room management, and timeout problems all have O(1) or O(log N) solutions available through existing infrastructure (Redis + socket.io + SchedulerRegistry). Hand-rolling any of these produces worse algorithmic complexity AND eliminates battle-tested edge case handling.

---

## Prisma Schema Additions

### New Enums
```prisma
enum VehicleType {
  BIKE
  TRICYCLE
  CAR
  MINIBUS
}

enum DriverStatus {
  PENDING_REVIEW   // submitted, awaiting LGA_ADMIN approval
  APPROVED         // can go online
  SUSPENDED        // blocked by admin
  REJECTED         // KYC failed
}

enum TripStatus {
  SEARCHING        // waiting for driver match
  MATCHED          // driver accepted
  ARRIVED          // driver at pickup
  IN_PROGRESS      // trip started
  COMPLETED
  CANCELLED
  EXPIRED          // 60s match timeout
}
```

### New Models
```prisma
model Driver {
  id              String       @id @default(uuid())
  userId          String       @unique
  user            User         @relation(fields: [userId], references: [id])
  licenceNumber   String
  licenceExpiry   DateTime
  status          DriverStatus @default(PENDING_REVIEW)
  approvedById    String?      // LGA_ADMIN who approved
  approvedAt      DateTime?
  isOnline        Boolean      @default(false)
  lastSeenAt      DateTime?
  avgRating       Decimal      @default(0)
  totalTrips      Int          @default(0)
  acceptanceRate  Decimal      @default(0)
  metadata        Json?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?

  vehicles Vehicle[]
  tripsAsDriver Trip[] @relation("DriverTrips")

  @@map("drivers")
}

model Vehicle {
  id           String      @id @default(uuid())
  driverId     String
  driver       Driver      @relation(fields: [driverId], references: [id])
  type         VehicleType
  make         String       // e.g., "Toyota"
  model        String       // e.g., "Camry"
  year         Int
  plateNumber  String       @unique
  colour       String
  imageUrl     String?
  isActive     Boolean      @default(true)
  metadata     Json?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  deletedAt    DateTime?

  trips Trip[]

  @@map("vehicles")
}

model Trip {
  id              String      @id @default(uuid())
  riderId         String
  rider           User        @relation("RiderTrips", fields: [riderId], references: [id])
  driverId        String?
  driver          Driver?     @relation("DriverTrips", fields: [driverId], references: [id])
  vehicleId       String?
  vehicle         Vehicle?    @relation(fields: [vehicleId], references: [id])
  vehicleType     VehicleType
  pickupLat       Decimal
  pickupLng       Decimal
  pickupAddress   String?
  dropoffLat      Decimal
  dropoffLng      Decimal
  dropoffAddress  String?
  distanceKm      Decimal?
  fare            Decimal?
  surgeMultiplier Decimal     @default(1)
  platformFee     Decimal?    // fare * 0.15
  driverEarnings  Decimal?    // fare * 0.85
  status          TripStatus  @default(SEARCHING)
  requestedAt     DateTime    @default(now())
  matchedAt       DateTime?
  arrivedAt       DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  riderRating     Int?
  driverRating    Int?
  cancelReason    String?
  metadata        Json?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  deletedAt       DateTime?

  events TripEvent[]

  @@map("trips")
}

model TripEvent {
  id        String   @id @default(uuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id])
  event     String   // "DRIVER_MATCHED", "TRIP_STARTED", "TRIP_COMPLETED", etc.
  metadata  Json?
  createdAt DateTime @default(now())

  @@map("trip_events")
}
```

### Existing User Model Change
Add relation fields only (no new columns needed — `DRIVER` already exists in `UserRole` enum):
```prisma
// In model User — add relation:
driverProfile   Driver?
riderTrips      Trip[]   @relation("RiderTrips")
```

### New PlatformConfig Seeds Required
```
transport_platform_fee_pct      = 15          (platform retains 15%)
transport_base_fare_bike        = 200         (₦200 base)
transport_base_fare_tricycle    = 350
transport_base_fare_car         = 500
transport_base_fare_minibus     = 700
transport_per_km_bike           = 50          (₦50/km)
transport_per_km_tricycle       = 80
transport_per_km_car            = 120
transport_per_km_minibus        = 150
transport_surge_threshold       = 1.5         (demand/supply ratio)
transport_match_radius_km       = 5           (initial GEOSEARCH radius)
```

---

## Surge Pricing Algorithm

**Verified pattern:** Compare demand (active `SEARCHING` + `MATCHED` trip records in a geo-zone) to supply (online driver count in same zone via Redis ZCARD). If ratio > threshold, apply multiplier.

```typescript
// Source: [ASSUMED — algorithm structure; thresholds are from REQUIREMENTS.md TRANSPORT-05]
async getSurgeMultiplier(lat: number, lng: number): Promise<number> {
  // Supply: count online drivers within radius
  const nearbyDrivers = await this.redis.geosearch(
    'drivers:online', 'FROMLONLAT', lng, lat,
    'BYRADIUS', 5, 'km', 'COUNT', 999,
  );
  const supply = nearbyDrivers.length;

  // Demand: count active trip requests in last 5 minutes (Prisma)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const demand = await this.prisma.trip.count({
    where: {
      status: { in: ['SEARCHING', 'MATCHED'] },
      requestedAt: { gte: fiveMinAgo },
      // Rough geo-filter via pickupLat/pickupLng bounding box
    },
  });

  if (supply === 0) return 2.0; // Max surge when no drivers
  const ratio = demand / supply;
  const threshold = 1.5; // From PlatformConfig transport_surge_threshold
  if (ratio <= threshold) return 1.0;
  // Cap multiplier at 2.0; round to nearest 0.1
  return Math.min(Math.round((ratio / threshold) * 10) / 10, 2.0);
}
```

> **Note on geo-filter for demand:** PostgreSQL does not have a native geospatial index without PostGIS. The demand count uses a bounding-box approximation (lat ± 0.05°, lng ± 0.05° ≈ ~5km) via Prisma `where` clause. This is a pragmatic MVP approach. [ASSUMED — PostGIS not confirmed available on Neon free tier]

---

## Common Pitfalls

### Pitfall 1: WebSocket Gateway Port Collision
**What goes wrong:** Specifying an explicit port in `@WebSocketGateway(3002)` starts a second HTTP server separate from the REST API. This means two ports must be forwarded on Railway, and the mobile client must connect to a different URL.
**Why it happens:** When a port is specified, NestJS creates a standalone socket.io server instead of sharing the existing HTTP server.
**How to avoid:** Omit the port argument — `@WebSocketGateway({ cors: { origin: '*' } })` — so the gateway attaches to the same server as the REST API on port 3001.
**Warning signs:** Console output shows "WebSocket server listening on port 3002" alongside "Application is running on: http://0.0.0.0:3001".

### Pitfall 2: ioredis Geo Command API Mismatch
**What goes wrong:** `this.client.geosearch(...)` returns a 2D array when `WITHDIST` is used, not a flat array of strings. Treating the result as `string[]` causes runtime crashes.
**Why it happens:** ioredis returns `[['driverId', '2.34'], ['driverId2', '5.01']]` when `WITHDIST` is present; `['driverId', 'driverId2']` without it.
**How to avoid:** Always destructure: `const results = await client.geosearch(...) as [string, string][]` when using `WITHDIST`, or omit `WITHDIST` and cast as `string[]`.
**Warning signs:** `TypeError: cannot read property 'userId' of undefined` in geo-matching logic.

### Pitfall 3: React Native socket.io HTTP Polling Failure
**What goes wrong:** socket.io-client defaults to HTTP long-polling then upgrades to WebSocket. On Android (API 28+) and behind some mobile proxies, cleartext HTTP is blocked, causing silent connection failures.
**Why it happens:** socket.io's default `transports: ['polling', 'websocket']` starts with HTTP which may be blocked.
**How to avoid:** Always pass `transports: ['websocket']` in the socket.io-client options on mobile.
**Warning signs:** Socket connects in Expo Go (which has special network permissions) but fails on production builds.

### Pitfall 4: Redis EXPIRE on Geo Set Key (Not Per-Member)
**What goes wrong:** Calling `EXPIRE 'drivers:online' 3600` expires the ENTIRE geo set — taking all online drivers offline — not just individual members.
**Why it happens:** Redis TTL applies to the key, not individual sorted set members.
**How to avoid:** Store each driver's last-seen timestamp separately (e.g., `driver:heartbeat:{driverId}`) with a TTL. Run a periodic cleanup cron (every 60s) that removes stale entries from `drivers:online` using `ZREM`. Alternatively, refresh the key TTL on every `GEOADD` without setting an absolute TTL.
**Warning signs:** All online drivers disappear from matching after exactly 1 hour.

### Pitfall 5: Missing User→Driver Relation in Prisma
**What goes wrong:** Adding `driverProfile Driver?` to the `User` model without a matching `@@relation` causes `prisma migrate dev` to fail with a "relation missing" error.
**Why it happens:** Prisma requires both sides of a relation to be declared.
**How to avoid:** Both `User.driverProfile` (optional `Driver?`) and `Driver.user` (required `User`) must declare the relation. The `Driver` model owns the FK (`userId String @unique`).
**Warning signs:** `Error: The field 'driverProfile' on model 'User' is missing the @relation attribute's 'fields' argument`.

### Pitfall 6: react-native-maps on Expo SDK 51 with Google Maps iOS
**What goes wrong:** Google Maps on iOS with Expo SDK 51 triggers a build error: "AirGoogleMaps dir must be added to your xCode project".
**Why it happens:** The Expo SDK 51 + react-native-maps combination has a known integration issue with Google Maps on iOS.
**How to avoid:** Use Apple Maps (default) on iOS by not setting `provider="google"` on `MapView`. Apple Maps works without any API key. Only set `provider="google"` on Android where Google Maps is required.
**Warning signs:** iOS EAS build fails with AirGoogleMaps compilation error.

---

## Code Examples

### TransportModule Registration
```typescript
// transport.module.ts
// Source: [ASSUMED — follows exact pattern of stays.module.ts in codebase]
import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportGateway } from './transport.gateway';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [TransportController],
  providers: [TransportService, TransportGateway],
  exports: [TransportService],
})
export class TransportModule {}
```

### Go-Online REST Endpoint (GEOADD)
```typescript
// POST /api/v1/transport/go-online
// Source: [ASSUMED — pattern follows stays controller conventions]
async goOnline(driverId: string, dto: { lat: number; lng: number }): Promise<void> {
  const driver = await this.prisma.driver.findUnique({ where: { userId: driverId } });
  if (!driver || driver.status !== 'APPROVED') {
    throw new ForbiddenException('Driver not approved for transport');
  }
  await this.redis.addDriverOnline(driver.id, dto.lng, dto.lat);
  await this.prisma.driver.update({
    where: { id: driver.id },
    data: { isOnline: true, lastSeenAt: new Date() },
  });
}
```

### Reference Prefix Convention (extends CLAUDE.md naming)
```
ISY-DRV-<12-char-uppercase>   ← driver earnings credit transaction
ISY-TRP-<12-char-uppercase>   ← trip payment reference (future Paystack use)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GEORADIUS (deprecated) | GEOSEARCH FROMLONLAT BYRADIUS | Redis 6.2 | GEORADIUS still works on Upstash but GEOSEARCH is preferred; ioredis supports both |
| @OnEvent() for wallet credit | Direct service call | Phase 2 (02-11) | EventEmitter2 handlers removed; Kafka only for cross-service events |
| expo-maps (new SDK 53+ API) | react-native-maps | SDK 53 not in scope | expo-maps requires SDK 53+; react-native-maps is the correct choice for SDK 51 |
| HTTP long-polling (socket.io default) | `transports: ['websocket']` | socket.io v3+ | React Native requires explicit WebSocket transport to avoid polling failures |

**Deprecated/outdated:**
- `GEORADIUS` command: deprecated since Redis 6.2 — use `GEOSEARCH` instead (both work on Upstash but GEOSEARCH is canonical)
- `@OnEvent()` handlers: removed in Phase 2 — do not reintroduce

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | react-native-maps ~1.14.0 is the correct pinned version for Expo SDK 51 + RN 0.74 Old Architecture | Standard Stack / Pitfall 6 | Wrong pin causes build failure; need to test `npx expo install react-native-maps` to get Expo's resolved version |
| A2 | PostGIS is not available on Neon free tier, so surge demand count uses bounding-box Prisma query | Surge Pricing Algorithm | If PostGIS is available, a proper ST_DWithin query would be more accurate |
| A3 | Surge pricing demand window is 5 minutes (not defined in REQUIREMENTS.md — only ratio threshold 1.5× is specified) | Surge Pricing Algorithm | If wrong window, surge fires too early/late; should be a PlatformConfig value |
| A4 | Driver GPS update interval is 2 seconds (stated in TRANSPORT-04) — foreground tracking only is sufficient for Phase 3 MVP | Standard Stack | If background tracking is needed, expo-task-manager must also be installed |
| A5 | WalletService.creditWallet() gateway field is hardcoded to 'PAYSTACK' — should be 'INTERNAL' for driver earnings | Code Examples | If left as PAYSTACK, reporting incorrectly attributes earnings to Paystack gateway |

---

## Open Questions (RESOLVED)

1. **react-native-maps exact version for SDK 51**
   - What we know: Latest is 1.27.2; SDK 51 has a known Google Maps iOS issue; `npx expo install` resolves the compatible version automatically
   - What's unclear: Whether Expo's resolver for SDK 51 pins to 1.14.0 or a later version
   - Recommendation: Run `npx expo install react-native-maps` in mobile workspace and pin whatever version Expo resolves, rather than manually specifying

2. **creditWallet gateway field for driver earnings**
   - What we know: `creditWallet()` hardcodes `gateway: 'PAYSTACK'` in the transaction record
   - What's unclear: Whether the planner should add a `gateway` parameter override or add a new `creditWalletInternal()` method
   - Recommendation: Add an optional `gateway` parameter to `creditWallet()` defaulting to `'PAYSTACK'` for backward compatibility; transport calls with `'INTERNAL'`

3. **Surge demand geo-filter precision**
   - What we know: PostgreSQL without PostGIS cannot do circle radius filtering efficiently
   - What's unclear: Whether Neon supports PostGIS extension
   - Recommendation: Use bounding-box approximation for MVP; add a note in the plan to revisit with PostGIS in Phase 6

4. **Driver heartbeat / stale position cleanup**
   - What we know: Redis TTL on a geo key removes all members
   - What's unclear: Whether a periodic cron or heartbeat ping is the right pattern
   - Recommendation: Use a `driver:heartbeat:{driverId}` key with 90-second TTL; a `@Cron('*/30 * * * * *')` (every 30s) removes drivers from geo-set whose heartbeat has expired

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Backend runtime | ✓ | v24.15.0 | — |
| Docker | Local dev Postgres+Redis | ✓ | 29.4.2 | — |
| npm workspaces | Multi-package install | ✓ | 11.12.1 | — |
| @nestjs/websockets | WebSocket gateway | ✗ (not installed) | — | Install in backend |
| @nestjs/platform-socket.io | socket.io adapter | ✗ (not installed) | — | Install in backend |
| socket.io-client | Mobile WebSocket | ✗ (not in mobile) | — | Install in mobile |
| react-native-maps | Mobile map display | ✗ (not in mobile) | — | Install in mobile |
| expo-location | Driver GPS | ✗ (not in mobile) | — | Install in mobile |
| Upstash GEOSEARCH | Geo-matching | ✓ (verified supported) | — | GEORADIUS (deprecated but works) |

**Missing dependencies with no fallback:** None — all missing packages have confirmed install paths.

**Missing dependencies with fallback:** All missing packages listed above require `npm install` or `npx expo install` in Wave 0.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/jest.config.js` |
| Quick run command | `npx jest --testPathPattern=transport --no-coverage` |
| Full suite command | `npm run test --workspace=backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRANSPORT-01 | Driver profile create, status transitions (PENDING→APPROVED) | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-02 | Fare estimate calculation with/without surge | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-03 | Nearest driver selected from mocked Redis GEOSEARCH result | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-04 | Gateway emits driver:location to correct trip room | unit | `npx jest transport.gateway --no-coverage` | ❌ Wave 0 |
| TRANSPORT-05 | Surge multiplier = 2.0 when supply=0, 1.0 when ratio<1.5 | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-06 | WalletService.creditWallet called with 85% of fare on complete | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-07 | Earnings dashboard aggregation returns correct totals | unit | `npx jest transport.service --no-coverage` | ❌ Wave 0 |
| TRANSPORT-08 | Mobile tabs render — screen snapshot or manual | manual | N/A (mobile UI — Expo Go) | ❌ manual |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=transport --no-coverage`
- **Per wave merge:** `npm run test --workspace=backend`
- **Phase gate:** Full backend suite green (`npm run test --workspace=backend`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/transport/__tests__/transport.service.spec.ts` — covers TRANSPORT-01 through TRANSPORT-07
- [ ] `backend/src/modules/transport/__tests__/transport.gateway.spec.ts` — covers TRANSPORT-04
- [ ] Mock for `RedisService` geo methods (geosearch, geoadd, zrem)
- [ ] Mock for `WalletService.creditWallet`
- [ ] Mock for `SchedulerRegistry`
- [ ] Install: `npm install @nestjs/websockets @nestjs/platform-socket.io socket.io --workspace=backend`
- [ ] Install: `npx expo install react-native-maps expo-location socket.io-client` in mobile workspace

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT verified in `handleConnection()` via `JwtService.verify()` |
| V3 Session Management | yes | socket.io disconnect on invalid/expired token; no persistent WS session beyond trip |
| V4 Access Control | yes | Driver-only routes behind `@Roles(UserRole.DRIVER)`; rider routes behind `@Roles(UserRole.CITIZEN, UserRole.TOURIST)` |
| V5 Input Validation | yes | All DTOs via `class-validator`; lat/lng validated as `@IsNumber()` with `@Min`/`@Max` range |
| V6 Cryptography | no | No new cryptographic operations; wallet reference uses `uuid` v4 |

### Known Threat Patterns for Transport Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fare tampering (client sends modified fare) | Tampering | Fare always computed server-side from PlatformConfig; client sends only pickup/dropoff coordinates |
| Unauthorized driver position injection (fake GEOADD) | Spoofing | go-online only callable by approved DRIVER role; JWT verified on every REST call |
| GPS location spoofing by driver | Spoofing | [ASSUMED] No anti-spoofing in Phase 3 MVP; Phase 6 adds Haversine plausibility check |
| Wallet double-credit on trip complete | Elevation of Privilege | `trip.status` checked before credit; trip updated to COMPLETED in same Prisma transaction |
| WS message injection (ride request from non-citizen) | Spoofing | JWT role verified in `handleConnection()`; `@Roles` guard on `@SubscribeMessage` handlers |
| Surge multiplier bypass | Tampering | Fare estimate always re-computed at trip confirmation time; client-supplied multiplier ignored |

---

## Sources

### Primary (HIGH confidence)
- Upstash Redis compatibility docs (upstash.com/docs/redis/overall/rediscompatibility) — GEOSEARCH confirmed supported
- redis.io/docs/latest/commands/geosearch/ — GEOSEARCH syntax and return format
- oneuptime.com blog (2026-02-02) — NestJS WebSocket gateway patterns, WsAuthGuard, room management
- wanago.io/2021/01/25/api-nestjs-chat-websockets/ — NestJS WebSocket + JWT auth pattern
- socket.io/how-to/use-with-react-native — React Native socket.io-client configuration
- npm registry (verified 2026-05-12) — all package versions confirmed current

### Secondary (MEDIUM confidence)
- medium.com/mkdir-awesome — ioredis GEOSEARCH with Upstash confirmed working in practice
- deepwiki.com/nestjs/schedule — SchedulerRegistry.addTimeout API
- ISEYAA codebase — existing wallet.service.ts, redis.service.ts, kafka.service.ts patterns

### Tertiary (LOW confidence)
- Surge pricing algorithm details (appicial.com blog) — structural pattern only; specific parameters from REQUIREMENTS.md
- react-native-maps SDK 51 version compatibility — flagged as Assumption A1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified from npm registry; Upstash geo support verified from official docs
- Architecture: HIGH — follows established NestJS module patterns from existing codebase
- Prisma schema: HIGH — schema design follows project conventions (UUIDs, soft deletes, enums, relations)
- WebSocket gateway: HIGH — verified code examples from official NestJS blog + oneuptime article
- Redis geo commands: HIGH — verified from official Redis docs + Upstash compatibility page + medium ioredis example
- Mobile react-native-maps: MEDIUM — version pinning for SDK 51 is an assumption; exact Expo resolver output unknown
- Surge pricing: MEDIUM — algorithm structure verified; surge demand geo-filter precision is approximate

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days — stable libraries, Redis commands are stable)
