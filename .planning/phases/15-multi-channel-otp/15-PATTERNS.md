# Phase 15: Multi-Channel OTP - Pattern Map

**Mapped:** 2026-07-18
**Files analyzed:** 17
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `backend/src/common/enums/otp-channel.enum.ts` (new) | model/enum | transform | `backend/src/common/enums/user-role.enum.ts` | exact |
| `backend/prisma/schema.prisma` (modify — `OtpChannel` enum + `User.otpChannel`) | model | CRUD | same file, `UserStatus`/`KYCStatus` enum + `User.status`/`kycStatus` field precedent | exact |
| `backend/src/modules/auth/dto/otp-send.dto.ts` (modify) | model (DTO) | request-response | `backend/src/modules/auth/dto/register.dto.ts` (`role?: UserRole` optional enum field) | exact |
| `backend/src/modules/auth/dto/phone-auth.dto.ts` (modify) | model (DTO) | request-response | same as above | exact |
| `backend/src/modules/auth/dto/register.dto.ts` (modify) | model (DTO) | request-response | itself — extend existing `role?` pattern | exact |
| `backend/src/modules/users/dto/change-otp-channel.dto.ts` (new) | model (DTO) | request-response | inline `SwitchRoleDto` in `backend/src/modules/users/users.controller.ts:30-33` | exact |
| `backend/src/modules/auth/auth.service.ts` (modify — `sendOtp`, `phoneAuth`, new `sendMetaWhatsapp()`, remove Termii-WA branch) | service | request-response + event-driven (fallback chain) | itself — `sendTermii()`/`sendTwilio()` (lines 290-366) is the direct template for the new methods | exact |
| `backend/src/common/services/sendgrid.service.ts` (modify — add `sendOtpEmail()`) | service | request-response | itself — `sendTicketConfirmation`/`sendBookingConfirmation` (lines 26-135) | exact |
| `backend/src/resilience/resilience.types.ts` (modify — add `metaWhatsapp`/`sendgrid` vendors) | config | transform | itself — existing `Vendor` union + `RESILIENCE_DEFAULTS` map | exact |
| `backend/src/modules/users/users.controller.ts` (modify — `PATCH /users/me/otp-channel`) | controller | request-response | itself — `switchRole` handler (lines 59-64) | exact |
| `backend/src/modules/users/users.service.ts` (modify — `updateOtpChannel()`) | service | CRUD | itself — `switchRole()` (lines 46-62) | exact |
| `.env.example` (modify — remove `TERMII_WHATSAPP_SENDER_ID`, add `META_WHATSAPP_*`) | config | — | itself — `SENDGRID_*`/`TERMII_*` block (lines 24-29) | exact |
| `backend/src/modules/auth/__tests__/auth.service.spec.ts` (modify — new channel/fallback/lockout cases) | test | request-response | itself — existing `describe('sendOtp', ...)` block (lines 158-211) | exact |
| `backend/src/resilience/__tests__/resilience.service.spec.ts` (modify — vendor count 7→9) | test | transform | itself — line 40-45 assertion | exact |
| `backend/src/common/services/__tests__/sendgrid.service.spec.ts` (new) | test | request-response | `backend/src/common/services/__tests__/s3.service.spec.ts` (closest existing common-service spec structure) | role-match |
| `mobile/app/auth/phone.tsx` (modify — add channel picker) | component | request-response | itself — existing phone-entry screen (full file read) | exact |
| `mobile/app/otp-channel-settings.tsx` (new, settings-screen control D-07) | component | request-response | `mobile/app/kyc.tsx` (flat standalone screen pattern, `TierCard`-style selectable option cards) + `mobile/app/(tabs)/profile.tsx` `MenuRow`/`ToggleSwitch` (navigation entry point) | role-match |

## Pattern Assignments

### `backend/src/common/enums/otp-channel.enum.ts` (new)

**Analog:** `backend/src/common/enums/user-role.enum.ts` (full file, 14 lines)

