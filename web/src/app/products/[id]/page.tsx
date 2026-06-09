'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { useCartStore, useCartDrawerStore } from '@/lib/cart';
import {
  Star, ShoppingCart, ShoppingBag, Minus, Plus, ArrowLeft,
  Truck, ShieldCheck, RotateCcw, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

function fmtNGN(n: any): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

function discountPct(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

type TabId = 'description' | 'shipping' | 'reviews';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { data: session } = useSession();

  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState<TabId>('description');

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartDrawerStore((s) => s.openDrawer);

  const { data: product, isLoading, isError } = useQuery<any>({
    queryKey: ['product', id],
    queryFn: () => fetcher(`/products/${id}`),
    enabled: !!id,
  });

  const images: string[] = useMemo(() => {
    if (!product) return [];
    return Array.isArray(product.imageUrls) ? product.imageUrls.filter(Boolean) : [];
  }, [product]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 pt-24 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square skeleton rounded-3xl" />
            <div className="space-y-3">
              <div className="h-9 w-2/3 skeleton rounded" />
              <div className="h-5 w-1/2 skeleton rounded" />
              <div className="h-24 w-full skeleton rounded mt-4" />
              <div className="h-12 w-full skeleton rounded-xl mt-6" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 text-center">
          <h2 className="text-2xl font-black text-white mb-2">Product not found</h2>
          <p className="text-white/50 text-sm mb-5">
            This item may be sold out or removed from the marketplace.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-gold/85 hover:text-gold text-sm font-semibold"
          >
            <ArrowLeft size={13} /> Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const price = Number(product.price ?? 0);
  const compareAt = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const pct = discountPct(price, compareAt);
  const inStock = (product.stock ?? 0) > 0;
  const rating = product.rating != null ? Number(product.rating) : null;
  const reviewCount = Number(product.reviewCount ?? 0);
  const mainImage = images[activeImage] ?? images[0] ?? null;

  const handleAddToCart = () => {
    addItem(product, qty);
    toast.success(`Added ${qty} × "${product.name}" to cart`, {
      action: { label: 'View cart', onClick: openCart },
    });
  };

  const handleBuyNow = () => {
    if (!session) {
      const returnTo = encodeURIComponent(`/products/${id}`);
      router.push(`/login?callbackUrl=${returnTo}`);
      return;
    }
    addItem(product, qty);
    router.push('/cart/checkout');
  };

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-6xl mx-auto px-4 pt-20 pb-16">
          {/* Back link */}
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-4 transition-colors"
          >
            <ArrowLeft size={12} /> Back to marketplace
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            {/* ── Left: Gallery (sticky on desktop) ─────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:sticky lg:top-24"
            >
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-jungle-3 border border-white/8">
                {mainImage ? (
                  <Image
                    src={mainImage}
                    alt={product.name}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShoppingBag size={48} className="text-forest/30" />
                  </div>
                )}
                {pct && (
                  <span className="absolute top-4 left-4 inline-flex items-center px-3 py-1.5 rounded-full bg-red-500/95 text-white text-xs font-black uppercase tracking-wide">
                    -{pct}% OFF
                  </span>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {images.slice(0, 5).map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      onClick={() => setActiveImage(i)}
                      className={`relative aspect-square rounded-xl overflow-hidden bg-jungle-3 border transition-all ${
                        i === activeImage
                          ? 'border-gold ring-2 ring-gold/30'
                          : 'border-white/8 hover:border-white/25'
                      }`}
                    >
                      <Image src={src} alt={`${product.name} ${i + 1}`} fill sizes="80px" className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ── Right: Info ──────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="space-y-5"
            >
              {/* Vendor link */}
              {product.vendor?.businessName && (
                <Link
                  href={`/vendors/${product.vendor.slug ?? ''}`}
                  className="inline-flex items-center gap-1.5 text-gold/85 hover:text-gold text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  <ShoppingBag size={11} />
                  {product.vendor.businessName}
                  {product.vendor.lga?.name && (
                    <span className="text-white/40 normal-case font-medium tracking-normal ml-1">
                      · {product.vendor.lga.name}
                    </span>
                  )}
                </Link>
              )}

              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                {product.name}
              </h1>

              {/* Rating */}
              <div className="flex items-center gap-2 text-sm">
                {rating != null ? (
                  <>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={14}
                          className={n <= Math.round(rating) ? 'text-gold fill-gold' : 'text-white/20'}
                        />
                      ))}
                    </div>
                    <span className="text-white font-bold">{rating.toFixed(1)}</span>
                    <span className="text-white/45">· {reviewCount} review{reviewCount !== 1 ? 's' : ''}</span>
                  </>
                ) : (
                  <span className="text-white/45">No reviews yet</span>
                )}
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-black text-gold">{fmtNGN(price)}</span>
                {compareAt && pct && (
                  <span className="text-white/40 text-lg line-through">{fmtNGN(compareAt)}</span>
                )}
              </div>

              {/* Stock pill */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                    inStock
                      ? 'bg-forest/20 text-forest-light border border-forest/30'
                      : 'bg-red-500/15 text-red-400 border border-red-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${inStock ? 'bg-forest-light' : 'bg-red-400'}`} />
                  {inStock ? `In stock${product.stock != null ? ` · ${product.stock} left` : ''}` : 'Sold out'}
                </span>
                {product.category && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[rgba(0,0,0,0.35)] border border-white/10 text-white/70 text-[11px] font-semibold capitalize">
                    {product.category}
                  </span>
                )}
              </div>

              {/* Quantity + actions */}
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-white/45 mb-2">Quantity</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-[rgba(0,0,0,0.35)] rounded-xl border border-white/10">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-12 text-center text-white text-sm font-bold select-none">{qty}</span>
                    <button
                      onClick={() => setQty((q) => q + 1)}
                      className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="text-white/55 text-xs">
                    Subtotal: <span className="text-white font-bold">{fmtNGN(price * qty)}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <button
                  onClick={handleAddToCart}
                  disabled={!inStock}
                  className="btn-ghost inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ShoppingCart size={15} /> Add to cart
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={!inStock}
                  className="btn-gold inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Buy now
                </button>
              </div>

              {!session && (
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Adding to cart works without signing in. You&apos;ll be asked to sign in at checkout.
                </p>
              )}

              {/* Trust strip */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/8">
                <TrustItem icon={Truck} label="Delivered" value="Ogun-wide" />
                <TrustItem icon={ShieldCheck} label="Buyer" value="Protected" />
                <TrustItem icon={RotateCcw} label="Returns" value="7 days" />
              </div>
            </motion.div>
          </div>

          {/* ── Tabs ────────────────────────────────────────────────── */}
          <section className="mt-16">
            <div className="border-b border-white/8">
              <div className="flex items-center gap-1">
                {([
                  { id: 'description', label: 'Description' },
                  { id: 'shipping',    label: 'Shipping & Returns' },
                  { id: 'reviews',     label: `Reviews${reviewCount ? ` (${reviewCount})` : ''}` },
                ] as { id: TabId; label: string }[]).map((t) => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                        active ? 'text-white' : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {t.label}
                      {active && (
                        <motion.div
                          layoutId="product-tab-underline"
                          className="absolute bottom-0 left-2 right-2 h-[2px] bg-gold rounded-full"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="pt-6 max-w-3xl"
              >
                {tab === 'description' && (
                  <div className="text-white/75 text-sm leading-relaxed whitespace-pre-line">
                    {product.description || 'No description provided by the vendor.'}
                  </div>
                )}

                {tab === 'shipping' && (
                  <div className="space-y-4 text-sm">
                    <div className="flex items-start gap-3">
                      <Truck size={18} className="text-gold mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white mb-1">Delivery</h4>
                        <p className="text-white/65 leading-relaxed">
                          Orders are dispatched within 1–3 business days. Ogun-state delivery typically arrives in 2–5 days; nationwide shipping in 3–7 days. You&apos;ll receive a tracking link as soon as your order ships.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <ShieldCheck size={18} className="text-gold mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white mb-1">Buyer protection</h4>
                        <p className="text-white/65 leading-relaxed">
                          Every order is held in escrow until you confirm receipt. If something goes wrong, our team will step in within 48 hours.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <RotateCcw size={18} className="text-gold mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white mb-1">Returns</h4>
                        <p className="text-white/65 leading-relaxed">
                          Most items can be returned within 7 days of delivery, in original condition. Some hand-made or food items are final-sale — check the vendor&apos;s notes.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'reviews' && (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 rounded-2xl bg-forest/15 border border-forest/25 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare size={24} className="text-forest-light/70" />
                    </div>
                    <h4 className="text-white font-bold text-base mb-1.5">No reviews yet</h4>
                    <p className="text-white/45 text-sm max-w-sm mx-auto leading-relaxed">
                      Be the first to review this product after your order is delivered.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </PageTransition>
    </div>
  );
}

function TrustItem({
  icon: Icon, label, value,
}: { icon: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-forest/15 border border-forest/25 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-forest-light" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-bold text-white/40">{label}</p>
        <p className="text-white text-xs font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

