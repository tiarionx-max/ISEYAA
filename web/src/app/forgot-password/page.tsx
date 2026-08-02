'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error('Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/otp/send`, { phone });
      toast.success('OTP sent to your phone');
      setStep(2);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { phone, otp, newPassword });
      toast.success('Password reset. Please sign in.');
      router.push('/login');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
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
          <p className="text-white/40 text-sm mt-2">
            {step === 1 ? 'Reset your password' : 'Enter the code we sent'}
          </p>
        </div>

        {/* Form */}
        <div className="glass rounded-3xl p-7 border border-white/10" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
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
                    Sending code...
                  </span>
                ) : (
                  <>
                    <KeyRound size={15} />
                    Send reset code
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label htmlFor="otp" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">Verification code</label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] transition-all tracking-[0.4em]"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="text-[11px] text-white/45 mb-2 block font-semibold uppercase tracking-wider">New password</label>
                <div className="relative">
                  <input
                    id="newPassword"
                    name="newPassword"
                    type={showPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    className="w-full bg-[rgba(0,0,0,0.35)] text-white placeholder-white/25 text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-forest/60 focus:bg-[rgba(0,0,0,0.45)] pr-11 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
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
                    Resetting...
                  </span>
                ) : (
                  <>
                    <KeyRound size={15} />
                    Reset password
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-white/35 text-xs hover:text-white/60 transition-colors"
              >
                Change number
              </button>
            </form>
          )}

          <div className="mt-5 pt-5 border-t border-white/8">
            <p className="text-center text-white/35 text-xs">
              Remembered your password?{' '}
              <Link href="/login" className="text-gold/80 hover:text-gold font-medium transition-colors">
                <ArrowLeft size={11} className="inline" /> Back to sign in
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
