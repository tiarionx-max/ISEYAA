'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Calendar, MapPin, Users, Ticket, Clock } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: session } = useSession();
  const [quantity, setQuantity] = useState(1);

  const { data: event, isLoading } = useQuery({
    queryKey: ['events', id],
    queryFn: () => fetcher(`/events/${id}`),
  });

  const purchase = useMutation({
    mutationFn: () =>
      api.post(`/events/${id}/tickets`, {
        quantity,
        email: session?.user?.email,
      }).then((r) => r.data),
    onSuccess: (data) => {
      window.open(data.payment.authorizationUrl, '_blank');
    },
    onError: () => toast.error('Failed to initiate payment. Please try again.'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-jungle">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-16 space-y-4">
          <div className="h-64 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-8 w-1/2 bg-white/5 animate-pulse rounded" />
          <div className="h-4 w-full bg-white/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-3xl mx-auto px-4 py-10">
          {/* Cover */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative h-64 md:h-80 rounded-2xl overflow-hidden bg-forest/20 mb-6"
          >
            {event.coverImageUrl && (
              <Image src={event.coverImageUrl} alt={event.title} fill className="object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-jungle/80 to-transparent" />
          </motion.div>

          {/* Details */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h1 className="text-3xl font-bold mb-3">{event.title}</h1>
            <div className="flex flex-wrap gap-4 text-white/50 text-sm mb-5">
              <span className="flex items-center gap-1.5">
                <Calendar size={14} className="text-gold" />
                {new Date(event.startDate).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-gold" />
                {new Date(event.startDate).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-gold" />
                {event.venue}
              </span>
              <span className="flex items-center gap-1.5">
                <Users size={14} className="text-gold" />
                {event.capacity} capacity
              </span>
            </div>
            <p className="text-white/70 leading-relaxed mb-8">{event.description}</p>

            {/* Ticket purchase */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Ticket size={16} className="text-gold" />
                Get Tickets — ₦{Number(event.ticketPrice ?? 0).toLocaleString()} each
              </h2>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                >
                  –
                </button>
                <span className="text-white font-semibold w-6 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(10, quantity + 1))}
                  className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                >
                  +
                </button>
                <span className="text-white/50 text-sm">
                  Total: ₦{(Number(event.ticketPrice ?? 0) * quantity).toLocaleString()}
                </span>
              </div>
              {session ? (
                <button
                  onClick={() => purchase.mutate()}
                  disabled={purchase.isPending}
                  className="w-full py-3 bg-forest text-white font-semibold rounded-xl hover:bg-forest-light disabled:opacity-50 transition-colors"
                >
                  {purchase.isPending ? 'Processing...' : 'Purchase Tickets'}
                </button>
              ) : (
                <a href="/login" className="block text-center py-3 bg-forest/50 text-white/70 font-semibold rounded-xl hover:bg-forest transition-colors">
                  Sign in to buy tickets
                </a>
              )}
            </div>
          </motion.div>
        </main>
      </PageTransition>
    </div>
  );
}
