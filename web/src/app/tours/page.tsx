'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { TOUR_CATEGORIES, type TourCategoryOption } from '@/lib/tour-categories';
import { TourCard, TourCardSkeleton, type TourPackageSummary } from '@/components/tours/TourCard';
import { Sparkles, Search, ArrowRight, Map } from 'lucide-react';
import Link from 'next/link';
import { useState, useMemo } from 'react';

/* ── Category strip ──────────────────────────────────────────────────────── */
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
          {TOUR_CATEGORIES.map(({ id, label }: TourCategoryOption) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onChange(id)}
                className="group relative shrink-0 flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 min-w-[72px] min-h-[44px] transition-all"
              >
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-white/45 group-hover:text-white/75'
                  }`}
                >
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="tour-category-underline"
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

function EmptyState({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-forest/15 border border-forest/20 flex items-center justify-center mb-5">
        <Sparkles size={28} className="text-forest-light/60" />
      </div>
      <h3 className="text-white font-bold text-lg mb-2">No {label.toLowerCase()} tours yet</h3>
      <p className="text-white/40 text-sm max-w-sm leading-relaxed mb-6">
        We&apos;re curating the best of Ogun in this category. Check back soon or browse another collection.
      </p>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 text-sm text-gold/85 hover:text-gold font-semibold transition-colors min-h-[44px]"
      >
        Clear filter <ArrowRight size={14} />
      </button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ToursPage() {
  const [activeCat, setActiveCat] = useState<string>('ALL');
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '48');
    if (activeCat !== 'ALL') params.set('category', activeCat);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  }, [activeCat, search]);

  const { data, isLoading } = useQuery<TourPackageSummary[]>({
    queryKey: ['tour-packages', qs],
    queryFn: () => fetcher(`/tour-packages?${qs}`),
    staleTime: 30_000,
  });

  const tours = Array.isArray(data) ? data : [];
  const activeLabel =
    TOUR_CATEGORIES.find((c) => c.id === activeCat)?.label ?? 'All Tours';

  const toggleLike = (id: string) =>
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        {/* ── Hero ─────────────────────────────────────────────────── */}
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
                  Ogun State Tours
                </p>
                <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-3">
                  Discover <span className="text-gradient-gold">Guided Tours</span>
                </h1>
                <p className="text-white/55 text-base md:text-lg max-w-xl leading-relaxed">
                  Heritage walks, adire workshops, festival packages, food trails — explore Ogun with expert local guides.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="shrink-0 flex gap-3"
              >
                <Link
                  href="/become-a-guide"
                  className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold min-h-[44px]"
                >
                  Become a guide <ArrowRight size={14} />
                </Link>
                <Link
                  href="/ai"
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold min-h-[44px]"
                >
                  <Sparkles size={14} />
                  AI concierge
                </Link>
              </motion.div>
            </div>

            {/* Search bar */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="mt-8 bg-jungle-2/95 border border-white/10 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.45)] flex items-center overflow-hidden max-w-2xl"
            >
              <label className="flex-1 flex items-center gap-3 px-5 py-3">
                <Search size={15} className="text-white/40 shrink-0" />
                <input
                  type="text"
                  placeholder="Search tours by name or LGA…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent border-0 outline-none text-sm text-white placeholder-white/30"
                />
              </label>
              <div className="flex items-center justify-end px-3 py-3">
                <button
                  type="button"
                  onClick={() => {}}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm min-h-[44px]"
                  aria-label="Search tours"
                >
                  <Search size={14} /> Search
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Category strip ─────────────────────────────────────── */}
        <CategoryStrip active={activeCat} onChange={setActiveCat} />

        {/* ── Grid ──────────────────────────────────────────────── */}
        <main className="max-w-7xl mx-auto px-4 pt-8 pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8"
            >
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TourCardSkeleton key={i} />
                  ))
                : tours.length > 0
                ? tours.map((t, i) => (
                    <TourCard
                      key={t.id}
                      tour={t}
                      index={i}
                      liked={!!likes[t.id]}
                      onToggleLike={toggleLike}
                    />
                  ))
                : (
                  <EmptyState
                    label={activeLabel}
                    onClear={() => setActiveCat('ALL')}
                  />
                )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── AI nudge banner ────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl bg-forest/10 border border-forest/20 p-8 flex flex-col md:flex-row items-center justify-between gap-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-forest/20 border border-forest/30 flex items-center justify-center shrink-0">
                <Sparkles size={22} className="text-gold" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base mb-1">
                  Not sure which tour to pick?
                </h3>
                <p className="text-white/55 text-sm leading-relaxed">
                  Chat with our AI concierge — it knows every LGA, attraction, and local guide on the platform.
                </p>
              </div>
            </div>
            <Link
              href="/ai"
              className="btn-gold shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold min-h-[44px]"
            >
              <Map size={14} />
              Plan with AI
            </Link>
          </motion.div>
        </section>
      </PageTransition>
    </div>
  );
}
