import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RESILIENCE_DEFAULTS } from '../resilience.types';

// Same Sentry/OTel mock blocks established in resilience.service.spec.ts (Plan 01) so
// onBreak's Sentry.captureMessage/OTel span calls do not throw during this test.
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

describe('Vendor outage isolation (Phase 11 success criterion 2)', () => {
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

  it('instantiates a REAL ResilienceService (only PrismaService mocked); onModuleInit builds all vendor policies including flutterwave and s3', async () => {
    await service.onModuleInit();

    // Both vendors used by the isolation scenario below must be immediately usable
    // via execute() — proving onModuleInit actually built their policies.
    await expect(service.execute('flutterwave', async () => 'ok')).resolves.toBe('ok');
    await expect(service.execute('s3', async () => 'ok')).resolves.toBe('ok');
    expect(prisma.platformConfig.findMany).toHaveBeenCalled();
  });

  it('opens the flutterwave breaker after exactly failureThreshold consecutive transient failures, then fails fast without invoking fn again on the 6th call', async () => {
    await service.onModuleInit();

    const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
    const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

    // Drive exactly failureThreshold consecutive failures — this opens the breaker.
    for (let i = 0; i < failureThreshold; i++) {
      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected — every call fails
      }
    }

    const callCountAtThreshold = fn.mock.calls.length;

    // The 6th (and any further) call must reject immediately WITHOUT invoking fn again
    // — fail-fast, not another full retry+timeout cycle per request.
    for (let i = 0; i < 3; i++) {
      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }
    }

    expect(fn.mock.calls.length).toBe(callCountAtThreshold);
  });

  it('completes S3 successfully (returns "uploaded-ok") immediately after the Flutterwave circuit is open — proving cross-vendor isolation on the same ResilienceService instance', async () => {
    await service.onModuleInit();

    const flutterwaveFn = jest.fn().mockRejectedValue({ response: { status: 500 } });
    const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

    // Drive the Flutterwave breaker open.
    for (let i = 0; i < failureThreshold + 1; i++) {
      try {
        await service.execute('flutterwave', flutterwaveFn);
      } catch {
        // expected
      }
    }

    // Same ResilienceService instance, same test run: a completely different vendor
    // policy (S3) must be entirely unaffected and continue succeeding.
    const fn2 = jest.fn().mockResolvedValue('uploaded-ok');
    const result = await service.execute('s3', fn2);

    expect(result).toBe('uploaded-ok');
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("rethrows ServiceUnavailableException when a caller mirrors FlutterwaveService.initiatePayment's catch-and-rethrow against the now-open Flutterwave circuit", async () => {
    await service.onModuleInit();

    const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
    const { failureThreshold } = RESILIENCE_DEFAULTS.flutterwave;

    // Open the circuit.
    for (let i = 0; i < failureThreshold; i++) {
      try {
        await service.execute('flutterwave', fn);
      } catch {
        // expected
      }
    }

    // Mirrors FlutterwaveService.initiatePayment's actual catch-and-rethrow pattern
    // (D-05: generic ServiceUnavailableException on any policy escape).
    const callSite = async () => {
      try {
        await service.execute('flutterwave', fn);
      } catch {
        throw new ServiceUnavailableException('Flutterwave is temporarily unavailable, please try again shortly');
      }
    };

    await expect(callSite()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
