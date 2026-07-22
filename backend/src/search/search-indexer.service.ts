import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchIndexerService implements OnModuleInit {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.searchService.isEnabled()) {
      // TYPESENSE_API_KEY not configured — every indexDocument()/getCollectionCount()
      // call below silently no-ops. Skip the bulk-index pass entirely rather than
      // logging "Bulk index complete" for a run that indexed nothing.
      this.logger.warn('Typesense is disabled — skipping bulk index on startup');
      return;
    }

    try {
      await this.searchService.initCollections();

      const [attractionCount, eventCount, propertyCount, productCount] = await Promise.all([
        this.searchService.getCollectionCount('attractions'),
        this.searchService.getCollectionCount('events'),
        this.searchService.getCollectionCount('properties'),
        this.searchService.getCollectionCount('products'),
      ]);

      const allEmpty = attractionCount === 0 && eventCount === 0 && propertyCount === 0 && productCount === 0;

      if (!allEmpty) {
        this.logger.log('Typesense already indexed — skipping bulk index');
        return;
      }

      this.logger.log('Starting bulk index of all existing Prisma data into Typesense...');
      await Promise.all([
        this.indexAttractions(),
        this.indexEvents(),
        this.indexProperties(),
        this.indexProducts(),
      ]);
      this.logger.log('Bulk index complete');
    } catch (err: any) {
      // Non-fatal: Typesense may be unavailable in dev. App continues to start.
      this.logger.warn(`Typesense unavailable — skipping index on startup: ${err?.message}`);
    }
  }

  private async indexAttractions(): Promise<void> {
    const records = await this.prisma.attraction.findMany({ where: { deletedAt: null } });
    this.logger.log(`Indexing ${records.length} attractions into Typesense`);
    for (const record of records) {
      await this.searchService.indexDocument('attractions', {
        id: record.id,
        name: record.name,
        description: record.description ?? '',
        category: record.category?.toString() ?? 'general',
        lga_id: record.lgaId ?? '',
        location: [Number(record.latitude ?? 0), Number(record.longitude ?? 0)],
      });
    }
  }

  private async indexEvents(): Promise<void> {
    const records = await this.prisma.event.findMany({ where: { deletedAt: null } });
    this.logger.log(`Indexing ${records.length} events into Typesense`);
    for (const record of records) {
      await this.searchService.indexDocument('events', {
        id: record.id,
        title: record.title,
        description: record.description ?? '',
        lga_id: record.lgaId ?? '',
      });
    }
  }

  private async indexProperties(): Promise<void> {
    const records = await this.prisma.property.findMany({ where: { deletedAt: null } });
    this.logger.log(`Indexing ${records.length} properties into Typesense`);
    for (const record of records) {
      await this.searchService.indexDocument('properties', {
        id: record.id,
        name: record.name,
        description: record.description ?? '',
        lga_id: record.lgaId ?? '',
        location: [Number(record.latitude ?? 0), Number(record.longitude ?? 0)],
      });
    }
  }

  private async indexProducts(): Promise<void> {
    const records = await this.prisma.product.findMany({ where: { deletedAt: null } });
    this.logger.log(`Indexing ${records.length} products into Typesense`);
    for (const record of records) {
      await this.searchService.indexDocument('products', {
        id: record.id,
        name: record.name,
        description: record.description ?? '',
        category: 'general',
      });
    }
  }
}
