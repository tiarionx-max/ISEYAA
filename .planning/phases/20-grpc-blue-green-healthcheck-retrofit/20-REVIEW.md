---
phase: 20-grpc-blue-green-healthcheck-retrofit
reviewed: 2026-07-20T15:10:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - backend/apps/notifications-service/src/health.controller.ts
  - backend/apps/notifications-service/src/__tests__/grpc-health.spec.ts
  - backend/apps/notifications-service/src/__tests__/health.controller.spec.ts
  - backend/apps/notifications-service/src/main.ts
  - backend/apps/notifications-service/src/app.module.ts
  - backend/apps/notifications-service/railway.toml
  - backend/apps/notifications-service/Dockerfile
  - backend/package.json
  - backend/jest.config.js
  - backend/src/modules/transport/transport.service.ts
  - backend/src/modules/transport/__tests__/transport.service.spec.ts
  - backend/src/modules/delivery/delivery.service.ts
  - backend/src/modules/delivery/__tests__/delivery.service.spec.ts
  - backend/src/modules/stays/stays.service.ts
  - backend/src/modules/stays/__tests__/stays.service.spec.ts
  - backend/src/modules/stays/__tests__/stays-isolation.spec.ts
  - backend/src/modules/tour-bookings/tour-notifications.service.ts
  - backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts
  - backend/src/modules/notifications-client/notifications-client.constants.ts
  - backend/src/modules/notifications-client/notifications-client.module.ts
  - backend/src/modules/notifications-client/notifications-client.service.ts
  - backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts
  - backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts
  - .github/workflows/ci.yml
  - backend/test/setup-e2e-tours.ts
  - backend/test/e2e-tour-booking.e2e-spec.ts
  - docs/blue-green-cutover-runbook.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-07-20T15:10:00Z
**Depth:** standard (extended into cross-file/deep verification where warranted)
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This phase adds a `grpc.health.v1.Health` endpoint + `/healthz` HTTP healthcheck to
`notifications-service`, a `PlatformConfig`-gated canary kill-switch on
`NotificationsClientService`, `RedisService.setNx()` distributed locks on six
`@Cron` jobs across `transport`/`delivery`/`stays`/`tour-notifications` services, a
require-cycle fix in `notifications-client`, a rewritten wallet-invariant regression
suite, CI wiring for `test:e2e:tours`, and a blue-green cutover runbook.

