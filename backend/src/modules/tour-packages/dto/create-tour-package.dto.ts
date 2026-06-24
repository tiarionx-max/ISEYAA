import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TourPackageCategory } from '@prisma/client';

/**
 * Sub-DTO — single itinerary entry. Validated via @ValidateNested on parent.
 */
export class ItineraryItemDto {
  @ApiProperty({ example: 9, description: 'Hour offset from tour start (0-72)' })
  @IsInt() @Min(0) @Max(72) hour!: number;

  @ApiProperty({ example: 'Visit Olumo Rock' })
  @IsString() @Length(2, 120) title!: string;

  @ApiProperty({ example: 'Tour the historic granite rock and museum' })
  @IsString() @MaxLength(500) description!: string;

  @ApiPropertyOptional({ example: 'Olumo Rock, Abeokuta' })
  @IsOptional() @IsString() @MaxLength(200) location?: string;
}

/**
 * Sub-DTO — single settlement-split entry. The sum of percentages MUST be <= 100
 * (DB CHECK constraint enforced in 09-01; service-layer guard in TourPackageService
 * is the user-friendly first line of defence).
 */
export class SettlementSplitEntryDto {
  @ApiProperty({ enum: ['GUIDE', 'HOST', 'ORGANISER', 'ATTRACTION'] })
  @IsEnum(['GUIDE', 'HOST', 'ORGANISER', 'ATTRACTION'] as const, {
    message: 'vendorType must be one of GUIDE|HOST|ORGANISER|ATTRACTION',
  })
  vendorType!: 'GUIDE' | 'HOST' | 'ORGANISER' | 'ATTRACTION';

  @ApiProperty({ example: 'uuid-of-vendor' })
  @IsUUID() vendorId!: string;

  @ApiProperty({ example: 70, description: '% of booking revenue routed to vendor' })
  @IsNumber() @Min(0) @Max(100) percentage!: number;
}

export class CreateTourPackageDto {
  @ApiProperty({ example: 'Heritage Olumo Rock & Adire Walk' })
  @IsString() @Length(3, 120) name!: string;

  @ApiPropertyOptional({ example: 'A full-day heritage walk through Abeokuta...' })
  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @ApiProperty({ example: 'lga-uuid' })
  @IsUUID() lgaId!: string;

  @ApiProperty({ example: 'tour-guide-uuid' })
  @IsUUID() tourGuideId!: string;

  @ApiProperty({ enum: TourPackageCategory })
  @IsEnum(TourPackageCategory, { message: 'category must be a valid TourPackageCategory enum value' })
  category!: TourPackageCategory;

  @ApiProperty({ example: 18000, description: 'NGN per passenger before bulk discount' })
  @IsNumber() @Min(100) price!: number;

  @ApiProperty({ example: 6 })
  @IsInt() @Min(1) @Max(72) durationHours!: number;

  @ApiProperty({ example: 12 })
  @IsInt() @Min(1) @Max(50) maxGroupSize!: number;

  @ApiPropertyOptional({ example: 'https://cdn.iseyaa.ng/tours/cover.jpg' })
  @IsOptional() @IsUrl() coverImageUrl?: string;

  @ApiPropertyOptional({ type: [String], example: ['https://cdn.iseyaa.ng/tours/1.jpg'] })
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsUrl({}, { each: true }) imageUrls?: string[];

  @ApiProperty({ type: [String], description: '1-10 attraction UUIDs visited on this tour' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('all', { each: true }) attractionIds!: string[];

  @ApiPropertyOptional({ example: 'property-uuid' })
  @IsOptional() @IsUUID() propertyId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Optional event UUIDs bundled into the tour (max 10)' })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) eventIds?: string[];

  @ApiPropertyOptional({ example: 'Pickup at Lafenwa terminus 7am sharp' })
  @IsOptional() @IsString() @MaxLength(500) transportNote?: string;

  @ApiProperty({ type: [ItineraryItemDto], description: '1-20 itinerary items, ordered by ascending hour' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ItineraryItemDto)
  itineraryTemplate!: ItineraryItemDto[];

  @ApiProperty({
    type: [SettlementSplitEntryDto],
    description: 'Split-bill table — sum of percentages MUST be ≤ 100',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SettlementSplitEntryDto)
  settlementSplit!: SettlementSplitEntryDto[];
}
