import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { of, throwError } from 'rxjs';
import { WaitlistClientService } from '../waitlist-client.service';
import { WAITLIST_PACKAGE } from '../waitlist-client.constants';
import { ResilienceService } from '../../../resilience/resilience.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WAITLIST_SOURCES, JoinWaitlistDto } from '../../waitlist/dto/join-waitlist.dto';

/**
 * 21-03 Task 2 — WaitlistClientService spec. Mirrors news-client.service.spec.ts's ClientGrpc
 * mock shape: mocks `ClientGrpc.getService` to return a mock gRPC service whose
 * `joinWaitlist`/`getWaitlistStats` jest.fn()s return `rxjs`'s `of(...)` (success) or
 * `throwError(...)` (failure). `ResilienceService.execute` is mocked to invoke the wrapped fn
 * directly.
 */

const JOIN_DTO: JoinWaitlistDto = {
  source: 'marketplace_web',
  email: 'ada@example.com',
  phone: undefined,
  fullName: 'Ada Lovelace',
};

const JOIN_RESULT = { id: 'WL-1', success: true };
const POSITION_COUNT = 7;
const MESSAGE = "You're on the list — we'll be in touch.";

interface MockGrpcService {
  joinWaitlist: jest.Mock;
  getWaitlistStats: jest.Mock;
}

