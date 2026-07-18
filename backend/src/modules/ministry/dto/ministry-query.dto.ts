import { IsOptional, IsDateString, IsUUID, IsIn } from 'class-validator';
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

  // 14-07 MIN-05/MIN-06: export routes only. `csv` is the default when
  // omitted — @IsIn() rejects anything else with a 400 before any query or
  // file-generation work runs (T-14-14).
  @ApiPropertyOptional({ description: 'Export format — export routes only', enum: ['csv', 'pdf'] })
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';
}
