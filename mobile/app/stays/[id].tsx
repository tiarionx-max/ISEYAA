import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher, api } from '../../lib/api';
import {
  ChevronLeft, Heart, Share2, MapPin,
  Wifi, Waves, Sparkles, UtensilsCrossed, Wind, Building2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Circle } from 'react-native-svg';

import {
  SURFACE_DEEP, SURFACE_MID, SURFACE_ELEV,
  FOREST, FOREST_DEEP,
  GOLD, GOLD_DIM, GOLD_LINE,
  CREAM, INK, INK_MID, INK_FAINT,
  BORDER, BORDER_MID,
  FONT_DISPLAY, FONT_MONO,
} from '../../lib/tokens';

// ── AdireOrnament ──────────────────────────────────
function AdireOrnament({ size = 120, opacity = 0.2 }: { size?: number; opacity?: number }) {
  const s = size;
  const c = s / 2;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} opacity={opacity}>
      <Rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} fill="none" stroke={GOLD} strokeWidth={s * 0.018} />
      <Rect x={s * 0.2} y={s * 0.2} width={s * 0.6} height={s * 0.6} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Line x1={s * 0.1} y1={s * 0.1} x2={s * 0.9} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Line x1={s * 0.9} y1={s * 0.1} x2={s * 0.1} y2={s * 0.9} stroke={GOLD} strokeWidth={s * 0.01} />
      <Circle cx={c} cy={c} r={s * 0.12} fill="none" stroke={GOLD} strokeWidth={s * 0.012} />
      <Circle cx={c} cy={c} r={s * 0.05} fill={GOLD} />
    </Svg>
  );
}

// ── Amenity data ──────────────────────────────────
const AMENITIES = [
  { key: 'WiFi', icon: Wifi },
  { key: 'Pool', icon: Waves },
  { key: 'Spa', icon: Sparkles },
  { key: 'Rooftop', icon: Building2 },
  { key: 'Restaurant', icon: UtensilsCrossed },
  { key: 'AC', icon: Wind },
];

