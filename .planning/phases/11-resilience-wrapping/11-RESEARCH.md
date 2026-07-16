# Phase 11: Resilience Wrapping - Research

**Researched:** 2026-07-16
**Domain:** Node.js/NestJS transient-fault-handling (circuit breaker + retry + timeout + fallback) via `cockatiel`, wired into OpenTelemetry + Sentry
**Confidence:** HIGH (cockatiel API surface, version/module compatibility, Anthropic SDK internals, Paystack idempotency) / MEDIUM (SSE streaming retry pattern — no official cockatiel guidance exists, this is a derived pattern) / MEDIUM (exact PlatformConfig-caching architecture — reasoned from precedent, not documented anywhere)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fallback behavior:**
- **D-01:** Fail loud, fail fast. Once a circuit is open (or retries are exhausted) on Paystack, Anthropic, or S3/R2, the call site throws a generic `ServiceUnavailableException` (503) immediately — no silent hangs, no queuing.
- **D-02:** FCM keeps its existing behavior unchanged: `sendPush()` already never throws — all failure paths (`no_token`, `not_configured`, `auth_failed`, `send_failed`) are caught internally and returned as a result object (`notifications.service.ts:63-113`). This *is* the fallback for FCM; wrap it in the same circuit-breaker/retry/timeout policy for observability and consistency, but preserve its swallow-and-report contract.
- **D-03:** Termii keeps its existing fallback chain per call site: `auth.service.ts` keeps Termii → Twilio → console-stub (L288-333); `delivery.service.ts` keeps Termii → log-and-swallow with its own stub log (L320-346). The circuit breaker wraps each leg of each chain independently — do not unify the two chains' behavior.
- **D-04:** No background retry queue for Paystack — explicitly rejected as bigger scope than this phase. If a Paystack call fails after retries, the request fails now.

**Error contract:**
- **D-05:** One generic `ServiceUnavailableException` (503) reused across all vendors for circuit-open/retry-exhausted cases, with a message string identifying which vendor failed. No vendor-specific exception subclasses or error codes. Exception: FCM (per D-02) never throws at all.

**Threshold config source:**
- **D-06:** Resilience thresholds (timeout ms, retry count, circuit-breaker failure threshold, reset/half-open timing) are PlatformConfig DB-backed, not hardcoded constants and not plain env vars — extending the existing `PlatformConfig` key/value pattern (`prisma/schema.prisma:649-660`).
- **D-07:** Key granularity is per-vendor, not shared-default-with-overrides — e.g. `resilience.paystack.timeout_ms`, `resilience.paystack.retry_count`, `resilience.paystack.breaker_failure_threshold`, `resilience.termii.timeout_ms`, etc. Each of the 5 vendors gets its own full set of keys (~3-4 keys each).

**Termii duplication:**
- **D-08:** Do not extract a shared `TermiiService`. `auth.service.ts`'s `sendTermii()` and `delivery.service.ts`'s `sendTermiiDeliveryOtp()` stay as separate inline implementations. Each gets the resilience policy applied independently, in place.

**Observability / alerting:**
- **D-09:** Circuit-breaker opening is alert-worthy: call `Sentry.captureException`/`Sentry.captureMessage` when a breaker transitions to open, in addition to OTel spans/log events for every state transition (closed → open → half-open) and every vendor-call failure.
- **D-10:** No existing manual tracer/span helper exists anywhere in the codebase (`instrumentation.ts` only sets up `getNodeAutoInstrumentations()`). Any manual span wrapping added for circuit-breaker visibility is net-new.
- **D-11:** Sentry is initialized (`main.ts:11-15`, `tracesSampleRate: 0.1`) but no `SentryGlobalFilter`/`APP_FILTER` is registered anywhere. Circuit-open Sentry calls must be made explicitly at the point of transition, not assumed to be caught automatically.

### Claude's Discretion
- Exact cockatiel policy composition per vendor (retry backoff strategy, circuit-breaker sampling window/duration) — implementation detail.
- Whether wrapping happens at the single choke-point method (e.g. `S3Service.upload()`, `PaystackService.initiatePayment()`) or requires touching each individual call site — since Paystack/S3/FCM are already centralized services, wrapping at the service-method level should satisfy "every call site." Termii and the two inline call sites are the exception (per D-08).
- Anthropic SSE streaming retry semantics: retrying mid-stream (after tokens have already been emitted to the client) is unsafe/non-idempotent. Recommend retry only applies to the initial stream-connection attempt, with no retry once the first token has been emitted — **this research confirms this is achievable with cockatiel's `execute()` scoping (see Pattern 4 below), but it is a derived pattern, not an officially documented cockatiel feature.**
- Fixing `getLgaIntelligence()`'s complete lack of error handling (`ai.service.ts:515-532`, no try/catch at all today) is required as a byproduct of wrapping it in policy.
- Whether PlatformConfig resilience keys are seeded via a migration/seed script or created ad-hoc on first read with defaults — implementation detail (this research recommends ad-hoc-with-hardcoded-default, matching the existing `PLATFORM_FEE_PCT` precedent — see Pattern 2).

