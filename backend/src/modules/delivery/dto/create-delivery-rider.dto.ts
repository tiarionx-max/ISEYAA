import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeliveryRiderDto {
  @ApiPropertyOptional({ example: '{"vehicleNumber":"ABC-123","vehicleType":"BIKE"}' })
  @IsString()
  @IsOptional()
  metadata?: string;
}
