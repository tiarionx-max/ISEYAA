import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type FlagDecisionLiteral = 'RESOLVED' | 'DISMISSED';
export const FLAG_DECISIONS: FlagDecisionLiteral[] = ['RESOLVED', 'DISMISSED'];

export class ResolveFlagDto {
  @ApiProperty({
    enum: FLAG_DECISIONS,
    description: 'RESOLVED → action taken; DISMISSED → no action needed',
  })
  @IsEnum(FLAG_DECISIONS, {
    message: 'decision must be one of RESOLVED | DISMISSED',
  })
  decision!: FlagDecisionLiteral;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolution?: string;
}
