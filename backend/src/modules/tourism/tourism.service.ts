import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const NEARBY_RADIUS_KM = 10;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface FindAllFilters {
  lgaId?: string;
  category?: string;
  freeEntryOnly?: boolean;
  search?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
}

@Injectable()
export class TourismService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FindAllFilters) {
    const { lgaId, category, freeEntryOnly, search, lat, lng, radius = NEARBY_RADIUS_KM, limit } = filters;
    const isNearSearch = lat !== undefined && lng !== undefined;

    const latDiff = radius / 111.0;
    const lngDiff = radius / (111.0 * Math.cos((lat ?? 0) * Math.PI / 180));

    const attractions = await this.prisma.attraction.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(lgaId && { lgaId }),
        ...(category && { category: category as any }),
        ...(freeEntryOnly && {
          OR: [{ entryFee: null }, { entryFee: { lte: 0 } }],
        }),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
        ...(isNearSearch && {
          latitude: { gte: lat! - latDiff, lte: lat! + latDiff } as any,
          longitude: { gte: lng! - lngDiff, lte: lng! + lngDiff } as any,
        }),
      },
      include: { lga: { select: { name: true, slug: true } } },
      orderBy: { name: 'asc' },
      // Only safe to cap in the DB query for the non-proximity path — the near-search
      // path below over-fetches the bounding box then re-sorts/filters by exact
      // haversine distance, so `limit` there must apply after that re-sort instead
      // (applying it here would truncate before the true nearest-N are known).
      ...(!isNearSearch && limit ? { take: limit } : {}),
    });

    if (!isNearSearch) return attractions;

    const sorted = attractions
      .map((a) => ({
        ...a,
        distanceKm:
          a.latitude && a.longitude
            ? Math.round(haversineKm(lat!, lng!, Number(a.latitude), Number(a.longitude)) * 10) / 10
            : null,
      }))
      .filter((a) => a.distanceKm !== null && a.distanceKm <= radius)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

    return limit ? sorted.slice(0, limit) : sorted;
  }

  async findById(id: string) {
    const attraction = await this.prisma.attraction.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: { lga: true },
    });
    if (!attraction) throw new NotFoundException('Attraction not found');

    const [nearbyEvents, nearbyStays] = await Promise.all([
      this.findNearbyEvents(attraction.latitude, attraction.longitude),
      this.findNearbyStays(attraction.latitude, attraction.longitude),
    ]);

    return { ...attraction, nearbyEvents, nearbyStays };
  }

  private async findNearbyEvents(lat: any, lng: any) {
    if (!lat || !lng) return [];
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const latDiff = NEARBY_RADIUS_KM / 111.0;
    const lngDiff = NEARBY_RADIUS_KM / (111.0 * Math.cos((latNum * Math.PI) / 180));

    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APPROVED', 'PUBLISHED'] as any },
        startDate: { gte: new Date() },
        latitude: { gte: latNum - latDiff, lte: latNum + latDiff } as any,
        longitude: { gte: lngNum - lngDiff, lte: lngNum + lngDiff } as any,
      },
      select: { id: true, title: true, slug: true, startDate: true, venue: true, latitude: true, longitude: true },
      take: 5,
    });

    return events
      .map((e) => ({
        ...e,
        distanceKm:
          e.latitude && e.longitude
            ? Math.round(haversineKm(latNum, lngNum, Number(e.latitude), Number(e.longitude)) * 10) / 10
            : null,
        platformLink: `/api/v1/events/${e.slug}`,
      }))
      .filter((e) => e.distanceKm !== null && e.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }

  private async findNearbyStays(lat: any, lng: any) {
    if (!lat || !lng) return [];
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const latDiff = NEARBY_RADIUS_KM / 111.0;
    const lngDiff = NEARBY_RADIUS_KM / (111.0 * Math.cos((latNum * Math.PI) / 180));

    const properties = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        latitude: { gte: latNum - latDiff, lte: latNum + latDiff } as any,
        longitude: { gte: lngNum - lngDiff, lte: lngNum + lngDiff } as any,
      },
      select: { id: true, name: true, slug: true, type: true, pricePerNight: true, latitude: true, longitude: true },
      take: 5,
    });

    return properties
      .map((p) => ({
        ...p,
        distanceKm:
          p.latitude && p.longitude
            ? Math.round(haversineKm(latNum, lngNum, Number(p.latitude), Number(p.longitude)) * 10) / 10
            : null,
        platformLink: `/api/v1/stays/${p.slug}`,
      }))
      .filter((p) => p.distanceKm !== null && p.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
  }

  async toggleBookmark(userId: string, attractionId: string) {
    const attraction = await this.prisma.attraction.findFirst({
      where: { id: attractionId, deletedAt: null },
    });
    if (!attraction) throw new NotFoundException('Attraction not found');

    const existing = await this.prisma.attractionBookmark.findUnique({
      where: { userId_attractionId: { userId, attractionId } },
    });

    if (existing) {
      await this.prisma.attractionBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false, attractionId };
    }

    await this.prisma.attractionBookmark.create({ data: { userId, attractionId } });
    return { bookmarked: true, attractionId };
  }

  async getUserBookmarks(userId: string) {
    const bookmarks = await this.prisma.attractionBookmark.findMany({
      where: { userId },
      include: {
        attraction: {
          include: { lga: { select: { name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookmarks.map((b) => b.attraction);
  }
}
