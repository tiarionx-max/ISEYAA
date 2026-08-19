import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  wrap,
  retry,
  circuitBreaker,
  timeout,
  handleWhen,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  CircuitBreakerPolicy,
  IPolicy,
} from 'cockatiel';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { Vendor, VendorThresholds, RESILIENCE_DEFAULTS } from './resilience.types';

interface VendorPolicy {
  execute: IPolicy['execute'];
  breaker: CircuitBreakerPolicy;
}

/**
 * @Global() single choke-point service every vendor-call-site plan in this phase depends
 * on. Builds exactly one cached cockatiel circuit-breaker + retry + timeout policy per
 * vendor at process startup (`onModuleInit`) — never rebuilds a policy per-call, since
 * cockatiel circuit breakers are stateful in-memory objects that must be reused across
 * requests (RESEARCH.md Pattern 1: rebuilding per-call silently makes the breaker inert).
 */
@Injectable()
export class ResilienceService implements OnModuleInit {
  private readonly logger = new Logger(ResilienceService.name);
  private policies = new Map<Vendor, VendorPolicy>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const vendors = Object.keys(RESILIENCE_DEFAULTS) as Vendor[];

    for (const vendor of vendors) {
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
        retry(handleWhen(isTransientError), {
          // CR-01 fix (11-REVIEW.md / 11-VERIFICATION.md): retry MUST be passed before
          // timeout in wrap(...) so timeout is the innermost policy, applied fresh to
          // EACH individual attempt — not once around the whole retry+backoff sequence.
          // cockatiel maxAttempts = retries AFTER the first call; total calls = 1 + retryCount.
          // flutterwaveRefund's retryCount: 0 naturally makes this a zero-attempt no-op —
          // no special-case code needed (RESEARCH.md Pitfall 6).
          maxAttempts: cfg.retryCount,
          backoff: new ExponentialBackoff({ initialDelay: 200, maxDelay: 3_000 }),
        }),
        timeout(cfg.timeoutMs, TimeoutStrategy.Aggressive),
      );

      this.policies.set(vendor, { execute: composed.execute.bind(composed), breaker });
      this.logger.log(
        `Resilience policy ready for ${vendor}: timeout=${cfg.timeoutMs}ms retries=${cfg.retryCount} breakerThreshold=${cfg.failureThreshold}`,
      );
    }
  }

  /** Callers: `await this.resilience.execute('flutterwave', () => axios.post(...))` */
  execute<T>(vendor: Vendor, fn: (context: { signal: AbortSignal }) => PromiseLike<T>): Promise<T> {
    const policy = this.policies.get(vendor);
    if (!policy) {
      return Promise.reject(new Error(`No resilience policy registered for vendor: ${vendor}`));
    }
    return policy.execute(fn);
  }

  private async readConfig(vendor: Vendor): Promise<VendorThresholds> {
    const defaults = RESILIENCE_DEFAULTS[vendor];
    const keys = {
      timeoutMs: `resilience.${vendor}.timeout_ms`,
      retryCount: `resilience.${vendor}.retry_count`,
      failureThreshold: `resilience.${vendor}.breaker_failure_threshold`,
      halfOpenAfterMs: `resilience.${vendor}.half_open_after_ms`,
    };

    // Fetch per-vendor thresholds from platform_configs — NEVER hardcode; fall back to
    // RESILIENCE_DEFAULTS per-key when a row is absent (D-06/D-07).
    const rows = await this.prisma.platformConfig.findMany({
      where: { key: { in: Object.values(keys) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    // WR-01 (11-REVIEW.md): a malformed PlatformConfig row (non-numeric, negative, or
    // NaN-producing) must fall back to RESILIENCE_DEFAULTS per-key instead of silently
    // disabling a vendor's timeout/breaker/retry protection until next restart.
    return {
      timeoutMs: positiveInt(byKey.get(keys.timeoutMs), defaults.timeoutMs),
      retryCount: nonNegativeInt(byKey.get(keys.retryCount), defaults.retryCount),
      failureThreshold: positiveInt(byKey.get(keys.failureThreshold), defaults.failureThreshold),
      halfOpenAfterMs: positiveInt(byKey.get(keys.halfOpenAfterMs), defaults.halfOpenAfterMs),
    };
  }

  // ── Observability: breaker state transitions → OTel span + Sentry (D-09/D-10/D-11) ──────

  private onBreak(vendor: Vendor, reason: { error?: unknown; value?: unknown; isolated?: boolean }): void {
    const safeReason = reason.isolated ? 'isolated' : reason.error ? summarizeVendorError(reason.error) : 'bad_result';

    // acquire the tracer at call-time (not module load) per OTel manual-instrumentation guidance
    const tracer = trace.getTracer('iseyaa-resilience');
    const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
      attributes: {
        'resilience.vendor': vendor,
        'resilience.breaker.state': 'open',
        'resilience.breaker.reason': safeReason,
      },
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: `${vendor} circuit breaker opened` });
    span.end(); // short-lived "event" span — state transitions are instantaneous

    // T-11-03 / D-09: log the vendor name + a safe reason summary only. The raw
    // vendor error (an axios error, when the vendor is HTTP-backed) carries
    // `error.config.headers.Authorization` and full request/response bodies —
    // passing it directly to Logger.error() would print the vendor's bearer
    // token/API key to stdout/stderr and any log aggregator. NEVER pass
    // `reason.error` itself here.
    this.logger.error(`Circuit breaker OPEN for ${vendor}: ${safeReason}`);

    // D-09: circuit-open is alert-worthy; captured explicitly since no global exception
    // filter is registered (D-11). Never interpolate raw request/response payloads here —
    // vendor name + generic error class only (T-11-03).
    Sentry.captureMessage(`Circuit breaker opened: ${vendor}`, {
      level: 'error',
      tags: { vendor, 'resilience.event': 'circuit_open' },
    });
  }

  private onReset(vendor: Vendor): void {
    const tracer = trace.getTracer('iseyaa-resilience');
    const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
      attributes: { 'resilience.vendor': vendor, 'resilience.breaker.state': 'closed' },
    });
    span.end();
    this.logger.log(`Circuit breaker CLOSED (recovered) for ${vendor}`);
  }

  private onHalfOpen(vendor: Vendor): void {
    const tracer = trace.getTracer('iseyaa-resilience');
    const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
      attributes: { 'resilience.vendor': vendor, 'resilience.breaker.state': 'half_open' },
    });
    span.end();
    this.logger.warn(`Circuit breaker HALF-OPEN (testing recovery) for ${vendor}`);
  }
}

