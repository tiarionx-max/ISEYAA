'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { toast } from 'sonner';
import { Users, Tag, TrendingUp, FileText, Table2 } from 'lucide-react';
import { fetcher, api } from '@/lib/api';
import { VisitorEntriesChart, VisitorEntryRow } from '@/components/admin/ministry/VisitorEntriesChart';
import { PurposeBreakdownChart, PurposeRow } from '@/components/admin/ministry/PurposeBreakdownChart';
import {
  RevenueChart,
  ModuleRevenueRow,
  MonthRevenueRow,
  ModuleLgaRevenueRow,
} from '@/components/admin/ministry/RevenueChart';

// Per UI-SPEC.md Copywriting Contract — deviates from the tours/revenue page's
// redirect('/admin') for disallowed roles: Ministry viewers have no legitimate
// reason to land on /admin.
const ALLOWED_ROLES = ['MINISTRY_VIEWER', 'STATE_ADMIN', 'SUPER_ADMIN'];

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

interface LgaOption {
  id: string;
  name: string;
}

interface RevenueData {
  byModule: ModuleRevenueRow[];
  byMonth: MonthRevenueRow[];
  byModuleLga: ModuleLgaRevenueRow[];
}

type ExportSlug = 'visitor-entries' | 'purpose-breakdown' | 'revenue';
type ExportFormat = 'csv' | 'pdf';

function EmptyPanelState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <p className="text-white font-bold text-sm mb-1.5">No entries for this period</p>
      <p className="text-white/35 text-xs max-w-xs">
        Try a wider date range or clear the LGA filter to see more results.
      </p>
    </div>
  );
}

function ErrorPanelState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <p className="text-white font-bold text-sm mb-1.5">Couldn&apos;t load dashboard data.</p>
      <p className="text-white/35 text-xs max-w-xs">Check your connection and try again.</p>
    </div>
  );
}

/**
 * /admin/ministry — 14-08.
 *
 * Role-gated Ministry Dashboard: 3 read-only report panels (visitor entries,
 * purpose-of-visit, revenue-to-government) with date-range + LGA filters and
 * 6 export buttons (CSV/PDF x 3 reports), matching 14-UI-SPEC.md exactly.
 */