### Deferred Ideas (OUT OF SCOPE)
- **Termii shared-service consolidation** — not fixed this phase (D-08).
- **Background retry queue for failed Paystack calls** — explicitly rejected in favor of fail-fast (D-04/D-01).
- **Vendor-specific typed error codes for clients** — rejected in favor of one generic `ServiceUnavailableException` (D-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESIL-01 | Every call to Paystack, Termii, Anthropic, Cloudflare R2/S3, and Firebase FCM is wrapped in a circuit-breaker + retry + timeout + fallback policy, so a single vendor outage degrades only the dependent feature, not the whole API | Standard Stack (cockatiel 3.2.1 selection + version/CJS compatibility proof), Architecture Patterns (ResilienceModule/ResilienceService design, per-vendor policy composition, PlatformConfig threshold wiring), Code Examples (per-vendor `wrap()` compositions), Common Pitfalls (stateful breaker singleton requirement, error-filtering to avoid breaking on business-logic 4xx, Anthropic SDK's own internal retry double-counting) |
| RESIL-02 | Vendor-call failures and circuit-breaker state transitions are visible in the existing Grafana/Sentry/OpenTelemetry observability stack | Architecture Patterns (manual OTel span pattern, Sentry capture pattern), Code Examples (onBreak/onReset/onHalfOpen handler wiring), Common Pitfalls (no metrics exporter configured — must use spans not counters; `@opentelemetry/api` not yet a direct dependency) |
</phase_requirements>

## Summary

`cockatiel` is confirmed as the correct resilience library for this phase, but **only version 3.x is usable — not the current npm `latest` (4.0.0)**. Cockatiel 4.0.0 requires Node ≥22 and ships as ESM-only (`"type": "module"`, no CJS `main` fallback for consumers), which is incompatible with the backend's CommonJS (`module: "commonjs"`) TypeScript build. Cockatiel 3.2.1 (published as part of the same release train, `engines: { node: ">=16" }`, dual CJS+ESM output) is the version to install, and it comfortably supports Node 20 LTS. This is a from-scratch dependency addition — no existing retry/breaker library exists anywhere in the codebase to reuse or migrate from.

The core architectural decision this research resolves is reconciling the phase's literal requirement text ("wrapped in a ... fallback policy") with the locked D-01/D-05 "fail loud" contract: cockatiel's `fallback()` primitive returns a **substitute value**, not a thrown exception — it is the right tool for FCM (D-02, which already has a swallow-and-report contract) but the wrong tool for Paystack/Anthropic/S3 (D-01, which must throw). For those three, the correct composition is `wrap(circuitBreaker, timeout, retry)` with **no** `fallback()` policy — the resulting `BrokenCircuitError`/`TaskCancelledError`/exhausted-retry error is caught at the call site (or in a thin service-level wrapper) and re-thrown as `ServiceUnavailableException`. This satisfies "wrapped in a circuit-breaker + retry + timeout + fallback policy" in spirit (fail-fast IS the fallback behavior) without contradicting D-01.

A second load-bearing finding: circuit breakers are **stateful, in-memory objects that must be built once and reused** across all calls to a given vendor — cockatiel's own docs warn "ensure the same breaker instance is reused across requests." This means the ResilienceService must construct one policy instance per vendor at module-init time (reading PlatformConfig thresholds once, with hardcoded fallback defaults matching the existing `PLATFORM_FEE_PCT` precedent), not rebuild a policy on every call site invocation — rebuilding would silently make the circuit breaker inert (it would never accumulate failures because the accumulator itself is destroyed after each call).

Third, the Anthropic TypeScript SDK already implements its own internal retry logic (default `maxRetries: 2`, retrying on 408/409/429/5xx) at the HTTP-client layer, independent of anything cockatiel adds. Layering cockatiel retries on top without accounting for this compounds retry/backoff duration unpredictably. The recommended mitigation is to pass `maxRetries: 0` when constructing the `Anthropic` client so cockatiel is the single source of retry truth for that vendor.

**Primary recommendation:** Install `cockatiel@^3.2.1` (not `latest`) and `@opentelemetry/api@^1.9.1` as explicit `backend` dependencies. Build a `@Global()` `ResilienceModule` exporting a `ResilienceService` with one cached, `OnModuleInit`-constructed cockatiel policy per vendor (Paystack, Termii-auth, Termii-delivery, Anthropic, S3, FCM), each individually subscribing `onBreak`/`onReset`/`onHalfOpen` to manual OTel spans + `Sentry.captureMessage`. Wrap centralized service methods (`PaystackService.initiatePayment/resolveBvn/refundCharge`, `S3Service.upload`, `NotificationsService.sendPush`) at the method level; wrap the two Termii call sites and `getLgaIntelligence` individually; wrap only the `anthropic.messages.stream()` connection-establishment call (not the `for await` iteration loop) for the two SSE methods.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Circuit-breaker/retry/timeout policy execution | API / Backend | — | Policies wrap outbound HTTP calls made from NestJS services; no client-tier or CDN involvement |
| Resilience threshold configuration (timeout/retry/failure-threshold values) | Database / Storage | API / Backend | Values persist in `PlatformConfig` (Postgres); API tier reads them once at module-init and holds them in memory for the process lifetime |
| Circuit-breaker runtime state (closed/open/half-open, failure counters) | API / Backend | — | In-memory only, per cockatiel policy instance, per Node.js process — **not** persisted to DB or Redis this phase (single-instance backend; multi-instance breaker-state sharing is out of scope) |
| Vendor-call failure / state-transition observability | API / Backend | CDN / Static (Grafana Cloud ingestion) | Manual OTel spans + Sentry captures originate in the backend process; Grafana Cloud/Sentry are external sinks, not part of this phase's code |
| Client-facing error surface (503 `ServiceUnavailableException`) | API / Backend | Browser / Client (existing generic 5xx toast, unchanged) | D-05 explicitly avoids any client-tier changes — the existing generic error handling on web/mobile already covers this |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cockatiel` | `^3.2.1` (NOT `^4.0.0` — see Pitfall 1) | Retry, circuit-breaker, timeout, fallback, bulkhead policies with a Polly-inspired composable API | Already the project's locked choice (STATE.md: "cockatiel chosen for resilience ... over Opossum"); zero runtime deps, TypeScript-native, supports both CJS and ESM consumers `[VERIFIED: npm registry — main:'dist/index.js', module:'dist/esm/index.js', engines:{node:'>=16'}]` |
| `@opentelemetry/api` | `^1.9.1` | Provides `trace.getTracer()`/`startSpan()` for manual span creation | Currently only present **transitively** (via `@opentelemetry/sdk-node`, `@sentry/nestjs`) — not a direct `backend/package.json` dependency. Must be added explicitly since this phase is the first to import it directly. Peer-compatible with the installed `@opentelemetry/sdk-node@^0.218.0` (`peerDependencies: {"@opentelemetry/api": ">=1.3.0 <1.10.0"}`) `[VERIFIED: npm registry]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@sentry/nestjs` | `^10.52.0` (already installed) | `Sentry.captureMessage`/`Sentry.captureException` for circuit-open alerts | Already a direct dependency (`main.ts:11`) — no new install needed, only new call sites in `onBreak` handlers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `cockatiel` | `opossum` | Explicitly rejected already (STATE.md decisions log) — opossum only does circuit-breaking, would need a second library (`p-retry` or similar) for retry/timeout, multiplying the surface area this phase touches |
| `cockatiel` | `axios-retry` (for the axios-based vendors) | Only handles retry, not circuit-breaking/fallback; doesn't cover the two `fetch()`-based Termii call sites or the non-HTTP Anthropic SDK calls — cockatiel wraps an arbitrary async function so it uniformly covers axios, fetch, and SDK-call sites |
| cockatiel `fallback()` for Paystack/Anthropic/S3 | Plain `try/catch` around the composed `wrap(circuitBreaker, timeout, retry)` policy | Chosen deliberately — see Summary. `fallback()`'s factory contract is "return a value," not "throw a different error," so D-01's fail-loud contract is better served by catching the policy's thrown error and re-throwing `ServiceUnavailableException` manually |

**Installation:**
```bash
npm install cockatiel@^3.2.1 @opentelemetry/api@^1.9.1 --workspace=backend
```

**Version verification:**
```bash
npm view cockatiel version        # 4.0.0 (latest tag) — DO NOT use, see Pitfall 1
npm view cockatiel@3 version      # 3.2.1 — install this
npm view cockatiel@3.2.1 engines  # { node: '>=16' }
npm view @opentelemetry/api version  # 1.9.1
```
All verified against the live npm registry on 2026-07-16. `cockatiel@3.2.1` and `4.0.0` were published together on the same date (`2026-05-26`), meaning 4.0.0 is not a "newer, more current" choice to prefer over 3.2.1 in the usual sense — they are parallel release lines with different runtime targets, and 3.x continues to receive patch releases independently.

## Architecture Patterns

### System Architecture Diagram

```text
                      ┌─────────────────────────────────────────────┐
                      │            ResilienceModule (@Global)          │
                      │  ResilienceService.onModuleInit():             │
                      │   for each vendor in [paystack, termii-auth,   │
                      │     termii-delivery, anthropic, s3, fcm]:      │
                      │    1. read resilience.<vendor>.* from          │
                      │       PlatformConfig (fallback to hardcoded    │
                      │       defaults if row missing)                 │
                      │    2. build ConsecutiveBreaker + retry +       │
                      │       timeout policy instances (kept as        │
                      │       named refs, not just wrap() output)      │
                      │    3. subscribe onBreak/onReset/onHalfOpen/     │
                      │       onGiveUp → manual OTel span + Sentry      │
                      │    4. cache composed wrap() policy in a         │
                      │       Map<vendor, Policy> for process lifetime │
                      └─────────────────────┬───────────────────────┘
                                             │ injected
        ┌────────────────────┬──────────────┼──────────────┬─────────────────┐
        ▼                    ▼               ▼              ▼                 ▼
 PaystackService      S3Service      NotificationsService  AiService   auth.service.ts /
 .initiatePayment()   .upload()      .sendPush() (inner    .streamChat  delivery.service.ts
 .resolveBvn()                       axios call only)      WithTools()  sendTermii() /
 .refundCharge()                                           .streamIti-  sendTermiiDeliveryOtp()
                                                             nerary()
                                                            .getLgaIntel-
                                                             ligence()
        │                    │               │              │                 │
        ▼                    ▼               ▼              ▼                 ▼
 policy.execute(()  =>  policy.execute(  policy.execute(   policy.execute(  policy.execute(() =>
   axios.post(...))       () => s3.send    () => axios       () => anthropic  fetch('...termii...'))
                           (...))            .post(fcm))       .messages
                                                                .stream(...))
                                                                — ONLY the
                                                                connection call;
                                                                for-await loop
                                                                runs OUTSIDE
                                                                policy.execute()
        │                    │               │              │                 │
        ▼                    ▼               ▼              │                 ▼
  catch BrokenCircuit-  catch ... →     existing catch{}  (errors during   catch → existing
  Error/TaskCancelled-  ServiceUnavail-  block already     stream iteration Twilio/console-stub
  Error/exhausted →     ableException    converts thrown   propagate        fallback chain
  throw Service-                         errors to         normally,       (D-03, unchanged)
  UnavailableException                   {sent:false,...}  uncaught by
  (D-01/D-05)                            (D-02, unchanged) the policy)
                                                                │
                                                                ▼
                                                          if connection
                                                          attempt itself
                                                          fails (before
                                                          first chunk):
                                                          catch → SSE
                                                          error event +
                                                          res.end() —
                                                          no retry after
                                                          first token sent
```

### Recommended Project Structure
```
backend/src/resilience/
├── resilience.module.ts        # @Global() module — provides ResilienceService
├── resilience.service.ts       # OnModuleInit: builds + caches one policy per vendor
├── resilience.types.ts         # VendorName union, PolicyConfig interface
└── __tests__/
    └── resilience.service.spec.ts
```
(Sits alongside existing top-level `backend/src/redis/`, `backend/src/prisma/` singleton-service modules — same precedent, same `OnModuleInit` lifecycle pattern already used in `redis.service.ts:13` and `prisma.service.ts`.)

### Pattern 1: Building one cached policy instance per vendor (stateful breaker requirement)
**What:** cockatiel circuit breakers accumulate failure state in the JS object itself. A fresh `circuitBreaker(...)` call on every request creates a breaker that can never open, because its failure counter resets to zero every time.
**When to use:** Always, for any policy that includes `circuitBreaker()`.
**Example:**
```typescript
// Source: cockatiel readme.md (SamplingBreaker section) — "Ensure the same breaker instance
// is reused across requests." + this codebase's redis.service.ts:13 OnModuleInit precedent.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  wrap, retry, circuitBreaker, timeout, handleWhen,
  ConsecutiveBreaker, ExponentialBackoff, TimeoutStrategy,
  CircuitBreakerPolicy, IPolicy,
} from 'cockatiel';

type Vendor = 'paystack' | 'termiiAuth' | 'termiiDelivery' | 'anthropic' | 's3' | 'fcm';

interface VendorPolicy {
  execute: IPolicy['execute'];
  breaker: CircuitBreakerPolicy;
}

@Injectable()
export class ResilienceService implements OnModuleInit {
  private readonly logger = new Logger(ResilienceService.name);
  private policies = new Map<Vendor, VendorPolicy>();

  private readonly DEFAULTS: Record<Vendor, { timeoutMs: number; retryCount: number; failureThreshold: number; halfOpenAfterMs: number }> = {
    paystack:       { timeoutMs: 10_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 30_000 },
    termiiAuth:     { timeoutMs: 5_000,  retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
    termiiDelivery: { timeoutMs: 5_000,  retryCount: 1, failureThreshold: 5, halfOpenAfterMs: 30_000 },
    anthropic:      { timeoutMs: 8_000,  retryCount: 0, failureThreshold: 3, halfOpenAfterMs: 30_000 }, // 0: SDK already retries internally, see Pitfall 3
    s3:             { timeoutMs: 15_000, retryCount: 2, failureThreshold: 5, halfOpenAfterMs: 20_000 },
    fcm:            { timeoutMs: 5_000,  retryCount: 1, failureThreshold: 8, halfOpenAfterMs: 20_000 },
  };

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    for (const vendor of Object.keys(this.DEFAULTS) as Vendor[]) {
      const cfg = await this.readConfig(vendor);

      const breaker = circuitBreaker(handleWhen(isTransientError), {
        halfOpenAfter: cfg.halfOpenAfterMs,
        breaker: new ConsecutiveBreaker(cfg.failureThreshold),
      });

      breaker.onBreak((reason) => this.onBreak(vendor, reason));
      breaker.onReset(() => this.onReset(vendor));
      breaker.onHalfOpen(() => this.onHalfOpen(vendor));

      const composed = wrap(
        breaker,
        timeout(cfg.timeoutMs, TimeoutStrategy.Aggressive),
        retry(handleWhen(isTransientError), {
          maxAttempts: cfg.retryCount, // cockatiel maxAttempts = RETRIES after the first call; total calls = 1 + retryCount
          backoff: new ExponentialBackoff({ initialDelay: 200, maxDelay: 3_000 }),
        }),
      );

      this.policies.set(vendor, { execute: composed.execute.bind(composed), breaker });
      this.logger.log(`Resilience policy ready for ${vendor}: timeout=${cfg.timeoutMs}ms retries=${cfg.retryCount} breakerThreshold=${cfg.failureThreshold}`);
    }
  }

  /** Callers: `await this.resilience.execute('paystack', () => axios.post(...))` */
  execute<T>(vendor: Vendor, fn: (context: { signal: AbortSignal }) => PromiseLike<T>): Promise<T> {
    const policy = this.policies.get(vendor);
    if (!policy) throw new Error(`No resilience policy registered for vendor: ${vendor}`);
    return policy.execute(fn);
  }

  private async readConfig(vendor: Vendor) {
    const defaults = this.DEFAULTS[vendor];
    const keys = {
      timeoutMs: `resilience.${vendor}.timeout_ms`,
      retryCount: `resilience.${vendor}.retry_count`,
      failureThreshold: `resilience.${vendor}.breaker_failure_threshold`,
      halfOpenAfterMs: `resilience.${vendor}.half_open_after_ms`,
    };
    const rows = await this.prisma.platformConfig.findMany({
      where: { key: { in: Object.values(keys) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      timeoutMs: Number(byKey.get(keys.timeoutMs) ?? defaults.timeoutMs),
      retryCount: Number(byKey.get(keys.retryCount) ?? defaults.retryCount),
      failureThreshold: Number(byKey.get(keys.failureThreshold) ?? defaults.failureThreshold),
      halfOpenAfterMs: Number(byKey.get(keys.halfOpenAfterMs) ?? defaults.halfOpenAfterMs),
    };
  }

  // onBreak/onReset/onHalfOpen implementations — see Pattern 3 below.
}

function isTransientError(err: unknown): boolean {
  // Business/validation 4xx errors must NOT open the circuit — see Pitfall 4.
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  return true; // network-level errors (ECONNREFUSED, ETIMEDOUT, DNS failures) have no `.response`
}
```
This is a **derived pattern**, not a copy-paste from cockatiel's docs — cockatiel shows individual `wrap()` compositions but never a NestJS multi-vendor registry. `[ASSUMED]` — confidence: this composes documented primitives correctly, but the exact `ResilienceService.execute(vendor, fn)` facade shape is an implementation choice, not something verified against a canonical example.

### Pattern 2: Reading PlatformConfig thresholds once (not per-call), with hardcoded defaults
**What:** Existing PlatformConfig reads in this codebase (`marketplace.service.ts:187`, `transport.service.ts:242`) re-query the DB on every call because the value itself is stateless (a fee percentage can be read fresh each time with no correctness cost). Resilience thresholds are different: they configure a **stateful** policy object built once. Re-reading them per-call would be wasted work at best and, worse, would tempt someone into rebuilding the policy (breaking Pattern 1) per-call.
**When to use:** `ResilienceService.onModuleInit()`, once per vendor, at process startup.
**Example:** See `readConfig()` in Pattern 1. Falls back to a hardcoded default exactly like `feeConfig ? Number(feeConfig.value) : 0.10` in `marketplace.service.ts:188` — meaning **no seed migration is required**; the first deploy runs safely on hardcoded defaults, and an ops/admin write to `PlatformConfig` takes effect on the next process restart/redeploy (matches this phase's discretion note — ad-hoc-with-defaults over a seed script).

### Pattern 3: Wiring cockatiel state-transition events to OpenTelemetry + Sentry (net-new — D-10)
**What:** No manual tracer exists anywhere in this codebase yet. This phase introduces the first `getTracer()`/`startSpan()` call sites.
**When to use:** Inside `onBreak`/`onReset`/`onHalfOpen` handlers on each vendor's `CircuitBreakerPolicy`.
**Example:**
```typescript
// Source: OpenTelemetry JS manual instrumentation docs
// (https://opentelemetry.io/docs/languages/js/instrumentation/#acquiring-a-tracer)
// + Sentry captureMessage API (https://github.com/getsentry/sentry-javascript)
import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as Sentry from '@sentry/nestjs';

const tracer = trace.getTracer('iseyaa-resilience'); // call getTracer() at use-time, not module load (OTel docs recommendation)

private onBreak(vendor: Vendor, reason: { error?: unknown; value?: unknown; isolated?: boolean }) {
  const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
    attributes: {
      'resilience.vendor': vendor,
      'resilience.breaker.state': 'open',
      'resilience.breaker.reason': reason.isolated ? 'isolated' : reason.error ? String((reason.error as Error)?.message ?? reason.error) : 'bad_result',
    },
  });
  span.setStatus({ code: SpanStatusCode.ERROR, message: `${vendor} circuit breaker opened` });
  span.end(); // short-lived "event" span — state transitions are instantaneous, not long-running operations

  this.logger.error(`Circuit breaker OPEN for ${vendor}`, reason.error);
  Sentry.captureMessage(`Circuit breaker opened: ${vendor}`, {
    level: 'error',
    tags: { vendor, 'resilience.event': 'circuit_open' },
  }); // D-09: circuit-open is alert-worthy, captured explicitly (no global exception filter exists per D-11)
}

private onReset(vendor: Vendor) {
  const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
    attributes: { 'resilience.vendor': vendor, 'resilience.breaker.state': 'closed' },
  });
  span.end();
  this.logger.log(`Circuit breaker CLOSED (recovered) for ${vendor}`);
}

