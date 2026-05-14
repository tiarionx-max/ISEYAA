'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { Home, MapPin, Users, Star, ArrowRight, Search, Wifi } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

function PropertySkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden glass border border-white/6">
      <div className="h-52 skeleton" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 skeleton rounded-lg w-3/4" />
        <div className="h-3 skeleton rounded-lg w-full" />
        <div className="h-3 skeleton rounded-lg w-2/3" />
      </div>
    </div>
  );
}

function PropertyCard({ property, index }: { property: any; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.06 }}
      whileHover={{ y: -5 }}
    >
      <Link
        href={`/stays/${property.id}`}
        className="group block rounded-2xl overflow-hidden glass border border-white/8 hover:border-forest/40 transition-all duration-300"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
      >
        <div className="relative h-52 overflow-hidden">
          {property.imageUrls?.[0] ? (
            <Image src={property.imageUrls[0]} alt={property.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0d2215 0%, #0a1f17 100%)' }}>
              <Home size={32} className="text-forest/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
            <div className="bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-xl border border-white/10">
              <span className="text-white text-xs font-bold">₦{Number(property.pricePerNight ?? 0).toLocaleString()}</span>
              <span className="text-white/50 text-[10px]">/night</span>
            </div>
            {property.amenities?.some((a: string) => a.toLowerCase() === 'wifi') && (
              <div className="bg-black/70 backdrop-blur-sm p-1.5 rounded-xl border border-white/10">
                <Wifi size={12} className="text-gold" />
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-bold text-white mb-1 line-clamp-1 group-hover:text-forest-light transition-colors">{property.name}</h3>
          <p className="text-white/45 text-xs line-clamp-2 mb-3 leading-relaxed">{property.description}</p>
          <div className="flex items-center gap-3 text-white/35 text-xs">
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-forest-light/70" />
              {property.lga?.name ?? property.address ?? 'Ogun State'}
            </span>
            <span className="flex items-center gap-1">
              <Users size={11} className="text-forest-light/70" />
              {property.maxGuests ?? 2} guests
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
        <div className="w-24 h-24 rounded-3xl bg-forest/15 border border-forest/20 flex items-center justify-center">
          <Home size={36} className="text-forest-light/50" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-forest/30 border border-forest/40 flex items-center justify-center">
          <Star size={11} className="text-gold" />
        </div>
      </div>
      <h3 className="text-white font-bold text-xl mb-2">No Properties Listed</h3>
      <p className="text-white/40 text-sm max-w-xs leading-relaxed mb-6">
        Guesthouses, resorts and eco-farm retreats across Ogun State will appear here soon.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-forest-light/80 hover:text-forest-light font-medium transition-colors"
      >
        Own a property? List it here <ArrowRight size={14} />
      </Link>
    </div>
  );
}

export default function StaysPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: () => fetcher('/properties?limit=24'),
  });

  const properties = (data ?? []).filter((p: any) =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* Section banner */}
        <div className="relative pt-16 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #061a0e 0%, #0a2416 40%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-40" />
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(26,107,60,0.25) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-6xl mx-auto px-4 py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-forest/30 border border-forest/30 flex items-center justify-center">
                  <Home size={20} className="text-forest-light" />
                </div>
                <span className="text-forest-light/70 text-xs font-semibold uppercase tracking-[0.15em]">Accommodation</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2">Stays</h1>
              <p className="text-white/45 text-sm max-w-md">Guesthouses, resorts & eco-farm retreats across Ogun State</p>
            </motion.div>
          </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 py-10">
          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative mb-8 max-w-md"
          >
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search properties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-forest/40 transition-colors"
            />
          </motion.div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <PropertySkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {properties.map((p: any, i: number) => <PropertyCard key={p.id} property={p} index={i} />)}
              {properties.length === 0 && <EmptyState />}
            </div>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
