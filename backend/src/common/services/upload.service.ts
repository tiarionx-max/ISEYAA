import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { S3Service } from './s3.service';

export type UploadKeyPrefix =
  | 'tour-certifications'
  | 'review-photos'
  | 'tour-covers'
  | 'avatars'
  | 'misc';

export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_UPLOAD_BYTES_DEFAULT = 5 * 1024 * 1024; // 5 MB
export const MAX_UPLOAD_BYTES_HARD_CAP = 25 * 1024 * 1024; // 25 MB
export const PRESIGNED_URL_EXPIRY_SECONDS = 900; // 15 minutes

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface CreatePresignedUploadInput {
  keyPrefix: UploadKeyPrefix;
  contentType: string;
  /** Defaults to MAX_UPLOAD_BYTES_DEFAULT; silently capped at MAX_UPLOAD_BYTES_HARD_CAP. */
  maxBytes?: number;
  /** Injected by the controller from the authenticated user — NEVER trusted from the body. */
  userId: string;
}

export interface PresignedUploadResult {
  /** PUT here with the raw file bytes. Short-lived (15 minutes). */
  uploadUrl: string;
  /** Server-controlled object key: `${prefix}/${userId}/${uuid}.${ext}`. */
  key: string;
  /** URL the client posts back in the resource-create call. */
  publicUrl: string;
  expiresIn: number;
  /** Echo of the enforced cap so the client can pre-validate. */
  maxBytes: number;
}

/**
 * Generates short-lived presigned PUT URLs so clients can upload directly to S3/R2 without
 * funneling bytes through the NestJS process.
 *
 * **Security rules enforced here:**
 *   - `contentType` is allowlisted (jpeg / png / webp / pdf only).
 *   - `maxBytes` is capped at 25 MB; cap is advisory client-side (S3 presigned URLs cannot
 *     enforce a server-side size limit — downstream resource-create endpoints may HEAD the
 *     publicUrl post-upload if they need a hard size check).
 *   - The object key is server-generated as `${prefix}/${userId}/${uuid}.${ext}`. Clients
 *     CANNOT supply arbitrary paths; the `userId` portion comes from the JWT (never the
 *     request body), which prevents one user from overwriting another user's files.
 *   - `keyPrefix` is a fixed enum — clients cannot upload to `../../secrets/`.
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private s3Service: S3Service, private config: ConfigService) {}

  async createPresignedUploadUrl(input: CreatePresignedUploadInput): Promise<PresignedUploadResult> {
    // 1. Defence-in-depth contentType check (DTO already enforces, but the service is
    //    @Global and may be called directly from other services).
    if (!ALLOWED_UPLOAD_CONTENT_TYPES.includes(input.contentType as (typeof ALLOWED_UPLOAD_CONTENT_TYPES)[number])) {
      throw new BadRequestException(`Unsupported contentType: ${input.contentType}`);
    }

    // 2. Cap maxBytes — never reject, silently clamp.
    const requested = input.maxBytes ?? MAX_UPLOAD_BYTES_DEFAULT;
    if (requested <= 0) throw new BadRequestException('maxBytes must be positive');
    const maxBytes = Math.min(requested, MAX_UPLOAD_BYTES_HARD_CAP);

    // 3. Refuse if S3 is unconfigured.
    if (this.s3Service.getMode() === 'unconfigured') {
      throw new ServiceUnavailableException(
        'Object storage not configured — set AWS_* or R2_* env vars',
      );
    }

    // 4. Server-controlled key: prefix/userId/uuid.ext.
    const ext = EXTENSION_BY_CONTENT_TYPE[input.contentType] ?? 'bin';
    const key = `${input.keyPrefix}/${input.userId}/${uuidv4()}.${ext}`;

    // 5. Sign the PutObject command with a 15-minute expiry.
    const cmd = new PutObjectCommand({
      Bucket: this.s3Service.getBucket(),
      Key: key,
      ContentType: input.contentType,
      ...(this.s3Service.getMode() === 'aws' && { ACL: 'public-read' as const }),
    });
    const uploadUrl = await getSignedUrl(this.s3Service.getClient(), cmd, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    // 6. Compute the publicUrl using the same logic as S3Service.upload().
    const cdnBase = this.s3Service.getCdnBase();
    let publicUrl: string;
    if (cdnBase) {
      publicUrl = `${cdnBase}/${key}`;
    } else if (this.s3Service.getMode() === 'aws') {
      const region = this.config.get<string>('AWS_REGION', 'af-south-1');
      publicUrl = `https://${this.s3Service.getBucket()}.s3.${region}.amazonaws.com/${key}`;
    } else {
      const accountId = this.config.get<string>('CF_ACCOUNT_ID', '');
      publicUrl = `https://${accountId}.r2.cloudflarestorage.com/${this.s3Service.getBucket()}/${key}`;
    }

    this.logger.debug(`Presigned upload URL issued: key=${key} ttl=${PRESIGNED_URL_EXPIRY_SECONDS}s`);

    return { uploadUrl, key, publicUrl, expiresIn: PRESIGNED_URL_EXPIRY_SECONDS, maxBytes };
  }
}
