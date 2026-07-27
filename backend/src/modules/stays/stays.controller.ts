import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile,
  ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { StaysService } from './stays.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('properties')
@Controller('properties')
export class StaysController {
  constructor(private readonly staysService: StaysService) {}

  @Get()
  @ApiOperation({ summary: 'List active properties' })
  findAll(
    @Query('lgaId') lgaId?: string,
    @Query('type') type?: string,
    @Query('types') types?: string,
    @Query('bookingMode') bookingMode?: string,
    @Query('featured') featured?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.staysService.findAllProperties({
      lgaId,
      type,
      types: types ? types.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      bookingMode,
      featured: featured === 'true',
      search,
      page,
      limit,
    });
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current host\'s own properties, including paused/inactive ones' })
  findMine(@CurrentUser() user: any) {
    return this.staysService.findMyProperties(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property by ID' })
  findOne(@Param('id') id: string) {
    return this.staysService.findPropertyById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create property listing (HOST)' })
  create(@CurrentUser() user: any, @Body() dto: CreatePropertyDto) {
    return this.staysService.createProperty(user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update property (HOST — own listings only)' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdatePropertyDto) {
    return this.staysService.updateProperty(id, user.userId, dto);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload property image (jpg/png/webp ≤5 MB, resized to 1200×630)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.staysService.uploadPropertyImage(id, user.userId, file);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Booked date ranges for next 90 days' })
  getAvailability(@Param('id') id: string) {
    return this.staysService.getAvailability(id);
  }

  @Get(':id/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bookings for a property owned by the current host' })
  getPropertyBookings(@Param('id') id: string, @CurrentUser() user: any) {
    return this.staysService.findPropertyBookings(id, user.userId);
  }

  @Post(':id/bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book a property — SELECT FOR UPDATE availability check' })
  createBooking(
    @Param('id') propertyId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateBookingDto,
  ) {
    return this.staysService.createBooking(user.userId, propertyId, dto);
  }

  @Post(':id/memberships')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign up for a MEMBERSHIP-mode property — recurring monthly billing via saved card' })
  createMembership(
    @Param('id') propertyId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.staysService.createMembership(user.userId, propertyId, dto);
  }
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly staysService: StaysService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current user’s bookings with property details' })
  findMyBookings(@CurrentUser() user: any) {
    return this.staysService.findMyBookings(user.userId);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review a stay — only 24 h after checkout, rating 1–5' })
  createReview(
    @Param('id') bookingId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateReviewDto,
  ) {
    return this.staysService.createReview(bookingId, user.userId, dto);
  }
}

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly staysService: StaysService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current user’s memberships with property details' })
  findMyMemberships(@CurrentUser() user: any) {
    return this.staysService.findMyMemberships(user.userId);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a membership — no further renewal charges' })
  cancelMembership(@Param('id') id: string, @CurrentUser() user: any) {
    return this.staysService.cancelMembership(id, user.userId);
  }
}
