'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { BarChart3, TrendingUp } from 'lucide-react';
import { fetcher } from '@/lib/api';
import { RevenueBreakdownChart } from '@/components/admin/tours/RevenueBreakdownChart';

const ALLOWED_ROLES = ['LGA_ADMIN', 'STATE_ADMIN', 'SUPER_ADMIN'];

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function fmtNgn(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString('en-NG')}`;
}

interface VendorBreakdownEntry {
  vendorType: string;
  vendorId: string;
  vendorName?: string;
  totalCreditedNgn: number;
  transactionCount: number;
}

interface RevenueData {
  totalAmountNgn: number;
  packageName: string;
  vendorBreakdown: VendorBreakdownEntry[];
  platformCommissionNgn: number;
  bookingCount: number;
}

interface TourPackageOption {
  id: string;
  name: string;
}

/**
 * /admin/tours/revenue — 09-10
 * Revenue breakdown analytics for a selected tour package + date range.
 */
export default function TourRevenueAdminPage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const defaults = defaultDateRange();
  const [packageId, setPackageId] = useState('');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/admin');

  // Load all approved packages for the selector
  const { data: packagesData } = useQuery({
    queryKey: ['tour-packages-approved'],
    queryFn: () => fetcher('/tour-packages?status=APPROVED&limit=100'),
    enabled: status === 'authenticated',
  });
  const packages: TourPackageOption[] = packagesData?.items ?? packagesData ?? [];

  // Load revenue data — only when packageId is selected
  const {
    data: revenueData,
    isLoading: isRevLoading,
    isFetching: isRevFetching,
  } = useQuery<RevenueData>({
    queryKey: ['admin-tour-revenue', packageId, from, to],
    queryFn: () =>
      fetcher(`/admin/tours/revenue?packageId=${packageId}&from=${from}&to=${to}`),
    enabled: status === 'authenticated' && !!packageId,
  });

  const loading = isRevLoading || isRevFetching;

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-forest rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jungle text-white">
      <div className="pt-16 max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center">
            <TrendingUp size={18} className="text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Tour Revenue Breakdown</h1>
            <p className="text-white/35 text-xs">Vendor credits + platform commission</p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass rounded-2xl border border-white/6 p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                Package
              </label>
              <select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/25 appearance-none"
              >
                <option value="">Select a package…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
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
          </div>
        </div>

        {!packageId && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/15 flex items-center justify-center mb-3">
              <BarChart3 size={22} className="text-gold/40" />
            </div>
            <p className="text-white/35 font-semibold">Select a package to view revenue</p>
          </div>
        )}

        {packageId && (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                {
                  label: 'Total Credited',
                  value: loading ? '…' : fmtNgn(revenueData?.totalAmountNgn ?? 0),
                },
                {
                  label: 'Platform Commission',
                  value: loading ? '…' : fmtNgn(revenueData?.platformCommissionNgn ?? 0),
                },
                {
                  label: 'Confirmed Bookings',
                  value: loading ? '…' : String(revenueData?.bookingCount ?? 0),
                },
              ].map(({ label, value }) => (
                <div key={label} className="glass rounded-2xl border border-white/6 p-5">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                    {label}
                  </p>
                  <p className="text-2xl font-black text-white">{value}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="glass rounded-2xl border border-white/6 overflow-hidden mb-6">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/6">
                <BarChart3 size={16} className="text-forest-light" />
                <h2 className="font-bold text-white text-sm">
                  Vendor Revenue — {revenueData?.packageName ?? '…'}
                </h2>
              </div>
              <div className="px-4 py-5">
                {loading ? (
                  <div className="h-64 skeleton rounded-xl" />
                ) : (
                  <RevenueBreakdownChart
                    vendorBreakdown={revenueData?.vendorBreakdown ?? []}
                    platformCommissionNgn={revenueData?.platformCommissionNgn ?? 0}
                  />
                )}
              </div>
            </div>

            {/* Summary table */}
            {!loading && (revenueData?.vendorBreakdown?.length ?? 0) > 0 && (
              <div className="glass rounded-2xl border border-white/6 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/6">
                  <h2 className="font-bold text-white text-sm">Vendor Summary</h2>
                </div>
                <div className="grid grid-cols-[1fr_1fr_120px_100px] gap-4 px-5 py-3 border-b border-white/6 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                  <span>Vendor Type</span>
                  <span>Vendor ID</span>
                  <span>Total Credited</span>
                  <span>Transactions</span>
                </div>
                {revenueData?.vendorBreakdown.map((v) => (
                  <div
                    key={`${v.vendorType}-${v.vendorId}`}
                    className="grid grid-cols-[1fr_1fr_120px_100px] gap-4 items-center px-5 py-3 hover:bg-white/2 transition-colors border-b border-white/5 last:border-0"
                  >
                    <p className="text-white font-semibold text-sm">{v.vendorType}</p>
                    <p className="text-white/40 text-xs font-mono truncate">
                      {v.vendorName ?? v.vendorId}
                    </p>
                    <p className="text-gold font-bold text-sm">{fmtNgn(v.totalCreditedNgn)}</p>
                    <p className="text-white/55 text-sm">{v.transactionCount}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
