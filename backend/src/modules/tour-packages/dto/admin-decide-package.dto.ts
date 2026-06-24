import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Used by LGA_ADMIN+ via POST /admin/tour-packages/:id/decide
 * to approve or reject a PENDING TourPackage.
 */
export class AdminDecideTourPackageDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsEnum(['APPROVED', 'REJECTED'] as const, {
    message: 'decision must be APPROVED or REJECTED',
  })
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Itinerary timing infeasible — please tighten' })
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
