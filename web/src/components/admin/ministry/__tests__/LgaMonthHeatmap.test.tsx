import { render, screen } from '@testing-library/react';
import { buildGrid, LgaMonthHeatmap, VisitorEntryRow } from '../LgaMonthHeatmap';

describe('buildGrid', () => {
  it('sums count across userRole for the same (lgaName, month) pair, keeping month distinct', () => {
    const data: VisitorEntryRow[] = [
      { lgaId: 'x', lgaName: 'Ifo', month: '2026-01', userRole: 'TOURIST', count: 5 },
      { lgaId: 'x', lgaName: 'Ifo', month: '2026-01', userRole: 'CITIZEN', count: 3 },
    ];

    const { grid } = buildGrid(data);

    expect(grid.get('Ifo')?.get('2026-01')).toBe(8);
  });

  it('returns sorted distinct months and seeds all 20 LGAs (including zero-count ones) for every month', () => {
    const data: VisitorEntryRow[] = [
      { lgaId: 'x', lgaName: 'Ifo', month: '2026-02', userRole: 'TOURIST', count: 5 },
      { lgaId: 'x', lgaName: 'Ifo', month: '2026-01', userRole: 'TOURIST', count: 2 },
    ];

    const { months, grid } = buildGrid(data);

    expect(months).toEqual(['2026-01', '2026-02']);
    expect(grid.size).toBeGreaterThanOrEqual(20);

    // An LGA with zero rows in data is still present, initialized to 0 for every month.
    expect(grid.get('Shagamu')?.get('2026-01')).toBe(0);
    expect(grid.get('Shagamu')?.get('2026-02')).toBe(0);
  });

  it('buckets a row with lgaName: null under "Unknown" without throwing', () => {
    const data: VisitorEntryRow[] = [
      { lgaId: null, lgaName: null, month: '2026-01', userRole: 'TOURIST', count: 4 },
    ];

    expect(() => buildGrid(data)).not.toThrow();

    const { grid } = buildGrid(data);
    expect(grid.get('Unknown')?.get('2026-01')).toBe(4);
  });
});

describe('LgaMonthHeatmap', () => {
  it('shows the empty-state text and no grid when data is empty', () => {
    render(<LgaMonthHeatmap data={[]} />);

    expect(screen.getByText('No entries for this period')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders exactly 20 LGA row labels regardless of how many LGAs appear in the data', () => {
    const sampleRows: VisitorEntryRow[] = [
      { lgaId: 'a', lgaName: 'Ifo', month: '2026-01', userRole: 'TOURIST', count: 5 },
      { lgaId: 'b', lgaName: 'Shagamu', month: '2026-02', userRole: 'CITIZEN', count: 2 },
    ];

    render(<LgaMonthHeatmap data={sampleRows} />);

    expect(screen.getAllByRole('rowheader')).toHaveLength(20);
  });
});