// ── Date helpers ──────────────────────────────────
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function displayDate(iso: string | null) {
  if (!iso) return 'Pick date';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// ── Screen ────────────────────────────────────────
export default function StayDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [isLiked, setIsLiked] = useState(false);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [guests, setGuests] = useState(1);

  function pickCheckIn() {
    Alert.alert('Check-in date', 'Select arrival date', [
      { text: 'Today', onPress: () => setCheckIn(addDays(today, 0)) },
      { text: 'Tomorrow', onPress: () => setCheckIn(addDays(today, 1)) },
      { text: 'In 3 days', onPress: () => setCheckIn(addDays(today, 3)) },
      { text: 'In 7 days', onPress: () => setCheckIn(addDays(today, 7)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function pickCheckOut() {
    const base = checkIn ? new Date(checkIn) : today;
    Alert.alert('Check-out date', 'Select departure date', [
      { text: '+1 night', onPress: () => setCheckOut(addDays(base, 1)) },
      { text: '+2 nights', onPress: () => setCheckOut(addDays(base, 2)) },
      { text: '+3 nights', onPress: () => setCheckOut(addDays(base, 3)) },
      { text: '+7 nights', onPress: () => setCheckOut(addDays(base, 7)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/properties/${id}`),
    enabled: !!id,
  });

  const property = data?.data ?? data;

  const bookMutation = useMutation({
    mutationFn: (payload: { checkIn: string; checkOut: string }) =>
      api.post(`/properties/${id}/bookings`, { propertyId: id, ...payload }),
    onSuccess: () => Alert.alert('Booking Confirmed!', 'Check your profile for booking details.'),
    onError: (e: any) => Alert.alert('Booking Failed', e?.response?.data?.message ?? 'Please try again.'),
  });

  const handleBook = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const ci = checkIn ?? today.toISOString().split('T')[0];
    const co = checkOut ?? tomorrow.toISOString().split('T')[0];
    bookMutation.mutate({ checkIn: ci, checkOut: co });
  };

  if (isLoading) {
    return (
      <View style={[s.centered, { backgroundColor: SURFACE_DEEP }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={[s.centered, { backgroundColor: SURFACE_DEEP }]}>
        <Text style={s.errorText}>Property not found.</Text>
      </View>
    );
  }

  const pricePerNight = Number(property.pricePerNight ?? 0);
  const nights = checkIn && checkOut
    ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000))
    : 1;
  const serviceFee = Math.round(pricePerNight * 0.05);
  const tourismLevy = Math.round(pricePerNight * 0.02);
  const total = pricePerNight * nights + serviceFee + tourismLevy;

  const location = property.location ?? property.address ?? 'Ogun State, Nigeria';

  // Initials for avatar
  const hostName = property.host?.name ?? property.hostName ?? 'Host';
  const initials = hostName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase() || 'H';

  return (
    <View style={[s.root, { backgroundColor: SURFACE_DEEP }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── HERO GALLERY ── */}
        <View style={s.hero}>
          <LinearGradient
            colors={['#0E3F23', '#051A10']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 1 }}
          />

          {/* Adire ornament */}
          <View style={s.ornamentWrap} pointerEvents="none">
            <AdireOrnament size={180} opacity={0.25} />
          </View>

          {/* Overlay gradient */}
          <LinearGradient
            colors={[
              'rgba(5,14,14,0.50)',
              'transparent',
              'rgba(5,14,14,0.85)',
            ]}
            locations={[0, 0.30, 1]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Top nav */}
          <View style={[s.heroNav, { top: insets.top + 12 }]}>
            <TouchableOpacity style={s.glassBtn} onPress={() => router.back()}>
              <ChevronLeft size={20} color={INK} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={s.glassBtn} onPress={() => setIsLiked(v => !v)} activeOpacity={0.8}>
                <Heart size={18} color={isLiked ? GOLD : INK} fill={isLiked ? GOLD : 'none'} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.glassBtn}
                activeOpacity={0.8}
                onPress={() => Share.share({ title: property?.name ?? 'Stay', message: `Check out ${property?.name ?? 'this stay'} on Iseyaa!` })}
              >
                <Share2 size={18} color={INK} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Gallery dots */}
          <View style={s.galleryDots}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={i === 0 ? s.dotActive : s.dotInactive} />
            ))}
          </View>

          {/* Photo counter */}
          {property.images?.length > 0 && (
            <View style={s.photoCounter}>
              <Text style={s.photoCounterText}>1 / {property.images.length}</Text>
            </View>
          )}
        </View>

        {/* ── TITLE ── */}
        <View style={s.titleSection}>
          <View style={s.chipRow}>
            {property.rating != null && (
              <View style={s.chipGold}>
                <Text style={s.chipGoldText}>★ {Number(property.rating).toFixed(1)}{property.reviewCount ? ` (${property.reviewCount})` : ''}</Text>
              </View>
            )}
            {property.isSuperhost && (
              <View style={s.chipForest}>
                <Text style={s.chipForestText}>Superhost</Text>
              </View>
            )}
          </View>

          <Text style={s.title}>
            {property.name
              ? property.name.split(' ').slice(0, -1).join(' ') + '\n'
              : ''}
            <Text style={s.titleItalic}>
              {property.name
                ? property.name.split(' ').slice(-1).join(' ')
                : property.name ?? 'Property'}
            </Text>
          </Text>

          <View style={s.locationRow}>
            <MapPin size={13} color={INK_MID} />
            <Text style={s.locationText} numberOfLines={1}>{location}</Text>
          </View>
        </View>

        {/* ── AMENITIES ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.amenitiesScroll}
          style={s.amenitiesContainer}
        >
          {AMENITIES.map(({ key, icon: Icon }) => (
            <View key={key} style={s.amenityChip}>
              <Icon size={13} color={GOLD} />
              <Text style={s.amenityText}>{key}</Text>
            </View>
          ))}
        </ScrollView>

        {/* ── HOST CARD ── */}
        <View style={s.section}>
          <View style={s.hostCard}>
            {/* Avatar */}
            <View style={s.avatar}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
            {/* Info */}
            <View style={s.hostInfo}>
              <Text style={s.hostName}>Hosted by {hostName}</Text>
              <Text style={s.hostSub}>Superhost · English</Text>
            </View>
            {/* Message button */}
            <TouchableOpacity
              style={s.messageBtn}
              onPress={() => router.push({ pathname: '/ai-chat', params: { prompt: `I'd like to ask the host of ${property.name} a question` } } as any)}
              activeOpacity={0.8}
            >
              <Text style={s.messageBtnText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── ABOUT ── */}
        <View style={s.section}>
          <Text style={s.kicker}>ABOUT THIS STAY</Text>
          <Text style={s.body}>
            {property.description ?? 'Experience the warmth of Ogun State hospitality in this beautifully appointed property, blending modern comfort with rich Yoruba cultural heritage.'}
          </Text>
        </View>

        {/* ── DATES / GUESTS SELECTOR ── */}
        <View style={[s.section, { paddingTop: 20 }]}>
          <View style={s.datesPanel}>
            {/* Check-in */}
            <TouchableOpacity style={s.datesCol} onPress={pickCheckIn} activeOpacity={0.7}>
              <Text style={s.datesKicker}>CHECK-IN</Text>
              <Text style={[s.datesValue, !checkIn && { color: GOLD }]}>{displayDate(checkIn)}</Text>
            </TouchableOpacity>
            <View style={s.datesDivider} />
            {/* Check-out */}
            <TouchableOpacity style={s.datesCol} onPress={pickCheckOut} activeOpacity={0.7}>
              <Text style={s.datesKicker}>CHECK-OUT</Text>
              <Text style={[s.datesValue, !checkOut && { color: GOLD }]}>{displayDate(checkOut)}</Text>
            </TouchableOpacity>
            <View style={s.datesDivider} />
            {/* Guests */}
            <View style={s.datesCol}>
              <Text style={s.datesKicker}>GUESTS</Text>
              <Text style={s.datesValue}>{guests}</Text>
            </View>
          </View>
        </View>

        {/* ── PRICE BREAKDOWN ── */}
        <View style={s.section}>
          <Text style={s.kicker}>PRICE DETAILS</Text>
          <View style={s.priceCard}>
            {pricePerNight > 0 ? (
              <>
                <View style={s.priceRow}>
                  <Text style={s.priceLabel}>
                    ₦{pricePerNight.toLocaleString('en-NG')} × {nights} {nights === 1 ? 'night' : 'nights'}
                  </Text>
                  <Text style={s.priceValue}>
                    ₦{(pricePerNight * nights).toLocaleString('en-NG')}
                  </Text>
                </View>
                <View style={s.priceRow}>
                  <Text style={s.priceLabel}>Service fee</Text>
                  <Text style={s.priceValue}>₦{serviceFee.toLocaleString('en-NG')}</Text>
                </View>
                <View style={s.priceRow}>
                  <Text style={s.priceLabel}>Tourism levy (Ogun State)</Text>
                  <Text style={s.priceValue}>₦{tourismLevy.toLocaleString('en-NG')}</Text>
                </View>
                <View style={s.priceDivider} />
                <View style={s.priceRow}>
                  <Text style={s.priceTotalLabel}>Total</Text>
                  <Text style={s.priceTotalValue}>₦{total.toLocaleString('en-NG')}</Text>
                </View>
              </>
            ) : (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Per night</Text>
                <Text style={s.priceValue}>₦–</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── STICKY CTA BAR ── */}
      <View style={s.ctaOuter} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(5,14,14,0)', 'rgba(5,14,14,0.95)']}
          style={s.ctaGradientOverlay}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={[s.ctaPill, { marginBottom: insets.bottom + 10 }]}>
          <View style={s.ctaPillLeft}>
            <Text style={s.ctaPrice}>
              {pricePerNight > 0
                ? `₦${pricePerNight.toLocaleString('en-NG')}`
                : '₦–'}
            </Text>
            <Text style={s.ctaPriceLabel}>per night</Text>
          </View>
          <TouchableOpacity
            style={[s.ctaButton, bookMutation.isPending && s.ctaButtonDisabled]}
            onPress={handleBook}
            disabled={bookMutation.isPending}
            activeOpacity={0.85}
          >
            <Text style={s.ctaButtonText}>
              {bookMutation.isPending ? 'Booking…' : 'Reserve'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: INK_MID, fontSize: 16 },

  // Hero
  hero: {
    height: 360,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ornamentWrap: {
    position: 'absolute',
    top: 60,
    right: -20,
  },
  heroNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },
  photoCounter: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoCounterText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: CREAM,
  },

  // Title
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  chipGold: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGoldText: {
    color: GOLD,
    fontSize: 11,
    fontFamily: FONT_MONO,
    fontWeight: '600',
  },
  chipForest: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(26,107,60,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(26,107,60,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipForestText: {
    color: '#7DD49E',
    fontSize: 11,
    fontFamily: FONT_MONO,
    fontWeight: '600',
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    color: CREAM,
    letterSpacing: -0.4,
    lineHeight: 28 * 1.05,
    marginBottom: 8,
  },
  titleItalic: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    color: GOLD,
    fontStyle: 'italic',
    letterSpacing: -0.4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: 12.5,
    color: INK_MID,
    flex: 1,
  },

  // Amenities
  amenitiesContainer: {
    marginTop: 18,
  },
  amenitiesScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  amenityText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: INK,
  },

  // Section
  section: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  body: {
    fontSize: 13.5,
    color: INK_MID,
    lineHeight: 13.5 * 1.55,
  },

  // Host card
  hostCard: {
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SURFACE_ELEV,
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: CREAM,
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INK,
    marginBottom: 2,
  },
  hostSub: {
    fontSize: 10.5,
    color: INK_MID,
  },
  messageBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  messageBtnText: {
    fontSize: 11,
    color: GOLD,
    fontWeight: '600',
  },

  // Dates panel
  datesPanel: {
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    flexDirection: 'row',
    padding: 4,
  },
  datesCol: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datesDivider: {
    width: 1,
    backgroundColor: BORDER,
    marginVertical: 8,
  },
  datesKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  datesValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: INK,
  },

  // Price card
  priceCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    paddingHorizontal: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  priceLabel: {
    fontSize: 13,
    color: INK_MID,
  },
  priceValue: {
    fontSize: 13,
    color: INK,
    fontWeight: '500',
  },
  priceDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 6,
  },
  priceTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: INK,
  },
  priceTotalValue: {
    fontFamily: FONT_MONO,
    fontSize: 17,
    fontWeight: '700',
    color: GOLD,
  },

  // CTA bar
  ctaOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  ctaGradientOverlay: {
    position: 'absolute',
    top: -30,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_ELEV,
    borderWidth: 1,
    borderColor: BORDER_MID,
    borderRadius: 18,
    marginHorizontal: 14,
    padding: 10,
    paddingLeft: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaPillLeft: {
    flex: 1,
  },
  ctaPrice: {
    fontFamily: FONT_MONO,
    fontSize: 17,
    fontWeight: '600',
    color: GOLD,
    marginBottom: 1,
  },
  ctaPriceLabel: {
    fontSize: 10,
    color: INK_MID,
  },
  ctaButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.55,
  },
  ctaButtonText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#051A10',
    letterSpacing: 0.2,
  },
});
