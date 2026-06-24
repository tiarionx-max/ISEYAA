import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES_HARD_CAP,
  UploadKeyPrefix,
} from '../services/upload.service';

export class CreatePresignedUploadDto {
  @ApiProperty({
    enum: ['tour-certifications', 'review-photos', 'tour-covers', 'avatars', 'misc'],
    description: 'Folder bucket the file lands in. Whitelisted to prevent arbitrary path uploads.',
  })
  @IsEnum(['tour-certifications', 'review-photos', 'tour-covers', 'avatars', 'misc'])
  keyPrefix!: UploadKeyPrefix;

  @ApiProperty({
    enum: ALLOWED_UPLOAD_CONTENT_TYPES,
    description: 'MIME type of the file the client intends to PUT.',
  })
  @IsString()
  @IsIn([...ALLOWED_UPLOAD_CONTENT_TYPES])
  contentType!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_UPLOAD_BYTES_HARD_CAP,
    description: 'Advisory max byte size (default 5 MB, hard cap 25 MB).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES_HARD_CAP)
  maxBytes?: number;
}
