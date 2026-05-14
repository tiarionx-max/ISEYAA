import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { StudioService } from './studio.service';
import { CreateStudioBookingDto } from './dto/create-studio-booking.dto';
import { UploadContentDto } from './dto/upload-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('studio')
@Controller('studio')
export class StudioController {
  constructor(private readonly studioService: StudioService) {}

  @Get('slots')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Available slots — government priority slots visible to LGA_ADMIN/SUPER_ADMIN only' })
  findSlots(@CurrentUser() user: any) {
    return this.studioService.findSlots(user?.role);
  }

  @Post('bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book a studio slot — SELECT FOR UPDATE, Paystack payment, prep checklist email' })
  createBooking(@CurrentUser() user: any, @Body() dto: CreateStudioBookingDto) {
    return this.studioService.createBooking(user.userId, dto);
  }

  @Post('content/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATIVE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload audio/video content (CREATIVE role) — stored in S3' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  uploadContent(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadContentDto,
  ) {
    return this.studioService.uploadContent(user.userId, file, dto);
  }

  @Patch('content/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATIVE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish uploaded content to the feed (CREATIVE — own content only)' })
  publishContent(@Param('id') id: string, @CurrentUser() user: any) {
    return this.studioService.publishContent(id, user.userId);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Published media content feed (paginated, newest first)' })
  getFeed(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.studioService.getFeed(page, limit);
  }
}
