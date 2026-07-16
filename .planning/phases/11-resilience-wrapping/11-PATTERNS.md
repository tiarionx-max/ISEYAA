# Phase 11: Resilience Wrapping - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 12 (3 new source + 6 modified source + 3 net-new/extended test files, plus 1 module registration edit)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/resilience/resilience.module.ts` | provider (`@Global()` module) | request-response (DI wiring only) | `backend/src/redis/redis.module.ts` | exact |
| `backend/src/resilience/resilience.service.ts` | service (singleton, `OnModuleInit`) | event-driven (policy state machine) + request-response (`execute()` facade) | `backend/src/redis/redis.service.ts` (singleton lifecycle) + `backend/src/modules/transport/transport.service.ts:241-274` (multi-key PlatformConfig read) | role-match (composite analog — no existing resilience/breaker service exists) |
| `backend/src/resilience/resilience.types.ts` | config/types | — | `backend/src/common/services/paystack.service.ts:5-17` (interface-only exports at top of a service file) | role-match |
| `backend/src/common/services/paystack.service.ts` (MODIFIED) | service | request-response (CRUD-adjacent: payment mutation) | itself (existing file — extend in place) | exact |
| `backend/src/common/services/s3.service.ts` (MODIFIED) | service | file-I/O | itself (existing file — extend in place) | exact |
| `backend/src/modules/notifications/notifications.service.ts` (MODIFIED) | service | event-driven (push notify, swallow-and-report) | itself (existing file — extend in place) | exact |
| `backend/src/modules/ai/ai.service.ts` (MODIFIED) | service | streaming (SSE) + request-response (`getLgaIntelligence`) | itself (existing file — extend in place) | exact |
| `backend/src/modules/auth/auth.service.ts` (MODIFIED) | service | request-response (OTP send, fallback chain) | itself (existing file — extend in place) | exact |
| `backend/src/modules/delivery/delivery.service.ts` (MODIFIED) | service | request-response (OTP send, fallback chain) | itself (existing file — extend in place) | exact |
| `backend/src/app.module.ts` (MODIFIED — register module) | config (root module wiring) | — | existing `RedisModule`/`PrismaModule` entries at `app.module.ts:8,6` and `:42,40` | exact |
| `backend/src/resilience/__tests__/resilience.service.spec.ts` | test | — | `backend/src/common/services/__tests__/s3.service.spec.ts` (mocked-constructor-arg pattern) | role-match |
| `backend/src/common/services/__tests__/paystack.service.spec.ts` (NEW) | test | — | `backend/src/common/services/__tests__/s3.service.spec.ts` | role-match |
| `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` (NEW) | test | — | `backend/src/modules/auth/__tests__/auth.service.spec.ts` (mocked-Prisma/Config-provider pattern) | role-match |
| `backend/src/modules/ai/__tests__/ai.service.spec.ts` (MODIFIED — add cases) | test | — | itself (existing file — extend in place) | exact |
| `backend/src/modules/auth/__tests__/auth.service.spec.ts` (MODIFIED — add cases) | test | — | itself (existing file — extend in place) | exact |
| `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (NEW) | test | — | `backend/src/modules/auth/__tests__/auth.service.spec.ts` (closest service with a Termii-style inline SMS fallback under test) | role-match |

## Pattern Assignments

### `backend/src/resilience/resilience.module.ts` (provider, `@Global()`)

**Analog:** `backend/src/redis/redis.module.ts` (full file, 9 lines)

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

Copy this shape exactly for `ResilienceModule`: `@Global()` + `@Module({ providers: [ResilienceService], exports: [ResilienceService] })`. `PrismaModule` (`backend/src/prisma/prisma.module.ts`, 9 lines, identical shape) is a second confirming precedent — both single-service infra modules in this codebase follow this exact 9-line template, no controllers, no extra providers.

**Registration site:** `backend/src/app.module.ts` — add `import { ResilienceModule } from './resilience/resilience.module';` alongside the existing infra-module imports (lines 6-8: `PrismaModule`, `CommonModule`, `RedisModule`) and add `ResilienceModule` to the `imports` array immediately after `RedisModule` (line 42), preserving the existing infra-modules-first ordering convention (`PrismaModule, CommonModule, RedisModule` all precede feature modules at `app.module.ts:40-43`).

---

### `backend/src/resilience/resilience.service.ts` (service, singleton lifecycle + facade)

**Analog 1 (lifecycle):** `backend/src/redis/redis.service.ts:1-13` — `OnModuleInit`/`OnModuleDestroy` singleton pattern

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);
  private enabled = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured — Redis disabled (local dev mode)');
      return;
    }
    // ... builds and caches the client ONCE at module init, held as instance state
  }
```

