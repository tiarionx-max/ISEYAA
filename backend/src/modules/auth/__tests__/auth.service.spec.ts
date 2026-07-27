import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { ResilienceService } from '../../../resilience/resilience.service';
import { SendgridService } from '../../../common/services/sendgrid.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
      TERMII_API_KEY: 'test-termii-key',
      META_WHATSAPP_ACCESS_TOKEN: 'test-meta-token',
      META_WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      META_WHATSAPP_TEMPLATE_NAME: 'iseyaa_otp_verification',
    };
    return vals[key] ?? def;
  }),
};

const mockResilience = {
  execute: jest.fn((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
    fn({ signal: undefined }),
  ),
};

const mockSendgrid = { sendOtpEmail: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Guard against live network calls: TERMII_API_KEY is now present in mockConfig
    // (needed for the resilience-wrapping tests below), which means sendOtp's
    // sendTermii() would otherwise issue a real fetch() to Termii's API on every test.
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    mockSendgrid.sendOtpEmail.mockReset();
    mockSendgrid.sendOtpEmail.mockResolvedValue(undefined);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    // Restore the shared mockResilience.execute default implementation every test —
    // individual tests below use mockImplementation/mockImplementationOnce to
    // simulate vendor-specific rejections, which would otherwise leak into later tests.
    mockResilience.execute.mockImplementation(
      (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => fn({ signal: undefined }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: ResilienceService, useValue: mockResilience },
        { provide: SendgridService, useValue: mockSendgrid },
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
        expect.stringMatching(/^\d{6}:0:SMS:$/),
        300,
      );
    });

    it('routes the Termii fetch call through resilience.execute with the termiiAuth vendor key', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await service.sendOtp({ phone: '+2348012345678' });

      expect(mockResilience.execute).toHaveBeenCalledWith('termiiAuth', expect.any(Function));
    });

    it("forwards the exact AbortSignal instance into fetch()'s init object (reference-identity, mirrors paystack.service.spec.ts Test 7)", async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);

      const controller = new AbortController();
      mockResilience.execute.mockImplementationOnce(
        (vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) =>
          fn({ signal: controller.signal }),
      );
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await service.sendOtp({ phone: '+2348012345678' });

      expect((global.fetch as jest.Mock).mock.calls[0][1]?.signal).toBe(controller.signal);
    });

    it('still resolves sendOtp with an "OTP sent" success message when resilience.execute rejects (circuit open) — D-03 fallback chain preserved', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockResilience.execute.mockRejectedValueOnce(new Error('circuit open'));

      const result = await service.sendOtp({ phone: '+2348012345678' });
      expect(result.message).toContain('OTP sent');
    });

    it('resolves the WHATSAPP channel from an existing user\'s persisted otpChannel even when the request channel is SMS or absent (channel)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue({ otpChannel: 'WHATSAPP', email: null, firstName: 'Toye' });

      await service.sendOtp({ phone: '+2348012345678', channel: 'SMS' as any });

      expect(mockResilience.execute).toHaveBeenCalledWith('metaWhatsapp', expect.any(Function));
    });

    it('defaults to SMS via the termiiAuth vendor when no channel is requested and no existing user is found (channel)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await service.sendOtp({ phone: '+2348012345678' });

      expect(mockResilience.execute).toHaveBeenCalledWith('termiiAuth', expect.any(Function));
    });

    it('falls back to SMS and reports fallbackUsed:true when the metaWhatsapp dispatch rejects (fallback)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockResilience.execute.mockImplementation((vendor: string, fn: (context: { signal: AbortSignal | undefined }) => any) => {
        if (vendor === 'metaWhatsapp') return Promise.reject(new Error('meta down'));
        return fn({ signal: undefined });
      });
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      const result = await service.sendOtp({ phone: '+2348012345678', channel: 'WHATSAPP' as any });

      expect(result.fallbackUsed).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://v3.api.termii.com/api/sms/send', expect.any(Object));
    });

    it('falls back to SMS and reports fallbackUsed:true when the sendgrid dispatch rejects (fallback)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockSendgrid.sendOtpEmail.mockRejectedValueOnce(new Error('send failed'));
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      const result = await service.sendOtp({ phone: '+2348012345678', channel: 'EMAIL' as any, email: 'x@example.com' });

      expect(result.fallbackUsed).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://v3.api.termii.com/api/sms/send', expect.any(Object));
    });

    it('sends the WhatsApp template message shape via Meta Graph API with a url-type button, not copy_code (whatsapp)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await service.sendOtp({ phone: '+2348012345678', channel: 'WHATSAPP' as any });

      expect(mockResilience.execute).toHaveBeenCalledWith('metaWhatsapp', expect.any(Function));
      const call = (global.fetch as jest.Mock).mock.calls.find((c) => String(c[0]).includes('graph.facebook.com'));
      expect(call).toBeDefined();
      const body = JSON.parse(call![1].body);
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.template.name).toBeDefined();
      const bodyComponent = body.template.components.find((c: any) => c.type === 'body');
      const buttonComponent = body.template.components.find((c: any) => c.type === 'button');
      expect(bodyComponent).toBeDefined();
      expect(buttonComponent).toBeDefined();
      expect(buttonComponent.sub_type).toBe('url');
    });

    it('dispatches the Email OTP through the sendgrid vendor policy (sendgrid)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.set.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockSendgrid.sendOtpEmail.mockResolvedValue(undefined);

      const result = await service.sendOtp({ phone: '+2348012345678', channel: 'EMAIL' as any, email: 'x@example.com' });

      expect(mockResilience.execute).toHaveBeenCalledWith('sendgrid', expect.any(Function));
      expect(mockSendgrid.sendOtpEmail).toHaveBeenCalledWith('x@example.com', expect.any(String), expect.any(String));
      expect(result.fallbackUsed).toBe(false);
    });

    it('throws BadRequestException when channel is EMAIL and no email is resolvable (channel)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.sendOtp({ phone: '+2348012345678', channel: 'EMAIL' as any }),
      ).rejects.toThrow(BadRequestException);
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
      expect(mockRedis.set).toHaveBeenCalledWith('otp:+2348012345678', '654321:1:SMS:', 300);
    });

    it('preserves the channel across a failed-attempt rewrite (attempts)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:WHATSAPP:');
      mockRedis.set.mockResolvedValue(undefined);
      await expect(service.verifyOtp({ phone: '+2348012345678', otp: '000000' })).rejects.toThrow(BadRequestException);
      const call = mockRedis.set.mock.calls.find((c) => c[0] === 'otp:+2348012345678');
      expect(call![1]).toContain(':WHATSAPP:');
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

  describe('resetPassword', () => {
    it('propagates ForbiddenException when locked', async () => {
      mockRedis.exists.mockResolvedValue(true);
      await expect(
        service.resetPassword({ phone: '+2348012345678', otp: '654321', newPassword: 'NewPassword123' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propagates BadRequestException when no OTP stored', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue(null);
      await expect(
        service.resetPassword({ phone: '+2348012345678', otp: '654321', newPassword: 'NewPassword123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when OTP is valid but no user matches the phone', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ phone: '+2348012345678', otp: '654321', newPassword: 'NewPassword123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('hashes the new password, updates the user, audits, and returns tokens on success', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1', phone: '+2348012345678', role: 'CITIZEN' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', phone: '+2348012345678', role: 'CITIZEN' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      const result = await service.resetPassword({
        phone: '+2348012345678',
        otp: '654321',
        newPassword: 'NewPassword123',
      });

      expect(result.accessToken).toBe('acc');
      expect(result.refreshToken).toBe('ref');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_RESET' }) }),
      );
    });
  });

  describe('phoneAuth', () => {
    it('persists the resolved otpChannel on a newly created user (channel)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:WHATSAPP:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'new-user', role: 'CITIZEN', registeredRoles: ['CITIZEN'] });
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      await service.phoneAuth({ phone: '+2348012345678', otp: '654321', ndpaConsent: true });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ otpChannel: 'WHATSAPP' }) }),
      );
    });

    it('persists the resolved email instead of the auto-generated placeholder for a new EMAIL-channel user (channel)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:EMAIL:real@example.com');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'new-user', role: 'CITIZEN', registeredRoles: ['CITIZEN'] });
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      await service.phoneAuth({ phone: '+2348012345678', otp: '654321', ndpaConsent: true });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'real@example.com' }) }),
      );
    });

    it('rejects with ConflictException on a duplicate email during registration (duplicate email)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:EMAIL:dup@example.com');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'other-user-id' });

      await expect(
        service.phoneAuth({ phone: '+2348012345678', otp: '654321', ndpaConsent: true }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects new-user creation with BadRequestException when ndpaConsent is false (consent required)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.phoneAuth({ phone: '+2348012345678', otp: '654321', ndpaConsent: false }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects new-user creation with BadRequestException when ndpaConsent is omitted (consent required)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.phoneAuth({ phone: '+2348012345678', otp: '654321' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('persists real ndpaConsent and a server-generated ndpaConsentAt for a new user when consent is true (consent granted)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'new-user', role: 'CITIZEN', registeredRoles: ['CITIZEN'] });
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      await service.phoneAuth({ phone: '+2348012345678', otp: '654321', ndpaConsent: true });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ndpaConsent: true, ndpaConsentAt: expect.any(Date) }),
        }),
      );
    });

    it('succeeds for an existing user logging back in even when ndpaConsent is omitted (no login regression)', async () => {
      mockRedis.exists.mockResolvedValue(false);
      mockRedis.get.mockResolvedValue('654321:0:SMS:');
      mockRedis.del.mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user', role: 'CITIZEN', registeredRoles: ['CITIZEN'] });
      mockPrisma.user.update.mockResolvedValue({ id: 'existing-user', role: 'CITIZEN', registeredRoles: ['CITIZEN'] });
      mockJwt.signAsync.mockResolvedValueOnce('acc').mockResolvedValueOnce('ref');

      const result = await service.phoneAuth({ phone: '+2348012345678', otp: '654321' } as any);

      expect(result.isNewUser).toBe(false);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('does not bypass an active lockout when a different channel is requested (lockout)', async () => {
      mockRedis.exists.mockResolvedValue(true);

      await expect(service.sendOtp({ phone: '+2348012345678', channel: 'WHATSAPP' as any })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.sendOtp({ phone: '+2348012345678', channel: 'EMAIL' as any, email: 'x@example.com' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.phoneAuth({ phone: '+2348012345678', otp: '654321' } as any)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockResilience.execute).not.toHaveBeenCalledWith('metaWhatsapp', expect.any(Function));
      expect(mockResilience.execute).not.toHaveBeenCalledWith('sendgrid', expect.any(Function));
      expect(mockSendgrid.sendOtpEmail).not.toHaveBeenCalled();
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
