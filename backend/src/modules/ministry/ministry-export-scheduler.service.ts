import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExportCadence, MinistryExportSubscription } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MinistryService } from './ministry.service';
import { MinistryPdfService, MinistryPdfColumn } from '../../common/services/ministry-pdf.service';
import { CsvExportService } from '../../common/services/csv-export.service';
import { SendgridService } from '../../common/services/sendgrid.service';
import { ResilienceService } from '../../resilience/resilience.service';
import { RedisService } from '../../redis/redis.service';

/**
 * 22-03 — MinistryExportSchedulerService.
 *
 * Ties MinistryService (data) + MinistryPdfService/CsvExportService
 * (rendering) + SendgridService.sendMinistryDigest() (delivery) together on
 * an unattended once-daily cadence (MIN-08a, MIN-08c). Guarded by Phase 20's
 * setNx() distributed-lock pattern so a second replica running the same cron
 * tick never double-sends the same digest.
 *
 * Task 1 (this file's initial cut): @Cron tick, lock guard, due-subscription
 * filtering, processSubscription() stub.
 * Task 2: processSubscription() full gather/render/send/status-update body.
 */

// Module-level cadence lookup — D-04's rolling-window anchor is
// `lastSentAt ?? createdAt`, advanced by this many days per cadence.
const CADENCE_DAYS: Record<ExportCadence, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
};

// D-15 / RESEARCH.md Pitfall 2: pre-base64-raw combined attachment byte
// threshold above which the digest email is still sent, but WITHOUT
// attachments (not a delivery failure — only the attachment is degraded).
const SIZE_GUARD_THRESHOLD_BYTES = 8 * 1024 * 1024;

// Local copies of ministry.controller.ts's PDF column shapes (that file
// stays UNCHANGED this phase, per RESEARCH.md's Recommended Project
// Structure) — consumed by Task 2's processSubscription() body.
const VISITOR_ENTRIES_PDF_COLUMNS: MinistryPdfColumn[] = [
  { key: 'lgaName', label: 'LGA' },
  { key: 'month', label: 'Month' },
  { key: 'userRole', label: 'Visitor Role' },
  { key: 'count', label: 'Count' },
];

const PURPOSE_BREAKDOWN_COLUMNS: MinistryPdfColumn[] = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'month', label: 'Month' },
  { key: 'count', label: 'Count' },
];

const REVENUE_MODULE_COLUMNS: MinistryPdfColumn[] = [
  { key: 'module', label: 'Module' },
  { key: 'total', label: 'Total (NGN)' },
];

const REVENUE_MONTH_COLUMNS: MinistryPdfColumn[] = [
  { key: 'month', label: 'Month' },
  { key: 'total', label: 'Total (NGN)' },
];

const REVENUE_LGA_COLUMNS: MinistryPdfColumn[] = [
  { key: 'module', label: 'Module' },
  { key: 'lgaName', label: 'LGA' },
  { key: 'total', label: 'Total (NGN)' },
];

// D-01/Open Question 2 resolution: one combined CSV unions all 3 report
// types, each row tagged by `report` and populated only with its
// applicable columns (mirrors ministry.controller.ts exportRevenue's
// `breakdown`-discriminator-column technique) — consumed by Task 2.
const MINISTRY_DIGEST_CSV_COLUMNS = [
  'report',
  'lgaId',
  'lgaName',
  'month',
  'userRole',
  'purpose',
  'count',
  'module',
  'total',
];

@Injectable()
export class MinistryExportSchedulerService {
  private readonly logger = new Logger(MinistryExportSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ministryService: MinistryService,
    private readonly ministryPdfService: MinistryPdfService,
    private readonly csvExportService: CsvExportService,
    private readonly sendgrid: SendgridService,
    private readonly resilience: ResilienceService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkSubscriptionsDue(): Promise<void> {
    const acquired = await this.redis.setNx('cron-lock:checkMinistryExportSubscriptions', '1', 86000);
    if (!acquired) {
      this.logger.debug('checkSubscriptionsDue: lock held by another replica — skipping this tick');
      return;
    }

    const subscriptions = await this.prisma.ministryExportSubscription.findMany({
      where: { isActive: true },
    });

    const due = subscriptions.filter((sub) => {
      const anchor = sub.lastSentAt ?? sub.createdAt;
      const dueAt = new Date(anchor.getTime() + CADENCE_DAYS[sub.cadence] * 86_400_000);
      return dueAt.getTime() <= Date.now();
    });

    for (const subscription of due) {
      await this.processSubscription(subscription);
    }
  }

  // Task 1 stub — Task 2 replaces this body with the full
  // gather/render/send/status-update sequence.
  private async processSubscription(subscription: MinistryExportSubscription): Promise<void> {
    await Promise.resolve();
  }
}
