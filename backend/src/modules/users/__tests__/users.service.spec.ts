import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../../../common/enums/user-role.enum';
import { OtpChannel } from '../../../common/enums/otp-channel.enum';
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockAuthService = { generateTokens: jest.fn() };

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthService.generateTokens.mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
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
      expect(result.user.role).toBe('VENDOR');
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'VENDOR' } }),
      );
    });
  });

  describe('becomeDriver', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.becomeDriver('u1')).rejects.toThrow(NotFoundException);
    });

    it('adds DRIVER to registeredRoles and sets role when not already present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN'] });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'DRIVER', registeredRoles: ['CITIZEN', 'DRIVER'] });

      const result = await service.becomeDriver('u1');

      expect(result.user.role).toBe('DRIVER');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'DRIVER',
            registeredRoles: { set: ['CITIZEN', 'DRIVER'] },
          }),
        }),
      );
    });

    it('is idempotent when DRIVER is already in registeredRoles', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN', 'DRIVER'] });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'DRIVER', registeredRoles: ['CITIZEN', 'DRIVER'] });

      await service.becomeDriver('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'DRIVER',
            registeredRoles: ['CITIZEN', 'DRIVER'],
          }),
        }),
      );
    });
  });

  describe('becomeOrganiser', () => {
    it('throws NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.becomeOrganiser('u1')).rejects.toThrow(NotFoundException);
    });

    it('adds ORGANISER to registeredRoles and sets role when not already present', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN'] });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'ORGANISER', registeredRoles: ['CITIZEN', 'ORGANISER'] });

      const result = await service.becomeOrganiser('u1');

      expect(result.user.role).toBe('ORGANISER');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'ORGANISER',
            registeredRoles: { set: ['CITIZEN', 'ORGANISER'] },
          }),
        }),
      );
    });

    it('is idempotent when ORGANISER is already in registeredRoles', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ registeredRoles: ['CITIZEN', 'ORGANISER'] });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'ORGANISER', registeredRoles: ['CITIZEN', 'ORGANISER'] });

      await service.becomeOrganiser('u1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'ORGANISER',
            registeredRoles: ['CITIZEN', 'ORGANISER'],
          }),
        }),
      );
    });
  });

  describe('updateOtpChannel', () => {
    it('updates otpChannel and returns the updated user', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', otpChannel: 'WHATSAPP' });

      const result = await service.updateOtpChannel('u1', OtpChannel.WHATSAPP);

      expect(result.otpChannel).toBe('WHATSAPP');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { otpChannel: OtpChannel.WHATSAPP },
        }),
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

  describe('changePassword', () => {
    it('throws NotFoundException when user is unknown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.changePassword('u1', 'current123', 'NewPassword123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException when the user has no passwordHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
      await expect(service.changePassword('u1', 'current123', 'NewPassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when currentPassword is wrong', async () => {
      const hash = await bcrypt.hash('correct123', 12);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
      await expect(service.changePassword('u1', 'wrongpassword', 'NewPassword123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('updates passwordHash and creates an audit log entry when currentPassword is correct', async () => {
      const hash = await bcrypt.hash('correct123', 12);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.changePassword('u1', 'correct123', 'NewPassword123');

      expect(result.message).toContain('Password changed');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ passwordHash: expect.any(String) }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PASSWORD_CHANGED' }),
        }),
      );
    });
  });
});
