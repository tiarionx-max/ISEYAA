import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Unified search across attractions, events, properties, and products',
    description:
      'Typo-tolerant full-text search. When lat/lng are provided, attractions and properties are geo-ranked (nearest first).',
  })
  async search(@Query() query: SearchQueryDto): Promise<any> {
    return this.searchService.search(query.q, query.lat, query.lng);
  }
}
