import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { DojahService } from '../../common/services/dojah.service';
import { CreateTourGuideDto } from './dto/create-tour-guide.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { ApproveTourGuideDto } from './dto/approve-tour-guide.dto';

export type TourGuideStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Public projection — strips ALL KYC fields. Used for every public-facing
 * endpoint (`GET /tour-guides`, `GET /tour-guides/:id`). `ninCiphertext`,
 * `ninHash`, `kycTier` are NEVER returned via these endpoints.
 */
const PUBLIC_GUIDE_SELECT = {
  id: true,
  userId: true,
  bio: true,
  yearsExperience: true,
  languagesSpoken: true,
  certifications: true,
  rating: true,
  reviewCount: true,
  status: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true, avatarUrl: true } },
} as const;

/** Owner-facing projection — includes kycTier + status but never raw NIN. */
const PRIVATE_GUIDE_SELECT = {
  ...PUBLIC_GUIDE_SELECT,
  kycTier: true,
  availability: true,
  updatedAt: true,
} as const;

interface AvailabilityShape {
  blockedDates: string[];
  weeklyOffDays: number[];
}

const EMPTY_AVAILABILITY: AvailabilityShape = { blockedDates: [], weeklyOffDays: [] };

@Injectable()
export class TourGuideService {
  private readonly logger = new Logger(TourGuideService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly dojah: DojahService,
  ) {}

  // ── Profile (CRUD) ──────────────────────────────────────────────────────────

