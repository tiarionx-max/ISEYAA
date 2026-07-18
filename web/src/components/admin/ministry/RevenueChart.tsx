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
  Cell,
} from 'recharts';

export interface ModuleRevenueRow {
  module: string;
  total: number;
}

export interface MonthRevenueRow {
  month: string;
  total: number;
}

export interface ModuleLgaRevenueRow {
  module: string;
  lgaId: string | null;
  lgaName: string | null;
  total: number;
}

interface RevenueChartProps {
  byModule: ModuleRevenueRow[];
  byMonth: MonthRevenueRow[];
  byModuleLga: ModuleLgaRevenueRow[];
}

function fmtNgn(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(0)}K`;
  return `₦${value.toLocaleString('en-NG')}`;
}

interface AggregatedLgaModuleRow {
  lgaName: string;
  stays: number;
  marketplace: number;
  tour_booking: number;
}

// Group byModuleLga rows by lgaName so each LGA renders one grouped bar
// cluster, not raw overlapping rows — same reduce-to-map pattern as
// VisitorEntriesChart's aggregateByLgaAndRole().
function aggregateByLgaModule(data: ModuleLgaRevenueRow[]): AggregatedLgaModuleRow[] {
  const byLga = new Map<string, AggregatedLgaModuleRow>();
  for (const row of data) {
    const lgaName = row.lgaName ?? 'Unknown';
    const entry = byLga.get(lgaName) ?? { lgaName, stays: 0, marketplace: 0, tour_booking: 0 };
    if (row.module === 'stays' || row.module === 'marketplace' || row.module === 'tour_booking') {
      entry[row.module] += row.total;
    }
    byLga.set(lgaName, entry);
  }
  return Array.from(byLga.values());
}

interface ModuleTooltipPayload {
  value: number;
  payload: { module?: string; month?: string; total: number };
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: ModuleTooltipPayload[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-jungle border border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-white/60">
          Amount: <span className="text-gold font-bold">{fmtNgn(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function SubPanelEmptyState() {
  return (
    <div className="flex items-center justify-center h-40 text-white/30 text-sm">
      No entries for this selection
    </div>
  );
}

function SubPanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

/**
 * RevenueChart — 14-08.
 *
 * D-09: 3 sub-views in one panel — By Module, By Month trend, and By LGA
 * sub-breakdown (Stays/Marketplace/Tour) — all sourced from the same
 * GET /ministry/revenue response.
 *
 * Deviation from RevenueBreakdownChart.tsx's `isPlatform` cell-fill split:
 * every row here is already a Ministry-wallet-credited amount (the query
 * filters on `t.walletId = ministryWallet.id`), so `isPlatform` is
 * unconditionally true for the entire dataset — there is no "everything
 * else" forest-colored counterpart to render, unlike the tour-revenue
 * chart's vendor-vs-platform split. 100% gold fill throughout, opacity-
 * differentiated only where multiple series share an axis (the By LGA
 * grouped bars).
 */
export function RevenueChart({ byModule, byMonth, byModuleLga }: RevenueChartProps) {
  const lgaChartData = aggregateByLgaModule(byModuleLga);

  return (
    <div className="space-y-8">
      {/* By Module */}
      <div>
        <SubPanelHeading>By Module</SubPanelHeading>
        {byModule.length === 0 ? (
          <SubPanelEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byModule} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="module"
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
              <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {byModule.map((entry, index) => (
                  <Cell key={`module-cell-${index}`} fill="rgba(200,150,42,0.85)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By Month */}
      <div>
        <SubPanelHeading>By Month</SubPanelHeading>
        {byMonth.length === 0 ? (
          <SubPanelEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byMonth} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="month"
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
              <Bar dataKey="total" fill="rgba(200,150,42,0.85)" radius={[6, 6, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* By LGA (Stays / Marketplace / Tour) */}
      <div>
        <SubPanelHeading>By LGA (Stays / Marketplace / Tour)</SubPanelHeading>
        {lgaChartData.length === 0 ? (
          <SubPanelEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={lgaChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="lgaName"
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
              <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }} />
              <Bar dataKey="stays" fill="rgba(200,150,42,0.85)" maxBarSize={40} />
              <Bar dataKey="marketplace" fill="rgba(200,150,42,0.55)" maxBarSize={40} />
              <Bar dataKey="tour_booking" fill="rgba(200,150,42,0.3)" maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
