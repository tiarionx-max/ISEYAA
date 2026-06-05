'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { RevenueChart } from '@/components/ui/RevenueChart';
import { fetcher, api } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import {
  Users, TrendingUp, Store, Shield, BarChart3, Activity,
  CheckCircle, XCircle, Clock, Wallet, Calendar,
  AlertTriangle, Building2, ArrowUpRight, Settings,
  ChevronRight, RefreshCw, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

/* ── helpers ────────────────────────────────────────────────────────────── */
function fmtNgn(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

function formatMonth(m: string) {
  if (!m) return m;
  const [y, mo] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(mo, 10) - 1]} ${y?.slice(2)}`;
}

/* ── Metric card ────────────────────────────────────────────────────────── */
function MetricCard({
  label, value, sub, icon: Icon,
  gradient, glow, trend, delay = 0,
}: {
  label: string; value: string; sub?: string; icon: any;
  gradient: string; glow: string; trend?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className="relative rounded-2xl p-5 overflow-hidden border border-white/6"
      style={{ background: gradient, boxShadow: `0 8px 36px ${glow}` }}
    >
      <div className="absolute inset-0 bg-adire opacity-20" />
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
        style={{ background: `radial-gradient(circle, ${glow.replace('0.', '0.4').replace(')', ')')}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
            <Icon size={16} className="text-white/75" />
          </div>
          {trend && (
            <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ArrowUpRight size={9} /> {trend}
            </span>
          )}
        </div>
        <p className="text-white/45 text-[11px] font-semibold uppercase tracking-wider mb-1">{label}</p>
        <p className="text-3xl font-black text-white leading-none">{value}</p>
        {sub && <p className="text-white/35 text-[11px] mt-1.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

/* ── Vendor row ─────────────────────────────────────────────────────────── */
function VendorRow({ vendor, onApprove, onReject, loading }: {
  vendor: any; onApprove: () => void; onReject: () => void; loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      className="flex items-center gap-4 px-5 py-4 hover:bg-white/2 transition-colors border-b border-white/5 last:border-0"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-900/25 border border-amber-700/20 flex items-center justify-center shrink-0">
        <Building2 size={16} className="text-amber-400/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm truncate">{vendor.businessName}</p>
        <p className="text-white/30 text-[11px] mt-0.5 flex items-center gap-1.5">
          <MapPin size={9} className="text-white/20" />
          {vendor.slug}
          <span className="text-white/15">·</span>
          <Clock size={9} className="text-white/20" />
          {new Date(vendor.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onApprove} disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 btn-primary text-white text-xs font-bold rounded-xl disabled:opacity-50"
        >
          <CheckCircle size={12} /> Approve
        </button>
        <button
          onClick={onReject} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/25 hover:bg-red-900/40 border border-red-800/25 text-red-400 text-xs font-bold rounded-xl disabled:opacity-50 transition-colors"
        >
          <XCircle size={12} /> Reject
        </button>
      </div>
    </motion.div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const { data: session, status } = useSession();
  const role = (session as any)?.user?.role;
  const [refreshKey, setRefreshKey] = useState(0);

  if (status === 'unauthenticated') redirect('/login');
  if (status !== 'loading' && role !== 'SUPER_ADMIN' && role !== 'LGA_ADMIN') redirect('/');

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ['admin-dashboard', refreshKey],
    queryFn: () => fetcher('/admin/dashboard'),
  });

  const { data: revenue } = useQuery({
    queryKey: ['admin-revenue'],
    queryFn: () => fetcher('/admin/revenue'),
  });

  const { data: vendors } = useQuery({
    queryKey: ['admin-vendors-pending'],
    queryFn: () => fetcher('/admin/vendors?status=PENDING&limit=20'),
  });

  const qc = useQueryClient();

  const approveVendor = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/vendors/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: () => { toast.success('Vendor approved'); qc.invalidateQueries({ queryKey: ['admin-vendors-pending'] }); },
    onError: () => toast.error('Failed to approve vendor'),
  });

  const rejectVendor = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/vendors/${id}/status`, { status: 'SUSPENDED' }),
    onSuccess: () => { toast.success('Vendor rejected'); qc.invalidateQueries({ queryKey: ['admin-vendors-pending'] }); },
    onError: () => toast.error('Action failed'),
  });

  if (status === 'loading') return (
    <div className="min-h-screen bg-jungle flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-8 h-8 border-2 border-white/10 border-t-forest rounded-full" />
    </div>
  );

  const totalUsers = dash?.total_users ?? 0;
  const dau = dash?.dau ?? 0;
  const totalRevenue = Number(dash?.total_revenue ?? 0);
  const walletGtv = Number(dash?.wallet_gtv ?? 0);
  const activeEvents = dash?.active_events ?? 0;
  const pendingApprovals = dash?.pending_approvals ?? 0;
  const pendingCount = (vendors ?? []).length;

  const chartData = (revenue?.by_month ?? []).map((m: any) => ({
    month: formatMonth(m.month),
    revenue: Number(m.revenue ?? 0),
  }));

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="pt-16 relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #020805 0%, #061209 50%, #0c1a0f 100%)' }} />
          <div className="absolute inset-0 bg-grid-fine" />
          <motion.div className="absolute top-0 right-0 w-96 h-64 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at top right, rgba(200,150,42,0.08) 0%, transparent 70%)' }}
          />
          <div className="relative max-w-7xl mx-auto px-6 py-10">
            <div className="flex items-center justify-between gap-4">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl glass-gold border-gold/25 border flex items-center justify-center"
                    style={{ boxShadow: '0 0 24px rgba(200,150,42,0.2)' }}>
                    <Shield size={22} className="text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                      <h1 className="text-2xl md:text-3xl font-black text-white">Admin Panel</h1>
                      <span className="text-[10px] font-black bg-gold/15 text-gold border border-gold/25 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {role === 'SUPER_ADMIN' ? 'Super Admin' : 'LGA Admin'}
                      </span>
                    </div>
                    <p className="text-white/35 text-xs">Iṣẹ́yáá Operations Command Centre</p>
                  </div>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/25 border border-amber-700/25 rounded-xl text-amber-400 text-xs font-bold">
                    <AlertTriangle size={12} /> {pendingCount} awaiting approval
                  </div>
                )}
                <button
                  onClick={() => { setRefreshKey((k) => k + 1); refetch(); }}
                  className="flex items-center gap-1.5 px-3 py-2 glass border border-white/8 text-white/45 hover:text-white hover:border-white/16 rounded-xl text-xs font-medium transition-all"
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </motion.div>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

          {/* ── Hero metrics ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total Citizens" value={totalUsers.toLocaleString()}
              sub={`${dau} active today · ${((dau / Math.max(totalUsers, 1)) * 100).toFixed(0)}% DAU`}
              icon={Users}
              gradient="linear-gradient(135deg, #071a0d 0%, #0f3820 60%, #1A6B3C 100%)"
              glow="rgba(26,107,60,0.22)" delay={0}
            />
            <MetricCard
              label="Government Revenue" value={fmtNgn(totalRevenue)}
              sub="Platform levy collected"
              icon={TrendingUp}
              gradient="linear-gradient(135deg, #1a0e00 0%, #4a2800 60%, #7a4500 100%)"
              glow="rgba(200,150,42,0.2)" delay={0.08}
            />
            <MetricCard
              label="Wallet GTV" value={fmtNgn(walletGtv)}
              sub="Total transaction volume"
              icon={Wallet}
              gradient="linear-gradient(135deg, #060820 0%, #1a1a50 60%, #2d2a80 100%)"
              glow="rgba(99,102,241,0.2)" delay={0.16}
            />
          </div>

          {/* ── Supporting row ───────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Daily Active', value: dau, icon: Activity, cls: 'bg-teal-900/30 border-teal-700/20 text-teal-300' },
              { label: 'Live Events',  value: activeEvents, icon: Calendar, cls: 'bg-amber-900/25 border-amber-700/15 text-amber-400' },
              {
                label: 'Pending',
                value: pendingApprovals,
                icon: Clock,
                cls: pendingApprovals > 0 ? 'bg-red-900/30 border-red-700/25 text-red-400' : 'bg-white/5 border-white/8 text-white/35',
              },
            ].map(({ label, value, icon: Icon, cls }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + i * 0.06 }}
                className="glass rounded-2xl border border-white/6 p-4 flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon size={17} />
                </div>
                <div>
                  <p className="text-white/35 text-[11px] font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-white font-black text-xl leading-tight">{value.toLocaleString()}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Revenue chart + Vendors ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Revenue chart — left 3/5 */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42 }}
              className="lg:col-span-3 glass rounded-2xl border border-white/6 overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={16} className="text-forest-light" />
                  <h2 className="font-bold text-white">Revenue Over Time</h2>
                </div>
                <span className="text-[11px] text-white/30 font-medium">Government Levy</span>
              </div>
              <div className="px-4 py-5 h-[240px] flex items-center justify-center">
                {isLoading ? (
                  <div className="w-full h-full skeleton rounded-xl" />
                ) : (
                  <RevenueChart data={chartData} />
                )}
              </div>
            </motion.div>

            {/* Pending vendors — right 2/5 */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="lg:col-span-2 glass rounded-2xl border border-white/6 overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
                <div className="flex items-center gap-2.5">
                  <Store size={16} className="text-amber-400" />
                  <h2 className="font-bold text-white">Vendor Queue</h2>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  pendingCount > 0
                    ? 'bg-amber-900/25 text-amber-400 border-amber-700/20'
                    : 'bg-white/4 text-white/25 border-white/8'
                }`}>
                  {pendingCount} pending
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {pendingCount > 0 ? (
                  (vendors ?? []).map((v: any) => (
                    <VendorRow
                      key={v.id} vendor={v}
                      onApprove={() => approveVendor.mutate(v.id)}
                      onReject={() => rejectVendor.mutate(v.id)}
                      loading={approveVendor.isPending || rejectVendor.isPending}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-green-900/15 border border-green-700/12 flex items-center justify-center mb-3">
                      <CheckCircle size={22} className="text-green-500/40" />
                    </div>
                    <p className="text-white/35 font-semibold text-sm">All clear</p>
                    <p className="text-white/20 text-xs mt-0.5">No approvals waiting</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* ── Management links ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.58 }}
          >
            <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-3 px-1">Management</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Users',    icon: Users,     color: 'bg-forest/20 border-forest/20 text-forest-light' },
                { label: 'Vendors',  icon: Store,     color: 'bg-amber-900/20 border-amber-700/15 text-amber-400' },
                { label: 'Revenue',  icon: BarChart3, color: 'bg-indigo-900/20 border-indigo-700/15 text-indigo-300' },
                { label: 'Settings', icon: Settings,  color: 'bg-purple-900/20 border-purple-700/15 text-purple-300' },
              ].map(({ label, icon: Icon, color }) => (
                <div key={label}
                  className="flex items-center gap-3 p-4 glass rounded-2xl border border-white/6 opacity-60 cursor-not-allowed">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 font-semibold text-sm">{label}</p>
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Coming soon</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

        </main>
      </PageTransition>
    </div>
  );
}
