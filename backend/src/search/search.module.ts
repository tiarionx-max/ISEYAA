import { Global, Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchIndexerService } from './search-indexer.service';

@Global()
@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchIndexerService],
  exports: [SearchService],
})
export class SearchModule {}
