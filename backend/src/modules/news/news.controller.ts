import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { NewsClientService } from '../news-client/news-client.service';

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsClientService) {}

  @Get()
  @ApiOperation({ summary: 'Latest live news headlines (public) — used by landing-page ticker' })
  findLatest(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.news.findLatest(limit, category);
  }
}
