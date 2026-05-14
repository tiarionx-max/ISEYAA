'use client';

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface DataPoint { month: string; revenue: number; }

function fmtNgn(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-white/10 px-4 py-3 shadow-card">
      <p className="text-white/50 text-xs mb-1">{label}</p>
      <p className="text-gold font-black text-base">{fmtNgn(payload[0].value)}</p>
    </div>
  );
};

export function RevenueChart({ data }: { data: DataPoint[] }) {
  const hasData = data?.length > 0 && data.some((d) => d.revenue > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-forest/15 border border-forest/20 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(26,107,60,0.5)" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <p className="text-white/30 text-sm font-medium">Revenue will appear here</p>
        <p className="text-white/15 text-xs mt-1">Once orders are processed</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1A6B3C" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#1A6B3C" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="month"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'var(--font-jakarta)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtNgn}
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'var(--font-jakarta)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(26,107,60,0.3)', strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#1A6B3C"
          strokeWidth={2}
          fill="url(#revenueGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#22913f', stroke: '#0c1a0f', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
