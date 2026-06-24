import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/**
 * Body for POST /tour-bookings/:id/join — split-bill participant pays their share.
 * Mints a NEW child reference (ISY-TOUR-<12char>) and initiates a separate Paystack
 * payment for `unitPrice`. The 09-06 webhook handler appends the payer userId to
 * splitBillPaidUserIds and transitions the parent → CONFIRMED when full.
 */
export class JoinSplitBillDto {
  @ApiProperty({ example: 'tunde@example.com', description: 'Email for this share Paystack init' })
  @IsEmail()
  email!: string;
}
