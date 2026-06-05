'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Shield } from 'lucide-react';

export default function NdpaPage() {
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
              <Shield size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-gold text-[11px] font-bold uppercase tracking-[0.2em]">Legal</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">NDPA Notice</h1>
            </div>
          </div>

          <div className="glass border border-white/8 rounded-3xl p-7 space-y-5 text-white/55 text-sm leading-relaxed">
            <p className="text-amber-300/80 text-xs font-semibold uppercase tracking-wider">
              This is a placeholder. Full legal text will be published before public launch.
            </p>

            <p>
              Iṣẹ́yáá complies with the Nigeria Data Protection Act (NDPA) 2023. Every account is created
              only after an explicit, freely given NDPA consent — this consent is recorded and may be
              reviewed or withdrawn at any time from your account settings.
            </p>

            <p>
              We treat all citizen, tourist, and vendor data as confidential government information. We
              never sell personal data, and we share it with third parties (such as Paystack for payment
              processing) only to the extent strictly necessary to deliver the service you requested.
            </p>

            <p>
              The full NDPA notice will set out our lawful bases for processing, your data subject rights
              (access, rectification, erasure, restriction, portability, and objection), how to lodge a
              complaint with the Nigeria Data Protection Commission, and how to contact our Data
              Protection Officer.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
