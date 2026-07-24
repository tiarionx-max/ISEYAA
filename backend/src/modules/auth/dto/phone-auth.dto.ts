import { IsBoolean, IsEnum, IsMobilePhone, IsOptional, IsString, Length } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class PhoneAuthDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel;

  @IsBoolean()
  ndpaConsent: boolean;
}
