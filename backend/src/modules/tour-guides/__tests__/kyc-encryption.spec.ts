/**
 * 09-12 — KYC Encryption Regression Specs
 *
 * Proves three NDPA invariants for TourGuide NIN handling:
 *
 *   ENC-1  NIN is never persisted as plaintext — only AES-256-GCM ciphertext.
 *   ENC-2  ninHash is bcrypt-shaped (starts with '$2', length 60).
 *   ENC-3  Duplicate NIN (matched via bcrypt) throws ConflictException before
 *          any external API call or DB write.
 *
 * All three tests run without a live database (PrismaService is fully mocked).
 * EncryptionService is a REAL instance configured with a test key so that
 * encrypt/decrypt round-trips can be verified.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { TourGuideService } from '../tour-guides.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { DojahService } from '../../../common/services/dojah.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAINTEXT_NIN = '12345678901';
const USER_ID       = 'kyc-test-user-001';
const GUIDE_ID      = 'kyc-test-guide-001';

/**
 * 32-byte key as 64 hex chars — safe for tests; never used in production.
 * Key pattern: all 'a' bytes, deterministic and clearly non-production.
 */
const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

// ── Shared mock prisma ────────────────────────────────────────────────────────

const mockPrisma = {
  tourGuide: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
    update:     jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

const mockDojah = {
  verifyNin: jest.fn(),
};

// ── Module bootstrap helper ───────────────────────────────────────────────────

async function makeService(): Promise<{
  service:    TourGuideService;
  encryption: EncryptionService;
}> {
  const configSvc = {
    get: jest.fn((key: string) => {
      if (key === 'ENCRYPTION_KEY') return TEST_ENCRYPTION_KEY;
      return undefined;
    }),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TourGuideService,
      { provide: PrismaService,    useValue: mockPrisma },
      { provide: DojahService,     useValue: mockDojah },
      { provide: ConfigService,    useValue: configSvc },
      EncryptionService, // real implementation
    ],
  }).compile();

  return {
    service:    moduleRef.get(TourGuideService),
    encryption: moduleRef.get(EncryptionService),
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no duplicate hits in scan
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.tourGuide.findMany.mockResolvedValue([]);
  // Silence logger noise on negative-path tests
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

// ── ENC-1: NIN never persisted as plaintext ───────────────────────────────────

describe('ENC-1: NIN is never persisted as plaintext (NDPA guard)', () => {
  it('stores ciphertext, not the plaintext NIN, and decrypt round-trips correctly', async () => {
    const { service, encryption } = await makeService();

    // Guide row exists, no prior NIN
    mockPrisma.tourGuide.findUnique.mockResolvedValue({
      id: GUIDE_ID, ninHash: null,
    });
    mockDojah.verifyNin.mockResolvedValue({ verified: true });

    // Capture the actual data written to tourGuide.update
    let capturedData: any = null;
    mockPrisma.tourGuide.update.mockImplementation(async ({ data }: any) => {
      capturedData = data;
      return { id: GUIDE_ID, kycTier: 2 };
    });

    await service.submitKyc(USER_ID, { nin: PLAINTEXT_NIN });

    expect(capturedData).not.toBeNull();

    // The persisted ciphertext must NOT equal the plaintext
    const ninCiphertext: string = capturedData.ninCiphertext;
    expect(ninCiphertext).not.toBe(PLAINTEXT_NIN);

    // The ciphertext must decrypt back to the original NIN
    expect(encryption.decrypt(ninCiphertext)).toBe(PLAINTEXT_NIN);

    // The persisted data must NOT contain a `nin` field (plaintext)
    expect(capturedData).not.toHaveProperty('nin');

    // No logger call should have contained the plaintext NIN
    const warnCalls = (Logger.prototype.warn as jest.Mock).mock.calls
      .flat()
      .join(' ');
    const logCalls = (Logger.prototype.log as jest.Mock).mock.calls
      .flat()
      .join(' ');
    expect(warnCalls).not.toContain(PLAINTEXT_NIN);
    expect(logCalls).not.toContain(PLAINTEXT_NIN);
  });
});

// ── ENC-2: ninHash is bcrypt-shaped ──────────────────────────────────────────

describe('ENC-2: ninHash is a valid bcrypt hash', () => {
  it('stored hash starts with "$2" and is exactly 60 characters (bcrypt canonical form)', async () => {
    const { service } = await makeService();

    mockPrisma.tourGuide.findUnique.mockResolvedValue({
      id: GUIDE_ID, ninHash: null,
    });
    mockDojah.verifyNin.mockResolvedValue({ verified: true });

    let capturedData: any = null;
    mockPrisma.tourGuide.update.mockImplementation(async ({ data }: any) => {
      capturedData = data;
      return { id: GUIDE_ID, kycTier: 2 };
    });

    await service.submitKyc(USER_ID, { nin: PLAINTEXT_NIN });

    const ninHash: string = capturedData.ninHash;

    // bcrypt hashes start with $2b$ or $2a$ (version markers)
    expect(ninHash).toMatch(/^\$2[ab]\$/);
    // bcrypt canonical output is always 60 characters
    expect(ninHash).toHaveLength(60);

    // The hash must verify against the original NIN (sanity check)
    const valid = await bcrypt.compare(PLAINTEXT_NIN, ninHash);
    expect(valid).toBe(true);
  });
});

// ── ENC-3: Duplicate NIN throws ConflictException ────────────────────────────

describe('ENC-3: duplicate NIN detected via bcrypt before any DB write', () => {
  it('throws ConflictException when ninHash on another TourGuide matches the plaintext NIN', async () => {
    const { service } = await makeService();

    // The current guide has no prior NIN
    mockPrisma.tourGuide.findUnique.mockResolvedValue({
      id: GUIDE_ID, ninHash: null,
    });

    // Another guide already has a hash of the same NIN
    const existingHash = await bcrypt.hash(PLAINTEXT_NIN, 12);
    mockPrisma.user.findMany.mockResolvedValue([]); // no user-level match
    mockPrisma.tourGuide.findMany.mockResolvedValue([
      { id: 'other-guide-999', ninHash: existingHash },
    ]);

    await expect(
      service.submitKyc(USER_ID, { nin: PLAINTEXT_NIN }),
    ).rejects.toThrow(ConflictException);

    // The external Dojah API must not have been called (avoid wasting credits)
    expect(mockDojah.verifyNin).not.toHaveBeenCalled();
    // No DB write must have occurred
    expect(mockPrisma.tourGuide.update).not.toHaveBeenCalled();
  });
});
