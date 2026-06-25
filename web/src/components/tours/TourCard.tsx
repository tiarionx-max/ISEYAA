'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Users, Clock, Star, Heart, Map } from 'lucide-react';
import type { TourPackageCategory } from '@/lib/tour-categories';

export interface TourPackageSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: TourPackageCategory;
  price: number | string;
  durationHours: number;
  maxGroupSize: number;
  coverImageUrl: string | null;
  imageUrls: string[];
  rating: number | null;
  reviewCount: number;
  lga?: { name: string; slug: string } | null;
  tourGuide?: { user: { firstName: string; lastName: string } } | null;
}

function TourCardSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="aspect-square rounded-2xl skeleton" />
      <div className="h-4 skeleton rounded-lg w-3/4" />
      <div className="h-3 skeleton rounded-lg w-1/2" />
      <div className="h-3 skeleton rounded-lg w-2/5" />
    </div>
  );
}

export { TourCardSkeleton };

export function TourCard({
  tour,
  index = 0,
  liked = false,
  onToggleLike,
}: {
  tour: TourPackageSummary;
  index?: number;
  liked?: boolean;
  onToggleLike?: (id: string) => void;
}) {
  const cover = tour.coverImageUrl ?? tour.imageUrls?.[0] ?? null;
  const guideFullName = tour.tourGuide
    ? `${tour.tourGuide.user.firstName} ${tour.tourGuide.user.lastName}`
    : null;
  const price = `₦${Number(tour.price ?? 0).toLocaleString()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <Link
        href={`/tours/${tour.slug}`}
        className="block rounded-2xl overflow-hidden transition-shadow duration-300 hover:shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      >
        {/* Image */}
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-jungle-3">
          {cover ? (
            <Image
              src={cover}
              alt={tour.name}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              className="object-cover group-hover:scale-[1.04] transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-forest-gradient">
              <Map size={36} className="text-forest/40" />
            </div>
          )}

          {/* Category badge */}
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-black/65 backdrop-blur-sm border border-white/15 text-white/85 text-[10px] font-semibold capitalize">
              {tour.category.charAt(0) + tour.category.slice(1).toLowerCase()}
            </span>
          </div>

          {/* Heart */}
          {onToggleLike && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleLike(tour.id);
              }}
              className="absolute top-3 right-3 w-8 h-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/55 backdrop-blur-sm border border-white/15 hover:bg-black/75 transition-colors"
              aria-label={liked ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Heart
                size={15}
                className={liked ? 'fill-red-500 text-red-500' : 'text-white/85'}
              />
            </button>
          )}
        </div>

        {/* Below image */}
        <div className="pt-3 pb-1 px-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-white text-[15px] line-clamp-1">{tour.name}</h3>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1 text-white/45 text-xs">
            {tour.lga && (
              <span className="flex items-center gap-1">
                <MapPin size={10} className="text-gold" />
                {tour.lga.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={10} className="text-gold" />
              {tour.durationHours}h
            </span>
            <span className="flex items-center gap-1">
              <Users size={10} className="text-gold" />
              Max {tour.maxGroupSize}
            </span>
          </div>

          {/* Rating */}
          {tour.rating != null && (
            <div className="flex items-center gap-1 mt-1 text-xs">
              <Star size={11} className="text-gold fill-gold" />
              <span className="text-white font-bold">{Number(tour.rating).toFixed(1)}</span>
              <span className="text-white/40">({tour.reviewCount})</span>
            </div>
          )}

          {/* Guide name */}
          {guideFullName && (
            <p className="text-white/35 text-[11px] mt-0.5 line-clamp-1">
              Guide: {guideFullName}
            </p>
          )}

          {/* Price */}
          <p className="text-white/85 text-sm mt-1.5">
            <span className="font-bold text-white">{price}</span>{' '}
            <span className="text-white/45 text-xs">/ person</span>
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
