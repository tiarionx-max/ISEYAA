---
phase: 17-grpc-proof-of-pattern-extraction-notifications-service
reviewed: 2026-07-19T00:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - backend/apps/admin-service/src/app.module.ts
  - backend/apps/ai-service/src/app.module.ts
  - backend/apps/auth-service/src/app.module.ts
  - backend/apps/events-service/src/app.module.ts
  - backend/apps/marketplace-service/src/app.module.ts
  - backend/apps/notifications-service/src/notifications-grpc.controller.ts
  - backend/apps/stays-service/src/app.module.ts
  - backend/apps/wallet-service/src/app.module.ts
  - backend/package.json
  - backend/src/app.module.ts
  - backend/src/modules/notifications-client/__tests__/notifications-client.service.spec.ts
  - backend/src/modules/notifications-client/notifications-client.module.ts
  - backend/src/modules/notifications-client/notifications-client.service.ts
  - backend/src/modules/notifications/notifications.controller.ts
  - backend/src/modules/notifications/notifications.module.ts
  - backend/src/modules/tour-bookings/__tests__/tour-notifications.service.spec.ts
  - backend/src/modules/tour-bookings/tour-bookings.module.ts
  - backend/src/modules/tour-bookings/tour-notifications.service.ts
  - backend/src/resilience/__tests__/resilience.service.spec.ts
  - backend/src/resilience/resilience.service.ts
  - backend/src/resilience/resilience.types.ts
  - packages/proto/generate.sh
  - packages/proto/generated/notifications.ts
  - packages/proto/notifications.proto
  - docker-compose.yml
  - .env.example
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-07-19T00:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 17 extracts notifications-service behind a gRPC facade (`NotificationsClientService` / `NotificationsClientModule`), cuts `NotificationsController` and `TourNotificationsService` over to it, wires `ResilienceModule` into the 7 sibling gRPC scaffolds, adds gRPC-aware transient-error classification to `ResilienceService`, and updates the proto/docker-compose/env-var plumbing to support it. The gRPC facade layer itself (resilience wiring, error-to-503 mapping, retry/circuit-breaker classification, and the associated unit tests) is generally careful and well-documented.

The most significant finding is a **pre-existing but still-live authorization gap** on `POST /notifications/send`, which this phase's file (`notifications.controller.ts`, newly authored in this diff, carrying forward unchanged logic from the pre-refactor monolith) still ships with no admin-role check — any authenticated user can push an arbitrary notification to any other user. Beyond that, the gRPC `SendPush` handler silently discards the real send outcome and always reports `success: true` back over the wire, several downstream error classes get flattened into a single generic 503, and one code comment referencing pre-cutover return semantics has gone stale.

## Critical Issues

### CR-01: `POST /notifications/send` has no admin/role authorization — any authenticated user can push notifications to any user

**File:** `backend/src/modules/notifications/notifications.controller.ts:9,25-29`

