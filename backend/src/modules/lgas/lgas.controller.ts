import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LgasService } from './lgas.service';

@ApiTags('lgas')
@Controller('lgas')
export class LgasController {
  constructor(private readonly lgasService: LgasService) {}

  @Get()
  @ApiOperation({ summary: 'All 20 Ogun State LGAs with coordinates and attraction count' })
  findAll() {
    return this.lgasService.findAll();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Full LGA profile — history, cultural assets, attraction count' })
  findOne(@Param('slug') slug: string) {
    return this.lgasService.findBySlug(slug);
  }

  @Get(':slug/attractions')
  @ApiOperation({ summary: 'Paginated attractions for an LGA' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAttractions(
    @Param('slug') slug: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.lgasService.findAttractionsByLga(slug, page, Math.min(limit, 50));
  }
}
