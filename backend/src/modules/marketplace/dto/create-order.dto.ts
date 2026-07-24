import { IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty() @IsUUID() productId: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) @Type(() => Number) quantity: number;
}

export class DeliveryAddressDto {
  @ApiProperty({ example: 'Ogun' }) @IsString() state: string;
  @ApiProperty({ example: 'Abeokuta' }) @IsString() city: string;
  @ApiProperty({ example: '12 Kuto Road' }) @IsString() street: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 'buyer@example.com' }) @IsEmail() email: string;

  @ApiPropertyOptional({ type: DeliveryAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;
}
