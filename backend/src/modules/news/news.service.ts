import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

@Injectable()
export class NewsService {
  constructor(private prisma: PrismaService) {}

  async findLatest(limit = 20, category?: string) {
    return this.prisma.newsItem.findMany({
      where: {
        deletedAt: null,
        isLive: true,
        ...(category && { category }),
      },
      orderBy: [{ isPriority: 'desc' }, { publishedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        headline: true,
        summary: true,
        link: true,
        source: true,
        category: true,
        imageUrl: true,
        publishedAt: true,
        isPriority: true,
      },
    });
  }

  // ── Admin CRUD/moderation ────────────────────────────────────────────────
  // NewsItem's isLive/isPriority/deletedAt columns existed in the schema with
  // no write path at all — findLatest() and the news-service gRPC facade only
  // ever read. These methods are the missing admin surface (LGA_ADMIN+ per
  // the controller's @Roles gate).

  /** Admin listing — includes non-live and priority items, newest first. */
  async findAllAdmin(opts: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 24));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.newsItem.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.newsItem.count({ where: { deletedAt: null } }),
    ]);

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async create(dto: CreateNewsDto) {
    return this.prisma.newsItem.create({
      data: {
        headline: dto.headline,
        summary: dto.summary ?? null,
        link: dto.link ?? null,
        source: dto.source ?? null,
        category: dto.category ?? null,
        imageUrl: dto.imageUrl ?? null,
        isLive: dto.isLive ?? true,
        isPriority: dto.isPriority ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateNewsDto) {
    const existing = await this.prisma.newsItem.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('News item not found');

    return this.prisma.newsItem.update({
      where: { id },
      data: {
        ...(dto.headline !== undefined && { headline: dto.headline }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.isLive !== undefined && { isLive: dto.isLive }),
        ...(dto.isPriority !== undefined && { isPriority: dto.isPriority }),
      },
    });
  }

  /** Soft delete — matches the deletedAt-based pattern used across the codebase. */
  async remove(id: string) {
    const existing = await this.prisma.newsItem.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('News item not found');

    return this.prisma.newsItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
