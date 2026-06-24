import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Prisma, TourPackage, TourPackageCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTourPackageDto, SettlementSplitEntryDto } from './dto/create-tour-package.dto';
import { UpdateTourPackageDto } from './dto/update-tour-package.dto';
import { AdminDecideTourPackageDto } from './dto/admin-decide-package.dto';
import { CreateFromAiSuggestionDto } from './dto/create-from-ai-suggestion.dto';

/** Mirrors marketplace.service.slugify */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Public detail projection — includes guide profile + LGA name/slug.
 * attractions, property, events are NOT direct Prisma relations on TourPackage
 * (they're stored as string[] / nullable string). findBySlug hydrates them via
 * parallel queries after the package fetch.
 */
const PACKAGE_PUBLIC_INCLUDE = {
  lga: { select: { name: true, slug: true } },
  tourGuide: {
    select: {
      id: true,
      bio: true,
      yearsExperience: true,
      languagesSpoken: true,
      rating: true,
      reviewCount: true,
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.TourPackageInclude;

@Injectable()
export class TourPackageService {
  private readonly logger = new Logger(TourPackageService.name);

  constructor(private prisma: PrismaService) {}

  // ── Standard (guide-authored) create path ─────────────────────────────────

  /**
   * Creates a guide-authored TourPackage in DRAFT status.
   * Subject to ALL 8 validation guards. Bypassed by createFromAiSuggestion.
   */
  async create(actorUserId: string, dto: CreateTourPackageDto): Promise<TourPackage> {
    // Guard 1: guide must be APPROVED + owned by the actor
    // NOTE: 09-03 will expose TourGuideService.findByIdInternal; we use prisma directly
    // here to avoid coupling to 09-03's parallel-wave module. Semantics are identical.
    const guide = await this.prisma.tourGuide.findFirst({
      where: { id: dto.tourGuideId, deletedAt: null },
      select: { id: true, userId: true, status: true },
    });
    if (!guide) throw new NotFoundException('Tour guide not found');
    if (guide.userId !== actorUserId) {
      throw new ForbiddenException('You can only create packages for your own guide profile');
    }
    if (guide.status !== 'APPROVED') {
      throw new ForbiddenException('Only approved tour guides can list packages');
    }

    // Guard 2: at least 1 attraction (DTO enforces array min); each must resolve
    const attractions = await this.prisma.attraction.findMany({
      where: { id: { in: dto.attractionIds }, deletedAt: null },
      select: { id: true },
    });
    if (attractions.length !== dto.attractionIds.length) {
      const found = new Set(attractions.map((a) => a.id));
      const missing = dto.attractionIds.filter((id) => !found.has(id));
      throw new BadRequestException(`Unknown attraction(s): ${missing.join(', ')}`);
    }

    // Guard 3: optional propertyId resolves
    if (dto.propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: dto.propertyId, deletedAt: null },
        select: { id: true },
      });
      if (!property) throw new BadRequestException(`Unknown property: ${dto.propertyId}`);
    }

    // Guard 4: optional eventIds resolve
    if (dto.eventIds?.length) {
      const events = await this.prisma.event.findMany({
        where: { id: { in: dto.eventIds }, deletedAt: null },
        select: { id: true },
      });
      if (events.length !== dto.eventIds.length) {
        throw new BadRequestException('One or more event IDs are unknown');
      }
    }

    // Guard 5: settlementSplit sum <= 100 (DB CHECK is second line of defence)
    const splitSum = dto.settlementSplit.reduce((s, e) => s + e.percentage, 0);
    if (splitSum > 100) {
      throw new BadRequestException(`Settlement split sums to ${splitSum}% — must be ≤ 100`);
    }

    // Guard 6: each settlementSplit entry's vendorId resolves to a wallet anchor
    await this.validateSplitEntries(dto.settlementSplit);

    // Guard 7: category enum already validated by DTO

    // Guard 8: itineraryTemplate ascending-hour cross-field check
    const hours = dto.itineraryTemplate.map((i) => i.hour);
    if (!hours.every((h, i, arr) => i === 0 || h >= arr[i - 1])) {
      throw new BadRequestException('itineraryTemplate must be ordered by ascending hour');
    }

    const slug = `${slugify(dto.name)}-${uuidv4().slice(0, 8)}`;

    return this.prisma.tourPackage.create({
      data: {
        slug,
        lgaId: dto.lgaId,
        tourGuideId: dto.tourGuideId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        durationHours: dto.durationHours,
        maxGroupSize: dto.maxGroupSize,
        coverImageUrl: dto.coverImageUrl,
        imageUrls: dto.imageUrls ?? [],
        attractionIds: dto.attractionIds,
        propertyId: dto.propertyId ?? null,
        eventIds: dto.eventIds ?? [],
        transportNote: dto.transportNote,
        itineraryTemplate: dto.itineraryTemplate as any,
        settlementSplit: dto.settlementSplit as any,
        status: 'DRAFT',
      },
    });
  }

  // ── AI bridge — Save-as-bookable (PLAN-CHECK M1) ──────────────────────────

  /**
   * Creates a minimal DRAFT TourPackage from a free-text AI suggestion.
   *
   * Backend half of SC5 "Save as bookable" (frontend lives in 09-09 Task 4).
   * NOT subject to the 8 standard-create guards — by definition we don't yet
   * have a guide/attraction/split to validate. The DRAFT is invisible to public
   * search (findAll filters status=APPROVED) until an APPROVED guide claims it,
   * fills in real fields, and admin approves.
   *
   * Schema notes (09-01):
   *  - tourGuideId is nullable (set null here; guide claims later)
   *  - lgaId is nullable (set null here; guide picks an LGA on claim)
   *  - settlementSplit = [] satisfies the DB CHECK constraint (sum of empty = 0)
   */
  async createFromAiSuggestion(
    actorUserId: string,
    dto: CreateFromAiSuggestionDto,
  ): Promise<TourPackage> {
    const slug = `${slugify(dto.title)}-ai-${uuidv4().slice(0, 8)}`;

    return this.prisma.tourPackage.create({
      data: {
        slug,
        lgaId: null,
        tourGuideId: null,
        name: dto.title,
        description: dto.description,
        category: 'CULTURAL', // default; guide changes on claim
        price: 0, // placeholder
        durationHours: 1, // placeholder min satisfying any DB CHECK
        maxGroupSize: 1, // placeholder min
        coverImageUrl: null,
        imageUrls: [],
        attractionIds: [],
        propertyId: null,
        eventIds: [],
        transportNote: null,
        itineraryTemplate: [
          { hour: 0, title: 'AI suggestion', description: dto.suggestedItinerary },
        ] as any,
        settlementSplit: [] as any,
        status: 'DRAFT',
        metadata: {
          source: 'ai-suggestion',
          aiSourceConversationId: dto.aiConversationId ?? null,
          aiSourceUserId: actorUserId,
          createdAt: new Date().toISOString(),
        } as any,
      },
    });
  }

  // ── Split validation helper ───────────────────────────────────────────────

  private async validateSplitEntries(entries: SettlementSplitEntryDto[]): Promise<void> {
    for (const e of entries) {
      switch (e.vendorType) {
        case 'GUIDE': {
          const g = await this.prisma.tourGuide.findFirst({
            where: { id: e.vendorId, deletedAt: null },
            select: { id: true },
          });
          if (!g) throw new BadRequestException(`Settlement split: unknown tour guide ${e.vendorId}`);
          break;
        }
        case 'HOST': {
          const p = await this.prisma.property.findFirst({
            where: { id: e.vendorId, deletedAt: null },
            select: { hostId: true },
          });
          if (!p) throw new BadRequestException(`Settlement split: unknown property ${e.vendorId}`);
          if (!p.hostId) {
            throw new BadRequestException(
              `Property ${e.vendorId} has no hostId — cannot route HOST commission`,
            );
          }
          const w = await this.prisma.wallet.findUnique({ where: { userId: p.hostId } });
          if (!w) throw new BadRequestException(`Host wallet not found for property ${e.vendorId}`);
          break;
        }
        case 'ORGANISER': {
          const ev = await this.prisma.event.findFirst({
            where: { id: e.vendorId, deletedAt: null },
            select: { organizerId: true },
          });
          if (!ev) throw new BadRequestException(`Settlement split: unknown event ${e.vendorId}`);
          const w = await this.prisma.wallet.findUnique({ where: { userId: ev.organizerId } });
          if (!w) throw new BadRequestException(`Organiser wallet not found for event ${e.vendorId}`);
          break;
        }
        case 'ATTRACTION': {
          // V1: attraction commissions route to PlatformConfig 'tour.government_wallet_user_id'
          // (resolved at booking time by 09-06 settlement engine). Validate the attraction
          // exists; do NOT require a Wallet here — CONTEXT §Specifics flags this v1 behavior.
          const a = await this.prisma.attraction.findFirst({
            where: { id: e.vendorId, deletedAt: null },
            select: { id: true },
          });
          if (!a) throw new BadRequestException(`Settlement split: unknown attraction ${e.vendorId}`);
          break;
        }
      }
    }
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /**
   * Returns packages owned by the actor — either by tourGuide.userId match OR
   * by metadata.aiSourceUserId match (so AI-seeded DRAFTs show in "My drafts").
   */
  async findOwn(userId: string): Promise<TourPackage[]> {
    const guide = await this.prisma.tourGuide.findUnique({
      where: { userId },
      select: { id: true },
    });
    return this.prisma.tourPackage.findMany({
      where: {
        deletedAt: null,
        OR: [
          guide ? { tourGuideId: guide.id } : { id: '__never__' },
          { metadata: { path: ['aiSourceUserId'], equals: userId } as any },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * PUBLIC list — unconditionally filters status=APPROVED.
   * AI-seeded DRAFTs (createFromAiSuggestion) are invisible here.
   */
  findAll(filters: {
    category?: TourPackageCategory;
    lgaId?: string;
    tourGuideId?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, lgaId, tourGuideId, q, page = 1, limit = 24 } = filters;
    return this.prisma.tourPackage.findMany({
      where: {
        deletedAt: null,
        status: 'APPROVED', // PUBLIC filter — AI-seeded DRAFTs excluded
        ...(category && { category }),
        ...(lgaId && { lgaId }),
        ...(tourGuideId && { tourGuideId }),
        ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
      },
      include: PACKAGE_PUBLIC_INCLUDE,
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }

  async findBySlug(slug: string) {
    const pkg = await this.prisma.tourPackage.findFirst({
      where: { slug, status: 'APPROVED', deletedAt: null },
      include: PACKAGE_PUBLIC_INCLUDE,
    });
    if (!pkg) throw new NotFoundException('Tour package not found');

    const [attractions, property, events] = await Promise.all([
      pkg.attractionIds.length
        ? this.prisma.attraction.findMany({
            where: { id: { in: pkg.attractionIds }, deletedAt: null },
          })
        : [],
      pkg.propertyId
        ? this.prisma.property.findUnique({ where: { id: pkg.propertyId } })
        : null,
      pkg.eventIds?.length
        ? this.prisma.event.findMany({
            where: { id: { in: pkg.eventIds }, deletedAt: null },
          })
        : [],
    ]);

    return { ...pkg, attractions, property, events };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async update(id: string, actorUserId: string, dto: UpdateTourPackageDto) {
    const pkg = await this.prisma.tourPackage.findFirst({ where: { id, deletedAt: null } });
    if (!pkg) throw new NotFoundException('Tour package not found');

    const guide = pkg.tourGuideId
      ? await this.prisma.tourGuide.findUnique({ where: { id: pkg.tourGuideId } })
      : null;
    if (!guide || guide.userId !== actorUserId) {
      throw new ForbiddenException('Not your package');
    }
    if (pkg.status === 'APPROVED') {
      throw new ConflictException(
        'Cannot edit an APPROVED package — clone it to create a new version (versioning is a deferred feature)',
      );
    }

    // Re-run partial validation if attractions / property / events / split changed
    if (
      dto.attractionIds ||
      dto.propertyId !== undefined ||
      dto.eventIds ||
      dto.settlementSplit
    ) {
      const splitForCheck =
        dto.settlementSplit ?? (pkg.settlementSplit as unknown as SettlementSplitEntryDto[]) ?? [];
      const splitSum = splitForCheck.reduce((s, e) => s + (e?.percentage ?? 0), 0);
      if (splitSum > 100) {
        throw new BadRequestException(`Settlement split sums to ${splitSum}% — must be ≤ 100`);
      }
      await this.validateSplitEntries(splitForCheck);
    }

    return this.prisma.tourPackage.update({
      where: { id },
      data: {
        ...dto,
        itineraryTemplate: dto.itineraryTemplate as any,
        settlementSplit: dto.settlementSplit as any,
        // PENDING|REJECTED edits revert to DRAFT (guide must explicitly re-submit)
        status: pkg.status === 'PENDING' || pkg.status === 'REJECTED' ? 'DRAFT' : pkg.status,
      },
    });
  }

  async submitForReview(id: string, actorUserId: string) {
    const pkg = await this.prisma.tourPackage.findFirst({ where: { id, deletedAt: null } });
    if (!pkg) throw new NotFoundException('Tour package not found');

    const guide = pkg.tourGuideId
      ? await this.prisma.tourGuide.findUnique({ where: { id: pkg.tourGuideId } })
      : null;
    if (!guide || guide.userId !== actorUserId) {
      throw new ForbiddenException('Not your package');
    }

    // Status-transition guard: cannot submit unclaimed AI DRAFT — must have
    // both tourGuideId and lgaId populated before DRAFT → PENDING.
    if (!pkg.tourGuideId || !pkg.lgaId) {
      throw new BadRequestException(
        'Cannot submit package — tourGuideId and lgaId must be populated (claim the AI draft first)',
      );
    }

    if (pkg.status !== 'DRAFT' && pkg.status !== 'REJECTED') {
      throw new ConflictException(`Cannot submit package in status ${pkg.status}`);
    }
    return this.prisma.tourPackage.update({ where: { id }, data: { status: 'PENDING' } });
  }

  async softDelete(id: string, actorUserId: string) {
    const pkg = await this.prisma.tourPackage.findFirst({ where: { id, deletedAt: null } });
    if (!pkg) throw new NotFoundException('Tour package not found');

    const guide = pkg.tourGuideId
      ? await this.prisma.tourGuide.findUnique({ where: { id: pkg.tourGuideId } })
      : null;
    // Permit deletion of owned AI-seeded DRAFT (no guide yet) by aiSourceUserId match
    const meta = (pkg.metadata as any) ?? {};
    const isAiOwner = meta.aiSourceUserId === actorUserId;
    if ((!guide || guide.userId !== actorUserId) && !isAiOwner) {
      throw new ForbiddenException('Not your package');
    }
    if (pkg.status === 'APPROVED') {
      throw new ConflictException('Cannot delete an APPROVED package with bookings — contact admin');
    }
    await this.prisma.tourPackage.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  findPendingQueue(opts: { page?: number; limit?: number }) {
    const { page = 1, limit = 24 } = opts;
    return this.prisma.tourPackage.findMany({
      where: { status: 'PENDING', deletedAt: null },
      include: PACKAGE_PUBLIC_INCLUDE,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }

  async adminDecide(id: string, dto: AdminDecideTourPackageDto, actorId: string) {
    const pkg = await this.prisma.tourPackage.findFirst({ where: { id, deletedAt: null } });
    if (!pkg) throw new NotFoundException('Tour package not found');
    if (pkg.status !== 'PENDING') {
      throw new ConflictException(`Cannot decide package in status ${pkg.status}`);
    }
    return this.prisma.tourPackage.update({
      where: { id },
      data: {
        status: dto.decision,
        metadata: {
          ...((pkg.metadata as any) ?? {}),
          adminDecision: {
            decision: dto.decision,
            reason: dto.reason ?? null,
            actorId,
            at: new Date().toISOString(),
          },
        },
      },
    });
  }

  // ── Internal contract for 09-05 booking validation ────────────────────────

  /**
   * Used by TourBookingService (09-05) to fetch the package shape needed
   * for booking validation (price, durationHours, maxGroupSize, settlementSplit).
   */
  async findByIdInternal(id: string) {
    return this.prisma.tourPackage.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        slug: true,
        status: true,
        tourGuideId: true,
        price: true,
        durationHours: true,
        maxGroupSize: true,
        attractionIds: true,
        propertyId: true,
        eventIds: true,
        itineraryTemplate: true,
        settlementSplit: true,
        name: true,
      },
    });
  }
}
