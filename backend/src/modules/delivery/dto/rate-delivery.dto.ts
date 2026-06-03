import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RateDeliveryDto {
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Rating for the rider (1–5 stars)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;
}
