import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';

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

import { ResilienceService } from '../resilience.service';

/**
 * Regression test for CR-01 (11-REVIEW.md / 11-VERIFICATION.md IN-01): each retry
 * attempt must be bounded by its own `cfg.timeoutMs` window, not by one shared
 * timeout wrapping the entire retry+backoff sequence. Uses fake timers to simulate
 * realistic per-attempt vendor latency — the only way to actually exercise the
 * composition-order bug (prior tests rejected synchronously and never triggered it).
 */
describe('Retry/timeout composition order (CR-01)', () => {
  let service: ResilienceService;
  let prisma: { platformConfig: { findMany: jest.Mock } };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // flutterwave config: timeoutMs=1000 — deliberately smaller than the cumulative
    // duration of 3 attempts (~800ms each) + 2 backoff windows, but larger than any
    // single 800ms attempt. Only passes if timeout applies per-attempt, not per-sequence.
    prisma = {
      platformConfig: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'resilience.flutterwave.timeout_ms', value: '1000' },
          { key: 'resilience.flutterwave.retry_count', value: '2' },
          { key: 'resilience.flutterwave.breaker_failure_threshold', value: '5' },
          { key: 'resilience.flutterwave.half_open_after_ms', value: '30000' },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ResilienceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ResilienceService>(ResilienceService);
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives every retry attempt its own fresh timeout window instead of one shared window for the whole sequence', async () => {
    let callCount = 0;
    const fn = jest.fn().mockImplementation(() => {
      callCount += 1;
      const attemptNumber = callCount;
      return new Promise((resolve, reject) => {
        // Each attempt takes 800ms — comfortably inside a fresh 1000ms budget per
        // attempt, but the cumulative sequence (3 attempts + 2 backoff windows) is
        // several thousand ms, far exceeding the single 1000ms timeoutMs value.
        setTimeout(() => {
          if (attemptNumber <= 2) {
            reject({ response: { status: 500 } });
          } else {
            resolve('ok');
          }
        }, 800);
      });
    });

    const resultPromise = service.execute('flutterwave', fn);

    // Attempt 1 (800ms) settles with a transient 500 rejection.
    await jest.advanceTimersByTimeAsync(800);
    // Backoff window before attempt 2 (ExponentialBackoff: 200ms-3000ms with jitter).
    await jest.advanceTimersByTimeAsync(3500);
    // Attempt 2 (800ms) settles with a transient 500 rejection.
    await jest.advanceTimersByTimeAsync(800);
    // Backoff window before attempt 3.
    await jest.advanceTimersByTimeAsync(3500);
    // Attempt 3 (800ms) resolves successfully.
    await jest.advanceTimersByTimeAsync(800);

    await expect(resultPromise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
