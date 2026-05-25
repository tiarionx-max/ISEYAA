# Phase 5: AI Concierge + KYC — Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 12 (new/modified)
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/modules/ai/ai.service.ts` | service | streaming, event-driven | `backend/src/modules/ai/ai.service.ts` (self) | self-extend |
| `backend/src/modules/ai/ai.controller.ts` | controller | request-response, streaming | `backend/src/modules/ai/ai.controller.ts` (self) | self-extend |
| `backend/src/common/services/vector.service.ts` | service | request-response | `backend/src/common/services/paystack.service.ts` | role-match |
| `backend/src/modules/ai/dto/chat.dto.ts` | DTO | — | `backend/src/modules/ai/dto/itinerary.dto.ts` | exact |
| `backend/src/modules/users/kyc.service.ts` | service | CRUD | `backend/src/modules/users/users.service.ts` | exact |
| `backend/src/modules/users/dto/verify-bvn.dto.ts` | DTO | — | `backend/src/modules/auth/dto/register.dto.ts` | exact |
| `backend/src/modules/users/dto/verify-nin.dto.ts` | DTO | — | `backend/src/modules/auth/dto/register.dto.ts` | exact |
| `backend/src/common/services/encryption.service.ts` | service | transform | `backend/src/common/services/paystack.service.ts` | role-match |
| `backend/src/modules/users/users.module.ts` | module | — | `backend/src/modules/ai/ai.module.ts` | exact |
| `backend/prisma/schema.prisma` | migration | — | existing schema | self-extend |
| `mobile/app/ai-chat.tsx` | component | streaming, event-driven | `mobile/app/(tabs)/delivery.tsx` | role-match |
| `mobile/app/kyc.tsx` | component | request-response, CRUD | `mobile/app/(tabs)/transport.tsx` | role-match |
| `mobile/app/_layout.tsx` | config | — | `mobile/app/_layout.tsx` (self) | self-extend |
| `mobile/app/(tabs)/profile.tsx` | component | CRUD | `mobile/app/(tabs)/profile.tsx` (self) | self-extend |

---

## Pattern Assignments

### `backend/src/modules/ai/ai.service.ts` (service, streaming — MODIFY)

**Analog:** `backend/src/modules/ai/ai.service.ts` (lines 1–226 — full file read above)

**Existing imports to preserve** (lines 1–6):
```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ItineraryDto } from './dto/itinerary.dto';
```

**New imports to add:**
```typescript
import { VectorService } from './vector.service';
import { ChatDto } from './dto/chat.dto';
```

**Constructor injection pattern** (lines 13–18 — copy and extend):
```typescript
constructor(
  private prisma: PrismaService,
  private config: ConfigService,
  private vector: VectorService,   // ADD
) {
  this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') ?? 'dummy' });
}
```

**Existing SSE streaming core** (lines 27–46 — the exact write/end pattern to replicate in new `streamChatWithTools`):
```typescript
const stream = await this.anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  system: systemPrompt,
  messages: [{ role: 'user', content: message }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
  }
}

res.write('data: [DONE]\n\n');
res.end();
```

**Error handling pattern** (lines 42–46 — copy verbatim):
```typescript
} catch (err) {
  this.logger.error('AI stream error', err);
  res.write(`data: ${JSON.stringify({ error: 'AI service unavailable' })}\n\n`);
  res.end();
}
```

**Prisma data fetch pattern** (lines 56–101 — extract for tool execution private methods):
- Section divider style: `// ── Tool: get_attractions ──────────────────────────────────`
- Query pattern: `this.prisma.attraction.findMany({ where: { lgaId: lga.id, isActive: true, deletedAt: null }, select: {...}, take: N })`
- Always filter `deletedAt: null` on all model queries

**Critical difference from analog:** New `streamChatWithTools` adds a `for (let turn = 0; turn < 3; turn++)` agentic loop and calls `stream.finalMessage()` to get assembled tool_use blocks. Do NOT try to reconstruct tool input from `input_json_delta` events manually. Use `finalMessage.content.filter(b => b.type === 'tool_use')` instead.

---

### `backend/src/modules/ai/ai.controller.ts` (controller, request-response — MODIFY)

**Analog:** `backend/src/modules/ai/ai.controller.ts` (lines 1–48 — full file read above)

