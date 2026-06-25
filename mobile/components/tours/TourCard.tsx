/**
 * TourCard — Phase 9, Plan 09-11
 *
 * 2-column grid card for the Tours sub-section of the Book hub.
 * Uses expo-image (NOT React Native Image) per project constraint.
 * All colors from tokens — no inline hex.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Star } from 'lucide-react-native';

import { PressableScale } from '../ui/PressableScale';
import {
  BORDER,
  CARD_COLORS,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_DIM,
  INK_MID,
  RADIUS_MD,
  RADIUS_PILL,
  SURFACE_RAISED,
} from '../../lib/tokens';

export type TourPackage = {
  id: string;
  slug: string;
  name: string;
  category?: string | null;
  pricePerPerson?: number | null;
  price?: number | null;
  coverImageUrl?: string | null;
  imageUrls?: string[];
  averageRating?: number | null;
  reviewCount?: number | null;
  lga?: { name?: string } | null;
  durationHours?: number | null;
};

type TourCardProps = {
  pkg: TourPackage;
  index?: number;
  cardWidth: number;
  onPress: (pkg: TourPackage) => void;
};

function formatCategory(cat?: string | null): string {
  if (!cat) return '';
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}

function formatPrice(pkg: TourPackage): string {
  const amount = pkg.pricePerPerson ?? pkg.price ?? 0;
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

export function TourCard({ pkg, index = 0, cardWidth, onPress }: TourCardProps): JSX.Element {
  const cover = pkg.coverImageUrl ?? pkg.imageUrls?.[0] ?? null;
  const fallback = CARD_COLORS[index % CARD_COLORS.length];
  const badge = formatCategory(pkg.category);
  const rating = pkg.averageRating;
  const priceStr = formatPrice(pkg);

  return (
    <PressableScale
      onPress={() => onPress(pkg)}
      style={[styles.card, { width: cardWidth }]}
    >
      {/* Hero image */}
      <View style={styles.hero}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={fallback}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(5,14,14,0.65)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Category badge — top-left */}
        {badge ? (
          <View style={styles.badgeTL}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}

        {/* Rating — top-right */}
        {rating != null ? (
          <View style={styles.starBR}>
            <Star size={10} color={GOLD} fill={GOLD} />
            <Text style={styles.starText}>{Number(rating).toFixed(1)}</Text>
          </View>
        ) : null}

        {/* Price — bottom-left */}
        <View style={styles.priceBL}>
          <Text style={styles.priceText}>{priceStr}</Text>
          <Text style={styles.priceSuffix}>/person</Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {pkg.name}
        </Text>
        <View style={styles.metaRow}>
          <MapPin size={10} color={INK_MID} />
          <Text style={styles.metaText} numberOfLines={1}>
            {pkg.lga?.name ?? 'Ogun State'}
          </Text>
        </View>
        {pkg.durationHours != null ? (
          <Text style={styles.durationText}>
            {pkg.durationHours}h experience
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_MD,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  hero: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  badgeTL: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  badgeText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  starBR: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(5,14,14,0.55)',
  },
  starText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: GOLD,
    fontWeight: '600',
  },
  priceBL: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(5,14,14,0.65)',
  },
  priceText: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: GOLD,
    fontWeight: '700',
  },
  priceSuffix: {
    fontFamily: FONT_UI,
    fontSize: 9,
    color: INK_MID,
  },
  body: {
    padding: 10,
    gap: 4,
  },
  title: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_MID,
    flex: 1,
  },
  durationText: {
    fontFamily: FONT_UI,
    fontSize: 10.5,
    color: INK_DIM,
    marginTop: 2,
  },
});
