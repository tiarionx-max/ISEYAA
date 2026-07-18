import { Injectable } from '@nestjs/common';
import { writeToString } from 'fast-csv';

/**
 * RFC4180-correct CSV writer (MIN-05), backed by `fast-csv` — the first CSV
 * export anywhere in this codebase (RESEARCH.md's "Don't Hand-Roll" guidance).
 * Handles embedded commas/quotes/newlines correctly, unlike a naive
 * `.join(',')` (T-14-03 mitigation).
 */
@Injectable()
export class CsvExportService {
  async toCsv(rows: Record<string, unknown>[], headers: string[]): Promise<string> {
    // alwaysWriteHeaders: an empty `rows` array must still produce a header-only
    // CSV string (no crash, no blank output) — fast-csv otherwise only emits
    // headers alongside at least one data row.
    return writeToString(rows, { headers, alwaysWriteHeaders: true });
  }
}
