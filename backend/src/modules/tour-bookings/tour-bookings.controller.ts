import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TourBookingService } from './tour-bookings.service';
import { CreateTourBookingDto } from './dto/create-tour-booking.dto';
import { JoinSplitBillDto } from './dto/join-split-bill.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Tour Bookings — 6 endpoints (all JwtAuthGuard).
 *
 * Route table:
 *   POST   /tour-bookings              — tourist initiates (solo / group / split-bill)
 *   POST   /tour-bookings/:id/join     — split-bill participant pays a share
 *   POST   /tour-bookings/:id/close    — group leader absorbs unpaid remainder
 *   GET    /tour-bookings/me           — current user's bookings (past + upcoming)
 *   GET    /tour-bookings/:id          — single booking (owner-only; 403 otherwise)
 *   POST   /tour-bookings/:id/cancel   — owner cancels (refund handled by 09-06)
 */
@ApiTags('Tour Bookings')
@Controller('tour-bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TourBookingsController {
  constructor(private readonly service: TourBookingService) {}

  @Post()
  @ApiOperation({
    summary: 'Initiate a tour booking',
    description:
      'Validates date / availability / group size. Solo + group: Paystack init returned. ' +
      'Split-bill: NO Paystack init — deep link returned for each passenger to /join.',
  })
  @ApiResponse({ status: 201, description: 'Booking created in PENDING' })
  @ApiResponse({ status: 400, description: 'Date / availability / group-size guard tripped' })
  @ApiResponse({ status: 404, description: 'Package not APPROVED' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateTourBookingDto,
  ) {
    return this.service.createTourBooking(user.userId, dto);
  }

  @Post(':id/join')
  @ApiOperation({
    summary: 'Pay one share of a split-bill booking',
    description: 'Mints a child ISY-TOUR-<12char> and returns an authorizationUrl for the share.',
  })
  @ApiResponse({ status: 201, description: 'Share Paystack init returned' })
  @ApiResponse({ status: 400, description: 'Not split-bill mode, already paid, or fully paid' })
  joinSplitBill(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: JoinSplitBillDto,
  ) {
    return this.service.joinSplitBill(id, user.userId, dto);
  }

  @Post(':id/close')
  @ApiOperation({
    summary: 'Group leader absorbs unpaid remainder',
    description:
      'Initiates a single Paystack charge for `remaining * unitPrice`. ' +
      'CONFIRMED transition still routes through 09-06 webhook.',
  })
  @ApiResponse({ status: 201, description: 'Absorb Paystack init returned' })
  @ApiResponse({ status: 403, description: 'Caller is not the group leader' })
  closeSplitBill(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.service.closeSplitBill(id, user.userId);
  }

  @Get('me')
  @ApiOperation({ summary: 'List the current user\'s tour bookings (past + upcoming)' })
  findMine(@CurrentUser() user: { userId: string }) {
    return this.service.findMine(user.userId);
  }

  @Get('quote')
  @ApiOperation({
    summary: 'Live price quote for a passenger count (applies the real PlatformConfig-sourced bulk discount)',
  })
  getQuote(
    @Query('tourPackageId') tourPackageId: string,
    @Query('passengerCount', ParseIntPipe) passengerCount: number,
  ) {
    return this.service.getQuote(tourPackageId, passengerCount);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single booking with itinerary (owner-only)' })
  @ApiResponse({ status: 403, description: 'Not your booking' })
  findById(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.service.findById(id, user.userId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel a booking (owner-only)',
    description: 'Sets status=CANCELLED. Refund (if already paid) is 09-06\'s RefundService.',
  })
  cancel(@Param('id') id: string, @CurrentUser() user: { userId: string }) {
    return this.service.cancel(id, user.userId);
  }
}
