# Phase 17 Plan 04: Caller-Graph Audit (GRPC-04)

This audit precedes the Plan 17-04 cutover commits (D-11). It enumerates every direct
constructor injection of the in-process `NotificationsService` in the monolith's own
bootstrap tree, confirms the GRPC-05 grep gate (zero `ClientGrpc`/`ClientsModule` usage in
the modules that must stay in-process this milestone), and documents an accepted,
non-behavior-visible response-shape gap.

## 1. Constructor-injection sites of `NotificationsService`

Command run:

```bash
grep -rn "NotificationsService" backend/src backend/apps --include="*.ts" | grep -v ".spec.ts"
```

This raw command returns **35 lines** (imports, comments, class-name self-references,
`@GrpcMethod('NotificationsService', ...)` string literal decorator arguments, etc.), not 3 —
the plan's task text under-counted the raw grep, but its named line numbers (11, 54, 8)
correctly identify the 3 actual **constructor-injection** sites, which is what this audit
tracks. All 3 are confirmed present at exactly those line numbers:

| File | Line | Injection type | Disposition |
|------|------|-----------------|-------------|
| `backend/src/modules/notifications/notifications.controller.ts` | 11 | `constructor(private readonly notificationsService: NotificationsService) {}` | **REWIRED → NotificationsClientService** (Task 2 of this plan) |
| `backend/src/modules/tour-bookings/tour-notifications.service.ts` | 54 | `private readonly notifications: NotificationsService,` (multi-param constructor) | **REWIRED → NotificationsClientService** (Task 3 of this plan) |
| `backend/apps/notifications-service/src/notifications-grpc.controller.ts` | 8 | `constructor(private readonly notificationsService: NotificationsService) {}` | **UNCHANGED** (this IS the extracted process's own server-side gRPC handler implementation — `NotificationsGrpcController` in the separate `notifications-service` bootstrap tree — not a caller to migrate) |

No other constructor-injection site of `NotificationsService` exists anywhere in
`backend/src` or `backend/apps`. The remaining 32 raw grep lines are: the `import`
statements accompanying each of the 3 rows above; `NotificationsModule`'s own
`providers`/`exports` array entries (unchanged — the extracted process's `app.module.ts`
still imports `NotificationsModule` directly); `NotificationsService`'s own class
declaration and `Logger` name; `NotificationsClientService`'s doc comments referencing
the legacy class by name (Plan 17-03 scaffold); and `TourNotificationsService`'s own
static-flag/config-key self-references (unrelated `TourNotificationsService.*` matches
picked up by the substring `NotificationsService`).

## 2. GRPC-05 grep gate — zero `ClientGrpc`/`ClientsModule` usage in modules that stay in-process

Command run:

```bash
grep -rln "ClientGrpc\|ClientsModule" backend/src/modules/{wallet,transport,delivery,events,stays,marketplace,auth,tour-bookings,tour-packages,tour-guides}
```

Result: **zero matches** (grep exit code 1 / no output). Confirmed: none of Wallet,
Transport, Delivery, Events, Stays, Marketplace, Auth, Tour Bookings, Tour Packages, or
Tour Guides reference `ClientGrpc` or `ClientsModule` anywhere in their module
directories. This is expected and required — per `PROJECT.md`/`STATE.md`, these modules'
`SELECT FOR UPDATE` wallet transactions cannot safely span a gRPC boundary without an
out-of-scope outbox/saga redesign, so they remain in-process this milestone (GRPC-05).
The only `ClientGrpc`/`ClientsModule` usage in the codebase after this plan's Task 2/3
land is `backend/src/modules/notifications-client/notifications-client.module.ts`
(Plan 17-03), which is outside the excluded module list above.

## 3. Accepted gap: `SendPushResponse.reason` was not added to the proto

`packages/proto/notifications.proto`'s `SendPushResponse` message (lines 16-18) declares
only `bool success = 1;` — no `reason` field was added during Plan 17-01's proto
authoring. Confirming grep for any web/mobile client consumption of a `reason` field on
the push-send response:

```bash
grep -rni "reason" web/src mobile/app
grep -rni "\.reason" web/src mobile/app
```

Both commands return **zero matches**. No web or mobile client reads a `.reason` field
off any push-notification response today. This is therefore an accepted, non-behavior-
visible tradeoff — not an oversight: the in-process `NotificationsService.sendPush()`
never returned a structured failure reason either (callers only ever received a resolved
Promise or a thrown error), so `SendPushResponse.success`-only matches the pre-existing
contract exactly. No client-facing behavior changes as a result of this gap.

## Summary

- 3 confirmed constructor-injection sites of `NotificationsService`; 2 will be rewired
  onto `NotificationsClientService` in this plan's Tasks 2-3, 1 (the extracted process's
  own gRPC handler) stays unchanged by design.
- GRPC-05 grep gate: zero `ClientGrpc`/`ClientsModule` usage across all 10 modules that
  must remain in-process this milestone — confirmed clean before the cutover proceeds.
- `SendPushResponse.reason` gap: confirmed accepted, non-behavior-visible, backed by a
  zero-match grep of both client codebases.

This file is committed as its own standalone commit before any code change to
`notifications.controller.ts` or `tour-notifications.service.ts` lands in this plan.
