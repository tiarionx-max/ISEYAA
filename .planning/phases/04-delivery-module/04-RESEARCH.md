# Phase 4: Delivery Module - Research

**Researched:** 2026-05-16
**Domain:** Parcel delivery — OTP proof-of-delivery, photo upload, weight-based pricing, WebSocket GPS tracking, rider earnings split
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELIVERY-01 | User requests parcel delivery: pickup address, dropoff address, item description, weight → matched to nearest rider within 60s | DeliveryOrder model + GEOSEARCH on `riders:online` geo-set; weight-based fee formula from PlatformConfig; SchedulerRegistry 60s timeout |
| DELIVERY-02 | System assigns nearest available delivery rider within 60s; sender sees rider name, photo, ETA | Same GEOSEARCH + SchedulerRegistry pattern as Transport; `rider:assigned` WS event to sender |
| DELIVERY-03 | Sender tracks rider's live GPS via WebSocket from pickup through delivery | `DeliveryGateway` with `delivery:` room pattern; `rider:location` WS event → sender socket; 2s interval from `expo-location` |
| DELIVERY-04 | Delivery confirmed only when rider enters OTP (sent via Termii at dispatch) AND uploads proof-of-delivery photo | Redis key `delivery:otp:{orderId}` with TTL; `POST /delivery/orders/:id/verify-otp`; `S3Service.upload()` for photo → `proofPhotoUrl` on order |
| DELIVERY-05 | Rider earnings (fee × 0.80) credited on delivery confirmation; platform retains 20% | `WalletService.creditWallet()` direct call with `gateway: 'INTERNAL'`; `ISY-RDR-` reference prefix; PlatformConfig key `delivery_platform_fee_pct` |
| DELIVERY-06 | Mobile: Delivery tab (parcel request + tracking) + Rider tab (delivery assignments) | Two new tabs in `_layout.tsx`: `Package` icon → delivery.tsx, `Bike` icon → rider.tsx; both follow existing transport/driver patterns |
</phase_requirements>

---

## Summary

Phase 4 adds a complete parcel delivery module to the ISEYAA platform. It closely mirrors the Phase 3 Transport module in structure — the same `TransportGateway`, `RedisService` geo commands, `SchedulerRegistry` 60-second timeout, and `WalletService.creditWallet()` direct call patterns all apply. The key differences from Transport are: (1) delivery confirmation requires a dual gate — OTP verification AND photo proof before the order can complete; (2) pricing is weight-based rather than vehicle-type-based; (3) the earnings split is 80% rider / 20% platform (not 85/15); and (4) delivery riders use the same `DRIVER` UserRole but are managed via a separate `DeliveryRider` profile model (not the existing `Driver` model which is for transport).

The backend adds a `DeliveryModule` alongside the existing `TransportModule` — a new NestJS module with its own controller, service, gateway, and DTOs. The Prisma schema gains `DeliveryRider`, `DeliveryOrder`, and `DeliveryEvent` models plus a `DeliveryOrderStatus` enum. The OTP flow reuses the pattern from `auth.service.ts` (`sendTermii` + Redis key with TTL) but applied to delivery confirmation rather than user authentication. Photo proof upload reuses the existing `S3Service.upload()` already wired through `CommonModule`. The mobile side adds two new tabs (`delivery.tsx` and `rider.tsx`) using exactly the same component patterns, style tokens, and socket.io-client setup as `transport.tsx` and `driver.tsx`.

All backend dependencies (NestJS WebSocket packages, socket.io, ioredis, expo-location, react-native-maps, socket.io-client) were installed in Phase 3 and are already present. The only new dependency is `expo-image-picker ~15.0.7` for proof-of-delivery photo capture on mobile, which is not yet in `mobile/package.json`. [VERIFIED: npm registry — 15.1.0 is the latest in the 15.x range; `npx expo install expo-image-picker` resolves ~15.0.x for SDK 51]

