---
phase: quick
plan: 260724-cfd
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/common/services/sendgrid.service.ts
  - backend/src/common/services/__tests__/sendgrid.service.spec.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "SendgridService.sendOtpEmail, sendEmail (and its dependents sendTicketConfirmation/sendStudioBookingConfirmation/sendBookingConfirmation), and sendMinistryDigest all successfully invoke the real @sendgrid/mail send() method at runtime instead of throwing 'sgMail.send is not a function'"
    - "The constructor's conditional sgMail.setApiKey(key) call also resolves to the real prototype method instead of throwing, when a real SENDGRID_API_KEY is configured"
    - "No other backend source file has the same 'import * as X from a CJS-singleton-instance package' bug introduced or left unfixed"
  artifacts:
    - path: "backend/src/common/services/sendgrid.service.ts"
      provides: "Default import of @sendgrid/mail preserving its prototype chain"
      contains: "import sgMail from '@sendgrid/mail';"
  key_links:
    - from: "backend/src/common/services/sendgrid.service.ts"
      to: "@sendgrid/mail MailService singleton instance"
      via: "sgMail.send(...) / sgMail.setApiKey(...) resolving via prototype chain"
      pattern: "import sgMail from '@sendgrid/mail'"
---

<objective>
Fix a production-breaking bug: `backend/src/common/services/sendgrid.service.ts` imports `@sendgrid/mail` as `import * as sgMail from '@sendgrid/mail'`. That package's CJS entry (`node_modules/@sendgrid/mail/src/mail.js`) does `module.exports = new MailService()` — a class instance whose `send`/`setApiKey` methods live on `MailService.prototype`, not as the instance's own enumerable properties. Under this repo's `esModuleInterop: true` (`backend/tsconfig.json`), a namespace import (`import * as X`) compiles to TypeScript's `__importStar` helper, which only copies an object's OWN enumerable properties — it does not walk the prototype chain. The result: `sgMail.send` and `sgMail.setApiKey` are both `undefined` at runtime, confirmed live in production (`TypeError: sgMail.send is not a function` from `sendgrid.service.js:78`, silently falling back to SMS for every OTP send). The same broken `sgMail` reference is used by `sendEmail()` (swallows the error into a log, so ticket/studio/stay booking confirmation emails silently never send), `sendMinistryDigest()` (no try/catch — deliberately propagates so the scheduled digest job is marked FAILED), and the constructor's `sgMail.setApiKey(key)` call.

The fix: change the import to a default import — `import sgMail from '@sendgrid/mail';`. Under `esModuleInterop: true` + `allowSyntheticDefaultImports: true` (both already set in `backend/tsconfig.json`), and given `@sendgrid/mail`'s type declarations use `export = MailService` (confirmed via `node_modules/@sendgrid/mail/index.d.ts`), a default import compiles via `__importDefault`, which does NOT copy properties — it simply wraps the untouched module object as `{ default: originalModule }`. The instance's prototype chain stays intact, so `sgMail.send`, `sgMail.setApiKey`, etc. resolve correctly. This matches SendGrid's own documented usage pattern (`const sgMail = require('@sendgrid/mail')`).

Repo-wide grep (`from '@sendgrid/mail'`) confirms exactly one other file has the identical import: `backend/src/common/services/__tests__/sendgrid.service.spec.ts` (line 3). That file only uses its `sgMail` import to reference `jest.mock('@sendgrid/mail', ...)`'s mock functions for spying/assertions — the mock factory returns a plain object literal (`{ setApiKey: jest.fn(), send: jest.fn() }`), not a class instance, so the test does not currently fail regardless of import style. It is fixed anyway for consistency with the production import (both files import the same package the same way) and so the test continues to exercise the exact interface shape the fixed production code now uses.

Purpose: Restore all transactional email — OTP delivery via email, ticket/booking/studio-booking confirmations, and scheduled ministry digest exports — which are all completely broken today at the `sgMail.send()` call site.
Output: `sendgrid.service.ts` and its spec file both use a default import of `@sendgrid/mail`; `sgMail.send()` and `sgMail.setApiKey()` resolve to real prototype methods at runtime.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>
Confirmed by direct inspection of the current codebase (2026-07-24, branch `microservices-redesign`).

**`backend/src/common/services/sendgrid.service.ts` line 3 (current, broken):**
```typescript
import * as sgMail from '@sendgrid/mail';
```
Used at: constructor line 14 (`sgMail.setApiKey(key)`), `sendEmail()` line 20 (`sgMail.send(...)`), `sendMinistryDigest()` line 165 (`sgMail.send(...)`). `sendOtpEmail()` (line 40) also calls `sgMail.send(...)` directly (does not go through `sendEmail()` — deliberately, per its own comment, so the rejection propagates for SMS fallback). `sendTicketConfirmation`, `sendStudioBookingConfirmation`, `sendBookingConfirmation` all route through `this.sendEmail(...)`, so they inherit whichever behavior `sendEmail()`'s `sgMail.send()` call has.

**`node_modules/@sendgrid/mail/src/mail.js` (CJS export, confirmed):**
```javascript
const MailService = require('./classes/mail-service');
module.exports = new MailService();
```
A singleton class instance — `send`/`setApiKey` are on `MailService.prototype`, not own properties of the exported instance.

