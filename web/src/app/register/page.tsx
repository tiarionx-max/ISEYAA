'use client';

import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { UserPlus, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [ndpaConsent, setNdpaConsent] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ndpaConsent) {
      toast.error('You must accept the NDPA consent to register.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/register`, {
        email,
        phone,
        password,
        firstName,
        lastName,
        ndpaConsent: true,
      });
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.ok) {
        toast.success('Welcome to Iṣẹ́yáá');
        router.push('/dashboard');
      } else {
        toast.error('Account created. Please sign in to continue.');
        router.push('/login');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #060f09 0%, #0d1f12 50%, #1C2B2B 100%)' }}>

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
          <p className="text-white/40 text-sm mt-2">Create your account</p>
        </div>

        {/* Form */}
        <div className="glass rounded-3xl p-7 border border-white/10" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">First name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  placeholder="Ada"
                  className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] transition-all"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Last name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  placeholder="Adeyemi"
                  className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] transition-all"
              />
            </div>

            <div>
              <label htmlFor="phone" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                placeholder="+2348012345678"
                className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] pr-11 transition-all"
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

            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <input
                id="ndpaConsent"
                name="ndpaConsent"
                type="checkbox"
                checked={ndpaConsent}
                onChange={(e) => setNdpaConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[rgba(0,0,0,0.35)] text-forest focus:ring-forest/40 focus:ring-offset-0 accent-forest"
              />
              <span className="text-[12px] text-white/55 leading-relaxed">
                I consent to processing of my personal data under the{' '}
                <span className="text-gold/80">Nigerian Data Protection Act (NDPA)</span> as part of the Iṣẹ́yáá platform.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !ndpaConsent}
              className="w-full py-3.5 btn-forest text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full block"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                  Creating account...
                </span>
              ) : (
                <>
                  <UserPlus size={15} />
                  Create account
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-white/8">
            <p className="text-center text-white/35 text-xs">
              Already have an account?{' '}
              <Link href="/login" className="text-gold/80 hover:text-gold font-medium transition-colors">
                <ArrowLeft size={11} className="inline" /> Sign in instead
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
