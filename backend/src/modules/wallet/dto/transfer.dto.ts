import { IsMobilePhone, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferDto {
  @ApiProperty({ example: '+2348012345678', description: 'Nigerian phone number of recipient' })
  @IsMobilePhone('en-NG')
  recipientPhone: string;

  @ApiProperty({ example: 1000, description: 'Amount in NGN (minimum 100)' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiPropertyOptional({ example: 'Birthday gift', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  narration?: string;
}
