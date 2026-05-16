import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

const stubConfigService = {
  get: (key: string) => (key === 'ENCRYPTION_KEY' ? VALID_KEY : undefined),
};

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: stubConfigService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe('encrypt', () => {
    it('should return a colon-separated string with 3 parts (iv:authTag:ciphertext)', () => {
      const result = service.encrypt('abc');
      const parts = result.split(':');
      expect(parts.length).toBe(3);
      expect(parts[0].length).toBeGreaterThan(0); // iv
      expect(parts[1].length).toBeGreaterThan(0); // authTag
      expect(parts[2].length).toBeGreaterThan(0); // ciphertext
    });

    it('should produce different ciphertext on two calls with the same plaintext (random IV)', () => {
      const enc1 = service.encrypt('same-plaintext');
      const enc2 = service.encrypt('same-plaintext');
      expect(enc1).not.toEqual(enc2);
    });
  });

  describe('decrypt round-trips', () => {
    it('should round-trip ASCII string', () => {
      expect(service.decrypt(service.encrypt('abc'))).toBe('abc');
    });

    it('should round-trip Unicode string', () => {
      expect(service.decrypt(service.encrypt('Yorùbá café'))).toBe('Yorùbá café');
    });

    it('should round-trip 11-digit BVN-shape string', () => {
      expect(service.decrypt(service.encrypt('22248185000'))).toBe('22248185000');
    });

    it('should round-trip empty string', () => {
      expect(service.decrypt(service.encrypt(''))).toBe('');
    });
  });

  describe('tamper detection', () => {
    it('should throw when authTag is tampered with', () => {
      const encrypted = service.encrypt('secret-data');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      // Flip first two hex chars of authTag
      const tamperedAuthTag = authTag.slice(0, 1) === 'a' ? 'b' + authTag.slice(1) : 'a' + authTag.slice(1);
      const tampered = `${iv}:${tamperedAuthTag}:${ciphertext}`;
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw when ciphertext is tampered with', () => {
      const encrypted = service.encrypt('secret-data');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      // Flip first two hex chars of ciphertext (if ciphertext is non-empty)
      if (ciphertext.length >= 2) {
        const tamperedCiphertext = ciphertext.slice(0, 1) === 'a' ? 'b' + ciphertext.slice(1) : 'a' + ciphertext.slice(1);
        const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;
        expect(() => service.decrypt(tampered)).toThrow();
      } else {
        // Empty ciphertext (encrypted '') - tamper auth tag instead
        const tamperedAuthTag = authTag.slice(0, 1) === 'a' ? 'b' + authTag.slice(1) : 'a' + authTag.slice(1);
        const tampered = `${iv}:${tamperedAuthTag}:${ciphertext}`;
        expect(() => service.decrypt(tampered)).toThrow();
      }
    });
  });

  describe('constructor validation', () => {
    it('should throw if ENCRYPTION_KEY is undefined', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            { provide: ConfigService, useValue: { get: () => undefined } },
          ],
        }).compile(),
      ).rejects.toThrow('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    });

    it('should throw if ENCRYPTION_KEY has wrong length (not 64 chars)', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            { provide: ConfigService, useValue: { get: () => 'abc123' } },
          ],
        }).compile(),
      ).rejects.toThrow('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    });
  });
});
