'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface VendorBreakdownEntry {
  vendorType: string;
  vendorName?: string;
  totalCreditedNgn: number;
  transactionCount: number;
}

interface RevenueBreakdownChartProps {
  vendorBreakdown: VendorBreakdownEntry[];
  platformCommissionNgn: number;
}

function fmtNgn(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`;
  return `₦${value.toLocaleString('en-NG')}`;
}

interface TooltipPayload {
  value: number;
  name: string;
  payload: {
    label: string;
    totalCreditedNgn: number;
    transactionCount: number;
  };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="bg-jungle border border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-bold text-white mb-1">{entry.payload.label}</p>
      <p className="text-white/60">
        Amount:{' '}
        <span className="text-gold font-bold">
          {`₦${entry.payload.totalCreditedNgn.toLocaleString('en-NG')}`}
        </span>
      </p>
      <p className="text-white/60">
        Transactions:{' '}
        <span className="text-white font-bold">{entry.payload.transactionCount}</span>
      </p>
    </div>
  );
}

/**
 * RevenueBreakdownChart — 09-10.
 *
 * Renders a BarChart showing total NGN credited per vendor (plus the platform
 * commission as an additional bar). Uses Tailwind CSS variables for colours.
 */
export function RevenueBreakdownChart({
  vendorBreakdown,
  platformCommissionNgn,
}: RevenueBreakdownChartProps) {
  const data = [
    ...vendorBreakdown.map((v) => ({
      label: v.vendorName ?? v.vendorType,
      totalCreditedNgn: v.totalCreditedNgn,
      transactionCount: v.transactionCount,
      isPlatform: false,
    })),
    {
      label: 'Platform',
      totalCreditedNgn: platformCommissionNgn,
      transactionCount: 0,
      isPlatform: true,
    },
  ];

  if (data.length === 0 || data.every((d) => d.totalCreditedNgn === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-white/30 text-sm">
        No revenue data for this selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtNgn}
          tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="totalCreditedNgn" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isPlatform ? 'rgba(200,150,42,0.85)' : 'rgba(26,107,60,0.85)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
