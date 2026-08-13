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
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">Effective Date: August 2026</p>

            <p>
              These Terms of Use govern your access to and use of Iṣẹ́yáá ("the Platform"), a digital
              services platform owned by the Ogun State Government and operated under contract by LJ
              Entertainment. By creating an account or using the Platform, you agree to these Terms.
            </p>

            <p className="text-white font-bold text-sm">1. Eligibility</p>
            <p>
              You must be at least 18 years old, or using the Platform under the supervision of a
              parent/guardian who has completed registration, to create an account. You must provide
              accurate registration information and keep your account credentials secure.
            </p>

            <p className="text-white font-bold text-sm">2. The Wallet and Payments</p>
            <p>
              The in-app wallet allows you to top up funds and pay for bookings, tickets, orders,
              deliveries, and rides across the Platform. Wallet top-ups and payments are processed through
              licensed payment service providers (Paystack, with Flutterwave as a fallback) in compliance
              with Central Bank of Nigeria (CBN) regulations. Your ability to hold and transact wallet funds
              is subject to KYC verification tiers and their associated daily/monthly limits. We reserve the
              right to place a hold on funds or suspend wallet access where we reasonably suspect fraud,
              money laundering, or a violation of these Terms.
            </p>

            <p className="text-white font-bold text-sm">3. Bookings, Tickets, and Orders</p>
            <p>
              When you book an attraction, stay, studio session, or event ticket, or place a marketplace
              order, you enter into a transaction with the relevant host, vendor, or organiser — the
              Platform facilitates the transaction and payment but is not itself the seller of that good or
              service. Refund and cancellation terms are set per listing and will be shown to you before you
              complete a purchase.
            </p>

            <p className="text-white font-bold text-sm">4. Hosts, Vendors, Drivers, and Organisers</p>
            <p>
              If you operate as a host, vendor, driver, or event organiser on the Platform, you are
              independently responsible for the accuracy, legality, quality, and safety of what you list or
              provide. You agree to comply with all applicable Nigerian laws relevant to your activity
              (including tourism, hospitality, transport, and consumer-protection regulations) and to honour
              bookings and orders you accept.
            </p>

            <p className="text-white font-bold text-sm">5. Prohibited Conduct</p>
            <p>
              You agree not to: provide false identity or KYC information; use the Platform for money
              laundering, fraud, or any unlawful purpose; attempt to circumvent wallet limits or KYC tiers;
              harass or defraud other users; or interfere with the Platform's security or normal operation.
            </p>

            <p className="text-white font-bold text-sm">6. Account Suspension and Termination</p>
            <p>
              We may suspend or terminate your account if you violate these Terms, if required by law or a
              competent authority, or where necessary to protect the security of the Platform or other
              users. You may close your account and request data erasure at any time from Profile → Account
              settings.
            </p>

            <p className="text-white font-bold text-sm">7. Intellectual Property</p>
            <p>
              The Iṣẹ́yáá name, logo, and app design are the property of the Ogun State Government and LJ
              Entertainment. Content you upload (photos, listings, reviews) remains yours, but you grant us
              a licence to display it on the Platform for the purpose of operating the service.
            </p>

            <p className="text-white font-bold text-sm">8. Limitation of Liability</p>
            <p>
              The Platform is provided "as is." To the fullest extent permitted by Nigerian law, LJ
              Entertainment and Ogun State Government are not liable for indirect or consequential losses
              arising from your use of the Platform, disputes between users, or the acts of independent
              hosts, vendors, drivers, or organisers. Nothing in these Terms limits liability that cannot
              lawfully be excluded.
            </p>

            <p className="text-white font-bold text-sm">9. Governing Law</p>
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising
              from your use of the Platform will be subject to the exclusive jurisdiction of the courts of
              Ogun State, Nigeria.
            </p>

            <p className="text-white font-bold text-sm">10. Changes to These Terms</p>
            <p>
              We may update these Terms as the Platform evolves. We will note the effective date at the top
              of this page when changes are made and will notify users in-app of material changes.
            </p>

            <p className="text-white font-bold text-sm">11. Contact Us</p>
            <p>
              Questions about these Terms can be sent to support@iseyaa.com or through the in-app Help
              section.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
