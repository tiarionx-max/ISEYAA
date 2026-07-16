import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiService } from '../ai.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { VectorService } from '../../../common/services/vector.service';
import { ResilienceService } from '../../../resilience/resilience.service';

// Real ResilienceService (used by the CR-01 gap-closure regression describe below)
// pulls in Sentry/OTel — mock both so the real-instance test module below can
// construct ResilienceService without side effects (mirrors
// retry-timeout-composition.spec.ts / resilience.service.spec.ts).
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

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeStream(stopReason: string, textChunks: string[] = [], toolUses: any[] = []) {
  return {
    withResponse: jest.fn().mockResolvedValue(undefined),
    [Symbol.asyncIterator]: async function* () {
      for (const text of textChunks) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
    },
    finalMessage: jest.fn().mockResolvedValue({
      stop_reason: stopReason,
      content: stopReason === 'tool_use'
        ? toolUses
        : [{ type: 'text', text: textChunks.join('') }],
    }),
  };
}

// Default stream for existing tests (itinerary)
const mockItineraryStream = {
  withResponse: jest.fn().mockResolvedValue(undefined),
  [Symbol.asyncIterator]: async function* () {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"title":"Test Itinerary",' } };
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '"overview":"Great trip","days":[],' } };
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '"total_budget_estimate_ngn":50000,"tips":["Enjoy!"]}' } };
  },
  finalMessage: jest.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [] }),
};

let mockStreamFactory: () => any = () => mockItineraryStream;

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockImplementation(() => mockStreamFactory()),
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'LGA intelligence answer.' }],
        }),
      },
    })),
  };
});

const mockPrisma = {
  lGA: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  attraction: { findMany: jest.fn() },
  event: { findMany: jest.fn() },
  property: { findMany: jest.fn() },
  // Needed only by the real ResilienceService in the CR-01 gap-closure regression
  // describe below — onModuleInit() reads per-vendor thresholds from platformConfig.
  // An empty array makes every vendor fall back to RESILIENCE_DEFAULTS.
  platformConfig: { findMany: jest.fn().mockResolvedValue([]) },
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'ANTHROPIC_API_KEY') return 'test-key';
    return undefined;
  }),
};

const mockVector = {
  upsertInteraction: jest.fn().mockResolvedValue(undefined),
  getPersonalisedContext: jest.fn().mockResolvedValue(''),
};

