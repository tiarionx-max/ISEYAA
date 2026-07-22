import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Admin CRUD/moderation surface for NewsItem. Runs entirely in-process against
 * the monolith's own PrismaService/NewsService — never routed through the
 * news-service gRPC facade (that proto only exposes ListNews for the public
 * ticker), matching the ReviewsAdminController / SettlementDisputesController
 * precedent of keeping admin-only operations off the extracted-service surface.
 *
 * Route table:
 *   GET    /admin/news       — LGA_ADMIN+ (includes non-live items)
 *   POST   /admin/news       — LGA_ADMIN+
 *   PATCH  /admin/news/:id   — LGA_ADMIN+
 *   DELETE /admin/news/:id   — LGA_ADMIN+ (soft delete)
 */
@ApiTags('Admin – News')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LGA_ADMIN, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/news')
export class NewsAdminController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiOperation({ summary: 'Admin news listing — includes non-live items, newest first' })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'Paginated news list' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit?: number,
  ) {
    return this.newsService.findAllAdmin({ page, limit });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a news item' })
  @ApiResponse({ status: 201, description: 'News item created' })
  create(@Body() dto: CreateNewsDto) {
    return this.newsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a news item, including isLive/isPriority toggles' })
  @ApiResponse({ status: 200, description: 'News item updated' })
  @ApiResponse({ status: 404, description: 'News item not found' })
  update(@Param('id') id: string, @Body() dto: UpdateNewsDto) {
    return this.newsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a news item' })
  @ApiResponse({ status: 200, description: 'News item deleted' })
  @ApiResponse({ status: 404, description: 'News item not found' })
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
