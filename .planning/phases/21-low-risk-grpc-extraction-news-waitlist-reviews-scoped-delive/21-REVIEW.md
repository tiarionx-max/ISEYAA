---
phase: 21-low-risk-grpc-extraction-news-waitlist-reviews-scoped-delive
reviewed: 2026-07-20T00:00:00Z
depth: standard
files_reviewed: 71
files_reviewed_list:
  - .env.example
  - backend/apps/delivery-otp-service/Dockerfile
  - backend/apps/delivery-otp-service/railway.toml
  - backend/apps/delivery-otp-service/src/__tests__/delivery-otp-grpc.controller.spec.ts
  - backend/apps/delivery-otp-service/src/__tests__/grpc-health.spec.ts
  - backend/apps/delivery-otp-service/src/__tests__/health.controller.spec.ts
  - backend/apps/delivery-otp-service/src/app.module.ts
  - backend/apps/delivery-otp-service/src/delivery-otp-grpc.controller.ts
  - backend/apps/delivery-otp-service/src/health.controller.ts
  - backend/apps/delivery-otp-service/src/main.ts
  - backend/apps/delivery-otp-service/tsconfig.app.json
  - backend/apps/news-service/Dockerfile
  - backend/apps/news-service/railway.toml
  - backend/apps/news-service/src/__tests__/grpc-health.spec.ts
  - backend/apps/news-service/src/__tests__/health.controller.spec.ts
  - backend/apps/news-service/src/app.module.ts
  - backend/apps/news-service/src/health.controller.ts
  - backend/apps/news-service/src/main.ts
  - backend/apps/news-service/src/news-grpc.controller.ts
  - backend/apps/news-service/tsconfig.app.json
  - backend/apps/reviews-service/Dockerfile
  - backend/apps/reviews-service/railway.toml
  - backend/apps/reviews-service/src/__tests__/grpc-health.spec.ts
  - backend/apps/reviews-service/src/__tests__/health.controller.spec.ts
  - backend/apps/reviews-service/src/app.module.ts
  - backend/apps/reviews-service/src/health.controller.ts
  - backend/apps/reviews-service/src/main.ts
  - backend/apps/reviews-service/src/reviews-grpc.controller.ts
  - backend/apps/reviews-service/tsconfig.app.json
  - backend/apps/waitlist-service/Dockerfile
  - backend/apps/waitlist-service/railway.toml
  - backend/apps/waitlist-service/src/__tests__/grpc-health.spec.ts
  - backend/apps/waitlist-service/src/__tests__/health.controller.spec.ts
  - backend/apps/waitlist-service/src/app.module.ts
  - backend/apps/waitlist-service/src/health.controller.ts
  - backend/apps/waitlist-service/src/main.ts
  - backend/apps/waitlist-service/src/waitlist-grpc.controller.ts
  - backend/apps/waitlist-service/tsconfig.app.json
  - backend/jest.config.js
  - backend/nest-cli.json
  - backend/package.json
  - backend/src/app.module.ts
  - backend/src/modules/delivery-otp-client/__tests__/delivery-otp-client.service.spec.ts
  - backend/src/modules/delivery-otp-client/delivery-otp-client.constants.ts
  - backend/src/modules/delivery-otp-client/delivery-otp-client.module.ts
  - backend/src/modules/delivery-otp-client/delivery-otp-client.service.ts
  - backend/src/modules/delivery/delivery.controller.ts
  - backend/src/modules/delivery/delivery.module.ts
  - backend/src/modules/news-client/__tests__/news-client.service.spec.ts
  - backend/src/modules/news-client/news-client.constants.ts
  - backend/src/modules/news-client/news-client.module.ts
  - backend/src/modules/news-client/news-client.service.ts
  - backend/src/modules/news/news.controller.ts
  - backend/src/modules/news/news.module.ts
  - backend/src/modules/reviews-client/__tests__/reviews-client.service.spec.ts
  - backend/src/modules/reviews-client/reviews-client.constants.ts
  - backend/src/modules/reviews-client/reviews-client.module.ts
  - backend/src/modules/reviews-client/reviews-client.service.ts
  - backend/src/modules/reviews/reviews-admin.module.ts
  - backend/src/modules/reviews/reviews.controller.ts
  - backend/src/modules/reviews/reviews.module.ts
  - backend/src/modules/waitlist-client/__tests__/waitlist-client.service.spec.ts
  - backend/src/modules/waitlist-client/waitlist-client.constants.ts
  - backend/src/modules/waitlist-client/waitlist-client.module.ts
  - backend/src/modules/waitlist-client/waitlist-client.service.ts
  - backend/src/modules/waitlist/waitlist.controller.ts
  - backend/src/modules/waitlist/waitlist.module.ts
  - backend/src/resilience/resilience.types.ts
  - docker-compose.yml
  - docs/blue-green-cutover-runbook.md
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-07-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 71
**Status:** issues_found

