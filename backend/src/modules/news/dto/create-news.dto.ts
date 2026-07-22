import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** Mirrors the freeform category comment on NewsItem.category in schema.prisma. */
export const NEWS_CATEGORIES = ['gov', 'tourism', 'business', 'culture', 'sport'] as const;
export type NewsCategoryLiteral = (typeof NEWS_CATEGORIES)[number];

export class CreateNewsDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  headline!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @ApiPropertyOptional({ description: 'External URL or internal route' })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({ example: 'Ogun State Gov' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ enum: NEWS_CATEGORIES })
  @IsOptional()
  @IsIn(NEWS_CATEGORIES as unknown as string[])
  category?: NewsCategoryLiteral;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true, description: 'Whether the item is publicly visible immediately' })
  @IsOptional()
  @IsBoolean()
  isLive?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Pins the item above non-priority items' })
  @IsOptional()
  @IsBoolean()
  isPriority?: boolean;
}