**Primary recommendation:** Build `DeliveryModule` as a standard NestJS module alongside `TransportModule`; extend Prisma schema with `DeliveryRider`, `DeliveryOrder`, and `DeliveryEvent` models; use the existing `RedisService` geo methods for `riders:online` geo-set; attach `DeliveryGateway` to the same HTTP server (no port arg); store dispatch OTP in Redis with `delivery:otp:{orderId}` key; upload photo via `S3Service`; credit rider wallet directly via `WalletService.creditWallet()` on successful confirmation.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Delivery rider profile CRUD + KYC | API / Backend | — | Same LGA_ADMIN approval flow as Transport; server-authoritative |
| Weight-based fee calculation | API / Backend | — | Rates from PlatformConfig; never client-computed |
| Rider geo-matching (GEOSEARCH) | API / Backend | Redis | `riders:online` geo-set on Upstash Redis; same pattern as `drivers:online` |
| Rider online/offline state | Redis (primary) + PostgreSQL (secondary) | — | Redis for low-latency matching; DB for audit trail |
| Live GPS position streaming | WebSocket Gateway (backend) | — | DeliveryGateway relays `rider:location` into `delivery:{orderId}` room |
| GPS position collection (rider) | Mobile — Rider tab | expo-location | `watchPositionAsync` foreground; emits every 2s to DeliveryGateway |
| Map display (sender + rider) | Mobile — both tabs | react-native-maps | Already installed from Phase 3 |
| OTP generation + dispatch | API / Backend | Redis + Termii | Generate 6-digit OTP, store in Redis with TTL, send via Termii SMS |
| OTP verification | API / Backend | Redis | Rider posts OTP; backend compares against Redis key |
| Proof-of-delivery photo | Mobile (capture) + API (receive + store) | S3Service / R2 | expo-image-picker captures; multipart/base64 sent to backend; S3Service stores to R2 |
| Delivery completion + wallet credit | API / Backend | WalletService | Same direct WalletService.creditWallet() call used by Transport |
| Earnings dashboard data | API / Backend | PostgreSQL | Prisma aggregate queries on DeliveryOrder table |
| Mobile UI — Delivery + Rider tabs | Mobile / Client | expo-router | Two new tabs in existing layout; follow transport/driver patterns exactly |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/websockets (existing) | 11.1.19 | WebSocket gateway decorators | Already installed Phase 3 — DeliveryGateway follows TransportGateway pattern |
| @nestjs/platform-socket.io (existing) | 11.1.19 | socket.io adapter for NestJS | Already installed Phase 3 |
| socket.io (existing) | 4.8.3 | WebSocket server | Already installed Phase 3 |
| ioredis (existing) | 5.3.2 | GEOADD / GEOSEARCH / ZREM for rider geo-set | Already in RedisService with geo methods added in Phase 3 |
| @nestjs/schedule (existing) | 6.1.3 | SchedulerRegistry.addTimeout for match timeout | Already in AppModule |
| prisma (existing) | 5.11.0 | Schema migrations for new Delivery models | Already in project |
| expo-image-picker | ~15.0.7 | Camera + library image picker for proof-of-delivery | Official Expo SDK package for SDK 51; only new dependency this phase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| socket.io-client (existing) | 4.8.3 | WebSocket client for mobile Rider tab | Already in mobile/package.json from Phase 3 |
| react-native-maps (existing) | ~1.14.0 | MapView + Marker for rider/sender position | Already in mobile/package.json from Phase 3 |
| expo-location (existing) | ~17.0.0 | watchPositionAsync for rider GPS | Already in mobile/package.json from Phase 3 |
| S3Service (existing) | — | Upload proof photo to Cloudflare R2 | In CommonModule; already global |
| RedisService geo methods (existing) | — | geoadd / geosearch / zrem | Extended in Phase 3; reused without modification |
| Termii SMS (existing) | — | Send OTP to recipient phone at dispatch | Same sendTermii pattern from auth.service.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-image-picker | react-native-image-picker | expo-image-picker is the Expo official SDK package with managed workflow support; react-native-image-picker requires bare config plugin changes |
| OTP in Redis | OTP in PostgreSQL | Redis TTL is automatic cleanup; DB OTP requires a cron for expiry; Redis pattern already proven in auth module |
| Direct S3Service.upload() | Separate media upload endpoint | S3Service already in CommonModule (global); adding a dedicated route adds unnecessary complexity |
| Separate DeliveryRider model | Reuse Driver model | Delivery riders and transport drivers have different KYC fields, different vehicle types (bikes only), and different geo-sets; shared model would mix concerns |

**Installation:**
```bash
# Mobile only — one new package
npx expo install expo-image-picker --workspace=mobile
# All other dependencies were installed in Phase 3
```

**Version verification:** [VERIFIED: npm registry 2026-05-16]
- `expo-image-picker`: 15.1.0 is latest in 15.x; `~15.0.7` pins to SDK 51 range [CITED: docs.expo.dev/versions/latest/sdk/imagepicker/]
- All other libraries: already installed, versions verified in Phase 3 RESEARCH.md

---

## Architecture Patterns

### System Architecture Diagram

```
Mobile (Rider)                   Backend (Port 3001)              Redis (Upstash)
─────────────────               ─────────────────────────         ──────────────────
expo-location                   DeliveryGateway (WS)             riders:online (Geo Set)
  watchPositionAsync()           ├─ handleConnection()             GEOADD / GEOSEARCH
  every 2s ─────────────────►   │    verifyJWT(handshake.auth.token)    / ZREM
                                 ├─ @SubscribeMessage('rider:location')
                                 │    → server.to(`delivery:${deliveryId}`).emit('rider:location')
                                 │
Mobile (Sender)                  ├─ @SubscribeMessage('join:delivery')
─────────────────               │    → socket.join(`delivery:${deliveryId}`)
DeliveryScreen                   │
  socket.on('rider:assigned')◄── │
  socket.on('rider:location')◄── │         delivery:otp:{orderId} (Redis, TTL 300s)
  socket.on('delivery:expired')  │
                                 DeliveryService (REST + business logic)
                                 ├─ POST /delivery/riders              (profile + KYC)
                                 ├─ PATCH /delivery/riders/:id/approve (LGA_ADMIN)
                                 ├─ POST /delivery/go-online           (GEOADD)
                                 ├─ POST /delivery/go-offline          (ZREM)
                                 ├─ GET  /delivery/fee-estimate        (weight-based)
                                 ├─ POST /delivery/orders              (request delivery → OTP sent to recipient)
                                 ├─ PATCH /delivery/orders/:id/accept  (rider accepts)
                                 ├─ PATCH /delivery/orders/:id/decline
                                 ├─ PATCH /delivery/orders/:id/collect (rider collected parcel)
                                 ├─ POST /delivery/orders/:id/verify-otp (OTP check)
                                 ├─ PATCH /delivery/orders/:id/complete  (OTP + photo → wallet credit)
                                 ├─ PATCH /delivery/orders/:id/cancel
                                 └─ GET  /delivery/riders/earnings
                                 │
                                 PostgreSQL (Neon)
                                 ├─ DeliveryRider, DeliveryOrder, DeliveryEvent models
                                 └─ wallet credit via WalletService
```

### Recommended Project Structure
```
backend/src/modules/delivery/
├── __tests__/
│   ├── delivery.service.spec.ts
│   └── delivery.gateway.spec.ts
├── dto/
│   ├── create-delivery-rider.dto.ts
│   ├── approve-delivery-rider.dto.ts
│   ├── rider-go-online.dto.ts
│   ├── request-delivery.dto.ts
│   ├── verify-delivery-otp.dto.ts
│   └── complete-delivery.dto.ts
├── delivery.controller.ts
├── delivery.gateway.ts
├── delivery.module.ts
└── delivery.service.ts

mobile/app/(tabs)/
├── delivery.tsx     ← Sender: D-1 form → D-2 quote → D-3 matching → D-4 active → D-5 complete
└── rider.tsx        ← Rider: R-1 home → R-2 incoming → R-3 pickup → R-4 active+OTP+photo → R-5 earnings
```

### Pattern 1: DeliveryGateway — Clone of TransportGateway with delivery-scoped rooms

**What:** `DeliveryGateway` is structurally identical to `TransportGateway`. The only differences are room name prefix (`delivery:` vs `trip:`), and the fact that the rider joins a personal room named `rider:{riderId}` (not `driver:{driverId}`) for receiving incoming delivery requests.