`ResilienceService` should follow this exact shape: `implements OnModuleInit`, private `Map<Vendor, Policy>` built once in `onModuleInit()`, `Logger` instance named after the class. This is the direct precedent for RESEARCH.md Pattern 1's "build one cached policy instance per vendor, never rebuild per-call" requirement — `RedisService` already demonstrates "build the stateful client once in `onModuleInit`, guard every method call with an `if (!this.client) return <safe default>` check" which is structurally identical to what `ResilienceService.execute()` needs (`if (!policy) throw ...`).

**Analog 2 (PlatformConfig multi-key read per domain):** `backend/src/modules/transport/transport.service.ts:241-247`

```typescript
const [baseFareCfg, perKmCfg] = await Promise.all([
  this.prisma.platformConfig.findUnique({ where: { key: `transport_base_fare_${typeKey}` } }),
  this.prisma.platformConfig.findUnique({ where: { key: `transport_per_km_${typeKey}` } }),
]);

const baseFare = baseFareCfg ? Number(baseFareCfg.value) : defaults.base;
const perKmFare = perKmCfg ? Number(perKmCfg.value) : defaults.perKm;
```

This is the exact `Promise.all` + fallback-to-hardcoded-default pattern to copy for `ResilienceService.readConfig(vendor)` — read multiple related keys in parallel, `?? defaults` fallback per key, `Number(...)` coercion since `PlatformConfig.value` is `Json`. Simpler single-key variant at `backend/src/modules/marketplace/marketplace.service.ts:187-188`:

```typescript
// Fetch fee config from platform_config — NEVER hardcode
const feeConfig = await this.prisma.platformConfig.findUnique({ where: { key: 'PLATFORM_FEE_PCT' } });
const platformFeePct = feeConfig ? Number(feeConfig.value) : 0.10;
```

Note the `// NEVER hardcode` comment convention at `marketplace.service.ts:186` — reuse this exact comment style above each PlatformConfig-backed resilience default per CLAUDE.md's "Platform fee source: always from DB, never hardcoded" precedent that D-06 explicitly extends.

**PlatformConfig schema (the model being read/written):** `backend/prisma/schema.prisma:649-660`

```prisma
model PlatformConfig {
  id        String    @id @default(uuid())
  key       String    @unique
  value     Json
  isPublic  Boolean   @default(false)
  metadata  Json?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@map("platform_configs")
}
```
No migration needed to add resilience keys — `key` is a free-form unique string, `value` is `Json`, matching D-06/Pattern 2's "ad-hoc write, no seed script required" approach. New keys follow the `resilience.<vendor>.<setting>` naming from D-07 (e.g. `resilience.paystack.timeout_ms`) — this is a new naming convention (dot-namespaced) vs. the existing `transport_base_fare_${typeKey}` (underscore-namespaced) and `PLATFORM_FEE_PCT` (flat SCREAMING_SNAKE) conventions; RESEARCH.md's own examples already commit to the dot-namespaced form for this domain, so follow RESEARCH.md's key names exactly rather than either existing convention.

**Constructor injection convention:** `PrismaService` is injected via bare constructor param (no explicit `@Inject`) exactly like `transport.service.ts` and every other feature service — `constructor(private prisma: PrismaService) {}`.

---

### `backend/src/resilience/resilience.types.ts` (types)