**Existing SSE header block** (lines 22–27 — copy verbatim for all streaming endpoints):
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');  // critical for Railway/nginx
res.flushHeaders();
```

**Existing guard + Swagger pattern** (lines 13–17):
```typescript
@Post('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Chat with ISEYAA AI assistant (streaming SSE)' })
async chat(@Req() req: any, @Body() body: { message: string }, @Res() res: Response) {
```

**New KYC endpoint pattern — copy from `users.controller.ts` lines 32–34:**
```typescript
@Post('recommendations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Get personalised recommendations via vector search' })
async recommendations(@Req() req: any, @Body() body: { query: string }) {
  return this.aiService.getRecommendations(req.user.userId, body.query);
}
```

**Critical difference:** The existing `chat` endpoint takes `body: { message: string }`. The new endpoint must take `body: ChatDto` (with `messages` array for multi-turn history). Do NOT keep the single-message signature on the upgraded chat endpoint — update the `@Body()` param to `dto: ChatDto`.

---

### `backend/src/common/services/vector.service.ts` (service, request-response — CREATE)

**Analog:** `backend/src/common/services/paystack.service.ts` (lines 1–50 — full file read above)

**Injectable + ConfigService injection pattern** (lines 20–24):
```typescript
@Injectable()
export class VectorService {
  private readonly logger = new Logger(VectorService.name);

  constructor(private config: ConfigService) {}
```

**Axios external call pattern** (lines 31–47 — adapt for Upstash SDK):
```typescript
// Paystack pattern: inject config key, construct client, try/catch + logger.error
const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
try {
  const response = await axios.post(`${this.baseUrl}/...`, {...}, { headers: { Authorization: `Bearer ${secretKey}` } });
} catch (err) {
  this.logger.error('Paystack initiate payment failed', err?.response?.data ?? err.message);
  throw err;
}
```

**Adapted for Upstash Vector:**
```typescript
// index initialized in constructor using config (same pattern as this.anthropic in ai.service.ts line 17)
private index: Index | null = null;

constructor(private config: ConfigService) {
  const url = config.get('UPSTASH_VECTOR_REST_URL');
  const token = config.get('UPSTASH_VECTOR_REST_TOKEN');
  if (url && token) {
    this.index = new Index({ url, token });
  } else {
    this.logger.warn('UPSTASH_VECTOR_REST_URL/TOKEN not set — vector personalisation disabled');
  }
}
```

**Stub fallback pattern** — copy from `auth.service.ts` lines 222–227 (Termii stub):
```typescript
if (!apiKey) {
  this.logger.warn(`[TERMII STUB] OTP ${otp} for ${phone} — set TERMII_API_KEY to send live SMS`);
  return;
}
```
Apply to VectorService: if `this.index === null`, return empty context string without throwing.

---

### `backend/src/modules/ai/dto/chat.dto.ts` (DTO — CREATE)

**Analog:** `backend/src/modules/ai/dto/itinerary.dto.ts` (check the existing file — not read directly but its presence is confirmed at line 6 of ai.service.ts)

**DTO pattern from `auth.service.ts` / `users.controller.ts` — inline DTO style:**
```typescript
import { IsArray, IsString, IsOptional, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageDto {
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages: MessageDto[];

  @IsString()
  @IsOptional()
  conversationId?: string;
}
```

**Pattern note:** All DTOs use `class-validator` decorators. `@IsOptional()` on optional fields. `@ValidateNested + @Type` for nested objects (per global `ValidationPipe` with `whitelist: true`).

---

### `backend/src/modules/users/kyc.service.ts` (service, CRUD — CREATE)

**Analog:** `backend/src/modules/users/users.service.ts` (lines 1–126 — full file read above)

**Imports pattern** (lines 1–9):
```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
```

**New imports to add:**
```typescript
import * as bcrypt from 'bcrypt';          // already installed (auth.service.ts line 11)
import { EncryptionService } from '../../common/services/encryption.service';
import { PaystackService } from '../../common/services/paystack.service';
import { ConfigService } from '@nestjs/config';
```

**Service constructor injection** (lines 29–33):
```typescript
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private paystack: PaystackService,
    private config: ConfigService,
  ) {}
```

**User lookup guard pattern** (lines 35–40 — copy verbatim structure):
```typescript
const user = await this.prisma.user.findUnique({
  where: { id: userId, deletedAt: null },
  select: { id: true, bvnHash: true, kycBvnVerifiedAt: true },
});
if (!user) throw new NotFoundException('User not found');
```

**Conflict check pattern** (lines 58–61 from `auth.service.ts`):
```typescript
const existing = await this.prisma.user.findFirst({
  where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
});
if (existing) throw new ConflictException('Email or phone already registered');
```
Adapted for BVN duplicate check (O(n) bcrypt scan):
```typescript
if (user.bvnHash) throw new ConflictException('BVN already verified for this account');
const allUsers = await this.prisma.user.findMany({
  where: { bvnHash: { not: null }, id: { not: userId } },
  select: { id: true, bvnHash: true },
});
for (const u of allUsers) {
  if (await bcrypt.compare(dto.bvn, u.bvnHash!)) {
    throw new ConflictException('BVN already registered to another account');
  }
}
```

**Prisma update pattern** (lines 69–83 from `users.service.ts` `eraseData`):
```typescript
await this.prisma.user.update({
  where: { id: userId },
  data: {
    bvn: encrypted,
    bvnHash: hash,
    kycBvnVerifiedAt: new Date(),
  },
});
```

**Audit log pattern** (lines 86–94 from `users.service.ts`):
```typescript
await this.prisma.auditLog.create({
  data: { userId, action: 'KYC_BVN_VERIFIED', entity: 'User', entityId: userId },
});
```

**bcrypt hash pattern** (lines 64–65 from `auth.service.ts`):
```typescript
const hash = await bcrypt.hash(dto.bvn, 12);  // 12 salt rounds per CLAUDE.md
```

**External API stub pattern** (lines 222–227 from `auth.service.ts`):
```typescript
const apiKey = this.config.get<string>('DOJAH_API_KEY');
if (!apiKey) {
  this.logger.warn('Dojah not configured — NIN verification stub mode');
  return { verified: true, name: 'Stub User' };
}
```

**Critical difference from `users.service.ts`:** `KycService` must use `EncryptionService` — a new global service. PII MUST NOT be logged at any point. Only log `userId` and `verified: true`.

---

### `backend/src/common/services/encryption.service.ts` (service, transform — CREATE)

**Analog:** `backend/src/common/services/paystack.service.ts` (lines 1–50 — full file read above)

**Injectable + ConfigService pattern** (lines 20–24):
```typescript
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private config: ConfigService) {
    const keyHex = config.get<string>('ENCRYPTION_KEY');
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }
```

**No logger needed** — pure crypto utility (contrast with `PaystackService` which logs errors; encryption errors should throw, not swallow).

**Import pattern:**
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
```

