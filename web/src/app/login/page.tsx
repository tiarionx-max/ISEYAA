'use client';

import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { LogIn, Eye, EyeOff, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (result?.ok) {
      router.push('/dashboard');
    } else {
      toast.error('Invalid credentials. Please try again.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #060f09 0%, #0d1f12 50%, #1C2B2B 100%)' }}>

      {/* Background orbs */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(26,107,60,0.2) 0%, transparent 70%)', top: '-10%', left: '-10%' }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(200,150,42,0.1) 0%, transparent 70%)', bottom: '-5%', right: '-5%' }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      <div className="absolute inset-0 bg-adire opacity-30" />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-1">
            <Image
              src="/logo-icon.png"
              alt="Iṣẹ́yáá"
              width={56}
              height={56}
              priority
              className="w-14 h-14 rounded-2xl mb-2 shadow-[0_0_30px_rgba(26,107,60,0.5)]"
            />
            <span className="text-gradient-gold text-3xl font-black tracking-tight">Iṣẹ́yáá</span>
          </Link>
          <p className="text-white/40 text-sm mt-2">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="glass rounded-3xl p-7 border border-white/10" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-white/6 text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-white/8 transition-all"
              />
            </div>

            <div>
              <label className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className="w-full bg-white/6 text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-white/8 pr-11 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 btn-forest text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full block"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Signing in...
                </span>
              ) : (
                <>
                  <LogIn size={15} />
                  Sign in
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-white/8">
            <p className="text-center text-white/35 text-xs">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-gold/80 hover:text-gold font-medium transition-colors">
                Create one free <ArrowRight size={11} className="inline" />
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-white/20 text-[11px] mt-6">
          © 2026 Iṣẹ́yáá · Ogun State Digital Platform · NDPA Compliant
        </p>
      </motion.div>
    </div>
  );
}
