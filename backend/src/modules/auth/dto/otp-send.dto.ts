import { IsEmail, IsEnum, IsMobilePhone, IsOptional, ValidateIf } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class OtpSendDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel;

  @ValidateIf((o) => o.channel === OtpChannel.EMAIL)
  @IsEmail({}, { message: 'A valid email is required when channel is EMAIL' })
  email?: string;
}
