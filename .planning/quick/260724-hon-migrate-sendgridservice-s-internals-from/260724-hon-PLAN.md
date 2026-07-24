---
phase: quick
plan: 260724-hon
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/common/services/sendgrid.service.ts
  - backend/src/common/services/__tests__/sendgrid.service.spec.ts
  - backend/package.json
  - .env.example
  - README.md
  - MANUAL-ACTIONS.md
  - CLAUDE.md
  - .github/workflows/ci.yml
autonomous: true
requirements: []

must_haves:
  truths:
    - "App boots successfully in an environment with no RESEND_API_KEY set — SendgridService does not crash NestJS DI bootstrap"
    - "sendOtpEmail() still throws/rejects when the underlying send fails, so auth.service.ts's dispatchOtp SMS-fallback path still fires exactly as it does today"
    - "sendMinistryDigest() still throws/rejects when the underlying send fails, so ministry-export-scheduler.service.ts still marks the scheduled job lastStatus=FAILED"
    - "sendEmail() still swallows send failures into a logged error and resolves normally, so ticket/booking/studio confirmation callers never see a rejection"
    - "sendMinistryDigest()'s attachments are still delivered after being re-shaped from the SendGrid attachment shape to Resend's attachment shape"
    - "All tests in sendgrid.service.spec.ts pass against Resend-shaped mocks (constructor mock, {data,error} resolves, not throws)"
    - "No consumer file (auth/events/stays/marketplace/studio/tour-notifications/delivery/ministry) needed to change — SendgridService's public method signatures are byte-for-byte identical to before"
  artifacts:
    - path: "backend/src/common/services/sendgrid.service.ts"
      provides: "SendgridService rewritten against the resend SDK: named import, guarded lazy client construction, per-method throw/swallow contracts preserved, attachment field mapping"
      contains: "import { Resend } from 'resend'"
    - path: "backend/package.json"
      provides: "resend dependency added, @sendgrid/mail removed"
      contains: "\"resend\":"
    - path: "backend/src/common/services/__tests__/sendgrid.service.spec.ts"
      provides: "Updated mocks: jest.mock('resend', ...) returning a class whose instances expose emails.send; resolved {data,error} shapes instead of rejected promises"
      contains: "emails: { send:"
  key_links:
    - from: "backend/src/common/services/sendgrid.service.ts sendOtpEmail()"
      to: "auth.service.ts dispatchOtp() SMS fallback"
      via: "explicit if (error) throw new Error(...) after resend.emails.send(), preserving the real-rejection contract dispatchOtp's catch block depends on"
      pattern: "if \\(error\\)\\s*\\{?\\s*throw"
    - from: "backend/src/common/services/sendgrid.service.ts sendMinistryDigest()"
      to: "ministry-export-scheduler.service.ts lastStatus tracking"
      via: "explicit if (error) throw new Error(...), same contract as sendOtpEmail"
      pattern: "sendMinistryDigest"
    - from: "backend/src/common/services/sendgrid.service.ts sendEmail()"
      to: "events/stays/marketplace/studio confirmation callers"
      via: "try/catch around resend.emails.send() plus if (error) logger.error(...) with no rethrow"
      pattern: "logger\\.error"
---

<objective>
SendGrid permanently declined to activate the ISEYAA account. This plan swaps `SendgridService`'s internals from `@sendgrid/mail` to the Resend Node SDK (`resend@^6.18.0`, per RESEARCH.md) while keeping the class name and all five public method signatures byte-for-byte unchanged, so none of its ~10 consumer files need any edits.

The critical correctness constraint (per RESEARCH.md): Resend's `resend.emails.send()` **never throws** — it always resolves with `{ data, error }`. `sendOtpEmail()` and `sendMinistryDigest()` currently have no try/catch because their callers depend on a real rejection propagating (SMS fallback in `auth.service.ts`, and FAILED-status tracking in `ministry-export-scheduler.service.ts`). Both methods must get an explicit `if (error) throw new Error(...)` guard. `sendEmail()` must keep swallowing failures into a log (no rethrow), but must check the new `{data,error}` shape instead of catching a thrown exception.

Purpose: Restore transactional email (OTP delivery, ticket/booking/studio confirmations, ministry digests) on a working email provider without breaking any of the fallback/failure-tracking behavior that depends on this service's throw/swallow contracts.
Output: `sendgrid.service.ts` rewritten against Resend; `sendgrid.service.spec.ts` updated with Resend-shaped mocks; `backend/package.json` dependency swap; `RESEND_API_KEY` documented in `.env.example`, `README.md`, `MANUAL-ACTIONS.md`, `CLAUDE.md`, `.github/workflows/ci.yml`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/260724-hon-migrate-sendgridservice-s-internals-from/260724-hon-RESEARCH.md

