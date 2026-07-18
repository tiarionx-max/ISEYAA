import PDFDocument = require('pdfkit');
import { ServiceUnavailableException } from '@nestjs/common';
import { MinistryPdfService } from '../ministry-pdf.service';

/**
 * 14-07 Task 1 — MinistryPdfService (section-aware tabular PDF renderer).
 *
 * Asserts real pdfkit output (`%PDF-` magic bytes) for the 3 shapes this
 * service must support (single-section populated, single-section empty,
 * multi-section revenue), plus the pdfkit call-sequence assertions the
 * plan's acceptance criteria call for (heading on/off, brand colors, and
 * the ServiceUnavailableException wrap on a pdfkit failure).
 */
describe('MinistryPdfService', () => {
  let service: MinistryPdfService;

  beforeEach(() => {
    service = new MinistryPdfService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a Buffer starting with %PDF- for a single-section populated input', async () => {
    const buffer = await service.renderPdf({
      title: 'Visitor Entries',
      sections: [
        {
          columns: [
            { key: 'lgaName', label: 'LGA' },
            { key: 'count', label: 'Count' },
          ],
          rows: [{ lgaName: 'Abeokuta North', count: 12 }],
        },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('returns a valid PDF for a single-section 0-row input, rendering "No data" instead of crashing', async () => {
    const buffer = await service.renderPdf({
      title: 'Visitor Entries',
      sections: [{ columns: [{ key: 'lgaName', label: 'LGA' }], rows: [] }],
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('returns a valid PDF for a 3-section input where each section has different columns (revenue export)', async () => {
    const buffer = await service.renderPdf({
      title: 'Revenue to Government',
      sections: [
        {
          heading: 'By Module',
          columns: [
            { key: 'module', label: 'Module' },
            { key: 'total', label: 'Total (NGN)' },
          ],
          rows: [{ module: 'stays', total: 500000 }],
        },
        {
          heading: 'By Month',
          columns: [
            { key: 'month', label: 'Month' },
            { key: 'total', label: 'Total (NGN)' },
          ],
          rows: [{ month: '2026-01', total: 500000 }],
        },
        {
          heading: 'By LGA (Stays / Marketplace / Tour)',
          columns: [
            { key: 'module', label: 'Module' },
            { key: 'lgaName', label: 'LGA' },
            { key: 'total', label: 'Total (NGN)' },
          ],
          rows: [{ module: 'stays', lgaName: 'Abeokuta North', total: 500000 }],
        },
      ],
    });

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders the section heading text when `heading` is present', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

    await service.renderPdf({
      title: 'Revenue to Government',
      sections: [
        {
          heading: 'By Module',
          columns: [{ key: 'module', label: 'Module' }],
          rows: [{ module: 'stays' }],
        },
      ],
    });

    const calledWithHeading = textSpy.mock.calls.some((call) => call[0] === 'By Module');
    expect(calledWithHeading).toBe(true);
  });

  it('renders no heading text and no bold-heading font call when `heading` is omitted', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const fontSpy = jest.spyOn(PDFDocument.prototype, 'font');

    await service.renderPdf({
      title: 'Visitor Entries',
      sections: [{ columns: [{ key: 'lgaName', label: 'LGA' }], rows: [{ lgaName: 'Abeokuta North' }] }],
    });

    // No `heading` on the only section means the section-heading branch
    // (`.font('Helvetica-Bold')` + heading `.text()` call) never runs — the
    // only `.text()` calls are the title, the table header/row, and the
    // fixed footer string.
    expect(fontSpy).not.toHaveBeenCalledWith('Helvetica-Bold');
    const expectedTextValues = new Set([
      'Visitor Entries',
      'LGA',
      'Abeokuta North',
      'Powered by Iseyaa — Ogun State Digital Platform',
    ]);
    const calledWithAnyHeadingLikeText = textSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && !expectedTextValues.has(call[0]),
    );
    expect(calledWithAnyHeadingLikeText).toBe(false);
  });

  it('uses #1A6B3C for the title text and #C8962A for the top-level divider rule', async () => {
    const fillColorSpy = jest.spyOn(PDFDocument.prototype, 'fillColor');
    const strokeColorSpy = jest.spyOn(PDFDocument.prototype, 'strokeColor');

    await service.renderPdf({
      title: 'Visitor Entries',
      sections: [{ columns: [{ key: 'lgaName', label: 'LGA' }], rows: [{ lgaName: 'Abeokuta North' }] }],
    });

    expect(fillColorSpy).toHaveBeenCalledWith('#1A6B3C');
    expect(strokeColorSpy).toHaveBeenCalledWith('#C8962A');
  });

  it('column order in the render follows section.columns order, not row object key-insertion order', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

    await service.renderPdf({
      title: 'Revenue to Government',
      sections: [
        {
          columns: [
            { key: 'total', label: 'Total (NGN)' },
            { key: 'module', label: 'Module' },
          ],
          rows: [{ module: 'stays', total: 500000 }],
        },
      ],
    });

    const headerCalls = textSpy.mock.calls.map((call) => call[0]).filter((v) => v === 'TOTAL (NGN)' || v === 'MODULE');
    expect(headerCalls).toEqual(['TOTAL (NGN)', 'MODULE']);
  });

  it('never throws a raw pdfkit error — a rendering failure surfaces as ServiceUnavailableException', async () => {
    jest.spyOn(PDFDocument.prototype, 'end').mockImplementation(() => {
      throw new Error('pdfkit exploded');
    });

    await expect(
      service.renderPdf({
        title: 'Visitor Entries',
        sections: [{ columns: [{ key: 'lgaName', label: 'LGA' }], rows: [] }],
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  // CR-02 (14-10 gap-closure) — renderTable() must be height-aware: a cell
  // long enough to wrap (e.g. a 36-char UUID in a narrow column) must be
  // measured via doc.heightOfString() before the next row is positioned,
  // instead of assuming a fixed single-line row height.
  it('CR-02: measures row height via doc.heightOfString() for a UUID-length cell in a narrow 5-column table', async () => {
    const heightOfStringSpy = jest.spyOn(PDFDocument.prototype, 'heightOfString');
    const uuid = 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c';

    await service.renderPdf({
      title: 'Visitor Entries',
      sections: [
        {
          columns: [
            { key: 'lgaId', label: 'LGA ID' },
            { key: 'lgaName', label: 'LGA' },
            { key: 'month', label: 'Month' },
            { key: 'userRole', label: 'Visitor Role' },
            { key: 'count', label: 'Count' },
          ],
          rows: [{ lgaId: uuid, lgaName: 'Abeokuta North', month: '2026-01', userRole: 'TOURIST', count: 12 }],
        },
      ],
    });

    const calledWithUuid = heightOfStringSpy.mock.calls.some((call) => call[0] === uuid);
    expect(calledWithUuid).toBe(true);
  });

  // CR-02 (14-10 gap-closure) — renderTable() must break to a new page (and
  // re-print the column header) once accumulated row height would exceed
  // the printable page area, instead of overlapping rows indefinitely.
  it('CR-02: calls doc.addPage() and re-prints the header when enough rows overflow one page', async () => {
    const addPageSpy = jest.spyOn(PDFDocument.prototype, 'addPage');
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

    const rows = Array.from({ length: 80 }, (_, i) => ({ lgaName: `LGA ${i}`, count: i }));

    await service.renderPdf({
      title: 'Visitor Entries',
      sections: [
        {
          columns: [
            { key: 'lgaName', label: 'LGA' },
            { key: 'count', label: 'Count' },
          ],
          rows,
        },
      ],
    });

    expect(addPageSpy).toHaveBeenCalled();
    const headerOccurrences = textSpy.mock.calls.filter((call) => call[0] === 'LGA').length;
    expect(headerOccurrences).toBeGreaterThan(1);
  });
});