**`node_modules/@sendgrid/mail/index.d.ts` (confirmed):**
```typescript
import MailService = require("@sendgrid/mail/src/mail");
export = MailService;
```
`export =` style — fully compatible with `import sgMail from '@sendgrid/mail'` under `allowSyntheticDefaultImports: true`.

**`backend/tsconfig.json` (confirmed, unchanged by this plan):** `"esModuleInterop": true`, `"allowSyntheticDefaultImports": true` — both already set, no tsconfig changes needed.

**`backend/src/common/services/__tests__/sendgrid.service.spec.ts` line 3 (current):**
```typescript
import * as sgMail from '@sendgrid/mail';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));
```
The mock factory is a plain object literal, not a class instance — `sgMail.send`/`sgMail.setApiKey` already resolve correctly today regardless of import style, because `jest.mock` replaces the entire module. Changing this file's import to match production (`import sgMail from '@sendgrid/mail'`) is a no-op behaviorally (same mock `jest.fn()` references are exposed either way, since `__importDefault` wraps the mocked object as `{ default: mockedObject }` and property access still resolves to the same underlying `jest.fn()` instances) but keeps the test's import style honest with the fixed production code.
</verified_facts>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Change @sendgrid/mail import from namespace to default import in both source and spec files</name>
  <files>
    backend/src/common/services/sendgrid.service.ts
    backend/src/common/services/__tests__/sendgrid.service.spec.ts
  </files>
  <action>
    In `backend/src/common/services/sendgrid.service.ts` line 3, change `import * as sgMail from '@sendgrid/mail';` to `import sgMail from '@sendgrid/mail';`. Do not touch anything else in this file — no other line changes, no refactor of method bodies, error handling, comments, or signatures. All existing `sgMail.setApiKey(key)` (constructor), `sgMail.send(...)` (`sendEmail()`, `sendOtpEmail()`, `sendMinistryDigest()`) call sites are left exactly as-is; only the import statement changes.

    In `backend/src/common/services/__tests__/sendgrid.service.spec.ts` line 3, make the identical change: `import * as sgMail from '@sendgrid/mail';` to `import sgMail from '@sendgrid/mail';`. Do not touch the `jest.mock('@sendgrid/mail', () => ({ setApiKey: jest.fn(), send: jest.fn() }))` factory or any test bodies.

    Do not modify `backend/tsconfig.json` — `esModuleInterop` and `allowSyntheticDefaultImports` are already both `true`, no config change is needed for this fix.
  </action>
  <verify>
    <automated>cd backend && npx tsc --noEmit && npx jest src/common/services/__tests__/sendgrid.service.spec.ts</automated>
  </verify>
  <done>Both files import `@sendgrid/mail` via default import (`import sgMail from '@sendgrid/mail';`). `npx tsc --noEmit` in `backend/` passes with zero new type errors. `npx jest src/common/services/__tests__/sendgrid.service.spec.ts` passes all 7 existing tests unchanged (2 in `sendOtpEmail`, 1 in `sendEmail — regression`, 3 in `sendMinistryDigest`, plus the outer `describe` setup) — proving the mock's `send`/`setApiKey` jest.fn() references are still correctly exercised through the new default-import access pattern.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| `SendgridService` → `@sendgrid/mail` singleton client | Internal import-resolution boundary only — no untrusted external input crosses here. This is a pure TypeScript module-interop fix; the SendGrid API call shape, payload, and auth key handling are all unchanged. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Denial of Service (self-inflicted, already occurring) | `sendgrid.service.ts` — every `sgMail.send()`/`sgMail.setApiKey()` call site | mitigate | This plan's entire purpose: default import preserves the `MailService` instance's prototype chain, so `send`/`setApiKey` resolve to real functions instead of throwing `TypeError`. No new attack surface introduced — same API key handling, same call sites, same payload shapes. |

</threat_model>

<verification>
1. `cd backend && npx tsc --noEmit` — zero new type errors (both changed files type-check cleanly).
2. `cd backend && npx jest src/common/services/__tests__/sendgrid.service.spec.ts` — all existing tests pass, confirming `sgMail.send`/`sgMail.setApiKey` still resolve correctly through the mock after the import change.
3. `grep -rn "from '@sendgrid/mail'" backend/src` — confirms exactly two files reference the package, both now using `import sgMail from '@sendgrid/mail'` (default import), no remaining `import * as` usage anywhere in `backend/src`.
4. `git diff --stat` shows only the two files in `files_modified` above — no unrelated refactors.
</verification>

<success_criteria>
- `sendgrid.service.ts` uses `import sgMail from '@sendgrid/mail';` (default import) — the only change to this file.
- `sendgrid.service.spec.ts` uses the identical default-import style, keeping test and production import patterns consistent.
- `npx tsc --noEmit` in `backend/` passes cleanly.
- `npx jest src/common/services/__tests__/sendgrid.service.spec.ts` passes all existing tests with no modifications to test bodies or the mock factory.
- No other file in `backend/src` retains the broken `import * as sgMail from '@sendgrid/mail'` pattern.
- This fix is code-only; no deployment or Railway verification is performed as part of this plan.
</success_criteria>

<output>
After completion, create `.planning/quick/260724-cfd-fix-sendgrid-email-dispatch-broken-by-na/260724-cfd-SUMMARY.md`
</output>
