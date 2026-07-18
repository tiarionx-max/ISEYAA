# Phase 15: Multi-Channel OTP - Research

**Researched:** 2026-07-18
**Domain:** WhatsApp Business Cloud API (Meta Graph API) integration, transactional email OTP (SendGrid), cockatiel resilience wrapping, per-identity rate-limiting
**Confidence:** MEDIUM (HIGH for reused internal patterns; MEDIUM for Meta Graph API request/error shapes — verified against official docs but not tested live against a real WABA)

## Summary

This phase adds two brand-new outbound channels (direct Meta WhatsApp Business Cloud API, SendGrid email-as-OTP) to an existing phone-only OTP system, while explicitly NOT touching the Redis-backed rate-limit/lockout keys (already correctly phone-scoped, not channel-scoped — OTP-03 is largely already satisfied structurally). The main engineering risk is not "can we call the Graph API" (that part is a straightforward `fetch()` call matching the codebase's existing `sendTermii`/`sendTwilio` raw-fetch convention) — it is **wiring the failure signal correctly** so OTP-02's bounded-timeout SMS fallback actually fires. Two existing code shapes in this codebase currently swallow errors (`SendgridService.sendEmail()` catches and logs internally, never rejects) which would silently break fallback detection if reused naively for OTP email.

A second finding, more important for planning: **this codebase has two structurally different registration flows.** The web app's `POST /auth/register` (`RegisterDto`, email+password) never sends an OTP at all — it creates the account and signs the user in immediately via NextAuth. The mobile app's actual OTP-verified registration flow is `phone.tsx` → `POST /auth/otp/send` (`OtpSendDto`, phone only) → `otp.tsx` → `POST /auth/phone-auth` (`PhoneAuthDto`, phone+otp — auto-creates the user on first successful verify). CONTEXT.md's D-05 says "new field on RegisterDto," but the literal channel-selection-relevant call sites are `OtpSendDto`/`PhoneAuthDto`, not `RegisterDto`. The planner must resolve this by threading the channel choice through the phone-OTP flow (where the user row doesn't exist yet at send-time) in addition to `RegisterDto` (where SendGrid/Meta calls today have no live registration flow using them).

**Primary recommendation:** Add `otpChannel OtpChannel @default(SMS)` to the `User` model; add `channel?: OtpChannel` (optional, `@IsEnum`) to `OtpSendDto`/`PhoneAuthDto`/`RegisterDto`; persist the client's channel choice in the `otp:<phone>` Redis value itself (extend `${otp}:${attempts}` to `${otp}:${attempts}:${channel}`) so it survives from `otp/send` through to `phoneAuth`'s user-creation branch without a second round-trip; add two new `Vendor` keys (`metaWhatsapp`, `sendgrid`) to `resilience.types.ts`; write `sendMetaWhatsapp()` and `sendOtpEmail()` as new **throwing** (non-swallowing) methods so `resilience.execute()`'s rejection correctly triggers the existing catch-and-fallback-to-Termii pattern already proven in `sendTermii()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Channel selection UI (registration picker) | Mobile/Web Client | — | Pure UI state, submitted once at registration |
| Channel preference persistence | API / Backend (`User.otpChannel`) | Database | Single source of truth read by every future OTP send, not re-asked |
| OTP generation + code/expiry storage | API / Backend | Database / Redis | Unchanged — `randomInt`, `otp:<phone>` Redis key, `OTP_TTL=300` |
| WhatsApp template send (Meta Graph API) | API / Backend | External (Meta) | Server-side only — access token must never reach a client bundle |
| Email OTP send (SendGrid) | API / Backend | External (SendGrid) | Server-side only — reuses existing `SendgridService` client |
| SMS fallback send (Termii) | API / Backend | External (Termii) | Unchanged — `sendTermii()` is the fallback target for ALL channels now, not just Termii's own retry path |
| Bounded-timeout + circuit breaker | API / Backend (`ResilienceService`) | — | cockatiel wrap already proven in `auth.service.ts:302`; extend, don't rebuild |
| Rate-limit / lockout enforcement | API / Backend (Redis) | — | Already phone-keyed (`otp_lock:<phone>`), not channel-keyed — must stay that way (OTP-03) |
| Settings-screen channel change | Mobile/Web Client (UI) | API / Backend (`PATCH /users/me`) | Mirrors existing `UsersService.update()` plain-field-update pattern |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** WhatsApp moves to a **direct Meta Business Cloud API (Graph API) integration**, not Termii's `channel: 'whatsapp'` passthrough. This supersedes `.planning/PROJECT.md`'s "Termii WhatsApp Token API reuse preferred" note and STATE.md's flagged blocker. `TERMII_WHATSAPP_SENDER_ID` and the `sendTermii()` whatsapp-channel branch (`auth.service.ts:293-325`) are removed/replaced.
- **D-02:** SMS stays on Termii exactly as today (`sendTermii`, generic/dnd channel). Email is net-new on SendGrid, reusing `sendgrid.service.ts`'s existing client/auth but adding a new OTP-code email.
- **D-03:** Claude drafts the Meta-approved Authentication-category template text (code + expiry only, no marketing) as a deliverable. Actually submitting it to Meta for approval is the stakeholder's action outside the codebase — not blocking code completion.
- **D-04:** WhatsApp is **always shown** as a channel option in the registration picker, regardless of whether Meta approval/activation has completed. If the Meta API call fails (unapproved template, invalid credentials, account not live), OTP-02's bounded-timeout SMS fallback covers it. No feature flag hiding the option.
- **D-05:** Channel picker appears **once, at registration** — new field, defaulting to SMS if unselected. Not re-shown on every OTP send (login/resend/password-reset reuse whatever channel is on file).
- **D-06:** The explicit user choice **replaces** today's silent `sendTermii()` auto-preference logic entirely (the "prefer WhatsApp when `TERMII_WHATSAPP_SENDER_ID` is set" branch goes away). No hidden channel-selection behavior remains.
- **D-07:** A **settings-screen control** lets a user change their OTP channel preference after registration. Net-new UI/endpoint work this phase, not deferred.
- **D-08:** "Bounded timeout" means the **channel's send-API call itself** fails or times out (~5-10s, matching today's Termii→Twilio fail-fast pattern) — not a true WhatsApp delivery-receipt webhook. No new incoming Meta message-status webhook endpoint this phase. Same code and expiry are reused across the fallback attempt (no new OTP generated).
- **D-09:** WhatsApp/Email send calls are wrapped in the **existing `ResilienceModule`/cockatiel `resilience.execute()` pattern** (RESIL-01) — the same infrastructure `auth.service.ts` already uses for Termii/Twilio.
- **D-10:** When a fallback to SMS occurs, the registration/verification screen **shows it to the user** (e.g. "We sent your code via SMS instead") rather than resolving silently.

