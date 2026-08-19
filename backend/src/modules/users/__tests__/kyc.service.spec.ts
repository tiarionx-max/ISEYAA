import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { KycService } from '../kyc.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { FlutterwaveService } from '../../../common/services/flutterwave.service';
import { DojahService } from '../../../common/services/dojah.service';

const USER_ID = 'user-kyc-001';
const OTHER_USER_ID = 'user-kyc-002';
const ENCRYPTED_BVN = 'iv:tag:ciphertext';
const BVN = '22248185000';
const NIN = '12345678901';

const PLATFORM_CONFIG_ROWS = [
  { key: 'kyc_bvn_daily_limit', value: 200000 },
  { key: 'kyc_nin_daily_limit', value: 1000000 },
  { key: 'kyc_smile_daily_limit', value: 5000000 },
];

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  platformConfig: {
    findMany: jest.fn(),
  },
  wallet: {
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEncryption = {
  encrypt: jest.fn().mockReturnValue(ENCRYPTED_BVN),
  decrypt: jest.fn(),
};

const mockFlutterwave = {
  resolveBvn: jest.fn(),
};

const mockDojah = {
  verifyNin: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

describe('KycService', () => {
  let service: KycService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: PlatformConfig returns seeded rows
    mockPrisma.platformConfig.findMany.mockResolvedValue(PLATFORM_CONFIG_ROWS);
    // Default: no other users with hashes
    mockPrisma.user.findMany.mockResolvedValue([]);
    // Default: auditLog succeeds
    mockPrisma.auditLog.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: FlutterwaveService, useValue: mockFlutterwave },
        { provide: DojahService, useValue: mockDojah },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  // ── verifyBvn ───────────────────────────────────────────────────────────────

  describe('verifyBvn', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyBvn(USER_ID, BVN)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when bvnHash already set on requesting user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: '$2b$12$existinghash',
        kycBvnVerifiedAt: new Date(),
      });
      await expect(service.verifyBvn(USER_ID, BVN)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when BVN is already registered to another account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      const otherUserHash = await bcrypt.hash(BVN, 12);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, bvnHash: otherUserHash },
      ]);
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockEncryption.encrypt.mockReturnValue(ENCRYPTED_BVN);

      await expect(service.verifyBvn(USER_ID, BVN)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when Flutterwave BVN verification fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: false });

      await expect(service.verifyBvn(USER_ID, BVN)).rejects.toThrow(BadRequestException);
    });

    it('calls flutterwaveService.resolveBvn with the bvn once', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyBvn(USER_ID, BVN);
      expect(mockFlutterwave.resolveBvn).toHaveBeenCalledTimes(1);
      expect(mockFlutterwave.resolveBvn).toHaveBeenCalledWith(BVN);
    });

    it('calls encryptionService.encrypt with the bvn once', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyBvn(USER_ID, BVN);
      expect(mockEncryption.encrypt).toHaveBeenCalledTimes(1);
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(BVN);
    });

    it('persists ciphertext to User.bvn and hash to User.bvnHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyBvn(USER_ID, BVN);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bvn: ENCRYPTED_BVN,
            bvnHash: expect.any(String),
            kycBvnVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('sets kycBvnVerifiedAt to a Date', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyBvn(USER_ID, BVN);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.kycBvnVerifiedAt).toBeInstanceOf(Date);
    });

    it('creates an AuditLog with action KYC_BVN_VERIFIED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyBvn(USER_ID, BVN);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            action: 'KYC_BVN_VERIFIED',
            entity: 'User',
            entityId: USER_ID,
          }),
        }),
      );
    });

    it('returns tier 1 with dailyLimitNgn from PlatformConfig (200000)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyBvn(USER_ID, BVN);
      expect(result.tier).toBe(1);
      expect(result.dailyLimitNgn).toBe(200000);
    });

    it('never logs the plaintext BVN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bvnHash: null,
        kycBvnVerifiedAt: null,
      });
      mockFlutterwave.resolveBvn.mockResolvedValue({ verified: true, firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      // Spy on logger methods
      const loggerWarn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
      const loggerLog = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
      const loggerError = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.verifyBvn(USER_ID, BVN);

      const allLogArgs = [
        ...loggerWarn.mock.calls.flat(),
        ...loggerLog.mock.calls.flat(),
        ...loggerError.mock.calls.flat(),
      ].map(String);

      for (const arg of allLogArgs) {
        expect(arg).not.toContain(BVN);
      }
    });
  });

  // ── verifyNin ───────────────────────────────────────────────────────────────

  describe('verifyNin', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyNin(USER_ID, NIN)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when ninHash already set on requesting user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: '$2b$12$existinghash',
        kycNinVerifiedAt: new Date(),
      });
      await expect(service.verifyNin(USER_ID, NIN)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when NIN is already registered to another account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      const otherUserHash = await bcrypt.hash(NIN, 12);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: OTHER_USER_ID, ninHash: otherUserHash },
      ]);
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockEncryption.encrypt.mockReturnValue(ENCRYPTED_BVN);

      await expect(service.verifyNin(USER_ID, NIN)).rejects.toThrow(ConflictException);
    });

    it('calls dojahService.verifyNin with the nin once', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyNin(USER_ID, NIN);
      expect(mockDojah.verifyNin).toHaveBeenCalledTimes(1);
      expect(mockDojah.verifyNin).toHaveBeenCalledWith(NIN);
    });

    it('persists ciphertext to User.nin and hash to User.ninHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyNin(USER_ID, NIN);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nin: ENCRYPTED_BVN,
            ninHash: expect.any(String),
            kycNinVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('creates an AuditLog with action KYC_NIN_VERIFIED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      await service.verifyNin(USER_ID, NIN);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'KYC_NIN_VERIFIED',
            entity: 'User',
            entityId: USER_ID,
          }),
        }),
      );
    });

    it('returns tier 2 with dailyLimitNgn from PlatformConfig (1000000)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyNin(USER_ID, NIN);
      expect(result.tier).toBe(2);
      expect(result.dailyLimitNgn).toBe(1000000);
    });

    it('never logs the plaintext NIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        ninHash: null,
        kycNinVerifiedAt: null,
      });
      mockDojah.verifyNin.mockResolvedValue({ verified: true, name: 'John Doe', firstName: 'John', lastName: 'Doe' });
      mockPrisma.user.update.mockResolvedValue({});

      const loggerWarn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
      const loggerLog = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
      const loggerError = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.verifyNin(USER_ID, NIN);

      const allLogArgs = [
        ...loggerWarn.mock.calls.flat(),
        ...loggerLog.mock.calls.flat(),
        ...loggerError.mock.calls.flat(),
      ].map(String);

      for (const arg of allLogArgs) {
        expect(arg).not.toContain(NIN);
      }
    });
  });

  // ── completeLiveness ────────────────────────────────────────────────────────

  describe('completeLiveness', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.completeLiveness(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if kycLivenessVerifiedAt is already set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        kycLivenessVerifiedAt: new Date(),
      });
      await expect(service.completeLiveness(USER_ID)).rejects.toThrow(ConflictException);
    });

    it('sets kycLivenessVerifiedAt and kycStatus = VERIFIED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        kycLivenessVerifiedAt: null,
        kycBvnVerifiedAt: new Date(),
        kycNinVerifiedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.completeLiveness(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kycLivenessVerifiedAt: expect.any(Date),
            kycStatus: 'VERIFIED',
          }),
        }),
      );
    });

    it('creates an AuditLog with action KYC_LIVENESS_VERIFIED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        kycLivenessVerifiedAt: null,
        kycBvnVerifiedAt: new Date(),
        kycNinVerifiedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.completeLiveness(USER_ID);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'KYC_LIVENESS_VERIFIED',
            entity: 'User',
            entityId: USER_ID,
          }),
        }),
      );
    });

    it('returns tier 3 with dailyLimitNgn from PlatformConfig (5000000)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        kycLivenessVerifiedAt: null,
        kycBvnVerifiedAt: new Date(),
        kycNinVerifiedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.completeLiveness(USER_ID);
      expect(result.tier).toBe(3);
      expect(result.dailyLimitNgn).toBe(5000000);
    });
  });
});
