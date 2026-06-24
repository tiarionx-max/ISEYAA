import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * S3-compatible storage service.
 * Auto-detects which backend to use based on env vars:
 *   - AWS_*  set → AWS S3 (region-specific endpoint, optional CloudFront CDN)
 *   - R2_*   set → Cloudflare R2 (account-scoped endpoint, optional R2 public URL)
 *
 * The env-var convention from the .env.example is AWS_*. The R2 path is kept
 * for backward-compat with anyone who deployed before the AWS migration.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string; // public CDN URL prefix (no trailing slash)
  private readonly mode: 'aws' | 'r2' | 'unconfigured';

  constructor(private config: ConfigService) {
    const awsKey = config.get<string>('AWS_ACCESS_KEY_ID', '');
    const r2Key = config.get<string>('R2_ACCESS_KEY_ID', '');

    if (awsKey) {
      // AWS S3 mode
      this.mode = 'aws';
      this.bucket = config.get<string>('AWS_S3_BUCKET', 'iseyaa-media');
      this.cdnBase = (config.get<string>('AWS_CLOUDFRONT_URL', '') || '').replace(/\/$/, '');
      const region = config.get<string>('AWS_REGION', 'af-south-1');
      this.s3 = new S3Client({
        region,
        credentials: {
          accessKeyId: awsKey,
          secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
        },
      });
      this.logger.log(`S3 ready: AWS S3 bucket=${this.bucket} region=${region}${this.cdnBase ? ' cdn=' + this.cdnBase : ''}`);
    } else if (r2Key) {
      // Cloudflare R2 mode (S3-compatible)
      this.mode = 'r2';
      this.bucket = config.get<string>('R2_BUCKET', 'iseyaa-media');
      this.cdnBase = (config.get<string>('R2_PUBLIC_URL', '') || '').replace(/\/$/, '');
      const accountId = config.get<string>('CF_ACCOUNT_ID', '');
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2Key,
          secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY', ''),
        },
      });
      this.logger.log(`S3 ready: Cloudflare R2 bucket=${this.bucket}${this.cdnBase ? ' cdn=' + this.cdnBase : ''}`);
    } else {
      // No credentials — service exists but uploads will throw cleanly
      this.mode = 'unconfigured';
      this.bucket = '';
      this.cdnBase = '';
      this.s3 = new S3Client({ region: 'us-east-1' });
      this.logger.warn('S3 not configured — uploads will fail until AWS_* or R2_* env vars are set');
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    if (this.mode === 'unconfigured') {
      throw new Error('S3 not configured — set AWS_ACCESS_KEY_ID + AWS_S3_BUCKET (or R2_* equivalents) in env');
    }

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(this.mode === 'aws' && { ACL: 'public-read' as const }),
        }),
      );

      if (this.cdnBase) return `${this.cdnBase}/${key}`;
      if (this.mode === 'aws') {
        const region = this.config.get<string>('AWS_REGION', 'af-south-1');
        return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
      }
      const accountId = this.config.get<string>('CF_ACCOUNT_ID', '');
      return `https://${accountId}.r2.cloudflarestorage.com/${this.bucket}/${key}`;
    } catch (err: any) {
      this.logger.error(`S3 upload failed for key ${key}`, err.message);
      throw err;
    }
  }

  // ── Public accessors ─────────────────────────────────────────────────────
  // Exposed so other Common services (e.g. UploadService) can sign URLs
  // against the same S3Client + bucket + CDN configuration this service uses.
  // Read-only — callers must NOT mutate the returned objects.

  /** Which backend is active: 'aws' | 'r2' | 'unconfigured'. */
  getMode(): 'aws' | 'r2' | 'unconfigured' {
    return this.mode;
  }

  /** The bucket name in use (empty string when unconfigured). */
  getBucket(): string {
    return this.bucket;
  }

  /** The underlying S3 client (for presigner use; do not mutate). */
  getClient(): S3Client {
    return this.s3;
  }

  /** Public CDN base URL (no trailing slash). Empty string when no CDN is configured. */
  getCdnBase(): string {
    return this.cdnBase;
  }
}