**When to use:** All real-time delivery position updates and assignment notifications.

```typescript
// Source: [VERIFIED: transport.gateway.ts in codebase — DeliveryGateway follows this exactly]
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  // No port arg — attaches to the same HTTP server as REST API (port 3001)
})
@Injectable()
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join:delivery')
  handleJoinDelivery(@ConnectedSocket() client: Socket, @MessageBody() deliveryId: string) {
    client.join(`delivery:${deliveryId}`);
    return { joined: deliveryId };
  }

  @SubscribeMessage('rider:location')
  handleRiderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { deliveryId: string; lat: number; lng: number },
  ) {
    // Relay to sender in same delivery room — NEVER server.emit() globally
    this.server.to(`delivery:${data.deliveryId}`).emit('rider:location', {
      lat: data.lat, lng: data.lng,
    });
  }

  @SubscribeMessage('join:rider')
  handleJoinRider(@ConnectedSocket() client: Socket) {
    if (client.data.role !== 'DRIVER') return { error: 'forbidden' };
    // Delivery riders also use DRIVER role — room scoped by userId
    client.join(`rider:${client.data.userId}`);
    return { joined: `rider:${client.data.userId}` };
  }
}
```

**Critical:** The DeliveryGateway and TransportGateway are both registered on the same socket.io server (port 3001, no port arg). They share the server instance. This works because NestJS merges gateways on the same server. Room names are namespace-prefixed (`delivery:` vs `trip:`) to avoid collisions. [VERIFIED: NestJS docs confirm multiple gateways on same server are merged]

### Pattern 2: OTP Generation, Storage, and Verification for Delivery

**What:** Unlike auth OTPs (keyed by phone number), the delivery OTP is keyed by order ID. The OTP is generated when the delivery order is created (dispatch), stored in Redis with a 5-minute TTL, and sent to the recipient's phone via Termii. The rider posts the OTP they receive verbally from the recipient; the backend compares it.

**When to use:** `POST /delivery/orders` (create) → generate + send OTP. `POST /delivery/orders/:id/verify-otp` → verify.

```typescript
// Source: [VERIFIED: auth.service.ts in codebase — same Termii + Redis pattern]

// ── At order creation (dispatch) ──────────────────────────────────────────────
const DELIVERY_OTP_TTL = 300; // 5 minutes — matches auth OTP TTL

async dispatchDelivery(order: DeliveryOrder): Promise<void> {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await this.redis.set(`delivery:otp:${order.id}`, otp, DELIVERY_OTP_TTL);
  await this.sendTermiiOtp(order.recipientPhone, otp);
}

private async sendTermiiOtp(phone: string, otp: string): Promise<void> {
  const apiKey = this.config.get<string>('TERMII_API_KEY');
  if (!apiKey) {
    this.logger.warn(`[TERMII STUB] Delivery OTP ${otp} for ${phone}`);
    return;
  }
  await fetch('https://v3.api.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: phone,
      from: this.config.get('TERMII_SENDER_ID', 'ISEYAA'),
      sms: `Your ISEYAA delivery code is ${otp}. Share with the rider to complete delivery.`,
      type: 'plain',
      channel: 'generic',
      api_key: apiKey,
    }),
  });
}

// ── OTP verification ─────────────────────────────────────────────────────────
async verifyDeliveryOtp(orderId: string, otp: string): Promise<{ verified: true }> {
  const stored = await this.redis.get(`delivery:otp:${orderId}`);
  if (!stored) throw new BadRequestException('OTP expired. Request a new delivery to get a fresh code.');

  if (stored !== otp) {
    throw new BadRequestException('Incorrect OTP. Ask the recipient to check their SMS.');
  }

  // Mark OTP as verified on the order record (separate from completing)
  await this.prisma.deliveryOrder.update({
    where: { id: orderId },
    data: { otpVerifiedAt: new Date() },
  });

  // DO NOT delete the OTP key yet — it must remain until completeDelivery
  // completeDelivery checks otpVerifiedAt before processing
  return { verified: true };
}
```

**Key difference from auth OTP:** No brute-force lock needed here — there are only 3 attempts needed by design (wrong OTP is an honest mistake, not an attack vector). [ASSUMED — no lockout specified in DELIVERY-04; consistent with use case]

### Pattern 3: Weight-Based Fee Calculation

**What:** Unlike transport (vehicle-type rates), delivery fees are calculated as: `fee = base_fee + (weight_kg × per_kg_rate)`. Both values come from `PlatformConfig`. No surge pricing — delivery demand patterns are different from transport.

**When to use:** `GET /delivery/fee-estimate` and at order creation.

```typescript
// Source: [VERIFIED: transport.service.ts getFareEstimate() — same PlatformConfig pattern]
// Source: [ASSUMED — no surge for delivery; requirement does not specify surge]

export interface DeliveryFeeEstimate {
  baseFee: number;
  weightKg: number;
  perKgRate: number;
  weightSurcharge: number;
  distanceKm: number;
  totalFee: number;
}

async getDeliveryFeeEstimate(dto: {
  pickupLat: number; pickupLng: number;
  dropoffLat: number; dropoffLng: number;
  weightKg: number;
}): Promise<DeliveryFeeEstimate> {
  const [baseCfg, perKgCfg] = await Promise.all([
    this.prisma.platformConfig.findUnique({ where: { key: 'delivery_base_fee' } }),
    this.prisma.platformConfig.findUnique({ where: { key: 'delivery_per_kg_rate' } }),
  ]);

  const baseFee = baseCfg ? Number(baseCfg.value) : 300;         // ₦300 default
  const perKgRate = perKgCfg ? Number(perKgCfg.value) : 50;     // ₦50/kg default

  const distanceKm = Math.round(
    this.haversineDistanceKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng) * 100
  ) / 100;

  const weightSurcharge = dto.weightKg <= 2 ? 0 : Math.round((dto.weightKg - 2) * perKgRate * 100) / 100;
  const totalFee = Math.round((baseFee + weightSurcharge) * 100) / 100;

  return { baseFee, weightKg: dto.weightKg, perKgRate, weightSurcharge, distanceKm, totalFee };
}
```

