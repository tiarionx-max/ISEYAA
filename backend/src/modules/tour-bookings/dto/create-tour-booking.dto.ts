import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsMobilePhone,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { VISITOR_PURPOSE_VALUES } from '../../../common/constants/visitor-purpose.constants';

/**
 * One passenger in a group booking (optional manifest).
 * Used only for non-split-bill groups where the leader pays for everyone
 * but wants to record per-passenger names + phones (for the itinerary PDF).
 * In split-bill mode this stays empty — each passenger registers themselves
 * via POST /tour-bookings/:id/join.
 */
export class PassengerDto {
  @ApiProperty({ example: 'Aisha Adekunle', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsMobilePhone('en-NG')
  phone!: string;
}

/**
 * Body for POST /tour-bookings — initiates a TourBooking in PENDING.
 * Date / availability / event-window / max-group-size guards live in the service.
 * passengerCount > 50 returns 400 "Contact corporate sales for groups over 50".
 */
export class CreateTourBookingDto {
  @ApiProperty({ example: 'pkg-uuid-001', description: 'TourPackage.id (must be status=APPROVED)' })
  @IsUUID()
  tourPackageId!: string;

  @ApiProperty({ example: '2026-07-12', description: 'YYYY-MM-DD; must be in the future' })
  @IsDateString()
  tourDate!: string;

  @ApiProperty({
    example: 4,
    minimum: 1,
    maximum: 50,
    description:
      'Group size after bulk-discount tiering. >50 routes to "Contact corporate sales".',
  })
  @IsInt()
  @Min(1)
  @Max(50)
  passengerCount!: number;

  @ApiProperty({ example: 'aisha@example.com', description: 'Email used for Paystack init' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description:
      'If true, parent booking is created with NO Paystack init. Each passenger calls /join to pay their own share.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  splitBillEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Optional passenger manifest for itinerary PDF',
    type: () => [PassengerDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  @ArrayMaxSize(50)
  passengers?: PassengerDto[];

  @ApiPropertyOptional({
    description: 'Optional purpose-of-visit (D-06). Defaults to Tourism/Leisure when omitted.',
    enum: VISITOR_PURPOSE_VALUES,
  })
  @IsOptional()
  @IsIn(VISITOR_PURPOSE_VALUES)
  purpose?: string;
}
