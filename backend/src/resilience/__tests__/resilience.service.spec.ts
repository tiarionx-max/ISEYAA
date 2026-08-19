import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
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
    it('builds all 10 vendor policies from RESILIENCE_DEFAULTS when PlatformConfig has no rows', async () => {
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
      await expect(service.execute('flutterwave', async () => 'ok')).rejects.toThrow(
        /No resilience policy registered for vendor/,
      );
    });
  });

  describe('breaker opens on consecutive transient failures', () => {
    it('opens the flutterwave breaker after failureThreshold consecutive transient failures, then fails fast without invoking fn again', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
      const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

      // Drive enough failures to open the breaker. Each execute() call may itself
      // retry internally (flutterwave retryCount=2), but the breaker should still open
      // once failureThreshold *consecutive* failures have been recorded.
      for (let i = 0; i < failureThreshold + 2; i++) {
        try {
          await service.execute('flutterwave', fn);
        } catch {
          // expected — every call fails
        }
      }

      const callCountWhenPresumablyOpen = fn.mock.calls.length;

      // Further calls should fail fast (BrokenCircuitError) without invoking fn again.
      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }
      try {
        await service.execute('flutterwave', fn);
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
      const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

      const attempts = failureThreshold + 5;
      for (let i = 0; i < attempts; i++) {
        try {
          await service.execute('flutterwave', fn);
        } catch {
          // expected — every call fails with the 4xx error itself, not a broken-circuit error
        }
      }

      // fn invoked once per execute() call (flutterwave retryCount would only kick in for
      // transient errors — 4xx is excluded from the retry filter too), so call count
      // must equal the number of execute() invocations, proving no fail-fast short-circuit.
      expect(fn.mock.calls.length).toBe(attempts);
    });
  });

  describe('flutterwaveRefund — zero-retry behavior', () => {
    it('invokes fn exactly once per execute() call for flutterwaveRefund (no cockatiel-level retry)', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('flutterwaveRefund', fn);
      } catch {
        // expected
      }

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('invokes fn on every retry attempt for flutterwave (retryCount: 2 — distinct from flutterwaveRefund)', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }

      // flutterwave retryCount is 2 -> 1 initial + 2 retries = 3 calls for this single execute()
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('readConfig() — malformed DB config falls back to defaults (WR-01)', () => {
    it('falls back to the default timeoutMs (10_000ms) when the DB-sourced timeout_ms value is non-numeric', async () => {
      prisma.platformConfig.findMany.mockResolvedValue([
        { key: 'resilience.flutterwave.timeout_ms', value: 'not-a-number' },
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
      await expect(service.execute('flutterwave', fn as any)).resolves.toBe('ok');
    });

    it('falls back to the default retryCount (2) when the DB-sourced retry_count value is non-numeric', async () => {
      prisma.platformConfig.findMany.mockResolvedValue([
        { key: 'resilience.flutterwave.retry_count', value: 'abc' },
      ]);
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });

      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected — every attempt fails
      }

      // A malformed retry_count must fall back to the default retryCount: 2 (multiple
      // attempts), not to 0/NaN (which would invoke fn only once).
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('isTransientError narrowing (WR-04)', () => {
    it('does not open the breaker on repeated bare application errors (no .response/.code shape) — fn is invoked on every single call', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue(new TypeError('boom'));
      const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

      const attempts = failureThreshold + 5;
      for (let i = 0; i < attempts; i++) {
        try {
          await service.execute('flutterwave', fn);
        } catch {
          // expected — every call fails with the bare application error itself
        }
      }

      // A bare TypeError is not classified as transient, so cockatiel's retry never
      // kicks in (fn invoked once per execute() call) AND the breaker never opens
      // (no fail-fast short-circuit) — call count must equal execute() invocations.
      expect(fn.mock.calls.length).toBe(attempts);
    });

    it('still retries genuine network-level errors shaped with a recognized .code (e.g. ECONNREFUSED)', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ code: 'ECONNREFUSED' });

      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }

      // flutterwave retryCount: 2 means cockatiel retries this — proving genuine
      // network-level errors remain classified as transient.
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });

    it('still retries cockatiel-shaped TaskCancelledError (per-attempt timeout cancellation) — critical regression guard for CR-01', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ isTaskCancelledError: true });

      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }

      // This is the interaction proof that WR-04's narrowing does not silently
      // break CR-01's per-attempt retry: a TaskCancelledError-shaped rejection (no
      // .response, no .code) must still trigger a retry.
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });

    it('retries a gRPC UNAVAILABLE (code: 14) failure for the notificationsGrpc vendor', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ code: 14, details: 'no connection' });

      try {
        await service.execute('notificationsGrpc', fn);
      } catch {
        // expected
      }

      // notificationsGrpc retryCount: 1 means cockatiel retries this — proving gRPC's
      // numeric UNAVAILABLE status code is classified as transient.
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('isTransientError narrowing (WR-03 — axios ERR_CANCELED)', () => {
    it("still retries an axios-shaped CanceledError ({ code: 'ERR_CANCELED', name: 'CanceledError' }) — WR-03 regression guard", async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ code: 'ERR_CANCELED', name: 'CanceledError' });

      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }

      // flutterwave retryCount: 2 means cockatiel retries this — proving axios's own
      // cancellation code is now classified as transient, consistent with the
      // already-handled native fetch/undici ABORT_ERR code.
      expect(fn.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('onBreak — Sentry + OTel span wiring', () => {
    it('calls Sentry.captureMessage and trace.getTracer().startSpan() with vendor + circuit_open attributes when the breaker opens', async () => {
      await service.onModuleInit();

      const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
      const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

      for (let i = 0; i < failureThreshold + 1; i++) {
        try {
          await service.execute('flutterwave', fn);
        } catch {
          // expected
        }
      }

      expect(Sentry.captureMessage).toHaveBeenCalled();
      const [message, options] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
      expect(message).toContain('flutterwave');
      expect(options).toMatchObject({
        level: 'error',
        tags: expect.objectContaining({ vendor: 'flutterwave', 'resilience.event': 'circuit_open' }),
      });

      expect(trace.getTracer).toHaveBeenCalled();
      const tracerInstance = (trace.getTracer as jest.Mock).mock.results[0].value;
      expect(tracerInstance.startSpan).toHaveBeenCalled();
      const [, spanOptions] = tracerInstance.startSpan.mock.calls.find(
        (call: any[]) => call[1]?.attributes?.['resilience.breaker.state'] === 'open',
      );
      expect(spanOptions.attributes['resilience.vendor']).toBe('flutterwave');
      expect(spanOptions.attributes['resilience.breaker.state']).toBe('open');
    });

    it('never logs the raw vendor error — a realistic axios error with an Authorization header must not reach Logger.error (UAT Test 3)', async () => {
      await service.onModuleInit();

      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      const realisticAxiosError = {
        message: 'Request failed with status code 500',
        name: 'AxiosError',
        code: 'ERR_BAD_RESPONSE',
        config: {
          url: 'https://api.flutterwave.com/v3/payments',
          method: 'post',
          headers: { Authorization: 'Bearer sk_live_SECRET_TOKEN', 'Content-Type': 'application/json' },
          data: JSON.stringify({ email: 'user@test.com', amount: 5000 }),
        },
        request: {},
        response: { status: 500, data: { message: 'Internal Server Error' }, headers: {} },
        isAxiosError: true,
      };

      const fn = jest.fn().mockRejectedValue(realisticAxiosError);
      const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

      for (let i = 0; i < failureThreshold + 1; i++) {
        try {
          await service.execute('flutterwave', fn);
        } catch {
          // expected
        }
      }

      const breakCall = errorSpy.mock.calls.find((c) => String(c[0]).includes('Circuit breaker OPEN'));
      expect(breakCall).toBeDefined();

      // The message itself must name the vendor and stay generic — no secrets, ever.
      expect(breakCall![0]).toContain('flutterwave');

      // Every argument passed to logger.error, stringified, must never contain the
      // bearer token, the raw Authorization header, or the request body.
      const serializedArgs = JSON.stringify(breakCall);
      expect(serializedArgs).not.toContain('sk_live_SECRET_TOKEN');
      expect(serializedArgs).not.toContain('Authorization');
      expect(serializedArgs).not.toContain('user@test.com');
    });
  });
});
