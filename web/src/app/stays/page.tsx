'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import {
  Sparkles, Home, Wine, Music2, Waves, MapPin, Crown, Mountain, Star,
  Heart, Search, Calendar, Users, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState } from 'react';

/* ── Category config ─────────────────────────────────────────────────────── */
type Category = {
  id: string;
  label: string;
  icon: typeof Sparkles;
  /** comma-joined list of PropertyType to filter by; undefined = no type filter */
  types?: string;
  bookingMode?: string;
  featured?: boolean;
};

const CATEGORIES: Category[] = [
  { id: 'all',         label: 'All',          icon: Sparkles },
  { id: 'stays',       label: 'Stays',        icon: Home,     types: 'HOTEL,GUESTHOUSE,APARTMENT,VILLA,RESORT' },
  { id: 'lounges',     label: 'Lounges',      icon: Wine,     types: 'LOUNGE' },
  { id: 'clubs',       label: 'Clubs',        icon: Music2,   types: 'CLUB' },
  { id: 'beach',       label: 'Beach',        icon: Waves,    types: 'BEACH' },
  { id: 'tours',       label: 'Tours',        icon: MapPin,   types: 'TOUR' },
  { id: 'experiences', label: 'Experiences',  icon: Sparkles, types: 'EXPERIENCE' },
  { id: 'memberships', label: 'Memberships',  icon: Crown,    bookingMode: 'MEMBERSHIP' },
  { id: 'attractions', label: 'Attractions',  icon: Mountain, types: 'ATTRACTION' },
  { id: 'featured',    label: 'Featured',     icon: Star,     featured: true },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function buildQueryString(c: Category): string {
  const params = new URLSearchParams();
  params.set('limit', '48');
  if (c.types) params.set('types', c.types);
  if (c.bookingMode) params.set('bookingMode', c.bookingMode);
  if (c.featured) params.set('featured', 'true');
  return params.toString();
}

function formatPrice(p: any): { primary: string; suffix: string } {
  const mode = p?.bookingMode ?? 'NIGHTLY';
  const fmt = (n: any) => `₦${Number(n ?? 0).toLocaleString()}`;
  switch (mode) {
    case 'HOURLY':
      return { primary: fmt(p.pricePerHour ?? p.pricePerNight), suffix: '/ hour' };
    case 'MEMBERSHIP':
      return { primary: fmt(p.membershipMonthlyPrice ?? p.pricePerNight), suffix: '/ month membership' };
    case 'TIMED_EVENT':
      return { primary: `From ${fmt(p.pricePerNight)}`, suffix: 'per person' };
    case 'NIGHTLY':
    default:
      return { primary: fmt(p.pricePerNight), suffix: '/ night' };
  }
}

function typeBadgeLabel(type: string): string {
  if (!type) return '';
  return type.charAt(0) + type.slice(1).toLowerCase();
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
                className={`group relative shrink-0 flex flex-col items-center gap-1.5 px-3 sm:px-4 py-2 min-w-[72px] transition-all`}
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
                    layoutId="category-underline"
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

function PropertyCardSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="aspect-square rounded-2xl skeleton" />
      <div className="h-4 skeleton rounded-lg w-3/4" />
      <div className="h-3 skeleton rounded-lg w-1/2" />
      <div className="h-3 skeleton rounded-lg w-2/5" />
    </div>
  );
}

