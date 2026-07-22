'use client';

import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher, api } from '@/lib/api';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  Home, MapPin, Users, Star, ArrowLeft, Check, Crown, Clock, Calendar,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtNGN(n: any) {
  return `₦${Number(n ?? 0).toLocaleString()}`;
}

function todayISO(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function typeLabel(type: string): string {
  if (!type) return 'Listing';
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/* ── Sub-components ──────────────────────────────────────────────────────── */
function PhotoGallery({ images, name }: { images: string[]; name: string }) {
  const [main, ...rest] = images;
  const sides = rest.slice(0, 4);

  if (!main) {
    return (
      <div className="rounded-3xl overflow-hidden bg-jungle-3 aspect-[16/9] flex items-center justify-center">
        <Home size={48} className="text-forest/40" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-3xl overflow-hidden">
      <a
        href={main}
        target="_blank"
        rel="noopener noreferrer"
        className="relative md:col-span-2 md:row-span-2 aspect-square md:aspect-auto md:min-h-[420px] bg-jungle-3 overflow-hidden group"
      >
        <Image
          src={main}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
          priority
        />
      </a>

      {sides.length > 0 ? (
        sides.map((src, i) => (
          <a
            key={`${src}-${i}`}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="relative hidden md:block min-h-[206px] bg-jungle-3 overflow-hidden group"
          >
            <Image
              src={src}
              alt={`${name} photo ${i + 2}`}
              fill
              sizes="25vw"
              className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
            />
          </a>
        ))
      ) : null}

      {Array.from({ length: Math.max(0, 4 - sides.length) }).map((_, i) => (
        <div
          key={`placeholder-${i}`}
          className="relative hidden md:block min-h-[206px] bg-jungle-3"
          style={{ background: 'linear-gradient(135deg, #0d2215 0%, #0a1f17 100%)' }}
        />
      ))}
    </div>
  );
}

/* ── Booking forms by mode ───────────────────────────────────────────────── */
type BookingArgs = {
  checkIn: string;
  checkOut: string;
  guests: number;
  email?: string | null;
};

function NightlyForm({
  property,
  onSubmit,
  pending,
  signedIn,
}: {
  property: any;
  onSubmit: (args: BookingArgs) => void;
  pending: boolean;
  signedIn: boolean;
}) {
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [guests, setGuests] = useState(2);

  const nights = useMemo(() => {
    const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000;
    return Math.max(0, Math.round(diff));
  }, [checkIn, checkOut]);

  // Booking charges exactly pricePerNight × nights — the Ministry levy split is deducted
  // from the host's payout server-side (stays.service.ts resolveSplit/releaseEscrow),
  // never added on top of what the guest pays. No fee line here would be real.
  const subtotal = nights * Number(property.pricePerNight ?? 0);
  const total = subtotal;

  return (
    <>
      <div className="text-2xl font-black text-white mb-4">
        {fmtNGN(property.pricePerNight)}
        <span className="text-sm text-white/45 font-normal"> / night</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Field label="Check in">
          <input
            type="date"
            value={checkIn}
            min={todayISO()}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
        <Field label="Check out">
          <input
            type="date"
            value={checkOut}
            min={checkIn || todayISO()}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
      </div>

      <Field label="Guests">
        <input
          type="number"
          min={1}
          max={property.maxGuests ?? 16}
          value={guests}
          onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
          className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
        />
      </Field>

      {nights > 0 && (
        <div className="mt-4 pt-4 border-t border-white/8 space-y-2 text-sm">
          <Row label={`${fmtNGN(property.pricePerNight)} × ${nights} night${nights !== 1 ? 's' : ''}`} value={fmtNGN(subtotal)} />
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/8">
            <span className="text-white font-bold">Total</span>
            <span className="text-gold font-black text-lg">{fmtNGN(total)}</span>
          </div>
        </div>
      )}

      <SubmitButton
        signedIn={signedIn}
        pending={pending}
        disabled={nights < 1}
        onClick={() =>
          onSubmit({
            checkIn: new Date(checkIn).toISOString(),
            checkOut: new Date(checkOut).toISOString(),
            guests,
          })
        }
      >
        Reserve
      </SubmitButton>

      <p className="text-[10px] text-white/30 text-center mt-3 leading-relaxed">
        You won&apos;t be charged until your booking is confirmed
      </p>
    </>
  );
}

function HourlyForm({
  property,
  onSubmit,
  pending,
  signedIn,
}: {
  property: any;
  onSubmit: (args: BookingArgs) => void;
  pending: boolean;
  signedIn: boolean;
}) {
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('19:00');
  const [hours, setHours] = useState(2);
  const [guests, setGuests] = useState(2);

  const unitPrice = Number(property.pricePerHour ?? property.pricePerNight ?? 0);
  const total = hours * unitPrice;

  return (
    <>
      <div className="text-2xl font-black text-white mb-4">
        {fmtNGN(unitPrice)}
        <span className="text-sm text-white/45 font-normal"> / hour</span>
      </div>

      <Field label="Date">
        <input
          type="date"
          value={date}
          min={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Field label="Start time">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
        <Field label="Hours">
          <input
            type="number"
            min={1}
            max={12}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Guests">
          <input
            type="number"
            min={1}
            max={property.maxGuests ?? 16}
            value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
      </div>

      <div className="mt-4 pt-4 border-t border-white/8 space-y-2 text-sm">
        <Row label={`${fmtNGN(unitPrice)} × ${hours} hour${hours !== 1 ? 's' : ''}`} value={fmtNGN(total)} />
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/8">
          <span className="text-white font-bold">Total</span>
          <span className="text-gold font-black text-lg">{fmtNGN(total)}</span>
        </div>
      </div>

      <SubmitButton
        signedIn={signedIn}
        pending={pending}
        disabled={hours < 1}
        onClick={() => {
          const start = new Date(`${date}T${time}:00`);
          const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
          onSubmit({
            checkIn: start.toISOString(),
            checkOut: end.toISOString(),
            guests,
          });
        }}
      >
        Reserve table
      </SubmitButton>
    </>
  );
}

function TimedEventForm({
  property,
  onSubmit,
  pending,
  signedIn,
}: {
  property: any;
  onSubmit: (args: BookingArgs) => void;
  pending: boolean;
  signedIn: boolean;
}) {
  const [date, setDate] = useState(todayISO());
  const [people, setPeople] = useState(2);

  const pricePerPerson = Number(property.pricePerNight ?? 0);
  const total = people * pricePerPerson;

  return (
    <>
      <div className="text-2xl font-black text-white mb-4">
        From {fmtNGN(pricePerPerson)}
        <span className="text-sm text-white/45 font-normal"> per person</span>
      </div>

      <Field label="Date">
        <input
          type="date"
          value={date}
          min={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
        />
      </Field>

      <div className="mt-3">
        <Field label="Number of people">
          <input
            type="number"
            min={1}
            max={property.maxGuests ?? 32}
            value={people}
            onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
            className="w-full bg-[rgba(0,0,0,0.35)] text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:outline-none focus:border-forest/60 transition-all"
          />
        </Field>
      </div>

      <div className="mt-4 pt-4 border-t border-white/8 space-y-2 text-sm">
        <Row label={`${fmtNGN(pricePerPerson)} × ${people} ${people === 1 ? 'person' : 'people'}`} value={fmtNGN(total)} />
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/8">
          <span className="text-white font-bold">Total</span>
          <span className="text-gold font-black text-lg">{fmtNGN(total)}</span>
        </div>
      </div>

      <SubmitButton
        signedIn={signedIn}
        pending={pending}
        disabled={people < 1}
        onClick={() => {
          const start = new Date(`${date}T09:00:00`);
          const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
          onSubmit({
            checkIn: start.toISOString(),
            checkOut: end.toISOString(),
            guests: people,
          });
        }}
      >
        Book experience
      </SubmitButton>
    </>
  );
}

function MembershipForm({
  property,
  onSubmit,
  pending,
  signedIn,
}: {
  property: any;
  onSubmit: (args: BookingArgs) => void;
  pending: boolean;
  signedIn: boolean;
}) {
  const monthly = Number(property.membershipMonthlyPrice ?? property.pricePerNight ?? 0);
  const benefits: string[] = property.membershipBenefits ?? [];

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Crown size={18} className="text-gold" />
        <span className="text-[11px] uppercase tracking-wider font-bold text-gold/85">Membership</span>
      </div>
      <div className="text-2xl font-black text-white mb-1">
        {fmtNGN(monthly)}
        <span className="text-sm text-white/45 font-normal"> / month</span>
      </div>
      <p className="text-white/55 text-xs mb-5 leading-relaxed">
        Join the club and unlock member-only access, perks, and events.
      </p>

      {benefits.length > 0 && (
        <div className="space-y-2 mb-5">
          {benefits.map((b) => (
            <div key={b} className="flex items-start gap-2 text-sm text-white/80">
              <Check size={14} className="text-forest-light mt-0.5 shrink-0" />
              <span>{b}</span>
            </div>
          ))}
        </div>
      )}

      {/* TODO: replace this stay-booking POST with a proper /memberships endpoint
          once the backend exposes one. For now we reuse the bookings flow so
          members still get a Paystack payment URL. */}
      <SubmitButton
        signedIn={signedIn}
        pending={pending}
        disabled={false}
        onClick={() => {
          const start = new Date();
          const end = new Date(start.getTime() + 30 * 86_400_000);
          onSubmit({
            checkIn: start.toISOString(),
            checkOut: end.toISOString(),
            guests: 1,
          });
        }}
      >
        Become a member
      </SubmitButton>

      <p className="text-[10px] text-white/30 text-center mt-3 leading-relaxed">
        Cancel anytime · Charges renew monthly via wallet auto-debit
      </p>
    </>
  );
}

/* ── Tiny presentational helpers ─────────────────────────────────────────── */
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-white/70">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SubmitButton({
  signedIn,
  pending,
  disabled,
  onClick,
  children,
}: {
  signedIn: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="block text-center w-full mt-4 py-3 btn-forest text-white font-bold rounded-xl text-sm"
      >
        Sign in to book
      </Link>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={pending || disabled}
      className="w-full mt-4 py-3 btn-forest text-white font-bold rounded-xl disabled:opacity-50 transition-all text-sm"
    >
      {pending ? 'Processing…' : children}
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: session } = useSession();

  const { data: property, isLoading, isError } = useQuery<any>({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/properties/${id}`),
    enabled: !!id,
  });

  const book = useMutation({
    mutationFn: (args: BookingArgs) =>
      api
        .post(`/properties/${id}/bookings`, {
          ...args,
          email: session?.user?.email,
        })
        .then((r) => r.data),
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
        <div className="max-w-6xl mx-auto px-4 pt-24 pb-16 space-y-4">
          <div className="h-[420px] rounded-3xl skeleton" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="md:col-span-2 space-y-3">
              <div className="h-8 w-2/3 skeleton rounded" />
              <div className="h-4 w-1/2 skeleton rounded" />
              <div className="h-24 w-full skeleton rounded mt-6" />
            </div>
            <div className="h-72 skeleton rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !property) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 text-center">
          <h2 className="text-2xl font-black text-white mb-2">Listing not found</h2>
          <p className="text-white/50 text-sm mb-5">
            This place may have been removed or the link is broken.
          </p>
          <Link href="/stays" className="inline-flex items-center gap-1.5 text-gold/85 hover:text-gold text-sm font-semibold">
            <ArrowLeft size={13} /> Back to stays
          </Link>
        </div>
      </div>
    );
  }

  const images: string[] = [
    ...(property.coverImageUrl ? [property.coverImageUrl] : []),
    ...((property.imageUrls ?? []) as string[]).filter((u: string) => u !== property.coverImageUrl),
  ];
  const amenities: string[] = property.amenities ?? [];
  const highlights: string[] = property.highlights ?? [];
  const mode: string = property.bookingMode ?? 'NIGHTLY';
  const tLabel = typeLabel(property.type);
  const hasRating = property.rating != null && property.reviewCount != null;

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-6xl mx-auto px-4 pt-20 pb-16">

          {/* Back link */}
          <Link
            href="/stays"
            className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-4 transition-colors"
          >
            <ArrowLeft size={12} /> Back to all listings
          </Link>

          {/* Title row (mobile) */}
          <div className="mb-4 md:hidden">
            <h1 className="text-2xl font-black text-white">{property.name}</h1>
            <p className="text-white/55 text-sm">
              {tLabel} · {property.lga?.name ?? property.address ?? 'Ogun State'}
            </p>
          </div>

          {/* Gallery */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PhotoGallery images={images.length > 0 ? images : ['']} name={property.name} />
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-8"
          >
            {/* ── Left column ────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              <div className="hidden md:block">
                <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                  {property.name}
                </h1>
                <p className="text-white/55 text-base mt-1">
                  {tLabel} · hosted by Iṣẹ́yáá Platform · {property.lga?.name ?? property.address ?? 'Ogun State'}
                </p>
              </div>

              {hasRating && (
                <div className="flex items-center gap-2 text-sm">
                  <Star size={15} className="text-gold fill-gold" />
                  <span className="text-white font-bold">
                    {Number(property.rating).toFixed(1)}
                  </span>
                  <span className="text-white/45">· {property.reviewCount} review{property.reviewCount !== 1 ? 's' : ''}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-white/55 text-sm">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-gold" />
                  {property.lga?.name ?? property.address ?? 'Ogun State'}
                </span>
                {property.maxGuests ? (
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-gold" />
                    Up to {property.maxGuests} guests
                  </span>
                ) : null}
                {mode === 'HOURLY' && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-gold" />
                    Hourly bookings
                  </span>
                )}
                {mode === 'TIMED_EVENT' && (
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-gold" />
                    Scheduled experience
                  </span>
                )}
              </div>

              <hr className="border-white/8" />

              {property.description && (
                <section>
                  <h2 className="text-lg font-extrabold text-white mb-2">
                    About this {tLabel.toLowerCase()}
                  </h2>
                  <p className="text-white/70 leading-relaxed text-sm whitespace-pre-line">
                    {property.description}
                  </p>
                </section>
              )}

              {highlights.length > 0 && (
                <>
                  <hr className="border-white/8" />
                  <section>
                    <h2 className="text-lg font-extrabold text-white mb-3">What makes it special</h2>
                    <ul className="space-y-2.5">
                      {highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2.5 text-sm text-white/80">
                          <div className="w-6 h-6 rounded-lg bg-forest/20 border border-forest/30 flex items-center justify-center mt-0.5 shrink-0">
                            <Check size={13} className="text-forest-light" />
                          </div>
                          <span className="leading-relaxed">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              {amenities.length > 0 && (
                <>
                  <hr className="border-white/8" />
                  <section>
                    <h2 className="text-lg font-extrabold text-white mb-3">Amenities</h2>
                    <div className="flex flex-wrap gap-2">
                      {amenities.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-jungle-3 border border-white/10 text-xs font-semibold text-white/80 capitalize"
                        >
                          <Check size={11} className="text-forest-light" />
                          {a}
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              )}

              <hr className="border-white/8" />

              <section>
                <h2 className="text-lg font-extrabold text-white mb-3">Where you&apos;ll be</h2>
                <div className="aspect-[16/9] rounded-2xl bg-jungle-3 border border-white/10 flex flex-col items-center justify-center text-center px-6 py-8">
                  <MapPin size={32} className="text-forest-light/60 mb-3" />
                  <p className="text-white/85 text-sm font-semibold">
                    {property.address ?? property.lga?.name ?? 'Ogun State'}
                  </p>
                  {property.lga?.name && property.address && (
                    <p className="text-white/45 text-xs mt-1">{property.lga.name}, Ogun State</p>
                  )}
                </div>
              </section>
            </div>

            {/* ── Right column (booking) ─────────────────────────── */}
            <aside className="lg:col-span-1">
              <div
                className="bg-jungle-2/95 border border-white/12 rounded-2xl p-5 lg:sticky lg:top-24"
                style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}
              >
                {mode === 'NIGHTLY' && (
                  <NightlyForm
                    property={property}
                    onSubmit={(args) => book.mutate(args)}
                    pending={book.isPending}
                    signedIn={!!session}
                  />
                )}
                {mode === 'HOURLY' && (
                  <HourlyForm
                    property={property}
                    onSubmit={(args) => book.mutate(args)}
                    pending={book.isPending}
                    signedIn={!!session}
                  />
                )}
                {mode === 'TIMED_EVENT' && (
                  <TimedEventForm
                    property={property}
                    onSubmit={(args) => book.mutate(args)}
                    pending={book.isPending}
                    signedIn={!!session}
                  />
                )}
                {mode === 'MEMBERSHIP' && (
                  <MembershipForm
                    property={property}
                    onSubmit={(args) => book.mutate(args)}
                    pending={book.isPending}
                    signedIn={!!session}
                  />
                )}
              </div>
            </aside>
          </motion.div>
        </main>
      </PageTransition>
    </div>
  );
}
