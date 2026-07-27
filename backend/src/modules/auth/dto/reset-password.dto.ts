import { IsMobilePhone, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