**Analog:** `backend/src/common/services/paystack.service.ts:5-17` — plain `interface` exports colocated at the top of a service file, no separate types file precedent exists in this codebase (every other module inlines its interfaces). This IS a new file-organization pattern for this phase (justified because `resilience.types.ts` is shared across `resilience.service.ts` AND every modified vendor service file, unlike Paystack's interfaces which are private to one file). Follow the same plain-`interface`/`type` export style (no classes, no decorators) shown in `paystack.service.ts:5-17`:

```typescript
export interface InitiatePaymentParams {
  email: string;
  amountKobo: number;
  reference: string;
  metadata?: Record<string, any>;
  callbackUrl?: string;
}

export interface InitiatePaymentResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}
```

---

### `backend/src/common/services/paystack.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** Full current file read (135 lines). Key excerpts:

**Imports (lines 1-3) — add to this block, do not replace:**
```typescript
import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
```
`ServiceUnavailableException` is ALREADY imported (used at line 132 in `refundCharge`) — this is the exact exception class D-05 mandates reusing for all vendors, already established here.

**Existing try/catch + rethrow shape to preserve, `initiatePayment()` (lines 36-56):**
```typescript
try {
  const response = await axios.post(
    `${this.baseUrl}/transaction/initialize`,
    { email, amount: amountKobo, reference, metadata, ...(callbackUrl && { callback_url: callbackUrl }) },
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const { authorization_url, access_code, reference: ref } = response.data.data;
  return { authorizationUrl: authorization_url, accessCode: access_code, reference: ref };
} catch (err) {
  const status = (err as any)?.response?.status;
  const body = (err as any)?.response?.data;
  this.logger.error(`Paystack initiate failed (HTTP ${status}): ${JSON.stringify(body) ?? (err as Error).message}`);
  throw err;
}
```
Wrap the `axios.post` call in `this.resilience.execute('paystack', () => axios.post(...))`; the existing `catch` block's `logger.error` line stays, but the final `throw err` becomes `throw new ServiceUnavailableException('Paystack is temporarily unavailable, please try again shortly')` per D-01/D-05 — ONLY when the error is a resilience-policy error (circuit-open/timeout/retry-exhausted), not for the 400-class business error already special-cased in `resolveBvn`.

**Existing D-05-compliant pattern already in this file, `refundCharge()` (lines 127-133) — this is the closest in-repo precedent for the exact target shape every other vendor call should end up looking like:**
```typescript
} catch (err: any) {
  this.logger.error(
    `Paystack refund failed for ${reference}`,
    err?.response?.data ?? err.message,
  );
  throw new ServiceUnavailableException('Refund gateway unavailable. Retry queued.');
}
```
Note `refundCharge` already has a raw `timeout: 10_000` on the axios call (line 120) — per RESEARCH.md Pitfall 6, this timeout should move to the cockatiel `timeout()` policy layer, and per D-07 `refundCharge` may warrant a stricter/lower `resilience.paystack.retry_count` given non-idempotency risk.

**Business-error exception to NOT wrap in generic 503 — `resolveBvn()` (lines 82-88):**
```typescript
throw new BadRequestException('BVN verification failed');
} catch (err: any) {
  if (err instanceof BadRequestException) throw err;
  this.logger.error('Paystack BVN resolve failed', err?.response?.data ?? err.message);
  throw new BadRequestException('BVN verification failed');
}
```
This entire catch block already treats ALL Paystack BVN failures (including transient network errors) as `BadRequestException`, not distinguishing vendor-outage from bad-BVN today. Per RESEARCH.md's Pitfall 4 discussion, only wrap the `axios.get` call itself in `resilience.execute('paystack', ...)` — if the wrapped call throws due to circuit-open/timeout, that should become the D-05 `ServiceUnavailableException`, while a genuine `status !== true` response (line 74) still produces the existing `BadRequestException('BVN verification failed')`.

---

### `backend/src/common/services/s3.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** `upload()` method (lines 65-92):
```typescript
async upload(key: string, body: Buffer, contentType: string): Promise<string> {
  if (this.mode === 'unconfigured') {
    throw new Error('S3 not configured — set AWS_ACCESS_KEY_ID + AWS_S3_BUCKET (or R2_* equivalents) in env');
  }
  try {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
        ...(this.mode === 'aws' && { ACL: 'public-read' as const }),
      }),
    );
    if (this.cdnBase) return `${this.cdnBase}/${key}`;
    // ...URL-building fallthrough, unchanged
  } catch (err: any) {
    this.logger.error(`S3 upload failed for key ${key}`, err.message);
    throw err;
  }
}
```
Wrap only the `this.s3.send(...)` call in `this.resilience.execute('s3', () => this.s3.send(...))`; the `if (this.mode === 'unconfigured')` stub-guard at the top stays exactly as-is (RESEARCH.md: "stub-mode branches sit before any policy wrapping"). The final `throw err;` becomes `throw new ServiceUnavailableException('Storage is temporarily unavailable, please try again shortly');` (D-01/D-05) — this exactly matches RESEARCH.md's own Code Example for this file. `ServiceUnavailableException` is NOT currently imported in this file — add it to the `@nestjs/common` import at line 1 (currently only imports `Injectable, Logger`).

This service is called from 6 sites (per CONTEXT.md canonical refs): `events.service.ts:154,235`, `stays.service.ts:136`, `studio.service.ts:205`, `users.controller.ts:93`, `delivery.service.ts:537`, `itinerary-pdf.service.ts:49` — none of these call sites need modification; wrapping at `upload()` covers all of them (RESEARCH.md integration point).

**Constructor injection to add:** `private resilience: ResilienceService` param — follow the existing `constructor(private config: ConfigService)` single-param style at line 22.

---

### `backend/src/modules/notifications/notifications.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** `sendPush()` (lines 63-113), the exact swallow-and-report contract D-02 requires preserving:
```typescript
async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  const meta = user?.metadata as any;
  const token = meta?.fcmToken;

  if (!token) {
    this.logger.warn(`No FCM token for user ${userId}`);
    return { sent: false, reason: 'no_token' as const };
  }
  if (!this.fcmAuthClient || !this.fcmProjectId) {
    this.logger.warn('FCM not configured — skipping push');
    return { sent: false, reason: 'not_configured' as const };
  }

  try {
    const accessTokenResponse = await this.fcmAuthClient.getAccessToken();
    const accessToken = accessTokenResponse?.token;
    if (!accessToken) {
      this.logger.error('Failed to obtain FCM access token');
      return { sent: false, reason: 'auth_failed' as const };
    }
    // ...builds stringData, then:
    await axios.post(`https://fcm.googleapis.com/v1/projects/${this.fcmProjectId}/messages:send`, {...}, {...});
    return { sent: true };
  } catch (err: any) {
    const detail = err?.response?.data ?? err.message;
    this.logger.error('FCM v1 send failed', JSON.stringify(detail));
    return { sent: false, reason: 'send_failed' as const };
  }
}
```
Two valid approaches per RESEARCH.md Pattern 5 (either is acceptable): (a) keep this exact try/catch shape and just wrap the inner `axios.post` call in `this.resilience.execute('fcm', ...)` — the existing catch block already returns `{sent:false, reason:'send_failed'}` for ANY thrown error including `BrokenCircuitError`, so no catch-block change is needed at all; or (b) replace the try/catch with cockatiel's `fallback()` primitive as shown in RESEARCH.md Pattern 5. Both preserve the `{sent, reason}` return shape — no caller changes needed (`tour-notifications.service.ts:195,278,337`, `notifications.controller.ts:28`).

**Constructor to extend (lines 19-24):**
```typescript
constructor(
  private prisma: PrismaService,
  private config: ConfigService,
) {
  this.initFcm();
}
```
Add `private resilience: ResilienceService` as a third param, same bare-injection style.

---

### `backend/src/modules/ai/ai.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** Constructor already builds the Anthropic client (line 93, outside the read ranges shown above but confirmed via grep):
```typescript
this.anthropic = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') ?? 'dummy' });
```
Per RESEARCH.md Pitfall 3, add `maxRetries: 0` here: `new Anthropic({ apiKey: ..., maxRetries: 0 })` — this is a required one-line change alongside the resilience wrapping, not optional.

