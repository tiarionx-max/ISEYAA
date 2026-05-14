import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query string', example: 'Olumo Rock' })
  @IsString()
  @IsNotEmpty()
  q: string;

  @ApiPropertyOptional({ description: 'Latitude for geo-ranked results', example: 7.16 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for geo-ranked results', example: 3.35 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ description: 'Results per collection', minimum: 1, maximum: 50, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  perPage?: number = 5;
}
