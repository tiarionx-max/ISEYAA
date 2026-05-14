import { IsDateString, IsEmail, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @ApiProperty({ example: '2026-08-20' }) @IsDateString() checkIn: string;
  @ApiProperty({ example: '2026-08-23' }) @IsDateString() checkOut: string;

  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Type(() => Number) guests: number;

  @ApiProperty({ example: 'guest@example.com' }) @IsEmail() email: string;
}
