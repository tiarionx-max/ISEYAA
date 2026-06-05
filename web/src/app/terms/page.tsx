'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { FileText } from 'lucide-react';

export default function TermsPage() {
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
              <FileText size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-gold text-[11px] font-bold uppercase tracking-[0.2em]">Legal</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">Terms of Use</h1>
            </div>
          </div>

          <div className="glass border border-white/8 rounded-3xl p-7 space-y-5 text-white/55 text-sm leading-relaxed">
            <p className="text-amber-300/80 text-xs font-semibold uppercase tracking-wider">
              This is a placeholder. Full legal text will be published before public launch.
            </p>

            <p>
              By using Iṣẹ́yáá you agree to use the platform lawfully, honestly, and in good faith. Iṣẹ́yáá
              is a government-endorsed super-platform that consolidates tourism, events, stays, marketplace,
              studio and government services for citizens, tourists, and vendors across Ogun State.
            </p>

            <p>
              Wallet top-ups, transfers, ticket purchases, stay bookings, and marketplace orders are
              subject to applicable CBN regulations, KYC tiers, daily limits, and refund policies. Vendors
              and hosts on the platform are independent operators responsible for the quality, legality,
              and accuracy of their listings.
            </p>

            <p>
              The final Terms of Use will cover account eligibility, prohibited activities, dispute
              resolution, intellectual property, limitation of liability, governing law (Federal Republic
              of Nigeria), and the contact details for our customer support and legal teams.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
