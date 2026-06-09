'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import {
  Sparkles, Shirt, Palette, Cookie, Hammer, Cpu, Wheat, Star, Heart,
  ArrowRight, ShoppingCart, ChevronDown, Mail, Phone, User, Check, MapPin, X,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCartStore, useCartDrawerStore } from '@/lib/cart';

/* ── Category config ─────────────────────────────────────────────────────── */
type Category = {
  id: string;
  label: string;
  icon: typeof Sparkles;
  /** Backend category enum slug, or undefined for "all". */
  category?: string;
  featured?: boolean;
};

const CATEGORIES: Category[] = [
  { id: 'all',         label: 'All',         icon: Sparkles },
  { id: 'fashion',     label: 'Fashion',     icon: Shirt,    category: 'fashion' },
  { id: 'crafts',      label: 'Crafts',      icon: Hammer,   category: 'crafts' },
  { id: 'food',        label: 'Food',        icon: Cookie,   category: 'food' },
  { id: 'art',         label: 'Art',         icon: Palette,  category: 'art' },
  { id: 'tech',        label: 'Tech',        icon: Cpu,      category: 'tech' },
  { id: 'agriculture', label: 'Agriculture', icon: Wheat,    category: 'agriculture' },
  { id: 'featured',    label: 'Featured',    icon: Star,     featured: true },
];

