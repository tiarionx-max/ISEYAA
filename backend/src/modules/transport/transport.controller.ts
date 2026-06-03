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
import { TransportService } from './transport.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ApproveDriverDto } from './dto/approve-driver.dto';
import { GoOnlineDto } from './dto/go-online.dto';
import { RequestRideDto } from './dto/request-ride.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('transport')
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  // ── Fare Estimate (public — no auth) ──────────────────────────────────────

  @Get('fare-estimate')
  @ApiOperation({ summary: 'Get fare estimate with surge multiplier (public)' })
  fareEstimate(
    @Query('vehicleType') vehicleType: string,
    @Query('pickupLat') pickupLat: string,
    @Query('pickupLng') pickupLng: string,
    @Query('dropoffLat') dropoffLat: string,
    @Query('dropoffLng') dropoffLng: string,
  ) {
    return this.transportService.getFareEstimate({
      vehicleType,
      pickupLat: parseFloat(pickupLat),
      pickupLng: parseFloat(pickupLng),
      dropoffLat: parseFloat(dropoffLat),
      dropoffLng: parseFloat(dropoffLng),
    });
  }

  // ── Driver Profile ────────────────────────────────────────────────────────

  @Get('drivers/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user’s driver profile (null if not registered)' })
  getMyDriverProfile(@CurrentUser() user: any) {
    return this.transportService.getMyDriverProfile(user.userId);
  }

  @Post('drivers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create driver profile (DRIVER)' })
  createDriver(@CurrentUser() user: any, @Body() dto: CreateDriverDto) {
    return this.transportService.createDriver(user.userId, dto);
  }

  @Post('drivers/:id/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach vehicle to driver profile — caller must own the driver record (DRIVER)' })
  createVehicle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.transportService.createVehicle(id, user.userId, dto);
  }

  @Patch('drivers/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LGA_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject driver KYC application (LGA_ADMIN)' })
  approveDriver(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveDriverDto,
  ) {
    return this.transportService.approveDriver(id, user.userId, dto);
  }

  // ── Driver Online / Offline ───────────────────────────────────────────────

  @Post('go-online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark driver as online and register geo position (DRIVER)' })
  goOnline(@CurrentUser() user: any, @Body() dto: GoOnlineDto) {
    return this.transportService.goOnline(user.userId, dto);
  }

  @Post('go-offline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark driver as offline and remove from geo set (DRIVER)' })
  goOffline(@CurrentUser() user: any) {
    return this.transportService.goOffline(user.userId);
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  @Get('drivers/earnings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get driver earnings dashboard (DRIVER)' })
  getDriverEarnings(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week',
  ) {
    return this.transportService.getDriverEarnings(user.userId, period);
  }

  // ── Trip Lifecycle ────────────────────────────────────────────────────────

  @Post('trips')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.TOURIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request a ride — nearest driver matched within 60s (CITIZEN, TOURIST)' })
  requestRide(@CurrentUser() user: any, @Body() dto: RequestRideDto) {
    return this.transportService.requestRide(user.userId, dto);
  }

  @Patch('trips/:id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an assigned trip request (DRIVER)' })
  acceptTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.acceptTrip(id, user.userId);
  }

  @Patch('trips/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline an assigned trip request (DRIVER)' })
  declineTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.declineTrip(id, user.userId);
  }

  @Patch('trips/:id/arrive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signal arrival at pickup point — transitions MATCHED → ARRIVED (DRIVER)' })
  arrivedAtPickup(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.arrivedAtPickup(id, user.userId);
  }

  @Patch('trips/:id/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the trip — transitions ARRIVED → IN_PROGRESS (DRIVER)' })
  startTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.startTrip(id, user.userId);
  }

  @Patch('trips/:id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete trip and credit driver wallet with 85% fare (DRIVER)' })
  completeTrip(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: CompleteTripDto,
  ) {
    return this.transportService.completeTrip(id, user.userId, dto);
  }

  @Patch('trips/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CITIZEN, UserRole.TOURIST, UserRole.DRIVER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a trip (CITIZEN, TOURIST, DRIVER)' })
  cancelTrip(@Param('id') id: string, @CurrentUser() user: any) {
    return this.transportService.cancelTrip(id, user.userId);
  }
}
