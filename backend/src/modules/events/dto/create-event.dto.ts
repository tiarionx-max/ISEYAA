import { IsString, IsNotEmpty, IsOptional, IsDateString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Ogun Cultural Festival 2026' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'LGA UUID' })
  @IsUUID()
  lgaId: string;

  @ApiProperty({ example: 'Abeokuta Cultural Centre' })
  @IsString()
  @IsNotEmpty()
  venue: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '2026-08-15T09:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-08-15T21:00:00Z' })
  @IsDateString()
  endDate: string;
}