**Full existing file (style template):**
```typescript
export enum UserRole {
  CITIZEN = 'CITIZEN',
  TOURIST = 'TOURIST',
  VENDOR = 'VENDOR',
  ORGANISER = 'ORGANISER',
  HOST = 'HOST',
  DRIVER = 'DRIVER',
  CREATIVE = 'CREATIVE',
  TOUR_GUIDE = 'TOUR_GUIDE',
  LGA_ADMIN = 'LGA_ADMIN',
  STATE_ADMIN = 'STATE_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  MINISTRY_VIEWER = 'MINISTRY_VIEWER',
}

export const REGISTERABLE_ROLES: UserRole[] = [
  UserRole.CITIZEN,
  UserRole.TOURIST,
  UserRole.VENDOR,
  UserRole.ORGANISER,
  UserRole.HOST,
];
```

**New file should mirror this exact shape** (`export enum X { MEMBER = 'MEMBER' }`, self-referential string values, no numeric enum):
```typescript
export enum OtpChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}
```

---

### `backend/prisma/schema.prisma` (modify)

**Analog:** same file — `UserStatus`/`KYCStatus` enum block (lines 28-40) + `User.status`/`kycStatus` fields (lines 234-235)

**Enum block pattern** (lines 28-40, existing):
```prisma
enum UserStatus {
  PENDING
  ACTIVE
  SUSPENDED
  DELETED
}

enum KYCStatus {
  NONE
  PENDING
  VERIFIED
  REJECTED
}
```
Add a new `enum OtpChannel { SMS WHATSAPP EMAIL }` block immediately after `KYCStatus` (line 40), matching this bare-identifier-list style (no `= 'STRING'` — Prisma enums don't take string literals in schema, only in generated TS).

**Field pattern on `User` model** (lines 232-235, existing):
```prisma
  role                  UserRole   @default(CITIZEN)
  registeredRoles       UserRole[]
  status                UserStatus @default(PENDING)
  kycStatus             KYCStatus  @default(NONE)
```
Add `otpChannel OtpChannel @default(SMS)` in the same declarative block (CONTEXT.md D-05: defaults to SMS if unselected; RESEARCH.md Code Examples confirms this exact line).

---

### `backend/src/modules/auth/dto/otp-send.dto.ts` / `phone-auth.dto.ts` / `register.dto.ts` (modify)

**Analog:** `backend/src/modules/auth/dto/register.dto.ts` (full file, 27 lines) — its `role?: UserRole` optional-enum field is the direct template.

**Full existing file (imports + optional enum field pattern)**:
```typescript
import { IsEmail, IsString, MinLength, IsOptional, IsMobilePhone, IsEnum, IsBoolean } from 'class-validator';
import { UserRole, REGISTERABLE_ROLES } from '../../../common/enums/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(REGISTERABLE_ROLES, { message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` })
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  ndpaConsent: boolean;
}
```

**Current `otp-send.dto.ts`** (full file, 6 lines — to be extended):
```typescript
import { IsMobilePhone } from 'class-validator';

export class OtpSendDto {
  @IsMobilePhone('en-NG')
  phone: string;
}
```

**Current `phone-auth.dto.ts`** (full file, 10 lines — to be extended):
```typescript
import { IsMobilePhone, IsString, Length } from 'class-validator';

export class PhoneAuthDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
```

**New field to add to all three DTOs** (matches `RegisterDto`'s `@IsEnum` + `@IsOptional` shape, per RESEARCH.md Code Examples):
```typescript
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel;
```
Pitfall 2/3 (RESEARCH.md): the literal integration points that matter are `OtpSendDto`/`PhoneAuthDto` (mobile's real registration flow) — `RegisterDto` gets the field for schema consistency only, since its `register()` flow never calls `sendOtp`.

---

### `backend/src/modules/users/dto/change-otp-channel.dto.ts` (new)

**Analog:** inline `SwitchRoleDto` in `backend/src/modules/users/users.controller.ts` (lines 30-33)

**Full existing pattern (inline class colocated with controller)**:
```typescript
class SwitchRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
```

**New file should follow this single-field DTO shape**, per RESEARCH.md Open Question 2's recommendation (dedicated route + DTO, mirroring `SwitchRoleDto`'s precedent rather than folding into the untyped `updateMe` body):
```typescript
import { IsEnum } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class ChangeOtpChannelDto {
  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  channel: OtpChannel;
}
```
Note: unlike `SwitchRoleDto` (kept inline in the controller file), this phase's RESEARCH.md structure recommends a real `dto/` file since `backend/src/modules/users/dto/` already exists (`verify-bvn.dto.ts`, `verify-nin.dto.ts`) — follow the existing `dto/` subfolder convention for this module rather than the inline exception.

---

### `backend/src/modules/auth/auth.service.ts` (modify — core of the phase)

**Analog:** itself — `sendTermii()`/`sendTwilio()` (lines 290-366) is the proven fallback-on-throw shape; `sendOtp()` (132-144) and `phoneAuth()` (181-236) are the two call sites needing channel-resolution + fallback wiring.

**Imports pattern** (lines 1-22, existing — relative paths, no `@/` alias):
```typescript
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { PhoneAuthDto } from './dto/phone-auth.dto';
import { UserRole, REGISTERABLE_ROLES } from '../../common/enums/user-role.enum';
```
Add `import { OtpChannel } from '../../common/enums/otp-channel.enum';`

**Current `sendOtp()`** (lines 132-144, to be extended with channel dispatch):
```typescript
  async sendOtp(dto: OtpSendDto) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');
    }

    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(`otp:${dto.phone}`, `${otp}:0`, OTP_TTL);

    await this.sendTermii(dto.phone, otp);
    return { message: 'OTP sent successfully' };
  }
