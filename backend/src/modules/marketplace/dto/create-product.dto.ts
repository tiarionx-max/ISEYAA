import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsBoolean, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ example: 'Handwoven Ankara Basket' })
  @IsString() @IsNotEmpty() @MinLength(2) name: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;

  @ApiProperty({ example: 3500 })
  @IsNumber() @Min(0) @Type(() => Number) price: number;

  @ApiProperty({ example: 50 })
  @IsInt() @Min(0) @Type(() => Number) stock: number;
}
