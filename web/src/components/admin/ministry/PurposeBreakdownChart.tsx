'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface PurposeRow {
  purpose: string;
  month: string;
  count: number;
}

interface AggregatedPurposeRow {
  purpose: string;
  count: number;
}

// The raw query returns multiple rows per purpose (one per month) — sum-
// collapse across months so each purpose renders as exactly one bar
// (dedup fix, checker warning 2). No role/month dimension is rendered here;
// purpose-of-visit intentionally stays single-dimension-on-screen.
function aggregateByPurpose(data: PurposeRow[]): AggregatedPurposeRow[] {
  const byPurpose = new Map<string, number>();
  for (const row of data) {
    byPurpose.set(row.purpose, (byPurpose.get(row.purpose) ?? 0) + row.count);
  }
  return Array.from(byPurpose, ([purpose, count]) => ({ purpose, count }));
}

interface CustomTooltipPayload {
  value: number;
  payload: AggregatedPurposeRow;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: CustomTooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-jungle border border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-bold text-white mb-1">{entry.payload.purpose}</p>
      <p className="text-white/60">
        Count: <span className="text-white font-bold">{entry.payload.count}</span>
      </p>
    </div>
  );
}

/**
 * PurposeBreakdownChart — 14-08.
 *
 * Single-series bar chart of purpose-of-visit counts, deduplicated (summed
 * across months) so each purpose renders as exactly one bar. Non-financial
 * data — forest fill only, no gold.
 */
export function PurposeBreakdownChart({ data }: { data: PurposeRow[] }) {
  const chartData = aggregateByPurpose(data);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-white/30 text-sm">
        No entries for this selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="purpose"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="count" fill="rgba(26,107,60,0.85)" radius={[6, 6, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}