**Storage format:** `iv_hex:authTag_hex:ciphertext_hex` (three colon-separated parts). Must call `cipher.getAuthTag()` after `cipher.final()` (GCM pitfall).

---

### `backend/src/modules/users/dto/verify-bvn.dto.ts` and `verify-nin.dto.ts` (DTOs — CREATE)

**Analog:** `backend/src/modules/auth/dto/register.dto.ts` (confirmed exists; inline DTO pattern from `users.controller.ts` lines 18–22)

**DTO pattern** (from `users.controller.ts` lines 18–22 — inline DTO as class):
```typescript
class SwitchRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
```

**Adapted for BVN/NIN:**
```typescript
import { IsString, Length, Matches } from 'class-validator';

export class VerifyBvnDto {
  @IsString()
  @Length(11, 11, { message: 'BVN must be exactly 11 digits' })
  @Matches(/^\d{11}$/, { message: 'BVN must be 11 numeric digits' })
  bvn: string;
}

export class VerifyNinDto {
  @IsString()
  @Length(11, 11, { message: 'NIN must be exactly 11 digits' })
  @Matches(/^\d{11}$/, { message: 'NIN must be 11 numeric digits' })
  nin: string;
}
```

**Pattern note:** Use `@Matches` with numeric regex instead of `@IsMobilePhone` (that is for phone numbers). The 11-digit numeric constraint matches Nigeria's BVN and NIN format.

---

### `backend/src/modules/users/users.module.ts` (module — MODIFY)

**Analog:** `backend/src/modules/ai/ai.module.ts` (lines 1–9 — full file read above)

