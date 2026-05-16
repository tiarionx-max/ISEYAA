import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDeliveryOtpDto {
  @ApiProperty({ example: '123456', description: 'Six-digit OTP sent to the recipient' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
