import { IsNumber, IsString, IsNotEmpty, Min, Max, IsMobilePhone } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RequestDeliveryDto {
  @ApiProperty({ example: 7.1608, description: 'Pickup latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  pickupLat: number;

  @ApiProperty({ example: 3.3475, description: 'Pickup longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  pickupLng: number;

  @ApiProperty({ example: '1 Ake Road, Abeokuta' })
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ApiProperty({ example: 7.2571, description: 'Dropoff latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  dropoffLat: number;

  @ApiProperty({ example: 3.4167, description: 'Dropoff longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  dropoffLng: number;

  @ApiProperty({ example: 'Olumo Rock, Abeokuta' })
  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @ApiProperty({ example: 'Electronics — laptop and charger' })
  @IsString()
  @IsNotEmpty()
  itemDescription: string;

  @ApiProperty({ example: 2.5, description: 'Package weight in kilograms (0.1 – 500)' })
  @IsNumber()
  @Min(0.1)
  @Max(500)
  @Type(() => Number)
  weightKg: number;

  @ApiProperty({ example: '+2348012345678', description: "Recipient's Nigerian phone number — OTP is sent here" })
  @IsMobilePhone('en-NG', {}, { message: 'recipientPhone must be a valid Nigerian phone number' })
  recipientPhone: string;
}
