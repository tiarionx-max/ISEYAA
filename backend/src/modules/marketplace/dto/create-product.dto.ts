import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsIn, IsArray, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// Mirrors web/src/app/marketplace/page.tsx's CATEGORIES config (Product.category
// is a free-text `String?` column in the schema, but the marketplace UI's category
// strip and ?category= filter only ever produce these six slugs).
const PRODUCT_CATEGORIES = ['fashion', 'crafts', 'food', 'art', 'tech', 'agriculture'] as const;

export class CreateProductDto {
  @ApiProperty({ example: 'Handwoven Ankara Basket' })
  @IsString() @IsNotEmpty() @MinLength(2) name: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;

  @ApiProperty({ example: 3500 })
  @IsNumber() @Min(0) @Type(() => Number) price: number;

  @ApiProperty({ example: 50 })
  @IsInt() @Min(0) @Type(() => Number) stock: number;

  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES })
  @IsOptional() @IsIn(PRODUCT_CATEGORIES) category?: string;

  @ApiPropertyOptional({ example: 4500, description: '"Was ₦X" strike-through price for sale display' })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) compareAtPrice?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
}
