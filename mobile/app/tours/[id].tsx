/**
 * Tour Detail Screen — Phase 9, Plan 09-11
 *
 * NOTE: The `[id]` segment receives a SLUG value — the route name is `[id]` for
 * expo-router consistency (matches stays/[id] pattern) but the value passed by
 * book.tsx is `pkg.slug`. The query fetches GET /tour-packages/:slug.
 *
 * Layout:
 *   1. Horizontal paged FlatList gallery (imageUrls or coverImageUrl fallback)
 *   2. Name, LGA badge, rating row
 *   3. Description
 *   4. Itinerary timeline (ItineraryTimeline)
 *   5. Guide profile card (if guideProfile present)
 *   6. Sticky TourBookingSheet at bottom
 *
 * Booking flow:
 *   POST /api/v1/tour-bookings
 *   → response.payment.authorizationUrl → WebBrowser.openAuthSessionAsync
 *   → response.splitBillJoinLink → SplitBillShareSheet shown
 *
 * Closes TOUR-05 (mobile-side).
 */

import React, { useCallback, useRef, useState } from 'react';
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
  Clock,
  Users,
} from 'lucide-react-native';

import { api, fetcher } from '../../lib/api';
import { PressableScale } from '../../components/ui/PressableScale';
import { Chip } from '../../components/ui/Chip';
import { ItineraryTimeline, type ItineraryItem } from '../../components/tours/ItineraryTimeline';
import { TourBookingSheet, type TourBookingArgs } from '../../components/tours/TourBookingSheet';
import { SplitBillShareSheet } from '../../components/tours/SplitBillShareSheet';

import {
  SURFACE_DEEP,
  SURFACE_MID,
  SURFACE_RAISED,
  GOLD,
  FOREST_LIGHT,
  CREAM,
  INK,
  INK_SECONDARY,
  INK_FAINT,
  BORDER_SUBTLE,
  CARD_COLORS,
  TYPE,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_UI,
  SPACE_2,
  SPACE_3,
  SPACE_4,
  SPACE_5,
  RADIUS_MD,
  RADIUS_LG,
  RADIUS_PILL,
} from '../../lib/tokens';

// ── Types ──────────────────────────────────────────────────────────────────

type GuideProfile = {
  id: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  languages?: string[];
  averageRating?: number | null;
};

type TourPackage = {
  id: string;
  slug: string;
  name?: string;
  category?: string | null;
  description?: string | null;
  pricePerPerson?: number | null;
  price?: number | null;
  maxGroupSize?: number | null;
  durationHours?: number | null;
  coverImageUrl?: string | null;
  imageUrls?: string[];
  averageRating?: number | null;
  reviewCount?: number | null;
  lga?: { name?: string } | null;
  itinerary?: ItineraryItem[];
  guideProfile?: GuideProfile | null;
  attractionIds?: string[];
  propertyId?: string | null;
};

type Me = { email?: string };

