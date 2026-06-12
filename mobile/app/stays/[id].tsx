/**
 * Stay Detail Screen — Plan 08-08 (Wave 4)
 *
 * Closes MOB-RD-04 (Stay detail mode-aware booking).
 *
 * Layout (mirrors web/src/app/stays/[id]/page.tsx, mobile-adapted):
 *   1. 4-image gallery — horizontal paged FlatList, dot indicators, expo-image
 *      Source: property.imageUrls (sliced to 4) with coverImageUrl fallback
 *   2. Title / location / rating row
 *   3. Highlights — CheckCircle2 + text vertical list
 *   4. Amenities — wrapped Chip pills
 *   5. Description
 *   6. Map placeholder (real maps deferred per CONTEXT §8.3 <deferred>)
 *   7. Sticky booking sheet at bottom — switches on property.bookingMode across 4 components
 *
 * Backend contract (verified in stays.controller.ts:94):
 *   POST /api/v1/properties/:id/bookings  body = { checkIn, checkOut, guests, email }
 *   (NOT the older path under stays — that path does not exist; H-3.)
 *
 * Email default: from `/users/me` session query (mirror checkout.tsx pattern).
 * Paystack handoff: expo-web-browser openAuthSessionAsync (same as checkout).
 *
 * H-4 disjoint ownership: this file does NOT touch _layout.tsx — `stays/[id]` was
 * already registered pre-Phase 8.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  StatusBar,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import {
  ChevronLeft,
  Heart,
  Share2,
  MapPin,
  Star,
  CheckCircle2,
  Home as HomeIcon,
} from 'lucide-react-native';

import { api, fetcher } from '../../lib/api';
import { Chip } from '../../components/ui/Chip';
import { PressableScale } from '../../components/ui/PressableScale';

import { NightlyBookingSheet } from '../../components/stays/NightlyBookingSheet';
import { HourlyBookingSheet } from '../../components/stays/HourlyBookingSheet';
import { TimedEventBookingSheet } from '../../components/stays/TimedEventBookingSheet';
import { MembershipBookingSheet } from '../../components/stays/MembershipBookingSheet';
import type {
  BookingArgs,
  Property as SheetProperty,
} from '../../components/stays/NightlyBookingSheet';

import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  FOREST_LIGHT,
  FOREST_DEEP,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  BORDER_SUBTLE,
  CARD_COLORS,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  RADIUS_MD,
  RADIUS_LG,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────
type Property = SheetProperty & {
  description?: string | null;
  imageUrls?: string[];
  coverImageUrl?: string | null;
  highlights?: string[];
  amenities?: string[];
  city?: string | null;
  address?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  isSuperhost?: boolean | null;
  lga?: { name?: string } | null;
};

type Me = { email?: string };

type BookingResponse = {
  bookingId?: string;
  reference?: string;
  payment?: { authorizationUrl?: string; reference?: string };
  authorizationUrl?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_HEIGHT = Math.round((SCREEN_WIDTH * 3) / 4); // 4:3
const GALLERY_COUNT = 4;

// ── Helpers ────────────────────────────────────────────────────────────────
function buildGallery(p: Property): (string | null)[] {
  const list = (p.imageUrls ?? []).filter(Boolean);
  if (list.length >= GALLERY_COUNT) return list.slice(0, GALLERY_COUNT);
  if (list.length > 0) {
    return [...list, ...Array(GALLERY_COUNT - list.length).fill(p.coverImageUrl ?? null)];
  }
  return Array(GALLERY_COUNT).fill(p.coverImageUrl ?? null);
}

// ── Screen ─────────────────────────────────────────────────────────────────
export default function StayDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Property
  const { data, isLoading, isError } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/properties/${id}`),
    enabled: !!id,
  });
  const property: Property | undefined = data?.data ?? data;

  // Session (for defaultEmail)
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    staleTime: 60_000,
    retry: false,
  });
  const signedIn = !!me?.email; // me query only succeeds for authenticated users
  const defaultEmail = me?.email ?? null;

  // Booking mutation — POST /api/v1/properties/:id/bookings
  const bookingMutation = useMutation<BookingResponse, any, BookingArgs>({
    mutationFn: async (args: BookingArgs) => {
      const res = await api.post(`/properties/${property?.id}/bookings`, args);
      return res.data as BookingResponse;
    },
    onSuccess: async (resp) => {
      // Defensive read — mirrors checkout.tsx (08-06)
      const url = resp.payment?.authorizationUrl ?? resp.authorizationUrl;
      if (!url) {
        Alert.alert(
          'Booking created',
          'No payment URL returned — check your bookings list.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/profile') }],
        );
        return;
      }
      try {
        await WebBrowser.openAuthSessionAsync(url, 'iseyaa://booking-callback');
      } catch (err: any) {
        Alert.alert(
          'Payment opened',
          err?.message ?? 'Open the payment link from your email to complete.',
        );
      }
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Booking failed. Please try again.';
      Alert.alert('Booking failed', Array.isArray(msg) ? msg.join('\n') : String(msg));
    },
  });

  const handleSubmit = useCallback(
    (args: BookingArgs) => bookingMutation.mutate(args),
    [bookingMutation],
  );

  const handleShare = useCallback(() => {
    if (!property) return;
    Share.share({
      title: property.name ?? 'Stay',
      message: `Check out ${property.name ?? 'this stay'} on Iṣẹ́yáá!`,
    }).catch(() => {
      /* user dismissed */
    });
  }, [property]);

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (idx !== galleryIndex) setGalleryIndex(idx);
  };

  // ── Loading / Error ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[s.root, s.centered]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }
  if (isError || !property) {
    return (
      <View style={[s.root, s.centered]}>
        <StatusBar barStyle="light-content" />
        <Text style={s.errorText}>This listing could not be loaded.</Text>
        <PressableScale onPress={() => router.back()} style={s.errorBtn} hapticStyle="light">
          <Text style={s.errorBtnText}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  const gallery = buildGallery(property);
  const location =
    property.city ??
    property.address ??
    property.lga?.name ??
    'Ogun State, Nigeria';
  const highlights = property.highlights ?? [];
  const amenities = property.amenities ?? [];

  const sheetProps = {
    property,
    pending: bookingMutation.isPending,
    signedIn,
    defaultEmail,
    onSubmit: handleSubmit,
  };

  const renderSheet = () => {
    switch (property.bookingMode) {
      case 'HOURLY':
        return <HourlyBookingSheet {...sheetProps} />;
      case 'TIMED_EVENT':
        return <TimedEventBookingSheet {...sheetProps} />;
      case 'MEMBERSHIP':
        return <MembershipBookingSheet {...sheetProps} />;
      case 'NIGHTLY':
      default:
        return <NightlyBookingSheet {...sheetProps} />;
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 360 }}
      >
        {/* ── 4-image gallery — horizontal paged ── */}
        <View style={{ height: GALLERY_HEIGHT, width: SCREEN_WIDTH }}>
          <FlatList
            ref={flatListRef}
            data={gallery}
            keyExtractor={(_, i) => `g-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onGalleryScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <View style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}>
                {item ? (
                  <ExpoImage
                    source={{ uri: item }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <LinearGradient
                    colors={CARD_COLORS[index % CARD_COLORS.length]}
                    style={StyleSheet.absoluteFillObject}
                  >
                    <View style={s.galleryFallback}>
                      <HomeIcon size={48} color={INK_FAINT} strokeWidth={1.5} />
                    </View>
                  </LinearGradient>
                )}
              </View>
            )}
          />

          {/* Top overlay: back + share + heart */}
          <View style={[s.heroNav, { top: insets.top + 12 }]} pointerEvents="box-none">
            <PressableScale
              onPress={() => router.back()}
              style={s.overlayBtn}
              hapticStyle="light"
            >
              <ChevronLeft size={20} color={INK} strokeWidth={2.2} />
            </PressableScale>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale
                onPress={() => setLiked((v) => !v)}
                style={s.overlayBtn}
                hapticStyle="light"
              >
                <Heart
                  size={18}
                  color={liked ? GOLD : INK}
                  fill={liked ? GOLD : 'none'}
                  strokeWidth={2}
                />
              </PressableScale>
              <PressableScale onPress={handleShare} style={s.overlayBtn} hapticStyle="light">
                <Share2 size={18} color={INK} strokeWidth={2} />
              </PressableScale>
            </View>
          </View>

          {/* Dot indicators */}
          <View style={s.dotsRow} pointerEvents="none">
            {gallery.map((_, i) => (
              <View
                key={`dot-${i}`}
                style={i === galleryIndex ? s.dotActive : s.dotInactive}
              />
            ))}
          </View>
        </View>

        {/* ── Title + location + rating ── */}
        <View style={s.titleSection}>
          <Text style={s.title} numberOfLines={2}>
            {property.name ?? 'Property'}
          </Text>
          <View style={s.locationRow}>
            <MapPin size={14} color={GOLD} strokeWidth={2} />
            <Text style={s.locationText} numberOfLines={1}>
              {location}
            </Text>
          </View>
          {property.rating != null && (
            <View style={s.ratingRow}>
              <Star size={14} color={GOLD} fill={GOLD} strokeWidth={2} />
              <Text style={s.ratingText}>
                {Number(property.rating).toFixed(1)}
                {property.reviewCount
                  ? ` · ${property.reviewCount} review${property.reviewCount === 1 ? '' : 's'}`
                  : ''}
              </Text>
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* ── Highlights ── */}
        {highlights.length > 0 && (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>HIGHLIGHTS</Text>
              <View style={s.highlightsList}>
                {highlights.map((h) => (
                  <View key={h} style={s.highlightRow}>
                    <CheckCircle2 size={18} color={FOREST_LIGHT} strokeWidth={2} />
                    <Text style={s.highlightText}>{h}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── Amenities ── */}
        {amenities.length > 0 && (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>AMENITIES</Text>
              <View style={s.amenitiesWrap}>
                {amenities.map((a) => (
                  <Chip key={a} label={a} />
                ))}
              </View>
            </View>
            <View style={s.divider} />
          </>
        )}

        {/* ── Description ── */}
        {property.description ? (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>ABOUT THIS STAY</Text>
              <Text style={s.description}>{property.description}</Text>
            </View>
            <View style={s.divider} />
          </>
        ) : null}

        {/* ── Map placeholder (real maps deferred — CONTEXT §8.3) ── */}
        <View style={s.section}>
          <Text style={s.kicker}>WHERE YOU&apos;LL BE</Text>
          <View style={s.mapPlaceholder}>
            <MapPin size={32} color={FOREST_LIGHT} strokeWidth={1.5} />
            <Text style={s.mapPlaceholderTitle}>{location}</Text>
            {property.lga?.name ? (
              <Text style={s.mapPlaceholderSub}>{property.lga.name}, Ogun State</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky booking sheet ── */}
      <View
        style={[s.stickyWrap, { paddingBottom: insets.bottom }]}
        pointerEvents="box-none"
      >
        {renderSheet()}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACE_3 },
  errorText: { ...TYPE.body, color: INK_SECONDARY, textAlign: 'center', paddingHorizontal: SPACE_4 },
  errorBtn: {
    backgroundColor: SURFACE_RAISED,
    borderColor: BORDER_SUBTLE,
    borderWidth: 1,
    paddingHorizontal: SPACE_5,
    paddingVertical: SPACE_3,
    borderRadius: RADIUS_MD,
  },
  errorBtnText: { ...TYPE.bodyEmphasis, color: INK },

  // Gallery
  galleryFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroNav: {
    position: 'absolute',
    left: SPACE_4,
    right: SPACE_4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  overlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    position: 'absolute',
    bottom: SPACE_4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // Title
  titleSection: { paddingHorizontal: SPACE_4, paddingTop: SPACE_5, gap: SPACE_2 },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 26,
    color: CREAM,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { ...TYPE.body, color: INK_SECONDARY, fontSize: 13, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    fontWeight: '700',
    color: GOLD,
    fontVariant: ['tabular-nums'],
  },

  // Sections
  divider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
    marginVertical: SPACE_5,
    marginHorizontal: SPACE_4,
  },
  section: { paddingHorizontal: SPACE_4, gap: SPACE_3 },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    letterSpacing: 1.8,
    color: GOLD,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  highlightsList: { gap: SPACE_3 },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE_3 },
  highlightText: { ...TYPE.body, color: INK, flex: 1 },

  amenitiesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE_2 },

  description: { ...TYPE.body, color: INK_SECONDARY, lineHeight: 22 },

  // Map placeholder
  mapPlaceholder: {
    backgroundColor: SURFACE_MID,
    borderColor: BORDER_SUBTLE,
    borderWidth: 1,
    borderRadius: RADIUS_LG,
    paddingHorizontal: SPACE_4,
    paddingVertical: SPACE_5 * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapPlaceholderTitle: { ...TYPE.bodyEmphasis, color: CREAM, fontSize: 13 },
  mapPlaceholderSub: { ...TYPE.caption, color: INK_FAINT },

  // Sticky sheet wrapper
  stickyWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
