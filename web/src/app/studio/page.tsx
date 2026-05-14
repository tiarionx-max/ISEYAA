'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { Music, Clock, ArrowRight, Mic, Video, Radio, Play, CalendarClock } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useState } from 'react';

const SLOT_TYPE_ICONS: Record<string, React.ElementType> = {
  RECORDING: Mic,
  PODCAST: Radio,
  VIDEO: Video,
};

function SlotSkeleton() {
  return (
    <div className="rounded-2xl glass border border-white/6 p-5 space-y-3">
      <div className="h-4 skeleton rounded-lg w-1/3" />
      <div className="h-5 skeleton rounded-lg w-2/3" />
      <div className="h-3 skeleton rounded-lg w-full" />
      <div className="h-3 skeleton rounded-lg w-4/5" />
      <div className="h-10 skeleton rounded-xl mt-2" />
    </div>
  );
}

function SlotCard({ slot, index }: { slot: any; index: number }) {
  const { data: session } = useSession();
  const [durationHours, setDurationHours] = useState(2);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [showForm, setShowForm] = useState(false);

  const SlotIcon = SLOT_TYPE_ICONS[slot.type] ?? Music;
  const total = Number(slot.pricePerHour) * durationHours;

  const book = useMutation({
    mutationFn: () =>
      api.post('/studio/bookings', {
        slotId: slot.id,
        startTime: `${startDate}T${startTime}:00`,
        durationHours,
        email: session?.user?.email,
      }).then((r) => r.data),
    onSuccess: (data) => {
      if (data?.payment?.authorizationUrl) window.open(data.payment.authorizationUrl, '_blank');
      setShowForm(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Booking failed'),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.08 }}
      className="glass rounded-2xl border border-white/8 hover:border-purple-500/30 transition-all duration-300 overflow-hidden"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
    >
      {/* Card header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-700/30 flex items-center justify-center">
              <SlotIcon size={18} className="text-purple-300" />
            </div>
            <div>
              <span className="block text-[10px] font-semibold text-purple-300/70 uppercase tracking-wider mb-0.5">{slot.type}</span>
              <h3 className="font-bold text-white text-sm leading-tight">{slot.name}</h3>
            </div>
          </div>
          {slot.isGovernmentPriority && (
            <span className="text-[10px] bg-gold/15 text-gold px-2 py-0.5 rounded-full border border-gold/20 font-medium">GOV</span>
          )}
        </div>

        <p className="text-white/45 text-xs leading-relaxed mb-4">{slot.description}</p>

        <div className="flex items-center gap-4 text-white/40 text-xs">
          <span className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-white/6 flex items-center justify-center">
              <Clock size={10} className="text-gold/60" />
            </div>
            {slot.durationMinutes} min slots
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-white/6 flex items-center justify-center">
              <span className="text-[9px] text-gold/60 font-bold">₦</span>
            </div>
            ₦{Number(slot.pricePerHour).toLocaleString()}/hr
          </span>
        </div>
      </div>

      {/* Booking area */}
      <div className="border-t border-white/6 p-5 pt-4">
        {!showForm ? (
          <button
            onClick={() => session ? setShowForm(true) : (window.location.href = '/login')}
            className="w-full py-3 btn-forest text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2"
          >
            <CalendarClock size={14} /> Book Session
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div>
              <label className="text-[11px] text-white/40 mb-1.5 block font-medium uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-white/6 text-white text-sm rounded-xl px-3.5 py-2.5 border border-white/10 focus:outline-none focus:border-purple-500/50 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[11px] text-white/40 mb-1.5 block font-medium uppercase tracking-wider">Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-white/6 text-white text-sm rounded-xl px-3.5 py-2.5 border border-white/10 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-white/40 mb-1.5 block font-medium uppercase tracking-wider">Duration</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full bg-white/6 text-white text-sm rounded-xl px-3.5 py-2.5 border border-white/10 focus:outline-none focus:border-purple-500/50 transition-colors"
                >
                  {[1, 2, 3, 4, 6, 8].map((h) => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between py-2.5 px-3 bg-white/4 rounded-xl border border-white/8">
              <span className="text-xs text-white/50">Total</span>
              <span className="text-sm font-black text-gold">₦{total.toLocaleString()}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 bg-white/6 text-white/60 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors border border-white/8"
              >
                Cancel
              </button>
              <button
                onClick={() => book.mutate()}
                disabled={!startDate || book.isPending}
                className="flex-1 py-2.5 btn-forest text-white text-sm font-bold rounded-xl disabled:opacity-50"
              >
                {book.isPending ? 'Booking...' : 'Confirm & Pay'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function EmptySlots() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center py-20 text-center">
      <div className="w-24 h-24 rounded-3xl bg-purple-900/20 border border-purple-700/20 flex items-center justify-center mb-5">
        <Music size={36} className="text-purple-400/40" />
      </div>
      <h3 className="text-white font-bold text-xl mb-2">No Studio Slots Available</h3>
      <p className="text-white/40 text-sm max-w-xs leading-relaxed">
        Recording, podcast and video production slots will be listed here by studio administrators.
      </p>
    </div>
  );
}

export default function StudioPage() {
  const { data: slots, isLoading } = useQuery({
    queryKey: ['studio-slots'],
    queryFn: () => fetcher('/studio/slots'),
  });
  const { data: feed } = useQuery({
    queryKey: ['studio-feed'],
    queryFn: () => fetcher('/studio/feed?limit=6'),
  });

  const feedItems = Array.isArray(feed) ? feed : [];

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>

        {/* Section banner */}
        <div className="relative pt-16 overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #100820 0%, #1a1035 40%, #1C2B2B 100%)' }} />
          <div className="absolute inset-0 bg-adire opacity-35" />
          <motion.div
            className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(147,51,234,0.2) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative max-w-5xl mx-auto px-4 py-12">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-900/40 border border-purple-700/30 flex items-center justify-center">
                  <Music size={20} className="text-purple-300" />
                </div>
                <span className="text-purple-300/70 text-xs font-semibold uppercase tracking-[0.15em]">Creative Space</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2">Recording Studio</h1>
              <p className="text-white/45 text-sm max-w-md">Professional studios for music, podcast & video production across Ogun State</p>
            </motion.div>
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">Available Slots</h2>
            <span className="text-xs text-white/35">{Array.isArray(slots) ? slots.length : 0} slots</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {Array.from({ length: 4 }).map((_, i) => <SlotSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-16">
              {(slots ?? []).map((slot: any, i: number) => <SlotCard key={slot.id} slot={slot} index={i} />)}
              {(slots ?? []).length === 0 && <EmptySlots />}
            </div>
          )}

          {/* Creative Feed */}
          {feedItems.length > 0 && (
            <>
              <div className="border-t border-white/6 pt-10 mb-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Play size={16} className="text-purple-300" /> Creative Feed
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {feedItems.map((item: any, i: number) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    className="glass rounded-2xl border border-white/8 p-4 hover:border-purple-500/25 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-900/30 border border-purple-700/20 flex items-center justify-center">
                        {item.type === 'VIDEO' ? <Video size={13} className="text-purple-300" /> :
                         item.type === 'PODCAST' ? <Radio size={13} className="text-purple-300" /> :
                         <Mic size={13} className="text-purple-300" />}
                      </div>
                      <span className="text-[10px] text-purple-300/70 font-semibold uppercase tracking-wider">{item.type}</span>
                    </div>
                    <h3 className="text-white font-semibold text-sm line-clamp-1">{item.title ?? item.originalName}</h3>
                    <p className="text-white/35 text-[11px] mt-1">{item.uploadedBy?.firstName} {item.uploadedBy?.lastName}</p>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