**Current module pattern** (full file):
```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

**Modified pattern — add KycService:**
```typescript
@Module({
  controllers: [UsersController],
  providers: [UsersService, KycService],
  exports: [UsersService, KycService],
})
export class UsersModule {}
```

**Note:** `EncryptionService` belongs in `CommonModule` (global `@Global()` — all services in `backend/src/common/` are registered in `CommonModule` and available everywhere without re-importing). `PaystackService` is already in `CommonModule`, so `KycService` can inject it without additional module wiring.

---

### `backend/prisma/schema.prisma` (migration — MODIFY)

**Analog:** Self-extend. KYCStatus enum confirmed at line 33 (per UI-SPEC pre-population audit). `bvn` and `nin` String? fields already exist (confirmed by `users.service.ts` line 79–80 `eraseData` nulling them).

**Fields to ADD to User model:**
```prisma
bvnHash              String?           // bcrypt hash for duplicate BVN lookup
ninHash              String?           // bcrypt hash for duplicate NIN lookup
kycBvnVerifiedAt     DateTime?         // when BVN tier was verified
kycNinVerifiedAt     DateTime?         // when NIN tier was verified
kycLivenessVerifiedAt DateTime?        // when Smile Identity liveness was verified
```

**`eraseData()` in `users.service.ts` must also null these new fields** — add to the `data` object at lines 69–83:
```typescript
bvnHash: null,
ninHash: null,
kycBvnVerifiedAt: null,
kycNinVerifiedAt: null,
kycLivenessVerifiedAt: null,
```

**PlatformConfig keys to seed (add to seed-demo.js):**
```
wallet.tier.phone_limit    = 50000
wallet.tier.bvn_limit      = 200000
wallet.tier.nin_limit      = 1000000
wallet.tier.liveness_limit = 5000000
```

---

### `mobile/app/ai-chat.tsx` (component, streaming — CREATE)

**Analog:** `mobile/app/(tabs)/delivery.tsx` (lines 1–748 — full file read above)

**Import pattern** (lines 1–28 from `delivery.tsx`):
```typescript
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, ScrollView, TextInput, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Calendar, Home, Car, Cloud, Send, Bot } from 'lucide-react-native';
```

**New import for SSE (not in delivery.tsx):**
```typescript
import EventSource from 'react-native-sse';
```

**Color constants** (lines 31–34 from `delivery.tsx` — copy verbatim):
```typescript
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
```

**API_BASE declaration** (line 33 from `delivery.tsx`): copy exactly — `WS_BASE` line is not needed for AI chat (SSE, not WebSocket).

**Ref pattern for SSE cleanup** (lines 75–76 from `delivery.tsx`):
```typescript
const socketRef = useRef<Socket | null>(null);
const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
```
Adapted:
```typescript
const esRef = useRef<EventSource | null>(null);
```

**Effect cleanup pattern** (lines 108–113 from `delivery.tsx`):
```typescript
return () => {
  cancelled = true;
  socketRef.current?.disconnect();
};
```
Adapted:
```typescript
return () => { esRef.current?.close(); };
```

**CTA button + disabled pattern** (lines 335–346, 652–654 from `delivery.tsx`):
```typescript
<TouchableOpacity
  style={[styles.ctaButton, !canRequest && styles.ctaDisabled]}
  onPress={handleGetFeeEstimate}
  disabled={!canRequest || loading}
>
  {loading ? <ActivityIndicator color={JUNGLE} /> : <Text style={styles.ctaText}>Get Delivery Quote</Text>}
</TouchableOpacity>

