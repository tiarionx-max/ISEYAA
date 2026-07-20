import { Module } from '@nestjs/common';
import { NewsService } from './news.service';

// 21-02: NewsController now lives inside NewsClientModule, routed through
// NewsClientService's gRPC facade. This module keeps providing/exporting NewsService only —
// apps/news-service's app.module.ts still imports NewsModule wholesale for its own
// in-process NewsGrpcController -> NewsService wiring.
@Module({
  controllers: [],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
