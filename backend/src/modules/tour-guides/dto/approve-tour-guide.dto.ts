import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type TourGuideDecision = 'APPROVED' | 'REJECTED';

/**
 * POST /api/v1/admin/tour-guides/:id/approve — LGA_ADMIN+ guarded.
 * Transitions PENDING → APPROVED (or REJECTED with optional reason).
 */
export class ApproveTourGuideDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsEnum(['APPROVED', 'REJECTED'], {
    message: 'decision must be APPROVED or REJECTED',
  })
  decision!: TourGuideDecision;

  @ApiPropertyOptional({ description: 'Required when decision=REJECTED — surfaces in admin UI / appeal flow.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
