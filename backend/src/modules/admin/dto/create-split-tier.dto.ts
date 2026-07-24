import { IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SPLIT_TIER_MODULES = ['transport', 'delivery', 'events', 'studio', 'stays', 'marketplace'] as const;

export class CreateSplitTierDto {
  @ApiProperty({ example: 'transport', enum: SPLIT_TIER_MODULES })
  @IsIn(SPLIT_TIER_MODULES, {
    message: `module must be one of: ${SPLIT_TIER_MODULES.join(', ')}`,
  })
  module: string;

  @ApiPropertyOptional({ example: 'default' })
  @IsString()
  @IsOptional()
  tierName?: string;

  @ApiProperty({ example: 0.85 })
  @IsNumber()
  @Min(0)
  @Max(1)
  earnerPct: number;

  @ApiProperty({ example: 0.05 })
  @IsNumber()
  @Min(0)
  @Max(1)
  ministryPct: number;

  @ApiPropertyOptional({ example: 0.1, nullable: true })
  @ValidateIf((o) => o.platformPct !== null)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  platformPct?: number | null;
}
