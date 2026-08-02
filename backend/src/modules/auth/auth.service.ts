import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserRole, REGISTERABLE_ROLES } from '../../common/enums/user-role.enum';
import { OtpChannel } from '../../common/enums/otp-channel.enum';

const OTP_TTL = 300; // 5 minutes
const OTP_LOCK_TTL = 900; // 15 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_SEND_COOLDOWN = 45; // min seconds between OTP sends to one phone (F-05 anti SMS-bomb)
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

    await this.consumeValidOtp(dto.phone, dto.otp);

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

  // F-07: lazily-computed valid bcrypt hash, used only to equalise timing on the
  // login not-found path. Computed once on first use so suites that never log in
  // don't pay the hash cost.
  private enumerationGuardHash: string | null = null;
  private getEnumerationGuardHash(): string {
    return (this.enumerationGuardHash ??= bcrypt.hashSync('enumeration-guard', 12));
  }

  async login(dto: LoginDto, ip?: string, ua?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
        deletedAt: null,
      },
    });
    if (!user || !user.passwordHash) {
      // F-07: burn an equivalent bcrypt.compare on the not-found path so login response
      // time doesn't reveal whether an account exists (user-enumeration side channel).
      await bcrypt.compare(dto.password, this.getEnumerationGuardHash());
      throw new UnauthorizedException('Invalid credentials');
    }

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

    // F-05: per-phone send cooldown. Verification lockout only triggers on failed
    // *verifies*, so without this an attacker could loop sendOtp against any victim
    // number and trigger unlimited Sendchamp SMS (SMS-bombing + direct provider cost).
    const cooldownKey = `otp_send_cooldown:${dto.phone}`;
    const onCooldown = await this.redis.exists(cooldownKey);
    if (onCooldown) {
      throw new ForbiddenException('A code was just sent. Please wait a moment before requesting another.');
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
    // Arm the send cooldown only after a successful dispatch, so a delivery failure
    // doesn't lock the user out of retrying.
    await this.redis.set(cooldownKey, '1', OTP_SEND_COOLDOWN);
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
    // WHATSAPP shares the SMS delivery path for now — Sendchamp's WhatsApp channel
    // needs a pre-approved message template that hasn't been set up yet (Termii,
    // Twilio, and Meta WhatsApp direct integration were all retired — 260728 SMS
    // provider migration). SMS delivery works either way.
    if (channel === OtpChannel.SMS || channel === OtpChannel.WHATSAPP) {
      const delivered = await this.sendSendchampSms(phone, otp);
      if (!delivered) {
        throw new ServiceUnavailableException(
          'We could not send your verification code right now. Please try again in a few minutes.',
        );
      }
      return false;
    }

    try {
      await this.resilience.execute('sendgrid', () =>
        this.sendgrid.sendOtpEmail(email!, firstName ?? 'there', otp),
      );
      return false;
    } catch (err) {
      this.logger.error(`${channel} OTP dispatch failed — falling back to SMS`, err);
      const delivered = await this.sendSendchampSms(phone, otp);
      if (!delivered) {
        throw new ServiceUnavailableException(
          'We could not send your verification code right now. Please try again in a few minutes.',
        );
      }
      return true;
    }
  }

  /**
   * Shared OTP validate-and-consume helper — extracted from verifyOtp so that any
   * flow needing "prove possession of this phone's OTP" (registration verification,
   * password reset, etc) enforces the exact same lockout/attempt-counting logic with
   * no duplicated redis calls. Resolves with no value on success; deletes the OTP key
   * as its side effect. Throws ForbiddenException when locked or when this attempt
   * trips the lock; throws BadRequestException when no OTP is stored or the OTP is wrong.
   */
  private async consumeValidOtp(phone: string, otp: string): Promise<void> {
    const lockKey = `otp_lock:${phone}`;
    const isLocked = await this.redis.exists(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Too many OTP attempts. Try again in 15 minutes');
    }

    const stored = await this.redis.get(`otp:${phone}`);
    if (!stored) throw new BadRequestException('OTP expired or not found');

    const { otp: storedOtp, attempts, channel, email } = this.decodeOtpValue(stored);

    if (attempts + 1 >= OTP_MAX_ATTEMPTS && otp !== storedOtp) {
      await this.redis.del(`otp:${phone}`);
      await this.redis.set(lockKey, '1', OTP_LOCK_TTL);
      throw new ForbiddenException('Too many invalid attempts. Try again in 15 minutes');
    }

    if (otp !== storedOtp) {
      await this.redis.set(`otp:${phone}`, this.encodeOtpValue(storedOtp, attempts + 1, channel, email), OTP_TTL);
      throw new BadRequestException(`Invalid OTP. ${OTP_MAX_ATTEMPTS - attempts - 1} attempt(s) remaining`);
    }

    await this.redis.del(`otp:${phone}`);
  }

  async verifyOtp(dto: OtpVerifyDto) {
    await this.consumeValidOtp(dto.phone, dto.otp);

    // L-06: use update (unique constraint on phone) instead of updateMany
    await this.prisma.user.update({
      where: { phone: dto.phone },
      data: { status: 'ACTIVE' },
    });

    return { message: 'OTP verified successfully' };
  }

  /**
   * Verify a phone OTP and set a new password, auto-signing the user in — mirrors
   * register()'s auto-login-after-creation pattern. Password reset uses the phone
   * OTP channel (not email) since it mirrors phone login/registration's existing,
   * already-proven Sendchamp SMS OTP pipeline.
   */
  async resetPassword(dto: ResetPasswordDto, ip?: string, ua?: string) {
    await this.consumeValidOtp(dto.phone, dto.otp);

    const user = await this.prisma.user.findFirst({ where: { phone: dto.phone, deletedAt: null } });
    if (!user) throw new NotFoundException('No account found for this phone number');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      select: USER_SELECT,
    });

    await this.audit(user.id, 'PASSWORD_RESET', 'User', user.id, ip, ua);
    const tokens = await this.generateTokens(updated.id, updated.role as UserRole);
    return { user: updated, ...tokens };
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
      // C-10 parity: phoneAuth() must reject SUSPENDED/DELETED accounts the same way
      // login() does (line ~109) instead of unconditionally reactivating them and
      // issuing fresh tokens — otherwise a suspended user regains access simply by
      // re-verifying their phone OTP.
      if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
        throw new UnauthorizedException('Account is not accessible');
      }
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

    // Fresh DB role/status lookup — do NOT trust payload.role, which reflects the
    // role at the time the refresh token was originally issued and may now be stale
    // (e.g. after become-host/become-driver/switchRole, or an admin suspension).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
      select: { role: true, status: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    // C-10 parity: mirror login()'s status check so a SUSPENDED/DELETED account
    // cannot keep silently minting new access tokens via refresh.
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new UnauthorizedException('Account is not accessible');
    }

    const remaining = payload['exp'] - Math.floor(Date.now() / 1000);
    if (remaining > 0) {
      await this.redis.set(blacklistKey, '1', remaining);
    }

    return this.generateTokens(payload.sub, user.role as UserRole);
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

  async generateTokens(userId: string, role: UserRole) {
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

  /**
   * Returns true when the OTP was actually delivered via Sendchamp, or via the
   * no-credentials-configured dev stub (deliberate local-dev no-op, not a failure).
   * Returns false only when SENDCHAMP_API_KEY was configured and the send
   * genuinely failed — the caller must treat that as a real delivery failure,
   * not silently report success.
   */
  private async sendSendchampSms(phone: string, otp: string): Promise<boolean> {
    const apiKey = this.config.get<string>('SENDCHAMP_API_KEY');
    if (!apiKey) {
      this.logger.warn(`[SMS STUB] OTP ${otp} for ${phone} — configure SENDCHAMP_API_KEY to send live SMS`);
      return true;
    }

    const senderName = this.config.get<string>('SENDCHAMP_SENDER_NAME', 'Sendchamp');
    const route = phone.startsWith('+234') ? 'dnd' : 'international';

    try {
      const response = await this.resilience.execute('sendchampAuth', ({ signal }) =>
        fetch('https://api.sendchamp.com/api/v1/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            to: [phone],
            message: `Your Iṣẹ́yáá verification code is ${otp}. Valid for 5 minutes. Do not share.`,
            sender_name: senderName,
            route,
          }),
          signal,
        }),
      );
      if (!response.ok) {
        this.logger.error(`Sendchamp error: ${response.status} ${await response.text()}`);
        return false;
      }
      this.logger.log(`OTP sent via Sendchamp to ${phone}`);
      return true;
    } catch (err) {
      this.logger.error('Sendchamp request failed', err);
      return false;
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
