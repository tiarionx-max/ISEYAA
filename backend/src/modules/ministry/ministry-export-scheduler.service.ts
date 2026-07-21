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

  // D-04: per-subscription rolling window — gather/render/send one digest
  // covering [lastSentAt ?? createdAt, now). Wrapped in a per-row try/catch
  // so one bad subscription never aborts checkSubscriptionsDue()'s loop for
  // the others (T-22-07 repudiation mitigation: every attempt is logged and
  // persisted, success or failure).
  private async processSubscription(subscription: MinistryExportSubscription): Promise<void> {
    try {
      const from = (subscription.lastSentAt ?? subscription.createdAt).toISOString();
      const to = new Date().toISOString();

      const [visitorEntries, purposeBreakdown, revenue] = await Promise.all([
        this.ministryService.getVisitorEntriesByLgaAndMonth(from, to),
        this.ministryService.getPurposeBreakdown(from, to),
        this.ministryService.getRevenueToGovernment(from, to),
      ]);

      const pdfBuffer = await this.ministryPdfService.renderPdf({
        title: 'Ministry Export Digest',
        sections: [
          {
            heading: 'Visitor Entries',
            columns: VISITOR_ENTRIES_PDF_COLUMNS,
            rows: visitorEntries as unknown as Record<string, unknown>[],
          },
          {
            heading: 'Purpose of Visit',
            columns: PURPOSE_BREAKDOWN_COLUMNS,
            rows: purposeBreakdown as unknown as Record<string, unknown>[],
          },
          {
            heading: 'Revenue by Module',
            columns: REVENUE_MODULE_COLUMNS,
            rows: revenue.byModule as unknown as Record<string, unknown>[],
          },
          {
            heading: 'Revenue by Month',
            columns: REVENUE_MONTH_COLUMNS,
            rows: revenue.byMonth as unknown as Record<string, unknown>[],
          },
          {
            heading: 'Revenue by LGA',
            columns: REVENUE_LGA_COLUMNS,
            rows: revenue.byModuleLga as unknown as Record<string, unknown>[],
          },
        ],
      });

      // D-01/Open Question 2 resolution: one combined CSV unions all 3
      // report types, each row tagged by `report` and populated only with
      // its applicable columns (mirrors ministry.controller.ts's
      // exportRevenue `breakdown`-discriminator-column technique).
      const combinedRows: Record<string, unknown>[] = [
        ...visitorEntries.map((r) => ({
          report: 'Visitor Entries',
          lgaId: r.lgaId ?? '',
          lgaName: r.lgaName ?? '',
          month: r.month,
          userRole: r.userRole,
          purpose: '',
          count: r.count,
          module: '',
          total: '',
        })),
        ...purposeBreakdown.map((r) => ({
          report: 'Purpose of Visit',
          lgaId: '',
          lgaName: '',
          month: r.month,
          userRole: '',
          purpose: r.purpose,
          count: r.count,
          module: '',
          total: '',
        })),
        ...revenue.byModule.map((r) => ({
          report: 'Revenue by Module',
          lgaId: '',
          lgaName: '',
          month: '',
          userRole: '',
          purpose: '',
          count: '',
          module: r.module,
          total: r.total,
        })),
        ...revenue.byMonth.map((r) => ({
          report: 'Revenue by Month',
          lgaId: '',
          lgaName: '',
          month: r.month,
          userRole: '',
          purpose: '',
          count: '',
          module: '',
          total: r.total,
        })),
        ...revenue.byModuleLga.map((r) => ({
          report: 'Revenue by LGA',
          lgaId: r.lgaId ?? '',
          lgaName: r.lgaName ?? '',
          month: '',
          userRole: '',
          purpose: '',
          count: '',
          module: r.module,
          total: r.total,
        })),
      ];

      const csv = await this.csvExportService.toCsv(combinedRows, MINISTRY_DIGEST_CSV_COLUMNS);

      const rawBytes = pdfBuffer.length + Buffer.byteLength(csv, 'utf-8');

      let attachments:
        | Array<{ content: string; filename: string; type: string; disposition: string }>
        | undefined;

      if (rawBytes > SIZE_GUARD_THRESHOLD_BYTES) {
        this.logger.warn(
          `processSubscription: digest for subscription ${subscription.id} is ${rawBytes} bytes (over the ${SIZE_GUARD_THRESHOLD_BYTES}-byte threshold) — sending without attachments (D-15)`,
        );
        attachments = undefined;
      } else {
        attachments = [
          {
            content: pdfBuffer.toString('base64'),
            filename: 'ministry-digest.pdf',
            type: 'application/pdf',
            disposition: 'attachment',
          },
          {
            content: Buffer.from(csv, 'utf-8').toString('base64'),
            filename: 'ministry-digest.csv',
            type: 'text/csv',
            disposition: 'attachment',
          },
        ];
      }

      await this.resilience.execute('sendgrid', () =>
        this.sendgrid.sendMinistryDigest({
          to: subscription.recipients,
          subject: 'Ministry Export Digest',
          html: `<p>Your scheduled Ministry Export Digest for the period ${from} to ${to} is attached.</p>`,
          attachments,
        }),
      );

      await this.prisma.ministryExportSubscription.update({
        where: { id: subscription.id },
        data: { lastSentAt: new Date(), lastStatus: 'SUCCESS', lastError: null },
      });

      this.logger.log(`processSubscription: digest sent successfully for subscription ${subscription.id}`);
    } catch (err: any) {
      this.logger.error(`processSubscription failed for subscription ${subscription.id}: ${err?.message}`);
      await this.prisma.ministryExportSubscription.update({
        where: { id: subscription.id },
        data: { lastStatus: 'FAILED', lastError: this.truncateError(err) },
      });
    }
  }

  // Local equivalent of resilience.service.ts's non-exported
  // summarizeVendorError() intent (T-22-05): message-only, never
  // err.response.body/headers, truncated to <=500 chars before persisting.
  private truncateError(err: unknown): string {
    const message = (err as Error)?.message ?? 'Unknown error';
    return message.slice(0, 500);
  }
}
