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
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Effective Date: August 2026</p>

            <p>
              Iṣẹ́yáá ("the Platform") is a unified digital government-services platform for Ogun State,
              Nigeria, consolidating transport, tourism, events, accommodation, commerce, delivery, and
              government services into a single wallet-powered application. The Platform is owned by the
              Ogun State Government and operated under contract by LJ Entertainment ("we", "us", "our").
            </p>

            <p className="text-white font-bold text-sm">1. Who We Are</p>
            <p>
              Ogun State Government is the data controller for citizen and government-service data
              processed on the Platform. LJ Entertainment is the data processor responsible for operating,
              hosting, and maintaining the Platform's technical infrastructure. This policy is governed by
              the Nigeria Data Protection Act (NDPA) 2023 and its implementing regulations.
            </p>

            <p className="text-white font-bold text-sm">2. Information We Collect</p>
            <p>
              Identity data: full name, date of birth, phone number, email address, and — where required
              for KYC tier upgrades — National Identification Number (NIN) and Bank Verification Number
              (BVN). Financial data: wallet balance, transaction history, top-up and withdrawal records,
              and payment references processed through our licensed payment partners (Paystack, with
              Flutterwave as a fallback processor). Service usage data: bookings, ticket purchases,
              marketplace orders, delivery requests, ride requests, and studio reservations you make on the
              Platform. Location data: where you enable it, for ride-hailing, delivery tracking, and
              nearby-attraction discovery. Device and technical data: device identifiers, app version, and
              crash/performance diagnostics, used solely to keep the Platform reliable and secure.
              Communications: support requests, in-app chat with our AI travel assistant, and correspondence
              with our support team.
            </p>

            <p className="text-white font-bold text-sm">3. How We Protect Sensitive Data</p>
            <p>
              NIN and BVN are encrypted at rest using AES-256-GCM. Where we only need to confirm a match
              rather than store the raw value, we use a one-way bcrypt hash instead of the plaintext number.
              Access to decrypted identity data is restricted to the systems and personnel that require it
              to complete a verification, and all access is logged.
            </p>

            <p className="text-white font-bold text-sm">4. How We Use Your Information</p>
            <p>
              We use your data to: verify your identity for KYC-tiered wallet limits; process payments and
              prevent fraud; fulfil bookings, orders, and service requests; provide customer support; send
              you service-related notifications (booking confirmations, OTPs, wallet activity); improve the
              Platform's reliability and safety; and provide anonymized, aggregated analytics to Ogun State
              Government agencies for public-service planning. We do not sell your personal data.
            </p>

            <p className="text-white font-bold text-sm">5. Who We Share Data With</p>
            <p>
              We share data only as needed to deliver the service: payment processors (Paystack,
              Flutterwave) to process transactions; our identity-verification partner to confirm NIN/BVN
              matches; our SMS/OTP delivery partner to send verification codes; our cloud storage provider
              to host photos and documents you upload; and Ogun State Government agencies, in aggregated or
              anonymized form, for public-service reporting. We do not share your personal data with third
              parties for their own marketing purposes.
            </p>

            <p className="text-white font-bold text-sm">6. Your Rights Under the NDPA</p>
            <p>
              You have the right to: access the personal data we hold about you; correct inaccurate data;
              request a copy of your data in a portable format; withdraw consent where processing is
              consent-based; and request erasure of your personal data. You can request erasure directly in
              the app (Profile → Account settings → Delete my data), which anonymizes your identifying
              information and revokes your active sessions. Some transaction records may be retained for
              the minimum period required by Nigerian financial and tax law even after an erasure request.
            </p>

            <p className="text-white font-bold text-sm">7. Data Retention</p>
            <p>
              We retain your data for as long as your account is active, plus any additional period
              required to meet our legal, tax, audit, or dispute-resolution obligations. After account
              deletion, identifying data is anonymized; financial records required by law are retained in
              anonymized or minimized form for the statutory retention period.
            </p>

            <p className="text-white font-bold text-sm">8. Children</p>
            <p>
              The Platform is not directed at children under 18. We do not knowingly collect personal data
              from minors without a parent or guardian completing registration on their behalf.
            </p>

            <p className="text-white font-bold text-sm">9. Changes to This Policy</p>
            <p>
              We may update this policy as the Platform evolves or as NDPA guidance changes. We will note
              the effective date at the top of this page when changes are made, and will notify users
              in-app of material changes.
            </p>

            <p className="text-white font-bold text-sm">10. Contact Us</p>
            <p>
              For privacy questions, data access, or erasure requests, contact our support team at
              support@iseyaa.com or through the in-app Help section.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