function PropertyCard({
  property,
  index,
  liked,
  onToggleLike,
}: {
  property: any;
  index: number;
  liked: boolean;
  onToggleLike: (id: string) => void;
}) {
  const cover = property.coverImageUrl ?? property.imageUrls?.[0];
  const { primary, suffix } = formatPrice(property);
  const typeLabel = typeBadgeLabel(property.type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Link
        href={`/stays/${property.id}`}
        className="block rounded-2xl overflow-hidden transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      >
        {/* Image */}
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-jungle-3">
          {cover ? (
            <Image
              src={cover}
              alt={property.name}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0d2215 0%, #0a1f17 100%)' }}
            >
              <Home size={36} className="text-forest/40" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            {property.isFeatured ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold/95 text-jungle text-[10px] font-bold uppercase tracking-wide">
                <Star size={10} /> Featured
              </span>
            ) : <span />}

            {typeLabel && (
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-black/65 backdrop-blur-sm border border-white/15 text-white/85 text-[10px] font-semibold">
                {typeLabel}
              </span>
            )}
          </div>

          {/* Heart */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleLike(property.id);
            }}
            className="absolute top-3 right-3 translate-y-7 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 hover:bg-black/75 transition-colors flex items-center justify-center"
            aria-label={liked ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart
              size={15}
              className={liked ? 'fill-red-500 text-red-500' : 'text-white/85'}
            />
          </button>
        </div>

        {/* Below image */}
        <div className="pt-3 pb-1 px-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-white text-[15px] line-clamp-1">{property.name}</h3>
          </div>
          <p className="text-white/45 text-xs mt-0.5 line-clamp-1">
            {property.lga?.name ?? property.address ?? 'Ogun State'}
          </p>
          <p className="text-white/85 text-sm mt-1.5">
            <span className="font-bold text-white">{primary}</span>{' '}
            <span className="text-white/45 text-xs">{suffix}</span>
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-forest/15 border border-forest/20 flex items-center justify-center mb-5">
        <Sparkles size={28} className="text-forest-light/60" />
      </div>
      <h3 className="text-white font-bold text-lg mb-2">No {label.toLowerCase()} yet</h3>
      <p className="text-white/40 text-sm max-w-sm leading-relaxed mb-6">
        We&apos;re curating the best of Ogun in this category. Check back soon or browse another collection.
      </p>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 text-sm text-gold/85 hover:text-gold font-semibold transition-colors"
      >
        Clear filter <ArrowRight size={14} />
      </button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function StaysPage() {
  const [activeCat, setActiveCat] = useState<string>('all');
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0],
    [activeCat],
  );

  const qs = buildQueryString(category);
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['properties', qs],
    queryFn: () => fetcher(`/properties?${qs}`),
    staleTime: 30_000,
  });

  const properties = Array.isArray(data) ? data : [];

  const toggleLike = (id: string) =>
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        {/* ── Hero / intro ───────────────────────────────────────────── */}
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
                  The Ogun Collection
                </p>
                <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-3">
                  Explore <span className="text-gradient-gold">Ogun</span>
                </h1>
                <p className="text-white/55 text-base md:text-lg max-w-xl leading-relaxed">
                  Stays, experiences, lounges, beaches, social clubs — discover and book the best of Ogun State in one place.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="shrink-0"
              >
                <Link
                  href="/host"
                  className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold"
                >
                  Become a host <ArrowRight size={14} />
                </Link>
              </motion.div>
            </div>

            {/* Pill search bar */}
            <motion.form
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
              onSubmit={(e) => {
                e.preventDefault();
                /* local-state only for now */
              }}
              className="mt-8 bg-jungle-2/95 border border-white/10 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.45)] flex flex-col md:flex-row md:items-stretch overflow-hidden divide-y md:divide-y-0 md:divide-x divide-white/8 max-w-4xl"
            >
              <label className="flex-1 flex items-center gap-3 px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <Search size={15} className="text-white/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-white/45">Where</div>
                  <input
                    type="text"
                    placeholder="Anywhere in Ogun"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none p-0 text-sm text-white placeholder-white/30"
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              </label>

              <label className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <Calendar size={15} className="text-white/40 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-white/45">Check in</div>
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="bg-transparent border-0 outline-none p-0 text-sm text-white"
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              </label>

              <label className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <Calendar size={15} className="text-white/40 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-white/45">Check out</div>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="bg-transparent border-0 outline-none p-0 text-sm text-white"
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              </label>

              <label className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                <Users size={15} className="text-white/40 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-white/45">Guests</div>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={guests}
                    onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
                    className="bg-transparent border-0 outline-none p-0 text-sm text-white w-16"
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              </label>

              <div className="flex items-center justify-end px-3 py-3">
                <button
                  type="submit"
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm"
                  aria-label="Search"
                >
                  <Search size={14} /> Search
                </button>
              </div>
            </motion.form>
          </div>
        </section>

        {/* ── Sticky category strip ─────────────────────────────────── */}
        <CategoryStrip active={activeCat} onChange={setActiveCat} />

        {/* ── Grid ──────────────────────────────────────────────────── */}
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
                ? Array.from({ length: 8 }).map((_, i) => <PropertyCardSkeleton key={i} />)
                : properties.length > 0
                  ? properties.map((p, i) => (
                      <PropertyCard
                        key={p.id}
                        property={p}
                        index={i}
                        liked={!!likes[p.id]}
                        onToggleLike={toggleLike}
                      />
                    ))
                  : <EmptyState label={category.label} onClear={() => setActiveCat('all')} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </PageTransition>
    </div>
  );
}
