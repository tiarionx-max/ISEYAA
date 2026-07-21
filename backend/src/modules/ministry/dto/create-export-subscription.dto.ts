import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExportCadence } from '@prisma/client';

export class CreateExportSubscriptionDto {
  @ApiProperty({ type: [String], example: ['ministry-analyst@ogunstate.gov.ng'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  recipients!: string[];

  @ApiProperty({ enum: ExportCadence })
  @IsEnum(ExportCadence, { message: 'cadence must be WEEKLY, MONTHLY, or QUARTERLY' })
  cadence!: ExportCadence;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
