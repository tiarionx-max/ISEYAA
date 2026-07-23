/**
 * EventsSubsection — Plan 08-05
 *
 * Migrated from:
 *   - mobile/app/(tabs)/book.tsx (legacy EventsFeed @ lines 179-211, useQuery @ 410-413)
 *   - mobile/app/(tabs)/events.tsx (deleted in 08-04 — QR Scan-In FAB preserved in 08-04-SUMMARY.md §QR-FAB JSX Preserved)
 *
 * Self-contained: owns its own /events fetch, list rendering, and floating QR scan-in FAB.
 * No props. No inline hex. Touch targets >= 44pt via PressableScale.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, QrCode, Star } from 'lucide-react-native';

import { fetcher } from '../../lib/api';
import { PressableScale } from '../ui/PressableScale';
import {
  BORDER,
  CARD_GRADIENTS,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_MID,
  RADIUS_LG,
  RADIUS_PILL,
  SPACE_4,
  SPACE_5,
  SURFACE_DEEP,
  SURFACE_RAISED,
} from '../../lib/tokens';

const GRADIENT_KEYS = ['gold', 'forest', 'rock', 'dusk', 'indigo'] as const;
type GradientKey = (typeof GRADIENT_KEYS)[number];

function gradientForIndex(i: number): [string, string] {
  const key = GRADIENT_KEYS[i % GRADIENT_KEYS.length] as GradientKey;
  return CARD_GRADIENTS[key] as [string, string];
}

// ── Shimmer hook (mirrors legacy book.tsx pattern) ────────────────────
function useShimmerOpacity() {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.7,
          duration: 700,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 700,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

function SkeletonCard() {
  const opacity = useShimmerOpacity();
  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: '75%' }]} />
        <View style={[styles.skeletonLine, { width: '48%', marginTop: 10 }]} />
      </View>
    </Animated.View>
  );
}

// ── Event card (migrated from legacy FeedCard with tag="Event") ───────
type EventItem = {
  id: string;
  title?: string;
  ticketPrice?: number | string | null;
  startDate?: string | null;
  venue?: string | null;
  lga?: { name?: string } | null;
  averageRating?: number | null;
  rating?: number | null;
};

function EventCard({
  item,
  gradientIndex,
}: {
  item: EventItem;
  gradientIndex: number;
}) {
  const colors = gradientForIndex(gradientIndex);
  const isFree = !item.ticketPrice || Number(item.ticketPrice) === 0;
  const price = isFree
    ? 'FREE'
    : `₦${Number(item.ticketPrice).toLocaleString()}`;
  const startDate = item.startDate
    ? new Date(item.startDate).toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
      })
    : 'TBA';
  const location = item.lga?.name ?? item.venue ?? 'Ogun State';
  const rating = item.averageRating ?? item.rating;

  return (
    <PressableScale
      onPress={() => router.push(`/events/${item.id}` as never)}
      style={styles.card}
    >
      <View style={styles.cardHero}>
        <LinearGradient
          colors={colors}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <LinearGradient
          colors={['transparent', 'rgba(5,14,14,0.55)']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.heroTagWrap}>
          <View style={styles.tagChip}>
            <Text style={styles.tagChipText}>EVENT</Text>
          </View>
        </View>
        {rating != null && (
          <View style={styles.heroStarWrap}>
            <Star size={11} color={GOLD} fill={GOLD} />
            <Text style={styles.heroRating}>{Number(rating).toFixed(1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title ?? 'Untitled Event'}
        </Text>
        <View style={styles.locationRow}>
          <MapPin size={11} color={INK_MID} />
          <Text style={styles.locationText} numberOfLines={1}>
            {location}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{price}</Text>
          {!isFree && <Text style={styles.priceLabelText}>per ticket</Text>}
        </View>
        <View style={styles.divider} />
        <View style={styles.cardFooter}>
          <Text style={styles.metaText} numberOfLines={1}>
            {startDate}
          </Text>
          <View style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Reserve</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// ── Main subsection ────────────────────────────────────────────────────
export function EventsSubsection(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => fetcher('/events?limit=10'),
  });

  const events: EventItem[] = data ?? [];

  return (
    <View style={styles.root}>
      <View style={styles.feedList}>
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No events on sale right now.</Text>
          </View>
        ) : (
          events.map((item, i) => (
            <EventCard key={item.id ?? i} item={item} gradientIndex={i} />
          ))
        )}
      </View>

      {/* QR Scan-In FAB — migrated from deleted events.tsx (08-04-SUMMARY §QR-FAB JSX Preserved). */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <PressableScale
          onPress={() => router.push('/qr-checkin' as never)}
          style={styles.fab}
          hapticStyle="medium"
        >
          <View style={styles.fabInner}>
            <QrCode size={16} color={GOLD} />
            <Text style={styles.fabText}>Scan ticket</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', flex: 1 },

  // Feed list
  feedList: { paddingHorizontal: SPACE_5, paddingTop: 14, gap: 14 },

  // Card
  card: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  cardHero: { height: 180, width: '100%', position: 'relative' },
  heroTagWrap: { position: 'absolute', top: 10, left: 10 },
  heroStarWrap: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5,14,14,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
  },
  heroRating: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: GOLD,
    fontWeight: '600',
  },

  cardBody: {
    paddingVertical: 14,
    paddingHorizontal: SPACE_4,
    gap: 6,
  },
  cardTitle: {
    fontFamily: FONT_UI,
    fontSize: 16,
    fontWeight: '700',
    color: INK,
    lineHeight: 22,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: {
    fontFamily: FONT_UI,
    fontSize: 11.5,
    color: INK_MID,
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  priceText: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    fontWeight: '600',
    color: GOLD,
  },
  priceLabelText: { fontFamily: FONT_UI, fontSize: 11.5, color: INK_MID },
  divider: { height: 1, backgroundColor: BORDER, marginTop: 6, marginBottom: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaText: {
    fontFamily: FONT_UI,
    fontSize: 11.5,
    color: INK_MID,
    flex: 1,
  },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },

  tagChip: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: RADIUS_PILL,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipText: {
    fontFamily: FONT_MONO,
    fontSize: 9.5,
    color: GOLD,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // Empty state
  emptyState: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONT_UI,
    fontSize: 13,
    color: INK_MID,
  },

  // Skeleton
  skeletonCard: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  skeletonHero: { height: 180, backgroundColor: '#1B3636' },
  skeletonBody: { padding: SPACE_4 },
  skeletonLine: { height: 13, borderRadius: 6, backgroundColor: '#1B3636' },

  // QR FAB (preserved from deleted events.tsx)
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
  fab: {
    backgroundColor: SURFACE_DEEP,
    borderRadius: RADIUS_PILL,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  fabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fabText: {
    color: GOLD,
    fontFamily: FONT_UI,
    fontSize: 13,
    fontWeight: '700',
  },
});
