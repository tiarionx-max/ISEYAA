import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/user-role.enum';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  describe('getMe', () => {
    it('returns user profile', async () => {
      const user = { id: 'u1', email: 'test@example.com', role: 'CITIZEN' };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      const result = await service.getMe('u1');
      expect(result).toEqual(user);
    });

    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('switchRole', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.switchRole('u1', UserRole.VENDOR)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when role not in registeredRoles', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN'] });
      await expect(service.switchRole('u1', UserRole.VENDOR)).rejects.toThrow(ForbiddenException);
    });

    it('updates role when it is in registeredRoles', async () => {
      const updatedUser = { id: 'u1', role: 'VENDOR' };
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN', 'VENDOR'] });
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.switchRole('u1', UserRole.VENDOR);
      expect(result.role).toBe('VENDOR');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'VENDOR' } }),
      );
    });
  });

  describe('eraseData', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.eraseData('u1')).rejects.toThrow(NotFoundException);
    });

    it('anonymizes PII fields and creates audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.eraseData('u1');
      expect(result.message).toContain('NDPA');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: null,
            phone: null,
            nin: null,
            bvn: null,
            status: 'DELETED',
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'NDPA_DATA_ERASURE' }),
        }),
      );
    });
  });
});