type SortKey = 'featured' | 'newest' | 'price_asc' | 'price_desc';

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'featured',   label: 'Featured' },
  { id: 'newest',     label: 'Newest' },
  { id: 'price_asc',  label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function buildQuery(c: Category): string {
  const params = new URLSearchParams();
  params.set('limit', '48');
  if (c.category) params.set('category', c.category);
  if (c.featured) params.set('featured', 'true');
  return params.toString();
}

function fmtNGN(n: any): string {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

function discountPct(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

function sortProducts(items: any[], sort: SortKey): any[] {
  const copy = [...items];
  switch (sort) {
    case 'price_asc':
      return copy.sort((a, b) => Number(a.price) - Number(b.price));
    case 'price_desc':
      return copy.sort((a, b) => Number(b.price) - Number(a.price));
    case 'newest':
      return copy.sort((a, b) => {
        const aTs = new Date(a.createdAt ?? 0).getTime();
        const bTs = new Date(b.createdAt ?? 0).getTime();
        return bTs - aTs;
      });
    case 'featured':
    default:
      return copy.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }
}

/* ── Components ──────────────────────────────────────────────────────────── */
function CategoryStrip({
  active,
  onChange,
}: {
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-16 z-30 bg-jungle/90 backdrop-blur-xl border-b border-white/8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-3 -mx-1 px-1">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className="group relative shrink-0 flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 min-w-[72px] transition-all"
              >
                <Icon
                  size={20}
                  className={`transition-colors ${isActive ? 'text-white' : 'text-white/45 group-hover:text-white/75'}`}
                />
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'text-white' : 'text-white/45 group-hover:text-white/75'
                  }`}
                >
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="marketplace-category-underline"
                    className="absolute -bottom-3 left-2 right-2 h-[2px] bg-gold rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="aspect-square rounded-2xl skeleton" />
      <div className="h-4 skeleton rounded-lg w-3/4" />
      <div className="h-3 skeleton rounded-lg w-1/2" />
      <div className="h-3 skeleton rounded-lg w-1/3" />
      <div className="h-8 skeleton rounded-xl w-full mt-2" />
    </div>
  );
}

function ProductCard({
  product,
  index,
  liked,
  onToggleLike,
  onAddToCart,
}: {
  product: any;
  index: number;
  liked: boolean;
  onToggleLike: (id: string) => void;
  onAddToCart: (product: any) => void;
}) {
  const cover = product.imageUrls?.[0];
  const price = Number(product.price ?? 0);
  const compareAt = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const pct = discountPct(price, compareAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.35) }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <div className="rounded-2xl overflow-hidden transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(0,0,0,0.55)] border border-transparent hover:border-white/10">
        <Link href={`/products/${product.id}`} className="block">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-jungle-3">
            {cover ? (
              <Image
                src={cover}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0d2215 0%, #0a1f17 100%)' }}
              >
                <ShoppingCart size={32} className="text-forest/40" />
              </div>
            )}

            {/* Discount badge */}
            {pct ? (
              <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full bg-red-500/95 text-white text-[10px] font-black uppercase tracking-wide">
                -{pct}% OFF
              </span>
            ) : product.isFeatured ? (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold/95 text-jungle text-[10px] font-bold uppercase tracking-wide">
                <Star size={10} /> Featured
              </span>
            ) : null}

            {/* Heart */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleLike(product.id);
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 hover:bg-black/75 transition-colors flex items-center justify-center"
              aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart size={15} className={liked ? 'fill-red-500 text-red-500' : 'text-white/85'} />
            </button>
          </div>

          {/* Below image */}
          <div className="pt-3 pb-1 px-0.5">
            <h3 className="font-bold text-white text-[15px] line-clamp-1">{product.name}</h3>
            <p className="text-white/45 text-xs mt-0.5 line-clamp-1">
              {product.vendor?.businessName ?? 'Iseyaa Vendor'}
              {product.vendor?.lga?.name ? ` · ${product.vendor.lga.name}` : ''}
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              {compareAt && pct ? (
                <>
                  <span className="text-gold font-black text-base">{fmtNGN(price)}</span>
                  <span className="text-white/35 text-xs line-through">{fmtNGN(compareAt)}</span>
                </>
              ) : (
                <span className="text-white font-bold text-base">{fmtNGN(price)}</span>
              )}
            </div>
          </div>
        </Link>

        {/* Add-to-cart — outside the Link so the click target is unambiguous */}
        <div className="px-0.5 pt-2 pb-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToCart(product);
            }}
            className="btn-gold w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs"
          >
            <ShoppingCart size={13} />
            Add to cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-forest/15 border border-forest/20 flex items-center justify-center mb-5">
        <Sparkles size={28} className="text-forest-light/60" />
      </div>
      <h3 className="text-white font-bold text-lg mb-2">No {label.toLowerCase()} products yet</h3>
      <p className="text-white/40 text-sm max-w-sm leading-relaxed mb-6">
        New makers are joining the marketplace every week. Check back soon or browse another category.
      </p>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 text-sm text-gold/85 hover:text-gold font-semibold transition-colors"
      >
        Show all products <ArrowRight size={14} />
      </button>
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.id === value) ?? SORT_OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[rgba(0,0,0,0.35)] border border-white/10 hover:bg-white/5 text-sm text-white/85 transition-colors"
      >
        <span>Sort: <span className="font-semibold">{current.label}</span></span>
        <ChevronDown size={14} className={`text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 top-full left-0 right-0 mt-2 rounded-xl bg-jungle-2 border border-white/12 overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            onMouseLeave={() => setOpen(false)}
          >
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  opt.id === value
                    ? 'bg-forest/25 text-white font-semibold'
                    : 'text-white/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VendorSignup({ variant }: { variant: 'sidebar' | 'modal' }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [joined, setJoined] = useState(false);

  const join = useMutation({
    mutationFn: (payload: { email?: string; phone?: string; fullName?: string }) =>
      api.post('/waitlist', { source: 'vendor_marketplace', ...payload }).then((r) => r.data),
    onSuccess: () => {
      setJoined(true);
      toast.success("You're on the vendor list — we'll be in touch.");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Could not join vendor list. Try again.';
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email && !phone) {
      toast.error('Enter your email or phone number');
      return;
    }
    join.mutate({
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      fullName: fullName.trim() || undefined,
    });
  }

  if (joined) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-4">
          <Check size={24} className="text-emerald-400" />
        </div>
        <h4 className="text-white font-bold text-base mb-1.5">You&apos;re in.</h4>
        <p className="text-white/50 text-xs leading-relaxed">
          We&apos;ll reach out about onboarding shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-gold" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold/85">
          Sell on Iṣẹ́yáá
        </span>
      </div>
      <h4 className="text-white font-extrabold text-base leading-tight">
        Become a verified vendor
      </h4>
      <p className="text-white/50 text-xs leading-relaxed">
        Reach 7M Ogun citizens. 0% fees for the first 90 days. Wallet-native payouts.
      </p>

      <div className="space-y-2 pt-1">
        <div className="relative">
          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name (optional)"
            className="w-full pl-9 pr-3 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
          />
        </div>
        <div className="relative">
          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full pl-9 pr-3 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
          />
        </div>
        <div className="relative">
          <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2348012345678"
            className="w-full pl-9 pr-3 py-2.5 bg-[rgba(0,0,0,0.35)] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={join.isPending}
        className="btn-forest w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
      >
        {join.isPending ? 'Submitting…' : (<><span>Apply to sell</span><ArrowRight size={14} /></>)}
      </button>

      {variant === 'sidebar' && (
        <p className="text-[10px] text-white/30 text-center pt-1 leading-relaxed">
          We&apos;ll only reach out about vendor onboarding.
        </p>
      )}
    </form>
  );
}

function VendorSignupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative w-full max-w-md bg-jungle-2 border border-white/12 rounded-3xl p-6 pointer-events-auto shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-[rgba(0,0,0,0.35)] border border-white/10 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
              <VendorSignup variant="modal" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function MarketplacePage() {
  const [activeCat, setActiveCat] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('featured');
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [vendorOpen, setVendorOpen] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartDrawerStore((s) => s.openDrawer);

  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0],
    [activeCat],
  );
  const qs = buildQuery(category);

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['products', qs],
    queryFn: () => fetcher(`/products?${qs}`),
    staleTime: 30_000,
  });

  const products = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return sortProducts(arr, sort);
  }, [data, sort]);

  const toggleLike = (id: string) =>
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleAddToCart = (product: any) => {
    addItem(product, 1);
    toast.success(`Added "${product.name}" to cart`, {
      action: { label: 'View cart', onClick: openCart },
    });
  };

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative pt-20 pb-8 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 30% 30%, rgba(26,107,60,0.12) 0%, transparent 70%), linear-gradient(180deg, #071009 0%, #0c1a0f 100%)',
            }}
          />
          <div className="absolute inset-0 bg-adire opacity-30" />

          <div className="relative max-w-7xl mx-auto px-4 pt-6">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="max-w-2xl"
              >
                <p className="text-gold text-xs font-bold uppercase tracking-[0.2em] mb-3">
                  Iṣẹ́yáá Marketplace
                </p>
                <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-3">
                  Shop <span className="text-gradient-gold">Ogun</span>, direct from makers.
                </h1>
                <p className="text-white/55 text-base md:text-lg max-w-xl leading-relaxed">
                  Fashion, crafts, food, art, tech and agriculture — handpicked from verified vendors across all 20 LGAs.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="shrink-0"
              >
                <button
                  onClick={() => setVendorOpen(true)}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold"
                >
                  <Sparkles size={14} /> Become a Vendor
                </button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Sticky category strip ─────────────────────────────────── */}
        <CategoryStrip active={activeCat} onChange={setActiveCat} />

        {/* ── Main grid + sidebar ───────────────────────────────────── */}
        <main className="max-w-7xl mx-auto px-4 pt-8 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
            {/* Grid */}
            <div>
              {/* Mobile sort */}
              <div className="lg:hidden mb-4">
                <SortDropdown value={sort} onChange={setSort} />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeCat}-${sort}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8"
                >
                  {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
                    : products.length > 0
                      ? products.map((p, i) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            index={i}
                            liked={!!likes[p.id]}
                            onToggleLike={toggleLike}
                            onAddToCart={handleAddToCart}
                          />
                        ))
                      : <EmptyState label={category.label} onClear={() => setActiveCat('all')} />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Sidebar (desktop only) */}
            <aside className="hidden lg:block">
              <div className="sticky top-32 space-y-5">
                <div className="bg-jungle-2/95 border border-white/10 rounded-2xl p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45 mb-3">
                    Sort
                  </p>
                  <SortDropdown value={sort} onChange={setSort} />
                </div>

                <div
                  className="bg-jungle-2/95 border border-white/10 rounded-2xl p-5"
                  style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}
                >
                  <VendorSignup variant="sidebar" />
                </div>

                <div className="bg-jungle-3 border border-white/8 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={14} className="text-gold" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gold/85">
                      All 20 LGAs
                    </p>
                  </div>
                  <p className="text-white/55 text-xs leading-relaxed">
                    Every product is tied to a verified vendor and an Ogun LGA — you&apos;re always supporting a local maker.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>

        <VendorSignupModal open={vendorOpen} onClose={() => setVendorOpen(false)} />
      </PageTransition>
    </div>
  );
}