  /**
   * Upsert the caller's own TourGuide profile. The TourGuide row must already
   * exist (created by `users.becomeGuide`). Throws ForbiddenException if the
   * caller never ran become-guide.
   *
   * `certifications` arrive as publicUrls from 09-02 UploadService — never raw bytes.
   */
  async upsertOwnProfile(userId: string, dto: CreateTourGuideDto) {
    const existing = await this.prisma.tourGuide.findUnique({ where: { userId } });
    if (!existing) {
      throw new ForbiddenException(
        'TourGuide profile not found — call POST /users/me/become-guide first',
      );
    }
    return this.prisma.tourGuide.update({
      where: { userId },
      data: {
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.yearsExperience !== undefined && { yearsExperience: dto.yearsExperience }),
        ...(dto.languagesSpoken !== undefined && { languagesSpoken: { set: dto.languagesSpoken } }),
        ...(dto.certifications !== undefined && { certifications: { set: dto.certifications } }),
      },
      select: PRIVATE_GUIDE_SELECT,
    });
  }

  /** Public listing — defaults to APPROVED guides only. */
  findAll(filters: {
    lgaId?: string;
    status?: TourGuideStatus;
    page?: number;
    limit?: number;
  }) {
    const { lgaId, status = 'APPROVED', page = 1, limit = 24 } = filters;
    const where: any = {
      deletedAt: null,
      status,
      ...(lgaId && { user: { lgaId } }),
    };
    return this.prisma.tourGuide.findMany({
      where,
      select: PUBLIC_GUIDE_SELECT,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /** Public detail view — KYC fields stripped. */
  async findById(id: string) {
    const guide = await this.prisma.tourGuide.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_GUIDE_SELECT,
    });
    if (!guide) throw new NotFoundException('Tour guide not found');
    return guide;
  }

  /** Owner view — includes kycTier + availability but NEVER raw NIN. */
  async getMe(userId: string) {
    const guide = await this.prisma.tourGuide.findUnique({
      where: { userId },
      select: PRIVATE_GUIDE_SELECT,
    });
    if (!guide) {
      throw new NotFoundException(
        'TourGuide profile not found — call POST /users/me/become-guide first',
      );
    }
    return guide;
  }

  // ── KYC (Tier-2 NIN) ────────────────────────────────────────────────────────

  /**
   * Encrypts NIN (AES-256-GCM), hashes for duplicate lookup (bcrypt, 12 rounds),
   * calls Dojah verifier, persists ciphertext + hash + kycTier. Plaintext NIN
   * NEVER persisted, NEVER logged, NEVER returned. (CLAUDE.md NDPA constraint.)
   */
  async submitKyc(userId: string, dto: SubmitKycDto): Promise<{ kycTier: number; verified: boolean }> {
    const guide = await this.prisma.tourGuide.findUnique({
      where: { userId },
      select: { id: true, ninHash: true },
    });
    if (!guide) {
      throw new ForbiddenException(
        'TourGuide profile not found — call POST /users/me/become-guide first',
      );
    }

    if (guide.ninHash) {
      throw new ConflictException('NIN already submitted for this tour guide');
    }

    // Duplicate-lookup BEFORE external API call to avoid wasted Dojah credits.
    await this.ensureNoDuplicateNin(dto.nin, guide.id);

    // Encrypt + hash; plaintext goes out of scope at function end.
    const ciphertext = this.encryption.encrypt(dto.nin);
    const hash = await bcrypt.hash(dto.nin, 12);

    // Call Dojah. Errors bubble up (BadRequestException from DojahService).
    let verified = false;
    try {
      const result = await this.dojah.verifyNin(dto.nin);
      verified = result.verified === true;
    } catch (err) {
      // Re-throw — caller sees BadRequestException; plaintext NIN never logged here.
      throw err;
    }

    const kycTier = verified ? 2 : 0;
    if (!verified) {
      this.logger.warn(
        `[KYC] Dojah verifier returned verified=false for tourGuideId=${guide.id} — kycTier remains 0`,
      );
    }

    await this.prisma.tourGuide.update({
      where: { id: guide.id },
      data: {
        ninCiphertext: ciphertext,
        ninHash: hash,
        kycTier,
      },
    });

    this.logger.log(`NIN submitted: tourGuideId=${guide.id} kycTier=${kycTier} verified=${verified}`);
    return { kycTier, verified };
    // plaintext `dto.nin` goes out of scope here — never included in response
  }

  /**
   * O(n) bcrypt duplicate scan across BOTH user.ninHash AND tour_guides.ninHash.
   * Acceptable for MVP scale; flagged for SHA-256 prefix index in Phase 6.
   */
  private async ensureNoDuplicateNin(plaintext: string, currentGuideId: string): Promise<void> {
    const userMatches = await this.prisma.user.findMany({
      where: { ninHash: { not: null } },
      select: { id: true, ninHash: true },
    });
    for (const u of userMatches) {
      if (u.ninHash && (await bcrypt.compare(plaintext, u.ninHash))) {
        throw new ConflictException('NIN already registered to another account');
      }
    }
    const guideMatches = await this.prisma.tourGuide.findMany({
      where: { ninHash: { not: null }, id: { not: currentGuideId } },
      select: { id: true, ninHash: true },
    });
    for (const g of guideMatches) {
      if (g.ninHash && (await bcrypt.compare(plaintext, g.ninHash))) {
        throw new ConflictException('NIN already registered to another tour guide');
      }
    }
  }

  // ── Availability ────────────────────────────────────────────────────────────

  /**
   * Merges incoming blockedDates + weeklyOffDays onto the existing availability
   * JSON. Undefined fields preserve the prior value; provided fields fully
   * replace that key (set-replace semantics, not append).
   */
  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const guide = await this.prisma.tourGuide.findUnique({
      where: { userId },
      select: { id: true, availability: true },
    });
    if (!guide) {
      throw new ForbiddenException(
        'TourGuide profile not found — call POST /users/me/become-guide first',
      );
    }

    const current = this.parseAvailability(guide.availability);
    const merged: AvailabilityShape = {
      blockedDates: dto.blockedDates !== undefined ? dto.blockedDates : current.blockedDates,
      weeklyOffDays: dto.weeklyOffDays !== undefined ? dto.weeklyOffDays : current.weeklyOffDays,
    };

    return this.prisma.tourGuide.update({
      where: { id: guide.id },
      data: { availability: merged as any },
      select: PRIVATE_GUIDE_SELECT,
    });
  }

  private parseAvailability(raw: unknown): AvailabilityShape {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_AVAILABILITY };
    const r = raw as Record<string, unknown>;
    const blockedDates = Array.isArray(r.blockedDates)
      ? (r.blockedDates as unknown[]).filter((d): d is string => typeof d === 'string')
      : [];
    const weeklyOffDays = Array.isArray(r.weeklyOffDays)
      ? (r.weeklyOffDays as unknown[]).filter((d): d is number => Number.isInteger(d))
      : [];
    return { blockedDates, weeklyOffDays };
  }

  // ── Admin queue ─────────────────────────────────────────────────────────────

  /**
   * LGA_ADMIN-only — transitions a guide PENDING → APPROVED or PENDING → REJECTED.
   * Rejection reason (if any) is preserved on `metadata.rejectionReason` + the
   * actor who decided is recorded on `metadata.decidedBy` for audit trail.
   */
  async adminDecide(guideId: string, dto: ApproveTourGuideDto, actorId: string) {
    const guide = await this.prisma.tourGuide.findFirst({
      where: { id: guideId, deletedAt: null },
      select: { id: true, status: true, metadata: true },
    });
    if (!guide) throw new NotFoundException('Tour guide not found');
    if (guide.status !== 'PENDING') {
      throw new BadRequestException(`Cannot transition tour guide from status=${guide.status}`);
    }

    const prevMeta = (guide.metadata && typeof guide.metadata === 'object') ? (guide.metadata as Record<string, unknown>) : {};
    const newMeta: Record<string, unknown> = {
      ...prevMeta,
      decidedBy: actorId,
      decidedAt: new Date().toISOString(),
      ...(dto.decision === 'REJECTED' && dto.reason && { rejectionReason: dto.reason }),
    };

    return this.prisma.tourGuide.update({
      where: { id: guideId },
      data: {
        status: dto.decision,
        metadata: newMeta as any,
      },
      select: PRIVATE_GUIDE_SELECT,
    });
  }

  /** Pending review queue — LGA_ADMIN+ only. */
  findPendingQueue(opts: { page?: number; limit?: number }) {
    const { page = 1, limit = 24 } = opts;
    return this.prisma.tourGuide.findMany({
      where: { status: 'PENDING', deletedAt: null },
      select: PRIVATE_GUIDE_SELECT,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // ── Cross-module gate ───────────────────────────────────────────────────────

  /**
   * INTERNAL — consumed by 09-04 TourPackageService to enforce the
   * "guide.status === APPROVED before publishing a package" guard.
   * Lean projection only: no PII surfaces here.
   */
  async findByIdInternal(
    id: string,
  ): Promise<{ id: string; status: TourGuideStatus; userId: string } | null> {
    const guide = await this.prisma.tourGuide.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, userId: true },
    });
    return guide as { id: string; status: TourGuideStatus; userId: string } | null;
  }
}