// StyleSheet:
ctaButton: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
ctaDisabled: { opacity: 0.4 },
ctaText: { fontSize: 14, fontWeight: 'bold', color: JUNGLE },
```

**locationRow input pattern** (lines 279–293, 633–644 from `delivery.tsx`):
```typescript
locationRow: {
  flexDirection: 'row', alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
  paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, gap: 8,
},
locationInput: { flex: 1, color: 'white', fontSize: 14 },
```
This is the input bar backing style for the `ai-chat.tsx` message input.

**FlatList inverted** — the AI chat uses `inverted: true` on `FlatList`. There is NO existing codebase analog for an inverted `FlatList` — this is new. Reference UI-SPEC section "Layout structure" directly.

**AsyncStorage persistence pattern** (confirmed in mobile/app/(tabs)/index.tsx per UI-SPEC pre-population audit line 623; the pattern is standard React Native):
```typescript
const CHAT_STORAGE_KEY = 'ai_chat_history';
// On mount:
const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
if (stored) setMessages(JSON.parse(stored));
// On update:
await AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-100)));
```

**Reanimated typing indicator** — from `mobile/app/(tabs)/driver.tsx` lines 88:
```typescript
const progressAnim = useRef(new Animated.Value(1)).current;
```
Use `Animated.loop` + `Animated.sequence` for the three-dot typing indicator (from `react-native-reanimated` per UI-SPEC).

**Critical difference from `delivery.tsx`:** AI Chat uses SSE (`react-native-sse`) instead of WebSockets (`socket.io-client`). The connection is per-message (open → stream → close), not persistent. Do NOT reuse the `io(WS_BASE, {...})` connection pattern.

---

### `mobile/app/kyc.tsx` (component, CRUD — CREATE)

**Analog:** `mobile/app/(tabs)/transport.tsx` (lines 1–673 — full file read above)

**Color + constant imports** (lines 32–35 from `transport.tsx` — copy verbatim):
```typescript
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
```

**ScrollView screen structure** (lines 256–329 from `transport.tsx` — home screen pattern):
```typescript
<SafeAreaView style={styles.container}>
  <ScrollView contentContainerStyle={styles.homeContent} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>...</Text>
    {/* Cards */}
  </ScrollView>
</SafeAreaView>
// StyleSheet:
container: { flex: 1, backgroundColor: JUNGLE },
homeContent: { padding: 16, paddingBottom: 32 },
heading: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 16 },
```

**Input row pattern** (lines 283–294 from `transport.tsx`):
```typescript
<TouchableOpacity style={styles.locationRow} onPress={...}>
  <MapPin size={16} color={GOLD} />
  <TextInput
    style={styles.locationInput}
    placeholder="Enter your 11-digit BVN"
    placeholderTextColor="rgba(255,255,255,0.3)"
    keyboardType="number-pad"
    maxLength={11}
    value={bvnInput}
    onChangeText={setBvnInput}
  />
</TouchableOpacity>
// Same locationRow + locationInput styles as delivery.tsx
```

**CTA + ActivityIndicator pattern** (lines 316–327, 396–398 from `transport.tsx`):
```typescript
<TouchableOpacity
  style={[styles.ctaButton, (!canSubmit || isSubmitting) && styles.ctaDisabled]}
  onPress={handleVerifyBvn}
  disabled={!canSubmit || isSubmitting}
>
  {isSubmitting ? <ActivityIndicator color={JUNGLE} /> : <Text style={styles.ctaText}>Verify BVN</Text>}