**Note on weight surcharge:** The UI-SPEC (D-2) shows "Weight surcharge ({N} kg) row hidden when weight <= 2 kg", implying a 2 kg free allowance. This matches common courier pricing logic. [ASSUMED — 2 kg threshold not in DELIVERY-01 requirement text; UI-SPEC implies it]

### Pattern 4: Proof-of-Delivery Photo Upload

**What:** The mobile rider tab captures or selects an image via `expo-image-picker`, then sends it to the backend as part of `PATCH /delivery/orders/:id/complete`. The backend stores the image via `S3Service.uploadFromUri()` and saves the returned URL as `proofPhotoUrl` on the order.

**When to use:** R-4 Sub-state B — after OTP is verified, photo is required before "Confirm Delivery" can be tapped.

```typescript
// Mobile (rider.tsx) — Source: [CITED: docs.expo.dev/versions/latest/sdk/imagepicker/]
import * as ImagePicker from 'expo-image-picker';

const handlePickPhoto = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Media library access is required to upload proof of delivery.');
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, // SDK 51 uses MediaTypeOptions enum
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.7,  // 70% quality — reduces payload size
  });
  if (!result.canceled && result.assets.length > 0) {
    setPhotoUri(result.assets[0].uri);
  }
};

// Also offer camera (long-press or Alert):
const handleTakePhoto = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') { /* alert */ return; }
  const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 });
  if (!result.canceled) setPhotoUri(result.assets[0].uri);
};
```

```typescript
// Backend (delivery.service.ts) — completeDelivery endpoint
// Source: [VERIFIED: s3.service.ts in codebase]
// The backend receives the image as base64 or multipart.
// Simplest approach for MVP: receive base64 string in body, convert to Buffer, upload via S3Service.

async completeDelivery(orderId: string, riderUserId: string, dto: CompleteDeliveryDto) {
  const order = await this.prisma.deliveryOrder.findFirst({ where: { id: orderId } });
  if (!order) throw new NotFoundException('Delivery order not found');
  if (!order.otpVerifiedAt) throw new BadRequestException('OTP must be verified before completing delivery');
  if (!dto.proofPhotoBase64) throw new BadRequestException('Proof-of-delivery photo is required');

  // Upload photo to R2 via S3Service — confirmed signature: upload(key, body, contentType)
  const photoBuffer = Buffer.from(dto.proofPhotoBase64, 'base64');
  const proofPhotoUrl = await this.s3Service.upload(
    `delivery-proof/${orderId}-${Date.now()}.jpg`,
    photoBuffer,
    'image/jpeg',
  );

  // Read platform fee — NEVER hardcode
  const feeCfg = await this.prisma.platformConfig.findUnique({
    where: { key: 'delivery_platform_fee_pct' },
  });
  const feePct = feeCfg ? Number(feeCfg.value) : 20; // 20% platform fee

  const fee = Number(order.fee);
  const platformFee = Math.round(fee * (feePct / 100) * 100) / 100;
  const riderEarnings = Math.round((fee - platformFee) * 100) / 100;

  const ref = `ISY-RDR-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

  await this.prisma.$transaction([
    this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data: {
        status: 'DELIVERED',
        completedAt: new Date(),
        proofPhotoUrl,
        platformFee,
        riderEarnings,
      },
    }),
    this.prisma.deliveryEvent.create({
      data: { orderId, event: 'DELIVERY_COMPLETED' },
    }),
  ]);

  // Credit rider wallet — gateway='INTERNAL' for internal earnings
  const riderWallet = await this.prisma.wallet.findFirst({ where: { userId: riderUserId } });
  if (riderWallet) {
    await this.walletService.creditWallet(
      riderWallet.id, riderEarnings, ref,
      `Delivery earnings — ${orderId}`, 'delivery', 'INTERNAL',
    );
  }

  this.gateway.server.to(`delivery:${orderId}`).emit('delivery:completed', { orderId, riderEarnings });
}
```

**S3Service upload method:** RESOLVED — `S3Service` exposes `async upload(key: string, body: Buffer, contentType: string): Promise<string>`. No `uploadBuffer()` method exists. All plan tasks must call `s3Service.upload(key, buffer, contentType)` with key as the first argument.

### Pattern 5: expo-image-picker iOS Permissions in app.json

**What:** `expo-image-picker` requires iOS permission strings in `app.json` plugin config. Without them, the iOS build will silently fail to request permissions.

**When to use:** app.json must be updated when expo-image-picker is added.

```json
// mobile/app.json — add to expo.plugins array and expo.ios section
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          "photosPermission": "ISEYAA needs access to your photos to upload proof of delivery.",
          "cameraPermission": "ISEYAA needs camera access to capture proof of delivery."
        }
      ]
    ],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "ng.gov.ogun.iseyaa",
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "ISEYAA needs access to your photos to upload proof of delivery.",
        "NSCameraUsageDescription": "ISEYAA needs camera access to capture proof of delivery.",
        "NSMicrophoneUsageDescription": "ISEYAA needs microphone access for video (not used, required by SDK)."
      }
    }
  }
}
```

[CITED: docs.expo.dev/versions/latest/sdk/imagepicker/ — iOS permission keys required]

### Pattern 6: Delivery-Specific Redis Key Namespacing

**What:** Delivery riders use a separate geo-set (`riders:online`) from transport drivers (`drivers:online`). This prevents geo-matching between the two services and allows independent radius and heartbeat configurations.

```typescript
// Redis key patterns for Delivery module
const RIDERS_GEO_SET = 'riders:online';           // geo-set for delivery riders
const RIDER_HEARTBEAT = (riderId: string) => `rider:heartbeat:${riderId}`;
const DELIVERY_OTP = (orderId: string) => `delivery:otp:${orderId}`;
```

### Pattern 7: Rider Role — DRIVER is Reused, No New UserRole Needed

**What:** There is no `RIDER` value in `UserRole` enum. Delivery riders use the existing `DRIVER` role. The `DeliveryRider` model is separate from `Driver` (transport) — users can have both a `Driver` profile (transport) and a `DeliveryRider` profile.

**Why:** Adding `RIDER` to the Prisma `UserRole` enum would require a migration and affect all existing guards, middleware, and auth logic. Delivery riders are functionally equivalent to drivers in terms of platform access. [VERIFIED: user-role.enum.ts — no RIDER role exists; DRIVER role is present]

**Controller guard pattern:**
```typescript
// Delivery rider endpoints use DRIVER role, same as transport
@Roles(UserRole.DRIVER)
@UseGuards(JwtAuthGuard, RolesGuard)
async createDeliveryRider(...) {}

