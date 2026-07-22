'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { Calendar, MapPin, Star, Clock, ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

function EventSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden glass border border-white/6">
      <div className="h-48 skeleton" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 skeleton rounded-lg w-3/4" />
        <div className="h-3 skeleton rounded-lg w-full" />
        <div className="h-3 skeleton rounded-lg w-1/2" />
      </div>
    </div>
  );
}

function EventCard({ event, index }: { event: any; index: number }) {
  const prices: number[] = (event.ticketTypes ?? []).map((tt: any) => Number(tt.price ?? 0));
  const fromPrice = prices.length ? Math.min(...prices) : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.06 }}
      whileHover={{ y: -5 }}
    >
      <Link
        href={`/events/${event.id}`}
        className="group block rounded-2xl overflow-hidden glass border border-white/8 hover:border-gold/30 transition-all duration-300"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
      >
        <div className="relative h-48 bg-forest/20 overflow-hidden">
          {event.imageUrls?.[0] ? (
            <Image src={event.imageUrls[0]} alt={event.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a2e1f 0%, #0d2215 100%)' }}>
              <Calendar size={32} className="text-gold/30" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {event.isFeatured && (
            <span className="absolute top-3 left-3 bg-gold text-jungle text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Star size={9} fill="currentColor" /> Featured
            </span>
          )}
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-xl border border-white/10">
            {fromPrice === null ? 'Free' : fromPrice === 0 ? 'Free' : `From ₦${fromPrice.toLocaleString()}`}
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-bold text-white mb-1 line-clamp-1 group-hover:text-gold/90 transition-colors">{event.title}</h3>
          <p className="text-white/45 text-xs line-clamp-2 mb-3 leading-relaxed">{event.description}</p>
          <div className="flex items-center gap-3 text-white/35 text-xs">
            <span className="flex items-center gap-1">
              <Calendar size={11} className="text-gold/60" />
              {new Date(event.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-gold/60" />
              {event.lga?.name ?? event.venue ?? 'Ogun State'}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-3 flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-amber-900/20 border border-amber-700/20 flex items-center justify-center">
          <Calendar size={36} className="text-gold/50" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center">
          <Clock size={12} className="text-gold" />
        </div>
      </div>
      <h3 className="text-white font-bold text-xl mb-2">No Events Yet</h3>
      <p className="text-white/40 text-sm max-w-xs leading-relaxed mb-6">
        Concerts, festivals and cultural celebrations across Ogun State will appear here soon.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gold/80 hover:text-gold font-medium transition-colors"
      >
        Are you an organiser? Create an event <ArrowRight size={14} />
      </Link>
    </div>
  );
}

export default function EventsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => fetcher('/events?limit=24'),
  });

  const events = (Array.isArray(data) ? data : []).filter((e: any) =>
    !search || e.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* Section banner */}
        <div className="relative pt-16 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #1a0e00 0%, #2d1800 40%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-40" />
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(200,150,42,0.18) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-6xl mx-auto px-4 py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center">
                  <Calendar size={20} className="text-gold" />
                </div>
                <span className="text-gold/70 text-xs font-semibold uppercase tracking-[0.15em]">Discover</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2">Events</h1>
              <p className="text-white/45 text-sm max-w-md">Concerts, festivals & cultural celebrations across all 20 LGAs of Ogun State</p>
            </motion.div>
          </div>
        </div>

        {/* Search + content */}
        <main className="max-w-6xl mx-auto px-4 py-10">
          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative mb-8 max-w-md"
          >
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/40 transition-colors"
            />
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <EventSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((event: any, i: number) => (
                <EventCard key={event.id} event={event} index={i} />
              ))}
              {events.length === 0 && <EmptyState />}
            </div>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
