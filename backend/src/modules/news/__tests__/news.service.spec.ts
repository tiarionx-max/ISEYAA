import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NewsService } from '../news.service';
import { PrismaService } from '../../../prisma/prisma.service';

const NEWS_ID = 'news-uuid-001';

const mockNewsItem = {
  id: NEWS_ID,
  headline: 'Olumo Rock reopens after renovation',
  summary: 'A major tourism upgrade',
  link: null,
  source: 'Ogun State Gov',
  category: 'tourism',
  imageUrl: null,
  publishedAt: new Date('2026-07-01T00:00:00Z'),
  isLive: true,
  isPriority: false,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  deletedAt: null,
};

const mockPrisma = {
  newsItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

describe('NewsService', () => {
  let service: NewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NewsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<NewsService>(NewsService);
  });

  describe('findLatest', () => {
    it('only returns isLive + non-deleted rows, priority-first then newest', async () => {
      mockPrisma.newsItem.findMany.mockResolvedValue([mockNewsItem]);

      await service.findLatest(20);

      expect(mockPrisma.newsItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, isLive: true },
          orderBy: [{ isPriority: 'desc' }, { publishedAt: 'desc' }],
          take: 20,
        }),
      );
    });

    it('filters by category when provided', async () => {
      mockPrisma.newsItem.findMany.mockResolvedValue([]);
      await service.findLatest(20, 'tourism');
      expect(mockPrisma.newsItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, isLive: true, category: 'tourism' },
        }),
      );
    });
  });

  describe('findAllAdmin', () => {
    it('returns paginated non-deleted rows regardless of isLive', async () => {
      mockPrisma.newsItem.findMany.mockResolvedValue([mockNewsItem]);
      mockPrisma.newsItem.count.mockResolvedValue(1);

      const result = await service.findAllAdmin({ page: 1, limit: 24 });

      expect(mockPrisma.newsItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      expect(result).toEqual({
        data: [mockNewsItem],
        pagination: { page: 1, limit: 24, total: 1, pages: 1 },
      });
    });
  });

  describe('create', () => {
    it('creates a news item defaulting isLive=true, isPriority=false', async () => {
      mockPrisma.newsItem.create.mockResolvedValue(mockNewsItem);

      await service.create({ headline: 'Test headline' });

      expect(mockPrisma.newsItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          headline: 'Test headline',
          isLive: true,
          isPriority: false,
        }),
      });
    });

    it('respects an explicit isLive=false', async () => {
      mockPrisma.newsItem.create.mockResolvedValue({ ...mockNewsItem, isLive: false });

      await service.create({ headline: 'Draft item', isLive: false });

      expect(mockPrisma.newsItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isLive: false }),
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the item does not exist', async () => {
      mockPrisma.newsItem.findFirst.mockResolvedValue(null);
      await expect(service.update('missing-id', { headline: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.newsItem.update).not.toHaveBeenCalled();
    });

    it('only patches supplied fields, e.g. toggling isLive alone', async () => {
      mockPrisma.newsItem.findFirst.mockResolvedValue(mockNewsItem);
      mockPrisma.newsItem.update.mockResolvedValue({ ...mockNewsItem, isLive: false });

      await service.update(NEWS_ID, { isLive: false });

      expect(mockPrisma.newsItem.update).toHaveBeenCalledWith({
        where: { id: NEWS_ID },
        data: { isLive: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the item does not exist', async () => {
      mockPrisma.newsItem.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.newsItem.update).not.toHaveBeenCalled();
    });

    it('soft-deletes by setting deletedAt', async () => {
      mockPrisma.newsItem.findFirst.mockResolvedValue(mockNewsItem);
      mockPrisma.newsItem.update.mockResolvedValue({ ...mockNewsItem, deletedAt: new Date() });

      await service.remove(NEWS_ID);

      expect(mockPrisma.newsItem.update).toHaveBeenCalledWith({
        where: { id: NEWS_ID },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
