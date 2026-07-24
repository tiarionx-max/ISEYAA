import { IsEmail, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Security note: must stay a class-validator DTO, not an inline object literal
 * type. NestJS's global ValidationPipe (whitelist: true, forbidNonWhitelisted:
 * true) only validates/strips a @Body() payload when its metatype is a
 * decorated class — an inline TS object type compiles to `Object` design
 * metadata, which ValidationPipe explicitly skips. Previously this endpoint
 * accepted a raw `{ amount: number; email: string }` type with zero runtime
 * validation, so a negative/zero `amount` (or a non-numeric value) would sail
 * straight through into the daily-limit check and the Paystack call.
 */
export class TopupDto {
  @ApiProperty({ example: 5000, description: 'Amount in NGN (minimum 100)' })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
