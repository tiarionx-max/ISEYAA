import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VehicleType } from '@prisma/client';

export class CreateVehicleDto {
  @ApiProperty({ enum: VehicleType, example: VehicleType.CAR })
  @IsEnum(VehicleType, { message: 'type must be BIKE|TRICYCLE|CAR|MINIBUS' })
  type: VehicleType;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  make: string;

  @ApiProperty({ example: 'Camry' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiProperty({ example: 2020 })
  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  @Type(() => Number)
  year: number;

  @ApiProperty({ example: 'ABC-123-XY' })
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ example: 'Silver' })
  @IsString()
  @IsNotEmpty()
  colour: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/vehicle.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
