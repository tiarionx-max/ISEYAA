import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { PaystackService } from '../../common/services/paystack.service';
import { DojahService } from '../../common/services/dojah.service';

export interface KycTierResult {
  tier: number;
  dailyLimitNgn: number;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly paystack: PaystackService,
    private readonly dojah: DojahService,
    private readonly config: ConfigService,
  ) {}

  // Full implementation in Phase 5 plan 03
  // Note: parameters are never logged (BVN/NIN are PII — CLAUDE.md constraint)
  async verifyBvn(userId: string, bvn: string): Promise<KycTierResult> {
    throw new NotImplementedException('Phase 5 plan 03 implements this');
  }

  async verifyNin(userId: string, nin: string): Promise<KycTierResult> {
    throw new NotImplementedException('Phase 5 plan 03 implements this');
  }

  async completeLiveness(userId: string): Promise<KycTierResult> {
    throw new NotImplementedException('Phase 5 plan 03 implements this');
  }
}
