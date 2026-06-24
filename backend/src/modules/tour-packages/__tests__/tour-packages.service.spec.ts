import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TourPackageService } from '../tour-packages.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTourPackageDto } from '../dto/create-tour-package.dto';
import { CreateFromAiSuggestionDto } from '../dto/create-from-ai-suggestion.dto';
import { TourPackageCategory } from '@prisma/client';

const ACTOR_USER_ID = 'user-uuid-001';
const TOUR_GUIDE_ID = 'guide-uuid-001';
const PACKAGE_ID = 'pkg-uuid-001';
const ATTRACTION_ID = 'attr-uuid-001';
const ATTRACTION_ID_2 = 'attr-uuid-002';
const PROPERTY_ID = 'prop-uuid-001';
const HOST_USER_ID = 'host-user-001';
const LGA_ID = 'lga-uuid-001';

const approvedGuide = {
  id: TOUR_GUIDE_ID,
  userId: ACTOR_USER_ID,
  status: 'APPROVED' as const,
  deletedAt: null,
};

const validDto = (): CreateTourPackageDto => ({
  name: 'Heritage Olumo Rock Tour',
  description: 'Full-day walk',
  lgaId: LGA_ID,
  tourGuideId: TOUR_GUIDE_ID,
  category: TourPackageCategory.HERITAGE,
  price: 18000,
  durationHours: 6,
  maxGroupSize: 12,
  attractionIds: [ATTRACTION_ID],
  itineraryTemplate: [
    { hour: 8, title: 'Pickup', description: 'Lafenwa terminus' },
    { hour: 10, title: 'Olumo Rock', description: 'Hike to summit' },
  ],
  settlementSplit: [
    { vendorType: 'GUIDE', vendorId: TOUR_GUIDE_ID, percentage: 70 },
  ],
});

const aiDto = (): CreateFromAiSuggestionDto => ({
  aiConversationId: 'conv-uuid-001',
  title: 'Adire Heritage Walk',
  description: 'A 1-paragraph summary of the AI itinerary, long enough to pass DTO.',
  suggestedItinerary: 'Day 1: Olumo Rock at dawn. 10am Adire workshop. 2pm forest walk.',
});