I traced the actual diffs (not just current file contents) against `git log`/`git show`
for every commit touching these files, cross-referenced the phase's own
`20-CONTEXT.md`/`20-*-SUMMARY.md` decisions to distinguish genuinely new defects from
already-documented, risk-accepted trade-offs, ran `npx jest` (full suite: 57/57 suites,
700/700 tests green) and `npx madge --circular` (confirmed zero cycles), and empirically
rebuilt both the notifications-service target and the main monolith target to verify the
two different relative `protoPath` depths (`main.ts`'s 5×`../` vs.
`notifications-client.module.ts`'s 4×`../`) both correctly resolve to
`packages/proto/notifications.proto` under their respective `tsc`/`nest build` output
layouts — no defect there.

No BLOCKER-level defects were found. Three WARNING-level issues remain: an unguarded
Prisma read inside the new canary kill-switch that can leak a raw, unnormalized
exception instead of the class's own promised 503; a type-coercion footgun in the same
kill-switch's boolean comparison with no server-side validation backing the admin
endpoint that sets it; and a test-mock gap in the rewritten wallet-invariant suite that
silently defeats coverage of the `VisitorLogService` write path in every one of its six
test cases. Two INFO items are noted for completeness (a minor import-ordering nit, and
two already-documented/accepted residual risks worth restating for the record).

## Warnings

### WR-01: Canary kill-switch's PlatformConfig read is not wrapped in try/catch, unlike every other failure path in this class

**File:** `backend/src/modules/notifications-client/notifications-client.service.ts:41-58`
**Issue:** `isCanaryEnabled()` calls `this.prisma.platformConfig.findUnique(...)` with no
try/catch, and is invoked as the very first statement of both `registerToken()` and
`sendPush()`, *before* their own try/catch blocks:

```ts
async registerToken(userId: string, token: string) {
  if (!(await this.isCanaryEnabled())) {   // <-- not inside try/catch
    ...
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
  try {
    ...
  } catch (err: any) {
    this.logger.error(...);
    throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
  }
}
```

If the `platformConfig.findUnique` call itself throws (DB connection blip, pool
exhaustion, etc.), the raw Prisma exception propagates straight out of
`registerToken`/`sendPush` uncaught by this class. That is inconsistent with this same
file's own explicit contract — the class docstring and the `T-17-03-01` comment commit
to normalizing every failure into `ServiceUnavailableException` with the generic
`UNAVAILABLE_MESSAGE`, and to never leaking raw vendor/DB error details to callers. A
transient DB error here instead surfaces as an uncaught exception (a generic 500 via
Nest's default filter for `NotificationsController` callers, and an unnormalized error
object for internal callers like `TourNotificationsService`, where it is caught one
level up by that caller's own per-item try/catch — masking the inconsistency there, but
not for `NotificationsController`'s HTTP callers).

**Fix:** Wrap the flag read in its own try/catch, defaulting to "enabled" (fail-open,
consistent with the flag's own opt-out kill-switch philosophy) so a DB hiccup degrades
to today's already-tested gRPC-calling code path instead of a raw, unnormalized
exception:

```ts
private async isCanaryEnabled(): Promise<boolean> {
  try {
    const cfg = await this.prisma.platformConfig.findUnique({ where: { key: CANARY_FLAG_KEY } });
    return cfg?.value !== false;
  } catch (err: any) {
    this.logger.warn(`isCanaryEnabled: PlatformConfig read failed, defaulting to enabled: ${err?.message ?? err}`);
    return true;
  }
}
```

### WR-02: Canary flag's strict `!== false` comparison has no server-side type guard, and can silently fail to disable on an operator typo

**File:** `backend/src/modules/notifications-client/notifications-client.service.ts:43`
**Issue:** `isCanaryEnabled()` returns `cfg?.value !== false` — a strict comparison
against the JS boolean primitive. This is deliberate (D-10, confirmed during planning)
and correct as long as `PlatformConfig.value` is ever only ever a real JSON boolean.
However, the admin endpoint that sets this flag
(`PATCH /api/v1/admin/config/:key`, `backend/src/modules/admin/admin.controller.ts:96-100`,
referenced directly by `docs/blue-green-cutover-runbook.md` Steps 1/4/6 as the entire
cutover/rollback mechanism) accepts `@Body('value') value: any` with no DTO, no
class-validator decorator, and no runtime type check. If an operator (or a future
scripted rollback tool) ever sends the value as a JSON string `"false"` instead of the
boolean `false` — e.g. via a shell one-liner that stringifies its payload, or a
copy-paste mistake during a live incident — `"false" !== false` evaluates to `true`,
meaning the kill switch **silently fails to disable**, and the monolith keeps routing
real citizen traffic to `notifications-service` while the operator believes they have
just cut it off. This is precisely the failure mode the SETTLE-09 `WR-01` precedent
(cited directly in `transport.service.ts`/`delivery.service.ts`) was created to guard
against for the opposite polarity — here the same class of bug produces the more
dangerous "fails to disable" direction rather than "fails to enable."

The runbook's Step 1/4/6 examples do show the correct unquoted `{ "value": false }`
body, which mitigates this if followed literally, but nothing in the code enforces it.

**Fix:** Either (a) add a small DTO with `@IsBoolean()` scoped to this specific key in
`admin.controller.ts`/`admin.service.ts` (outside this phase's reviewed file list, but
worth a follow-up), or (b) harden `isCanaryEnabled()` itself to coerce string/number
representations defensively, e.g.:

```ts
return cfg?.value !== false && cfg?.value !== 'false';
```

### WR-03: `wallet-invariant.e2e-spec.ts`'s `mockPrisma` is missing `tourPackage`/`user.findUnique`, silently defeating VisitorLog coverage in all 6 tests

**File:** `backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts:61-72, 112-127`
**Issue:** `TourSettlementService.recordVisitorEntry()` (called on every successful
settlement path this suite exercises) does:

```ts
const [tourPackage, buyer] = await Promise.all([
  this.prisma.tourPackage.findUnique({ where: { id: booking.tourPackageId }, select: { lgaId: true } }),
  this.prisma.user.findUnique({ where: { id: booking.buyerUserId }, select: { role: true } }),
]);
await this.visitorLogService.record({ ... });
```

`mockPrisma` in this spec file declares `tourBooking`, `transaction`, `tourGuide`,
`property`, `event`, `platformConfig`, `wallet`, and `user: { upsert }` only — there is
no `tourPackage` key at all, and `user` has no `findUnique`. Accessing
`this.prisma.tourPackage.findUnique(...)` therefore throws
`TypeError: Cannot read properties of undefined (reading 'findUnique')` synchronously
inside the `Promise.all([...])` array construction, on every single test run (confirmed
by actually running the suite — the error fires once per `handleTourBookingPayment`
call, i.e. once per INV test plus 3× for INV-6's loop). `recordVisitorEntry()`'s own
try/catch swallows this (by design, matching the project's audit-log-failure
convention), so all 6 tests still pass — but `mockVisitorLog.record` (declared and wired
into the `TestingModule` providers specifically to be exercised) is **never actually
called by any test in this file**, despite the test setup implying it is part of what's
covered. Any future regression that breaks the real `VisitorLogService.record()`
integration (wrong argument shape, a renamed field, etc.) would go completely
undetected by this suite while still showing green.

This gap pre-dates the 20-04 rewrite (confirmed via `git show a0b8d1d^`), but the
rewrite touched this exact file extensively and is the state under review now.

**Fix:** Complete the mock surface so the real code path is exercised and the swallowed
error stops firing on every run:

```ts
interface MockPrisma {
  ...
  tourPackage: { findUnique: AnyFn };
  ...
}
// in makeService():
tourPackage: { findUnique: jest.fn().mockResolvedValue({ lgaId: null }) },
user: {
  upsert: jest.fn().mockResolvedValue({ id: SYSTEM_USER_ID }),
  findUnique: jest.fn().mockResolvedValue({ role: 'CITIZEN' }),
},
```
and optionally add an assertion (e.g. `expect(mockVisitorLog.record).toHaveBeenCalled()`)
to at least one INV test so this coverage gap can't silently regress again.

## Info

### IN-01: Import statement placed after inline comments, separated from the top-of-file import block

**File:** `backend/src/modules/notifications-client/notifications-client.module.ts:4-12`
**Issue:** `import { NOTIFICATIONS_PACKAGE } from './notifications-client.constants';` is
placed on line 12, after two comment blocks, rather than grouped with the other
`import` statements at lines 1-6. Purely cosmetic — no functional impact, and the
codebase has no `import/order` ESLint rule configured — but it reduces scanability of
the file's dependency list at a glance.
**Fix:** Move the import up next to the other imports; keep the explanatory comment
directly above it if desired.

### IN-02: Two residual risks reviewed and confirmed as already-documented, deliberate trade-offs — no action required

- **`backend/apps/notifications-service/src/main.ts:19-23` /
  `backend/apps/notifications-service/src/health.controller.ts:8-12`** — both the
  `grpc.health.v1.Health` RPC and `GET /healthz` report healthy unconditionally at
  boot/always (no live Prisma/Redis probe). This means Railway's health-gated rollout
  (the entire stated purpose of GRPC-06a) cannot actually catch a container that boots
  successfully but has a broken DB/Redis connection — it will report `SERVING`/`ok`
  regardless. This is explicitly called out and risk-accepted in
  `20-CONTEXT.md`/`20-01-SUMMARY.md` as `T-20-03`, scoped out of this phase deliberately.
  Restated here only so the residual exposure is visible in this review's record, not as
  a new finding requiring action.
- **`backend/src/modules/stays/stays.service.ts:333-337`,
  `backend/src/modules/tour-bookings/tour-notifications.service.ts:167-171, 253-257,
  318-322`, `backend/src/modules/transport/transport.service.ts:825-829`,
  `backend/src/modules/delivery/delivery.service.ts:832-836`** — the reused
  `RedisService.setNx()` primitive fail-opens (returns "lock acquired") when Redis is
  unreachable or errors, meaning two replicas could still both run a guarded cron
  concurrently during a simultaneous Redis outage + blue-green cutover window. This is
  explicitly documented and accepted as `D-08` in `20-CONTEXT.md`, with the reasoning
  that an unguarded tick during a Redis outage only degrades to "no lock at all," not a
  new failure mode, and that a fail-closed variant would need a larger `setNx()` API
  change out of this phase's scope. No new finding — confirmed as consciously accepted.

---

_Reviewed: 2026-07-20T15:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