export default function MinistryDashboardPage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const defaults = defaultDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [lgaId, setLgaId] = useState('');
  const [exporting, setExporting] = useState<Record<string, boolean>>({});

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/');

  const { data: lgasData } = useQuery({
    queryKey: ['lgas'],
    queryFn: () => fetcher('/lgas'),
    enabled: status === 'authenticated',
  });
  const lgas: LgaOption[] = lgasData ?? [];

  const lgaParam = lgaId ? `&lgaId=${lgaId}` : '';

  const {
    data: visitorEntries,
    isLoading: isVisitorLoading,
    isError: isVisitorError,
  } = useQuery<VisitorEntryRow[]>({
    queryKey: ['ministry-visitor-entries', from, to, lgaId],
    queryFn: () => fetcher(`/ministry/visitor-entries?from=${from}&to=${to}${lgaParam}`),
    enabled: status === 'authenticated',
  });

  const {
    data: purposeBreakdown,
    isLoading: isPurposeLoading,
    isError: isPurposeError,
  } = useQuery<PurposeRow[]>({
    queryKey: ['ministry-purpose-breakdown', from, to, lgaId],
    queryFn: () => fetcher(`/ministry/purpose-breakdown?from=${from}&to=${to}${lgaParam}`),
    enabled: status === 'authenticated',
  });

  const {
    data: revenue,
    isLoading: isRevenueLoading,
    isError: isRevenueError,
  } = useQuery<RevenueData>({
    queryKey: ['ministry-revenue', from, to],
    queryFn: () => fetcher(`/ministry/revenue?from=${from}&to=${to}`),
    enabled: status === 'authenticated',
  });

  async function handleExport(reportSlug: ExportSlug, format: ExportFormat) {
    const key = `${reportSlug}-${format}`;
    setExporting((prev) => ({ ...prev, [key]: true }));
    try {
      const params = reportSlug === 'revenue' ? `format=${format}&from=${from}&to=${to}` : `format=${format}&from=${from}&to=${to}${lgaParam}`;
      const response = await api.get(`/ministry/${reportSlug}/export?${params}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportSlug}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed — try again');
    } finally {
      setExporting((prev) => ({ ...prev, [key]: false }));
    }
  }

  // Each report panel renders its own literal "Export PDF"/"Export CSV"
  // button pair inline (rather than a single shared sub-component) so the
  // 3 panels' 6 export CTAs are independently visible/verifiable per panel.

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-forest rounded-full animate-spin" />
      </div>
    );
  }

  const revenueIsEmpty =
    !!revenue &&
    revenue.byModule.length === 0 &&
    revenue.byMonth.length === 0 &&
    revenue.byModuleLga.length === 0;

  return (
    <div className="min-h-screen bg-jungle text-white">
      <div className="pt-16 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-forest/20 border border-forest/30 flex items-center justify-center">
            <Users size={18} className="text-forest-light" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Ministry Dashboard</h1>
            <p className="text-white/35 text-xs">
              Visitor entries, purpose-of-visit, and revenue-to-government reporting
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass rounded-2xl border border-white/6 p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/25"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                LGA
              </label>
              <select
                value={lgaId}
                onChange={(e) => setLgaId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/25 appearance-none"
              >
                <option value="">All LGAs</option>
                {lgas.map((lga) => (
                  <option key={lga.id} value={lga.id}>
                    {lga.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Visitor Entries panel */}
        <div className="glass rounded-2xl border border-white/6 overflow-hidden mb-6">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-forest/20 border border-forest/30 flex items-center justify-center">
                <Users size={14} className="text-forest-light" />
              </div>
              <h2 className="font-bold text-white text-sm">Visitor Entries</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExport('visitor-entries', 'pdf')}
                disabled={!!exporting['visitor-entries-pdf']}
                className="btn-gold rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <FileText size={14} />
                {exporting['visitor-entries-pdf'] ? 'Preparing…' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={() => handleExport('visitor-entries', 'csv')}
                disabled={!!exporting['visitor-entries-csv']}
                className="btn-ghost rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <Table2 size={14} />
                {exporting['visitor-entries-csv'] ? 'Preparing…' : 'Export CSV'}
              </button>
            </div>
          </div>
          <div className="px-4 py-5">
            {isVisitorLoading ? (
              <div className="h-64 skeleton rounded-xl" />
            ) : isVisitorError ? (
              <ErrorPanelState />
            ) : (visitorEntries ?? []).length === 0 ? (
              <EmptyPanelState />
            ) : (
              <VisitorEntriesChart data={visitorEntries ?? []} />
            )}
          </div>
        </div>

        {/* Purpose of Visit panel */}
        <div className="glass rounded-2xl border border-white/6 overflow-hidden mb-6">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-forest/20 border border-forest/30 flex items-center justify-center">
                <Tag size={14} className="text-forest-light" />
              </div>
              <h2 className="font-bold text-white text-sm">Purpose of Visit</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExport('purpose-breakdown', 'pdf')}
                disabled={!!exporting['purpose-breakdown-pdf']}
                className="btn-gold rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <FileText size={14} />
                {exporting['purpose-breakdown-pdf'] ? 'Preparing…' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={() => handleExport('purpose-breakdown', 'csv')}
                disabled={!!exporting['purpose-breakdown-csv']}
                className="btn-ghost rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <Table2 size={14} />
                {exporting['purpose-breakdown-csv'] ? 'Preparing…' : 'Export CSV'}
              </button>
            </div>
          </div>
          <div className="px-4 py-5">
            {isPurposeLoading ? (
              <div className="h-64 skeleton rounded-xl" />
            ) : isPurposeError ? (
              <ErrorPanelState />
            ) : (purposeBreakdown ?? []).length === 0 ? (
              <EmptyPanelState />
            ) : (
              <PurposeBreakdownChart data={purposeBreakdown ?? []} />
            )}
          </div>
        </div>

        {/* Revenue to Government panel */}
        <div className="glass rounded-2xl border border-white/6 overflow-hidden mb-6">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/25 flex items-center justify-center">
                <TrendingUp size={14} className="text-gold" />
              </div>
              <h2 className="font-bold text-white text-sm">Revenue to Government</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExport('revenue', 'pdf')}
                disabled={!!exporting['revenue-pdf']}
                className="btn-gold rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <FileText size={14} />
                {exporting['revenue-pdf'] ? 'Preparing…' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={() => handleExport('revenue', 'csv')}
                disabled={!!exporting['revenue-csv']}
                className="btn-ghost rounded-xl px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <Table2 size={14} />
                {exporting['revenue-csv'] ? 'Preparing…' : 'Export CSV'}
              </button>
            </div>
          </div>
          <div className="px-4 py-5">
            {isRevenueLoading ? (
              <div className="h-64 skeleton rounded-xl" />
            ) : isRevenueError ? (
              <ErrorPanelState />
            ) : revenueIsEmpty ? (
              <EmptyPanelState />
            ) : (
              <RevenueChart
                byModule={revenue?.byModule ?? []}
                byMonth={revenue?.byMonth ?? []}
                byModuleLga={revenue?.byModuleLga ?? []}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