### Claude's Discretion

- Exact Meta Graph API integration details (request/response shapes, token refresh strategy, new env var names) — grounded in Meta's current WhatsApp Business Cloud API docs (see below).
- Exact wording/copy of the fallback-notice UI message (D-10) and the settings-screen channel-change control's placement — should follow existing Forest Green/Gold design language.
- Whether the new channel preference is stored as a plain enum column on `User` or a small related table — **recommendation: plain enum column** (see Standard Stack below); no existing precedent needs a related table for a single-value preference.

### Deferred Ideas (OUT OF SCOPE)

- True async WhatsApp delivery-receipt confirmation (a Meta message-status webhook) — fallback triggers on send-API failure only.
- Re-selecting OTP channel per-attempt on login/resend/password-reset screens.
- Getting the WhatsApp template actually approved by Meta — Claude delivers the compliant template text only.
- Any change to Termii SMS or SendGrid email's existing send mechanics beyond adding OTP as a new email use case.
- Simultaneous multi-channel OTP send (all 3 channels at once) — sequential fallback only (`.planning/REQUIREMENTS.md` Out of Scope table).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OTP-01 | User can select WhatsApp, Email, or SMS as OTP channel at registration, defaulting to SMS if unselected | See "Two Registration Flows" pitfall below + Code Examples for `OtpChannel` enum/DTO threading |
| OTP-02 | OTP delivery automatically falls back to SMS if selected channel fails within bounded timeout, reusing same code/expiry | See `sendTermii()`'s proven try/catch-then-fallback shape (Pattern 1) + ResilienceService `execute()` rejection semantics |
| OTP-03 | Rate-limiting/lockout scoped per-identity (phone/user), not per-channel | Confirmed already true structurally — `otp:<phone>`/`otp_lock:<phone>` keys have no channel component; see Runtime State Inventory-style confirmation below |
| OTP-04 | WhatsApp OTP uses Meta-approved Authentication-category template (code+expiry only, no marketing) | See Meta Graph API research — template structure, fixed preset text, button types, character limits |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sendgrid/mail` | 8.1.6 (installed, verified via `npm view`) | Email OTP send | Already the project's email vendor; reuse client/auth, add new template method |
| `cockatiel` | (installed — see `resilience.service.ts`) | Circuit breaker + retry + timeout for WhatsApp/Email vendor calls | Project-standard resilience library (RESIL-01); do not add a second resilience lib |
| Native `fetch()` (Node 20 built-in) | Node 20 LTS | WhatsApp Graph API HTTP calls | Matches `sendTermii()`/`sendTwilio()`'s existing raw-fetch convention — **no new HTTP client dependency needed** |
| `class-validator` | 0.15.1 (installed, verified via `npm view`) | `@IsEnum(OtpChannel)` on new DTO fields | Already the project's DTO validation library |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma enum (`OtpChannel`) | project's pinned `@prisma/client` 5.11.x | Type-safe `User.otpChannel` column | Standard Prisma pattern already used for `UserStatus`/`KYCStatus` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch()` for Meta Graph API | An unofficial community Node WhatsApp SDK (e.g. `whatsapp-api-js`, `@gokapso/whatsapp-cloud-api-js`) | Meta publishes **no official Node.js SDK**. A community SDK adds a dependency + version-drift risk for what is a single `POST /messages` call; the codebase's existing `sendTermii`/`sendTwilio` precedent is raw `fetch()`, and consistency with that pattern is the stronger signal here. **Recommendation: raw fetch, no new package.** |
| Persisting channel choice in Redis alongside the OTP (`${otp}:${attempts}:${channel}`) | A second Redis key `otp_channel:<phone>` | Either works; single composite value avoids an extra Redis round-trip and an extra TTL to keep in sync. Planner's call — documented both for completeness. |

