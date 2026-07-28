'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { LifeBuoy, Mail, Wallet, CalendarCheck, ShieldCheck, MessageCircleWarning } from 'lucide-react';

const TOPICS = [
  {
    icon: Wallet,
    title: 'Payments & Wallet',
    desc: 'Top-ups, failed transactions, or wallet balance questions.',
    subject: 'Support — Payments & Wallet',
  },
  {
    icon: CalendarCheck,
    title: 'Bookings & Tickets',
    desc: 'Event tickets, stay bookings, or a ride/delivery you requested.',
    subject: 'Support — Bookings & Tickets',
  },
  {
    icon: ShieldCheck,
    title: 'Account & Verification',
    desc: 'Sign-in issues, phone/email verification, or KYC tier upgrades.',
    subject: 'Support — Account & Verification',
  },
  {
    icon: MessageCircleWarning,
    title: 'Report a problem',
    desc: 'Something not working as expected, or a safety concern.',
    subject: 'Support — Report a problem',
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />

      <main className="pt-28 pb-20 max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-forest/25 border border-forest/30 flex items-center justify-center">
              <LifeBuoy size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-gold text-[11px] font-bold uppercase tracking-[0.2em]">Support</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">Help &amp; Support</h1>
            </div>
          </div>

          <p className="text-white/55 text-sm leading-relaxed mb-8 max-w-xl">
            Need a hand with something on Iṣẹ́yáá? Reach our customer care team directly — pick the
            topic closest to your issue below, or write to us at{' '}
            <a href="mailto:support@iseyaa.com" className="text-gold hover:underline">
              support@iseyaa.com
            </a>{' '}
            any time.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {TOPICS.map(({ icon: Icon, title, desc, subject }) => (
              <a
                key={title}
                href={`mailto:support@iseyaa.com?subject=${encodeURIComponent(subject)}`}
                className="glass border border-white/8 rounded-2xl p-5 hover:border-forest/40 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-forest/25 border border-forest/30 flex items-center justify-center mb-3 group-hover:bg-forest/35 transition-colors">
                  <Icon size={16} className="text-gold" />
                </div>
                <h3 className="text-white text-sm font-bold mb-1">{title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
              </a>
            ))}
          </div>

          <div className="glass border border-white/8 rounded-3xl p-7 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gold/15 border border-gold/25 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-gold" />
            </div>
            <div>
              <p className="text-white text-sm font-bold">Prefer to email directly?</p>
              <a
                href="mailto:support@iseyaa.com"
                className="text-gold text-sm hover:underline"
              >
                support@iseyaa.com
              </a>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
