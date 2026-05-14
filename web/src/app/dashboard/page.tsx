'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import {
  Wallet, Ticket, Home, Package, ArrowUpRight, ArrowDownLeft,
  Clock, TrendingUp, ShieldCheck, Plus, ExternalLink, Calendar,
  MapPin, ChevronRight, Inbox, Receipt, Star,
} from 'lucide-react';
import Link from 'next/link';

const TABS = [
  { key: 'wallet', label: 'Wallet', icon: Wallet },
  { key: 'tickets', label: 'Tickets', icon: Ticket },
  { key: 'bookings', label: 'Stays', icon: Home },
  { key: 'orders', label: 'Orders', icon: Package },
];

/* ── Wallet Card ─────────────────────────────────────────────────────────── */
function WalletCard({ balance }: { balance: any }) {
  const tier = balance?.kyc_tier ?? 0;
  const limit = balance?.daily_limit_ngn ?? 0;
  const balanceNgn = balance?.balance_ngn ?? 0;

  return (
    <div
      className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a2e16 0%, #1A6B3C 50%, #0f3d20 100%)',
        boxShadow: '0 20px 60px rgba(26,107,60,0.35), 0 0 0 1px rgba(26,107,60,0.3)',
      }}
    >
      {/* Pattern overlay */}
      <div className="absolute inset-0 bg-adire opacity-20" />
      {/* Glow */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(200,150,42,0.15) 0%, transparent 70%)' }} />

      <div className="relative">
        {/* Top row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <span className="text-gold font-black text-xs">IS</span>
            </div>
            <span className="text-white/70 text-xs font-semibold tracking-wider uppercase">ISEYAA Wallet</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold bg-white/10 border border-white/20 text-white/80 px-2.5 py-1 rounded-full">
            <ShieldCheck size={10} className="text-gold" /> KYC Tier {tier}
          </span>
        </div>

        {/* Balance */}
        <div className="mb-6">
          <p className="text-white/50 text-xs mb-1.5 font-medium uppercase tracking-wider">Available Balance</p>
          <p className="text-4xl font-black text-white tracking-tight">
            ₦{Number(balanceNgn).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Daily limit bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/40 text-[11px]">Daily Limit</span>
            <span className="text-white/60 text-[11px] font-semibold">₦{Number(limit).toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-gold/70 to-gold rounded-full" style={{ width: limit ? `${Math.min((balanceNgn / limit) * 100, 100)}%` : '2%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat Pill ───────────────────────────────────────────────────────────── */
function StatPill({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 border border-white/8 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={16} className="text-white/80" />
      </div>
      <div className="min-w-0">
        <p className="text-white/40 text-[11px] font-medium truncate">{label}</p>
        <p className="text-white font-bold text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

/* ── Transaction Row ─────────────────────────────────────────────────────── */
function TxRow({ tx }: { tx: any }) {
  const isCredit = tx.type === 'CREDIT';
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/3 transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        isCredit ? 'bg-green-900/30 border border-green-700/25' : 'bg-red-900/25 border border-red-700/20'
      }`}>
        {isCredit
          ? <ArrowDownLeft size={15} className="text-green-400" />
          : <ArrowUpRight size={15} className="text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{tx.description ?? tx.type}</p>
        <p className="text-white/30 text-[11px] mt-0.5">
          {new Date(tx.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
          {tx.metadata?.module && <span className="ml-2 text-white/20">· {tx.metadata.module}</span>}
        </p>
      </div>
      <span className={`text-sm font-bold shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
        {isCredit ? '+' : '−'}₦{Number(tx.amount).toLocaleString()}
      </span>
    </motion.div>
  );
}

/* ── Empty State ─────────────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, desc, cta, href }: { icon: any; title: string; desc: string; cta: string; href: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-3xl glass border border-white/10 flex items-center justify-center mb-4">
        <Icon size={30} className="text-white/20" />
      </div>
      <h3 className="text-white font-bold mb-1.5">{title}</h3>
      <p className="text-white/35 text-sm max-w-xs leading-relaxed mb-5">{desc}</p>
      <Link href={href} className="inline-flex items-center gap-1.5 px-4 py-2 btn-forest text-white text-sm font-semibold rounded-xl">
        {cta} <ChevronRight size={14} />
      </Link>
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
function WalletTab() {
  const { data: balance } = useQuery({ queryKey: ['wallet-balance'], queryFn: () => fetcher('/wallet/balance') });
  const { data: txns } = useQuery({ queryKey: ['wallet-txns'], queryFn: () => fetcher('/wallet/transactions?limit=10') });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {/* Wallet card */}
      <WalletCard balance={balance} />

      {/* Stat pills */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <StatPill
          label="Escrow"
          value={`₦${Number(balance?.escrow_balance_ngn ?? 0).toLocaleString()}`}
          icon={Clock}
          color="bg-amber-900/40 border border-amber-700/20"
        />
        <StatPill
          label="KYC Tier"
          value={`Tier ${balance?.kyc_tier ?? 0}`}
          icon={ShieldCheck}
          color="bg-forest/40 border border-forest/30"
        />
        <StatPill
          label="Total Spent"
          value={`₦${Number(balance?.total_spent ?? 0).toLocaleString()}`}
          icon={TrendingUp}
          color="bg-indigo-900/40 border border-indigo-700/20"
        />
      </div>

      {/* Top up CTA */}
      <button className="w-full mt-4 py-3.5 glass border border-white/10 rounded-2xl text-sm font-semibold text-white/70 hover:text-white hover:border-forest/40 hover:bg-forest/10 transition-all flex items-center justify-center gap-2">
        <Plus size={15} className="text-gold" />
        Top Up Wallet via Paystack
      </button>

      {/* Transactions */}
      <div className="mt-6 glass rounded-2xl border border-white/8 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="font-bold text-white text-sm">Recent Transactions</h2>
          <span className="text-white/30 text-xs">{txns?.data?.length ?? 0} entries</span>
        </div>
        <div className="divide-y divide-white/4">
          {(txns?.data ?? []).map((tx: any) => <TxRow key={tx.id} tx={tx} />)}
          {(txns?.data ?? []).length === 0 && (
            <div className="flex flex-col items-center py-14 text-center">
              <Receipt size={28} className="text-white/15 mb-3" />
              <p className="text-white/30 text-sm font-medium">No transactions yet</p>
              <p className="text-white/20 text-xs mt-1">Top up your wallet to get started</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TicketsTab() {
  const { data } = useQuery({ queryKey: ['my-tickets'], queryFn: () => fetcher('/events/tickets/mine') });
  const tickets = data ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {tickets.length > 0 ? (
        <div className="space-y-3">
          {tickets.map((t: any) => (
            <div key={t.id} className="glass border border-white/8 rounded-2xl p-4 flex items-center gap-4 hover:border-gold/20 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-amber-900/30 border border-amber-700/20 flex items-center justify-center shrink-0">
                <Ticket size={18} className="text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{t.event?.title}</p>
                <p className="text-white/35 text-xs mt-0.5 flex items-center gap-1.5">
                  <Calendar size={10} />
                  {t.event?.startDate ? new Date(t.event.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${
                t.status === 'ISSUED' ? 'bg-green-900/30 text-green-400 border-green-700/25' :
                t.status === 'USED' ? 'bg-white/8 text-white/40 border-white/10' :
                'bg-amber-900/30 text-amber-400 border-amber-700/25'
              }`}>{t.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Ticket} title="No Tickets Yet" desc="Book your first event and your tickets will appear here." cta="Browse Events" href="/events" />
      )}
    </motion.div>
  );
}

function BookingsTab() {
  const { data } = useQuery({ queryKey: ['my-bookings'], queryFn: () => fetcher('/stays/bookings/mine') });
  const bookings = data ?? [];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {bookings.length > 0 ? (
        <div className="space-y-3">
          {bookings.map((b: any) => (
            <div key={b.id} className="glass border border-white/8 rounded-2xl p-4 hover:border-forest/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-forest/25 border border-forest/20 flex items-center justify-center shrink-0">
                  <Home size={18} className="text-forest-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{b.property?.name}</p>
                  <p className="text-white/35 text-xs mt-0.5 flex items-center gap-1.5">
                    <MapPin size={10} />
                    {new Date(b.checkIn).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} – {new Date(b.checkOut).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gold font-bold text-sm">₦{Number(b.totalPrice).toLocaleString()}</p>
                  <span className={`text-[10px] font-medium ${
                    b.status === 'CONFIRMED' ? 'text-green-400' :
                    b.status === 'PENDING' ? 'text-amber-400' : 'text-white/35'
                  }`}>{b.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Home} title="No Stays Booked" desc="Find guesthouses, resorts and farm retreats across Ogun State." cta="Explore Stays" href="/stays" />
      )}
    </motion.div>
  );
}

function OrdersTab() {
  const { data } = useQuery({ queryKey: ['my-orders'], queryFn: () => fetcher('/orders/mine') });
  const orders = data ?? [];

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'text-amber-400',
    PROCESSING: 'text-blue-400',
    SHIPPED: 'text-indigo-400',
    DELIVERED: 'text-green-400',
    CANCELLED: 'text-red-400',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      {orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((o: any) => (
            <div key={o.id} className="glass border border-white/8 rounded-2xl p-4 hover:border-indigo-500/20 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-900/25 border border-indigo-700/20 flex items-center justify-center shrink-0">
                  <Package size={18} className="text-indigo-300/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{o.vendor?.businessName ?? 'Ogun State Vendor'}</p>
                  <p className="text-white/35 text-xs mt-0.5">{o.items?.length ?? '?'} item{o.items?.length !== 1 ? 's' : ''} · {new Date(o.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gold font-bold text-sm">₦{Number(o.totalAmount).toLocaleString()}</p>
                  <span className={`text-[10px] font-medium ${STATUS_COLORS[o.status] ?? 'text-white/35'}`}>{o.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={Package} title="No Orders Yet" desc="Shop artisan goods, food and handcrafted products from Ogun State." cta="Visit Marketplace" href="/marketplace" />
      )}
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState('wallet');

  if (status === 'unauthenticated') redirect('/login');
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-jungle flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-white/10 border-t-forest rounded-full" />
      </div>
    );
  }

  const isAdmin = (session as any)?.user?.role === 'SUPER_ADMIN' || (session as any)?.user?.role === 'LGA_ADMIN';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';
  const initials = session?.user?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* Header banner */}
        <div className="pt-16 relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #060f09 0%, #0d1f12 50%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-30" />
          <div className="relative max-w-5xl mx-auto px-4 py-10">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-forest-gradient flex items-center justify-center text-xl font-black text-white shrink-0"
                style={{ boxShadow: '0 0 24px rgba(26,107,60,0.4)' }}>
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl md:text-3xl font-black text-white">Welcome back, {firstName}</h1>
                  {isAdmin && (
                    <span className="text-[10px] font-bold bg-gold/20 text-gold border border-gold/25 px-2 py-0.5 rounded-full">ADMIN</span>
                  )}
                </div>
                <p className="text-white/40 text-sm">Your ISEYAA personal dashboard</p>
              </div>
              {isAdmin && (
                <Link href="/admin" className="ml-auto hidden sm:flex items-center gap-1.5 px-4 py-2 glass border border-white/10 text-white/60 hover:text-white hover:border-gold/30 text-sm font-medium rounded-xl transition-all">
                  Admin Panel <ExternalLink size={13} />
                </Link>
              )}
            </motion.div>
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-8">

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-1 p-1 glass rounded-2xl border border-white/8 mb-8 w-fit"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  tab === key ? 'text-white' : 'text-white/45 hover:text-white/70'
                }`}
              >
                <Icon size={14} />
                {label}
                {tab === key && (
                  <motion.div
                    layoutId="dash-tab"
                    className="absolute inset-0 rounded-xl bg-forest/70 border border-forest/40 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
              </button>
            ))}
          </motion.div>

          {/* Tab content */}
          {tab === 'wallet' && <WalletTab />}
          {tab === 'tickets' && <TicketsTab />}
          {tab === 'bookings' && <BookingsTab />}
          {tab === 'orders' && <OrdersTab />}
        </main>
      </PageTransition>
    </div>
  );
}