**`streamChatWithTools()` connection-call site (lines 272-279) — wrap ONLY this, not the `for await` loop below it:**
```typescript
for (let turn = 0; turn < 3; turn++) {
  const stream = await this.anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    tools: this.TOOLS,
    messages: messageHistory,
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      accumulatedText += chunk.delta.text;
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }
  // ...finalMessage()/tool-use loop below, unchanged, runs outside policy.execute()
```
The outer method already has a top-level `try { ... } catch (err) { this.logger.error('AI stream error', err); res.write(...); res.end(); }` (lines 249, 327-331) — RESEARCH.md Pattern 4 recommends wrapping just the `this.anthropic.messages.stream({...})` call in `this.resilience.execute('anthropic', () => ...)` inside the existing try block; a `BrokenCircuitError` thrown there is caught by the existing outer catch and produces the existing SSE error event — no new catch block needed, the stub-guard at lines 242-247 (`if (!this.config.get('ANTHROPIC_API_KEY'))`) stays untouched exactly as RESEARCH.md specifies.

**`getLgaIntelligence()` (lines 515-532) — currently has NO try/catch at all, must be added as part of this wrap (explicit byproduct per CONTEXT.md discretion note):**
```typescript
async getLgaIntelligence(lgaId: string, question: string) {
  const lga = await this.prisma.lGA.findUnique({ where: { id: lgaId } });
  if (!lga) throw new NotFoundException(`LGA not found: ${lgaId}`);

  const response = await this.anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{ role: 'user', content: `LGA: ${lga.name}\nQuestion: ${question}\n...` }],
  });

  return { answer: (response.content[0] as any).text, lgaId };
}
```
Wrap `this.anthropic.messages.create(...)` in `this.resilience.execute('anthropic', () => ...)` inside a new `try { ... } catch (err) { this.logger.error(...); throw new ServiceUnavailableException('AI service is temporarily unavailable, please try again shortly'); }` — this is a net-new catch block (not a modification of an existing one), matching the D-01/D-05 fail-loud contract for the non-streaming Anthropic call. Import `ServiceUnavailableException` from `@nestjs/common` (currently imports only `Injectable, Logger, NotFoundException` at line 1).

