import { IsMobilePhone } from 'class-validator';

export class OtpSendDto {
  @IsMobilePhone('en-NG')
  phone: string;
}