const mockResilience = {
  execute: jest.fn((_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

const LGA_STUB = {
  id: 'lga-1',
  name: 'Abeokuta South',
  slug: 'abeokuta-south',
  metadata: { history: 'Ancient Egba settlement.' },
};

const USER_STUB = { id: 'user-1', lgaId: 'lga-1' };

// ── Test suite ────────────────────────────────────────────────────────────────

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStreamFactory = () => mockItineraryStream;
    mockResilience.execute.mockImplementation(
      (_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
        fn({ signal: undefined }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: VectorService, useValue: mockVector },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();
    service = module.get<AiService>(AiService);
  });

  // ── Existing tests (must stay passing) ──────────────────────────────────────

  describe('streamItinerary', () => {
    const dto = {
      durationDays: 2,
      startLgaSlug: 'abeokuta-south',
      interests: ['history', 'nature'],
      budgetNgn: 50000,
      partySize: 2,
    };

    const mockRes = () => {
      const events: Array<{ event: string; data: unknown }> = [];
      return {
        write: jest.fn((chunk: string) => {
          const eventMatch = chunk.match(/event: (\w+)/);
          const dataMatch = chunk.match(/data: (.+)/);
          if (eventMatch && dataMatch) {
            try {
              events.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) });
            } catch {}
          }
        }),
        end: jest.fn(),
        events,
      };
    };

    it('emits status, delta, itinerary, and done events', async () => {
      mockPrisma.lGA.findFirst.mockResolvedValue(LGA_STUB);
      mockPrisma.attraction.findMany.mockResolvedValue([
        { id: 'a1', name: 'Olumo Rock', slug: 'olumo-rock', description: 'Rock', category: 'HISTORICAL', entryFee: 500, address: 'Abeokuta' },
      ]);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.property.findMany.mockResolvedValue([]);

      const res = mockRes();
      await service.streamItinerary(dto, res as any);

      const eventNames = res.events.map((e) => e.event);
      expect(eventNames).toContain('status');
      expect(eventNames).toContain('delta');
      expect(eventNames).toContain('itinerary');
      expect(eventNames).toContain('done');
      expect(res.end).toHaveBeenCalled();
    });

    it('emits parsed itinerary with title from Claude response', async () => {
      mockPrisma.lGA.findFirst.mockResolvedValue(LGA_STUB);
      mockPrisma.attraction.findMany.mockResolvedValue([]);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.property.findMany.mockResolvedValue([]);

      const res = mockRes();
      await service.streamItinerary(dto, res as any);

      const itineraryEvent = res.events.find((e) => e.event === 'itinerary');
      expect(itineraryEvent).toBeDefined();
      expect((itineraryEvent!.data as any).title).toBe('Test Itinerary');
    });

    it('emits error event when LGA not found', async () => {
      mockPrisma.lGA.findFirst.mockResolvedValue(null);

      const res = mockRes();
      await service.streamItinerary({ ...dto, startLgaSlug: 'bad-slug' }, res as any);

      const errorEvent = res.events.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('fetches events only within the trip window', async () => {
      mockPrisma.lGA.findFirst.mockResolvedValue(LGA_STUB);
      mockPrisma.attraction.findMany.mockResolvedValue([]);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.property.findMany.mockResolvedValue([]);

      const res = mockRes();
      await service.streamItinerary(dto, res as any);

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  // ── Legacy streamChat test (kept for regression) ──────────────────────────
  // NOTE: streamChat is replaced by streamChatWithTools in this plan.
  // This describe block tests streamChatWithTools using the same "write + end" shape.

  describe('streamChatWithTools — basic SSE output', () => {
    const makeSimpleRes = () => {
      const chunks: string[] = [];
      return {
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
        chunks,
      };
    };

    it('writes [DONE] to res and calls res.end() on end_turn', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockStreamFactory = () =>
        makeStream('end_turn', ['Hello from Ogun State!']);

      const res = makeSimpleRes();
      await service.streamChatWithTools('user-1', { messages: [{ role: 'user', content: 'Hi' }] } as any, res as any);

      expect(res.end).toHaveBeenCalled();
      expect(res.chunks.some((c: string) => c.includes('[DONE]'))).toBe(true);
    });

    it('calls vector.upsertInteraction exactly once after stream ends', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockStreamFactory = () => makeStream('end_turn', ['some response text']);

      const res = makeSimpleRes();
      await service.streamChatWithTools('user-1', { messages: [{ role: 'user', content: 'Hello?' }] } as any, res as any);

      expect(mockVector.upsertInteraction).toHaveBeenCalledTimes(1);
      expect(mockVector.upsertInteraction).toHaveBeenCalledWith('user-1', 'Hello?', expect.any(String));
    });

    it('calls vector.getPersonalisedContext with userId and last user message', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockStreamFactory = () => makeStream('end_turn', []);

      const res = makeSimpleRes();
      await service.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'What is there to see?' }] } as any,
        res as any,
      );

      expect(mockVector.getPersonalisedContext).toHaveBeenCalledWith('user-1', 'What is there to see?');
    });

    it('emits the existing AI-unavailable SSE error and never retries mid-stream when the connection call itself is rejected by resilience.execute', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      const res = makeSimpleRes();
      await service.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res as any,
      );

      expect(res.chunks.some((c: string) => c.includes('"error":"AI service unavailable"'))).toBe(true);
      expect(res.end).toHaveBeenCalled();
      expect(mockVector.upsertInteraction).not.toHaveBeenCalled();
    });

    it('forwards the EXACT AbortSignal instance cockatiel provides into messages.stream() options (reference-identity, WR-02)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockStreamFactory = () => makeStream('end_turn', ['hi']);

      const controller = new AbortController();
      mockResilience.execute.mockImplementationOnce(
        (_vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
          fn({ signal: controller.signal }),
      );

      const res = makeSimpleRes();
      await service.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res as any,
      );

      const mockedAnthropicInstance = (Anthropic as unknown as jest.Mock).mock.results[0].value;
      expect(mockedAnthropicInstance.messages.stream.mock.calls[0][1]?.signal).toBe(controller.signal);
    });
  });

  describe('streamChatWithTools — tool_use dispatch', () => {
    const makeSimpleRes = () => {
      const chunks: string[] = [];
      return {
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
        chunks,
      };
    };

    it('emits data:{tool:"get_attractions"} event and calls prisma.attraction.findMany on tool_use', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockPrisma.lGA.findFirst.mockResolvedValue(LGA_STUB);
      mockPrisma.attraction.findMany.mockResolvedValue([
        { id: 'a1', name: 'Olumo Rock', slug: 'olumo-rock', category: 'HISTORICAL', entryFee: 500, address: 'Abeokuta' },
      ]);

      // First call: tool_use, second call: end_turn
      let callCount = 0;
      mockStreamFactory = () => {
        if (callCount === 0) {
          callCount++;
          return makeStream('tool_use', [], [
            { type: 'tool_use', id: 'tu-1', name: 'get_attractions', input: { lgaSlug: 'abeokuta-south' } },
          ]);
        }
        return makeStream('end_turn', ['Here are the attractions.']);
      };

      const res = makeSimpleRes();
      await service.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Show me attractions in Abeokuta' }] } as any,
        res as any,
      );

      expect(mockPrisma.attraction.findMany).toHaveBeenCalled();
      const toolEvent = res.chunks.find((c: string) => c.includes('"tool":"get_attractions"'));
      expect(toolEvent).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('getRecommendations', () => {
    it('returns { context, suggestions: [] } and calls vector.getPersonalisedContext', async () => {
      mockVector.getPersonalisedContext.mockResolvedValue('User likes historical sites');

      const result = await service.getRecommendations('user-1', 'things to do in Abeokuta');

      expect(result).toEqual({ context: 'User likes historical sites', suggestions: [] });
      expect(mockVector.getPersonalisedContext).toHaveBeenCalledWith('user-1', 'things to do in Abeokuta');
    });
  });

  describe('executeTool stubs', () => {
    it('get_weather returns stub object with correct location', async () => {
      // Access private method via type cast
      const result = await (service as any).executeTool('get_weather', { location: 'Abeokuta' });
      expect(result).toMatchObject({ temperatureC: 29, condition: 'partly cloudy', location: 'Abeokuta', stub: true });
    });

    it('get_ride_estimate returns stub object', async () => {
      const result = await (service as any).executeTool('get_ride_estimate', { pickup: 'A', dropoff: 'B' });
      expect(result).toMatchObject({ estimateNgn: 1500, stub: true });
    });
  });

  describe('getLgaIntelligence', () => {
    it('returns {answer, lgaId} on success, routed through resilience.execute("anthropic", ...)', async () => {
      mockPrisma.lGA.findUnique.mockResolvedValue(LGA_STUB);

      const result = await service.getLgaIntelligence('lga-1', 'What is the tourism outlook?');

      expect(result).toEqual({ answer: 'LGA intelligence answer.', lgaId: 'lga-1' });
      expect(mockResilience.execute).toHaveBeenCalledWith('anthropic', expect.any(Function));
    });

    it('throws ServiceUnavailableException with a static message when resilience.execute rejects', async () => {
      mockPrisma.lGA.findUnique.mockResolvedValue(LGA_STUB);
      mockResilience.execute.mockRejectedValue(new Error('circuit open'));

      await expect(service.getLgaIntelligence('lga-1', 'What is the tourism outlook?')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('streamChatWithTools / streamItinerary — real cockatiel timeout + breaker engagement (CR-01 gap-closure regression, 11-REVIEW.md)', () => {
    let realAiService: AiService;
    let streamCallCount = 0;

    // A withResponse() that never settles — simulates a hung Anthropic connection.
    // The async iterator is never reached since production code awaits
    // withResponse() before returning the stream.
    const hungStream = () => {
      streamCallCount += 1;
      return {
        withResponse: jest.fn(() => new Promise(() => {})),
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: jest.fn(),
      };
    };

    const makeSseRes = () => {
      const chunks: string[] = [];
      return {
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
        chunks,
      };
    };

    const itineraryDto = {
      durationDays: 2,
      startLgaSlug: 'abeokuta-south',
      interests: ['history'],
      budgetNgn: 50000,
      partySize: 2,
    };

    beforeEach(async () => {
      jest.useFakeTimers();
      streamCallCount = 0;
      mockPrisma.user.findUnique.mockResolvedValue(USER_STUB);
      mockPrisma.lGA.findFirst.mockResolvedValue(LGA_STUB);
      mockPrisma.attraction.findMany.mockResolvedValue([]);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.property.findMany.mockResolvedValue([]);
      mockStreamFactory = () => hungStream();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: mockConfig },
          { provide: VectorService, useValue: mockVector },
          ResilienceService,
        ],
      }).compile();

      const realResilience = module.get<ResilienceService>(ResilienceService);
      await realResilience.onModuleInit();
      realAiService = module.get<AiService>(AiService);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('Test A: streamChatWithTools does not emit the SSE error before ~8000ms and does after advancing 8100ms of simulated time', async () => {
      const res = makeSseRes();
      const pending = realAiService.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res as any,
      );

      expect(res.chunks.some((c) => c.includes('"error":"AI service unavailable"'))).toBe(false);

      await jest.advanceTimersByTimeAsync(8100);
      await pending;

      expect(res.chunks.some((c) => c.includes('"error":"AI service unavailable"'))).toBe(true);
      expect(res.end).toHaveBeenCalled();
    });

    it('Test B: streamItinerary emits an event: error SSE frame only after advancing ~8000ms of simulated time', async () => {
      const res = makeSseRes();
      const pending = realAiService.streamItinerary(itineraryDto as any, res as any);

      expect(
        res.chunks.some((c) => c.includes('event: error') && c.includes('AI service unavailable')),
      ).toBe(false);

      await jest.advanceTimersByTimeAsync(8100);
      await pending;

      expect(
        res.chunks.some((c) => c.includes('event: error') && c.includes('AI service unavailable')),
      ).toBe(true);
    });

    it('Test C: after 3 consecutive hung-connection timeouts, the anthropic circuit breaker opens and a 4th call never invokes messages.stream again', async () => {
      // Call 1: hangs, times out at ~8000ms — breaker records failure #1.
      const res1 = makeSseRes();
      const pending1 = realAiService.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res1 as any,
      );
      await jest.advanceTimersByTimeAsync(8100);
      await pending1;

      // Call 2: hangs, times out at ~8000ms — breaker records failure #2.
      const res2 = makeSseRes();
      const pending2 = realAiService.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res2 as any,
      );
      await jest.advanceTimersByTimeAsync(8100);
      await pending2;

      // Call 3: hangs, times out at ~8000ms — breaker records failure #3, opens.
      const res3 = makeSseRes();
      const pending3 = realAiService.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res3 as any,
      );
      await jest.advanceTimersByTimeAsync(8100);
      await pending3;

      expect(streamCallCount).toBe(3);

      const res4 = makeSseRes();
      await realAiService.streamChatWithTools(
        'user-1',
        { messages: [{ role: 'user', content: 'Hi' }] } as any,
        res4 as any,
      );

      expect(streamCallCount).toBe(3);
    });
  });
});
