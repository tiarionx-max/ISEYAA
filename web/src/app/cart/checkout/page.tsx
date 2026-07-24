'use client';

import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { api } from '@/lib/api';
import { useCartStore } from '@/lib/cart';
import {
  ShoppingBag, Mail, MapPin, CreditCard, ArrowRight, ArrowLeft, Lock, Truck, Check,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

function fmtNGN(n: number): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated';

  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);

  const [contactEmail, setContactEmail] = useState('');
  const [state, setState] = useState('Ogun');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');

  // Pre-fill from session
  useEffect(() => {
    if (session?.user?.email && !contactEmail) {
      setContactEmail(session.user.email);
    }
  }, [session, contactEmail]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );
  // Marketplace charges exactly the item subtotal — platform/govt fees are deducted from
  // the vendor's payout server-side (marketplace.service.ts createOrder), never added on
  // top of what the buyer pays. No fee line here would be real, so there isn't one.
  const total = subtotal;

  const placeOrder = useMutation({
    mutationFn: () =>
      api
        .post('/orders', {
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          email: contactEmail,
          deliveryAddress: { state, city, street },
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      const authUrl = data?.authorizationUrl ?? data?.payment?.authorizationUrl;
      toast.success('Order placed — complete payment in the new tab.');
      if (authUrl) {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      }
      clear();
      router.push('/dashboard');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Could not place order. Please try again.';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent('/cart/checkout')}`);
      return;
    }
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    if (!contactEmail.trim()) {
      toast.error('Enter a contact email');
      return;
    }
    if (!street.trim() || !city.trim()) {
      toast.error('Enter a delivery address');
      return;
    }
    placeOrder.mutate();
  }

  /* ── Empty cart ─────────────────────────────────────────────── */
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <PageTransition>
          <main className="max-w-2xl mx-auto px-4 pt-28 pb-16 text-center">
            <div className="w-20 h-20 rounded-3xl bg-forest/15 border border-forest/25 flex items-center justify-center mx-auto mb-5">
              <ShoppingBag size={28} className="text-forest-light/70" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Your cart is empty</h1>
            <p className="text-white/50 text-sm mb-6 leading-relaxed max-w-md mx-auto">
              Add a few Ogun-made goods to your cart before heading to checkout.
            </p>
            <Link
              href="/marketplace"
              className="btn-gold inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
            >
              Browse Marketplace <ArrowRight size={15} />
            </Link>
          </main>
        </PageTransition>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-6xl mx-auto px-4 pt-20 pb-16">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-4 transition-colors"
          >
            <ArrowLeft size={12} /> Continue shopping
          </Link>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-black text-white mb-1"
          >
            Checkout
          </motion.h1>
          <p className="text-white/55 text-sm mb-8">
            Review your order, fill in delivery details, and complete payment via Paystack.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
            {/* ── Left: Order summary ──────────────────────────────── */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-jungle-2/95 border border-white/10 rounded-3xl p-5 md:p-7"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-extrabold text-white">Order summary</h2>
                <span className="text-white/45 text-xs">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <ul className="space-y-4">
                {items.map((item) => (
                  <li key={item.productId} className="flex gap-3 pb-4 border-b border-white/8 last:border-b-0 last:pb-0">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-jungle-3 shrink-0">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag size={18} className="text-forest/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold line-clamp-1">{item.name}</p>
                      <p className="text-white/40 text-[11px] mt-0.5 line-clamp-1">{item.vendorName}</p>
                      <p className="text-white/55 text-xs mt-1">
                        Qty {item.quantity} · {fmtNGN(item.price)}
                      </p>
                    </div>
                    <p className="text-white font-bold text-sm whitespace-nowrap">
                      {fmtNGN(item.price * item.quantity)}
                    </p>
                  </li>
                ))}
              </ul>

              {/* Totals */}
              <div className="mt-5 pt-5 border-t border-white/8 space-y-2 text-sm">
                <Row label="Subtotal" value={fmtNGN(subtotal)} />
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/8">
                  <span className="text-white font-bold text-base">Total</span>
                  <span className="text-gold font-black text-xl">{fmtNGN(total)}</span>
                </div>
              </div>
            </motion.section>

            {/* ── Right: Form ─────────────────────────────────────── */}
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              onSubmit={handleSubmit}
              className="bg-jungle-2/95 border border-white/10 rounded-3xl p-5 md:p-7 space-y-6 lg:sticky lg:top-24"
            >
              {/* Contact */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={14} className="text-gold" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">Contact</h3>
                </div>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
                />
              </div>

              {/* Delivery */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-gold" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">Delivery address</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="px-3.5 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
                    />
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="px-3.5 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Street address"
                    className="w-full px-3.5 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
                  />
                </div>
              </div>

              {/* Payment method */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={14} className="text-gold" />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">Payment</h3>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[rgba(0,0,0,0.35)] border border-gold/30">
                  <div className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
                    <Check size={15} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">Paystack</p>
                    <p className="text-white/45 text-[11px]">Card · Bank transfer · USSD · Wallet</p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              {signedIn ? (
                <button
                  type="submit"
                  disabled={placeOrder.isPending}
                  className="btn-forest w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm disabled:opacity-50"
                >
                  {placeOrder.isPending ? 'Placing order…' : (<><Lock size={14} /> Place order · {fmtNGN(total)}</>)}
                </button>
              ) : (
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent('/cart/checkout')}`}
                  className="btn-forest w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm"
                >
                  Sign in to complete order <ArrowRight size={14} />
                </Link>
              )}

              <div className="flex items-start gap-2.5 pt-1">
                <Truck size={14} className="text-white/40 mt-0.5 shrink-0" />
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Orders are held in escrow until you confirm delivery. You won&apos;t be charged outside the secured Paystack flow.
                </p>
              </div>
            </motion.form>
          </div>
        </main>
      </PageTransition>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-white/55' : 'text-white/75'}>{label}</span>
      <span className={muted ? 'text-white/75' : 'text-white font-semibold'}>{value}</span>
    </div>
  );
}
