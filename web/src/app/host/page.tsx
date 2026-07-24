'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { api, fetcher } from '@/lib/api';
import { toast } from 'sonner';
import {
  Wallet, Users, ShieldCheck, ArrowRight, Check, LayoutDashboard, Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const BENEFITS = [
  {
    icon: Wallet,
    title: 'Earn money',
    desc: 'Set your price, accept bookings, get paid via wallet within 24h of guest checkout.',
  },
  {
    icon: Users,
    title: 'Reach the right guests',
    desc: 'Verified Ogun citizens, tourists, and members find your listing through curated categories.',
  },
  {
    icon: ShieldCheck,
    title: 'We handle payments',
    desc: 'Paystack-integrated escrow, automatic platform fee, full ledger you can export.',
  },
];

const HOSTABLE = ['Stay', 'Lounge', 'Club', 'Beach', 'Tour', 'Experience', 'Social Club'];

const FAQS = [
  {
    q: 'How does payout work?',
    a: 'Funds are held in Paystack escrow until 24 hours after guest checkout, then automatically credited to your in-app wallet. From there, withdraw to any Nigerian bank account.',
  },
  {
    q: 'How much do I keep?',
    a: 'You keep 95% of every booking. A 5% government levy applies — there is no separate Iṣẹ́yáá platform fee for hosts.',
  },
  {
    q: 'What about social clubs?',
    a: 'We process your member dues monthly and remit to your account. Members get auto-renewing access via wallet auto-debit.',
  },
];

export default function HostPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    enabled: !!session,
    staleTime: 30_000,
  });

  const registeredRoles: string[] = me?.registeredRoles ?? [];
  const alreadyHost = registeredRoles.includes('HOST');

  const becomeHost = useMutation({
    mutationFn: () => api.post('/users/me/become-host').then((r) => r.data),
    onSuccess: () => {
      toast.success('Welcome aboard! You can now list your space.');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => router.push('/dashboard'), 800);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Something went wrong. Please try again.');
    },
  });

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="relative pt-16 min-h-[70vh] flex items-center overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="/og-image.png"
              alt=""
              fill
              priority
              className="object-cover opacity-30"
            />
          </div>
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(7,16,9,0.65) 0%, rgba(12,26,15,0.85) 60%, #0c1a0f 100%)',
            }}
          />
          <div className="absolute inset-0 bg-adire opacity-25" />

          <div className="relative max-w-5xl mx-auto px-4 py-24 text-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-forest text-xs font-semibold text-gold/90 mb-6">
                <Sparkles size={12} />
                Hosting on Iṣẹ́yáá
              </div>
              <h1 className="text-[clamp(42px,7vw,80px)] font-black leading-[0.95] tracking-tight mb-5">
                Become an <span className="text-gradient-gold">Iṣẹ́yáá</span><br />Host
              </h1>
              <p className="text-white/65 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                Earn from your space, club, beach, or experience. Reach 7M+ citizens across all 20 LGAs.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Benefits ─────────────────────────────────────────────── */}
        <section className="py-20 relative">
          <div className="absolute inset-0 bg-dot-grid opacity-30" />
          <div className="relative max-w-6xl mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-14"
            >
              <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">Why Host</p>
              <h2 className="text-3xl md:text-4xl font-black text-white">
                Built for serious operators
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
                <motion.div
                  key={title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.1 }}
                  className="bg-jungle-2/95 border border-white/8 rounded-3xl p-7 hover:border-forest/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-2xl bg-forest/20 border border-forest/30 flex items-center justify-center mb-5">
                    <Icon size={22} className="text-gold" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-2">{title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What you can host + Q&A ─────────────────────────────── */}
        <section className="py-20 relative">
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, #0c1a0f 0%, #071009 50%, #0c1a0f 100%)' }}
          />
          <div className="absolute inset-0 bg-adire opacity-25" />

          <div className="relative max-w-6xl mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">Listing types</p>
                <h2 className="text-3xl md:text-4xl font-black text-white mb-4">What you can host</h2>
                <p className="text-white/55 text-sm leading-relaxed mb-7 max-w-md">
                  From a single guesthouse to a private members&apos; club — Iṣẹ́yáá supports every kind of place and experience in Ogun.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {HOSTABLE.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-jungle-3 border border-white/10 text-sm font-semibold text-white/85"
                    >
                      <Check size={13} className="text-forest-light" />
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">Common questions</p>
                <h2 className="text-3xl md:text-4xl font-black text-white mb-6">Quick answers</h2>
                <div className="space-y-4">
                  {FAQS.map(({ q, a }) => (
                    <div
                      key={q}
                      className="bg-jungle-2/95 border border-white/8 rounded-2xl p-5"
                    >
                      <h3 className="font-bold text-white text-sm mb-1.5">{q}</h3>
                      <p className="text-white/55 text-sm leading-relaxed">{a}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="py-20 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative max-w-4xl mx-auto rounded-[2rem] overflow-hidden py-16 px-8 text-center"
            style={{
              background:
                'linear-gradient(135deg, #2b1d05 0%, #6a4a14 35%, #C8962A 65%, #4a3208 100%)',
              boxShadow: '0 0 100px rgba(200,150,42,0.3)',
            }}
          >
            <div className="absolute inset-0 bg-adire opacity-25" />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at 30% 30%, rgba(0,0,0,0.35) 0%, transparent 60%)' }}
            />

            <div className="relative">
              {status === 'loading' ? (
                <p className="text-white/80 text-sm">Loading…</p>
              ) : !session ? (
                <>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mb-3">Get started</p>
                  <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                    Sign in to start hosting
                  </h2>
                  <p className="text-white/80 text-sm md:text-base mb-8 max-w-md mx-auto leading-relaxed">
                    Create a free account or sign in to your existing one — then unlock the host dashboard.
                  </p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-jungle text-white font-bold text-[15px] hover:bg-jungle-2 transition-colors"
                  >
                    Sign in to start <ArrowRight size={16} />
                  </Link>
                </>
              ) : alreadyHost ? (
                <>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mb-3">Already onboarded</p>
                  <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                    You&apos;re already a host
                  </h2>
                  <p className="text-white/80 text-sm md:text-base mb-8 max-w-md mx-auto leading-relaxed">
                    Manage listings, view bookings, and track revenue from your dashboard.
                  </p>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-jungle text-white font-bold text-[15px] hover:bg-jungle-2 transition-colors"
                  >
                    <LayoutDashboard size={16} /> Go to dashboard
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-[0.2em] mb-3">One click to start</p>
                  <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
                    Ready when you are
                  </h2>
                  <p className="text-white/80 text-sm md:text-base mb-8 max-w-md mx-auto leading-relaxed">
                    Become a host to access the listing tools, payouts, and analytics.
                  </p>
                  <button
                    onClick={() => becomeHost.mutate()}
                    disabled={becomeHost.isPending}
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-jungle text-white font-bold text-[15px] hover:bg-jungle-2 transition-colors disabled:opacity-60"
                  >
                    {becomeHost.isPending ? 'Activating…' : (
                      <>I want to host <ArrowRight size={16} /></>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </section>
      </PageTransition>
    </div>
  );
}
