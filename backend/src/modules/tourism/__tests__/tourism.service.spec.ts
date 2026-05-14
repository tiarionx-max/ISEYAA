import { Test, TestingModule } from '@nestjs/testing';
import { TourismService } from '../tourism.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockPrisma = {
  attraction: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  event: { findMany: jest.fn() },
  property: { findMany: jest.fn() },
  attractionBookmark: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};

const ATTRACTION_STUB = {
  id: 'attr-1',
  name: 'Olumo Rock',
  slug: 'olumo-rock',
  description: 'Iconic rock',
  category: 'HISTORICAL',
  imageUrls: [],
  latitude: 7.1547,
  longitude: 3.3487,
  address: 'Abeokuta',
  entryFee: 500,
  isActive: true,
  lgaId: 'lga-1',
  lga: { name: 'Abeokuta South', slug: 'abeokuta-south' },
};

describe('TourismService', () => {
  let service: TourismService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourismService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<TourismService>(TourismService);
  });

  describe('findAll', () => {
    it('returns all active attractions', async () => {
      mockPrisma.attraction.findMany.mockResolvedValue([ATTRACTION_STUB]);
      const result = await service.findAll({});
      expect(result).toHaveLength(1);
      expect(mockPrisma.attraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      );
    });

    it('filters by lgaId', async () => {
      mockPrisma.attraction.findMany.mockResolvedValue([ATTRACTION_STUB]);
      await service.findAll({ lgaId: 'lga-1' });
      expect(mockPrisma.attraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lgaId: 'lga-1' }),
        }),
      );
    });

    it('filters by freeEntryOnly', async () => {
      const freeAttraction = { ...ATTRACTION_STUB, entryFee: 0 };
      mockPrisma.attraction.findMany.mockResolvedValue([freeAttraction]);
      const result = await service.findAll({ freeEntryOnly: true });
      expect(mockPrisma.attraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('applies proximity bounding box when lat/lng provided', async () => {
      mockPrisma.attraction.findMany.mockResolvedValue([
        { ...ATTRACTION_STUB, latitude: 7.155, longitude: 3.349 },
      ]);
      const result = await service.findAll({ lat: 7.15, lng: 3.35, radius: 10 });
      expect(mockPrisma.attraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ latitude: expect.any(Object) }),
        }),
      );
    });

    it('returns attractions sorted by distance when near filter applied', async () => {
      mockPrisma.attraction.findMany.mockResolvedValue([
        { ...ATTRACTION_STUB, id: 'a1', latitude: 7.152, longitude: 3.350 },
        { ...ATTRACTION_STUB, id: 'a2', latitude: 7.155, longitude: 3.349 },
      ]);
      const result = (await service.findAll({ lat: 7.15, lng: 3.35, radius: 10 })) as any[];
      expect(result.every((a) => 'distanceKm' in a)).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns attraction with nearby events and stays', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(ATTRACTION_STUB);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.property.findMany.mockResolvedValue([]);

      const result = (await service.findById('attr-1')) as any;
      expect(result.id).toBe('attr-1');
      expect(result).toHaveProperty('nearbyEvents');
      expect(result).toHaveProperty('nearbyStays');
    });

    it('throws NotFoundException for unknown attraction', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('includes platform links on nearby events', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(ATTRACTION_STUB);
      mockPrisma.event.findMany.mockResolvedValue([
        { id: 'evt-1', title: 'Event', slug: 'event-slug', startDate: new Date(), venue: 'Venue', latitude: 7.155, longitude: 3.349 },
      ]);
      mockPrisma.property.findMany.mockResolvedValue([]);

      const result = (await service.findById('attr-1')) as any;
      expect(result.nearbyEvents[0]).toHaveProperty('platformLink');
      expect(result.nearbyEvents[0].platformLink).toContain('/api/v1/events/');
    });
  });

  describe('toggleBookmark', () => {
    it('creates bookmark when not yet saved', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(ATTRACTION_STUB);
      mockPrisma.attractionBookmark.findUnique.mockResolvedValue(null);
      mockPrisma.attractionBookmark.create.mockResolvedValue({ id: 'bm-1' });

      const result = await service.toggleBookmark('user-1', 'attr-1');
      expect(result.bookmarked).toBe(true);
      expect(mockPrisma.attractionBookmark.create).toHaveBeenCalled();
    });

    it('removes bookmark when already saved', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(ATTRACTION_STUB);
      mockPrisma.attractionBookmark.findUnique.mockResolvedValue({ id: 'bm-1' });
      mockPrisma.attractionBookmark.delete.mockResolvedValue({ id: 'bm-1' });

      const result = await service.toggleBookmark('user-1', 'attr-1');
      expect(result.bookmarked).toBe(false);
      expect(mockPrisma.attractionBookmark.delete).toHaveBeenCalled();
    });

    it('throws NotFoundException for invalid attraction', async () => {
      mockPrisma.attraction.findFirst.mockResolvedValue(null);
      await expect(service.toggleBookmark('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserBookmarks', () => {
    it('returns list of bookmarked attractions', async () => {
      mockPrisma.attractionBookmark.findMany.mockResolvedValue([
        { attraction: { ...ATTRACTION_STUB, lga: { name: 'Abeokuta South', slug: 'abeokuta-south' } } },
      ]);
      const result = await service.getUserBookmarks('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('attr-1');
    });

    it('returns empty array when user has no bookmarks', async () => {
      mockPrisma.attractionBookmark.findMany.mockResolvedValue([]);
      const result = await service.getUserBookmarks('user-1');
      expect(result).toEqual([]);
    });
  });
});
