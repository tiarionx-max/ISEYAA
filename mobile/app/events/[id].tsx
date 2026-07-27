import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform, Share, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { fetcher, api, getErrorMessage } from '../../lib/api';
import { ChevronLeft, Heart, Share2, MapPin } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Circle } from 'react-native-svg';

import {
  SURFACE_DEEP, SURFACE_MID, SURFACE_ELEV,
  FOREST, GOLD, GOLD_BRIGHT, GOLD_DIM, GOLD_LINE,
  CREAM, INK, INK_MID, INK_FAINT,
  BORDER, BORDER_MID,
  FONT_DISPLAY, FONT_MONO,
  ERROR,
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

// ── Helpers ───────────────────────────────────────
function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return 'See details';
  const start = new Date(startIso);
  const end = new Date(endIso);
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'See details';

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const hours = ms / 3_600_000;
    if (hours < 1) return `${Math.round(ms / 60_000)} min`;
    return hours % 1 === 0 ? `${hours} hr` : `${hours.toFixed(1)} hr`;
  }
  const days = Math.round(ms / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatWeekdayTime(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-NG', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  return `${weekday} · ${time}`;
}

// ── Screen ────────────────────────────────────────
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isLiked, setIsLiked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => fetcher(`/events/${id}`),
    enabled: !!id,
  });

  const { data: me } = useQuery<{ email?: string }>({
    queryKey: ['me'],
    queryFn: () => fetcher('/users/me'),
  });

  useEffect(() => {
    if (!email && me?.email) setEmail(me.email);
  }, [me?.email, email]);

  const event = data?.data ?? data;
  const ticketTypes: Array<{ id: string; name: string; price: number | string; quantity: number; sold: number }> =
    event?.ticketTypes ?? [];

  useEffect(() => {
    if (!selectedTicketTypeId && ticketTypes.length > 0) {
      const firstAvailable = ticketTypes.find((tt) => tt.sold < tt.quantity) ?? ticketTypes[0];
      setSelectedTicketTypeId(firstAvailable.id);
    }
  }, [ticketTypes, selectedTicketTypeId]);

  const purchaseMutation = useMutation({
    mutationFn: () => {
      if (!selectedTicketTypeId) return Promise.reject(new Error('Select a ticket type'));
      if (!email) return Promise.reject(new Error('Enter an email address for your receipt'));
      return api.post(`/events/${id}/purchase`, { ticketTypeId: selectedTicketTypeId, email }).then((r) => r.data);
    },
    onSuccess: async (data: any) => {
      const url = data?.payment?.authorizationUrl;
      if (url) {
        try {
          await WebBrowser.openAuthSessionAsync(url, 'iseyaa://ticket-callback');
        } catch {
          // Payment page failed to open — the Paystack webhook is still the source of truth.
        }
      }
      Alert.alert(
        'Purchase initiated',
        'Your QR code will be ready in your profile once payment is confirmed.',
      );
    },
    onError: (e: any) => Alert.alert('Purchase Failed', getErrorMessage(e, e?.message ?? 'Please try again.')),
  });

  if (isLoading) {
    return (
      <View style={[s.centered, { backgroundColor: SURFACE_DEEP }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[s.centered, { backgroundColor: SURFACE_DEEP }]}>
        <Text style={s.errorText}>Event not found.</Text>
      </View>
    );
  }

  const dateStr = event.startDate ?? event.date;
  const displayDate = dateStr ? formatDate(dateStr) : 'Date TBD';
  const displaySub = dateStr ? formatWeekdayTime(dateStr) : '';
  const venue = event.location ?? event.venue ?? 'Venue TBD';
  const duration = formatDuration(event.startDate, event.endDate);

  const tiers = ticketTypes.map((tt) => {
    const soldOut = tt.sold >= tt.quantity;
    return {
      id: tt.id,
      tier: tt.name,
      price: Number(tt.price) === 0 ? 'Free' : formatCurrency(Number(tt.price)),
      perks: soldOut ? 'Sold out' : `${tt.quantity - tt.sold} left`,
      soldOut,
    };
  });

  const selectedTierData = tiers.find((t) => t.id === selectedTicketTypeId);
  const selectedPrice = selectedTierData?.price ?? '—';
  const selectedTierName = selectedTierData?.tier ?? 'Select a tier';
  const canPurchase = !!selectedTierData && !selectedTierData.soldOut && !!email;

  return (
    <View style={[s.root, { backgroundColor: SURFACE_DEEP }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── HERO ── */}
        <View style={s.hero}>
          {event.imageUrls?.[0] ? (
            <Image
              source={{ uri: event.imageUrls[0] }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <LinearGradient
              colors={['#3D2A05', '#1A1200']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
            />
          )}

          {/* Adire ornament */}
          <View style={s.ornamentWrap} pointerEvents="none">
            <AdireOrnament size={200} opacity={0.32} />
          </View>

          {/* Gradient overlay: dark top → clear → dark bottom */}
          <LinearGradient
            colors={[
              'rgba(5,14,14,0.50)',
              'transparent',
              SURFACE_DEEP,
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
            <View style={s.heroNavRight}>
              <TouchableOpacity style={s.glassBtn} onPress={() => setIsLiked(v => !v)} activeOpacity={0.8}>
                <Heart size={18} color={isLiked ? GOLD : INK} fill={isLiked ? GOLD : 'none'} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.glassBtn}
                activeOpacity={0.8}
                onPress={() => Share.share({ title: event?.title ?? 'Event', message: `Check out ${event?.title ?? 'this event'} on Iṣẹ́yáá!` })}
              >
                <Share2 size={18} color={INK} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Hero text */}
          <View style={s.heroText}>
            {/* Tag chips */}
            <View style={s.chipRow}>
              <View style={s.chipCultural}>
                <Text style={s.chipCulturalText}>Cultural</Text>
              </View>
              {venue !== 'Venue TBD' && (
                <View style={s.chipLocation}>
                  <MapPin size={10} color="#7DD49E" />
                  <Text style={s.chipLocationText} numberOfLines={1}>{venue}</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={s.heroTitle} numberOfLines={3}>
              {event.title
                ? event.title.split(' ').slice(0, -1).join(' ') + '\n'
                : ''}
              <Text style={s.heroTitleItalic}>
                {event.title
                  ? event.title.split(' ').slice(-1).join(' ')
                  : event.title ?? 'Event'}
              </Text>
            </Text>

            {/* Sub */}
            {event.category && (
              <Text style={s.heroMono}>
                {String(event.category).toUpperCase()} · SEE DETAILS
              </Text>
            )}
          </View>
        </View>

        {/* ── KEY FACTS ROW ── */}
        <View style={s.factsRow}>
          {[
            { k: 'Date', v: displayDate, sub: displaySub },
            { k: 'Venue', v: venue, sub: event.address ?? '' },
            { k: 'Duration', v: duration, sub: '' },
          ].map((cell) => (
            <View key={cell.k} style={s.factCell}>
              <Text style={s.factKicker}>{cell.k.toUpperCase()}</Text>
              <Text style={s.factValue} numberOfLines={1}>{cell.v}</Text>
              <Text style={s.factSub} numberOfLines={1}>{cell.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── ABOUT ── */}
        <View style={s.section}>
          <Text style={s.kicker}>ABOUT</Text>
          <Text style={s.body}>
            {event.description ?? 'Join us for an unforgettable cultural experience celebrating the rich heritage of Ogun State.'}
          </Text>
        </View>

        {/* ── TICKET TIERS ── */}
        <View style={s.tiersSection}>
          <View style={s.tiersSectionHeader}>
            <Text style={s.kicker}>TICKETS</Text>
            <Text style={s.tiersSectionTitle}>Available tiers</Text>
          </View>

          {tiers.length === 0 ? (
            <View style={s.section}>
              <Text style={s.body}>Tickets for this event aren't on sale yet — check back soon.</Text>
            </View>
          ) : (
            <View style={s.tiersList}>
              {tiers.map((tier) => {
                const isSelected = selectedTicketTypeId === tier.id;
                return (
                  <TouchableOpacity
                    key={tier.id}
                    style={[s.tierCard, isSelected && s.tierCardSelected, tier.soldOut && { opacity: 0.5 }]}
                    onPress={() => !tier.soldOut && setSelectedTicketTypeId(tier.id)}
                    activeOpacity={0.8}
                    disabled={tier.soldOut}
                  >
                    {/* Radio */}
                    <View style={[s.radio, isSelected && s.radioSelected]} />

                    {/* Info */}
                    <View style={s.tierInfo}>
                      <Text style={s.tierName}>{tier.tier}</Text>
                      <Text style={s.tierPerks}>{tier.perks}</Text>
                    </View>

                    {/* Price */}
                    <Text style={[s.tierPrice, isSelected && s.tierPriceSelected]}>
                      {tier.price}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── RECEIPT EMAIL ── */}
        {tiers.length > 0 && (
          <View style={s.section}>
            <Text style={s.kicker}>RECEIPT EMAIL</Text>
            <TextInput
              style={s.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={INK_FAINT}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        )}
      </ScrollView>

      {/* ── STICKY CTA BAR ── */}
      <View style={s.ctaOuter} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(5,14,14,0)', 'rgba(5,14,14,0.95)']}
          style={s.ctaGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={[s.ctaPill, { marginBottom: insets.bottom + 10 }]}>
          <View style={s.ctaPillLeft}>
            <Text style={s.ctaTierLabel}>{selectedTierName}</Text>
            <Text style={s.ctaPrice}>{selectedPrice}</Text>
          </View>
          <TouchableOpacity
            style={[s.ctaButton, (!canPurchase || purchaseMutation.isPending) && s.ctaButtonDisabled]}
            onPress={() => purchaseMutation.mutate()}
            disabled={!canPurchase || purchaseMutation.isPending}
            activeOpacity={0.85}
          >
            <Text style={s.ctaButtonText}>
              {purchaseMutation.isPending ? 'Processing…' : 'Buy ticket'}
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
    height: 420,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ornamentWrap: {
    position: 'absolute',
    top: 100,
    right: -30,
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
  heroNavRight: {
    flexDirection: 'row',
    gap: 8,
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
  heroText: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  chipCultural: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCulturalText: {
    color: GOLD,
    fontSize: 11,
    fontFamily: FONT_MONO,
    fontWeight: '600',
  },
  chipLocation: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(26,107,60,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(26,107,60,0.50)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 180,
  },
  chipLocationText: {
    color: '#7DD49E',
    fontSize: 11,
    fontFamily: FONT_MONO,
    fontWeight: '600',
    flexShrink: 1,
  },
  heroTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 38,
    color: CREAM,
    letterSpacing: -0.6,
    lineHeight: 40,
    marginBottom: 6,
  },
  heroTitleItalic: {
    fontFamily: FONT_DISPLAY,
    fontSize: 38,
    color: GOLD,
    fontStyle: 'italic',
    letterSpacing: -0.6,
  },
  heroMono: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    color: CREAM,
    opacity: 0.7,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Key facts
  factsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 8,
  },
  factCell: {
    flex: 1,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
  },
  factKicker: {
    fontFamily: FONT_MONO,
    fontSize: 9,
    color: GOLD,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  factValue: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: INK,
    marginBottom: 2,
  },
  factSub: {
    fontSize: 10,
    color: INK_MID,
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
    marginBottom: 6,
  },
  body: {
    fontSize: 13.5,
    color: INK_MID,
    lineHeight: 13.5 * 1.55,
  },
  emailInput: {
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: INK,
  },

  // Ticket tiers
  tiersSection: {
    paddingTop: 20,
  },
  tiersSectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tiersSectionTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    color: INK,
    marginTop: 2,
  },
  tiersList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  tierCard: {
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tierCardSelected: {
    backgroundColor: GOLD_DIM,
    borderColor: GOLD,
    borderWidth: 1.5,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: INK_FAINT,
  },
  radioSelected: {
    borderWidth: 6,
    borderColor: GOLD,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    marginBottom: 2,
  },
  tierPerks: {
    fontSize: 12,
    color: INK_MID,
  },
  tierPrice: {
    fontFamily: FONT_MONO,
    fontSize: 15,
    fontWeight: '600',
    color: INK_MID,
  },
  tierPriceSelected: {
    color: GOLD,
  },

  // CTA bar
  ctaOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  ctaGradient: {
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
  ctaTierLabel: {
    fontSize: 11,
    color: INK_MID,
    marginBottom: 2,
  },
  ctaPrice: {
    fontFamily: FONT_MONO,
    fontSize: 17,
    fontWeight: '600',
    color: GOLD,
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
    color: '#0D1200',
    letterSpacing: 0.2,
  },
});
