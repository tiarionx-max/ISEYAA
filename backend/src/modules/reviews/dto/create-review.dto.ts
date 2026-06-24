import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Polymorphic review target. Mirrors the Prisma `ReviewTargetType` enum.
 *
 * - GUIDE   → targetId is `TourGuide.id` (resolved from booking.snapshot.tourGuideId)
 * - PACKAGE → targetId is `TourPackage.id` (must equal booking.tourPackageId)
 * - VENUE   → targetId is `Property.id` OR `Attraction.id` (must be in
 *             booking.snapshot.attractionIds ∪ [booking.snapshot.propertyId])
 */
export type ReviewTargetTypeLiteral = 'GUIDE' | 'PACKAGE' | 'VENUE';
export const REVIEW_TARGET_TYPES: ReviewTargetTypeLiteral[] = ['GUIDE', 'PACKAGE', 'VENUE'];

export class CreateReviewDto {
  @ApiProperty({
    description: 'TourBooking the review is tied to. Must be owned by the actor.',
  })
  @IsUUID()
  tourBookingId!: string;

  @ApiProperty({ enum: REVIEW_TARGET_TYPES })
  @IsEnum(REVIEW_TARGET_TYPES, {
    message: 'targetType must be one of GUIDE | PACKAGE | VENUE',
  })
  targetType!: ReviewTargetTypeLiteral;

  @ApiProperty({ description: 'GUIDE/PACKAGE/VENUE id (see targetType)' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, description: '1-5 stars (integer)' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /**
   * Photo URLs that MUST come from the presigned-URL flow shipped in 09-02
   * (`POST /api/v1/uploads/presigned` with `keyPrefix='review-photos'`).
   *
   * The DTO validates each entry as a URL — this endpoint does NOT accept
   * multipart file uploads. The client uploads each photo directly to S3/R2
   * via the presigned PUT URL, then submits the returned `publicUrl[]` here.
   *
   * Hard cap of 5 photos per review (enforced by @ArrayMaxSize).
   */
  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description:
      'publicUrls from POST /uploads/presigned (keyPrefix=review-photos). Max 5.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'photos: max 5 entries' })
  @IsUrl({}, { each: true, message: 'photos: each entry must be a URL from /uploads/presigned' })
  photos?: string[];
}
