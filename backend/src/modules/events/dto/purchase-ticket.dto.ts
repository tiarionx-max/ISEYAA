import { IsEmail, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PurchaseTicketDto {
  @ApiProperty({ description: 'TicketType UUID' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ example: 'buyer@example.com' })
  @IsEmail()
  email: string;
}
