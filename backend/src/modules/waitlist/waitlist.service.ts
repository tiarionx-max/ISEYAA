import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private prisma: PrismaService) {}

  async join(dto: JoinWaitlistDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Provide an email or phone number');
    }

    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone?.trim() || null;

    try {
      const entry = await this.prisma.waitlistEntry.upsert({
        where: email
          ? { source_email: { source: dto.source, email } }
          : { source_phone: { source: dto.source, phone: phone as string } },
        create: {
          source: dto.source,
          email,
          phone,
          fullName: dto.fullName?.trim() || null,
        },
        update: {
          // refresh phone/fullName if user re-submits with extra info
          phone: phone ?? undefined,
          fullName: dto.fullName?.trim() || undefined,
        },
        select: { id: true, createdAt: true },
      });

      const total = await this.prisma.waitlistEntry.count({ where: { source: dto.source } });
      return {
        message: 'You\'re on the list — we\'ll be in touch.',
        position: total,
        id: entry.id,
      };
    } catch (err: any) {
      this.logger.error('Waitlist join failed', err);
      throw new BadRequestException('Could not save your waitlist signup');
    }
  }

  async stats() {
    const grouped = await this.prisma.waitlistEntry.groupBy({
      by: ['source'],
      _count: { _all: true },
    });
    return grouped.map((g) => ({ source: g.source, count: g._count._all }));
  }
}
