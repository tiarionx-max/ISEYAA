import { IsString, Length, Matches } from 'class-validator';

export class VerifyNinDto {
  @IsString()
  @Length(11, 11, { message: 'NIN must be exactly 11 digits' })
  @Matches(/^\d{11}$/, { message: 'NIN must be 11 numeric digits' })
  nin!: string;
}
