/**
 * My Trips — Phase 9, Plan 09-11
 *
 * Lists all the citizen's tour bookings from GET /api/v1/tour-bookings/me.
 * Divided into two sections:
 *   - Upcoming: tourDate >= today AND status in (PENDING, CONFIRMED)
 *   - Past:     tourDate < today OR status in (CHECKED_OUT, CANCELLED, REFUNDED)
 *
 * Empty state: "No tours yet — explore packages in the Book tab"
 * Closes TOUR-06 (mobile-side).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ListRenderItemInfo,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { ChevronLeft, MapPin, CalendarDays, Clock } from 'lucide-react-native';

import { fetcher } from '../../lib/api';
import { PressableScale } from '../../components/ui/PressableScale';
import {
  BORDER,
  BORDER_SUBTLE,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  GOLD,
  GOLD_DIM,
  GOLD_LINE,
  INK,
  INK_FAINT,
  INK_MID,
  INK_SECONDARY,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_PILL,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  SUCCESS,
  SUCCESS_DIM,
  SUCCESS_TEXT,
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  TYPE,
  DESTRUCTIVE,
  DESTRUCTIVE_DIM,
  WARNING,
  WARNING_DIM,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'REFUNDED';

type TourBooking = {
  id: string;
  tourDate: string; // ISO date string
  status: BookingStatus;
  passengerCount?: number;
  totalAmount?: number;
  tourPackage?: {
    id: string;
    slug: string;
    name?: string | null;
    coverImageUrl?: string | null;
    durationHours?: number | null;
    lga?: { name?: string } | null;
  } | null;
};

// ── Status pill helpers ────────────────────────────────────────────────────

type StatusStyle = {
  label: string;
  textColor: string;
  bgColor: string;
};

function statusStyle(s: BookingStatus): StatusStyle {
  switch (s) {
    case 'CONFIRMED':
      return { label: 'Confirmed', textColor: SUCCESS_TEXT, bgColor: SUCCESS_DIM };
    case 'PENDING':
      return { label: 'Pending', textColor: WARNING, bgColor: WARNING_DIM };
    case 'CHECKED_IN':
      return { label: 'Checked in', textColor: GOLD, bgColor: GOLD_DIM };
    case 'CHECKED_OUT':
      return { label: 'Completed', textColor: INK_MID, bgColor: 'rgba(255,255,255,0.06)' };
    case 'CANCELLED':
      return { label: 'Cancelled', textColor: DESTRUCTIVE, bgColor: DESTRUCTIVE_DIM };
    case 'REFUNDED':
      return { label: 'Refunded', textColor: INK_MID, bgColor: 'rgba(255,255,255,0.06)' };
    default:
      return { label: String(s), textColor: INK_MID, bgColor: 'rgba(255,255,255,0.06)' };
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    // tourDate is always serialized as midnight UTC (@db.Date on the backend) — format
    // in UTC so the displayed calendar day doesn't shift on devices with a negative
    // UTC offset.
    return d.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return iso;
  }
}

// ── Booking row ────────────────────────────────────────────────────────────

function BookingRow({ booking }: { booking: TourBooking }): JSX.Element {
  const { label, textColor, bgColor } = statusStyle(booking.status);
  const cover = booking.tourPackage?.coverImageUrl ?? null;
  const location = booking.tourPackage?.lga?.name ?? 'Ogun State';

  function handlePress() {
    if (booking.tourPackage?.slug) {
      router.push(`/tours/${booking.tourPackage.slug}` as any);
    }
  }

  return (
    <PressableScale onPress={handlePress} style={styles.bookingRow}>
      {/* Thumbnail */}
      <View style={styles.thumb}>
        {cover ? (
          <ExpoImage
            source={{ uri: cover }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.thumbFallback]} />
        )}
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>
          {booking.tourPackage?.name ?? 'Tour Package'}
        </Text>
        <View style={styles.rowMeta}>
          <CalendarDays size={11} color={INK_MID} strokeWidth={2} />
          <Text style={styles.rowMetaText}>{formatDate(booking.tourDate)}</Text>
        </View>
        <View style={styles.rowMeta}>
          <MapPin size={11} color={INK_MID} strokeWidth={2} />
          <Text style={styles.rowMetaText} numberOfLines={1}>{location}</Text>
        </View>
        {booking.tourPackage?.durationHours != null ? (
          <View style={styles.rowMeta}>
            <Clock size={11} color={INK_MID} strokeWidth={2} />
            <Text style={styles.rowMetaText}>{booking.tourPackage.durationHours}h</Text>
          </View>
        ) : null}
      </View>

      {/* Status pill */}
      <View style={[styles.statusPill, { backgroundColor: bgColor }]}>
        <Text style={[styles.statusText, { color: textColor }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; title: string; count: number }
  | { type: 'booking'; booking: TourBooking };

export default function TripsScreen(): JSX.Element {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tour-bookings-me'],
    queryFn: () => fetcher('/tour-bookings/me'),
    staleTime: 30_000,
  });

  const bookings: TourBooking[] = data?.data ?? data ?? [];

  const today = useMemo(() => {
    const d = new Date();
    // Zero out using UTC getters (not setHours/local getters) so this lines up with
    // tourDate, which the backend always serializes as midnight UTC. Using local
    // getters here would shift the calendar day on devices with a negative UTC
    // offset, causing an off-by-one classification/display bug.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }, []);

  const { upcoming, past } = useMemo(() => {
    const upcomingStatuses = new Set<BookingStatus>(['PENDING', 'CONFIRMED', 'CHECKED_IN']);
    const up: TourBooking[] = [];
    const pa: TourBooking[] = [];
    for (const b of bookings) {
      const rawTourD = new Date(b.tourDate);
      const tourD = new Date(
        Date.UTC(rawTourD.getUTCFullYear(), rawTourD.getUTCMonth(), rawTourD.getUTCDate())
      );
      if (tourD >= today && upcomingStatuses.has(b.status)) {
        up.push(b);
      } else {
        pa.push(b);
      }
    }
    // Sort upcoming ascending, past descending
    up.sort((a, b) => new Date(a.tourDate).getTime() - new Date(b.tourDate).getTime());
    pa.sort((a, b) => new Date(b.tourDate).getTime() - new Date(a.tourDate).getTime());
    return { upcoming: up, past: pa };
  }, [bookings, today]);

  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    if (upcoming.length > 0) {
      items.push({ type: 'header', title: 'Upcoming', count: upcoming.length });
      upcoming.forEach((b) => items.push({ type: 'booking', booking: b }));
    }
    if (past.length > 0) {
      items.push({ type: 'header', title: 'Past', count: past.length });
      past.forEach((b) => items.push({ type: 'booking', booking: b }));
    }
    return items;
  }, [upcoming, past]);

  function renderItem({ item }: ListRenderItemInfo<ListItem>) {
    if (item.type === 'header') {
      return <SectionHeader title={item.title} count={item.count} />;
    }
    return <BookingRow booking={item.booking} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={INK} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>My trips</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centeredState}>
          <Text style={styles.emptyText}>Could not load trips.</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : listItems.length === 0 ? (
        <View style={styles.centeredState}>
          <MapPin size={40} color={GOLD} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No tours yet</Text>
          <Text style={styles.emptyText}>
            Explore tour packages in the Book tab to get started.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/book' as any)}
            style={styles.ctaBtn}
            accessibilityRole="button"
          >
            <Text style={styles.ctaBtnText}>Browse tours</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) =>
            item.type === 'header' ? `h-${item.title}` : `b-${item.booking.id}-${i}`
          }
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const THUMB_SIZE = 72;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE_DEEP },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE_4,
    paddingTop: SPACE_4,
    paddingBottom: SPACE_3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: INK,
    letterSpacing: -0.3,
  },

  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE_5,
    gap: SPACE_3,
  },
  emptyTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: INK,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyText: {
    ...TYPE.body,
    color: INK_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaBtn: {
    height: 48,
    paddingHorizontal: SPACE_5,
    borderRadius: RADIUS_LG,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE_2,
  },
  ctaBtnText: {
    fontFamily: FONT_UI,
    fontSize: 15,
    fontWeight: '700',
    color: SURFACE_DEEP,
  },
  retryBtn: {
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  retryText: { ...TYPE.body, color: INK, fontWeight: '600' },

  // List
  listContent: {
    paddingVertical: SPACE_4,
    paddingHorizontal: SPACE_4,
    paddingBottom: 100,
  },
  separator: { height: SPACE_3 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE_3,
    paddingTop: SPACE_4,
  },
  sectionTitle: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: GOLD,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: INK_FAINT,
  },

  // Booking row
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE_3,
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACE_3,
    minHeight: 88,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: RADIUS_MD,
    backgroundColor: SURFACE_MID,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbFallback: { backgroundColor: SURFACE_MID },
  rowInfo: { flex: 1, gap: SPACE_2 },
  rowName: {
    fontFamily: FONT_UI,
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    lineHeight: 18,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowMetaText: {
    fontFamily: FONT_UI,
    fontSize: 11,
    color: INK_SECONDARY,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS_PILL,
    flexShrink: 0,
  },
  statusText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
