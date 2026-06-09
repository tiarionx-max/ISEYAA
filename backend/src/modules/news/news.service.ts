import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
