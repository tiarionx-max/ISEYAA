import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveDeliveryRiderDto {
  @ApiProperty({
    description: 'Set to true to approve the rider, false to reject',
    example: true,
  })
  @IsBoolean()
  approved: boolean;
}
