import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List published events' })
  findAll(
    @Query('lgaId') lgaId?: string,
    @Query('featured') featured?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.eventsService.findAll({ lgaId, featured: featured === 'true', page, limit });
  }

  @Get('tickets/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tickets owned by the current user' })
  findMyTickets(@CurrentUser() user: any) {
    return this.eventsService.findMyTickets(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create event (ORGANISER)' })
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update event (ORGANISER — own events only)' })
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete event (ORGANISER — own events only)' })
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.remove(id, user.userId);
  }

  @Patch(':id/submit-for-approval')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit own DRAFT event for approval (ORGANISER — own events only)' })
  submitForApproval(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.submitForApproval(user.userId, id);
  }

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload event cover image (jpg/png/webp ≤5 MB, resized to 1200×630)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.eventsService.uploadImage(id, user.userId, file);
  }

  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase ticket — initiates Paystack payment, creates PENDING ticket' })
  purchaseTicket(
    @Param('id') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: PurchaseTicketDto,
  ) {
    return this.eventsService.purchaseTicket(user.userId, eventId, dto);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANISER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Event analytics — tickets_sold, revenue, check_in_rate, hourly chart' })
  getAnalytics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.getAnalytics(id, user.userId);
  }
}