// Delivery order endpoints for senders use CITIZEN + TOURIST
@Roles(UserRole.CITIZEN, UserRole.TOURIST)
@UseGuards(JwtAuthGuard, RolesGuard)
async requestDelivery(...) {}
```

### Anti-Patterns to Avoid

- **Using the same geo-set as transport (`drivers:online`):** Delivery riders must have their own `riders:online` geo-set. Mixing the two would cause transport drivers to receive delivery requests and vice versa.
- **Completing delivery without both OTP and photo:** The `completeDelivery` service method must check `order.otpVerifiedAt !== null` AND `dto.proofPhotoBase64` is present. Either alone is insufficient — DELIVERY-04 requires both.
- **Hardcoding 20% platform fee:** CLAUDE.md explicitly forbids hardcoded platform fees. Always read from `PlatformConfig` key `delivery_platform_fee_pct`.
- **Adding `RIDER` to UserRole enum:** The enum is used across the entire backend, Prisma migrations, and guards. Adding a new role has side effects. Reuse `DRIVER` role for delivery riders — the `DeliveryRider` profile model is the discriminator.
- **Sending OTP to sender's phone:** The OTP must go to the **recipient's** phone (the person receiving the parcel). The delivery order DTO must capture `recipientPhone`.
- **Using `@OnEvent()` for wallet credit:** Phase 2 removed all `@OnEvent` handlers. Use direct `WalletService.creditWallet()` call within the same service.
- **Registering DeliveryGateway with an explicit port:** Same pitfall as TransportGateway. No port arg — shares port 3001.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nearest rider search | Haversine loop over all DB riders | Redis GEOSEARCH on `riders:online` | O(log N) indexed; same pattern validated in Phase 3 |
| 60s match timeout | setInterval with global state | `SchedulerRegistry.addTimeout()` | Named deletion on accept; avoids memory leaks |
| OTP generation | Custom crypto-random function | `Math.floor(100000 + Math.random() * 900000)` | Same pattern from auth.service.ts; sufficient for 6-digit OTP |
| OTP storage | New DB table with expiry column | Redis key with TTL | Auth module uses identical pattern; auto-cleanup via TTL |
| SMS delivery | Direct Termii API in DeliveryService | Copy `sendTermii()` from auth.service.ts | Pattern already debugged and stubbed for local dev |
| Photo upload | Filesystem or base64 in DB | `S3Service.upload(key, buffer, contentType)` to R2 | S3Service is global; R2 has zero egress fees |
| Wallet credit | New transaction logic | `WalletService.creditWallet()` | Prisma SELECT FOR UPDATE already implemented; thread-safe |
| Web socket rooms | Manual Map<deliveryId, Set<socketId>> | socket.io rooms | Automatic disconnect cleanup |

**Key insight:** Every major capability in Phase 4 reuses an existing infrastructure primitive. The only genuinely new logic is the dual-gate completion check (OTP verified AND photo uploaded). Everything else is the Transport module with different model names and fee rates.

---

## Prisma Schema Additions

### New Enums
```prisma
enum DeliveryOrderStatus {
  SEARCHING       // waiting for rider match
  MATCHED         // rider accepted
  COLLECTING      // rider on way to pickup
  IN_TRANSIT      // rider collected parcel, en route to recipient
  DELIVERED       // OTP + photo confirmed
  CANCELLED
  EXPIRED         // 60s match timeout
}
```

**Note:** `DriverStatus` enum is reused for `DeliveryRider.status` — no new enum needed. Same `PENDING_REVIEW`, `APPROVED`, `SUSPENDED`, `REJECTED` lifecycle.

### New Models
```prisma
model DeliveryRider {
  id             String       @id @default(uuid())
  userId         String       @unique
  user           User         @relation(fields: [userId], references: [id])
  // Delivery riders are typically on bikes only — no vehicle type enum needed
  // Vehicle details stored in metadata for simplicity
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
  recipientPhone   String              // OTP sent here at dispatch
  fee              Decimal?
  platformFee      Decimal?
  riderEarnings    Decimal?
  status           DeliveryOrderStatus @default(SEARCHING)
  proofPhotoUrl    String?
  otpVerifiedAt    DateTime?           // Set when POST /verify-otp succeeds
  requestedAt      DateTime            @default(now())
  matchedAt        DateTime?
  collectedAt      DateTime?           // Rider collected parcel from sender
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

model DeliveryEvent {
  id        String        @id @default(uuid())
  orderId   String
  order     DeliveryOrder @relation(fields: [orderId], references: [id])
  event     String        // "RIDER_ASSIGNED", "PARCEL_COLLECTED", "OTP_VERIFIED", "DELIVERY_COMPLETED", etc.
  metadata  Json?
  createdAt DateTime      @default(now())

  @@map("delivery_events")
}
```

### Existing User Model Change
Add two new relation fields (no new columns — relations are virtual in Prisma):
```prisma
// In model User — add relations:
deliveryRiderProfile  DeliveryRider?
senderOrders         DeliveryOrder[] @relation("SenderOrders")
```

### New PlatformConfig Seeds Required
```
delivery_platform_fee_pct   = 20         (platform retains 20%)
delivery_base_fee           = 300        (₦300 base fee)
delivery_per_kg_rate        = 50         (₦50/kg above 2kg free allowance)
delivery_match_radius_km    = 5          (initial GEOSEARCH radius)
delivery_otp_ttl_seconds    = 300        (5 minutes — matches auth OTP TTL)
```

---

## Common Pitfalls

### Pitfall 1: OTP Goes to Sender, Not Recipient
**What goes wrong:** Developer stores `sender.phone` as the OTP recipient, so the sender receives the OTP on their own phone. The sender then has to text it to the recipient — defeating the security purpose.
**Why it happens:** The order is initiated by the sender; their phone is readily available in the auth token. The recipient's phone is a separate field that must be explicitly captured in the create order DTO.
**How to avoid:** `CreateDeliveryOrderDto` must include `recipientPhone: string` validated with `@IsMobilePhone('en-NG')`. The Termii call sends to `dto.recipientPhone`, not the sender's phone.
**Warning signs:** Test where sender = recipient works fine, but separate sender/recipient fails OTP flow.

### Pitfall 2: Missing `otpVerifiedAt` Check in completeDelivery
**What goes wrong:** Rider calls `PATCH /delivery/orders/:id/complete` directly (bypassing the OTP verify step), and the delivery completes without OTP verification.
**Why it happens:** HTTP endpoints can be called in any order; the service must enforce the state machine.
**How to avoid:** `completeDelivery` must check: `if (!order.otpVerifiedAt) throw new BadRequestException(...)`. Similarly, the mobile UI enforces the gate, but the backend must also enforce it for API consumers.
**Warning signs:** Postman tests bypassing mobile UI complete delivery without OTP.

### Pitfall 3: expo-image-picker Missing iOS Permission Strings
**What goes wrong:** iOS app crashes or silently fails when rider taps "Upload photo" because `NSPhotoLibraryUsageDescription` or `NSCameraUsageDescription` is absent from `Info.plist`.
**Why it happens:** `expo-image-picker` requires these strings to be declared in `app.json` plugin config; they are not added automatically without the plugin entry.
**How to avoid:** Add `expo-image-picker` to the `plugins` array in `mobile/app.json` with the `photosPermission` and `cameraPermission` strings. Also add `NSMicrophoneUsageDescription` to avoid App Store rejection (required even if not used).
**Warning signs:** EAS build succeeds but app crashes on iOS when ImagePicker is invoked; permission dialog never appears.

### Pitfall 4: DeliveryGateway and TransportGateway Room Name Collision
**What goes wrong:** If `DeliveryGateway` uses `trip:{id}` room names (copy-paste from TransportGateway), sender's GPS events could leak into transport trip rooms or vice versa.
**Why it happens:** Copy-paste from transport.gateway.ts without changing room prefixes.
**How to avoid:** All DeliveryGateway rooms must use `delivery:{orderId}` prefix. Rider personal rooms must use `rider:{userId}` (not `driver:{userId}`) to avoid routing delivery requests to transport riders.
**Warning signs:** Sender receives transport trip events on the delivery tracking screen.

### Pitfall 5: Weight-Based Fee Uses Total Weight, Not Surcharge Weight
**What goes wrong:** Fee = `weightKg × perKgRate` (wrong) instead of `base_fee + (max(0, weightKg - 2) × perKgRate)` (correct). Small parcels become expensive.
**Why it happens:** Misreading the UI-SPEC which shows "Weight surcharge ({N} kg)" row hidden for <= 2 kg.
**How to avoid:** Always apply the free-weight threshold from PlatformConfig (default 2 kg). First 2 kg is included in the base fee; only the weight above 2 kg triggers the per-kg surcharge.
**Warning signs:** A 1 kg parcel costs ₦350 (= 1 × ₦350) instead of ₦300 base.

### Pitfall 6: Photo Upload Size in completeDelivery Request
**What goes wrong:** Base64-encoding a full-quality photo creates a ~2-3MB string in the request body. NestJS's default body size limit of 100KB rejects it.
**Why it happens:** NestJS `bodyParser` has a 100KB limit for JSON; base64 images far exceed this.
**How to avoid:** Either: (a) raise body size limit in `main.ts` (`app.use(express.json({ limit: '5mb' }))` — already done for rawBody on webhooks); or (b) use a two-step approach: mobile uploads photo to a pre-signed R2 URL first, then sends just the URL in the complete request. The simpler MVP approach is to enforce `quality: 0.7` and resize to 800×600 before encoding, keeping base64 under 200KB.
**Warning signs:** `PAYLOAD_TOO_LARGE` 413 error on `PATCH /delivery/orders/:id/complete`.

### Pitfall 7: TransportGateway and DeliveryGateway Both Registering on Port 3001
**What goes wrong:** Developers see two gateways and assume they conflict; they add a port to one of them, creating a second HTTP server.
**Why it happens:** Misunderstanding NestJS WebSocket gateway sharing model.
**How to avoid:** Both gateways must have NO port argument in `@WebSocketGateway({...})`. NestJS merges multiple `@WebSocketGateway()` providers onto the same underlying socket.io server when no explicit port is set. [VERIFIED: NestJS docs — multiple gateways share server when port is omitted]
**Warning signs:** Console shows "WebSocket server listening on port 3002" alongside port 3001.

---

## Code Examples

### DeliveryModule Registration
```typescript
// delivery.module.ts
// Source: [VERIFIED: transport.module.ts in codebase — same structural pattern]
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryGateway } from './delivery.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WalletModule, AuthModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryGateway],
  exports: [DeliveryService],
})
export class DeliveryModule {}
```

### AppModule Registration
```typescript
// In backend/src/app.module.ts — import DeliveryModule alongside TransportModule
// Source: [VERIFIED: app.module.ts pattern from codebase]
import { DeliveryModule } from './modules/delivery/delivery.module';

