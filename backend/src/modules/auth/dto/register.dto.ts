import { IsEmail, IsString, MinLength, IsOptional, IsMobilePhone, IsEnum, IsBoolean, Length } from 'class-validator';
import { UserRole, REGISTERABLE_ROLES } from '../../../common/enums/user-role.enum';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsMobilePhone('en-NG')
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(REGISTERABLE_ROLES, { message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}` })
  @IsOptional()
  role?: UserRole;

  @IsEnum(OtpChannel, { message: `channel must be one of: ${Object.values(OtpChannel).join(', ')}` })
  @IsOptional()
  channel?: OtpChannel;

  @IsBoolean()
  ndpaConsent: boolean;
}
