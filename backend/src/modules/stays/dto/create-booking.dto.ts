import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VISITOR_PURPOSE_VALUES } from '../../../common/constants/visitor-purpose.constants';

export class CreateBookingDto {
  @ApiProperty({ example: '2026-08-20' }) @IsDateString() checkIn: string;
  @ApiProperty({ example: '2026-08-23' }) @IsDateString() checkOut: string;

  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Type(() => Number) guests: number;

  @ApiProperty({ example: 'guest@example.com' }) @IsEmail() email: string;

  @ApiPropertyOptional({ enum: VISITOR_PURPOSE_VALUES })
  @IsOptional()
  @IsIn(VISITOR_PURPOSE_VALUES)
  purpose?: string;
}
