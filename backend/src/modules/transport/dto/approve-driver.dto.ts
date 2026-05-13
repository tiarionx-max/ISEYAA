import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';

export class ApproveDriverDto {
  @ApiProperty({
    enum: [DriverStatus.APPROVED, DriverStatus.REJECTED, DriverStatus.SUSPENDED],
    description: 'New status for the driver (APPROVED | REJECTED | SUSPENDED — never PENDING_REVIEW)',
  })
  @IsEnum(DriverStatus, { message: 'status must be APPROVED|REJECTED|SUSPENDED' })
  status: DriverStatus;

  @ApiPropertyOptional({ example: 'Licence documents verified successfully.' })
  @IsString()
  @IsOptional()
  notes?: string;
}
