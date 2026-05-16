import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CompleteDeliveryDto {
  @ApiPropertyOptional({
    description: 'Base64-encoded JPEG proof-of-delivery photo (required at service layer)',
    example: '/9j/4AAQSkZJRgABAQ...',
  })
  @IsString()
  @IsOptional()
  proofPhotoBase64?: string; // optional at DTO level; service enforces presence

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Rating for the sender (1–5 stars)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Type(() => Number)
  senderRating?: number;
}
