import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher, api } from '../../lib/api';
import { Calendar, MapPin, Tag, ArrowLeft, Users } from 'lucide-react-native';
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

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => fetcher(`/events/${id}`),
    enabled: !!id,
  });

  const event = data?.data ?? data;

  const purchaseMutation = useMutation({
    mutationFn: () => api.post(`/events/${id}/tickets/purchase`, { quantity: 1 }),
    onSuccess: () => Alert.alert('Ticket Purchased!', 'Your QR code is waiting in your profile.'),
    onError: (e: any) => Alert.alert('Purchase Failed', e?.response?.data?.message ?? 'Please try again.'),
  });

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: MIDNIGHT }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.centered, { backgroundColor: MIDNIGHT }]}>
        <Text style={styles.errorText}>Event not found.</Text>
      </View>
    );
  }

  const isFree = !event.ticketPrice || Number(event.ticketPrice) === 0;
  const dateStr = event.startDate ?? event.date;
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('en-NG', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'Date TBD';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero */}
        <LinearGradient
          colors={['#1A5A3C', '#0A2E1E', MIDNIGHT]}
          style={styles.hero}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          {/* Decorative circles */}
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
            <Calendar size={52} color={GOLD} strokeWidth={1.5} />
          </View>

          {/* Status badge */}
          {event.status && (
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{event.status}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{event.title}</Text>

          {/* Info pills */}
          <View style={styles.infoPills}>
            <View style={styles.infoPill}>
              <Calendar size={13} color={GOLD} />
              <Text style={styles.infoPillText}>{formattedDate}</Text>
            </View>
            {(event.location ?? event.venue) && (
              <View style={styles.infoPill}>
                <MapPin size={13} color={GOLD} />
                <Text style={styles.infoPillText}>{event.location ?? event.venue}</Text>
              </View>
            )}
            {event.capacity && (
              <View style={styles.infoPill}>
                <Users size={13} color={GOLD} />
                <Text style={styles.infoPillText}>{event.capacity} capacity</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {event.description && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>About This Event</Text>
              <Text style={styles.descText}>{event.description}</Text>
            </View>
          )}

          {/* Ticket info */}
          <View style={styles.ticketSection}>
            <Text style={styles.ticketLabel}>Ticket Price</Text>
            <Text style={styles.ticketPrice}>
              {isFree ? 'FREE ENTRY' : `₦${Number(event.ticketPrice).toLocaleString()}`}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.pricePreview}>
          <Text style={styles.pricePreviewLabel}>per ticket</Text>
          <Text style={styles.pricePreviewAmount}>
            {isFree ? 'Free' : `₦${Number(event.ticketPrice).toLocaleString()}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, purchaseMutation.isPending && styles.ctaBtnDisabled]}
          onPress={() => purchaseMutation.mutate()}
          disabled={purchaseMutation.isPending}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#1A6B3C', '#0D4025']}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.ctaBtnText}>
              {purchaseMutation.isPending ? 'Processing…' : 'Buy Ticket'}
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
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    top: -40,
    right: -60,
  },
  circle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(26,107,60,0.1)',
    bottom: 10,
    left: -40,
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
    backgroundColor: 'rgba(26,107,60,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,150,42,0.2)',
  },
  statusBadge: {
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
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6EE7A0' },
  statusText: { color: '#6EE7A0', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  content: { padding: 20 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT,
    marginBottom: 16,
    letterSpacing: -0.5,
    lineHeight: 30,
  },

  infoPills: { gap: 8, marginBottom: 24 },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoPillText: { color: TEXT_SEC, fontSize: 13, flex: 1 },

  descSection: { marginBottom: 20 },
  descTitle: { fontSize: 14, fontWeight: '700', color: TEXT_SEC, marginBottom: 8, letterSpacing: 0.3 },
  descText: { color: TEXT_SEC, fontSize: 14, lineHeight: 22 },

  ticketSection: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  ticketLabel: { color: TEXT_MUTED, fontSize: 12, fontWeight: '600' },
  ticketPrice: { color: GOLD_LIGHT, fontSize: 20, fontWeight: '800' },

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
