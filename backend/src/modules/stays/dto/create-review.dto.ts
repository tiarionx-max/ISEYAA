import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating: number;

  @ApiPropertyOptional() @IsString() @IsOptional() comment?: string;
}
