import { IsMobilePhone, IsNumber, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
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

  @ApiProperty({
    example: 'e4b1c8b2-7a1a-4c2e-9c2a-1f9f2b0a5b21',
    description:
      'Client-generated unique key (per submit attempt). Required so a retried/duplicated ' +
      'request (network timeout, double-tap) cannot double-debit the sender — CLAUDE.md ' +
      'requires an idempotency key on all wallet mutations.',
  })
  @IsString()
  @Length(8, 64)
  idempotencyKey: string;
}