**Installation:**
No new npm packages required — all libraries needed are already installed (`@sendgrid/mail`, `cockatiel`, `class-validator`, native `fetch`).

**Version verification:**
```
$ npm view @sendgrid/mail version   → 8.1.6 (matches CLAUDE.md's pinned range)
$ npm view class-validator version  → 0.15.1 (project uses ^0.14.x per package.json; 0.15.1 is current registry latest, no action needed — do not bump mid-phase)
```
[VERIFIED: npm registry, 2026-07-18]

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │  Registration UI (mobile/web) │
                         │  Channel picker: SMS/WA/Email │
                         └───────────────┬───────────────┘
                                         │ POST /auth/otp/send
                                         │ { phone, channel? }
                                         ▼
                         ┌─────────────────────────────┐
                         │        AuthService           │
                         │  1. check otp_lock:<phone>   │
                         │  2. generate otp (randomInt) │
                         │  3. store otp:<phone> Redis  │
                         │     value = otp:attempts:channel
                         │  4. resolve effective channel:│
                         │     user.otpChannel (if exists)
                         │     ?? dto.channel ?? SMS     │
                         └───────────────┬───────────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                   ┌────────────┐ ┌────────────┐ ┌────────────┐
                   │sendMetaWA()│ │sendOtpEmail│ │ sendTermii │
                   │(new)       │ │()  (new)   │ │ (existing) │
                   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
                         │ resilience   │ resilience   │ resilience
                         │ .execute(    │ .execute(    │ .execute(
                         │ 'metaWhatsapp│  'sendgrid'  │ 'termiiAuth'
                         ▼              ▼              ▼
                  ┌─────────────────────────────────────────┐
                  │   cockatiel: retry+breaker+timeout       │
                  │   (per-vendor policy from                │
                  │    RESILIENCE_DEFAULTS + PlatformConfig) │
                  └───────────────┬───────────────────────────┘
                                  │ throws/rejects on failure
                                  ▼
                  ┌─────────────────────────────────────────┐
                  │  catch block in AuthService:              │
                  │  log + fall back to sendTermii(phone, otp)│
                  │  (SAME otp, no regeneration — D-08)       │
                  │  → response includes fallbackUsed: true   │
                  └───────────────┬───────────────────────────┘
                                  │
                                  ▼
                  ┌─────────────────────────────────────────┐
                  │ Client shows "We sent your code via SMS   │
                  │ instead" banner (D-10) if fallbackUsed    │
                  └─────────────────────────────────────────┘
```

### Recommended Project Structure

No new modules needed — extend existing files:
```
backend/src/
├── modules/auth/
│   ├── auth.service.ts          # add sendMetaWhatsApp(), sendOtpEmail(), channel-resolution logic
│   ├── dto/
│   │   ├── otp-send.dto.ts      # add optional `channel?: OtpChannel`
│   │   ├── phone-auth.dto.ts    # add optional `channel?: OtpChannel` (threads to user creation)
│   │   └── register.dto.ts      # add optional `channel?: OtpChannel` (for parity / future email+password OTP use)
├── modules/users/
│   ├── users.controller.ts      # extend PATCH /users/me or add PATCH /users/me/otp-channel
│   └── users.service.ts         # extend update() field allowlist with otpChannel
├── resilience/
│   └── resilience.types.ts      # add 'metaWhatsapp' and 'sendgrid' to Vendor union + RESILIENCE_DEFAULTS
├── common/services/
│   └── sendgrid.service.ts      # add sendOtpEmail() — MUST throw on failure, not swallow (see Pitfall 1)
└── common/enums/
    └── otp-channel.enum.ts      # new: OtpChannel = SMS | WHATSAPP | EMAIL (mirrors user-role.enum.ts style)

backend/prisma/schema.prisma      # add `otpChannel OtpChannel @default(SMS)` to User; add `enum OtpChannel`
```

### Pattern 1: Fallback-on-throw (extend the proven `sendTermii` shape)

**What:** `sendTermii()` already demonstrates the exact fallback shape this phase needs — try the primary channel inside `resilience.execute()`, catch on failure, fall through to the next channel using the SAME data (`otp`), never regenerating it.
**When to use:** Every new channel's send method.
**Example (existing code, the direct template):**
```typescript
// Source: backend/src/modules/auth/auth.service.ts:290-338 (existing, read in this session)
try {
  const response = await this.resilience.execute('termiiAuth', ({ signal }) =>
    fetch('https://v3.api.termii.com/api/sms/send', { method: 'POST', /* ... */, signal }),
  );
  if (response.ok) { this.logger.log(`OTP sent via Termii`); return; }
  this.logger.error(`Termii error — falling back to Twilio`);
} catch (err) {
  this.logger.error('Termii request failed — falling back to Twilio', err);
}
// falls through to Twilio fallback unconditionally
```
**New code should mirror this exact shape** for WhatsApp/Email → SMS, wrapping the whole `sendOtp()` channel dispatch in a similar try/catch that falls through to `sendTermii(phone, otp)` on any failure.

### Pattern 2: Meta Graph API template message send

**What:** `POST https://graph.facebook.com/v23.0/{phone-number-id}/messages` with a Bearer system-user access token.
**When to use:** `sendMetaWhatsApp(phone, otp)`.
**Example:**
```typescript
// Source: Context7 /websites/developers_facebook_business-messaging_whatsapp_v4
//         + developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
//         + developers.facebook.com/documentation/.../copy-code-button-authentication-templates
// [CITED: developers.facebook.com]
const response = await this.resilience.execute('metaWhatsapp', ({ signal }) =>
  fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone.replace('+', ''),           // Graph API expects digits only, no leading '+'
      type: 'template',
      template: {
        name: templateName,                  // META_WHATSAPP_TEMPLATE_NAME
        language: { code: templateLangCode }, // e.g. 'en' or 'en_US' — must match approved template's language
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: otp }],
          },
          {
            // Copy-code button: sub_type is "url" even for copy_code templates —
            // Meta's send-time schema unifies copy_code and URL buttons under "url"
            // (template CREATION uses otp_type: "copy_code"; message SENDING uses sub_type: "url").
            // [CITED: developers.facebook.com copy-code-button-authentication-templates + cross-verified WebSearch]
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otp }],
          },
        ],
      },
    }),
    signal,
  }),
);
if (!response.ok) {
  const body = await response.text();
  this.logger.error(`Meta WhatsApp error: ${response.status} ${body}`);
  throw new Error(`Meta WhatsApp send failed: ${response.status}`); // MUST throw — see Pitfall 1
}
```

### Pattern 3: SendGrid OTP email (extend existing inline-HTML template convention)

**What:** New `sendOtpEmail()` method on `SendgridService`, following the exact inline-HTML `<div style="font-family:sans-serif;max-width:600px...">` shape used by `sendTicketConfirmation`/`sendBookingConfirmation`.
**When to use:** `sendOtp()` dispatch when `channel === 'EMAIL'`.
**Example:**
```typescript
// Pattern source: backend/src/common/services/sendgrid.service.ts:26-62 (existing, read in this session)
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
  // Do NOT call this.sendEmail() here — it swallows errors internally (see Pitfall 1).
  // Call sgMail.send() directly so a failure propagates and resilience.execute() can catch it.
  await sgMail.send({ to, from: this.from, subject: 'Your Iṣẹ́yáá verification code', html });
}
```

### Anti-Patterns to Avoid

- **Reusing `SendgridService.sendEmail()` unmodified for OTP:** It catches and logs internally, always resolving — a `resilience.execute()` wrap around it would never see a rejection, so OTP-02's fallback would never trigger on email failure. See Pitfall 1.
- **Re-showing the channel picker on every OTP send:** Explicitly out of scope (D-05 deferred alternative, and `.planning/REQUIREMENTS.md` Out of Scope table: "Per-login OTP channel re-selection").
- **Building a new Meta message-status webhook for "true" delivery confirmation:** Explicitly deferred (D-08). Bounded timeout = send-API response only.
- **Hardcoding the platform fee / resilience thresholds:** N/A for this phase (no platform-fee-adjacent logic), but per CLAUDE.md convention, any new `PlatformConfig`-backed resilience thresholds for `metaWhatsapp`/`sendgrid` vendors must go through `ResilienceService.readConfig()`'s existing `platform_configs` lookup pattern, never hardcoded.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circuit breaker / retry / timeout for WhatsApp & Email vendor calls | A bespoke try/catch-with-manual-timeout wrapper | `ResilienceService.execute('metaWhatsapp' \| 'sendgrid', fn)` | RESIL-01's whole purpose was eliminating exactly this kind of one-off vendor resilience code; D-09 explicitly requires reuse |
| WhatsApp message-sending client | A community npm SDK (`whatsapp-api-js`, etc.) | Raw `fetch()` matching `sendTermii`/`sendTwilio` | No official Meta Node SDK exists; codebase convention is raw fetch; adding a new HTTP client dependency for one endpoint is unjustified |
| Per-channel rate-limit counters | New `otp_lock:<phone>:<channel>` Redis keys | Existing `otp_lock:<phone>` (unchanged) | OTP-03 explicitly requires per-identity (not per-channel) scoping — a channel-scoped key would let a user bypass lockout by switching channels, which is the exact bug OTP-03 exists to prevent |

**Key insight:** The riskiest part of this phase is not writing new vendor-call code — it's making sure failures propagate correctly through 3 layers (vendor call → resilience wrap → auth service catch block) so the existing, proven fallback pattern actually fires. Two of three new send methods (email, WhatsApp) are net-new and must be written to throw, not swallow.

## Common Pitfalls

### Pitfall 1: `SendgridService.sendEmail()` silently swallows failures — breaks OTP-02 fallback if reused as-is

**What goes wrong:** `sendEmail()` (`sendgrid.service.ts:18-24`) wraps `sgMail.send()` in a try/catch that only logs on error and always resolves (`Promise<void>`, never rejects). If `sendOtpEmail()` is implemented by calling this method, `resilience.execute('sendgrid', () => this.sendEmail(...))` will never observe a failure — the promise always resolves — so the SMS fallback (D-08/OTP-02) silently never fires on email delivery failure.
**Why it happens:** `sendEmail()` was designed for post-purchase confirmation emails, where a delivery failure shouldn't block the checkout flow (fire-and-forget is correct there). OTP delivery has the opposite requirement — the caller MUST know if delivery failed.
**How to avoid:** Write `sendOtpEmail()` to call `sgMail.send()` directly (bypassing `sendEmail()`), letting SendGrid SDK's native rejection propagate to `resilience.execute()`.
**Warning signs:** A test that mocks `sgMail.send()` to reject and asserts the SMS fallback fires — if that test can't be written because the OTP email method always resolves, this pitfall is present.

### Pitfall 2: `RegisterDto`'s registration path never sends an OTP at all today

**What goes wrong:** Assuming "at registration" (OTP-01) means wiring the channel picker into `AuthService.register()` (email+password flow). That method creates the user and returns JWT tokens immediately — it has zero OTP interaction in the current codebase. The channel choice would be persisted but never actually exercised by that flow.
**Why it happens:** The codebase has two independent registration paths (see Summary) and CONTEXT.md's D-05 references "RegisterDto" without distinguishing them.
**How to avoid:** Confirm with the actual literal channel-relevant call sites: `OtpSendDto` (`POST /auth/otp/send`) and `PhoneAuthDto` (`POST /auth/phone-auth`) — these are what the mobile app's real registration screens (`phone.tsx`/`otp.tsx`) call. Thread the channel field through `OtpSendDto`/`PhoneAuthDto` as the primary integration point; add it to `RegisterDto` too for schema consistency/future-proofing, but do not assume `RegisterDto`'s flow is where OTP-01's success criteria are actually exercised.
**Warning signs:** A plan that only touches `RegisterDto` and `AuthService.register()` without touching `sendOtp()`/`phoneAuth()` would not satisfy OTP-01's literal success criterion ("At registration, a user can select WhatsApp, Email, or SMS... SMS is used automatically if no channel is selected") for the mobile app's actual live flow.

### Pitfall 3: User row doesn't exist yet when `otp/send` is first called (phone-only flow)

**What goes wrong:** For the phone-only registration flow, `POST /auth/otp/send` is called BEFORE any `User` row exists (the user is only created inside `phoneAuth()` on first successful verify). A channel preference can't be read from `User.otpChannel` at send-time because there's no row yet — and it can't be written to `User.otpChannel` at send-time either, for the same reason.
**Why it happens:** `sendOtp()`/`phoneAuth()` are two separate HTTP calls; the intermediate state (chosen channel) must survive between them without a DB row to hold it.
**How to avoid:** Persist the chosen channel in the same Redis value that already carries the OTP+attempts (`otp:<phone>` = `${otp}:${attempts}:${channel}`), so `phoneAuth()` can read it back at user-creation time and persist it onto the new `User.otpChannel` in the same `create()` call. For *returning* users (row already exists), `sendOtp()` should prefer `user.otpChannel` over any `dto.channel` sent by the client, since D-05 says channel is set once and not re-picked.
**Warning signs:** A plan where `phoneAuth()` creates a user with `otpChannel` always defaulting to `SMS` regardless of what was chosen on the phone-entry screen.

### Pitfall 4: Enumerating exact Meta Graph API error codes is unnecessary — and the codebase already avoids this for Termii

**What goes wrong:** Spending planning/implementation effort building specific handling for every Graph API error code (401/190 expired token, 132001 template not approved, 130429 rate limit, invalid recipient, etc.).
**Why it happens:** Meta's error code surface is large and mostly undocumented in exact numeric detail in the officially fetchable docs (some pages 404/500'd during this research — see Sources).
**How to avoid:** D-08's bounded-timeout fallback is intentionally coarse-grained: "the channel's send-API call itself fails or times out" — not "detect this specific failure mode and react differently." Match `sendTermii()`'s exact granularity: `if (!response.ok) { log; fall through }` plus a catch-all `catch` for network/timeout errors. No per-error-code branching needed. This also sidesteps the LOW-confidence exact-error-code research below.
**Warning signs:** A plan task that says "map each Meta error code to a specific user-facing message" — over-engineered relative to D-08's literal requirement and the existing codebase's error-handling granularity.

### Pitfall 5: Confusing WhatsApp template *creation* request shape with template *sending* request shape

**What goes wrong:** The button `sub_type` differs between creating a template (`otp_type: "copy_code"`) and sending a message using that template (`sub_type: "url"`, even for a copy-code button). Using `sub_type: "copy_code"` when *sending* a message will likely fail schema validation.
**Why it happens:** Meta's Graph API unifies button delivery under a URL-button-shaped payload at send-time regardless of how the button behaves in the WhatsApp client.
**How to avoid:** Use `sub_type: "url"` in the send-time `components` array (see Pattern 2) even though the approved template itself was created as a copy-code (`otp_type: "copy_code"`) authentication template.
**Warning signs:** Graph API returns a component/parameter mismatch error on send despite the template showing APPROVED status in Meta Business Manager.

## Code Examples

### `OtpChannel` enum (new, mirrors `user-role.enum.ts` style)
```typescript
// backend/src/common/enums/otp-channel.enum.ts (new file)
export enum OtpChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}
```

### Prisma schema additions
```prisma
// backend/prisma/schema.prisma — add to existing enum block (see UserStatus/KYCStatus precedent)
enum OtpChannel {
  SMS
  WHATSAPP
  EMAIL
}

// add to model User (existing model, backend/prisma/schema.prisma:225-272)
model User {
  // ...existing fields...
  otpChannel OtpChannel @default(SMS)
  // ...
}
```

### DTO field addition (matches `RegisterDto`'s existing `@IsEnum` + `@IsOptional` pattern for `role`)
```typescript
// backend/src/modules/auth/dto/otp-send.dto.ts
import { IsMobilePhone, IsEnum, IsOptional } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class OtpSendDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel; // only meaningful when no User row exists yet for this phone
}
```

### Resilience vendor registration (extend, don't rebuild)
```typescript
// backend/src/resilience/resilience.types.ts — extend existing Vendor union + defaults
export type Vendor =
  | 'paystack'
  | 'paystackRefund'
  | 'termiiAuth'
  | 'termiiDelivery'
  | 'anthropic'
  | 's3'
  | 'fcm'
  | 'metaWhatsapp'  // new
  | 'sendgrid';     // new

export const RESILIENCE_DEFAULTS: Record<Vendor, VendorThresholds> = {
  // ...existing 7 entries unchanged...
  metaWhatsapp: { timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
  sendgrid: { timeoutMs: 8_000, retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
};
```
Note: `resilience.service.spec.ts` currently asserts "builds all 7 vendor policies from RESILIENCE_DEFAULTS" — that count assertion will need updating to 9 (Wave 0 gap, see Validation Architecture below).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Termii `channel: 'whatsapp'` passthrough (config-gated by `TERMII_WHATSAPP_SENDER_ID`) | Direct Meta Graph API integration | This phase (D-01) | `TERMII_WHATSAPP_SENDER_ID` env var and the corresponding `sendTermii()` branch are removed |
| Silent auto-preference (`whatsappSender ? 'whatsapp' : ...`) | Explicit user-selected, persisted `User.otpChannel` | This phase (D-06) | No more implicit behavior based on which env vars happen to be set |

**Deprecated/outdated:**
- `TERMII_WHATSAPP_SENDER_ID` (`.env.example:29`) — remove per D-01/D-02.
- Comment in `.env.example:29` ("optional — set to your approved WhatsApp sender ID to bypass GSM/DND; Termii always tried first") — no longer accurate once D-01 lands.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Graph API version `v23.0` is current/stable at time of implementation | Pattern 2 (Code Examples) | Meta deprecates old Graph API versions on a rolling ~2-year window; if `v23.0` has since been retired, the fetch URL needs bumping to whatever the then-current stable version is — low risk, easy fix, not a design-breaking issue |
| A2 | `messaging_product`/`type`/`template` JSON shape is unchanged from what Context7 + WebFetch returned in this session | Pattern 2 | Meta could adjust field names in a future API version; MEDIUM confidence since cross-verified against 2 independent official-doc fetches, but neither fetch was tested against a live WABA in this session |
| A3 | Exact numeric Graph API error codes (401/190, 132001, 130429, invalid-recipient) are approximately correct | Pitfall 4 (discussion only — NOT required by the recommended implementation) | LOW confidence, WebSearch-aggregated only, official error-codes doc page 404'd/500'd during this session. Mitigated: Pitfall 4's recommendation explicitly avoids needing exact codes — response.ok + catch-all is sufficient, so this assumption does not block correct implementation |
| A4 | Recommending a plain enum column (`User.otpChannel`) over a related table is the right data-modeling call | Standard Stack / Architectural Responsibility Map | If a future phase needs channel-preference history/audit trail, a column requires a migration to a table later — low risk given `KYCStatus`/`UserStatus` precedent for single-value enum columns on this exact model |
| A5 | Meta system-user permanent access tokens don't require a refresh-cron in this codebase (unlike JWT rotation) | Environment Availability / Sources | If Meta's permanent-token policy changes or the token is generated as a short-lived user token by mistake during ops setup, WhatsApp sends will start failing with 401 — but per D-08/OTP-02, this degrades gracefully to SMS fallback, not a hard outage |

## Open Questions (RESOLVED)

1. **Which Graph API `language.code` value matches the approved template?**
   - What we know: The template body is fixed preset text ("<CODE> is your verification code," optional expiry/disclaimer lines); language code (`en` vs `en_US`) must match exactly what was submitted for approval.
   - What's unclear: Which exact code the stakeholder will use when submitting the template for Meta approval (outside this session's control — D-03 says submission is the stakeholder's action).
   - Recommendation: Make `META_WHATSAPP_TEMPLATE_LANG` a config var (default `en_US`) rather than hardcoding, so it can be corrected post-approval without a code deploy.
   - RESOLVED: 15-01 implements `META_WHATSAPP_TEMPLATE_LANG` as a config var (default `en_US`), per the recommendation above.

2. **Settings-screen endpoint shape: extend `PATCH /users/me` or add a dedicated route?**
   - What we know: `UsersService.update()` already accepts a plain-field object (`firstName`, `lastName`, `avatarUrl`, `lgaId`) and `UsersController.updateMe()` passes an inline body type through untyped.
   - What's unclear: Whether `otpChannel` should join that same untyped inline body or get a dedicated `PATCH /users/me/otp-channel` with its own DTO (cleaner validation, matches `SwitchRoleDto`'s pattern of a small purpose-built DTO for a single-field change).
   - Recommendation: Follow `SwitchRoleDto`'s precedent (`users.controller.ts:30-33`) — add a small `ChangeOtpChannelDto` with `@IsEnum(OtpChannel)` and a dedicated `PATCH /users/me/otp-channel` route, consistent with how role-switching (a similarly single-field, semantically distinct change) was handled rather than folded into the generic profile-update body.
   - RESOLVED: 15-04 adds a dedicated `PATCH /users/me/otp-channel` route with `ChangeOtpChannelDto`, per the recommendation above (rather than folding `otpChannel` into the generic `PATCH /users/me` body).

3. **Exact Meta Graph API error codes for auth failure / unapproved template / invalid phone / rate limit**
   - What we know: General categories (401 for expired/invalid token, ~132001-family for template issues, ~130429 for throughput rate limits) per WebSearch-aggregated sources.
   - What's unclear: Precise numeric codes, since the official Meta error-codes reference pages returned HTTP 404/500 during this research session (link rot or access restriction — see Sources).
   - Recommendation: Per Pitfall 4, this does not block implementation — use `response.ok` + catch-all error handling matching `sendTermii()`'s existing granularity. If precise codes are needed later (e.g., for a stakeholder-facing error dashboard), re-fetch `https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes` at that time.
   - RESOLVED: 15-03 avoids per-code Graph API error handling — `sendMetaWhatsapp()` uses `response.ok` + catch-all error handling and falls back to SMS via `sendTermii()` on any failure, per the recommendation above.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `SENDGRID_API_KEY` | OTP-01 (Email channel) | Env var placeholder present in `.env.example`; real key status unknown (not verified live in this session) | — | `SendgridService` already no-ops (`sgMail.setApiKey` skipped) when key is the placeholder string — matches existing stub-mode convention |
| `META_WHATSAPP_ACCESS_TOKEN` (new) | OTP-01/OTP-04 (WhatsApp channel) | ✗ — does not exist in `.env.example` today | — | D-04: WhatsApp always shown as an option; if unset/invalid, every WhatsApp send fails and OTP-02's SMS fallback covers it — no feature flag needed |
| `META_WHATSAPP_PHONE_NUMBER_ID` (new) | OTP-01/OTP-04 | ✗ — new | — | Same as above |
| `META_WHATSAPP_TEMPLATE_NAME` (new) | OTP-04 | ✗ — new, and the template itself won't be Meta-APPROVED until the stakeholder submits it (D-03) | — | Same fallback |
| `META_WHATSAPP_TEMPLATE_LANG` (new, recommended) | OTP-04 | ✗ — new | — | Default `en_US` in code if unset |
| `TERMII_API_KEY` | OTP-02 (fallback target) | Present in `.env.example`; existing, unchanged | — | Twilio fallback already exists if Termii itself is down (existing `sendTwilio()`) |
| Node 20 native `fetch()` | All 3 new send methods | ✓ (Node 20 LTS ships `fetch` globally) | Node 20 LTS | — |

**Missing dependencies with no fallback:**
- None — every new external dependency (Meta credentials) has a built-in fallback path (SMS) by design (D-04/D-08).

**Missing dependencies with fallback:**
- `META_WHATSAPP_*` env vars — absent today; WhatsApp sends will fail and fall back to SMS until the stakeholder completes Meta setup + template approval (explicitly acceptable per D-04).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/package.json` (`"test": "jest"`, no separate `jest.config.js` found) |
| Quick run command | `npm run test --workspace=backend -- auth.service.spec` |
| Full suite command | `npm run test --workspace=backend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OTP-01 | Registration channel selection persists and defaults to SMS when unselected | unit | `npm run test --workspace=backend -- auth.service.spec -t "channel"` | ❌ Wave 0 (new test cases in existing `auth.service.spec.ts`) |
| OTP-02 | WhatsApp/Email send failure triggers SMS fallback with SAME otp | unit | `npm run test --workspace=backend -- auth.service.spec -t "fallback"` | ❌ Wave 0 |
| OTP-03 | Switching channel mid-lockout does not reset/bypass `otp_lock:<phone>` | unit | `npm run test --workspace=backend -- auth.service.spec -t "lockout"` | ❌ Wave 0 — critical test since OTP-03's literal success criterion demands proof of this |
| OTP-04 | WhatsApp send uses correct Graph API template request shape (name/language/components) | unit | `npm run test --workspace=backend -- auth.service.spec -t "whatsapp"` | ❌ Wave 0 |
| (regression) | `resilience.service.spec.ts`'s "builds all 7 vendor policies" assertion must become 9 | unit | `npm run test --workspace=backend -- resilience.service.spec` | ⚠️ Existing test needs updating, not creating |

### Sampling Rate
- **Per task commit:** `npm run test --workspace=backend -- <affected>.spec`
- **Per wave merge:** `npm run test --workspace=backend`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New test cases in `backend/src/modules/auth/__tests__/auth.service.spec.ts` — cover channel selection, fallback-on-throw, and OTP-03's channel-switch-doesn't-bypass-lockout proof
- [ ] Update `backend/src/resilience/__tests__/resilience.service.spec.ts` — vendor count assertion (7 → 9) after adding `metaWhatsapp`/`sendgrid`
- [ ] New unit tests for `SendgridService.sendOtpEmail()` — assert it rejects (doesn't swallow) on `sgMail.send()` failure, directly testing Pitfall 1's fix
- [ ] Mock strategy for `fetch()` to the Meta Graph API — follow the existing `jest.spyOn(global, 'fetch').mockResolvedValue(...)` pattern already used in `auth.service.spec.ts:59`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | OTP remains the authentication factor; no change to JWT issuance logic |
| V3 Session Management | no | Unaffected — tokens/sessions unchanged by this phase |
| V4 Access Control | yes | New `PATCH /users/me/otp-channel` (or equivalent) must sit behind existing `JwtAuthGuard` + `@CurrentUser()` (mirrors every other `/users/me/*` route) — never accept a `userId` from the request body |
| V5 Input Validation | yes | `class-validator` `@IsEnum(OtpChannel)` on every new DTO field (established project pattern) |
| V6 Cryptography | no direct change | No new cryptographic primitives; `META_WHATSAPP_ACCESS_TOKEN` is a bearer secret — must be stored the same way `TERMII_API_KEY`/`PAYSTACK_SECRET_KEY` are (env var / secrets manager, never logged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Access-token leakage in logs (Meta Graph API bearer token) | Information Disclosure | Follow `resilience.service.ts`'s existing `summarizeVendorError()` convention — NEVER log `err.config.headers.Authorization` or full request bodies; log status/code/message only (same discipline already enforced for Paystack/Termii/S3/FCM per T-11-03 comment in `resilience.service.ts:128-133`) |
| Channel-switch lockout bypass | Tampering / Elevation of Privilege | Already structurally mitigated — `otp_lock:<phone>` has no channel component. Must be preserved, not "improved" into a per-channel key (Don't Hand-Roll table) |
| OTP code leakage via email/WhatsApp template content injection | Information Disclosure | Meta's Authentication-category templates explicitly disallow marketing/free-form content and restrict parameters to 15 characters with no URLs/media — this is enforced by Meta's own template review, not app code, but the app must still never log the raw `otp` value alongside a phone number in a way that ends up in a shared log aggregator (Grafana/Sentry) — match existing `sendTermii()`'s convention of only logging "OTP sent via X" without the code itself |
| NDPA — phone/email PII in new `User.otpChannel` and any WhatsApp/email logs | Information Disclosure | `otpChannel` itself is not PII (just an enum), but the phone number and email used in the Meta/SendGrid API calls are — no new PII fields introduced beyond what's already stored on `User` |

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/auth/auth.service.ts` (this repo, read directly) — existing `sendOtp`/`verifyOtp`/`phoneAuth`/`sendTermii`/`sendTwilio` implementations
- `backend/src/resilience/resilience.service.ts`, `resilience.module.ts`, `resilience.types.ts` (this repo, read directly) — resilience wrapping mechanics, `Vendor` type, `RESILIENCE_DEFAULTS`
- `backend/src/common/services/sendgrid.service.ts` (this repo, read directly) — existing email template pattern, `sendEmail()`'s error-swallowing behavior (Pitfall 1 source)
- `backend/src/modules/users/users.controller.ts`, `users.service.ts` (this repo, read directly) — `SwitchRoleDto`/`update()` patterns for settings-screen endpoint design
- `mobile/app/auth/phone.tsx`, `mobile/app/auth/otp.tsx` (this repo, read directly) — confirms mobile's actual live registration flow calls `POST /auth/otp/send` then `POST /auth/phone-auth`, not `RegisterDto`
- `web/src/app/register/page.tsx` (this repo, read directly) — confirms web's `POST /auth/register` flow has zero OTP interaction today
- `backend/prisma/schema.prisma` (this repo, read directly) — `User` model fields, existing enum style (`UserStatus`, `KYCStatus`)
- npm registry — `npm view @sendgrid/mail version` (8.1.6), `npm view class-validator version` (0.15.1) [VERIFIED 2026-07-18]
- Context7 `/websites/developers_facebook_business-messaging_whatsapp_v4` — official Meta docs snippets on sending template/non-template messages
- `developers.facebook.com/docs/whatsapp/cloud-api/reference/messages` (WebFetch, this session) — request shape for `POST /{phone-number-id}/messages`
- `developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates` (WebFetch, this session) — authentication template fixed text, parameters, button types
- `developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates/` (WebFetch, this session) — exact JSON shape for copy-code template send

### Secondary (MEDIUM confidence)
- WebSearch aggregation (multiple sources: Heltar, ChakraHQ, Twilio changelog) cross-verified against official Meta doc fetches — system-user permanent token vs temporary token lifecycle; copy_code `otp_type` (creation) vs `url` `sub_type` (sending) distinction confirmed independently by 2 sources

### Tertiary (LOW confidence)
- WebSearch-only — exact numeric Graph API error codes (401/190, 132001, 130429, account eligibility thresholds like "1000 business-initiated dialogs/day") — official error-codes reference page returned HTTP 404/500 in this session and could not be directly verified; flagged in Open Questions/Assumptions Log; does not block the recommended implementation approach (Pitfall 4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all reused libraries verified via `npm view` against the running registry
- Architecture: HIGH for internal patterns (read directly from this repo's source), MEDIUM for Meta Graph API request/response shapes (verified via Context7 + official doc WebFetch, but not tested against a live WABA)
- Pitfalls: HIGH — Pitfalls 1-3, 5 are derived directly from reading this repo's actual code (`sendEmail()`'s swallowing behavior, the two-registration-flow split, the Redis-timing gap); Pitfall 4 is a recommendation to reduce reliance on LOW-confidence external data

**Research date:** 2026-07-18
**Valid until:** 30 days for internal codebase patterns (stable); 14 days for Meta Graph API specifics (Meta's API surface and template review requirements have changed multiple times historically — re-verify template/error-code details close to actual implementation if this research goes stale)