</TouchableOpacity>
```

**Cancel/error button styles** (lines 630–637 from `transport.tsx`):
```typescript
cancelButton: { backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 32, marginTop: 24 },
cancelButtonText: { fontSize: 14, fontWeight: 'bold', color: '#DC2626' },
```

**CheckCircle / AlertCircle pattern** (lines 404–411 from `transport.tsx`):
```typescript
import { AlertCircle, CheckCircle } from 'lucide-react-native';
// verified state:
<CheckCircle size={64} color="#22C55E" style={{ marginBottom: 16 }} />
// driver banner (from UI-SPEC):
<AlertCircle size={20} color={GOLD} />
```

**API call pattern** — copy from `delivery.tsx` lines 196–218:
```typescript
const handleConfirmDelivery = useCallback(async () => {
  setLoading(true);
  try {
    const { data } = await api.post('/delivery/orders', {...});
    setOrder(data);
  } catch {
    Alert.alert('Error', 'Something went wrong...');
  } finally {
    setLoading(false);
  }
}, []);
```
Adapted for KYC:
```typescript
const handleVerifyBvn = useCallback(async () => {
  setIsSubmitting(true);
  try {
    await api.post('/users/kyc/bvn', { bvn: bvnInput });
    setTier1State('verified');
  } catch (err: any) {
    Alert.alert('Verification Failed', err?.response?.data?.message ?? 'Check your details and try again.');
    setTier1State('active');
  } finally {
    setIsSubmitting(false);
  }
}, [bvnInput]);
```

**TanStack Query polling pattern** (lines 90–95 from `driver.tsx`):
```typescript
const { data: driverProfile } = useQuery({
  queryKey: ['driver-profile'],
  queryFn: () => api.get('/transport/drivers/me').then(r => r.data),
  refetchInterval: (data) => data?.status === 'APPROVED' ? false : 5000,
});
```
Adapted for KYC pending state:
```typescript
const { data: kycStatus } = useQuery({
  queryKey: ['kyc-status'],
  queryFn: () => api.get('/users/me').then(r => r.data),
  refetchInterval: tier1State === 'pending' || tier2State === 'pending' ? 5000 : false,
  // Polling stops automatically after max 10 attempts (implement via useRef counter)
});
```

**Critical difference from `transport.tsx`:** KYC screen is a single `ScrollView` with static tier cards — no multi-screen state machine. The `screen` state machine from `transport.tsx` is NOT copied. Instead, three separate tier state variables (`tier1State`, `tier2State`, `tier3State`) of type `'locked' | 'active' | 'pending' | 'verified'` drive card rendering.

---

### `mobile/app/_layout.tsx` (config — MODIFY)

**Analog:** `mobile/app/_layout.tsx` (lines 1–33 — full file read above)

**Existing Stack.Screen registration pattern** (lines 25–29):
```typescript
<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
<Stack.Screen name="qr-checkin" options={{ title: 'QR Check-in', presentation: 'modal' }} />
<Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
<Stack.Screen name="stays/[id]" options={{ title: 'Property' }} />
```

**New screens to add** (from UI-SPEC navigation registration section):
```typescript
<Stack.Screen
  name="ai-chat"
  options={{ title: 'AI Concierge', presentation: 'card' }}
/>
<Stack.Screen
  name="kyc"
  options={{ title: 'Identity Verification', presentation: 'card' }}
/>
```

Both screens inherit `screenOptions` (lines 17–23): `headerStyle: { backgroundColor: '#0A1515' }`, `headerTintColor: '#E0AA42'`, `headerTitleStyle: { fontWeight: '700', fontSize: 16 }`, `headerShadowVisible: false`. No per-screen override needed.

---

### `mobile/app/(tabs)/profile.tsx` (component — MODIFY)

**Analog:** `mobile/app/(tabs)/profile.tsx` (lines 1–321 — full file read above)

**Existing menu section pattern** (lines 46–62):
```typescript
const menuSections = [
  {
    title: 'Activity',
    items: [
      { label: 'My Tickets', icon: Ticket, onPress: () => {} },
      { label: 'My Bookings', icon: Home, onPress: () => {} },
      { label: 'My Orders', icon: Package, onPress: () => {} },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Security', icon: Shield, onPress: () => {} },
      { label: 'Settings', icon: Settings, onPress: () => {} },
    ],
  },
];
```

**New items to add to 'Account' section:**
```typescript
{ label: 'AI Concierge', icon: MessageSquare, onPress: () => router.push('/ai-chat' as any) },
{ label: 'Verify Identity', icon: BadgeCheck, onPress: () => router.push('/kyc' as any) },
```

**Router navigation pattern** (lines 36–39 from `profile.tsx`):
```typescript
import { router } from 'expo-router';
// ...
onPress: async () => {
  await SecureStore.deleteItemAsync('access_token');
  router.replace('/login' as any);
}
```
Simplified for navigation:
```typescript
onPress: () => router.push('/ai-chat' as any)
```

**Icon imports** (line 10 from `profile.tsx`):
```typescript
import { Wallet, Ticket, Home, Package, LogOut, ChevronRight, Settings, Shield } from 'lucide-react-native';
// Add:
import { MessageSquare, BadgeCheck } from 'lucide-react-native';
```

**`menuItem` touch row styles** (lines 128–146 — copy verbatim; no changes needed):
```typescript
<TouchableOpacity
  key={label}
  style={[styles.menuItem, idx < section.items.length - 1 && styles.menuItemBorder]}
  onPress={onPress}
  activeOpacity={0.7}
>
  <View style={styles.menuIconBox}>
    <Icon size={16} color={TEXT_SEC} />
  </View>
  <Text style={styles.menuLabel}>{label}</Text>
  <ChevronRight size={15} color={TEXT_MUTED} />
