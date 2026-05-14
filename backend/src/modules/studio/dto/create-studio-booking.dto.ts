import { IsDateString, IsEmail, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateStudioBookingDto {
  @ApiProperty({ description: 'StudioSlot UUID' }) @IsUUID() slotId: string;

  @ApiProperty({ example: '2026-08-20T10:00:00Z' }) @IsDateString() startTime: string;

  @ApiProperty({ example: 2, description: 'Duration in hours' })
  @IsInt() @Min(1) @Type(() => Number) durationHours: number;

  @ApiProperty({ example: 'creator@example.com' }) @IsEmail() email: string;
}