// WR-01 (11-REVIEW.md): guard DB-sourced numeric config so a malformed PlatformConfig
// row (non-numeric, negative, NaN-producing) falls back to the per-key default instead
// of silently producing a broken timeout/breaker/retry configuration platform-wide.

/** Returns `fallback` unless `Number(raw)` is finite AND strictly greater than 0. */
function positiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Returns `fallback` unless `Number(raw)` is a finite integer AND >= 0. MUST allow
 * exactly `0` — `flutterwaveRefund`'s legitimate default `retryCount` is `0` (never
 * auto-retry a refund; RESEARCH.md Pitfall 6).
 */
function nonNegativeInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Reduces any vendor error (axios error, network error, plain Error, or an
 * unknown thrown value) to a short safe string for logs/spans: an HTTP status
 * code and/or error code/message class, never headers, request/response
 * bodies, or anything that could carry a secret (T-11-03).
 */
function summarizeVendorError(err: unknown): string {
  const status = (err as any)?.response?.status;
  const code = (err as any)?.code;
  const message = typeof (err as Error)?.message === 'string' ? (err as Error).message : null;
  const parts = [status ? `status=${status}` : null, code ? `code=${code}` : null, message].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'vendor error (no further detail)';
}

/**
 * Business/validation 4xx errors must NOT count toward retry attempts or breaker
 * accounting (RESEARCH.md Pitfall 4) — only network-level errors, specific transient
 * status codes (408, 429, 5xx), and cockatiel's own per-attempt timeout cancellation
 * are treated as vendor-outage signals.
 *
 * WR-04 (11-REVIEW.md): narrowed so a bare application bug (e.g. a `TypeError` thrown
 * inside a wrapped callback, with no `.response`/`.code`/cancellation shape) no longer
 * counts toward a vendor's circuit-breaker consecutive-failure threshold. The
 * `isTaskCancelledError` check MUST stay ahead of the final catch-all: cockatiel's
 * aggressive `timeout()` policy throws a `TaskCancelledError` (no `.response`, no
 * `.code`) on every per-attempt timeout, and that must still count as transient or
 * CR-01's retry-after-per-attempt-timeout fix silently stops retrying on timeout.
 */
function isTransientError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;

  // cockatiel's per-attempt timeout cancellation — must retry (preserves CR-01 fix).
  if ((err as any)?.isTaskCancelledError === true) return true;

  // gRPC numeric status codes (@grpc/grpc-js `status` enum) — MUST be checked before the
  // string-code branch below, since a numeric gRPC code would otherwise silently fall
  // through every existing branch to the final `return false`. Only UNAVAILABLE (14),
  // DEADLINE_EXCEEDED (4), and RESOURCE_EXHAUSTED (8) indicate a transient vendor-outage
  // signal; INTERNAL/UNKNOWN/INVALID_ARGUMENT indicate the server processed the request
  // and hit a deterministic bug/bad-input, matching the existing exclusion rationale
  // already applied to axios 4xx responses.
  const grpcCode = (err as any)?.code;
  if (typeof grpcCode === 'number') {
    return (
      grpcCode === GrpcStatus.UNAVAILABLE ||
      grpcCode === GrpcStatus.DEADLINE_EXCEEDED ||
      grpcCode === GrpcStatus.RESOURCE_EXHAUSTED
    );
  }

  // Recognized network-level error codes (ECONNREFUSED, ETIMEDOUT, DNS failures,
  // fetch/undici abort (ABORT_ERR), axios's own cancellation code (ERR_CANCELED) ...).
  const code = (err as any)?.code;
  if (
    typeof code === 'string' &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ABORT_ERR', 'ERR_CANCELED'].includes(code)
  ) {
    return true;
  }

  // fetch/undici abort shape.
  if ((err as any)?.name === 'AbortError') return true;

  // Anything else (bare application bugs, programming errors) is NOT transient — it
  // must not count toward retry attempts or the circuit breaker's failure threshold.
  return false;
}
