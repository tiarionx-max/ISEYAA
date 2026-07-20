import { IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The seven settlement-producing modules a dispute can target (D-03). Mirrors
 * every caller of `SettlementService.settle()` — transport/delivery/marketplace/
 * events/stays/studio (two-way splits) plus tour (Phase 9's pre-existing
 * multi-vendor settlement engine, also routed through `settle()`).
 */
export type SettlementDisputeModuleLiteral =
  | 'transport'
  | 'delivery'
  | 'events'
  | 'marketplace'
  | 'stays'
  | 'studio'
  | 'tour';

export const SETTLEMENT_DISPUTE_MODULES: SettlementDisputeModuleLiteral[] = [
  'transport',
  'delivery',
  'events',
  'marketplace',
  'stays',
  'studio',
  'tour',
];

export class RaiseDisputeDto {
  @ApiProperty({
    description: 'Original settlement Transaction.reference prefix being disputed',
  })
  @IsString()
  settlementReference!: string;

  @ApiProperty({ enum: SETTLEMENT_DISPUTE_MODULES })
  @IsEnum(SETTLEMENT_DISPUTE_MODULES, {
    message: `module must be one of ${SETTLEMENT_DISPUTE_MODULES.join(' | ')}`,
  })
  module!: SettlementDisputeModuleLiteral;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Informational only (D-01) — the system computes the actual adjustment via resolveSplit(), this value is not used to derive it.',
  })
  @IsOptional()
  @IsNumber()
  requestedAdjustmentNgn?: number;
}