```
Per RESEARCH.md's primary recommendation and Pitfall 3: extend the `otp:<phone>` Redis value to `${otp}:${attempts}:${channel}`; resolve effective channel as `existingUser?.otpChannel ?? dto.channel ?? OtpChannel.SMS`; dispatch to `sendMetaWhatsapp`/`sendOtpEmail`/`sendTermii` based on that channel; wrap each new-channel call in a try/catch that falls through to `sendTermii(phone, otp)` on any failure (same shape as the existing Termii→Twilio fallback below), setting a `fallbackUsed: true` flag in the response per D-10.

**Fallback-on-throw shape to replicate** (existing `sendTermii()`, lines 290-338 — the WhatsApp-channel branch at lines 293-298/311 must be REMOVED per D-01):
```typescript
  private async sendTermii(phone: string, otp: string) {
    const termiiKey = this.config.get<string>('TERMII_API_KEY');

    if (termiiKey) {
      // Prefer WhatsApp channel when a WhatsApp sender ID is configured (bypasses DND/GSM restrictions)
      const whatsappSender = this.config.get<string>('TERMII_WHATSAPP_SENDER_ID'); // ← REMOVE (D-01)
      const smsSender = this.config.get<string>('TERMII_SENDER_ID', '');

      const channel = whatsappSender ? 'whatsapp' : smsSender ? 'generic' : 'dnd'; // ← channel var simplifies to smsSender ? 'generic' : 'dnd'
      const from = (whatsappSender ?? smsSender) || 'N-Alert';

      try {
        const response = await this.resilience.execute('termiiAuth', ({ signal }) =>
          fetch('https://v3.api.termii.com/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: phone,
              from,
              sms: `Your Iṣẹ́yáá verification code is ${otp}. Valid for 5 minutes. Do not share.`,
              type: 'plain',
              channel,
              api_key: termiiKey,
            }),
            signal,
          }),
        );
        if (response.ok) {
          this.logger.log(`OTP sent via Termii (${channel}) to ${phone}`);
          return;
        }
        this.logger.error(`Termii error: ${response.status} ${await response.text()} — falling back to Twilio`);
      } catch (err) {
        this.logger.error('Termii request failed — falling back to Twilio', err);
      }
    }
    // ... falls through to Twilio unconditionally
  }
```

**New `sendMetaWhatsapp()` method — MUST throw, not swallow** (RESEARCH.md Pattern 2, direct copy target):
```typescript
  private async sendMetaWhatsapp(phone: string, otp: string): Promise<void> {
    const accessToken = this.config.get<string>('META_WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('META_WHATSAPP_PHONE_NUMBER_ID');
    const templateName = this.config.get<string>('META_WHATSAPP_TEMPLATE_NAME');
    const templateLangCode = this.config.get<string>('META_WHATSAPP_TEMPLATE_LANG', 'en_US');

    if (!accessToken || !phoneNumberId || !templateName) {
      throw new Error('Meta WhatsApp credentials not configured');
    }

    const response = await this.resilience.execute('metaWhatsapp', ({ signal }) =>
      fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone.replace('+', ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLangCode },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: otp }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
            ],
          },
        }),
        signal,
      }),
    );
    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Meta WhatsApp error: ${response.status} ${body}`);
      throw new Error(`Meta WhatsApp send failed: ${response.status}`); // MUST throw — no swallow
    }
    this.logger.log(`OTP sent via WhatsApp to ${phone}`);
  }
```

