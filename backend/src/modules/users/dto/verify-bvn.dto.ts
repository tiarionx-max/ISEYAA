import { IsString, Length, Matches } from 'class-validator';

export class VerifyBvnDto {
  @IsString()
  @Length(11, 11, { message: 'BVN must be exactly 11 digits' })
  @Matches(/^\d{11}$/, { message: 'BVN must be 11 numeric digits' })
  bvn!: string;
}
