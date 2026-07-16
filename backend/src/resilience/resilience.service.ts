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
          // paystackRefund's retryCount: 0 naturally makes this a zero-attempt no-op —
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

  /** Callers: `await this.resilience.execute('paystack', () => axios.post(...))` */
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

    return {
      timeoutMs: Number(byKey.get(keys.timeoutMs) ?? defaults.timeoutMs),
      retryCount: Number(byKey.get(keys.retryCount) ?? defaults.retryCount),
      failureThreshold: Number(byKey.get(keys.failureThreshold) ?? defaults.failureThreshold),
      halfOpenAfterMs: Number(byKey.get(keys.halfOpenAfterMs) ?? defaults.halfOpenAfterMs),
    };
  }

  // ── Observability: breaker state transitions → OTel span + Sentry (D-09/D-10/D-11) ──────

  private onBreak(vendor: Vendor, reason: { error?: unknown; value?: unknown; isolated?: boolean }): void {
    // acquire the tracer at call-time (not module load) per OTel manual-instrumentation guidance
    const tracer = trace.getTracer('iseyaa-resilience');
    const span = tracer.startSpan('resilience.circuit_breaker.state_change', {
      attributes: {
        'resilience.vendor': vendor,
        'resilience.breaker.state': 'open',
        'resilience.breaker.reason': reason.isolated
          ? 'isolated'
          : reason.error
            ? String((reason.error as Error)?.message ?? reason.error)
            : 'bad_result',
      },
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: `${vendor} circuit breaker opened` });
    span.end(); // short-lived "event" span — state transitions are instantaneous

    this.logger.error(`Circuit breaker OPEN for ${vendor}`, reason.error as any);

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

/**
 * Business/validation 4xx errors must NOT count toward retry attempts or breaker
 * accounting (RESEARCH.md Pitfall 4) — only network-level errors (no `.response`) and
 * specific transient status codes (408, 429, 5xx) are treated as vendor-outage signals.
 */
function isTransientError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  if (status !== undefined) return status === 408 || status === 429 || status >= 500;
  return true; // network-level errors (ECONNREFUSED, ETIMEDOUT, DNS failures) have no `.response`
}
