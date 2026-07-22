import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TypesenseLib from 'typesense';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: any;
  private readonly disabled: boolean;

  private static readonly COLLECTION_SCHEMAS = {
    attractions: {
      name: 'attractions',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'category', type: 'string', facet: true },
        { name: 'lga_id', type: 'string', facet: true },
        { name: 'location', type: 'geopoint' },
      ],
      default_sorting_field: 'name',
    },
    properties: {
      name: 'properties',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'lga_id', type: 'string', facet: true },
        { name: 'location', type: 'geopoint' },
      ],
      default_sorting_field: 'name',
    },
    events: {
      name: 'events',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'lga_id', type: 'string', facet: true },
      ],
      default_sorting_field: 'title',
    },
    products: {
      name: 'products',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'category', type: 'string', facet: true },
      ],
      default_sorting_field: 'name',
    },
  } as const;

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('TYPESENSE_API_KEY', '');
    const isPlaceholder = !apiKey || apiKey.includes('change-me') || apiKey.includes('your-typesense');
    this.disabled = isPlaceholder;

    if (this.disabled) {
      this.logger.warn('TYPESENSE_API_KEY not configured — search disabled (local dev mode)');
      return;
    }

    const ClientClass =
      (TypesenseLib as any).Client ??
      (TypesenseLib as any).default?.Client;

    this.client = new ClientClass({
      nodes: [
        {
          host: config.get<string>('TYPESENSE_HOST', 'localhost'),
          port: config.get<number>('TYPESENSE_PORT', 8108),
          protocol: config.get<string>('TYPESENSE_PROTOCOL', 'http'),
        },
      ],
      apiKey,
      connectionTimeoutSeconds: 2,
    });
  }

  /** True when Typesense is actually configured and queries/indexing will do real work. */
  isEnabled(): boolean {
    return !this.disabled;
  }

  async initCollections(): Promise<void> {
    if (this.disabled) return;
    for (const schema of Object.values(SearchService.COLLECTION_SCHEMAS)) {
      try {
        // collections() without a name arg returns the Collections object (create new)
        await this.client.collections().create(schema);
      } catch (err: any) {
        if (err?.message?.includes('already exists') || err?.httpStatus === 409) {
          // Collection already exists — skip
        } else {
          this.logger.warn(`Failed to create collection ${schema.name}: ${err?.message}`);
        }
      }
    }
  }

  async getCollectionCount(collection: string): Promise<number> {
    if (this.disabled) return 0;
    try {
      const info = await this.client.collections(collection).retrieve();
      return info?.num_documents ?? 0;
    } catch {
      return 0;
    }
  }

  async indexDocument(collection: string, document: Record<string, unknown>): Promise<void> {
    if (this.disabled) return;
    try {
      await this.client.collections(collection).documents().create(document);
    } catch (err: any) {
      this.logger.error(`Failed to index document in ${collection}: ${err?.message}`);
    }
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.client.collections(collection).documents(id).delete();
    } catch (err: any) {
      this.logger.error(`Failed to delete document ${id} from ${collection}: ${err?.message}`);
    }
  }

  async search(query: string, lat?: number, lng?: number, perPage = 5): Promise<any> {
    if (this.disabled) return { results: [] };
    try {
      if (lat !== undefined && lng !== undefined) {
        const [attractionResults, propertyResults, eventResults, productResults] =
          await Promise.all([
            this.client.collections('attractions').documents().search({
              q: query || '*',
              query_by: 'name,description',
              filter_by: `location:(${lat}, ${lng}, 50 km)`,
              sort_by: `location(${lat}, ${lng}):asc`,
              per_page: perPage,
            }),
            this.client.collections('properties').documents().search({
              q: query || '*',
              query_by: 'name,description',
              filter_by: `location:(${lat}, ${lng}, 50 km)`,
              sort_by: `location(${lat}, ${lng}):asc`,
              per_page: perPage,
            }),
            this.client.multiSearch.perform(
              {
                searches: [
                  { collection: 'events', q: query, query_by: 'title,description' },
                ],
              },
              { per_page: perPage },
            ),
            this.client.multiSearch.perform(
              {
                searches: [
                  { collection: 'products', q: query, query_by: 'name,description' },
                ],
              },
              { per_page: perPage },
            ),
          ]);

        return {
          results: [
            { collection: 'attractions', ...attractionResults },
            { collection: 'properties', ...propertyResults },
            ...(eventResults?.results ?? []),
            ...(productResults?.results ?? []),
          ],
        };
      }

      return await this.client.multiSearch.perform(
        {
          searches: [
            { collection: 'attractions', q: query, query_by: 'name,description' },
            { collection: 'events', q: query, query_by: 'title,description' },
            { collection: 'properties', q: query, query_by: 'name,description' },
            { collection: 'products', q: query, query_by: 'name,description' },
          ],
        },
        { per_page: perPage },
      );
    } catch (err: any) {
      this.logger.error(`Search failed: ${err?.message}`);
      return { results: [] };
    }
  }
}
