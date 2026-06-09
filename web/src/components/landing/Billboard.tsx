'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { fetcher } from '@/lib/api';

type SlideKind = 'stay' | 'event' | 'product';

type Slide = {
  id: string;
  kind: SlideKind;
  image: string | null;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
};

/** Round-robin merge so types alternate evenly. */
function roundRobin<T>(arrays: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...arrays.map((a) => a.length));
  for (let i = 0; i < max; i++) {
    for (const arr of arrays) {
      if (arr[i] !== undefined) out.push(arr[i]);
    }
  }
  return out;
}

function shortDesc(value: string | null | undefined, fallback = ''): string {
  const raw = (value ?? fallback).toString().trim();
  if (!raw) return fallback;
  return raw.length > 140 ? raw.slice(0, 137) + '…' : raw;
}

export function Billboard() {
  // Three parallel queries — independently cached, gracefully degrade if one fails.
  const properties = useQuery<any[]>({
    queryKey: ['billboard-properties'],
    queryFn: () => fetcher('/properties?featured=true&limit=3'),
    staleTime: 5 * 60 * 1000,
  });
  const events = useQuery<any[]>({
    queryKey: ['billboard-events'],
    queryFn: () => fetcher('/events?featured=true&limit=3'),
    staleTime: 5 * 60 * 1000,
  });
  const products = useQuery<any[]>({
    queryKey: ['billboard-products'],
    queryFn: () => fetcher('/products?featured=true&limit=3'),
    staleTime: 5 * 60 * 1000,
  });

  const slides: Slide[] = useMemo(() => {
    const propSlides: Slide[] = (Array.isArray(properties.data) ? properties.data : []).slice(0, 3).map((p: any) => ({
      id: `stay-${p.id}`,
      kind: 'stay',
      image: p.coverImageUrl ?? p.imageUrls?.[0] ?? null,
      title: p.name,
      description: shortDesc(p.description, p.lga?.name ?? 'Ogun State'),
      href: `/stays/${p.id}`,
      ctaLabel: 'Reserve',
    }));

    const eventSlides: Slide[] = (Array.isArray(events.data) ? events.data : []).slice(0, 3).map((e: any) => ({
      id: `event-${e.id}`,
      kind: 'event',
      image: e.imageUrls?.[0] ?? null,
      title: e.title,
      description: shortDesc(e.description, e.venue ?? 'Ogun State'),
      href: `/events/${e.id}`,
      ctaLabel: 'Book now',
    }));

    const productSlides: Slide[] = (Array.isArray(products.data) ? products.data : []).slice(0, 3).map((p: any) => ({
      id: `product-${p.id}`,
      kind: 'product',
      image: p.imageUrls?.[0] ?? null,
      title: p.name,
      description: shortDesc(p.description, p.vendor?.businessName ?? 'Iseyaa Vendor'),
      href: `/products/${p.id}`,
      ctaLabel: 'Shop',
    }));

    return roundRobin([propSlides, eventSlides, productSlides]);
  }, [properties.data, events.data, products.data]);

  const [index, setIndex] = useState(0);

  // Reset index if the slide list shrinks
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0);
  }, [slides.length, index]);

  // Auto-advance
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const isLoading = properties.isLoading && events.isLoading && products.isLoading;
  const current = slides[index];

  return (
    <section className="relative w-full h-[70vh] md:h-[80vh] overflow-hidden bg-jungle">
      {/* Slides */}
      {!current ? (
        <PlaceholderSlide loading={isLoading} />
      ) : (
        <AnimatePresence mode="sync">
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            {/* Background image */}
            <div className="absolute inset-0">
              {current.image ? (
                <Image
                  src={current.image}
                  alt={current.title}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, #0d2215 0%, #061a0e 100%)' }}
                />
              )}
            </div>

            {/* Gradient overlay — bottom-up + side fade */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(0deg, rgba(8,18,12,0.95) 0%, rgba(8,18,12,0.55) 35%, rgba(8,18,12,0.25) 60%, rgba(8,18,12,0.6) 100%)',
              }}
            />

            {/* Content */}
            <div className="absolute inset-0 flex items-end">
              <div className="w-full max-w-7xl mx-auto px-6 lg:px-12 pb-20 md:pb-28">
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.15 }}
                  className="max-w-3xl"
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 mb-5">
                    <Sparkles size={11} className="text-gold" />
                    <span className="text-gold text-[10px] font-bold uppercase tracking-[0.2em]">
                      Featured · {kindLabel(current.kind)}
                    </span>
                  </div>

                  <h2 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[0.95] tracking-tight mb-4">
                    {current.title}
                  </h2>

                  <p className="text-white/70 text-base md:text-lg leading-relaxed max-w-xl mb-7">
                    {current.description}
                  </p>

                  <Link
                    href={current.href}
                    className="btn-gold inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[15px]"
                  >
                    {current.ctaLabel} <ArrowRight size={16} />
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 md:w-12 md:h-12 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 hover:bg-black/75 text-white flex items-center justify-center transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              className={
                i === index
                  ? 'w-8 h-1.5 rounded-full bg-gold transition-all'
                  : 'w-1.5 h-1.5 rounded-full bg-white/40 hover:bg-white/70 transition-all'
              }
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function kindLabel(kind: SlideKind): string {
  switch (kind) {
    case 'stay':    return 'Stay';
    case 'event':   return 'Event';
    case 'product': return 'Marketplace';
  }
}

function PlaceholderSlide({ loading }: { loading: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-jungle">
      <div className="absolute inset-0 bg-grid-fine opacity-40" />
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, rgba(26,107,60,0.18) 0%, transparent 70%)',
      }} />
      <div className="relative text-center px-6">
        <span className="text-gradient-gold text-5xl md:text-7xl font-black tracking-tight">Iṣẹ́yáá</span>
        <p className="text-white/40 text-sm mt-3">
          {loading ? 'Loading the latest from Ogun…' : 'Everything Ogun State. One Platform.'}
        </p>
      </div>
    </div>
  );
}
