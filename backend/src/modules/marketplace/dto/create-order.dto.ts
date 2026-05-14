import { IsArray, IsEmail, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Type(() => Number) quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 'buyer@example.com' }) @IsEmail() email: string;
}
