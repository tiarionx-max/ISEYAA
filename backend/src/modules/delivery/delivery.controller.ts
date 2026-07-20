import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { DeliveryOtpClientService } from '../delivery-otp-client/delivery-otp-client.service';
import { CreateDeliveryRiderDto } from './dto/create-delivery-rider.dto';
import { ApproveDeliveryRiderDto } from './dto/approve-delivery-rider.dto';
import { RiderGoOnlineDto } from './dto/rider-go-online.dto';
import { RequestDeliveryDto } from './dto/request-delivery.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';
import { VerifyDeliveryOtpDto } from './dto/verify-delivery-otp.dto';
import { RateDeliveryDto } from './dto/rate-delivery.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly deliveryOtpClient: DeliveryOtpClientService,
  ) {}

  // ── Fee Estimate (public — no auth) ──────────────────────────────────────

  @Get('fee-estimate')
  @ApiOperation({ summary: 'Get delivery fee estimate (public)' })
  getFeeEstimate(
    @Query('pickupLat') pickupLat: string,
    @Query('pickupLng') pickupLng: string,
    @Query('dropoffLat') dropoffLat: string,
    @Query('dropoffLng') dropoffLng: string,
    @Query('weightKg') weightKg: string,
  ) {
    return this.deliveryService.getFeeEstimate({
      pickupLat: parseFloat(pickupLat),
      pickupLng: parseFloat(pickupLng),
      dropoffLat: parseFloat(dropoffLat),
      dropoffLng: parseFloat(dropoffLng),
      weightKg: parseFloat(weightKg),
    });
  }

  // ── Rider Profile ─────────────────────────────────────────────────────────

  @Get('riders/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user’s delivery-rider profile (null if not registered)' })
  getMyRiderProfile(@CurrentUser() user: any) {
    return this.deliveryService.getMyRiderProfile(user.userId);
  }

  @Post('riders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create delivery rider profile (DRIVER)' })
  createDeliveryRider(@CurrentUser() user: any, @Body() dto: CreateDeliveryRiderDto) {
    return this.deliveryService.createDeliveryRider(user.userId, dto);
  }

  @Patch('riders/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject delivery rider KYC application (LGA_ADMIN)' })
  approveDeliveryRider(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveDeliveryRiderDto,
  ) {
    return this.deliveryService.approveDeliveryRider(id, user.userId, dto);
  }

  // ── Rider Online / Offline ────────────────────────────────────────────────

  @Post('go-online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark rider as online and register geo position (DRIVER)' })
  goOnline(@CurrentUser() user: any, @Body() dto: RiderGoOnlineDto) {
    return this.deliveryService.goOnline(user.userId, dto);
  }

  @Post('go-offline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark rider as offline and remove from geo set (DRIVER)' })
  goOffline(@CurrentUser() user: any) {
    return this.deliveryService.goOffline(user.userId);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  @Get('riders/earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get rider earnings dashboard (DRIVER)' })
  getRiderEarnings(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week',
  ) {
    return this.deliveryService.getRiderEarnings(user.userId, period);
  }

  // ── Order Lifecycle ───────────────────────────────────────────────────────

  @Post('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.TOURIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request a delivery — nearest rider matched within 60s (CITIZEN, TOURIST)' })
  requestDelivery(@CurrentUser() user: any, @Body() dto: RequestDeliveryDto) {
    return this.deliveryService.requestDelivery(user.userId, dto);
  }

  @Patch('orders/:id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an assigned delivery order (DRIVER)' })
  acceptOrder(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveryService.acceptOrder(id, user.userId);
  }

  @Patch('orders/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline an assigned delivery order (DRIVER)' })
  declineOrder(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveryService.declineOrder(id, user.userId);
  }

  @Patch('orders/:id/collect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Collect parcel from sender — transitions MATCHED → COLLECTING (DRIVER)' })
  collectParcel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveryService.collectParcel(id, user.userId);
  }

  @Post('orders/:id/verify-otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify OTP at dropoff — transitions IN_TRANSIT → ready for completion (DRIVER)' })
  verifyOtp(
    @Param('id') id: string,
    @Body() dto: VerifyDeliveryOtpDto,
  ) {
    return this.deliveryOtpClient.verifyOtp(id, dto.otp);
  }

  @Patch('orders/:id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete delivery and credit rider wallet (DRIVER)' })
  completeDelivery(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.deliveryService.completeDelivery(id, user.userId, dto);
  }

  @Patch('orders/:id/rate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sender rates a delivery (1–5 stars)' })
  rateDelivery(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: RateDeliveryDto,
  ) {
    return this.deliveryService.rateDelivery(id, user.userId, dto);
  }

  @Patch('orders/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.TOURIST, UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a delivery order (CITIZEN, TOURIST, DRIVER)' })
  cancelOrder(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveryService.cancelOrder(id, user.userId);
  }
}
