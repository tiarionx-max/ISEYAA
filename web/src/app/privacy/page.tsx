'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
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
              <ShieldCheck size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-gold text-[11px] font-bold uppercase tracking-[0.2em]">Legal</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">Privacy Policy</h1>
            </div>
          </div>

          <div className="glass border border-white/8 rounded-3xl p-7 space-y-5 text-white/55 text-sm leading-relaxed">
            <p className="text-amber-300/80 text-xs font-semibold uppercase tracking-wider">
              This is a placeholder. Full legal text will be published before public launch.
            </p>

            <p>
              Iṣẹ́yáá is operated by LJ Entertainment under contract with the Ogun State Government. We are
              committed to protecting the privacy of every citizen, tourist, and vendor who uses our
              platform — in line with the Nigeria Data Protection Act (NDPA) 2023 and applicable
              international standards.
            </p>

            <p>
              We collect only the personal data required to deliver our services — including identity
              information for KYC verification, wallet transactions, bookings, and service usage. All
              sensitive Nigerian citizen PII (BVN, NIN) is encrypted at rest with AES-256-GCM and is never
              shared with third parties without your explicit consent or a lawful basis.
            </p>

            <p>
              You have the right to access, correct, export, or request erasure of your personal data at
              any time by writing to our Data Protection Officer. Our final Privacy Policy will detail
              data categories collected, lawful bases, retention periods, processor relationships, and
              your full rights under the NDPA.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
