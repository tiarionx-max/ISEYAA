import { IsMobilePhone } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveRecipientDto {
  @ApiProperty({ example: '+2348012345678', description: 'Nigerian phone number to resolve' })
  @IsMobilePhone('en-NG')
  phone: string;
}
