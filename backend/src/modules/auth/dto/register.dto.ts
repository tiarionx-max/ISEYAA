import { IsEmail, IsString, MinLength, IsOptional, IsMobilePhone, IsEnum, IsBoolean } from 'class-validator';
import { UserRole, REGISTERABLE_ROLES } from '../../../common/enums/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsMobilePhone('en-NG')
  phone: string;

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

  @IsBoolean()
  ndpaConsent: boolean;
}
