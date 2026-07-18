import { IsEnum } from 'class-validator';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class ChangeOtpChannelDto {
  @IsEnum(OtpChannel, {
    message: 'channel must be one of: ' + Object.values(OtpChannel).join(', '),
  })
  channel: OtpChannel;
}