**Issue:** The controller only applies `@UseGuards(JwtAuthGuard)` at the class level (line 8), which merely requires *any* valid, authenticated caller. The `/send` endpoint is annotated `@ApiOperation({ summary: 'Send push notification (admin)' })` — its name and doc comment declare admin-only intent — but there is no `RolesGuard` / `@Roles(...)` check anywhere on the class or the method, unlike every other admin-restricted controller in this codebase (compare `backend/src/modules/admin/admin.controller.ts:14-15`, which combines `@UseGuards(JwtAuthGuard, RolesGuard)` with `@Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)`). The handler also takes `userId` directly from the request body (not from the caller's own JWT, unlike `list()`/`registerToken()` which correctly use `req.user.userId`), so any logged-in citizen can send an arbitrary push notification — including phishing-style content — to any other user by ID, or spam a single victim repeatedly. Confirmed via `git show d1f81a7:backend/src/modules/notifications/notifications.controller.ts` that this gap predates Phase 17 and was carried forward unchanged by the 17-04 cutover (`8e70aab`) into the file now under review; it remains unaddressed in the reviewed state.

**Fix:**
```typescript
import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsClientService } from '../notifications-client/notifications-client.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { SendPushDto } from './dto/send-push.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsClientService) {}

  // ...list()/registerToken() unchanged...

  @Post('send')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.LGA_ADMIN)
  @ApiOperation({ summary: 'Send push notification (admin)' })
  send(@Body() body: SendPushDto) {
    return this.notificationsService.sendPush(body.userId, body.title, body.message, body.data);
  }
}
```
Also replace the untyped inline body type with a real DTO (see WR-03) so `userId`/`title`/`message` are validated by the global `ValidationPipe`.

## Warnings

### WR-01: gRPC `SendPush` handler discards the real send outcome and always reports `success: true`

**File:** `backend/apps/notifications-service/src/notifications-grpc.controller.ts:10-14`

**Issue:** `NotificationsService.sendPush()` (the unchanged in-process implementation this facade wraps) resolves with `{ sent: false, reason: 'no_token' | 'not_configured' | 'auth_failed' | 'send_failed' }` in every non-throwing failure branch (see `backend/src/modules/notifications/notifications.service.ts:67-120`) — it only *throws* for genuinely unexpected errors (e.g. a DB failure on the `user.findUnique` lookup). The gRPC controller `await`s this call but discards its return value entirely and hardcodes `return { success: true }` regardless of outcome — confirmed via `git show ec0a019` that this line was directly touched in this phase (widening the call with a 4th `data` argument) without updating the response mapping. This means the `SendPushResponse.success` field can never actually report a delivery failure (no token registered, FCM not configured, FCM API error) — it is `true` unconditionally unless the RPC itself throws. `load-tests/k6/scenarios/notifications-grpc-flow.js` only asserts gRPC transport status (`r.status === grpc.StatusOK`), not the `success` field, so this gap isn't caught by the existing load test either. Any future consumer that trusts the wire contract's `success` field will be misled.

**Fix:**
```typescript
@GrpcMethod('NotificationsService', 'SendPush')
async sendPush(data: notifications.SendPushRequest): Promise<notifications.SendPushResponse> {
  const result = await this.notificationsService.sendPush(data.userId, data.title, data.body, data.data);
  return { success: result.sent };
}
```

### WR-02: gRPC facade collapses every downstream failure (business errors included) into a generic 503 "temporarily unavailable"

**File:** `backend/src/modules/notifications-client/notifications-client.service.ts:39-59,61-72`

**Issue:** `registerToken()`/`sendPush()` wrap their entire call (including the resilience-wrapped RPC) in a single `try/catch` that maps *any* thrown error — network/transport failure, circuit-breaker-open, or a legitimate business/validation error surfaced from the server side (e.g. `NotificationsService.registerToken()`'s `prisma.user.update()` throwing `PrismaClientKnownRequestError P2025` when the JWT references a user that no longer exists, which is a realistic scenario given this platform's NDPA right-to-erasure requirement) — into the identical `ServiceUnavailableException(UNAVAILABLE_MESSAGE)`. `isTransientError()` in `resilience.service.ts` correctly does *not* retry non-transient gRPC codes (only `UNAVAILABLE`/`DEADLINE_EXCEEDED`/`RESOURCE_EXHAUSTED`), but that classification is never surfaced to the caller — every failure path still ends up looking like a vendor outage rather than "this request was invalid." This makes client-side error handling and operator alerting unable to distinguish a genuine outage from a bad request.

**Fix:** Inspect the caught error's gRPC status code before choosing the exception to throw, e.g.:
```typescript
} catch (err: any) {
  this.logger.error(`Notifications gRPC registerToken failed: ${err?.message ?? err}`);
  if (err?.code === GrpcStatus.NOT_FOUND) {
    throw new NotFoundException('User not found');
  }
  throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
}
```

### WR-03: `POST /notifications/send` accepts an untyped inline body — bypasses the global `ValidationPipe`

**File:** `backend/src/modules/notifications/notifications.controller.ts:27-29`

**Issue:** `@Body() body: { userId: string; title: string; message: string; data?: any }` is a plain TypeScript structural type, not a `class-validator`-decorated DTO class. Per this project's own convention ("All request bodies have a corresponding DTO class") and the global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, structural types provide **no** runtime validation — `userId` is never checked to be a well-formed ID, `title`/`message` have no length bounds, and `data` accepts arbitrary unbounded key/value pairs that get forwarded as-is into the FCM payload.

**Fix:**
```typescript
// dto/send-push.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsObject, MaxLength } from 'class-validator';

export class SendPushDto {
  @IsString() @IsNotEmpty()
  userId: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(500)
  message: string;

  @IsOptional() @IsObject()
  data?: Record<string, string>;
}
```

### WR-04: Resilience-wrapped gRPC calls ignore the provided `AbortSignal`, unlike other vendor call sites

**File:** `backend/src/modules/notifications-client/notifications-client.service.ts:41-51,63-66`

**Issue:** `ResilienceService.execute()` passes a `{ signal }` context into the wrapped function specifically so that cockatiel's `TimeoutStrategy.Aggressive` policy can cancel the in-flight call when a per-attempt timeout fires (see `NotificationsService.sendPush()`'s FCM call, `backend/src/modules/notifications/notifications.service.ts:95-113`, which correctly threads `signal` into `axios.post(..., { signal })`). `NotificationsClientService.registerToken()`/`sendPush()` both call `this.resilience.execute('notificationsGrpc', () => firstValueFrom(...))` with an arrow function that never receives/uses the `{ signal }` argument. When the 5s `notificationsGrpc` timeout fires, cockatiel abandons the promise and the caller sees a `TaskCancelledError`, but the underlying `@grpc/grpc-js` request to notifications-service is never actually cancelled — it keeps running server-side after the client has already given up and (for `sendPush`) potentially retried, risking a duplicate push send on retry after a slow-but-eventually-successful first attempt.

