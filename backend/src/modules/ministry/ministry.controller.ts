import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { MinistryService } from './ministry.service';
import { MinistryQueryDto } from './dto/ministry-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CsvExportService } from '../../common/services/csv-export.service';
import { MinistryPdfService, MinistryPdfColumn } from '../../common/services/ministry-pdf.service';

// MIN-01: This controller MUST NEVER gain a @Patch/@Post/@Delete handler,
// in this or any future phase — it exists solely to give the Ministry
// dashboard's GET-only read surface its own controller class, isolated
// from every mutation endpoint (see AdminController's Pitfall 1).
//
// 14-07 MIN-05/MIN-06: the 6 export routes below are added to this SAME
// class, inheriting the class-level @Roles() guard — no route carries a
// separate/weaker @Roles() override (T-14-13).
const VISITOR_ENTRIES_COLUMNS: MinistryPdfColumn[] = [
  { key: 'lgaId', label: 'LGA ID' },
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

const REVENUE_CSV_COLUMNS: MinistryPdfColumn[] = [
  { key: 'breakdown', label: 'Breakdown' },
  { key: 'module', label: 'Module' },
  { key: 'month', label: 'Month' },
  { key: 'lgaId', label: 'LGA ID' },
  { key: 'lgaName', label: 'LGA' },
  { key: 'total', label: 'Total (NGN)' },
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

@ApiTags('ministry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MINISTRY_VIEWER, UserRole.STATE_ADMIN, UserRole.SUPER_ADMIN)
@Controller('ministry')
export class MinistryController {
  constructor(
    private readonly ministryService: MinistryService,
    private readonly csvExportService: CsvExportService,
    private readonly ministryPdfService: MinistryPdfService,
  ) {}

  @Get('visitor-entries')
  @ApiOperation({ summary: 'Visitor entries grouped by LGA + month, secondary split by visitor role' })
  getVisitorEntries(@Query() query: MinistryQueryDto) {
    return this.ministryService.getVisitorEntriesByLgaAndMonth(query.from, query.to, query.lgaId);
  }

  @Get('purpose-breakdown')
  @ApiOperation({ summary: 'Purpose-of-visit breakdown grouped by month' })
  getPurposeBreakdown(@Query() query: MinistryQueryDto) {
    return this.ministryService.getPurposeBreakdown(query.from, query.to, query.lgaId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue to government grouped by module and month, with an LGA sub-breakdown for Stays/Marketplace/Tour' })
  getRevenue(@Query() query: MinistryQueryDto) {
    return this.ministryService.getRevenueToGovernment(query.from, query.to);
  }

  @Get('visitor-entries/export')
  @ApiOperation({ summary: 'Export visitor entries as CSV or a branded PDF, respecting the active from/to/lgaId filter' })
  async exportVisitorEntries(@Query() query: MinistryQueryDto, @Res() res: Response) {
    const rows = await this.ministryService.getVisitorEntriesByLgaAndMonth(query.from, query.to, query.lgaId);

    const flatRows = rows as unknown as Record<string, unknown>[];

    if (query.format === 'pdf') {
      const buffer = await this.ministryPdfService.renderPdf({
        title: 'Visitor Entries',
        sections: [{ columns: VISITOR_ENTRIES_COLUMNS, rows: flatRows }],
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="visitor-entries.pdf"');
      return res.send(buffer);
    }

    const csv = await this.csvExportService.toCsv(
      flatRows,
      VISITOR_ENTRIES_COLUMNS.map((c) => c.key),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="visitor-entries.csv"');
    return res.send(csv);
  }

  @Get('purpose-breakdown/export')
  @ApiOperation({ summary: 'Export purpose-of-visit breakdown as CSV or a branded PDF, respecting the active from/to/lgaId filter' })
  async exportPurposeBreakdown(@Query() query: MinistryQueryDto, @Res() res: Response) {
    const rows = await this.ministryService.getPurposeBreakdown(query.from, query.to, query.lgaId);

    const flatRows = rows as unknown as Record<string, unknown>[];

    if (query.format === 'pdf') {
      const buffer = await this.ministryPdfService.renderPdf({
        title: 'Purpose of Visit Breakdown',
        sections: [{ columns: PURPOSE_BREAKDOWN_COLUMNS, rows: flatRows }],
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="purpose-breakdown.pdf"');
      return res.send(buffer);
    }

    const csv = await this.csvExportService.toCsv(
      flatRows,
      PURPOSE_BREAKDOWN_COLUMNS.map((c) => c.key),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="purpose-breakdown.csv"');
    return res.send(csv);
  }

  @Get('revenue/export')
  @ApiOperation({ summary: 'Export revenue to government (all 3 dimensions — byModule/byMonth/byModuleLga) as CSV or a branded PDF' })
  async exportRevenue(@Query() query: MinistryQueryDto, @Res() res: Response) {
    const { byModule, byMonth, byModuleLga } = await this.ministryService.getRevenueToGovernment(query.from, query.to);

    if (query.format === 'pdf') {
      const buffer = await this.ministryPdfService.renderPdf({
        title: 'Revenue to Government',
        sections: [
          { heading: 'By Module', columns: REVENUE_MODULE_COLUMNS, rows: byModule as unknown as Record<string, unknown>[] },
          { heading: 'By Month', columns: REVENUE_MONTH_COLUMNS, rows: byMonth as unknown as Record<string, unknown>[] },
          {
            heading: 'By LGA (Stays / Marketplace / Tour)',
            columns: REVENUE_LGA_COLUMNS,
            rows: byModuleLga as unknown as Record<string, unknown>[],
          },
        ],
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="revenue.pdf"');
      return res.send(buffer);
    }

    // D-14 "what you see is what you export": a single flat CSV whose rows
    // are the union of all 3 breakdown dimensions, each row tagged with
    // which breakdown it belongs to via the `breakdown` column, with
    // empty-string placeholders for columns that don't apply to that row's
    // breakdown kind.
    const rows = [
      ...byModule.map((r) => ({ breakdown: 'By Module', module: r.module, month: '', lgaId: '', lgaName: '', total: r.total })),
      ...byMonth.map((r) => ({ breakdown: 'By Month', module: '', month: r.month, lgaId: '', lgaName: '', total: r.total })),
      ...byModuleLga.map((r) => ({
        breakdown: 'By LGA',
        module: r.module,
        month: '',
        lgaId: r.lgaId ?? '',
        lgaName: r.lgaName ?? '',
        total: r.total,
      })),
    ];
    const csv = await this.csvExportService.toCsv(
      rows,
      REVENUE_CSV_COLUMNS.map((c) => c.key),
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue.csv"');
    return res.send(csv);
  }
}
