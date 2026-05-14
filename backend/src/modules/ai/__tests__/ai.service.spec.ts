import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../ai.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// Mock the Anthropic SDK entirely
const mockStream = {
  [Symbol.asyncIterator]: async function* () {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"title":"Test Itinerary",' } };
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '"overview":"Great trip","days":[],' } };
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '"total_budget_estimate_ngn":50000,"tips":["Enjoy!"]}' } };
  },
};

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: jest.fn().mockReturnValue(mockStream),
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
  attraction: { findMany: jest.fn() },
  event: { findMany: jest.fn() },
  property: { findMany: jest.fn() },
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'ANTHROPIC_API_KEY') return 'test-key';
    return undefined;
  }),
};

const LGA_STUB = {
  id: 'lga-1',
  name: 'Abeokuta South',
  slug: 'abeokuta-south',
  metadata: { history: 'Ancient Egba settlement.' },
};

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AiService>(AiService);
  });

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

  describe('streamChat', () => {
    it('writes SSE data and ends response', async () => {
      const chunks: string[] = [];
      const res = {
        write: jest.fn((chunk: string) => chunks.push(chunk)),
        end: jest.fn(),
      };

      await service.streamChat('user-1', 'Tell me about Olumo Rock', res as any);
      expect(res.end).toHaveBeenCalled();
      expect(chunks.some((c) => c.includes('"text"'))).toBe(true);
    });
  });
});