**`streamItinerary()` (referenced at RESEARCH.md L343-511, existing catch at lines 506-510)** follows the identical connection-call-only wrapping pattern as `streamChatWithTools()` — same `try {...} catch (err) { this.logger.error('Itinerary stream error', err); res.write(\`event: error\\ndata: ...\`); res.end(); }` shape already present, wrap only the stream-establishment call inside it.

---

### `backend/src/modules/auth/auth.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** `sendTermii()` (lines 288-333), Termii leg only (lines 299-319):
```typescript
try {
  const response = await fetch('https://v3.api.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: phone, from, sms: `...`, type: 'plain', channel, api_key: termiiKey }),
  });
  if (response.ok) {
    this.logger.log(`OTP sent via Termii (${channel}) to ${phone}`);
    return;
  }
  this.logger.error(`Termii error: ${response.status} ${await response.text()} — falling back to Twilio`);
} catch (err) {
  this.logger.error('Termii request failed — falling back to Twilio', err);
}
// falls through to Twilio fallback (lines 322-330), then console-stub warn (line 332) — UNCHANGED
```
Per D-03: wrap only the `fetch(...)` call in `this.resilience.execute('termiiAuth', () => fetch(...))`. The existing `catch (err) { this.logger.error(...) }` block requires NO new throw — a `BrokenCircuitError`/timeout lands in this exact same catch and the code already falls through to Twilio. This is the RESEARCH.md Code Example "Wrapping Termii (auth.service.ts leg)" verbatim — no deviation needed.