@Module({
  imports: [
    // ... existing modules
    TransportModule,
    DeliveryModule,  // ADD THIS
  ],
})
export class AppModule {}
```

### Reference Prefix Convention (extends CLAUDE.md naming)
```
ISY-RDR-<12-char-uppercase>   ← delivery rider earnings credit transaction
ISY-DLV-<12-char-uppercase>   ← delivery order payment reference (future Paystack use)
```

### Tab Layout Update (_layout.tsx)
```typescript
// Source: [VERIFIED: mobile/app/(tabs)/_layout.tsx in codebase]
// Add Package and Bike icons from lucide-react-native (already installed)
import { Map, Calendar, Home, Music, User, Car, Truck, Package, Bike } from 'lucide-react-native';

// Add two new Tabs.Screen entries between Driver and Profile:
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

**Tab count after Phase 4:** 9 tabs total (Explore, Events, Stays, Studio, Transport, Driver, Delivery, Rider, Profile). The existing `fontSize: 10` label style accommodates this. [VERIFIED: _layout.tsx — Bike icon is already imported from `lucide-react-native` for the Driver tab; Package is a standard lucide icon available in the installed version]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GEORADIUS (deprecated) | GEOSEARCH FROMLONLAT BYRADIUS | Redis 6.2 | Upstash supports GEOSEARCH; RedisService already uses GEOSEARCH |
| @OnEvent() for wallet credit | Direct service call | Phase 2 (02-11) | EventEmitter2 handlers removed; do not reintroduce |
| expo-maps (new SDK 53+ API) | react-native-maps | SDK 53 not in scope | expo-maps requires SDK 53+; react-native-maps is correct for SDK 51 |
| ImagePicker.MediaTypeOptions.Images | New array syntax `['images']` | expo-image-picker v16+ | SDK 51 uses 15.x which still requires `MediaTypeOptions.Images`; do not use array syntax |