</TouchableOpacity>
```

---

## Shared Patterns

### Authentication Guard (apply to all new backend controller endpoints)

**Source:** `backend/src/modules/ai/ai.controller.ts` lines 13–15
```typescript
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: '...' })
```
Apply to: `POST /users/kyc/bvn`, `POST /users/kyc/nin`, `POST /users/kyc/liveness-complete`, `POST /ai/recommendations`

### CurrentUser Decorator (backend service calls requiring userId)

**Source:** `backend/src/modules/users/users.controller.ts` lines 15, 33
```typescript
import { CurrentUser } from '../../common/decorators/current-user.decorator';
// ...
getMe(@CurrentUser() user: { userId: string }) {
  return this.usersService.getMe(user.userId);
}
```
Apply to: all new KYC controller endpoints. Do NOT use `@Req() req: any` (which is used only in streaming endpoints).

### Error Handling (all backend services)

**Source:** `backend/src/modules/users/users.service.ts` lines 1–6 and `auth.service.ts` line 61
```typescript
// Throw NestJS HTTP exceptions — they are converted to correct status codes automatically
throw new NotFoundException('User not found');
throw new ConflictException('BVN already registered to another account');
throw new BadRequestException('KYC already completed for this tier');
throw new ForbiddenException('Tier 1 must be verified before Tier 2');
```
Apply to: `KycService`, `VectorService`

### Logger Declaration (all new backend services)

**Source:** `backend/src/modules/ai/ai.service.ts` line 10
```typescript
private readonly logger = new Logger(AiService.name);
```
Copy pattern with appropriate class name for each service.

### Section Dividers (complex service methods)

**Source:** `backend/src/modules/ai/ai.service.ts` line 55
```typescript
// ── 1. Fetch LGA ────────────────────────────────────────────────────
```
Use in `streamChatWithTools` to label: `// ── 1. Load user context`, `// ── 2. Query vector personalisation`, `// ── 3. Build system prompt`, `// ── 4. Agentic loop`, `// ── 5. Upsert interaction (fire-and-forget)`

### Mobile Token Retrieval (all mobile SSE/API calls)

**Source:** `mobile/app/(tabs)/transport.tsx` lines 94–95 and `mobile/app/(tabs)/driver.tsx` lines 107–108
```typescript
const token = await SecureStore.getItemAsync('access_token');
```
Apply to: SSE setup in `ai-chat.tsx` (`esRef` initialization). The `api` axios instance (from `mobile/lib/api.ts` line 8) already injects the token via interceptor — use `api.post(...)` for non-SSE calls (KYC endpoints). For SSE, manually inject the token into EventSource headers.

### Mobile API Error Alert Pattern

**Source:** `mobile/app/(tabs)/delivery.tsx` lines 188–190
```typescript
} catch {
  Alert.alert('Error', 'Something went wrong. Your delivery request was not sent. Please try again.');
}
```
Apply to: all `try/catch` blocks in `kyc.tsx` and `ai-chat.tsx` API calls.

---

## No Analog Found

Files where the concept is genuinely new to this codebase (planner should use RESEARCH.md patterns directly):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `react-native-sse` EventSource pattern | mobile utility | streaming | No existing SSE in mobile codebase; transport/delivery use WebSocket (socket.io) instead |
| `@upstash/vector` Index client | service utility | request-response | No vector DB client exists anywhere in codebase |
| `node:crypto` AES-256-GCM encrypt/decrypt | service utility | transform | No existing encryption service; `bcrypt` exists but GCM block cipher is new |
| Claude tool_use agentic loop | service pattern | streaming | `streamChat` is single-turn; `messages.stream()` with `tools` array and `finalMessage()` is new |

For these patterns, use the concrete code examples in `05-RESEARCH.md` sections "Pattern 1" (tool loop), "Pattern 2" (Upstash Vector), "Pattern 3" (AES-256-GCM), and "Pattern 4" (react-native-sse).

---

## Metadata

**Analog search scope:** `backend/src/modules/ai/`, `backend/src/modules/auth/`, `backend/src/modules/users/`, `backend/src/common/services/`, `backend/src/modules/wallet/`, `mobile/app/(tabs)/`, `mobile/app/_layout.tsx`, `mobile/lib/api.ts`
**Files scanned:** 14
**Pattern extraction date:** 2026-05-16
