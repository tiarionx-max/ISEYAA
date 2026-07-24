'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Navbar } from '@/components/layout/Navbar';
import { PageTransition } from '@/components/ui/PageTransition';
import { fetcher } from '@/lib/api';
import { ItineraryTimeline } from '@/components/tours/ItineraryTimeline';
import { TourBookingForm } from '@/components/tours/TourBookingForm';
import {
  MapPin, Users, Clock, Star, ArrowLeft, Map,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function PhotoGallery({ images, name }: { images: string[]; name: string }) {
  const [main, ...rest] = images;
  const sides = rest.slice(0, 4);

  if (!main) {
    return (
      <div className="rounded-3xl overflow-hidden bg-jungle-3 aspect-[16/9] flex items-center justify-center">
        <Map size={48} className="text-forest/40" />
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
      {sides.length > 0 &&
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
        ))}
      {Array.from({ length: Math.max(0, 4 - sides.length) }).map((_, i) => (
        <div
          key={`placeholder-${i}`}
          className="hidden md:block min-h-[206px] bg-jungle-3"
        />
      ))}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function TourDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { data: session } = useSession();

  const { data: tour, isLoading, isError } = useQuery<any>({
    queryKey: ['tour-package', slug],
    queryFn: () => fetcher(`/tour-packages/${slug}`),
    enabled: !!slug,
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

  if (isError || !tour) {
    return (
      <div className="min-h-screen bg-jungle text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 text-center">
          <h2 className="text-2xl font-black text-white mb-2">Tour not found</h2>
          <p className="text-white/50 text-sm mb-5">
            This tour may have been removed or the link is broken.
          </p>
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 text-gold/85 hover:text-gold text-sm font-semibold"
          >
            <ArrowLeft size={13} /> Back to tours
          </Link>
        </div>
      </div>
    );
  }

  const images: string[] = [
    ...(tour.coverImageUrl ? [tour.coverImageUrl] : []),
    ...((tour.imageUrls ?? []) as string[]).filter(
      (u: string) => u !== tour.coverImageUrl,
    ),
  ];

  const itinerary: any[] = tour.itineraryTemplate ?? [];
  const guideFullName = tour.tourGuide
    ? `${tour.tourGuide.user.firstName} ${tour.tourGuide.user.lastName}`
    : null;
  const hasRating = tour.rating != null && tour.reviewCount != null;
  const categoryLabel = tour.category
    ? tour.category.charAt(0) + tour.category.slice(1).toLowerCase()
    : 'Tour';

  return (
    <div className="min-h-screen bg-jungle text-white">
      <Navbar />
      <PageTransition>
        <main className="max-w-6xl mx-auto px-4 pt-20 pb-16">
          {/* Back */}
          <Link
            href="/tours"
            className="inline-flex items-center gap-1.5 text-white/45 hover:text-white text-xs font-medium mb-4 transition-colors"
          >
            <ArrowLeft size={12} /> Back to all tours
          </Link>

          {/* Mobile title */}
          <div className="mb-4 md:hidden">
            <h1 className="text-2xl font-black text-white">{tour.name}</h1>
            <p className="text-white/55 text-sm">
              {categoryLabel} · {tour.lga?.name ?? 'Ogun State'}
            </p>
          </div>

          {/* Gallery */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PhotoGallery
              images={images.length > 0 ? images : ['']}
              name={tour.name}
            />
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-8"
          >
            {/* ── Left column ─────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">
              <div className="hidden md:block">
                <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                  {tour.name}
                </h1>
                <p className="text-white/55 text-base mt-1">
                  {categoryLabel}
                  {guideFullName ? ` · Guide: ${guideFullName}` : ''}
                  {tour.lga?.name ? ` · ${tour.lga.name}` : ''}
                </p>
              </div>

              {/* Rating */}
              {hasRating && (
                <div className="flex items-center gap-2 text-sm">
                  <Star size={15} className="text-gold fill-gold" />
                  <span className="text-white font-bold">
                    {Number(tour.rating).toFixed(1)}
                  </span>
                  <span className="text-white/45">
                    · {tour.reviewCount}{' '}
                    {tour.reviewCount !== 1 ? 'reviews' : 'review'}
                  </span>
                </div>
              )}

              {/* Quick meta */}
              <div className="flex flex-wrap gap-4 text-white/55 text-sm">
                {tour.lga && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-gold" />
                    {tour.lga.name}, Ogun State
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-gold" />
                  {tour.durationHours}h duration
                </span>
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-gold" />
                  Max group size: {tour.maxGroupSize}
                </span>
              </div>

              <hr className="border-white/8" />

              {/* Description */}
              {tour.description && (
                <section>
                  <h2 className="text-lg font-extrabold text-white mb-2">
                    About this tour
                  </h2>
                  <p className="text-white/70 leading-relaxed text-sm whitespace-pre-line">
                    {tour.description}
                  </p>
                </section>
              )}

              {/* Itinerary */}
              {itinerary.length > 0 && (
                <>
                  <hr className="border-white/8" />
                  <section>
                    <h2 className="text-lg font-extrabold text-white mb-5">
                      Day itinerary
                    </h2>
                    <ItineraryTimeline items={itinerary} />
                  </section>
                </>
              )}

            </div>

            {/* ── Right column (booking) ─────────────────────────── */}
            <aside className="lg:col-span-1">
              <div
                className="bg-jungle-2/95 border border-white/12 rounded-2xl p-5 lg:sticky lg:top-24"
                style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.45)' }}
              >
                <div className="text-2xl font-black text-white mb-1">
                  ₦{Number(tour.price ?? 0).toLocaleString()}
                  <span className="text-sm text-white/45 font-normal"> / person</span>
                </div>

                <div className="mt-4">
                  <TourBookingForm
                    tourId={tour.id}
                    price={tour.price}
                    maxGroupSize={tour.maxGroupSize ?? 50}
                    signedIn={!!session}
                  />
                </div>
              </div>
            </aside>
          </motion.div>
        </main>
      </PageTransition>
    </div>
  );
}