## Summary

Reviewed the four low-risk gRPC extractions (News, Waitlist, Reviews, scoped Delivery-OTP) added
in Phase 21: each `*-client.service.ts` facade, each extracted `apps/*-service` process, their
Dockerfiles/railway.toml/tsconfig scaffolding, their spec files, and the shared resilience/
scaffolding files (`.env.example`, `docker-compose.yml`, `resilience.types.ts`,
`blue-green-cutover-runbook.md`).

The canary-flag-before-any-gRPC-call discipline, the `err?.message`-only logging discipline, and
the resilience-vendor wiring are all applied correctly and consistently across all four
extractions, matching the `notifications-client`/`notifications-service` precedent. Delivery-OTP's
unusual hand-wired provider graph (excluding `AuthModule`/`WalletModule`/`CommonModule`'s
guard-protected controllers while still resolving `DeliveryService`'s full transitive dependency
chain) was traced end-to-end and is correctly wired — every transitive constructor dependency
(`WalletService`, `S3Service`, `SettlementService`, `PaystackService`, `RefundService`,
`ReferenceService`, plus the `DeliveryGateway` stub) is accounted for, and the one `@Cron` handler
that now runs in two processes (`cleanStaleRiderHeartbeats`) is confirmed guarded by a
`redis.setNx('cron-lock:...')` lock, so double-firing is prevented.

