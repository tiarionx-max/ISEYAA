import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { FlutterwaveService } from '../../common/services/flutterwave.service';
import { DojahService } from '../../common/services/dojah.service';

export interface KycTierResult {
  tier: number;
  dailyLimitNgn: number;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly flutterwave: FlutterwaveService,
    private readonly dojah: DojahService,
    private readonly config: ConfigService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadTierLimits(): Promise<{ bvn: number; nin: number; smile: number }> {
    const rows = await this.prisma.platformConfig.findMany({
      where: {
        key: { in: ['kyc_bvn_daily_limit', 'kyc_nin_daily_limit', 'kyc_smile_daily_limit'] },
      },
    });
    const limit = (k: string): number => Number((rows.find((r) => r.key === k)?.value as any) ?? 0);
    return {
      bvn: limit('kyc_bvn_daily_limit'),
      nin: limit('kyc_nin_daily_limit'),
      smile: limit('kyc_smile_daily_limit'),
    };
  }

  /**
   * O(n) bcrypt duplicate scan — acceptable for < 100K users (RESEARCH Pitfall 5).
   * Flagged for SHA-256 index in Phase 6 if scale demands.
   * IMPORTANT: field is 'bvnHash' or 'ninHash'; plaintext is NEVER logged.
   */
  private async ensureNoDuplicateHash(
    field: 'bvnHash' | 'ninHash',
    plaintext: string,
    userId: string,
  ): Promise<void> {
    const others = await this.prisma.user.findMany({
      where: { [field]: { not: null }, id: { not: userId } },
      select: { id: true, [field]: true } as any,
    });
    for (const u of others) {
      const stored = (u as any)[field] as string | null;
      if (stored && (await bcrypt.compare(plaintext, stored))) {
        throw new ConflictException('Identifier already registered to another account');
      }
    }
  }

  // ── verifyBvn ──────────────────────────────────────────────────────────────

  /**
   * Tier 1 KYC: verify BVN via Flutterwave, encrypt + bcrypt-hash, persist.
   * Plaintext BVN goes out of scope at function end — NEVER logged, NEVER returned.
   */
  async verifyBvn(userId: string, bvn: string): Promise<KycTierResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, bvnHash: true, kycBvnVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.bvnHash) {
      throw new ConflictException('BVN already verified for this account');
    }

    // C-07: check for duplicate BVN BEFORE the external Flutterwave call to avoid wasting
    // expensive API credits on a BVN that is already registered to another account.
    await this.ensureNoDuplicateHash('bvnHash', bvn, userId);

    // Flutterwave BVN verification (throws BadRequestException on failure)
    const verification = await this.flutterwave.resolveBvn(bvn);
    if (!verification.verified) {
      throw new BadRequestException('BVN verification failed');
    }

    // Encrypt for storage (AES-256-GCM ciphertext) + bcrypt hash for duplicate lookup
    const ciphertext = this.encryption.encrypt(bvn);
    const hash = await bcrypt.hash(bvn, 12); // 12 salt rounds per CLAUDE.md

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvn: ciphertext,
        bvnHash: hash,
        kycBvnVerifiedAt: new Date(),
      },
    });

    // Audit log — silent fallback per CLAUDE.md (audit failures must not break KYC flow)
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'KYC_BVN_VERIFIED',
          entity: 'User',
          entityId: userId,
        },
      });
    } catch (err) {
      this.logger.error(`KYC audit log failed for userId=${userId}`, err);
    }

    this.logger.log(`BVN verified: userId=${userId} tier=1`);

    const limits = await this.loadTierLimits();
    return { tier: 1, dailyLimitNgn: limits.bvn };
    // NOTE: plaintext bvn variable goes out of scope here — never included in return value
  }

  // ── verifyNin ──────────────────────────────────────────────────────────────

  /**
   * Tier 2 KYC: verify NIN via Dojah, encrypt + bcrypt-hash, persist.
   * Plaintext NIN goes out of scope at function end — NEVER logged, NEVER returned.
   */
  async verifyNin(userId: string, nin: string): Promise<KycTierResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, ninHash: true, kycNinVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.ninHash) {
      throw new ConflictException('NIN already verified for this account');
    }

    // C-07: check for duplicate NIN BEFORE the external Dojah call
    await this.ensureNoDuplicateHash('ninHash', nin, userId);

    // Dojah NIN verification (throws BadRequestException on failure)
    const verification = await this.dojah.verifyNin(nin);
    if (!verification.verified) {
      throw new BadRequestException('NIN verification failed');
    }

    // Encrypt for storage (AES-256-GCM ciphertext) + bcrypt hash for duplicate lookup
    const ciphertext = this.encryption.encrypt(nin);
    const hash = await bcrypt.hash(nin, 12); // 12 salt rounds per CLAUDE.md

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        nin: ciphertext,
        ninHash: hash,
        kycNinVerifiedAt: new Date(),
      },
    });

    // Audit log — silent fallback per CLAUDE.md
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'KYC_NIN_VERIFIED',
          entity: 'User',
          entityId: userId,
        },
      });
    } catch (err) {
      this.logger.error(`KYC audit log failed for userId=${userId}`, err);
    }

    this.logger.log(`NIN verified: userId=${userId} tier=2`);

    const limits = await this.loadTierLimits();
    return { tier: 2, dailyLimitNgn: limits.nin };
    // NOTE: plaintext nin variable goes out of scope here — never included in return value
  }

  // ── completeLiveness ───────────────────────────────────────────────────────

  /**
   * Tier 3 KYC: mark Smile Identity liveness complete.
   * MVP stub: completes without real Smile webhook confirmation.
   * Production flow (Wave 7): requires webhook from Smile Identity before setting this flag.
   */
  async completeLiveness(userId: string): Promise<KycTierResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, kycBvnVerifiedAt: true, kycNinVerifiedAt: true, kycLivenessVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.kycLivenessVerifiedAt) {
      throw new ConflictException('Liveness verification already completed');
    }

    // L-09: enforce tier progression — Tier 3 requires Tier 1 (BVN) and Tier 2 (NIN)
    if (!user.kycBvnVerifiedAt) {
      throw new BadRequestException('BVN verification (Tier 1) required before liveness check');
    }
    if (!user.kycNinVerifiedAt) {
      throw new BadRequestException('NIN verification (Tier 2) required before liveness check');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycLivenessVerifiedAt: new Date(),
        kycStatus: 'VERIFIED',
      },
    });

    // Audit log — silent fallback per CLAUDE.md
    // Note: flagged as stub mode until real Smile Identity webhook is implemented (T-05-12)
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'KYC_LIVENESS_VERIFIED',
          entity: 'User',
          entityId: userId,
        },
      });
    } catch (err) {
      this.logger.error(`KYC audit log failed for userId=${userId}`, err);
    }

    this.logger.log(`Liveness verified: userId=${userId} tier=3`);

    const limits = await this.loadTierLimits();
    return { tier: 3, dailyLimitNgn: limits.smile };
  }
}