private onHalfOpen(vendor: Vendor) {
  const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
    attributes: { 'resilience.vendor': vendor, 'resilience.breaker.state': 'half_open' },
  });
  span.end();
  this.logger.warn(`Circuit breaker HALF-OPEN (testing recovery) for ${vendor}`);
}
```
Each vendor-call failure (not just breaker transitions) should also get a lightweight span or at minimum a structured `logger.error()` call — auto-instrumentation (`getNodeAutoInstrumentations()` in `instrumentation.ts`) already correlates `Logger` output with the active trace context for HTTP-instrumented libraries (axios is auto-instrumented by `@opentelemetry/auto-instrumentations-node`), so per-failure spans are most valuable specifically for the state-transition moments and for the two `fetch()`-based Termii calls (fetch is not necessarily covered by the same auto-instrumentation package as axios — verify in Wave 0).

### Pattern 4: SSE streaming — retry only the connection, never mid-stream (discretion note, confirmed feasible)
**What:** `cockatiel`'s `execute(fn)` retry boundary is exactly the promise returned by `fn`. The Anthropic SDK's `anthropic.messages.stream(...)` call and the subsequent `for await (const chunk of stream)` loop are two separate steps in the current code (`ai.service.ts:273-286`). Wrapping only the first step in `policy.execute()` means retries can only occur if the connection itself fails to establish (rejects) — the `for await` loop runs outside the policy, so any mid-stream error surfaces as an ordinary thrown exception, uncaught by cockatiel, exactly matching the "retry only initial connection" requirement.
**When to use:** `AiService.streamChatWithTools()`, `AiService.streamItinerary()`.
**Example:**
```typescript
// Pattern derived from cockatiel's execute(fn) semantics (readme.md) — NOT an officially
// documented cockatiel streaming example; cockatiel has no built-in "stream mode."
// Anthropic MessageStream connect/error events: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md
for (let turn = 0; turn < 3; turn++) {
  let stream: MessageStream;
  try {
    stream = await this.resilience.execute('anthropic', () =>
      this.anthropic.messages.stream({ model: '...', max_tokens: 1024, system: systemPrompt, tools: this.TOOLS, messages: messageHistory }),
    );
  } catch (err) {
    // Circuit open / retries exhausted / timeout on the CONNECTION attempt only.
    this.logger.error('AI stream connection failed', err);
    res.write(`data: ${JSON.stringify({ error: 'AI service temporarily unavailable' })}\n\n`);
    res.end();
    return; // D-01: fail loud — no silent hang, no further retry once we return
  }

  // Everything below runs OUTSIDE policy.execute() — no retry after this point,
  // matching "no retry once the first token has been emitted."
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      accumulatedText += chunk.delta.text;
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }
  // ...rest of existing tool-use loop unchanged
}
```
**Important caveat (verified from Anthropic SDK source):** `anthropic.messages.stream()` itself is backed by an HTTP client that **already retries internally** (`shouldRetry()` in the SDK's `client.ts` retries on 408/409/429/5xx, default `maxRetries: 2`) before the promise cockatiel sees ever rejects. If the `Anthropic` client is constructed with default options, cockatiel's retry layer and the SDK's internal retry layer compound (each SDK-level retry attempt already includes its own backoff, and cockatiel would retry on top of that entire already-retried sequence). **Recommendation:** construct the client with `new Anthropic({ apiKey, maxRetries: 0 })` so cockatiel is the single source of retry truth, OR keep the SDK's default retries and set `resilience.anthropic.retry_count = 0` (cockatiel handles circuit-breaking + timeout only, SDK handles retry) — either is valid, but **do not run both retry layers with nonzero counts simultaneously.** `[CITED: anthropic-sdk-typescript client.ts shouldRetry()]`

### Pattern 5: `fallback()` — the one primitive genuinely reserved for FCM (D-02)
**What:** `fallback(policy, valueOrFactory)` returns `valueOrFactory` when the wrapped call fails, matching FCM's existing "never throw, return a result object" contract precisely.
**When to use:** `NotificationsService.sendPush()` only.
**Example:**
```typescript
// Source: cockatiel readme.md fallback() section
import { fallback, wrap, timeout, retry, circuitBreaker, handleWhen, TimeoutStrategy } from 'cockatiel';

