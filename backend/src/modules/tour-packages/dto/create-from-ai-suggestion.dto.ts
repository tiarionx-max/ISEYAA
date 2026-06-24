import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * AI bridge DTO — backend half of SC5 "Save as bookable" (PLAN-CHECK M1).
 *
 * Posted by ANY authenticated user (including tourists) when they want to
 * save an AI itinerary suggestion as a DRAFT TourPackage. The created row
 * has status=DRAFT, tourGuideId=null, lgaId=null, settlementSplit=[], and
 * is invisible to public /tour-packages listing until an APPROVED guide
 * claims it (future endpoint) and admin approves.
 */
export class CreateFromAiSuggestionDto {
  @ApiPropertyOptional({
    example: 'conv-uuid-from-ai-chat',
    description: 'Links the DRAFT back to the AI conversation it came from',
  })
  @IsOptional() @IsUUID() aiConversationId?: string;

  @ApiProperty({ example: 'Adire & Aro Heritage Tour' })
  @IsString() @Length(3, 120) title!: string;

  @ApiProperty({ example: 'A one-paragraph summary of the AI-suggested itinerary' })
  @IsString() @Length(10, 5000) description!: string;

  @ApiProperty({
    example: 'Day 1: Olumo Rock at dawn. 10am Adire workshop. 2pm Aro forest walk...',
    description: 'Raw AI free-text blob — preserved verbatim as itineraryTemplate[0].description',
  })
  @IsString() @Length(10, 10000) suggestedItinerary!: string;
}
