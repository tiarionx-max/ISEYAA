'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { useCartStore, useCartDrawerStore } from '@/lib/cart';

function fmtNGN(n: number): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

export function CartDrawer() {
  const open = useCartDrawerStore((s) => s.open);
  const closeDrawer = useCartDrawerStore((s) => s.closeDrawer);
  const items = useCartStore((s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalCount = useCartStore((s) => s.totalCount());
  const totalPrice = useCartStore((s) => s.totalPrice());

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm"
            onClick={closeDrawer}
            aria-hidden
          />

          {/* Drawer panel */}
          <motion.aside
            key="cart-drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full sm:w-[440px] bg-jungle-2 border-l border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col"
            role="dialog"
            aria-label="Shopping cart"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center">
                  <ShoppingBag size={16} className="text-gold" />
                </div>
                <div>
                  <h2 className="font-extrabold text-white text-base leading-tight">Your cart</h2>
                  <p className="text-white/45 text-xs">
                    {totalCount} {totalCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="w-9 h-9 rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                aria-label="Close cart"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center px-8 text-center py-16">
                  <div className="w-20 h-20 rounded-3xl bg-forest/15 border border-forest/25 flex items-center justify-center mb-5">
                    <ShoppingBag size={28} className="text-forest-light/70" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">Cart is empty</h3>
                  <p className="text-white/45 text-sm leading-relaxed mb-6 max-w-xs">
                    Browse the marketplace and add some Ogun-made goods to your cart.
                  </p>
                  <Link
                    href="/marketplace"
                    onClick={closeDrawer}
                    className="btn-forest inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
                  >
                    Browse Marketplace <ArrowRight size={14} />
                  </Link>
                </div>
              ) : (
                <ul className="px-4 py-4 space-y-3">
                  {items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex gap-3 p-3 rounded-2xl bg-jungle-3 border border-white/8"
                    >
                      {/* Image */}
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-jungle shrink-0">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ShoppingBag size={20} className="text-forest/40" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white text-sm font-bold line-clamp-1">{item.name}</h4>
                        <p className="text-white/40 text-[11px] line-clamp-1 mt-0.5">{item.vendorName}</p>
                        <p className="text-gold font-bold text-sm mt-1">{fmtNGN(item.price)}</p>

                        <div className="flex items-center justify-between mt-2.5">
                          <div className="flex items-center gap-0 bg-[rgba(0,0,0,0.35)] rounded-lg border border-white/10">
                            <button
                              onClick={() => updateQty(item.productId, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-white text-xs font-bold w-6 text-center select-none">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(item.productId, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>

                          <button
                            onClick={() => removeItem(item.productId)}
                            className="text-red-400/80 hover:text-red-400 transition-colors p-1"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-white/8 px-5 py-4 bg-jungle-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/55 text-sm">Subtotal</span>
                  <span className="text-white font-bold text-lg">{fmtNGN(totalPrice)}</span>
                </div>
                <p className="text-white/35 text-[11px] mb-3">
                  Service fee &amp; delivery calculated at checkout.
                </p>
                <Link
                  href="/cart/checkout"
                  onClick={closeDrawer}
                  className="btn-gold w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm"
                >
                  Checkout <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