<verified_facts>
Confirmed by direct inspection (2026-07-24, branch `microservices-redesign`):

- Only two files in the entire backend import `@sendgrid/mail`: `backend/src/common/services/sendgrid.service.ts` and its spec. `backend/package.json` has exactly one SendGrid entry: `"@sendgrid/mail": "^8.1.6"` (no separate `@sendgrid/client`/`@sendgrid/helpers` direct deps — safe to remove cleanly).
- `ministry-export-scheduler.service.ts` (lines ~237-268) builds attachments in the exact SendGrid shape `Array<{ content: string; filename: string; type: string; disposition: string }>` and passes them straight into `sendgrid.sendMinistryDigest({ to, subject, html, attachments })`, wrapped in `this.resilience.execute('sendgrid', () => ...)`. This file is NOT to be touched — `sendMinistryDigest`'s parameter type must stay exactly as-is; the SendGrid-to-Resend attachment field mapping (`type` -> `contentType`, drop `disposition`) happens INSIDE `sendMinistryDigest`, not at the caller.
- `sendOtpEmail()` and `sendMinistryDigest()` currently have NO try/catch by design (see inline comments in current file) — callers depend on real promise rejection.
- `sendEmail()` currently has a try/catch that swallows and logs (`this.logger.error(...)`), never rethrows.
- `backend/package.json` dependencies are alphabetically sorted; `"resend"` sorts between `"reflect-metadata"` (line 72) and `"rxjs"` (line 73); `"@sendgrid/mail"` is at line 52.
- Env var docs referencing `SENDGRID_API_KEY` today: `.env.example:30`, `README.md:77`, `MANUAL-ACTIONS.md:30`, `CLAUDE.md:105`, `.github/workflows/ci.yml:47`. `SENDGRID_FROM_EMAIL` stays unrenamed per task constraints (referenced in the same docs plus more) — only ADD `RESEND_API_KEY` entries, do not remove or rename any existing `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` line.
</verified_facts>

<target_implementation>
Full replacement for `backend/src/common/services/sendgrid.service.ts` — implement exactly this shape (Task 1 executor: use this as the concrete target, do not deviate from the throw/swallow contracts):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const PLACEHOLDER_KEY = 're_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

@Injectable()
export class SendgridService {
  private readonly logger = new Logger(SendgridService.name);
  private readonly from: string;
  private readonly client?: Resend;

  constructor(private config: ConfigService) {
    this.from = config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@iseyaa.gov.ng');
    const key = config.get<string>('RESEND_API_KEY', '');
    if (key && key !== PLACEHOLDER_KEY) {
      this.client = new Resend(key);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.client) {
      this.logger.error(`Resend not configured (RESEND_API_KEY missing) — email to ${to} not sent`);
      return;
    }
    try {
      const { error } = await this.client.emails.send({ to, from: this.from, subject, html });
      if (error) {
        this.logger.error(`Resend failed for ${to}: ${error.name} - ${error.message}`);
      }
    } catch (err) {
      // defensive only — resend's SDK resolves rather than rejects for API-level
      // failures, but keeps parity if a future SDK version changes this contract
      this.logger.error(`Resend failed for ${to}: ${err.message}`);
    }
  }

  // Deliberately does NOT call this.sendEmail() and has NO try/catch — the caller
  // (resilience.execute('sendgrid', ...) via dispatchOtp in auth.service.ts) depends
  // on a real rejection propagating here to trigger the SMS fallback (OTP-02).
  // Resend never rejects on its own — this explicit `if (error) throw` reconstructs
  // the throw contract @sendgrid/mail used to provide. See RESEARCH.md Pitfall 1.
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

    if (!this.client) {
      throw new Error('Resend client not configured — RESEND_API_KEY missing');
    }
    const { error } = await this.client.emails.send({
      to,
      from: this.from,
      subject: 'Your Iṣẹ́yáá verification code',
      html,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
    }
  }

  // sendTicketConfirmation, sendStudioBookingConfirmation, sendBookingConfirmation:
  // UNCHANGED — all three build HTML and delegate to this.sendEmail(), which already
  // has the correct swallow behavior. Copy these three methods verbatim from the
  // current file, no edits needed inside them.

