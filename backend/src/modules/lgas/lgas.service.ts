import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const LGA_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  latitude: true,
  longitude: true,
  isActive: true,
  metadata: true,
  _count: { select: { attractions: true } },
};

@Injectable()
export class LgasService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.lGA.findMany({
      where: { isActive: true, deletedAt: null },
      select: LGA_LIST_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const lga = await this.prisma.lGA.findFirst({
      where: { slug, deletedAt: null },
      include: {
        _count: { select: { attractions: { where: { isActive: true, deletedAt: null } } } },
      },
    });
    if (!lga) throw new NotFoundException(`LGA '${slug}' not found`);
    return lga;
  }

  async findAttractionsByLga(slug: string, page: number, limit: number) {
    const lga = await this.prisma.lGA.findFirst({ where: { slug, deletedAt: null } });
    if (!lga) throw new NotFoundException(`LGA '${slug}' not found`);

    const where = { lgaId: lga.id, isActive: true, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.attraction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: true,
          imageUrls: true,
          latitude: true,
          longitude: true,
          address: true,
          entryFee: true,
          metadata: true,
        },
      }),
      this.prisma.attraction.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
