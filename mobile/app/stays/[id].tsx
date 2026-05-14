import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher, api } from '../../lib/api';
import { Home, MapPin, Users, Star, ArrowLeft, Wifi, Wind, Coffee } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIDNIGHT = '#0D1B1B';
const SURFACE = '#162525';
const FOREST = '#1A6B3C';
const GOLD = '#C8962A';
const GOLD_LIGHT = '#E0AA42';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#FFFFFF';
const TEXT_SEC = 'rgba(255,255,255,0.55)';
const TEXT_MUTED = 'rgba(255,255,255,0.28)';

const MOCK_AMENITIES = [
  { icon: Wifi, label: 'Wi-Fi' },
  { icon: Wind, label: 'AC' },
  { icon: Coffee, label: 'Breakfast' },
];

export default function StayDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => fetcher(`/stays/properties/${id}`),
    enabled: !!id,
  });

  const property = data?.data ?? data;

  const bookMutation = useMutation({
    mutationFn: (payload: { checkIn: string; checkOut: string }) =>
      api.post('/stays/bookings', { propertyId: id, ...payload }),
    onSuccess: () => Alert.alert('Booking Confirmed!', 'Check your profile for booking details.'),
    onError: (e: any) => Alert.alert('Booking Failed', e?.response?.data?.message ?? 'Please try again.'),
  });

  const handleBook = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    bookMutation.mutate({
      checkIn: today.toISOString().split('T')[0],
      checkOut: tomorrow.toISOString().split('T')[0],
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: MIDNIGHT }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={[styles.centered, { backgroundColor: MIDNIGHT }]}>
        <Text style={styles.errorText}>Property not found.</Text>
      </View>
    );
  }

  const pricePerNight = Number(property.pricePerNight ?? 0);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero */}
        <LinearGradient
          colors={['#1A4A5A', '#0A2535', MIDNIGHT]}
          style={styles.hero}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <View style={styles.circle1} />
          <View style={styles.circle2} />

          {/* Back button */}
          <TouchableOpacity
            style={[styles.backBtn, { marginTop: insets.top + 8 }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={18} color={TEXT} />
          </TouchableOpacity>

          {/* Hero icon */}
          <View style={styles.heroIconWrapper}>
            <Home size={52} color={GOLD} strokeWidth={1.5} />
          </View>

          {/* Rating badge */}
          <View style={styles.ratingBadge}>
            <Star size={12} color={GOLD} fill={GOLD} />
            <Text style={styles.ratingText}>4.8 · Excellent</Text>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{property.name}</Text>
          </View>

          {/* Location + guests */}
          <View style={styles.metaRow}>
            {(property.location ?? property.address) && (
              <View style={styles.metaItem}>
                <MapPin size={13} color={TEXT_MUTED} />
                <Text style={styles.metaText}>{property.location ?? property.address}</Text>
              </View>
            )}
            {property.maxGuests && (
              <View style={styles.metaItem}>
                <Users size={13} color={TEXT_MUTED} />
                <Text style={styles.metaText}>Up to {property.maxGuests} guests</Text>
              </View>
            )}
          </View>

          {/* Amenities */}
          <Text style={styles.sectionLabel}>Amenities</Text>
          <View style={styles.amenitiesRow}>
            {MOCK_AMENITIES.map(({ icon: Icon, label }) => (
              <View key={label} style={styles.amenityChip}>
                <Icon size={14} color={GOLD} />
                <Text style={styles.amenityLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          {property.description && (
            <>
              <Text style={styles.sectionLabel}>About This Stay</Text>
              <Text style={styles.descText}>{property.description}</Text>
            </>
          )}

          {/* Pricing breakdown */}
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTitle}>Pricing</Text>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Per night</Text>
              <Text style={styles.pricingValue}>₦{pricePerNight.toLocaleString()}</Text>
            </View>
            <View style={[styles.pricingRow, styles.pricingRowBorder]}>
              <Text style={styles.pricingLabel}>Platform fee</Text>
              <Text style={styles.pricingValue}>Included</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.pricePreview}>
          <Text style={styles.pricePreviewLabel}>per night</Text>
          <Text style={styles.pricePreviewAmount}>₦{pricePerNight.toLocaleString()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, bookMutation.isPending && styles.ctaBtnDisabled]}
          onPress={handleBook}
          disabled={bookMutation.isPending}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#1A6B3C', '#0D4025']}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.ctaBtnText}>
              {bookMutation.isPending ? 'Booking…' : 'Book Now'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MIDNIGHT },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: TEXT_SEC, fontSize: 16 },

  hero: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    top: -50,
    right: -70,
  },
  circle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(26,74,90,0.15)',
    bottom: 0,
    left: -30,
  },
  backBtn: {
    position: 'absolute',
    top: 0,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: 'rgba(26,74,90,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.2)',
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  ratingText: { color: GOLD_LIGHT, fontSize: 12, fontWeight: '700' },

  content: { padding: 20 },
  titleRow: { marginBottom: 14 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    lineHeight: 30,
  },

  metaRow: { gap: 8, marginBottom: 22 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: TEXT_SEC, fontSize: 13 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MUTED,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  amenitiesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  amenityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SURFACE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  amenityLabel: { color: TEXT_SEC, fontSize: 12, fontWeight: '500' },

  descText: { color: TEXT_SEC, fontSize: 14, lineHeight: 22, marginBottom: 20 },

  pricingCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pricingTitle: { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  pricingRowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  pricingLabel: { color: TEXT_SEC, fontSize: 13 },
  pricingValue: { color: TEXT, fontSize: 13, fontWeight: '600' },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MIDNIGHT,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  pricePreview: { flex: 1 },
  pricePreviewLabel: { color: TEXT_MUTED, fontSize: 11, fontWeight: '500' },
  pricePreviewAmount: { color: TEXT, fontSize: 20, fontWeight: '800', marginTop: 1 },
  ctaBtn: { flex: 1.4, borderRadius: 14, overflow: 'hidden' },
  ctaBtnDisabled: { opacity: 0.55 },
  ctaGradient: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { color: TEXT, fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
});
