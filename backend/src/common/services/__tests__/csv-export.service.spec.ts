import { parseString } from 'fast-csv';
import { CsvExportService } from '../csv-export.service';

/**
 * 14-02 Task 2 — CsvExportService (MIN-05's RFC4180-correct CSV writer,
 * fast-csv-backed per RESEARCH.md's "Don't Hand-Roll" guidance).
 */

function parseCsv(csv: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    parseString(csv, { headers: true })
      .on('error', reject)
      .on('data', (row: Record<string, string>) => rows.push(row))
      .on('end', () => resolve(rows));
  });
}

describe('CsvExportService', () => {
  let service: CsvExportService;

  beforeEach(() => {
    service = new CsvExportService();
  });

  it('round-trips a field value with an embedded comma and double-quote', async () => {
    const rows = [{ lga: 'Abeokuta, "North"', count: 42 }];
    const csv = await service.toCsv(rows, ['lga', 'count']);

    const parsed = await parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].lga).toBe('Abeokuta, "North"');
    expect(parsed[0].count).toBe('42');
  });

  it('round-trips a field value with an embedded newline', async () => {
    const rows = [{ note: 'line one\nline two', count: 1 }];
    const csv = await service.toCsv(rows, ['note', 'count']);

    const parsed = await parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].note).toBe('line one\nline two');
  });

  it('an empty rows array still returns a valid CSV string with only the header row', async () => {
    const csv = await service.toCsv([], ['lga', 'count']);

    expect(csv.trim()).toBe('lga,count');

    const parsed = await parseCsv(csv);
    expect(parsed).toHaveLength(0);
  });

  it('column order in the output matches the headers array order, not object-key order', async () => {
    const rows = [{ count: 42, lga: 'Abeokuta' }];
    const csv = await service.toCsv(rows, ['lga', 'count']);

    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe('lga,count');
  });
});
