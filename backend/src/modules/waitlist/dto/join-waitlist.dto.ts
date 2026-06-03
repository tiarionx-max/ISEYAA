import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsMobilePhone, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const WAITLIST_SOURCES = ['marketplace_web', 'marketplace_mobile'] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export class JoinWaitlistDto {
  @ApiProperty({ enum: WAITLIST_SOURCES, description: 'Where the user joined from' })
  @IsIn(WAITLIST_SOURCES as unknown as string[])
  source: WaitlistSource;

  @ApiProperty({ required: false, example: 'user@example.com' })
  @ValidateIf((o) => !o.phone)
  @IsEmail({}, { message: 'Provide a valid email or a phone number' })
  email?: string;

  @ApiProperty({ required: false, example: '+2348012345678' })
  @IsOptional()
  @IsMobilePhone('en-NG', undefined, { message: 'Provide a valid Nigerian phone number' })
  phone?: string;

  @ApiProperty({ required: false, example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  fullName?: string;
}
