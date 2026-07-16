import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { S3Service } from '../s3.service';
import { ResilienceService } from '../../../resilience/resilience.service';

// Capture the S3Client constructor call arguments for assertions
let capturedS3Config: Record<string, unknown> = {};

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation((config) => {
    capturedS3Config = config;
    return {
      send: jest.fn().mockResolvedValue({}),
      _config: config,
    };
  }),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
  GetObjectCommand: jest.fn(),
}));

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, string> = {
      CF_ACCOUNT_ID: 'test-account-id',
      R2_BUCKET: 'iseyaa-media',
      R2_PUBLIC_URL: 'https://pub.iseyaa.ng',
      R2_ACCESS_KEY_ID: 'test-key-id',
      R2_SECRET_ACCESS_KEY: 'test-secret',
    };
    return vals[key] ?? def;
  }),
};

// Default pass-through resilience mock — circuit-breaker mechanics are tested in
// resilience.service.spec.ts; this file tests S3Service's own error-mapping.
const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    capturedS3Config = {};
    mockResilience.execute.mockImplementation(
      (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );
    // Reset mock to re-capture constructor args on each test
    const { S3Client } = jest.requireMock('@aws-sdk/client-s3');
    S3Client.mockImplementation((config: Record<string, unknown>) => {
      capturedS3Config = config;
      return {
        send: jest.fn().mockResolvedValue({}),
        _config: config,
      };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  describe('constructor — Cloudflare R2 config', () => {
    it('Test 1: initializes S3Client with region "auto" (not "af-south-1")', () => {
      expect(capturedS3Config.region).toBe('auto');
    });

    it('Test 2: initializes S3Client with endpoint containing r2.cloudflarestorage.com and CF_ACCOUNT_ID', () => {
      expect(capturedS3Config.endpoint).toContain('r2.cloudflarestorage.com');
      expect(capturedS3Config.endpoint).toContain('test-account-id');
    });

    it('Test 3: reads R2_BUCKET from config (not AWS_S3_BUCKET)', () => {
      expect(mockConfig.get).toHaveBeenCalledWith('R2_BUCKET', expect.anything());
      expect(mockConfig.get).not.toHaveBeenCalledWith('AWS_S3_BUCKET', expect.anything());
    });

    it('Test 4: reads R2_PUBLIC_URL from config (not AWS_CLOUDFRONT_URL)', () => {
      expect(mockConfig.get).toHaveBeenCalledWith('R2_PUBLIC_URL', expect.anything());
      expect(mockConfig.get).not.toHaveBeenCalledWith('AWS_CLOUDFRONT_URL', expect.anything());
    });
  });

  describe('upload()', () => {
    it('Test 5: calls S3Client.send() with PutObjectCommand and returns URL starting with R2_PUBLIC_URL', async () => {
      const url = await service.upload('images/test.jpg', Buffer.from('data'), 'image/jpeg');
      expect(url).toMatch(/^https:\/\/pub\.iseyaa\.ng\//);
    });

    it('Test 6: falls back to r2.cloudflarestorage.com URL when R2_PUBLIC_URL is empty', async () => {
      // Re-create service with empty R2_PUBLIC_URL
      const emptyUrlConfig = {
        get: jest.fn((key: string, def?: unknown) => {
          const vals: Record<string, string> = {
            CF_ACCOUNT_ID: 'test-account-id',
            R2_BUCKET: 'iseyaa-media',
            R2_PUBLIC_URL: '',
            R2_ACCESS_KEY_ID: 'test-key-id',
            R2_SECRET_ACCESS_KEY: 'test-secret',
          };
          const val = vals[key];
          return val !== undefined ? val : def;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          S3Service,
          { provide: ConfigService, useValue: emptyUrlConfig },
          { provide: ResilienceService, useValue: mockResilience },
        ],
      }).compile();

      const svcNoPublicUrl = module.get<S3Service>(S3Service);
      const url = await svcNoPublicUrl.upload('images/test.jpg', Buffer.from('data'), 'image/jpeg');
      expect(url).toContain('r2.cloudflarestorage.com');
      expect(url).toContain('test-account-id');
    });

    it('Test 7: throws ServiceUnavailableException when resilience.execute rejects', async () => {
      mockResilience.execute.mockRejectedValue(new Error('network error'));

      await expect(
        service.upload('images/test.jpg', Buffer.from('data'), 'image/jpeg'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("Test 8: forwards the exact AbortSignal instance into S3Client.send()'s second argument (abortSignal) — reference-identity, mirrors paystack.service.spec.ts Test 7", async () => {
      const controller = new AbortController();
      mockResilience.execute.mockImplementationOnce(
        (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
          fn({ signal: controller.signal }),
      );

      await service.upload('images/test.jpg', Buffer.from('data'), 'image/jpeg');

      const sendMock = (service.getClient() as any).send;
      expect(sendMock.mock.calls[0][1]?.abortSignal).toBe(controller.signal);
    });
  });
});
