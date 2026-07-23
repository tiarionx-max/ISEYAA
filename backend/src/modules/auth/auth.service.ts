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
import { ResilienceService } from '../../resilience/resilience.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { PhoneAuthDto } from './dto/phone-auth.dto';
import { UserRole, REGISTERABLE_ROLES } from '../../common/enums/user-role.enum';
import { OtpChannel } from '../../common/enums/otp-channel.enum';

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
    private resilience: ResilienceService,
    private sendgrid: SendgridService,
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

    const existingUser = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
      select: { otpChannel: true, email: true, firstName: true },
    });

    const channel = (existingUser?.otpChannel as OtpChannel) ?? dto.channel ?? OtpChannel.SMS;
    const email = channel === OtpChannel.EMAIL ? existingUser?.email ?? dto.email : undefined;

    if (channel === OtpChannel.EMAIL && !email) {
      throw new BadRequestException('Email is required when channel is EMAIL');
    }

    const otp = randomInt(100000, 1000000).toString();
    await this.redis.set(`otp:${dto.phone}`, this.encodeOtpValue(otp, 0, channel, email), OTP_TTL);

    const fallbackUsed = await this.dispatchOtp(dto.phone, otp, channel, email, existingUser?.firstName);
    return { message: 'OTP sent successfully', fallbackUsed };
  }

  private encodeOtpValue(otp: string, attempts: number, channel: OtpChannel, email?: string): string {
    return `${otp}:${attempts}:${channel}:${email ?? ''}`;
  }

  private decodeOtpValue(stored: string): { otp: string; attempts: number; channel: OtpChannel; email?: string } {
    const [otp, attemptsStr, channelStr, emailStr] = stored.split(':');
    return {
      otp,
      attempts: parseInt(attemptsStr, 10),
      channel: (channelStr as OtpChannel) ?? OtpChannel.SMS,
      email: emailStr || undefined,
    };
  }

  private async dispatchOtp(
    phone: string,
    otp: string,
    channel: OtpChannel,
    email?: string,
    firstName?: string,
  ): Promise<boolean> {
    if (channel === OtpChannel.SMS) {
      await this.sendTermii(phone, otp);
      return false;
    }

    try {
      if (channel === OtpChannel.WHATSAPP) {
        await this.sendMetaWhatsapp(phone, otp);
      } else if (channel === OtpChannel.EMAIL) {
        await this.resilience.execute('sendgrid', () =>
          this.sendgrid.sendOtpEmail(email!, firstName ?? 'there', otp),
        );
      }
      return false;
    } catch (err) {
      this.logger.error(`${channel} OTP dispatch failed — falling back to SMS`, err);
      await this.sendTermii(phone, otp);
      return true;
    }
  }

  private async sendMetaWhatsapp(phone: string, otp: string): Promise<void> {
    const accessToken = this.config.get<string>('META_WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('META_WHATSAPP_PHONE_NUMBER_ID');
    const templateName = this.config.get<string>('META_WHATSAPP_TEMPLATE_NAME');
    const templateLangCode = this.config.get<string>('META_WHATSAPP_TEMPLATE_LANG', 'en_US');

    if (!accessToken || !phoneNumberId || !templateName) {
      throw new Error('Meta WhatsApp credentials not configured');
    }

    const response = await this.resilience.execute('metaWhatsapp', ({ signal }) =>
      fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone.replace('+', ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLangCode },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: otp }] },
              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
            ],
          },
        }),
        signal,
      }),
    );
    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Meta WhatsApp error: ${response.status} ${body}`);
      throw new Error(`Meta WhatsApp send failed: ${response.status}`);
    }
    this.logger.log(`OTP sent via WhatsApp to ${phone}`);
  }

  async verifyOtp(dto: OtpVerifyDto) {
    const lockKey = `otp_lock:${dto.phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');
    }

    const stored = await this.redis.get(`otp:${dto.phone}`);
    if (!stored) throw new BadRequestException('OTP expired or not found');

    const { otp: storedOtp, attempts, channel, email } = this.decodeOtpValue(stored);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && dto.otp !== storedOtp) {
      await this.redis.del(`otp:${dto.phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (dto.otp !== storedOtp) {
      await this.redis.set(`otp:${dto.phone}`, this.encodeOtpValue(storedOtp, attempts + 1, channel, email), OTP_TTL);
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

    const { otp: storedOtp, attempts, channel, email } = this.decodeOtpValue(stored);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && dto.otp !== storedOtp) {
      await this.redis.del(`otp:${dto.phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (dto.otp !== storedOtp) {
      await this.redis.set(`otp:${dto.phone}`, this.encodeOtpValue(storedOtp, attempts + 1, channel, email), OTP_TTL);
      throw new BadRequestException(`Invalid OTP. ${OTP_MAX_ATTEMPTS - attempts - 1} attempt(s) remaining`);
    }

    await this.redis.del(`otp:${dto.phone}`);

    let user = await this.prisma.user.findFirst({ where: { phone: dto.phone, deletedAt: null }, select: USER_SELECT });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      if (!dto.ndpaConsent) {
        throw new BadRequestException('NDPA consent is required to create an account');
      }

      if (channel === OtpChannel.EMAIL && email) {
        const existingEmailUser = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
        if (existingEmailUser) {
          throw new ConflictException('Email already in use');
        }
      }

      const suffix = dto.phone.slice(-4);
      const created = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          email: channel === OtpChannel.EMAIL && email ? email : `${dto.phone.replace('+', '')}@iseyaa.local`,
          firstName: 'User',
          lastName: suffix,
          passwordHash: await bcrypt.hash(uuidv4(), 12),
          role: UserRole.CITIZEN,
          registeredRoles: [UserRole.CITIZEN],
          status: 'ACTIVE',
          otpChannel: channel,
          ndpaConsent: dto.ndpaConsent,
          ndpaConsentAt: dto.ndpaConsent ? new Date() : undefined,
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
    const termiiKey = this.config.get<string>('TERMII_API_KEY');

    if (termiiKey) {
      const smsSender = this.config.get<string>('TERMII_SENDER_ID', '');

      const channel = smsSender ? 'generic' : 'dnd';
      const from = smsSender || 'N-Alert';

      try {
        const response = await this.resilience.execute('termiiAuth', ({ signal }) =>
          fetch('https://v3.api.termii.com/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: phone,
              from,
              sms: `Your Iṣẹ́yáá verification code is ${otp}. Valid for 5 minutes. Do not share.`,
              type: 'plain',
              channel,
              api_key: termiiKey,
            }),
            signal,
          }),
        );
        if (response.ok) {
          this.logger.log(`OTP sent via Termii (${channel}) to ${phone}`);
          return;
        }
        this.logger.error(`Termii error: ${response.status} ${await response.text()} — falling back to Twilio`);
      } catch (err) {
        this.logger.error('Termii request failed — falling back to Twilio', err);
      }
    }

    // Twilio fallback (trial accounts cannot send to unverified Nigerian numbers; use Termii above for NG)
    const twilioSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const twilioToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const twilioFrom = this.config.get<string>('TWILIO_FROM_NUMBER');

    if (twilioSid && twilioToken && twilioFrom) {
      await this.sendTwilio(phone, otp, twilioSid, twilioToken, twilioFrom);
      return;
    }

    this.logger.warn(`[SMS STUB] OTP ${otp} for ${phone} — configure TERMII_API_KEY or TWILIO_* to send live SMS`);
  }

  private async sendTwilio(phone: string, otp: string, sid: string, token: string, from: string) {
    try {
      const body = new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your Iṣẹ́yáá verification code is ${otp}. Valid for 5 minutes. Do not share.`,
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