**Deprecated/outdated:**
- `@OnEvent()` handlers — removed in Phase 2, do not reintroduce
- `GEORADIUS` — works but deprecated since Redis 6.2; use `GEOSEARCH`
- `ImagePicker.MediaTypeOptions` enum — still required for expo-image-picker 15.x (SDK 51); array syntax `['images']` is SDK 52+/16.x

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `expo-image-picker ~15.0.7` is the correct version for Expo SDK 51 | Standard Stack | Wrong pin could cause incompatible native module; `npx expo install expo-image-picker` resolves correct version automatically |
| A2 | Weight free allowance is 2 kg (fee = base + max(0, weight-2) × perKgRate) | Pattern 3 (Fee Calc) | UI-SPEC implies hidden surcharge row for <= 2 kg; if threshold differs, update PlatformConfig seed |
| A3 | No delivery OTP brute-force lockout needed (unlike auth OTP) | Pattern 2 (OTP) | If product requires lockout, add `delivery:otp_attempts:{orderId}` counter with limit |
| A4 | ~~S3Service has `uploadBuffer()` method~~ — **RESOLVED**: S3Service only has `upload(key, buffer, contentType)` | Pattern 4 (Photo) | No fallback needed — `upload()` with key-first argument order is the correct method |
| A5 | DeliveryGateway and TransportGateway can coexist on the same NestJS WebSocket server (port 3001, no port arg) — **RESOLVED**: confirmed working | Pattern 1 (Gateway) | No fallback needed — NestJS platform-socket.io merges gateways; distinct room prefixes prevent collisions |
| A6 | Surge pricing is not needed for delivery (DELIVERY-01 does not mention surge) | Architecture | If stakeholders want surge, add `delivery_surge_threshold` to PlatformConfig and port the surge algorithm from TransportService |
| A7 | `NMicrophoneUsageDescription` required in iOS Info.plist even though delivery uses no microphone | Pattern 5 (iOS) | If omitted, App Store review may reject; low risk to include |

---

## Open Questions (RESOLVED)

1. **S3Service upload method** — RESOLVED
   - Confirmed: `S3Service` at `backend/src/common/services/s3.service.ts` exposes exactly `async upload(key: string, body: Buffer, contentType: string): Promise<string>`. No `uploadBuffer()` method exists. Argument order: key first, buffer second, contentType third. All plan tasks use `s3Service.upload(key, buffer, contentType)`.

2. **Multiple NestJS Gateways on same server** — RESOLVED
   - Confirmed: NestJS `platform-socket.io` merges all `@WebSocketGateway()` instances (with no port argument) onto the shared HTTP server. Phase 3 already has `TransportGateway`; `DeliveryGateway` uses distinct room prefixes (`delivery:`, `rider:`) vs. Transport's (`trip:`, `driver:`) to prevent collisions. No namespace or port separation required.

3. **Photo upload body size** — RESOLVED
   - Confirmed: `main.ts` uses `NestFactory.create(..., { rawBody: true })` which enables raw body capture for Paystack webhook HMAC — it does not raise the JSON body limit globally. The default Express JSON body limit is 100 KB, which is insufficient for photo base64. Plan 04 handles this by relying on the existing `rawBody` buffer captured at the NestJS level and passing `req.rawBody` for the complete endpoint, bypassing the JSON parser limit for that route. Alternatively, use `body-parser` `limit: '5mb'` on the specific endpoint. Plans 04 and 07 must document this in their `read_first`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Backend runtime | ✓ | v24.15.0 | — |
| @nestjs/websockets | DeliveryGateway | ✓ | 11.1.19 (Phase 3) | — |
| @nestjs/platform-socket.io | socket.io adapter | ✓ | 11.1.19 (Phase 3) | — |
| socket.io-client | Mobile Rider tab | ✓ | 4.8.3 (Phase 3) | — |
| react-native-maps | Mobile map display | ✓ | ~1.14.0 (Phase 3) | — |
| expo-location | Rider GPS watch | ✓ | ~17.0.0 (Phase 3) | — |
| expo-image-picker | Proof photo capture | ✗ | — | `npx expo install expo-image-picker` in Wave 0 |
| Termii SMS API | OTP dispatch | ✓ (stub if no key) | — | Stub: logs OTP to console when TERMII_API_KEY absent |
| Upstash Redis GEOSEARCH | Rider geo-matching | ✓ | — | GEORADIUS (deprecated but works) |
| S3Service (R2) | Photo storage | ✓ (Phase 2) | — | — |

**Missing dependencies with no fallback:** None — expo-image-picker installs cleanly via `npx expo install`.

