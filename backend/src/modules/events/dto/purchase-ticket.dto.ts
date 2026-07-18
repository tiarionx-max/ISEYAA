import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VISITOR_PURPOSE_VALUES } from '../../../common/constants/visitor-purpose.constants';

export class PurchaseTicketDto {
  @ApiProperty({ description: 'TicketType UUID' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ example: 'buyer@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: VISITOR_PURPOSE_VALUES })
  @IsOptional()
  @IsIn(VISITOR_PURPOSE_VALUES)
  purpose?: string;
}