**Constructor to extend:** locate the existing `constructor(...)` (not shown in the read range above — same file) and add `private resilience: ResilienceService` alongside existing injected services (`PrismaService`, `RedisService`, `JwtService`, `ConfigService` per the test file's provider list).

---

### `backend/src/modules/delivery/delivery.service.ts` (MODIFIED)

**File itself is the analog — extend in place.** `sendTermiiDeliveryOtp()` (lines 320-346):
```typescript
private async sendTermiiDeliveryOtp(phone: string, otp: string): Promise<void> {
  const apiKey = this.config.get<string>('TERMII_API_KEY');
  if (!apiKey) {
    this.logger.warn(`[TERMII STUB] Delivery OTP ${otp} for ${phone} — set TERMII_API_KEY to send live SMS`);
    return;
  }

  try {
    const response = await fetch('https://v3.api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, from: this.config.get('TERMII_SENDER_ID', 'ISEYAA'), sms: `...`, type: 'plain', channel: 'generic', api_key: apiKey }),
    });
    if (!response.ok) {
      this.logger.error(`Termii error: ${response.status} ${await response.text()}`);
    }
  } catch (err) {
    this.logger.error('Termii delivery OTP request failed', err);
  }
}
```
Per D-03/D-08: this is a SEPARATE call site from `auth.service.ts`'s — do not unify. Wrap only `fetch(...)` in `this.resilience.execute('termiiDelivery', () => fetch(...))`. The existing `catch (err) { this.logger.error(...) }` needs no new throw — it already logs-and-swallows (own stub log distinct from auth's Twilio fallback), matching D-03 exactly. The `if (!apiKey)` stub guard at the top stays untouched.

**Constructor to extend:** add `private resilience: ResilienceService` to the existing injected-services list in this file's constructor.

---

## Shared Patterns