  // Deliberately has NO try/catch (mirrors sendOtpEmail(), NOT sendEmail()'s swallow
  // behavior) — the caller (ministry-export-scheduler.service.ts, via
  // resilience.execute('sendgrid', ...)) depends on a real rejection propagating
  // here to mark lastStatus = FAILED.
  async sendMinistryDigest(params: {
    to: string[];
    subject: string;
    html: string;
    attachments?: Array<{ content: string; filename: string; type: string; disposition: string }>;
  }): Promise<void> {
    const { to, subject, html, attachments } = params;

    if (!this.client) {
      throw new Error('Resend client not configured — RESEND_API_KEY missing');
    }
    const { error } = await this.client.emails.send({
      to,
      from: this.from,
      subject,
      html,
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a) => ({
              content: a.content,
              filename: a.filename,
              contentType: a.type,
            })),
          }
        : {}),
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.name} - ${error.message}`);
    }
  }
}
```

Note the mapping table from RESEARCH.md Pattern 3: SendGrid's `type` -> Resend's `contentType` (rename only), `content` (base64) passes through unchanged, `disposition` is dropped (Resend has no equivalent field and never declares one in its types).
</target_implementation>

<test_mock_reference>
`sendgrid.service.spec.ts` must mock the Resend class constructor, not a namespace object, per RESEARCH.md Pitfall 3:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendgridService } from '../sendgrid.service';

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    if (key === 'RESEND_API_KEY') return 're_test_key_1234567890';
    return def;
  }),
};
```

Success case: `mockSend.mockResolvedValue({ data: { id: 'abc' }, error: null })`.
Failure case (replaces every prior `mockRejectedValue(new Error('SendGrid API error'))`): `mockSend.mockResolvedValue({ data: null, error: { message: 'Resend API error', name: 'application_error', statusCode: 500 } })`.

The `mockConfig.get` mock must return a truthy, non-placeholder `RESEND_API_KEY` so `this.client` is constructed during `beforeEach` — otherwise every test would hit the "client not configured" branch instead of exercising the real send-path logic.
</test_mock_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate SendgridService to the Resend SDK and swap the package dependency</name>
  <files>backend/src/common/services/sendgrid.service.ts, backend/package.json</files>
  <action>
    Rewrite `backend/src/common/services/sendgrid.service.ts` to exactly match `<target_implementation>` in context: named import `import { Resend } from 'resend'` (never a namespace/default import — this file already had one production bug from a broken import shape, see STATE.md quick task 260724-cfd); a `private readonly client?: Resend` field constructed only when `config.get('RESEND_API_KEY', '')` is truthy and not equal to the `PLACEHOLDER_KEY` constant (guards NestJS DI's eager instantiation from crashing app bootstrap when the key is absent, per RESEARCH.md Pitfall 2); `sendEmail()` checks `this.client` first (logs-and-returns if absent) then wraps `this.client.emails.send()` in try/catch, checking `if (error)` and logging without rethrowing; `sendOtpEmail()` and `sendMinistryDigest()` throw `new Error('Resend client not configured — RESEND_API_KEY missing')` if `this.client` is absent, and otherwise call `this.client.emails.send()` unwrapped (no try/catch) followed by an explicit `if (error) throw new Error(...)` guard, reconstructing the throw contract `@sendgrid/mail` used to provide natively. In `sendMinistryDigest()`, map the incoming SendGrid-shaped `attachments` array (`{content, filename, type, disposition}`) to Resend's shape (`{content, filename, contentType}`) inline when building the `.send()` call — drop `disposition` entirely, rename `type` to `contentType`, leave the method's own parameter type declaration unchanged (still accepts the SendGrid shape, since `ministry-export-scheduler.service.ts` must not be touched). Copy `sendTicketConfirmation`, `sendStudioBookingConfirmation`, and `sendBookingConfirmation` over verbatim — they only build HTML and delegate to `this.sendEmail()`, no changes needed inside them.

    Update `backend/package.json`: remove the `"@sendgrid/mail": "^8.1.6",` line, add `"resend": "^6.18.0",` in alphabetical position (between `"reflect-metadata"` and `"rxjs"`).
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit</automated>
  </verify>
  <done>sendgrid.service.ts imports Resend via named import, constructs the client only when a real non-placeholder RESEND_API_KEY resolves, preserves the exact throw-vs-swallow contract per method described above, and maps ministry-digest attachments to Resend's field shape. backend/package.json lists `resend` and no longer lists `@sendgrid/mail`. `npx tsc --noEmit` passes with no new type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update sendgrid.service.spec.ts mocks to Resend's shape and verify full test coverage</name>
  <files>backend/src/common/services/__tests__/sendgrid.service.spec.ts</files>
  <action>
    Replace the `@sendgrid/mail` import and `jest.mock('@sendgrid/mail', ...)` block with the Resend class-constructor mock shown in `<test_mock_reference>` in context (mock `Resend` to return `{ emails: { send: mockSend } }` from its constructor — a naive namespace-object mock does not match Resend's `resend.emails.send(...)` call shape and will throw `TypeError: Cannot read properties of undefined (reading 'send')`). Update `mockConfig.get` to return a real-looking, non-placeholder `RESEND_API_KEY` value so `SendgridService`'s constructor actually builds `this.client` during each test's module compile — every existing test currently exercises the send-path and would otherwise silently hit the new "client not configured" early-return/throw instead.

    Update every test's success-case mock from `(sgMail.send as jest.Mock).mockResolvedValue([{}, {}])` to `mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null })`. Update every rejection-based failure-case test (`sendOtpEmail` Test 2, `sendEmail` regression Test 3, `sendMinistryDigest` Test 3) from `mockRejectedValue(new Error('SendGrid API error'))` to `mockSend.mockResolvedValue({ data: null, error: { message: 'Resend API error', name: 'application_error', statusCode: 500 } })` — per RESEARCH.md Pitfall 1, a naive search-replace that keeps `mockRejectedValue` would test against behavior Resend's SDK never actually exhibits, hiding exactly the bug class this migration must avoid. Update each test's assertion on the thrown/rejected error message to match the new `Error` message format thrown by the `if (error) throw new Error(...)` guards (e.g. `.rejects.toThrow('Resend send failed: application_error - Resend API error')`). Update `sentArgs.to`/`sentArgs.attachments` assertions to read from `mockSend.mock.calls[0][0]` instead of `(sgMail.send as jest.Mock).mock.calls[0][0]`, and update the `sendMinistryDigest` attachments assertion to expect the mapped Resend shape (`{content, filename, contentType}`, no `disposition`) rather than the raw SendGrid-shaped input array.

    After updating the spec, run the full verification suite: `cd backend && npx tsc --noEmit` (already run in Task 1, re-run to confirm test file compiles), `cd backend && npx jest src/common/services/__tests__/sendgrid.service.spec.ts`, and a repo-wide grep check that no file under `backend/src` still imports `@sendgrid/mail`.
  </action>
  <verify>
    <automated>cd backend && npx jest src/common/services/__tests__/sendgrid.service.spec.ts</automated>
  </verify>
  <done>sendgrid.service.spec.ts mocks the Resend class constructor (not a namespace object), all success-case mocks resolve `{data,error:null}`, all failure-case mocks resolve `{data:null,error:{...}}` (never `mockRejectedValue`), and every test in the file passes. A repo-wide grep confirms no remaining `@sendgrid/mail` import anywhere under `backend/src`.</done>
</task>

<task type="auto">
  <name>Task 3: Document the new RESEND_API_KEY environment variable</name>
  <files>.env.example, README.md, MANUAL-ACTIONS.md, CLAUDE.md, .github/workflows/ci.yml</files>
  <action>
    Add `RESEND_API_KEY` entries alongside the existing `SENDGRID_API_KEY` references in each file — do not remove, rename, or reorder any existing `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` lines (per task constraints, `SENDGRID_FROM_EMAIL` stays as the "from" address env var, unrenamed, to avoid unnecessary churn across these same reference docs).

    - `.env.example` (near line 30): add `RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` as a new line near the existing `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` pair.
    - `README.md` (near line 77): add `RESEND_API_KEY="re_xxxx..."` near the existing SendGrid env var documentation.
    - `MANUAL-ACTIONS.md` (near line 30): add a new table row `| \`RESEND_API_KEY\` | Resend | resend.com → API Keys |` following the existing table's column format.
    - `CLAUDE.md` (near line 105): add a new bullet `- \`RESEND_API_KEY\` — Resend API key for transactional email (replaces \`SENDGRID_API_KEY\`; SendgridService's internals were migrated to Resend, see quick task 260724-hon)` immediately after the existing `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` bullet — do not edit the existing bullet's text.
    - `.github/workflows/ci.yml` (near line 47, inside the "Stub values" env block): add `RESEND_API_KEY: stub` as a new line alongside the existing `SENDGRID_API_KEY: stub` / `SENDGRID_FROM_EMAIL: noreply@example.com` lines.
  </action>
  <verify>
    <automated>grep -rn "RESEND_API_KEY" .env.example README.md MANUAL-ACTIONS.md CLAUDE.md .github/workflows/ci.yml | grep -v '^#' | wc -l</automated>
  </verify>
  <done>RESEND_API_KEY is documented in all five reference files (.env.example, README.md, MANUAL-ACTIONS.md, CLAUDE.md, .github/workflows/ci.yml) without removing or renaming any existing SENDGRID_API_KEY/SENDGRID_FROM_EMAIL reference.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Backend process env → Resend API | `RESEND_API_KEY` crosses from server config into an outbound third-party HTTP call (Resend's email delivery API) |
| Ministry digest attachments | PDF/CSV byte content built server-side from DB-sourced data, base64-encoded and forwarded to Resend's API as email attachments |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Denial of Service (app bootstrap) | `SendgridService` constructor | mitigate | Client construction is guarded (`if (key && key !== PLACEHOLDER_KEY)`) so a missing/placeholder `RESEND_API_KEY` never throws during NestJS DI's eager instantiation — degrades to logged failures at send-time instead of crashing app boot, per RESEARCH.md Pitfall 2 |
| T-quick-02 | Information Disclosure | Error messages thrown/logged from `sendOtpEmail`/`sendMinistryDigest`/`sendEmail` | accept | Error messages include Resend's `error.name`/`error.message` (e.g. `invalid_api_key`, `rate_limit_exceeded`) — these are operational diagnostics only, never include OTP codes, PII, or attachment contents; matches the existing SendGrid error-logging pattern already accepted in this codebase |
| T-quick-03 | Tampering (silent failure masking) | `sendOtpEmail`/`sendMinistryDigest` throw contract | mitigate | Explicit `if (error) throw new Error(...)` guard reconstructs the throw-on-failure contract these two methods' callers depend on (SMS fallback, FAILED-status tracking) — without this guard, Resend's never-throws behavior would silently convert real delivery failures into apparent successes (RESEARCH.md Pitfall 1, the central risk this migration must avoid) |

</threat_model>

<verification>
1. `cd backend && npx tsc --noEmit` — no new type errors after the service rewrite and spec update.
2. `cd backend && npx jest src/common/services/__tests__/sendgrid.service.spec.ts` — all tests pass against the new Resend-shaped mocks.
3. `cd backend && npx jest` — full backend suite passes (regression check for any other spec that might indirectly reference SendgridService).
4. Repo-wide check: no file under `backend/src` still imports `@sendgrid/mail` (grep confirms only the two files this plan touches ever referenced it, and both are now migrated).
5. Manual read-through of `sendgrid.service.ts` confirms: named `Resend` import (not namespace/default), guarded lazy client construction, `sendOtpEmail`/`sendMinistryDigest` both throw on `error`, `sendEmail` swallows-and-logs without rethrow, attachment mapping drops `disposition` and renames `type`→`contentType`.
6. `grep -n "RESEND_API_KEY" .env.example README.md MANUAL-ACTIONS.md CLAUDE.md .github/workflows/ci.yml` — confirms all five docs reference the new var.
</verification>

<success_criteria>
- `SendgridService` sends email via the Resend SDK; class name and all five public method signatures are unchanged from before this plan.
- `sendOtpEmail()` and `sendMinistryDigest()` throw a real `Error` when Resend returns `{error}`, preserving the SMS-fallback and FAILED-status-tracking behavior their callers depend on.
- `sendEmail()` swallows Resend failures into a logged error and never rejects, preserving ticket/booking/studio confirmation callers' fire-and-forget behavior.
- `backend/package.json` depends on `resend`, no longer depends on `@sendgrid/mail`.
- `sendgrid.service.spec.ts` mocks the `Resend` class constructor and asserts against resolved `{data,error}` shapes; all tests pass.
- No consumer file (auth/events/stays/marketplace/studio/tour-notifications/delivery/ministry-export-scheduler and their specs) required any edits.
- `RESEND_API_KEY` is documented in `.env.example`, `README.md`, `MANUAL-ACTIONS.md`, `CLAUDE.md`, and `.github/workflows/ci.yml` without disturbing existing `SENDGRID_FROM_EMAIL`/`SENDGRID_API_KEY` references.
</success_criteria>

<output>
After completion, create `.planning/quick/260724-hon-migrate-sendgridservice-s-internals-from/260724-hon-SUMMARY.md`
</output>