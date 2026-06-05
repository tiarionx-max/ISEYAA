'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Navbar } from '@/components/layout/Navbar';
import { OgunMap } from '@/components/ui/OgunMap';
import { fetcher } from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  Calendar, Home, ShoppingBag, Music,
  ArrowRight, MapPin, Users, Star, Zap,
  Shield, Smartphone, Globe, ChevronDown,
} from 'lucide-react';
import { useRef } from 'react';

/* three.js scene — lazy + no SSR (canvas requires window) */
const HeroLogo3D = dynamic(
  () => import('@/components/3d/HeroLogo3D').then((m) => m.HeroLogo3D),
  { ssr: false, loading: () => null },
);

const SERVICES = [
  {
    href: '/events',
    label: 'Events',
    icon: Calendar,
    desc: 'Concerts, festivals & cultural celebrations. Buy tickets, scan QR — all in one place.',
    color: 'from-amber-950 via-amber-900/30 to-transparent',
    glow: 'rgba(200,150,42,0.18)',
    border: 'hover:border-amber-700/40',
    tag: 'Discover',
  },
  {
    href: '/stays',
    label: 'Stays',
    icon: Home,
    desc: 'Guesthouses, resorts & eco-farm retreats. Secure bookings, escrow protection.',
    color: 'from-emerald-950 via-forest/20 to-transparent',
    glow: 'rgba(26,107,60,0.2)',
    border: 'hover:border-forest/40',
    tag: 'Book',
  },
  {
    href: '/marketplace',
    label: 'Marketplace',
    icon: ShoppingBag,
    desc: 'Artisans, food & handcrafted goods. Support local vendors across all 20 LGAs.',
    color: 'from-indigo-950 via-indigo-900/20 to-transparent',
    glow: 'rgba(99,102,241,0.15)',
    border: 'hover:border-indigo-700/40',
    tag: 'Shop Local',
  },
  {
    href: '/studio',
    label: 'Studio',
    icon: Music,
    desc: 'Professional recording, podcast & video production studios at government rates.',
    color: 'from-purple-950 via-purple-900/20 to-transparent',
    glow: 'rgba(147,51,234,0.15)',
    border: 'hover:border-purple-700/40',
    tag: 'Create',
  },
];

const PILLARS = [
  { icon: Shield,     title: 'NDPA Compliant',      desc: 'Your data is protected under the Nigerian Data Protection Act. We never sell your information.' },
  { icon: Zap,        title: 'Instant Payments',     desc: 'Paystack-powered wallet with CBN-compliant KYC tiers. Top up, spend, and receive in seconds.' },
  { icon: Smartphone, title: 'Mobile-First',         desc: 'Full iOS and Android app with offline support. Works across all network speeds in Nigeria.' },
  { icon: Globe,      title: 'All 20 LGAs',          desc: 'From Imeko Afon to Ogun Waterside — every local government area is covered.' },
];

