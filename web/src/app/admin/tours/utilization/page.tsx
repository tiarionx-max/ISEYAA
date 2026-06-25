'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Grid3x3 } from 'lucide-react';
import { fetcher } from '@/lib/api';
import { GroupUtilizationHeatmap } from '@/components/admin/tours/GroupUtilizationHeatmap';

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

interface UtilizationBucket {
  date: string;
  groupSizeBucket: string;
  bookingCount: number;
  totalPassengers: number;
}

interface UtilizationData {
  buckets: UtilizationBucket[];
}

/**
 * /admin/tours/utilization — 09-10
 * Group-size heatmap showing booking patterns across date + passenger-count buckets.
 */
export default function TourUtilizationAdminPage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const defaults = defaultDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && !ALLOWED_ROLES.includes(role)) redirect('/admin');

  const {
    data: utilizationData,
    isLoading,
    isFetching,
  } = useQuery<UtilizationData>({
    queryKey: ['admin-tour-utilization', from, to],
    queryFn: () => fetcher(`/admin/tours/utilization?from=${from}&to=${to}`),
    enabled: status === 'authenticated',
  });

  const loading = isLoading || isFetching;
  const totalBookings = (utilizationData?.buckets ?? []).reduce(
    (sum, b) => sum + b.bookingCount,
    0,
  );
  const totalPassengers = (utilizationData?.buckets ?? []).reduce(
    (sum, b) => sum + b.totalPassengers,
    0,
  );

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
          <div className="w-10 h-10 rounded-xl bg-forest/20 border border-forest/30 flex items-center justify-center">
            <Grid3x3 size={18} className="text-forest-light" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Group Utilization Heatmap</h1>
            <p className="text-white/35 text-xs">Booking patterns by group size and date</p>
          </div>
        </div>

        {/* Date filters */}
        <div className="glass rounded-2xl border border-white/6 p-5 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm">
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

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="glass rounded-2xl border border-white/6 p-5">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
              Confirmed Bookings
            </p>
            <p className="text-2xl font-black text-white">
              {loading ? '…' : totalBookings.toLocaleString()}
            </p>
          </div>
          <div className="glass rounded-2xl border border-white/6 p-5">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
              Total Passengers
            </p>
            <p className="text-2xl font-black text-white">
              {loading ? '…' : totalPassengers.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="glass rounded-2xl border border-white/6 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/6">
            <Grid3x3 size={16} className="text-forest-light" />
            <h2 className="font-bold text-white text-sm">Utilization Heatmap</h2>
            <span className="text-white/25 text-xs ml-auto">
              {from} — {to}
            </span>
          </div>
          <div className="px-5 py-6">
            {loading ? (
              <div className="h-56 skeleton rounded-xl" />
            ) : (utilizationData?.buckets?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Grid3x3 size={28} className="text-white/15 mb-3" />
                <p className="text-white/30 text-sm">No confirmed bookings in this period</p>
              </div>
            ) : (
              <GroupUtilizationHeatmap
                buckets={utilizationData?.buckets ?? []}
                from={from}
                to={to}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
