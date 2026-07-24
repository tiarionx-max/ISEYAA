'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Calendar, MapPin, Ticket, Clock } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: session } = useSession();
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ['events', id],
    queryFn: () => fetcher(`/events/${id}`),
  });

  const ticketTypes: Array<{ id: string; name: string; price: number | string; quantity: number; sold: number }> =
    event?.ticketTypes ?? [];

  const selectedTicketType = ticketTypes.find((tt) => tt.id === selectedTicketTypeId) ?? ticketTypes[0];

  const purchase = useMutation({
    mutationFn: () => {
      if (!selectedTicketType) return Promise.reject(new Error('Select a ticket type'));
      if (!session?.user?.email) return Promise.reject(new Error('Sign in with an email to purchase'));
      return api.post(`/events/${id}/purchase`, {
        ticketTypeId: selectedTicketType.id,
        email: session.user.email,
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      window.open(data.payment.authorizationUrl, '_blank');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to initiate payment. Please try again.';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
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
            {event.imageUrls?.[0] && (
              <Image src={event.imageUrls[0]} alt={event.title} fill className="object-cover" />
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
            </div>
            <p className="text-white/70 leading-relaxed mb-8">{event.description}</p>

            {/* Ticket purchase */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Ticket size={16} className="text-gold" />
                Get Tickets
              </h2>

              {ticketTypes.length === 0 ? (
                <p className="text-white/50 text-sm mb-4">Tickets for this event aren&apos;t on sale yet — check back soon.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {ticketTypes.map((tt) => {
                    const soldOut = tt.sold >= tt.quantity;
                    const isSelected = selectedTicketType?.id === tt.id;
                    return (
                      <button
                        key={tt.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => setSelectedTicketTypeId(tt.id)}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                          isSelected ? 'border-gold/60 bg-gold/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <p className="text-white font-medium text-sm">{tt.name}</p>
                          <p className="text-white/40 text-xs mt-0.5">{soldOut ? 'Sold out' : `${tt.quantity - tt.sold} left`}</p>
                        </div>
                        <span className={`font-bold text-sm ${isSelected ? 'text-gold' : 'text-white/70'}`}>
                          {Number(tt.price) === 0 ? 'Free' : `₦${Number(tt.price).toLocaleString()}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {session ? (
                <button
                  onClick={() => purchase.mutate()}
                  disabled={purchase.isPending || !selectedTicketType || selectedTicketType.sold >= selectedTicketType.quantity}
                  className="w-full py-3 btn-forest text-sm rounded-xl disabled:opacity-50"
                >
                  {purchase.isPending ? 'Processing…' : 'Purchase Ticket'}
                </button>
              ) : (
                <a href="/login" className="block text-center py-3 btn-ghost text-sm rounded-xl">
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
