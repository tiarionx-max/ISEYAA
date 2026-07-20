import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NewsService } from '../../../src/modules/news/news.service';
import { news } from '@iseyaa/proto';

@Controller()
export class NewsGrpcController {
  constructor(private readonly newsService: NewsService) {}

  @GrpcMethod('NewsService', 'ListNews')
  async listNews(data: news.ListNewsRequest): Promise<news.ListNewsResponse> {
    const rows = await this.newsService.findLatest(data.limit || 20, data.category || undefined);
    return {
      items: rows.map((r) => ({
        id: r.id,
        headline: r.headline,
        summary: r.summary ?? '',
        link: r.link ?? '',
        source: r.source ?? '',
        category: r.category ?? '',
        imageUrl: r.imageUrl ?? '',
        publishedAt: r.publishedAt.toISOString(),
        isPriority: r.isPriority,
      })),
    };
  }
}