let mockGrpcService: MockGrpcService;
let mockClientGrpc: { getService: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockPrisma: {
  platformConfig: { findUnique: jest.Mock };
  waitlistEntry: { count: jest.Mock };
};

// `canaryFlagValue`: undefined => findUnique resolves null (row absent, default enabled);
// otherwise findUnique resolves `{ value: canaryFlagValue }`.
async function makeService(canaryFlagValue?: unknown): Promise<WaitlistClientService> {
  mockGrpcService = {
    joinWaitlist: jest.fn().mockReturnValue(of(JOIN_RESULT)),
    getWaitlistStats: jest.fn().mockImplementation((req: { source: string }) =>
      of({ totalCount: WAITLIST_SOURCES.indexOf(req.source as any) + 1 }),
    ),
  };
  mockClientGrpc = { getService: jest.fn().mockReturnValue(mockGrpcService) };
  mockResilience = {
    execute: jest.fn((_vendor: string, fn: (ctx: { signal: AbortSignal }) => Promise<any>) =>
      fn({ signal: new AbortController().signal }),
    ),
  };
  mockPrisma = {
    platformConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(canaryFlagValue === undefined ? null : { value: canaryFlagValue }),
    },
    waitlistEntry: {
      count: jest.fn().mockResolvedValue(POSITION_COUNT),
    },
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      WaitlistClientService,
      { provide: WAITLIST_PACKAGE, useValue: mockClientGrpc },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  const svc = moduleRef.get(WaitlistClientService);
  svc.onModuleInit();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WaitlistClientService', () => {
  describe('join()', () => {
    it('1. on gRPC success, reconstructs {message, position, id} via a Prisma count query', async () => {
      const svc = await makeService();

      await expect(svc.join(JOIN_DTO)).resolves.toEqual({
        message: MESSAGE,
        position: POSITION_COUNT,
        id: JOIN_RESULT.id,
      });

      expect(mockGrpcService.joinWaitlist).toHaveBeenCalledWith({
        email: JOIN_DTO.email,
        phone: '',
        fullName: JOIN_DTO.fullName,
        source: JOIN_DTO.source,
      });
      expect(mockPrisma.waitlistEntry.count).toHaveBeenCalledWith({
        where: { source: JOIN_DTO.source },
      });
    });

    it('2. on gRPC/resilience failure, throws ServiceUnavailableException mentioning "Waitlist service is temporarily unavailable"', async () => {
      const svc = await makeService();
      mockGrpcService.joinWaitlist.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

      await expect(svc.join(JOIN_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.join(JOIN_DTO)).rejects.toThrow(
        /Waitlist service is temporarily unavailable/,
      );
      expect(mockPrisma.waitlistEntry.count).not.toHaveBeenCalled();
    });

    it('3. when canary_enabled flag is false, throws ServiceUnavailableException WITHOUT calling resilience.execute, the gRPC client, or prisma.waitlistEntry.count', async () => {
      const svc = await makeService(false);

      await expect(svc.join(JOIN_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.join(JOIN_DTO)).rejects.toThrow(
        /Waitlist service is temporarily unavailable/,
      );

      expect(mockResilience.execute).not.toHaveBeenCalled();
      expect(mockGrpcService.joinWaitlist).not.toHaveBeenCalled();
      expect(mockPrisma.waitlistEntry.count).not.toHaveBeenCalled();
    });

    it('4. calls resilience.execute with "waitlistGrpc" as its first argument', async () => {
      const svc = await makeService();

      await svc.join(JOIN_DTO);

      expect(mockResilience.execute).toHaveBeenCalledWith('waitlistGrpc', expect.any(Function));
    });

    it('9. on gRPC error code INVALID_ARGUMENT, throws BadRequestException with the exact preserved message and does not touch prisma.waitlistEntry.count', async () => {
      const svc = await makeService();
      const message = 'Provide an email or phone number';
      mockGrpcService.joinWaitlist.mockReturnValue(
        throwError(() => ({ code: GrpcStatus.INVALID_ARGUMENT, message })),
      );

      await expect(svc.join(JOIN_DTO)).rejects.toThrow(BadRequestException);
      await expect(svc.join(JOIN_DTO)).rejects.toThrow(message);
      expect(mockPrisma.waitlistEntry.count).not.toHaveBeenCalled();
    });

    it('10. on an unrecognized/codeless error, still falls through to ServiceUnavailableException (regression guard)', async () => {
      const svc = await makeService();
      mockGrpcService.joinWaitlist.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

      await expect(svc.join(JOIN_DTO)).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.join(JOIN_DTO)).rejects.toThrow(
        /Waitlist service is temporarily unavailable/,
      );
    });
  });

  describe('stats()', () => {
    it('5. on success, fans out exactly WAITLIST_SOURCES.length parallel resilience.execute calls and reassembles the grouped array', async () => {
      const svc = await makeService();

      const result = await svc.stats();

      expect(result).toEqual(
        WAITLIST_SOURCES.map((source, i) => ({ source, count: i + 1 })),
      );
      expect(mockResilience.execute).toHaveBeenCalledTimes(WAITLIST_SOURCES.length);
      WAITLIST_SOURCES.forEach((source) => {
        expect(mockGrpcService.getWaitlistStats).toHaveBeenCalledWith({ source });
      });
    });

    it('6. when canary_enabled flag is false, throws ServiceUnavailableException WITHOUT calling resilience.execute or the gRPC client', async () => {
      const svc = await makeService(false);

      await expect(svc.stats()).rejects.toThrow(ServiceUnavailableException);
      await expect(svc.stats()).rejects.toThrow(
        /Waitlist service is temporarily unavailable/,
      );

      expect(mockResilience.execute).not.toHaveBeenCalled();
      expect(mockGrpcService.getWaitlistStats).not.toHaveBeenCalled();
    });

    it('7. calls resilience.execute with "waitlistGrpc" as its first argument for every fan-out call', async () => {
      const svc = await makeService();

      await svc.stats();

      expect(mockResilience.execute).toHaveBeenCalledWith('waitlistGrpc', expect.any(Function));
      mockResilience.execute.mock.calls.forEach((call: unknown[]) => {
        expect(call[0]).toBe('waitlistGrpc');
      });
    });
  });

  it('8. when canary_enabled flag is absent or true, existing gRPC-calling behavior is unchanged for join()', async () => {
    const svcAbsent = await makeService(undefined);
    await expect(svcAbsent.join(JOIN_DTO)).resolves.toEqual({
      message: MESSAGE,
      position: POSITION_COUNT,
      id: JOIN_RESULT.id,
    });

    const svcTrue = await makeService(true);
    await expect(svcTrue.join(JOIN_DTO)).resolves.toEqual({
      message: MESSAGE,
      position: POSITION_COUNT,
      id: JOIN_RESULT.id,
    });
  });
});
