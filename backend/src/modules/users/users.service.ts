import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { OtpChannel } from '../../common/enums/otp-channel.enum';
import { UpdateUserDto } from './dto/update-user.dto';

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
  otpChannel: true,
  kycBvnVerifiedAt: true,
  kycNinVerifiedAt: true,
  kycLivenessVerifiedAt: true,
  avatarUrl: true,
  lgaId: true,
  ndpaConsent: true,
  ndpaConsentAt: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async switchRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { registeredRoles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.registeredRoles.includes(role)) {
      throw new ForbiddenException(`Role ${role} is not in your registered roles`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: USER_SELECT,
    });
  }

  async updateOtpChannel(userId: string, channel: OtpChannel) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { otpChannel: channel },
      select: USER_SELECT,
    });
  }

  /** Become a host — adds HOST to registeredRoles and switches active role. */
  async becomeHost(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { registeredRoles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        registeredRoles: user.registeredRoles.includes('HOST' as UserRole)
          ? user.registeredRoles
          : { set: [...user.registeredRoles, 'HOST' as UserRole] },
        role: 'HOST' as UserRole,
      },
      select: USER_SELECT,
    });
    return updated;
  }

  /**
   * Become a driver — adds DRIVER to registeredRoles and switches active role.
   * Driver *profile* creation (licence/vehicle, PENDING_REVIEW) happens separately
   * via POST /transport/drivers.
   */
  async becomeDriver(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { registeredRoles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        registeredRoles: user.registeredRoles.includes('DRIVER' as UserRole)
          ? user.registeredRoles
          : { set: [...user.registeredRoles, 'DRIVER' as UserRole] },
        role: 'DRIVER' as UserRole,
      },
      select: USER_SELECT,
    });
    return updated;
  }

  /**
   * Become a tour guide — adds TOUR_GUIDE to registeredRoles, switches active role,
   * AND creates an empty TourGuide profile row (status PENDING) so subsequent
   * /tour-guides endpoints can find a profile to update. Wrapped in a single
   * transaction so the role flip and profile creation are atomic.
   */
  async becomeGuide(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { registeredRoles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      // Upsert empty TourGuide profile row — safe to call repeatedly.
      await tx.tourGuide.upsert({
        where: { userId },
        create: { userId, status: 'PENDING' },
        update: {},
      });
      return tx.user.update({
        where: { id: userId },
        data: {
          registeredRoles: user.registeredRoles.includes('TOUR_GUIDE' as UserRole)
            ? user.registeredRoles
            : { set: [...user.registeredRoles, 'TOUR_GUIDE' as UserRole] },
          role: 'TOUR_GUIDE' as UserRole,
        },
        select: USER_SELECT,
      });
    });
    return updated;
  }

  async eraseData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const anonymized = `deleted_${userId}`;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: null,
        phone: null,
        passwordHash: null,
        firstName: anonymized,
        lastName: anonymized,
        avatarUrl: null,
        nin: null,
        bvn: null,
        // NDPA right-to-erasure: clear all KYC hashes and timestamps (CLAUDE.md compliance)
        bvnHash: null,
        ninHash: null,
        kycBvnVerifiedAt: null,
        kycNinVerifiedAt: null,
        kycLivenessVerifiedAt: null,
        metadata: null,
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'NDPA_DATA_ERASURE',
        entity: 'User',
        entityId: userId,
      },
    });

    return { message: 'Personal data erased in compliance with NDPA' };
  }

  async getBookmarks(userId: string) {
    const bookmarks = await this.prisma.attractionBookmark.findMany({
      where: { userId },
      include: {
        attraction: {
          include: { lga: { select: { name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return bookmarks.map((b) => b.attraction);
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }

  /**
   * Change password for a logged-in user. Requires the current password — does NOT
   * re-issue tokens (existing session stays valid). Deliberately selects `passwordHash`
   * directly rather than via the module's USER_SELECT (which omits it).
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new UnauthorizedException('Current password is incorrect');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.auditLog.create({
      data: { userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId },
    });

    return { message: 'Password changed successfully' };
  }
}
