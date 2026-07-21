import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExportSubscriptionDto } from './dto/create-export-subscription.dto';
import { UpdateExportSubscriptionDto } from './dto/update-export-subscription.dto';

@Injectable()
export class MinistryExportSubscriptionService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.ministryExportSubscription.findMany();
  }

  create(dto: CreateExportSubscriptionDto) {
    return this.prisma.ministryExportSubscription.create({
      data: {
        recipients: dto.recipients,
        cadence: dto.cadence,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findOne(id: string) {
    const subscription = await this.prisma.ministryExportSubscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundException('Ministry export subscription not found');
    }
    return subscription;
  }

  async update(id: string, dto: UpdateExportSubscriptionDto) {
    await this.findOne(id);
    return this.prisma.ministryExportSubscription.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ministryExportSubscription.delete({ where: { id } });
  }
}
