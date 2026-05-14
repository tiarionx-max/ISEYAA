import { IsMobilePhone, IsString, Length } from 'class-validator';

export class OtpVerifyDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
