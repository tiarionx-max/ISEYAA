import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * PATCH /api/v1/tour-guides/me/availability — updates the guide's calendar.
 *
 * Schema column `tour_guides.availability` (Json) shape (locked in 09-01):
 *   { blockedDates: string[] (ISO YYYY-MM-DD); weeklyOffDays: number[] (0-6, 0=Sun) }
 */
export class UpdateAvailabilityDto {
  @ApiPropertyOptional({
    description: 'ISO YYYY-MM-DD dates the guide is unavailable.',
    example: ['2026-07-15', '2026-12-25'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'blockedDates must be ISO YYYY-MM-DD',
  })
  blockedDates?: string[];

  @ApiPropertyOptional({
    description: 'Recurring weekly days off — 0=Sunday … 6=Saturday (UTC).',
    example: [0, 6],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays?: number[];
}
