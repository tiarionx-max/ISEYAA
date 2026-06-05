'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/layout/Navbar';
import { Cookie } from 'lucide-react';

export default function CookiesPage() {
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
              <Cookie size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-gold text-[11px] font-bold uppercase tracking-[0.2em]">Legal</p>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">Cookie Notice</h1>
            </div>
          </div>

          <div className="glass border border-white/8 rounded-3xl p-7 space-y-5 text-white/55 text-sm leading-relaxed">
            <p className="text-amber-300/80 text-xs font-semibold uppercase tracking-wider">
              This is a placeholder. Full legal text will be published before public launch.
            </p>

            <p>
              Iṣẹ́yáá uses a minimal set of strictly necessary cookies to keep you signed in, protect your
              wallet session, and remember preferences such as your selected LGA. We do not use cookies
              for advertising or third-party tracking.
            </p>

            <p>
              Authentication is handled by short-lived JWT access tokens stored in a secure, HTTP-only
              session cookie issued by NextAuth. Anonymous browsing of attractions, events, stays, and
              the marketplace requires no cookies at all.
            </p>

            <p>
              The final Cookie Notice will list each cookie we set, its purpose, lifetime, and the
              controls available to you in your browser. It will also describe any future analytics
              cookies and how you can opt in or out.
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
