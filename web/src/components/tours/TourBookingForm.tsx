'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Users, Copy, Share2, Minus, Plus } from 'lucide-react';
import Link from 'next/link';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtNGN(n: number) {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

/* ── Field wrapper ───────────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-white/45 mb-1.5 block font-semibold uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── Split-bill modal ────────────────────────────────────────────────────── */
function SplitBillModal({
  joinLink,
  onClose,
}: {
  joinLink: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy — please copy the link manually.');
    }
  };

  const whatsappText = encodeURIComponent(`Join my tour group on Iṣẹ́yáá!\n${joinLink}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-jungle-2 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <h3 className="text-white font-bold text-lg mb-1">Split bill created!</h3>
        <p className="text-white/55 text-sm mb-4 leading-relaxed">
          Share this link with your group so everyone can pay their share.
        </p>

        <div className="bg-jungle-3 border border-white/8 rounded-xl px-3 py-2.5 text-white/70 text-xs font-mono break-all mb-4">
          {joinLink}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-forest/20 border border-forest/30 text-forest-light text-sm font-semibold hover:bg-forest/30 transition-colors"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <a
            href={`https://wa.me/?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[rgba(37,211,102,0.15)] border border-[rgba(37,211,102,0.25)] text-forest-bright text-sm font-semibold hover:bg-[rgba(37,211,102,0.25)] transition-colors"
          >
            <Share2 size={14} />
            WhatsApp
          </a>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-3 min-h-[44px] text-white/40 text-sm hover:text-white/70 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ── Main form ───────────────────────────────────────────────────────────── */
type FormValues = {
  tourDate: string;
  email: string;
  splitBillEnabled: boolean;
};

export function TourBookingForm({
  tourId,
  price,
  maxGroupSize,
  signedIn,
}: {
  tourId: string;
  price: number | string;
  maxGroupSize: number;
  signedIn: boolean;
}) {
  const [passengerCount, setPassengerCount] = useState(1);
  const [splitJoinLink, setSplitJoinLink] = useState<string | null>(null);

  const { register, handleSubmit, watch } = useForm<FormValues>({
    defaultValues: {
      tourDate: todayISO(),
      email: '',
      splitBillEnabled: false,
    },
  });

  const splitBillEnabled = watch('splitBillEnabled');
  const priceNum = Number(price ?? 0);
  const total = priceNum * passengerCount;
  const bulkDiscount = passengerCount >= 10;

  const book = useMutation({
    mutationFn: (values: FormValues) =>
      api
        .post('/tour-bookings', {
          tourPackageId: tourId,
          tourDate: new Date(values.tourDate).toISOString(),
          passengerCount,
          splitBillEnabled: values.splitBillEnabled,
          email: values.email || undefined,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      if (data?.payment?.authorizationUrl) {
        window.location.href = data.payment.authorizationUrl;
      } else if (data?.splitBillJoinLink) {
        setSplitJoinLink(data.splitBillJoinLink);
      } else {
        toast.success('Booking created! Check your dashboard.');
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Booking failed. Please try again.');
    },
  });

  const onSubmit = (values: FormValues) => {
    book.mutate(values);
  };

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="block text-center w-full min-h-[44px] flex items-center justify-center py-3 btn-forest text-white font-bold rounded-xl text-sm"
      >
        Sign in to book
      </Link>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Tour date */}
        <Field label="Tour date">
          <input
            type="date"
            min={todayISO()}
            {...register('tourDate')}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all min-h-[44px]"
          />
        </Field>

        {/* Passenger count stepper */}
        <Field label="Passengers">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPassengerCount((c) => Math.max(1, c - 1))}
              className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-jungle-3 border border-white/10 hover:bg-jungle-2 transition-colors text-white"
              aria-label="Decrease passengers"
            >
              <Minus size={14} />
            </button>
            <span className="flex-1 text-center text-white font-bold text-lg">
              {passengerCount}
            </span>
            <button
              type="button"
              onClick={() => setPassengerCount((c) => Math.min(maxGroupSize, c + 1))}
              className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-jungle-3 border border-white/10 hover:bg-jungle-2 transition-colors text-white"
              aria-label="Increase passengers"
            >
              <Plus size={14} />
            </button>
          </div>

          {bulkDiscount && (
            <p className="text-gold text-[11px] mt-1.5 font-semibold">
              Bulk discount applies for groups of 10+
            </p>
          )}
        </Field>

        {/* Email */}
        <Field label="Email (for confirmation)">
          <input
            type="email"
            placeholder="your@email.com"
            {...register('email')}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all min-h-[44px] placeholder-white/30"
          />
        </Field>

        {/* Split bill */}
        <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            {...register('splitBillEnabled')}
            className="w-4 h-4 accent-forest rounded"
          />
          <span className="text-white/75 text-sm leading-relaxed">
            Split bill — generate a group payment link
          </span>
        </label>

        {/* Price breakdown */}
        <div className="pt-4 border-t border-white/8 space-y-2 text-sm">
          <div className="flex items-center justify-between text-white/65">
            <span>
              {fmtNGN(priceNum)} × {passengerCount} {passengerCount === 1 ? 'person' : 'people'}
            </span>
            <span>{fmtNGN(total)}</span>
          </div>
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/8">
            <span className="text-white font-bold">Total</span>
            <span className="text-gold font-black text-lg">{fmtNGN(total)}</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={book.isPending}
          className="w-full min-h-[44px] py-3 btn-forest text-white font-bold rounded-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2"
        >
          {book.isPending ? (
            'Processing…'
          ) : splitBillEnabled ? (
            <>
              <Users size={15} />
              Create split bill
            </>
          ) : (
            'Book now'
          )}
        </button>

        <p className="text-[10px] text-white/30 text-center leading-relaxed">
          You won&apos;t be charged until the booking is confirmed
        </p>
      </form>

      {splitJoinLink && (
        <SplitBillModal
          joinLink={splitJoinLink}
          onClose={() => setSplitJoinLink(null)}
        />
      )}
    </>
  );
}
