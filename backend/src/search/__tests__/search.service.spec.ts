import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SearchService } from '../search.service';

// Stable mock references so we can assert call args
const mockSearchFn = jest.fn().mockResolvedValue({ hits: [] });
const mockCreateDocFn = jest.fn().mockResolvedValue({});
const mockDeleteDocFn = jest.fn().mockResolvedValue({});
const mockDocumentsFn = jest.fn().mockReturnValue({
  create: mockCreateDocFn,
  search: mockSearchFn,
  delete: mockDeleteDocFn,
});

const mockCollectionCreateFn = jest.fn().mockResolvedValue({});
const mockRetrieveFn = jest.fn().mockResolvedValue({ num_documents: 0 });
const mockCollectionFn = jest.fn().mockReturnValue({
  create: mockCollectionCreateFn,
  retrieve: mockRetrieveFn,
  documents: mockDocumentsFn,
});

const mockMultiSearchPerform = jest.fn().mockResolvedValue({ results: [] });
const mockTypesenseClient = {
  collections: mockCollectionFn,
  multiSearch: { perform: mockMultiSearchPerform },
};

jest.mock('typesense', () => ({
  __esModule: true,
  default: {
    Client: jest.fn().mockImplementation(() => mockTypesenseClient),
  },
  Client: jest.fn().mockImplementation(() => mockTypesenseClient),
}));

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, unknown> = {
      TYPESENSE_HOST: 'localhost',
      TYPESENSE_API_KEY: 'test-key',
      TYPESENSE_PROTOCOL: 'http',
      TYPESENSE_PORT: 8108,
    };
    return vals[key] ?? def;
  }),
};

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restore stable implementations after clearAllMocks
    mockSearchFn.mockResolvedValue({ hits: [] });
    mockMultiSearchPerform.mockResolvedValue({ results: [] });
    mockRetrieveFn.mockResolvedValue({ num_documents: 0 });
    mockDocumentsFn.mockReturnValue({
      create: mockCreateDocFn,
      search: mockSearchFn,
      delete: mockDeleteDocFn,
    });
    mockCollectionFn.mockReturnValue({
      create: mockCollectionCreateFn,
      retrieve: mockRetrieveFn,
      documents: mockDocumentsFn,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search()', () => {
    it('Test 1: calls multiSearch.perform with 4 collections when no lat/lng', async () => {
      await service.search('abeokuta');
      expect(mockMultiSearchPerform).toHaveBeenCalledWith(
        expect.objectContaining({
          searches: expect.arrayContaining([
            expect.objectContaining({ collection: 'attractions' }),
            expect.objectContaining({ collection: 'events' }),
            expect.objectContaining({ collection: 'properties' }),
            expect.objectContaining({ collection: 'products' }),
          ]),
        }),
        expect.anything(),
      );
    });

    it('Test 2: when lat/lng provided, calls geoSearch on attractions with filter_by containing coordinates', async () => {
      await service.search('olumo', 7.15, 3.35);
      expect(mockSearchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('7.15'),
        }),
      );
    });

    it('Test 3: returns { results: [] } and does not throw when Typesense errors', async () => {
      mockMultiSearchPerform.mockRejectedValueOnce(new Error('connection refused'));
      const result = await service.search('test');
      expect(result).toEqual({ results: [] });
    });
  });

  describe('initCollections()', () => {
    it('Test 4: calls collections().create() for all 4 collections (attractions, events, properties, products)', async () => {
      await service.initCollections();
      const collectionNames = mockCollectionFn.mock.calls.map(([name]: [string]) => name);
      expect(collectionNames).toContain('attractions');
      expect(collectionNames).toContain('events');
      expect(collectionNames).toContain('properties');
      expect(collectionNames).toContain('products');
    });
  });

  describe('indexDocument()', () => {
    it('Test 5: calls client.collections(collection).documents().create(document)', async () => {
      const doc = { id: '1', name: 'Olumo Rock' };
      await service.indexDocument('attractions', doc);
      expect(mockCollectionFn).toHaveBeenCalledWith('attractions');
      expect(mockCreateDocFn).toHaveBeenCalledWith(doc);
    });
  });

  describe('deleteDocument()', () => {
    it('Test 6: calls client.collections(collection).documents(id).delete()', async () => {
      await service.deleteDocument('events', 'event-id-123');
      expect(mockCollectionFn).toHaveBeenCalledWith('events');
      expect(mockDeleteDocFn).toHaveBeenCalled();
    });
  });
});
