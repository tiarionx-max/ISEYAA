import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RiderGoOnlineDto {
  @ApiProperty({ example: 7.1608, description: 'Rider latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat: number;

  @ApiProperty({ example: 3.3475, description: 'Rider longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng: number;
}
