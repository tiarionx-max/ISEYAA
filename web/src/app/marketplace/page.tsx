'use client';

import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { api } from '@/lib/api';
import { ShoppingBag, Sparkles, Mail, Phone, User, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function MarketplacePage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [joined, setJoined] = useState(false);
  const [position, setPosition] = useState<number | null>(null);

  const join = useMutation({
    mutationFn: (payload: { email?: string; phone?: string; fullName?: string }) =>
      api.post('/waitlist', { source: 'marketplace_web', ...payload }).then((r) => r.data),
    onSuccess: (data: any) => {
      setJoined(true);
      setPosition(data?.position ?? null);
      toast.success(data?.message ?? "You're on the list — we'll be in touch.");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Could not join waitlist. Try again.';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) {
      toast.error('Enter your email or phone number');
      return;
    }
    join.mutate({
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      fullName: fullName.trim() || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        {/* Hero */}
        <div className="relative pt-16 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #0d0a1f 0%, #1a1535 40%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-35" />
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-6xl mx-auto px-4 py-14">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-900/40 border border-indigo-700/30 flex items-center justify-center">
                  <ShoppingBag size={20} className="text-indigo-300" />
                </div>
                <span className="text-indigo-300/70 text-xs font-semibold uppercase tracking-[0.15em]">Coming Soon</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-3">Marketplace</h1>
              <p className="text-white/55 text-base max-w-xl leading-relaxed">
                A curated marketplace for Ogun&apos;s artisans, food vendors, and creative entrepreneurs is on the way.
                Join the waitlist to be first in line.
              </p>
            </motion.div>
          </div>
        </div>

        {/* Waitlist body */}
        <main className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-10 items-start">
            {/* Left: pitch */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-5"
            >
              <h2 className="text-2xl font-bold text-white">Built for Ogun&apos;s makers</h2>
              <ul className="space-y-3 text-white/60 text-sm leading-relaxed">
                {[
                  'Sell authentic Adire, leatherwork, and handicrafts to a verified state-wide audience.',
                  'Vendor onboarding tied to LGA — citizens see local sellers first.',
                  'Wallet-native checkout, escrow protection, real-time analytics for sellers.',
                  'Free to join the waitlist — early vendors get priority approval & 0% fees in the first 90 days.',
                ].map((line, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                      <Check size={11} className="text-emerald-400" />
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Right: signup card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-3xl border border-white/12 bg-jungle-2/95 p-8 backdrop-blur-xl"
              style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}
            >
              {!joined ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={18} className="text-gold" />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-gold/80">
                      Join the waitlist
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">Be first to know when we launch.</h3>

                  <label className="block">
                    <span className="text-xs font-medium text-white/50 mb-1.5 block">Full name (optional)</span>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ada Lovelace"
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/40 transition-colors"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-white/50 mb-1.5 block">Email</span>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/40 transition-colors"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-white/50 mb-1.5 block">Phone (optional)</span>
                    <div className="relative">
                      <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+2348012345678"
                        className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/40 transition-colors"
                      />
                    </div>
                  </label>

                  <button
                    type="submit"
                    disabled={join.isPending}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 mt-2 btn-forest text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:brightness-110 transition-all"
                  >
                    {join.isPending ? 'Joining…' : (<><span>Reserve my spot</span><ArrowRight size={15} /></>)}
                  </button>

                  <p className="text-[11px] text-white/30 text-center pt-1">
                    We will only email you about the marketplace launch. No spam.
                  </p>
                </form>
              ) : (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-5">
                    <Check size={28} className="text-emerald-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">You&apos;re in.</h3>
                  {position !== null && (
                    <p className="text-white/60 text-sm mb-4">
                      You&apos;re #<span className="text-gold font-bold">{position}</span> on the list.
                    </p>
                  )}
                  <p className="text-white/50 text-sm max-w-xs mx-auto">
                    We&apos;ll send a launch invite to{' '}
                    <span className="text-white/80">{email || phone}</span> when the marketplace opens.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </main>
      </PageTransition>
    </div>
  );
}
