import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSplitTierDto {
  @ApiPropertyOptional({ example: 0.85 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  earnerPct?: number;

  @ApiPropertyOptional({ example: 0.05 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  ministryPct?: number;

  @ApiPropertyOptional({ example: 0.1, nullable: true })
  @ValidateIf((o) => o.platformPct !== null)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  platformPct?: number | null;
}
