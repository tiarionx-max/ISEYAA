import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../../common/enums/user-role.enum';

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

  async update(
    id: string,
    data: { firstName?: string; lastName?: string; avatarUrl?: string; lgaId?: string },
  ) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }
}