**Fix:** Thread the signal through and unsubscribe on abort, e.g. wrap the Observable with `takeUntil(fromEvent(signal, 'abort'))` before calling `firstValueFrom`, so the underlying gRPC call is actually torn down when cockatiel cancels the attempt.

## Info

### IN-01: Stale comment describing pre-cutover `sendPush` return semantics

**File:** `backend/src/modules/tour-bookings/tour-notifications.service.ts:220-222`

**Issue:** The comment above the `pushTMinus24h` flag-set call reads: "Flag-set only on push success (sendPush returns { sent: bool }). If push wasn't sent because of no_token / not_configured we still mark the booking notified — there is no token to retry against." Post-cutover, `NotificationsClientService.sendPush()` (which `TourNotificationsService` now injects) never resolves with `{ sent: false, ... }` — it either resolves `{ sent: true }` on success or throws `ServiceUnavailableException` on any failure (see WR-01 — the no-token/not-configured cases are now silently absorbed by the gRPC facade's hardcoded `success: true`). The net behavior (flag still gets set unless the RPC itself fails) is unchanged, but the comment's stated mechanism ("sendPush returns { sent: bool }") is no longer accurate for the code path actually being read.

**Fix:** Update the comment to reflect that `NotificationsClientService.sendPush()` throws on transport failure only, and that no-token/not-configured outcomes are now opaque to this caller.

### IN-02: `events-service`/`marketplace-service`/`stays-service` gRPC scaffolds don't import their feature module, unlike their siblings

**File:** `backend/apps/events-service/src/app.module.ts`, `backend/apps/marketplace-service/src/app.module.ts`, `backend/apps/stays-service/src/app.module.ts`

**Issue:** `admin-service`, `ai-service`, `auth-service`, and `wallet-service`'s `app.module.ts` each import their corresponding feature module (`AdminModule`, `AiModule`, `AuthModule`, `WalletModule`) so their gRPC controllers can reuse the canonical business-logic service layer. `events-service`, `marketplace-service`, and `stays-service` only import `PrismaModule`/`RedisModule`/`CommonModule`/`ResilienceModule` — no `EventsModule`/`MarketplaceModule`/`StaysModule` — meaning their gRPC controllers (`EventsGrpcController`, `MarketplaceGrpcController`, `StaysGrpcController`) query `PrismaService` directly and reimplement business logic (e.g. availability/stock checks) rather than reusing the monolith's existing, tested service methods. This phase's 17-02 commit (`8cb5c0f`) touched all 7 of these `app.module.ts` files to add `ResilienceModule` but did not address this inconsistency, so it carries forward into the reviewed state. Flagging for awareness since a future extraction of these services risks divergent/duplicated business rules (e.g. `MarketplaceGrpcController.reserveStock`'s check-then-`decrement` has no transaction/row-lock, unlike the wallet debit pattern this project otherwise requires).

**Fix:** Track as a known gap to close before any of these three services' gRPC surface is treated as more than a scaffold — either import the feature module or explicitly document that the gRPC controller is the source of truth for these three services going forward.

### IN-03: Unnecessary `void pushResult;` statement

**File:** `backend/src/modules/tour-bookings/tour-notifications.service.ts:229`

**Issue:** `pushResult` is captured from `await this.notifications.sendPush(...)` and never read before the `void pushResult;` no-op statement. Since the value is already bound to a `const` and never used elsewhere, the `void` statement adds no value beyond signaling "intentionally unused" — could be replaced by not binding the result at all (`await this.notifications.sendPush(...)` without assignment), which is what `pushTMinus2h`/`pushPostTourRating` already do for the same call shape a few lines later in the same file.

**Fix:**
```typescript
await this.notifications.sendPush(
  full.buyerUserId,
  'Your tour is tomorrow',
  `Your ${pkgName} tour is on ${dateStr}`,
  { type: 'tour_t_minus_24h', bookingId: full.id },
);
```

---

_Reviewed: 2026-07-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
