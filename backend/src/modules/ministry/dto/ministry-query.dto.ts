import { IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MinistryQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start of the visitedAt date range (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end of the visitedAt date range (ISO 8601)', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'LGA UUID to filter results to a single LGA' })
  @IsOptional()
  @IsUUID()
  lgaId?: string;
}