### `@Global()` singleton module registration
**Source:** `backend/src/redis/redis.module.ts` (full file) and `backend/src/prisma/prisma.module.ts` (full file) — both 9-line files
**Apply to:** `backend/src/resilience/resilience.module.ts`
```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

### `OnModuleInit` singleton lifecycle with cached state
**Source:** `backend/src/redis/redis.service.ts:6,13-51` (class declaration + `onModuleInit()`)
**Apply to:** `backend/src/resilience/resilience.service.ts`
```typescript
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger = new Logger(RedisService.name);
  onModuleInit() { /* build stateful client ONCE, cache as instance field */ }
}
```

### PlatformConfig read-with-fallback-default (per-vendor threshold source, D-06/D-07)
**Source:** `backend/src/modules/transport/transport.service.ts:241-247` (multi-key, parallel) and `backend/src/modules/marketplace/marketplace.service.ts:186-188` (single-key)
**Apply to:** `ResilienceService.readConfig(vendor)` and any other file needing to read `resilience.<vendor>.*` keys
```typescript
// Fetch fee config from platform_config — NEVER hardcode
const feeConfig = await this.prisma.platformConfig.findUnique({ where: { key: 'PLATFORM_FEE_PCT' } });
const platformFeePct = feeConfig ? Number(feeConfig.value) : 0.10;
```

### Generic 503 exception for vendor-outage fail-fast (D-01/D-05)
**Source:** `backend/src/common/services/paystack.service.ts:127-133` (`refundCharge()` catch block — the ONE existing call site already doing exactly what D-05 mandates)
**Apply to:** `paystack.service.ts` (other two methods), `s3.service.ts`, `ai.service.ts` (`getLgaIntelligence`, and the caught-connection-failure paths of the two SSE methods)
```typescript
} catch (err: any) {
  this.logger.error(`Paystack refund failed for ${reference}`, err?.response?.data ?? err.message);
  throw new ServiceUnavailableException('Refund gateway unavailable. Retry queued.');
}
```

### Swallow-and-report (never throw) contract — FCM only (D-02)
**Source:** `backend/src/modules/notifications/notifications.service.ts:63-113` (full `sendPush()` method)
**Apply to:** `notifications.service.ts` only — no other vendor uses this contract
```typescript
} catch (err: any) {
  const detail = err?.response?.data ?? err.message;
  this.logger.error('FCM v1 send failed', JSON.stringify(detail));
  return { sent: false, reason: 'send_failed' as const };
}
```

### Termii try/catch-and-fall-through (never throw at this layer) — two independent legs (D-03/D-08)
**Source:** `backend/src/modules/auth/auth.service.ts:299-319` and `backend/src/modules/delivery/delivery.service.ts:327-345`
**Apply to:** Each file independently — do NOT extract a shared helper (D-08 explicitly forbids consolidation)

### Test mocking: constructor-arg capture for a wrapped SDK client
**Source:** `backend/src/common/services/__tests__/s3.service.spec.ts:1-57` (full setup block — `jest.mock('@aws-sdk/client-s3', ...)`, `Test.createTestingModule` with `{ provide: ConfigService, useValue: mockConfig }`)
**Apply to:** `resilience.service.spec.ts` (mock `cockatiel`'s exported `circuitBreaker`/`retry`/`timeout`/`wrap` factory functions the same way `S3Client` is mocked), `paystack.service.spec.ts` (mock `axios`), `notifications.service.spec.ts` (mock `axios` + `google-auth-library`)
```typescript
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => {
    capturedS3Config = config;
    return { send: jest.fn().mockResolvedValue({}), _config: config };
  }),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
}));
```

### Test mocking: `Test.createTestingModule` with `useValue` mock providers (no real DB/Redis)
**Source:** `backend/src/modules/auth/__tests__/auth.service.spec.ts:10-57` (`mockPrisma`, `mockRedis`, `mockJwt`, `mockConfig` objects + `beforeEach` module compile)
**Apply to:** `resilience.service.spec.ts` (mock `PrismaService.platformConfig.findMany`), `paystack.service.spec.ts`, `notifications.service.spec.ts`, `delivery.service.spec.ts` — all need a `ResilienceService` mock/stub injected via `{ provide: ResilienceService, useValue: { execute: jest.fn((vendor, fn) => fn()) } }` (pass-through stub is the standard way to keep existing tests green while adding resilience wiring, since the policy itself is unit-tested separately in `resilience.service.spec.ts`)
```typescript
const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, string> = { JWT_SECRET: 'test_secret', JWT_REFRESH_SECRET: 'test_refresh_secret' };
    return vals[key] ?? def;
  }),
};

describe('AuthService', () => {
  let service: AuthService;
  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });
```

### Test mocking: SDK stream mock for SSE (Anthropic)
**Source:** `backend/src/modules/ai/__tests__/ai.service.spec.ts:1-49` (full `jest.mock('@anthropic-ai/sdk', ...)` block + `makeStream()` helper)
**Apply to:** New test cases in `ai.service.spec.ts` covering `getLgaIntelligence`'s new try/catch and the connection-only-retry behavior — reuse `mockStreamFactory`/`makeStream()` exactly as-is, add a case where `messages.stream` rejects (simulating circuit-open) to assert the SSE error path fires and no retry happens after a chunk has been yielded.

## No Analog Found

None. Every file in this phase's inventory is either an existing file being extended in place, or a net-new file with a strong structural analog (`RedisModule`/`RedisService`/`transport.service.ts` for the resilience module/service, `s3.service.spec.ts`/`auth.service.spec.ts` for the new test files).

## Metadata

**Analog search scope:** `backend/src/common/services/`, `backend/src/modules/{auth,delivery,ai,notifications,marketplace,transport}/`, `backend/src/redis/`, `backend/src/prisma/`, `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/prisma/schema.prisma`, all existing `__tests__/` directories under the above.
**Files scanned:** 17 (12 source files fully or partially read + 3 test files + `schema.prisma` PlatformConfig model + `app.module.ts`)
**Pattern extraction date:** 2026-07-16
