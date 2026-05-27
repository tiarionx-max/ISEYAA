import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { PhoneAuthDto } from './dto/phone-auth.dto';
import { UserRole, REGISTERABLE_ROLES } from '../../common/enums/user-role.enum';

const OTP_TTL = 300; // 5 minutes
const OTP_LOCK_TTL = 900; // 15 minutes
const OTP_MAX_ATTEMPTS = 3;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  registeredRoles: true,
  status: true,
  kycStatus: true,
  avatarUrl: true,
  lgaId: true,
  ndpaConsent: true,
  createdAt: true,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto, ip?: string, ua?: string) {
    if (!dto.ndpaConsent) {
      throw new BadRequestException('NDPA consent is required to create an account');
    }

    // L-01: enforce that client cannot self-register privileged roles
    if (dto.role && !REGISTERABLE_ROLES.includes(dto.role as UserRole)) {
      throw new BadRequestException(`Role ${dto.role} cannot be self-registered`);
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) throw new ConflictException('Email or phone already registered');

    const role = dto.role ?? UserRole.CITIZEN;
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role,
        registeredRoles: [role],
        ndpaConsent: true,
        ndpaConsentAt: new Date(),
        wallet: { create: { balance: 0 } },
      },
      select: USER_SELECT,
    });

    await this.audit(user.id, 'USER_REGISTERED', 'User', user.id, ip, ua);
    const tokens = await this.generateTokens(user.id, user.role as UserRole);
    return { user, ...tokens };
  }

  async login(dto: LoginDto, ip?: string, ua?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
        deletedAt: null,
      },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    // C-10: status check BEFORE bcrypt.compare to avoid leaking that password was valid
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new UnauthorizedException('Account is not accessible');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.audit(user.id, 'LOGIN_FAILED', 'User', user.id, ip, ua);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.audit(user.id, 'LOGIN_SUCCESS', 'User', user.id, ip, ua);
    const tokens = await this.generateTokens(user.id, user.role as UserRole);
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        registeredRoles: user.registeredRoles,
      },
      ...tokens,
    };
  }

  async sendOtp(dto: OtpSendDto) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');
    }

    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(`otp:${dto.phone}`, `${otp}:0`, OTP_TTL);

    await this.sendTermii(dto.phone, otp);
    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');
    }

    const stored = await this.redis.get(`otp:${dto.phone}`);
    if (!stored) throw new BadRequestException('OTP expired or not found');

    const [storedOtp, attemptsStr] = stored.split(':');
    const attempts = parseInt(attemptsStr, 10);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && dto.otp !== storedOtp) {
      await this.redis.del(`otp:${dto.phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (dto.otp !== storedOtp) {
      await this.redis.set(`otp:${dto.phone}`, `${storedOtp}:${attempts + 1}`, OTP_TTL);
      throw new BadRequestException(`Invalid OTP. ${OTP_MAX_ATTEMPTS - attempts - 1} attempt(s) remaining`);
    }

    await this.redis.del(`otp:${dto.phone}`);

    // L-06: use update (unique constraint on phone) instead of updateMany
    await this.prisma.user.update({
      where: { phone: dto.phone },
      data: { status: 'ACTIVE' },
    });

    return { message: 'OTP verified successfully' };
  }

  async phoneAuth(dto: PhoneAuthDto, ip?: string, ua?: string) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');

    const stored = await this.redis.get(`otp:${dto.phone}`);
    if (!stored) throw new BadRequestException('OTP expired or not found. Request a new code.');

    const [storedOtp, attemptsStr] = stored.split(':');
    const attempts = parseInt(attemptsStr, 10);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && dto.otp !== storedOtp) {
      await this.redis.del(`otp:${dto.phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (dto.otp !== storedOtp) {
      await this.redis.set(`otp:${dto.phone}`, `${storedOtp}:${attempts + 1}`, OTP_TTL);
      throw new BadRequestException(`Invalid OTP. ${OTP_MAX_ATTEMPTS - attempts - 1} attempt(s) remaining`);
    }

    await this.redis.del(`otp:${dto.phone}`);

    let user = await this.prisma.user.findFirst({ where: { phone: dto.phone, deletedAt: null }, select: USER_SELECT });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const suffix = dto.phone.slice(-4);
      const created = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          email: `${dto.phone.replace('+', '')}@iseyaa.local`,
          firstName: 'User',
          lastName: suffix,
          passwordHash: await bcrypt.hash(uuidv4(), 12),
          role: UserRole.CITIZEN,
          registeredRoles: [UserRole.CITIZEN],
          status: 'ACTIVE',
          ndpaConsent: true,
          ndpaConsentAt: new Date(),
          wallet: { create: { balance: 0 } },
        },
        select: USER_SELECT,
      });
      user = created;
      await this.audit(user.id, 'USER_REGISTERED', 'User', user.id, ip, ua);
    } else {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      await this.audit(user.id, 'LOGIN_SUCCESS', 'User', user.id, ip, ua);
    }

    const tokens = await this.generateTokens(user.id, user.role as UserRole);
    return { user, isNewUser, ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string; role: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const blacklistKey = `blacklist:${payload.jti}`;
    const isBlacklisted = await this.redis.exists(blacklistKey);
    if (isBlacklisted) throw new UnauthorizedException('Token has been revoked');

    const remaining = payload['exp'] - Math.floor(Date.now() / 1000);
    if (remaining > 0) {
      await this.redis.set(blacklistKey, '1', remaining);
    }

    return this.generateTokens(payload.sub, payload.role as UserRole);
  }

  async logout(refreshToken: string, ip?: string, ua?: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const remaining = payload['exp'] - Math.floor(Date.now() / 1000);
      if (remaining > 0) {
        await this.redis.set(`blacklist:${payload.jti}`, '1', remaining);
      }
      await this.audit(payload.sub, 'LOGOUT', 'User', payload.sub, ip, ua);
    } catch {
      // Token already invalid — logout is still successful
    }
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(userId: string, role: UserRole) {
    const jti = uuidv4();
    const payload = { sub: userId, role, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: `${REFRESH_TTL_SECONDS}s`,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async sendTermii(phone: string, otp: string) {
    const twilioSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const twilioToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const twilioFrom = this.config.get<string>('TWILIO_FROM_NUMBER');

    if (twilioSid && twilioToken && twilioFrom) {
      await this.sendTwilio(phone, otp, twilioSid, twilioToken, twilioFrom);
      return;
    }

    const termiiKey = this.config.get<string>('TERMII_API_KEY');
    if (!termiiKey) {
      this.logger.warn(`[SMS STUB] OTP ${otp} for ${phone} — configure TWILIO_* or TERMII_API_KEY to send live SMS`);
      return;
    }

    const senderId = this.config.get('TERMII_SENDER_ID', '');
    const channel = senderId ? 'generic' : 'dnd';
    const from = senderId || 'N-Alert';

    try {
      const response = await fetch('https://v3.api.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from,
          sms: `Your ISEYAA verification code is ${otp}. Valid for 5 minutes. Do not share.`,
          type: 'plain',
          channel,
          api_key: termiiKey,
        }),
      });
      if (!response.ok) {
        this.logger.error(`Termii error: ${response.status} ${await response.text()}`);
      }
    } catch (err) {
      this.logger.error('Termii request failed', err);
    }
  }

  private async sendTwilio(phone: string, otp: string, sid: string, token: string, from: string) {
    try {
      const body = new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your ISEYAA verification code is ${otp}. Valid for 5 minutes. Do not share.`,
      });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          },
          body: body.toString(),
        },
      );
      if (!response.ok) {
        this.logger.error(`Twilio error: ${response.status} ${await response.text()}`);
      } else {
        this.logger.log(`SMS sent via Twilio to ${phone}`);
      }
    } catch (err) {
      this.logger.error('Twilio request failed', err);
    }
  }

  private async audit(
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, entity, entityId, ipAddress, userAgent },
      });
    } catch (err) {
      this.logger.error('Audit log failed', err);
    }
  }
}
