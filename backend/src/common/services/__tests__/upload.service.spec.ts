import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MAX_UPLOAD_BYTES_DEFAULT,
  MAX_UPLOAD_BYTES_HARD_CAP,
  PRESIGNED_URL_EXPIRY_SECONDS,
  UploadService,
} from '../upload.service';
import { S3Service } from '../s3.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('UploadService', () => {
  let service: UploadService;
  let s3Service: jest.Mocked<S3Service>;
  let config: jest.Mocked<ConfigService>;

  const SIGNED_URL = 'https://signed.example.com/put?token=abc';
  const BUCKET = 'iseyaa-media';

  beforeEach(() => {
    jest.clearAllMocks();
    (getSignedUrl as jest.Mock).mockResolvedValue(SIGNED_URL);

    s3Service = {
      getMode: jest.fn().mockReturnValue('aws'),
      getBucket: jest.fn().mockReturnValue(BUCKET),
      getClient: jest.fn().mockReturnValue({}),
      getCdnBase: jest.fn().mockReturnValue(''),
    } as unknown as jest.Mocked<S3Service>;

    config = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'AWS_REGION') return 'af-south-1';
        if (key === 'CF_ACCOUNT_ID') return 'acc-123';
        return def ?? '';
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new UploadService(s3Service, config);
  });

  it('happy path: tour-certifications + image/jpeg + userId → server-controlled key with .jpg ext', async () => {
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'tour-certifications',
      contentType: 'image/jpeg',
      userId: 'u1',
    });

    expect(result.uploadUrl).toBe(SIGNED_URL);
    expect(result.expiresIn).toBe(PRESIGNED_URL_EXPIRY_SECONDS);
    expect(result.expiresIn).toBe(900);
    expect(result.maxBytes).toBe(MAX_UPLOAD_BYTES_DEFAULT);
    expect(result.key).toMatch(/^tour-certifications\/u1\/[a-f0-9-]{36}\.jpg$/);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('respects explicit maxBytes when within the hard cap', async () => {
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'review-photos',
      contentType: 'image/png',
      maxBytes: 10_000_000,
      userId: 'u2',
    });
    expect(result.maxBytes).toBe(10_000_000);
    expect(result.key).toMatch(/\.png$/);
  });

  it('silently caps maxBytes at HARD_CAP (does not reject)', async () => {
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'misc',
      contentType: 'application/pdf',
      maxBytes: 100_000_000,
      userId: 'u3',
    });
    expect(result.maxBytes).toBe(MAX_UPLOAD_BYTES_HARD_CAP);
    expect(result.key).toMatch(/\.pdf$/);
  });

  it('rejects unsupported contentType with BadRequestException', async () => {
    await expect(
      service.createPresignedUploadUrl({
        keyPrefix: 'misc',
        contentType: 'video/mp4',
        userId: 'u4',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects non-positive maxBytes with BadRequestException', async () => {
    await expect(
      service.createPresignedUploadUrl({
        keyPrefix: 'misc',
        contentType: 'image/jpeg',
        maxBytes: 0,
        userId: 'u5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws ServiceUnavailableException when S3 is unconfigured', async () => {
    (s3Service.getMode as jest.Mock).mockReturnValue('unconfigured');
    await expect(
      service.createPresignedUploadUrl({
        keyPrefix: 'avatars',
        contentType: 'image/jpeg',
        userId: 'u6',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it('AWS mode without CDN → publicUrl is bucket.s3.<region>.amazonaws.com/<key>', async () => {
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'tour-covers',
      contentType: 'image/webp',
      userId: 'u7',
    });
    expect(result.publicUrl).toMatch(
      /^https:\/\/iseyaa-media\.s3\.af-south-1\.amazonaws\.com\/tour-covers\/u7\/[a-f0-9-]{36}\.webp$/,
    );
  });

  it('R2 mode without CDN → publicUrl is <account>.r2.cloudflarestorage.com/<bucket>/<key>', async () => {
    (s3Service.getMode as jest.Mock).mockReturnValue('r2');
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'tour-covers',
      contentType: 'image/png',
      userId: 'u8',
    });
    expect(result.publicUrl).toMatch(
      /^https:\/\/acc-123\.r2\.cloudflarestorage\.com\/iseyaa-media\/tour-covers\/u8\/[a-f0-9-]{36}\.png$/,
    );
  });

  it('CDN base set → publicUrl uses cdnBase prefix', async () => {
    (s3Service.getCdnBase as jest.Mock).mockReturnValue('https://cdn.example.com');
    const result = await service.createPresignedUploadUrl({
      keyPrefix: 'avatars',
      contentType: 'image/jpeg',
      userId: 'u9',
    });
    expect(result.publicUrl).toMatch(/^https:\/\/cdn\.example\.com\/avatars\/u9\/[a-f0-9-]{36}\.jpg$/);
  });
});