// Built once in ResilienceService.onModuleInit(), same as other vendors (Pattern 1) —
// fallback slots in as the outermost layer since it must catch everything below it.
const fcmPolicy = wrap(
  fallback(handleWhen(() => true), () => ({ sent: false, reason: 'send_failed' as const })),
  breaker,
  timeout(cfg.timeoutMs, TimeoutStrategy.Aggressive),
  retry(handleWhen(isTransientError), { maxAttempts: cfg.retryCount, backoff: new ExponentialBackoff() }),
);

// sendPush() becomes:
async sendPush(userId: string, title: string, body: string, data?: Record<string, string>) {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  const token = (user?.metadata as any)?.fcmToken;
  if (!token) return { sent: false, reason: 'no_token' as const };
  if (!this.fcmAuthClient || !this.fcmProjectId) return { sent: false, reason: 'not_configured' as const };

  return this.resilience.execute('fcm', async () => {
    const accessToken = (await this.fcmAuthClient!.getAccessToken())?.token;
    if (!accessToken) return { sent: false, reason: 'auth_failed' as const };
    await axios.post(`https://fcm.googleapis.com/v1/projects/${this.fcmProjectId}/messages:send`, { message: { token, notification: { title, body }, ...(data && { data }) } }, { headers: { Authorization: `Bearer ${accessToken}` } });
    return { sent: true };
  });
  // fallback() catches any thrown error (network, circuit-open, timeout) and returns
  // { sent: false, reason: 'send_failed' } — identical shape to today's catch block,
  // but now observable via onBreak/onFailure events (D-02: "wrap ... for observability
  // and consistency, but preserve its swallow-and-report contract").
}
```
Note this changes `sendPush`'s internal try/catch into cockatiel's `fallback()` — behaviorally equivalent (same return shape on failure) but now instrumented. Either approach (keep the existing try/catch and just wrap the inner call with breaker+timeout+retry only, or replace the try/catch with `fallback()`) satisfies D-02; using `fallback()` is recommended because it makes the fallback an explicit, observable event, `onFailure`.

### Anti-Patterns to Avoid
- **Rebuilding a policy object per request:** Destroys circuit-breaker state accumulation — see Pattern 1. This is the single most likely mistake given the codebase's existing "read PlatformConfig fresh every call" precedent for *stateless* values (fare/fee percentages) — resilience thresholds are not stateless in the same way.
- **Using `handleAll` (catch-everything) for retry/circuit-breaker on `resolveBvn`:** `resolveBvn()` throws `BadRequestException` on a legitimately invalid BVN (`paystack.service.ts:83`) — a user-input error, not a vendor outage signal. `handleAll` would retry it and eventually count it toward opening the Paystack circuit, incorrectly degrading the *whole* Paystack integration because of unrelated bad user input. Use `handleWhen(isTransientError)` (Pattern 1) to filter to network-level and 5xx/408/429 errors only.
- **Using cockatiel `fallback()` to implement D-01's "throw ServiceUnavailableException":** `fallback()`'s contract is "return a value," not "throw a different error." Forcing this by throwing from inside the fallback factory function works mechanically (`() => Promise<R> | R` factories are just functions) but is undocumented, unconventional, and fights the primitive's intent — a plain `try/catch` around the non-fallback composed policy is clearer and is what this research recommends (see Summary + Pattern 1).
- **Trying to emit custom OTel *metrics* (counters/histograms) for state transitions:** `instrumentation.ts` only configures a `traceExporter` (`OTLPTraceExporter`) — there is no `MeterProvider`/metric exporter wired up anywhere in this codebase. A `meter.createCounter()` call would silently produce a no-op or throw, depending on SDK defaults — see Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Circuit breaker state machine (closed/open/half-open transitions, failure counting) | A custom class tracking consecutive failures + a timestamp for reset | `cockatiel`'s `circuitBreaker()` + `ConsecutiveBreaker`/`SamplingBreaker` | Correctly handles half-open probe concurrency (only one probe request allowed through at a time), refcounted manual isolation, and serializable state (`toJSON()`) — a hand-rolled version reliably misses the half-open concurrency edge case |
| Exponential backoff with jitter | `Math.pow(2, attempt) * base + Math.random() * jitter` inline in each service | `cockatiel`'s `ExponentialBackoff` (decorrelated jitter by default) | Decorrelated jitter is a specific, studied algorithm (AWS architecture blog origin) that avoids thundering-herd retry synchronization across concurrent requests — trivial to get subtly wrong by hand |
| Timeout-with-cancellation for axios/fetch calls | `Promise.race([axios.post(...), sleep(ms).then(() => { throw ... })])` (leaves the underlying HTTP request still in flight, wasting a connection) | `cockatiel`'s `timeout()` with `TimeoutStrategy.Aggressive`, passing the provided `AbortSignal` into the request (`axios` supports `signal`, `fetch` supports `signal` natively) | `Promise.race` timeouts don't actually cancel the underlying request — cockatiel's `AbortSignal` propagation does, freeing the connection/socket immediately |

**Key insight:** This entire phase is buying a well-tested implementation of edge cases (half-open probe concurrency, jitter distribution, true request cancellation) that are individually simple to get *approximately* right and consistently wrong in the specific ways that matter under real vendor-outage load (thundering herd on recovery, connection pool exhaustion from uncancelled timed-out requests).

## Common Pitfalls

### Pitfall 1: Installing `cockatiel@latest` pulls in v4.0.0, which breaks the build
**What goes wrong:** `npm install cockatiel` (no version pin) resolves to `4.0.0`. This version requires Node ≥22 (`package.json engines`) and ships `"type": "module"` with no CommonJS entry point.
**Why it happens:** npm's `latest` dist-tag was moved to 4.0.0 on the same day 3.2.1 (the last 3.x patch) was published — they are two parallel major-version lines, not a linear "old vs new" progression, and npm's default install behavior always takes `latest`.
**How to avoid:** Pin `cockatiel@^3.2.1` explicitly in `package.json`. `[VERIFIED: npm registry — cockatiel@4.0.0 engines:{node:'>=22'}, type:'module'; cockatiel@3.2.1 engines:{node:'>=16'}, main:'dist/index.js' (CJS), module:'dist/esm/index.js']`
**Warning signs:** `require() of ES Module ... not supported` at boot, or a `tsc`/`ts-node` "Cannot find module 'cockatiel'" resolution error under the `commonjs` module target (`backend/tsconfig.json:3`).

### Pitfall 2: This project's own Node-version signals are internally inconsistent
**What goes wrong:** `CLAUDE.md` states "Node.js 20 LTS ... no runtime changes." `backend/Dockerfile.dev` uses `node:20-alpine`. But root `package.json` `engines.node` requires `>=22.0.0`, and `backend/Dockerfile` (production) uses `node:22-alpine`.
**Why it happens:** Pre-existing drift, unrelated to this phase — likely a partial Node version bump that updated the production Dockerfile and root `engines` field but not `CLAUDE.md` or the dev Dockerfile.
**How to avoid:** This does not block cockatiel selection — `cockatiel@3.2.1` (`engines: node>=16`) works correctly on both Node 20 and Node 22, so the ambiguity is inert for this phase. Flag it for the planner/user as a pre-existing inconsistency worth a separate fix, but do not attempt to resolve it inside this phase's scope (CLAUDE.md: "no runtime changes").
**Warning signs:** None specific to this phase — noted for awareness only.

### Pitfall 3: Anthropic SDK's built-in retry logic compounds with cockatiel's retry
**What goes wrong:** `@anthropic-ai/sdk`'s HTTP client retries automatically (default `maxRetries: 2`) on 408/409/429/5xx *before* the promise cockatiel wraps ever settles. If cockatiel's `resilience.anthropic.retry_count` is also nonzero, a single logical "failure" can trigger up to `(1 + SDK maxRetries) * (1 + cockatiel maxAttempts)` actual HTTP calls, with two independent, uncoordinated backoff schedules.
**Why it happens:** Cockatiel wraps the *entire* SDK call as a black box — it has no visibility into retries the SDK performs internally before returning/rejecting.
**How to avoid:** Either construct the `Anthropic` client with `maxRetries: 0` and let cockatiel own all retry behavior, or set `resilience.anthropic.retry_count = 0` in `PlatformConfig` and let the SDK's built-in retry handle transient errors while cockatiel handles circuit-breaking + timeout only. Document the choice in code (this research recommends the former — `maxRetries: 0` on the client — for consistency with how every other vendor's retry count is fully cockatiel-owned, and to make `resilience.anthropic.retry_count` in `PlatformConfig` mean the same thing across all 5 vendors).
**Warning signs:** Anthropic API call latency during a real outage is much higher than `resilience.anthropic.timeout_ms * (1 + retry_count)` would predict; Anthropic dashboard shows more requests than the app's own retry-count config would suggest. `[CITED: anthropic-sdk-typescript src/client.ts shouldRetry()]`

### Pitfall 4: `handleAll` opens the circuit on business-logic errors, not just vendor outages
**What goes wrong:** `circuitBreaker(handleAll, {...})` treats every thrown error — including a legitimate 400 for an invalid BVN, or a Paystack "duplicate transaction reference" 4xx — as a breaker-eligible failure. A burst of unrelated bad user input (e.g., a batch of users submitting malformed BVNs) can trip the Paystack circuit open and start rejecting *valid* payment requests too.
**Why it happens:** `handleAll` is the simplest cockatiel filter and appears in most of cockatiel's own README examples — it's the "just get it working" default, but production usage requires filtering.
**How to avoid:** Use `handleWhen(isTransientError)` (Pattern 1) — only network-level errors (no `.response` — `ECONNREFUSED`/`ETIMEDOUT`/DNS failure) and specific status codes (`408`, `429`, `5xx`) count toward retry/breaker accounting. 4xx business-logic errors propagate immediately without retry and without counting toward the breaker.
**Warning signs:** Circuit opens during periods of normal vendor availability but elevated invalid-input rate; Sentry `circuit_open` alerts correlate with a spike in 400-class errors in the same window, not with actual vendor downtime/latency.

### Pitfall 5: No metrics exporter exists — state transitions must be spans/logs, not counters
**What goes wrong:** `instrumentation.ts` configures only `traceExporter: new OTLPTraceExporter(...)`. There is no `metricReader`/`MeterProvider` wired into the `NodeSDK` constructor. Code that calls `metrics.getMeter(...).createCounter(...)` will create an in-process counter object that has nowhere to export to — Grafana Cloud will never receive it, and there will be no error to indicate the miss (metrics API calls without a configured exporter are silent no-ops, not exceptions).
**Why it happens:** D-10 already flags that no manual tracer exists; it's a short step from there to assume the natural instrument for a "count of breaker opens" is a metric counter, which silently fails to surface anywhere.
**How to avoid:** Use manual spans (Pattern 3) — `traceExporter` is the only configured OTel sink — plus structured `Logger` calls (already correlated to trace context by the codebase's existing logging conventions) and explicit `Sentry.captureMessage` calls (D-09). If metric-style dashboards (e.g., "breaker open count over time" as a Grafana panel) are wanted later, that requires adding a `PeriodicExportingMetricReader` + OTLP metric exporter to `instrumentation.ts` — out of this phase's scope per the success criteria, which specify "spans/log events," not metrics.
**Warning signs:** A `createCounter`/`createHistogram` call compiles and runs with no errors, but the corresponding Grafana panel never shows data.

### Pitfall 6: Retrying `refundCharge()` is riskier than retrying `initiatePayment()` — filter matters more here
**What goes wrong:** `initiatePayment()` retried with the same `reference` after a genuine network failure is safe — if the first attempt never reached Paystack, the retry is a normal first attempt; if it did reach Paystack, the retry gets a "Duplicate Transaction Reference" 4xx (annoying but not financially dangerous, since `initiatePayment` only returns a checkout URL, it doesn't move money). `refundCharge()` is different: if the first refund request reached Paystack and succeeded, but the response was lost to a network failure before the backend saw `200 OK`, a naive retry-on-any-error could issue a second real refund.
**Why it happens:** Both calls look symmetric (both are `axios.post` inside a service method), but their idempotency-safety differs based on what Paystack does server-side, not on anything visible in this codebase.
**How to avoid:** `resolveBvn` (GET, naturally idempotent) and `initiatePayment` (POST, but `reference`-keyed and doesn't move money) are safe to retry on transient errors per Pitfall 4's filter. For `refundCharge`, restrict retry to errors that are unambiguously *pre-flight* (connection refused, DNS failure, timeout with `TimeoutStrategy.Aggressive` before any response headers arrive) — do not retry on any error where `err.response` is present (meaning Paystack's server did respond, so the request state is now ambiguous, not verifiably "never happened"). This is a stricter subset of `isTransientError` from Pattern 1 — for `refundCharge` specifically, consider `resilience.paystack.refund_retry_count` as a distinct, lower-or-zero value from `resilience.paystack.retry_count` if D-07's "own full set of keys" is read strictly (refunds may warrant their own sub-key or simply `retry_count: 0` applied uniformly to the whole Paystack policy). `[ASSUMED]` — Paystack's actual server-side idempotency guarantee for `/transaction/refund` on retried identical requests within a short window is not documented publicly; this recommendation is a conservative safety margin, not a confirmed Paystack API guarantee.
**Warning signs:** A support/finance report of a refund appearing twice for the same order correlated with a logged retry event for that reference.

## Code Examples

### Wrapping S3 upload (centralized service, satisfies "every call site" for 6 callers via 1 wrap point)
```typescript
// backend/src/common/services/s3.service.ts — modified upload()
async upload(key: string, body: Buffer, contentType: string): Promise<string> {
  if (this.mode === 'unconfigured') {
    throw new Error('S3 not configured — set AWS_ACCESS_KEY_ID + AWS_S3_BUCKET (or R2_* equivalents) in env');
  }
  try {
    await this.resilience.execute('s3', () =>
      this.s3.send(new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
        ...(this.mode === 'aws' && { ACL: 'public-read' as const }),
      })),
    );
  } catch (err: any) {
    this.logger.error(`S3 upload failed for key ${key}`, err.message);
    throw new ServiceUnavailableException('Storage is temporarily unavailable, please try again shortly'); // D-05
  }
  // ...unchanged URL-building logic below
}
```

### Wrapping Termii (auth.service.ts leg — independent from delivery.service.ts leg per D-08)
```typescript
// backend/src/modules/auth/auth.service.ts — sendTermii(), Termii leg only; Twilio/stub fallback unchanged
try {
  const response = await this.resilience.execute('termiiAuth', () =>
    fetch('https://v3.api.termii.com/api/sms/send', { method: 'POST', headers: {...}, body: JSON.stringify({...}) }),
  );
  if (response.ok) {
    this.logger.log(`OTP sent via Termii (${channel}) to ${phone}`);
    return;
  }
  this.logger.error(`Termii error: ${response.status} — falling back to Twilio`);
} catch (err) {
  // BrokenCircuitError / TaskCancelledError / exhausted retry all land here —
  // existing behavior already falls through to Twilio, so NO new throw is added:
  // D-03 says Termii keeps falling through its existing chain, not fail loud like D-01.
  this.logger.error('Termii request failed (or circuit open) — falling back to Twilio', err);
}
// existing Twilio fallback code, unchanged
```
This shows the D-01-vs-D-03 distinction concretely: Paystack/Anthropic/S3 throw `ServiceUnavailableException` when the policy's error escapes; Termii's existing `catch { fall through }` shape is preserved as-is, and the circuit breaker just makes that fallthrough happen faster (fail-fast on subsequent calls once the circuit is open, instead of waiting the full timeout+retries again).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| No resilience wrapping — bare `axios`/`fetch` calls with ad-hoc per-service try/catch | `cockatiel`-composed circuit-breaker + retry + timeout policy per vendor, centrally observable | This phase | A Paystack outage no longer risks cascading into unrelated request-handler slowness (unbounded retries/hangs on one endpoint starving the Node.js event loop's connection pool for everything else) |
| `cockatiel@2.x`/early `3.x` | `cockatiel@3.2.1` is the last CJS-compatible release; `4.0.0` (2026-05-26) moved to Node ≥22 + ESM-only | 2026-05-26 | Anyone following generic "use cockatiel" advice without checking `engines`/`type` will silently install an incompatible major version |

**Deprecated/outdated:** None specific to this domain beyond the version-pinning note above — cockatiel 3.x is actively maintained (patch releases continued after 4.0.0's split), not a legacy line being phased out.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact `ResilienceService.execute(vendor, fn)` facade shape (Map-based registry, `OnModuleInit` construction) is the right NestJS-idiomatic design | Architecture Patterns, Pattern 1 | Low — this is a reasoned composition of documented cockatiel primitives + an established codebase precedent (`OnModuleInit` singleton services), not a guess about library behavior. Alternative designs (e.g., one `@Injectable()` provider per vendor via `useFactory`) would also work; the planner can adjust the facade shape without invalidating the underlying cockatiel usage |
| A2 | Recommending `resilience.paystack.refund_retry_count` as a distinct, stricter key from `resilience.paystack.retry_count` for `refundCharge()`'s retry safety | Common Pitfalls, Pitfall 6 | Medium — if the planner instead applies one uniform `retry_count` to all three Paystack methods, and that value is nonzero, there is a narrow window where a lost-response-but-server-succeeded refund could be retried. Mitigate by filtering retry to pre-response errors only (network/timeout), regardless of whether a separate key is introduced |
| A3 | Paystack's `/transaction/refund` endpoint's server-side behavior on a retried identical request within a short window (idempotent no-op vs. genuine second refund) is not confirmed via official docs — the "duplicate reference" behavior is documented for `/transaction/initialize` and transfers, not explicitly for refunds | Common Pitfalls, Pitfall 6 | Medium — could over- or under-estimate the actual risk of retrying refunds; the conservative mitigation (restrict refund retry to pre-response errors) is safe regardless of which way Paystack's actual behavior resolves |
| A4 | `fetch()`-based Termii calls (as opposed to `axios`-based Paystack/S3/FCM calls) are not automatically covered by `@opentelemetry/auto-instrumentations-node`'s HTTP instrumentation for span-correlation purposes | Architecture Patterns, Pattern 3 | Low — worth a Wave 0 verification step (check Grafana for existing Termii-related spans/traces), but doesn't change the resilience-wrapping implementation itself, only whether an extra manual span is needed for Termii call sites specifically |

## Open Questions

1. **Exact ConsecutiveBreaker vs SamplingBreaker choice per vendor**
   - What we know: cockatiel supports both; `ConsecutiveBreaker(n)` breaks after `n` consecutive failures (simple, works at any traffic volume); `SamplingBreaker({threshold, duration})` breaks on a failure percentage within a rolling window (needs meaningful request volume to be statistically stable).
   - What's unclear: This project's actual per-vendor call volume in production (e.g., how many Paystack top-ups/minute at peak) wasn't measured in this research session.
   - Recommendation: Default to `ConsecutiveBreaker` for all 5 vendors (Pattern 1's example uses this) — it degrades gracefully at low volume, which is the safer default for a platform whose real production traffic profile wasn't verified here. If a specific vendor (most likely Paystack at peak) later proves to have high enough steady volume that percentage-based breaking would be more accurate, that's a config-only change (swap the breaker constructor), not an architecture change.

2. **Whether `resilience.<vendor>.retry_count` should differ from the SDK/HTTP-client's own retry settings for vendors other than Anthropic**
   - What we know: Anthropic's SDK has documented, verified internal retry logic (Pitfall 3). Paystack calls go through raw `axios` (no built-in retry by default). Termii uses raw `fetch` (no built-in retry). FCM uses raw `axios` (no built-in retry).
   - What's unclear: Whether `axios`'s underlying Node `http`/`https` agent or any interceptor elsewhere in the codebase adds retry behavior — this research did not find one (`paystack.service.ts`, `notifications.service.ts` show no axios interceptor setup), so it's reasonably assumed the compounding-retry risk is unique to Anthropic.
   - Recommendation: Confirm during Wave 0 that no global axios interceptor exists (`grep -r "axios.interceptors"` across `backend/src`) before finalizing that only Anthropic needs the `maxRetries: 0` treatment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| npm registry access (to install `cockatiel`, `@opentelemetry/api`) | RESIL-01 | ✓ | — | — |
| PostgreSQL (`PlatformConfig` table) | RESIL-01 (D-06 threshold storage) | ✓ (already in use by 9+ modules) | Postgres 16 (per CLAUDE.md) | — |
| Grafana Cloud OTLP endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`) | RESIL-02 | Not verified this session — `instrumentation.ts` reads it from env, already wired for Phase 10-era auto-instrumentation | — | If unset, `OTLPTraceExporter` fails silently/logs a warning per its own defaults — spans would be created locally but never exported; this is a pre-existing config concern, not new to this phase |
| Sentry DSN (`SENTRY_DSN`) | RESIL-02 (D-09) | Not verified this session — `main.ts:12` reads it from env | — | If unset, `Sentry.init({dsn: undefined, ...})` runs in a no-op mode (Sentry SDK's documented behavior) — `Sentry.captureMessage` calls become inert, not errors |

**Missing dependencies with no fallback:** None identified — this phase adds no new external service dependency beyond the 5 vendors already integrated.

**Missing dependencies with fallback:** `OTEL_EXPORTER_OTLP_ENDPOINT`/`SENTRY_DSN` absence (unverified either way this session) degrades gracefully to "spans/alerts not exported" without breaking the resilience-wrapping functionality itself (RESIL-01 still works even if RESIL-02's downstream sinks are unconfigured in a given environment).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.x + ts-jest 29.1.x |
| Config file | `backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`) |
| Quick run command | `cd backend && npx jest src/resilience --silent` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| RESIL-01 | `ResilienceService` builds one cached policy per vendor at `onModuleInit`, reading PlatformConfig with hardcoded fallback | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -x` | ❌ Wave 0 |
| RESIL-01 | Circuit breaker opens after N consecutive transient failures, stays open (fails fast, no more calls to the mock vendor fn) until `halfOpenAfter` elapses | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -t "circuit breaker" -x` | ❌ Wave 0 |
| RESIL-01 | `PaystackService.initiatePayment` throws `ServiceUnavailableException` when the resilience policy's error escapes (simulated forced failure) | unit | `npx jest src/common/services/__tests__/paystack.service.spec.ts -x` | ❌ Wave 0 (no `paystack.service.spec.ts` currently exists) |
| RESIL-01 | `NotificationsService.sendPush` still returns `{sent:false, reason:'send_failed'}` (not a thrown error) when FCM is circuit-open | unit | `npx jest src/modules/notifications/__tests__/notifications.service.spec.ts -x` | ❌ Wave 0 (no test file currently exists for this service) |
| RESIL-01 | `AiService.streamChatWithTools`/`streamItinerary` retry only the connection call, never mid-stream, and `getLgaIntelligence` now has error handling | unit | `npx jest src/modules/ai/__tests__/ai.service.spec.ts -x` | ✅ (existing file — needs new test cases added, not a new file) |
| RESIL-01 | Termii legs in `auth.service.ts`/`delivery.service.ts` fall through to their existing fallback chains unchanged when Termii's circuit is open | unit | `npx jest src/modules/auth/__tests__/auth.service.spec.ts -x` | ✅ (existing — `delivery.service.ts` has no `.spec.ts` yet, ❌ Wave 0 for that half) |
| RESIL-02 | `onBreak` handler calls `Sentry.captureMessage` and creates an OTel span with `resilience.breaker.state: 'open'` attribute | unit | `npx jest src/resilience/__tests__/resilience.service.spec.ts -t "onBreak" -x` | ❌ Wave 0 |
| RESIL-02 (success criterion 2) | Simulated Paystack outage → wallet top-up request fails with 503 while `GET /api/v1/events` continues responding | integration/e2e | `cd backend && npx jest --config test/jest-e2e.json --testPathPattern=resilience` | ❌ Wave 0 — no e2e resilience spec exists; closest precedent is `test/jest-e2e.json`'s existing `wallet-invariant|kyc-encryption|e2e-tour-booking` pattern (`package.json:18`) |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest src/resilience --silent` (or the specific vendor service's spec file being touched)
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual/scripted forced-outage smoke test matching success criterion 2 (force a Paystack timeout via a mocked/intercepted axios call, confirm `GET /api/v1/events` still responds normally in the same test run)

