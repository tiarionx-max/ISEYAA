'use client';

import { OGUN_LGA_NAMES } from '@iseyaa/shared';

// Identical field-for-field to VisitorEntriesChart.tsx's VisitorEntryRow —
// re-declared locally (not re-imported) to avoid a cross-component dependency.
export interface VisitorEntryRow {
  lgaId: string | null;
  lgaName: string | null;
  month: string;
  userRole: string;
  count: number;
}

export interface LgaMonthGrid {
  months: string[];
  grid: Map<string, Map<string, number>>;
}

// RESEARCH.md Pattern 5 / Pitfall 5 — group by (lgaName, month), summing
// count across every userRole for that exact pair. Must NOT collapse the
// month axis the way VisitorEntriesChart.tsx's aggregateByLgaAndRole() does.
export function buildGrid(data: VisitorEntryRow[]): LgaMonthGrid {
  const months = Array.from(new Set(data.map((r) => r.month))).sort();
  const grid = new Map<string, Map<string, number>>();

  // D-07: seed all 20 LGAs as rows, always shown even at zero count.
  for (const lgaName of OGUN_LGA_NAMES) {
    grid.set(lgaName, new Map(months.map((m) => [m, 0])));
  }

  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    if (!grid.has(lgaName)) {
      grid.set(lgaName, new Map(months.map((m) => [m, 0])));
    }
    const monthMap = grid.get(lgaName)!;
    monthMap.set(row.month, (monthMap.get(row.month) ?? 0) + row.count);
  }

  return { months, grid };
}

// UI-SPEC.md Color table — 5 fixed opacity tiers (forest family only, no
// gold: non-financial data), scoped to the current filtered result set's max.
function cellBackground(count: number, max: number): string | undefined {
  if (count === 0) return undefined;
  const ratio = max > 0 ? count / max : 0;
  if (ratio <= 0.25) return 'rgba(26,107,60,0.25)';
  if (ratio <= 0.5) return 'rgba(26,107,60,0.45)';
  if (ratio <= 0.75) return 'rgba(26,107,60,0.65)';
  return 'rgba(26,107,60,0.9)';
}

const LEGEND_SWATCHES: { label: string; background: string | undefined; className: string }[] = [
  { label: 'None', background: undefined, className: 'bg-white/5' },
  { label: 'Low', background: 'rgba(26,107,60,0.25)', className: '' },
  { label: 'Medium', background: 'rgba(26,107,60,0.45)', className: '' },
  { label: 'High', background: 'rgba(26,107,60,0.65)', className: '' },
  { label: 'Peak', background: 'rgba(26,107,60,0.9)', className: '' },
];

/**
 * LgaMonthHeatmap — 22-04 (MIN-09).
 *
 * LGA x month visitor-density heatmap, aggregated client-side from the same
 * /ministry/visitor-entries response VisitorEntriesChart already consumes —
 * zero new network request (D-05), zero new mapping/charting dependency
 * (D-06) — a plain CSS-grid, not a recharts chart type.
 */
export function LgaMonthHeatmap({ data }: { data: VisitorEntryRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <p className="text-white font-bold text-sm mb-1.5">No entries for this period</p>
        <p className="text-white/35 text-xs max-w-xs">
          Try a wider date range or clear the LGA filter to see more results.
        </p>
      </div>
    );
  }

  const { months, grid } = buildGrid(data);
  let max = 0;
  Array.from(grid.values()).forEach((monthMap) => {
    Array.from(monthMap.values()).forEach((count) => {
      if (count > max) max = count;
    });
  });

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-10 bg-jungle text-xs text-white/60 w-[120px] text-left" />
                {months.map((month) => (
                  <th
                    key={month}
                    className="sticky top-0 z-[5] bg-jungle text-[10px] uppercase tracking-widest text-white/35 font-normal px-1"
                  >
                    {month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OGUN_LGA_NAMES.map((lgaName) => {
                const monthMap = grid.get(lgaName) ?? new Map<string, number>();
                return (
                  <tr key={lgaName}>
                    <th
                      scope="row"
                      className="sticky left-0 z-[5] bg-jungle text-xs text-white/60 truncate w-[120px] max-w-[120px] text-left font-normal px-1"
                    >
                      {lgaName}
                    </th>
                    {months.map((month) => {
                      const count = monthMap.get(month) ?? 0;
                      const background = cellBackground(count, max);
                      return (
                        <td key={month} className="p-0">
                          <div
                            title={`${lgaName} — ${month}: ${count} visitor${count === 1 ? '' : 's'}`}
                            className={`h-7 w-7 rounded-sm ${count === 0 ? 'bg-white/5' : ''}`}
                            style={background ? { backgroundColor: background } : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 flex-wrap">
        {LEGEND_SWATCHES.map((swatch) => (
          <div key={swatch.label} className="flex items-center gap-1.5">
            <div
              className={`h-3 w-3 rounded-sm ${swatch.className}`}
              style={swatch.background ? { backgroundColor: swatch.background } : undefined}
            />
            <span className="text-[10px] uppercase tracking-widest text-white/30">{swatch.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