/* ── Components ──────────────────────────────────────────────────────────── */
function ServiceCard({ service, index }: { service: typeof SERVICES[0]; index: number }) {
  const { href, label, icon: Icon, desc, color, glow, border, tag } = service;
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Link
        href={href}
        className={`group relative flex flex-col h-full p-7 rounded-3xl overflow-hidden border border-white/6 ${border} card-hover`}
        style={{ boxShadow: `0 8px 40px ${glow}` }}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${color}`} />
        <div className="absolute inset-0 bg-jungle/55" />
        <div className="absolute inset-0 bg-adire opacity-25" />

        <div className="relative flex flex-col flex-1">
          <div className="flex items-start justify-between mb-6">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <Icon size={22} className="text-gold" />
            </div>
            <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full uppercase tracking-widest">
              {tag}
            </span>
          </div>

          <h3 className="text-xl font-extrabold text-white mb-2">{label}</h3>
          <p className="text-white/45 text-sm leading-relaxed flex-1 mb-6">{desc}</p>

          <div className="flex items-center gap-1.5 text-gold/80 text-sm font-bold group-hover:gap-3 transition-all duration-300">
            Explore {label} <ArrowRight size={14} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const mapY = useTransform(scrollYProgress, [0, 1], ['0%', '15%']);
  const mapOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);

  const { data: session } = useSession();

  // Live counts pulled from the backend so STATS aren't hardcoded
  const { data: lgas, isLoading: lgasLoading } = useQuery<any[]>({
    queryKey: ['home-lgas'],
    queryFn: () => fetcher('/lgas'),
    staleTime: 5 * 60 * 1000,
  });
  const { data: attractions, isLoading: attractionsLoading } = useQuery<any[]>({
    queryKey: ['home-attractions'],
    queryFn: () => fetcher('/attractions'),
    staleTime: 5 * 60 * 1000,
  });

  const lgaCount = Array.isArray(lgas) ? lgas.length : null;
  const attractionCount = Array.isArray(attractions) ? attractions.length : null;

  const STATS = [
    { value: lgasLoading || lgaCount === null ? '—' : String(lgaCount),                label: 'LGAs Covered',     icon: MapPin },
    { value: '7M+',                                                                     label: 'Citizens served',  icon: Users  },
    { value: attractionsLoading || attractionCount === null ? '—' : String(attractionCount), label: 'Attractions', icon: Star   },
    { value: '100%',                                                                    label: 'Secure & NDPA',    icon: Shield },
  ];

  const HIGHLIGHT_LGAS = Array.isArray(lgas) ? lgas.slice(0, 8) : [];

  return (
    <div className="min-h-screen bg-jungle text-white overflow-x-hidden">
      <Navbar />

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden">

        {/* Deep layered background */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 80% 70% at 70% 40%, rgba(26,107,60,0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(200,150,42,0.06) 0%, transparent 60%), linear-gradient(180deg, #030806 0%, #071009 40%, #0c1a0f 100%)',
        }} />
        <div className="absolute inset-0 bg-grid-fine" />

        {/* Animated OgunMap — right side */}
        <motion.div
          style={{ y: mapY, opacity: mapOpacity }}
          className="absolute right-0 top-0 bottom-0 w-[55%] flex items-center justify-center pointer-events-none select-none"
        >
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse 60% 70% at 60% 50%, rgba(26,107,60,0.08) 0%, transparent 70%)',
          }} />
          <OgunMap className="w-full max-w-[520px] h-auto drop-shadow-[0_0_80px_rgba(26,107,60,0.15)]" dim />
          {/* Right edge fade */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, #0c1a0f 0%, transparent 20%, transparent 80%, #0c1a0f 100%), linear-gradient(180deg, #030806 0%, transparent 15%, transparent 85%, #0c1a0f 100%)',
          }} />
        </motion.div>

        {/* Hero content */}
        <motion.div style={{ y: textY }} className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-8 pt-24 pb-36">
          <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-center">
          <div className="max-w-2xl">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-forest text-xs font-semibold text-gold/90 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Official Platform · Ogun State Government
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-[clamp(52px,8vw,96px)] font-black leading-[0.92] tracking-tight mb-6"
            >
              <span className="text-gradient-gold block">Iṣẹ́yáá</span>
              <span className="text-gradient-white block mt-1 text-[clamp(24px,3.5vw,42px)] font-extrabold tracking-normal">
                Everything Ogun State.<br className="hidden sm:block" /> One Platform.
              </span>
            </motion.h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="text-white/50 text-base md:text-lg leading-relaxed mb-10 max-w-lg"
            >
              Tourism, events, stays, marketplace, studio & government services — unified for all 7 million citizens across 20 LGAs.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.42 }}
              className="flex flex-wrap gap-3"
            >
              <Link href="/events" className="btn-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-[15px]">
                Explore the Platform <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="btn-ghost inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-[15px]">
                Create Free Account
              </Link>
            </motion.div>
          </div>

          {/* 3D logo (right column on desktop, hidden < lg) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="hidden lg:block relative w-[420px] h-[420px] xl:w-[480px] xl:h-[480px]"
          >
            {/* Soft glow halo behind the 3D scene */}
            <div
              className="absolute inset-0 rounded-full blur-3xl opacity-40"
              style={{ background: 'radial-gradient(circle, rgba(212,168,67,0.35) 0%, transparent 65%)' }}
            />
            <HeroLogo3D className="absolute inset-0" />
          </motion.div>
          </div>
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
        >
          <span className="text-white/25 text-[10px] uppercase tracking-[0.2em]">Scroll</span>
          <ChevronDown size={14} className="text-white/25" />
        </motion.div>
      </section>

      {/* ── STATS STRIP ─────────────────────────────────────────────────── */}
      <section className="relative py-4 border-y border-white/5">
        <div className="absolute inset-0 bg-jungle-2" />
        <div className="relative max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/5">
            {STATS.map(({ value, label, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex flex-col items-center py-6 px-4 text-center"
              >
                <Icon size={14} className="text-gold/60 mb-2" />
                <span className="text-2xl font-black text-white">{value}</span>
                <span className="text-white/35 text-xs mt-0.5 font-medium">{label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ────────────────────────────────────────────────────── */}
      <section className="py-28 relative">
        <div className="absolute inset-0 bg-dot-grid opacity-40" />
        <div className="relative max-w-6xl mx-auto px-6">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">The Platform</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
              Built for Every Citizen,<br />
              <span className="text-gradient-forest">Every LGA</span>
            </h2>
            <p className="text-white/40 text-base max-w-md mx-auto leading-relaxed">
              One account. Complete access to tourism, commerce, culture and government services across all of Ogun State.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {SERVICES.map((s, i) => <ServiceCard key={s.href} service={s} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── MAP SECTION ─────────────────────────────────────────────────── */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0c1a0f 0%, #071009 50%, #0c1a0f 100%)' }} />
        <div className="absolute inset-0 bg-adire opacity-30" />

        <div className="relative max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left — text */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
            >
              <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-4">All 20 LGAs</p>
              <h2 className="text-4xl md:text-5xl font-black text-white leading-tight mb-5">
                One State.<br />
                <span className="text-gradient-gold">Fully Connected.</span>
              </h2>
              <p className="text-white/45 text-base leading-relaxed mb-8">
                From Imeko Afon in the northwest to Ogun Waterside in the southeast — every local government area is live on Iṣẹ́yáá. Discover attractions, book stays, and find events near you.
              </p>

              <div className="flex flex-wrap gap-2">
                {lgasLoading && HIGHLIGHT_LGAS.length === 0
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-7 w-28 rounded-full bg-white/5 border border-white/8 animate-pulse"
                      />
                    ))
                  : HIGHLIGHT_LGAS.map((lga: any, i: number) => (
                      <Link
                        key={lga.id ?? lga.slug ?? lga.name}
                        href={`/stays?lga=${encodeURIComponent(lga.slug ?? '')}`}
                        className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          i === 0
                            ? 'bg-gold/12 border-gold/30 text-gold hover:bg-gold/20'
                            : 'bg-white/5 border-white/10 text-forest-light hover:border-forest/40 hover:bg-forest/10'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-gold' : 'bg-forest-light'} shrink-0`} />
                        {lga.name}
                        {typeof lga._count?.attractions === 'number' && (
                          <span className="text-white/30 text-[10px] ml-0.5">
                            · {lga._count.attractions}
                          </span>
                        )}
                      </Link>
                    ))}
              </div>
            </motion.div>

            {/* Right — map */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.65, delay: 0.15 }}
              className="flex justify-center"
            >
              <div className="relative w-full max-w-md">
                <div className="absolute inset-0 rounded-3xl" style={{ background: 'radial-gradient(ellipse at center, rgba(26,107,60,0.15) 0%, transparent 70%)' }} />
                <OgunMap className="w-full h-auto" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── PILLARS ─────────────────────────────────────────────────────── */}
      <section className="py-28 relative">
        <div className="absolute inset-0 bg-dot-grid opacity-30" />
        <div className="relative max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">Why Iṣẹ́yáá</p>
            <h2 className="text-4xl md:text-5xl font-black text-white">
              Built Different.<br />
              <span className="text-gradient-forest">Built for Nigeria.</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PILLARS.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="glass rounded-3xl p-6 border border-white/6 hover:border-forest/25 transition-colors group"
              >
                <div className="w-11 h-11 rounded-2xl bg-forest/15 border border-forest/20 flex items-center justify-center mb-5 group-hover:bg-forest/25 transition-colors">
                  <Icon size={20} className="text-forest-light" />
                </div>
                <h3 className="font-bold text-white mb-2 text-[15px]">{title}</h3>
                <p className="text-white/40 text-xs leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0c1a0f 0%, #071209 100%)' }} />
        <div className="absolute inset-0 bg-adire opacity-25" />

        <div className="relative max-w-4xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">Simple Process</p>
            <h2 className="text-4xl md:text-5xl font-black text-white">Get Started in Minutes</h2>
          </motion.div>

          <div className="relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-transparent via-forest/30 to-transparent" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { n: '01', title: 'Create Account',   desc: 'Register free with your email or phone. No fees, no paperwork.' },
                { n: '02', title: 'Explore & Discover', desc: 'Browse events, book stays, shop local, access studios.' },
                { n: '03', title: 'Pay Securely',      desc: 'Paystack-powered checkout. NDPA-compliant data protection.' },
              ].map(({ n, title, desc }, i) => (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.14 }}
                  className="relative glass rounded-3xl p-8 text-center border border-white/6"
                >
                  <div className="text-5xl font-black text-gradient-gold mb-4 leading-none">{n}</div>
                  <h3 className="font-extrabold text-white text-lg mb-2">{title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ──────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative max-w-4xl mx-auto rounded-[2rem] overflow-hidden py-20 px-8 text-center"
          style={{
            background: 'linear-gradient(135deg, #061a0e 0%, #0f3d20 40%, #1A6B3C 70%, #0a2a13 100%)',
            boxShadow: '0 0 100px rgba(26,107,60,0.35)',
          }}
        >
          <div className="absolute inset-0 bg-adire opacity-30" />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(200,150,42,0.12) 0%, transparent 60%)' }} />
          <div className="relative">
            <p className="text-gold/80 text-xs font-bold uppercase tracking-[0.2em] mb-4">Join Today</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">
              Join <span className="text-gradient-gold">7 Million</span><br />Ogun State Citizens
            </h2>
            <p className="text-white/50 text-base mb-10 max-w-md mx-auto leading-relaxed">
              Free to register. Secure by design. The complete digital gateway to Ogun State.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="btn-gold inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-[15px]">
                Create Free Account <ArrowRight size={16} />
              </Link>
              <Link href="/events" className="btn-ghost inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-[15px]">
                Browse Without Account
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Image
                  src="/logo-icon.png"
                  alt="Iṣẹ́yáá"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-xl"
                />
                <span className="text-gradient-gold text-lg font-black">Iṣẹ́yáá</span>
              </div>
              <p className="text-white/55 text-xs leading-relaxed max-w-[180px]">
                Ogun State&apos;s unified digital super-platform. Operated by LJ Entertainment.
              </p>
            </div>
            {(() => {
              const accountLinks: { label: string; href: string }[] = [
                { label: 'Sign In',   href: '/login' },
                { label: 'Register',  href: '/register' },
              ];
              if (session) {
                accountLinks.push({ label: 'Dashboard', href: '/dashboard' });
              }

              const groups: { heading: string; links: { label: string; href: string }[] }[] = [
                {
                  heading: 'Platform',
                  links: [
                    { label: 'Events',      href: '/events' },
                    { label: 'Stays',       href: '/stays' },
                    { label: 'Marketplace', href: '/marketplace' },
                    { label: 'Studio',      href: '/studio' },
                  ],
                },
                { heading: 'Account', links: accountLinks },
                {
                  heading: 'Legal',
                  links: [
                    { label: 'Privacy Policy', href: '/privacy' },
                    { label: 'NDPA Notice',    href: '/ndpa' },
                    { label: 'Terms of Use',   href: '/terms' },
                    { label: 'Cookies',        href: '/cookies' },
                  ],
                },
              ];

              return groups.map(({ heading, links }) => (
                <div key={heading}>
                  <h4 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">{heading}</h4>
                  <ul className="space-y-2.5">
                    {links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href} className="text-white/55 text-sm hover:text-white transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/45 text-xs">© 2026 Iṣẹ́yáá · Operated by LJ Entertainment · Endorsed by Ogun State Government</p>
            <p className="text-white/45 text-xs">NDPA Compliant · CBN Licensed Wallet · Paystack Partner</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
