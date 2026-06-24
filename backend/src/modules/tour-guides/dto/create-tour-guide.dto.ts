import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  ArrayMaxSize,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Submitted by an authenticated TOUR_GUIDE to populate / update their own profile.
 *
 * `certifications` accepts publicUrls returned by the 09-02 UploadService:
 *   1. Client → POST /api/v1/uploads/presigned { keyPrefix: 'tour-certifications', contentType }
 *   2. Server returns { uploadUrl, key, publicUrl, expiresIn: 900 }
 *   3. Client → PUT raw file bytes to uploadUrl (15 min TTL)
 *   4. Client → POST /api/v1/tour-guides { certifications: [publicUrl, ...] }
 *
 * This endpoint NEVER accepts multipart file uploads — only validated URLs.
 */
export class CreateTourGuideDto {
  @ApiPropertyOptional({ description: 'Free-text bio (≤ 2000 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ description: 'Years of guiding experience (0-60)', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @ApiPropertyOptional({ description: 'Languages spoken (ISO names)', example: ['English', 'Yoruba'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languagesSpoken?: string[];

  @ApiPropertyOptional({
    description:
      'publicUrls of uploaded certificate files (obtained via POST /uploads/presigned with keyPrefix=tour-certifications).',
    example: ['https://cdn.iseyaa.ng/tour-certifications/uuid/cert.pdf'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  certifications?: string[];
}
