---
created: 2026-07-19T18:00:00.000Z
title: Fix NotificationsClientModule circular dependency breaking e2e:tours suite
area: general
files:
  - backend/test/e2e-tour-booking.e2e-spec.ts
  - backend/src/modules/tour-bookings/__tests__/wallet-invariant.e2e-spec.ts
  - backend/src/notifications-client/notifications-client.module.ts
---

## Problem

Discovered while wiring Phase 18's new e2e regression test into CI (2026-07-19): running
`npm run test:e2e:tours` against a real Postgres DB fails on both existing e2e suites
(`e2e-tour-booking.e2e-spec.ts` and `wallet-invariant.e2e-spec.ts`) with:

```
A circular dependency has been detected inside NotificationsClientModule. Please, make sure
that each side of a bidirectional relationships are decorated with "forwardRef()".
```

Confirmed via `git stash` that this predates Phase 18's changes entirely — it's pre-existing
debt, likely introduced by Phase 17's gRPC `notifications-service` extraction work (the
`NotificationsClientModule` that replaced the in-process notifications call path).

`test:e2e:tours` is NOT currently run by CI (`.github/workflows/ci.yml` only runs `npm test`),
so this has been silently broken with no one noticing. Phase 18 added a new, narrower
`test:e2e:settlement-splits` CI step instead of fixing/wiring the existing broken suite, since
fixing an unrelated circular-dependency bug was out of scope for a settlement-split-centralization
phase.

## Fix

Add `forwardRef()` on whichever side of the `NotificationsClientModule` relationship is
bidirectional, get `test:e2e:tours` green locally, then wire it into
`.github/workflows/ci.yml` alongside the existing `test:e2e:settlement-splits` step so both
e2e suites run on every PR.
