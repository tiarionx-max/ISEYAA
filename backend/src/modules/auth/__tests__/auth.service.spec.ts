import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn(),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, def?: unknown) => {
    const vals: Record<string, string> = {
      JWT_SECRET: 'test_secret',
      JWT_REFRESH_SECRET: 'test_refresh_secret',
    };
    return vals[key] ?? def;
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'test@example.com',
      phone: '+2348012345678',
      password: 'Password123',
      firstName: 'Toye',
      lastName: 'Folayan',
      ndpaConsent: true,
    };

    it('throws BadRequestException when ndpaConsent is false', async () => {
      await expect(service.register({ ...dto, ndpaConsent: false })).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when email or phone already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates user and returns tokens', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'CITIZEN',
        registeredRoles: ['CITIZEN'],
        ndpaConsent: true,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockJwt.signAsync.mockResolvedValueOnce('access_tok').mockResolvedValueOnce('refresh_tok');

      const result = await service.register(dto);
      expect(result.accessToken).toBe('access_tok');
      expect(result.refreshToken).toBe('refresh_tok');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ndpaConsent: true, ndpaConsentAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for unknown user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login({ identifier: 'x@x.com', password: 'pass12345' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correct123', 12);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: hash, status: 'ACTIVE', role: 'CITIZEN' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      await expect(service.login({ identifier: 'x@x.com', password: 'wrongpassword' })).rejects.toThrow(UnauthorizedException);
    });

    it('returns tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('Password123', 12);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        phone: '+2348012345678',
        firstName: 'T',
        lastName: 'F',
        passwordHash: hash,
        status: 'ACTIVE',
        role: 'CITIZEN',
        registeredRoles: ['CITIZEN'],
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      const result = await service.login({ identifier: 'test@example.com', password: 'Password123' });
      expect(result.accessToken).toBe('acc');
    });

    it('throws for suspended account', async () => {
      const hash = await bcrypt.hash('Password123', 12);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', passwordHash: hash, status: 'SUSPENDED', role: 'CITIZEN' });
      await expect(service.login({ identifier: 'x@x.com', password: 'Password123' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sendOtp', () => {
    it('throws ForbiddenException when locked', async () => {
      mockRedis.exists.mockResolvedValue(true);
      await expect(service.sendOtp({ phone: '+2348012345678' })).rejects.toThrow(ForbiddenException);
    });

    it('stores OTP in Redis and returns success', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.sendOtp({ phone: '+2348012345678' });
      expect(result.message).toContain('OTP sent');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'otp:+2348012345678',
        expect.stringMatching(/^\d{6}:0$/),
        300,
      );
    });
  });

  describe('verifyOtp', () => {
    it('throws BadRequestException when no OTP stored', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(null);
      await expect(service.verifyOtp({ phone: '+2348012345678', otp: '123456' })).rejects.toThrow(BadRequestException);
    });

    it('increments attempts on wrong OTP', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0');
      mockRedis.set.mockResolvedValue(undefined);
      await expect(service.verifyOtp({ phone: '+2348012345678', otp: '000000' })).rejects.toThrow(BadRequestException);
      expect(mockRedis.set).toHaveBeenCalledWith('otp:+2348012345678', '654321:1', 300);
    });

    it('locks after max attempts', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:2');
      mockRedis.del.mockResolvedValue(undefined);
      mockRedis.set.mockResolvedValue(undefined);
      await expect(service.verifyOtp({ phone: '+2348012345678', otp: '000000' })).rejects.toThrow(ForbiddenException);
      expect(mockRedis.set).toHaveBeenCalledWith('otp_lock:+2348012345678', '1', 900);
    });

    it('returns success on correct OTP', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:1');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.verifyOtp({ phone: '+2348012345678', otp: '654321' });
      expect(result.message).toContain('verified');
    });
  });

  describe('refreshTokens', () => {
    it('throws when JWT verification fails', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when JTI is blacklisted', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'u1', role: 'CITIZEN', jti: 'jti-1', exp: Date.now() / 1000 + 1000 });
      mockRedis.exists.mockResolvedValue(true);
      await expect(service.refreshTokens('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('blacklists old JTI and returns new tokens', async () => {
      const exp = Math.floor(Date.now() / 1000) + 100;
      mockJwt.verify.mockReturnValue({ sub: 'u1', role: 'CITIZEN', jti: 'jti-1', exp });
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockJwt.signAsync.mockResolvedValueOnce('new_acc').mockResolvedValueOnce('new_ref');

      const result = await service.refreshTokens('valid-token');
      expect(result.accessToken).toBe('new_acc');
      expect(mockRedis.set).toHaveBeenCalledWith('blacklist:jti-1', '1', expect.any(Number));
    });
  });

  describe('logout', () => {
    it('blacklists refresh token JTI', async () => {
      const exp = Math.floor(Date.now() / 1000) + 100;
      mockJwt.verify.mockReturnValue({ sub: 'u1', jti: 'jti-99', exp });
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockJwt.signAsync.mockResolvedValue('acc');

      const result = await service.logout('some-refresh-token');
      expect(result.message).toContain('Logged out');
      expect(mockRedis.set).toHaveBeenCalledWith('blacklist:jti-99', '1', expect.any(Number));
    });

    it('returns success even with invalid token', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error(); });
      const result = await service.logout('garbage');
      expect(result.message).toContain('Logged out');
    });
  });
});
