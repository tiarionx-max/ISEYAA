import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CompleteTripDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Rating for the driver (1–5 stars)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Type(() => Number)
  driverRating?: number;

  @ApiPropertyOptional({ example: 'Driver arrived late' })
  @IsString()
  @IsOptional()
  cancelReason?: string;
}
