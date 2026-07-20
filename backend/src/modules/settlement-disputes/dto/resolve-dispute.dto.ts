import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for both `/resolve` and `/dismiss` (D-01: the ROUTE determines the
 * outcome, not a body field — the system, not the caller, computes the
 * adjustment amount via `resolveSplit()`/`computeAdjustmentLines()`). No
 * decision enum or amount-override field belongs here.
 */
export class ResolveDisputeDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Optional reviewer note, not a decision override (D-01)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;
}
