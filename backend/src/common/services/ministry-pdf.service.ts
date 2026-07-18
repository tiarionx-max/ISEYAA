import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import PDFDocument = require('pdfkit');

/**
 * 14-07 — MinistryPdfService.
 *
 * Section-aware tabular PDF renderer for the Ministry dashboard's 6 export
 * routes (MIN-06). Reuses `ItineraryPdfService`'s branded shell verbatim
 * (Forest Green `#1A6B3C` headings, Gold `#C8962A` divider, buffer-collection
 * `Promise` wrapper, footer text) but replaces the narrative single-booking
 * body-rendering loop with a hand-rolled tabular renderer that can print
 * MULTIPLE sequential headed tables in one document — required because
 * revenue's export carries all three of `getRevenueToGovernment()`'s
 * dimensions (byModule/byMonth/byModuleLga), not just one (D-14).
 *
 * Unlike `ItineraryPdfService.generateAndUpload()`, this service never
 * touches S3 — Ministry exports are on-demand ad-hoc downloads of live
 * filtered data streamed directly in the HTTP response, not persisted
 * per-booking artifacts.
 */

export interface MinistryPdfColumn {
  key: string;
  label: string;
}

export interface MinistryPdfSection {
  heading?: string;
  columns: MinistryPdfColumn[];
  rows: Record<string, unknown>[];
}

export interface MinistryPdfInput {
  title: string;
  sections: MinistryPdfSection[];
}

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

@Injectable()
export class MinistryPdfService {
  private readonly logger = new Logger(MinistryPdfService.name);

  /**
   * Renders one or more sequential tabular sections into a single branded
   * PDF `Buffer`. A section with a `heading` prints that heading above its
   * table with a visual gap before the next section; a section without a
   * `heading` (visitor-entries / purpose-breakdown, single-table exports)
   * renders just the table — visually identical to a pre-revision
   * single-table document.
   */
  async renderPdf(input: MinistryPdfInput): Promise<Buffer> {
    try {
      return await this.render(input);
    } catch (err: any) {
      this.logger.error(`MinistryPdfService.renderPdf failed: ${err.message}`);
      throw new ServiceUnavailableException('Failed to generate report PDF');
    }
  }

  private render(input: MinistryPdfInput): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: input.title,
        Author: 'Iseyaa',
        Subject: input.title,
      },
    });

    const chunks: Buffer[] = [];
    const bufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
    });

    // ── Title block ──────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor('#1A6B3C').text(input.title, { align: 'left' });
    doc.moveDown(0.3);
    doc
      .moveTo(PAGE_LEFT, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .strokeColor('#C8962A')
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.8);

    // ── Sections ─────────────────────────────────────────────────────────────
    input.sections.forEach((section, idx) => {
      if (section.heading) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#1A6B3C').text(section.heading);
        doc.font('Helvetica');
        doc.moveDown(0.5);
      }

      this.renderTable(doc, section);

      if (idx < input.sections.length - 1) {
        doc.moveDown(1);
      }
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor('#888')
      .text('Powered by Iseyaa — Ogun State Digital Platform', { align: 'center' });

    doc.end();
    return bufferPromise;
  }

  /**
   * Hand-rolled table: header row from `section.columns[].label`, then each
   * row of `section.rows` at proportionate x-offsets (page width divided by
   * column count). Per RESEARCH.md, this is fine for 2-4 columns per
   * section — not a "don't hand-roll" violation (that guidance targets CSV
   * escaping, handled by `fast-csv` in `CsvExportService`).
   */
  private renderTable(doc: PDFKit.PDFDocument, section: MinistryPdfSection): void {
    if (section.rows.length === 0) {
      doc.fontSize(11).fillColor('#666').text('No data for this period.');
      return;
    }

    const colWidth = PAGE_WIDTH / section.columns.length;

    // Header row.
    const headerY = doc.y;
    doc.fontSize(10).fillColor('#1A6B3C');
    section.columns.forEach((col, i) => {
      doc.text(col.label.toUpperCase(), PAGE_LEFT + i * colWidth, headerY, { width: colWidth });
    });
    doc.moveDown(0.5);

    // Data rows.
    for (const row of section.rows) {
      const rowY = doc.y;
      doc.fontSize(9).fillColor('#1C2B2B');
      section.columns.forEach((col, i) => {
        doc.text(String(row[col.key] ?? ''), PAGE_LEFT + i * colWidth, rowY, { width: colWidth });
      });
      doc.moveDown(0.4);
    }
  }
}