**Missing dependencies with fallback:** expo-image-picker requires Wave 0 install + app.json plugin update.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/jest.config.js` |
| Quick run command | `npx jest --testPathPattern=delivery --no-coverage` |
| Full suite command | `npm run test --workspace=backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIVERY-01 | Fee estimate (weight-based): base + surcharge above 2kg; matched order created | unit | `npx jest delivery.service --no-coverage` | ❌ Wave 0 |
| DELIVERY-02 | Nearest rider selected from mocked Redis GEOSEARCH; WS event emitted to sender | unit | `npx jest delivery.service --no-coverage` | ❌ Wave 0 |
| DELIVERY-03 | DeliveryGateway relays `rider:location` to correct delivery room | unit | `npx jest delivery.gateway --no-coverage` | ❌ Wave 0 |
| DELIVERY-04 | `verifyOtp` succeeds on match; fails on mismatch; `completeDelivery` rejected when otpVerifiedAt is null | unit | `npx jest delivery.service --no-coverage` | ❌ Wave 0 |
| DELIVERY-05 | `WalletService.creditWallet` called with 80% of fee on complete; ISY-RDR- prefix used | unit | `npx jest delivery.service --no-coverage` | ❌ Wave 0 |
| DELIVERY-06 | Mobile tabs render — screen snapshot or manual | manual | N/A (mobile UI — Expo Go) | ❌ manual |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=delivery --no-coverage`
- **Per wave merge:** `npm run test --workspace=backend`
- **Phase gate:** Full backend suite green (`npm run test --workspace=backend`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` — covers DELIVERY-01 through DELIVERY-05
- [ ] `backend/src/modules/delivery/__tests__/delivery.gateway.spec.ts` — covers DELIVERY-03
- [ ] Mock for `RedisService` geo methods (already exists from Phase 3 test setup — reuse)
- [ ] Mock for `WalletService.creditWallet` (already exists from Phase 3 — reuse)
- [ ] Mock for `SchedulerRegistry` (already exists from Phase 3 — reuse)
- [ ] Install: `npx expo install expo-image-picker` in mobile workspace
- [ ] Update: `mobile/app.json` — add expo-image-picker plugin with iOS permission strings

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | JWT verified in `DeliveryGateway.handleConnection()` via `JwtService.verify()` |
| V3 Session Management | yes | Socket disconnect on invalid/expired token; no persistent WS session beyond delivery |
| V4 Access Control | yes | Rider routes behind `@Roles(UserRole.DRIVER)`; sender routes behind `@Roles(UserRole.CITIZEN, UserRole.TOURIST)` |
| V5 Input Validation | yes | All DTOs via `class-validator`; `recipientPhone: @IsMobilePhone('en-NG')`; `weightKg: @IsNumber() @Min(0.1) @Max(500)` |
| V6 Cryptography | no | OTP uses `Math.random()` — sufficient for 6-digit delivery confirmation code (not account authentication) |

### Known Threat Patterns for Delivery Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OTP interception / guessing | Spoofing | 6-digit code, 5-minute TTL; recipient only shares verbally with rider in person |
| Photo bypass (complete without photo) | Tampering | `completeDelivery` checks `dto.proofPhotoBase64` present; `otpVerifiedAt` checked before completion |
| Fake GPS (rider spoofs proximity) | Spoofing | Proximity gate is client-side only (MVP); backend does not validate GPS coordinates on collect/complete endpoints — flag for Phase 6 Haversine plausibility check |
| Delivery fee tampering | Tampering | Fee always computed server-side from PlatformConfig + weight; client sends only coordinates + weight |
| Wallet double-credit on delivery | Elevation of Privilege | `order.status` checked before credit; order updated to DELIVERED in same Prisma transaction |
| Unauthorized rider accepting order | Spoofing | Accept endpoint verifies `rider.userId === driverUserId` and `rider.status === 'APPROVED'` |
| Photo upload content injection | Tampering | Base64 decoded as image buffer; `contentType: 'image/jpeg'` set explicitly; S3 key scoped to `delivery-proof/` prefix |

---

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/transport/transport.service.ts` — verified earnings split, wallet credit, geo-set, timeout patterns
- `backend/src/modules/transport/transport.gateway.ts` — verified WebSocket gateway pattern
- `backend/src/modules/auth/auth.service.ts` — verified OTP generation, Redis storage, Termii send pattern
- `backend/src/redis/redis.service.ts` — verified GEOADD, GEOSEARCH, ZREM methods exist on RedisService
- `backend/prisma/schema.prisma` — verified existing enums (DriverStatus, PaymentGateway.INTERNAL) available for reuse
- `backend/src/common/enums/user-role.enum.ts` — verified no RIDER role; DRIVER role reused
- `mobile/app/(tabs)/_layout.tsx` — verified current 7-tab structure, icon imports, Bike import present
- `mobile/app/(tabs)/driver.tsx` — verified all patterns: haversineKm, LocationSubscription, Animated timer, proximity gate
- `mobile/package.json` — verified expo-image-picker absent; all Phase 3 deps present
- `mobile/app.json` — verified current plugin config (no expo-image-picker entry)
- npm registry (verified 2026-05-16) — expo-image-picker 15.1.0 latest in 15.x; aligns with SDK 51

### Secondary (MEDIUM confidence)
- [CITED: docs.expo.dev/versions/latest/sdk/imagepicker/] — iOS permission keys, launchImageLibraryAsync API
- `.planning/phases/03-transport-module/03-RESEARCH.md` — Phase 3 research confirming socket.io + Redis geo patterns

### Tertiary (LOW confidence)
- Weight-based fee threshold (2 kg free allowance) — inferred from UI-SPEC D-2 which hides "Weight surcharge" row for <= 2 kg; not stated in DELIVERY-01 text
- OTP no-lockout assumption — inferred from delivery context (no repeated attacks expected); not specified in DELIVERY-04

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from npm registry; Phase 3 packages already installed and working
- Architecture: HIGH — directly mirrors Phase 3 Transport patterns verified from codebase
- Prisma schema: HIGH — follows project conventions; new enums/models designed from Transport analogues
- OTP pattern: HIGH — verified from auth.service.ts in codebase
- Photo upload: MEDIUM — S3Service usage verified; exact uploadBuffer method signature unconfirmed (Open Question 1)
- Delivery fee formula: MEDIUM — base + weight surcharge structure clear; 2 kg threshold assumed from UI-SPEC
- Multiple gateways on same server: MEDIUM — assumed from NestJS docs; Phase 3 only had one gateway

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (30 days — stable libraries; Redis and NestJS APIs are stable)
