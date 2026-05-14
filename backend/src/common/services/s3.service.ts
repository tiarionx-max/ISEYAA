import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string;
  private readonly accountId: string;

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>('R2_BUCKET', 'iseyaa-media');
    this.cdnBase = config.get<string>('R2_PUBLIC_URL', '');
    this.accountId = config.get<string>('CF_ACCOUNT_ID', '');
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get<string>('R2_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('R2_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );

      return this.cdnBase
        ? `${this.cdnBase}/${key}`
        : `https://${this.accountId}.r2.cloudflarestorage.com/${this.bucket}/${key}`;
    } catch (err) {
      this.logger.error(`S3 upload failed for key ${key}`, err.message);
      throw err;
    }
  }
}
