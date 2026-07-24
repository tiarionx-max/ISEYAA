import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseFloatPipe,
  ParseBoolPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TourismService } from './tourism.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('attractions')
@Controller('attractions')
export class TourismController {
  constructor(private readonly tourismService: TourismService) {}

  @Get()
  @ApiOperation({ summary: 'List attractions — filter by lga, category, free entry, or proximity' })
  @ApiQuery({ name: 'lgaId', required: false })
  @ApiQuery({ name: 'category', required: false, enum: ['NATURAL', 'CULTURAL', 'HISTORICAL', 'RECREATIONAL', 'RELIGIOUS'] })
  @ApiQuery({ name: 'freeEntryOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'lat', required: false, type: Number, description: 'Near latitude' })
  @ApiQuery({ name: 'lng', required: false, type: Number, description: 'Near longitude' })
  @ApiQuery({ name: 'radius', required: false, type: Number, description: 'Near radius in km (default 10)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results (unbounded if omitted)' })
  findAll(
    @Query('lgaId') lgaId?: string,
    @Query('category') category?: string,
    @Query('freeEntryOnly') freeEntryOnly?: string,
    @Query('lat') latStr?: string,
    @Query('lng') lngStr?: string,
    @Query('radius') radiusStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    // Previously `limit` was accepted by callers (e.g. mobile's `/attractions?limit=50`)
    // but silently dropped here — the service ran an unbounded query regardless.
    return this.tourismService.findAll({
      lgaId,
      category,
      freeEntryOnly: freeEntryOnly === 'true',
      lat: latStr !== undefined ? parseFloat(latStr) : undefined,
      lng: lngStr !== undefined ? parseFloat(lngStr) : undefined,
      radius: radiusStr !== undefined ? parseFloat(radiusStr) : undefined,
      limit: limitStr !== undefined ? parseInt(limitStr, 10) : undefined,
    });
  }

  @Get('bookmarks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user's bookmarked attractions" })
  getBookmarks(@CurrentUser() user: { userId: string }) {
    // Must be declared before ':id' — otherwise Nest matches 'bookmarks' as the :id
    // param and this route is unreachable (TourismService.getUserBookmarks() was
    // implemented and unit-tested but had no controller route exposing it over HTTP).
    return this.tourismService.getUserBookmarks(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full attraction detail with nearby events and stays within 10km' })
  findOne(@Param('id') id: string) {
    return this.tourismService.findById(id);
  }

  @Post(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle bookmark for an attraction (authenticated)' })
  bookmark(@Param('id') attractionId: string, @CurrentUser() user: { userId: string }) {
    return this.tourismService.toggleBookmark(user.userId, attractionId);
  }
}
