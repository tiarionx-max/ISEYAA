import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * POST /api/v1/tour-guides/me/kyc — submit National Identification Number for Tier-2 KYC.
 *
 * NIN is AES-256-GCM encrypted (EncryptionService) and bcrypt-hashed (12 rounds) for
 * duplicate lookup before being persisted. Plaintext is NEVER logged or returned.
 * (CLAUDE.md NDPA constraint.)
 */
export class SubmitKycDto {
  @ApiProperty({ description: '11-digit NIN', example: '12345678901' })
  @IsString()
  @Length(11, 11)
  @Matches(/^\d{11}$/, { message: 'NIN must be 11 digits' })
  nin!: string;
}
