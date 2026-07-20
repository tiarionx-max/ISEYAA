import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { NewsClientService } from '../news-client.service';
import { NEWS_PACKAGE } from '../news-client.constants';
import { ResilienceService } from '../../../resilience/resilience.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 21-02 Task 2 — NewsClientService spec. Mirrors notifications-client.service.spec.ts's
 * ClientGrpc mock shape: mocks `ClientGrpc.getService` to return a mock gRPC service whose
 * `listNews` jest.fn() returns `rxjs`'s `of(...)` (success) or `throwError(...)` (failure).
 * `ResilienceService.execute` is mocked to invoke the wrapped fn directly.
 */

const LIMIT = 20;
const CATEGORY = 'sports';

interface MockGrpcService {
  listNews: jest.Mock;
}

let mockGrpcService: MockGrpcService;
let mockClientGrpc: { getService: jest.Mock };
let mockResilience: { execute: jest.Mock };
let mockPrisma: { platformConfig: { findUnique: jest.Mock } };

const SAMPLE_ITEMS = [
  {
    id: 'NEWS-1',
    headline: 'Ogun State launches new initiative',
    summary: 'Summary text',
    link: 'https://example.com/1',
    source: 'Ogun News',
    category: CATEGORY,
    imageUrl: 'https://example.com/1.jpg',
    publishedAt: '2026-07-20T00:00:00.000Z',
    isPriority: true,
  },
];

// `canaryFlagValue`: undefined => findUnique resolves null (row absent, default enabled);
// otherwise findUnique resolves `{ value: canaryFlagValue }`.
async function makeService(canaryFlagValue?: unknown): Promise<NewsClientService> {
  mockGrpcService = {
    listNews: jest.fn().mockReturnValue(of({ items: SAMPLE_ITEMS })),
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
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      NewsClientService,
      { provide: NEWS_PACKAGE, useValue: mockClientGrpc },
      { provide: ResilienceService, useValue: mockResilience },
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  const svc = moduleRef.get(NewsClientService);
  svc.onModuleInit();
  return svc;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NewsClientService', () => {
  it('1. findLatest: on gRPC success, resolves to res.items unchanged', async () => {
    const svc = await makeService();

    await expect(svc.findLatest(LIMIT, CATEGORY)).resolves.toEqual(SAMPLE_ITEMS);

    expect(mockGrpcService.listNews).toHaveBeenCalledWith({ limit: LIMIT, category: CATEGORY });
  });

  it('2. findLatest: defaults category to empty string when omitted', async () => {
    const svc = await makeService();

    await svc.findLatest(LIMIT);

    expect(mockGrpcService.listNews).toHaveBeenCalledWith({ limit: LIMIT, category: '' });
  });

  it('3. findLatest: on gRPC/resilience failure, throws ServiceUnavailableException mentioning "News service is temporarily unavailable"', async () => {
    const svc = await makeService();
    mockGrpcService.listNews.mockReturnValue(throwError(() => new Error('UNAVAILABLE')));

    await expect(svc.findLatest(LIMIT, CATEGORY)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.findLatest(LIMIT, CATEGORY)).rejects.toThrow(
      /News service is temporarily unavailable/,
    );
  });

  it('4. findLatest: when canary_enabled flag is false, throws ServiceUnavailableException without calling resilience.execute or the gRPC client', async () => {
    const svc = await makeService(false);

    await expect(svc.findLatest(LIMIT, CATEGORY)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.findLatest(LIMIT, CATEGORY)).rejects.toThrow(
      /News service is temporarily unavailable/,
    );

    expect(mockResilience.execute).not.toHaveBeenCalled();
    expect(mockGrpcService.listNews).not.toHaveBeenCalled();
  });

  it('5. findLatest: when canary_enabled flag is absent or true, existing gRPC-calling behavior is unchanged', async () => {
    const svcAbsent = await makeService(undefined);
    await expect(svcAbsent.findLatest(LIMIT, CATEGORY)).resolves.toEqual(SAMPLE_ITEMS);
    expect(mockResilience.execute).toHaveBeenCalledTimes(1);

    const svcTrue = await makeService(true);
    await expect(svcTrue.findLatest(LIMIT, CATEGORY)).resolves.toEqual(SAMPLE_ITEMS);
    expect(mockResilience.execute).toHaveBeenCalledTimes(1);
  });

  it('6. findLatest calls resilience.execute with "newsGrpc" as its first argument', async () => {
    const svc = await makeService();

    await svc.findLatest(LIMIT, CATEGORY);

    expect(mockResilience.execute).toHaveBeenCalledWith('newsGrpc', expect.any(Function));
  });
});