However, the Reviews and Waitlist extractions have a real, provable functional regression: unlike
the Delivery-OTP extraction (which explicitly built business-vs-transport exception mapping across
the gRPC boundary — see `delivery-otp-grpc.controller.ts`'s own doc comment and
`delivery-otp-client.service.ts`'s `err?.code === GrpcStatus.X` mapping), `reviews-grpc.controller.ts`
and `waitlist-grpc.controller.ts` never wrap their services' `BadRequestException` /
`ForbiddenException` / `NotFoundException` / `ConflictException` in an `RpcException`, and
`reviews-client.service.ts` / `waitlist-client.service.ts` never inspect `err.code` on the way back.
Every legitimate validation, ownership, or duplicate-submission rejection on `POST /reviews` and
`POST /waitlist` therefore degrades from its correct HTTP status (400/403/404/409, with an
actionable message) to a generic `503 Service Unavailable "... temporarily unavailable, please try
again shortly"`. This is the same class of bug the phase's own Delivery-OTP plan (21-06/21-07)
explicitly identified and fixed — the fix was simply not carried over to the other two extractions
that also route business exceptions through `@GrpcMethod`.

## Critical Issues

### CR-01: Reviews extraction silently downgrades all business-rule rejections to a generic 503

**File:** `backend/apps/reviews-service/src/reviews-grpc.controller.ts:22-34` and
`backend/src/modules/reviews-client/reviews-client.service.ts:67-104`

**Issue:** `ReviewsService.createReview()` (`backend/src/modules/reviews/reviews.service.ts:65-`)
throws `NotFoundException('Booking not found')`, `ForbiddenException('You did not own this tour
booking')`, `BadRequestException('Tour has not ended yet...')`, and `ConflictException` on a
duplicate (booking × targetType × targetId) — all documented as real REST response codes in
`reviews.controller.ts`'s `@ApiResponse` annotations (400/403/404/409). `ReviewsGrpcController
.createReview()` calls `this.reviewsService.createReview(...)` with no `try/catch`, so none of
these are ever converted to an `RpcException`. NestJS's default `@GrpcMethod` exception handling
(`BaseRpcExceptionFilter`) replaces any non-`RpcException` with a generic "Internal server error"
response over the gRPC boundary — this exact behavior is independently documented by this same
phase's own authors in `delivery-otp-grpc.controller.ts`'s doc comment, which is why that
controller explicitly wraps its business exceptions in `RpcException`. `reviews-grpc.controller.ts`
does not do this.

On the client side, `ReviewsClientService.createReview()`'s `catch` block (lines 99-103) never
inspects `err.code` — every failure, business or transport, is converted to the same
`ServiceUnavailableException(UNAVAILABLE_MESSAGE)`. The net effect: a citizen who tries to review a
tour booking they don't own gets HTTP 503 "Reviews service is temporarily unavailable, please try
again shortly" instead of HTTP 403 with the real reason; a duplicate-review attempt gets 503
instead of 409; an early review attempt gets 503 instead of 400 explaining the tour hasn't ended.
This is a functional regression versus pre-extraction behavior, not a display-shape gap.

Confirmed by the test suite gap: `reviews-client.service.spec.ts` test 3 ("on gRPC/resilience
failure, throws ServiceUnavailableException") only exercises a plain transport `Error('UNAVAILABLE')`
with no `.code` — no spec exercises a business-exception-shaped gRPC error (an `err.code` of
`INVALID_ARGUMENT`/`NOT_FOUND`/`PERMISSION_DENIED`/`ALREADY_EXISTS`), unlike
`delivery-otp-client.service.spec.ts`, which explicitly tests codes 3 and 5.

**Fix:** Mirror `delivery-otp-grpc.controller.ts`'s pattern in `reviews-grpc.controller.ts`:

```typescript
@GrpcMethod('ReviewsService', 'CreateReview')
async createReview(data: reviews.CreateReviewRequest): Promise<reviews.CreateReviewResponse> {
  try {
    const review = await this.reviewsService.createReview(data.userId, { /* ... */ });
    return { id: review.id, flagged: review.flagged };
  } catch (err) {
    if (err instanceof NotFoundException) throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: err.message });
    if (err instanceof ForbiddenException) throw new RpcException({ code: GrpcStatus.PERMISSION_DENIED, message: err.message });
    if (err instanceof ConflictException) throw new RpcException({ code: GrpcStatus.ALREADY_EXISTS, message: err.message });
    if (err instanceof BadRequestException) throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: err.message });
    throw err;
  }
}
```

And mirror `delivery-otp-client.service.ts`'s `err?.code === GrpcStatus.X` mapping in
`ReviewsClientService.createReview()`'s catch block before falling back to
`ServiceUnavailableException`.

### CR-02: Waitlist extraction has the same missing exception-mapping gap

**File:** `backend/apps/waitlist-service/src/waitlist-grpc.controller.ts:11-24` and
`backend/src/modules/waitlist-client/waitlist-client.service.ts:51-81`

**Issue:** `WaitlistService.join()` (`backend/src/modules/waitlist/waitlist.service.ts:11-48`)
throws `BadRequestException('Provide an email or phone number')` when both `dto.email` and
`dto.phone` are absent, and `BadRequestException('Could not save your waitlist signup')` if the
underlying `upsert` fails. `WaitlistGrpcController.joinWaitlist()` calls
`this.waitlistService.join(...)` with no `try/catch` — same downgrade-to-generic-500-over-gRPC
issue as CR-01. `WaitlistClientService.join()`'s catch block (lines 75-80) always throws the
generic `ServiceUnavailableException(UNAVAILABLE_MESSAGE)` regardless of cause. A caller who
submits `POST /waitlist` with neither an email nor a phone now gets HTTP 503 "Waitlist service is
temporarily unavailable" instead of the correct HTTP 400 with the actionable "Provide an email or
phone number" message.

**Fix:** Same pattern as CR-01's fix, applied to `WaitlistGrpcController.joinWaitlist` (wrap
`BadRequestException` → `RpcException({code: GrpcStatus.INVALID_ARGUMENT, ...})`) and
`WaitlistClientService.join()`'s catch block (map `err.code === GrpcStatus.INVALID_ARGUMENT` →
`BadRequestException`).

## Warnings

### WR-01: A photo write-back failure after a successful review creation is misreported as total failure

**File:** `backend/src/modules/reviews-client/reviews-client.service.ts:90-98`

**Issue:** After the gRPC `createReview` call succeeds, `photos` are written back via a separate
`prisma.review.update(...)` call (required, since `CreateReviewRequest` has no `photos` field). If
that `update` throws (e.g. a transient DB error), execution falls into the same outer `catch` at
line 99, which throws `ServiceUnavailableException` — telling the caller the entire operation
failed. In reality the review row already exists (without photos) by that point. Given CR-01 above,
a caller who retries in response to that false-503 will hit `ReviewsService.createReview`'s
"one review per (booking × targetType × targetId)" duplicate check and get a `ConflictException`
that (until CR-01 is fixed) is *also* misreported as a 503 — compounding the confusion, since the
user never learns their first submission actually succeeded.

**Fix:** Catch the `photos` write-back step separately from the initial gRPC call; on failure,
still return the created review (optionally flagging that photos failed to attach) rather than
reporting the whole `createReview` as a transient outage.

### WR-02: `createReview` is not naturally idempotent yet is retried once by the shared `reviewsGrpc` resilience policy

**File:** `backend/src/resilience/resilience.types.ts:56-64` (via `backend/src/modules/reviews-client/reviews-client.service.ts:73-85`)

**Issue:** `reviewsGrpc` inherits the `fcm`-shaped default (`retryCount: 1`) documented as
"best-effort/non-financial." Unlike `paystackRefund` (explicitly pinned to `retryCount: 0` because a
lost response after a server-side-successful refund must not be retried — see
`resilience.types.ts:36-38`), review creation has the same "lost response after a server-side
success" hazard: if the gRPC call actually succeeds but the response is lost before
`resilience.execute` observes success (a transient/timeout condition that IS in `isTransientError`'s
retry set — `DEADLINE_EXCEEDED`/`UNAVAILABLE`/`RESOURCE_EXHAUSTED`), cockatiel retries
`createReview` a second time. `ReviewsService.createReview`'s duplicate-review guard will then throw
`ConflictException` on the retry, which (per CR-01) is misreported as a 503 to a caller whose first
attempt actually succeeded.

**Fix:** Once CR-01 is fixed, this retry becomes at least visible to the caller as a legitimate 409
rather than a false 503 — but consider whether `reviewsGrpc`'s `retryCount` should be `0` for the
`createReview` RPC specifically (mirroring the `paystackRefund` precedent), since it is a
non-idempotent write, distinct from the read-only `listReviews`/`findLatest`/`getWaitlistStats`
RPCs the shared vendor-level retry policy was designed around.

### WR-03: delivery-otp-service's hand-wired `AppModule` provider graph has no automated compile check

**File:** `backend/apps/delivery-otp-service/src/app.module.ts:28-87`

**Issue:** This module manually re-declares 7 providers (`DeliveryService`, `WalletService`,
`S3Service`, `SettlementService`, `PaystackService`, `RefundService`, `ReferenceService`) plus a
`DeliveryGateway` token override, to resolve `DeliveryService`'s full transitive dependency chain
without importing `WalletModule`/`CommonModule`/`AuthModule` (correctly reasoned and, on manual
trace, currently complete — see Summary). None of this app's specs
(`delivery-otp-grpc.controller.spec.ts`, `grpc-health.spec.ts`, `health.controller.spec.ts`)
actually instantiate the real `AppModule`; the controller spec injects a fully mocked
`DeliveryService`. A future change to any of `WalletService`/`PaystackService`/`S3Service`/
`SettlementService`/`RefundService`'s constructors (e.g. a new dependency added elsewhere in the
monolith) would silently break this hand-wired graph and would not be caught by any test in this
phase — only surfacing as a boot-time `Nest can't resolve dependencies` crash on deploy.

**Fix:** Add a lightweight smoke spec that does
`Test.createTestingModule({ imports: [AppModule] }).compile()` (with `ConfigService`/env mocked as
needed) to catch DI-graph breakage before deploy, similar in spirit to the existing
`grpc-health.spec.ts` harness tests.

## Info

### IN-01: Minor style notes (no functional impact)

- Each `apps/*-service/src/main.ts` (`news-service`, `waitlist-service`, `reviews-service`,
  `delivery-otp-service`) ends `bootstrap()` with a `console.log(...)` startup banner instead of
  using Nest's `Logger`. This mirrors the pre-existing `notifications-service` precedent, so it's
  consistent rather than a new regression — flagged only for completeness.
- The `firstValueFrom(this.grpcService.X(...) as any)` cast appears in every `*-client.service.ts`
  (`news`, `waitlist` ×2, `reviews` ×2, `delivery-otp`), each with an inline comment attributing it
  to a "dual-rxjs-copy" type-erasure issue inherited from `notifications-client.service.ts`. This is
  a pre-existing, documented pattern rather than something introduced carelessly in this phase, but
  it's worth tracking as accumulating type-safety debt across every gRPC facade in the codebase.

---

_Reviewed: 2026-07-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