**`phoneAuth()` threading** (lines 181-236, existing) — the user-creation branch (lines 208-227) must persist the channel resolved at `sendOtp()` time by reading it back out of the Redis composite value (`${otp}:${attempts}:${channel}`) rather than defaulting to SMS always (Pitfall 3's explicit warning sign).

**Error handling convention** (existing, `sendTwilio()` lines 340-366 and `audit()` lines 368-383) — external vendor failures are caught, logged via `this.logger.error()`, and either fallen-through or swallowed for non-critical paths (audit log). New channel methods must NOT swallow (Pitfall 1) — only the dispatch-level try/catch in `sendOtp()` swallows, to trigger fallback.

---

### `backend/src/common/services/sendgrid.service.ts` (modify — add `sendOtpEmail()`)

**Analog:** itself — `sendTicketConfirmation()` (lines 26-62) is the direct inline-HTML template; `sendEmail()` (lines 18-24) is the anti-pattern to avoid reusing (Pitfall 1).

**Imports pattern** (lines 1-3, existing):
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
```

**Anti-pattern — `sendEmail()` swallows errors** (lines 18-24, existing — DO NOT call this from `sendOtpEmail()`):
```typescript
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await sgMail.send({ to, from: this.from, subject, html });
    } catch (err) {
      this.logger.error(`SendGrid failed for ${to}: ${err?.response?.body ?? err.message}`);
    }
  }
```

**Inline-HTML template convention to copy** (`sendTicketConfirmation`, lines 26-62 — abbreviated, showing the `<div style="font-family:sans-serif;max-width:600px...">` shape and the `await this.sendEmail(to, subject, html);` closing call):
```typescript
  async sendTicketConfirmation(params: { to: string; firstName: string; /* ... */ }): Promise<void> {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Ticket Confirmed</h2>
        <p>Hello ${params.firstName},</p>
        <!-- ... -->
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;
    await this.sendEmail(to, `Your ticket for ${eventTitle}`, html);
  }