### Wave 0 Gaps
- [ ] `backend/src/resilience/resilience.module.ts` + `resilience.service.ts` + `resilience.types.ts` — net-new module, no existing file to extend
- [ ] `backend/src/resilience/__tests__/resilience.service.spec.ts` — unit tests for policy construction, PlatformConfig fallback, event wiring (mock `PrismaService`, mock `@sentry/nestjs`, mock `@opentelemetry/api`'s `trace.getTracer`)
- [ ] `backend/src/common/services/__tests__/paystack.service.spec.ts` — does not exist yet; needed to test the new `ServiceUnavailableException` throw path
- [ ] `backend/src/modules/notifications/__tests__/notifications.service.spec.ts` — does not exist yet; needed to verify the swallow-and-report contract survives wrapping (D-02)
- [ ] `backend/src/modules/delivery/__tests__/delivery.service.spec.ts` (or at least the `sendTermiiDeliveryOtp` slice) — does not exist yet
- [ ] Package install: `npm install cockatiel@^3.2.1 @opentelemetry/api@^1.9.1 --workspace=backend`
- [ ] A forced-outage e2e/integration spec matching success criterion 2 exactly (Paystack timeout injection + concurrent unrelated-endpoint health check) — no existing precedent test does this kind of dual-assertion (one endpoint fails, another stays healthy) in this codebase; closest analog is the `wallet-invariant` e2e spec structure

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V1 Architecture | yes | Fail-secure default: on ambiguous vendor failure, the system denies the operation (throws 503) rather than silently proceeding in a degraded-but-unflagged state (D-01) — this IS the ASVS V1 "fail securely" principle applied to availability, not just auth |
| V7 Error Handling & Logging | yes | D-05's single generic `ServiceUnavailableException` message deliberately avoids leaking vendor-specific internals (stack traces, raw Paystack/Anthropic error bodies) to the client — only the vendor *name* is disclosed ("Paystack is temporarily unavailable"), not response payloads or internal error codes. Verify no handler accidentally does `throw new ServiceUnavailableException(err.message)` where `err.message` could contain a raw upstream error body |
| V9 Communication | no (not newly applicable) | All 5 vendor calls already use HTTPS/TLS — this phase adds resilience wrapping around existing transport, not new transport |
| V5 Input Validation | no (not newly applicable) | This phase wraps outbound calls, not inbound request validation — no new user-controlled input surface is introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Vendor error message leakage into `ServiceUnavailableException` (e.g., accidentally including `err.response.data` in the thrown message) | Information Disclosure | Always construct the exception message from a static per-vendor string (D-05: "message string identifying which vendor failed"), never interpolate the raw upstream error body/stack into a client-visible message; log the full error server-side via `Logger.error` only |
| Retry amplification as an unintentional self-inflicted DoS against a struggling vendor (retrying aggressively into an already-degraded vendor makes their recovery harder, and can trip *their* rate limiting, worsening the outage for everyone) | Denial of Service | `ExponentialBackoff` with jitter (Pattern 1) + circuit breaker's fail-fast-once-open behavior (no calls at all while open, not just slower calls) — this is precisely what circuit breakers exist to prevent |
| Sentry/OTel payloads inadvertently including PII (e.g., a phone number in a Termii error log via `reason.error`) | Information Disclosure | Reuse this codebase's existing convention: Termii/auth logging already avoids logging BVN values (`paystack.service.ts:68` comment: "Never log the BVN value — only log errors") — apply the same discipline to `onBreak`/span attributes: log `vendor` and generic error class/message, not raw request payloads that might contain phone numbers or PII |

## Sources

### Primary (HIGH confidence)
- Context7 `/connor4312/cockatiel` — policy composition (`wrap`, `retry`, `circuitBreaker`, `timeout`, `fallback`), event API (`onBreak`, `onReset`, `onHalfOpen`, `onRetry`, `onGiveUp`, `onSuccess`, `onFailure`), error classes (`BrokenCircuitError`, `IsolatedCircuitError`, `TaskCancelledError`), `ConsecutiveBreaker`/`SamplingBreaker` constructors, `isolate()`, `toJSON()`/`initialState`
- Context7 `/anthropics/anthropic-sdk-typescript` — `MessageStream` events (`connect`, `error`, `abort`, `end`), `shouldRetry()`/retry status codes from `src/client.ts`
- Context7 `/open-telemetry/opentelemetry.io` — manual tracer acquisition (`getTracer`), `startSpan`/`startActiveSpan`, `recordException`/`setStatus`
- Context7 `/getsentry/sentry-javascript` — `captureException`/`captureMessage` signatures, `SentryGlobalFilter`/`APP_FILTER` registration pattern (confirms D-11's observation that this isn't registered)
- npm registry (`npm view`) — `cockatiel` version/engines/module-format for both `3.2.1` and `4.0.0`, `@opentelemetry/api` version and `@opentelemetry/sdk-node` peer-dependency range, `@sentry/nestjs` dependency tree
- Direct codebase reads: `backend/package.json`, `backend/tsconfig.json`, `backend/prisma/schema.prisma:649-660`, `backend/src/common/services/paystack.service.ts`, `backend/src/common/services/s3.service.ts`, `backend/src/modules/notifications/notifications.service.ts`, `backend/src/modules/ai/ai.service.ts`, `backend/src/modules/auth/auth.service.ts:280-333`, `backend/src/modules/delivery/delivery.service.ts:310-346`, `backend/src/modules/marketplace/marketplace.service.ts:186-188`, `backend/src/modules/transport/transport.service.ts:235-324`, `backend/src/common/common.module.ts`, `backend/src/redis/redis.service.ts`, `backend/src/instrumentation.ts`, `backend/src/main.ts`, `backend/jest.config.js`, `backend/src/common/services/__tests__/s3.service.spec.ts`, `backend/Dockerfile`, `backend/Dockerfile.dev`, root `package.json`

### Secondary (MEDIUM confidence)
- WebFetch of `https://raw.githubusercontent.com/connor4312/cockatiel/master/src/RetryPolicy.ts` — confirmed `maxAttempts` semantics (retries in addition to the first attempt, total calls = 1 + maxAttempts)
- WebSearch "Paystack transaction initialize API duplicate reference" + Context7 Paystack docs mirror (`/websites/pilot-direct-debit_...`) — duplicate-reference error behavior for `/transaction/initialize` and transfers; refund-specific idempotency behavior was NOT found documented (see Assumption A3)

### Tertiary (LOW confidence)
- WebSearch "cockatiel NestJS circuit breaker provider factory injectable pattern" — general community NestJS circuit-breaker patterns found (e.g., `nestjs-resilience`, `nest-circuit-break` npm packages), but none specifically demonstrate cockatiel + NestJS DI integration; this research's `ResilienceService` facade is therefore a first-principles design (flagged as A1), not a copy of a verified community pattern
- WebSearch "cockatiel circuit breaker streaming SSE" — no results addressing stream-specific retry semantics; Pattern 4 is derived from cockatiel's general `execute(fn)` API contract, not a documented streaming feature

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cockatiel version/module-format incompatibility (Pitfall 1) directly verified against the live npm registry, not assumed from training data
- Architecture: MEDIUM-HIGH — policy composition primitives (wrap/retry/circuitBreaker/timeout/fallback) are HIGH confidence (Context7-sourced); the specific `ResilienceModule`/`ResilienceService` facade shape and the SSE-connection-only retry pattern are reasoned designs (MEDIUM, flagged in Assumptions Log) since no canonical NestJS+cockatiel or cockatiel+SSE example exists anywhere found
- Pitfalls: HIGH — Anthropic SDK internal retry (Pitfall 3) and cockatiel version/module incompatibility (Pitfall 1) are both directly cited from source/registry, not inferred; the Paystack refund idempotency caution (Pitfall 6) is MEDIUM (A3) since Paystack's exact server-side dedup behavior for refunds specifically wasn't found in public docs

**Research date:** 2026-07-16
**Valid until:** ~30 days for the architectural patterns (stable primitives); re-verify `npm view cockatiel version`/`engines` before implementation if this research is consumed more than a few weeks later, since cockatiel 3.x could receive further patches or npm's `latest` tag dynamics could shift
