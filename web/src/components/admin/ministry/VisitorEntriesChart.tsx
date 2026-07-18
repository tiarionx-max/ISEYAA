'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface VisitorEntryRow {
  lgaId: string | null;
  lgaName: string | null;
  month: string;
  userRole: string;
  count: number;
}

type RoleBucket = 'TOURIST' | 'CITIZEN' | 'OTHER';

interface AggregatedLgaRow {
  lgaName: string;
  TOURIST: number;
  CITIZEN: number;
  OTHER: number;
}

function bucketRole(role: string): RoleBucket {
  return role === 'TOURIST' || role === 'CITIZEN' ? role : 'OTHER';
}

// D-04: pre-aggregate the raw (lgaId, month, userRole) row set into one row
// per LGA with 3 role-bucket totals, summed across every month present in
// the current from/to-filtered result set — prevents duplicate/overlapping
// x-axis categories from the multi-row-per-LGA query result.
function aggregateByLgaAndRole(data: VisitorEntryRow[]): AggregatedLgaRow[] {
  const byLga = new Map<string, AggregatedLgaRow>();
  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    const entry = byLga.get(lgaName) ?? { lgaName, TOURIST: 0, CITIZEN: 0, OTHER: 0 };
    entry[bucketRole(row.userRole)] += row.count;
    byLga.set(lgaName, entry);
  }
  return Array.from(byLga.values());
}

interface CustomTooltipPayload {
  value: number;
  name: string;
  dataKey: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: CustomTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-jungle border border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-white/60">
          {entry.dataKey}: <span className="text-white font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * VisitorEntriesChart — 14-08.
 *
 * Stacked bar chart per LGA, segmented by User.role bucket (D-04's
 * TOURIST/CITIZEN/OTHER secondary breakdown). Non-financial data — forest
 * family only, opacity-differentiated per role bucket, no gold.
 */
export function VisitorEntriesChart({ data }: { data: VisitorEntryRow[] }) {
  const chartData = aggregateByLgaAndRole(data);

  if (chartData.length === 0 || chartData.every((d) => d.TOURIST + d.CITIZEN + d.OTHER === 0)) {
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
          dataKey="lgaName"
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
        <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }} />
        <Bar dataKey="TOURIST" stackId="role" fill="rgba(26,107,60,0.85)" radius={[0, 0, 0, 0]} maxBarSize={56} />
        <Bar dataKey="CITIZEN" stackId="role" fill="rgba(26,107,60,0.55)" maxBarSize={56} />
        <Bar dataKey="OTHER" stackId="role" fill="rgba(26,107,60,0.3)" radius={[6, 6, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}
