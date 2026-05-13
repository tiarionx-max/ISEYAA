import { IsNumber, IsString, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VehicleType } from '@prisma/client';

export class RequestRideDto {
  @ApiProperty({ example: 7.1608, description: 'Pickup latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  pickupLat: number;

  @ApiProperty({ example: 3.3475, description: 'Pickup longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  pickupLng: number;

  @ApiPropertyOptional({ example: '1 Ake Road, Abeokuta' })
  @IsString()
  @IsOptional()
  pickupAddress?: string;

  @ApiProperty({ example: 7.2571, description: 'Dropoff latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  dropoffLat: number;

  @ApiProperty({ example: 3.4167, description: 'Dropoff longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  dropoffLng: number;

  @ApiPropertyOptional({ example: 'Olumo Rock, Abeokuta' })
  @IsString()
  @IsOptional()
  dropoffAddress?: string;

  @ApiProperty({ enum: VehicleType, example: VehicleType.CAR })
  @IsEnum(VehicleType, { message: 'vehicleType must be BIKE|TRICYCLE|CAR|MINIBUS' })
  vehicleType: VehicleType;
}