type TourBookingResponse = {
  id?: string;
  payment?: { authorizationUrl?: string };
  authorizationUrl?: string;
  splitBillJoinLink?: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_HEIGHT = Math.round((SCREEN_WIDTH * 3) / 4); // 4:3
const GALLERY_COUNT = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function buildGallery(pkg: TourPackage): (string | null)[] {
  const list = (pkg.imageUrls ?? []).filter(Boolean);
  if (list.length >= GALLERY_COUNT) return list.slice(0, GALLERY_COUNT);
  if (list.length > 0) {
    return [...list, ...Array(GALLERY_COUNT - list.length).fill(pkg.coverImageUrl ?? null)];
  }
  return Array(GALLERY_COUNT).fill(pkg.coverImageUrl ?? null);
}

function categoryLabel(cat?: string | null): string {
  if (!cat) return '';
  return cat.charAt(0) + cat.slice(1).toLowerCase();
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function TourDetailScreen(): JSX.Element {
  // NOTE: `id` here is actually the package slug — see file-level comment.
  const { id: slug } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [splitSheetVisible, setSplitSheetVisible] = useState(false);
  const [splitLink, setSplitLink] = useState('');
  const flatListRef = useRef<FlatList>(null);

  // Package data
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tour-package', slug],
    queryFn: () => fetcher(`/tour-packages/${slug}`),
    enabled: !!slug,
  });
  const pkg: TourPackage | undefined = data?.data ?? data;

  // Session (for defaultEmail)
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
    staleTime: 60_000,
    retry: false,
  });
  const signedIn = !!me?.email;
  const defaultEmail = me?.email ?? null;

  // Booking mutation
  const bookingMutation = useMutation<TourBookingResponse, any, TourBookingArgs>({
    mutationFn: async (args: TourBookingArgs) => {
      const res = await api.post('/tour-bookings', {
        tourPackageId: pkg?.id,
        ...args,
      });
      return res.data as TourBookingResponse;
    },
    onSuccess: async (resp) => {
      const url = resp.payment?.authorizationUrl ?? resp.authorizationUrl;

      // If split-bill link is present, show the share sheet
      if (resp.splitBillJoinLink) {
        setSplitLink(resp.splitBillJoinLink);
        setSplitSheetVisible(true);
      }

      if (!url) {
        if (!resp.splitBillJoinLink) {
          Alert.alert(
            'Booking created',
            'No payment URL returned — check My Trips for status.',
            [{ text: 'OK', onPress: () => router.push('/trips' as any) }],
          );
        }
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
    (args: TourBookingArgs) => bookingMutation.mutate(args),
    [bookingMutation],
  );

  const handleShare = useCallback(() => {
    if (!pkg) return;
    Share.share({
      title: pkg.name ?? 'Tour',
      message: `Check out ${pkg.name ?? 'this tour'} on Iṣẹ́yáá!`,
    }).catch(() => {/* user dismissed */});
  }, [pkg]);

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
  if (isError || !pkg) {
    return (
      <View style={[s.root, s.centered]}>
        <StatusBar barStyle="light-content" />
        <Text style={s.errorText}>This tour could not be loaded.</Text>
        <PressableScale onPress={() => router.back()} style={s.errorBtn} hapticStyle="light">
          <Text style={s.errorBtnText}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  const gallery = buildGallery(pkg);
  const location = pkg.lga?.name ?? 'Ogun State, Nigeria';
  const itinerary = pkg.itinerary ?? [];
  const guide = pkg.guideProfile;
  const catLabel = categoryLabel(pkg.category);

  const sheetPkg = {
    id: pkg.id,
    name: pkg.name,
    pricePerPerson: pkg.pricePerPerson ?? pkg.price,
    maxGroupSize: pkg.maxGroupSize,
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 400 }}
      >
        {/* ── Gallery ── */}
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
                      <MapPin size={48} color={INK_FAINT} strokeWidth={1.5} />
                    </View>
                  </LinearGradient>
                )}
              </View>
            )}
          />

          {/* Hero nav */}
          <View style={[s.heroNav, { top: insets.top + 12 }]} pointerEvents="box-none">
            <PressableScale onPress={() => router.back()} style={s.overlayBtn} hapticStyle="light">
              <ChevronLeft size={20} color={INK} strokeWidth={2.2} />
            </PressableScale>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale onPress={() => setLiked((v) => !v)} style={s.overlayBtn} hapticStyle="light">
                <Heart size={18} color={liked ? GOLD : INK} fill={liked ? GOLD : 'none'} strokeWidth={2} />
              </PressableScale>
              <PressableScale onPress={handleShare} style={s.overlayBtn} hapticStyle="light">
                <Share2 size={18} color={INK} strokeWidth={2} />
              </PressableScale>
            </View>
          </View>

          {/* Dot indicators */}
          <View style={s.dotsRow} pointerEvents="none">
            {gallery.map((_, i) => (
              <View key={`dot-${i}`} style={i === galleryIndex ? s.dotActive : s.dotInactive} />
            ))}
          </View>
        </View>

        {/* ── Title + meta ── */}
        <View style={s.titleSection}>
          {catLabel ? (
            <View style={s.catPill}>
              <Text style={s.catText}>{catLabel}</Text>
            </View>
          ) : null}
          <Text style={s.title} numberOfLines={2}>
            {pkg.name ?? 'Tour Package'}
          </Text>
          <View style={s.metaRow}>
            <MapPin size={14} color={GOLD} strokeWidth={2} />
            <Text style={s.metaText} numberOfLines={1}>{location}</Text>
          </View>
          <View style={s.metaRow}>
            {pkg.durationHours != null ? (
              <>
                <Clock size={13} color={INK_SECONDARY} strokeWidth={2} />
                <Text style={s.metaText}>{pkg.durationHours}h experience</Text>
              </>
            ) : null}
            {pkg.maxGroupSize != null ? (
              <>
                <Users size={13} color={INK_SECONDARY} strokeWidth={2} />
                <Text style={s.metaText}>Max {pkg.maxGroupSize} people</Text>
              </>
            ) : null}
          </View>
          {pkg.averageRating != null && (
            <View style={s.ratingRow}>
              <Star size={14} color={GOLD} fill={GOLD} strokeWidth={2} />
              <Text style={s.ratingText}>
                {Number(pkg.averageRating).toFixed(1)}
                {pkg.reviewCount
                  ? ` · ${pkg.reviewCount} review${pkg.reviewCount === 1 ? '' : 's'}`
                  : ''}
              </Text>
            </View>
          )}
        </View>

        <View style={s.divider} />

        {/* ── Description ── */}
        {pkg.description ? (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>ABOUT THIS TOUR</Text>
              <Text style={s.description}>{pkg.description}</Text>
            </View>
            <View style={s.divider} />
          </>
        ) : null}

        {/* ── Itinerary ── */}
        {itinerary.length > 0 ? (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>DAY PLAN</Text>
              <ItineraryTimeline items={itinerary} />
            </View>
            <View style={s.divider} />
          </>
        ) : null}

        {/* ── Guide profile ── */}
        {guide ? (
          <>
            <View style={s.section}>
              <Text style={s.kicker}>YOUR GUIDE</Text>
              <View style={s.guideCard}>
                {guide.avatarUrl ? (
                  <ExpoImage
                    source={{ uri: guide.avatarUrl }}
                    style={s.guideAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[s.guideAvatar, s.guideAvatarFallback]}>
                    <Users size={22} color={INK_FAINT} strokeWidth={1.5} />
                  </View>
                )}
                <View style={s.guideInfo}>
                  <Text style={s.guideName}>{guide.name ?? 'Tour Guide'}</Text>
                  {guide.averageRating != null ? (
                    <View style={s.guideRatingRow}>
                      <Star size={12} color={GOLD} fill={GOLD} />
                      <Text style={s.guideRating}>{Number(guide.averageRating).toFixed(1)}</Text>
                    </View>
                  ) : null}
                  {guide.bio ? (
                    <Text style={s.guideBio} numberOfLines={3}>{guide.bio}</Text>
                  ) : null}
                  {guide.languages && guide.languages.length > 0 ? (
                    <View style={s.langRow}>
                      {guide.languages.map((lang) => (
                        <Chip key={lang} label={lang} />
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <View style={s.divider} />
          </>
        ) : null}

        {/* Map placeholder */}
        <View style={s.section}>
          <Text style={s.kicker}>LOCATION</Text>
          <View style={s.mapPlaceholder}>
            <MapPin size={32} color={FOREST_LIGHT} strokeWidth={1.5} />
            <Text style={s.mapPlaceholderTitle}>{location}</Text>
            {pkg.lga?.name ? (
              <Text style={s.mapPlaceholderSub}>{pkg.lga.name}, Ogun State</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky booking sheet ── */}
      <View style={[s.stickyWrap, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <TourBookingSheet
          pkg={sheetPkg}
          pending={bookingMutation.isPending}
          signedIn={signedIn}
          defaultEmail={defaultEmail}
          onSubmit={handleSubmit}
        />
      </View>

      {/* Split-bill share sheet */}
      <SplitBillShareSheet
        visible={splitSheetVisible}
        onClose={() => setSplitSheetVisible(false)}
        link={splitLink}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE_DEEP },
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACE_3 },
  errorText: {
    ...TYPE.body,
    color: INK_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: SPACE_4,
  },
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
  dotActive: { width: 20, height: 6, borderRadius: 3, backgroundColor: GOLD },
  dotInactive: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },

  // Title section
  titleSection: { paddingHorizontal: SPACE_4, paddingTop: SPACE_5, gap: SPACE_2 },
  catPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS_PILL,
    backgroundColor: 'rgba(212,168,67,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.35)',
  },
  catText: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 26,
    color: CREAM,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaText: { ...TYPE.body, color: INK_SECONDARY, fontSize: 13 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: {
    fontFamily: FONT_MONO,
    fontSize: 12,
    fontWeight: '700',
    color: GOLD,
    fontVariant: ['tabular-nums'],
  },

  // Content
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
  description: { ...TYPE.body, color: INK_SECONDARY, lineHeight: 22 },

  // Guide card
  guideCard: {
    flexDirection: 'row',
    gap: SPACE_4,
    backgroundColor: SURFACE_RAISED,
    borderRadius: RADIUS_LG,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    padding: SPACE_4,
  },
  guideAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SURFACE_MID,
  },
  guideAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  guideInfo: { flex: 1, gap: SPACE_2 },
  guideName: {
    fontFamily: FONT_UI,
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  guideRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guideRating: { fontFamily: FONT_MONO, fontSize: 12, color: GOLD, fontWeight: '600' },
  guideBio: { ...TYPE.body, color: INK_SECONDARY, fontSize: 13, lineHeight: 19 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE_2 },

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
