import {
  IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsInt,
  IsEnum, IsArray, Min, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PropertyType {
  HOTEL = 'HOTEL',
  GUESTHOUSE = 'GUESTHOUSE',
  APARTMENT = 'APARTMENT',
  VILLA = 'VILLA',
  RESORT = 'RESORT',
}

export class CreatePropertyDto {
  @ApiProperty() @IsUUID() lgaId: string;

  @ApiProperty({ example: 'Olusegun Obasanjo Presidential Library Guest Suite' })
  @IsString() @IsNotEmpty() @MinLength(3) name: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;

  @ApiProperty({ enum: PropertyType }) @IsEnum(PropertyType) type: PropertyType;

  @ApiProperty({ example: '1 Library Road, Abeokuta' })
  @IsString() @IsNotEmpty() address: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) latitude?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) longitude?: number;

  @ApiProperty({ example: 15000 }) @IsNumber() @Min(0) @Type(() => Number) pricePerNight: number;

  @ApiProperty({ example: 4 }) @IsInt() @Min(1) @Type(() => Number) maxGuests: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional() amenities?: string[];
}