const mockPrisma = {
  tourGuide: { findFirst: jest.fn(), findUnique: jest.fn() },
  attraction: { findMany: jest.fn(), findFirst: jest.fn() },
  property: { findFirst: jest.fn(), findUnique: jest.fn() },
  event: { findMany: jest.fn(), findFirst: jest.fn() },
  wallet: { findUnique: jest.fn() },
  tourPackage: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('TourPackageService', () => {
  let service: TourPackageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourPackageService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<TourPackageService>(TourPackageService);
  });

  // ── createTourPackage (standard guide-authored path) ────────────────────

  describe('create', () => {
    it('1. happy path — APPROVED guide creates DRAFT with slug + nullable-friendly defaults', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(approvedGuide);
      mockPrisma.attraction.findMany.mockResolvedValue([{ id: ATTRACTION_ID }]);
      mockPrisma.tourPackage.create.mockImplementation(({ data }: any) => ({
        id: PACKAGE_ID,
        ...data,
      }));

      const result = await service.create(ACTOR_USER_ID, validDto());

      expect(mockPrisma.tourPackage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            tourGuideId: TOUR_GUIDE_ID,
            lgaId: LGA_ID,
            slug: expect.stringMatching(/^heritage-olumo-rock-tour-[a-f0-9]{8}$/),
          }),
        }),
      );
      expect((result as any).status).toBe('DRAFT');
    });

    it('2. throws ForbiddenException when guide.status !== APPROVED', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({ ...approvedGuide, status: 'PENDING' });
      await expect(service.create(ACTOR_USER_ID, validDto())).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.tourPackage.create).not.toHaveBeenCalled();
    });

    it('3. throws ForbiddenException when guide.userId !== actorUserId', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue({ ...approvedGuide, userId: 'someone-else' });
      await expect(service.create(ACTOR_USER_ID, validDto())).rejects.toThrow(ForbiddenException);
    });

    it('3a. throws NotFoundException when tourGuideId does not resolve', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(null);
      await expect(service.create(ACTOR_USER_ID, validDto())).rejects.toThrow(NotFoundException);
    });

    it('4. throws BadRequestException when an attractionId is unknown', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(approvedGuide);
      mockPrisma.attraction.findMany.mockResolvedValue([]); // returns 0 of the 1 requested
      await expect(service.create(ACTOR_USER_ID, validDto())).rejects.toThrow(BadRequestException);
    });

    it('5. throws BadRequestException when settlementSplit sum > 100', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(approvedGuide);
      mockPrisma.attraction.findMany.mockResolvedValue([{ id: ATTRACTION_ID }]);
      const dto = validDto();
      dto.settlementSplit = [
        { vendorType: 'GUIDE', vendorId: TOUR_GUIDE_ID, percentage: 60 },
        { vendorType: 'ATTRACTION', vendorId: ATTRACTION_ID, percentage: 60 }, // sum=120
      ];
      await expect(service.create(ACTOR_USER_ID, dto)).rejects.toThrow(/100/);
    });

    it('6. throws BadRequestException when HOST vendorId resolves to a property without a host wallet', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(approvedGuide);
      mockPrisma.attraction.findMany.mockResolvedValue([{ id: ATTRACTION_ID }]);
      mockPrisma.property.findFirst.mockResolvedValue({ hostId: HOST_USER_ID });
      mockPrisma.wallet.findUnique.mockResolvedValue(null); // no wallet
      const dto = validDto();
      dto.settlementSplit = [
        { vendorType: 'GUIDE', vendorId: TOUR_GUIDE_ID, percentage: 70 },
        { vendorType: 'HOST', vendorId: PROPERTY_ID, percentage: 20 },
      ];
      await expect(service.create(ACTOR_USER_ID, dto)).rejects.toThrow(/Host wallet not found/);
    });

    it('7. throws BadRequestException when itineraryTemplate is not ascending by hour', async () => {
      mockPrisma.tourGuide.findFirst.mockResolvedValue(approvedGuide);
      mockPrisma.attraction.findMany.mockResolvedValue([{ id: ATTRACTION_ID }]);
      const dto = validDto();
      dto.itineraryTemplate = [
        { hour: 10, title: 'A', description: 'a' },
        { hour: 8, title: 'B', description: 'b' }, // backwards
      ];
      await expect(service.create(ACTOR_USER_ID, dto)).rejects.toThrow(/ascending hour/);
    });
  });

  // ── update lifecycle ──────────────────────────────────────────────────────

  describe('update', () => {
    it('8. ConflictException when package.status === APPROVED (edit blocked)', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        tourGuideId: TOUR_GUIDE_ID,
        status: 'APPROVED',
        settlementSplit: [],
      });
      mockPrisma.tourGuide.findUnique.mockResolvedValue(approvedGuide);
      await expect(service.update(PACKAGE_ID, ACTOR_USER_ID, { name: 'new' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('9. status reverts to DRAFT when editing a PENDING package', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        tourGuideId: TOUR_GUIDE_ID,
        status: 'PENDING',
        settlementSplit: [],
      });
      mockPrisma.tourGuide.findUnique.mockResolvedValue(approvedGuide);
      mockPrisma.tourPackage.update.mockResolvedValue({ status: 'DRAFT' });

      await service.update(PACKAGE_ID, ACTOR_USER_ID, { name: 'tweaked' });

      expect(mockPrisma.tourPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PACKAGE_ID },
          data: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
    });

    it('9b. status reverts to DRAFT when editing a REJECTED package', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        tourGuideId: TOUR_GUIDE_ID,
        status: 'REJECTED',
        settlementSplit: [],
      });
      mockPrisma.tourGuide.findUnique.mockResolvedValue(approvedGuide);
      mockPrisma.tourPackage.update.mockResolvedValue({ status: 'DRAFT' });

      await service.update(PACKAGE_ID, ACTOR_USER_ID, { name: 'tweaked' });

      expect(mockPrisma.tourPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
    });
  });

  // ── adminDecide ───────────────────────────────────────────────────────────

  describe('adminDecide', () => {
    it('10a. sets status + writes decision metadata when status is PENDING', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        status: 'PENDING',
        metadata: { source: 'guide-form' },
      });
      mockPrisma.tourPackage.update.mockImplementation(({ data }: any) => ({
        id: PACKAGE_ID,
        ...data,
      }));

      await service.adminDecide(
        PACKAGE_ID,
        { decision: 'APPROVED', reason: 'looks great' },
        'admin-user-001',
      );

      expect(mockPrisma.tourPackage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            metadata: expect.objectContaining({
              source: 'guide-form',
              adminDecision: expect.objectContaining({
                decision: 'APPROVED',
                reason: 'looks great',
                actorId: 'admin-user-001',
              }),
            }),
          }),
        }),
      );
    });

    it('10b. ConflictException when status !== PENDING', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        status: 'DRAFT',
        metadata: {},
      });
      await expect(
        service.adminDecide(PACKAGE_ID, { decision: 'APPROVED' }, 'admin-id'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll (PUBLIC list excludes AI DRAFTs) ──────────────────────────────

  describe('findAll', () => {
    it('11. unconditionally filters status=APPROVED; AI DRAFTs MUST NOT appear in result', async () => {
      const approvedPkg = { id: 'p1', status: 'APPROVED', name: 'Heritage', metadata: {} };
      const aiDraft = {
        id: 'p2',
        status: 'DRAFT',
        name: 'AI-seeded',
        metadata: { source: 'ai-suggestion' },
      };
      // Simulate prisma's where filter — only the APPROVED row should be returned
      mockPrisma.tourPackage.findMany.mockImplementation(({ where }: any) => {
        return [approvedPkg, aiDraft].filter((p) => p.status === where.status);
      });

      const result = await service.findAll({});

      expect(mockPrisma.tourPackage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED', deletedAt: null }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
      expect(result.find((p: any) => p.status === 'DRAFT')).toBeUndefined();
    });
  });

  // ── createFromAiSuggestion (AI bridge — bypasses standard guards) ────────

  describe('createFromAiSuggestion', () => {
    it('12. happy path — creates DRAFT with null guide/lga/empty split, -ai- slug, metadata source=ai-suggestion', async () => {
      mockPrisma.tourPackage.create.mockImplementation(({ data }: any) => ({
        id: PACKAGE_ID,
        ...data,
      }));

      const result = await service.createFromAiSuggestion(ACTOR_USER_ID, aiDto());

      // The standard-create APPROVED-guide guard MUST NOT run on this path
      expect(mockPrisma.tourGuide.findFirst).not.toHaveBeenCalled();

      expect(mockPrisma.tourPackage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            tourGuideId: null,
            lgaId: null,
            price: 0,
            settlementSplit: [],
            attractionIds: [],
            slug: expect.stringMatching(/^adire-heritage-walk-ai-[a-f0-9]{8}$/),
            metadata: expect.objectContaining({
              source: 'ai-suggestion',
              aiSourceUserId: ACTOR_USER_ID,
              aiSourceConversationId: 'conv-uuid-001',
            }),
            itineraryTemplate: [
              expect.objectContaining({
                hour: 0,
                title: 'AI suggestion',
                description: expect.stringContaining('Olumo Rock'),
              }),
            ],
          }),
        }),
      );
      expect((result as any).status).toBe('DRAFT');
    });

    it('12b. submitForReview rejects an AI DRAFT whose tourGuideId/lgaId is still null', async () => {
      mockPrisma.tourPackage.findFirst.mockResolvedValue({
        id: PACKAGE_ID,
        tourGuideId: null,
        lgaId: null,
        status: 'DRAFT',
        metadata: { aiSourceUserId: ACTOR_USER_ID },
      });
      // findUnique(guide) returns null because tourGuideId is null — but the guard
      // for "claim first" should fire BEFORE we try to fetch the guide
      await expect(service.submitForReview(PACKAGE_ID, ACTOR_USER_ID)).rejects.toThrow(
        /tourGuideId and lgaId/,
      );
    });
  });
});
