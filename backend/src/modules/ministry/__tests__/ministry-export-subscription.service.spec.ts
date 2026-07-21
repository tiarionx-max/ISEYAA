import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MinistryExportSubscriptionService } from '../ministry-export-subscription.service';
import { PrismaService } from '../../../prisma/prisma.service';

const SUBSCRIPTION_ID = 'sub-uuid-1';

const mockPrisma = {
  ministryExportSubscription: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('MinistryExportSubscriptionService', () => {
  let service: MinistryExportSubscriptionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinistryExportSubscriptionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<MinistryExportSubscriptionService>(MinistryExportSubscriptionService);
  });

  describe('list', () => {
    it('calls prisma.ministryExportSubscription.findMany() and returns its result verbatim', async () => {
      const rows = [{ id: SUBSCRIPTION_ID, recipients: ['a@b.com'], cadence: 'WEEKLY' }];
      mockPrisma.ministryExportSubscription.findMany.mockResolvedValue(rows);

      const result = await service.list();

      expect(mockPrisma.ministryExportSubscription.findMany).toHaveBeenCalledWith();
      expect(result).toBe(rows);
    });
  });

  describe('create', () => {
    it('calls prisma.ministryExportSubscription.create() with dto fields, isActive defaulting to true', async () => {
      const dto = { recipients: ['a@b.com'], cadence: 'WEEKLY' as any };
      const created = { id: SUBSCRIPTION_ID, ...dto, isActive: true };
      mockPrisma.ministryExportSubscription.create.mockResolvedValue(created);

      const result = await service.create(dto as any);

      expect(mockPrisma.ministryExportSubscription.create).toHaveBeenCalledWith({
        data: { recipients: dto.recipients, cadence: dto.cadence, isActive: true },
      });
      expect(result).toBe(created);
    });

    it('respects an explicit isActive: false in the dto', async () => {
      const dto = { recipients: ['a@b.com'], cadence: 'WEEKLY' as any, isActive: false };
      mockPrisma.ministryExportSubscription.create.mockResolvedValue({ id: SUBSCRIPTION_ID, ...dto });

      await service.create(dto as any);

      expect(mockPrisma.ministryExportSubscription.create).toHaveBeenCalledWith({
        data: { recipients: dto.recipients, cadence: dto.cadence, isActive: false },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when prisma.ministryExportSubscription.findUnique resolves null', async () => {
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(null);

      await expect(service.findOne(SUBSCRIPTION_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns the row when found', async () => {
      const row = { id: SUBSCRIPTION_ID, recipients: ['a@b.com'], cadence: 'WEEKLY' };
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(row);

      const result = await service.findOne(SUBSCRIPTION_ID);

      expect(result).toBe(row);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the row does not exist', async () => {
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(null);

      await expect(service.update(SUBSCRIPTION_ID, { cadence: 'MONTHLY' as any })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.ministryExportSubscription.update).not.toHaveBeenCalled();
    });

    it('calls prisma.ministryExportSubscription.update() with only the fields present in dto', async () => {
      const existing = { id: SUBSCRIPTION_ID, recipients: ['a@b.com'], cadence: 'WEEKLY' };
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(existing);
      const dto = { cadence: 'MONTHLY' as any };
      const updated = { ...existing, ...dto };
      mockPrisma.ministryExportSubscription.update.mockResolvedValue(updated);

      const result = await service.update(SUBSCRIPTION_ID, dto);

      expect(mockPrisma.ministryExportSubscription.update).toHaveBeenCalledWith({
        where: { id: SUBSCRIPTION_ID },
        data: dto,
      });
      expect(result).toBe(updated);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the row does not exist', async () => {
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(null);

      await expect(service.remove(SUBSCRIPTION_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.ministryExportSubscription.delete).not.toHaveBeenCalled();
    });

    it('calls prisma.ministryExportSubscription.delete() when the row exists', async () => {
      const existing = { id: SUBSCRIPTION_ID, recipients: ['a@b.com'], cadence: 'WEEKLY' };
      mockPrisma.ministryExportSubscription.findUnique.mockResolvedValue(existing);
      mockPrisma.ministryExportSubscription.delete.mockResolvedValue(existing);

      const result = await service.remove(SUBSCRIPTION_ID);

      expect(mockPrisma.ministryExportSubscription.delete).toHaveBeenCalledWith({
        where: { id: SUBSCRIPTION_ID },
      });
      expect(result).toBe(existing);
    });
  });
});
