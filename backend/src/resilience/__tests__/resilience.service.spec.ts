import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RESILIENCE_DEFAULTS } from '../resilience.types';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue({
      startSpan: jest.fn().mockReturnValue({ setStatus: jest.fn(), end: jest.fn() }),
    }),
  },
  SpanStatusCode: { ERROR: 2 },
}));

import * as Sentry from '@sentry/nestjs';
import { trace } from '@opentelemetry/api';
import { ResilienceService } from '../resilience.service';

describe('ResilienceService', () => {
  let service: ResilienceService;
  let prisma: { platformConfig: { findMany: jest.Mock } };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = { platformConfig: { findMany: jest.fn().mockResolvedValue([]) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ResilienceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ResilienceService>(ResilienceService);
  });

  describe('onModuleInit — default-fallback config read', () => {
    it('builds all 7 vendor policies from RESILIENCE_DEFAULTS when PlatformConfig has no rows', async () => {
      await service.onModuleInit();

      // Every vendor must be usable via execute() without throwing "not registered".
      const vendors = Object.keys(RESILIENCE_DEFAULTS) as (keyof typeof RESILIENCE_DEFAULTS)[];
      for (const vendor of vendors) {
        await expect(service.execute(vendor, async () => 'ok')).resolves.toBe('ok');
      }
      expect(prisma.platformConfig.findMany).toHaveBeenCalled();
    });
  });

  describe('execute() — unknown vendor rejection', () => {
    it('rejects with an Error mentioning "No resilience policy registered for vendor" for an unregistered vendor', async () => {
      // Note: onModuleInit not called — no policies registered yet.
      await expect(service.execute('paystack', async () => 'ok')).rejects.toThrow(
        /No resilience policy registered for vendor/,
      );
    });
  });

  describe('breaker opens on consecutive transient failures', () => {
    it('opens the paystack breaker after failureThreshold consecutive transient failures, then fails fast without invoking fn again', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
      const { failureThreshold } = RESILIENCE_DEFAULTS.paystack;

      // Drive enough failures to open the breaker. Each execute() call may itself
      // retry internally (paystack retryCount=2), but the breaker should still open
      // once failureThreshold *consecutive* failures have been recorded.
      for (let i = 0; i < failureThreshold + 2; i++) {
        try {
          await service.execute('paystack', fn);
        } catch {
          // expected — every call fails
        }
      }

      const callCountWhenPresumablyOpen = fn.mock.calls.length;

      // Further calls should fail fast (BrokenCircuitError) without invoking fn again.
      try {
        await service.execute('paystack', fn);
      } catch {
        // expected
      }
      try {
        await service.execute('paystack', fn);
      } catch {
        // expected
      }

      expect(fn.mock.calls.length).toBe(callCountWhenPresumablyOpen);
    });
  });

  describe('breaker stays closed on 4xx business errors', () => {
    it('does not open the breaker on repeated 400-shaped errors — fn is invoked on every single call', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 400 } });
      const { failureThreshold } = RESILIENCE_DEFAULTS.paystack;

      const attempts = failureThreshold + 5;
      for (let i = 0; i < attempts; i++) {
        try {
          await service.execute('paystack', fn);
        } catch {
          // expected — every call fails with the 4xx error itself, not a broken-circuit error
        }
      }

      // fn invoked once per execute() call (paystack retryCount would only kick in for
      // transient errors — 4xx is excluded from the retry filter too), so call count
      // must equal the number of execute() invocations, proving no fail-fast short-circuit.
      expect(fn.mock.calls.length).toBe(attempts);
    });
  });

  describe('paystackRefund — zero-retry behavior', () => {
    it('invokes fn exactly once per execute() call for paystackRefund (no cockatiel-level retry)', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('paystackRefund', fn);
      } catch {
        // expected
      }

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('invokes fn on every retry attempt for paystack (retryCount: 2 — distinct from paystackRefund)', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('paystack', fn);
      } catch {
        // expected
      }

      // paystack retryCount is 2 -> 1 initial + 2 retries = 3 calls for this single execute()
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('readConfig() — malformed DB config falls back to defaults (WR-01)', () => {
    it('falls back to the default timeoutMs (10_000ms) when the DB-sourced timeout_ms value is non-numeric', async () => {
      prisma.platformConfig.findMany.mockResolvedValue([
        { key: 'resilience.paystack.timeout_ms', value: 'not-a-number' },
      ]);
      await service.onModuleInit();

      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('ok'), 50);
          }),
      );

      // A malformed timeout_ms must fall back to the ample 10_000ms default rather
      // than collapsing to a near-zero/NaN timeout that would reject before fn settles.
      await expect(service.execute('paystack', fn as any)).resolves.toBe('ok');
    });

    it('falls back to the default retryCount (2) when the DB-sourced retry_count value is non-numeric', async () => {
      prisma.platformConfig.findMany.mockResolvedValue([
        { key: 'resilience.paystack.retry_count', value: 'abc' },
      ]);
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('paystack', fn);
      } catch {
        // expected — every attempt fails
      }

      // A malformed retry_count must fall back to the default retryCount: 2 (multiple
      // attempts), not to 0/NaN (which would invoke fn only once).
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('onBreak — Sentry + OTel span wiring', () => {
    it('calls Sentry.captureMessage and trace.getTracer().startSpan() with vendor + circuit_open attributes when the breaker opens', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
      const { failureThreshold } = RESILIENCE_DEFAULTS.paystack;

      for (let i = 0; i < failureThreshold + 1; i++) {
        try {
          await service.execute('paystack', fn);
        } catch {
          // expected
        }
      }

      expect(Sentry.captureMessage).toHaveBeenCalled();
      const [message, options] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
      expect(message).toContain('paystack');
      expect(options).toMatchObject({
        level: 'error',
        tags: expect.objectContaining({ vendor: 'paystack', 'resilience.event': 'circuit_open' }),
      });

      expect(trace.getTracer).toHaveBeenCalled();
      const tracerInstance = (trace.getTracer as jest.Mock).mock.results[0].value;
      expect(tracerInstance.startSpan).toHaveBeenCalled();
      const [, spanOptions] = tracerInstance.startSpan.mock.calls.find(
        (call: any[]) => call[1]?.attributes?.['resilience.breaker.state'] === 'open',
      );
      expect(spanOptions.attributes['resilience.vendor']).toBe('paystack');
      expect(spanOptions.attributes['resilience.breaker.state']).toBe('open');
    });
  });
});
