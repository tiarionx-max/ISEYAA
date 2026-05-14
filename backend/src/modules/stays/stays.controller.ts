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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.staysService.findAllProperties({ lgaId, type, page, limit });
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
}

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly staysService: StaysService) {}

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
