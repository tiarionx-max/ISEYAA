import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMembershipDto {
  @ApiProperty({ example: 'member@example.com' }) @IsEmail() email: string;
}
