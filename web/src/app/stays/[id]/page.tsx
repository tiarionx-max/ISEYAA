'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Home, MapPin, Users, Wifi, Calendar, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: session } = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const [guests, setGuests] = useState(2);

  const { data: property, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/properties/${id}`),
    enabled: !!id,
  });

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000;
    return Math.max(0, Math.round(diff));
  }, [checkIn, checkOut]);

  const totalPrice = nights * Number(property?.pricePerNight ?? 0);

  const book = useMutation({
    mutationFn: () =>
      api.post(`/properties/${id}/bookings`, {
        checkIn,
        checkOut,
        guests,
        email: session?.user?.email,
      }).then((r) => r.data),
    onSuccess: (data) => {
      toast.success('Booking created. Check your dashboard for details.');
      if (data?.payment?.authorizationUrl) {
        window.open(data.payment.authorizationUrl, '_blank');
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Booking failed. Please try again.');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-jungle">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-4">
          <div className="h-72 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-8 w-2/3 bg-white/5 animate-pulse rounded" />
          <div className="h-4 w-full bg-white/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 text-center">
          <p className="text-white/50 text-sm">Property not found.</p>
          <Link href="/stays" className="inline-flex items-center gap-1.5 mt-4 text-gold/80 hover:text-gold text-sm">
            <ArrowLeft size={13} /> Back to stays
          </Link>
        </div>
      </div>
    );
  }

  const amenities: string[] = property.amenities ?? [];
  const images: string[] = property.imageUrls ?? [];
  const cover = images[0];

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-4xl mx-auto px-4 pt-20 pb-12">

          {/* Back link */}
          <Link href="/stays" className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-4 transition-colors">
            <ArrowLeft size={12} /> All stays
          </Link>

          {/* Cover */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative h-72 md:h-96 rounded-2xl overflow-hidden bg-forest/15 mb-6 border border-white/8"
          >
            {cover ? (
              <Image src={cover} alt={property.name} fill className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0d2215 0%, #0a1f17 100%)' }}>
                <Home size={48} className="text-forest/40" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-jungle/85 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-gold/80 font-semibold">Property</span>
                  <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">{property.name}</h1>
                </div>
                <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-gold font-black text-base">₦{Number(property.pricePerNight ?? 0).toLocaleString()}</span>
                  <span className="text-white/50 text-xs"> /night</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Body */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Left: info */}
            <div className="md:col-span-2 space-y-6">
              {/* Quick facts */}
              <div className="flex flex-wrap gap-4 text-white/55 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-gold" />
                  {property.lga?.name ?? property.address ?? 'Ogun State'}
                </span>
                {property.maxGuests && (
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-gold" />
                    Up to {property.maxGuests} guests
                  </span>
                )}
                {property.type && (
                  <span className="flex items-center gap-1.5">
                    <Home size={14} className="text-gold" />
                    {property.type}
                  </span>
                )}
              </div>

              {/* Description */}
              {property.description && (
                <div>
                  <h2 className="text-xs font-bold text-white/45 uppercase tracking-widest mb-2">About this stay</h2>
                  <p className="text-white/70 leading-relaxed text-sm whitespace-pre-line">{property.description}</p>
                </div>
              )}

              {/* Amenities */}
              {amenities.length > 0 && (
                <div>
                  <h2 className="text-xs font-bold text-white/45 uppercase tracking-widest mb-3">Amenities</h2>
                  <div className="grid grid-cols-2 gap-2.5">
                    {amenities.map((a) => (
                      <div key={a} className="flex items-center gap-2 text-sm text-white/65 glass border border-white/8 rounded-xl px-3 py-2">
                        {a.toLowerCase() === 'wifi' ? (
                          <Wifi size={13} className="text-gold" />
                        ) : (
                          <CheckCircle2 size={13} className="text-forest-light" />
                        )}
                        <span className="capitalize">{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: booking */}
            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="md:col-span-1"
            >
              <div className="glass border border-white/10 rounded-2xl p-5 sticky top-24" style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}>
                <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                  <Calendar size={15} className="text-gold" />
                  Reserve this stay
                </h3>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">Check in</label>
                    <input
                      type="date"
                      value={checkIn}
                      min={today}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full bg-white/6 text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-indigo-400/50 focus:bg-white/8 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">Check out</label>
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn || today}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full bg-white/6 text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-indigo-400/50 focus:bg-white/8 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">Guests</label>
                    <input
                      type="number"
                      min={1}
                      max={property.maxGuests ?? 16}
                      value={guests}
                      onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-white/6 text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-indigo-400/50 focus:bg-white/8 transition-all"
                    />
                  </div>
                </div>

                {/* Total */}
                {nights > 0 && (
                  <div className="flex items-center justify-between pt-3 pb-4 border-t border-white/8 text-sm">
                    <span className="text-white/55">{nights} night{nights !== 1 ? 's' : ''}</span>
                    <span className="text-gold font-black text-base">₦{totalPrice.toLocaleString()}</span>
                  </div>
                )}

                {session ? (
                  <button
                    onClick={() => book.mutate()}
                    disabled={book.isPending || nights < 1}
                    className="w-full py-3 btn-forest text-white font-bold rounded-xl disabled:opacity-50 transition-all text-sm"
                  >
                    {book.isPending ? 'Processing...' : 'Book now'}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="block text-center w-full py-3 bg-forest/40 text-white/80 hover:text-white hover:bg-forest/60 font-semibold rounded-xl transition-colors text-sm"
                  >
                    Sign in to book
                  </Link>
                )}

                <p className="text-[10px] text-white/30 text-center mt-3 leading-relaxed">
                  Payment held in escrow until check-in confirmed
                </p>
              </div>
            </motion.aside>
          </motion.div>
        </main>
      </PageTransition>
    </div>
  );
}
