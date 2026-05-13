import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDriverDto {
  @ApiProperty({ example: 'ABC-123-XY' })
  @IsString()
  @IsNotEmpty()
  licenceNumber: string;

  @ApiProperty({ example: '2028-06-30' })
  @IsDateString()
  licenceExpiry: string;

  @ApiPropertyOptional({ example: '{"nin":"12345678901"}' })
  @IsString()
  @IsOptional()
  metadata?: string;
}