```

**New `sendOtpEmail()` — bypasses `sendEmail()`, calls `sgMail.send()` directly so failure propagates** (RESEARCH.md Pattern 3, Pitfall 1 fix):
```typescript
  async sendOtpEmail(to: string, firstName: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a472a;">Your verification code</h2>
        <p>Hello ${firstName},</p>
        <p style="font-size:28px;font-family:monospace;letter-spacing:4px;font-weight:700;">${otp}</p>
        <p>This code expires in 5 minutes. Do not share it with anyone.</p>
        <p style="color:#666;font-size:12px;margin-top:24px;">Powered by Iṣẹ́yáá — Ogun State Digital Platform</p>
      </div>
    `;
    // Do NOT call this.sendEmail() — it swallows errors (Pitfall 1). Call sgMail.send()
    // directly so a rejection propagates to resilience.execute()'s catch chain.
    await sgMail.send({ to, from: this.from, subject: 'Your Iṣẹ́yáá verification code', html });
  }
```

---

### `backend/src/resilience/resilience.types.ts` (modify)

**Analog:** itself — full file (41 lines)

**Existing `Vendor` union + defaults map** (lines 11-40):
```typescript
export type Vendor =
  | 'paystack'
  | 'paystackRefund'
  | 'termiiAuth'
  | 'termiiDelivery'
  | 'anthropic'
  | 's3'
  | 'fcm';

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  paystack: { timeoutMs: 10_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  paystackRefund: { timeoutMs: 10_000, retryCount: 0, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  termiiAuth: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  termiiDelivery: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  anthropic: { timeoutMs: 8_000, retryCount: 0, failureThreshold: 3, halfOpenAfterMs: 30_000 },
  s3: { timeoutMs: 15_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 20_000 },
  fcm: { timeoutMs: 5_000, retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
};
```
Add `| 'metaWhatsapp' | 'sendgrid'` to the `Vendor` union, and two new entries to `RESILIENCE_DEFAULTS`:
```typescript
  metaWhatsapp: { timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  sendgrid: { timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
```
`ResilienceService.onModuleInit()` (`resilience.service.ts` lines 38-73) iterates `Object.keys(RESILIENCE_DEFAULTS)` automatically — no other resilience-service code changes needed; only `resilience.types.ts` requires edits.

---

### `backend/src/modules/users/users.controller.ts` / `users.service.ts` (modify — settings-screen channel change, D-07)

**Analog:** itself — `switchRole` handler (controller lines 59-64) + `UsersService.switchRole()` (service lines 46-62)

**Controller pattern to copy** (`users.controller.ts` lines 59-64):
```typescript
  @Patch('me/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch active role' })
  switchRole(@CurrentUser() user: { userId: string }, @Body() dto: SwitchRoleDto) {
    return this.usersService.switchRole(user.userId, dto.role);
  }
```
New route (add near this handler, same guard/decorator stack — `@UseGuards(JwtAuthGuard)` is already applied at class level, line 37):
```typescript
  @Patch('me/otp-channel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change OTP delivery channel preference' })
  changeOtpChannel(@CurrentUser() user: { userId: string }, @Body() dto: ChangeOtpChannelDto) {
    return this.usersService.updateOtpChannel(user.userId, dto.channel);
  }
```

**Service pattern to copy** (`users.service.ts` lines 46-62):
```typescript
  async switchRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { registeredRoles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.registeredRoles.includes(role)) {
      throw new ForbiddenException(`Role ${role} is not in your registered roles`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: USER_SELECT,
    });
  }
```
New `updateOtpChannel()` is simpler (no membership check needed, any enum value is valid post-`class-validator`):
```typescript
  async updateOtpChannel(userId: string, channel: OtpChannel) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { otpChannel: channel },
      select: USER_SELECT,
    });
  }
```
Note: `USER_SELECT` (lines 11-29) does not currently project `otpChannel` — add it so `GET /users/me` and this mutation's response both surface the field.

---

### `.env.example` (modify)

**Analog:** itself — `TERMII_*`/`SENDGRID_*` block (lines 24-29)

**Current block:**
```
# ─── Messaging ─────────────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@iseyaa.gov.ng
TERMII_API_KEY=TLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TERMII_SENDER_ID=ISEYAA
TERMII_WHATSAPP_SENDER_ID=       # optional — set to your approved WhatsApp sender ID to bypass GSM/DND; Termii always tried first
```
Remove the `TERMII_WHATSAPP_SENDER_ID` line entirely (D-01/D-02); add a new comment block matching the file's `# ─── Section ───` style:
```
# ─── Messaging — WhatsApp (Meta Business Cloud API, direct integration — Phase 15) ──
META_WHATSAPP_ACCESS_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_TEMPLATE_NAME=
META_WHATSAPP_TEMPLATE_LANG=en_US
```

---

### `backend/src/modules/auth/__tests__/auth.service.spec.ts` (modify)

**Analog:** itself — existing `describe('sendOtp', ...)` block (lines 158-211) and top-of-file mock scaffolding (lines 1-71)

**Mock scaffolding to extend (unchanged shape, existing lines 11-49):**
```typescript
const mockPrisma = {
  user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockRedis = { get: jest.fn(), set: jest.fn(), del: jest.fn(), exists: jest.fn() };
const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};
```
`jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any)` in `beforeEach` (line 59) already guards against live network calls — new WhatsApp/Email tests can override per-test with `.mockResolvedValueOnce`/`.mockRejectedValueOnce`.

**Existing test to model new ones on** (lines 177-185 — asserting the resilience vendor key is used):
```typescript
    it('routes the Termii fetch call through resilience.execute with the termiiAuth vendor key', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await service.sendOtp({ phone: '+2348012345678' });

      expect(mockResilience.execute).toHaveBeenCalledWith('termiiAuth', expect.any(Function));
    });
```
New tests should follow this exact shape for `metaWhatsapp`/`sendgrid` vendor keys, plus:
- A channel-selection persistence test (OTP-01)
- A fallback-on-throw test asserting `sendTermii` (via `termiiAuth` vendor key) is invoked when `mockResilience.execute` rejects for `metaWhatsapp`/`sendgrid` (OTP-02, mirrors existing line 203-210's `resilience.execute` rejection test)
- A lockout-not-bypassed-by-channel-switch test (OTP-03) — critical per RESEARCH.md Validation Architecture

---

### `backend/src/resilience/__tests__/resilience.service.spec.ts` (modify)

**Analog:** itself — line 40-45 assertion

Existing assertion iterates `Object.keys(RESILIENCE_DEFAULTS)` and currently expects 7 entries; after adding `metaWhatsapp`/`sendgrid` to `RESILIENCE_DEFAULTS`, this test automatically covers 9 vendors without a hardcoded count — check the exact assertion text at test-time in case a literal `toHaveLength(7)`/`toBe(7)` exists elsewhere in the file requiring an explicit bump to 9.

---

### `mobile/app/auth/phone.tsx` (modify — add channel picker, OTP-01)

**Analog:** itself — full file already read (240 lines)

**Existing structure to extend** — `handleContinue()` (lines 56-71) posts `{ phone: formattedPhone }` to `/auth/otp/send`; add a `channel` field to this body once a picker UI is added:
```typescript
  async function handleContinue() {
    // ...
    await api.post('/auth/otp/send', { phone: formattedPhone, channel });
    router.push({ pathname: '/auth/otp', params: { phone: formattedPhone } } as any);
    // ...
  }
```

**Design tokens already imported** (line 18-27, reuse for the new picker's styling — Forest Green/Gold language per CONTEXT.md Claude's Discretion):
```typescript
import {
  SURFACE_DEEP,
  SURFACE_MID,
  GOLD,
  GOLD_LINE,
  CREAM,
  INK_MID,
  FONT_DISPLAY,
  FONT_MONO,
} from '../../lib/tokens';
```
Existing `inputWrapper`/`inputWrapperActive` style pair (lines 185-199) and `cta`/`ctaDisabled` pair (lines 222-230) are the direct visual-state pattern to replicate for 3 selectable channel pills (SMS/WhatsApp/Email) — active/inactive border-color toggling via `GOLD_LINE` vs `rgba(212,168,67,0.25)`, matching `inputWrapperActive`'s existing shape.

---

### `mobile/app/otp-channel-settings.tsx` (new — settings-screen control, D-07)

**Analog:** `mobile/app/kyc.tsx` (flat standalone-screen structure, `TierCard`-style selectable state cards) + `mobile/app/(tabs)/profile.tsx` (`MenuRow`/entry-point pattern, lines 262-333 and 397-429)

**Entry-point pattern to copy** (`profile.tsx` `MenuRow` component + `menuRows` array, lines 272-294 and 397-429) — add a new row (e.g. "OTP Channel", sub: "How you receive verification codes") navigating to the new screen, following the existing `Security & ID` row's `onPress: () => router.push('/kyc' as any)` shape:
```typescript
function MenuRow({ icon: Icon, label, sub, onPress, isLast }: MenuRowItem) {
  return (
    <Pressable
      style={({ pressed }) => [menuStyles.row, !isLast && menuStyles.rowBorder, pressed && { opacity: 0.75 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={menuStyles.iconBox}><Icon size={18} color={GOLD} /></View>
      <View style={menuStyles.textBlock}>
        <Text style={menuStyles.label}>{label}</Text>
        <Text style={menuStyles.sub}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={INK_FAINT} />
    </Pressable>
  );
}
```

**Standalone-screen shape to copy** (`kyc.tsx` lines 1-33 — imports + `SafeAreaView`/`ScrollView`/`KeyboardAvoidingView` wrapper, `useQuery`/`useQueryClient` for fetching current state, flat constant colors `FOREST`/`GOLD`/`JUNGLE`):
```typescript
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const JUNGLE = '#1C2B2B';
```
New screen should: fetch current `user.otpChannel` via `useQuery(['me'], () => fetcher('/users/me'))` (matches `profile.tsx` line 345-348's existing query), render 3 selectable channel cards (mirrors `kyc.tsx`'s `TierCard` selectable-state visual pattern), and `PATCH /users/me/otp-channel` on selection via `api.patch(...)` (matches `phone.tsx`'s `api.post` call convention — `api` client instance, not raw `fetch`).

---

## Shared Patterns

### Resilience wrapping (D-09, RESIL-01)
**Source:** `backend/src/resilience/resilience.service.ts` (`execute()` method, lines 76-82) + `resilience.types.ts`
**Apply to:** `sendMetaWhatsapp()` and `sendOtpEmail()` call sites in `auth.service.ts`
```typescript
/** Callers: `await this.resilience.execute('paystack', () => axios.post(...))` */
execute<T>(vendor: Vendor, fn: (context: { signal: AbortSignal }) => PromiseLike<T>): Promise<T> {
  const policy = this.policies.get(vendor);
  if (!policy) return Promise.reject(new Error(`No resilience policy registered for vendor: ${vendor}`));
  return policy.execute(fn);
}
```
Callers pass a `Vendor` string key (`'metaWhatsapp'` | `'sendgrid'` — new entries in `resilience.types.ts`) and a function receiving `{ signal }` to forward into `fetch()`'s `AbortSignal`.

### Throw-don't-swallow for OTP-critical vendor calls (Pitfall 1)
**Source:** existing `sendTermii()` shape (`auth.service.ts:290-338`) contrasted with `SendgridService.sendEmail()`'s swallowing shape (`sendgrid.service.ts:18-24`)
**Apply to:** `sendMetaWhatsapp()`, `sendOtpEmail()` — both MUST reject/throw on failure (never internally catch-and-log-and-resolve) so the dispatch-level catch in `sendOtp()` can trigger SMS fallback. Only the outer dispatch function (`sendOtp()`) is allowed to swallow.

### Fallback-on-throw dispatch shape (D-08, OTP-02)
**Source:** `sendTermii()`→`sendTwilio()` fallthrough (`auth.service.ts:290-338`)
**Apply to:** New `sendOtp()` dispatch — try the resolved channel inside a try/catch, log via `this.logger.error()`, fall through unconditionally to `sendTermii(phone, otp)` reusing the SAME `otp` value (never regenerate). Set `fallbackUsed: true` in the response when the catch branch fires (D-10).

### Optional-enum DTO field convention
**Source:** `RegisterDto.role?: UserRole` (`register.dto.ts:21-23`)
**Apply to:** All `channel?: OtpChannel` additions across `OtpSendDto`, `PhoneAuthDto`, `RegisterDto` — `@IsEnum(EnumType, { message: ... })` + `@IsOptional()` pair, defaulting server-side when absent.

### Per-identity (not per-channel) rate-limit keying — MUST NOT change (OTP-03)
**Source:** `otp_lock:${dto.phone}` / `otp:${dto.phone}` keys (`auth.service.ts:133-134, 140, 147-148, 153, 182-183, 186`)
**Apply to:** All new channel dispatch code — the Redis key namespace stays phone-scoped; only the VALUE stored under `otp:<phone>` gains a `:${channel}` suffix (per Pitfall 3), never a new key like `otp_lock:<phone>:<channel>` (explicitly listed as an anti-pattern in RESEARCH.md's Don't Hand-Roll table).

### Vendor secret handling / no-log-of-tokens convention
**Source:** `resilience.service.ts` `summarizeVendorError()` (lines 190-196) and its usage in `onBreak()` (lines 113-143)
**Apply to:** Any logging inside `sendMetaWhatsapp()`/`sendOtpEmail()` — log `response.status` + truncated body text only, never `Authorization` headers or the raw `META_WHATSAPP_ACCESS_TOKEN`/`SENDGRID_API_KEY` values (matches this file's existing T-11-03 discipline).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/common/services/__tests__/sendgrid.service.spec.ts` (new) | test | request-response | No existing `sendgrid.service.spec.ts` in the repo — closest sibling is `s3.service.spec.ts` (external-vendor service spec structure) in the same `__tests__/` directory; use it for `describe`/mock-`ConfigService` scaffolding, but the actual test cases (assert `sgMail.send()` rejection propagates) are net-new per RESEARCH.md's Wave 0 Gaps. |

## Metadata

**Analog search scope:** `backend/src/modules/auth/`, `backend/src/modules/users/`, `backend/src/common/services/`, `backend/src/common/enums/`, `backend/src/resilience/`, `backend/prisma/schema.prisma`, `mobile/app/auth/`, `mobile/app/(tabs)/`, `mobile/app/kyc.tsx`, `.env.example`
**Files scanned:** 24 (read directly this session) + directory listings for `dto/`, `enums/`, `__tests__/`, mobile route directories
**Pattern extraction date:** 2026-07-18
