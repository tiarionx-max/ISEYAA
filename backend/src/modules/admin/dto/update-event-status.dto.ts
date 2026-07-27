import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type EventStatusUpdateLiteral = 'APPROVED' | 'PUBLISHED' | 'CANCELLED';
export const EVENT_STATUS_UPDATE_VALUES: EventStatusUpdateLiteral[] = ['APPROVED', 'PUBLISHED', 'CANCELLED'];

export class UpdateEventStatusDto {
  @ApiProperty({ enum: EVENT_STATUS_UPDATE_VALUES })
  @IsEnum(EVENT_STATUS_UPDATE_VALUES, {
    message: 'status must be one of APPROVED | PUBLISHED | CANCELLED',
  })
  status!: EventStatusUpdateLiteral;
}
