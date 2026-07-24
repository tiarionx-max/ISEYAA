# Quick Task: Migrate SendgridService internals to Resend SDK - Research

**Researched:** 2026-07-24
**Domain:** Transactional email SDK swap (SendGrid -> Resend) inside a NestJS service
**Confidence:** HIGH (all core claims verified directly against the `resend` npm package source/types, not training data)

## Summary

SendGrid permanently declined account activation, so `SendgridService` (`backend/src/common/services/sendgrid.service.ts`) needs its internals swapped to the Resend Node SDK (`resend` on npm, latest `6.18.0`, published 2026-07-21, requires Node >=20 — matches this project's Node 20 LTS constraint exactly `[VERIFIED: npm registry + package.json engines]`). The class name, all five public method signatures, and the `resilience.execute('sendgrid', ...)` vendor key must stay unchanged.

**The single most important finding:** Resend's SDK **never rejects/throws** for API-level failures (invalid key, unverified domain, rate limit, etc.) — `resend.emails.send()` always resolves, returning `{ data, error }`. This is the opposite of `@sendgrid/mail`'s throw-on-failure behavior that `sendOtpEmail` and `sendMinistryDigest` currently depend on for their fallback/failure-tracking logic to fire. The migrated code MUST manually check `if (error) throw new Error(error.message)` after every `resend.emails.send()` call to preserve the existing throw-based contract. This is not a nuance — get it wrong and OTP email failures silently look like successes to `resilience.execute` and to `auth.service.ts`'s SMS-fallback catch block, and the Ministry digest scheduler silently marks `lastStatus: 'SUCCESS'` on total delivery failure.

**Primary recommendation:** Install `resend@^6.18.0`, use `import { Resend } from 'resend'` (named class export — same-shape fix as the just-closed `@sendgrid/mail` default-import pitfall, verified safe below), lazily construct the client only when a real API key is configured (constructor throws synchronously if no key resolves at all), and add an explicit `if (error) throw ...` guard after every `.send()` call.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (quick task, no formal REQ IDs) | Swap SendgridService internals from `@sendgrid/mail` to `resend`, keep class name/method signatures/vendor key unchanged | Full mapping below: client construction, send shapes, error contract, attachment mapping, import safety |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `resend` | `^6.18.0` (verified current on npm 2026-07-24, published 2026-07-21) | Resend's official Node.js SDK | Official first-party SDK, ships its own TypeScript types, zero extra `@types/*` needed |

**Installation:**
```bash
npm install resend --workspace=backend
npm uninstall @sendgrid/mail --workspace=backend
```

**Version verification:** `npm view resend version` → `6.18.0`; `npm view resend engines` → `{ node: '>=20' }` `[VERIFIED: npm registry]`. No peer dependency is required for this use case — `@react-email/render` is listed as an **optional** peer dep, only loaded dynamically if you pass a `react` property to `.send()`. This migration only ever uses `html`, so it is never triggered. `[VERIFIED: resend package.json peerDependenciesMeta]`

## Architecture Patterns

### Pattern 1: Client construction — avoid the same pitfall class as the SendGrid bug just fixed

**What:** `import { Resend } from 'resend'` is a **named export of a class**, not a default/namespace export. This is a materially different (and safe) shape from the bug just fixed in this file (`import * as sgMail from '@sendgrid/mail'` — a namespace import that silently stripped prototype methods under `esModuleInterop`, causing `sgMail.send is not a function`). A named-class import compiles to a plain destructure under NestJS's CommonJS + `esModuleInterop` target and does not go through the same broken interop path. `[VERIFIED: resend dist/index.d.cts + resend.com official docs snippets]`

```typescript
// Source: https://resend.com/docs/api-reference/emails/send-email (Context7 /websites/resend)
import { Resend } from 'resend';

const resend = new Resend('YOUR_API_KEY');
```

**Pitfall — constructor throws synchronously if no key resolves at all:**
```javascript
// from resend's dist/index.cjs (verified source, not paraphrased):
constructor(key, options) {
  this.key = key;
  ...
  if (!key) {
    if (typeof process !== 'undefined' && process.env) this.key = process.env.RESEND_API_KEY;
    if (!this.key) throw new Error('Missing API key. Pass it to the constructor `new Resend("re_123")`');
  }
  ...
}
```
Unlike `@sendgrid/mail` (module-level singleton where `setApiKey()` is a separate, optional call — omitting it just means later `.send()` calls fail at request time), Resend's key is **constructor-time**. Since `SendgridService` is instantiated once by Nest's DI container at bootstrap, calling `new Resend(key)` unconditionally when `key` is empty (dev/test envs, or the current placeholder-detection pattern) will **throw during application bootstrap**, not during a request. `[VERIFIED: resend dist/index.cjs source, line ~1225]`

**Recommended pattern** (mirrors the existing placeholder-guard, but must guard *construction* itself, not just an API-key setter call):
```typescript
constructor(private config: ConfigService) {
  this.from = config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng');
  const key = config.get<string>('RESEND_API_KEY', '');
  if (key && key !== 'PLACEHOLDER_VALUE') {
    this.client = new Resend(key);
  }
  // else: this.client stays undefined — every send method must check for it
}
```

### Pattern 2: Sending a single email (HTML, one recipient)

```typescript
// Source: https://resend.com/docs/api-reference/emails/send-email (Context7 /websites/resend)
const { data, error } = await resend.emails.send({
  from: 'Acme <onboarding@resend.dev>',
  to: 'delivered@resend.dev',       // single string OR string[] both accepted
  subject: 'Hello World',
  html: '<strong>It works!</strong>',
});
if (error) {
  console.error(error);
}
```
`to`, `cc`, `bcc`, `replyTo` all accept `string | string[]` — `to: string[]` (used by `sendMinistryDigest`) needs no transformation, `to` max 50 addresses per send. `[VERIFIED: resend dist/index.d.cts CreateEmailBaseOptions]`

### Pattern 3: Attachments — exact field mapping from SendGrid shape

Current SendGrid-shaped attachment object (from `ministry-export-scheduler.service.ts` and `sendgrid.service.ts`):
```typescript
{ content: string /* base64 */, filename: string, type: string, disposition: string }
```
Resend's `Attachment` interface (verified from `dist/index.d.cts`):
```typescript
interface Attachment {
  content?: string | Buffer;   // base64-encoded string OR raw Buffer — BOTH accepted
  filename?: string | false;
  path?: string;                // alternative to content: a hosted URL
  contentType?: string;         // optional — inferred from filename if omitted
  contentId?: string;           // only set for INLINE attachments (cid: reference in HTML)
}
```
**Mapping table (SendGrid -> Resend):**
| SendGrid field | Resend field | Notes |
|---|---|---|
| `content` (base64 string) | `content` | **No transformation needed** — Resend's REST API also expects base64-encoded string content for `content`. The existing `pdfBuffer.toString('base64')` / `Buffer.from(csv).toString('base64')` calls in `ministry-export-scheduler.service.ts` can be passed through unchanged. `[VERIFIED: resend.com/docs/dashboard/emails/attachments — "Attachments must be provided as base64 encoded strings"]` |
| `filename` | `filename` | direct 1:1 |
| `type` (MIME type) | `contentType` | rename only |
| `disposition: 'attachment'` | *(no field)* | Resend has no explicit `disposition` field. Regular (non-inline) attachment is simply the **absence** of `contentId`. Since the current code never sets an inline attachment, this field can simply be dropped when building the Resend payload — do not pass it through (Resend's TS types don't declare it, so passing it would just be an extra ignored property, but the cleaner migration drops it explicitly at the mapping boundary inside `SendgridService`, keeping the ministry scheduler's caller-side shape unchanged). |

Size limit: Resend caps at **40MB per email after encoding** `[VERIFIED: resend dist/index.d.cts CreateEmailBaseOptions doc comment]`. `ministry-export-scheduler.service.ts`'s existing `SIZE_GUARD_THRESHOLD_BYTES = 8 * 1024 * 1024` (8MB raw, pre-base64) guard is well under this and needs no change.

```typescript
// Source: https://resend.com/docs/dashboard/emails/attachments (Context7 /websites/resend)
await resend.emails.send({
  from: 'Acme <onboarding@resend.dev>',
  to: ['delivered@resend.dev'],
  subject: 'Receipt for your payment',
  html: '<p>Thanks for the payment</p>',
  attachments: [
    { content: base64String, filename: 'invoice.pdf', contentType: 'application/pdf' },
  ],
});
```

### Pattern 4: Error shape — the critical behavioral difference

Verified directly from `resend`'s compiled source (`dist/index.cjs`, `fetchRequest()` method): **every** failure path — non-2xx HTTP response, unparseable error body, or a thrown `fetch()` network error (DNS failure, connection refused, timeout) — is caught internally and converted into a **resolved** promise:
```typescript
type Response<T> =
  | { data: T; error: null; headers: Record<string, string> | null }
  | { data: null; error: ErrorResponse; headers: Record<string, string> | null };

type ErrorResponse = {
  message: string;
  statusCode: number | null;   // null for network-level failures (no HTTP response at all)
  name: RESEND_ERROR_CODE_KEY; // e.g. 'invalid_api_key' | 'validation_error' | 'rate_limit_exceeded' | 'application_error' | ...
};
```
There is **no scenario** under normal use where `resend.emails.send()` rejects/throws (the one exception: passing a `react` component when `@react-email/render` isn't installed — not applicable here since this migration only ever uses `html`). `[VERIFIED: resend dist/index.cjs source, fetchRequest() method — outer try/catch converts thrown fetch errors to `{ data: null, error: {...}, headers: null }`, inner logic converts non-ok HTTP responses to the same shape]`

**Required code pattern to preserve existing throw-based contracts:**
```typescript
// sendOtpEmail / sendMinistryDigest — MUST still throw on failure for resilience.execute's
// circuit breaker / auth.service.ts's SMS-fallback catch / the ministry scheduler's
// lastStatus tracking to work exactly as they do today.
const { error } = await this.client.emails.send({ ... });
if (error) {
  throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
}
```
```typescript
// sendEmail — MUST still swallow-and-log (fire-and-forget), matching current behavior:
try {
  const { error } = await this.client.emails.send({ ... });
  if (error) {
    this.logger.error(`Resend failed for ${to}: ${error.name} - ${error.message}`);
  }
} catch (err) {
  // defensive only — should not normally trigger given resend's internal catch-all,
  // but keeps parity if a future SDK version changes this contract
  this.logger.error(`Resend failed for ${to}: ${err.message}`);
}
```

### Anti-Patterns to Avoid
- **Assuming `await resend.emails.send(...)` rejects on failure like `sgMail.send()` did.** It does not, ever (barring the unused `react`+missing-package edge case). Any method relying on a real rejection to propagate (`sendOtpEmail`, `sendMinistryDigest`) needs an explicit `if (error) throw` guard, or the failure silently looks like success to every caller.
- **Constructing `new Resend(key)` unconditionally at DI-container instantiation time** when `key` may be empty/unset — crashes app bootstrap instead of failing gracefully at send-time. Guard with the same "key present and not placeholder" check the current code already uses for `sgMail.setApiKey()`, but apply it to the **constructor call itself**.
- **Re-introducing a namespace/default import** (`import Resend from 'resend'`) — a stray "APIDOC"-adjacent snippet in Resend's own docs shows `import Resend from 'resend';` (no braces) but the package's actual `dist/index.d.cts`/`.cjs` only exports `Resend` as a **named** class export; `import Resend from 'resend'` would bind `Resend` to `undefined` under this project's CommonJS + `esModuleInterop` config (no `default` export exists). Always use `import { Resend } from 'resend'`. `[VERIFIED: resend dist/index.d.cts export list — no default export, only `export { ..., Resend, ... }`]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Base64 attachment encoding | Custom PDF/CSV -> base64 pipeline | Reuse existing `pdfBuffer.toString('base64')` / `Buffer.from(csv,'utf-8').toString('base64')` in `ministry-export-scheduler.service.ts` unchanged | Resend accepts the exact same base64 string shape SendGrid did — zero new encoding logic needed |

## Common Pitfalls

### Pitfall 1: Resend never rejects — throw-dependent methods silently become "successful failures"
**What goes wrong:** `sendOtpEmail`/`sendMinistryDigest` call `.send()`, get back `{ data: null, error: {...} }`, and — if the migration forgets the `if (error) throw` guard — the `await` resolves normally. `resilience.execute('sendgrid', ...)` sees a resolved promise (success), never opens the circuit breaker, `auth.service.ts`'s `catch (err)` SMS-fallback block never runs, and the Ministry scheduler writes `lastStatus: 'SUCCESS'` even though no email was ever delivered.
**Why it happens:** Resend's SDK philosophy deliberately avoids throwing for API-level errors (Cloudflare Workers / edge-runtime friendliness), unlike SendGrid's throw-on-failure model.
**How to avoid:** Add the explicit `if (error) throw new Error(...)` guard shown in Pattern 4 to every call site that currently depends on `sgMail.send()`'s rejection.
**Warning signs:** Existing spec file's `mockRejectedValue(new Error('SendGrid API error'))` tests (Test 2 under `sendOtpEmail`, Test 3 under `sendMinistryDigest`) will need to change to `mockResolvedValue({ data: null, error: { message: 'Resend API error', name: 'application_error', statusCode: 500 } })` to match Resend's actual failure shape — if the tests are just search-replaced from `mockRejectedValue` without changing the shape, they will pass against a mock that doesn't reflect real SDK behavior, hiding this exact bug class.

### Pitfall 2: Constructor-time throw on missing API key
**What goes wrong:** `new Resend('')` or `new Resend(undefined)` with no `RESEND_API_KEY` env var present throws synchronously at construction — if called unconditionally in `SendgridService`'s constructor (which NestJS instantiates eagerly at module bootstrap), this crashes the whole app boot in any environment lacking the key (local dev without the var set, CI, etc.), a **more severe** failure mode than SendGrid's original behavior (which degraded gracefully to failed sends, not a boot crash).
**Why it happens:** Resend requires the API key at construction time; there's no `setApiKey()`-style deferred setter.
**How to avoid:** Guard client construction exactly like the current placeholder check, storing `private client?: Resend` and checking `this.client` (throwing a clear internal error, or logging + returning, per each method's existing swallow/throw contract) in every send method when it's undefined.
**Warning signs:** App fails to boot with "Missing API key" instead of a runtime email-send failure.

### Pitfall 3: Test mocking pattern must change shape, not just call target
**What goes wrong:** `jest.mock('@sendgrid/mail', ...)` mocked a namespace object with `send: jest.fn()`. The Resend equivalent must mock the **named class constructor**, e.g.:
```typescript
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));
```
A naive rename (`jest.mock('resend', () => ({ send: jest.fn() }))`) doesn't match Resend's actual `resend.emails.send(...)` call shape and will produce `TypeError: Cannot read properties of undefined (reading 'send')` at test time — a good forcing function to make sure the mock actually mirrors the real class-instance shape.
**How to avoid:** Mock the constructor to return an object with an `emails.send` method, per the snippet above.

## Code Examples

```typescript
// Multi-recipient send with attachments — sendMinistryDigest's exact shape
// Source: Context7 /websites/resend + resend dist/index.d.cts (verified field names)
const { error } = await this.client.emails.send({
  from: this.from,
  to: params.to,              // string[] — accepted directly, max 50
  subject: params.subject,
  html: params.html,
  ...(params.attachments && params.attachments.length > 0
    ? {
        attachments: params.attachments.map((a) => ({
          content: a.content,          // already base64 — no change
          filename: a.filename,
          contentType: a.type,         // renamed field only
        })),
      }
    : {}),
});
if (error) {
  throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Env var should be renamed `RESEND_API_KEY` (new) while `resilience.sendgrid.*` PlatformConfig keys and the `'sendgrid'` `Vendor` string in `resilience.types.ts`/`ResilienceService` stay unchanged, since the task explicitly says only method signatures/class name are locked, not internal env var names | Pattern 1, throughout | If the planner instead expects the existing `SENDGRID_API_KEY` var name to be reused for the new Resend key, `.env`/`.env.example`/Railway env vars need updating to the new name regardless — this is a naming decision the planner/user should confirm, not a technical constraint. Renaming the **vendor key** `'sendgrid'` (used in `resilience.types.ts` `Vendor` union and every `platform_configs` row like `resilience.sendgrid.timeout_ms`) is explicitly **not required and not recommended** — it's just a resilience-policy lookup key, decoupled from the actual SDK/provider name, and renaming it would require a DB data migration for zero benefit. |

## Open Questions

1. **Should `SENDGRID_FROM_EMAIL` also be renamed?**
   - What we know: The `from` address is provider-agnostic (just a verified sender email); Resend has no special requirement on the env var name.
   - What's unclear: Whether the planner wants a clean rename (`RESEND_FROM_EMAIL`) or to keep `SENDGRID_FROM_EMAIL` to minimize `.env`/Railway diff surface.
   - Recommendation: Keep `SENDGRID_FROM_EMAIL` as-is (zero functional reason to rename; it's just a config key name) unless the user wants full naming consistency — this is a low-stakes, easily-reversible choice, not a technical blocker.

2. **Does the Resend account's sending domain need DNS verification before this ships?**
   - What we know: Resend requires a verified sending domain (SPF/DKIM) for production sends from a custom domain (`noreply@iseyaa.gov.ng`), same category of setup SendGrid required.
   - What's unclear: Whether Ogun State's DNS/domain verification for Resend has already been done outside this codebase (this is an infra/ops action, not a code change) — not verifiable from the repository.
   - Recommendation: Flag as a manual/ops action in the plan (parallel to the existing `MANUAL-ACTIONS.md` pattern used for WhatsApp template approval) rather than a code task.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/resend` — topics: Node.js SDK send email, attachments, error handling, response shape
- `resend` npm package source (`dist/index.cjs`, `dist/index.d.cts`) fetched and inspected directly via `npm pack resend@6.18.0` — client construction, `fetchRequest()` error handling, `Attachment`/`ErrorResponse`/`Response<T>` type definitions
- `npm view resend version` / `engines` / `time.modified` — version and Node compatibility confirmation

### Secondary (MEDIUM confidence)
- None — all claims traced to primary sources above or direct repository file reads.

## Metadata

**Confidence breakdown:**
- Standard stack (package/version/engines): HIGH — verified via `npm view` and package.json inspection
- Error handling contract: HIGH — verified by reading the actual compiled `fetchRequest()` source, not docs paraphrase
- Attachment field mapping: HIGH — verified via `dist/index.d.cts` type definitions and official docs matching base64 handling
- Import safety (named vs default export): HIGH — verified via `dist/index.d.cts` export list (no default export exists)

**Research date:** 2026-07-24
**Valid until:** 30 days (stable SDK, but pin to `resend@^6.18.0` and re-check `npm view resend version` before executing if this task is picked up later than that)
