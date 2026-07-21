import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExportCadence } from '@prisma/client';

export class UpdateExportSubscriptionDto {
  @ApiPropertyOptional({ type: [String], example: ['ministry-analyst@ogunstate.gov.ng'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipients?: string[];

  @ApiPropertyOptional({ enum: ExportCadence })
  @IsOptional()
  @IsEnum(ExportCadence, { message: 'cadence must be WEEKLY, MONTHLY, or QUARTERLY' })
  cadence?: ExportCadence;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
