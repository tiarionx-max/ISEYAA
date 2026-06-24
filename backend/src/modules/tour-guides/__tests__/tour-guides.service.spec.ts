import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TourGuideService } from '../tour-guides.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { DojahService } from '../../../common/services/dojah.service';

const USER_ID = 'user-tg-001';
const GUIDE_ID = 'guide-tg-001';
const ACTOR_ID = 'admin-001';
const NIN = '12345678901';
const ENCRYPTED_NIN = 'iv:tag:cipher';
const CERT_URL = 'https://cdn.iseyaa.ng/tour-certifications/uuid-abc/cert.pdf';

const mockGuide = {
  id: GUIDE_ID,
  userId: USER_ID,
  bio: 'Veteran guide',
  yearsExperience: 5,
  languagesSpoken: ['English', 'Yoruba'],
  certifications: [],
  ninCiphertext: null as string | null,
  ninHash: null as string | null,
  kycTier: 0,
  availability: null as unknown,
  status: 'PENDING' as 'PENDING' | 'APPROVED' | 'REJECTED',
  metadata: null as Record<string, unknown> | null,
  deletedAt: null as Date | null,
};

const mockPrisma = {
  tourGuide: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

const mockEncryption = {
  encrypt: jest.fn().mockReturnValue(ENCRYPTED_NIN),
  decrypt: jest.fn(),
};

const mockDojah = {
  verifyNin: jest.fn(),
};

describe('TourGuideService', () => {
  let service: TourGuideService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Defaults: no duplicate scan hits, no audit calls
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.tourGuide.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourGuideService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: DojahService, useValue: mockDojah },
      ],
    }).compile();
    service = module.get<TourGuideService>(TourGuideService);
    // Silence logger noise during the negative-path tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  // ── upsertOwnProfile ────────────────────────────────────────────────────────

  describe('upsertOwnProfile', () => {
    it('updates bio + languages when a TourGuide row exists', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ ...mockGuide });
      mockPrisma.tourGuide.update.mockResolvedValue({
        ...mockGuide,
        bio: 'Updated bio',
        languagesSpoken: ['English'],
      });

      const result = await service.upsertOwnProfile(USER_ID, {
        bio: 'Updated bio',
        languagesSpoken: ['English'],
      });
      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          data: expect.objectContaining({
            bio: 'Updated bio',
            languagesSpoken: { set: ['English'] },
          }),
        }),
      );
      expect(result.bio).toBe('Updated bio');
    });

    it('throws ForbiddenException when no TourGuide row exists (must call become-guide first)', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue(null);
      await expect(service.upsertOwnProfile(USER_ID, { bio: 'x' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.tourGuide.update).not.toHaveBeenCalled();
    });

    it('accepts certifications as publicUrls (from 09-02 UploadService) and persists them verbatim', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ ...mockGuide });
      mockPrisma.tourGuide.update.mockResolvedValue({
        ...mockGuide,
        certifications: [CERT_URL],
      });

      await service.upsertOwnProfile(USER_ID, { certifications: [CERT_URL] });
      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certifications: { set: [CERT_URL] },
          }),
        }),
      );
    });
  });

  // ── submitKyc ───────────────────────────────────────────────────────────────

  describe('submitKyc', () => {
    it('happy path — encrypts NIN, writes ciphertext + hash, kycTier=2 when Dojah verified=true', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        id: GUIDE_ID,
        ninHash: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'Test User' });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide, kycTier: 2 });

      const result = await service.submitKyc(USER_ID, { nin: NIN });

      expect(mockEncryption.encrypt).toHaveBeenCalledWith(NIN);
      expect(mockDojah.verifyNin).toHaveBeenCalledWith(NIN);
      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUIDE_ID },
          data: expect.objectContaining({
            ninCiphertext: ENCRYPTED_NIN,
            ninHash: expect.any(String),
            kycTier: 2,
          }),
        }),
      );
      expect(result).toEqual({ kycTier: 2, verified: true });
    });

    it('Dojah verified=false — persists ciphertext + hash, kycTier stays 0, logs warn', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ id: GUIDE_ID, ninHash: null });
      mockDojah.verifyNin.mockResolvedValue({ verified: false, name: '' });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide, kycTier: 0 });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');

      const result = await service.submitKyc(USER_ID, { nin: NIN });

      expect(result).toEqual({ kycTier: 0, verified: false });
      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ninCiphertext: ENCRYPTED_NIN,
            ninHash: expect.any(String),
            kycTier: 0,
          }),
        }),
      );
      expect(warnSpy).toHaveBeenCalled();
    });

    it('throws ConflictException when ninHash already exists on another User', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ id: GUIDE_ID, ninHash: null });
      const otherHash = await bcrypt.hash(NIN, 12);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'other-user', ninHash: otherHash }]);

      await expect(service.submitKyc(USER_ID, { nin: NIN })).rejects.toThrow(ConflictException);
      expect(mockDojah.verifyNin).not.toHaveBeenCalled();
      expect(mockPrisma.tourGuide.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when ninHash already exists on another TourGuide', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ id: GUIDE_ID, ninHash: null });
      const otherHash = await bcrypt.hash(NIN, 12);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.tourGuide.findMany.mockResolvedValue([{ id: 'other-guide', ninHash: otherHash }]);

      await expect(service.submitKyc(USER_ID, { nin: NIN })).rejects.toThrow(ConflictException);
      expect(mockDojah.verifyNin).not.toHaveBeenCalled();
    });

    it('NEVER persists plaintext NIN — prisma.tourGuide.update.data has no `nin` field (NDPA guard)', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({ id: GUIDE_ID, ninHash: null });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'X' });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide, kycTier: 2 });

      await service.submitKyc(USER_ID, { nin: NIN });

      // Regression guard — plaintext NIN must never appear on the prisma.update data payload.
      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ nin: expect.anything() }),
        }),
      );
    });

    it('throws ForbiddenException when caller has no TourGuide row', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue(null);
      await expect(service.submitKyc(USER_ID, { nin: NIN })).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when ninHash already set on own profile', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        id: GUIDE_ID,
        ninHash: 'preset-hash',
      });
      await expect(service.submitKyc(USER_ID, { nin: NIN })).rejects.toThrow(ConflictException);
    });
  });

  // ── updateAvailability ──────────────────────────────────────────────────────

  describe('updateAvailability', () => {
    it('merges blockedDates + weeklyOffDays into existing availability JSON', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        id: GUIDE_ID,
        availability: { blockedDates: ['2026-01-01'], weeklyOffDays: [0] },
      });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide });

      await service.updateAvailability(USER_ID, {
        blockedDates: ['2026-07-15'],
        weeklyOffDays: [0, 6],
      });

      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUIDE_ID },
          data: expect.objectContaining({
            availability: { blockedDates: ['2026-07-15'], weeklyOffDays: [0, 6] },
          }),
        }),
      );
    });

    it('preserves existing field when only one side of availability is supplied', async () => {
      mockPrisma.tourGuide.findUnique.mockResolvedValue({
        id: GUIDE_ID,
        availability: { blockedDates: ['2026-01-01'], weeklyOffDays: [3] },
      });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide });

      await service.updateAvailability(USER_ID, { blockedDates: ['2026-12-25'] });

      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availability: { blockedDates: ['2026-12-25'], weeklyOffDays: [3] },
          }),
        }),
      );
    });
  });

  // ── adminDecide ─────────────────────────────────────────────────────────────

  describe('adminDecide', () => {
    it('sets status to APPROVED', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({
        id: GUIDE_ID,
        status: 'PENDING',
        metadata: null,
      });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide, status: 'APPROVED' });

      const result = await service.adminDecide(GUIDE_ID, { decision: 'APPROVED' }, ACTOR_ID);

      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUIDE_ID },
          data: expect.objectContaining({
            status: 'APPROVED',
            metadata: expect.objectContaining({ decidedBy: ACTOR_ID }),
          }),
        }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('sets status to REJECTED with reason on metadata', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({
        id: GUIDE_ID,
        status: 'PENDING',
        metadata: null,
      });
      mockPrisma.tourGuide.update.mockResolvedValue({ ...mockGuide, status: 'REJECTED' });

      await service.adminDecide(
        GUIDE_ID,
        { decision: 'REJECTED', reason: 'Insufficient certifications' },
        ACTOR_ID,
      );

      expect(mockPrisma.tourGuide.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            metadata: expect.objectContaining({
              decidedBy: ACTOR_ID,
              rejectionReason: 'Insufficient certifications',
            }),
          }),
        }),
      );
    });

    it('throws NotFoundException when guide does not exist', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(null);
      await expect(
        service.adminDecide('bad-id', { decision: 'APPROVED' }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when guide is not PENDING', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({
        id: GUIDE_ID,
        status: 'APPROVED',
        metadata: null,
      });
      await expect(
        service.adminDecide(GUIDE_ID, { decision: 'REJECTED' }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findByIdInternal (cross-module gate for 09-04) ──────────────────────────

  describe('findByIdInternal', () => {
    it('returns a lean row with id/status/userId for downstream gate checks', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({
        id: GUIDE_ID,
        status: 'APPROVED',
        userId: USER_ID,
      });
      const result = await service.findByIdInternal(GUIDE_ID);
      expect(result).toEqual({ id: GUIDE_ID, status: 'APPROVED', userId: USER_ID });
      expect(mockPrisma.tourGuide.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUIDE_ID, deletedAt: null },
          select: { id: true, status: true, userId: true },
        }),
      );
    });

    it('returns null when not found', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(null);
      const result = await service.findByIdInternal('missing-id');
      expect(result).toBeNull();
    });
  });
});
