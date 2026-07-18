import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '../enums/user-role.enum';

/**
 * D-08's sole write path into `VisitorLog` — mirrors `QrService`'s single-purpose,
 * constructor-injected-PrismaService shape. Called inline from the three
 * confirmation points (Events check-in, Stays check-in, Tour booking confirmation)
 * wired by Plans 14-04/14-05. No defensive try/catch here — callers at each write
 * site are responsible for swallow-and-log (RESEARCH.md's error-handling
 * convention, mirroring `handleStayPayment()`).
 */
@Injectable()
export class VisitorLogService {
  constructor(private prisma: PrismaService) {}

  async record(input: {
    lgaId: string | null;
    purpose: string;
    sourceType: 'EVENT' | 'STAY' | 'TOUR';
    sourceId: string;
    visitedAt: Date;
    userRole: UserRole;
  }): Promise<void> {
    await this.prisma.visitorLog.create({ data: input as any });
  }
}
