import { IsString, IsInt, IsArray, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ItineraryDto {
  @IsInt()
  @Min(1)
  @Max(14)
  @Type(() => Number)
  durationDays: number;

  @IsString()
  startLgaSlug: string;

  @IsArray()
  @IsString({ each: true })
  interests: string[];

  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  budgetNgn: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  partySize: number;
}
